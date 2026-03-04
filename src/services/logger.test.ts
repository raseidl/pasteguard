import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

// Mock config to use in-memory SQLite so tests don't write to disk
mock.module("../config", () => ({
  getConfig: () => ({
    mode: "mask",
    logging: {
      database: ":memory:",
      retention_days: 30,
      log_content: false,
      log_masked_content: true,
    },
    secrets_detection: {
      enabled: true,
      log_detected_types: true,
      action: "mask",
      entities: [],
      max_scan_chars: 200000,
    },
    pii_detection: {
      enabled: true,
      fallback_language: "en",
      presidio_url: "http://localhost:5002",
      languages: ["en"],
      score_threshold: 0.7,
      entities: [],
    },
    providers: { openai: { base_url: "https://api.openai.com/v1" } },
    masking: { show_markers: false, marker_text: "[protected]", whitelist: [] },
    server: { port: 3000, host: "0.0.0.0" },
    dashboard: { enabled: true },
    local: null,
  }),
}));

// Import Logger after mock is set up
const { Logger } = await import("./logger");

function makeEntry(overrides: Partial<Parameters<InstanceType<typeof Logger>["log"]>[0]> = {}) {
  return {
    timestamp: new Date().toISOString(),
    mode: "mask" as const,
    provider: "anthropic" as const,
    model: "claude-3-5-sonnet-20241022",
    pii_detected: false,
    entities: "",
    latency_ms: 100,
    scan_time_ms: 10,
    provider_call_ms: 0,
    prompt_tokens: null,
    completion_tokens: null,
    cache_creation_input_tokens: null,
    cache_read_input_tokens: null,
    user_agent: null,
    language: "en",
    language_fallback: false,
    detected_language: null,
    masked_content: null,
    secrets_detected: null,
    secrets_types: null,
    status_code: 200,
    error_message: null,
    ...overrides,
  };
}

describe("Logger token metrics", () => {
  let logger: InstanceType<typeof Logger>;

  beforeEach(() => {
    logger = new Logger();
  });

  afterEach(() => {
    logger.close();
  });

  describe("log()", () => {
    test("returns a positive row ID", () => {
      const id = logger.log(makeEntry());
      expect(id).toBeGreaterThan(0);
    });

    test("returns incrementing row IDs", () => {
      const id1 = logger.log(makeEntry());
      const id2 = logger.log(makeEntry());
      expect(id2).toBeGreaterThan(id1);
    });
  });

  describe("updateTokens()", () => {
    test("updates prompt and completion tokens for a log entry", () => {
      const id = logger.log(makeEntry({ prompt_tokens: null, completion_tokens: null }));

      logger.updateTokens(id, { promptTokens: 150, completionTokens: 75 });

      const logs = logger.getLogs(1, 0);
      expect(logs[0].prompt_tokens).toBe(150);
      expect(logs[0].completion_tokens).toBe(75);
    });

    test("updates cache tokens alongside prompt and completion tokens", () => {
      const id = logger.log(makeEntry());

      logger.updateTokens(id, {
        promptTokens: 100,
        completionTokens: 50,
        cacheCreationInputTokens: 5000,
        cacheReadInputTokens: 95000,
      });

      const logs = logger.getLogs(1, 0);
      expect(logs[0].cache_creation_input_tokens).toBe(5000);
      expect(logs[0].cache_read_input_tokens).toBe(95000);
    });

    test("stores null for optional cache fields when not provided", () => {
      const id = logger.log(makeEntry());

      logger.updateTokens(id, { promptTokens: 100, completionTokens: 40 });

      const logs = logger.getLogs(1, 0);
      expect(logs[0].cache_creation_input_tokens).toBeNull();
      expect(logs[0].cache_read_input_tokens).toBeNull();
    });
  });

  describe("getStats() token breakdown", () => {
    test("returns zero token fields when no requests logged", () => {
      const stats = logger.getStats();
      expect(stats.total_tokens).toBe(0);
      expect(stats.total_prompt_tokens).toBe(0);
      expect(stats.total_completion_tokens).toBe(0);
      expect(stats.total_cache_read_tokens).toBe(0);
      expect(stats.total_cache_creation_tokens).toBe(0);
      expect(stats.cache_hit_rate).toBe(0);
      expect(stats.avg_tokens_per_request).toBe(0);
    });

    test("sums prompt and completion tokens across requests", () => {
      logger.log(makeEntry({ prompt_tokens: 100, completion_tokens: 50 }));
      logger.log(makeEntry({ prompt_tokens: 200, completion_tokens: 80 }));

      const stats = logger.getStats();
      expect(stats.total_prompt_tokens).toBe(300);
      expect(stats.total_completion_tokens).toBe(130);
      expect(stats.total_tokens).toBe(430);
    });

    test("sums cache tokens across requests", () => {
      logger.log(
        makeEntry({
          prompt_tokens: 100,
          completion_tokens: 20,
          cache_read_input_tokens: 90000,
          cache_creation_input_tokens: 10000,
        }),
      );
      logger.log(
        makeEntry({
          prompt_tokens: 50,
          completion_tokens: 10,
          cache_read_input_tokens: 48000,
          cache_creation_input_tokens: 2000,
        }),
      );

      const stats = logger.getStats();
      expect(stats.total_cache_read_tokens).toBe(138000);
      expect(stats.total_cache_creation_tokens).toBe(12000);
    });

    test("computes cache_hit_rate as cache_read / total_effective_input percentage", () => {
      // total effective input = prompt(100) + cache_read(900) + cache_creation(0) = 1000
      // rate = 900 / 1000 = 90%
      logger.log(
        makeEntry({ prompt_tokens: 100, completion_tokens: 50, cache_read_input_tokens: 900 }),
      );

      const stats = logger.getStats();
      expect(stats.cache_hit_rate).toBe(90);
    });

    test("cache_hit_rate accounts for cache_creation in denominator", () => {
      // total effective input = prompt(50) + cache_read(800) + cache_creation(150) = 1000
      // rate = 800 / 1000 = 80%
      logger.log(
        makeEntry({
          prompt_tokens: 50,
          completion_tokens: 20,
          cache_read_input_tokens: 800,
          cache_creation_input_tokens: 150,
        }),
      );

      const stats = logger.getStats();
      expect(stats.cache_hit_rate).toBe(80);
    });

    test("computes avg_tokens_per_request only over requests with token data", () => {
      logger.log(makeEntry({ prompt_tokens: 200, completion_tokens: 100 })); // 300 total
      logger.log(makeEntry({ prompt_tokens: 100, completion_tokens: 50 })); // 150 total
      logger.log(makeEntry({ prompt_tokens: null, completion_tokens: null })); // excluded

      const stats = logger.getStats();
      expect(stats.avg_tokens_per_request).toBe(225); // (300 + 150) / 2
    });

    test("excludes requests with null tokens from avg calculation", () => {
      logger.log(makeEntry({ prompt_tokens: null, completion_tokens: null }));

      const stats = logger.getStats();
      expect(stats.avg_tokens_per_request).toBe(0);
    });
  });

  describe("getRecentErrors()", () => {
    test("returns empty array when no logs exist", () => {
      expect(logger.getRecentErrors(5)).toEqual([]);
    });

    test("returns empty array when all entries have status_code < 400", () => {
      logger.log(makeEntry({ status_code: 200, error_message: null }));
      logger.log(makeEntry({ status_code: 201, error_message: null }));
      expect(logger.getRecentErrors(10)).toEqual([]);
    });

    test("excludes entries where error_message is null even if status_code >= 400", () => {
      logger.log(makeEntry({ status_code: 404, error_message: null }));
      expect(logger.getRecentErrors(10)).toEqual([]);
    });

    test("returns entries with status_code >= 400 and a non-null error_message", () => {
      logger.log(makeEntry({ status_code: 502, error_message: "Provider timeout" }));
      const errors = logger.getRecentErrors(10);
      expect(errors).toHaveLength(1);
      expect(errors[0].status_code).toBe(502);
      expect(errors[0].error_message).toBe("Provider timeout");
    });

    test("returns fields: timestamp, status_code, error_message, provider, model", () => {
      logger.log(
        makeEntry({
          status_code: 503,
          error_message: "PII detection service unavailable",
          provider: "openai" as const,
          model: "gpt-4o",
        }),
      );
      const errors = logger.getRecentErrors(5);
      expect(errors[0]).toMatchObject({
        status_code: 503,
        error_message: "PII detection service unavailable",
        provider: "openai",
        model: "gpt-4o",
      });
      expect(typeof errors[0].timestamp).toBe("string");
    });

    test("respects the limit parameter", () => {
      for (let i = 0; i < 5; i++) {
        logger.log(makeEntry({ status_code: 502, error_message: `Error ${i}` }));
      }
      expect(logger.getRecentErrors(3)).toHaveLength(3);
    });

    test("orders results by timestamp DESC (most recent first)", () => {
      const old = new Date(Date.now() - 10000).toISOString();
      const recent = new Date().toISOString();
      logger.log(makeEntry({ timestamp: old, status_code: 400, error_message: "Old error" }));
      logger.log(makeEntry({ timestamp: recent, status_code: 503, error_message: "New error" }));

      const errors = logger.getRecentErrors(10);
      expect(errors[0].error_message).toBe("New error");
      expect(errors[1].error_message).toBe("Old error");
    });

    test("mixes error and success entries; only errors are returned", () => {
      logger.log(makeEntry({ status_code: 200, error_message: null }));
      logger.log(makeEntry({ status_code: 502, error_message: "Bad gateway" }));
      logger.log(makeEntry({ status_code: 200, error_message: null }));
      logger.log(makeEntry({ status_code: 400, error_message: "Invalid request" }));

      const errors = logger.getRecentErrors(10);
      expect(errors).toHaveLength(2);
      expect(errors.map((e) => e.status_code).sort()).toEqual([400, 502]);
    });

    test("uses default limit of 5 when no argument provided", () => {
      for (let i = 0; i < 8; i++) {
        logger.log(makeEntry({ status_code: 502, error_message: `Error ${i}` }));
      }
      expect(logger.getRecentErrors()).toHaveLength(5);
    });
  });

  describe("getTokenAnomaly()", () => {
    test("returns null when fewer than 10 historical requests", () => {
      for (let i = 0; i < 5; i++) {
        logger.log(makeEntry({ prompt_tokens: 100, completion_tokens: 50 }));
      }

      const result = logger.getTokenAnomaly();
      expect(result).toBeNull();
    });

    test("returns null when no requests have token data", () => {
      for (let i = 0; i < 15; i++) {
        logger.log(makeEntry({ prompt_tokens: null, completion_tokens: null }));
      }

      const result = logger.getTokenAnomaly();
      expect(result).toBeNull();
    });

    test("returns non-anomalous result when current avg is within normal range", () => {
      // Insert 15 historical requests (simulate them as old by using past timestamp)
      const oldTimestamp = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
      for (let i = 0; i < 15; i++) {
        logger.log(
          makeEntry({ timestamp: oldTimestamp, prompt_tokens: 100, completion_tokens: 50 }),
        );
      }

      // Insert a recent request with similar token count
      logger.log(makeEntry({ prompt_tokens: 120, completion_tokens: 60 }));

      const result = logger.getTokenAnomaly();
      expect(result).not.toBeNull();
      expect(result!.isAnomalous).toBe(false);
      expect(result!.rollingAvg).toBe(150); // 100 + 50
      expect(result!.currentAvg).toBeGreaterThan(0);
    });

    test("returns anomalous result when last-hour avg exceeds 2x rolling avg", () => {
      // Insert 15 historical requests with low token counts
      const oldTimestamp = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
      for (let i = 0; i < 15; i++) {
        logger.log(
          makeEntry({ timestamp: oldTimestamp, prompt_tokens: 100, completion_tokens: 50 }),
        );
      }

      // Insert a recent request with very high token count (> 2x rolling avg of 150)
      logger.log(makeEntry({ prompt_tokens: 5000, completion_tokens: 2000 }));

      const result = logger.getTokenAnomaly();
      expect(result).not.toBeNull();
      expect(result!.isAnomalous).toBe(true);
      expect(result!.currentAvg).toBeGreaterThan(result!.rollingAvg * 2);
    });
  });
});

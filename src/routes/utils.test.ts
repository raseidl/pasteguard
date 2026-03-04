/**
 * Tests for src/routes/utils.ts
 *
 * NOTE: Bun's mock.module() leaks across test files in the same run.
 * Therefore we only mock ../config here and use real module implementations
 * for ../services/logger and ../services/active-requests (which have their
 * own dedicated test files).
 */

import { describe, expect, mock, test } from "bun:test";

// ============================================================
// Mock only ../config — same structure as logger.test.ts
// ============================================================

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

// ============================================================
// Import modules AFTER mocks are set up
// ============================================================

// Real logger — uses the :memory: database from the mocked config
const { getLogger } = await import("../services/logger");

// Real active-requests — needed to verify decrementActive side-effects
const { incrementActive, getActiveCount } = await import("../services/active-requests");

// Module under test
const {
  errorFormats,
  createTokenUpdateCallback,
  setResponseHeaders,
  setBlockedHeaders,
  toPIILogData,
  toPIIHeaderData,
  toSecretsLogData,
  toSecretsHeaderData,
  createLogData,
  handleProviderError,
} = await import("./utils");

const { ProviderError } = await import("../providers/errors");

// ============================================================
// Test Helpers
// ============================================================

/** Minimal mock of a Hono Context for header/json testing */
function createMockContext() {
  const capturedHeaders: Record<string, string> = {};
  return {
    header(name: string, value: string) {
      capturedHeaders[name] = value;
    },
    res: { headers: new Headers() },
    json(body: object, status = 200) {
      return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    },
    capturedHeaders,
  };
}

/** Minimal PII detect-result fixture.
 *  spanEntities is PIIEntity[][] (one array per text span); allEntities is the flat list.
 */
function makePIIResult(
  overrides: {
    hasPII?: boolean;
    entities?: Array<{ entity_type: string; start: number; end: number; score: number }>;
    language?: string;
    languageFallback?: boolean;
    detectedLanguage?: string;
    scanTimeMs?: number;
  } = {},
) {
  const allEntities = overrides.entities ?? [];
  // spanEntities is PIIEntity[][] — wrap the flat list in a single span
  const spanEntities = allEntities.length > 0 ? [allEntities] : [];
  return {
    hasPII: overrides.hasPII ?? false,
    detection: {
      hasPII: overrides.hasPII ?? false,
      spanEntities,
      allEntities,
      scanTimeMs: overrides.scanTimeMs ?? 10,
      language: (overrides.language ?? "en") as "en",
      languageFallback: overrides.languageFallback ?? false,
      detectedLanguage: overrides.detectedLanguage,
    },
  };
}

/** Minimal raw RequestLog entry for direct logger insertion */
function makeLogEntry(overrides: Record<string, unknown> = {}) {
  return {
    timestamp: new Date().toISOString(),
    mode: "mask" as const,
    provider: "openai" as const,
    model: "gpt-4o",
    pii_detected: false,
    entities: "",
    latency_ms: 50,
    scan_time_ms: 0,
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

// ============================================================
// Tests
// ============================================================

describe("errorFormats.openai.error()", () => {
  test("returns the correct OpenAI error shape", () => {
    expect(errorFormats.openai.error("Bad request", "invalid_request_error")).toEqual({
      error: { message: "Bad request", type: "invalid_request_error", param: null, code: null },
    });
  });

  test("includes code when provided", () => {
    expect(errorFormats.openai.error("Not found", "server_error", "not_found").error.code).toBe(
      "not_found",
    );
  });

  test("code is null when omitted", () => {
    expect(errorFormats.openai.error("Oops", "server_error").error.code).toBeNull();
  });

  test("param is always null", () => {
    expect(errorFormats.openai.error("Oops", "server_error").error.param).toBeNull();
  });
});

describe("errorFormats.anthropic.error()", () => {
  test("returns the correct Anthropic error shape", () => {
    expect(errorFormats.anthropic.error("Blocked", "invalid_request_error")).toEqual({
      type: "error",
      error: { type: "invalid_request_error", message: "Blocked" },
    });
  });

  test("preserves server_error type", () => {
    expect(errorFormats.anthropic.error("Internal error", "server_error").error.type).toBe(
      "server_error",
    );
  });

  test("outer type is always 'error'", () => {
    expect(errorFormats.anthropic.error("Oops", "server_error").type).toBe("error");
  });
});

describe("toPIILogData()", () => {
  test("maps hasPII, language, and scanTimeMs correctly", () => {
    const pii = makePIIResult({ hasPII: false, language: "de", scanTimeMs: 42 });
    const result = toPIILogData(pii);
    expect(result.hasPII).toBe(false);
    expect(result.language).toBe("de");
    expect(result.scanTimeMs).toBe(42);
  });

  test("deduplicates entity types from allEntities", () => {
    const pii = makePIIResult({
      hasPII: true,
      entities: [
        { entity_type: "PERSON", start: 0, end: 4, score: 0.9 },
        { entity_type: "PERSON", start: 10, end: 14, score: 0.8 },
        { entity_type: "EMAIL_ADDRESS", start: 20, end: 35, score: 0.95 },
      ],
    });
    expect(toPIILogData(pii).entityTypes).toEqual(["PERSON", "EMAIL_ADDRESS"]);
  });

  test("returns empty entityTypes when no entities present", () => {
    expect(toPIILogData(makePIIResult()).entityTypes).toEqual([]);
  });

  test("includes detectedLanguage when present", () => {
    expect(toPIILogData(makePIIResult({ detectedLanguage: "fr" })).detectedLanguage).toBe("fr");
  });

  test("preserves languageFallback flag", () => {
    expect(toPIILogData(makePIIResult({ languageFallback: true })).languageFallback).toBe(true);
  });
});

describe("toPIIHeaderData()", () => {
  test("returns only hasPII, language, languageFallback", () => {
    const pii = makePIIResult({ hasPII: true, language: "es", languageFallback: false });
    expect(toPIIHeaderData(pii)).toEqual({ hasPII: true, language: "es", languageFallback: false });
  });

  test("does not include detectedLanguage or scanTimeMs", () => {
    const result = toPIIHeaderData(makePIIResult({ detectedLanguage: "fr", scanTimeMs: 99 }));
    expect("detectedLanguage" in result).toBe(false);
    expect("scanTimeMs" in result).toBe(false);
  });
});

describe("toSecretsLogData()", () => {
  test("returns undefined when detection is absent", () => {
    expect(toSecretsLogData({ blocked: false, masked: false, request: {} })).toBeUndefined();
  });

  test("returns data with detected=false when detection says no match", () => {
    const result = toSecretsLogData({
      blocked: false,
      masked: false,
      request: {},
      detection: { detected: false as const, matches: [] },
    });
    expect(result?.detected).toBe(false);
    expect(result?.types).toEqual([]);
  });

  test("extracts types from matches and preserves masked flag", () => {
    const result = toSecretsLogData({
      blocked: false,
      masked: true,
      request: {},
      detection: {
        detected: true as const,
        matches: [
          { type: "API_KEY_SK", count: 1 },
          { type: "JWT_TOKEN", count: 1 },
        ],
      },
    });
    expect(result?.types).toEqual(["API_KEY_SK", "JWT_TOKEN"]);
    expect(result?.masked).toBe(true);
  });
});

describe("toSecretsHeaderData()", () => {
  test("returns undefined when detection is absent", () => {
    expect(toSecretsHeaderData({ blocked: false, masked: false, request: {} })).toBeUndefined();
  });

  test("returns undefined when detected is false", () => {
    expect(
      toSecretsHeaderData({
        blocked: false,
        masked: false,
        request: {},
        detection: { detected: false as const, matches: [] },
      }),
    ).toBeUndefined();
  });

  test("returns header data when detected is true", () => {
    expect(
      toSecretsHeaderData({
        blocked: false,
        masked: true,
        request: {},
        detection: {
          detected: true as const,
          matches: [{ type: "OPENSSH_PRIVATE_KEY", count: 1 }],
        },
      }),
    ).toEqual({ detected: true, types: ["OPENSSH_PRIVATE_KEY"], masked: true });
  });
});

describe("setResponseHeaders()", () => {
  function ctx() {
    return createMockContext();
  }

  test("sets Mode and Provider headers", () => {
    const c = ctx();
    setResponseHeaders(
      c as unknown as Parameters<typeof setResponseHeaders>[0],
      "mask",
      "openai",
      toPIIHeaderData(makePIIResult()),
    );
    expect(c.capturedHeaders["X-PasteGuard-Mode"]).toBe("mask");
    expect(c.capturedHeaders["X-PasteGuard-Provider"]).toBe("openai");
  });

  test("sets PII-Detected to 'false' when no PII found", () => {
    const c = ctx();
    setResponseHeaders(
      c as unknown as Parameters<typeof setResponseHeaders>[0],
      "mask",
      "openai",
      toPIIHeaderData(makePIIResult({ hasPII: false })),
    );
    expect(c.capturedHeaders["X-PasteGuard-PII-Detected"]).toBe("false");
  });

  test("sets PII-Detected to 'true' when PII found", () => {
    const c = ctx();
    setResponseHeaders(
      c as unknown as Parameters<typeof setResponseHeaders>[0],
      "mask",
      "openai",
      toPIIHeaderData(makePIIResult({ hasPII: true })),
    );
    expect(c.capturedHeaders["X-PasteGuard-PII-Detected"]).toBe("true");
  });

  test("sets PII-Masked header when mode=mask and hasPII=true", () => {
    const c = ctx();
    setResponseHeaders(
      c as unknown as Parameters<typeof setResponseHeaders>[0],
      "mask",
      "openai",
      toPIIHeaderData(makePIIResult({ hasPII: true })),
    );
    expect(c.capturedHeaders["X-PasteGuard-PII-Masked"]).toBe("true");
  });

  test("does NOT set PII-Masked when mode=route even with PII", () => {
    const c = ctx();
    setResponseHeaders(
      c as unknown as Parameters<typeof setResponseHeaders>[0],
      "route",
      "local",
      toPIIHeaderData(makePIIResult({ hasPII: true })),
    );
    expect(c.capturedHeaders["X-PasteGuard-PII-Masked"]).toBeUndefined();
  });

  test("sets Language-Fallback when languageFallback=true", () => {
    const c = ctx();
    setResponseHeaders(
      c as unknown as Parameters<typeof setResponseHeaders>[0],
      "mask",
      "openai",
      toPIIHeaderData(makePIIResult({ languageFallback: true })),
    );
    expect(c.capturedHeaders["X-PasteGuard-Language-Fallback"]).toBe("true");
  });

  test("does NOT set Language-Fallback when languageFallback=false", () => {
    const c = ctx();
    setResponseHeaders(
      c as unknown as Parameters<typeof setResponseHeaders>[0],
      "mask",
      "openai",
      toPIIHeaderData(makePIIResult({ languageFallback: false })),
    );
    expect(c.capturedHeaders["X-PasteGuard-Language-Fallback"]).toBeUndefined();
  });

  test("sets Secrets headers when secrets detected", () => {
    const c = ctx();
    setResponseHeaders(
      c as unknown as Parameters<typeof setResponseHeaders>[0],
      "mask",
      "openai",
      toPIIHeaderData(makePIIResult()),
      { detected: true, types: ["API_KEY_SK"], masked: false },
    );
    expect(c.capturedHeaders["X-PasteGuard-Secrets-Detected"]).toBe("true");
    expect(c.capturedHeaders["X-PasteGuard-Secrets-Types"]).toBe("API_KEY_SK");
  });

  test("joins multiple secret types with a comma", () => {
    const c = ctx();
    setResponseHeaders(
      c as unknown as Parameters<typeof setResponseHeaders>[0],
      "mask",
      "openai",
      toPIIHeaderData(makePIIResult()),
      { detected: true, types: ["API_KEY_SK", "JWT_TOKEN"], masked: false },
    );
    expect(c.capturedHeaders["X-PasteGuard-Secrets-Types"]).toBe("API_KEY_SK,JWT_TOKEN");
  });

  test("sets Secrets-Masked when secrets were masked", () => {
    const c = ctx();
    setResponseHeaders(
      c as unknown as Parameters<typeof setResponseHeaders>[0],
      "mask",
      "openai",
      toPIIHeaderData(makePIIResult()),
      { detected: true, types: ["JWT_TOKEN"], masked: true },
    );
    expect(c.capturedHeaders["X-PasteGuard-Secrets-Masked"]).toBe("true");
  });

  test("does NOT set Secrets headers when secrets not detected", () => {
    const c = ctx();
    setResponseHeaders(
      c as unknown as Parameters<typeof setResponseHeaders>[0],
      "mask",
      "openai",
      toPIIHeaderData(makePIIResult()),
      { detected: false, types: [], masked: false },
    );
    expect(c.capturedHeaders["X-PasteGuard-Secrets-Detected"]).toBeUndefined();
  });
});

describe("setBlockedHeaders()", () => {
  test("sets Secrets-Detected to 'true'", () => {
    const c = createMockContext();
    setBlockedHeaders(c as unknown as Parameters<typeof setBlockedHeaders>[0], [
      "OPENSSH_PRIVATE_KEY",
    ]);
    expect(c.capturedHeaders["X-PasteGuard-Secrets-Detected"]).toBe("true");
  });

  test("joins multiple secret types with a comma", () => {
    const c = createMockContext();
    setBlockedHeaders(c as unknown as Parameters<typeof setBlockedHeaders>[0], [
      "OPENSSH_PRIVATE_KEY",
      "PEM_PRIVATE_KEY",
    ]);
    expect(c.capturedHeaders["X-PasteGuard-Secrets-Types"]).toBe(
      "OPENSSH_PRIVATE_KEY,PEM_PRIVATE_KEY",
    );
  });

  test("sets Secrets-Types to empty string for an empty array", () => {
    const c = createMockContext();
    setBlockedHeaders(c as unknown as Parameters<typeof setBlockedHeaders>[0], []);
    expect(c.capturedHeaders["X-PasteGuard-Secrets-Types"]).toBe("");
  });
});

describe("createLogData()", () => {
  test("returns the correct provider and model", () => {
    const result = createLogData({ provider: "openai", model: "gpt-4o", startTime: Date.now() });
    expect(result.provider).toBe("openai");
    expect(result.model).toBe("gpt-4o");
  });

  test("defaults model to 'unknown' for an empty string", () => {
    expect(createLogData({ provider: "anthropic", model: "", startTime: Date.now() }).model).toBe(
      "unknown",
    );
  });

  test("uses config.mode for the mode field", () => {
    expect(createLogData({ provider: "openai", model: "gpt-4o", startTime: Date.now() }).mode).toBe(
      "mask",
    );
  });

  test("uses fallback_language when no pii language is provided", () => {
    expect(
      createLogData({ provider: "openai", model: "gpt-4o", startTime: Date.now() }).language,
    ).toBe("en");
  });

  test("latencyMs is non-negative", () => {
    expect(
      createLogData({ provider: "openai", model: "gpt-4o", startTime: Date.now() }).latencyMs,
    ).toBeGreaterThanOrEqual(0);
  });

  test("piiDetected defaults to false without pii option", () => {
    expect(
      createLogData({ provider: "openai", model: "gpt-4o", startTime: Date.now() }).piiDetected,
    ).toBe(false);
  });

  test("entities defaults to empty array without pii option", () => {
    expect(
      createLogData({ provider: "openai", model: "gpt-4o", startTime: Date.now() }).entities,
    ).toEqual([]);
  });

  test("uses pii data when provided", () => {
    const pii = toPIILogData(
      makePIIResult({
        hasPII: true,
        language: "de",
        scanTimeMs: 55,
        entities: [{ entity_type: "PERSON", start: 0, end: 4, score: 0.9 }],
      }),
    );
    const result = createLogData({
      provider: "openai",
      model: "gpt-4o",
      startTime: Date.now(),
      pii,
    });
    expect(result.piiDetected).toBe(true);
    expect(result.language).toBe("de");
    expect(result.scanTimeMs).toBe(55);
    expect(result.entities).toContain("PERSON");
  });

  test("passes through token counts", () => {
    const result = createLogData({
      provider: "openai",
      model: "gpt-4o",
      startTime: Date.now(),
      promptTokens: 100,
      completionTokens: 50,
      cacheCreationInputTokens: 1000,
      cacheReadInputTokens: 9000,
    });
    expect(result.promptTokens).toBe(100);
    expect(result.completionTokens).toBe(50);
    expect(result.cacheCreationInputTokens).toBe(1000);
    expect(result.cacheReadInputTokens).toBe(9000);
  });

  test("passes through statusCode and errorMessage", () => {
    const result = createLogData({
      provider: "openai",
      model: "gpt-4o",
      startTime: Date.now(),
      statusCode: 502,
      errorMessage: "Timed out",
    });
    expect(result.statusCode).toBe(502);
    expect(result.errorMessage).toBe("Timed out");
  });

  test("passes through maskedContent", () => {
    const result = createLogData({
      provider: "openai",
      model: "gpt-4o",
      startTime: Date.now(),
      maskedContent: "[user] Hello [[PERSON_1]]",
    });
    expect(result.maskedContent).toBe("[user] Hello [[PERSON_1]]");
  });
});

describe("createTokenUpdateCallback()", () => {
  test("returns undefined when both logId and activeRequestId are undefined", () => {
    expect(createTokenUpdateCallback(undefined, undefined)).toBeUndefined();
  });

  test("returns undefined when called with a single undefined arg", () => {
    expect(createTokenUpdateCallback(undefined)).toBeUndefined();
  });

  test("returns a function when logId is defined", () => {
    expect(typeof createTokenUpdateCallback(42, undefined)).toBe("function");
  });

  test("returns a function when activeRequestId is defined", () => {
    expect(typeof createTokenUpdateCallback(undefined, 7)).toBe("function");
  });

  test("returns a function when both logId and activeRequestId are defined", () => {
    expect(typeof createTokenUpdateCallback(42, 7)).toBe("function");
  });

  test("callback with logId updates token counts in the logger DB", () => {
    // Insert a real log entry directly into the singleton logger
    const logId = getLogger().log(makeLogEntry({ prompt_tokens: null, completion_tokens: null }));

    const callback = createTokenUpdateCallback(logId, undefined)!;
    callback({ promptTokens: 123, completionTokens: 77 });

    // Verify the DB was updated
    const logs = getLogger().getLogs(200, 0);
    const entry = logs.find((l) => l.id === logId);
    expect(entry?.prompt_tokens).toBe(123);
    expect(entry?.completion_tokens).toBe(77);
  });

  test("callback with logId updates cache token fields", () => {
    const logId = getLogger().log(makeLogEntry());

    const callback = createTokenUpdateCallback(logId, undefined)!;
    callback({
      promptTokens: 50,
      completionTokens: 20,
      cacheCreationInputTokens: 500,
      cacheReadInputTokens: 4500,
    });

    const logs = getLogger().getLogs(200, 0);
    const entry = logs.find((l) => l.id === logId);
    expect(entry?.cache_creation_input_tokens).toBe(500);
    expect(entry?.cache_read_input_tokens).toBe(4500);
  });

  test("callback with activeRequestId decrements the active request count", () => {
    const reqId = incrementActive("streaming");
    const before = getActiveCount();

    const callback = createTokenUpdateCallback(undefined, reqId)!;
    callback({ promptTokens: 10, completionTokens: 5 });

    expect(getActiveCount()).toBe(before - 1);
  });

  test("callback with both IDs updates DB and decrements active count", () => {
    const logId = getLogger().log(makeLogEntry({ prompt_tokens: null }));
    const reqId = incrementActive("streaming");
    const before = getActiveCount();

    const callback = createTokenUpdateCallback(logId, reqId)!;
    callback({ promptTokens: 200, completionTokens: 100 });

    // Token update verified
    const logs = getLogger().getLogs(200, 0);
    const entry = logs.find((l) => l.id === logId);
    expect(entry?.prompt_tokens).toBe(200);

    // Active count decremented
    expect(getActiveCount()).toBe(before - 1);
  });

  test("callback does not throw even for a non-existent logId", () => {
    const callback = createTokenUpdateCallback(999999, undefined)!;
    expect(() => callback({ promptTokens: 1, completionTokens: 1 })).not.toThrow();
  });
});

describe("handleProviderError()", () => {
  const baseCtx = {
    provider: "openai" as const,
    model: "gpt-4o",
    startTime: Date.now() - 1000,
    userAgent: "TestClient/1.0",
  };

  test("returns the ProviderError body verbatim with the provider status code", async () => {
    const c = createMockContext();
    const body = JSON.stringify({ error: { message: "Rate limited" } });
    const error = new ProviderError(429, "Too Many Requests", body);

    const response = handleProviderError(
      c as unknown as Parameters<typeof handleProviderError>[0],
      error,
      baseCtx,
      (msg) => ({ error: msg }),
    );

    expect(response.status).toBe(429);
    expect(await response.text()).toBe(body);
  });

  test("returns 502 with a formatted error message for a generic Error", async () => {
    const c = createMockContext();

    const response = handleProviderError(
      c as unknown as Parameters<typeof handleProviderError>[0],
      new Error("Connection refused"),
      baseCtx,
      (msg) => ({ error: { message: msg } }),
    );

    expect(response.status).toBe(502);
    const json = (await response.json()) as { error: { message: string } };
    expect(json.error.message).toContain("Connection refused");
  });

  test("includes 'Provider error:' prefix in the generic error message", async () => {
    const c = createMockContext();

    const response = handleProviderError(
      c as unknown as Parameters<typeof handleProviderError>[0],
      new Error("Timeout"),
      baseCtx,
      (msg) => ({ error: { message: msg } }),
    );

    const json = (await response.json()) as { error: { message: string } };
    expect(json.error.message).toMatch(/^Provider error:/);
  });

  test("returns 502 with 'Unknown error' for non-Error throws", async () => {
    const c = createMockContext();

    const response = handleProviderError(
      c as unknown as Parameters<typeof handleProviderError>[0],
      "unexpected string error",
      baseCtx,
      (msg) => ({ error: { message: msg } }),
    );

    expect(response.status).toBe(502);
    const json = (await response.json()) as { error: { message: string } };
    expect(json.error.message).toContain("Unknown error");
  });

  test("accepts and passes through different ProviderError status codes", async () => {
    const c = createMockContext();
    const error = new ProviderError(503, "Service Unavailable", "unavailable");

    const response = handleProviderError(
      c as unknown as Parameters<typeof handleProviderError>[0],
      error,
      baseCtx,
      (msg) => ({ error: msg }),
    );

    expect(response.status).toBe(503);
    expect(await response.text()).toBe("unavailable");
  });
});

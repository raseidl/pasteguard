import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { getConfig } from "../config";

export interface RequestLog {
  id?: number;
  timestamp: string;
  mode: "route" | "mask";
  provider: "openai" | "anthropic" | "copilot" | "local" | "api";
  model: string;
  pii_detected: boolean;
  entities: string;
  latency_ms: number;
  scan_time_ms: number;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  cache_creation_input_tokens: number | null;
  cache_read_input_tokens: number | null;
  user_agent: string | null;
  language: string;
  language_fallback: boolean;
  detected_language: string | null;
  masked_content: string | null;
  secrets_detected: number | null;
  secrets_types: string | null;
  status_code: number | null;
  error_message: string | null;
}

/**
 * Token usage data for deferred streaming updates
 */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
}

/**
 * Token anomaly detection result
 */
export interface TokenAnomalyResult {
  isAnomalous: boolean;
  currentAvg: number;
  rollingAvg: number;
}

/**
 * Statistics summary
 */
export interface Stats {
  total_requests: number;
  pii_requests: number;
  pii_percentage: number;
  proxy_requests: number;
  local_requests: number;
  api_requests: number;
  avg_scan_time_ms: number;
  total_tokens: number;
  requests_last_hour: number;
  total_prompt_tokens: number;
  total_completion_tokens: number;
  total_cache_read_tokens: number;
  total_cache_creation_tokens: number;
  cache_hit_rate: number;
  avg_tokens_per_request: number;
}

/**
 * SQLite-based logger for request tracking
 */
export class Logger {
  private db: Database;
  private retentionDays: number;
  private insertStmt: ReturnType<Database["prepare"]>;

  constructor() {
    const config = getConfig();
    this.retentionDays = config.logging.retention_days;

    // Ensure data directory exists
    const dbPath = config.logging.database;
    const dir = dbPath.substring(0, dbPath.lastIndexOf("/"));
    if (dir) {
      mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.initializeDatabase();
    this.insertStmt = this.db.prepare(`
      INSERT INTO request_logs
        (timestamp, mode, provider, model, pii_detected, entities, latency_ms, scan_time_ms, prompt_tokens, completion_tokens, cache_creation_input_tokens, cache_read_input_tokens, user_agent, language, language_fallback, detected_language, masked_content, secrets_detected, secrets_types, status_code, error_message)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
  }

  private initializeDatabase(): void {
    this.db.run("PRAGMA journal_mode = WAL");
    this.db.run("PRAGMA synchronous = NORMAL");
    this.db.run("PRAGMA cache_size = -64000");
    this.db.run("PRAGMA busy_timeout = 5000");

    this.db.run(`
      CREATE TABLE IF NOT EXISTS request_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        mode TEXT NOT NULL DEFAULT 'route',
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        pii_detected INTEGER NOT NULL DEFAULT 0,
        entities TEXT,
        latency_ms INTEGER NOT NULL,
        scan_time_ms INTEGER NOT NULL DEFAULT 0,
        prompt_tokens INTEGER,
        completion_tokens INTEGER,
        user_agent TEXT,
        language TEXT NOT NULL DEFAULT 'en',
        language_fallback INTEGER NOT NULL DEFAULT 0,
        detected_language TEXT,
        masked_content TEXT,
        secrets_detected INTEGER,
        secrets_types TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Migrate existing databases: add missing columns
    const columns = this.db.prepare("PRAGMA table_info(request_logs)").all() as Array<{
      name: string;
    }>;
    if (!columns.find((c) => c.name === "secrets_detected")) {
      this.db.run("ALTER TABLE request_logs ADD COLUMN secrets_detected INTEGER");
      this.db.run("ALTER TABLE request_logs ADD COLUMN secrets_types TEXT");
    }
    if (!columns.find((c) => c.name === "status_code")) {
      this.db.run("ALTER TABLE request_logs ADD COLUMN status_code INTEGER");
      this.db.run("ALTER TABLE request_logs ADD COLUMN error_message TEXT");
    }
    if (!columns.find((c) => c.name === "cache_creation_input_tokens")) {
      this.db.run("ALTER TABLE request_logs ADD COLUMN cache_creation_input_tokens INTEGER");
      this.db.run("ALTER TABLE request_logs ADD COLUMN cache_read_input_tokens INTEGER");
    }

    // Create indexes for performance
    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_timestamp ON request_logs(timestamp)
    `);
    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_provider ON request_logs(provider)
    `);
    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_pii_detected ON request_logs(pii_detected)
    `);
  }

  log(entry: Omit<RequestLog, "id">): number {
    this.insertStmt.run(
      entry.timestamp,
      entry.mode,
      entry.provider,
      entry.model,
      entry.pii_detected ? 1 : 0,
      entry.entities,
      entry.latency_ms,
      entry.scan_time_ms,
      entry.prompt_tokens,
      entry.completion_tokens,
      entry.cache_creation_input_tokens ?? null,
      entry.cache_read_input_tokens ?? null,
      entry.user_agent,
      entry.language,
      entry.language_fallback ? 1 : 0,
      entry.detected_language,
      entry.masked_content,
      entry.secrets_detected ?? null,
      entry.secrets_types ?? null,
      entry.status_code ?? null,
      entry.error_message ?? null,
    );
    const result = this.db.query("SELECT last_insert_rowid() as id").get() as { id: number } | null;
    return result?.id ?? 0;
  }

  /**
   * Updates token counts for a previously logged request (used for streaming)
   */
  updateTokens(logId: number, tokens: TokenUsage): void {
    this.db
      .prepare(
        `UPDATE request_logs SET prompt_tokens=?, completion_tokens=?, cache_creation_input_tokens=?, cache_read_input_tokens=? WHERE id=?`,
      )
      .run(
        tokens.promptTokens,
        tokens.completionTokens,
        tokens.cacheCreationInputTokens ?? null,
        tokens.cacheReadInputTokens ?? null,
        logId,
      );
  }

  /**
   * Gets recent logs
   */
  getLogs(limit: number = 100, offset: number = 0): RequestLog[] {
    const stmt = this.db.prepare(`
      SELECT * FROM request_logs
      ORDER BY timestamp DESC
      LIMIT ? OFFSET ?
    `);

    return stmt.all(limit, offset) as RequestLog[];
  }

  /**
   * Gets statistics
   */
  getStats(): Stats {
    // Total requests
    const totalResult = this.db.prepare(`SELECT COUNT(*) as count FROM request_logs`).get() as {
      count: number;
    };

    // PII requests
    const piiResult = this.db
      .prepare(`SELECT COUNT(*) as count FROM request_logs WHERE pii_detected = 1`)
      .get() as { count: number };

    // Proxy (OpenAI + Anthropic) vs Local vs API
    const proxyResult = this.db
      .prepare(
        `SELECT COUNT(*) as count FROM request_logs WHERE provider IN ('openai', 'anthropic')`,
      )
      .get() as { count: number };
    const localResult = this.db
      .prepare(`SELECT COUNT(*) as count FROM request_logs WHERE provider = 'local'`)
      .get() as { count: number };
    const apiResult = this.db
      .prepare(`SELECT COUNT(*) as count FROM request_logs WHERE provider = 'api'`)
      .get() as { count: number };

    // Average scan time
    const scanTimeResult = this.db
      .prepare(`SELECT AVG(scan_time_ms) as avg FROM request_logs`)
      .get() as { avg: number | null };

    // Total tokens and breakdown
    const tokensResult = this.db
      .prepare(`
      SELECT
        COALESCE(SUM(COALESCE(prompt_tokens, 0) + COALESCE(completion_tokens, 0)), 0) as total,
        COALESCE(SUM(prompt_tokens), 0) as total_prompt,
        COALESCE(SUM(completion_tokens), 0) as total_completion,
        COALESCE(SUM(cache_read_input_tokens), 0) as total_cache_read,
        COALESCE(SUM(cache_creation_input_tokens), 0) as total_cache_creation,
        COUNT(CASE WHEN prompt_tokens IS NOT NULL OR completion_tokens IS NOT NULL THEN 1 END) as token_requests
      FROM request_logs
    `)
      .get() as {
        total: number;
        total_prompt: number;
        total_completion: number;
        total_cache_read: number;
        total_cache_creation: number;
        token_requests: number;
      };

    // Requests last hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const hourResult = this.db
      .prepare(`
      SELECT COUNT(*) as count FROM request_logs
      WHERE timestamp >= ?
    `)
      .get(oneHourAgo) as { count: number };

    const total = totalResult.count;
    const pii = piiResult.count;

    const totalPrompt = tokensResult.total_prompt;
    const cacheRead = tokensResult.total_cache_read;
    const cacheCreation = tokensResult.total_cache_creation;
    const tokenRequests = tokensResult.token_requests;

    // Total effective input = new tokens + cache read + cache creation
    const totalEffectiveInput = totalPrompt + cacheRead + cacheCreation;

    return {
      total_requests: total,
      pii_requests: pii,
      pii_percentage: total > 0 ? Math.round((pii / total) * 100 * 10) / 10 : 0,
      proxy_requests: proxyResult.count,
      local_requests: localResult.count,
      api_requests: apiResult.count,
      avg_scan_time_ms: Math.round(scanTimeResult.avg || 0),
      total_tokens: tokensResult.total,
      requests_last_hour: hourResult.count,
      total_prompt_tokens: totalPrompt,
      total_completion_tokens: tokensResult.total_completion,
      total_cache_read_tokens: cacheRead,
      total_cache_creation_tokens: cacheCreation,
      cache_hit_rate:
        totalEffectiveInput > 0
          ? Math.round((cacheRead / totalEffectiveInput) * 100 * 10) / 10
          : 0,
      avg_tokens_per_request:
        tokenRequests > 0 ? Math.round(tokensResult.total / tokenRequests) : 0,
    };
  }

  /**
   * Gets entity breakdown
   */
  getEntityStats(): Array<{ entity: string; count: number }> {
    const logs = this.db
      .prepare(`
      SELECT entities FROM request_logs WHERE entities IS NOT NULL AND entities != ''
    `)
      .all() as Array<{ entities: string }>;

    const entityCounts = new Map<string, number>();

    for (const log of logs) {
      const entities = log.entities
        .split(",")
        .map((e) => e.trim())
        .filter(Boolean);
      for (const entity of entities) {
        entityCounts.set(entity, (entityCounts.get(entity) || 0) + 1);
      }
    }

    return Array.from(entityCounts.entries())
      .map(([entity, count]) => ({ entity, count }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Detects anomalous token usage by comparing last-hour avg vs 7-day rolling avg.
   * Returns null if there is insufficient historical data (< 10 requests with tokens).
   */
  getTokenAnomaly(): TokenAnomalyResult | null {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const historical = this.db
      .prepare(
        `SELECT COUNT(*) as count,
                AVG(COALESCE(prompt_tokens, 0) + COALESCE(completion_tokens, 0)) as avg_tokens
         FROM request_logs
         WHERE timestamp >= ? AND timestamp < ?
           AND (prompt_tokens IS NOT NULL OR completion_tokens IS NOT NULL)`,
      )
      .get(sevenDaysAgo, oneHourAgo) as { count: number; avg_tokens: number | null };

    if (!historical || historical.count < 10 || !historical.avg_tokens) return null;

    const current = this.db
      .prepare(
        `SELECT COUNT(*) as count,
                AVG(COALESCE(prompt_tokens, 0) + COALESCE(completion_tokens, 0)) as avg_tokens
         FROM request_logs
         WHERE timestamp >= ?
           AND (prompt_tokens IS NOT NULL OR completion_tokens IS NOT NULL)`,
      )
      .get(oneHourAgo) as { count: number; avg_tokens: number | null };

    if (!current || current.count < 1 || !current.avg_tokens) return null;

    const rollingAvg = Math.round(historical.avg_tokens);
    const currentAvg = Math.round(current.avg_tokens);

    return {
      isAnomalous: rollingAvg > 0 && currentAvg > rollingAvg * 2,
      currentAvg,
      rollingAvg,
    };
  }

  /**
   * Cleans up old logs based on retention policy
   */
  cleanup(): number {
    if (this.retentionDays <= 0) {
      return 0; // Keep forever
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.retentionDays);

    const result = this.db
      .prepare(`
      DELETE FROM request_logs WHERE timestamp < ?
    `)
      .run(cutoffDate.toISOString());

    return result.changes;
  }

  /**
   * Closes database connection
   */
  close(): void {
    this.db.close();
  }
}

// Singleton instance
let loggerInstance: Logger | null = null;

export function getLogger(): Logger {
  if (!loggerInstance) {
    loggerInstance = new Logger();
  }
  return loggerInstance;
}

export interface RequestLogData {
  timestamp: string;
  mode: "route" | "mask";
  provider: "openai" | "anthropic" | "copilot" | "local" | "api";
  model: string;
  piiDetected: boolean;
  entities: string[];
  latencyMs: number;
  scanTimeMs: number;
  promptTokens?: number;
  completionTokens?: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
  language: string;
  languageFallback: boolean;
  detectedLanguage?: string;
  maskedContent?: string;
  secretsDetected?: boolean;
  secretsTypes?: string[];
  statusCode?: number;
  errorMessage?: string;
}

export function logRequest(data: RequestLogData, userAgent: string | null): number | undefined {
  try {
    const config = getConfig();
    const logger = getLogger();

    // Safety: Never log content if secrets were detected
    // Even if log_content is true, secrets are never logged
    const shouldLogContent = data.maskedContent && !data.secretsDetected;

    // Only log secret types if configured to do so
    const shouldLogSecretTypes =
      config.secrets_detection.log_detected_types && data.secretsTypes?.length;

    return logger.log({
      timestamp: data.timestamp,
      mode: data.mode,
      provider: data.provider,
      model: data.model,
      pii_detected: data.piiDetected,
      entities: data.entities.join(","),
      latency_ms: data.latencyMs,
      scan_time_ms: data.scanTimeMs,
      prompt_tokens: data.promptTokens ?? null,
      completion_tokens: data.completionTokens ?? null,
      cache_creation_input_tokens: data.cacheCreationInputTokens ?? null,
      cache_read_input_tokens: data.cacheReadInputTokens ?? null,
      user_agent: userAgent,
      language: data.language,
      language_fallback: data.languageFallback,
      detected_language: data.detectedLanguage ?? null,
      masked_content: shouldLogContent ? (data.maskedContent ?? null) : null,
      secrets_detected: data.secretsDetected !== undefined ? (data.secretsDetected ? 1 : 0) : null,
      secrets_types: shouldLogSecretTypes ? data.secretsTypes!.join(",") : null,
      status_code: data.statusCode ?? null,
      error_message: data.errorMessage ?? null,
    });
  } catch (error) {
    console.error("Failed to log request:", error);
    return undefined;
  }
}

import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { getConfig } from "../config";
import { decrementActive } from "./active-requests";

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
  provider_call_ms: number;
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
  avg_latency_ms: number;
  avg_scan_time_ms: number;
  avg_provider_call_ms: number;
  total_tokens: number;
  requests_last_hour: number;
  total_prompt_tokens: number;
  total_completion_tokens: number;
  total_cache_read_tokens: number;
  total_cache_creation_tokens: number;
  cache_hit_rate: number;
  avg_tokens_per_request: number;
  errors_last_hour: number;
}

/**
 * SQLite-based logger for request tracking
 */
export class Logger {
  private db: Database;
  private retentionDays: number;
  private insertStmt: ReturnType<Database["prepare"]>;
  private updateTokensStmt: ReturnType<Database["prepare"]>;
  private writeQueue: Array<{ id: number; entry: Omit<RequestLog, "id"> }> = [];
  private tokenUpdateQueue: Array<{ id: number; tokens: TokenUsage }> = [];
  private nextId: number;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

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
        (id, timestamp, mode, provider, model, pii_detected, entities, latency_ms, scan_time_ms, provider_call_ms, prompt_tokens, completion_tokens, cache_creation_input_tokens, cache_read_input_tokens, user_agent, language, language_fallback, detected_language, masked_content, secrets_detected, secrets_types, status_code, error_message)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    this.updateTokensStmt = this.db.prepare(
      `UPDATE request_logs SET prompt_tokens=?, completion_tokens=?, cache_creation_input_tokens=?, cache_read_input_tokens=? WHERE id=?`,
    );

    // Initialize ID counter from existing data
    const maxRow = this.db
      .query("SELECT COALESCE(MAX(id), 0) as maxId FROM request_logs")
      .get() as { maxId: number };
    this.nextId = maxRow.maxId + 1;
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
        provider_call_ms INTEGER NOT NULL DEFAULT 0,
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
    if (!columns.find((c) => c.name === "provider_call_ms")) {
      this.db.run(
        "ALTER TABLE request_logs ADD COLUMN provider_call_ms INTEGER NOT NULL DEFAULT 0",
      );
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
    const id = this.nextId++;
    this.writeQueue.push({ id, entry });
    this.scheduleFlush();
    return id;
  }

  /**
   * Updates token counts for a previously logged request (used for streaming)
   */
  updateTokens(logId: number, tokens: TokenUsage): void {
    this.tokenUpdateQueue.push({ id: logId, tokens });
    this.scheduleFlush();
  }

  /**
   * Schedules a deferred flush of all queued writes.
   * Uses setTimeout(0) to batch writes from concurrent requests into a single transaction.
   */
  private scheduleFlush(): void {
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flush(), 0);
    }
  }

  /**
   * Flushes all queued inserts and token updates to the database in a single transaction.
   */
  flush(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.writeQueue.length === 0 && this.tokenUpdateQueue.length === 0) return;

    const inserts = this.writeQueue.splice(0);
    const updates = this.tokenUpdateQueue.splice(0);

    try {
      this.db.transaction(() => {
        for (const { id, entry } of inserts) {
          this.insertStmt.run(
            id,
            entry.timestamp,
            entry.mode,
            entry.provider,
            entry.model,
            entry.pii_detected ? 1 : 0,
            entry.entities,
            entry.latency_ms,
            entry.scan_time_ms,
            entry.provider_call_ms,
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
        }
        for (const { id, tokens } of updates) {
          this.updateTokensStmt.run(
            tokens.promptTokens,
            tokens.completionTokens,
            tokens.cacheCreationInputTokens ?? null,
            tokens.cacheReadInputTokens ?? null,
            id,
          );
        }
      })();
    } catch (error) {
      console.error("Failed to flush log writes:", error);
    }
  }

  /**
   * Gets recent logs
   */
  getLogs(limit: number = 100, offset: number = 0): RequestLog[] {
    this.flush();
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
    this.flush();
    const mainResult = this.db
      .prepare(
        `SELECT
          COUNT(*) as total,
          SUM(CASE WHEN pii_detected = 1 THEN 1 ELSE 0 END) as pii_count,
          SUM(CASE WHEN provider IN ('openai', 'anthropic') THEN 1 ELSE 0 END) as proxy_count,
          SUM(CASE WHEN provider = 'local' THEN 1 ELSE 0 END) as local_count,
          SUM(CASE WHEN provider = 'api' THEN 1 ELSE 0 END) as api_count,
          AVG(latency_ms) as avg_latency,
          AVG(scan_time_ms) as avg_scan_time,
          AVG(NULLIF(provider_call_ms, 0)) as avg_provider_call,
          COALESCE(SUM(COALESCE(prompt_tokens, 0) + COALESCE(completion_tokens, 0)), 0) as total_tokens,
          COALESCE(SUM(prompt_tokens), 0) as total_prompt,
          COALESCE(SUM(completion_tokens), 0) as total_completion,
          COALESCE(SUM(cache_read_input_tokens), 0) as total_cache_read,
          COALESCE(SUM(cache_creation_input_tokens), 0) as total_cache_creation,
          COUNT(CASE WHEN prompt_tokens IS NOT NULL OR completion_tokens IS NOT NULL THEN 1 END) as token_requests
        FROM request_logs`,
      )
      .get() as {
      total: number;
      pii_count: number;
      proxy_count: number;
      local_count: number;
      api_count: number;
      avg_latency: number | null;
      avg_scan_time: number | null;
      avg_provider_call: number | null;
      total_tokens: number;
      total_prompt: number;
      total_completion: number;
      total_cache_read: number;
      total_cache_creation: number;
      token_requests: number;
    };

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const hourResult = this.db
      .prepare(
        `SELECT
          COUNT(*) as count,
          SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) as error_count
        FROM request_logs WHERE timestamp >= ?`,
      )
      .get(oneHourAgo) as { count: number; error_count: number | null };

    const total = mainResult.total;
    const pii = mainResult.pii_count;
    const cacheRead = mainResult.total_cache_read;
    const cacheCreation = mainResult.total_cache_creation;
    const totalEffectiveInput = mainResult.total_prompt + cacheRead + cacheCreation;

    return {
      total_requests: total,
      pii_requests: pii,
      pii_percentage: total > 0 ? Math.round((pii / total) * 100 * 10) / 10 : 0,
      proxy_requests: mainResult.proxy_count,
      local_requests: mainResult.local_count,
      api_requests: mainResult.api_count,
      avg_latency_ms: Math.round(mainResult.avg_latency || 0),
      avg_scan_time_ms: Math.round(mainResult.avg_scan_time || 0),
      avg_provider_call_ms: Math.round(mainResult.avg_provider_call || 0),
      total_tokens: mainResult.total_tokens,
      requests_last_hour: hourResult.count,
      total_prompt_tokens: mainResult.total_prompt,
      total_completion_tokens: mainResult.total_completion,
      total_cache_read_tokens: cacheRead,
      total_cache_creation_tokens: cacheCreation,
      cache_hit_rate:
        totalEffectiveInput > 0 ? Math.round((cacheRead / totalEffectiveInput) * 100 * 10) / 10 : 0,
      avg_tokens_per_request:
        mainResult.token_requests > 0
          ? Math.round(mainResult.total_tokens / mainResult.token_requests)
          : 0,
      errors_last_hour: hourResult.error_count ?? 0,
    };
  }

  /**
   * Gets entity breakdown
   */
  getEntityStats(): Array<{ entity: string; count: number }> {
    this.flush();
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
    this.flush();
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
   * Gets recent error logs (status_code >= 400)
   */
  getRecentErrors(limit: number = 5): Array<{
    timestamp: string;
    status_code: number;
    error_message: string;
    provider: string;
    model: string;
  }> {
    this.flush();
    return this.db
      .prepare(
        `SELECT timestamp, status_code, error_message, provider, model
         FROM request_logs
         WHERE status_code >= 400 AND error_message IS NOT NULL
         ORDER BY timestamp DESC
         LIMIT ?`,
      )
      .all(limit) as Array<{
      timestamp: string;
      status_code: number;
      error_message: string;
      provider: string;
      model: string;
    }>;
  }

  /**
   * Cleans up old logs based on retention policy
   */
  cleanup(): number {
    this.flush();
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
   * Deletes all request logs
   */
  clearAllLogs(): void {
    this.flush();
    this.db.run("DELETE FROM request_logs");
  }

  /**
   * Closes database connection
   */
  close(): void {
    this.flush();
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
  providerCallMs?: number;
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

export function logRequest(
  data: RequestLogData,
  userAgent: string | null,
  activeRequestId?: number,
): number | undefined {
  decrementActive(activeRequestId);
  try {
    const config = getConfig();
    const logger = getLogger();

    // Log masked content if configured and available.
    // maskedContent is already fully masked (PII + secrets replaced with placeholders),
    // so it is safe to store regardless of whether secrets were detected.
    const shouldLogContent = config.logging.log_masked_content && !!data.maskedContent;

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
      provider_call_ms: data.providerCallMs ?? 0,
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

/**
 * GitHub Copilot proxy route
 *
 * Intercepts Copilot requests from IDE plugins (VS Code, IntelliJ, Visual Studio)
 * and applies the same PII/secrets masking as the OpenAI and Anthropic routes.
 *
 * Configure in VS Code:
 *   "github.copilot.advanced": { "debug.overrideCapiUrl": "http://localhost:3000/copilot" }
 *
 * Two endpoints are masked:
 * 1. POST /chat/completions  — Copilot Chat (OpenAI Chat format, reuses openaiExtractor)
 * 2. POST /v1/engines/:engine/completions — Inline ghost-text (legacy Completions format)
 *
 * All other endpoints are transparently proxied to api.githubcopilot.com.
 *
 * Flow:
 * 1. Validate request
 * 2. Process secrets (detect, maybe block or mask)
 * 3. Detect PII
 * 4. Mask PII and send to Copilot (only mask mode; inline completions do not support route mode)
 * 5. Unmask response and return
 */

import { zValidator } from "@hono/zod-validator";
import type { Context } from "hono";
import { Hono } from "hono";
import { proxy } from "hono/proxy";
import { getConfig, type MaskingConfig } from "../config";
import type { PlaceholderContext } from "../masking/context";
import { codexExtractor } from "../masking/extractors/codex";
import { openaiExtractor } from "../masking/extractors/openai";
import { unmaskResponse as unmaskPIIResponse } from "../pii/mask";
import {
  type CopilotChatResult,
  type CopilotCompletionResult,
  callCopilotChat,
  callCopilotCompletion,
  collectCopilotHeaders,
} from "../providers/copilot/client";
import { createCompletionUnmaskingStream } from "../providers/copilot/stream-transformer";
import {
  type CopilotCompletionRequest,
  CopilotCompletionRequestSchema,
  type CopilotCompletionResponse,
} from "../providers/copilot/types";
import { createUnmaskingStream } from "../providers/openai/stream-transformer";
import {
  type OpenAIRequest,
  OpenAIRequestSchema,
  type OpenAIResponse,
} from "../providers/openai/types";
import { unmaskSecretsResponse } from "../secrets/mask";
import { logRequest } from "../services/logger";
import { detectPII, maskPII, type PIIDetectResult } from "../services/pii";
import { processSecretsRequest, type SecretsProcessResult } from "../services/secrets";
import {
  createLogData,
  errorFormats,
  handleProviderError,
  setBlockedHeaders,
  setResponseHeaders,
  toPIIHeaderData,
  toPIILogData,
  toSecretsHeaderData,
  toSecretsLogData,
} from "./utils";

export const copilotRoutes = new Hono();

// ─── Copilot Chat: POST /chat/completions ────────────────────────────────────

copilotRoutes.post(
  "/chat/completions",
  zValidator("json", OpenAIRequestSchema, (result, c) => {
    if (!result.success) {
      return c.json(
        errorFormats.openai.error(
          `Invalid request body: ${result.error.message}`,
          "invalid_request_error",
        ),
        400,
      );
    }
  }),
  async (c) => {
    const config = getConfig();

    if (!config.providers.copilot) {
      return c.json(
        errorFormats.openai.error(
          "Copilot provider not configured. Add providers.copilot to config.yaml.",
          "server_error",
        ),
        400,
      );
    }

    const startTime = Date.now();
    let request = c.req.valid("json") as OpenAIRequest;
    const incomingHeaders = c.req.header();

    // Step 1: Process secrets
    const secretsResult = processSecretsRequest(request, config.secrets_detection, openaiExtractor);

    if (secretsResult.blocked) {
      return respondChatBlocked(c, request, secretsResult, startTime);
    }

    if (secretsResult.masked) {
      request = secretsResult.request;
    }

    // Step 2: Detect PII
    let piiResult: PIIDetectResult;
    if (!config.pii_detection.enabled) {
      piiResult = {
        detection: {
          hasPII: false,
          spanEntities: [],
          allEntities: [],
          scanTimeMs: 0,
          language: "en",
          languageFallback: false,
        },
        hasPII: false,
      };
    } else {
      try {
        piiResult = await detectPII(request, openaiExtractor);
      } catch (error) {
        console.error("PII detection error:", error);
        return respondChatDetectionError(c, request, startTime);
      }
    }

    // Step 3: Mask and send (route mode routes to local for chat; not supported for copilot here)
    const piiMasked = maskPII(request, piiResult.detection, openaiExtractor);
    return sendCopilotChat(c, request, incomingHeaders, {
      request: piiMasked.request,
      piiResult,
      piiMaskingContext: piiMasked.maskingContext,
      secretsResult,
      startTime,
    });
  },
);

// ─── Copilot Inline Completions: POST /v1/engines/:engine/completions ─────────

copilotRoutes.post(
  "/v1/engines/:engine/completions",
  zValidator("json", CopilotCompletionRequestSchema, (result, c) => {
    if (!result.success) {
      return c.json(
        errorFormats.openai.error(
          `Invalid request body: ${result.error.message}`,
          "invalid_request_error",
        ),
        400,
      );
    }
  }),
  async (c) => {
    const config = getConfig();

    if (!config.providers.copilot) {
      return c.json(
        errorFormats.openai.error(
          "Copilot provider not configured. Add providers.copilot to config.yaml.",
          "server_error",
        ),
        400,
      );
    }

    const startTime = Date.now();
    let request = c.req.valid("json") as CopilotCompletionRequest;
    const engine = c.req.param("engine");
    const incomingHeaders = c.req.header();

    // Step 1: Process secrets
    const secretsResult = processSecretsRequest(request, config.secrets_detection, codexExtractor);

    if (secretsResult.blocked) {
      return respondCompletionBlocked(c, request, secretsResult, startTime);
    }

    if (secretsResult.masked) {
      request = secretsResult.request;
    }

    // Step 2: Detect PII
    let piiResult: PIIDetectResult;
    if (!config.pii_detection.enabled) {
      piiResult = {
        detection: {
          hasPII: false,
          spanEntities: [],
          allEntities: [],
          scanTimeMs: 0,
          language: "en",
          languageFallback: false,
        },
        hasPII: false,
      };
    } else {
      try {
        piiResult = await detectPII(request, codexExtractor);
      } catch (error) {
        console.error("PII detection error:", error);
        return respondCompletionDetectionError(c, request, startTime);
      }
    }

    // Step 3: Mask and send
    // Note: Route mode is not supported for inline completions because the local provider
    // only understands chat format, not the legacy completions format.
    const piiMasked = maskPII(request, piiResult.detection, codexExtractor);
    return sendCopilotCompletion(c, request, engine, incomingHeaders, {
      request: piiMasked.request,
      piiResult,
      piiMaskingContext: piiMasked.maskingContext,
      secretsResult,
      startTime,
    });
  },
);

// ─── Wildcard proxy ───────────────────────────────────────────────────────────

/**
 * Transparently proxy all other Copilot endpoints (e.g., /models, /embeddings).
 * These don't contain conversation content requiring masking.
 */
copilotRoutes.all("/*", async (c) => {
  const config = getConfig();

  if (!config.providers.copilot) {
    return c.json(
      errorFormats.openai.error(
        "Copilot provider not configured. Add providers.copilot to config.yaml.",
        "server_error",
      ),
      400,
    );
  }

  const baseUrl = config.providers.copilot.base_url.replace(/\/$/, "");
  const path = c.req.path.replace(/^\/copilot/, "");
  const query = c.req.url.includes("?") ? c.req.url.slice(c.req.url.indexOf("?")) : "";

  return proxy(`${baseUrl}${path}${query}`, {
    ...c.req,
    headers: {
      ...collectCopilotHeaders(c.req.header()),
      "X-Forwarded-Host": c.req.header("host"),
      host: undefined,
    },
  });
});

// ─── Types ────────────────────────────────────────────────────────────────────

interface CopilotChatOptions {
  request: OpenAIRequest;
  piiResult: PIIDetectResult;
  piiMaskingContext?: PlaceholderContext;
  secretsResult: SecretsProcessResult<OpenAIRequest>;
  startTime: number;
}

interface CopilotCompletionOptions {
  request: CopilotCompletionRequest;
  piiResult: PIIDetectResult;
  piiMaskingContext?: PlaceholderContext;
  secretsResult: SecretsProcessResult<CopilotCompletionRequest>;
  startTime: number;
}

// ─── Chat error handlers ──────────────────────────────────────────────────────

function respondChatBlocked(
  c: Context,
  body: OpenAIRequest,
  secretsResult: SecretsProcessResult<OpenAIRequest>,
  startTime: number,
) {
  const secretTypes = secretsResult.blockedTypes ?? [];
  setBlockedHeaders(c, secretTypes);
  logRequest(
    createLogData({
      provider: "copilot",
      model: body.model || "unknown",
      startTime,
      secrets: { detected: true, types: secretTypes, masked: false },
      statusCode: 400,
      errorMessage: secretsResult.blockedReason,
    }),
    c.req.header("User-Agent") || null,
  );
  return c.json(
    errorFormats.openai.error(
      `Request blocked: detected secret material (${secretTypes.join(",")}).`,
      "invalid_request_error",
      "secrets_detected",
    ),
    400,
  );
}

function respondChatDetectionError(c: Context, body: OpenAIRequest, startTime: number) {
  logRequest(
    createLogData({
      provider: "copilot",
      model: body.model || "unknown",
      startTime,
      statusCode: 503,
      errorMessage: "Detection service unavailable",
    }),
    c.req.header("User-Agent") || null,
  );
  return c.json(
    errorFormats.openai.error(
      "Detection service unavailable",
      "server_error",
      "service_unavailable",
    ),
    503,
  );
}

// ─── Inline completion error handlers ────────────────────────────────────────

function respondCompletionBlocked(
  c: Context,
  body: CopilotCompletionRequest,
  secretsResult: SecretsProcessResult<CopilotCompletionRequest>,
  startTime: number,
) {
  const secretTypes = secretsResult.blockedTypes ?? [];
  setBlockedHeaders(c, secretTypes);
  logRequest(
    createLogData({
      provider: "copilot",
      model: body.model || "unknown",
      startTime,
      secrets: { detected: true, types: secretTypes, masked: false },
      statusCode: 400,
      errorMessage: secretsResult.blockedReason,
    }),
    c.req.header("User-Agent") || null,
  );
  return c.json(
    errorFormats.openai.error(
      `Request blocked: detected secret material (${secretTypes.join(",")}).`,
      "invalid_request_error",
      "secrets_detected",
    ),
    400,
  );
}

function respondCompletionDetectionError(
  c: Context,
  body: CopilotCompletionRequest,
  startTime: number,
) {
  logRequest(
    createLogData({
      provider: "copilot",
      model: body.model || "unknown",
      startTime,
      statusCode: 503,
      errorMessage: "Detection service unavailable",
    }),
    c.req.header("User-Agent") || null,
  );
  return c.json(
    errorFormats.openai.error(
      "Detection service unavailable",
      "server_error",
      "service_unavailable",
    ),
    503,
  );
}

// ─── Provider handlers ────────────────────────────────────────────────────────

async function sendCopilotChat(
  c: Context,
  originalRequest: OpenAIRequest,
  incomingHeaders: Record<string, string | undefined>,
  opts: CopilotChatOptions,
) {
  const config = getConfig();
  const { request, piiResult, piiMaskingContext, secretsResult, startTime } = opts;

  setResponseHeaders(
    c,
    config.mode,
    "copilot",
    toPIIHeaderData(piiResult),
    toSecretsHeaderData(secretsResult),
  );

  try {
    const result = await callCopilotChat(request, config.providers.copilot!, incomingHeaders);

    logRequest(
      createLogData({
        provider: "copilot",
        model: result.model || originalRequest.model || "unknown",
        startTime,
        pii: toPIILogData(piiResult),
        secrets: toSecretsLogData(secretsResult),
      }),
      c.req.header("User-Agent") || null,
    );

    if (result.isStreaming) {
      return respondChatStreaming(
        c,
        result,
        piiMaskingContext,
        secretsResult.maskingContext,
        config.masking,
      );
    }

    return respondChatJson(
      c,
      result.response,
      piiMaskingContext,
      secretsResult.maskingContext,
      config.masking,
    );
  } catch (error) {
    return handleProviderError(
      c,
      error,
      {
        provider: "copilot",
        model: originalRequest.model || "unknown",
        startTime,
        pii: toPIILogData(piiResult),
        secrets: toSecretsLogData(secretsResult),
        userAgent: c.req.header("User-Agent") || null,
      },
      (msg) => errorFormats.openai.error(msg, "server_error", "upstream_error"),
    );
  }
}

async function sendCopilotCompletion(
  c: Context,
  originalRequest: CopilotCompletionRequest,
  engine: string,
  incomingHeaders: Record<string, string | undefined>,
  opts: CopilotCompletionOptions,
) {
  const config = getConfig();
  const { request, piiResult, piiMaskingContext, secretsResult, startTime } = opts;

  setResponseHeaders(
    c,
    config.mode,
    "copilot",
    toPIIHeaderData(piiResult),
    toSecretsHeaderData(secretsResult),
  );

  try {
    const result = await callCopilotCompletion(
      request,
      engine,
      config.providers.copilot!,
      incomingHeaders,
    );

    logRequest(
      createLogData({
        provider: "copilot",
        model: result.model || originalRequest.model || engine,
        startTime,
        pii: toPIILogData(piiResult),
        secrets: toSecretsLogData(secretsResult),
      }),
      c.req.header("User-Agent") || null,
    );

    if (result.isStreaming) {
      return respondCompletionStreaming(
        c,
        result,
        piiMaskingContext,
        secretsResult.maskingContext,
        config.masking,
      );
    }

    return respondCompletionJson(
      c,
      result.response,
      piiMaskingContext,
      secretsResult.maskingContext,
      config.masking,
    );
  } catch (error) {
    return handleProviderError(
      c,
      error,
      {
        provider: "copilot",
        model: originalRequest.model || engine,
        startTime,
        pii: toPIILogData(piiResult),
        secrets: toSecretsLogData(secretsResult),
        userAgent: c.req.header("User-Agent") || null,
      },
      (msg) => errorFormats.openai.error(msg, "server_error", "upstream_error"),
    );
  }
}

// ─── Response formatters (chat) ───────────────────────────────────────────────

function respondChatStreaming(
  c: Context,
  result: CopilotChatResult & { isStreaming: true },
  piiContext?: PlaceholderContext,
  secretsContext?: PlaceholderContext,
  maskingConfig?: MaskingConfig,
) {
  c.header("Content-Type", "text/event-stream");
  c.header("Cache-Control", "no-cache");
  c.header("Connection", "keep-alive");

  if (piiContext || secretsContext) {
    const stream = createUnmaskingStream(
      result.response,
      piiContext,
      maskingConfig!,
      secretsContext,
    );
    return c.body(stream);
  }

  return c.body(result.response);
}

function respondChatJson(
  c: Context,
  response: OpenAIResponse,
  piiContext?: PlaceholderContext,
  secretsContext?: PlaceholderContext,
  maskingConfig?: MaskingConfig,
) {
  let result = response;
  if (piiContext) {
    result = unmaskPIIResponse(result, piiContext, maskingConfig!, openaiExtractor);
  }
  if (secretsContext) {
    result = unmaskSecretsResponse(result, secretsContext, openaiExtractor);
  }
  return c.json(result);
}

// ─── Response formatters (inline completions) ─────────────────────────────────

function respondCompletionStreaming(
  c: Context,
  result: CopilotCompletionResult & { isStreaming: true },
  piiContext?: PlaceholderContext,
  secretsContext?: PlaceholderContext,
  maskingConfig?: MaskingConfig,
) {
  c.header("Content-Type", "text/event-stream");
  c.header("Cache-Control", "no-cache");
  c.header("Connection", "keep-alive");

  if (piiContext || secretsContext) {
    const stream = createCompletionUnmaskingStream(
      result.response,
      piiContext,
      maskingConfig!,
      secretsContext,
    );
    return c.body(stream);
  }

  return c.body(result.response);
}

function respondCompletionJson(
  c: Context,
  response: CopilotCompletionResponse,
  piiContext?: PlaceholderContext,
  secretsContext?: PlaceholderContext,
  maskingConfig?: MaskingConfig,
) {
  let result = response;
  if (piiContext) {
    result = unmaskPIIResponse(result, piiContext, maskingConfig!, codexExtractor);
  }
  if (secretsContext) {
    result = unmaskSecretsResponse(result, secretsContext, codexExtractor);
  }
  return c.json(result);
}

import { zValidator } from "@hono/zod-validator";
import type { Context } from "hono";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { proxy } from "hono/proxy";
import { z } from "zod";
import { getConfig, type MaskingConfig } from "../config";
import { detectSecrets, extractTextFromRequest } from "../secrets/detect";
import { getRouter, type MaskDecision, type RoutingDecision } from "../services/decision";
import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatMessage,
  LLMResult,
} from "../services/llm-client";
import { logRequest, type RequestLogData } from "../services/logger";
import { unmaskResponse } from "../services/masking";
import { createUnmaskingStream } from "../services/stream-transformer";

// Request validation schema
const ChatCompletionSchema = z
  .object({
    messages: z
      .array(
        z.object({
          role: z.enum(["system", "user", "assistant"]),
          content: z.string(),
        }),
      )
      .min(1, "At least one message is required"),
  })
  .passthrough();

export const proxyRoutes = new Hono();

/**
 * Type guard for MaskDecision
 */
function isMaskDecision(decision: RoutingDecision): decision is MaskDecision {
  return decision.mode === "mask";
}

proxyRoutes.get("/models", (c) => {
  const { upstream } = getRouter().getProvidersInfo();

  return proxy(`${upstream.baseUrl}/models`, {
    headers: {
      Authorization: c.req.header("Authorization"),
    },
  });
});

/**
 * POST /v1/chat/completions - OpenAI-compatible chat completion endpoint
 */
proxyRoutes.post(
  "/chat/completions",
  zValidator("json", ChatCompletionSchema, (result, c) => {
    if (!result.success) {
      return c.json(
        {
          error: {
            message: "Invalid request body",
            type: "invalid_request_error",
            details: result.error.errors,
          },
        },
        400,
      );
    }
  }),
  async (c) => {
    const startTime = Date.now();
    const body = c.req.valid("json") as ChatCompletionRequest;
    const config = getConfig();
    const router = getRouter();

    // Secrets detection runs before PII detection
    if (config.secrets_detection.enabled) {
      const text = extractTextFromRequest(body);
      const secretsResult = detectSecrets(text, config.secrets_detection);

      if (secretsResult.detected) {
        const secretTypes = secretsResult.matches.map((m) => m.type);
        const secretTypesStr = secretTypes.join(", ");

        // Set headers before returning error
        c.header("X-LLM-Shield-Secrets-Detected", "true");
        c.header("X-LLM-Shield-Secrets-Types", secretTypesStr);

        // Block action (Phase 1) - return 422 error
        if (config.secrets_detection.action === "block") {
          // Log metadata only (no secret content)
          logRequest(
            {
              timestamp: new Date().toISOString(),
              mode: config.mode,
              provider: "upstream", // Note: Request never reached provider
              model: body.model || "unknown",
              piiDetected: false,
              entities: [],
              latencyMs: Date.now() - startTime,
              scanTimeMs: 0,
              language: config.pii_detection.fallback_language,
              languageFallback: false,
              secretsDetected: true,
              secretsTypes: secretTypes,
            },
            c.req.header("User-Agent") || null,
          );

          return c.json(
            {
              error: {
                message: `Request blocked: detected secret material (${secretTypesStr}). Remove secrets and retry.`,
                type: "invalid_request_error",
                details: {
                  secrets_detected: secretTypes,
                },
              },
            },
            422,
          );
        }

        // TODO: Phase 2 - redact and route_local actions
        // For now, if action is not "block", we continue (but this shouldn't happen in Phase 1)
      }
    }

    let decision: RoutingDecision;
    try {
      decision = await router.decide(body.messages);
    } catch (error) {
      console.error("PII detection error:", error);
      throw new HTTPException(503, { message: "PII detection service unavailable" });
    }

    return handleCompletion(c, body, decision, startTime, router);
  },
);

/**
 * Handle chat completion for both route and mask modes
 */
async function handleCompletion(
  c: Context,
  body: ChatCompletionRequest,
  decision: RoutingDecision,
  startTime: number,
  router: ReturnType<typeof getRouter>,
) {
  const client = router.getClient(decision.provider);
  const maskingConfig = router.getMaskingConfig();
  const authHeader = decision.provider === "upstream" ? c.req.header("Authorization") : undefined;

  // Prepare request and masked content for logging
  let request: ChatCompletionRequest = body;
  let maskedContent: string | undefined;

  if (isMaskDecision(decision)) {
    request = { ...body, messages: decision.maskedMessages };
    maskedContent = formatMessagesForLog(decision.maskedMessages);
  }

  try {
    const result = await client.chatCompletion(request, authHeader);

    // Check for secrets in the request (for headers, even if not blocking)
    const config = getConfig();
    let secretsDetected = false;
    let secretsTypes: string[] = [];
    if (config.secrets_detection.enabled) {
      const text = extractTextFromRequest(body);
      const secretsResult = detectSecrets(text, config.secrets_detection);
      if (secretsResult.detected) {
        secretsDetected = true;
        secretsTypes = secretsResult.matches.map((m) => m.type);
      }
    }

    setShieldHeaders(c, decision, secretsDetected, secretsTypes);

    if (result.isStreaming) {
      return handleStreamingResponse(
        c,
        result,
        decision,
        startTime,
        maskedContent,
        maskingConfig,
        secretsDetected,
        secretsTypes,
      );
    }

    return handleJsonResponse(
      c,
      result,
      decision,
      startTime,
      maskedContent,
      maskingConfig,
      secretsDetected,
      secretsTypes,
    );
  } catch (error) {
    console.error("LLM request error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    throw new HTTPException(502, { message: `LLM provider error: ${message}` });
  }
}

/**
 * Set X-LLM-Shield response headers
 */
function setShieldHeaders(
  c: Context,
  decision: RoutingDecision,
  secretsDetected?: boolean,
  secretsTypes?: string[],
) {
  c.header("X-LLM-Shield-Mode", decision.mode);
  c.header("X-LLM-Shield-Provider", decision.provider);
  c.header("X-LLM-Shield-PII-Detected", decision.piiResult.hasPII.toString());
  c.header("X-LLM-Shield-Language", decision.piiResult.language);
  if (decision.piiResult.languageFallback) {
    c.header("X-LLM-Shield-Language-Fallback", "true");
  }
  if (decision.mode === "mask") {
    c.header("X-LLM-Shield-PII-Masked", decision.piiResult.hasPII.toString());
  }
  if (secretsDetected && secretsTypes) {
    c.header("X-LLM-Shield-Secrets-Detected", "true");
    c.header("X-LLM-Shield-Secrets-Types", secretsTypes.join(","));
  }
}

/**
 * Handle streaming response
 */
function handleStreamingResponse(
  c: Context,
  result: LLMResult & { isStreaming: true },
  decision: RoutingDecision,
  startTime: number,
  maskedContent: string | undefined,
  maskingConfig: MaskingConfig,
  secretsDetected?: boolean,
  secretsTypes?: string[],
) {
  logRequest(
    createLogData(
      decision,
      result,
      startTime,
      undefined,
      maskedContent,
      secretsDetected,
      secretsTypes,
    ),
    c.req.header("User-Agent") || null,
  );

  c.header("Content-Type", "text/event-stream");
  c.header("Cache-Control", "no-cache");
  c.header("Connection", "keep-alive");

  if (isMaskDecision(decision)) {
    const unmaskingStream = createUnmaskingStream(
      result.response,
      decision.maskingContext,
      maskingConfig,
    );
    return c.body(unmaskingStream);
  }

  return c.body(result.response);
}

/**
 * Handle JSON response
 */
function handleJsonResponse(
  c: Context,
  result: LLMResult & { isStreaming: false },
  decision: RoutingDecision,
  startTime: number,
  maskedContent: string | undefined,
  maskingConfig: MaskingConfig,
  secretsDetected?: boolean,
  secretsTypes?: string[],
) {
  logRequest(
    createLogData(
      decision,
      result,
      startTime,
      result.response,
      maskedContent,
      secretsDetected,
      secretsTypes,
    ),
    c.req.header("User-Agent") || null,
  );

  if (isMaskDecision(decision)) {
    return c.json(unmaskResponse(result.response, decision.maskingContext, maskingConfig));
  }

  return c.json(result.response);
}

/**
 * Create log data from decision and result
 */
function createLogData(
  decision: RoutingDecision,
  result: LLMResult,
  startTime: number,
  response?: ChatCompletionResponse,
  maskedContent?: string,
  secretsDetected?: boolean,
  secretsTypes?: string[],
): RequestLogData {
  return {
    timestamp: new Date().toISOString(),
    mode: decision.mode,
    provider: decision.provider,
    model: result.model,
    piiDetected: decision.piiResult.hasPII,
    entities: [...new Set(decision.piiResult.newEntities.map((e) => e.entity_type))],
    latencyMs: Date.now() - startTime,
    scanTimeMs: decision.piiResult.scanTimeMs,
    promptTokens: response?.usage?.prompt_tokens,
    completionTokens: response?.usage?.completion_tokens,
    language: decision.piiResult.language,
    languageFallback: decision.piiResult.languageFallback,
    detectedLanguage: decision.piiResult.detectedLanguage,
    maskedContent,
    secretsDetected,
    secretsTypes,
  };
}

/**
 * Format messages for logging
 */
function formatMessagesForLog(messages: ChatMessage[]): string {
  return messages.map((m) => `[${m.role}] ${m.content}`).join("\n");
}

/**
 * GitHub Copilot client
 *
 * Handles API calls to api.githubcopilot.com for both:
 * - Chat completions (/chat/completions) - OpenAI Chat format
 * - Inline completions (/v1/engines/:engine/completions) - legacy Completions format
 *
 * Authentication is handled by the IDE via short-lived bearer tokens.
 * This client forwards the token and all Copilot-specific headers transparently.
 */

import type { CopilotProviderConfig } from "../../config";
import { REQUEST_TIMEOUT_MS } from "../../constants/timeouts";
import { ProviderError } from "../errors";
import type { OpenAIRequest, OpenAIResponse } from "../openai/types";
import type { CopilotCompletionRequest, CopilotCompletionResponse } from "./types";

export { ProviderError } from "../errors";

/**
 * Result from Copilot chat (streaming or non-streaming)
 */
export type CopilotChatResult =
  | {
      isStreaming: true;
      response: ReadableStream<Uint8Array>;
      model: string;
    }
  | {
      isStreaming: false;
      response: OpenAIResponse;
      model: string;
    };

/**
 * Result from Copilot inline completions (streaming or non-streaming)
 */
export type CopilotCompletionResult =
  | {
      isStreaming: true;
      response: ReadableStream<Uint8Array>;
      model: string;
    }
  | {
      isStreaming: false;
      response: CopilotCompletionResponse;
      model: string;
    };

/**
 * Headers to forward from the IDE to the Copilot API.
 *
 * These are required for Copilot to accept the request.
 * Authorization carries the short-lived bearer token from the IDE.
 */
const COPILOT_FORWARD_HEADERS = [
  "authorization",
  "editor-version",
  "editor-plugin-version",
  "copilot-integration-id",
  "user-agent",
  "openai-intent",
  "openai-organization",
  "x-request-id",
  "vscode-sessionid",
  "vscode-machineid",
];

/**
 * Collect Copilot-specific headers from incoming request headers
 */
export function collectCopilotHeaders(
  incomingHeaders: Record<string, string | undefined>,
): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  for (const key of COPILOT_FORWARD_HEADERS) {
    const value = incomingHeaders[key] ?? incomingHeaders[key.toLowerCase()];
    if (value) {
      headers[key] = value;
    }
  }

  return headers;
}

/**
 * Call Copilot chat completions API (OpenAI Chat format)
 */
export async function callCopilotChat(
  request: OpenAIRequest,
  config: CopilotProviderConfig,
  incomingHeaders: Record<string, string | undefined>,
): Promise<CopilotChatResult> {
  const model = request.model ?? "unknown";
  const isStreaming = request.stream ?? false;

  const baseUrl = config.base_url.replace(/\/$/, "");
  const endpoint = `${baseUrl}/chat/completions`;

  const headers = collectCopilotHeaders(incomingHeaders);

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({ ...request, stream: isStreaming }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new ProviderError(response.status, response.statusText, await response.text());
  }

  if (isStreaming) {
    if (!response.body) {
      throw new Error("No response body for streaming request");
    }
    return { response: response.body, isStreaming: true, model };
  }

  return { response: await response.json(), isStreaming: false, model };
}

/**
 * Call Copilot inline completions API (legacy Completions format)
 */
export async function callCopilotCompletion(
  request: CopilotCompletionRequest,
  engine: string,
  config: CopilotProviderConfig,
  incomingHeaders: Record<string, string | undefined>,
): Promise<CopilotCompletionResult> {
  const model = request.model ?? engine;
  const isStreaming = request.stream ?? false;

  const baseUrl = config.base_url.replace(/\/$/, "");
  const endpoint = `${baseUrl}/v1/engines/${engine}/completions`;

  const headers = collectCopilotHeaders(incomingHeaders);

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({ ...request, stream: isStreaming }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new ProviderError(response.status, response.statusText, await response.text());
  }

  if (isStreaming) {
    if (!response.body) {
      throw new Error("No response body for streaming request");
    }
    return { response: response.body, isStreaming: true, model };
  }

  return { response: await response.json(), isStreaming: false, model };
}

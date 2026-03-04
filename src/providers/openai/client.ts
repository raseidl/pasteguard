/**
 * OpenAI client - simple functions for OpenAI API
 */

import type { OpenAIProviderConfig } from "../../config";
import { createTTFBTimeout, DEFAULT_PROVIDER_TIMEOUT_MS } from "../../constants/timeouts";
import { ProviderError } from "../errors";
import type { OpenAIRequest, OpenAIResponse } from "./types";

export { ProviderError } from "../errors";

/**
 * Headers to forward from the client to the OpenAI API.
 */
const OPENAI_FORWARD_HEADERS = [
  "authorization",
  "openai-organization",
  "openai-project",
  "user-agent",
  "x-request-id",
];

/**
 * Collect OpenAI-relevant headers from incoming request headers
 */
export function collectOpenAIHeaders(
  incomingHeaders: Record<string, string | undefined>,
): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  for (const key of OPENAI_FORWARD_HEADERS) {
    const value = incomingHeaders[key];
    if (value) {
      headers[key] = value;
    }
  }

  return headers;
}

/**
 * Result from provider (streaming or non-streaming)
 */
export type ProviderResult =
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
 * Call OpenAI chat completion API
 */
export async function callOpenAI(
  request: OpenAIRequest,
  config: OpenAIProviderConfig,
  authHeader?: string,
  timeoutMs?: number,
): Promise<ProviderResult> {
  const model = request.model;
  const isStreaming = request.stream ?? false;

  if (!model) {
    throw new Error("Model is required in request");
  }

  const baseUrl = config.base_url.replace(/\/$/, "");
  const endpoint = `${baseUrl}/chat/completions`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  // Use client's auth header if provided, otherwise fall back to config
  if (authHeader) {
    headers.Authorization = authHeader;
  } else if (config.api_key) {
    headers.Authorization = `Bearer ${config.api_key}`;
  }

  // Build request body
  const body: Record<string, unknown> = {
    ...request,
    model,
    stream: isStreaming,
  };

  // Request usage data in the final streaming chunk
  if (isStreaming) {
    body.stream_options = { include_usage: true };
  }

  // OpenAI newer models use max_completion_tokens instead of max_tokens
  if (body.max_tokens) {
    body.max_completion_tokens = body.max_tokens;
    delete body.max_tokens;
  }

  const { signal, clear } = createTTFBTimeout(timeoutMs ?? DEFAULT_PROVIDER_TIMEOUT_MS);

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal,
  });

  clear();

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
 * Get OpenAI provider info for /info endpoint
 */
export function getOpenAIInfo(config: OpenAIProviderConfig): { baseUrl: string } {
  return {
    baseUrl: config.base_url,
  };
}

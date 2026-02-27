/**
 * Anthropic SSE stream transformer for unmasking PII and secrets
 *
 * Anthropic uses a different SSE format than OpenAI:
 * - event: message_start / content_block_start / content_block_delta / etc.
 * - data: {...}
 *
 * Text content comes in content_block_delta events with delta.type === "text_delta"
 */

import type { MaskingConfig } from "../../config";
import type { PlaceholderContext } from "../../masking/context";
import { flushMaskingBuffer, unmaskStreamChunk } from "../../pii/mask";
import { flushSecretsMaskingBuffer, unmaskSecretsStreamChunk } from "../../secrets/mask";
import type { TokenUsage } from "../../services/logger";
import type { ContentBlockDeltaEvent, TextDelta } from "./types";

// Module-level encoder — stateless, safe to share across all concurrent streams
const encoder = new TextEncoder();

/**
 * Creates a transform stream that unmasks Anthropic SSE content
 */
export function createAnthropicUnmaskingStream(
  source: ReadableStream<Uint8Array>,
  piiContext: PlaceholderContext | undefined,
  config: MaskingConfig,
  secretsContext?: PlaceholderContext,
  onUsage?: (tokens: TokenUsage) => void,
): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder(); // per-stream — has internal state with { stream: true }
  let piiBuffer = "";
  let secretsBuffer = "";
  let lineBuffer = "";
  // Accumulate token counts across message_start and message_delta events
  const accumulatedTokens: TokenUsage = { promptTokens: 0, completionTokens: 0 };

  return new ReadableStream({
    async start(controller) {
      const reader = source.getReader();

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            // Fire token usage callback with accumulated data
            if (onUsage && (accumulatedTokens.promptTokens > 0 || accumulatedTokens.completionTokens > 0)) {
              try {
                onUsage(accumulatedTokens);
              } catch (e) {
                console.error("Token usage callback error:", e);
              }
            }

            // Flush remaining buffers
            let flushed = "";

            if (piiBuffer && piiContext) {
              flushed = flushMaskingBuffer(piiBuffer, piiContext, config);
            } else if (piiBuffer) {
              flushed = piiBuffer;
            }

            if (secretsBuffer && secretsContext) {
              flushed += flushSecretsMaskingBuffer(secretsBuffer, secretsContext);
            } else if (secretsBuffer) {
              flushed += secretsBuffer;
            }

            // Send flushed content as final text delta
            if (flushed) {
              const finalEvent: ContentBlockDeltaEvent = {
                type: "content_block_delta",
                index: 0,
                delta: { type: "text_delta", text: flushed },
              };
              controller.enqueue(
                encoder.encode(
                  `event: content_block_delta\ndata: ${JSON.stringify(finalEvent)}\n\n`,
                ),
              );
            }

            controller.close();
            break;
          }

          lineBuffer += decoder.decode(value, { stream: true });
          const lines = lineBuffer.split("\n");
          lineBuffer = lines.pop() || "";

          for (const line of lines) {
            // Pass through event type lines
            if (line.startsWith("event: ")) {
              controller.enqueue(encoder.encode(`${line}\n`));
              continue;
            }

            // Process data lines
            if (line.startsWith("data: ")) {
              const data = line.slice(6);

              // Skip full parse for events that can't contain text content or token usage
              if (
                !data.includes('"text_delta"') &&
                !(onUsage && (data.includes('"message_start"') || data.includes('"message_delta"')))
              ) {
                controller.enqueue(encoder.encode(`data: ${data}\n`));
                continue;
              }

              try {
                const parsed = JSON.parse(data) as {
                  type: string;
                  delta?: { type: string };
                  message?: { usage?: { input_tokens?: number; cache_creation_input_tokens?: number; cache_read_input_tokens?: number } };
                  usage?: { output_tokens?: number };
                };

                // Extract input tokens from message_start event
                if (onUsage && parsed.type === "message_start" && parsed.message?.usage) {
                  const u = parsed.message.usage;
                  accumulatedTokens.promptTokens = u.input_tokens ?? 0;
                  if (u.cache_creation_input_tokens != null) {
                    accumulatedTokens.cacheCreationInputTokens = u.cache_creation_input_tokens;
                  }
                  if (u.cache_read_input_tokens != null) {
                    accumulatedTokens.cacheReadInputTokens = u.cache_read_input_tokens;
                  }
                  controller.enqueue(encoder.encode(`data: ${data}\n`));
                  continue;
                }

                // Extract output tokens from message_delta event
                if (onUsage && parsed.type === "message_delta" && parsed.usage) {
                  accumulatedTokens.completionTokens = parsed.usage.output_tokens ?? 0;
                  controller.enqueue(encoder.encode(`data: ${data}\n`));
                  continue;
                }

                // Only process text deltas
                if (parsed.type === "content_block_delta" && parsed.delta?.type === "text_delta") {
                  const event = parsed as ContentBlockDeltaEvent;
                  const textDelta = event.delta as TextDelta;
                  let processedText = textDelta.text;

                  // Unmask PII
                  if (piiContext && processedText) {
                    const { output, remainingBuffer } = unmaskStreamChunk(
                      piiBuffer,
                      processedText,
                      piiContext,
                      config,
                    );
                    piiBuffer = remainingBuffer;
                    processedText = output;
                  }

                  // Unmask secrets
                  if (secretsContext && processedText) {
                    const { output, remainingBuffer } = unmaskSecretsStreamChunk(
                      secretsBuffer,
                      processedText,
                      secretsContext,
                    );
                    secretsBuffer = remainingBuffer;
                    processedText = output;
                  }

                  // Only emit if we have content
                  if (processedText) {
                    const modifiedEvent = {
                      ...parsed,
                      delta: { ...textDelta, text: processedText },
                    };
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(modifiedEvent)}\n`));
                  }
                } else {
                  // Pass through other events unchanged
                  controller.enqueue(encoder.encode(`data: ${data}\n`));
                }
              } catch {
                // Pass through unparseable data
                controller.enqueue(encoder.encode(`${line}\n`));
              }
              continue;
            }

            // Pass through empty lines and other content
            if (line.trim() === "") {
              controller.enqueue(encoder.encode("\n"));
            } else {
              controller.enqueue(encoder.encode(`${line}\n`));
            }
          }
        }
      } catch (error) {
        controller.error(error);
      } finally {
        reader.releaseLock();
      }
    },
  });
}

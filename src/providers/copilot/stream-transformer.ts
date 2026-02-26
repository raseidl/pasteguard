import type { MaskingConfig } from "../../config";
import type { PlaceholderContext } from "../../masking/context";
import { flushMaskingBuffer, unmaskStreamChunk } from "../../pii/mask";
import { flushSecretsMaskingBuffer, unmaskSecretsStreamChunk } from "../../secrets/mask";

// Module-level encoder — stateless, safe to share across all concurrent streams
const encoder = new TextEncoder();
const DONE_BYTES = encoder.encode("data: [DONE]\n\n");

/**
 * Creates a transform stream that unmasks SSE content for Copilot inline completions
 *
 * Identical to the OpenAI chat stream transformer, but reads from
 * `choices[0].text` (legacy Completions format) instead of
 * `choices[0].delta.content` (Chat Completions format).
 *
 * Processes Server-Sent Events (SSE) chunks, buffering partial placeholders
 * and unmasking complete ones before forwarding to the client.
 */
export function createCompletionUnmaskingStream(
  source: ReadableStream<Uint8Array>,
  piiContext: PlaceholderContext | undefined,
  config: MaskingConfig,
  secretsContext?: PlaceholderContext,
): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder(); // per-stream — has internal state with { stream: true }
  let piiBuffer = "";
  let secretsBuffer = "";

  return new ReadableStream({
    async start(controller) {
      const reader = source.getReader();

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            // Flush remaining buffer content before closing
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

            if (flushed) {
              const finalEvent = {
                id: `flush-${Date.now()}`,
                object: "text_completion",
                created: Math.floor(Date.now() / 1000),
                choices: [{ text: flushed, index: 0, finish_reason: null }],
              };
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(finalEvent)}\n\n`));
            }
            controller.close();
            break;
          }

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6);

              if (data === "[DONE]") {
                controller.enqueue(DONE_BYTES);
                continue;
              }

              // Skip full parse for events that can't have text content
              if (!data.includes('"text"')) {
                controller.enqueue(encoder.encode(`data: ${data}\n\n`));
                continue;
              }

              try {
                const parsed = JSON.parse(data);
                // Inline completions use choices[0].text, not choices[0].delta.content
                const text = parsed.choices?.[0]?.text || "";

                if (text) {
                  let processedText = text;

                  if (piiContext) {
                    const { output, remainingBuffer } = unmaskStreamChunk(
                      piiBuffer,
                      processedText,
                      piiContext,
                      config,
                    );
                    piiBuffer = remainingBuffer;
                    processedText = output;
                  }

                  if (secretsContext && processedText) {
                    const { output, remainingBuffer } = unmaskSecretsStreamChunk(
                      secretsBuffer,
                      processedText,
                      secretsContext,
                    );
                    secretsBuffer = remainingBuffer;
                    processedText = output;
                  }

                  if (processedText) {
                    parsed.choices[0].text = processedText;
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(parsed)}\n\n`));
                  }
                } else {
                  controller.enqueue(encoder.encode(`data: ${data}\n\n`));
                }
              } catch {
                controller.enqueue(encoder.encode(`${line}\n`));
              }
            } else if (line.trim()) {
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

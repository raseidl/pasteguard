import type { MaskingConfig } from "../config";
import { flushStreamBuffer, type MaskingContext, unmaskStreamChunk } from "./masking";

/**
 * Creates a transform stream that unmasks SSE content
 *
 * Processes Server-Sent Events (SSE) chunks, buffering partial placeholders
 * and unmasking complete ones before forwarding to the client.
 */
export function createUnmaskingStream(
  source: ReadableStream<Uint8Array>,
  context: MaskingContext,
  config: MaskingConfig,
): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let contentBuffer = "";

  return new ReadableStream({
    async start(controller) {
      const reader = source.getReader();

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            // Flush remaining buffer content before closing
            if (contentBuffer) {
              const flushed = flushStreamBuffer(contentBuffer, context, config);
              if (flushed) {
                const finalEvent = {
                  id: `flush-${Date.now()}`,
                  object: "chat.completion.chunk",
                  created: Math.floor(Date.now() / 1000),
                  choices: [
                    {
                      index: 0,
                      delta: { content: flushed },
                      finish_reason: null,
                    },
                  ],
                };
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(finalEvent)}\n\n`));
              }
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
                controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                continue;
              }

              try {
                const parsed = JSON.parse(data);
                const content = parsed.choices?.[0]?.delta?.content || "";

                if (content) {
                  // Use streaming unmask
                  const { output, remainingBuffer } = unmaskStreamChunk(
                    contentBuffer,
                    content,
                    context,
                    config,
                  );
                  contentBuffer = remainingBuffer;

                  if (output) {
                    // Update the parsed object with unmasked content
                    parsed.choices[0].delta.content = output;
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(parsed)}\n\n`));
                  }
                } else {
                  // Pass through non-content events
                  controller.enqueue(encoder.encode(`data: ${data}\n\n`));
                }
              } catch {
                // Pass through unparseable data
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

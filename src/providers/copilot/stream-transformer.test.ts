import { describe, expect, test } from "bun:test";
import type { MaskingConfig } from "../../config";
import { createMaskingContext } from "../../pii/mask";
import { createCompletionUnmaskingStream } from "./stream-transformer";

const defaultConfig: MaskingConfig = {
  show_markers: false,
  marker_text: "[protected]",
  whitelist: [],
};

/**
 * Helper to create a ReadableStream from SSE data
 */
function createSSEStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let index = 0;

  return new ReadableStream({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(encoder.encode(chunks[index]));
        index++;
      } else {
        controller.close();
      }
    },
  });
}

/**
 * Helper to consume a stream and return all chunks as string
 */
async function consumeStream(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let result = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    result += decoder.decode(value, { stream: true });
  }

  return result;
}

describe("createCompletionUnmaskingStream", () => {
  test("unmasks complete placeholder in single chunk", async () => {
    const context = createMaskingContext();
    context.mapping["[[EMAIL_ADDRESS_1]]"] = "test@test.com";

    // Uses choices[0].text (not choices[0].delta.content like Chat format)
    const sseData = `data: {"choices":[{"text":"Hello [[EMAIL_ADDRESS_1]]!","index":0}]}\n\n`;
    const source = createSSEStream([sseData]);

    const unmaskedStream = createCompletionUnmaskingStream(source, context, defaultConfig);
    const result = await consumeStream(unmaskedStream);

    expect(result).toContain("Hello test@test.com!");
  });

  test("handles [DONE] message", async () => {
    const context = createMaskingContext();

    const chunks = [`data: {"choices":[{"text":"Hi","index":0}]}\n\n`, `data: [DONE]\n\n`];
    const source = createSSEStream(chunks);

    const unmaskedStream = createCompletionUnmaskingStream(source, context, defaultConfig);
    const result = await consumeStream(unmaskedStream);

    expect(result).toContain("data: [DONE]");
  });

  test("passes through events with empty text", async () => {
    const context = createMaskingContext();

    const sseData = `data: {"choices":[{"text":"","index":0,"finish_reason":"stop"}]}\n\n`;
    const source = createSSEStream([sseData]);

    const unmaskedStream = createCompletionUnmaskingStream(source, context, defaultConfig);
    const result = await consumeStream(unmaskedStream);

    expect(result).toContain(`"finish_reason":"stop"`);
  });

  test("buffers partial placeholder across chunks", async () => {
    const context = createMaskingContext();
    context.mapping["[[EMAIL_ADDRESS_1]]"] = "a@b.com";

    // Split placeholder across chunks
    const chunks = [
      `data: {"choices":[{"text":"Hello [[EMAIL_","index":0}]}\n\n`,
      `data: {"choices":[{"text":"ADDRESS_1]] world","index":0}]}\n\n`,
    ];
    const source = createSSEStream(chunks);

    const unmaskedStream = createCompletionUnmaskingStream(source, context, defaultConfig);
    const result = await consumeStream(unmaskedStream);

    expect(result).toContain("a@b.com");
  });

  test("flushes remaining buffer on stream end", async () => {
    const context = createMaskingContext();
    context.mapping["[[EMAIL_ADDRESS_1]]"] = "test@test.com";

    const chunks = [`data: {"choices":[{"text":"Contact [[EMAIL_ADDRESS_1]]","index":0}]}\n\n`];
    const source = createSSEStream(chunks);

    const unmaskedStream = createCompletionUnmaskingStream(source, context, defaultConfig);
    const result = await consumeStream(unmaskedStream);

    expect(result).toContain("test@test.com");
  });

  test("handles multiple placeholders in stream", async () => {
    const context = createMaskingContext();
    context.mapping["[[PERSON_1]]"] = "John";
    context.mapping["[[EMAIL_ADDRESS_1]]"] = "john@test.com";

    const sseData = `data: {"choices":[{"text":"[[PERSON_1]]: [[EMAIL_ADDRESS_1]]","index":0}]}\n\n`;
    const source = createSSEStream([sseData]);

    const unmaskedStream = createCompletionUnmaskingStream(source, context, defaultConfig);
    const result = await consumeStream(unmaskedStream);

    expect(result).toContain("John");
    expect(result).toContain("john@test.com");
  });

  test("handles empty stream", async () => {
    const context = createMaskingContext();
    const source = createSSEStream([]);

    const unmaskedStream = createCompletionUnmaskingStream(source, context, defaultConfig);
    const result = await consumeStream(unmaskedStream);

    expect(result).toBe("");
  });

  test("passes through malformed data", async () => {
    const context = createMaskingContext();

    const chunks = [`data: not-json\n\n`];
    const source = createSSEStream(chunks);

    const unmaskedStream = createCompletionUnmaskingStream(source, context, defaultConfig);
    const result = await consumeStream(unmaskedStream);

    expect(result).toContain("not-json");
  });

  test("reads from choices[0].text not choices[0].delta.content", async () => {
    const context = createMaskingContext();
    context.mapping["[[PERSON_1]]"] = "Alice";

    // Chat format (delta.content) should NOT be unmasked — only text field matters
    const chatChunk = `data: {"choices":[{"delta":{"content":"[[PERSON_1]]"},"index":0}]}\n\n`;
    const completionChunk = `data: {"choices":[{"text":"[[PERSON_1]]","index":0}]}\n\n`;

    const chatStream = createCompletionUnmaskingStream(
      createSSEStream([chatChunk]),
      context,
      defaultConfig,
    );
    const completionStream = createCompletionUnmaskingStream(
      createSSEStream([completionChunk]),
      context,
      defaultConfig,
    );

    const chatResult = await consumeStream(chatStream);
    const completionResult = await consumeStream(completionStream);

    // Chat-format chunk has no .text field — placeholder stays unmasked, chunk passed through
    expect(chatResult).toContain("[[PERSON_1]]");
    // Completion-format chunk with .text — placeholder is unmasked
    expect(completionResult).toContain("Alice");
    expect(completionResult).not.toContain("[[PERSON_1]]");
  });
});

import { describe, expect, test } from "bun:test";
import type { MaskingConfig } from "../../config";
import { createMaskingContext } from "../../pii/mask";
import { createAnthropicUnmaskingStream } from "./stream-transformer";

const defaultConfig: MaskingConfig = {
  show_markers: false,
  marker_text: "[protected]",
  whitelist: [],
};

/**
 * Helper to create a ReadableStream from Anthropic SSE data
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

/**
 * Helper to create Anthropic SSE format
 */
function createAnthropicEvent(type: string, data: object): string {
  return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
}

function createTextDelta(text: string, index = 0): string {
  return createAnthropicEvent("content_block_delta", {
    type: "content_block_delta",
    index,
    delta: { type: "text_delta", text },
  });
}

describe("createAnthropicUnmaskingStream", () => {
  test("unmasks complete placeholder in single chunk", async () => {
    const context = createMaskingContext();
    context.mapping["[[EMAIL_ADDRESS_1]]"] = "test@test.com";

    const sseData = createTextDelta("Hello [[EMAIL_ADDRESS_1]]!");
    const source = createSSEStream([sseData]);

    const unmaskedStream = createAnthropicUnmaskingStream(source, context, defaultConfig);
    const result = await consumeStream(unmaskedStream);

    expect(result).toContain("Hello test@test.com!");
  });

  test("handles message_start event", async () => {
    const context = createMaskingContext();

    const messageStart = createAnthropicEvent("message_start", {
      type: "message_start",
      message: {
        id: "msg_123",
        type: "message",
        role: "assistant",
        content: [],
        model: "claude-3-sonnet",
      },
    });
    const source = createSSEStream([messageStart]);

    const unmaskedStream = createAnthropicUnmaskingStream(source, context, defaultConfig);
    const result = await consumeStream(unmaskedStream);

    expect(result).toContain("message_start");
    expect(result).toContain("msg_123");
  });

  test("passes through non-text-delta events unchanged", async () => {
    const context = createMaskingContext();

    const contentBlockStart = createAnthropicEvent("content_block_start", {
      type: "content_block_start",
      index: 0,
      content_block: { type: "text", text: "" },
    });
    const source = createSSEStream([contentBlockStart]);

    const unmaskedStream = createAnthropicUnmaskingStream(source, context, defaultConfig);
    const result = await consumeStream(unmaskedStream);

    expect(result).toContain("content_block_start");
  });

  test("buffers partial placeholder across chunks", async () => {
    const context = createMaskingContext();
    context.mapping["[[EMAIL_ADDRESS_1]]"] = "a@b.com";

    // Split placeholder across chunks
    const chunks = [createTextDelta("Hello [[EMAIL_"), createTextDelta("ADDRESS_1]] world")];
    const source = createSSEStream(chunks);

    const unmaskedStream = createAnthropicUnmaskingStream(source, context, defaultConfig);
    const result = await consumeStream(unmaskedStream);

    // Should eventually contain the unmasked email
    expect(result).toContain("a@b.com");
  });

  test("flushes remaining buffer on stream end", async () => {
    const context = createMaskingContext();
    context.mapping["[[EMAIL_ADDRESS_1]]"] = "test@test.com";

    const chunks = [createTextDelta("Contact [[EMAIL_ADDRESS_1]]")];
    const source = createSSEStream(chunks);

    const unmaskedStream = createAnthropicUnmaskingStream(source, context, defaultConfig);
    const result = await consumeStream(unmaskedStream);

    expect(result).toContain("test@test.com");
  });

  test("handles multiple placeholders in stream", async () => {
    const context = createMaskingContext();
    context.mapping["[[PERSON_1]]"] = "John";
    context.mapping["[[EMAIL_ADDRESS_1]]"] = "john@test.com";

    const sseData = createTextDelta("[[PERSON_1]]: [[EMAIL_ADDRESS_1]]");
    const source = createSSEStream([sseData]);

    const unmaskedStream = createAnthropicUnmaskingStream(source, context, defaultConfig);
    const result = await consumeStream(unmaskedStream);

    expect(result).toContain("John");
    expect(result).toContain("john@test.com");
  });

  test("handles empty stream", async () => {
    const context = createMaskingContext();
    const source = createSSEStream([]);

    const unmaskedStream = createAnthropicUnmaskingStream(source, context, defaultConfig);
    const result = await consumeStream(unmaskedStream);

    expect(result).toBe("");
  });

  test("passes through malformed data", async () => {
    const context = createMaskingContext();

    const chunks = [`event: content_block_delta\ndata: not-json\n\n`];
    const source = createSSEStream(chunks);

    const unmaskedStream = createAnthropicUnmaskingStream(source, context, defaultConfig);
    const result = await consumeStream(unmaskedStream);

    expect(result).toContain("not-json");
  });

  test("handles message_stop event", async () => {
    const context = createMaskingContext();

    const messageStop = createAnthropicEvent("message_stop", { type: "message_stop" });
    const source = createSSEStream([messageStop]);

    const unmaskedStream = createAnthropicUnmaskingStream(source, context, defaultConfig);
    const result = await consumeStream(unmaskedStream);

    expect(result).toContain("message_stop");
  });

  test("handles ping events", async () => {
    const context = createMaskingContext();

    const ping = createAnthropicEvent("ping", { type: "ping" });
    const source = createSSEStream([ping]);

    const unmaskedStream = createAnthropicUnmaskingStream(source, context, defaultConfig);
    const result = await consumeStream(unmaskedStream);

    expect(result).toContain("ping");
  });

  test("unmasks secrets context", async () => {
    const piiContext = createMaskingContext();
    const secretsContext = createMaskingContext();
    secretsContext.mapping["[[SECRET_OPENSSH_PRIVATE_KEY_1]]"] = "secret-key-value";

    const sseData = createTextDelta("Key: [[SECRET_OPENSSH_PRIVATE_KEY_1]]");
    const source = createSSEStream([sseData]);

    const unmaskedStream = createAnthropicUnmaskingStream(
      source,
      piiContext,
      defaultConfig,
      secretsContext,
    );
    const result = await consumeStream(unmaskedStream);

    expect(result).toContain("secret-key-value");
  });

  test("unmasks both PII and secrets", async () => {
    const piiContext = createMaskingContext();
    piiContext.mapping["[[PERSON_1]]"] = "Alice";

    const secretsContext = createMaskingContext();
    secretsContext.mapping["[[SECRET_API_KEY_1]]"] = "sk-12345";

    const sseData = createTextDelta("[[PERSON_1]]'s key: [[SECRET_API_KEY_1]]");
    const source = createSSEStream([sseData]);

    const unmaskedStream = createAnthropicUnmaskingStream(
      source,
      piiContext,
      defaultConfig,
      secretsContext,
    );
    const result = await consumeStream(unmaskedStream);

    expect(result).toContain("Alice");
    expect(result).toContain("sk-12345");
  });

  test("handles line buffering for split chunks", async () => {
    const context = createMaskingContext();
    context.mapping["[[PERSON_1]]"] = "Bob";

    // Simulate a chunk that splits in the middle of the SSE format
    const chunks = [
      `event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hi `,
      `[[PERSON_1]]"}}\n\n`,
    ];
    const source = createSSEStream(chunks);

    const unmaskedStream = createAnthropicUnmaskingStream(source, context, defaultConfig);
    const result = await consumeStream(unmaskedStream);

    expect(result).toContain("Bob");
  });

  test("handles tool_use deltas (input_json_delta)", async () => {
    const context = createMaskingContext();

    const toolUseDelta = createAnthropicEvent("content_block_delta", {
      type: "content_block_delta",
      index: 0,
      delta: { type: "input_json_delta", partial_json: '{"arg": "value"}' },
    });
    const source = createSSEStream([toolUseDelta]);

    const unmaskedStream = createAnthropicUnmaskingStream(source, context, defaultConfig);
    const result = await consumeStream(unmaskedStream);

    // input_json_delta should pass through unchanged
    expect(result).toContain("input_json_delta");
    expect(result).toContain("arg");
    expect(result).toContain("value");
  });

  test("handles content_block_stop events", async () => {
    const context = createMaskingContext();

    const blockStop = createAnthropicEvent("content_block_stop", {
      type: "content_block_stop",
      index: 0,
    });
    const source = createSSEStream([blockStop]);

    const unmaskedStream = createAnthropicUnmaskingStream(source, context, defaultConfig);
    const result = await consumeStream(unmaskedStream);

    expect(result).toContain("content_block_stop");
  });

  test("handles message_delta events", async () => {
    const context = createMaskingContext();

    const messageDelta = createAnthropicEvent("message_delta", {
      type: "message_delta",
      delta: { stop_reason: "end_turn", stop_sequence: null },
      usage: { output_tokens: 42 },
    });
    const source = createSSEStream([messageDelta]);

    const unmaskedStream = createAnthropicUnmaskingStream(source, context, defaultConfig);
    const result = await consumeStream(unmaskedStream);

    expect(result).toContain("message_delta");
    expect(result).toContain("end_turn");
  });

  test("preserves event type lines", async () => {
    const context = createMaskingContext();

    const sseData = createTextDelta("Hello world");
    const source = createSSEStream([sseData]);

    const unmaskedStream = createAnthropicUnmaskingStream(source, context, defaultConfig);
    const result = await consumeStream(unmaskedStream);

    expect(result).toContain("event: content_block_delta");
  });

  test("handles undefined pii context", async () => {
    const sseData = createTextDelta("Plain text without placeholders");
    const source = createSSEStream([sseData]);

    const unmaskedStream = createAnthropicUnmaskingStream(source, undefined, defaultConfig);
    const result = await consumeStream(unmaskedStream);

    expect(result).toContain("Plain text without placeholders");
  });

  describe("onUsage callback", () => {
    test("extracts input tokens from message_start", async () => {
      const messageStart = createAnthropicEvent("message_start", {
        type: "message_start",
        message: {
          id: "msg_123",
          usage: { input_tokens: 150, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
        },
      });
      const source = createSSEStream([messageStart]);

      let captured: unknown = null;
      const onUsage = (tokens: unknown) => { captured = tokens; };

      const stream = createAnthropicUnmaskingStream(source, undefined, defaultConfig, undefined, onUsage);
      await consumeStream(stream);

      expect(captured).toEqual({ promptTokens: 150, completionTokens: 0, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 });
    });

    test("extracts output tokens from message_delta", async () => {
      const messageDelta = createAnthropicEvent("message_delta", {
        type: "message_delta",
        delta: { stop_reason: "end_turn" },
        usage: { output_tokens: 75 },
      });
      const source = createSSEStream([messageDelta]);

      let captured: unknown = null;
      const onUsage = (tokens: unknown) => { captured = tokens; };

      const stream = createAnthropicUnmaskingStream(source, undefined, defaultConfig, undefined, onUsage);
      await consumeStream(stream);

      expect(captured).toEqual({ promptTokens: 0, completionTokens: 75 });
    });

    test("accumulates both input and output tokens across events", async () => {
      const messageStart = createAnthropicEvent("message_start", {
        type: "message_start",
        message: { id: "msg_1", usage: { input_tokens: 200 } },
      });
      const textDelta = createTextDelta("Hello");
      const messageDelta = createAnthropicEvent("message_delta", {
        type: "message_delta",
        delta: { stop_reason: "end_turn" },
        usage: { output_tokens: 50 },
      });
      const source = createSSEStream([messageStart, textDelta, messageDelta]);

      let captured: unknown = null;
      const onUsage = (tokens: unknown) => { captured = tokens; };

      const stream = createAnthropicUnmaskingStream(source, undefined, defaultConfig, undefined, onUsage);
      await consumeStream(stream);

      expect(captured).toMatchObject({ promptTokens: 200, completionTokens: 50 });
    });

    test("extracts cache tokens from message_start", async () => {
      const messageStart = createAnthropicEvent("message_start", {
        type: "message_start",
        message: {
          id: "msg_2",
          usage: {
            input_tokens: 100,
            cache_creation_input_tokens: 5000,
            cache_read_input_tokens: 95000,
          },
        },
      });
      const source = createSSEStream([messageStart]);

      let captured: unknown = null;
      const onUsage = (tokens: unknown) => { captured = tokens; };

      const stream = createAnthropicUnmaskingStream(source, undefined, defaultConfig, undefined, onUsage);
      await consumeStream(stream);

      expect(captured).toMatchObject({
        promptTokens: 100,
        cacheCreationInputTokens: 5000,
        cacheReadInputTokens: 95000,
      });
    });

    test("does not call onUsage when no token events seen", async () => {
      const ping = createAnthropicEvent("ping", { type: "ping" });
      const source = createSSEStream([ping]);

      let called = false;
      const onUsage = () => { called = true; };

      const stream = createAnthropicUnmaskingStream(source, undefined, defaultConfig, undefined, onUsage);
      await consumeStream(stream);

      expect(called).toBe(false);
    });

    test("still passes through all events when onUsage is set", async () => {
      const messageStart = createAnthropicEvent("message_start", {
        type: "message_start",
        message: { id: "msg_3", usage: { input_tokens: 10 } },
      });
      const textDelta = createTextDelta("Hi");
      const messageDelta = createAnthropicEvent("message_delta", {
        type: "message_delta",
        delta: { stop_reason: "end_turn" },
        usage: { output_tokens: 5 },
      });
      const source = createSSEStream([messageStart, textDelta, messageDelta]);

      const stream = createAnthropicUnmaskingStream(source, undefined, defaultConfig, undefined, () => {});
      const result = await consumeStream(stream);

      expect(result).toContain("message_start");
      expect(result).toContain("text_delta");
      expect(result).toContain("message_delta");
    });
  });

  test("handles multiple consecutive text deltas", async () => {
    const context = createMaskingContext();
    context.mapping["[[PERSON_1]]"] = "Jane";

    const chunks = [
      createTextDelta("Hello "),
      createTextDelta("[[PERSON_1]]"),
      createTextDelta("! How are you?"),
    ];
    const source = createSSEStream(chunks);

    const unmaskedStream = createAnthropicUnmaskingStream(source, context, defaultConfig);
    const result = await consumeStream(unmaskedStream);

    expect(result).toContain("Jane");
    expect(result).toContain("How are you?");
  });
});

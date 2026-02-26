import { describe, expect, test } from "bun:test";
import type { PlaceholderContext } from "../../masking/context";
import type {
  CopilotCompletionRequest,
  CopilotCompletionResponse,
} from "../../providers/copilot/types";
import { codexExtractor } from "./codex";

function makeRequest(prompt: string, suffix?: string): CopilotCompletionRequest {
  return { prompt, suffix };
}

function makeResponse(choices: { text: string }[]): CopilotCompletionResponse {
  return {
    id: "test-id",
    object: "text_completion",
    created: 123456,
    model: "copilot-codex",
    choices: choices.map((c, i) => ({ text: c.text, index: i, finish_reason: "stop" })),
  };
}

describe("Codex Extractor", () => {
  describe("extractTexts", () => {
    test("extracts prompt only", () => {
      const request = makeRequest("function hello() {");
      const spans = codexExtractor.extractTexts(request);

      expect(spans).toHaveLength(1);
      expect(spans[0]).toEqual({
        text: "function hello() {",
        path: "prompt",
        messageIndex: 0,
        partIndex: 0,
        role: "user",
      });
    });

    test("extracts both prompt and suffix", () => {
      const request = makeRequest("const email = 'john@example.com';\n", "\nconsole.log(email);");
      const spans = codexExtractor.extractTexts(request);

      expect(spans).toHaveLength(2);
      expect(spans[0]).toEqual({
        text: "const email = 'john@example.com';\n",
        path: "prompt",
        messageIndex: 0,
        partIndex: 0,
        role: "user",
      });
      expect(spans[1]).toEqual({
        text: "\nconsole.log(email);",
        path: "suffix",
        messageIndex: 0,
        partIndex: 1,
        role: "user",
      });
    });

    test("skips empty prompt", () => {
      const request = makeRequest("", "suffix text");
      const spans = codexExtractor.extractTexts(request);

      expect(spans).toHaveLength(1);
      expect(spans[0].path).toBe("suffix");
    });

    test("skips missing suffix", () => {
      const request = makeRequest("prompt text");
      const spans = codexExtractor.extractTexts(request);

      expect(spans).toHaveLength(1);
      expect(spans[0].path).toBe("prompt");
    });

    test("both spans use messageIndex 0", () => {
      const request = makeRequest("prompt", "suffix");
      const spans = codexExtractor.extractTexts(request);

      expect(spans[0].messageIndex).toBe(0);
      expect(spans[1].messageIndex).toBe(0);
      expect(spans[0].partIndex).toBe(0);
      expect(spans[1].partIndex).toBe(1);
    });
  });

  describe("applyMasked", () => {
    test("applies masked text to prompt", () => {
      const request = makeRequest("const email = 'john@example.com';");
      const maskedSpans = [
        {
          path: "prompt",
          maskedText: "const email = '[[EMAIL_ADDRESS_1]]';",
          messageIndex: 0,
          partIndex: 0,
        },
      ];

      const result = codexExtractor.applyMasked(request, maskedSpans);

      expect(result.prompt).toBe("const email = '[[EMAIL_ADDRESS_1]]';");
    });

    test("applies masked text to suffix", () => {
      const request = makeRequest("// before\n", "// after: john@example.com");
      const maskedSpans = [
        {
          path: "suffix",
          maskedText: "// after: [[EMAIL_ADDRESS_1]]",
          messageIndex: 0,
          partIndex: 1,
        },
      ];

      const result = codexExtractor.applyMasked(request, maskedSpans);

      expect(result.prompt).toBe("// before\n"); // unchanged
      expect(result.suffix).toBe("// after: [[EMAIL_ADDRESS_1]]");
    });

    test("applies masked text to both prompt and suffix", () => {
      const request = makeRequest("email = 'john@example.com'", "# john@example.com");
      const maskedSpans = [
        {
          path: "prompt",
          maskedText: "email = '[[EMAIL_ADDRESS_1]]'",
          messageIndex: 0,
          partIndex: 0,
        },
        {
          path: "suffix",
          maskedText: "# [[EMAIL_ADDRESS_1]]",
          messageIndex: 0,
          partIndex: 1,
        },
      ];

      const result = codexExtractor.applyMasked(request, maskedSpans);

      expect(result.prompt).toBe("email = '[[EMAIL_ADDRESS_1]]'");
      expect(result.suffix).toBe("# [[EMAIL_ADDRESS_1]]");
    });

    test("preserves non-text fields", () => {
      const request = { prompt: "test", suffix: "end", max_tokens: 50, temperature: 0.2 };
      const maskedSpans = [{ path: "prompt", maskedText: "masked", messageIndex: 0, partIndex: 0 }];

      const result = codexExtractor.applyMasked(request, maskedSpans);

      expect(result.max_tokens).toBe(50);
      expect(result.temperature).toBe(0.2);
    });
  });

  describe("unmaskResponse", () => {
    test("unmasks placeholders in choice text", () => {
      const response = makeResponse([{ text: "return '[[EMAIL_ADDRESS_1]]';" }]);
      const context: PlaceholderContext = {
        mapping: { "[[EMAIL_ADDRESS_1]]": "john@example.com" },
        reverseMapping: { "john@example.com": "[[EMAIL_ADDRESS_1]]" },
        counters: { EMAIL_ADDRESS: 1 },
      };

      const result = codexExtractor.unmaskResponse(response, context);

      expect(result.choices[0].text).toBe("return 'john@example.com';");
    });

    test("handles multiple choices", () => {
      const response = makeResponse([
        { text: "const name = '[[PERSON_1]]';" },
        { text: "let name = '[[PERSON_1]]';" },
      ]);
      const context: PlaceholderContext = {
        mapping: { "[[PERSON_1]]": "John" },
        reverseMapping: { John: "[[PERSON_1]]" },
        counters: { PERSON: 1 },
      };

      const result = codexExtractor.unmaskResponse(response, context);

      expect(result.choices[0].text).toBe("const name = 'John';");
      expect(result.choices[1].text).toBe("let name = 'John';");
    });

    test("applies formatValue when provided", () => {
      const response = makeResponse([{ text: "// [[PERSON_1]]" }]);
      const context: PlaceholderContext = {
        mapping: { "[[PERSON_1]]": "John" },
        reverseMapping: { John: "[[PERSON_1]]" },
        counters: { PERSON: 1 },
      };

      const result = codexExtractor.unmaskResponse(
        response,
        context,
        (val) => `[protected:${val}]`,
      );

      expect(result.choices[0].text).toBe("// [protected:John]");
    });

    test("preserves response metadata", () => {
      const response = makeResponse([{ text: "completion" }]);
      const context: PlaceholderContext = {
        mapping: {},
        reverseMapping: {},
        counters: {},
      };

      const result = codexExtractor.unmaskResponse(response, context);

      expect(result.id).toBe("test-id");
      expect(result.model).toBe("copilot-codex");
      expect(result.choices[0].index).toBe(0);
      expect(result.choices[0].finish_reason).toBe("stop");
    });
  });
});

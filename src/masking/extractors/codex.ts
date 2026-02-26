/**
 * Codex (Copilot inline completions) request extractor
 *
 * Handles the legacy OpenAI Completions format used by GitHub Copilot
 * for inline (ghost-text) code suggestions.
 *
 * The format uses two text fields instead of a messages array:
 * - prompt: code context before the cursor (prefix)
 * - suffix: code context after the cursor
 *
 * Both fields can contain sensitive data (API keys, PII in comments/strings).
 */

import { type PlaceholderContext, restorePlaceholders } from "../../masking/context";
import type {
  CopilotCompletionRequest,
  CopilotCompletionResponse,
} from "../../providers/copilot/types";
import type { MaskedSpan, RequestExtractor, TextSpan } from "../types";

/**
 * Codex request extractor for GitHub Copilot inline completions
 *
 * Assigns:
 * - prompt → messageIndex: 0, partIndex: 0
 * - suffix → messageIndex: 0, partIndex: 1
 */
export const codexExtractor: RequestExtractor<CopilotCompletionRequest, CopilotCompletionResponse> =
  {
    extractTexts(request: CopilotCompletionRequest): TextSpan[] {
      const spans: TextSpan[] = [];

      if (request.prompt) {
        spans.push({
          text: request.prompt,
          path: "prompt",
          messageIndex: 0,
          partIndex: 0,
          role: "user",
        });
      }

      if (request.suffix) {
        spans.push({
          text: request.suffix,
          path: "suffix",
          messageIndex: 0,
          partIndex: 1,
          role: "user",
        });
      }

      return spans;
    },

    applyMasked(
      request: CopilotCompletionRequest,
      maskedSpans: MaskedSpan[],
    ): CopilotCompletionRequest {
      let result = { ...request };

      for (const span of maskedSpans) {
        if (span.path === "prompt") {
          result = { ...result, prompt: span.maskedText };
        } else if (span.path === "suffix") {
          result = { ...result, suffix: span.maskedText };
        }
      }

      return result;
    },

    unmaskResponse(
      response: CopilotCompletionResponse,
      context: PlaceholderContext,
      formatValue?: (original: string) => string,
    ): CopilotCompletionResponse {
      return {
        ...response,
        choices: response.choices.map((choice) => ({
          ...choice,
          text: restorePlaceholders(choice.text, context, formatValue),
        })),
      };
    },
  };

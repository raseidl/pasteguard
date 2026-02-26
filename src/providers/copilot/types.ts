/**
 * GitHub Copilot API Types
 *
 * Copilot uses two distinct API formats:
 * 1. Chat completions (/chat/completions) - identical to OpenAI Chat format, reuses OpenAI types
 * 2. Inline completions (/v1/engines/:engine/completions) - legacy OpenAI Completions format
 */

import { z } from "zod";

/**
 * Copilot inline completion request (legacy OpenAI Completions format)
 *
 * Used by the IDE plugin for ghost-text suggestions.
 * Contains the code prefix (prompt) and suffix around the cursor.
 */
export const CopilotCompletionRequestSchema = z
  .object({
    prompt: z.string(),
    suffix: z.string().optional(),
    max_tokens: z.number().optional(),
    temperature: z.number().optional(),
    top_p: z.number().optional(),
    n: z.number().optional(),
    stream: z.boolean().optional(),
    stop: z.union([z.string(), z.array(z.string())]).optional(),
    model: z.string().optional(),
  })
  .passthrough();

/**
 * Copilot inline completion response
 */
export const CopilotCompletionResponseSchema = z.object({
  id: z.string(),
  object: z.string(),
  created: z.number(),
  model: z.string().optional(),
  choices: z.array(
    z.object({
      text: z.string(),
      index: z.number(),
      finish_reason: z.string().nullable(),
    }),
  ),
  usage: z
    .object({
      prompt_tokens: z.number(),
      completion_tokens: z.number(),
      total_tokens: z.number(),
    })
    .optional(),
});

export type CopilotCompletionRequest = z.infer<typeof CopilotCompletionRequestSchema>;
export type CopilotCompletionResponse = z.infer<typeof CopilotCompletionResponseSchema>;

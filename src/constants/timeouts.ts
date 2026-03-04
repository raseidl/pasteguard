/** Default timeout for provider API calls. Prefer config.server.provider_timeout_ms when available.
 *  Matches the Anthropic SDK default of 10 minutes — extended thinking can take
 *  several minutes before the first byte arrives. */
export const DEFAULT_PROVIDER_TIMEOUT_MS = 600_000;
export const HEALTH_CHECK_TIMEOUT_MS = 5_000;

/**
 * Creates a fetch-compatible AbortSignal that only applies to TTFB (time to first byte).
 *
 * Unlike AbortSignal.timeout(), this signal can be cleared after the response
 * headers arrive so it won't abort mid-stream. This is critical for LLM
 * streaming where responses routinely exceed the TTFB timeout.
 *
 * Usage:
 *   const { signal, clear } = createTTFBTimeout(timeoutMs);
 *   const response = await fetch(url, { signal });
 *   clear(); // headers received — stop the timer so streaming isn't interrupted
 */
export function createTTFBTimeout(ms: number): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("The operation timed out.")), ms);
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timer),
  };
}

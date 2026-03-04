/**
 * In-flight request tracker
 *
 * Tracks the number of requests currently being processed and when the oldest
 * one started. Incremented at request start, decremented when logRequest() is
 * called (which covers all exit paths: success, error, blocked).
 *
 * For streaming requests, the counter decrements at TTFT (when the stream
 * is handed back to the client) rather than at stream completion. This still
 * accurately captures the critical processing phase: PII scan + provider TTFT.
 */

// FIFO queue of start timestamps for each in-flight request.
// The head (index 0) is always the oldest active request.
const activeTimestamps: number[] = [];

export function incrementActive(): void {
  activeTimestamps.push(Date.now());
}

export function decrementActive(): void {
  activeTimestamps.shift();
}

export function getActiveCount(): number {
  return activeTimestamps.length;
}

/** Returns ms elapsed since the oldest in-flight request started, or 0 if none. */
export function getOldestActiveMs(): number {
  if (activeTimestamps.length === 0) return 0;
  return Date.now() - (activeTimestamps[0] as number);
}

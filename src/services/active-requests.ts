/**
 * In-flight request tracker with phase awareness
 *
 * Tracks the number of requests currently being processed, what phase each
 * is in, and when the oldest one started.  Incremented at request start,
 * decremented when logRequest() is called (which covers all exit paths:
 * success, error, blocked).
 *
 * Phases:
 *   scanning  – PII detection (Presidio call)
 *   provider  – waiting for upstream provider response / TTFT
 *   streaming – stream handed to client, provider still sending
 */

export type RequestPhase = "scanning" | "provider" | "streaming";

interface ActiveRequest {
  startedAt: number;
  phase: RequestPhase;
}

const activeRequests = new Map<number, ActiveRequest>();
let nextId = 0;

/** Start tracking a new request.  Returns a unique ID for later updates. */
export function incrementActive(phase: RequestPhase = "scanning"): number {
  const id = ++nextId;
  activeRequests.set(id, { startedAt: Date.now(), phase });
  return id;
}

/** Update the phase of an in-flight request. */
export function setPhase(id: number, phase: RequestPhase): void {
  const req = activeRequests.get(id);
  if (req) req.phase = phase;
}

/** Stop tracking a request (by ID, or remove the oldest entry if no ID). */
export function decrementActive(id?: number): void {
  if (id !== undefined) {
    activeRequests.delete(id);
  } else {
    // Fallback: remove oldest (first inserted) — keeps backward compat
    const first = activeRequests.keys().next();
    if (!first.done) activeRequests.delete(first.value);
  }
}

export function getActiveCount(): number {
  return activeRequests.size;
}

/** Returns ms elapsed since the oldest in-flight request started, or 0 if none. */
export function getOldestActiveMs(): number {
  if (activeRequests.size === 0) return 0;
  let oldest = Infinity;
  for (const req of activeRequests.values()) {
    oldest = Math.min(oldest, req.startedAt);
  }
  return Date.now() - oldest;
}

/** Returns count of active requests per phase. */
export function getActivePhases(): Record<RequestPhase, number> {
  const counts: Record<RequestPhase, number> = { scanning: 0, provider: 0, streaming: 0 };
  for (const req of activeRequests.values()) {
    counts[req.phase]++;
  }
  return counts;
}

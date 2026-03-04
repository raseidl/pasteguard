import { describe, expect, test } from "bun:test";
import {
  decrementActive,
  getActiveCount,
  getActivePhases,
  getOldestActiveMs,
  incrementActive,
  setPhase,
} from "./active-requests";

// Note: active-requests uses module-level state. Each test creates its own
// IDs and cleans them up via cleanup() so other tests are not disturbed.

function cleanup(...ids: number[]) {
  for (const id of ids) {
    decrementActive(id);
  }
}

describe("active-requests", () => {
  describe("incrementActive()", () => {
    test("returns a positive integer ID", () => {
      const id = incrementActive();
      expect(id).toBeGreaterThan(0);
      cleanup(id);
    });

    test("returns strictly increasing IDs on successive calls", () => {
      const id1 = incrementActive();
      const id2 = incrementActive();
      expect(id2).toBeGreaterThan(id1);
      cleanup(id1, id2);
    });

    test("defaults to the 'scanning' phase", () => {
      const before = getActivePhases();
      const id = incrementActive(); // no phase arg
      const after = getActivePhases();
      expect(after.scanning).toBe(before.scanning + 1);
      cleanup(id);
    });

    test("accepts explicit 'provider' phase", () => {
      const before = getActivePhases();
      const id = incrementActive("provider");
      const after = getActivePhases();
      expect(after.provider).toBe(before.provider + 1);
      cleanup(id);
    });

    test("accepts explicit 'streaming' phase", () => {
      const before = getActivePhases();
      const id = incrementActive("streaming");
      const after = getActivePhases();
      expect(after.streaming).toBe(before.streaming + 1);
      cleanup(id);
    });

    test("increments the active count by one", () => {
      const before = getActiveCount();
      const id = incrementActive();
      expect(getActiveCount()).toBe(before + 1);
      cleanup(id);
    });
  });

  describe("setPhase()", () => {
    test("updates phase from scanning to provider", () => {
      const id = incrementActive("scanning");
      const before = getActivePhases();
      setPhase(id, "provider");
      const after = getActivePhases();
      expect(after.scanning).toBe(before.scanning - 1);
      expect(after.provider).toBe(before.provider + 1);
      cleanup(id);
    });

    test("updates phase from provider to streaming", () => {
      const id = incrementActive("provider");
      const before = getActivePhases();
      setPhase(id, "streaming");
      const after = getActivePhases();
      expect(after.provider).toBe(before.provider - 1);
      expect(after.streaming).toBe(before.streaming + 1);
      cleanup(id);
    });

    test("does not throw for an unknown ID", () => {
      expect(() => setPhase(999999, "provider")).not.toThrow();
    });

    test("does not change the active count for an unknown ID", () => {
      const before = getActiveCount();
      setPhase(999999, "provider");
      expect(getActiveCount()).toBe(before);
    });
  });

  describe("decrementActive()", () => {
    test("removes a specific request by ID", () => {
      const id = incrementActive();
      const before = getActiveCount();
      decrementActive(id);
      expect(getActiveCount()).toBe(before - 1);
    });

    test("does not affect the count for an unknown ID", () => {
      const before = getActiveCount();
      decrementActive(999998);
      expect(getActiveCount()).toBe(before);
    });

    test("removes the oldest (first inserted) entry when called without an ID", () => {
      const _id1 = incrementActive("scanning");
      const id2 = incrementActive("provider");
      const before = getActiveCount();

      decrementActive(); // removes id1 (oldest)

      expect(getActiveCount()).toBe(before - 1);

      // id2 should still be tracked — phase change should be visible
      const beforePhase = getActivePhases();
      setPhase(id2, "streaming");
      const afterPhase = getActivePhases();
      expect(afterPhase.provider).toBe(beforePhase.provider - 1);
      expect(afterPhase.streaming).toBe(beforePhase.streaming + 1);

      cleanup(id2);
    });

    test("does not throw when called without ID on an empty map", () => {
      // Drain any entries we own, then verify no-ID call is safe
      const ids = [incrementActive(), incrementActive()];
      for (const id of ids) decrementActive(id);

      // The map may or may not be empty globally; either way, no throw
      expect(() => decrementActive()).not.toThrow();
    });
  });

  describe("getActiveCount()", () => {
    test("increases after incrementActive and decreases after decrementActive", () => {
      const before = getActiveCount();
      const id = incrementActive();
      expect(getActiveCount()).toBe(before + 1);
      decrementActive(id);
      expect(getActiveCount()).toBe(before);
    });

    test("is stable when no entries are added or removed", () => {
      const count1 = getActiveCount();
      const count2 = getActiveCount();
      expect(count1).toBe(count2);
    });
  });

  describe("getOldestActiveMs()", () => {
    test("returns 0 when no active requests exist", () => {
      // Only testable when we can guarantee the map is empty.
      // Snapshot count; if zero, verify 0 is returned.
      if (getActiveCount() === 0) {
        expect(getOldestActiveMs()).toBe(0);
      } else {
        // Can't control global state — just verify it's non-negative
        expect(getOldestActiveMs()).toBeGreaterThanOrEqual(0);
      }
    });

    test("returns elapsed ms greater than 0 for an active request", async () => {
      const id = incrementActive();
      await new Promise((resolve) => setTimeout(resolve, 15));
      const ms = getOldestActiveMs();
      expect(ms).toBeGreaterThan(0);
      cleanup(id);
    });

    test("returns 0 after all owned requests are removed (isolated empty case)", () => {
      // Only valid if we are the sole owner of entries
      if (getActiveCount() === 0) {
        const id = incrementActive();
        expect(getOldestActiveMs()).toBeGreaterThanOrEqual(0);
        decrementActive(id);
        expect(getOldestActiveMs()).toBe(0);
      }
    });
  });

  describe("getActivePhases()", () => {
    test("returns an object with scanning, provider, and streaming keys", () => {
      const phases = getActivePhases();
      expect(typeof phases.scanning).toBe("number");
      expect(typeof phases.provider).toBe("number");
      expect(typeof phases.streaming).toBe("number");
    });

    test("all phase counts are non-negative integers", () => {
      const phases = getActivePhases();
      expect(phases.scanning).toBeGreaterThanOrEqual(0);
      expect(phases.provider).toBeGreaterThanOrEqual(0);
      expect(phases.streaming).toBeGreaterThanOrEqual(0);
    });

    test("sum of all phase counts equals getActiveCount()", () => {
      const id1 = incrementActive("scanning");
      const id2 = incrementActive("provider");
      const id3 = incrementActive("streaming");
      const phases = getActivePhases();
      const count = getActiveCount();
      expect(phases.scanning + phases.provider + phases.streaming).toBe(count);
      cleanup(id1, id2, id3);
    });

    test("reflects correct distribution when multiple requests are added", () => {
      const id1 = incrementActive("scanning");
      const id2 = incrementActive("scanning");
      const id3 = incrementActive("provider");
      const id4 = incrementActive("streaming");

      const phases = getActivePhases();
      expect(phases.scanning).toBeGreaterThanOrEqual(2);
      expect(phases.provider).toBeGreaterThanOrEqual(1);
      expect(phases.streaming).toBeGreaterThanOrEqual(1);

      cleanup(id1, id2, id3, id4);
    });

    test("correctly accounts for phase changes via setPhase", () => {
      const id = incrementActive("scanning");
      const before = getActivePhases();
      setPhase(id, "provider");
      const after = getActivePhases();
      expect(after.scanning).toBe(before.scanning - 1);
      expect(after.provider).toBe(before.provider + 1);
      cleanup(id);
    });
  });
});

import { mock } from "bun:test";

mock.module("../config", () => ({
  getConfig: () => ({
    mode: "mask",
    providers: {
      openai: { base_url: "https://api.openai.com/v1" },
      anthropic: { base_url: "https://api.anthropic.com" },
    },
    pii_detection: {
      languages: ["en"],
      fallback_language: "en",
      score_threshold: 0.7,
      entities: ["EMAIL_ADDRESS", "PERSON"],
    },
    masking: { show_markers: false },
    local: null,
  }),
}));

mock.module("../pii/detect", () => ({
  getPIIDetector: () => ({
    getLanguageValidation: () => null,
  }),
}));

import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { infoRoutes } from "./info";

const app = new Hono();
app.route("/", infoRoutes);

describe("GET /info", () => {
  test("returns 200 with app info", async () => {
    const res = await app.request("/info");

    expect(res.status).toBe(200);

    const body = (await res.json()) as Record<string, unknown>;
    expect(body.name).toBe("PasteGuard");
    expect(body.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(body.mode).toBeDefined();
    expect(body.providers).toBeDefined();
    expect(body.pii_detection).toBeDefined();
  });

  test("returns correct content-type", async () => {
    const res = await app.request("/info");

    expect(res.headers.get("content-type")).toContain("application/json");
  });
});

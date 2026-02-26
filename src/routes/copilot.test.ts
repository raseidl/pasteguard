import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { copilotRoutes } from "./copilot";

const app = new Hono();
app.route("/copilot", copilotRoutes);

describe("POST /copilot/chat/completions", () => {
  test("returns 400 for missing messages", async () => {
    const res = await app.request("/copilot/chat/completions", {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { type: string } };
    expect(body.error.type).toBe("invalid_request_error");
  });

  test("returns 400 for empty messages array", async () => {
    const res = await app.request("/copilot/chat/completions", {
      method: "POST",
      body: JSON.stringify({ messages: [] }),
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { type: string } };
    expect(body.error.type).toBe("invalid_request_error");
  });

  test("returns 400 for invalid message role", async () => {
    const res = await app.request("/copilot/chat/completions", {
      method: "POST",
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [{ role: "invalid_role", content: "test" }],
      }),
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(400);
  });
});

describe("POST /copilot/v1/engines/:engine/completions", () => {
  test("returns 400 for missing prompt", async () => {
    const res = await app.request("/copilot/v1/engines/copilot-codex/completions", {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { type: string } };
    expect(body.error.type).toBe("invalid_request_error");
  });

  test("returns 400 for non-string prompt", async () => {
    const res = await app.request("/copilot/v1/engines/copilot-codex/completions", {
      method: "POST",
      body: JSON.stringify({ prompt: 42 }),
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(400);
  });

  test("returns 400 when copilot provider not configured", async () => {
    const res = await app.request("/copilot/v1/engines/copilot-codex/completions", {
      method: "POST",
      body: JSON.stringify({ prompt: "function hello() {" }),
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { type: string; message: string } };
    expect(body.error.type).toBe("server_error");
    expect(body.error.message).toContain("Copilot provider not configured");
  });
});

describe("POST /copilot/chat/completions — provider not configured", () => {
  test("returns 400 when copilot provider not configured", async () => {
    const res = await app.request("/copilot/chat/completions", {
      method: "POST",
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [{ role: "user", content: "Hello" }],
      }),
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { type: string; message: string } };
    expect(body.error.type).toBe("server_error");
    expect(body.error.message).toContain("Copilot provider not configured");
  });
});

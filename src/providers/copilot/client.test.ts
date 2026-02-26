import { describe, expect, test } from "bun:test";
import { collectCopilotHeaders } from "./client";

describe("collectCopilotHeaders", () => {
  test("always includes Content-Type", () => {
    const headers = collectCopilotHeaders({});
    expect(headers["Content-Type"]).toBe("application/json");
  });

  test("forwards authorization header", () => {
    const headers = collectCopilotHeaders({ authorization: "Bearer token123" });
    expect(headers["authorization"]).toBe("Bearer token123");
  });

  test("forwards editor-version header", () => {
    const headers = collectCopilotHeaders({ "editor-version": "vscode/1.85.0" });
    expect(headers["editor-version"]).toBe("vscode/1.85.0");
  });

  test("forwards all allowed headers when present", () => {
    const incoming = {
      authorization: "Bearer tok",
      "editor-version": "vscode/1.85.0",
      "editor-plugin-version": "copilot/1.x",
      "copilot-integration-id": "vscode-copilot",
      "user-agent": "GitHubCopilotChat/0.11.0",
      "openai-intent": "conversation-panel",
      "openai-organization": "org-123",
      "x-request-id": "req-abc",
      "vscode-sessionid": "session-xyz",
      "vscode-machineid": "machine-456",
    };
    const headers = collectCopilotHeaders(incoming);

    expect(headers["authorization"]).toBe("Bearer tok");
    expect(headers["editor-version"]).toBe("vscode/1.85.0");
    expect(headers["editor-plugin-version"]).toBe("copilot/1.x");
    expect(headers["copilot-integration-id"]).toBe("vscode-copilot");
    expect(headers["user-agent"]).toBe("GitHubCopilotChat/0.11.0");
    expect(headers["openai-intent"]).toBe("conversation-panel");
    expect(headers["openai-organization"]).toBe("org-123");
    expect(headers["x-request-id"]).toBe("req-abc");
    expect(headers["vscode-sessionid"]).toBe("session-xyz");
    expect(headers["vscode-machineid"]).toBe("machine-456");
  });

  test("drops headers not in the allowlist", () => {
    const headers = collectCopilotHeaders({
      authorization: "Bearer tok",
      "x-custom-header": "secret-value",
      cookie: "session=abc",
      "proxy-authorization": "Basic creds",
    });

    expect(headers["x-custom-header"]).toBeUndefined();
    expect(headers["cookie"]).toBeUndefined();
    expect(headers["proxy-authorization"]).toBeUndefined();
    expect(headers["authorization"]).toBe("Bearer tok");
  });

  test("omits allowed headers that are not present", () => {
    const headers = collectCopilotHeaders({ authorization: "Bearer tok" });

    expect(Object.keys(headers)).toEqual(["Content-Type", "authorization"]);
  });

  test("returns only Content-Type when no matching headers provided", () => {
    const headers = collectCopilotHeaders({ "x-unrelated": "value" });

    expect(Object.keys(headers)).toEqual(["Content-Type"]);
  });

  test("does not include undefined values", () => {
    const headers = collectCopilotHeaders({ authorization: undefined });

    expect(headers["authorization"]).toBeUndefined();
  });
});

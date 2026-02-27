# Changelog

All notable changes to this fork are documented here.
This fork is based on [sgasser/pasteguard](https://github.com/sgasser/pasteguard) at upstream `v0.3.2`.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased] — v0.3.2-fork.3

### Added
- **Token metrics on dashboard** — input tokens, output tokens, total tokens, cache hit rate, and token anomaly detection (alert when last-hour average exceeds 2× 7-day rolling avg). Tokens are captured from streaming and non-streaming responses for both OpenAI and Anthropic.
- **Metric tooltips** — info icon on every dashboard stat card shows a short explanation on hover.
- **Docker Compose setup docs** in README (production, development, EU languages, custom language builds).

### Fixed
- **Masked content not logged when secrets detected** — `log_masked_content` config option was never checked by the OpenAI and Anthropic routes. Additionally, an overly broad guard (`!data.secretsDetected`) suppressed dashboard content previews whenever any secret was found — even though `maskedContent` is already fully masked (secrets and PII replaced with placeholders before it is set). The guard protected SQLite storage but not the outbound API call, making it a false safety boundary. Removed the guard and wired up the config option so `log_masked_content: true/false` controls dashboard previews as documented.

### Changed
- **Docker Compose images** — switched from upstream `ghcr.io/sgasser/pasteguard` to fork `ghcr.io/raseidl/pasteguard`.
- **README** — moved Fork Changes details into CHANGELOG.md; README now links here.

---

## [v0.3.2-fork.2.1] — 2026-02-27

### Fixed
- **Anthropic prompt caching broken** — Zod schemas stripped `cache_control` fields from nested request objects (messages, system blocks, tools), silently disabling Anthropic's prompt caching and inflating token costs. Fixed by adding `.passthrough()` to all affected nested schemas. Upstream: [PR #74](https://github.com/sgasser/pasteguard/pull/74).

---

## [v0.3.2-fork.2] — 2026-02-26

### Changed
- **Copilot docs** — clarified that IntelliJ/JetBrains IDEs are not supported (JetBrains HTTP Proxy setting uses forward proxy protocol; PasteGuard is a reverse proxy). VS Code is required for Copilot integration.

---

## [v0.3.2-fork.1] — 2026-02-26

### Added
- **GitHub Copilot proxy** — new `/copilot` route intercepts VS Code Copilot requests. Masks PII and secrets in Copilot Chat (`/chat/completions`) and inline ghost-text completions (`/v1/engines/:engine/completions`) before they reach GitHub's servers.

### Changed
- **CORS restricted to localhost** — changed from `*` (all origins) to localhost-only.
- **Header allowlists** — wildcard proxy routes for OpenAI and Anthropic now forward only provider-required headers instead of all client headers.

### Performance
- SQLite WAL mode + `PRAGMA synchronous = NORMAL` for reduced write latency.
- Cached prepared INSERT statement reused across requests.
- Shared `TextEncoder` instance to avoid per-request allocations.
- Skip-parse optimization for SSE stream chunks without text content.
- `replaceAll` in `restorePlaceholders` for faster bulk substitution.

---

## Upstream base: [v0.3.2](https://github.com/sgasser/pasteguard/releases/tag/v0.3.2)

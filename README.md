<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/wordmark-dark.svg">
    <source media="(prefers-color-scheme: light)" srcset="assets/wordmark-light.svg">
    <img src="assets/wordmark-light.svg" width="220" height="44" alt="PasteGuard">
  </picture>
</p>

> **This is a fork of [sgasser/pasteguard](https://github.com/sgasser/pasteguard).**
> See the [upstream repository](https://github.com/sgasser/pasteguard) for the original project.

<p align="center">
  <a href="https://github.com/raseidl/pasteguard/actions/workflows/ci.yml"><img src="https://github.com/raseidl/pasteguard/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-Apache%202.0-blue.svg" alt="License"></a>
  <a href="https://github.com/sgasser/pasteguard/releases"><img src="https://img.shields.io/github/v/release/sgasser/pasteguard" alt="Upstream Release"></a>
</p>

<p align="center">
  <strong>AI gets the context. Not your secrets.</strong><br>
  Automatically hides names, emails, and API keys before you send prompts to AI.
</p>

<p align="center">
  <a href="#quick-start"><strong>Quick Start</strong></a> ·
  <a href="#chat"><strong>Chat</strong></a> ·
  <a href="#coding-tools"><strong>Coding Tools</strong></a> ·
  <a href="https://pasteguard.com/docs"><strong>Documentation</strong></a>
</p>

<br/>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/comparison-dark.png">
  <source media="(prefers-color-scheme: light)" srcset="assets/comparison.png">
  <img src="assets/comparison.png" width="100%" alt="PasteGuard — Without vs. With: masks names, emails, and API keys before they reach AI">
</picture>

<p align="center">
  Detects 30+ types of sensitive data across 24 languages.<br>
  Your data never leaves your machine.
</p>

## Works Everywhere

**[Chat](https://pasteguard.com/docs/use-cases/chat)** — Masks PII and secrets when you paste into ChatGPT, Claude, and Gemini. You see originals, AI sees placeholders.

**[Apps](https://pasteguard.com/docs/use-cases/apps)** — Open WebUI, LibreChat, or any self-hosted AI setup. Optionally routes sensitive requests to a local model.

**[Coding Tools](https://pasteguard.com/docs/use-cases/coding-tools)** — Cursor, Claude Code, Copilot, Windsurf — your codebase context flows to the provider. PasteGuard masks secrets and PII before they leave.

**[API Integration](https://pasteguard.com/docs/use-cases/api-integration)** — Sits between your code and OpenAI or Anthropic. Change one URL, your users' data stays protected.

## Quick Start

Run PasteGuard as a local proxy:

```bash
docker run --rm -p 3000:3000 ghcr.io/raseidl/pasteguard:en
```

Point your tools or app to PasteGuard instead of the provider:

| API | PasteGuard URL | Original URL |
|----------|----------------|--------------|
| OpenAI | `http://localhost:3000/openai/v1` | `https://api.openai.com/v1` |
| Anthropic | `http://localhost:3000/anthropic` | `https://api.anthropic.com` |
| Copilot | `http://localhost:3000/copilot` | `https://api.githubcopilot.com` |

```python
# One line to protect your data
client = OpenAI(base_url="http://localhost:3000/openai/v1")
```

<details>
<summary><strong>Docker Compose Setup</strong></summary>

Copy the example config and start all services:

```bash
cp config.example.yaml config.yaml
# Edit config.yaml: set your provider API keys, choose entities to detect
docker compose up -d
```

Logs are persisted in `./data/pasteguard.db`. The dashboard is at [localhost:3000/dashboard](http://localhost:3000/dashboard).

**Development** (Presidio in Docker, Bun locally with hot-reload):

```bash
docker compose up presidio -d
bun install
bun run dev
```

**European languages:**

```bash
PASTEGUARD_TAG=eu docker compose up -d
```

**Custom language set** (local build):

```bash
LANGUAGES=en,de,fr docker compose up -d --build
```

**Optional `.env` file** for API key fallbacks (not required if your client sends the `Authorization` header):

```env
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
```

For full configuration reference, see [config.example.yaml](config.example.yaml) or the [docs](https://pasteguard.com/docs/installation).

</details>

<details>
<summary><strong>European Languages</strong></summary>

For German, Spanish, French, Italian, Dutch, Polish, Portuguese, and Romanian:

```bash
docker run --rm -p 3000:3000 ghcr.io/raseidl/pasteguard:eu
```

For custom config, persistent logs, or other languages: **[Read the docs →](https://pasteguard.com/docs/installation)**

</details>

<details>
<summary><strong>Route Mode</strong></summary>

Route Mode sends requests containing sensitive data to a local LLM (Ollama, vLLM, llama.cpp). Everything else goes to OpenAI or Anthropic. Sensitive data stays on your network.

**[Route Mode docs →](https://pasteguard.com/docs/concepts/route-mode)**

</details>

## Chat

Open-source browser extension for ChatGPT, Claude, and Gemini.

- Paste customer data → masked before it reaches the AI
- AI responds with placeholders → you see the originals
- Works with the same detection engine as the proxy

Currently in beta. Apache 2.0.

**[Join the Beta →](https://tally.so/r/J9pNLr)** · **[Chat docs →](https://pasteguard.com/docs/use-cases/chat)**

## Coding Tools

Protect your codebase context and secrets when using AI coding assistants.

**Claude Code:**

```bash
ANTHROPIC_BASE_URL=http://localhost:3000/anthropic claude
```

**Cursor:** Settings → Models → Enable "Override OpenAI Base URL" → `http://localhost:3000/openai/v1`

**[Coding Tools docs →](https://pasteguard.com/docs/use-cases/coding-tools)**

## GitHub Copilot

PasteGuard intercepts GitHub Copilot requests from IDE plugins and applies the same masking pipeline as the OpenAI and Anthropic routes. Both endpoints are protected:

- **Copilot Chat** — conversation-style requests (`/chat/completions`), same format as OpenAI Chat
- **Inline completions** — ghost-text suggestions (`/v1/engines/:engine/completions`), using the legacy `prompt`/`suffix` format

**What gets masked:** hardcoded API keys, private keys, and connection strings in your code; PII (emails, names, phone numbers, etc.) in comments and string literals — before any of it leaves your machine.

> **Note:** Inline completions (ghost text) run in mask mode only. Route mode is not supported for inline completions because local providers speak chat format, not the legacy completions format.

**1. Enable Copilot in `config.yaml`:**

```yaml
providers:
  copilot:
    base_url: https://api.githubcopilot.com
```

**2. Point your IDE at PasteGuard:**

**VS Code** — add to `settings.json` (this is an advanced/debug setting):

```json
{
  "github.copilot.advanced": {
    "debug.overrideCapiUrl": "http://localhost:3000/copilot"
  }
}
```

> **IntelliJ / JetBrains IDEs are not currently supported.** The JetBrains Copilot plugin only exposes an HTTP Proxy setting, which configures a forward proxy. PasteGuard is a reverse proxy and does not support the forward proxy protocol. VS Code is required for Copilot integration.

Authentication (GitHub OAuth tokens) is handled entirely by the IDE — no API key configuration required in PasteGuard.

## Dashboard

Every request is logged with masking details. See what was detected, what was masked, and what reached the provider.

<img src="assets/dashboard.png" width="100%" alt="PasteGuard Dashboard">

[localhost:3000/dashboard](http://localhost:3000/dashboard)

**Metrics included:**
- Total requests, masked/routed count, API requests, requests per hour
- Token usage: total tokens, input tokens, output tokens
- **Cache hit rate** — percentage of input tokens served from Anthropic's prompt cache (requires `cache_control` in requests)
- **Token anomaly alert** — shown when the last-hour average exceeds 2× the 7-day rolling average
- Hover any metric title for a tooltip explanation

## What it catches

**Personal data** — Names, emails, phone numbers, credit cards, IBANs, IP addresses, locations. Powered by [Microsoft Presidio](https://microsoft.github.io/presidio/). 24 languages.

**Secrets** — API keys (OpenAI, Anthropic, Stripe, AWS, GitHub), SSH and PEM private keys, JWT tokens, bearer tokens, passwords, connection strings.

Both detected and masked in real time, including streaming responses.

## Tech Stack

[Bun](https://bun.sh) · [Hono](https://hono.dev) · [Microsoft Presidio](https://microsoft.github.io/presidio/) · SQLite

## Fork Changes

This fork (`raseidl/pasteguard`) is based on [sgasser/pasteguard](https://github.com/sgasser/pasteguard) `v0.3.2`.

See **[CHANGELOG.md](CHANGELOG.md)** for a detailed list of all changes per version.

### Syncing with Upstream

```bash
git fetch upstream
git merge upstream/main
```

## Contributing

For contributions to the core project, please submit PRs to the [upstream repository](https://github.com/sgasser/pasteguard). See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

For fork-specific changes, open PRs against this repository.

## License

[Apache 2.0](LICENSE) — Original work by [Stefan Gasser](https://github.com/sgasser).

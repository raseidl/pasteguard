# Research: Would a Local Redis Cache Improve PasteGuard?

## Context

PasteGuard is a privacy proxy that sits between LLM clients (Claude Code, Copilot) and providers (OpenAI, Anthropic). Each request goes through: secrets detection (regex) -> PII detection (Presidio HTTP call) -> masking -> provider API call -> unmasking. The question is whether adding a Redis cache would meaningfully reduce latency and token costs.

## TL;DR: Not recommended

Adding Redis response caching would add operational complexity with minimal benefit for PasteGuard's primary use case (interactive coding assistants). Anthropic/OpenAI server-side prompt caching already handles the most valuable scenario. **However**, caching PII detection results (Presidio calls) with an in-memory LRU cache would be a high-impact, zero-infrastructure optimization.

---

## Two Types of Cache to Consider

### A. Response Cache (Cache full LLM responses)

**How it would work:** Hash the full request -> check Redis -> on hit, return stored response without calling the provider.

**Why it doesn't fit PasteGuard well:**

| Problem | Impact |
|---------|--------|
| **Multi-turn conversations** | Each turn adds to the message array, making the full request unique. Hit rate approaches 0% after 2-3 turns. |
| **Streaming dominates** | Claude Code and Copilot default to streaming. Caching streaming responses requires buffering the full response, then replaying as synthetic SSE -- significant complexity. |
| **Masking breaks cache keys** | PasteGuard masks PII with generated placeholders (`[[PERSON_1]]`, etc.). Different masking contexts produce different masked requests for the same original input, so cache keys differ. |
| **Non-deterministic outputs** | With temperature > 0, identical inputs produce different valid outputs. Serving a cached response removes that variance. |
| **Tool use** | Tool calls produce dynamic results. Cached responses with tool calls would return stale data. |
| **Privacy tension** | Storing full LLM responses in Redis means sensitive context persists outside the existing SQLite log. Needs encryption, TTL management, and audit considerations. |

**Expected hit rate for interactive coding:** 5-15% (very low)

**Anthropic already does this better:** Server-side prompt caching caches the internal model state (KV cache) for prompt prefixes. PasteGuard already preserves `cache_control` fields. This gives:
- 90% discount on cached input tokens (cache reads at $0.30/MTok vs $3/MTok for Sonnet)
- Still generates a fresh, contextually correct response
- Works perfectly with multi-turn conversations (prefix grows, cache grows)
- Zero infrastructure on PasteGuard's side

OpenAI also offers automatic server-side prompt caching with 50% input token discount.

### B. PII Detection Cache (Cache Presidio scan results)

**This is the real opportunity.** Presidio HTTP calls are PasteGuard's biggest latency bottleneck (10-500ms per text span, network-dominated).

**How it would work:** Hash each text span + language -> check in-memory LRU cache -> on hit, return cached PII entities without calling Presidio.

**Why this works well:**

| Factor | Benefit |
|--------|---------|
| **System prompts repeat** | In multi-turn conversations, the system prompt is scanned every request but never changes. 100% hit after first scan. |
| **User info repeats** | "My name is John Doe, email john@example.com" appears in every turn of a conversation. Cache hit after first scan. |
| **Deterministic** | Same text + same language + same entity types always produces the same PII detection result. No correctness risk. |
| **No infrastructure needed** | A simple in-memory `Map` with LRU eviction works. No Redis required. |
| **High hit rate** | 70-95% in multi-turn conversations where messages accumulate. |

**Expected savings:** 100-500ms per request in multi-turn conversations (skipping redundant Presidio calls for already-scanned message spans).

---

## Comparison: Redis Response Cache vs In-Memory PII Cache

| Aspect | Redis Response Cache | In-Memory PII Cache |
|--------|---------------------|---------------------|
| **Infrastructure** | Redis server + client library | None (Bun `Map`) |
| **Complexity** | High (streaming replay, masking context, TTL, privacy) | Low (hash text, cache entities) |
| **Hit rate** | 5-15% (interactive), 50-80% (batch) | 70-95% (multi-turn) |
| **Latency savings** | 500ms-10s per hit (eliminates provider call) | 100-500ms per hit (skips Presidio) |
| **Cost savings** | 100% on hits (no API call) | None directly (saves scan time, not tokens) |
| **Correctness risk** | Moderate (stale responses, wrong context) | Zero (deterministic PII detection) |
| **Privacy risk** | High (stores full responses) | Low (stores entity positions, not content) |

---

## What About Semantic Caching?

Semantic caching (GPTCache, Redis Vector Search) uses embeddings to find "similar" queries and return cached responses. **This is inappropriate for PasteGuard:**

- PasteGuard is a **transparent proxy** -- it must not alter LLM behavior. Returning a response for a "similar" query risks incorrect answers.
- Requires an embedding model (additional API calls or local model), partially offsetting savings.
- False positives are dangerous: "How do I delete a file?" vs "How do I delete a database?" are semantically similar but require completely different responses.
- Adds significant infrastructure: embedding model + vector store + threshold tuning.

---

## Recommendation

**Don't add Redis.** Instead:

1. **Keep relying on Anthropic/OpenAI server-side prompt caching** for token cost reduction (already working after the `cache_control` fix). This handles 90% of the cost savings opportunity with zero PasteGuard code.

2. **Add an in-memory PII detection cache** for latency improvement:
   - Cache key: `sha256(text + language + entityTypes + scoreThreshold)`
   - Cache value: `PIIEntity[]` (detected entities with positions)
   - Eviction: LRU with max 500-1000 entries
   - TTL: 1 hour (or configurable)
   - Location: Inside `PIIDetector.detectPII()` in `src/pii/detect.ts`
   - Expected improvement: 30-50% reduction in `scan_time_ms` for multi-turn conversations

3. **Optionally, add secrets detection caching** with the same pattern (lower impact since regex is already fast, ~5-50ms savings).

---

## Sources

- [Anthropic Prompt Caching Documentation](https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching)
- [GPTCache](https://github.com/zilliztech/GPTCache) -- Open-source semantic caching for LLMs
- [Redis Vector Search](https://redis.io/solutions/vector-search/) -- Redis semantic cache infrastructure
- [LangChain LLM Caching](https://python.langchain.com/docs/integrations/llm_caching/) -- Cache backend comparison

# ADR-0010 — AI as a platform module, not a feature

**Status:** Accepted
**Date:** 2026-07-27

## Context

The manifesto is unambiguous:

> *"Artificial Intelligence is part of the platform. It is not a separate feature."*

> *"AI should never interrupt users. AI should never dominate the experience."*

That rules out the default implementation — an SDK call inside a route handler, and a chat panel
bolted to the sidebar. It requires AI to behave like any other piece of infrastructure: an
interface, a cost model, a test strategy, and an owner.

Four properties follow from treating it as infrastructure, and none of them are achievable with
scattered SDK calls:

1. **Prompts must be reviewable artefacts.** A prompt that generates a creator's product
   description is product copy. It needs version history and review, not a string literal.
2. **Spend must be attributable per workspace.** An AI-native SaaS whose per-tenant cost is
   unknown cannot price itself. This is a business requirement before it is a technical one.
3. **Output must be trusted before it reaches the database.** A model returning prose where the
   code expects a shape is a runtime error in the product's most visible surface.
4. **Model choice must be a config change.** The model landscape moves faster than our release
   cycle.

## Options considered

**Direct SDK calls in feature code.** Fastest to write, and the reason most products cannot answer
"what does AI cost us per customer?" Rejected: it makes all four properties above impossible
without a later refactor of every call site.

**A third-party LLM gateway (LiteLLM, Portkey, or similar).** Provides routing, caching, and cost
tracking out of the box. Rejected for M1: it adds an operational dependency in the request path for
capabilities we can implement in a few hundred lines, and per-workspace attribution still has to be
wired by us because the gateway does not know what a workspace is. Reconsider if we add multiple
model providers.

**A framework (LangChain, LlamaIndex).** Rejected: heavy abstraction over what are, for our use
cases, single-turn structured-output calls. The abstraction cost exceeds the benefit, and it
obscures exactly the token accounting we most need to see.

**Our own thin gateway module.** A `packages/ai` module owning prompts, provider abstraction,
validation, cost accounting, caching, and evaluation.

## Decision

**All model access goes through `packages/ai`. Feature code never imports a provider SDK.**

```ts
const result = await ai.run('product.description.v2', {
  workspaceId,
  input: { name, category, audience },
})
```

Feature code passes a prompt ID and typed input, and receives a typed, validated result. It never
sees a model name, a token count, or a raw completion.

### Provider and model selection

Anthropic's Claude, via `@anthropic-ai/sdk`, behind a `ModelProvider` port. Model assignment is
config, not code:

| Surface | Model | Reasoning |
|---|---|---|
| Product descriptions, storefront copy | `claude-sonnet-5` | Quality-per-cost on bounded generation; the highest-volume surface |
| SEO metadata | `claude-haiku-4-5` | Short, templated output; cheapest tier is sufficient |
| Analytics explanation | `claude-opus-5` | Reasoning over real numbers, where being wrong is worse than being slow |

Current pricing per million tokens — `claude-opus-5` $5 / $25, `claude-sonnet-5` $3 / $15 (with a
lower introductory rate through 2026-08-31), `claude-haiku-4-5` $1 / $5. These live in a versioned
pricing table in the module, not inline, because they change independently of our code.

Model IDs are exact strings from the provider's catalogue, held in one config file. No ID is ever
constructed by string concatenation — a guessed ID is a 404 at runtime.

### Structured output is mandatory

Every prompt declares a Zod schema. The call uses the API's structured-output support so the model
is constrained to the schema, and the result is validated again on our side before it is returned.

```ts
definePrompt({
  id: 'product.description.v2',
  model: 'claude-sonnet-5',
  input: z.object({ name: z.string(), category: z.string(), audience: z.string() }),
  output: z.object({
    description: z.string().max(2000),
    bullets: z.array(z.string()).max(5),
  }),
})
```

Two consequences worth stating: **no free-text parsing anywhere in the codebase**, and a schema
change is a compile error at every call site rather than a production surprise.

### Prompt caching

Caching is a **prefix match** — any byte change invalidates everything after it. That fact dictates
how prompts are assembled, so it is a design rule rather than an optimisation:

- The stable part of a prompt comes first and is byte-identical across calls. No timestamps, no
  UUIDs, no workspace names interpolated into the prefix.
- Volatile per-request content goes last, after the cache breakpoint.
- Serialisation is deterministic — sorted keys, no set iteration.

Cache reads cost roughly a tenth of base input price and writes a modest premium over it, so a
shared prefix pays for itself within a couple of calls. Cache hit rate is monitored: a sustained
zero means something is silently invalidating the prefix, which is a bug we want alerted rather
than merely expensive.

### Cost accounting

Every call writes to `ai_usage`: workspace, prompt ID and version, model, input/output/cached
tokens, computed cost in micros, latency, outcome. Per-workspace rate limits and monthly caps are
enforced in the gateway. This is what makes AI a costed product capability rather than an unbounded
liability.

### Evaluation

Each prompt has a fixture set and an offline evaluation harness run in CI. A prompt change that
regresses its fixtures fails the build. Prompts are versioned and immutable once referenced —
`v2` is a new prompt, never an edit to `v1`, so historical output stays explainable.

### Product constraints, from the manifesto

- **No chat interface in M1.** AI appears inline where the user is already working, or not at all.
- **Every AI action is optional, previewable, and reversible.** Generated text lands in an editable
  field, never committed on the user's behalf.
- **AI output is labelled.** Trust is a stated design goal; silently passing generated copy off as
  the platform's own undermines it.
- **Failure is silent and graceful.** If the model is unavailable, the feature degrades to the
  manual path. AI is never on the critical path of taking a payment.

## Consequences

**Good**

- Per-workspace AI cost is a query, available from the first day AI ships.
- Prompts have review history and regression tests, like any other product surface.
- Swapping or adding a model is a config change; adding a provider is one adapter.
- No feature can leak unvalidated model output into the database or the UI.

**Bad, and accepted**

- More upfront work than calling the SDK directly, and it is front-loaded into M1.
- The prompt registry is indirection: finding the text behind a call means opening another file.
  Accepted — it is the same trade as putting SQL behind a repository.
- The port may not expose a provider-specific feature we later want. Handled in the adapter behind
  a flag, not by widening the domain interface.
- Caching discipline constrains how prompts are written. This is a real constraint and it is the
  point.

## Revisit when

We add a second model provider (the gateway becomes a routing concern, and a managed gateway
becomes worth re-evaluating); or a genuine agentic surface appears — multi-turn, tool-calling work
needs a session and tool-execution model beyond the single-turn structured calls this module is
built for.

# ADR-EC-041: `ManagedRuntime` construction stays owned by `@effect-cucumber/vitest` until a second runner package actually exists — resolves a Follow-up item from ADR-EC-021

> **Status:** Accepted
> **Date:** 2026-09-04
> **Context:** resolves the second Follow-up item in [ADR-EC-021](021-effect-and-platform-are-peer-dependencies-of-gherkin.md) ("Which package owns `ManagedRuntime` construction... raised during design, not yet settled"), left open since that ADR and tracked in `spec/roadmap.md`'s "Under consideration" section

## Context

ADR-EC-021 gave `@effect-cucumber/gherkin` `FileSystem`/`Path` service interfaces from core `effect`, and left the concrete `Services` Layer — and the `ManagedRuntime` that runs `gherkin`'s Effects against it — to "whichever runner package consumes `gherkin`". Today that is a single, real module: `packages/vitest/src/loadFeature.ts`, which builds `ManagedRuntime.make(NodeFileSystem.layer)` once at module scope and uses it to wrap `loadFeature`/`parseFeature` into the synchronous-looking call a `.steps.test.ts` file makes.

The open question was whether that construction belongs there, inside `@effect-cucumber/vitest` itself, or in a separate thin adapter package a second, non-vitest runner would also depend on — the same way `gherkin` itself is shared today.

No second runner package exists. No non-vitest consumer has ever been proposed, requested, or prototyped in this project's history. The question was raised speculatively during the ADR-EC-021 design session, not in response to a real need.

## Decision

`ManagedRuntime` construction stays exactly where it is: `packages/vitest/src/loadFeature.ts`, owned entirely by `@effect-cucumber/vitest`. No adapter package is introduced.

This is a decision to stop treating the question as open, not a decision that the current shape is permanent. It resolves under the same logic ADR-EC-018 and ADR-EC-006 already used for scope questions in this project: don't build the general mechanism before a second concrete case exists to generalize from. A hypothetical non-vitest runner cannot inform what a shared adapter's boundary should look like — what it needs from `gherkin`, what it needs from its own host framework, whether `NodeFileSystem.layer` is even the right default outside a Node-only vitest run — because nothing has ever tried to answer those questions against real code.

**Revisit trigger:** the day a second runner package is actually proposed (a Bun-test runner, a Deno-test runner, a plain-Node CLI runner — anything that is not `@effect-cucumber/vitest`), this decision is superseded by a new ADR, not amended in place, per `spec/process/requirement-id-scheme.md`. That ADR would extract the `ManagedRuntime`-construction logic this ADR keeps in `packages/vitest/src/loadFeature.ts` into a shared package at that point, informed by what the second runner actually needs.

## Consequences

**Positive**:

- No speculative package, no speculative API surface, no consumer-facing decision made on zero evidence.
- `@effect-cucumber/vitest`'s own `loadFeature.ts` stays exactly as simple as ADR-EC-024 already described it.

**Negative**:

- If a second runner does appear, that work starts by extracting code from `@effect-cucumber/vitest` rather than depending on an adapter that was already there — a small, known, one-time migration cost, accepted in exchange for not paying an abstraction's ongoing cost today against a runner that has never existed.

**Trade-off accepted**: the "Which package owns `ManagedRuntime` construction" question in `spec/roadmap.md` closes as "stays put, revisit on real demand" rather than as a built adapter — consistent with how this project has already closed every other speculative-generalization question it has raised (ADR-EC-006's rejected third Layer scope, ADR-EC-013's narrowed portability claim).

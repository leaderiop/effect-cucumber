# Phase 5: `describeFeature` Type Surface - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-29
**Phase:** 5-describefeature-type-surface
**Areas discussed:** Type-test file organization, shared/perScenario Layer legality, Step failure trace richness

---

## Type-test file organization

| Option | Description | Selected |
|--------|-------------|----------|
| Extend tsgo-gate/ | Same directory, same isolated-tsconfig-per-case pattern, same verify script style. | ✓ |
| New dedicated location | e.g. `packages/vitest/test/describe-feature-gate/` — cleaner separation, second parallel CI script/pattern to maintain. | |

**User's choice:** Extend tsgo-gate/ (recommended)
**Notes:** Reuses the exact Phase-1-built precedent (`satisfied.ts`/`tsconfig.ok.json`, `missing-layer-context.ts`/`tsconfig.json`) rather than inventing a parallel pattern.

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, same directory | One more tsconfig.*.json + one more src/*.ts file, same pattern as the positive control. | ✓ |
| Something else | Describe where it should live instead. | |

**User's choice:** Yes, same directory (recommended)
**Notes:** The positive Effect.acquireRelease/Scope case (success criterion 2) lives alongside the new negative fixture.

---

## shared/perScenario Layer legality

| Option | Description | Selected |
|--------|-------------|----------|
| Require perScenario, Layer.empty when unused | One consistent object shape; no branching for which keys were supplied. | ✓ |
| Make perScenario optional | Slightly less boilerplate for shared-only Features; requires "undefined means empty" as a distinct case. | |

**User's choice:** Require perScenario, Layer.empty when unused (recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| Allowed, perScenario wins | Matches ADR-EC-006's "merged with shared" phrase; falls out of Layer.provideMerge's normal semantics. | ✓ |
| Reject overlap as a compile/runtime error | Forces explicit intent; requires extra detection work. | |

**User's choice:** Allowed, perScenario wins (recommended)

---

## Step failure trace richness

| Option | Description | Selected |
|--------|-------------|----------|
| Step text only | Matches the roadmap's literal wording; keeps DSL-02's scope narrow. | ✓ |
| Step text plus resolved arguments | Richer failure traces from day one; adds span-attribute plumbing not currently scoped for this phase. | |

**User's choice:** Step text only (recommended)
**Notes:** Resolved-argument spans deferred as a separate future decision.

---

## Claude's Discretion

- Conditional/distributive type vs. function overloads for deriving `FeatureDsl<R>` from the union `layer` argument.
- Where exactly `Scope.Scope` enters the type (per-step function type, `FeatureDsl`, or both).
- Exact generator type used internally (hand-rolled vs. `Effect.gen.Return`/`Effect.fn.Return`).
- File/script naming for the new tsgo-gate fixtures and CI script extension.

## Deferred Ideas

- Span attributes carrying a step's resolved argument values (richer failure traces) — revisit as its own decision later.
- "Shared within a Rule" as a third Layer scope — already ruled out by ADR-EC-006, not re-opened.

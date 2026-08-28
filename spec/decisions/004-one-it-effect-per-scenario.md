# ADR-EC-004: One `it.effect` per Scenario; Background is inlined, not a hook

> **Status:** Accepted
> **Date:** 2026-08-28

## Context

A Scenario's steps need to run in order, short-circuit on the first failure,
and get `TestClock`/`TestConsole`/a fresh `Scope` the way any `@effect/vitest`
test does. `@amiceli/vitest-cucumber` runs each Scenario as a single vitest
`test`/`it` internally with steps invoked as sequential promise-returning
calls, which is the right granularity — the alternative (one vitest test per
step) would break `it.effect`'s scope-per-test model and make Background
awkward to express.

## Decision

Each Scenario compiles to exactly one `it.effect` call:

```ts
it.effect(scenarioName, () =>
  Effect.gen(function* () {
    yield* backgroundStepsEffect
    yield* scenarioStepsEffect   // sequential yield*
  }).pipe(Effect.provide(layer)))
```

Background steps are not a separate vitest hook (`beforeEach`) — they're
inlined as the first `yield*`s of every Scenario's `Effect.gen`, ahead of that
Scenario's own steps.

## Consequences

**Positive**:

- Fail-fast falls out of `Effect.gen`'s sequential `yield*` for free — Effect's
  error channel short-circuits the whole generator, including Background
  steps, with no separate bookkeeping (see
  [INV-EC-001](../invariants.md#inv-ec-001-fail-fast-is-structural-not-bookkept)).
- Each Scenario gets `it.effect`'s test services — `TestClock`, `TestConsole`,
  a fresh `Scope` closed at test end — automatically.
- Scenarios stay single vitest tests, matching how vitest-cucumber reports
  today, so the vitest UI/CLI (`-t "<pattern>"`, watch mode) works unmodified.

**Negative**:

- Because Background isn't a real `beforeEach`, a Background step's failure
  reads as "the Scenario failed on its first step," not as a distinguished
  setup-phase failure — there's no separate "Background failed" reporting
  category.
- A Background running against a `shared` Layer (see
  [ADR-EC-006](006-two-layer-scopes-only.md)) can't assume a fresh Layer — the
  Background author is responsible for resetting shared state themselves.

**Trade-off accepted**: losing a distinguished Background-failure reporting
category is acceptable because Background steps are, mechanically, just more
steps — inventing a separate failure category for them would be a special case
serving no behavioral purpose.

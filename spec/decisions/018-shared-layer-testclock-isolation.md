# ADR-EC-018: A shared Layer keeps per-Scenario `TestClock` isolation via `excludeTestServices`

> **Status:** Accepted
> **Date:** 2026-08-28
> **Context:** resolves a Critical finding from GSD Pitfalls research

## Context

`spec/overview.md` and `spec/behaviors/03-rules-outlines-and-testclock.md`
(BEH-EC-012) both state that `TestClock` composes transparently — a step
reading `Clock` sees `@effect/vitest`'s simulated clock with zero
test-specific code. This holds on the plain, per-Scenario path
([ADR-EC-006](006-two-layer-scopes-only.md)'s default), where `it.effect`
provides a fresh `TestClock`/`TestConsole` bundle (`TestEnv`) per test.

It does **not** hold on the `shared`-Layer path. GSD Pitfalls research
reproduced directly: `@effect/vitest`'s `layer(L)(...)` builds
`Layer.provideMerge(L, TestEnv)` once and memoizes it for the whole block —
by design, since that memoization is the entire point of `shared` (see
[ADR-EC-006](006-two-layer-scopes-only.md)). But it means `TestEnv`,
including `TestClock`, is *also* built once and shared. One Scenario's
`TestClock.adjust("1 hour")` leaks into every subsequent Scenario in that
Feature — Scenario execution order becomes semantically load-bearing, and a
suite that passes run as a whole can fail under `-t` filtering (which changes
which Scenario runs "first" against the shared clock), or vice versa.

## Decision

The `shared`-Layer code path passes `excludeTestServices: true` to
`layer(...)`, and the generated per-Scenario `it.effect` body provides its
own fresh `TestEnv` explicitly:

```ts
layer(sharedLayer, { excludeTestServices: true })((it) => {
  it.effect(scenarioName, () =>
    Effect.gen(function* () {
      yield* scenarioStepsEffect
    }).pipe(Effect.provide(TestEnv)))  // fresh per Scenario, not from the memoized shared layer
})
```

This keeps `shared`'s build-once memoization for the caller's own Layer (the
whole reason to reach for `shared` in the first place) while restoring
per-Scenario `TestClock`/`TestConsole` isolation to match the plain path's
behavior exactly.

## Consequences

**Positive**:

- `TestClock` composes transparently on *both* Layer scopes, not just the
  default one — the guarantee in `spec/overview.md`/BEH-EC-012 becomes
  actually true rather than true-with-an-unstated-exception.
- No loss of the `shared` Layer's core benefit — the expensive resource
  itself (a testcontainer, a DB connection) is still built exactly once.
- Scenario execution order and `-t` filtering behave identically whether or
  not a Feature uses a `shared` Layer — no hidden coupling between Scenarios.

**Negative**:

- The generated code for the `shared`-Layer path is one layer more complex
  than the plain path (`excludeTestServices: true` plus an explicit
  `TestEnv` provide) — a detail the DSL must get right internally, though it
  doesn't add any surface complexity for a step author.

**Trade-off accepted**: this is a mechanical fix, not really a trade-off —
the alternative (documenting the leak as a known limitation in
[INV-EC-002](../invariants.md#inv-ec-002-a-per-scenario-layer-is-fresh-every-scenario))
was considered and rejected, since the fix is fully verified and costs
nothing but a small amount of internal implementation complexity that's
already isolated to the `shared`-Layer runner path.

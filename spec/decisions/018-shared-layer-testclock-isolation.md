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
including `TestClock`, is _also_ built once and shared. One Scenario's
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
    Effect.gen(function*() {
      yield* scenarioStepsEffect
    }).pipe(Effect.provide(TestEnv))) // fresh per Scenario, not from the memoized shared layer
})
```

This keeps `shared`'s build-once memoization for the caller's own Layer (the
whole reason to reach for `shared` in the first place) while restoring
per-Scenario `TestClock`/`TestConsole` isolation to match the plain path's
behavior exactly.

## Consequences

**Positive**:

- `TestClock` composes transparently on _both_ Layer scopes, not just the
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

**[The phrase "a mechanical fix" in the paragraph above is superseded in place by
the implementation note below: the fix turned out to be TWO independent guards over
TWO different services, and mutation-testing separates them. Everything else in this
decision shipped as written.]**

---

> **Implementation note (2026-08-30, Phase 10, verified against the installed
> `effect@4.0.0-rc.112` and `@effect/vitest@4.0.0-rc.112` and pinned by
> `packages/vitest/test/emission.test.ts`,
> `packages/vitest/test/SharedLayerConstraint.types.ts` and
> `scripts/verify-shared-layer-once.sh`):** the decision above shipped. Five things it
> could not know when it was written are recorded here, four of them about the sketch's
> own shape.
>
> **1. `TestEnv` is not exported, and had to be reconstructed.** The sketch's
> `Effect.provide(TestEnv)` names a value `@effect/vitest` does not export —
> `import { TestEnv } from "@effect/vitest"` does not compile. `describeFeature.ts`
> rebuilds it from the two PUBLIC `effect` modules instead, as
> `Layer.mergeAll(TestConsole.layer, TestClock.layer())`, which is byte-equivalent to the
> framework's own definition (read out of `dist/internal/internal.js` line 34 rather than
> guessed). The clock half is CALLED, with parens: `TestClock.layer` without them is the
> constructor function and not a Layer, and dropping the parens is the single most
> plausible tidy-up on that line.
>
> **2. The ONE-ARGUMENT call form is mandatory, and the sketch does not say why.** The
> sketch happens to show `layer(shared, options)(callback)` — one argument to the returned
> function — and the implementation must use exactly that. The TWO-argument form,
> `layer(shared, options)(name, callback)`, opens a `describe` of its own named by its
> first argument, which would wrap a second Feature-named block around `Runner.ts`'s own
> `describe(feature.name, …)` and render as `Feature > Feature > Scenario`. Measured
> against the installed build, both forms.
>
> **3. The per-Scenario provide is applied at the EMISSION boundary, not inside the
> Scenario builder.** The sketch shows it wrapping `scenarioStepsEffect`, which reads as
> `ScenarioEffect.ts`'s job. It is done in `describeFeature.ts`'s `sharedLayerTestApi`
> instead, around the thunk each emitted node receives. That keeps `ScenarioEffect.ts`
> free of any knowledge that two paths exist — it provides whatever per-Scenario Layer it
> is handed and has never heard of the shared path — which is the property its own note
> (b) asks for.
>
> **4. `excludeTestServices: true` and the per-emission provide guard DIFFERENT services.
> This is the correction to "a mechanical fix" above.** The decision reads as one change
> with two spellings. Mutation-testing in Phase 10 separated them: removing
> `excludeTestServices: true` leaks the CONSOLE and leaves the clock isolated, while
> hoisting the per-emission `Effect.provide` into the shared tier leaks the CLOCK and
> leaves the console isolated. Neither half is redundant, and neither substitutes for the
> other. The mechanism is Layer memoisation by object IDENTITY: `Effect.provide` forks the
> `CurrentMemoMap` that `layer(...)` leaves ambient, `TestConsole.layer` is a module-level
> CONSTANT and therefore the same object the framework's own `TestEnv` already built (a
> memo hit), while `TestClock.layer` is a FUNCTION, so `TestClock.layer()` here and
> `TestClock.layer()` there are two distinct objects (a memo miss, and a genuinely fresh
> clock). The clock half consequently survives the loss of `excludeTestServices: true`
> only by that accident. Should a future `effect` release make `TestClock.layer` a
> constant — the obvious tidy-up, since `TestConsole.layer` already is one — removing the
> option would silently reintroduce the exact leak this decision exists to prevent. The
> `TestConsole` assertion in `emission.test.ts` is what stands between that change and a
> green suite, and it must not be deleted as redundant beside the clock assertions.
>
> **5. Pitfall 29's consequence is ACCEPTED, not fixed.** The object `layer(...)` hands its
> callback is a `MethodsNonLive`, which has no live-clock member, so a Feature using a
> `shared` Layer cannot opt a single Scenario out of the simulated clock. The two paths do
> not have identical capability surfaces. This is a documented limitation of the decision
> rather than a defect in its implementation.
>
> **6. The shared tier itself is built on the LIVE clock.** `excludeTestServices: true` makes
> the framework build the `shared` Layer bare, and the per-Scenario `TestEnv` is provided
> only around each Scenario's body (note 3), so a shared Layer that forks a fiber using
> `Effect.sleep` or reads `Clock` at build time runs on wall-clock time. That is a
> consequence of building it once, before any Scenario's own simulated clock exists, and
> it is accepted: a per-Scenario `TestClock` cannot drive a resource shared by every
> Scenario. BEH-EC-007 states it as part of the requirement.
>
> **7. The per-Scenario tier may be built FROM the shared tier (F-18).** The object form's
> `perScenario` is `Layer<RScenario, E2, RShared>`, not `Layer<RScenario, E2, never>`: the
> shared tier is already ambient around every Scenario's `Effect.provide(perScenario)`, so a
> per-Scenario World over a shared Database is expressible without rebuilding the Database
> per Scenario, which the `never` pin had forced. A `perScenario` input neither tier provides
> is still rejected — by overload resolution rather than by name, and BEH-EC-007 says so.
>
> **8. Note 2 is reversed (2026-09-02, F-09): the NAMED call form is now the mechanism.**
> `describeFeature.ts`'s shared adapter opens the Feature's own block through
> `layer(sharedTier, options)(feature.name, callback)`. Note 2's objection — a second
> Feature-named block — does not arise, because the adapter hands `Runner.ts`'s single
> top-level `describe` call to the named form instead of to vitest's `describe`: the
> block the named form opens IS the Feature block. What the named form buys, and the
> one-argument form could not: `beforeAll(build)` and `afterAll(closeScope)` land on the
> Feature's block, so the tier is released when the Feature ends rather than when the
> file does (BEH-EC-007's first correction recorded that divergence; its latest
> correction records the fix), and a `memoMap` made by the composition root is passed
> in so a hook registered on the same block can reach the identical memoised build.
> Measured against the installed build: `Feature > Rule > Scenario`, one Feature-named
> level, release before the next sibling suite.
>
> **What enforces it.** `packages/vitest/test/emission.test.ts` carries the runtime
> claims: four Scenarios under one `shared` Layer, one of which advances the clock by an
> hour, all four reading 0 at their own start; a per-Scenario `TestConsole` asserted
> through `effect/testing/TestConsole`'s `logLines` with its own non-vacuity control; and
> the `[1, 1, 1]` shared-ordinals against `[1, 2, 3]` per-Scenario-ordinals pair that says
> the memoisation applies to one tier and not the other.
> `scripts/verify-shared-layer-once.sh` (`pnpm verify:shared-layer-once`) re-asserts the
> build-once claim from a real `vitest` CLI run, whole and `-t`-filtered, which is the
> failure mode the Context section above names and which no in-process test can reach.
> `packages/vitest/test/SharedLayerConstraint.types.ts` carries the type-level constraint
> the implementation added on top of this decision: a `shared` Layer's error channel must
> be `never`, because the framework builds it through `Effect.orDie` and would raise a
> typed failure as a defect out of a setup hook, attributed to no Scenario.

# ADR-EC-034: A `@retry` Gherkin tag wraps `flakyTest` at the `TestApi` seam — `Runner.ts` only decides, `VitestTestApi.ts` alone applies

> **Status:** Accepted
> **Date:** 2026-09-03
> **Context:** resolves [wayfinder ticket #13](https://github.com/leaderiop/effect-cucumber/issues/13), part of
> [effect-cucumber gap decisions #11](https://github.com/leaderiop/effect-cucumber/issues/11)

## Context

`spec/roadmap.md` § Planned locked the direction before this ADR was written: `@effect/vitest@4.0.0-rc.112` ships
`it.flakyTest`/`flakyTest` (`scoped → sandbox → retry(recurs(10), 30s cap) → orDie`), and this repository's own
`ScenarioEffect.ts` already provides the per-Scenario Layer innermost, so wrapping the composed Scenario Effect in
`flakyTest` was expected to preserve that composition order "for free." Exposed via a `@retry` Gherkin tag, fixed
at `flakyTest`'s own defaults (no numeric parameter), consistent with `@skip`/`@only` carrying none.

`research/vitest-retry-and-layer-rebuild.md` (branch `research/vitest-retry-and-layer-rebuild`) confirmed the
mechanism against the real installed source rather than the roadmap's prose alone: `flakyTest`'s pipe is
`self → Effect.scoped → Effect.sandbox → Effect.retry(schedule) → Effect.orDie`, and `Effect.retry` is the LAST
combinator applied before `orDie` — meaning whatever `self` is gets re-interpreted from scratch on every Schedule
iteration, including any `Effect.provide(layer)` composed inside it. The composition-order rule that research
established: a Layer's `provide` rebuilds fresh every attempt ONLY when it is composed INSIDE the value handed to
`flakyTest` (below `Effect.retry` in the pipe), never when a caller wraps `Effect.provide` around the OUTSIDE of
`flakyTest(...)` — that builds the Layer once, before any attempt, and shares it across every retry.

**What the roadmap sketch left unstated, and what implementing it against the real seam forces to the surface:**
"wraps `buildScenarioEffect` in `flakyTest` before it reaches `it.effect`" reads as if the wrap could happen
inside `Runner.ts`, right where `buildScenarioEffect` is called. It cannot. `scripts/verify-testapi-seam.sh`
forbids `Runner.ts` (and `TestApi.ts`) from importing `vitest` or `@effect/vitest` in ANY form — not a value
import, not `import type`, not a dynamic `import()` — and `flakyTest` is an `@effect/vitest` export. Only
`VitestTestApi.ts` and `describeFeature.ts` may name a test framework at all. This is not a new constraint this
ADR introduces; it is the same seam `ADR-EC-004`'s "one `it.effect` per Scenario" design already sits behind, and
it settles the sketch's one open question: WHERE, precisely, does `flakyTest` sit in the pipe.

## Decision

**`@retry` is DECIDED in `Runner.ts`, exactly the way `@skip` already is, and APPLIED only in `VitestTestApi.ts`,
the one seam-side module allowed to import `@effect/vitest`.** `Tags.ts` gains a third reserved tag, `retryTag =
"@retry"`, and its reader `isRetried(tags)`, mirroring `skipTag`/`isSkipped` exactly:

```ts
// packages/vitest/src/Tags.ts
export const retryTag = "@retry"
export const isRetried = (tags: ReadonlyArray<string>): boolean => tags.includes(retryTag)
```

`TestApi.ts`'s `EmitOptions` gains one more boolean field, `retry`, carried across the seam as plain data exactly
like `skip` and `tags` already are — never a call, never a `Layer`, never anything `TestApi.ts` itself has to
interpret:

```ts
// packages/vitest/src/TestApi.ts
export interface EmitOptions {
  readonly tags: ReadonlyArray<string>
  readonly skip: boolean
  readonly retry: boolean
  readonly contextFree: boolean
}
```

`Runner.ts`'s `emitFeature` computes it the identical way it computes `skip`, once per Scenario in both the
Feature-level and Rule-level loops, and hands it across the seam unchanged:

```ts
// packages/vitest/src/Runner.ts — both loops, unchanged in shape from the `skip` line beside it
const retry = isRetried(scenarioPlan.tags)
// ...
{ tags: scenarioPlan.tags, skip, retry, contextFree: false }
```

`VitestTestApi.ts` is where `flakyTest` is actually imported and applied — a new `withRetry` helper wraps the
thunk `Runner.ts` handed across the seam, and the ORDER inside it is the load-bearing part:

```ts
// packages/vitest/src/VitestTestApi.ts
const withRetry = (
  retry: boolean,
  self: Parameters<TestApi["effect"]>[1]
): Parameters<TestApi["effect"]>[1] => retry ? () => flakyTest(self()) : self
```

`self()` is CALLED first — producing the Effect value `buildScenarioEffect` already returns with
`Effect.provide(effectiveLayer)` as its own outermost `pipe` step (unchanged, `ScenarioEffect.ts`) — and only THEN
is the RESULT handed to `flakyTest`, which wraps `Effect.retry` around that whole already-built value. This is
the exact "call first, wrap the result" shape `Runner.ts`'s own `buildSeededScenarioEffect` already relies on for
`Random.withSeed` (ADR-EC-031); `withRetry` does not invent a new pattern, it reuses the one already proven safe
in this codebase. `withRetry` is applied inside `makeDegradingEffect`, BEFORE either of its two registration
attempts (the untagged-degradation retry `BEH-EC-008` already performs is a DIFFERENT kind of retry, decided at
registration time — the same `self` reference, already retry-aware, is reused unchanged across both attempts
rather than re-derived).

**No code-level option.** Fixed at `flakyTest`'s own defaults (`Schedule.recurs(10)`, a 30-second wall-clock cap)
for the same reason `@skip`/`@only` carry no parameter: a numeric knob is a second, code-level configuration
surface beside the tag itself, and this codebase's `describeFeature` has none for `skip`/`only` either — a
consumer who needs a different bound is one line away from writing `flakyTest(scenarioEffect, customTimeout)`
themselves if this codebase ever grows a code-level retry escape hatch, but that is a different, unrequested
feature, not this one.

### Design question 1 — does the guarantee hold on the SHARED-layer path too?

Yes, verified by reading `@effect/vitest`'s own `layer(...)` implementation
(`node_modules/@effect/vitest/src/internal/internal.ts`), not assumed. The shared-path adapter,
`sharedLayerTestApi`, routes a Scenario's (already retry-aware) thunk through
`requireSharedIt("effect").effect(name, () => self().pipe(Effect.provide(testEnv)), emitOptions)` — `self` here IS
`withRetry`'s output, so `self()` already returns `flakyTest(buildScenarioEffect(...))` when `@retry` applies.
`requireSharedIt("effect")` is `@effect/vitest`'s own `layer(sharedTier, ...)`-returned `MethodsNonLive`, whose
`effect` tester is internally `makeTester<R | Scope.Scope>((effect) => Effect.flatMap(contextEffect, (context) =>
effect.pipe(Effect.scoped, Effect.provide(context))), it)` — and `makeTester`'s `run` is `pipe(Effect.suspend(()
=> self(...args)), mapEffect, runTest(ctx))`. The shared tier's `Effect.provide(context)` is composed by THIS
wrapper, OUTSIDE whatever `self()` returns, as a SINGLE pipe step applied once per `run` execution — meaning it
sits outside our `flakyTest` call entirely, by construction, with no special-casing needed. Each retry attempt
(inside `flakyTest`'s own `Effect.retry`) re-executes `self()`'s returned description, which embeds the
PER-SCENARIO tier's `Effect.provide(effectiveLayer)` (rebuilds every attempt) but NOT the shared tier's provide
(built once, outside). The plain path shows the identical shape one level up: `it.effect`'s own ambient default
`TestEnv` is provided by `@effect/vitest`'s `mapEffect`, again outside whatever `self()` returns. **Both Layer
forms behave identically under `@retry`: the `perScenario`/plain-Layer tier rebuilds fresh every attempt, and a
`shared` tier beside it stays built exactly once — measured by counter in `packages/vitest/test/emission.test.ts`
(`retryObservedScopedOrdinals` reads `[1, 2]`, `retryObservedSharedOrdinals` reads `[1, 1]`, same Feature, same
retried Scenario), never asserted from the architecture description alone.**

### Design question 2 — does `BeforeAllScenarios`'s once-cell interact with `@retry`?

No rescue, confirmed by reading `Runner.ts`'s `makeOnce` against `flakyTest`'s literal re-interpretation
semantics. `makeOnce` returns `Effect.suspend((): ... => { if (started) return Deferred.await(deferred); started
= true; return Effect.flatMap(Deferred.into(body, deferred), () => Deferred.await(deferred)) })` — an
`Effect.suspend`, itself a description node whose THUNK is what runs fresh every time the interpreter reaches it,
not the effect it returns. When `flakyTest`'s `Effect.retry` re-executes the whole `Effect.flatMap(
beforeAllScenariosCell, () => buildSeededScenarioEffect(...))` description on a retry attempt, it re-reaches the
suspend node and re-invokes its thunk — which reads `started` (already `true` after the very first attempt) and
returns `Deferred.await(deferred)`, re-observing the SAME already-settled `Exit` rather than re-running the hook
body. A failed `BeforeAllScenarios` therefore fails every retry attempt identically, near-instantly (bounded by
`Schedule.recurs(10)`/30s, but each attempt is cheap since nothing re-runs), and the Scenario is reported FAILING
once `flakyTest` exhausts its schedule and `Effect.orDie`s. `packages/vitest/README.md`'s existing statement —
"`BeforeAllScenarios` ... is never retried, so a Scenario-level retry cannot make a failed setup pass" — remains
accurate for exactly this reason, now proven rather than merely asserted: `packages/vitest/test/Runner.test.ts`'s
"`@retry` cannot rescue a Scenario whose `BeforeAllScenarios` already failed" block manually composes
`flakyTest(recordedThunk())` the same way `VitestTestApi.ts` does, over a `BeforeAllScenarios` hook that always
fails, and asserts the hook's own log shows exactly ONE `"beforeAll:start"` — never a second, across every retry
attempt `flakyTest` performs — while the overall `Exit` is still a failure.

### Design question 3 — do `Before`/`After`/`BeforeStep`/`AfterStep` hooks re-run on every retry attempt?

Yes, and this follows from the same "literal re-interpretation, not a re-invoked JS function" mechanism design
question 2 relies on. `buildScenarioEffect` composes `Before`, every step's `BeforeStep`/body/`AfterStep`, and
`After` into ONE `Effect.gen` description; `flakyTest`'s `Effect.retry` re-executes that ENTIRE description fresh
on every attempt, hooks included — there is no notion of "the parts that already ran" for `Effect.retry` to skip,
because nothing about the description tree is memoised by default. Measured, not merely reasoned about:
`packages/vitest/test/emission.test.ts`'s retry block counts `Before`/`After`/`BeforeStep`/`AfterStep` hook
invocations across a two-attempt run (fails once, passes once) and finds `Before`/`After` run exactly twice (once
per attempt) and `BeforeStep`/`AfterStep` run five times each (attempt 1 reaches `Given`+`When` before failing —
2 steps; attempt 2 reaches `Given`+`When`+`Then` and passes — 3 steps; 2 + 3 = 5). This is stated explicitly here
because it was previously implicit: a hook author relying on `@retry` should expect side effects in a `Before`
(or any hook) to happen once per ATTEMPT, not once per Scenario.

### A fourth finding, beyond the three design questions: the ambient `TestClock`/`TestConsole` is NOT reset between attempts

Not one of the three questions this ticket named, but adjacent enough, and materially surprising enough, to
record here rather than let a consumer discover it by accident. The per-Scenario simulated clock and console
(`VitestTestApi.ts`'s `testEnv` on the shared path; `@effect/vitest`'s own ambient default `TestEnv` on the plain
path) are provided by the SAME architectural mechanism design question 1 traced for the shared tier — a single
`Effect.provide` composed OUTSIDE whatever `self()` returns, applied once per `run` execution. Since `@retry`'s
`flakyTest` wrap lives INSIDE that one `Effect.provide`, the simulated clock and console are built ONCE for the
whole retried run, not once per attempt: a step that calls `TestClock.adjust(...)` on a failed attempt leaves the
clock advanced for the NEXT attempt, and any `TestConsole` output a failed attempt produced is still in the
captured buffer when the next attempt runs. Measured: `packages/vitest/test/emission.test.ts`'s retry block reads
the ambient clock in the SAME `Given` step every attempt — `[0, 3_600_000]` — the second attempt sees the FIRST
attempt's `TestClock.adjust("1 hour")`, not a reset. `packages/vitest/README.md`'s tags section states this
alongside the `BeforeAllScenarios` caveat, so both non-obvious retry consequences live in the same place a reader
checking "what does `@retry` NOT reset" would look.

## Consequences

**Positive**:

- `Runner.ts` and `TestApi.ts` stay framework-agnostic, exactly as `scripts/verify-testapi-seam.sh` requires — no
  exception was carved out for this feature, and none was needed: `@retry` is DATA crossing the seam (a boolean,
  the same shape `skip` already has), and only the one module already permitted to import `@effect/vitest` does
  anything with it.
- The composition point leaves room for the still-unimplemented `Effect.Metric` wiring
  (`spec/roadmap.md` § Planned, "Effect.Metric at the Scenario emission boundary") to land OUTSIDE this retry
  without re-architecting anything THIS ADR ships. That spike's own text describes wiring `Metric.timer`/
  `Metric.counter` in "the REAL `Runner.ts` at both its `buildScenarioEffect` call sites" — this ADR's finding is
  that literal call site is now the WRONG place for it: `Runner.ts` cannot import `@effect/vitest`, so `flakyTest`
  had to move to `VitestTestApi.ts`, and a metrics wrapper placed inside `Runner.ts`'s thunk (as the spike's own
  wording describes) would necessarily be INSIDE `flakyTest`'s retried region — counting once per ATTEMPT, exactly
  the double/triple-counting the roadmap's own note (added after that spike) warns against. `effect/Metric` is not
  a forbidden import for `VitestTestApi.ts` (only a TEST FRAMEWORK is forbidden, and `Metric` ships in `effect`
  itself, already a dependency of every module here) — so the correct future placement is the SAME seam point this
  ADR wraps `flakyTest` at, wrapping OUTSIDE it (`() => metricsWrap(flakyTest(self()))`), not the Runner.ts call
  site the spike used. Recorded here as a correction for whoever implements that item next, the same way
  ADR-EC-030/031/032/033 each corrected a roadmap sketch against the real constraints implementing it surfaced.
- Both Layer forms work under `@retry` for the SAME underlying reason (an already-existing "provide outside the
  thunk" pattern `@effect/vitest`'s own `layer(...)` and `it.effect` both already use), not because of anything
  special-cased for retry — nothing in `describeFeature`'s object-vs-plain-Layer overload resolution needed to
  change, and no rejection was needed at the `describeFeature` call site.

**Negative**:

- A hook's side effects (writing to an external system, incrementing a counter a step later asserts against) now
  run once per ATTEMPT under `@retry`, not once per Scenario — a real behavioral surface a `Before`/`After`
  author must design for if they opt into `@retry`, stated explicitly here and in BEH-EC-026 rather than left
  implicit.
- The ambient `TestClock`/`TestConsole` NOT resetting between attempts is a real, if narrow, surprise for a step
  that assumes "every attempt starts identically" — stated as a documented cost, not hidden; a consumer who needs
  attempt-isolated simulated time would need to advance/reset the clock explicitly inside their own step logic,
  which this codebase provides no help for today.
- `flakyTest`'s own `Effect.orDie` means an exhausted retry's final failure reaches the reporter as a DEFECT
  rather than whatever typed failure the step itself produced — inherited from `@effect/vitest`'s own design, not
  introduced by this ADR, but worth naming: `ADR-EC-033`'s `StepFailureLocation` `.cause` wrap still applies
  (it wraps the step body itself, inside the retried region, before `flakyTest` ever sees the failure), so the
  located `.cause` block still reaches the panel on a `@retry` Scenario's final failed attempt.

**Trade-off accepted**: fidelity to the roadmap sketch's literal "wraps `buildScenarioEffect` in `flakyTest`
before it reaches `it.effect`" phrasing, in favor of the composition point the real `scripts/verify-testapi-seam.sh`
gate actually permits — the same trade every prior roadmap-correction ADR in this series has made, verified
against the real installed dependency and the real repository gates rather than assumed from the sketch's prose.

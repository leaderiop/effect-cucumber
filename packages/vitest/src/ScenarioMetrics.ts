/**
 * `Effect.Metric` at the Scenario emission boundary (ADR-EC-037, BEH-EC-029, INV-EC-008). Two
 * ALWAYS-ON metrics — no opt-out, consistent with `Effect.fn` tracing spans already being always-on
 * (ADR-EC-005) — and the one combinator, `withScenarioMetrics`, that records them around a Scenario's
 * TERMINAL outcome.
 *
 * This module is framework-free (`effect/*` only) and may be imported from anywhere, including
 * `Runner.ts` — but it must NOT be applied there. The one caller that matters is
 * `VitestTestApi.ts`, and the load-bearing part is WHERE it wraps, not what it does:
 *
 * - `withScenarioMetrics` MUST wrap OUTSIDE a `@retry` Scenario's `flakyTest` wrap (ADR-EC-034), never
 *   inside it. `Runner.ts` cannot apply `flakyTest` itself (`scripts/verify-testapi-seam.sh` forbids
 *   it from importing `@effect/vitest`), so `flakyTest` is applied one module over, in
 *   `VitestTestApi.ts` — and a metrics wrapper placed at `Runner.ts`'s `buildScenarioEffect` call site
 *   (where an earlier spike, `research/metric-wiring-spike.md`, first wired this) would sit INSIDE
 *   that retried region, recording once per ATTEMPT rather than once per Scenario: a Scenario that
 *   fails twice then passes would wrongly contribute two `outcome: "fail"` increments and one
 *   `outcome: "pass"` increment, instead of the one terminal outcome a dashboard reader expects. Since
 *   `effect/Metric` is not a forbidden import for `VitestTestApi.ts` (only a TEST FRAMEWORK is), the
 *   correct call site is the SAME seam point `withRetry` wraps at, wrapping OUTSIDE it — see
 *   `VitestTestApi.ts`'s own `withMetrics`.
 * - Composing OUTSIDE `flakyTest` is what makes this correct at all: `Effect.exit` below observes
 *   whatever `flakyTest`'s own `Effect.retry` produces AFTER it settles — the fully-retried, terminal
 *   `Exit` — never an intermediate attempt's `Exit`, because those are resolved and discarded entirely
 *   INSIDE `flakyTest`, before this wrapper ever runs. A retried Scenario therefore contributes
 *   EXACTLY one increment to `scenario.result` and one sample to `scenario.duration`, for its own
 *   final attempt only (INV-EC-008).
 * - A Scenario's own per-Scenario/shared Layer, and `TestClock`/`TestConsole`/`Attachments`, are all
 *   provided INSIDE `buildScenarioEffect`'s own `Effect.provide` or around `self()` at the
 *   `VitestTestApi.ts` seam — either way, strictly BELOW where this wrapper's own `Metric.update`
 *   calls run. `effect/Metric`'s `MetricRegistry` is ambient (a process-wide `Context.Reference`,
 *   `Metric.ts`'s own doc comment), so this wrapper needs nothing from any Scenario-scoped Layer and
 *   is unaffected by whichever of those is or isn't in scope.
 *
 * **The `TestClock` caveat.** Every Scenario runs under the ambient SIMULATED `TestClock`
 * (ADR-EC-018) — `Effect.timed` (which `withScenarioMetrics` uses) reads
 * `Clock.monotonicTimeNanosUnsafe()`, which `TestClock` overrides, so `scenario.duration` reads ~0ms
 * unless a step itself calls `TestClock.adjust(...)`. This is a real, documented limitation of running
 * under a simulated clock, not a bug in this wrapper — and per ADR-EC-034's own "fourth finding", the
 * simulated clock is not reset between a `@retry` Scenario's own attempts either, so a retried
 * Scenario's one recorded duration sample reflects however much simulated time its LAST attempt
 * observed, cumulative with whatever earlier attempts already advanced.
 */
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Metric from "effect/Metric"
import type * as Scope from "effect/Scope"

/**
 * Wall-clock (simulated-clock, per the `TestClock` caveat above) duration of one Scenario's composed
 * Effect — `Before` hooks through `After` hooks, and every `@retry` attempt if retried, since this
 * metric is recorded around the Scenario's TERMINAL outcome only, never per attempt.
 */
export const scenarioDuration = Metric.timer("effect_cucumber.scenario.duration", {
  description:
    "Wall-clock duration of one Scenario's composed Effect (Before hooks through After hooks). Recorded once per Scenario, for its terminal outcome only — a @retry'd Scenario's earlier failed attempts contribute no separate sample."
})

/**
 * One increment per Scenario's terminal outcome, tagged `outcome: "pass" | "fail"` via
 * `Metric.withAttributes` at record time (this rc's replacement for a `tagged` counter constructor —
 * see the module doc comment). A `@retry`'d Scenario contributes exactly ONE increment, for its final
 * attempt's outcome, never one per attempt.
 */
export const scenarioResult = Metric.counter("effect_cucumber.scenario.result", {
  description:
    "One increment per Scenario's terminal outcome, tagged outcome: pass|fail. A @retry'd Scenario contributes exactly one increment, for its final outcome only — never one per attempt."
})

/**
 * Wraps a Scenario's already-composed Effect — the value `VitestTestApi.ts` is about to hand to
 * `it.effect`, `@retry`'s `flakyTest` already applied if the Scenario carries that tag — and records
 * both metrics around its TERMINAL `Exit`, then re-raises that same `Exit` unchanged so normal Effect
 * semantics (a failing Scenario still fails) are preserved. See the module doc comment for exactly
 * where this must compose relative to `flakyTest`, and why.
 */
export const withScenarioMetrics = (
  scenarioEffect: Effect.Effect<void, unknown, Scope.Scope>
): Effect.Effect<void, unknown, Scope.Scope> =>
  Effect.gen(function*() {
    const [duration, exit] = yield* Effect.timed(Effect.exit(scenarioEffect))
    yield* Metric.update(scenarioDuration, duration)
    yield* Metric.update(
      Metric.withAttributes(scenarioResult, { outcome: Exit.isSuccess(exit) ? "pass" : "fail" }),
      1
    )
    return yield* exit
  })

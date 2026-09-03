/**
 * SPIKE for GitHub issue #26 — NOT part of the shipped package surface. Ambient `Metric`
 * instrumentation at the Scenario emission boundary, per `research/effect-testing-ecosystem-survey.md`
 * §4's recommendation. Thrown away with branch `spike/metric-wiring`; never intended to land as-is.
 *
 * The two `Metric`s and the one wrapper below are meant to sit around the OUTPUT of
 * `ScenarioEffect.ts#buildScenarioEffect` — i.e. `Runner.ts`'s own two call sites — not inside it.
 * `ScenarioEffect.ts` itself is untouched by this spike.
 *
 * Composition-order finding (the point `research/vitest-retry-and-layer-rebuild.md` asked this spike
 * to settle): wrap the ALREADY-COMPOSED Scenario Effect that `buildScenarioEffect` returns, i.e.
 * OUTSIDE its own `Effect.provide(args.layer)` and `Effect.onExit(After hooks)` — not folded into
 * `buildScenarioEffect`'s own pipe chain. Two independent reasons landed on the same answer:
 *
 * 1. `Metric` is ambient — `Metric.MetricRegistry` is a `Context.Reference` with a process-wide
 *    default `Map`, present in every Effect's context with no provide needed. Wrapping outside
 *    `Effect.provide(args.layer)` means this wrapper adds nothing to what the per-Scenario Layer
 *    must supply; folding it inside `buildScenarioEffect` would work too (Metric needs nothing from
 *    that Layer either), but wrapping outside is the smaller, less invasive change AND is the only
 *    placement that also satisfies point 2.
 * 2. Retries (issue #13, still locked-but-not-landed). `research/vitest-retry-and-layer-rebuild.md`
 *    found two retry mechanisms `@effect/vitest@4.0.0-rc.112` actually exposes:
 *      - `flakyTest`-style: a combinator over an already-built Effect VALUE
 *        (`Effect.retry` wrapping `buildScenarioEffect(...)`'s return value, called from inside the
 *        thunk `Runner.ts` hands to `TestApi.effect`).
 *      - vitest's own native per-test `retry` (a `TestOptions` field): re-invokes the WHOLE THUNK
 *        passed to `it.effect` on each attempt, independently of anything inside it.
 *    For the `flakyTest` shape, this wrapper MUST sit OUTSIDE the retry combinator — i.e. the
 *    eventual wiring must be `withScenarioMetrics(Effect.flakyTest(buildScenarioEffect(...)))`, never
 *    `Effect.flakyTest(withScenarioMetrics(buildScenarioEffect(...)))`. Reversed, a Scenario that
 *    fails twice and passes on its third attempt would bump `scenario.result` three times (two
 *    `outcome: "fail"`, one `outcome: "pass"`) instead of recording the ONE terminal outcome a
 *    dashboard reader expects — and `scenario.duration` would record three partial-attempt timings
 *    instead of one end-to-end duration. Composing outside the retry, as this module already does
 *    relative to `buildScenarioEffect`, gets this right automatically: whatever `Effect.exit` sees is
 *    already the fully-retried, terminal outcome.
 *    For vitest's OWN native retry, no Effect-level wrapper — this one included — can distinguish
 *    "attempt 1 of 3" from "the final attempt," because the thunk itself re-runs from scratch each
 *    time and nothing survives between invocations except what `Runner.ts`/`VitestTestApi.ts`
 *    themselves close over. Getting a single terminal count under THAT mechanism needs a
 *    closure-scoped attempt counter at the `Runner.ts` emission call site (future work, contingent on
 *    #13 picking that mechanism) — not something expressible inside `buildScenarioEffect`'s return
 *    value at all. Recorded here as an honest limit of this spike's design, not solved by it.
 *
 * A future `scenario.attempt` counter (bumped once per attempt rather than once per terminal
 * outcome, tracking flakiness per `research/effect-testing-ecosystem-survey.md` §4's closing
 * paragraph) is a SEPARATE metric belonging INSIDE the retry loop — not a change to this wrapper.
 */
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Metric from "effect/Metric"
import type * as Scope from "effect/Scope"

/**
 * Wall-clock duration of one Scenario's fully-composed Effect — Before hooks through After hooks,
 * success or failure alike. A `Histogram<Duration.Duration>`; `Metric.value` returns a
 * `HistogramState` (`count`, `min`, `max`, `sum`, `buckets`).
 */
export const scenarioDuration = Metric.timer("effect_cucumber.scenario.duration", {
  description:
    "SPIKE (issue #26): wall-clock duration of one Scenario's composed Effect (Before hooks through After hooks)."
})

/**
 * One increment per Scenario TERMINAL outcome, tagged `outcome: "pass" | "fail"` via
 * `Metric.withAttributes` at record time (this rc's `Metric.tagged` equivalent — `effect@4.0.0-rc.112`
 * has no top-level `Metric.tagged`/`Metric.increment`/`Metric.trackDuration`; those are v3 names).
 */
export const scenarioResult = Metric.counter("effect_cucumber.scenario.result", {
  description: "SPIKE (issue #26): one increment per Scenario's terminal outcome, tagged by outcome (pass/fail)."
})

/**
 * Wrap an already-composed Scenario Effect — the return value of `buildScenarioEffect`, unmodified —
 * with the timer and counter above. Preserves the wrapped Effect's success/failure exactly: the
 * `Effect.exit`/re-raise round-trip only OBSERVES the outcome to record it, it never recovers from
 * failure or changes what the caller sees.
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

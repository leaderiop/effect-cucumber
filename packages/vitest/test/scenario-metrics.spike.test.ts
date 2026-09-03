/**
 * SPIKE for GitHub issue #26 — NOT part of the shipped package surface, thrown away with branch
 * `spike/metric-wiring`. Runs `../src/ScenarioMetrics.ts#withScenarioMetrics` for real, wrapped
 * around the REAL, unmodified `buildScenarioEffect` from `../src/ScenarioEffect.ts` — the same
 * function `Runner.ts` calls at its own emission boundary (see this branch's diff to `Runner.ts`
 * for the actual wiring) — against one passing and one failing Scenario, and asserts the recorded
 * `Metric.value`s are what a human reading a real backend would expect.
 *
 * Isolation: `Metric.MetricRegistry`'s default is a process-wide shared `Map` (confirmed by reading
 * `node_modules/effect/src/Metric.ts`'s own doc comment: "the default Map is shared by contexts that
 * do not provide an override"), so this test provides its OWN fresh `Map` — exactly the isolation
 * mechanism `Metric.ts`'s doc comment recommends — to keep its counts independent of whatever else
 * runs in the same vitest worker process.
 */
import { assert, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Layer from "effect/Layer"
import * as Metric from "effect/Metric"
import * as Option from "effect/Option"
import * as TestClock from "effect/testing/TestClock"
import type { HookSet } from "../src/Hook.ts"
import type { PlannedStep, ScenarioPlan, StepBody } from "../src/Plan.ts"
import { buildScenarioEffect } from "../src/ScenarioEffect.ts"
import { scenarioDuration, scenarioResult, withScenarioMetrics } from "../src/ScenarioMetrics.ts"

const emptyHooks: HookSet = {
  Before: [],
  After: [],
  BeforeStep: [],
  AfterStep: [],
  BeforeAllScenarios: [],
  AfterAllScenarios: []
}

const resolved = (name: string, body: StepBody): PlannedStep => ({
  _tag: "Resolved",
  step: { text: name, line: 1, keyword: "When", origin: "scenario", pattern: name, body, args: [] }
})

const planOf = (name: string, steps: ReadonlyArray<PlannedStep>): ScenarioPlan => ({
  scenarioId: name,
  name,
  astName: name,
  ruleId: Option.none(),
  tags: [],
  steps
})

// `it.effect` provides `TestClock.layer()` (ADR-EC-018's ambient clock, per `VitestTestApi.ts`'s own
// ADR-EC-018 note and this package's `docs/testclock-nested-layer-footgun` fix) — a SIMULATED clock
// that never advances on its own. `Effect.sleep` under it would suspend forever rather than resolve,
// so a step that wants `Metric.timer`'s elapsed-time reading to be nonzero must advance the virtual
// clock itself with `TestClock.adjust`, which runs synchronously (no real wall-clock wait, no hang).
// This is itself a spike finding, not incidental test plumbing — see the writeup's "composition
// finding" section.
const passingStep: StepBody = () => TestClock.adjust("5 millis")
const failingStep: StepBody = () =>
  Effect.gen(function*() {
    yield* TestClock.adjust("5 millis")
    return yield* Effect.fail(new Error("boom — deliberate spike failure"))
  })

it.effect(
  "SPIKE issue #26: withScenarioMetrics records a duration + a pass/fail counter, at buildScenarioEffect's own emission boundary, for a real passing and a real failing Scenario",
  () =>
    Effect.provideService(
      Effect.gen(function*() {
        const passingPlan = planOf("a passing Scenario", [resolved("a step that succeeds", passingStep)])
        const failingPlan = planOf("a failing Scenario", [resolved("a step that fails", failingStep)])

        const passExit = yield* Effect.exit(
          withScenarioMetrics(buildScenarioEffect({ plan: passingPlan, layer: Layer.empty, hooks: emptyHooks }))
        )
        const failExit = yield* Effect.exit(
          withScenarioMetrics(buildScenarioEffect({ plan: failingPlan, layer: Layer.empty, hooks: emptyHooks }))
        )

        // The wrapper must not change what the caller observes: pass stays a pass, fail stays a
        // fail, and the failure's own cause is untouched.
        assert.isTrue(Exit.isSuccess(passExit))
        assert.isTrue(Exit.isFailure(failExit))

        const passCount = yield* Metric.value(Metric.withAttributes(scenarioResult, { outcome: "pass" }))
        const failCount = yield* Metric.value(Metric.withAttributes(scenarioResult, { outcome: "fail" }))
        const durationState = yield* Metric.value(scenarioDuration)

        // THE load-bearing assertions: one terminal counter bump per Scenario, correctly tagged —
        // not two, not zero, and not cross-tagged.
        assert.strictEqual(passCount.count, 1)
        assert.strictEqual(failCount.count, 1)
        // Both Scenarios recorded a duration sample, success and failure alike (the timer sits
        // around Effect.exit, which never itself fails).
        assert.strictEqual(durationState.count, 2)
        // Each step advanced the (simulated) TestClock by 5ms, so `Metric.timer`'s elapsed reading —
        // which reads `Clock.currentTimeMillis`, and `it.effect` overrides `Clock` with `TestClock`
        // — should reflect that, even though no real wall-clock time passed at all.
        assert.isTrue(durationState.min > 0)
        assert.isTrue(durationState.max > 0)

        // eslint-disable-next-line no-console
        console.log("[spike/metric-wiring] recorded scenario.result:", { passCount, failCount })
        // eslint-disable-next-line no-console
        console.log("[spike/metric-wiring] recorded scenario.duration:", durationState)
      }),
      Metric.MetricRegistry,
      new Map()
    )
)

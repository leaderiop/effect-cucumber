/**
 * Acceptance pair for ADR-EC-037 / BEH-EC-029 / INV-EC-008: `metrics.feature` run through the real
 * `describeFeature`, proving — from OUTSIDE the Scenario's own Effect, since a Scenario's terminal
 * metric is recorded only AFTER its own `it.effect` completes, so no step body could ever read its
 * OWN Scenario's contribution — that:
 *
 * 1. A plain passing Scenario contributes exactly one `outcome: "pass"` increment to
 *    `effect_cucumber.scenario.result` and one sample to `effect_cucumber.scenario.duration`.
 * 2. A Scenario tagged `@retry` whose step fails on its first attempt and passes on its second
 *    contributes exactly ONE MORE `outcome: "pass"` increment — never an `outcome: "fail"` increment
 *    for the failed first attempt, and never two passes for the one Scenario. This is the test that
 *    validates the whole point of ADR-EC-037's correction: `VitestTestApi.ts`'s metrics wrapper
 *    composes OUTSIDE `flakyTest` (ADR-EC-034), so `Effect.exit` inside `withScenarioMetrics` only
 *    ever observes the Scenario's FINAL, already-retried outcome.
 *
 * A REAL failing Scenario cannot appear here — this directory's own README states the acceptance
 * suite produces "real passing `it.effect` tests", and a Scenario that stayed failed would turn
 * `pnpm test` red. The "a failing Scenario records one fail" half of this feature's proof therefore
 * lives in `packages/vitest/test/ScenarioMetrics.test.ts` instead, which drives `withScenarioMetrics`
 * directly against a synthetic failing Effect and captures its `Exit` as a VALUE — the same technique
 * `research/metric-wiring-spike.md`'s own standalone test used (an isolated `Metric.MetricRegistry`,
 * `Metric.value` for real assertions), and the same shape
 * `../negative-requirements.test.ts` already uses for a requirement a green Scenario cannot state.
 * That same file also proves the ORDER matters at all — a demonstration mutation showing the WRONG
 * composition (`flakyTest` outside the metrics wrapper) really does double-count a retried attempt.
 *
 * **Isolation, and why this pair does NOT provide its own `Metric.MetricRegistry` the way
 * `ScenarioMetrics.test.ts` does.** `MetricRegistry` is a process-wide `Context.Reference`
 * (`effect/Metric`'s own doc comment); `VitestTestApi.ts`'s metrics wrapper composes OUTSIDE
 * `buildScenarioEffect`'s own `Effect.provide(effectiveLayer)` (both the `perScenario` and `shared`
 * tiers are provided strictly BELOW the seam point this wrapper runs at — see `VitestTestApi.ts`'s own
 * header note), so nothing this Feature's own Layer argument provides could ever reach the wrapper's
 * `Metric.update` calls to override the registry they read. This observer therefore reads the SAME
 * default registry the production wrapper writes to, relying on vitest's own per-file module
 * isolation (this file's two Scenarios are its only contributors to `effect_cucumber.scenario.*`) —
 * a real, disclosed difference from `ScenarioMetrics.test.ts`'s unit-level isolation, forced by the
 * fact that a Scenario running through the REAL seam has no way to inject a registry override the
 * wrapper would ever see.
 *
 * The observer block below sits in the SAME unshuffled block as the `describeFeature` call that
 * produces the Scenarios it reads (AGENTS.md §5's "an observer `describe` that reads what an earlier
 * suite recorded sits in the same unshuffled block as that suite, never as a later sibling"), mirroring
 * `../../test/emission.test.ts`'s own `orderedBlock` technique.
 */
import { assert, describe, it } from "@effect/vitest"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Metric from "effect/Metric"
import * as Ref from "effect/Ref"
import { fileURLToPath } from "node:url"
import { describeFeature } from "../../src/describeFeature.ts"
import { loadFeature } from "../../src/loadFeature.ts"
import { scenarioDuration, scenarioResult } from "../../src/ScenarioMetrics.ts"

// The `.feature` file beside this one, resolved relative to this module rather than to `process.cwd()`.
const featurePath = fileURLToPath(new URL("./metrics.feature", import.meta.url))

// Real bytes off disk, through the real parser, at module top level.
const feature = await loadFeature(featurePath)

// A name-less, UNSHUFFLED block — the identical shape `emission.test.ts`'s own `orderedBlock` uses,
// so the `describeFeature` call and the observer block below that reads what it recorded stay
// adjacent under `pnpm test:shuffle` (AGENTS.md §5).
const unshuffledSuite: typeof describe = describe
const orderedBlock = (block: () => void): void => {
  unshuffledSuite("", { shuffle: false }, block)
}

// SHARED tier (INV-EC-006): state that must survive a `@retry` Scenario's own attempts cannot live in
// the `perScenario` tier, which ADR-EC-034 rebuilds fresh every attempt on purpose — the identical
// reason `retry.steps.test.ts`'s own `Counters` service lives on the shared tier.
class RetryAttempts extends Context.Service<RetryAttempts, {
  readonly count: Ref.Ref<number>
}>()("MetricsRetryAttempts") {
  static readonly layer = Layer.effect(
    this,
    Effect.gen(function*() {
      return RetryAttempts.of({ count: yield* Ref.make(0) })
    })
  )
}

orderedBlock(() => {
  // THE CALL UNDER TEST.
  describeFeature(feature, { shared: RetryAttempts.layer, perScenario: Layer.empty }, ({ Scenario }) => {
    Scenario("A passing scenario runs cleanly", ({ Given }) => {
      Given("a step that succeeds", function*() {
        yield* Effect.void
      })
    })

    Scenario("A flaky step fails once then passes, and the retry is not double-counted", ({ Given }) => {
      Given("the step fails on the first attempt and passes on the second", function*() {
        const retryAttempts = yield* RetryAttempts
        const attempt = yield* Ref.updateAndGet(retryAttempts.count, (n) => n + 1)
        if (attempt === 1) {
          assert.fail("deliberate failure on the first attempt, to prove @retry recovers")
        }
      })
    })
  })

  describe("Effect.Metric at the Scenario emission boundary (ADR-EC-037, BEH-EC-029, INV-EC-008)", () => {
    it.effect(
      "records exactly TWO pass increments — the plain Scenario and the retried one's SINGLE terminal outcome — and NO fail increment for the retried Scenario's failed first attempt",
      () =>
        Effect.gen(function*() {
          const passState = yield* Metric.value(Metric.withAttributes(scenarioResult, { outcome: "pass" }))
          const failState = yield* Metric.value(Metric.withAttributes(scenarioResult, { outcome: "fail" }))

          assert.strictEqual(passState.count, 2)
          assert.strictEqual(failState.count, 0)
        })
    )

    it.effect("records one duration sample per Scenario — two total, never three", () =>
      Effect.gen(function*() {
        const durationState = yield* Metric.value(scenarioDuration)

        assert.strictEqual(durationState.count, 2)
      }))
  })
})

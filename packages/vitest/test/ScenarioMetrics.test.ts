/**
 * Unit tests for `ScenarioMetrics.ts` (ADR-EC-037, BEH-EC-029, INV-EC-008), following
 * `research/metric-wiring-spike.md`'s own proof technique: drive `withScenarioMetrics` directly
 * against synthetic Scenario Effects and read the recorded state back with `Metric.value`. Real
 * assertions against the real installed `effect@4.0.0-rc.112` API, not simulated.
 *
 * `VitestTestApi.ts`'s own real composition — where `withScenarioMetrics` actually gets applied, and
 * in what order relative to `withRetry`'s `flakyTest` — is proven separately, through the REAL
 * running framework: `packages/vitest/test/acceptance/metrics.feature`/`.steps.test.ts` (`REQ-EC-029`)
 * is the crux of ADR-EC-037's correction — a `@retry`'d Scenario records exactly ONE terminal outcome
 * — and `packages/vitest/test/Runner.test.ts`'s "EmitOptions.scenario marks a real Scenario, not a
 * warning node" block proves `Runner.ts`'s own half of the seam data this file's wrapper is applied
 * against.
 *
 * A REAL failing Scenario cannot appear in the acceptance suite — its own README states the suite
 * produces "real PASSING `it.effect` tests", and a Scenario that stayed failed would turn `pnpm test`
 * red. The "records one fail" half of this feature's proof therefore lives HERE instead, captured as
 * a VALUE via `Effect.exit`, the same technique
 * `packages/vitest/test/acceptance/negative-requirements.test.ts` already uses for a requirement a
 * green Scenario cannot state.
 *
 * **Isolation, and a real finding running this for real surfaced beyond what the spike needed.** The
 * spike's own standalone test provided a FRESH `Metric.MetricRegistry` per run
 * (`Effect.provideService(effect, Metric.MetricRegistry, new Map())`, `Metric.ts`'s own documented
 * technique) and never touched a single UNTAGGED metric object across more than one such run. This
 * file does, since it exercises `scenarioDuration` (untagged) across several separate tests — and
 * doing so for real surfaced that this rc's `Metric$#hook` caches an UNTAGGED metric's hooks on its
 * FIRST use (`this.#metadata`, `Metric.ts` internal) and never re-consults `MetricRegistry` from
 * context again afterward, so a later test's `Effect.provideService` override is silently ignored for
 * `scenarioDuration` specifically (confirmed by reading `Metric.ts`'s own `hook()` after this file's
 * assertions failed against the isolation technique alone). `scenarioResult` is unaffected — each
 * `Metric.withAttributes(scenarioResult, {...})` call below passes a FRESH attributes object, which
 * misses `Metric$`'s attribute-keyed `WeakMap` cache every time and genuinely re-consults the ambient
 * registry, so `Effect.provideService` isolation is real and load-bearing for the counter assertions
 * (kept below), just not for the histogram ones. `scenarioDuration`'s own assertions therefore use a
 * BEFORE/AFTER delta instead of an absolute count, which is correct regardless of this caching
 * behavior and needs no isolation at all.
 */
import { assert, describe, flakyTest, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Metric from "effect/Metric"
import type * as Scope from "effect/Scope"
import { scenarioDuration, scenarioResult, withScenarioMetrics } from "../src/ScenarioMetrics.ts"

// Isolation for the COUNTER only — see the module doc comment for why `scenarioDuration` cannot use
// this and uses a delta instead.
const isolated = <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
  Effect.provideService(effect, Metric.MetricRegistry, new Map())

const resultCount = (outcome: "fail" | "pass") =>
  Effect.map(Metric.value(Metric.withAttributes(scenarioResult, { outcome })), (state) => state.count)

const durationCount = Effect.map(Metric.value(scenarioDuration), (state) => state.count)

describe("withScenarioMetrics", () => {
  it.effect("records one pass increment and one duration sample for a Scenario that succeeds", () =>
    isolated(Effect.gen(function*() {
      const passing: Effect.Effect<void, unknown, Scope.Scope> = Effect.void
      const durationBefore = yield* durationCount

      yield* withScenarioMetrics(passing)

      assert.strictEqual(yield* resultCount("pass"), 1)
      assert.strictEqual(yield* resultCount("fail"), 0)
      assert.strictEqual((yield* durationCount) - durationBefore, 1)
    })))

  it.effect(
    "records one fail increment (never a pass), and still re-raises the original failure, for a Scenario that fails",
    () =>
      isolated(Effect.gen(function*() {
        const failing: Effect.Effect<void, unknown, Scope.Scope> = Effect.fail("boom")
        const durationBefore = yield* durationCount

        const exit = yield* Effect.exit(withScenarioMetrics(failing))

        assert.isTrue(Exit.isFailure(exit))
        assert.strictEqual(yield* resultCount("fail"), 1)
        assert.strictEqual(yield* resultCount("pass"), 0)
        assert.strictEqual((yield* durationCount) - durationBefore, 1)
      }))
  )

  it.effect(
    "wrapping OUTSIDE flakyTest (VitestTestApi.ts's real composition) records exactly ONE terminal outcome for a Scenario that fails once then passes — never one per attempt",
    () =>
      isolated(Effect.gen(function*() {
        let attempt = 0
        const flaky: Effect.Effect<void, unknown, Scope.Scope> = Effect.suspend(() => {
          attempt += 1
          return attempt === 1 ? Effect.fail("deliberate failure on the first attempt") : Effect.void
        })
        const durationBefore = yield* durationCount

        // Mirrors `VitestTestApi.ts`'s real `withMetrics(scenario, withRetry(retry, self))` composition
        // exactly: `flakyTest` wraps the retried Effect first, and only THEN does `withScenarioMetrics`
        // wrap flakyTest's own result — never the reverse (ADR-EC-037).
        yield* Effect.exit(withScenarioMetrics(flakyTest(flaky)))

        assert.strictEqual(attempt, 2, "flakyTest retried exactly once, so the step body ran twice")
        assert.strictEqual(yield* resultCount("pass"), 1)
        assert.strictEqual(yield* resultCount("fail"), 0)
        assert.strictEqual(
          (yield* durationCount) - durationBefore,
          1,
          "one duration sample for the whole retried run, not one per attempt"
        )
      }))
  )

  it.effect(
    "the WRONG order — flakyTest OUTSIDE withScenarioMetrics — really does double-count, which is exactly why ADR-EC-037 forbids it (a demonstration, never the production composition)",
    () =>
      isolated(Effect.gen(function*() {
        let attempt = 0
        const flaky: Effect.Effect<void, unknown, Scope.Scope> = Effect.suspend(() => {
          attempt += 1
          return attempt === 1 ? Effect.fail("deliberate failure on the first attempt") : Effect.void
        })
        const durationBefore = yield* durationCount

        // The composition `VitestTestApi.ts` never performs: metrics INSIDE the retried region, so
        // every attempt records its OWN terminal Exit.
        yield* Effect.exit(flakyTest(withScenarioMetrics(flaky)))

        assert.strictEqual(attempt, 2)
        assert.strictEqual(yield* resultCount("fail"), 1, "the failed first attempt WAS separately counted")
        assert.strictEqual(yield* resultCount("pass"), 1)
        assert.strictEqual(
          (yield* durationCount) - durationBefore,
          2,
          "two duration samples for one Scenario — the double-counting this design avoids"
        )
      }))
  )
})

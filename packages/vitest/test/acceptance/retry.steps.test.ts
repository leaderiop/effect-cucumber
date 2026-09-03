/**
 * Acceptance pair for ADR-EC-034 / BEH-EC-026: `retry.feature` run through the real `describeFeature`, proving
 * from INSIDE running steps that a Scenario tagged `@retry` whose step fails on its first attempt and passes on
 * a later one is reported PASSING overall — not failing, not flaky-and-red — and that its per-Scenario Layer
 * really does rebuild fresh for EVERY attempt, not only the first, mirroring `emission.test.ts`'s counter-based
 * "build once" proof technique for "build once per attempt" instead.
 *
 * Carries: ADR-EC-009, ADR-EC-034, BEH-EC-026, REQ-EC-026.
 *
 * Deliberate choices this pair proves at once, following `outline-typed-column.steps.test.ts`'s shape where it
 * applies:
 *
 * 1. This pair's own attempt/build counters live in `Counters`, a **shared**-tier `Context.Service`
 *    (`describeFeature`'s `{ shared, perScenario }` form, BEH-EC-007) — never a module-scope `let` or a bare
 *    module-scope `Ref` standing in for one, which `packages/vitest/test/acceptance/README.md`'s "Every
 *    cross-step value lives in a Ref obtained from a Layer-provided service" section forbids outright, closing
 *    exactly the escape hatch a module-scope holder would otherwise be. `Counters` is the RIGHT Layer tier for
 *    this specific job, not merely a way around the rule: state that must survive a Scenario's OWN retry
 *    attempts cannot live in the `perScenario` tier (which ADR-EC-034 rebuilds fresh every attempt, on
 *    purpose), so the `shared` tier — proven build-once even under `@retry` by the same ADR's design question 1
 *    — is where it belongs. `World` (the `perScenario` tier) depends on `Counters` to number its own builds,
 *    exactly the "`perScenario` MAY require a service the `shared` tier provides" shape BEH-EC-007 already
 *    documents.
 * 2. `observedBuildOrdinals` is this pair's own independent build-count evidence, hand-recorded from inside the
 *    running `Given` step every attempt — not derived from `World` after the fact, so a wiring bug that skipped
 *    rebuilding the Layer (or rebuilt it but never actually delivered the fresh instance to the step) cannot
 *    make the final assertion pass by construction.
 * 3. The failing FIRST attempt calls `assert.fail(...)` — a real thrown `AssertionError`, the same failure lane
 *    `outline-typed-column`'s sibling pairs and this repository's own worked examples already teach, not a
 *    typed `Effect.fail`. `flakyTest`'s `Effect.sandbox` catches it regardless of which lane it took (ADR-EC-034
 *    cites `StepFailureLocation`'s own `withStepFailureLocation` covering both lanes for the identical reason).
 *
 * Mutation record (performed, run, and reverted — nothing from either remains in this commit):
 *
 * - **A** — removed the `@retry` tag from `retry.feature`'s Scenario, leaving everything else unchanged. The
 *   Scenario turned RED (`AssertionError: deliberate failure on the first attempt...`), because a single,
 *   un-retried attempt now runs the step exactly once and that one attempt still fails. This is what proves the
 *   Scenario passing in the real commit is `@retry`'s doing, not the step body quietly always succeeding.
 * - **B** — changed this file's `World.layer` to build through `Layer.succeed` (a Layer that hands back one
 *   FIXED value, never re-running an acquisition Effect) instead of `Layer.effect`, hard-coding
 *   `buildOrdinal: 1`. The Scenario still turned RED, but not the way a first guess predicts — worth recording
 *   exactly what happened rather than the tidier prediction: attempt 2's `observedBuildOrdinals` read `[1, 1]`
 *   instead of `[1, 2]`, so the SAME `Then` step's own `assert.deepStrictEqual` throws on attempt 2 too — which
 *   `flakyTest` treats as one more Scenario failure and retries again, appending yet another `1` and
 *   incrementing the SHARED `stepAttempts` counter each time, all the way to `Schedule.recurs(10)`'s cap. The
 *   final reported failure was therefore `AssertionError: expected 11 to equal 2` (`stepAttempts`, not
 *   `observedBuildOrdinals`) — the retry loop never converges when the Layer never changes, because every
 *   attempt after the first keeps failing the SAME assertion it failed on attempt 2, right up to the attempt
 *   cap. Both assertions in this pair's `Then` step are load-bearing for this reason: an implementation that
 *   silently stopped rebuilding the `perScenario` Layer would not merely produce a quieter wrong answer, it
 *   would make the Scenario un-passable within `flakyTest`'s own attempt budget.
 */
import { assert } from "@effect/vitest"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Ref from "effect/Ref"
import { fileURLToPath } from "node:url"
import { describeFeature } from "../../src/describeFeature.ts"
import { loadFeature } from "../../src/loadFeature.ts"

// The `.feature` file beside this one, resolved relative to this module rather than to `process.cwd()`, so the pair
// keeps working whichever directory the runner was invoked from.
const featurePath = fileURLToPath(new URL("./retry.feature", import.meta.url))

// Real bytes off disk, through the real parser, at module top level.
const feature = await loadFeature(featurePath)

// The SHARED tier (choice 1 above): counters that must survive across a Scenario's own `@retry` attempts, which
// the `perScenario` tier — rebuilt fresh every attempt by design (ADR-EC-034) — structurally cannot hold.
class Counters extends Context.Service<Counters, {
  readonly worldBuilds: Ref.Ref<number>
  readonly stepAttempts: Ref.Ref<number>
  readonly observedBuildOrdinals: Ref.Ref<ReadonlyArray<number>>
}>()("Counters") {
  static readonly layer = Layer.effect(
    this,
    Effect.gen(function*() {
      return Counters.of({
        worldBuilds: yield* Ref.make(0),
        stepAttempts: yield* Ref.make(0),
        observedBuildOrdinals: yield* Ref.make<ReadonlyArray<number>>([])
      })
    })
  )
}

// Per-Scenario, fresh for every ATTEMPT under `@retry` (ADR-EC-034) — one field naming which build this attempt
// got, numbered through the SHARED `Counters.worldBuilds` Ref so the tally itself survives every attempt even
// though `World` does not.
class World extends Context.Service<World, { readonly buildOrdinal: number }>()("World") {
  static readonly layer = Layer.effect(
    this,
    Effect.gen(function*() {
      const counters = yield* Counters
      const ordinal = yield* Ref.updateAndGet(counters.worldBuilds, (n) => n + 1)
      return World.of({ buildOrdinal: ordinal })
    })
  )
}

// THE CALL UNDER TEST.
describeFeature(feature, { shared: Counters.layer, perScenario: World.layer }, ({ Scenario }) => {
  Scenario("A flaky step passes on retry and rebuilds its Layer fresh", ({ Given, Then, When }) => {
    Given("the per-scenario Layer build ordinal is observed", function*() {
      const world = yield* World
      const counters = yield* Counters
      yield* Ref.update(counters.observedBuildOrdinals, (seen) => [...seen, world.buildOrdinal])
    })

    When("the step fails on the first attempt and passes on the second", function*() {
      const counters = yield* Counters
      const attempts = yield* Ref.updateAndGet(counters.stepAttempts, (n) => n + 1)
      if (attempts === 1) {
        // Choice 3 above: a real thrown AssertionError, the common real-world failure lane.
        assert.fail("deliberate failure on the first attempt, to prove @retry recovers")
      }
    })

    Then("the scenario is reported passing and the Layer was built fresh for each attempt", function*() {
      const counters = yield* Counters
      // Reaching this step at all is half the proof: a Scenario whose every attempt fails would never get here,
      // and vitest would report it FAILING — reaching this Then, on the real running framework, is what makes
      // "reported passing" a claim this test can state at all, not merely assert about its own inputs.
      assert.strictEqual(yield* Ref.get(counters.stepAttempts), 2)
      // The build-once-per-ATTEMPT half: two attempts, two DIFFERENT Layer builds, never the same instance reused.
      assert.deepStrictEqual(yield* Ref.get(counters.observedBuildOrdinals), [1, 2])
    })
  })
})

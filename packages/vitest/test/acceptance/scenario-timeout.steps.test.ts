/**
 * Acceptance pair for ADR-EC-040 / BEH-EC-032 / REQ-EC-032: `scenario-timeout.feature` run through
 * the real `describeFeature`, proving the `@timeout-<ms>` tag reaches real registration and
 * execution end to end — real `Tags.ts` parsing, real `EmitOptions.timeout` threading across the
 * `TestApi` seam, real `it.effect(..., { timeout })` call in `VitestTestApi.ts` — without disrupting
 * either Scenario's own normal execution (the "positive control" this ADR's own §3 names: a Scenario
 * that DOES use the new tag compiles and runs exactly as any other Scenario would, just with a
 * different real timeout budget). An observer, in the SAME unshuffled block as the `describeFeature`
 * call (AGENTS.md §5), asserts BOTH Scenarios' steps actually ran — proof the tag was parsed
 * correctly (a malformed `@timeout-...` throws synchronously at REGISTRATION time, per
 * `Tags.ts`'s own `readScenarioTimeoutTag`, which would have kept this whole file from ever
 * collecting, not merely fail one Scenario).
 *
 * This pair proves the REGISTRATION/EMISSION half — the number reaches `it.effect` without breaking
 * anything. Proving real ENFORCEMENT (a timeout genuinely lowering or raising the real, wall-clock
 * budget vitest applies) does not fit a single acceptance Scenario that must also stay green under
 * `pnpm test` by construction — the same reason ADR-EC-038's `rerun-failed-only.feature` acceptance
 * pair proves only its READ side and leaves the real two-invocation half to a dedicated script. Real
 * enforcement, and BEH-EC-017 holding under real concurrent execution, is proven by
 * `scripts/verify-concurrent-execution.sh` against `packages/vitest/test/concurrent-fixture/` —
 * `timeout-cascade.steps.test.ts` there is the same `@timeout-100`/`@timeout-2000` shape, run for
 * real, with each Scenario's own REPORTED duration asserted structurally against the report's own
 * `--reporter=json` output.
 *
 * Carries: ADR-EC-040, BEH-EC-032, REQ-EC-032.
 */
import { assert, describe, it } from "@effect/vitest"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Ref from "effect/Ref"
import { fileURLToPath } from "node:url"
import { describeFeature } from "../../src/describeFeature.ts"
import { loadFeature } from "../../src/loadFeature.ts"

const featurePath = fileURLToPath(new URL("./scenario-timeout.feature", import.meta.url))
const feature = await loadFeature(featurePath)

// Built once, at module scope — a `const`, never a `let`/`var` (INV-EC-006) — and handed to BOTH the
// shared Layer below (so a step reaches it via `yield* TimeoutLog`) AND the observer at the bottom of
// this file, directly, so it reads the SAME instance rather than asking the framework to build the
// shared tier a second time (which a `Layer.effect` acquisition would do, handing the observer a
// fresh, empty Ref instead of the one Scenario steps actually wrote to — the identical pitfall
// `rerun-failed-only.steps.test.ts`'s own header comment names).
const sharedLogRef = Effect.runSync(Ref.make<ReadonlyArray<string>>([]))

// SHARED tier (INV-EC-006): the log must survive across both Scenarios' own `it.effect` nodes.
class TimeoutLog extends Context.Service<TimeoutLog, {
  readonly entries: Ref.Ref<ReadonlyArray<string>>
}>()("ScenarioTimeoutAcceptanceLog") {
  static readonly layer = Layer.succeed(this, TimeoutLog.of({ entries: sharedLogRef }))
}

// A name-less, UNSHUFFLED block — the identical shape `emission.test.ts`'s own `orderedBlock` and
// this directory's other acceptance pairs already use, so the `describeFeature` call and the
// observer below that reads what it recorded stay adjacent under `pnpm test:shuffle`.
const unshuffledSuite: typeof describe = describe
const orderedBlock = (block: () => void): void => {
  unshuffledSuite("", { shuffle: false }, block)
}

orderedBlock(() => {
  // THE CALL UNDER TEST: one Scenario tagged `@timeout-500`, one tagged `@timeout-30000` — two
  // genuinely different real timeout budgets, both well inside vitest's own default, so this pair
  // never depends on wall-clock timing to pass.
  describeFeature(feature, { shared: TimeoutLog.layer, perScenario: Layer.empty }, ({ Given, Then }) => {
    Given("the timeout log records {string}", function*(title: string) {
      const log = yield* TimeoutLog
      yield* Ref.update(log.entries, (entries) => [...entries, title])
    })
    Then("the timeout log contains {string}", function*(title: string) {
      const log = yield* TimeoutLog
      const entries = yield* Ref.get(log.entries)
      assert.ok(entries.includes(title))
    })
  })

  describe("@timeout-<ms> reaches real registration and execution without disrupting either Scenario (ADR-EC-040, BEH-EC-032)", () => {
    it.effect("both the short-@timeout and long-@timeout Scenarios ran their own steps to completion", () =>
      Effect.gen(function*() {
        const entries = yield* Ref.get(sharedLogRef)
        assert.deepStrictEqual([...entries].toSorted(), [
          "a scenario with a long timeout override runs normally",
          "a scenario with a short timeout override runs normally"
        ])
      }))
  })
})

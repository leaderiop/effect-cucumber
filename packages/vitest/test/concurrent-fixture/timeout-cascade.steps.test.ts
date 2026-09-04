/**
 * ADR-EC-040's real cross-run FIX proof, half 1 — the exact bug shape (a 400ms `BeforeAllScenarios`
 * shared by a `@timeout-100` Scenario and a `@timeout-2000` Scenario), run for real under this
 * fixture's own `sequence.concurrent: true` (`scripts/verify-concurrent-execution.sh`). Before this
 * ADR (a hand-rolled once-cell `BeforeAllScenarios` ran inside whichever Scenario's own body reached
 * it first), this exact shape reproduced the reported bug — see the ADR for the real, independently
 * captured `vitest run` transcript against the OLD mechanism: the short-timeout Scenario timed out as
 * expected, and the long-timeout Scenario ALSO failed with `InterruptError`, even though its own
 * 2000ms budget was never at risk. Both PASS here: a real vitest `beforeAll` completes, on its own
 * timeout budget, before either Scenario's body starts, so the 400ms setup never lands inside any
 * Scenario's own `testTimeout` window at all.
 */
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { fileURLToPath } from "node:url"
import { describeFeature } from "../../src/describeFeature.ts"
import { loadFeature } from "../../src/loadFeature.ts"

const featurePath = fileURLToPath(new URL("./timeout-cascade.feature", import.meta.url))
const feature = await loadFeature(featurePath)

describeFeature(feature, Layer.empty, ({ BeforeAllScenarios, When }) => {
  // A real 400ms setup — a real `setTimeout`, not `Effect.sleep`: each Scenario gets its own
  // simulated `TestClock`, so a shared setup's `Effect.sleep` would never advance on its own, and
  // `testTimeout` (what this fixture actually proves) is measured in REAL wall-clock time.
  BeforeAllScenarios(function*() {
    yield* Effect.promise(() => new Promise<void>((resolve) => setTimeout(resolve, 400)))
  })

  When("nothing happens", function*() {
    yield* Effect.void
  })
})

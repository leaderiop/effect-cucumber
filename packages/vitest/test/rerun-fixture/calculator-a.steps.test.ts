/**
 * ADR-EC-038 §6's cross-run fixture, half A: a Feature named `Calculator`, with a Scenario titled
 * "Adds two numbers", whose one step assertion is DELIBERATELY WRONG — always fails. Paired with
 * `calculator-b.steps.test.ts` (SAME Feature name, SAME Scenario title, in a DIFFERENT `.feature`
 * file, whose own assertion is correct), so `scripts/verify-rerun-failed-only.sh` can prove rough
 * edge 2's fix for real: the two Scenarios' rerun keys differ only in their `uri` component, so a
 * manifest built from a real failing run of both never collides the two.
 *
 * `rerunFailedOnly`/`rerunManifestPath` are driven entirely by environment variables, so the SAME
 * file serves every real `vitest run` invocation the verify script makes (the plain first run, and
 * the `RERUN_FAILED_ONLY=1` second run) with no code change between them.
 */
import { assert } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { fileURLToPath } from "node:url"
import { describeFeature } from "../../src/describeFeature.ts"
import { loadFeature } from "../../src/loadFeature.ts"
import { rerunOptionsFromEnv } from "./rerunOptions.ts"

const featurePath = fileURLToPath(new URL("./calculator-a.feature", import.meta.url))
const feature = await loadFeature(featurePath)

describeFeature(feature, Layer.empty, ({ Given, Then }) => {
  Given("the numbers 2 and 2", function*() {
    yield* Effect.void
  })
  // Deliberately wrong: 2 + 2 is 4, not 5. A real thrown `AssertionError`.
  Then("the sum is wrongly asserted to be 5", function*() {
    yield* Effect.void
    assert.strictEqual(2 + 2, 5)
  })
}, rerunOptionsFromEnv())

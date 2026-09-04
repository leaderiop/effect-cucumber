/**
 * ADR-EC-038 §6's cross-run fixture, half B: the SAME Feature name (`Calculator`) and the SAME
 * Scenario title ("Adds two numbers") as `calculator-a.steps.test.ts`, in a DIFFERENT `.feature`
 * file, whose own step assertion is CORRECT — always passes. See that file's header comment for the
 * full rationale.
 */
import { assert } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { fileURLToPath } from "node:url"
import { describeFeature } from "../../src/describeFeature.ts"
import { loadFeature } from "../../src/loadFeature.ts"
import { rerunOptionsFromEnv } from "./rerunOptions.ts"

const featurePath = fileURLToPath(new URL("./calculator-b.feature", import.meta.url))
const feature = await loadFeature(featurePath)

describeFeature(feature, Layer.empty, ({ Given, Then }) => {
  Given("the numbers 2 and 2", function*() {
    yield* Effect.void
  })
  Then("the sum is correctly asserted to be 4", function*() {
    yield* Effect.void
    assert.strictEqual(2 + 2, 4)
  })
}, rerunOptionsFromEnv())

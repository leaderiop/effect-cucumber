/**
 * `assertNoUnusedStepDefinitions` — the suite-wide half of ADR-EC-053's strict-mode design.
 *
 * Carries: ADR-EC-019, ADR-EC-053, BEH-EC-013.
 */
import { ParameterTypeStore, parseFeature } from "@effect-cucumber/gherkin"
import { assert, describe, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { collectFeature, type FeatureCollection } from "../src/describeFeature.ts"
import { assertNoUnusedStepDefinitions } from "../src/StrictMode.ts"

// A step body that touches no service, so it registers against any ambient Layer including empty.
const noop = function*() {
  yield* Effect.void
}

const feature = Effect.runSync(
  parseFeature(
    `Feature: Checkout
  Scenario: checkout
    When I pay
`,
    "test/StrictMode.feature"
  ).pipe(Effect.provide(ParameterTypeStore.Default))
)

// A `FeatureCollection` carrying exactly one unused-step-definition warning: `I pay` is registered
// (and used), `I never happen` is registered and matches nothing in this Feature.
const collectionWithWarning: FeatureCollection = collectFeature(feature, Layer.empty, ({ Given, When }) => {
  When("I pay", noop)
  Given("I never happen", noop)
})

// A `FeatureCollection` with no unused step definitions at all.
const collectionWithoutWarning: FeatureCollection = collectFeature(feature, Layer.empty, ({ When }) => {
  When("I pay", noop)
})

describe("assertNoUnusedStepDefinitions", () => {
  it("throws, naming the offending pattern, when any collected Feature carries an unused-step-definition warning", () => {
    assert.throws(
      () => assertNoUnusedStepDefinitions([collectionWithWarning, collectionWithoutWarning]),
      /I never happen/
    )
  })

  it("does not throw when no collected Feature carries an unused-step-definition warning", () => {
    assert.doesNotThrow(() => assertNoUnusedStepDefinitions([collectionWithoutWarning, collectionWithoutWarning]))
  })

  it("does not throw on an empty array", () => {
    assert.doesNotThrow(() => assertNoUnusedStepDefinitions([]))
  })
})

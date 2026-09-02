/**
 * The reusable half of the `step-modules` acceptance pair (BEH-EC-019): a step module defined in
 * its OWN file, the way a consumer shares steps across Feature files. `step-modules.steps.test.ts`
 * uses it; nothing here calls `describeFeature`.
 */
import { assert } from "@effect/vitest"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Ref from "effect/Ref"
import { defineSteps } from "../../src/StepModule.ts"

export class World extends Context.Service<World, { readonly apples: Ref.Ref<number> }>()("StepModules/World") {
  static readonly layer = Layer.effect(
    this,
    Effect.gen(function*() {
      return World.of({ apples: yield* Ref.make(0) })
    })
  )
}

/** `R = World`, declared: a Feature whose Layer lacks `World` cannot `use` this (asserted by the tsgo gate). */
export const applesSteps = defineSteps<World>(({ Given, Then, When }) => {
  Given("I have {int} apples", function*(count) {
    const { apples } = yield* World
    yield* Ref.set(apples, count)
  })
  When("I eat {int} apples", function*(count) {
    const { apples } = yield* World
    yield* Ref.update(apples, (remaining) => remaining - count)
  })
  Then("I have {int} apples left", function*(expected) {
    const { apples } = yield* World
    assert.strictEqual(yield* Ref.get(apples), expected)
  })
})

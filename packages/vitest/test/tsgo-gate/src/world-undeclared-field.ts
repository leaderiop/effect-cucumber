// MUST NOT COMPILE.
import type { ParsedFeature } from "@effect-cucumber/gherkin"
import { describeFeature } from "@effect-cucumber/vitest"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Ref from "effect/Ref"

export class World extends Context.Service<World, { readonly apples: Ref.Ref<number> }>()("World") {
  static readonly layer: Layer.Layer<World> = Layer.effect(
    World,
    Effect.gen(function*() {
      return World.of({ apples: yield* Ref.make(0) })
    })
  )
}

declare const feature: ParsedFeature

// The Layer here is entirely correct and the step's context is fully satisfied — `World` is provided, so there is
// nothing for an Effect diagnostic to fire on.
describeFeature(feature, World.layer, ({ Given }) => {
  Given("reads a field World does not declare", function*() {
    const world = yield* World

    // THE DEFECT.
    void world.oranges
  })
})

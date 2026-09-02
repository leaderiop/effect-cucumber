// MUST FAIL TO COMPILE, by name: effect(missingEffectContext).
import type { ParsedFeature } from "@effect-cucumber/gherkin"
import { defineSteps, describeFeature } from "@effect-cucumber/vitest"
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

export class Db extends Context.Service<Db, { readonly clear: Effect.Effect<void> }>()("Db") {}

export const needsDb = defineSteps<Db>(({ Given }) => {
  Given("the database is cleared", function*() {
    yield* (yield* Db).clear
  })
})

declare const feature: ParsedFeature

describeFeature(feature, World.layer, ({ use }) => {
  use(needsDb)
})

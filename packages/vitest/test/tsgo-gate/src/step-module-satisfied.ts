// MUST COMPILE CLEAN. Asserted by scripts/verify-tsgo-gate.sh as exit 0.
//
// The positive control for step modules (ADR-EC-027): a module declaring `R = World` is usable in
// a Feature whose Layer provides `World`, in a Feature whose Layer provides MORE than `World`, and
// inside a Rule; a module declaring nothing (`R = never`) is usable anywhere.
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

export class Db extends Context.Service<Db, { readonly clear: Effect.Effect<void> }>()("Db") {
  static readonly layer: Layer.Layer<Db> = Layer.succeed(Db, Db.of({ clear: Effect.void }))
}

export const apples = defineSteps<World>(({ Given }) => {
  Given("I have {int} apples", function*(count) {
    yield* Ref.set((yield* World).apples, count)
  })
})

export const nothing = defineSteps(({ Then }) => {
  Then("nothing is needed", function*() {
    yield* Effect.void
  })
})

declare const feature: ParsedFeature

describeFeature(feature, World.layer, ({ Rule, use }) => {
  use(apples)
  use(nothing)
  Rule("inside", ({ use: useInRule }) => {
    useInRule(apples)
  })
})

export const both: Layer.Layer<World | Db> = Layer.merge(World.layer, Db.layer)

describeFeature(feature, both, ({ use }) => {
  use(apples)
})

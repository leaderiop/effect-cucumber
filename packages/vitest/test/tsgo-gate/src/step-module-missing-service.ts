// MUST FAIL TO COMPILE, by name: effect(missingEffectContext). Asserted by scripts/verify-tsgo-gate.sh.
//
// A step module declaring `R = Db` is `use`d in a Feature whose Layer provides only `World`. The
// module's steps would fail at run time with a service-not-found; ADR-EC-027 moves that to the
// `use` call. This diagnostic fires ONLY because `use`'s parameter is spelled as an anonymous
// structural type whose first property is the Effect witness (Dsl.ts note (g)) — if this file ever
// compiles, or is rejected without the diagnostic name, that spelling was "tidied" into the named
// `StepModule<ROut>` alias and the by-name guarantee is gone.
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

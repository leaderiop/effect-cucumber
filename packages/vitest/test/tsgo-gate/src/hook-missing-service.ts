// MUST NOT COMPILE.
import type { ParsedFeature } from "@effect-cucumber/gherkin"
import { describeFeature } from "@effect-cucumber/vitest"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Ref from "effect/Ref"

// Duplicated verbatim from the twin fixture rather than shared through a helper module: `files: [one]` would force
// every sibling config to list the helper too.
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

declare const feature: ParsedFeature

// The ambient Layer is `World.layer` alone — `Db.layer` is the one thing removed relative to the twin.
describeFeature(feature, World.layer, ({ Before }) => {
  // THE DEFECT, and the whole product.
  Before(function*() {
    yield* (yield* Db).clear
  })
})

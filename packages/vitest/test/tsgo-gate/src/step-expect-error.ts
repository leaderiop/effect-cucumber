// MUST COMPILE CLEAN.
// A `@ts-expect-error`-based negative type-test, which is the form the roadmap's success criterion
import type { ParsedFeature } from "@effect-cucumber/gherkin"
import { describeFeature } from "@effect-cucumber/vitest"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Ref from "effect/Ref"

// Duplicated from src/step-missing-service.ts rather than shared through a helper module: `files:
// defective step below is the same defect as that fixture's, on purpose — the only difference between the two files
// is whether the errors are suppressed.
export class World extends Context.Service<World, { readonly apples: Ref.Ref<number> }>()("World") {
  static readonly layer: Layer.Layer<World> = Layer.effect(
    World,
    Effect.gen(function*() {
      return World.of({ apples: yield* Ref.make(0) })
    })
  )
}

// `Db.layer` exists but is never wired into the ambient Layer below.
export class Db extends Context.Service<Db, { readonly clear: Effect.Effect<void> }>()("Db") {
  static readonly layer: Layer.Layer<Db> = Layer.succeed(Db, Db.of({ clear: Effect.void }))
}

declare const feature: ParsedFeature

describeFeature(feature, World.layer, ({ Given }) => {
  // DIRECTIVE ORDER IS LOAD-BEARING, AND NOT INTERCHANGEABLE.
  // has no effect` PLUS the unsuppressed `TS377004`, and this fixture fails. Verified both ways in
  // @ts-expect-error the step requires `Db`, which the ambient World.layer does not provide
  // @effect-diagnostics-next-line missingEffectContext:off
  Given("needs Db", function*() {
    yield* (yield* Db).clear
  })
})

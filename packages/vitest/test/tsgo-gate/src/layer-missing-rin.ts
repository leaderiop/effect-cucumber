// MUST NOT COMPILE.
import type { ParsedFeature } from "@effect-cucumber/gherkin"
import { describeFeature } from "@effect-cucumber/vitest"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Ref from "effect/Ref"

export class Db extends Context.Service<Db, { readonly clear: Effect.Effect<void> }>()("Db") {}

export class World extends Context.Service<World, { readonly apples: Ref.Ref<number> }>()("World") {
  // `Layer.Layer<World, never, Db>` — an INCOMPLETE Layer.
  static readonly layer: Layer.Layer<World, never, Db> = Layer.effect(
    World,
    Effect.gen(function*() {
      yield* (yield* Db).clear
      return World.of({ apples: yield* Ref.make(0) })
    })
  )
}

declare const feature: ParsedFeature

// THE DEFECT, and — equally — the behavioral proof of `describeFeature`'s overload ORDER.
// 'Layer<World, never, never>'` and `effect(missingLayerContext)` fires naming `Db`.
// Swap those two overloads — the tidy-up that reads better, since the plain form is the common case — and this call
// is STILL rejected, so nothing in the repo goes red.
// '{ shared; perScenario }'`, which names the wrong problem entirely, and the Effect diagnostic
// never fires at all.
describeFeature(feature, World.layer, ({ Given }) => {
  Given("trivially satisfiable", function*() {
    yield* Ref.set((yield* World).apples, 1)
  })
})

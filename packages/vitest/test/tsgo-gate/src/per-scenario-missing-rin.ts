// MUST FAIL TO COMPILE, by name: effect(missingLayerContext). Asserted by scripts/verify-tsgo-gate.sh.
//
// The object form's `perScenario` tier may require what the `shared` tier provides (BEH-EC-007,
// F-18) — and nothing else. Here `World` needs a `Db` that neither tier provides, so every Scenario
// would fail at run time with a service-not-found; ADR-EC-003 moves that to authoring time.
import type { ParsedFeature } from "@effect-cucumber/gherkin"
import { describeFeature } from "@effect-cucumber/vitest"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Ref from "effect/Ref"

export class Catalog extends Context.Service<Catalog, { readonly ok: boolean }>()("Catalog") {
  static readonly layer: Layer.Layer<Catalog, never, never> = Layer.succeed(Catalog, Catalog.of({ ok: true }))
}

export class Db extends Context.Service<Db, { readonly clear: Effect.Effect<void> }>()("Db") {}

export class World extends Context.Service<World, { readonly apples: Ref.Ref<number> }>()("World") {
  static readonly layer: Layer.Layer<World, never, Db> = Layer.effect(
    World,
    Effect.gen(function*() {
      yield* (yield* Db).clear
      return World.of({ apples: yield* Ref.make(0) })
    })
  )
}

declare const feature: ParsedFeature

describeFeature(feature, { shared: Catalog.layer, perScenario: World.layer }, ({ Given }) => {
  Given("trivially satisfiable", function*() {
    yield* Ref.set((yield* World).apples, 1)
  })
})

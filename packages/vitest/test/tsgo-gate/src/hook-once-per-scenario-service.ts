// MUST NOT COMPILE. Asserted by scripts/verify-tsgo-gate.sh (assertion 11b) as
//   exit != 0  AND  output containing "effect(missingEffectContext)".
//
// F-10: a once-per-Feature hook is typed by the SHARED tier alone. This file's object-form call puts
// `World` in `perScenario` and `Db` in `shared`, exactly as src/hook-satisfied.ts does, and its
// `BeforeAllScenarios` reaches for `World`. The twin compiles because its once-hooks reach for `Db`;
// this one must be rejected BY NAME, because a `BeforeAllScenarios` that seeds a per-Scenario World
// seeds a build no Scenario ever reads, and the whole point of the typing is to catch that where the
// hook is written rather than let it run and silently do nothing.
//
// No error-suppression directive appears in this file, on purpose — an acceptance grep enforces
// that.
import type { ParsedFeature } from "@effect-cucumber/gherkin"
import { describeFeature } from "@effect-cucumber/vitest"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Ref from "effect/Ref"

// Duplicated verbatim from the twin fixture rather than shared through a helper module: `files: [one]`
// would force every sibling config to list the helper too.
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

describeFeature(feature, { shared: Db.layer, perScenario: World.layer }, ({ BeforeAllScenarios }) => {
  // THE DEFECT: `World` is the per-Scenario tier, and a once-per-Feature hook cannot see it.
  BeforeAllScenarios(function*() {
    yield* Ref.set((yield* World).apples, 1)
  })
})

// MUST NOT COMPILE. Asserted by scripts/verify-tsgo-gate.sh (assertion 11) as
//   exit != 0  AND  output containing "effect(missingEffectContext)".
//
// This is the hook DSL's central claim as a committed file. Its twin is src/hook-satisfied.ts, whose
// object-form call registers a `Before` hook against `{ shared: Db.layer, perScenario: World.layer }`
// and compiles clean. The two files are kept as close to identical as they can be so that the pair
// isolates exactly one variable — whether the ambient Layer provides `Db` — and asserting both in the
// same script run is what proves that removing a service from a hook's ambient Layer flips a passing
// case to failing.
//
// No error-suppression directive appears in this file, on purpose — an acceptance grep enforces
// that. TypeScript's suppression comment does not silence @effect/tsgo diagnostics anyway, and the
// exit-code form is strictly stronger: it proves WHICH error occurred, not merely that one did.
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

// The ambient Layer is `World.layer` alone — `Db.layer` is the one thing removed relative to the
// twin. Everything below is otherwise identical to a hook body that compiles.
describeFeature(feature, World.layer, ({ Before }) => {
  // THE DEFECT, and the whole product. This hook's Effect requires `Db`, which `World.layer` does
  // not provide. Catching it HERE, where the hook is registered, instead of as a runtime "service
  // not found" when the hook runs, is INV-EC-003's guarantee extended to hooks. If this file ever
  // compiles, that guarantee is decorative for the hook surface.
  Before(function*() {
    yield* (yield* Db).clear
  })
})

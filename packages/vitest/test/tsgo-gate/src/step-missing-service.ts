// MUST NOT COMPILE. Asserted by scripts/verify-tsgo-gate.sh (assertion 6) as
//   exit != 0  AND  output containing "effect(missingEffectContext)".
//
// This is the phase's central claim as a committed file. Its twin is src/step-satisfied.ts, whose
// object-form call registers the very same step against `{ shared: Db.layer, perScenario: World.layer }`
// and compiles clean. The two files are kept as close to identical as they can be so that the pair
// isolates exactly one variable — whether the ambient Layer provides `Db` — and asserting both in
// the same script run is what proves that removing a service flips a passing case to failing.
//
// No error-suppression directive appears in this file, on purpose — an acceptance grep enforces
// that, so the directive's name is deliberately not spelled here either. TypeScript's suppression
// comment does not silence @effect/tsgo diagnostics anyway (RESEARCH.md Finding 3), and the
// exit-code form is strictly stronger: it proves WHICH error occurred, not merely that one did.
// The supplementary suppressed-directive fixture belongs to plan 05-05.
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
// twin. Everything below is otherwise identical to a step that compiles.
describeFeature(feature, World.layer, ({ Given }) => {
  // THE DEFECT, and the whole product. This step's Effect requires `Db`, which `World.layer` does
  // not provide. Catching it HERE, where the step is written, instead of as a runtime "service not
  // found" when the Scenario runs, is the entire reason this project exists (ADR-EC-003,
  // INV-EC-003). If this file ever compiles, the guarantee is decorative.
  //
  // Expect a long, noisy TS2345 chain: `exactOptionalPropertyTypes: true` prepends four nested
  // "Consider adding 'undefined' to the types of the target's properties" lines, so the useful
  // `Type 'Db' is not assignable to type 'Scope | World'` lands around the eighth line. Do not
  // judge this fixture by its first output line, and do not relax that flag to tidy the output —
  // the `effect(missingEffectContext)` one-liner is the readable summary, and Dsl.ts note (a)'s
  // union order is what makes it appear at all.
  Given("needs Db", function*() {
    yield* (yield* Db).clear
  })
})

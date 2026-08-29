// MUST NOT COMPILE. Asserted by scripts/verify-tsgo-gate.sh (assertion 8) as
//   exit != 0  AND  output containing "effect(missingLayerContext)".
//
// The defect in this file is in the LAYER ARGUMENT, not in a step. Every step below is trivially
// satisfiable. `World.layer` is a `Layer<World, never, Db>` — its own `RIn` names `Db`, and nothing
// ever provides it — so the value handed to `describeFeature` is not a complete Layer at all.
//
// That makes this a different failure from src/step-missing-service.ts, and it fires a different
// diagnostic: `missingLayerContext` (TS377034) here, `missingEffectContext` (TS377004) there
// (RESEARCH.md Finding 1). The two are not interchangeable and their assertions must not be
// "harmonized".
import type { ParsedFeature } from "@effect-cucumber/gherkin"
import { describeFeature } from "@effect-cucumber/vitest"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Ref from "effect/Ref"

// Declared inline and duplicated from the sibling fixtures on purpose — `files: [one]` means a
// shared helper module would have to be added to every config (RESEARCH.md Open Question 2).
//
// `Db` deliberately has NO `layer`. Its absence is the whole fixture: there is no way to
// accidentally satisfy the requirement below by wiring one line, and a future editor cannot "fix"
// this file into vacuity without visibly adding a Layer that was never here.
export class Db extends Context.Service<Db, { readonly clear: Effect.Effect<void> }>()("Db") {}

export class World extends Context.Service<World, { readonly apples: Ref.Ref<number> }>()("World") {
  // `Layer.Layer<World, never, Db>` — an INCOMPLETE Layer. The construction effect reads `Db`, so
  // `Db` lands in `RIn` and stays there. The annotation states the truth rather than hiding it: a
  // `Layer.Layer<World>` annotation here would be the mis-annotation that src/missing-layer-context.ts
  // already covers, and this fixture is about the argument position instead.
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
//
// The two overloads in packages/vitest/src/describeFeature.ts are declared object-form FIRST and
// plain-Layer LAST, and note (a) there explains why. TypeScript reports a failed overloaded call as
// "No overload matches this call. The LAST overload gave the following error", so the plain-Layer
// form must be last for the compiler to report this call against it. It then says
// `Argument of type 'Layer<World, never, Db>' is not assignable to parameter of type
// 'Layer<World, never, never>'` and `effect(missingLayerContext)` fires naming `Db`.
//
// Swap those two overloads — the tidy-up that reads better, since the plain form is the common
// case — and this call is STILL rejected, so nothing in the repo goes red. But the message becomes
// `Type 'Layer<World, never, Db>' is missing the following properties from type
// '{ shared; perScenario }'`, which names the wrong problem entirely, and the Effect diagnostic
// never fires at all. ADR-EC-016's gate quietly stops covering the Layer argument while CI stays
// green. Reproduced under BOTH orderings in RESEARCH.md Finding 6.
//
// Assertion 8's second check — the `effect(missingLayerContext)` grep, not the exit code — is the
// only thing in this repo that goes red on that swap. describeFeature.ts note (a) is the other half
// of the pair; neither is complete without the other.
describeFeature(feature, World.layer, ({ Given }) => {
  Given("trivially satisfiable", function*() {
    yield* Ref.set((yield* World).apples, 1)
  })
})

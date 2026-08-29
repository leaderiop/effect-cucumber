// MUST NOT COMPILE. Asserted by scripts/verify-tsgo-gate.sh (assertion 13) as
//   exit != 0  AND  output containing "effect(missingEffectContext)".
//
// This is roadmap success criterion 1's negative half, as literally as it can be written: the step
// body below is copied verbatim from src/rule-satisfied.ts's Rule-scoped Scenario — the one that
// compiles clean because `Rule("a rule", RuleService.layer, ...)` puts `RuleService` in its `ROut`.
// Here the identical body is registered at FEATURE level, against `World.layer` alone, with no
// `Rule` anywhere in the file. Whether the step is inside the Rule that contributed `RuleService` is
// the ONLY substantive difference between the two files, which is what makes the pair a proof of
// DSL-05's boundary rather than of some unrelated rejection.
//
// One fixture, one defect. There is deliberately no Scenario-form defect here as well: a second
// defect would let assertion 13's diagnostic grep be satisfied on behalf of a file it was never
// about. D-01's Scenario form has its own invisibility proof, inline in src/rule-satisfied.ts.
//
// No error-suppression directive appears in this file, on purpose. TypeScript's suppression comment
// does not silence @effect/tsgo diagnostics anyway, and the exit-code form is strictly stronger: it
// proves WHICH error occurred, not merely that one did.
import type { ParsedFeature } from "@effect-cucumber/gherkin"
import { describeFeature } from "@effect-cucumber/vitest"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Ref from "effect/Ref"

// Duplicated verbatim from the twin fixture rather than shared through a helper module: `files:
// [one]` would force every sibling config to list the helper too.
export class World extends Context.Service<World, { readonly apples: Ref.Ref<number> }>()("World") {
  static readonly layer: Layer.Layer<World> = Layer.effect(
    World,
    Effect.gen(function*() {
      return World.of({ apples: yield* Ref.make(0) })
    })
  )
}

// `RuleService.layer` exists and is never used. In the twin it is a `Rule`'s extra Layer; removing
// that `Rule` is the one thing changed here.
export class RuleService extends Context.Service<RuleService, { readonly audit: Effect.Effect<void> }>()(
  "RuleService"
) {
  static readonly layer: Layer.Layer<RuleService> = Layer.succeed(RuleService, RuleService.of({ audit: Effect.void }))
}

declare const feature: ParsedFeature

describeFeature(feature, World.layer, ({ Scenario }) => {
  // A Feature-level Scenario — no enclosing `Rule`, so its `ROut` is `World` alone.
  Scenario("inside the rule", ({ Given }) => {
    // THE DEFECT, and the whole product. This body is byte-for-byte the twin's Rule-scoped step, and
    // it must not compile here: `RuleService` was contributed by a Rule this Scenario is not inside.
    // Catching it HERE, where the step is written, instead of as a runtime "service not found" when
    // the Scenario runs, is INV-EC-005's guarantee. If this file ever compiles, ADR-EC-010's
    // Rule-scoped Layer is a runtime convention with a decorative type, and roadmap success
    // criterion 1 is not met.
    Given("uses both the ambient and the Rule's own service", function*() {
      yield* World
      yield* (yield* RuleService).audit
    })
  })
})

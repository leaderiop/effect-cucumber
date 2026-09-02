// MUST NOT COMPILE.
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

// `RuleService.layer` exists and is never used.
export class RuleService extends Context.Service<RuleService, { readonly audit: Effect.Effect<void> }>()(
  "RuleService"
) {
  static readonly layer: Layer.Layer<RuleService> = Layer.succeed(RuleService, RuleService.of({ audit: Effect.void }))
}

declare const feature: ParsedFeature

describeFeature(feature, World.layer, ({ Scenario }) => {
  // A Feature-level Scenario — no enclosing `Rule`, so its `ROut` is `World` alone.
  Scenario("inside the rule", ({ Given }) => {
    // THE DEFECT, and the whole product.
    Given("uses both the ambient and the Rule's own service", function*() {
      yield* World
      yield* (yield* RuleService).audit
    })
  })
})

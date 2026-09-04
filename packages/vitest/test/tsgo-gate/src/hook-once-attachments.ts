// MUST NOT COMPILE.
import type { ParsedFeature } from "@effect-cucumber/gherkin"
import { attach, describeFeature } from "@effect-cucumber/vitest"
import * as Context from "effect/Context"
import * as Layer from "effect/Layer"

export class World extends Context.Service<World, { readonly ok: boolean }>()("World") {
  static readonly layer: Layer.Layer<World> = Layer.succeed(World, World.of({ ok: true }))
}

declare const feature: ParsedFeature

describeFeature(feature, World.layer, ({ AfterAllScenarios }) => {
  // THE DEFECT: `AfterAllScenarios` runs outside any Scenario's `it.effect` callback, so there is no
  // live `TestContext` for `attach` to bind against — `HookRegistrar<RShared>` deliberately omits
  // `Attachments` from its union (ADR-EC-036).
  AfterAllScenarios(function*() {
    yield* attach("text/plain", "unreachable")
  })
})

// MUST COMPILE CLEAN.
import type { ParsedFeature } from "@effect-cucumber/gherkin"
import { describeFeature } from "@effect-cucumber/vitest"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Ref from "effect/Ref"

// Declared inline and duplicated in the twin fixture on purpose: `files: [one]` means a shared helper module would
// have to be added to every config.
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

// Plain-Layer form — the per-Scenario scope, and the overload the twin fixture is rejected by.
describeFeature(feature, World.layer, ({ Background, Given, Scenario, Then, When }) => {
  // A coerced parameter: `{int}` gives the generator an `n: number` and the step writes World state.
  Given("I have {int} apples", function*(n: number) {
    yield* Ref.set((yield* World).apples, n)
  })

  When("a scoped step", function*() {
    yield* Effect.acquireRelease(Effect.succeed(1), () => Effect.void)
  })

  // ADR-EC-005: an already-wrapped function returning an Effect is accepted unchanged, never double-wrapped.
  Then(
    "already wrapped",
    Effect.fn("already wrapped")(function*(n: number) {
      yield* Ref.set((yield* World).apples, n)
    })
  )

  // ADR-EC-017: a Background container exposes exactly `Given` and `And`.
  Background(({ And, Given }) => {
    Given("bg given", function*() {
      yield* World
    })
    And("bg and", function*() {
      yield* World
    })
  })

  // The destructured `Given` shadows the outer one and accepts exactly the same thing — the Scenario container
  // carries the Feature's `ROut` unchanged.
  Scenario("nested", ({ Given }) => {
    Given("nested step", function*() {
      yield* World
    })
  })
})

// Object Layer form.
describeFeature(feature, { shared: Db.layer, perScenario: World.layer }, ({ Given }) => {
  Given("both", function*() {
    yield* (yield* Db).clear
    yield* Ref.set((yield* World).apples, 1)
  })
})

describeFeature(feature, { shared: Db.layer, perScenario: Layer.empty }, ({ Given }) => {
  Given("shared only", function*() {
    yield* (yield* Db).clear
  })
})

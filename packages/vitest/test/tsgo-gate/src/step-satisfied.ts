// MUST COMPILE CLEAN. Asserted by scripts/verify-tsgo-gate.sh (assertion 5) as exit 0.
//
// This is the DSL positive control: every form `describeFeature` is required to accept, in one
// file. Its twin is src/step-missing-service.ts, which differs only in whether the ambient Layer
// provides the service a step needs. The pair, asserted in the same script run, is what proves
// removing a service from an ambient Layer flips a passing case to failing.
import type { ParsedFeature } from "@effect-cucumber/gherkin"
import { describeFeature } from "@effect-cucumber/vitest"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Ref from "effect/Ref"

// Declared inline and duplicated in the twin fixture on purpose: `files: [one]` means a shared
// helper module would have to be added to every config. Specimens, not production code. The
// explicit `Layer.Layer<...>` annotations are not optional — declaration emit demands them for
// anything exported (RESEARCH.md Finding 10).
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

  // D-02 / roadmap success criterion 2. `Effect.acquireRelease` puts `Scope` in the step's required
  // context, and this call takes a PLAIN `Layer<World>` that provides no Scope. It compiles because
  // Dsl.ts note (b) spells `Scope.Scope` on the step registrar only — the runner provides the Scope.
  When("a scoped step", function*() {
    yield* Effect.acquireRelease(Effect.succeed(1), () => Effect.void)
  })

  // ADR-EC-005: an already-wrapped function returning an Effect is accepted unchanged, never
  // double-wrapped. This is the union's second member doing its job.
  Then(
    "already wrapped",
    Effect.fn("already wrapped")(function*(n: number) {
      yield* Ref.set((yield* World).apples, n)
    })
  )

  // ADR-EC-017: a Background container exposes exactly `Given` and `And`. Reaching for `When` here
  // is TS2339, which is the intended grammar and not a gap.
  Background(({ And, Given }) => {
    Given("bg given", function*() {
      yield* World
    })
    And("bg and", function*() {
      yield* World
    })
  })

  // The destructured `Given` shadows the outer one and accepts exactly the same thing — the
  // Scenario container carries the Feature's `ROut` unchanged.
  Scenario("nested", ({ Given }) => {
    Given("nested step", function*() {
      yield* World
    })
  })
})

// Object Layer form. RESEARCH.md Finding 5's regression guard: under BEH-EC-002's published
// signature `Db` is not reachable from the dsl and this call does not compile. Both scopes'
// services must be usable in one step.
describeFeature(feature, { shared: Db.layer, perScenario: World.layer }, ({ Given }) => {
  Given("both", function*() {
    yield* (yield* Db).clear
    yield* Ref.set((yield* World).apples, 1)
  })
})

// D-03: `perScenario` is required even with no per-Scenario state, so `Layer.empty` must be legal.
// It is `Layer<never>`, and `never` unions away cleanly, leaving the dsl parameterised by `Db`.
describeFeature(feature, { shared: Db.layer, perScenario: Layer.empty }, ({ Given }) => {
  Given("shared only", function*() {
    yield* (yield* Db).clear
  })
})

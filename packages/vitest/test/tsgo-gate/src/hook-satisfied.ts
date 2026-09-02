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
describeFeature(
  feature,
  World.layer,
  ({ After, AfterAllScenarios, AfterStep, Before, BeforeAllScenarios, BeforeStep, Scenario }) => {
    // All six hook kinds, each with a bare zero-argument generator whose body yields `World`.
    Before(function*() {
      yield* World
    })
    After(function*() {
      yield* World
    })
    BeforeStep(function*() {
      yield* World
    })
    AfterStep(function*() {
      yield* World
    })
    // The two once-per-Feature hooks are typed by the SHARED tier (F-10), which the plain-Layer form does not have —
    // so here they may need nothing.
    BeforeAllScenarios(function*() {
      yield* Effect.void
    })
    AfterAllScenarios(function*() {
      yield* Effect.void
    })

    // ADR-EC-005: an already-wrapped function returning an Effect is accepted unchanged, never double-wrapped.
    After(
      Effect.fn("After")(function*() {
        yield* World
      })
    )

    // Dsl.ts note (b): `Effect.acquireRelease` puts `Scope` in the hook body's required context, and this call takes
    // a PLAIN `Layer<World>` that provides no Scope.
    Before(function*() {
      yield* Effect.acquireRelease(Effect.succeed(1), () => Effect.void)
    })

    Scenario("nested", (dsl) => {
      // THE POSITIVE ASSERTION that hooks are NOT on `ScenarioDsl` — Dsl.ts note (f).
      // @ts-expect-error hooks are Feature-scoped only and must not be reachable from a Scenario callback
      void dsl.Before
    })
  }
)

// Object Layer form.
describeFeature(
  feature,
  { shared: Db.layer, perScenario: World.layer },
  ({ AfterAllScenarios, Before, BeforeAllScenarios }) => {
    // Both once-per-Feature hooks reach the SHARED tier's service — the one tier they are typed by.
    BeforeAllScenarios(function*() {
      yield* (yield* Db).clear
    })
    AfterAllScenarios(function*() {
      yield* (yield* Db).clear
    })
    Before(function*() {
      yield* Ref.set((yield* World).apples, 1)
    })
  }
)

// MUST COMPILE CLEAN. Asserted by scripts/verify-tsgo-gate.sh (assertion 10) as exit 0.
//
// This is the hook DSL positive control: every form the six FeatureDsl hook registrars are required
// to accept, in one file. Its twin is src/hook-missing-service.ts, which differs only in whether the
// ambient Layer provides the service a hook body needs. The pair, asserted in the same script run, is
// what proves removing a service from an ambient Layer flips a passing hook to failing — Dsl.ts note
// (a)'s claim, extended from StepRegistrar to HookRegistrar.
import type { ParsedFeature } from "@effect-cucumber/gherkin"
import { describeFeature } from "@effect-cucumber/vitest"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Ref from "effect/Ref"

// Declared inline and duplicated in the twin fixture on purpose: `files: [one]` means a shared
// helper module would have to be added to every config. Specimens, not production code. The explicit
// `Layer.Layer<...>` annotations are not optional — declaration emit demands them for anything
// exported.
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
    // All six hook kinds, each with a bare zero-argument generator whose body yields `World`. If a
    // member is ever added to `FeatureDsl` with the wrong type, one of these six calls stops
    // compiling.
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
    // The two once-per-Feature hooks are typed by the SHARED tier (F-10), which the plain-Layer form
    // does not have — so here they may need nothing. The object-form call below is where they reach
    // a service, and src/hook-once-per-scenario-service.ts is the fixture that proves a per-Scenario
    // service is NOT reachable from them.
    BeforeAllScenarios(function*() {
      yield* Effect.void
    })
    AfterAllScenarios(function*() {
      yield* Effect.void
    })

    // ADR-EC-005: an already-wrapped function returning an Effect is accepted unchanged, never
    // double-wrapped. This is the union's second member doing its job — Dsl.ts note (a).
    After(
      Effect.fn("After")(function*() {
        yield* World
      })
    )

    // Dsl.ts note (b): `Effect.acquireRelease` puts `Scope` in the hook body's required context, and
    // this call takes a PLAIN `Layer<World>` that provides no Scope. It compiles because
    // `HookRegistrar` spells `Scope.Scope` on both union members — the runner provides the Scope.
    Before(function*() {
      yield* Effect.acquireRelease(Effect.succeed(1), () => Effect.void)
    })

    Scenario("nested", (dsl) => {
      // THE POSITIVE ASSERTION that hooks are NOT on `ScenarioDsl` — Dsl.ts note (f). If a hook
      // member ever leaks onto `ScenarioDsl`, `Before` becomes reachable here, this directive becomes
      // unused, TypeScript emits TS2578, and this must-compile-clean fixture fails assertion 10. Do
      // not delete this directive to "clean up" an apparently-unused expression.
      // @ts-expect-error hooks are Feature-scoped only and must not be reachable from a Scenario callback
      void dsl.Before
    })
  }
)

// Object Layer form. Both scopes' services must be reachable from a hook body, mirroring
// step-satisfied.ts's regression guard for steps.
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

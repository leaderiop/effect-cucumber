// MUST COMPILE CLEAN. Asserted by scripts/verify-tsgo-gate.sh (assertion 12) as exit 0.
//
// This is the Rule/Scenario extra-Layer positive control: every form ADR-EC-010's two extra-Layer
// containers are required to accept, in one file. Its twin is src/rule-missing-service.ts, which
// takes the Rule-scoped Scenario's step body from below and registers it at FEATURE level instead —
// the literal negative half of roadmap success criterion 1 ("the identical step body placed outside
// the Rule is a compile error"). The pair, asserted in the same script run, is what proves a Rule's
// extra Layer is a real compile-time boundary and not a convention.
//
// Three `@ts-expect-error` directives below are load-bearing ASSERTIONS, not suppressions of
// inconvenient noise:
//   1. `ruleDsl.BeforeAllScenarios` — RuleDsl must NOT expose it (Dsl.ts note (f)).
//   2. `RuleService` reached from a Feature-level Scenario — INV-EC-005 for the Rule form.
//   3. `ScenarioService` reached from a sibling Scenario — INV-EC-005 for D-01's Scenario form.
// Each one goes UNUSED the moment the guarantee it names decays, and an unused directive is itself a
// compile error, which is what makes this must-compile-clean file fail assertion 12. Do not delete
// any of them to "clean up" an apparently-pointless expression.
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

// The Rule's own extra Layer. Never passed to `describeFeature` — it reaches a step body ONLY
// through `Rule("a rule", RuleService.layer, ...)`, which is the entire point of this fixture.
export class RuleService extends Context.Service<RuleService, { readonly audit: Effect.Effect<void> }>()(
  "RuleService"
) {
  static readonly layer: Layer.Layer<RuleService> = Layer.succeed(RuleService, RuleService.of({ audit: Effect.void }))
}

// D-01's SECOND form: a single Scenario's own extra Layer. Exercised here rather than in a fixture
// pair of its own because it is the identical `ROut | R2` mechanism one nesting level down —
// `ScenarioRegistrar`'s three-argument call signature is nonetheless a SEPARATE declaration in
// Dsl.ts that could decay independently of `FeatureDsl.Rule`'s, so it gets its own positive use and
// its own invisibility directive below.
export class ScenarioService extends Context.Service<ScenarioService, { readonly tag: Effect.Effect<void> }>()(
  "ScenarioService"
) {
  static readonly layer: Layer.Layer<ScenarioService> = Layer.succeed(
    ScenarioService,
    ScenarioService.of({ tag: Effect.void })
  )
}

declare const feature: ParsedFeature

describeFeature(feature, World.layer, ({ Rule, Scenario }) => {
  // The Feature level is unaffected by this plan: a two-argument `Scenario` still gets exactly the
  // ambient `ROut`. `ScenarioRegistrar`'s two-argument signature is listed FIRST for this reason
  // (Dsl.ts, `ScenarioRegistrar`) and this call is the guard on that ordering.
  Scenario("plain", ({ Given }) => {
    Given("a plain step", function*() {
      yield* World
    })
  })

  // D-01's Scenario form, positive half: the ambient `World` AND this Scenario's own
  // `ScenarioService` are both reachable from one step body — `ScenarioDsl<ROut | R2>`.
  Scenario("scoped", ScenarioService.layer, ({ Given }) => {
    Given("uses both the ambient and the Scenario's own service", function*() {
      yield* World
      yield* (yield* ScenarioService).tag
    })
  })

  // D-01's Scenario form, invisibility half — INV-EC-005 one nesting level down. This sibling
  // Scenario was declared with the TWO-argument form, so `ScenarioService` is not in its `ROut`.
  //
  // DIRECTIVE ORDER IS LOAD-BEARING (see src/step-expect-error.ts's header): the
  // `@effect-diagnostics-next-line` comment MUST sit immediately above the code, with TypeScript's
  // own directive above it. Both are needed because a TypeScript suppression does not silence an
  // @effect/tsgo diagnostic. If a Scenario's extra Layer ever leaks into the ambient `ROut` outside
  // that Scenario, no error occurs here, the directives go unused, and this file fails assertion 12
  // (TS377000 first, then TS2578).
  Scenario("outside the scoped Scenario", ({ Given }) => {
    // @ts-expect-error a Scenario's extra Layer must be invisible outside that Scenario — INV-EC-005
    // @effect-diagnostics-next-line missingEffectContext:off
    Given("reaches for ScenarioService", function*() {
      yield* (yield* ScenarioService).tag
    })
  })

  // THE DSL-05 CLAIM, positive half — roadmap success criterion 1. `RuleService.layer` is this
  // Rule's own extra Layer and reaches everything registered inside this callback, and nothing
  // outside it.
  Rule("a rule", RuleService.layer, (ruleDsl) => {
    // A Scenario nested in the Rule: the Feature's ambient `World` and the Rule's `RuleService` are
    // both reachable from one step body. src/rule-missing-service.ts is this exact body, moved to
    // Feature level.
    ruleDsl.Scenario("inside the rule", ({ Given }) => {
      Given("uses both the ambient and the Rule's own service", function*() {
        yield* World
        yield* (yield* RuleService).audit
      })
    })

    // A step registered DIRECTLY on the Rule dsl, a sibling of its own `Scenario` call — the five
    // registrars `RuleDsl extends ScenarioDsl` inherits, at "rule" scope.
    ruleDsl.Given("a rule-level step", function*() {
      yield* (yield* RuleService).audit
    })

    // All four hooks ADR-EC-010 scopes to a Rule, each a bare generator yielding the Rule's OWN
    // service — the proof that `HookRegistrar<ROut | R2>`'s union covers the extra Layer too, not
    // just the ambient one.
    ruleDsl.Before(function*() {
      yield* (yield* RuleService).audit
    })
    ruleDsl.After(function*() {
      yield* (yield* RuleService).audit
    })
    ruleDsl.BeforeStep(function*() {
      yield* (yield* RuleService).audit
    })
    ruleDsl.AfterStep(function*() {
      yield* (yield* RuleService).audit
    })

    // D-04: a Rule's own `Background` reuses `BackgroundDsl<ROut>` verbatim — `Given`/`And` only,
    // because the Gherkin grammar does not change one nesting level down (Dsl.ts note (c)).
    ruleDsl.Background(({ Given }) => {
      Given("a rule background step", function*() {
        yield* World
      })
    })

    // THE POSITIVE ASSERTION that `RuleDsl` exposes NEITHER once-per-Feature hook — Dsl.ts note (f).
    // ADR-EC-010's Rule-scopeable list is exactly the four above; "once per Feature" does not narrow
    // to "once per Rule" without its own design pass. If either member is ever added to `RuleDsl`
    // for symmetry, this directive becomes unused, TypeScript emits TS2578, and this
    // must-compile-clean fixture fails assertion 12. Identical technique to
    // src/hook-satisfied.ts's `ScenarioDsl`-leak guard.
    // @ts-expect-error BeforeAllScenarios is Feature-scoped only and must not be reachable from a Rule callback
    void ruleDsl.BeforeAllScenarios
  })

  // THE DSL-05 CLAIM, invisibility half — INV-EC-005 as an assertion inside the must-compile-clean
  // file. This Scenario is a sibling of the `Rule` above, so its `ROut` is `World` alone. If this
  // directive ever goes unused, a Rule's extra Layer has leaked into the ambient `ROut` OUTSIDE the
  // Rule that contributed it, and the boundary roadmap success criterion 1 names is gone.
  // Directive order as above: plugin directive immediately over the code.
  Scenario("outside the rule", ({ Given }) => {
    // @ts-expect-error a Rule's extra Layer must be invisible outside that Rule — INV-EC-005
    // @effect-diagnostics-next-line missingEffectContext:off
    Given("reaches for RuleService", function*() {
      yield* (yield* RuleService).audit
    })
  })
})

// MUST COMPILE CLEAN.
// Three `@ts-expect-error` directives below are load-bearing ASSERTIONS, not suppressions of
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

// The Rule's own extra Layer.
export class RuleService extends Context.Service<RuleService, { readonly audit: Effect.Effect<void> }>()(
  "RuleService"
) {
  static readonly layer: Layer.Layer<RuleService> = Layer.succeed(RuleService, RuleService.of({ audit: Effect.void }))
}

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
  // The Feature level is unaffected by this plan: a two-argument `Scenario` still gets exactly the ambient `ROut`.
  Scenario("plain", ({ Given }) => {
    Given("a plain step", function*() {
      yield* World
    })
  })

  Scenario("scoped", ScenarioService.layer, ({ Given }) => {
    Given("uses both the ambient and the Scenario's own service", function*() {
      yield* World
      yield* (yield* ScenarioService).tag
    })
  })

  Scenario("outside the scoped Scenario", ({ Given }) => {
    // @ts-expect-error a Scenario's extra Layer must be invisible outside that Scenario — INV-EC-005
    // @effect-diagnostics-next-line missingEffectContext:off
    Given("reaches for ScenarioService", function*() {
      yield* (yield* ScenarioService).tag
    })
  })

  Rule("a rule", RuleService.layer, (ruleDsl) => {
    // A Scenario nested in the Rule: the Feature's ambient `World` and the Rule's `RuleService` are both reachable
    // from one step body.
    ruleDsl.Scenario("inside the rule", ({ Given }) => {
      Given("uses both the ambient and the Rule's own service", function*() {
        yield* World
        yield* (yield* RuleService).audit
      })
    })

    // A step registered DIRECTLY on the Rule dsl, a sibling of its own `Scenario` call — the five registrars `RuleDsl
    // extends ScenarioDsl` inherits, at "rule" scope.
    ruleDsl.Given("a rule-level step", function*() {
      yield* (yield* RuleService).audit
    })

    // All four hooks ADR-EC-010 scopes to a Rule, each a bare generator yielding the Rule's OWN service — the proof
    // that `HookRegistrar<ROut | R2>`'s union covers the extra Layer too, not just the ambient one.
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

    ruleDsl.Background(({ Given }) => {
      Given("a rule background step", function*() {
        yield* World
      })
    })

    // THE POSITIVE ASSERTION that `RuleDsl` exposes NEITHER once-per-Feature hook — Dsl.ts note (f).
    // @ts-expect-error BeforeAllScenarios is Feature-scoped only and must not be reachable from a Rule callback
    void ruleDsl.BeforeAllScenarios
  })

  // The two-argument form: a Rule that needs no extra services.
  Rule("a rule without an extra Layer", (ruleDsl) => {
    ruleDsl.Scenario("inside the plain rule", ({ Given }) => {
      Given("uses only the ambient service", function*() {
        yield* World
      })
      // @ts-expect-error a Rule declared without an extra Layer contributes no services of its own
      // @effect-diagnostics-next-line missingEffectContext:off
      Given("reaches for the other rule's service", function*() {
        yield* (yield* RuleService).audit
      })
    })
  })

  Scenario("outside the rule", ({ Given }) => {
    // @ts-expect-error a Rule's extra Layer must be invisible outside that Rule — INV-EC-005
    // @effect-diagnostics-next-line missingEffectContext:off
    Given("reaches for RuleService", function*() {
      yield* (yield* RuleService).audit
    })
  })
})

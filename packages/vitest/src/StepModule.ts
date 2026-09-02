/**
 * Typed step modules: step definitions written ONCE and used from any Feature whose ambient Layer
 * provides what they need ([ADR-EC-027](../../../spec/decisions/027-typed-step-modules.md),
 * BEH-EC-019).
 *
 * A module is a plain value. `defineSteps<R>` hands `define` the same five registrars a Scenario
 * gets, typed against `R`, and records each registration — pattern, normalised body, and the call
 * site in the MODULE file — without touching any registry. `dsl.use(module)` inside a
 * `describeFeature` container then registers those records into that container's scope, exactly
 * as if they had been written there. `R` is declared, never inferred (it sits in a contravariant
 * position); the `never` default is the safe direction, because a module body that reaches for a
 * service `R` does not name is rejected at the step by `effect(missingEffectContext)`.
 *
 * `requires` is a type-level witness only (`Effect.void` at runtime); it is what lets `use`
 * reconcile a module's `R` against the consuming container's `ROut` through ordinary Effect
 * variance. Asserted by `test/StepModule.test.ts`, the tsgo-gate pair
 * `step-module-satisfied.ts` / `step-module-missing-service.ts`, and the acceptance pair
 * `test/acceptance/step-modules.feature`.
 */
import * as Effect from "effect/Effect"
import { captureCallSite } from "./CallSite.ts"
import type { ModuleStep, ScenarioDsl, StepRegistrar } from "./Dsl.ts"
import { register } from "./Step.ts"

/** A reusable, typed set of step definitions. `R` is every service its steps may require. */
export interface StepModule<R> {
  /** Type-level witness of `R`; `Effect.void` at runtime. Must stay the FIRST property — `Dsl.ts` note (g). */
  readonly requires: Effect.Effect<void, never, R>
  /** The recorded steps, in definition order. */
  readonly steps: ReadonlyArray<ModuleStep>
}

/**
 * Define a step module. Write `defineSteps<World>(…)` — `R` cannot be inferred from the body.
 *
 * The module's own `use` lets modules compose: the inner module's steps are copied into this one.
 */
export const defineSteps = <R = never>(define: (dsl: ScenarioDsl<R>) => void): StepModule<R> => {
  const steps: Array<ModuleStep> = []
  const registrar = (keyword: ModuleStep["keyword"]): StepRegistrar<R> => (pattern, fn) => {
    steps.push({ keyword, pattern, body: register(pattern, fn), definedAt: captureCallSite() })
  }
  const dsl: ScenarioDsl<R> = {
    Given: registrar("Given"),
    When: registrar("When"),
    Then: registrar("Then"),
    And: registrar("And"),
    But: registrar("But"),
    use: (module) => {
      for (const step of module.steps) steps.push(step)
    }
  }
  define(dsl)
  return { requires: Effect.void, steps }
}

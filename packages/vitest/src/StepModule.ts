/**
 * `defineSteps`: a reusable, typed step module (ADR-EC-027, BEH-EC-019). A module declares `R`,
 * records its steps with their own call sites, and is registered into whatever scope `use` is
 * called in. `requires` must stay the FIRST property (`Dsl.ts`).
 */
import * as Effect from "effect/Effect"
import { captureCallSite } from "./CallSite.ts"
import { wrapWithDecode } from "./DecodeStepArgument.ts"
import type { DecodeStepArgument, ModuleStep, ScenarioDsl, StepRegistrar } from "./Dsl.ts"
import { register } from "./Step.ts"

export interface StepModule<R> {
  readonly requires: Effect.Effect<void, never, R>
  readonly steps: ReadonlyArray<ModuleStep>
}

/**
 * Define a step module.
 */
export const defineSteps = <R = never>(define: (dsl: ScenarioDsl<R>) => void): StepModule<R> => {
  const steps: Array<ModuleStep> = []
  // ADR-EC-057: symmetric with `Collect.ts`'s own registrar — a module step gets the same `decode`
  // overload a Feature/Rule/Scenario-level step does, since both share the identical `ScenarioDsl<R>`
  // type. `maybeFn === undefined` is the same two-vs-three-argument discriminator `Collect.ts` uses.
  const registrar =
    (keyword: ModuleStep["keyword"]): StepRegistrar<R> =>
    (pattern: string, fnOrDecode: unknown, maybeFn?: (...p: ReadonlyArray<any>) => any) => {
      const body = maybeFn === undefined
        ? register(pattern, fnOrDecode as any)
        : wrapWithDecode(fnOrDecode as DecodeStepArgument<any>, register(pattern, maybeFn))
      steps.push({ keyword, pattern, body, definedAt: captureCallSite() })
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

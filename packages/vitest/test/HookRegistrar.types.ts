/**
 * Type-level assertions for `TaggedHookRegistrar` (ADR-EC-035, BEH-EC-027, Dsl.ts note).
 *
 * Carries: BEH-EC-027.
 */
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import type { FeatureDsl, RuleDsl } from "../src/Dsl.ts"

class World extends Context.Service<World, { readonly ok: boolean }>()("HookRegistrar.types/World") {}

const noop = function*() {
  yield* Effect.void
}

export const use = (dsl: FeatureDsl<World, never>): void => {
  // POSITIVE CONTROL: the existing one-arg, unconditional form still compiles, unchanged.
  dsl.Before(noop)
  dsl.After(noop)
  dsl.BeforeStep(noop)
  dsl.AfterStep(noop)

  // NEW: the two-arg, tag-expression-scoped form — a leading string, then the body.
  dsl.Before("@db", noop)
  dsl.After("@db", noop)
  dsl.BeforeStep("@db and not @slow", noop)
  dsl.AfterStep("@db or @slow", noop)

  // The already-Effect.fn-wrapped body form is accepted in both arities, exactly like the unconditional form.
  const wrapped = Effect.fn("wrapped")(function*() {
    yield* Effect.void
  })
  dsl.Before(wrapped)
  dsl.Before("@db", wrapped)

  // NEGATIVE: BeforeAllScenarios/AfterAllScenarios stay HookRegistrar — a tag expression is a compile error by
  // arity, the SAME way a tag expression on either is rejected, and the same way EITHER is already a compile
  // error on a Rule's own dsl (see the RuleDsl block below).
  // @ts-expect-error BeforeAllScenarios does not accept a tag expression — it has no coherent single-Scenario
  // tag set to check against (no per-Scenario invocation exists for a once-per-Feature hook)
  dsl.BeforeAllScenarios("@db", noop)
  // @ts-expect-error AfterAllScenarios does not accept a tag expression, for the identical reason
  dsl.AfterAllScenarios("@db", noop)

  // POSITIVE CONTROL: the unconditional form is still all BeforeAllScenarios/AfterAllScenarios ever accepted.
  dsl.BeforeAllScenarios(noop)
  dsl.AfterAllScenarios(noop)
}

export const useInRule = (dsl: RuleDsl<World>): void => {
  // The identical tag-expression overload is available on a Rule's own Before/After/BeforeStep/AfterStep.
  dsl.Before("@db", noop)
  dsl.After("@db", noop)
  dsl.BeforeStep("@db", noop)
  dsl.AfterStep("@db", noop)

  // @ts-expect-error a Rule's dsl has no BeforeAllScenarios member at all — ADR-EC-010's existing restriction,
  // untouched by ADR-EC-035
  dsl.BeforeAllScenarios(noop)
  // @ts-expect-error the same restriction for AfterAllScenarios
  dsl.AfterAllScenarios(noop)
}

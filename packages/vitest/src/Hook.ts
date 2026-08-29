/**
 * The hook-registration seam: turn whatever a test author passed to `Before`/`After`/`BeforeStep`/
 * `AfterStep`/`BeforeAllScenarios`/`AfterAllScenarios` into the uniform `() => Effect` shape the
 * runner will execute, and group a flat list of registered hooks by kind.
 *
 * ADR-EC-005 gives a hook body the same two accepted forms a step body has, and `Step.ts`'s
 * `register` already tells them apart — DELEGATING to it here is strictly less code than
 * reimplementing the discriminator, and needs no edit to `Step.ts` at all.
 *
 * Five things about this module are not visible from the code.
 *
 * (a) **Normalization is delegated to `Step.ts`'s `register`, with the hook's kind passed in the
 *     `pattern` position, rather than duplicating `isGeneratorFn`.** `register`'s `pattern`
 *     parameter is used for exactly one thing — `Effect.fn(pattern)` — and ADR-EC-005 says a hook's
 *     span name is its own name (`"Before"`, `"After"`, …), which is exactly what `kind` is. A
 *     second copy of the generator-vs-Effect discriminator would be a second place for the same
 *     defect (a re-wrapped already-wrapped body) to hide.
 *
 * (b) **The generator branch is listed FIRST in `registerHook`'s own union, and this is now the
 *     THIRD copy of that constraint.** `Step.ts` note (b) and `Dsl.ts` note (a) both say the order
 *     is load-bearing: with the Effect-returning branch first, TypeScript still rejects a hook that
 *     requires an unprovided service, but for the wrong reason ("a Generator is not an Effect"
 *     instead of a missing-context error), so `@effect/tsgo`'s `effect(missingEffectContext)` stops
 *     firing while every existing test stays green — reordering causes no test to go red. A change
 *     to any one of these three copies (`Step.ts`, `Dsl.ts`, `Hook.ts`) must change the other two.
 *
 * (c) **Hooks take NO parameters, and `BeforeStep`/`AfterStep` do NOT receive the step text.** This
 *     is ADR-EC-005's stated Negative consequence, not an omission waiting to be filled in:
 *     `Effect.fn`'s one-name-per-definition contract means a hook wanting the current step's text
 *     calls `Effect.annotateCurrentSpan` itself. BEH-EC-006's published `(stepText: string) => …`
 *     signature is stale; plan 07-08 corrects the spec text, not this module.
 *
 * (d) **`HookBody` erases its own `A`/`E`/`R`, mirroring `Plan.ts`'s `StepBody` for the same reason.**
 *     By the time a hook body reaches a registry it has already been type-checked against the
 *     enclosing `describeFeature`'s ambient Layer — `Dsl.ts`'s `HookRegistrar<ROut>` is where that
 *     compile-time check happens. Naming concrete `A`/`E`/`R` here would just be detail nothing
 *     downstream reads.
 *
 * (e) **This module is not re-exported from `packages/vitest/src/index.ts`.** `registerHook` and
 *     `groupHooks` are internal stages of `describeFeature`, exactly like `Step.ts`'s `register` and
 *     `Registry.ts`'s `createRegistry` — publishing them would freeze this seam into the public
 *     contract before the DSL that drives it exists. This package's tests import it by relative path.
 */
import type * as Effect from "effect/Effect"
import type { HookDefinition, HookKind } from "./HookRegistry.ts"
import { register } from "./Step.ts"

/**
 * A normalised hook body: no parameters, its own `A`/`E`/`R` already erased — see note (d).
 */
export type HookBody = () => Effect.Effect<any, any, any>

/**
 * Every hook kind's bodies, in registration order, with every one of the six keys always present —
 * see `groupHooks`'s "absence is an empty array" note.
 */
export type HookSet = {
  readonly [K in HookKind]: ReadonlyArray<HookBody>
}

/**
 * Normalise a hook body registered under `kind` into the `() => Effect` shape.
 *
 * Delegates to `Step.ts`'s `register`, with `kind` filling the `pattern` position — see note (a).
 * A bare generator is wrapped with the hook's own kind as its span name (ADR-EC-005); an
 * already-wrapped function is returned BY IDENTITY.
 *
 * The explicit return annotation is required, not stylistic: `composite: true` demands it for
 * declaration emit on anything exported.
 *
 * @param kind - the hook kind, used verbatim as the span name
 * @param fn - the hook body; generator branch FIRST, per note (b)
 */
export const registerHook = <A, E, R>(
  kind: HookKind,
  fn:
    | (() => Effect.gen.Return<A, E, R>)
    | (() => Effect.Effect<A, E, R>)
): () => Effect.Effect<A, E, R> => register<[], A, E, R>(kind, fn)

/**
 * Partition a flat list of registered hook definitions into a `HookSet`, preserving registration
 * order WITHIN each kind.
 *
 * Every one of the six keys is always present — an empty array for a kind nobody registered, never
 * an absent key. This is the same `exactOptionalPropertyTypes` argument `Registry.ts` makes for
 * `RegistryScope.name`: every downstream consumer can iterate a kind's array without a guard.
 */
export const groupHooks = (definitions: ReadonlyArray<HookDefinition<HookBody>>): HookSet => {
  const before: Array<HookBody> = []
  const after: Array<HookBody> = []
  const beforeStep: Array<HookBody> = []
  const afterStep: Array<HookBody> = []
  const beforeAllScenarios: Array<HookBody> = []
  const afterAllScenarios: Array<HookBody> = []

  for (const definition of definitions) {
    switch (definition.kind) {
      case "Before": {
        before.push(definition.body)
        break
      }
      case "After": {
        after.push(definition.body)
        break
      }
      case "BeforeStep": {
        beforeStep.push(definition.body)
        break
      }
      case "AfterStep": {
        afterStep.push(definition.body)
        break
      }
      case "BeforeAllScenarios": {
        beforeAllScenarios.push(definition.body)
        break
      }
      case "AfterAllScenarios": {
        afterAllScenarios.push(definition.body)
        break
      }
    }
  }

  return {
    Before: before,
    After: after,
    BeforeStep: beforeStep,
    AfterStep: afterStep,
    BeforeAllScenarios: beforeAllScenarios,
    AfterAllScenarios: afterAllScenarios
  }
}

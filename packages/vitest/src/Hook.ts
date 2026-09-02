/**
 * Hook registration and batching: every hook in a batch runs, failures are combined with
 * `Cause.combine` rather than first-winning, and Feature hooks wrap Rule hooks
 * (Feature-then-Rule in, Rule-then-Feature out) — BEH-EC-006/017, `test/Hook.test.ts`.
 */
import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import type { HookDefinition, HookKind } from "./HookRegistry.ts"
import type { ErasedEffect } from "./Plan.ts"
import { register } from "./Step.ts"

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
 * @param kind - the hook kind, used verbatim as the span name
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

/**
 * The `HookSet` of a Scenario with no enclosing Rule: all six keys present, every one empty.
 */
export const emptyHookSet: HookSet = {
  Before: [],
  After: [],
  BeforeStep: [],
  AfterStep: [],
  BeforeAllScenarios: [],
  AfterAllScenarios: []
}

/**
 * Pass `emptyHookSet` as `rule` for a Scenario with no enclosing Rule.
 *
 * @param feature - the Feature-level hooks (those whose `ruleId` is `null`)
 * @param rule - the enclosing Rule's own hooks, or `emptyHookSet` if there is no enclosing Rule
 */
export const mergeHookSets = (feature: HookSet, rule: HookSet): HookSet => ({
  Before: [...feature.Before, ...rule.Before],
  After: [...rule.After, ...feature.After],
  BeforeStep: [...feature.BeforeStep, ...rule.BeforeStep],
  AfterStep: [...rule.AfterStep, ...feature.AfterStep],
  BeforeAllScenarios: feature.BeforeAllScenarios,
  AfterAllScenarios: feature.AfterAllScenarios
})

export const runHookBatch = (hooks: ReadonlyArray<HookBody>): ErasedEffect =>
  Effect.gen(function*() {
    const failures: Array<Cause.Cause<unknown>> = []

    for (const hook of hooks) {
      const exit = yield* Effect.exit(hook())
      if (Exit.isFailure(exit)) {
        failures.push(exit.cause)
      }
    }

    if (failures.length === 0) {
      return
    }

    const combined = failures.reduce<Cause.Cause<unknown>>(
      (folded, cause) => Cause.combine(folded, cause),
      Cause.empty
    )
    return yield* Effect.failCause(combined)
  })

/**
 * Hook registration and batching: every hook in a batch runs, failures are combined with
 * `Cause.combine` rather than first-winning, and Feature hooks wrap Rule hooks
 * (Feature-then-Rule in, Rule-then-Feature out) — BEH-EC-006/017, `test/Hook.test.ts`.
 *
 * ADR-EC-035/BEH-EC-027: a `HookSet` entry additionally carries its own pre-compiled tag-expression
 * matcher (`HookEntry.matches`), compiled ONCE per Feature at `groupHooks` time — never re-parsed per
 * Scenario, mirroring `Runner.ts`'s existing "hoisted `mergeHookSets`, runs once per Rule" note.
 * `runHookBatch` filters against a Scenario's own tags immediately ahead of invoking each entry, so a
 * filtered-out hook is excluded BEFORE it becomes a batch member — never invoked, never a source of a
 * dropped failure, and therefore never in tension with the independent-batch/combined-failure
 * guarantee (BEH-EC-017) that batch already has.
 */
import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import type { HookDefinition, HookKind } from "./HookRegistry.ts"
import { compileHookTagExpr, type TagMatcher } from "./HookTagExpression.ts"
import type { ErasedEffect } from "./Plan.ts"
import { register } from "./Step.ts"

export type HookBody = () => Effect.Effect<any, any, any>

/**
 * One `HookSet` slot: a hook's normalised body, plus its own pre-compiled tag-expression matcher —
 * `null` for an unconditional hook (today's only shape before ADR-EC-035), which `runHookBatch` never
 * consults before invoking.
 */
export type HookEntry = {
  readonly body: HookBody
  readonly matches: TagMatcher | null
}

/**
 * Every hook kind's entries, in registration order, with every one of the six keys always present —
 * see `groupHooks`'s "absence is an empty array" note.
 */
export type HookSet = {
  readonly [K in HookKind]: ReadonlyArray<HookEntry>
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
 * order WITHIN each kind, and compiling each definition's own `tagExpr` into a matcher (ADR-EC-035) —
 * ONCE here, never per Scenario. `BeforeAllScenarios`/`AfterAllScenarios` definitions always carry
 * `tagExpr: null` in practice (excluded from the tag-expression overload at the Dsl, BEH-EC-027), so
 * `compileHookTagExpr` is a structural no-op for them, not a special case this function branches on.
 *
 * @param definitions - one Feature's or Rule's flat, unfiltered hook definitions
 * @param availableTags - the Feature's declared tag universe (`featureTagUniverse`), required to
 * compile any definition whose `tagExpr` is non-null
 * @param featureUri - the Feature's `.feature` file, carried only for a compile error's message
 */
export const groupHooks = (
  definitions: ReadonlyArray<HookDefinition<HookBody>>,
  availableTags: ReadonlyArray<string>,
  featureUri: string
): HookSet => {
  const before: Array<HookEntry> = []
  const after: Array<HookEntry> = []
  const beforeStep: Array<HookEntry> = []
  const afterStep: Array<HookEntry> = []
  const beforeAllScenarios: Array<HookEntry> = []
  const afterAllScenarios: Array<HookEntry> = []

  const toEntry = (definition: HookDefinition<HookBody>): HookEntry => ({
    body: definition.body,
    matches: compileHookTagExpr({
      tagExpr: definition.tagExpr,
      availableTags,
      kind: definition.kind,
      featureUri
    })
  })

  for (const definition of definitions) {
    switch (definition.kind) {
      case "Before": {
        before.push(toEntry(definition))
        break
      }
      case "After": {
        after.push(toEntry(definition))
        break
      }
      case "BeforeStep": {
        beforeStep.push(toEntry(definition))
        break
      }
      case "AfterStep": {
        afterStep.push(toEntry(definition))
        break
      }
      case "BeforeAllScenarios": {
        beforeAllScenarios.push(toEntry(definition))
        break
      }
      case "AfterAllScenarios": {
        afterAllScenarios.push(toEntry(definition))
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

/**
 * Run one independent batch of hooks (BEH-EC-017), skipping any entry whose own tag-expression
 * matcher rejects `scenarioTags` (BEH-EC-027) — a filtered-out entry is never invoked and therefore
 * never contributes a failure to combine or drop; it is excluded BEFORE the loop reaches it, not a
 * batch member whose result is discarded afterward.
 *
 * @param entries - one kind's hook entries, already grouped and tag-compiled by `groupHooks`
 * @param scenarioTags - the CURRENT Scenario's own fully-flattened, inherited tags — `[]` for
 * `BeforeAllScenarios`/`AfterAllScenarios`, whose entries never carry a matcher to consult (BEH-EC-027)
 */
export const runHookBatch = (entries: ReadonlyArray<HookEntry>, scenarioTags: ReadonlyArray<string>): ErasedEffect =>
  Effect.gen(function*() {
    const failures: Array<Cause.Cause<unknown>> = []

    for (const entry of entries) {
      if (entry.matches !== null && !entry.matches(scenarioTags)) {
        continue
      }
      const exit = yield* Effect.exit(entry.body())
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

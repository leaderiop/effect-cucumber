/**
 * The hook-registration seam: turn whatever a test author passed to `Before`/`After`/`BeforeStep`/
 * `AfterStep`/`BeforeAllScenarios`/`AfterAllScenarios` into the uniform `() => Effect` shape the
 * runner will execute, group a flat list of registered hooks by kind, MERGE a Feature's `HookSet`
 * with an enclosing Rule's in D-02's order, and run one kind's hooks as an INDEPENDENT batch
 * (D-02/D-03) whose failures are combined, never dropped and never first-wins.
 *
 * ADR-EC-005 gives a hook body the same two accepted forms a step body has, and `Step.ts`'s
 * `register` already tells them apart — DELEGATING to it here is strictly less code than
 * reimplementing the discriminator, and needs no edit to `Step.ts` at all.
 *
 * Eight things about this module are not visible from the code.
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
 * (e) **This module is not re-exported from `packages/vitest/src/index.ts`.** `registerHook`,
 *     `groupHooks` and `runHookBatch` are internal stages of `describeFeature`, exactly like
 *     `Step.ts`'s `register` and `Registry.ts`'s `createRegistry` — publishing them would freeze this
 *     seam into the public contract before the DSL that drives it exists. This package's tests import
 *     it by relative path.
 *
 * (f) **`runHookBatch` is a bare `for` loop of `yield*` inside ONE `Effect.gen`, never
 *     `Effect.forEach` or `Effect.all`.** `ScenarioEffect.ts` note (a) states the reason and it
 *     applies identically here: with a combinator, "every hook runs" becomes "this combinator's
 *     default concurrency happens to be 1", and `{ concurrency: "unbounded" }` reads like a
 *     performance win while interleaving hooks the author registered in order. The plausible tidy-up
 *     is swapping the loop for `Effect.forEach(hooks, ..., { concurrency: "unbounded" })`; the test
 *     that goes red is the ordered `:start`/`:end`-bracketed log of three hooks where the first
 *     failed — a concurrent implementation still produces all three names, but not in order, and not
 *     with every `:start` preceding its own `:end`.
 *
 * (g) **A batch's failures are folded with `Cause.combine` starting from `Cause.empty`, never
 *     wrapped in a named error class.** `Cause.combine` preserves each hook's own error value by
 *     identity inside the combined cause — exactly what `ScenarioEffect.ts` note (a) requires of a
 *     step's error, extended here to a hook's. A `HookBatchError` wrapping the individual causes "to
 *     follow the house error style" would re-tag every one of them and lose that identity; the
 *     two-failure identity test (walking the combined cause, not `Cause.squash`ing it) is what goes
 *     red. Also: `Effect.ensuring` is NOT used anywhere in this module — its finalizer's error
 *     channel is `never` in `effect@4.0.0-rc.112`, so a hook that can fail is not even assignable to
 *     it, and it merges no causes. BEH-EC-006's literal "via `Effect.ensuring`" names the guarantee
 *     this phase's later plans build on `Effect.onExit` to provide, not the combinator used here.
 *
 * (h) **Why `mergeHookSets` needs no new finalizer nesting, and why its ORDER is the whole of it.**
 *     The obvious way to give a Rule's `After` hooks their own guarantee is a second finalizer
 *     wrapping the Feature's — a nested `Effect.onExit` per tier at the `ScenarioEffect.ts` call
 *     site. That is not needed, and adding it would be actively worse. `runHookBatch` already treats
 *     whatever array it is handed as ONE independent batch: every hook runs regardless of an earlier
 *     one's failure, and every failing cause is combined. That is a property of `runHookBatch`
 *     itself, not of how many logical tiers contributed entries to the array. So a merged array runs
 *     with exactly the semantics two separately-wrapped batches would have had, minus a nesting
 *     level whose only visible effect would be a second chance to get the unwind order wrong.
 *     What `mergeHookSets` therefore has to get right is ORDER, and only order — which is why it is
 *     pure array concatenation, and why D-02's ordering is spelled out once, here, rather than
 *     reconstructed at each call site. Consumers merge once per Rule and hand the result to the SAME
 *     `buildScenarioEffect`/`runHookBatch` call sites that already exist, unchanged.
 */
import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
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

/**
 * The `HookSet` of a Scenario with no enclosing Rule: all six keys present, every one empty.
 *
 * ONE shared instance rather than a factory, and that is safe rather than merely convenient:
 * `HookSet`'s values are `ReadonlyArray`s, nothing in this package mutates a `HookSet`'s arrays in
 * place (`groupHooks` builds fresh arrays, `mergeHookSets` concatenates into fresh ones, and
 * `runHookBatch` only iterates), so no consumer can observe another consumer's use of it.
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
 * Combine a Feature's `HookSet` with that of the Rule enclosing the Scenario about to run, in the
 * order D-02 requires. Pass `emptyHookSet` as `rule` for a Scenario with no enclosing Rule.
 *
 * Before-shaped kinds run OUTER-TO-INNER: the Feature's gate first, then that Rule's own, matching
 * the `describe(feature) → describe(rule)` nesting `Runner.ts` already emits — general setup before
 * specific setup. After-shaped kinds unwind INNER-TO-OUTER: the Rule's guarantee first, then the
 * Feature's. That reversal is the same "outer wraps inner, and unwinds symmetrically" instinct
 * `ScenarioEffect.ts` note (e) already applies to `Before`/`After` around a single Scenario, applied
 * one level up the Rule/Feature nesting instead of the hook/step nesting.
 *
 * `BeforeAllScenarios`/`AfterAllScenarios` are NOT merged — `feature`'s arrays pass straight
 * through. ADR-EC-010 makes only `Before`/`After`/`BeforeStep`/`AfterStep` Rule-scopeable, so
 * `RuleDsl` never exposes those two registrars and `rule`'s arrays for them are empty by
 * construction. Concatenating an always-empty array would be a no-op that WORKS, which is exactly
 * the problem: it would leave nothing in the source saying those two kinds are Feature-only, and a
 * later change that made `rule`'s arrays reachable would silently start merging them. The
 * pass-through states the invariant instead of depending on it.
 *
 * Pure array composition, deliberately — see note (h) for why no second `Effect.onExit` tier is
 * needed anywhere this is consumed, and why order is the entire contract of this function.
 *
 * The explicit return annotation is required, not stylistic: `composite: true` demands it for
 * declaration emit on anything exported.
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
 * Run every hook in `hooks`, in array order (registration order, D-01), independently: an earlier
 * failure does NOT stop a later hook from running (D-02), a deliberate departure from
 * INV-EC-001's fail-fast. Every failing hook's `Cause` is folded together with `Cause.combine`
 * (D-03) — nothing is dropped, nothing wins first, nothing goes to `console.warn`.
 *
 * Written as a bare `for` loop of `yield*` inside ONE `Effect.gen` — see note (f). Each hook is run
 * to an `Exit` via `Effect.exit`, so a failure never short-circuits the loop; a failing exit's
 * `Cause` is collected, and an empty collection means the batch succeeded with `void`.
 *
 * See note (g) for why the fold uses `Cause.combine` rather than a wrapper error class, and why
 * `Effect.ensuring` is not the combinator anywhere in this module.
 */
export const runHookBatch = (hooks: ReadonlyArray<HookBody>): Effect.Effect<void, unknown, any> =>
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

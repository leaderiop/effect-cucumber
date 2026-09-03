/**
 * SPIKE prototype for GitHub issue #32 — tag-expression-scoped hooks.
 *
 * This is a throwaway copy/adaptation of `packages/vitest/src/HookRegistry.ts` +
 * `packages/vitest/src/Hook.ts`, extended with an optional tag-expression string per hook
 * registration. It is NOT wired into the real package — see `research/tagged-hooks-spike.md`
 * for the write-up and the composition finding against `spec/behaviors/07-hook-ordering-and-guarantees.md`.
 *
 * The tag-expression grammar/evaluator is NOT hand-rolled and is NOT `@cucumber/tag-expressions`
 * (that package is not in this repo's dependency tree at all — verified: no `@cucumber/tag-expressions`
 * under node_modules). It is the REAL parser vitest's own `--tagsFilter` uses under the hood,
 * `createTagsFilter` from the public `@vitest/runner/utils` entrypoint (verified against the
 * installed `@vitest/runner@4.1.11`: `node_modules/.pnpm/@vitest+runner@4.1.11/.../dist/chunk-artifact.js`,
 * exported via `dist/utils.js`). Its grammar is `and`/`or`/`not`/`&&`/`||`/`!`/parens — the same
 * boolean tag-expression grammar Cucumber's own `@cucumber/tag-expressions` implements.
 */
import { createTagsFilter } from "@vitest/runner/utils"
import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"

export type HookKind = "Before" | "After" | "BeforeStep" | "AfterStep"

export type HookBody = () => Effect.Effect<any, any, any>

/**
 * One registered hook: same shape as the real `HookDefinition<Fn>`, PLUS an optional tag
 * expression. `tagExpr: null` means "unconditional", matching every Scenario — i.e. today's
 * behaviour, unchanged, is the `null` case of this new field, not a separate code path.
 */
export type TaggedHookDefinition<Fn> = {
  readonly kind: HookKind
  readonly body: Fn
  readonly ruleId: string | null
  readonly tagExpr: string | null
}

/**
 * Sketch of the new `HookRegistrar<ROut>` from `Dsl.ts`, widened with a second call signature.
 * The existing zero-arg overload (`Before(fn)`) is UNCHANGED and stays first in the union, per
 * this repo's own convention (`Dsl.ts`'s note: generator branch first for the diagnostic to fire) —
 * here the "existing shape first" convention is preserved at the OVERLOAD level instead.
 *
 * Types only, not exercised at runtime by this spike (TypeScript overload resolution is a
 * compile-time-only concern) — the runtime proof below registers directly through
 * `registerTaggedHook(kind, tagExpr, fn)`.
 */
export interface TaggedHookRegistrar<ROut> {
  // Existing shape — untouched.
  <A, E>(fn: () => Effect.Effect<A, E, ROut>): void
  // NEW: tag-expression-scoped registration, additive.
  <A, E>(tagExpr: string, fn: () => Effect.Effect<A, E, ROut>): void
}

/**
 * A new hook registry, mirroring `createHookRegistry` in `HookRegistry.ts`.
 */
export const createTaggedHookRegistry = <Fn>() => {
  const records: Array<TaggedHookDefinition<Fn>> = []

  const register = (kind: HookKind, ruleId: string | null, tagExpr: string | null, body: Fn): void => {
    records.push({ kind, body, ruleId, tagExpr })
  }

  const hooks = (): ReadonlyArray<TaggedHookDefinition<Fn>> => [...records]

  return { register, hooks }
}

/**
 * One entry of a `TaggedHookSet`: a hook body plus its PRE-COMPILED tag-expression matcher.
 * Compiling once here (at HookSet-build time, i.e. once per Feature/Rule, not once per Scenario)
 * mirrors how the real code hoists `mergeHookSets` outside every Scenario thunk in `Runner.ts`
 * ("Hoisted ... so it runs once per Rule, outside every thunk").
 */
export type TaggedHookEntry = {
  readonly body: HookBody
  /** `null` — unconditional, always runs (today's behaviour). Non-null — compiled once via the
   * real `createTagsFilter`, called against a Scenario's own flattened tags at invocation time. */
  readonly matches: ((scenarioTags: ReadonlyArray<string>) => boolean) | null
}

export type TaggedHookSet = {
  readonly [K in HookKind]: ReadonlyArray<TaggedHookEntry>
}

export const emptyTaggedHookSet: TaggedHookSet = {
  Before: [],
  After: [],
  BeforeStep: [],
  AfterStep: []
}

/**
 * Compile one hook definition's `tagExpr` into a matcher, using the REAL vitest tag-expression
 * parser, or `null` if the hook is unconditional.
 *
 * @param tagExpr - the hook's own tag expression, or `null`
 * @param availableTags - the FEATURE's declared tag universe (every tag literal that appears
 * anywhere in the Feature this hook belongs to) — required because `createTagsFilter`'s grammar
 * validates every tag literal in the expression against a declared universe (`resolveTagPattern`
 * in `@vitest/runner`'s source throws "not defined" for anything absent from it). This is the
 * SAME "declared tag universe" problem ADR-EC-026 already solved for CLI `--tagsFilter`
 * (`gherkinTags()`), independently rediscovered here for a completely different call site — see
 * the write-up's composition finding.
 */
export const compileTagExpr = (
  tagExpr: string | null,
  availableTags: ReadonlyArray<string>
): ((scenarioTags: ReadonlyArray<string>) => boolean) | null => {
  if (tagExpr === null) return null
  const filter = createTagsFilter([tagExpr], availableTags.map((name) => ({ name })))
  return (scenarioTags: ReadonlyArray<string>) => filter([...scenarioTags])
}

/**
 * Partition + compile a flat list of registered hook definitions into a `TaggedHookSet`,
 * preserving registration order within each kind — same contract as the real `groupHooks`.
 */
export const groupTaggedHooks = (
  definitions: ReadonlyArray<TaggedHookDefinition<HookBody>>,
  availableTags: ReadonlyArray<string>
): TaggedHookSet => {
  const before: Array<TaggedHookEntry> = []
  const after: Array<TaggedHookEntry> = []
  const beforeStep: Array<TaggedHookEntry> = []
  const afterStep: Array<TaggedHookEntry> = []

  const push = (bucket: Array<TaggedHookEntry>, definition: TaggedHookDefinition<HookBody>) => {
    bucket.push({ body: definition.body, matches: compileTagExpr(definition.tagExpr, availableTags) })
  }

  for (const definition of definitions) {
    switch (definition.kind) {
      case "Before": push(before, definition); break
      case "After": push(after, definition); break
      case "BeforeStep": push(beforeStep, definition); break
      case "AfterStep": push(afterStep, definition); break
    }
  }

  return { Before: before, After: after, BeforeStep: beforeStep, AfterStep: afterStep }
}

/**
 * The tag-expression-aware `runHookBatch`. Same independent-batch, `Cause.combine` semantics as
 * the real `Hook.ts`, EXTENDED with a filtering step ahead of the loop: an entry whose `matches`
 * predicate returns `false` for this Scenario's tags is skipped BEFORE it becomes part of the
 * batch — it never runs, never contributes an exit, and is therefore ALSO never a source of a
 * "silently dropped failure": there is no failure, because there is no invocation.
 *
 * @param entries - one kind's hook entries, already grouped and tag-compiled
 * @param scenarioTags - the Scenario's own fully-flattened, inherited tags (Feature/Rule/Examples)
 */
export const runTaggedHookBatch = (
  entries: ReadonlyArray<TaggedHookEntry>,
  scenarioTags: ReadonlyArray<string>
): Effect.Effect<void, unknown, never> =>
  Effect.gen(function*() {
    const failures: Array<Cause.Cause<unknown>> = []
    const runLog: Array<string> = []

    for (const entry of entries) {
      if (entry.matches !== null && !entry.matches(scenarioTags)) {
        continue // filtered out — never invoked, never a batch member
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

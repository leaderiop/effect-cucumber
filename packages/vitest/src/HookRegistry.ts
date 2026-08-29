/**
 * The hook-definition store behind `describeFeature` — one per call, never one per module.
 *
 * `Registry.ts` is the structure-for-structure analog (a step-definition store with the identical
 * per-call-factory discipline), but this module is a SIBLING of it, not an extension. Hooks are
 * Feature-scoped only (07-CONTEXT.md phase boundary: "There is no Rule-scoped hook narrowing in this
 * roadmap"), so `Registry.ts`'s whole scope stack — `pushScope`, `popScope`, `currentScope`,
 * `RegistryScope` — is dead weight on the hook path and is deliberately not reproduced here.
 *
 * Six things about this module are not visible from the code.
 *
 * (a) **Why this is a factory and not a module singleton.** DSL-04 forbids a module-level mutable
 *     registry outright, and the prohibition is the requirement itself, not a stylistic preference.
 *     Two `describeFeature` calls in one file would share a single hook list: a `Before` hook
 *     registered by the first Feature would run for the second Feature's Scenarios too, and the
 *     whole suite would become order-dependent — passing when run together, failing when run alone,
 *     or the reverse. `Registry.ts` note (a) records the same failure mode as scar tissue from three
 *     `cypress-cucumber-preprocessor` bugs (issues #298, #364, #549), each filed against a
 *     module-level singleton. So every piece of mutable state here lives in a closure created by
 *     `createHookRegistry`, and there is no way to reach it except through the object that call
 *     returns.
 *
 *     Note that reference inequality between two instances does NOT prove this. A closure that
 *     reads a module-level array still hands back two different objects. `test/HookRegistry.test.ts`
 *     carries the assertion that actually discriminates: register into one instance, then observe
 *     that the other is still empty.
 *
 * (b) **Why `hooks()` returns a copy.** The live array keeps growing for as long as the define
 *     callback runs. A caller handed the internal reference would hold a value that mutates
 *     underneath it — a snapshot taken before a second `register` call would silently report
 *     whatever the array happened to contain at read time instead of at call time. Copying makes
 *     `hooks()` a snapshot in fact and not just in name, mirroring `Registry.ts`'s `definitions()`
 *     (note (b)).
 *
 * (c) **Why `Fn` stays a free type parameter and this module imports nothing.** A hook body's real
 *     type is `() => Effect<A, E, R>`, and that type lives in `Hook.ts`. Naming it here would tie
 *     this container to `Hook.ts`, `Dsl.ts` and `effect` itself, none of which this module needs to
 *     know about to store and hand back a body by reference. Left abstract, the container is
 *     complete and testable on its own. This module deliberately has no dependencies of any kind —
 *     an acceptance criterion asserts the import count is zero, exactly as `Registry.ts` note (c)
 *     asserts for its own module.
 *
 * (d) **Why registration order is the contract and no sort may appear.** D-01 makes hook run order
 *     the order hooks were registered in, for every kind independently and across kinds together.
 *     `records.push` followed by a spread copy already gives that for free — introducing a sort
 *     anywhere on this path, even one that looks harmless (alphabetising by kind, say), would
 *     silently reorder a `Before` batch and break `test/Hook.test.ts`'s two-hooks-in-registration-
 *     order assertion without a type error or a lint failure to catch it.
 *
 * (e) **Why there is no `definedAt`.** `Registry.ts` carries `definedAt` because `Plan.ts` ORDERS an
 *     ambiguous step's matching patterns by it. Nothing in this phase consumes a hook's site:
 *     ADR-EC-005 makes the `Effect.fn(kind)` span the attribution channel for a hook failure, and
 *     `ScenarioEffect.ts` note (a) forbids re-tagging a failure into a wrapper error that could carry
 *     one instead. Recording an unconsumed field would be the "say only what is true" violation
 *     AGENTS.md §4 names — a reader would assume something downstream reads it, and nothing does.
 *
 * (f) **Why this is not re-exported from `packages/vitest/src/index.ts`.** A registry is an internal
 *     stage of `describeFeature`, not a surface a consumer composes against; publishing it would
 *     freeze this store's shape into the public contract before the DSL that drives it is written.
 *     `Registry.ts` note (d), `Step.ts`, `TestApi.ts`, `Plan.ts` and `ScenarioEffect.ts` all carry
 *     the identical paragraph. This package's tests import it by relative path.
 */

/**
 * The six hook kinds a Feature-level DSL can register a body under, in the canonical order
 * `Before`/`After`/`BeforeStep`/`AfterStep`/`BeforeAllScenarios`/`AfterAllScenarios`.
 *
 * A string-literal union rather than an enum: `erasableSyntaxOnly` is on workspace-wide, and an enum
 * emits runtime code (`Registry.ts`'s `RegistryScopeKind` is the precedent).
 */
export type HookKind =
  | "Before"
  | "After"
  | "BeforeStep"
  | "AfterStep"
  | "BeforeAllScenarios"
  | "AfterAllScenarios"

/** One registered hook: the kind it was registered under, and its normalised body. */
export type HookDefinition<Fn> = {
  readonly kind: HookKind
  readonly body: Fn
}

/**
 * A new hook registry sharing no state with any other registry.
 *
 * Takes NO arguments, unlike `createRegistry`, which needs a `featureName` to seed a scope stack
 * that does not exist here — hooks have no scope of their own to be attributed to.
 */
export const createHookRegistry = <Fn>() => {
  const records: Array<HookDefinition<Fn>> = []

  /** Record one hook body under `kind`, at the end of the list — see note (d) on order. */
  const register = (kind: HookKind, body: Fn): void => {
    records.push({ kind, body })
  }

  /** A snapshot — see note (b). Never the live array. */
  const hooks = (): ReadonlyArray<HookDefinition<Fn>> => [...records]

  return { register, hooks }
}

/**
 * Derived from the factory rather than hand-written, following `RegistryShape<Fn>`'s precedent, so
 * the shape and the thing it describes cannot drift apart.
 */
export type HookRegistryShape<Fn> = ReturnType<typeof createHookRegistry<Fn>>

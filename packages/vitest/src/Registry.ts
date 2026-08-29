/**
 * The step-definition container behind `describeFeature` — one per call, never one per module.
 *
 * (a) **Why this is a factory and not a module singleton.** DSL-04 forbids a module-level
 *     `let currentScope` or an exported mutable registry outright, and the prohibition is the
 *     requirement itself rather than a stylistic preference. Two `describeFeature` calls in one
 *     file would share a single step map and a single scope stack: steps registered by the first
 *     feature would resolve inside the second, a `Scenario` left on the stack by an early return
 *     would silently re-parent the next feature's steps, and the whole suite would become
 *     order-dependent — passing when run together, failing when run alone, or the reverse.
 *     PITFALLS.md's Pitfall 14 records this as scar tissue rather than theory: it is the root
 *     cause behind three separate `cypress-cucumber-preprocessor` bugs (issues #298, #364, #549),
 *     each filed against a module-level singleton. So every piece of mutable state here lives in
 *     a closure created by `createRegistry`, and there is no way to reach it except through the
 *     object that call returns. `packages/gherkin/src/ParameterTypes.ts`'s
 *     `createParameterTypeStore` is the precedent being copied, structure for structure.
 *
 *     Note that reference inequality between two instances does NOT prove this. A closure that
 *     reads a module-level array still hands back two different objects. `test/Registry.test.ts`
 *     carries the assertions that actually discriminate: register into one instance, then observe
 *     that the other is still empty.
 *
 * (b) **Why `definitions()` returns a copy.** The live array keeps growing for as long as the
 *     define callback runs. A caller handed the internal reference would hold a value that mutates
 *     underneath it — a snapshot taken to count steps, or to diff before and after a `Background`,
 *     would silently report whatever the array happened to contain at read time instead of at call
 *     time. Copying makes `definitions()` a snapshot in fact and not just in name, and it also
 *     removes the only route by which a caller could splice or reorder state this module owns.
 *     The cost is a shallow copy of a handful of records per call, which is not a budget worth
 *     defending.
 *
 * (c) **Why `Fn` stays a free type parameter and this module depends on nothing.** A step body's
 *     real type is `(...params) => Effect<A, E, R>`, and that type lives in the DSL. Naming it
 *     here would tie the container to `Dsl.ts`, `describeFeature.ts` and
 *     `@effect-cucumber/gherkin`, none of which exist yet. Left abstract, the container is
 *     complete and testable on its own, ahead of the type surface that will instantiate it. This
 *     module deliberately has no dependencies of any kind — an acceptance criterion asserts the
 *     count is zero.
 *
 *     `DefinitionSite` below is declared here for exactly that reason, even though `CallSite.ts` is
 *     what produces one. A type-only `import type { DefinitionSite } from "./CallSite.ts"` would be
 *     the obvious direction and would break the claim above; pointed the other way, the leaf that
 *     already parses stack traces takes the one import and this module keeps none. There is no cycle
 *     either way, because nothing here imports anything.
 *
 * (d) **Why this is not re-exported from `packages/vitest/src/index.ts`.** A registry is an
 *     internal stage of `describeFeature`, not a surface a consumer composes against; publishing
 *     it would freeze the scope stack's shape into the public contract before the DSL that drives
 *     it is written. This follows `@effect-cucumber/gherkin`'s own precedent, where `Parser`,
 *     `Pickles` and `Correlate` are all internal and only `loadFeature` is published. Plan 05-03
 *     owns that barrel and should leave this out of it.
 */

/**
 * The three Gherkin constructs that can own step definitions. A string-literal union rather than
 * an enum: `erasableSyntaxOnly` is on workspace-wide, and an enum emits runtime code.
 */
export type RegistryScopeKind = "feature" | "background" | "scenario"

/**
 * A frame of the scope stack.
 *
 * `name` is `string | null` and not an optional property, deliberately. `exactOptionalPropertyTypes`
 * is on, so an optional `name?: string` would make "absent" and "present but undefined" two
 * distinct states for one idea. A `Background` genuinely has no name while a `Scenario` always
 * does, so the absence is real data worth spelling — `null` says it once, and every reader has to
 * handle it.
 */
export type RegistryScope = {
  readonly kind: RegistryScopeKind
  readonly name: string | null
}

/** The Gherkin step keywords a definition can be registered under. */
export type StepKeyword = "Given" | "When" | "Then" | "And" | "But"

/**
 * Where a definition was written: an absolute path, and V8's own 1-based line and column.
 *
 * Registration-time data this module owns, exactly as `RegistryScope` is — the MECHANISM that
 * produces one lives in `CallSite.ts`, which imports this type rather than exporting it. Note (c)
 * has the full argument for that direction.
 *
 * Absence is `null` and not an optional property, for the same `exactOptionalPropertyTypes` reason
 * spelled out for `RegistryScope.name`: a site that could not be captured is real data, and one
 * spelling of "there is none" is better than two.
 */
export type DefinitionSite = {
  readonly file: string
  readonly line: number
  readonly column: number
}

/**
 * One registered step, together with the scope that was on top of the stack when it was
 * registered. Capturing the scope at registration time is what lets a later stage tell a
 * `Background` step from a `Scenario` step without re-walking the document.
 */
export type StepDefinition<Fn> = {
  readonly keyword: StepKeyword
  readonly pattern: string
  readonly body: Fn
  readonly scope: RegistryScope
  /**
   * Where the author's own `Given`/`When`/`Then` call was written — never a line inside this
   * package.
   *
   * `null` means the capture FAILED (there was no stack to read, or no frame outside the capturing
   * module's own directory), not "deliberately not captured". The distinction matters downstream:
   * `CallSite.ts`'s `formatCallSite` renders it as words rather than as an empty `:` pair, and
   * `compareCallSites` sorts it last instead of pretending it is line 0.
   *
   * `Plan.ts` orders an ambiguous step's matching patterns by this field (CONTEXT.md D-03), so the
   * list points the reader at the definitions to go reconcile, in an order that does not depend on
   * which module vitest happened to import first.
   */
  readonly definedAt: DefinitionSite | null
}

/**
 * A new registry sharing no state with any other registry.
 *
 * The stack is seeded with a single root frame for the feature, so `currentScope()` is meaningful
 * before any container callback has run and there is no "empty stack" state to represent.
 */
export const createRegistry = <Fn>(featureName: string) => {
  const stack: Array<RegistryScope> = [{ kind: "feature", name: featureName }]
  const records: Array<StepDefinition<Fn>> = []

  /** The frame steps registered right now would be attributed to. */
  const currentScope = (): RegistryScope => {
    const top = stack[stack.length - 1]
    // Unreachable: `popScope` refuses to remove the root frame, so the stack is never empty. The
    // check exists because `noUncheckedIndexedAccess` types the lookup as possibly-undefined and
    // the alternative is a non-null assertion, which would erase a real invariant into syntax.
    if (top === undefined) {
      throw new Error(
        "Registry scope stack is empty, which popScope() is supposed to make impossible. "
          + "This is a bug in Registry.ts, not in the feature being defined."
      )
    }
    return top
  }

  const pushScope = (scope: RegistryScope): void => {
    stack.push(scope)
  }

  /**
   * Leave the innermost scope. Throws at the root rather than emptying the stack: a scope
   * underflow means a container callback returned twice or a `pushScope` went missing, and
   * silently tolerating it would re-parent every subsequent step onto a stack that no longer
   * describes the document.
   */
  const popScope = (): void => {
    if (stack.length <= 1) {
      throw new Error(
        "Registry scope stack underflow: popScope() was called at the feature root "
          + `("${featureName}"), which has no enclosing scope to return to. `
          + "A container callback returned twice, or a pushScope() was lost."
      )
    }
    stack.pop()
  }

  /**
   * Record one step under the scope that is current right now.
   *
   * `definedAt` is a PARAMETER and is never captured here. This module reads no stack and constructs
   * no `Error`, which is what keeps it dependency-free (note (c)) and testable with literal sites.
   * The capture belongs to `describeFeature.ts`'s registrar, because the frame that matters is the
   * author's and the registrar is the only thing the author calls directly.
   */
  const register = (keyword: StepKeyword, pattern: string, body: Fn, definedAt: DefinitionSite | null): void => {
    records.push({ keyword, pattern, body, scope: currentScope(), definedAt })
  }

  /** A snapshot — see note (b). Never the live array. */
  const definitions = (): ReadonlyArray<StepDefinition<Fn>> => [...records]

  return { pushScope, popScope, currentScope, register, definitions }
}

/**
 * Derived from the factory rather than hand-written, following `ParameterTypeStoreShape`'s
 * precedent, so the shape and the thing it describes cannot drift apart.
 */
export type RegistryShape<Fn> = ReturnType<typeof createRegistry<Fn>>

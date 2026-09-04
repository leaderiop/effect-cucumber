/**
 * Per-`describeFeature` hook registry: six kinds, each attributed to a Rule id or `null`. Never
 * module-level (`test/HookRegistry.test.ts`).
 */

/**
 * The six hook kinds a Feature-level DSL can register a body under, in the canonical order
 * `Before`/`After`/`BeforeStep`/`AfterStep`/`BeforeAllScenarios`/`AfterAllScenarios`.
 */
export type HookKind =
  | "Before"
  | "After"
  | "BeforeStep"
  | "AfterStep"
  | "BeforeAllScenarios"
  | "AfterAllScenarios"

/**
 * One registered hook: the kind it was registered under, its normalised body, the Rule it was
 * registered under (if any), and its own tag expression (if any, ADR-EC-035). `tagExpr: null` is a
 * real, common value — an unconditional hook, today's only shape before ADR-EC-035 — not a marker
 * for "not yet set."
 */
export type HookDefinition<Fn> = {
  readonly kind: HookKind
  readonly body: Fn
  readonly ruleId: string | null
  readonly tagExpr: string | null
}

/**
 * A new hook registry sharing no state with any other registry.
 */
export const createHookRegistry = <Fn>() => {
  const records: Array<HookDefinition<Fn>> = []

  const register = (kind: HookKind, ruleId: string | null, tagExpr: string | null, body: Fn): void => {
    records.push({ kind, body, ruleId, tagExpr })
  }

  const hooks = (): ReadonlyArray<HookDefinition<Fn>> => [...records]

  return { register, hooks }
}

/**
 * Derived from the factory rather than hand-written, following `RegistryShape<Fn>`'s precedent, so
 * the shape and the thing it describes cannot drift apart.
 */
export type HookRegistryShape<Fn> = ReturnType<typeof createHookRegistry<Fn>>

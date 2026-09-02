/**
 * Per-`describeFeature` step registry with a scope stack (Feature > Rule > Scenario/Background).
 * Never module-level: two `describeFeature` calls in one file must not see each other's steps
 * (`test/Registry.test.ts`).
 */

/**
 * The four Gherkin constructs that can own step definitions.
 */
export type RegistryScopeKind = "feature" | "background" | "scenario" | "rule"

/**
 * A frame of the scope stack.
 */
export type RegistryScope = {
  readonly kind: RegistryScopeKind
  readonly name: string | null
  readonly ruleId: string | null
}

export type StepKeyword = "Given" | "When" | "Then" | "And" | "But"

/**
 * Where a definition was written: an absolute path, and V8's own 1-based line and column.
 */
export type DefinitionSite = {
  readonly file: string
  readonly line: number
  readonly column: number
}

/**
 * One registered step, together with the scope that was on top of the stack when it was registered.
 */
export type StepDefinition<Fn> = {
  readonly keyword: StepKeyword
  readonly pattern: string
  readonly body: Fn
  readonly scope: RegistryScope
  readonly definedAt: DefinitionSite | null
}

/**
 * A new registry sharing no state with any other registry.
 */
export const createRegistry = <Fn>(featureName: string) => {
  const stack: Array<RegistryScope> = [{ kind: "feature", name: featureName, ruleId: null }]
  const records: Array<StepDefinition<Fn>> = []

  const currentScope = (): RegistryScope => {
    const top = stack[stack.length - 1]
    // Unreachable: `popScope` refuses to remove the root frame, so the stack is never empty.
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

  const register = (keyword: StepKeyword, pattern: string, body: Fn, definedAt: DefinitionSite | null): void => {
    records.push({ keyword, pattern, body, scope: currentScope(), definedAt })
  }

  const definitions = (): ReadonlyArray<StepDefinition<Fn>> => [...records]

  return { pushScope, popScope, currentScope, register, definitions }
}

/**
 * Derived from the factory rather than hand-written, following `ParameterTypeStoreShape`'s
 * precedent, so the shape and the thing it describes cannot drift apart.
 */
export type RegistryShape<Fn> = ReturnType<typeof createRegistry<Fn>>

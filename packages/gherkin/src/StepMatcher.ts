/**
 * Compile step patterns against a parameter type registry, and match a step text against EVERY
 * registered pattern.
 *
 * Two properties make this module worth writing rather than calling `CucumberExpression` directly
 * at each call site. Both are load-bearing, and both are recorded here because neither is visible
 * from the code that implements it.
 *
 * (a) **`match` returns every match, never the first.** `@cucumber/cucumber-expressions` does not
 *     detect two step patterns both matching one step text — pinned in
 *     `test/expressions-pin.test.ts`: `I have {int} apples` and `I have {word} apples` both match
 *     `I have 5 apples`, yielding the number `5` and the string `"5"` respectively. A matcher that
 *     took the first registration would make a step argument's TYPE depend on the order the step
 *     definitions happened to be written in, so an unrelated refactor that reorders two `Given`
 *     calls would silently change what a test asserts, with nothing failing anywhere. Returning
 *     every match is what lets Phase 6 raise MATCH-04's ambiguity error instead of quietly picking
 *     a winner.
 *
 *     `match` therefore MUST NOT throw for a zero-match or a many-match step text, and must not
 *     sort, dedupe or prefer any entry. Deciding what zero or many matches MEANS is ADR-EC-019's
 *     job, delivered by MATCH-03 and MATCH-04 in Phase 6, where the Scenario and its source
 *     location are in hand and the failure can name them. A `throw` added here would turn a
 *     per-Scenario failure into a whole-file collection error, which is the exact regression
 *     ADR-EC-019 exists to prevent. Compilation failures are the one exception and DO throw: an
 *     invalid pattern is not a matching outcome, it is a broken pattern, and no step text can make
 *     it work.
 *
 * (b) **Compilation is memoized per `(registry, pattern)`, never per pattern alone.** A
 *     `CucumberExpression` permanently binds to — and snapshots the resolved parameter types of —
 *     the registry it was constructed with; `test/expressions-pin.test.ts` pins that snapshotting
 *     directly (Pitfall 13). `ParameterTypes.buildRegistry()` constructs a FRESH registry on every
 *     call, so a cache keyed on the pattern string would serve an expression bound to a registry
 *     that no longer describes anything, as soon as a second registry exists. The cache below is a
 *     `WeakMap` keyed on the registry INSTANCE holding a per-registry pattern `Map`, which is the
 *     literal expression of "per `(registry, pattern)`": a fresh registry gets a fresh inner map,
 *     and a registry that goes out of scope takes its compiled expressions with it.
 *
 * (c) **Compilation is LAZY.** `createStepMatcher` compiles nothing at all; the first `match` call
 *     compiles every entry, because matching has to try them all anyway. That gives fail-fast on an
 *     invalid pattern at the first match — which under ADR-EC-019 is still Plan time, before any
 *     Scenario body runs — while keeping construction free of the module-evaluation-order coupling
 *     Pitfall 13 describes, where a custom parameter type registered after the step module was
 *     evaluated turns an eager `new CucumberExpression` into a collection-time abort.
 *
 * (d) **This module takes a registry; it does not build one.** It deliberately does not import
 *     `./ParameterTypes.ts`, which is what keeps it independently testable against a hand-built
 *     registry and keeps the module DAG a DAG.
 *
 * (e) **The two runtime transform guards live here**, and `ParameterTypes.ts` deliberately lacks
 *     them. `Argument.getValue` returns a transform's result UNWRAPPED, so an async transform hands
 *     a step body a `Promise` where its declared parameter type says `number`; and a throwing
 *     transform throws SYNCHRONOUSLY out of `getValue`, i.e. during argument extraction and outside
 *     any Effect, bypassing ADR-EC-001's structured error channel entirely. Both are pinned in
 *     `test/expressions-pin.test.ts` (Pitfall 25, Anti-Pattern 8).
 *
 * This module constructs no regular expression. `CucumberExpression` owns all regex construction
 * and escaping, including its own `escapeRegex` (threat T-03-20).
 *
 * `D` is an opaque payload the caller owns: `@effect-cucumber/vitest` will put its `R`-typed step
 * definition and its source location in there. Nothing here ever inspects it, which is how a
 * package forbidden by ADR-EC-015 from depending on `effect` still serves Phase 6.
 *
 * Local imports: `./Errors.ts` only. Third-party: the `@cucumber/cucumber-expressions` barrel,
 * never a deep path into that package's published build directory.
 */
import { type Argument, CucumberExpression, type ParameterTypeRegistry } from "@cucumber/cucumber-expressions"
import { StepPatternError, type StepPatternErrorReason } from "./Errors.ts"

/**
 * The compilation cache: registry instance → (pattern string → compiled expression).
 *
 * A flat `Map<string, CucumberExpression>` keyed on the pattern ALONE is forbidden, and this is the
 * single most important sentence in this file. An expression snapshots its resolved parameter types
 * at construction, and `buildRegistry()` returns a new registry every call, so the pattern-only
 * cache silently serves a binding to a dead registry the moment a second registry exists — a custom
 * parameter type defined between two `loadFeature` calls would appear to be missing, or an
 * already-removed one would appear to still work. `test/StepMatcher.test.ts` proves the key by
 * asserting that one pattern compiled against two different registries yields two DIFFERENT object
 * references.
 *
 * A `WeakMap` rather than a `Map` so a registry that goes out of scope is collectable together with
 * everything compiled against it; nothing here has to know when a feature load is over.
 */
const expressionCache = new WeakMap<ParameterTypeRegistry, Map<string, CucumberExpression>>()

/**
 * Raise a `StepPatternError` shaped `<reason>: <what happened, then what to do>`, matching the
 * message convention `Validate.ts` established for `LoadFeatureError` and `ParameterTypes.ts`
 * reuses.
 */
const fail = (
  args: {
    reason: StepPatternErrorReason
    parameterTypeName?: string
    pattern: string
    sentences: ReadonlyArray<string>
    cause?: unknown
  }
): never => {
  throw new StepPatternError({
    reason: args.reason,
    ...(args.parameterTypeName === undefined ? {} : { parameterTypeName: args.parameterTypeName }),
    pattern: args.pattern,
    message: `${args.reason}: ${args.sentences.join(" ")}`,
    ...(args.cause === undefined ? {} : { cause: args.cause })
  })
}

/**
 * The name of the parameter type an upstream construction failure complained about, or `undefined`
 * if the thrown value was some other failure.
 *
 * STRUCTURAL discrimination, and it has to be: `UndefinedParameterTypeError` is not exported from
 * the `@cucumber/cucumber-expressions` barrel at all, its `name` property reports the useless
 * string `"Error"`, and its message is upstream prose free to change in a patch release. The one
 * stable, published signal is the string `undefinedParameterTypeName` property it carries, which
 * `test/expressions-pin.test.ts` pins against the real package.
 */
const undefinedParameterTypeNameOf = (thrown: unknown): string | undefined => {
  if (typeof thrown !== "object" || thrown === null) {
    return undefined
  }
  const candidate = (thrown as { readonly undefinedParameterTypeName?: unknown }).undefinedParameterTypeName
  return typeof candidate === "string" ? candidate : undefined
}

/** Whatever an upstream failure had to say, in full. Never truncated — see `Errors.ts` note (b). */
const describeCause = (thrown: unknown): string => thrown instanceof Error ? thrown.message : String(thrown)

/** Name a parameter type the way a step pattern would spell it. */
const describeName = (name: string): string => name === "" ? "the anonymous {} parameter type" : `{${name}}`

/**
 * Is this value a thenable?
 *
 * Deliberately structural rather than `instanceof Promise`: a transform may return a thenable from
 * any promise implementation, and all of them reach the step body equally unwrapped.
 */
const isThenable = (value: unknown): boolean => {
  if ((typeof value !== "object" || value === null) && typeof value !== "function") {
    return false
  }
  return typeof (value as { readonly then?: unknown }).then === "function"
}

/**
 * Construct one expression, re-raising every upstream throw as a named `StepPatternError`.
 *
 * Split out from `compileExpression` so the cache read/write stays a straight line and so the
 * definite-assignment of the compiled value never depends on control flow through a `catch`.
 */
const constructExpression = (registry: ParameterTypeRegistry, pattern: string): CucumberExpression => {
  try {
    // Upstream throws HERE, at construction, not at match (Pitfall 13).
    return new CucumberExpression(pattern, registry)
  } catch (cause) {
    const undefinedName = undefinedParameterTypeNameOf(cause)
    if (undefinedName !== undefined) {
      return fail({
        reason: "UndefinedParameterType",
        parameterTypeName: undefinedName,
        pattern,
        sentences: [
          `the step pattern \`${pattern}\` names ${describeName(undefinedName)},`,
          "which is not registered in the parameter type registry it was compiled against.",
          `Define it with defineParameterType({ name: "${undefinedName}", ... }) at module scope,`,
          "before any loadFeature call runs."
        ],
        cause
      })
    }
    return fail({
      reason: "InvalidStepPattern",
      pattern,
      sentences: [
        `the step pattern \`${pattern}\` is not a valid cucumber expression.`,
        `@cucumber/cucumber-expressions reported: ${describeCause(cause)}`,
        "Fix the pattern; the original failure is attached as `cause`."
      ],
      cause
    })
  }
}

/**
 * The compiled expression for `pattern` against `registry`, constructing and caching it on first
 * request. Two calls with the same pair return the IDENTICAL object; two calls with two different
 * registries return two different objects.
 *
 * Throws a `StepPatternError` — never an upstream error — when the pattern does not compile. That
 * is the one place this module throws for something other than a caller's own transform, and it is
 * correct: an invalid pattern is broken for every step text, so surfacing it as "no match" would
 * hide a typo behind MATCH-03's unmatched-step error, pointing at the Scenario instead of at the
 * pattern. A failed compilation is deliberately NOT cached, so a retry reports the same failure
 * rather than a confusing absence.
 */
export const compileExpression = (registry: ParameterTypeRegistry, pattern: string): CucumberExpression => {
  const byPattern = expressionCache.get(registry) ?? new Map<string, CucumberExpression>()
  const cached = byPattern.get(pattern)
  if (cached !== undefined) {
    return cached
  }

  const compiled = constructExpression(registry, pattern)

  byPattern.set(pattern, compiled)
  expressionCache.set(registry, byPattern)
  return compiled
}

/**
 * Turn one matched `Argument` into the value a step body receives, behind both runtime guards.
 *
 * A `null` return from `getValue` — an optional group that did not participate — is passed through
 * unchanged rather than filtered out: the positional correspondence between the returned array and
 * the pattern's parameters is what the caller's `StepArgs` tuple type claims, and dropping an
 * element would silently shift every argument after it.
 */
const extractValue = (pattern: string, argument: Argument): unknown => {
  const parameterTypeName = argument.getParameterType().name ?? ""

  let value: unknown
  try {
    // `thisObj` is typed `unknown` and this library never binds a `this`, so `undefined` is the
    // honest argument. A caller transform runs RIGHT HERE, synchronously, outside any Effect — an
    // unguarded call would let its throw bypass the structured error channel completely.
    value = argument.getValue(undefined)
  } catch (cause) {
    return fail({
      reason: "ParameterTransformFailed",
      parameterTypeName,
      pattern,
      sentences: [
        `the transform for ${describeName(parameterTypeName)} threw while converting the text`,
        `\`${argument.group.value}\` matched by the step pattern \`${pattern}\`.`,
        "Fix the transform, or widen the parameter type's regexp so it stops matching this text;",
        "the original failure is attached as `cause`."
      ],
      cause
    })
  }

  // `ParameterTypeDefinition.transform` already forbids a thenable at the TYPE level (its return
  // type omits upstream's `PromiseLike<T>` half), so this guard exists for the `any`-cast and
  // plain-JavaScript escape routes the type system cannot reach.
  if (isThenable(value)) {
    return fail({
      reason: "AsyncParameterTransform",
      parameterTypeName,
      pattern,
      sentences: [
        `the transform for ${describeName(parameterTypeName)} returned a thenable while converting`,
        `the text \`${argument.group.value}\` matched by the step pattern \`${pattern}\`.`,
        "A parameter transform must be synchronous: its result is handed to the step body unwrapped,",
        "so the body would receive a Promise where its declared parameter type says otherwise.",
        "Move the async work into the step's own Effect body."
      ]
    })
  }

  return value
}

/** One registered step pattern and the caller's opaque payload for it. */
export interface StepPatternEntry<D> {
  /** The cucumber expression source, exactly as the step author wrote it. */
  readonly pattern: string
  /** Whatever the caller wants back when this pattern matches. Never inspected here. */
  readonly definition: D
}

/** One entry that matched a step text, with its arguments already coerced. */
export interface StepMatch<D> {
  /** The pattern that matched, so a caller reporting ambiguity can name every one of them. */
  readonly pattern: string
  /** The matching entry's payload, returned unchanged. */
  readonly definition: D
  /**
   * The coerced arguments, positionally aligned with the pattern's parameters. `unknown` here; the
   * compile-time counterpart is `StepArgs<P>`, which resolves the same list from the pattern
   * literal.
   */
  readonly args: ReadonlyArray<unknown>
}

/** A closed set of step patterns, matchable against a step text. */
export interface StepMatcher<D> {
  /** The entries this matcher was built with, in registration order. */
  readonly entries: ReadonlyArray<StepPatternEntry<D>>
  /**
   * Every entry whose pattern matches `text`, in registration order.
   *
   * Empty for zero matches, length two for two matches. Does not throw for either — see note (a)
   * of the module doc comment.
   */
  readonly match: (text: string) => ReadonlyArray<StepMatch<D>>
}

/**
 * Build a matcher over `entries`, compiling every pattern against `registry` on first use.
 *
 * Compiles nothing eagerly — note (c) of the module doc comment.
 */
export const createStepMatcher = <D>(
  args: { registry: ParameterTypeRegistry; entries: ReadonlyArray<StepPatternEntry<D>> }
): StepMatcher<D> => {
  const { entries, registry } = args

  const match = (text: string): ReadonlyArray<StepMatch<D>> => {
    const matches: Array<StepMatch<D>> = []
    for (const entry of entries) {
      const matched = compileExpression(registry, entry.pattern).match(text)
      if (matched === null) {
        continue
      }
      matches.push({
        pattern: entry.pattern,
        definition: entry.definition,
        args: matched.map((argument) => extractValue(entry.pattern, argument))
      })
    }
    // Returned exactly as accumulated: no ordering, no deduping, no preference. Note (a).
    return matches
  }

  return { entries, match }
}

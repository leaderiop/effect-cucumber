/**
 * Compile step patterns against a parameter type registry and match a step text against EVERY registered
 * pattern.
 *
 * `match` returns every match, never the first: `@cucumber/cucumber-expressions` does not detect two patterns
 * matching one text (`test/expressions-pin.test.ts`), and picking the first would make an argument's TYPE depend
 * on registration order. `match` therefore never throws for zero or many matches — ADR-EC-019 decides what those
 * mean, where the Scenario is in hand; only a pattern that does not COMPILE throws.
 *
 * Compilation is memoised per `(registry, pattern)`, never per pattern: an expression snapshots the registry it
 * was built against (`test/expressions-pin.test.ts`) and `buildRegistry()` is fresh per call. It is LAZY — nothing
 * compiles until the first `match`. This module takes a registry and never imports `./ParameterTypes.ts`. The two
 * runtime transform guards live here: `Argument.getValue` returns a transform's result unwrapped and lets a throw
 * escape synchronously (`test/expressions-pin.test.ts`). `D` is an opaque caller payload, never inspected.
 */
import { type Argument, CucumberExpression, type ParameterTypeRegistry } from "@cucumber/cucumber-expressions"
import { describeParameterTypeName as describeName, raiseStepPatternError as fail } from "./StepPatternMessages.ts"

/** Registry instance → (pattern → compiled expression). A pattern-only key would serve an expression bound to a
 * dead registry (`test/StepMatcher.test.ts` asserts two registries yield two objects); a `WeakMap` lets a
 * registry take its expressions with it. */
const expressionCache = new WeakMap<ParameterTypeRegistry, Map<string, CucumberExpression>>()

/** The parameter type an upstream construction failure names, read STRUCTURALLY off the published
 * `undefinedParameterTypeName` property (`test/expressions-pin.test.ts`); the class is not exported and its
 * `name` is `"Error"`. */
const undefinedParameterTypeNameOf = (thrown: unknown): string | undefined => {
  if (typeof thrown !== "object" || thrown === null) {
    return undefined
  }
  const candidate = (thrown as { readonly undefinedParameterTypeName?: unknown }).undefinedParameterTypeName
  return typeof candidate === "string" ? candidate : undefined
}

/** Whatever an upstream failure had to say, in full. Never truncated — see `Errors.ts` note (b). */
const describeCause = (thrown: unknown): string => thrown instanceof Error ? thrown.message : String(thrown)

/** Structural thenable check: any promise implementation reaches the step body equally unwrapped. */
const isThenable = (value: unknown): boolean => {
  if ((typeof value !== "object" || value === null) && typeof value !== "function") {
    return false
  }
  return typeof (value as { readonly then?: unknown }).then === "function"
}

/** Construct one expression, re-raising every upstream throw as a named `StepPatternError`. */
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
          `Define it with ParameterTypeStore.layer([{ name: "${undefinedName}", ... }]) and provide`,
          "that Layer to the loadFeature call that parsed this feature."
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
 * The compiled expression for `pattern` against `registry`, cached on first request. Throws `StepPatternError`
 * when the pattern does not compile — surfacing it as "no match" would hide a typo behind the unmatched-step
 * error. A failed compilation is NOT cached, so a retry reports the same failure.
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

/** One matched `Argument` into the value a step body receives, behind both guards. A `null` (an optional
 * group that did not participate) is passed through so positions stay aligned with `StepArgs`. */
const extractValue = (pattern: string, argument: Argument): unknown => {
  const parameterTypeName = argument.getParameterType().name ?? ""

  let value: unknown
  try {
    // The caller's transform runs RIGHT HERE, synchronously, outside any Effect.
    value = argument.getValue(undefined)
  } catch (cause) {
    return fail({
      reason: "ParameterTransformFailed",
      parameterTypeName,
      pattern,
      sentences: [
        `the transform for ${describeName(parameterTypeName)} threw while converting the text`,
        `\`${argument.group.value ?? ""}\` matched by the step pattern \`${pattern}\`.`,
        "Fix the transform, or widen the parameter type's regexp so it stops matching this text;",
        "the original failure is attached as `cause`."
      ],
      cause
    })
  }

  // The type already forbids a thenable; this guards the `any`-cast escape route.
  if (isThenable(value)) {
    return fail({
      reason: "AsyncParameterTransform",
      parameterTypeName,
      pattern,
      sentences: [
        `the transform for ${describeName(parameterTypeName)} returned a thenable while converting`,
        `the text \`${argument.group.value ?? ""}\` matched by the step pattern \`${pattern}\`.`,
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
  /** The coerced arguments, positionally aligned with the pattern's parameters; `StepArgs<P>` is the compile-time
   * counterpart. */
  readonly args: ReadonlyArray<unknown>
}

/** A closed set of step patterns, matchable against a step text. */
export interface StepMatcher<D> {
  /** The entries this matcher was built with, in registration order. */
  readonly entries: ReadonlyArray<StepPatternEntry<D>>
  /** Every entry whose pattern matches `text`, in registration order; empty or many, never a throw. */
  readonly match: (text: string) => ReadonlyArray<StepMatch<D>>
}

/** Build a matcher over `entries`; compiles nothing until the first `match`. */
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
    // No ordering, deduping or preference.
    return matches
  }

  return { entries, match }
}

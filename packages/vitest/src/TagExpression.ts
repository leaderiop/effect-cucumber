/**
 * Shared compile-and-evaluate glue for vitest's own boolean tag-expression grammar
 * (`createTagsFilter`, `@vitest/runner/utils` — `and`/`or`/`not`/`&&`/`||`/`!`/parens, ADR-EC-035),
 * reused by TWO independent call sites: `HookTagExpression.ts`'s per-hook `tagExpr`
 * (`Before`/`After`/`BeforeStep`/`AfterStep`, ADR-EC-035, BEH-EC-027) and `describeFeature.ts`'s own
 * registration-time `tagExpression` option (ADR-EC-054, BEH-EC-008). Neither call site OWNS this
 * module — it exists purely so the compile-and-wrap mechanics are written exactly once rather than
 * duplicated a second time when this job added the second consumer.
 *
 * `featureTagUniverse` lived in `HookTagExpression.ts` until ADR-EC-054; that module now re-exports
 * it from here for backward compatibility with its own existing importers (`Collect.ts`,
 * `HookTagExpression.test.ts`) rather than forcing every caller to switch import paths in the same
 * change that introduced this module.
 *
 * This module never imports `HookTagExpressionError` or anything else hook-specific: it compiles
 * and evaluates only, and re-throws vitest's own raw error VERBATIM on a compile failure — each
 * caller wraps that in its OWN located error, naming its OWN call site (a hook's kind and Feature
 * for `HookTagExpressionError`; `describeFeature`'s own Feature and option name for
 * `TagExpressionError` below).
 */
import { createTagsFilter } from "@vitest/runner/utils"

/**
 * A compiled tag-expression matcher: given a Scenario's own fully-flattened tags, does the
 * expression select it.
 */
export type TagMatcher = (scenarioTags: ReadonlyArray<string>) => boolean

/**
 * Every literal tag anywhere in a Feature — Feature, Rule, Scenario and Examples tags all already
 * flattened onto each `ParsedScenario.tags` by the parser — deduplicated. This is the "available
 * tags" universe `createTagsFilter` requires: an expression like `@db and not @slow` needs `@slow`
 * declared even for a Scenario that does not carry it.
 *
 * @param scenarios - every Scenario in the Feature (`ParsedFeature.allScenarios`)
 */
export const featureTagUniverse = (
  scenarios: ReadonlyArray<{ readonly tags: ReadonlyArray<string> }>
): ReadonlyArray<string> => [...new Set(scenarios.flatMap((scenario) => scenario.tags))].toSorted()

/**
 * Compile one tag-expression string into a matcher against `availableTags` — vitest's own
 * `createTagsFilter`, unwrapped and re-shaped to take a plain `ReadonlyArray<string>` rather than
 * mutating its own internal array argument. Throws vitest's own raw, SYNCHRONOUS parse/validate
 * error verbatim for a malformed expression, or one naming a tag literal absent from
 * `availableTags` — this function names no call site and wraps nothing; that is each caller's own
 * job (`compileHookTagExpr` below, `compileFeatureTagExpression` below).
 */
export const compileTagExpression = (
  tagExpr: string,
  availableTags: ReadonlyArray<string>
): TagMatcher => {
  const filter = createTagsFilter([tagExpr], availableTags.map((name) => ({ name })))
  return (scenarioTags: ReadonlyArray<string>) => filter([...scenarioTags])
}

/**
 * `describeFeature`'s own `tagExpression` option (ADR-EC-054) named a tag literal absent from this
 * Feature's declared tag universe (`featureTagUniverse`), or the expression string itself was
 * malformed — the identical "undeclared tag" problem `HookTagExpressionError` already has for
 * tag-expression-scoped hooks, surfaced here as a loud, located registration-time throw for the
 * SAME reason (ADR-EC-019): a typo in a registration-time filter is dead registration, not a
 * broken Scenario, and there is no framework rejection to catch-and-degrade from the way
 * `VitestTestApi.ts`'s own `UndeclaredTagWarning` seam has for a Scenario's native tags — this
 * module compiles the expression itself, with nothing else positioned to intercept a typo.
 *
 * A real `Error` subclass, like `HookTagExpressionError` — never decoded or compared by tag,
 * printed as-is by whatever collects `describeFeature`'s define callback.
 */
export class TagExpressionError extends Error {
  readonly tagExpr: string
  readonly featureUri: string

  constructor(args: { readonly tagExpr: string; readonly featureUri: string; readonly cause: unknown }) {
    const underlying = args.cause instanceof Error ? args.cause.message : String(args.cause)
    super(
      `${args.featureUri}: describeFeature's tagExpression option ${JSON.stringify(args.tagExpr)} references a tag `
        + `this Feature never declares, or is malformed. ${underlying} Every tag literal a tagExpression names must `
        + "appear on at least one Scenario in this Feature — the same declared tag universe rule this library "
        + "already requires for tag-expression-scoped hooks (ADR-EC-035), applied here to describeFeature's own "
        + "registration filter (ADR-EC-054). Check the expression for a typo, or add the missing tag to a "
        + "Scenario in this .feature file.",
      { cause: args.cause }
    )
    this.name = "TagExpressionError"
    this.tagExpr = args.tagExpr
    this.featureUri = args.featureUri
  }
}

/**
 * Compile `describeFeature`'s own `tagExpression` option, wrapping any throw from
 * `compileTagExpression` in a `TagExpressionError` naming THIS call site — never
 * `HookTagExpressionError`, which names a hook's own kind instead.
 *
 * @param args.tagExpr - the caller's own `DescribeFeatureOptions.tagExpression`
 * @param args.availableTags - the Feature's declared tag universe (`featureTagUniverse`)
 * @param args.featureUri - the Feature's `.feature` file, carried only for `TagExpressionError`'s message
 * @throws TagExpressionError when `tagExpr` is malformed or names a tag absent from `availableTags`
 */
export const compileFeatureTagExpression = (
  args: { readonly tagExpr: string; readonly availableTags: ReadonlyArray<string>; readonly featureUri: string }
): TagMatcher => {
  try {
    return compileTagExpression(args.tagExpr, args.availableTags)
  } catch (cause) {
    throw new TagExpressionError({ tagExpr: args.tagExpr, featureUri: args.featureUri, cause })
  }
}

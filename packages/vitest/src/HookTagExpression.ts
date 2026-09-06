/**
 * Compiles ONE hook's own tag-expression string into a matcher against a Scenario's tags, reusing
 * vitest's OWN `createTagsFilter` (`@vitest/runner/utils`) — the exact parser/evaluator backing its
 * `--tagsFilter` (`and`/`or`/`not`/`&&`/`||`/`!`/parens) — rather than a second, hand-rolled grammar
 * or `@cucumber/tag-expressions` (not in this repo's dependency tree at all, ADR-EC-035).
 *
 * The actual compile-and-wrap-on-throw mechanics now live in `TagExpression.ts` (ADR-EC-054),
 * shared with `describeFeature.ts`'s own `tagExpression` option — the second, independent call
 * site for the identical engine. This module re-exports `featureTagUniverse`/`TagMatcher` from
 * there for backward compatibility with its own existing importers (`Collect.ts`,
 * `HookTagExpression.test.ts`), and `compileHookTagExpr` below calls the shared
 * `compileTagExpression`, wrapping its throw in `HookTagExpressionError` exactly as before this
 * extraction — this module's own OWN public behaviour is unchanged.
 *
 * Invariants a reader must not tidy away:
 * - `createTagsFilter` validates every tag literal an expression names against a caller-supplied
 *   "available tags" universe and throws SYNCHRONOUSLY, at compile time (not lazily, when the
 *   returned predicate is later called), for one absent from it. `compileHookTagExpr` re-throws that
 *   as a `HookTagExpressionError` naming the hook kind, its `.feature` file and the expression itself
 *   — never a bare string thrown from inside vitest's own parser (ADR-EC-035).
 * - `featureTagUniverse` is computed ONCE per Feature, from the SAME `ParsedScenario.tags` data
 *   `Plan.ts` already flattens — never a second `gherkinTags`-style file rescan — mirroring the
 *   "declared tag universe" rule [ADR-EC-026](../../../spec/decisions/026-registration-time-tag-filtering-and-declared-tag-universe.md)
 *   already established for `includeTags`/`excludeTags`, rediscovered here for a different call site.
 */
import type { HookKind } from "./HookRegistry.ts"
import { compileTagExpression, featureTagUniverse, type TagMatcher } from "./TagExpression.ts"

export { featureTagUniverse }
export type { TagMatcher }

/**
 * A hook's own tag expression names a tag literal absent from its Feature's declared tag universe
 * (`featureTagUniverse`) — the same "undeclared tag" problem ADR-EC-026 already has for
 * `includeTags`/`excludeTags`, surfaced here as a loud, located registration-time throw rather than
 * a silent degradation: unlike a Scenario's own native tags (caught and degraded at the
 * `VitestTestApi.ts` seam, ADR-EC-026), a hook's tag expression is compiled by THIS module, with no
 * framework rejection to intercept — so there is nothing to degrade FROM, and a typo here is exactly
 * the "dead code, not a broken Scenario" case [ADR-EC-019](../../../spec/decisions/019-fail-loudly-on-unmatched-or-ambiguous-steps.md)
 * already fails loudly for.
 *
 * A real `Error` subclass — like `StepFailureLocation` — never decoded or compared by tag, printed
 * as-is by whatever collects `describeFeature`'s define callback.
 */
export class HookTagExpressionError extends Error {
  readonly kind: HookKind
  readonly tagExpr: string
  readonly featureUri: string

  constructor(
    args: { readonly kind: HookKind; readonly tagExpr: string; readonly featureUri: string; readonly cause: unknown }
  ) {
    const underlying = args.cause instanceof Error ? args.cause.message : String(args.cause)
    super(
      `${args.featureUri}: a ${args.kind} hook's tag expression ${JSON.stringify(args.tagExpr)} `
        + `references a tag this Feature never declares. ${underlying} Every tag literal a hook's tag `
        + "expression names must appear on at least one Scenario in this Feature — the same declared "
        + "tag universe rule ADR-EC-026 already requires for describeFeature's own includeTags/excludeTags, "
        + "applied here to Before/After/BeforeStep/AfterStep tag expressions (ADR-EC-035). Check the "
        + "expression for a typo, or add the missing tag to a Scenario in this .feature file.",
      { cause: args.cause }
    )
    this.name = "HookTagExpressionError"
    this.kind = args.kind
    this.tagExpr = args.tagExpr
    this.featureUri = args.featureUri
  }
}

/**
 * Compile one hook's `tagExpr` into a matcher, or `null` for an unconditional hook — the `tagExpr:
 * null` case is today's behaviour, unchanged, not a separate code path from the tagged one.
 *
 * @param args.tagExpr - the hook's own tag expression, or `null` for an unconditional hook
 * @param args.availableTags - the Feature's declared tag universe (`featureTagUniverse`)
 * @param args.kind - the hook's own kind, carried only for `HookTagExpressionError`'s message
 * @param args.featureUri - the Feature's `.feature` file, carried only for the same reason
 * @throws HookTagExpressionError when `tagExpr` names a tag absent from `availableTags`
 */
export const compileHookTagExpr = (
  args: {
    readonly tagExpr: string | null
    readonly availableTags: ReadonlyArray<string>
    readonly kind: HookKind
    readonly featureUri: string
  }
): TagMatcher | null => {
  if (args.tagExpr === null) return null
  const tagExpr = args.tagExpr
  try {
    return compileTagExpression(tagExpr, args.availableTags)
  } catch (cause) {
    throw new HookTagExpressionError({ kind: args.kind, tagExpr, featureUri: args.featureUri, cause })
  }
}

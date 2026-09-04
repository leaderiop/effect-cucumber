/**
 * Compiles ONE hook's own tag-expression string into a matcher against a Scenario's tags, reusing
 * vitest's OWN `createTagsFilter` (`@vitest/runner/utils`) — the exact parser/evaluator backing its
 * `--tagsFilter` (`and`/`or`/`not`/`&&`/`||`/`!`/parens) — rather than a second, hand-rolled grammar
 * or `@cucumber/tag-expressions` (not in this repo's dependency tree at all, ADR-EC-035).
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
import { createTagsFilter } from "@vitest/runner/utils"
import type { HookKind } from "./HookRegistry.ts"

/**
 * A compiled tag-expression matcher: given a Scenario's own fully-flattened tags, does this hook's
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
    const filter = createTagsFilter([tagExpr], args.availableTags.map((name) => ({ name })))
    return (scenarioTags: ReadonlyArray<string>) => filter([...scenarioTags])
  } catch (cause) {
    throw new HookTagExpressionError({ kind: args.kind, tagExpr, featureUri: args.featureUri, cause })
  }
}

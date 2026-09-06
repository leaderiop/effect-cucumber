# ADR-EC-054: `describeFeature` gains a `tagExpression` registration filter, reusing vitest's own `createTagsFilter` — the SECOND independent call site for the engine ADR-EC-035 already integrated

> **Status:** Accepted and implemented — `packages/vitest/src/{TagExpression,HookTagExpression,Tags,describeFeature,Errors}.ts`
> **Date:** 2026-09-06
> **Context:** closes a gap [BEH-EC-008](../behaviors/02-shared-layers-and-tags.md#beh-ec-008-tags-map-to-vitests-native-tag-system-skip-also-routes-to-iteffectskip)'s own requirement text named explicitly: `includeTags`/`excludeTags` "never vitest's boolean tag-expression grammar," by original design

## Context

[ADR-EC-035](035-tag-expression-scoped-hooks-reuse-vitests-createtagsfilter.md)
integrated vitest's own boolean tag-expression grammar — `createTagsFilter`
(`@vitest/runner/utils`), the exact parser/evaluator backing `--tagsFilter`
(`and`/`or`/`not`/`&&`/`||`/`!`/parens) — for ONE call site:
`Before`/`After`/`BeforeStep`/`AfterStep`'s own optional leading `tagExpr`
argument. That ADR's own Context section noted `@cucumber/tag-expressions` is
not in this repository's dependency tree at all, and that vitest ships an
independently-implemented equivalent grammar as real, documented public API.

`describeFeature`'s own registration-time filter — `includeTags`/
`excludeTags` — never got the same treatment. [BEH-EC-008](../behaviors/02-shared-layers-and-tags.md)'s
own requirement text says so explicitly, and did so by original design, not
by oversight:

> `includeTags` and `excludeTags`, on `describeFeature`'s optional fourth
> argument, MUST act as a registration filter... Both MUST accept a plain
> array of tag strings, **never vitest's boolean tag-expression grammar**...

That design was correct for what `includeTags`/`excludeTags` needed to be —
two independent, ORable/ANDable-by-construction arrays are simpler than a
grammar for the common case. But a consumer who wants "every Scenario tagged
`@smoke` that is not ALSO tagged `@wip`" — an `and not` relationship, not an
`or` of two plain arrays — has no way to express it through
`includeTags`/`excludeTags` at all: `includeTags: ["@smoke"], excludeTags:
["@wip"]` already means exactly that by `Tags.ts`'s own AND-of-two-clauses
`shouldEmit` semantics, but a genuinely compound condition (`@smoke and
(@db or @slow)`, say) has no array-shaped translation. The engine that closes
this gap already lives in this repository, already validated against the
installed `vitest@4.1.11`, already dependency-declared (ADR-EC-035) — reusing
it a second time, rather than inventing a second grammar or lobbying to
change `includeTags`/`excludeTags`'s own established contract, is this ADR's
whole content.

## Decision

**`describeFeature`'s `DescribeFeatureOptions` gains a new, OPTIONAL
`tagExpression?: string` field — mutually exclusive with
`includeTags`/`excludeTags`, validated and compiled against the SAME
Feature-wide declared tag universe ADR-EC-035 already established, and
compiled through a module (`TagExpression.ts`) extracted from
`HookTagExpression.ts` and shared by both call sites, rather than a second,
duplicated `createTagsFilter` call:**

- `packages/vitest/src/TagExpression.ts` is new. It owns `featureTagUniverse`
  (moved here from `HookTagExpression.ts`, which now re-exports it for
  backward compatibility with its own existing importers — `Collect.ts`,
  `HookTagExpression.test.ts` — rather than forcing an import-path churn in
  the same change that introduced this module), `TagMatcher`, and
  `compileTagExpression(tagExpr, availableTags)` — the bare
  `createTagsFilter([tagExpr], availableTags.map(name => ({ name })))` call,
  reshaped to a plain `TagMatcher`, with NO try/catch and NO located error:
  this function names no call site, and wrapping its throw is deliberately
  left to each caller.
- `HookTagExpression.ts`'s `compileHookTagExpr` now calls the shared
  `compileTagExpression`, wrapping its throw in `HookTagExpressionError`
  exactly as it did before this extraction — this module's own public
  behaviour, and every existing test asserting it, is unchanged.
- `TagExpression.ts` also owns the SECOND call site's own located error and
  compile function: `TagExpressionError` (a real `Error` subclass, mirroring
  `HookTagExpressionError`'s exact shape — `.tagExpr`, `.featureUri`, a
  message naming both plus the underlying vitest error as `.cause` — never a
  `Schema.TaggedError`, never decoded or compared by tag) and
  `compileFeatureTagExpression({ tagExpr, availableTags, featureUri })`,
  which calls `compileTagExpression` inside its own try/catch and wraps any
  throw in `TagExpressionError`.
- `Tags.ts`'s `TagFilter` gains a third field, `expression: TagMatcher |
  null`, alongside the existing `include`/`exclude` arrays. `shouldEmit`
  checks `expression` FIRST: when non-null, it is the WHOLE answer —
  `include`/`exclude` are not consulted at all — and only when `expression`
  is `null` (every filter built before this ADR, and every filter built from
  plain `includeTags`/`excludeTags`) does `shouldEmit` fall back to the
  existing AND-of-two-arrays semantics. `makeTagFilter` gains a matching
  optional `expression` parameter, defaulting to `null`.
- `describeFeature`'s implementation body runs TWO checks as the very FIRST
  thing it does — before `collect()`, which is what actually calls `define`
  and registers real vitest nodes, so a throw from either check registers
  NOTHING:
  1. `tagExpression` set alongside `includeTags` or `excludeTags` (either or
     both) throws a plain, located `Error` naming BOTH option names and
     their values, and the Feature — never a silent precedence rule (e.g.
     "`tagExpression` wins," or the reverse). These are two ways of
     expressing the same kind of thing (a registration-time filter), and
     letting both be set at once with silent precedence is exactly the kind
     of ambiguity `describeFeature`'s existing throws (a missing Layer
     context, an unknown Rule/Scenario container name) already refuse to
     paper over.
  2. When `tagExpression` alone is set, it is compiled via
     `compileFeatureTagExpression`, against `featureTagUniverse(feature.
     allScenarios)` — the Feature-wide universe, computed directly from the
     function's own `feature` parameter, never from `collection.plan` (which
     does not exist yet at this point in the function body).
- `tagFilter` is now built as `makeTagFilter({ includeTags: options?.
  includeTags, excludeTags: options?.excludeTags, expression:
  tagExpressionMatcher })` — `tagExpressionMatcher` is `null` whenever
  `tagExpression` was not set, in which case this is behaviourally identical
  to the pre-this-ADR `makeTagFilter(options ?? {})` call it replaces.

**A real, discovered consequence, fixed as part of this ADR rather than left
for later: `Errors.ts`'s `ExcludedScenariosNotice` would have mislabeled every
`tagExpression` exclusion.** `makeExcludedScenariosNotice`'s `reason` was
derived purely from `includeTags.length`/`excludeTags.length` — under the
mutual-exclusion guarantee above, a `tagExpression`-caused exclusion always
carries an EMPTY `includeTags`/`excludeTags` pair, which the pre-existing
derivation would have read as `ExcludedByExcludeTags` with an empty, useless
tag list in the printed message: technically non-crashing, but actively
wrong and uninformative — the exact "reason: this project's whole design
posture is fail loud, not silently wrong" precedent ADR-EC-019 already set,
applied to a warning message rather than a runtime failure. Fixed by adding
`"ExcludedByTagExpression"` to `ExcludedScenariosNoticeReason`, a new
optional `tagExpression?: string` field to both `makeExcludedScenariosNotice`'s
args and the built `ExcludedScenariosNotice` itself, and branching the
three-way `reason`/message derivation on `tagExpression`'s presence FIRST,
ahead of the two arrays. `describeFeature.ts`'s own `onEmitted` callback
passes `options?.tagExpression` straight through.

## Consequences

**Positive**:

- Closes the exact gap BEH-EC-008's own requirement text named: a genuinely
  compound registration-time filter (`@smoke and (@db or @slow)`, or the
  simpler `@smoke and not @wip`) is now directly expressible, with no new
  grammar for a consumer to learn — the identical `and`/`or`/`not`/parens
  syntax `--tagsFilter` and `Before`/`After`'s own tag expressions already
  teach.
- The shared `TagExpression.ts` module means this is the FIRST refactor of
  ADR-EC-035's own mechanics done for a genuine second consumer, rather than
  a speculative extraction with only one caller — `compileTagExpression`'s
  compile-and-reshape logic, and `featureTagUniverse`'s flatten-and-dedupe
  logic, are now written exactly once.
- `includeTags`/`excludeTags`'s own existing contract is completely
  untouched: every existing caller, test, and the ADR-EC-026 "declared tag
  universe" rule they rely on keep behaving byte-for-byte as before. Nothing
  about this ADR narrows or reinterprets what BEH-EC-008 already promised for
  the two plain arrays — it only scopes the "never a boolean grammar"
  sentence to those two options specifically, since a THIRD, independent
  option now exists that is exactly that grammar.
- The `ExcludedScenariosNotice` fix is a real correctness improvement
  independent of whether a given consumer ever uses `tagExpression`: a
  latent mislabeling bug that could not have been observed before this
  option existed (nothing could previously produce an empty
  `includeTags`/`excludeTags` pair alongside a non-trivial exclusion reason)
  is now closed at the same time the option that would have exposed it ships.

**Negative**:

- A third registration-time throw surface (`TagExpressionError`, plus the
  separate mutual-exclusion `Error`) for a consumer to encounter — same
  "loud, not silent" trade-off ADR-EC-035 already accepted for hooks, applied
  again.
- `tagExpression` is validated against the Feature's OWN tags only — the
  identical structural limit `includeTags`/`excludeTags` and hook tag
  expressions already have; it cannot reach across `.feature` files.
- Two independent ways to express a registration-time tag filter now exist
  on `DescribeFeatureOptions` (arrays, or an expression string) rather than
  one — mitigated by making them mutually exclusive rather than layered, so
  a reader of any one `describeFeature` call only ever sees one filter
  mechanism in play, never both interacting.

**Trade-off accepted**: extending `TagFilter` with a THIRD field
(`expression`) that, when set, makes the other two (`include`/`exclude`)
inert rather than folding `tagExpression` into an equivalent
`includeTags`/`excludeTags` pair at the `describeFeature` boundary. The
alternative — compiling `tagExpression` down to two arrays before it ever
reaches `Tags.ts` — is not possible in general: a boolean expression with
`and`/`or`/`not` composition has no faithful two-array (OR-of-include,
AND-NOT-of-exclude) translation for every input, which is the whole reason
this option exists. `shouldEmit`'s "check `expression` first, return early"
shape keeps the two representations from ever needing to agree on a shared
evaluation path.

# ADR-EC-055: `Schema.TaggedError` only for values that flow through Effect's typed error channel; `Data.TaggedError` for synchronous never-decoded throws; `Data.TaggedClass` for tagged data that is never thrown at all

> **Status:** Accepted
> **Date:** 2026-09-09
> **Context:** closes the open item carried forward by `EFFECT_V4_ADOPTION_REPORT.md` rounds 3 and 4 (§5 / §4) —
> a policy this codebase already applies consistently in code but had never written down as a rule

## Context

Four successive Effect V4 builtin-adoption audits (`EFFECT_V4_ADOPTION_REPORT.md`, rounds 1–4) confirmed this
codebase's choice between `Schema.TaggedError`, `Data.TaggedError`, and `Data.TaggedClass` for a given error or
notice type is applied consistently — but round 3 §5 first flagged, and round 4 §4 re-confirmed, that the _rule_
behind that consistency exists only as inline comments repeated per call site, scattered across seven ADRs
(021, 022, 025, 033, 046, 053, 054) that each independently re-derive the same reasoning. `LLMS.md`'s own
"Error handling basics" worked example shows only `Schema.TaggedError` and never mentions `Data.TaggedError` or
`Data.TaggedClass` at all — a reader following only that guide would not learn this project accepts either
alternative, let alone when.

Round 3 §5 also surfaced the one nuance that makes "which one" non-obvious even after reading the inline
comments: `Schema.TaggedError` (`effect/Schema.ts`) compiles down to a real thrown `Error` subclass returning
`Cause.YieldableError`, exactly like `Data.TaggedError` does. **"Needs to be a real, throwable `Error`" does not
distinguish the two** — every inline comment that phrases the choice that way (`GherkinTags.ts`'s and
`GherkinWatchTriggers.ts`'s among them) is stating a true but non-discriminating fact. The actual axis, confirmed
by reading every current use of all three across both packages:

| Class                                                                                                                                                                                                                                                                                                                                                                                                              | Ever `yield*`ed / `Effect.fail`ed as the typed `E` of a public Effect-returning function?                                                                                                             | Ever `Schema.decode`d, `Schema.encode`d, or otherwise round-tripped? | Ever thrown as a real `Error` at all?                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------- |
| `Schema.TaggedError` — `LoadFeatureError`, `StepPatternError`, `DataTableError`, `DocStringError`, `ExamplesRowError` (gherkin), `StepMatchError` (vitest)                                                                                                                                                                                                                                                         | **Yes** — the typed failure of `loadFeature`/`decodeHashes`/`decodeDocString`/decode-from-`ExamplesRow`/step matching                                                                                 | Yes, at least potentially (attachment/report payloads; ADR-EC-046)   | Yes                                                     |
| `Data.TaggedError` — `TagExpressionError`, `HookTagExpressionError`, `MalformedTimeoutTagError`, `InvalidGherkinTagsPatternError`, `InvalidGherkinWatchTriggersPatternError`, `MutuallyExclusiveTagFilterError`, `UnsupportedScenarioExtraLayerError`, `UnusedStepDefinitionsError`, `UnusedStepDefinitionFailure` (internal), `AsyncDefineCallbackError` (internal), `StepFailureLocation`, `HookFailureLocation` | **No** — either a synchronous registration-time `throw` outside any Effect fiber, or (the two `*FailureLocation` types, ADR-EC-033) attached as `.cause` on an existing failure, never itself the `E` | No — never decoded, never compared by tag, printed as-is             | Yes                                                     |
| `Data.TaggedClass` — `LoadFeatureWarning` (gherkin), `UnusedStepDefinitionWarning`, `UndeclaredTagWarning`, `UnknownContainerWarning`, `ExcludedScenariosNotice`, `StaleRerunManifestKeyWarning` (vitest)                                                                                                                                                                                                          | No — never thrown or failed at all                                                                                                                                                                    | No                                                                   | **No** — a plain immutable tagged value, not an `Error` |

Every current use in both packages already sorts cleanly into exactly one row. No exception was found.

## Decision

**The choice is driven by one question: does this value ever flow through Effect's typed error channel — is it
ever the `E` in some `Effect<A, E, R>` this library exposes, that a consumer might reasonably `Effect.catchTag`
on or that needs schema decode/encode?**

- **Yes → `Schema.TaggedError`.** This is the default LLMS.md already states, unchanged. Reserve it for a real
  domain failure of a public Effect-returning function.
- **No, but it is still thrown as a real `Error`** (a synchronous registration/definition-time mistake the DSL
  rejects before any Effect runs, or a value attached only as `.cause` on someone else's failure, per
  ADR-EC-033/ADR-EC-052) **→ `Data.TaggedError`.** It gets a real `.name`/`.message`/`Error.prototype` for free
  (load-bearing for `StepFailureLocation`/`HookFailureLocation`'s reporter-visibility trick, ADR-EC-033) without
  `Schema.TaggedError`'s validated-constructor and decode/encode machinery, which such a value never uses.
- **No, and it is never thrown at all — a plain informational/warning value returned or logged →
  `Data.TaggedClass`.** No `Error` machinery of any kind; just structural `Equal`/`Hash` and a `_tag` for
  `Match.tag` dispatch.

This is not a new rule being introduced — it is the rule this codebase has already applied without exception
across all 24 current error/notice types in both packages (table above). This ADR's only effect is to give that
existing, consistent practice one citable name, so:

- A future ADR proposing a new error or notice type can cite `ADR-EC-055` instead of re-deriving and re-writing
  the same three-way reasoning inline, the way ADR-EC-021, 022, 025, 033, 046, 053, and 054 each independently
  did.
- `LLMS.md`'s "Error handling basics" section, which currently shows only the `Schema.TaggedError` case, can
  eventually add a one-line pointer here for the reader who needs the other two — this ADR does not itself edit
  `LLMS.md`, since that file mirrors the upstream `effect` documentation format rather than this project's own
  `spec/decisions/` convention.

## Consequences

**Positive**:

- Closes the open item both `EFFECT_V4_ADOPTION_REPORT.md` round 3 §5 and round 4 §4 flagged, without requiring
  any code change — every existing use already conforms (table above), verified by reading all 24 current
  `Schema.TaggedError`/`Data.TaggedError`/`Data.TaggedClass` declarations in both packages, not sampled.
- Corrects the "needs to be a real thrown `Error`" framing repeated in `GherkinTags.ts`'s and
  `GherkinWatchTriggers.ts`'s inline comments — a true fact about `Schema.TaggedError` that does not, by itself,
  distinguish it from `Data.TaggedError`, both of which produce a real throwable `Error`/`Cause.YieldableError`.
  Those comments are not rewritten by this ADR (their conclusion is still correct, only their stated reason is
  incomplete); a future edit to either file may cite this ADR instead.
- A single citable rule for the next new error type, rather than a sixth ADR independently re-deriving it.

**Negative**:

- This is a documentation-only ADR with no compiler-enforced boundary: nothing prevents a future contributor
  from picking the wrong class for a new error type, the same as before this ADR. The discipline remains
  code-review-enforced, same as every other house convention in `LLMS.md` that oxlint's custom plugin
  (`tools/oxlint/effect`) does not (yet) encode as a rule.
- `LLMS.md` itself is not edited by this ADR (see Decision) — a reader who only skims `LLMS.md` and never reaches
  `spec/decisions/` still will not learn `Data.TaggedError`/`Data.TaggedClass` exist as accepted alternatives.
  Judged an acceptable gap: `LLMS.md` documents the `effect` library in general for any consuming project, not
  this repository's own internal conventions, which is what `spec/decisions/` is for.

**Trade-off accepted**: a single authoritative citation over either (a) leaving the reasoning to keep being
re-derived per-file, which is what round 3 and round 4 both flagged as the actual problem, or (b) attempting to
encode the distinction as an oxlint rule, which would require the linter to understand whether a given value ever
reaches an Effect's typed error channel — a whole-program data-flow question well beyond what a syntactic lint
rule (this project's `tools/oxlint/effect` plugin, `scripts/verify-oxlint-plugin.sh`) can check.

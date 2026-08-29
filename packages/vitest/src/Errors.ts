/**
 * The typed drift-detection surface of `@effect-cucumber/vitest`.
 *
 * Two shapes live here, and they are deliberately different kinds of thing.
 *
 * `StepMatchError` is a FAILURE: a Pickle step whose text resolves to zero registered patterns
 * (MATCH-03) or to more than one (MATCH-04). It fails the containing Scenario — not the whole file
 * — which is what
 * [ADR-EC-019](../../../spec/decisions/019-fail-loudly-on-unmatched-or-ambiguous-steps.md) and
 * BEH-EC-013 ask for, and it carries every fact a reader needs to fix the problem without opening
 * a second file: the step text verbatim, the Feature uri and line, the containing Scenario's name,
 * every matching pattern when there is more than one, and a copy-pasteable suggested snippet when
 * there are none.
 *
 * `UnusedStepDefinitionWarning` is NOT a failure: a registered pattern that matches zero steps
 * across the whole Feature is dead code, not a broken Scenario (MATCH-05, same ADR). It never
 * enters an error channel.
 *
 * This module imports nothing local. `effect/Option` and `effect/Schema` are its only two imports,
 * which keeps it a leaf of this package's module DAG and lets it be built and tested ahead of
 * `Plan.ts`, `Runner.ts` and the call-site capture that supplies `definedAt`.
 *
 * Five things about this module are not visible from the code.
 *
 * (a) **`StepMatchError` is a SEPARATE class, not more members on gherkin's
 *     `LoadFeatureErrorReason`.** BEH-EC-014 closes that union at exactly ten reason tags with the
 *     words "drawn from exactly this set", so adding `UndefinedStep` to it would make a normative
 *     behaviour document false without changing a line of it. The name is not improvised either:
 *     `packages/gherkin/src/Errors.ts` note (d) explicitly reserves `StepMatchError` for this
 *     phase and forbids folding it into `StepPatternError`, because a `StepPatternError` is raised
 *     against a pattern that is itself malformed while a `StepMatchError` is raised against a
 *     perfectly valid pattern that happens to resolve to zero, or to many, registrations. This
 *     module is where that reservation, made back in plan 03-01, is redeemed.
 *
 * (b) **Four constraints of `effect@4.0.0-rc.112` are already discovered, recorded at
 *     `packages/gherkin/src/Errors.ts` note (a), and verified against the installed build.** They
 *     are stated here as constraints, not rediscovered, and none of them is a simplification
 *     waiting to be reverted:
 *       1. `Schema.Literals([...])` — the PLURAL, array form. The variadic multi-argument
 *          `Schema.Literal(a, b)` throws a schema validation error when used as a
 *          `Schema.TaggedError` field in this build, even though the same union works standalone.
 *       2. `Schema.Defect`, bare or wrapped in `Schema.optional`, throws at construction time
 *          inside `SchemaAST.js`. `Schema.OptionFromUndefinedOr(Schema.Unknown)` is used for
 *          `cause` instead, and it preserves referential equality with the wrapped value.
 *       3. Every optional field is `Schema.OptionFromUndefinedOr`, which is a TRANSFORMATION, and
 *          a `Schema.TaggedError` constructor validates against the Type side rather than the
 *          Encoded side. So every construction site must pass an explicit `Option.some(x)` or
 *          `Option.none()`; omitting the key fails construction outright, and there is no implicit
 *          default to fall back on.
 *       4. No custom constructor. `@effect/tsgo`'s `overriddenSchemaConstructor` diagnostic
 *          rejects any override on a `Schema.TaggedError` subclass, and a Schema-decoded
 *          reconstruction would bypass one anyway. Where a caller wants plain optional arguments,
 *          that wrapping goes in a factory in `Plan.ts` — the same split
 *          `packages/gherkin/src/DataTable.ts` already uses.
 *
 * (c) **The warning is an interface plus a factory, not a `Schema.TaggedError`.** It is not a
 *     failure, it never enters an error channel, and `Plan.ts` constructs one per unused pattern
 *     inside a loop — none of which wants a stack capture or a Schema validation pass. It is pure
 *     data, exactly as `LoadFeatureWarning` is pure data, and it is carried on the Plan result so
 *     a test can assert on it structurally (06-CONTEXT.md D-02 channel 3) instead of scraping
 *     `console.warn` output or parsing a synthetic test node's title.
 *
 *     It is a genuinely NEW type in this package and NOT a reuse of
 *     `@effect-cucumber/gherkin`'s `LoadFeatureWarning`. 06-CONTEXT.md D-02 is explicit about the
 *     reason: `ParsedFeature.warnings` is a gherkin-package, PARSE-TIME channel, and an unused
 *     step definition is not a fact about a `.feature` file at all — it is computed at Plan stage
 *     in this package, from the join of a parsed Feature against a registration tree that the
 *     gherkin package has never seen. Following that type's naming and shape is the whole of the
 *     borrowing.
 *
 * (d) **Message content is NEVER truncated.** No ellipsis, no elision, no maximum length, no
 *     slice, on either type. This is a locked developer decision recorded at
 *     `packages/gherkin/src/Errors.ts` note (b) and pinned byte for byte in
 *     `packages/gherkin/test/Contracts.test.ts`; this package follows it rather than re-deciding
 *     it. The accepted tradeoff is the same one stated there: a Feature file containing fixture
 *     credentials will reproduce those credentials in error output that may reach a publicly
 *     readable CI log, and the developer chose usefulness over redaction.
 *     `packages/vitest/test/Errors.test.ts` asserts an exact `message.length`, so a truncation
 *     step reintroduced anywhere on the construction path fails that test rather than passing a
 *     substring check that happens to keep the prefix.
 *
 * (e) **This module has no local imports and does not read a definition site itself.** `definedAt`
 *     arrives as an ALREADY-FORMATTED string, which is why nothing here imports the call-site
 *     capture module. Keeping the formatting on the producer's side is what lets this file stay a
 *     leaf, and it also means a change to the site format is not a change to this contract.
 *
 * `StepMatchError`, `StepMatchErrorReason`, `UnusedStepDefinitionWarning` and
 * `UnusedStepDefinitionWarningReason` all belong in `packages/vitest/src/index.ts`: a
 * `StepMatchError` reaches a test author through a failing Scenario's error channel, and the
 * warning list is meant to be asserted on. Plan 06-07 owns that barrel edit — the same
 * "name the owning plan" convention plans 03-01 and 03-02 set for a deferred export. This module
 * itself imports nothing local; that is an invariant, not a coincidence.
 */
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"

/**
 * Why a `StepMatchError` was raised. Two members, and the union is closed at two.
 *
 * - `UndefinedStep` — MATCH-03. The step's text matched zero registered patterns anywhere on its
 *   scope chain. `matchedPatterns` is empty and `suggestion` carries the generated snippet.
 * - `AmbiguousStep` — MATCH-04. The step's text matched more than one registered pattern.
 *   `matchedPatterns` names every one of them so the ambiguity is visible rather than silently
 *   resolved by registration order, which would make a step's argument types and behaviour change
 *   under an unrelated refactor.
 *
 * A third member for the unused-pattern case must NOT be added. ADR-EC-019 makes that a Feature-
 * level WARNING and not a failure — an unused step definition is dead code, not a broken Scenario
 * — so it is `UnusedStepDefinitionWarning` below and has no business in an error's reason union.
 *
 * A union type rather than an enum: `erasableSyntaxOnly` is on workspace-wide and an enum emits
 * runtime code.
 */
export type StepMatchErrorReason = "UndefinedStep" | "AmbiguousStep"

/**
 * A Pickle step that resolved to zero, or to more than one, registered step definition.
 *
 * Shaped like `@effect-cucumber/gherkin`'s three error classes — same derived `_tag`/`name`, same
 * `reason` discrimination, same `Option<T>` fields every construction site fills explicitly (this
 * module's note (b), constraint 3). A caller asserts `err.reason` and never pattern-matches
 * message text.
 *
 * Three field choices are worth stating, because none is guessable from the code:
 *
 * `stepText` is the exact, interpolated Pickle step text — BEH-EC-013's literal requirement. It is
 * NOT the AST step text: for a Scenario Outline the two differ, and the interpolated one is what
 * was actually matched and therefore what a reader must see to understand the failure.
 *
 * `matchedPatterns` is in the order the CALLER supplies, and this class does not sort it. The
 * ordering rule is 06-CONTEXT.md D-03 — by the definition site (`file:line`) of each pattern's
 * registration, so the list points a reader at where to go fix it, rather than alphabetically by
 * pattern text or by registration order — and `Plan.ts` owns applying it. Sorting here as well
 * would put the rule in two places and let them disagree. It is an empty array for
 * `UndefinedStep`, never `Option.none()`: "no patterns matched" is genuinely a zero-length list,
 * not an absent one.
 *
 * `suggestion` is the 06-CONTEXT.md D-01 auto-generated step-definition snippet, present for
 * `UndefinedStep` and `Option.none()` for `AmbiguousStep` (where the patterns already exist and a
 * suggested new one would be actively wrong).
 *
 * There is no custom constructor and there must not be one — note (b), constraint 4. A factory
 * accepting plain optional arguments belongs in `Plan.ts`.
 */
export class StepMatchError extends Schema.TaggedError<StepMatchError>()("StepMatchError", {
  reason: Schema.Literals([
    "UndefinedStep",
    "AmbiguousStep"
  ]),
  uri: Schema.String,
  line: Schema.OptionFromUndefinedOr(Schema.Number),
  stepText: Schema.String,
  scenarioName: Schema.String,
  matchedPatterns: Schema.Array(Schema.String),
  suggestion: Schema.OptionFromUndefinedOr(Schema.String),
  message: Schema.String,
  cause: Schema.OptionFromUndefinedOr(Schema.Unknown)
}) {}

/**
 * Why an `UnusedStepDefinitionWarning` was emitted. One member today — a registered pattern that
 * matched zero steps across the whole Feature.
 *
 * A one-member union rather than a bare literal on the field, matching the `LoadFeatureWarningReason`
 * precedent: the discriminant reads the same at every call site whether the union has one member or
 * four, and widening it later is a local edit rather than a shape change.
 */
export type UnusedStepDefinitionWarningReason = "UnusedStepDefinition"

/**
 * A registered step definition no step in the Feature used. Non-fatal by decision (ADR-EC-019).
 *
 * Plain data, deliberately NOT an `Error` subclass and NOT a `Schema.TaggedError` — note (c). It
 * is never thrown and never failed with; it is carried on the Plan result and presented through
 * 06-CONTEXT.md D-02's three surfaces (`console.warn`, a synthetic passing test node, and this
 * structured list), all reading the same computation.
 *
 * `keyword` is a plain `string` rather than `Registry.ts`'s `StepKeyword`, and `definedAt` is a
 * plain `Option<string>` rather than a structured site record. Both keep this module import-free
 * (note (e)): `definedAt` arrives already formatted by whoever captured it, so a change to the
 * site format is not a change to this contract.
 *
 * `featureName` and `uri` are both present and both required. The name is what a reader recognises
 * and the uri is what an editor can open, and a warning that named only one of them would be
 * ambiguous the moment two Features share a name.
 *
 * The no-truncation policy of note (d) applies here verbatim: a message quoting a step pattern
 * quotes it whole.
 */
export interface UnusedStepDefinitionWarning {
  readonly _tag: "UnusedStepDefinitionWarning"
  readonly reason: UnusedStepDefinitionWarningReason
  readonly featureName: string
  readonly uri: string
  readonly keyword: string
  readonly pattern: string
  readonly definedAt: Option.Option<string>
  readonly message: string
}

/**
 * Build an `UnusedStepDefinitionWarning`, normalising an omitted `definedAt` to `Option.none()`.
 *
 * The factory exists so `Plan.ts` is not forced to write `Option.none()` by hand for every pattern
 * whose registration site could not be captured — `definedAt?: string` stays a plain, omittable
 * argument, and this is the ONE place that converts it to the field's `Option<string>` type. Same
 * split, same reason, as `makeWarning` in `packages/gherkin/src/Errors.ts`.
 */
export const makeUnusedStepDefinitionWarning = (args: {
  reason: UnusedStepDefinitionWarningReason
  featureName: string
  uri: string
  keyword: string
  pattern: string
  definedAt?: string
  message: string
}): UnusedStepDefinitionWarning => ({
  _tag: "UnusedStepDefinitionWarning",
  reason: args.reason,
  featureName: args.featureName,
  uri: args.uri,
  keyword: args.keyword,
  pattern: args.pattern,
  definedAt: Option.fromUndefinedOr(args.definedAt),
  message: args.message
})

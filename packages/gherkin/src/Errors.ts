/**
 * The typed failure surface of `@effect-cucumber/gherkin`.
 *
 * `LoadFeatureError` is the only class this package throws (outside an `Effect`) or fails
 * with (inside one). `LoadFeatureWarning` is its non-fatal counterpart: pure data, carried
 * on `ParsedFeature.warnings`, never thrown or failed with. Both discriminate on a `reason`
 * string-literal tag, one tag per row of the phase's fixture table, so a caller asserts
 * `err.reason` and never pattern-matches message text.
 *
 * This module imports nothing local except `effect`: it is a leaf of the package's module
 * DAG.
 *
 * Two non-obvious decisions are recorded here, because neither is visible from the code.
 *
 * (a) These are `Schema.TaggedError` classes, not plain `Error` subclasses. ADR-EC-015 used
 *     to forbid `@effect-cucumber/gherkin` from declaring `effect` in any manifest field;
 *     [ADR-EC-021](../../../spec/decisions/021-effect-and-platform-are-peer-dependencies-of-gherkin.md)
 *     supersedes that and makes `effect` a real peer dependency, so Effect's tagged-error
 *     constructor is reachable here now. `Schema.TaggedError` auto-derives `.name` and
 *     `._tag` from the tag string passed to it — verified against the actually-installed
 *     `effect@4.0.0-rc.112` before writing this, not assumed from documentation.
 *
 *     Two real incompatibilities with this exact rc build were found and worked around
 *     while migrating, both confirmed by isolated reproduction against the installed
 *     package, not guessed:
 *       - `Schema.Defect` (bare or `Schema.optional`-wrapped) throws
 *         `Cannot read properties of undefined (reading 'encoding')` inside `SchemaAST.js`
 *         at construction time. `Schema.optionalKey(Schema.Unknown)` is used for `cause`
 *         instead — an opaque, unvalidated upstream error that preserves referential
 *         equality (`err.cause === upstream`).
 *       - `Schema.Literal(...)` (the variadic multi-argument form) throws a schema
 *         validation error when used as a `Schema.TaggedError` field — even though the
 *         exact same union works standalone via `Schema.decodeUnknownSync`. `Schema.Literals`
 *         (the array-argument, plural form) does not have this problem and is used for
 *         every `reason` field below.
 *
 *     Every optional field below EXCEPT `cause` is `Schema.OptionFromUndefinedOr`, not
 *     `Schema.optional` — `line`, `parameterTypeName`, `pattern` are `Option<T>`, not
 *     `T | undefined` (ADR-EC-022). `cause` is the one exemption, recorded in that ADR's
 *     amendment: `Error.cause` has platform semantics — Node's inspector, `Cause.pretty` and
 *     every error-chain tool read it natively — so it is `Schema.optionalKey(Schema.Unknown)`,
 *     `unknown | undefined`, omitted when there is nothing to attach. The Option fields have a
 *     real, confirmed cost:
 *     `Schema.OptionFromUndefinedOr` is a transformation (Encoded `T | undefined` → Type
 *     `Option<T>`), and a `Schema.TaggedError` constructor validates against the Type side,
 *     not the Encoded side — so every constructor call must pass an actual `Option.some(x)`
 *     or `Option.none()` directly. Omitting the key entirely fails construction outright
 *     (confirmed by reproduction), which rules out the "just don't pass it" ergonomic
 *     `T | undefined` gave for free. No custom constructor can paper over this: see the next
 *     paragraph.
 *
 * (b) Error messages carry FULL content. DataTable cell values and DocString bodies are
 *     reproduced verbatim, never truncated and never elided. This is a locked developer
 *     decision that deliberately overrode the researcher's truncate-by-default
 *     recommendation (Assumption A7 of the phase research). The accepted tradeoff is real
 *     and is stated plainly: a feature file containing fixture credentials will reproduce
 *     those credentials in error output that may reach a publicly readable CI log. The
 *     developer chose usefulness over redaction. Do not silently re-introduce a truncation
 *     step, an ellipsis, a maximum-length constant, or a slice of message content: a test
 *     in `test/Contracts.test.ts` pins a long multi-line message byte for byte.
 *
 * (d) `StepPatternError` is a SEPARATE class, not nine more members on
 *     `LoadFeatureErrorReason`. BEH-EC-014 closes that union at exactly ten reason tags with
 *     the words "drawn from exactly this set"; adding a parameter-type tag to it would make
 *     the normative behaviour doc false without changing a line of it. A parameter-type or
 *     step-pattern problem is also a different kind of failure: it is raised against a
 *     pattern the *step author* wrote, not against a `.feature` file, so it carries a
 *     `pattern` and a `parameterTypeName` rather than a `uri` and a `line`.
 *
 *     The no-truncation policy of (b) applies to this class verbatim: a message quoting a
 *     step pattern, or the raw text a parameter transform was handed, quotes it whole. Same
 *     accepted tradeoff, same reason, same pin in `test/Contracts.test.ts`.
 *
 *     The name `StepMatchError` is deliberately NOT used here. It is reserved for Phase 6's
 *     unmatched/ambiguous step errors (MATCH-03, MATCH-04, ADR-EC-019), which are a
 *     different failure entirely: a perfectly valid pattern that resolves to zero, or to
 *     many, registered step definitions. Do not merge the two.
 *
 * (e) `DataTableError` is a THIRD class, for the same reason (d) gives and one more. BEH-EC-014
 *     still closes `LoadFeatureErrorReason` at exactly ten tags with the words "drawn from
 *     exactly this set", so a table failure cannot join it without making a normative document
 *     false; and `StepPatternError` is scoped to a pattern the STEP AUTHOR wrote, which a table
 *     failure is not. A `DataTableError` is a third kind again: it is raised against table
 *     CONTENT in a `.feature` file, at step-body time, long after loading succeeded — so it
 *     carries a `uri`/`line` like `LoadFeatureError` does, plus a `row`/`column` locator that
 *     neither of the other two classes has.
 *
 *     The no-truncation policy of (b) applies to this class verbatim as well: a message quoting
 *     a cell value, a header name, or a whole table row quotes it whole. Do not add an ellipsis.
 *
 * `.name` is derived automatically by `Schema.TaggedError` from the tag string, matching
 * `@cucumber/gherkin`'s own error classes' failure to do this at all — their `.name` reports
 * the useless string `"Error"` and `instanceof` is the only reliable discriminator upstream.
 * `@cucumber/cucumber-expressions` repeats the same mistake — its `CucumberExpressionError`
 * and `UndefinedParameterTypeError` both report `.name === "Error"`, and neither is exported
 * from that package's barrel at all. That mistake is not repeated here, and the derived name
 * is pinned by a test on both classes.
 */
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"

/**
 * Why a `LoadFeatureError` was raised. One member per Group A / Group B row of the phase
 * fixture table. A union type rather than an enum: `erasableSyntaxOnly` forbids enums.
 */
export type LoadFeatureErrorReason =
  | "MissingFile"
  | "PermissionDenied"
  | "ReadFailed"
  | "ParseFailed"
  | "UnknownDialect"
  | "NoFeature"
  | "OutlineWithoutExamples"
  | "EmptyExamples"
  | "ZeroStepScenario"
  | "UninterpolatedPlaceholder"
  | "ScenarioKeywordWithExamples"
  | "DuplicateScenarioName"

/**
 * A fatal problem found while loading a feature file.
 *
 * `line` is `Option<number>`, not `number | undefined` — every constructor call passes
 * `Option.some(x)` or `Option.none()` explicitly (see this module's doc comment (a) for why
 * omitting the key is not an option). `cause` is plain `Error.cause`: `unknown`, and omitted
 * when there is no upstream failure to attach. No custom constructor:
 * `@effect/tsgo`'s `overriddenSchemaConstructor` diagnostic rejects any constructor override
 * on a `Schema.TaggedError` subclass outright (confirmed by trying one and reading the
 * diagnostic, not assumed) — Schema-decoded reconstruction bypasses a custom constructor
 * entirely, so an override silently stops applying the moment anything decodes this shape
 * instead of calling `new` directly.
 */
export class LoadFeatureError extends Schema.TaggedError<LoadFeatureError>()("LoadFeatureError", {
  reason: Schema.Literals([
    "MissingFile",
    "PermissionDenied",
    "ReadFailed",
    "ParseFailed",
    "UnknownDialect",
    "NoFeature",
    "OutlineWithoutExamples",
    "EmptyExamples",
    "ZeroStepScenario",
    "UninterpolatedPlaceholder",
    "ScenarioKeywordWithExamples",
    "DuplicateScenarioName"
  ]),
  uri: Schema.String,
  line: Schema.OptionFromUndefinedOr(Schema.Number),
  message: Schema.String,
  cause: Schema.optionalKey(Schema.Unknown)
}) {}

/**
 * Why a `StepPatternError` was raised. Every member names a failure that
 * `@cucumber/cucumber-expressions` either raises as an un-discriminable
 * `CucumberExpressionError`, or does not raise at all and this library must detect itself.
 *
 * - `BuiltInParameterTypeName` — the requested custom name is one of the eleven names
 *   `ParameterTypeRegistry`'s constructor pre-registers (`int`, `float`, `word`, `string`,
 *   the anonymous `""`, `double`, `bigdecimal`, `byte`, `short`, `long`, `biginteger`).
 *   Raised at DEFINITION time, never at replay or match time, so the error points at the
 *   caller's own `define` call rather than at a `loadFeature` call several
 *   modules away (Pitfall 14).
 * - `DuplicateParameterTypeName` — the same store already holds a definition under this
 *   name. Also raised at definition time, for the same reason: replaying two records with
 *   one name into a fresh registry would surface as an upstream throw naming neither
 *   definition site (Pitfall 14).
 * - `IllegalParameterTypeName` — `ParameterType.isValidParameterTypeName` rejects the name.
 *   It rejects exactly the characters `[ ] ( ) $ . | ? * +` after unescaping; the message
 *   upstream throws names a DIFFERENT set, which is why this library asks the predicate and
 *   never reads that message.
 * - `InvalidParameterTypeRegexp` — a supplied `RegExp` carries one of the flags `g`, `i`,
 *   `m` or `y`, which the upstream `ParameterType` constructor rejects outright.
 * - `InvalidParameterTypeDefinition` — the upstream `ParameterType` constructor rejected the
 *   definition for a reason this library did not anticipate. Present deliberately, so a
 *   change in a `^20.1.0` minor surfaces as a named library error instead of a raw
 *   `CucumberExpressionError` carrying a column number and no context.
 * - `UndefinedParameterType` — a step pattern names a `{parameterType}` that is not
 *   registered in the registry it is being compiled against. Upstream raises this at
 *   `new CucumberExpression`, not at `match`, so it is a compile-time fact about the pattern
 *   and not a per-step-text one (Pitfall 13).
 * - `InvalidStepPattern` — the pattern is not a valid cucumber-expression for any other
 *   reason.
 * - `AsyncParameterTransform` — a custom transform returned a thenable. `Argument.getValue`
 *   returns it UNWRAPPED, so the step body would receive a `Promise` where its declared
 *   parameter type says `number` (Pitfall 25, Anti-Pattern 8).
 * - `ParameterTransformFailed` — a custom transform threw. It throws synchronously out of
 *   `getValue`, i.e. during argument extraction and outside any Effect, so it would bypass
 *   ADR-EC-001's structured error channel entirely if left unguarded (Pitfall 25).
 *
 * A union type rather than an enum: `erasableSyntaxOnly` forbids enums.
 */
export type StepPatternErrorReason =
  | "BuiltInParameterTypeName"
  | "DuplicateParameterTypeName"
  | "IllegalParameterTypeName"
  | "InvalidParameterTypeRegexp"
  | "InvalidParameterTypeDefinition"
  | "UndefinedParameterType"
  | "InvalidStepPattern"
  | "AsyncParameterTransform"
  | "ParameterTransformFailed"

/**
 * A fatal problem with a custom parameter type, or with a step pattern compiled against one.
 *
 * Shaped like `LoadFeatureError` — same `_tag`/`reason` discrimination (derived, not
 * assigned), same "no custom constructor" reasoning, same `Option<T>` fields for the same
 * reason (see `LoadFeatureError`'s doc comment and this module's doc comment (a)). Every
 * constructor call in this package — `StepPatternMessages.ts#raiseStepPatternError` and
 * `test/Contracts.test.ts`'s direct constructions alike — passes `parameterTypeName` and
 * `pattern` as explicit `Option.some(x)`/`Option.none()` values; `cause` is plain `Error.cause`.
 *
 * Both locators are optional because neither is always knowable: a definition-time failure
 * has a `parameterTypeName` and no pattern, while a malformed pattern has a `pattern` and
 * possibly no parameter type at all.
 */
export class StepPatternError extends Schema.TaggedError<StepPatternError>()("StepPatternError", {
  reason: Schema.Literals([
    "BuiltInParameterTypeName",
    "DuplicateParameterTypeName",
    "IllegalParameterTypeName",
    "InvalidParameterTypeRegexp",
    "InvalidParameterTypeDefinition",
    "UndefinedParameterType",
    "InvalidStepPattern",
    "AsyncParameterTransform",
    "ParameterTransformFailed"
  ]),
  parameterTypeName: Schema.OptionFromUndefinedOr(Schema.String),
  pattern: Schema.OptionFromUndefinedOr(Schema.String),
  message: Schema.String,
  cause: Schema.optionalKey(Schema.Unknown)
}) {}

/**
 * Why a `DataTableError` was raised. Four members, and the union is closed at four: each names a
 * shape that would otherwise produce a silently-wrong result rather than a failure.
 *
 * - `DuplicateHeaderColumn` — the header row of a table repeats a cell value, so `.hashes()`
 *   cannot build a record without one column overwriting the other. `@cucumber/gherkin` accepts
 *   this without complaint (pinned as fixture row F32) and `@cucumber/cucumber`'s own `hashes()`
 *   lets the LAST cell win. This library refuses both and names the repeated column.
 * - `DuplicateRowKey` — `.rowsHash()` found the same key-column value twice, which would collapse
 *   two rows into one entry.
 * - `RowsHashRequiresTwoColumns` — `.rowsHash()` was called on a table whose rows are not exactly
 *   two cells wide. `@cucumber/gherkin`'s parser already rejects an inconsistent cell count within
 *   one table (fixture row F10), so every row of a parsed table has the SAME width; a width other
 *   than two is the whole remaining failure.
 * - `RowDecodeFailed` — a `.hashes()` row failed `Schema` decoding (ADR-EC-008). Raised by
 *   `decodeHashes`, which lands in the next plan; the tag is declared here so this union is
 *   written once and closed once rather than widened later.
 *
 * A union type rather than an enum: `erasableSyntaxOnly` forbids enums.
 */
export type DataTableErrorReason =
  | "DuplicateHeaderColumn"
  | "DuplicateRowKey"
  | "RowsHashRequiresTwoColumns"
  | "RowDecodeFailed"

/**
 * A fatal problem with a step's DataTable argument, or with decoding one.
 *
 * Shaped like the two classes above — same derived `_tag`/`name`, same "no custom constructor"
 * constraint, same `Option<T>` locator fields that every construction site must fill with an
 * explicit `Option.some(x)`/`Option.none()` and the same plain `Error.cause` (module doc comment
 * (a)). See note (e) for why this is a third
 * class and not more members on either existing reason union.
 *
 * Two field choices are worth stating, because neither is guessable from the code:
 *
 * `line` is the STEP's line, not the offending row's. A `PickleTableRow` carries NO location
 * field at all — `Object.keys(row)` is exactly `["cells"]`, asserted directly against the
 * installed `@cucumber/messages` in `test/upstream-pin.test.ts`. The step's line is therefore the
 * finest source location that exists for a table, and there is no second line number to report.
 *
 * `row` is what narrows it further: the 1-based ordinal of the offending BODY row — the row after
 * the header for `.hashes()`, the row itself for `.rowsHash()`, which has no header row. It is
 * `Option.none()` when the fault is in the header row rather than in any body row. `column` is
 * the offending header or key column name, likewise `Option.none()` when no single column is at
 * fault.
 *
 * The no-truncation policy of module doc comment (b) applies here verbatim: a message quoting a
 * cell value, a header name, or a whole row quotes it whole. Do not add an ellipsis, a maximum
 * length, or a slice.
 */
export class DataTableError extends Schema.TaggedError<DataTableError>()("DataTableError", {
  reason: Schema.Literals([
    "DuplicateHeaderColumn",
    "DuplicateRowKey",
    "RowsHashRequiresTwoColumns",
    "RowDecodeFailed"
  ]),
  uri: Schema.String,
  line: Schema.OptionFromUndefinedOr(Schema.Number),
  row: Schema.OptionFromUndefinedOr(Schema.Number),
  column: Schema.OptionFromUndefinedOr(Schema.String),
  message: Schema.String,
  cause: Schema.optionalKey(Schema.Unknown)
}) {}

/**
 * Why a `LoadFeatureWarning` was emitted. One member per Group C row of the phase fixture
 * table, where the finding is real but the detection is heuristic:
 *
 * - `UnknownPlaceholder` (F9): a `<name>` in an Outline-correlated pickle where `name` is
 *   not one of that Outline's Examples header columns. The signature of a column silently
 *   dropped by the parser.
 * - `DuplicateExamplesColumn` (F11): the same header cell appears twice, and the first
 *   occurrence wins for both.
 * - `EmptyRule` (F13): a `Rule:` containing no Scenarios, which yields zero pickles in
 *   silence.
 * - `SuspectedSwallowedStep` (F14): a typo'd step keyword before any valid step, which is
 *   absorbed into the Scenario description and disappears at every layer.
 */
export type LoadFeatureWarningReason =
  | "UnknownPlaceholder"
  | "DuplicateExamplesColumn"
  | "EmptyRule"
  | "SuspectedSwallowedStep"

/**
 * A non-fatal finding. Plain data, deliberately NOT an `Error` subclass, and never thrown:
 * Group C findings are surfaced through `ParsedFeature.warnings` by locked decision.
 *
 * `line` is `Option<number>`, not `number | undefined` — no `Schema`/`Schema.TaggedError`
 * involved here (this is a plain interface, not a class), so there is no constructor-key
 * requirement the way `LoadFeatureError`/`StepPatternError` have; `makeWarning` below still
 * accepts a plain optional `line?: number` argument and does the `Option` wrapping itself.
 */
export interface LoadFeatureWarning {
  readonly _tag: "LoadFeatureWarning"
  readonly reason: LoadFeatureWarningReason
  readonly uri: string
  readonly line: Option.Option<number>
  readonly message: string
}

/**
 * Build a `LoadFeatureWarning`, normalising an omitted `line` to `Option.none()`.
 *
 * The factory exists so call sites are not forced to write `Option.none()` by hand for every
 * warning that has no line — `line?: number` stays a plain, omittable argument, and this is
 * the one place that converts it to the field's `Option<number>` type.
 */
export const makeWarning = (args: {
  reason: LoadFeatureWarningReason
  uri: string
  line?: number
  message: string
}): LoadFeatureWarning => ({
  _tag: "LoadFeatureWarning",
  reason: args.reason,
  uri: args.uri,
  line: Option.fromUndefinedOr(args.line),
  message: args.message
})

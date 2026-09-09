/**
 * The typed failure surface of `@effect-cucumber/gherkin`: five `Schema.TaggedError` classes, one plain-data
 * warning. Every error discriminates on a closed `reason` literal union, so a caller asserts `err.reason` and never
 * matches message text. A leaf of the package's module DAG: it imports only `effect`.
 *
 * Fields that may be absent are `Option<T>` (ADR-EC-022) and every construction site passes `Option.some`/
 * `Option.none` explicitly, because a `Schema.TaggedError` constructor validates the Type side. `cause` is the one
 * exemption: `Error.cause` has platform semantics, so it is `Schema.optionalKey(Schema.Unknown)` and omitted when
 * there is nothing to attach (ADR-EC-022, as amended). No custom constructors: `@effect/tsgo` rejects one on a
 * `Schema.TaggedError` subclass, and Schema-decoded reconstruction would bypass it anyway.
 *
 * Messages carry FULL content — cell values, DocString bodies, patterns — never truncated or elided; the tradeoff
 * (fixture credentials can reach a CI log) is accepted, and `test/Contracts.test.ts` pins a long message byte for
 * byte. `LoadFeatureErrorReason` is closed at ten tags by BEH-EC-014, which is why parameter-type and table
 * failures are separate classes. `.name` is derived from the tag (upstream's classes all report `"Error"`).
 */
import * as Data from "effect/Data"
import * as Schema from "effect/Schema"

/** Why a `LoadFeatureError` was raised; one member per fixture-table row. A union, not an enum. */
const LoadFeatureErrorReasonSchema = Schema.Literals([
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
])
export type LoadFeatureErrorReason = typeof LoadFeatureErrorReasonSchema.Type

/** A fatal problem found while loading a feature file. `line` is `Option`; `cause` is plain `Error.cause`. */
export class LoadFeatureError extends Schema.TaggedError<LoadFeatureError>()("LoadFeatureError", {
  reason: LoadFeatureErrorReasonSchema,
  uri: Schema.String,
  line: Schema.OptionFromUndefinedOr(Schema.Number),
  message: Schema.String,
  cause: Schema.optionalKey(Schema.Unknown)
}) {}

/**
 * Why a `StepPatternError` was raised — failures upstream raises as an un-discriminable
 * `CucumberExpressionError`, or does not raise at all:
 * - `BuiltInParameterTypeName` / `DuplicateParameterTypeName`: rejected at DEFINITION time, at the caller's frame.
 * - `IllegalParameterTypeName`: `ParameterType.isValidParameterTypeName` rejects it (`[ ] ( ) $ . | ? * +`).
 * - `InvalidParameterTypeRegexp`: a `g`/`i`/`m`/`y` flag, or a string source that does not compile.
 * - `InvalidParameterTypeDefinition`: upstream rejected the definition for a reason not anticipated here.
 * - `UndefinedParameterType`: a pattern names a `{type}` absent from the registry it is compiled against.
 * - `InvalidStepPattern`: not a valid cucumber-expression for any other reason.
 * - `AsyncParameterTransform` / `ParameterTransformFailed`: a transform returned a thenable, or threw, out of
 *   `Argument.getValue` (`test/expressions-pin.test.ts`).
 */
const StepPatternErrorReasonSchema = Schema.Literals([
  "BuiltInParameterTypeName",
  "DuplicateParameterTypeName",
  "IllegalParameterTypeName",
  "InvalidParameterTypeRegexp",
  "InvalidParameterTypeDefinition",
  "UndefinedParameterType",
  "InvalidStepPattern",
  "AsyncParameterTransform",
  "ParameterTransformFailed"
])
export type StepPatternErrorReason = typeof StepPatternErrorReasonSchema.Type

/**
 * A fatal problem with a custom parameter type, or with a step pattern compiled against one. Both locators are
 * `Option`: a definition-time failure has a name and no pattern; a malformed pattern may have no type at all.
 */
export class StepPatternError extends Schema.TaggedError<StepPatternError>()("StepPatternError", {
  reason: StepPatternErrorReasonSchema,
  parameterTypeName: Schema.OptionFromUndefinedOr(Schema.String),
  pattern: Schema.OptionFromUndefinedOr(Schema.String),
  message: Schema.String,
  cause: Schema.optionalKey(Schema.Unknown)
}) {}

/**
 * Why a `DataTableError` was raised — each a shape that would otherwise give a silently wrong result:
 * `DuplicateHeaderColumn` (upstream accepts it and `@cucumber/cucumber`'s `hashes()` lets the last cell win),
 * `DuplicateRowKey`, `RowsHashRequiresTwoColumns` (the parser already rejects inconsistent widths), and
 * `RowDecodeFailed` (`decodeHashes`, ADR-EC-008).
 */
const DataTableErrorReasonSchema = Schema.Literals([
  "DuplicateHeaderColumn",
  "DuplicateRowKey",
  "RowsHashRequiresTwoColumns",
  "RowDecodeFailed"
])
export type DataTableErrorReason = typeof DataTableErrorReasonSchema.Type

/**
 * A fatal problem with a step's DataTable argument. `line` is the STEP's line — a `PickleTableRow` carries no
 * location (`test/upstream-pin.test.ts`); `row` is the 1-based body-row ordinal, `Option.none()` for a header
 * fault; `column` the offending column, `Option.none()` when no single column is at fault.
 */
export class DataTableError extends Schema.TaggedError<DataTableError>()("DataTableError", {
  reason: DataTableErrorReasonSchema,
  uri: Schema.String,
  line: Schema.OptionFromUndefinedOr(Schema.Number),
  row: Schema.OptionFromUndefinedOr(Schema.Number),
  column: Schema.OptionFromUndefinedOr(Schema.String),
  message: Schema.String,
  cause: Schema.optionalKey(Schema.Unknown)
}) {}

/**
 * Why a `DocStringError` was raised — closed at one, exactly like `ExamplesRowError` and for the
 * same reason: a `DocString` has no header/width/row shape of its own to get wrong, only a single
 * `content` value handed straight to a caller-supplied `Schema` (ADR-EC-046), so `DecodeFailed` is
 * the only failure `decodeDocString` can produce.
 */
const DocStringErrorReasonSchema = Schema.Literals(["DecodeFailed"])
export type DocStringErrorReason = typeof DocStringErrorReasonSchema.Type

/**
 * A step's DocString argument failed to decode through a caller-supplied `Schema` (ADR-EC-046,
 * `DocString.ts`). `line` is the step's own — `stepArgumentsOf`'s own `uri`/`line` parameters,
 * mirroring `DataTableError.line` — kept `Option` for the same reason every other located field in
 * this module is (ADR-EC-022).
 */
export class DocStringError extends Schema.TaggedError<DocStringError>()("DocStringError", {
  reason: DocStringErrorReasonSchema,
  uri: Schema.String,
  line: Schema.OptionFromUndefinedOr(Schema.Number),
  message: Schema.String,
  cause: Schema.optionalKey(Schema.Unknown)
}) {}

/**
 * Why an `ExamplesRowError` was raised — closed at one, unlike `DataTableError`'s four: an
 * `ExamplesRow` has no header/width shape of its own to get wrong (its header/values come straight
 * off `Correlate.ts`'s AST walk, never author-supplied cells with a row count to validate), so
 * `RowDecodeFailed` is the only failure `decodeExamplesRow` can produce (ADR-EC-032).
 */
const ExamplesRowErrorReasonSchema = Schema.Literals(["RowDecodeFailed"])
export type ExamplesRowErrorReason = typeof ExamplesRowErrorReasonSchema.Type

/**
 * A Scenario Outline row's `raw` record failed to decode through a caller-supplied `Schema`
 * (ADR-EC-032, `ExamplesRow.ts`). `line` is the row's own — `Pickle.location`, always present for an
 * Outline row's Pickle (`Model.ts`) — unlike `DataTableError.line`, which falls back to the STEP's
 * because a `PickleTableRow` carries no location at all; an `ExamplesRow` is not a table row and
 * carries its own location directly, so this field is never absent in practice, but stays `Option`
 * for the same reason every other located field in this module does (ADR-EC-022).
 */
export class ExamplesRowError extends Schema.TaggedError<ExamplesRowError>()("ExamplesRowError", {
  reason: ExamplesRowErrorReasonSchema,
  uri: Schema.String,
  line: Schema.OptionFromUndefinedOr(Schema.Number),
  column: Schema.OptionFromUndefinedOr(Schema.String),
  message: Schema.String,
  cause: Schema.optionalKey(Schema.Unknown)
}) {}

/**
 * Why a `LoadFeatureWarning` was emitted — heuristic findings: `UnknownPlaceholder` (a dropped Examples column's
 * signature), `DuplicateExamplesColumn` (the first wins), `EmptyRule` (zero pickles), `SuspectedSwallowedStep`
 * (a typo'd keyword absorbed into a description).
 */
export type LoadFeatureWarningReason =
  | "UnknownPlaceholder"
  | "DuplicateExamplesColumn"
  | "EmptyRule"
  | "SuspectedSwallowedStep"

/**
 * A non-fatal finding: plain data, never thrown, surfaced through `ParsedFeature.warnings`. `line` is a plain
 * `number` — every warning is located (ADR-EC-022, as amended). `Data.TaggedClass` supplies the `_tag` field and
 * the constructor, and gives instances value equality via `Equal`/`Hash` for free.
 */
export class LoadFeatureWarning extends Data.TaggedClass("LoadFeatureWarning")<{
  readonly reason: LoadFeatureWarningReason
  readonly uri: string
  readonly line: number
  readonly message: string
}> {}

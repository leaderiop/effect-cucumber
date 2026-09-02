/**
 * The typed failure surface of `@effect-cucumber/gherkin`: three `Schema.TaggedError` classes, one plain-data
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
import * as Schema from "effect/Schema"

/** Why a `LoadFeatureError` was raised; one member per fixture-table row. A union, not an enum. */
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

/** A fatal problem found while loading a feature file. `line` is `Option`; `cause` is plain `Error.cause`. */
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
 * A fatal problem with a custom parameter type, or with a step pattern compiled against one. Both locators are
 * `Option`: a definition-time failure has a name and no pattern; a malformed pattern may have no type at all.
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
 * Why a `DataTableError` was raised — each a shape that would otherwise give a silently wrong result:
 * `DuplicateHeaderColumn` (upstream accepts it and `@cucumber/cucumber`'s `hashes()` lets the last cell win),
 * `DuplicateRowKey`, `RowsHashRequiresTwoColumns` (the parser already rejects inconsistent widths), and
 * `RowDecodeFailed` (`decodeHashes`, ADR-EC-008).
 */
export type DataTableErrorReason =
  | "DuplicateHeaderColumn"
  | "DuplicateRowKey"
  | "RowsHashRequiresTwoColumns"
  | "RowDecodeFailed"

/**
 * A fatal problem with a step's DataTable argument. `line` is the STEP's line — a `PickleTableRow` carries no
 * location (`test/upstream-pin.test.ts`); `row` is the 1-based body-row ordinal, `Option.none()` for a header
 * fault; `column` the offending column, `Option.none()` when no single column is at fault.
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
 * `number` — every warning is located (ADR-EC-022, as amended).
 */
export interface LoadFeatureWarning {
  readonly _tag: "LoadFeatureWarning"
  readonly reason: LoadFeatureWarningReason
  readonly uri: string
  readonly line: number
  readonly message: string
}

/** Build a `LoadFeatureWarning`. The `_tag` is the one field a call site never spells. */
export const makeWarning = (args: {
  reason: LoadFeatureWarningReason
  uri: string
  line: number
  message: string
}): LoadFeatureWarning => ({
  _tag: "LoadFeatureWarning",
  reason: args.reason,
  uri: args.uri,
  line: args.line,
  message: args.message
})

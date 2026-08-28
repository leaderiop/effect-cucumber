/**
 * The typed failure surface of `@effect-cucumber/gherkin`.
 *
 * `LoadFeatureError` is the only class this package throws. `LoadFeatureWarning` is its
 * non-fatal counterpart: pure data, carried on `ParsedFeature.warnings`, never thrown.
 * Both discriminate on a `reason` string-literal tag, one tag per row of the phase's
 * fixture table, so a caller asserts `err.reason` and never pattern-matches message text.
 *
 * This module imports nothing local: it is a leaf of the package's module DAG.
 *
 * Two non-obvious decisions are recorded here, because neither is visible from the code.
 *
 * (a) These are plain classes extending `Error`, NOT Effect's tagged-error constructor.
 *     ADR-EC-015 forbids `@effect-cucumber/gherkin` from declaring `effect` in any manifest
 *     field, so Effect's data constructors are simply unreachable from this package.
 *     ARCHITECTURE.md's note that Effect's tagged error "is fine for those classes" is
 *     superseded here. The `_tag` property below is a plain string literal with no Effect
 *     import and no Effect coupling of any kind; it exists so that
 *     `@effect-cucumber/vitest` can map this class into an error channel in Phase 6 without
 *     a shape change.
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
 * `this.name` is assigned explicitly in the constructor. `@cucumber/gherkin`'s own error
 * classes do not do this, so their `.name` reports the useless string `"Error"` and
 * `instanceof` is the only reliable discriminator upstream. That mistake is not repeated
 * here, and the assignment is pinned by a test.
 */

/**
 * Why a `LoadFeatureError` was raised. One member per Group A / Group B row of the phase
 * fixture table. A union type rather than an enum: `erasableSyntaxOnly` forbids enums.
 */
export type LoadFeatureErrorReason =
  | "MissingFile"
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
 * Fields are declared and assigned in the constructor body: parameter properties
 * (`constructor(readonly reason: string)`) are `TS1294` under `erasableSyntaxOnly`.
 *
 * Note the asymmetry the `exactOptionalPropertyTypes` compiler flag forces. The constructor
 * argument declares `line?: number` so a call site may omit it; the field is
 * `number | undefined` so every instance always answers the question.
 */
export class LoadFeatureError extends Error {
  readonly _tag = "LoadFeatureError"
  readonly reason: LoadFeatureErrorReason
  readonly uri: string
  readonly line: number | undefined
  constructor(args: {
    reason: LoadFeatureErrorReason
    uri: string
    line?: number
    message: string
    cause?: unknown
  }) {
    super(args.message, args.cause === undefined ? undefined : { cause: args.cause })
    this.name = "LoadFeatureError"
    this.reason = args.reason
    this.uri = args.uri
    this.line = args.line
  }
}

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
 */
export interface LoadFeatureWarning {
  readonly _tag: "LoadFeatureWarning"
  readonly reason: LoadFeatureWarningReason
  readonly uri: string
  readonly line: number | undefined
  readonly message: string
}

/**
 * Build a `LoadFeatureWarning`, normalising an omitted `line` to `undefined`.
 *
 * The factory exists so call sites are not forced to write `line: undefined` by hand, which
 * `exactOptionalPropertyTypes` would otherwise require to satisfy the interface.
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
  line: args.line,
  message: args.message
})

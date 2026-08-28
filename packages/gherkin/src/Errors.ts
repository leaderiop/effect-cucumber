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
 * `this.name` is assigned explicitly in the constructor. `@cucumber/gherkin`'s own error
 * classes do not do this, so their `.name` reports the useless string `"Error"` and
 * `instanceof` is the only reliable discriminator upstream. `@cucumber/cucumber-expressions`
 * repeats the same mistake — its `CucumberExpressionError` and `UndefinedParameterTypeError`
 * both report `.name === "Error"`, and neither is exported from that package's barrel at
 * all. That mistake is not repeated here, and the assignment is pinned by a test on both
 * classes.
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
 * Why a `StepPatternError` was raised. Every member names a failure that
 * `@cucumber/cucumber-expressions` either raises as an un-discriminable
 * `CucumberExpressionError`, or does not raise at all and this library must detect itself.
 *
 * - `BuiltInParameterTypeName` — the requested custom name is one of the eleven names
 *   `ParameterTypeRegistry`'s constructor pre-registers (`int`, `float`, `word`, `string`,
 *   the anonymous `""`, `double`, `bigdecimal`, `byte`, `short`, `long`, `biginteger`).
 *   Raised at DEFINITION time, never at replay or match time, so the error points at the
 *   caller's own `defineParameterType` call rather than at a `loadFeature` call several
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
 * Shaped exactly like `LoadFeatureError` — same `_tag`/`reason` discrimination, same
 * explicit `name` assignment, same `exactOptionalPropertyTypes` asymmetry (constructor
 * arguments are optional, fields are `T | undefined` so every instance always answers the
 * question) — and for the same reasons, recorded at the top of this module.
 *
 * Both locators are optional because neither is always knowable: a definition-time failure
 * has a `parameterTypeName` and no pattern, while a malformed pattern has a `pattern` and
 * possibly no parameter type at all.
 *
 * Fields are declared and assigned in the constructor body: parameter properties are
 * `TS1294` under `erasableSyntaxOnly`.
 */
export class StepPatternError extends Error {
  readonly _tag = "StepPatternError"
  readonly reason: StepPatternErrorReason
  readonly parameterTypeName: string | undefined
  readonly pattern: string | undefined
  constructor(args: {
    reason: StepPatternErrorReason
    parameterTypeName?: string
    pattern?: string
    message: string
    cause?: unknown
  }) {
    super(args.message, args.cause === undefined ? undefined : { cause: args.cause })
    this.name = "StepPatternError"
    this.reason = args.reason
    this.parameterTypeName = args.parameterTypeName
    this.pattern = args.pattern
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

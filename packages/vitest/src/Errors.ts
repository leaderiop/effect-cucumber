/**
 * The runner's failure (`StepMatchError`, a `Schema.TaggedError`) and its plain-data notices:
 * `UnusedStepDefinitionWarning`, `UndeclaredTagWarning`, `UnknownContainerWarning`,
 * `ExcludedScenariosNotice`. Every author-controlled string in a message is `JSON.stringify`'d so
 * it cannot forge a second line (`test/Errors.test.ts`).
 */
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"

/**
 * Why a `StepMatchError` was raised.
 */
export type StepMatchErrorReason = "UndefinedStep" | "AmbiguousStep"

/**
 * A Pickle step that resolved to zero, or to more than one, registered step definition.
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
  cause: Schema.optionalKey(Schema.Unknown)
}) {}

/**
 * Why an `UnusedStepDefinitionWarning` was emitted.
 */
export type UnusedStepDefinitionWarningReason = "UnusedStepDefinition"

/**
 * A registered step definition no step in the Feature used.
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

const quoted = (value: string): string => JSON.stringify(value)

const quotedList = (values: ReadonlyArray<string>): string => values.map(quoted).join(", ")

/**
 * Why an `UndeclaredTagWarning` was emitted.
 */
export type UndeclaredTagWarningReason = "UndeclaredTag"

export interface UndeclaredTagWarning {
  readonly _tag: "UndeclaredTagWarning"
  readonly reason: UndeclaredTagWarningReason
  readonly uri: string
  readonly scenarioName: string
  readonly tags: ReadonlyArray<string>
  readonly message: string
}

/**
 * A `Rule(...)` or `Scenario(...)` container was registered under a name the Feature does not
 * contain (F-11).
 */
export type UnknownContainerWarningReason = "UnknownContainer"

export interface UnknownContainerWarning {
  readonly _tag: "UnknownContainerWarning"
  readonly reason: UnknownContainerWarningReason
  readonly uri: string
  readonly kind: "Rule" | "Scenario"
  readonly name: string
  readonly ruleName: string | null
  readonly known: ReadonlyArray<string>
  readonly message: string
}

export const makeUnknownContainerWarning = (args: {
  uri: string
  kind: "Rule" | "Scenario"
  name: string
  ruleName: string | null
  known: ReadonlyArray<string>
}): UnknownContainerWarning => ({
  _tag: "UnknownContainerWarning",
  reason: "UnknownContainer",
  uri: args.uri,
  kind: args.kind,
  name: args.name,
  ruleName: args.ruleName,
  known: args.known,
  message: `${quoted(args.uri)}: UnknownContainer: no ${args.kind} named ${quoted(args.name)} exists in this Feature${
    args.ruleName === null ? "" : ` inside Rule ${quoted(args.ruleName)}`
  } (known: ${
    args.known.length === 0 ? "none" : quotedList(args.known)
  }). Everything registered inside that ${args.kind} — ${
    args.kind === "Rule" ? "steps, Background and hooks" : "steps"
  } — can never run; its steps will be reported as matching no step. Check the name against the .feature file (an Outline is registered by its un-interpolated title).`
})

export const makeUndeclaredTagWarning = (args: {
  uri: string
  scenarioName: string
  tags: ReadonlyArray<string>
}): UndeclaredTagWarning => ({
  _tag: "UndeclaredTagWarning",
  reason: "UndeclaredTag",
  uri: args.uri,
  scenarioName: args.scenarioName,
  tags: args.tags,
  message: `${quoted(args.uri)}: UndeclaredTag: Scenario ${
    quoted(args.scenarioName)
  } carries ${args.tags.length} tag(s), at least one of which this project's vitest config does not declare: ${
    quotedList(args.tags)
  }. The Scenario still ran, but it was emitted UNTAGGED, so a --tagsFilter run naming any of those tags cannot select it. Declare the missing ones under test.tags in your vitest config: https://vitest.dev/guide/test-tags`
})

/**
 * Which of `describeFeature`'s two registration-time tag options caused an exclusion.
 */
export type ExcludedScenariosNoticeReason =
  | "ExcludedByIncludeTags"
  | "ExcludedByExcludeTags"
  | "ExcludedByBothTagFilters"

export interface ExcludedScenariosNotice {
  readonly _tag: "ExcludedScenariosNotice"
  readonly reason: ExcludedScenariosNoticeReason
  readonly featureName: string
  readonly uri: string
  readonly count: number
  readonly includeTags: ReadonlyArray<string>
  readonly excludeTags: ReadonlyArray<string>
  readonly message: string
}

const excludedScenariosNoticeReason = (
  includeTags: ReadonlyArray<string>,
  excludeTags: ReadonlyArray<string>
): ExcludedScenariosNoticeReason =>
  includeTags.length > 0
    ? (excludeTags.length > 0 ? "ExcludedByBothTagFilters" : "ExcludedByIncludeTags")
    : "ExcludedByExcludeTags"

export const makeExcludedScenariosNotice = (args: {
  featureName: string
  uri: string
  count: number
  includeTags: ReadonlyArray<string>
  excludeTags: ReadonlyArray<string>
}): ExcludedScenariosNotice => {
  const reason = excludedScenariosNoticeReason(args.includeTags, args.excludeTags)
  const filters = reason === "ExcludedByIncludeTags"
    ? `includeTags [${quotedList(args.includeTags)}]`
    : reason === "ExcludedByExcludeTags"
    ? `excludeTags [${quotedList(args.excludeTags)}]`
    : `includeTags [${quotedList(args.includeTags)}] and excludeTags [${quotedList(args.excludeTags)}]`
  return {
    _tag: "ExcludedScenariosNotice",
    reason,
    featureName: args.featureName,
    uri: args.uri,
    count: args.count,
    includeTags: args.includeTags,
    excludeTags: args.excludeTags,
    message: `${quoted(args.uri)}: ${reason}: ${args.count} Scenario(s) in Feature ${
      quoted(args.featureName)
    } were excluded by ${filters}. They were never registered, so they appear nowhere in this run's output — not even as skipped. Widen or remove the filter to run them.`
  }
}

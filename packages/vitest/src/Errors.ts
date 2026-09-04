/**
 * The runner's failure (`StepMatchError`, a `Schema.TaggedError`) and its plain-data notices:
 * `UnusedStepDefinitionWarning`, `UndeclaredTagWarning`, `UnknownContainerWarning`,
 * `ExcludedScenariosNotice`, `StaleRerunManifestKeyWarning` (ADR-EC-038). Every author-controlled
 * string in a message is `JSON.stringify`'d so it cannot forge a second line (`test/Errors.test.ts`).
 * `StepFailureLocation`/`attachStepFailureLocation` are the failure-panel fix (ADR-EC-033) — a
 * different shape from everything else here, and documented separately below rather than folded
 * into this header.
 */
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"

/**
 * A failing step's own location — its cucumber-expression pattern, the `.feature` file it lives
 * in, and its line within that file — attached as `.cause` on the step's own failure value before
 * it reaches vitest's reporter (ADR-EC-033).
 *
 * A real `Error` subclass, deliberately NOT a `Schema.TaggedError` like `StepMatchError` above:
 * nothing here is ever decoded or compared by `reason` tag, it exists purely to be PRINTED, and
 * vitest's own default reporter (`BaseReporter.printErrorInner`, confirmed against the installed
 * `vitest@4.1.11` — see ADR-EC-033) only recurses into an error's `.cause` and renders it as a
 * nested "Caused by:" block when that value is an object carrying a `.name` — a real `Error`
 * instance satisfies that for free, by being one, rather than by carrying a `reason` field nothing
 * reads.
 */
export class StepFailureLocation extends Error {
  readonly step: string
  readonly file: string
  readonly line: number

  constructor(
    args: { readonly step: string; readonly file: string; readonly line: number; readonly cause?: unknown }
  ) {
    super(`${args.file}:${args.line}: step ${JSON.stringify(args.step)}`, { cause: args.cause })
    this.name = "StepFailureLocation"
    this.step = args.step
    this.file = args.file
    this.line = args.line
  }
}

/**
 * Attach a `StepFailureLocation` to `value` as `.cause`, and return the result to re-fail/re-die
 * with. `value` is mutated IN PLACE when it is an object — the common case, since a step failure is
 * almost always a real `Error` (a thrown `AssertionError`, a domain `Schema.TaggedError`) — so its
 * reference identity survives for anything else already holding it (INV-EC-006's `cause.reasons`
 * walk, `test/acceptance/negative/after-on-failure.feature`'s own reference-identity assertion,
 * neither of which this function's call site touches, but both of which a REPLACING implementation
 * would have broken). Any `.cause` `value` already carried is preserved as the NEW
 * `StepFailureLocation`'s own `.cause`, so attaching a location never silently drops one.
 *
 * The rare non-object failure (a step failing with a bare string or number, which nothing in this
 * codebase's own step bodies does, but `Effect`'s `E` channel does not forbid) has nowhere to hang
 * a `.cause`, so it is wrapped in a new `Error` instead — the only branch here that changes
 * identity rather than preserving it.
 */
export const attachStepFailureLocation = (
  value: unknown,
  location: { readonly step: string; readonly file: string; readonly line: number }
): unknown => {
  if (typeof value === "object" && value !== null) {
    const existingCause = "cause" in value ? (value as { cause?: unknown }).cause : undefined
    ;(value as { cause?: unknown }).cause = new StepFailureLocation({ ...location, cause: existingCause })
    return value
  }
  return new Error(String(value), { cause: new StepFailureLocation(location) })
}

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

/**
 * A `rerunFailedOnly` manifest named a rerun key, under this Feature's own `uri`, that matches no
 * Scenario `RerunKey.ts`'s `rerunKeysForPlan` computes for the CURRENT `.feature` file (ADR-EC-038).
 * Unlike `UndeclaredTagWarning` above — caught at the one adapter permitted to name the test
 * framework, because it reacts to the RUNNER's own rejection — this is detected entirely from this
 * library's own plan data, before anything is emitted, so it follows `plan.warnings`' shape and
 * printing site (`describeFeature.ts`) instead.
 */
export type StaleRerunManifestKeyWarningReason = "StaleRerunManifestKey"

export interface StaleRerunManifestKeyWarning {
  readonly _tag: "StaleRerunManifestKeyWarning"
  readonly reason: StaleRerunManifestKeyWarningReason
  readonly uri: string
  readonly featureName: string
  readonly keys: ReadonlyArray<string>
  readonly message: string
}

export const makeStaleRerunManifestKeyWarning = (args: {
  uri: string
  featureName: string
  keys: ReadonlyArray<string>
}): StaleRerunManifestKeyWarning => ({
  _tag: "StaleRerunManifestKeyWarning",
  reason: "StaleRerunManifestKey",
  uri: args.uri,
  featureName: args.featureName,
  keys: args.keys,
  message: `${
    quoted(args.uri)
  }: StaleRerunManifestKey: the rerun manifest names ${args.keys.length} key(s) under Feature ${
    quoted(args.featureName)
  } that match no Scenario in this file: ${
    quotedList(args.keys)
  }. Ignored — the Scenario was likely renamed or removed, or the manifest is from a different revision of this file. Regenerate the manifest by re-running the write-side script against a fresh test run.`
})

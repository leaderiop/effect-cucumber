/**
 * The runner's failure (`StepMatchError`, a `Schema.TaggedError`) and its plain-data notices:
 * `UnusedStepDefinitionWarning`, `UndeclaredTagWarning`, `UnknownContainerWarning`,
 * `ExcludedScenariosNotice`, `StaleRerunManifestKeyWarning` (ADR-EC-038). Every author-controlled
 * string in a message is `JSON.stringify`'d so it cannot forge a second line (`test/Errors.test.ts`).
 * `StepFailureLocation`/`attachStepFailureLocation` are the failure-panel fix (ADR-EC-033), and
 * `HookFailureLocation`/`attachHookFailureLocation` are its hook counterpart (ADR-EC-052, closing
 * ADR-EC-033's own hook carve-out) — a different shape from everything else here, and documented
 * separately below rather than folded into this header. Both share one private mutate-and-wrap
 * helper (`attachFailureLocation`), generic over which concrete located-error class to construct,
 * AND one public Effect-level wrap (`withFailureLocation`) that `ScenarioEffect.ts` and `Hook.ts`
 * both call instead of each hand-copying its own `Effect.mapError`/`Effect.catchDefect` pair
 * (ADR-EC-056) — a pure refactor of ADR-EC-033/ADR-EC-052's own mechanism, not a behavior change.
 */
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Match from "effect/Match"
import * as Option from "effect/Option"
import * as Predicate from "effect/Predicate"
import * as Schema from "effect/Schema"
import type { HookKind } from "./HookRegistry.ts"

/**
 * A failing step's own location — its cucumber-expression pattern, the `.feature` file it lives
 * in, and its line within that file — attached as `.cause` on the step's own failure value before
 * it reaches vitest's reporter (ADR-EC-033).
 *
 * A real `Error` subclass (via `Data.TaggedError`), deliberately NOT a `Schema.TaggedError` like
 * `StepMatchError` above: nothing here is ever decoded or compared by `reason` tag, it exists purely
 * to be PRINTED, and vitest's own default reporter (`BaseReporter.printErrorInner`, confirmed against
 * the installed `vitest@4.1.11` — see ADR-EC-033) only recurses into an error's `.cause` and renders
 * it as a nested "Caused by:" block when that value is an object carrying a `.name` — a real `Error`
 * instance satisfies that for free, by being one (`Data.TaggedError` stamps `.name` to the tag),
 * rather than by carrying a `reason` field nothing reads.
 */
export class StepFailureLocation extends Data.TaggedError("StepFailureLocation")<{
  readonly step: string
  readonly file: string
  readonly line: number
  readonly message: string
  readonly cause?: unknown
}> {}

/** Builds a `StepFailureLocation`, computing its message from the same template the constructor used to. */
const makeStepFailureLocation = (
  args: { readonly step: string; readonly file: string; readonly line: number; readonly cause?: unknown }
): StepFailureLocation =>
  new StepFailureLocation({
    step: args.step,
    file: args.file,
    line: args.line,
    cause: args.cause,
    message: `${args.file}:${args.line}: step ${JSON.stringify(args.step)}`
  })

/**
 * A failing hook's own kind, its `.feature` file and the line ITS OWN registration call (`Before(...)`,
 * `After(...)`, and so on — never the Scenario it happened to be running for) sits on — the hook
 * counterpart of `StepFailureLocation` above, attached the same way and for the identical reason
 * (ADR-EC-052, closing ADR-EC-033's own "out of scope" carve-out for hooks). Same real-`Error`-subclass
 * shape (via `Data.TaggedError`), for the identical reason: vitest's default reporter only recurses
 * into `.cause` when it carries a `.name`.
 */
export class HookFailureLocation extends Data.TaggedError("HookFailureLocation")<{
  readonly hookKind: HookKind
  readonly file: string
  readonly line: number
  readonly message: string
  readonly cause?: unknown
}> {}

/** Builds a `HookFailureLocation`, computing its message from the same template the constructor used to. */
const makeHookFailureLocation = (
  args: { readonly hookKind: HookKind; readonly file: string; readonly line: number; readonly cause?: unknown }
): HookFailureLocation =>
  new HookFailureLocation({
    hookKind: args.hookKind,
    file: args.file,
    line: args.line,
    cause: args.cause,
    message: `${args.file}:${args.line}: ${args.hookKind} hook`
  })

/**
 * The shared mutate-and-wrap mechanics behind `attachStepFailureLocation`/`attachHookFailureLocation`
 * below: `value` is mutated IN PLACE when it is an object — the common case, since a step or hook
 * failure is almost always a real `Error` (a thrown `AssertionError`, a domain `Schema.TaggedError`)
 * — so its reference identity survives for anything else already holding it (INV-EC-006's
 * `cause.reasons` walk, `test/acceptance/negative/after-on-failure.feature`'s own reference-identity
 * assertion, neither of which either call site touches, but both of which a REPLACING implementation
 * would have broken). Any `.cause` `value` already carried is threaded through to `makeLocation`, so
 * it becomes the new located-error's own `.cause` rather than being silently dropped.
 *
 * The rare non-object failure (a step or hook failing with a bare string or number, which nothing in
 * this codebase's own bodies do, but `Effect`'s `E` channel does not forbid) has nowhere to hang a
 * `.cause`, so it is wrapped in a new `Error` instead — the only branch here that changes identity
 * rather than preserving it.
 *
 * Generic over a FACTORY (`makeLocation`) rather than over the located-error class itself:
 * `StepFailureLocation` and `HookFailureLocation` carry different identifying fields (`step` vs
 * `hookKind`), so there is no shared field shape to be generic over — only the "build the concrete
 * located-error instance given the pre-existing cause" step is actually shared.
 */
const attachFailureLocation = (value: unknown, makeLocation: (cause: unknown) => Error): unknown => {
  if (Predicate.isObjectOrArray(value)) {
    const existingCause = Predicate.hasProperty(value, "cause") ? value.cause : undefined
    ;(value as { cause?: unknown }).cause = makeLocation(existingCause)
    return value
  }
  return new Error(String(value), { cause: makeLocation(undefined) })
}

/**
 * Attach a `StepFailureLocation` to `value` as `.cause`, and return the result to re-fail/re-die
 * with. See `attachFailureLocation` above for the shared mutate-in-place/preserve-existing-`.cause`
 * mechanics; this wrapper only supplies WHICH located-error class to build (ADR-EC-033).
 */
export const attachStepFailureLocation = (
  value: unknown,
  location: { readonly step: string; readonly file: string; readonly line: number }
): unknown => attachFailureLocation(value, (cause) => makeStepFailureLocation({ ...location, cause }))

/**
 * Attach a `HookFailureLocation` to `value` as `.cause`, and return the result to re-fail/re-die
 * with. See `attachFailureLocation` above for the shared mutate-in-place/preserve-existing-`.cause`
 * mechanics; this wrapper only supplies WHICH located-error class to build (ADR-EC-052).
 */
export const attachHookFailureLocation = (
  value: unknown,
  location: { readonly hookKind: HookKind; readonly file: string; readonly line: number }
): unknown => attachFailureLocation(value, (cause) => makeHookFailureLocation({ ...location, cause }))

/**
 * The one Effect-level wrap a step or hook body's failure/defect passes through before it can
 * propagate — previously hand-copied identically at both call sites (`ScenarioEffect.ts`'s
 * `withStepFailureLocation` and `Hook.ts`'s `runHookBatch`), now one shared combinator (ADR-EC-056).
 * Covers BOTH lanes a body can actually fail through: a typed `Effect.fail` (`Effect.mapError`) and a
 * thrown exception, which Effect's own runtime turns into a defect (`Effect.catchDefect`) — neither
 * branch touches an interruption, which is the correct silence, since an interrupted body was never
 * really "the" failure to attribute a location to.
 *
 * Generic over `attach` rather than over which located-error class gets built: the caller supplies
 * `attachStepFailureLocation`/`attachHookFailureLocation` (or any future call site's own attach
 * function) already partially applied to its own location, so this combinator itself never branches
 * on step-vs-hook.
 *
 * @param attach - builds the located error given the pre-existing value (see `attachFailureLocation`)
 */
export const withFailureLocation =
  (attach: (value: unknown) => unknown) => <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, unknown, R> =>
    effect.pipe(
      Effect.mapError((error) => attach(error)),
      Effect.catchDefect((defect) => Effect.die(attach(defect)))
    )

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
export class UnusedStepDefinitionWarning extends Data.TaggedClass("UnusedStepDefinitionWarning")<{
  readonly reason: UnusedStepDefinitionWarningReason
  readonly featureName: string
  readonly uri: string
  readonly keyword: string
  readonly pattern: string
  readonly definedAt: Option.Option<string>
  readonly message: string
}> {}

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
}): UnusedStepDefinitionWarning =>
  new UnusedStepDefinitionWarning({
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

export class UndeclaredTagWarning extends Data.TaggedClass("UndeclaredTagWarning")<{
  readonly reason: UndeclaredTagWarningReason
  readonly uri: string
  readonly scenarioName: string
  readonly tags: ReadonlyArray<string>
  readonly message: string
}> {}

/**
 * A `Rule(...)` or `Scenario(...)` container was registered under a name the Feature does not
 * contain (F-11).
 */
export type UnknownContainerWarningReason = "UnknownContainer"

export class UnknownContainerWarning extends Data.TaggedClass("UnknownContainerWarning")<{
  readonly reason: UnknownContainerWarningReason
  readonly uri: string
  readonly kind: "Rule" | "Scenario"
  readonly name: string
  readonly ruleName: Option.Option<string>
  readonly known: ReadonlyArray<string>
  readonly message: string
}> {}

export const makeUnknownContainerWarning = (args: {
  uri: string
  kind: "Rule" | "Scenario"
  name: string
  ruleName: string | undefined
  known: ReadonlyArray<string>
}): UnknownContainerWarning => {
  const ruleName = Option.fromUndefinedOr(args.ruleName)
  return new UnknownContainerWarning({
    reason: "UnknownContainer",
    uri: args.uri,
    kind: args.kind,
    name: args.name,
    ruleName,
    known: args.known,
    message: `${quoted(args.uri)}: UnknownContainer: no ${args.kind} named ${quoted(args.name)} exists in this Feature${
      Option.match(ruleName, { onNone: () => "", onSome: (name) => ` inside Rule ${quoted(name)}` })
    } (known: ${
      args.known.length === 0 ? "none" : quotedList(args.known)
    }). Everything registered inside that ${args.kind} — ${
      Match.value(args.kind).pipe(
        Match.when("Rule", () => "steps, Background and hooks"),
        Match.when("Scenario", () => "steps"),
        Match.exhaustive
      )
    } — can never run; its steps will be reported as matching no step. Check the name against the .feature file (an Outline is registered by its un-interpolated title).`
  })
}

export const makeUndeclaredTagWarning = (args: {
  uri: string
  scenarioName: string
  tags: ReadonlyArray<string>
}): UndeclaredTagWarning =>
  new UndeclaredTagWarning({
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
 * Which of `describeFeature`'s registration-time tag options caused an exclusion.
 * `ExcludedByTagExpression` (ADR-EC-054) is the `tagExpression` option's own reason: since
 * `tagExpression` is mutually exclusive with `includeTags`/`excludeTags` at the `describeFeature`
 * call site, a notice reporting it always carries `includeTags: []`/`excludeTags: []` — deriving
 * the reason from those two arrays alone (as before ADR-EC-054) would have mislabeled every
 * `tagExpression` exclusion as `ExcludedByExcludeTags` with an empty, uninformative list, which is
 * exactly the bug this reason and `tagExpression` field were added to fix.
 */
export type ExcludedScenariosNoticeReason =
  | "ExcludedByIncludeTags"
  | "ExcludedByExcludeTags"
  | "ExcludedByBothTagFilters"
  | "ExcludedByTagExpression"

export class ExcludedScenariosNotice extends Data.TaggedClass("ExcludedScenariosNotice")<{
  readonly reason: ExcludedScenariosNoticeReason
  readonly featureName: string
  readonly uri: string
  readonly count: number
  readonly includeTags: ReadonlyArray<string>
  readonly excludeTags: ReadonlyArray<string>
  /**
   * `describeFeature`'s `tagExpression` option (ADR-EC-054), or `undefined` when this notice was
   * built from `includeTags`/`excludeTags` instead — the two are mutually exclusive at the
   * `describeFeature` call site, so this is never set alongside a non-empty `includeTags`/`excludeTags`.
   */
  readonly tagExpression: string | undefined
  readonly message: string
}> {}

const excludedScenariosNoticeReason = (
  includeTags: ReadonlyArray<string>,
  excludeTags: ReadonlyArray<string>,
  tagExpression: string | undefined
): ExcludedScenariosNoticeReason =>
  tagExpression !== undefined
    ? "ExcludedByTagExpression"
    : includeTags.length > 0
    ? (excludeTags.length > 0 ? "ExcludedByBothTagFilters" : "ExcludedByIncludeTags")
    : "ExcludedByExcludeTags"

export const makeExcludedScenariosNotice = (args: {
  featureName: string
  uri: string
  count: number
  includeTags: ReadonlyArray<string>
  excludeTags: ReadonlyArray<string>
  tagExpression?: string | undefined
}): ExcludedScenariosNotice => {
  const reason = excludedScenariosNoticeReason(args.includeTags, args.excludeTags, args.tagExpression)
  const filters = Match.value(reason).pipe(
    Match.when("ExcludedByTagExpression", () => `tagExpression ${quoted(args.tagExpression ?? "")}`),
    Match.when("ExcludedByIncludeTags", () => `includeTags [${quotedList(args.includeTags)}]`),
    Match.when("ExcludedByExcludeTags", () => `excludeTags [${quotedList(args.excludeTags)}]`),
    Match.when(
      "ExcludedByBothTagFilters",
      () => `includeTags [${quotedList(args.includeTags)}] and excludeTags [${quotedList(args.excludeTags)}]`
    ),
    Match.exhaustive
  )
  return new ExcludedScenariosNotice({
    reason,
    featureName: args.featureName,
    uri: args.uri,
    count: args.count,
    includeTags: args.includeTags,
    excludeTags: args.excludeTags,
    tagExpression: args.tagExpression,
    message: `${quoted(args.uri)}: ${reason}: ${args.count} Scenario(s) in Feature ${
      quoted(args.featureName)
    } were excluded by ${filters}. They were never registered, so they appear nowhere in this run's output — not even as skipped. Widen or remove the filter to run them.`
  })
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

export class StaleRerunManifestKeyWarning extends Data.TaggedClass("StaleRerunManifestKeyWarning")<{
  readonly reason: StaleRerunManifestKeyWarningReason
  readonly uri: string
  readonly featureName: string
  readonly keys: ReadonlyArray<string>
  readonly message: string
}> {}

export const makeStaleRerunManifestKeyWarning = (args: {
  uri: string
  featureName: string
  keys: ReadonlyArray<string>
}): StaleRerunManifestKeyWarning =>
  new StaleRerunManifestKeyWarning({
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

/**
 * The typed drift-detection and collection-time-notice surface of `@effect-cucumber/vitest`.
 *
 * Four shapes live here: ONE failure and three warnings. The split is deliberate and is note (c)'s
 * whole subject — a failure is a tagged `Schema` error class that enters an error channel, and a
 * warning is an interface plus a factory that never does.
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
 * `UndeclaredTagWarning` (RUN-05, 09-CONTEXT.md D-08) is not a failure either, and its whole reason
 * for existing is that the thing it reports would OTHERWISE be one. `vitest@4.1.11`'s `strictTags`
 * defaults to `true`, and emitting a tag no `vitest.config.ts` declares throws and collects ZERO
 * tests from the entire file. `VitestTestApi.ts` catches that throw at its adapter boundary,
 * re-emits the Scenario UNTAGGED, and prints one of these — degrading a whole-file collection
 * failure into a warning about one Scenario, which is ADR-EC-019's "dead code, not a broken
 * Scenario" instinct applied to a different upstream trap.
 *
 * `ExcludedScenariosNotice` (RUN-05, 09-CONTEXT.md D-10) is a notice rather than a warning about a
 * mistake: `includeTags`/`excludeTags` filter at REGISTRATION time (D-03), so an excluded Scenario
 * never becomes a test node and leaves no trace in the reporter at all. One summary line per Feature
 * is what stops a stale `excludeTags` from hiding a whole Feature behind a green run.
 *
 * This module imports nothing local. `effect/Option` and `effect/Schema` are its only two imports,
 * which keeps it a leaf of this package's module DAG and lets it be built and tested ahead of
 * `Plan.ts`, `Runner.ts` and the call-site capture that supplies `definedAt`.
 *
 * Six things about this module are not visible from the code.
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
 *          inside `SchemaAST.js`. `Schema.optionalKey(Schema.Unknown)` is used for `cause`
 *          instead: plain `Error.cause`, `unknown | undefined`, preserving referential equality
 *          with the wrapped value and readable by every error-chain tool (ADR-EC-022 amendment).
 *       3. Every OTHER optional field is `Schema.OptionFromUndefinedOr`, which is a TRANSFORMATION, and
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
 * (c) **Every WARNING here is an interface plus a factory, never a `Schema.TaggedError`.** None of
 *     the three is a failure, none ever enters an error channel, and each is constructed inside a
 *     loop or a `catch` — none of which wants a stack capture or a Schema validation pass. They are
 *     pure data, exactly as `LoadFeatureWarning` is pure data, and each is carried on a structured
 *     list so a test can assert on it structurally (06-CONTEXT.md D-02 channel 3) instead of
 *     scraping `console.warn` output or parsing a synthetic test node's title.
 *
 *     `UnusedStepDefinitionWarning` is a genuinely NEW type in this package and NOT a reuse of
 *     `@effect-cucumber/gherkin`'s `LoadFeatureWarning`. 06-CONTEXT.md D-02 is explicit about the
 *     reason: `ParsedFeature.warnings` is a gherkin-package, PARSE-TIME channel, and an unused
 *     step definition is not a fact about a `.feature` file at all — it is computed at Plan stage
 *     in this package, from the join of a parsed Feature against a registration tree that the
 *     gherkin package has never seen. Following that type's naming and shape is the whole of the
 *     borrowing.
 *
 * (d) **Message content is NEVER truncated.** No ellipsis, no elision, no maximum length, no
 *     slice, on any of the four types, and no cap on how many tags a message names. This is a
 *     locked developer decision recorded at
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
 * (f) **Every author-controlled string a factory here interpolates is `JSON.stringify`'d first, and
 *     that is a security control rather than a quoting style.** The messages built below reach a
 *     terminal through `console.warn`, and a `.feature` file's tags, Scenario titles and uris are
 *     written by whoever wrote the Feature. A tag containing a quote, a newline or an ANSI escape
 *     would otherwise be able to forge what reads as a SECOND line of this library's own output —
 *     threats T-06-06-01 / T-06-07-01, the same ones `Runner.ts`'s `warningTitle` and `Plan.ts`'s
 *     `quoted` helper already defend on their own sides, and `quoted` below is that helper copied
 *     rather than reinvented. `JSON.stringify` is the whole control: it escapes the quote, renders
 *     the newline as a two-character `\n`, and escapes the ESC byte, all without dropping a
 *     character (note (d)). `packages/vitest/test/Errors.test.ts` asserts it against a tag literally
 *     containing both a `"` and a newline.
 *
 *     What is deliberately NOT rendered anywhere here is the caught upstream error's own message
 *     text. `describeFeature.ts` catches a real `strictTags` throw to build an
 *     `UndeclaredTagWarning`, and neither the type nor the message carries a word of what that throw
 *     said. Plans 03-01 and 03-03 set the rule: upstream prose never becomes this library's
 *     contract. It is free to change inside an rc bump, it makes this library's output
 *     unsearchable under someone else's wording, and the upstream message in question even contains
 *     a typo. The warning names the library's OWN facts and nothing else.
 *
 * `StepMatchError`, `StepMatchErrorReason`, `UnusedStepDefinitionWarning` and
 * `UnusedStepDefinitionWarningReason` all belong in `packages/vitest/src/index.ts`: a
 * `StepMatchError` reaches a test author through a failing Scenario's error channel, and the
 * warning list is meant to be asserted on. Plan 06-07 owns that barrel edit — the same
 * "name the owning plan" convention plans 03-01 and 03-02 set for a deferred export.
 * `UndeclaredTagWarning`, `UndeclaredTagWarningReason`, `ExcludedScenariosNotice` and
 * `ExcludedScenariosNoticeReason` belong there for the same reason and are owned by plan 09-07, the
 * plan that closes Phase 9. This module itself imports nothing local; that is an invariant, not a
 * coincidence.
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
  cause: Schema.optionalKey(Schema.Unknown)
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

/**
 * Quote one author-controlled string for a message — note (f).
 *
 * `JSON.stringify` rather than hand-added quotes, copying `Plan.ts`'s `quoted` verbatim rather than
 * inventing a second escaping rule this repo would then have to keep in sync. It is the ONE control
 * standing between a `.feature` file's tag text and this library's terminal output.
 */
const quoted = (value: string): string => JSON.stringify(value)

/**
 * Quote every tag in a list and join them, for the messages below — note (f).
 *
 * Every element goes through `quoted`, not just the list as a whole: it is the individual tag that
 * carries author text, and quoting only the joined result would leave every separator forgeable.
 * No cap and no ellipsis, however many tags there are (note (d)).
 */
const quotedList = (values: ReadonlyArray<string>): string => values.map(quoted).join(", ")

/**
 * Why an `UndeclaredTagWarning` was emitted. One member — a tag `vitest`'s `strictTags` check does
 * not recognise, because no `vitest.config.ts` in the consumer's project declares it.
 *
 * A one-member union rather than a bare literal on the field, for the reason
 * `UnusedStepDefinitionWarningReason` gives: the discriminant reads the same at every call site
 * whether the union has one member or four, and widening it later is a local edit.
 */
export type UndeclaredTagWarningReason = "UndeclaredTag"

/**
 * A Scenario whose tags could not be emitted, because at least one of them is undeclared and
 * `vitest@4.1.11`'s `strictTags` defaults to `true` (09-CONTEXT.md D-08, correcting D-04).
 *
 * Plain data, not an `Error` subclass and not a tagged `Schema` error class — note (c). The upstream
 * event IS a throw, but this library catches it at `VitestTestApi.ts`'s adapter boundary and re-emits
 * the Scenario untagged, so nothing is failed with and nothing is re-thrown. Degrading a whole-file
 * collection failure (0 tests collected) into one warning about one Scenario is the entire point of
 * the type.
 *
 * `tags` is the Scenario's WHOLE tag list, of which AT LEAST ONE is undeclared — it is not the
 * offending subset, and the message below is worded to say exactly that rather than to imply every
 * entry was rejected. This is a real limit and it is stated rather than papered over: `strictTags`
 * rejects a `TestOptions.tags` array as a UNIT and names the offenders only in its own message text,
 * and `VitestTestApi.ts`'s adapter is forbidden from reading that text (it discriminates the catch
 * structurally, by outcome, so an upstream wording change cannot silently disable the degradation —
 * see that module's note (e)). The producer therefore cannot compute the offending subset without
 * taking on the exact dependency this library refuses. Reporting the whole list under an honest
 * label is the truthful option; reporting it under "the offending tags" told a reader to go and
 * declare tags that were already declared.
 *
 * It is an ARRAY rather than a single `tag` for the same reason: one catch concerns one rejected
 * array, so reporting per tag would print N lines about one event.
 *
 * `uri` and `scenarioName` are both required, for the reason `UnusedStepDefinitionWarning`'s own
 * note gives: the name is what a reader recognises and the uri is what an editor can open, and a
 * warning naming only one is ambiguous the moment two Features share a name. There is no `line` —
 * `ParsedScenario.location` is available to the producer, but the tags that triggered this may have
 * been INHERITED from the Feature, the Rule or an Examples block, so a single line number would
 * point at the Scenario for a tag written three scopes up. Naming no line is honest; naming the
 * wrong one is not.
 *
 * There is deliberately NO field carrying the caught framework error — note (f)'s second half.
 *
 * Plan 09-07 owns the `packages/vitest/src/index.ts` barrel edit that makes this reachable by a
 * consumer.
 */
export interface UndeclaredTagWarning {
  readonly _tag: "UndeclaredTagWarning"
  readonly reason: UndeclaredTagWarningReason
  /** The `.feature` file the Scenario was read from. */
  readonly uri: string
  /** The Scenario's title, as it appears in the reporter. */
  readonly scenarioName: string
  /**
   * The Scenario's whole tag list, at least one of which `strictTags` did not recognise, with their
   * literal `@` prefixes. NOT the offending subset — see the note above for why it cannot be.
   */
  readonly tags: ReadonlyArray<string>
  /** The rendered warning line, every author-controlled component quoted (note (f)). */
  readonly message: string
}

/**
 * Build an `UndeclaredTagWarning`, rendering D-08's message.
 *
 * The message names the three facts a reader needs to act — the file, the Scenario, and the tags it
 * carried — and then the two facts they need in order NOT to act on the wrong thing: the Scenario
 * STILL RAN (it is not missing from the run, only from the tag index) and it was emitted UNTAGGED
 * (so a `--tagsFilter` invocation naming any of these tags cannot select it). Without the second
 * fact the obvious reading of this warning is "my Scenario was skipped", which is the one thing that
 * did not happen. It closes with the upstream documentation URL because declaring the tag is the fix
 * and this library is not the place to re-document someone else's config key.
 *
 * The list is introduced as "at least one of which … does not declare", NOT as a list of offenders,
 * because that is what the producer can honestly claim — see the type's own note. The earlier
 * wording read every entry as rejected, so a Scenario carrying one declared and one undeclared tag
 * sent a reader off to declare a tag that was already declared.
 *
 * `uri`, `scenarioName` and EVERY tag go through `quoted` — note (f). Nothing is truncated and the
 * tag list has no cap — note (d).
 *
 * `reason` is not a parameter: the union has exactly one member today, so accepting it would let a
 * caller pass the only legal value and nothing else. Contrast `makeUnusedStepDefinitionWarning`,
 * whose signature predates this file's second and third warning types.
 *
 * The explicit return annotation is required, not stylistic: `composite: true` demands it for
 * declaration emit on anything exported.
 */
/**
 * A `Rule(...)` or `Scenario(...)` container was registered under a name the Feature does not
 * contain (F-11). The registration is INERT — its steps, Background and hooks can never run — and
 * without this the only symptom is a cluster of "matched no step" warnings pointing everywhere but
 * at the typo.
 */
export type UnknownContainerWarningReason = "UnknownContainer"

export interface UnknownContainerWarning {
  readonly _tag: "UnknownContainerWarning"
  readonly reason: UnknownContainerWarningReason
  /** The `.feature` file the Feature was read from. */
  readonly uri: string
  /** Which container call was made. */
  readonly kind: "Rule" | "Scenario"
  /** The name the author wrote, verbatim. */
  readonly name: string
  /** For a `Scenario` inside a `Rule`: that Rule's name. `null` at Feature level or for a Rule. */
  readonly ruleName: string | null
  /** The names the Feature does contain at that level, in document order. */
  readonly known: ReadonlyArray<string>
  /** The rendered warning line, every author-controlled component quoted. */
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
 *
 * - `ExcludedByIncludeTags` — only `includeTags` was in play; the Scenarios carried none of them.
 * - `ExcludedByExcludeTags` — only `excludeTags` was in play; the Scenarios carried one of them.
 * - `ExcludedByBothTagFilters` — both were set, so the notice cannot attribute the exclusion to one
 *   without recomputing per Scenario, which is a per-Scenario claim D-10 deliberately does not make.
 *
 * Three members and no fourth. "Neither option was set" is not a member because it cannot produce an
 * exclusion: under `Tags.ts`'s `noTagFilter` semantics every Scenario survives, so the count would be
 * zero and no notice would be built. `makeExcludedScenariosNotice`'s own comment records which arm
 * that unreachable input falls into.
 */
export type ExcludedScenariosNoticeReason =
  | "ExcludedByIncludeTags"
  | "ExcludedByExcludeTags"
  | "ExcludedByBothTagFilters"

/**
 * The ONE collection-time summary line a Feature prints when `includeTags`/`excludeTags` kept
 * Scenarios out of registration entirely (09-CONTEXT.md D-10).
 *
 * Plain data, not an `Error` subclass and not a tagged `Schema` error class — note (c). It goes to
 * the same
 * terminal channel as `UnusedStepDefinitionWarning`.
 *
 * ONE notice per Feature, carrying a `count`, and never one per excluded Scenario. D-03 makes an
 * excluded Scenario never become an `it.effect` call and never appear as its own node — printing a
 * line per Scenario would rebuild, in `console.warn`, exactly the per-Scenario output D-03 removed.
 * The count is what makes the aggregate honest without doing that.
 *
 * `includeTags` and `excludeTags` are both carried even though `reason` already says which was in
 * play: the notice's whole job is to catch a STALE filter, and a reader cannot tell whether the
 * filter is stale without seeing what it actually contained.
 *
 * Plan 09-07 owns the `packages/vitest/src/index.ts` barrel edit that makes this reachable by a
 * consumer.
 */
export interface ExcludedScenariosNotice {
  readonly _tag: "ExcludedScenariosNotice"
  readonly reason: ExcludedScenariosNoticeReason
  /** The Feature's name, as it appears in the reporter. */
  readonly featureName: string
  /** The `.feature` file the Feature was read from. */
  readonly uri: string
  /** How many Scenarios were kept out of registration. */
  readonly count: number
  /** The `includeTags` in play, `@` prefixes intact. Empty when the option was absent. */
  readonly includeTags: ReadonlyArray<string>
  /** The `excludeTags` in play, `@` prefixes intact. Empty when the option was absent. */
  readonly excludeTags: ReadonlyArray<string>
  /** The rendered notice line, every author-controlled component quoted (note (f)). */
  readonly message: string
}

/**
 * Derive which option caused the exclusion from the two arrays themselves — never from a parameter.
 *
 * This is a deliberate divergence from `makeUnusedStepDefinitionWarning`, which takes its `reason`.
 * That union has exactly one member, so a caller-supplied value cannot disagree with anything. This
 * one has three, all describing the SAME struct's other two fields, so a caller-supplied `reason` of
 * `ExcludedByIncludeTags` sitting next to an empty `includeTags` array would type-check, lint, render
 * a message, and go green — a notice whose whole purpose is telling a reader which filter to look at,
 * pointing at the wrong one. Deriving makes the two agree by construction.
 *
 * The fourth combination — both arrays empty — is unreachable: `Tags.ts`'s `shouldEmit` returns true
 * for every Scenario when neither array is set, so `count` is zero and the caller builds no notice.
 * It falls into `ExcludedByExcludeTags` here. That is not a claim it can happen; a member of its own
 * would need a message no consumer can produce and a test asserting output nobody can observe, and
 * throwing would turn a benign summary line into a hard collection failure.
 */
const excludedScenariosNoticeReason = (
  includeTags: ReadonlyArray<string>,
  excludeTags: ReadonlyArray<string>
): ExcludedScenariosNoticeReason =>
  includeTags.length > 0
    ? (excludeTags.length > 0 ? "ExcludedByBothTagFilters" : "ExcludedByIncludeTags")
    : "ExcludedByExcludeTags"

/**
 * Build an `ExcludedScenariosNotice`, deriving `reason` and rendering D-10's message.
 *
 * The message names the file, the Feature, the count, and the tags of whichever option was in play,
 * then says plainly that the Scenarios were never registered — because "excluded" alone reads as
 * "skipped" to anyone used to `@skip`, and a skipped test at least appears in the reporter. Every
 * author-controlled component is `quoted` (note (f)); nothing is truncated and the tag lists have no
 * cap (note (d)).
 *
 * `reason` is derived rather than accepted — see `excludedScenariosNoticeReason` above.
 *
 * The explicit return annotation is required, not stylistic: `composite: true` demands it for
 * declaration emit on anything exported.
 */
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

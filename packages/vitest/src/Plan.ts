/**
 * The Plan stage of ARCHITECTURE.md's Register→Plan→Emit pipeline.
 *
 * `describeFeature` runs three separable passes over in-memory data before a single vitest call
 * happens: REGISTER builds a scope tree by running the define callback once, PLAN — this module —
 * joins that tree against a `ParsedFeature`'s Scenarios and resolves every Pickle step to exactly
 * one step definition, and EMIT walks the result and calls `describe`/`it.effect`. Keeping the
 * middle pass separate is what makes an undefined or ambiguous step a deterministic, per-Scenario
 * discovery made BEFORE any test runs, rather than something found mid-`Effect.gen` on whichever
 * Scenario happened to run first — and it is why this whole module is testable with no vitest
 * machinery at all.
 *
 * This is also the phase's only fan-in point. Per ARCHITECTURE.md's "Internal boundaries" table no
 * matching, no scope lookup and no Layer decision may survive past here: everything downstream
 * consumes fully-resolved value objects and never sees a pattern, a registry or a `ParsedFeature`
 * internal again.
 *
 * Seven things about this module are not visible from the code.
 *
 * (a) **A resolution failure stays IN POSITION in the step list, as a member of the `PlannedStep`
 *     union — it is not hoisted to a `failure` field on the Scenario.** The consequence is the whole
 *     point: a Scenario whose third step is undefined still runs steps one and two and then fails at
 *     step three, which is what cucumber-js does (PITFALLS.md Pitfall 15, "how cucumber-js actually
 *     does it") and what makes INV-EC-001's fail-fast fall out for free under ADR-EC-004's
 *     one-Scenario-one-test rule. Hoisted to the Scenario, an undefined step written at the END of a
 *     Scenario would stop the earlier steps from running at all, and the developer would lose the
 *     one piece of evidence — how far the Scenario got — that says whether the undefined step is the
 *     only problem.
 *
 * (b) **Level precedence: an INNER registration shadows an outer one, and two matches at the same
 *     level is the ambiguity.** A visible match is ranked `0` when its scope is `background` or
 *     `scenario` and `1` when it is `feature`; the lowest rank with at least one match wins and the
 *     rest are discarded. That is ARCHITECTURE.md Pattern 5's "walk up the chain, first match wins",
 *     written as a rank rather than as a loop because the matcher already returned every match at
 *     once.
 *
 *     The plausible wrong reading is to treat ANY two matches as ambiguous. It fails on the exact
 *     arrangement Pattern 5 exists to support: a Feature-level default pattern with a Scenario-level
 *     override. Under that reading every Scenario that overrides a default becomes an
 *     `AmbiguousStep` error, so overriding is impossible and the Feature-level default has to be
 *     deleted — which is precisely the code duplication the scope chain removes. Two matches at the
 *     SAME rank is a genuine ambiguity, because nothing in the document says which of them the
 *     author meant.
 *
 * (c) **`ParsedScenario.astName` is the scope-match key and `ParsedScenario.name` never is.** A
 *     Scenario Outline compiles to one `ParsedScenario` per Examples row: each row has a distinct
 *     INTERPOLATED `name` (`adding 1`, `adding 2`) and they all share the one un-interpolated
 *     `astName` (`adding <count>`), which is also the string the author passed to `Scenario(...)`.
 *     Matching on `name` compiles, type-checks and works perfectly on every plain Scenario in the
 *     suite, then resolves NOTHING for any Outline row — every step of every row becomes an
 *     `UndefinedStep`. `name` has exactly one job here: it is the `it.effect` title.
 *
 * (d) **One matcher per `planFeature` call, over the WHOLE definition list — not one per Scenario
 *     and not one per scope level.** The scope filter is applied to the matcher's RESULTS, which is
 *     both cheaper and the only arrangement in which MATCH-04 can see two competing patterns at
 *     once: a per-scope matcher would return one match per level by construction and could never
 *     observe the collision. Cheaper, because `StepMatcher`'s lazy compilation cache is keyed on
 *     `(registry, pattern)`, so building one matcher compiles each pattern once for the whole
 *     Feature instead of once per Scenario.
 *
 *     The registry handed to it is `feature.parameterTypes`, and it must never be a freshly built
 *     one. A `ParsedFeature` carries the registry it was PARSED with, including every custom
 *     parameter type the author had defined at that moment; an expression compiled against any other
 *     registry would resolve different parameter types, and `StepMatcher`'s cache — keyed on the
 *     registry INSTANCE precisely because a fresh registry is a different registry — would then
 *     serve that wrong compilation without complaint.
 *
 * (e) **There is no `rule` scope kind, and this module does not pretend there is one.**
 *     `RegistryScopeKind` is `feature | background | scenario`; a `Rule:` block as a DSL container is
 *     Phase 8's DSL-05. ARCHITECTURE.md Pattern 5 describes a three-level chain (Scenario → Rule →
 *     Feature) and this module implements the two levels that exist today. A Scenario nested inside a
 *     `Rule:` is still planned correctly, because its steps are visible to Feature-scope and
 *     Background-scope registrations exactly as a top-level Scenario's are; what is missing is only
 *     the ability to REGISTER at Rule scope, which no DSL surface offers yet.
 *
 * (f) **Two `effect@4.0.0-rc.112` constraints govern this module, both already discovered and
 *     recorded at `packages/gherkin/src/Validate.ts`.** They are stated here as constraints, not
 *     rediscovered, and neither is a simplification waiting to be reverted. `Array.filterMap`
 *     silently returns `[]` regardless of input in this build, so the two-call `Arr.map` followed by
 *     `Arr.getSomes` is the shape to reach for where the idiomatic one-call form would be. And
 *     `Order.combineAll` THROWS, so an ordering here is a plain numeric comparator handed to the
 *     non-mutating `toSorted` — never the mutating in-place form, which `unicorn(no-array-sort)`
 *     rejects anyway. Revisit when the rc moves, not before.
 *
 * (g) **A pattern counts as USED when it was VISIBLE to a step and MATCHED it — not when it was
 *     SELECTED to run it.** The two readings differ on exactly one case, and it is the one that
 *     matters: a Feature-level pattern that matched a step and then lost to a Scenario-level
 *     override. Under the "was selected" reading that pattern is reported unused, so the
 *     Feature-level-default-plus-override arrangement note (b) exists to support produces a warning
 *     telling the author to delete the default — advice that is exactly backwards. It is not dead
 *     code; it matched. ADR-EC-019's own wording is "a registered pattern that matches zero steps
 *     across the whole Feature", which is the visible-and-matched reading and not the other one.
 *
 *     The used-set is keyed on the `StepDefinition` OBJECT REFERENCE and never on
 *     `definition.pattern`. Two definitions may legitimately share one pattern string at two
 *     different scopes — a default and its override are frequently worded identically — and a string
 *     key would let either one's use silently mark the other as used, hiding a genuinely dead
 *     registration behind a live one.
 *
 * Local imports: `./CallSite.ts`, `./Errors.ts` and `./Registry.ts`, plus the
 * `@effect-cucumber/gherkin` barrel. NEVER `./describeFeature.ts` — the dependency runs the other
 * way, because `describeFeature.ts` imports `planFeature` from here, and the reverse edge would be
 * both an `import/no-cycle` violation and a `pnpm circular` failure. That direction is also why
 * `planFeature` takes a Feature and a definition list rather than a `FeatureCollection`: naming that
 * type would require the forbidden import.
 *
 * `StepBody` lives here rather than in `describeFeature.ts` for the same reason — it is the `Fn` the
 * registry is instantiated with AND the type this module's `ResolvedStep` carries, so it belongs on
 * the side of the edge both can reach.
 *
 * This module is NOT exported from the package barrel. A plan is an internal stage of
 * `describeFeature`, exactly as the registry behind it is (`Registry.ts` note (d)) and as
 * `collectFeature` is; publishing it would freeze the plan's shape into the package's contract
 * before the runner that consumes it exists.
 */
import {
  createStepMatcher,
  generateStepSnippet,
  type ParsedFeature,
  type ParsedScenario,
  type ParsedStep,
  type StepOwner
} from "@effect-cucumber/gherkin"
import type * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import { compareCallSites, formatCallSite } from "./CallSite.ts"
import { makeUnusedStepDefinitionWarning, StepMatchError, type UnusedStepDefinitionWarning } from "./Errors.ts"
import type { RegistryScopeKind, StepDefinition } from "./Registry.ts"

/**
 * A step body after `Step.ts` has normalised it — the `Fn` the registry is instantiated with.
 *
 * The three `any`s are erased detail, not a widening of the public surface: `Dsl.ts`'s
 * `StepRegistrar<ROut>` has already checked every registered body against the ambient Layer's output
 * by the time one reaches here, and this type never appears in a position a caller writes against.
 * Compare PITFALLS Pitfall 6, which is about `any` in a step body's DECLARED type — a different
 * thing, and the one that would actually disable INV-EC-003.
 */
export type StepBody = (...params: ReadonlyArray<any>) => Effect.Effect<any, any, any>

/**
 * One Pickle step joined to the single step definition that will run it.
 *
 * Everything a runner needs and nothing it does not: `text`, `line`, `keyword` and `origin` are
 * carried through for reporting (BEH-EC-005 needs to say a step came from a Background), `pattern`
 * names which definition won, and `body` and `args` are what actually gets called.
 *
 * `args` is `StepMatcher`'s output passed through POSITIONALLY and UNMODIFIED. A `null` produced by
 * an optional group that did not participate is meaningful and is kept: dropping it would shift
 * every later argument by one, silently handing the step body the wrong values in the right types.
 */
export type ResolvedStep = {
  readonly text: string
  readonly line: number
  /** The AST keyword, already trimmed by `Correlate.ts` — an `And` stays an `And`. */
  readonly keyword: string
  readonly origin: StepOwner
  readonly pattern: string
  readonly body: StepBody
  readonly args: ReadonlyArray<unknown>
}

/** The `PlannedStep` member for a step that found exactly one definition. */
export type ResolvedPlannedStep = {
  readonly _tag: "Resolved"
  readonly step: ResolvedStep
}

/**
 * The `PlannedStep` member for a step that found none, or more than one.
 *
 * `text` and `line` are repeated here even though `error` carries both, so a caller walking the list
 * to report progress never has to open the error to know which step it is looking at.
 */
export type UnresolvedPlannedStep = {
  readonly _tag: "Unresolved"
  readonly text: string
  readonly line: number
  readonly error: StepMatchError
}

/**
 * One Pickle step after resolution: either it found its definition, or it carries the typed failure
 * that says why it did not.
 *
 * A union in the step list rather than a `failure` field on the Scenario — note (a) has the full
 * argument.
 *
 * Both members are exported by name as well as through this union. A consumer narrowing on `_tag`
 * cannot write `planned._tag === "Resolved"` at all: oxlint's `no-underscore-dangle` rejects reading
 * a leading-underscore property through member access while permitting object destructuring, so the
 * spelling that passes is `const { _tag } = planned` behind a type predicate — and a predicate needs
 * a name for the type it narrows to. `packages/vitest/test/Errors.test.ts` already carries the same
 * workaround for the same rule.
 */
export type PlannedStep = ResolvedPlannedStep | UnresolvedPlannedStep

/**
 * One Scenario, fully planned.
 *
 * `name` is the INTERPOLATED Pickle name and is the `it.effect` title — for a Scenario Outline row
 * it reads `adding 1`, which is what a developer needs to see in the reporter to tell one row from
 * another. `astName` is the UN-INTERPOLATED AST name and is the scope-match key — for the same row
 * it reads `adding <count>`, which is the string the author passed to `Scenario(...)`. Note (c) has
 * the failure mode of confusing the two.
 */
export type ScenarioPlan = {
  readonly scenarioId: string
  readonly name: string
  readonly astName: string
  readonly ruleId: Option.Option<string>
  readonly steps: ReadonlyArray<PlannedStep>
}

/**
 * A whole Feature, planned: every Scenario resolved, plus the non-fatal findings the resolution
 * turned up along the way.
 *
 * `feature` is carried through by reference rather than destructured into fields, because the
 * emission stage needs the tags, the Rules and the Feature name, and a plan that copied a subset
 * would have to grow a field every time the runner learned to read one more.
 */
export type FeaturePlan = {
  readonly feature: ParsedFeature
  readonly scenarios: ReadonlyArray<ScenarioPlan>
  readonly warnings: ReadonlyArray<UnusedStepDefinitionWarning>
}

/**
 * Every message is shaped `uri:line: <reason>: <what happened> <why it is bad> <what to do>`,
 * copying `packages/gherkin/src/Validate.ts`'s own prefix helper.
 *
 * Message quality is not cosmetic. A `StepMatchError` reaches a developer through a failing
 * Scenario's error channel with no surrounding narrative, so it has to stand alone: a reader who has
 * never opened this codebase should be able to fix the problem from the text without opening a
 * source file.
 */
const at = (uri: string, line: number): string => `${uri}:${line}: `

/**
 * Quote a step text or a pattern for a message.
 *
 * `JSON.stringify` rather than hand-added quotes, copying `Validate.ts`'s `describeBlock`: a step
 * text containing a quote character would otherwise make the message ambiguous about where the
 * quoted span ends (threat T-06-04-03).
 */
const quoted = (value: string): string => JSON.stringify(value)

/** The five registrar names a test author can actually write. */
const registrarKeywords: ReadonlySet<string> = new Set(["Given", "When", "Then", "And", "But"])

/** The registrar name to fall back on when a step's literal keyword is not one of the five. */
const registrarKeywordByKeywordType: Readonly<Record<string, string>> = {
  Context: "Given",
  Action: "When",
  Outcome: "Then",
  Conjunction: "And"
}

/**
 * The registrar name a test author would write for this step, for the suggested snippet only.
 *
 * The step's own literal keyword is preferred whenever it is one of the five, which covers every
 * English-language Feature. The `keywordType` fallback exists for the two cases where it cannot be:
 * a localized Feature, whose keyword reads `Etant donné` or `Angenommen`, and the `*` keyword, which
 * Gherkin permits anywhere a step keyword goes and which is no registrar's name. `Unknown` — and
 * anything else a future dialect produces — lands on `Given`, because a suggestion has to name some
 * registrar and `Given` is the one that reads least wrong in front of an unclassified step.
 *
 * ARCHITECTURE.md Anti-Pattern 7 forbids inferring the REPORTED keyword from `keywordType`, because
 * `And` and `But` collapse into the preceding step's type, so the mapping is lossy and a step
 * written `And` would be reported as `Given`. This is not that, and the difference is worth being
 * precise about. Nothing here changes what is reported: `ResolvedStep.keyword` and every message
 * carry the literal keyword, always. This is a best-effort SUGGESTION, it is consulted ONLY on the
 * path where the literal keyword provably cannot be a registrar name, and a slightly-wrong registrar
 * in a snippet the developer is about to paste and edit costs one keystroke.
 */
const registrarKeywordOf = (step: ParsedStep): string =>
  registrarKeywords.has(step.keyword)
    ? step.keyword
    : registrarKeywordByKeywordType[step.keywordType] ?? "Given"

/**
 * MATCH-03. A step whose text matched no definition visible to it.
 *
 * Returns the error rather than throwing it, copying `packages/gherkin/src/DataTable.ts`'s builder
 * form. ADR-EC-019 requires this failure to land in the containing Scenario's Effect error channel;
 * a throw from here would become a vitest COLLECTION error for the whole file, taking every other
 * Scenario down with it, which is the exact regression that ADR exists to prevent.
 *
 * The suggestion is 06-CONTEXT.md D-01, and it is generated against `feature.parameterTypes` so a
 * custom parameter type the author registered is generalised alongside the built-ins. It is embedded
 * in the message WHOLE: no truncation, no elision, no summary. `Errors.ts` note (d) locks that
 * policy for every message in this package, and it is doubly binding here, because a snippet that
 * has been shortened is no longer copy-pasteable and being copy-pasteable is the only property it
 * has.
 */
const undefinedStep = (args: {
  readonly feature: ParsedFeature
  readonly scenario: ParsedScenario
  readonly step: ParsedStep
}): StepMatchError => {
  const { feature, scenario, step } = args
  const suggestion = generateStepSnippet({
    keyword: registrarKeywordOf(step),
    text: step.text,
    registry: feature.parameterTypes
  })
  const sentences = [
    `the step ${quoted(step.text)} in Scenario ${quoted(scenario.name)} matched none of the step`,
    "definitions visible to it.",
    "An unmatched step cannot run, so this Scenario fails rather than passing with a step that",
    "silently did nothing.",
    "Register a definition for it:",
    suggestion
  ]
  return new StepMatchError({
    reason: "UndefinedStep",
    uri: feature.uri,
    line: Option.some(step.line),
    stepText: step.text,
    scenarioName: scenario.name,
    matchedPatterns: [],
    suggestion: Option.some(suggestion),
    message: `${at(feature.uri, step.line)}UndefinedStep: ${sentences.join(" ")}`,
    cause: Option.none()
  })
}

/**
 * MATCH-04. A step whose text matched more than one definition at the same scope level.
 *
 * Returns rather than throws, for `undefinedStep`'s reason. No suggestion: the patterns already
 * exist, and suggesting a new one would be actively wrong.
 *
 * The list is ordered by DEFINITION SITE — `compareCallSites` over each definition's `definedAt` —
 * and deliberately not alphabetically by pattern and not by registration order (06-CONTEXT.md D-03).
 * The list's job is to point the reader at the places to go and reconcile, so it is sorted by where
 * those places ARE. Alphabetical order would scatter two neighbouring registrations to opposite ends
 * of the list; registration order would make the message itself change under an unrelated refactor,
 * which is the very defect this error exists to report, and it would make the error's own output
 * depend on which module vitest happened to import first. A definition whose site was not captured
 * sorts last and renders in words rather than as an empty `:` pair.
 *
 * `toSorted` and not the mutating in-place form: `unicorn(no-array-sort)` rejects that one, and
 * `packages/gherkin/src/StepArguments.ts` is the in-repo precedent for the non-mutating spelling.
 * The comparator is `CallSite.ts`'s and not a comparison over `formatCallSite`'s output, which would
 * be the tempting one-liner and which puts line 10 before line 9.
 */
const ambiguousStep = (args: {
  readonly feature: ParsedFeature
  readonly scenario: ParsedScenario
  readonly step: ParsedStep
  readonly matches: ReadonlyArray<StepDefinition<StepBody>>
}): StepMatchError => {
  const { feature, matches, scenario, step } = args
  const ordered = matches.toSorted((left, right) => compareCallSites(left.definedAt, right.definedAt))
  const sites = ordered.map((definition) =>
    `${quoted(definition.pattern)} was registered as a ${definition.keyword} at `
    + `${formatCallSite(definition.definedAt)}.`
  )
  const sentences = [
    `the step ${quoted(step.text)} in Scenario ${quoted(scenario.name)} matched ${ordered.length} step`,
    "definitions, all registered at the same scope, listed here in definition-site order.",
    ...sites,
    "Resolving this by registration order would make the step's argument types and behaviour depend",
    "on the order the definitions happen to be written in, so an unrelated refactor that reorders two",
    "registrations would silently change what this test asserts:",
    "`I have {int} apples` and `I have {word} apples` both match `I have 5 apples`, yielding the",
    "number 5 from one and the string \"5\" from the other.",
    "Delete all but one of them, or narrow their patterns so only one can match this step."
  ]
  return new StepMatchError({
    reason: "AmbiguousStep",
    uri: feature.uri,
    line: Option.some(step.line),
    stepText: step.text,
    scenarioName: scenario.name,
    matchedPatterns: ordered.map((definition) => definition.pattern),
    suggestion: Option.none(),
    message: `${at(feature.uri, step.line)}AmbiguousStep: ${sentences.join(" ")}`,
    cause: Option.none()
  })
}

/**
 * MATCH-05. A registered pattern that matched no step anywhere in the Feature.
 *
 * A WARNING and never a failure (ADR-EC-019): an unused step definition is dead code, not a broken
 * Scenario, and the plan it is attached to is completely usable. This is 06-CONTEXT.md D-02's third
 * surface — the structured, programmatically-inspectable one a test asserts against directly instead
 * of scraping `console.warn` output or parsing a synthetic test node's title.
 *
 * The message prefix omits the line number that `at()` supplies everywhere else, and that is not an
 * oversight: this finding is about the whole Feature, which has no single line where a pattern
 * failing to match happened. The definition SITE is the location a reader needs, and it is in the
 * sentences instead.
 *
 * `definedAt` is handed to the factory already rendered through `formatCallSite`, so the field is
 * always `Option.some` — carrying either a real `file:line:column` or the shared
 * `an unrecorded location` wording. That keeps the field and the message saying the same thing, and
 * keeps every consumer from having to re-decide the absent-site phrasing for itself.
 */
const unusedStepDefinition = (args: {
  readonly feature: ParsedFeature
  readonly definition: StepDefinition<StepBody>
}): UnusedStepDefinitionWarning => {
  const { definition, feature } = args
  const site = formatCallSite(definition.definedAt)
  const sentences = [
    `the step pattern ${quoted(definition.pattern)}, registered as a ${definition.keyword} at`,
    `${site}, matched no step in Feature ${quoted(feature.name)}.`,
    "An unused step definition is dead code that will drift out of sync with the Feature, and a typo",
    "in a pattern looks from here exactly like a definition nobody needs any more.",
    "Delete it, or fix the pattern so it matches the step it was written for."
  ]
  return makeUnusedStepDefinitionWarning({
    reason: "UnusedStepDefinition",
    featureName: feature.name,
    uri: feature.uri,
    keyword: definition.keyword,
    pattern: definition.pattern,
    definedAt: site,
    message: `${feature.uri}: UnusedStepDefinition: ${sentences.join(" ")}`
  })
}

/**
 * Is `definition` on `step`'s scope chain? ARCHITECTURE.md Pattern 5, and ADR-EC-017 for the
 * Background half.
 *
 * - `feature` scope is visible to every step of every Scenario. It is the shared default.
 * - `background` scope is visible ONLY to a step that came from a Background. ADR-EC-017 makes a
 *   `Background` a step-definition CONTAINER — its registrations exist to give the Background's own
 *   step text something to match, and a Scenario step reaching into them would resolve against a
 *   definition written for a different block.
 * - `scenario` scope is visible ONLY to a step of THAT Scenario, matched by `astName`. Note (c) is
 *   why the comparison is against `astName` and never `name`.
 *
 * - `rule` scope exists as a kind but is not yet reachable: no DSL surface pushes a `rule` frame, so
 *   no definition can carry one. The arm returns `false` rather than being omitted, because the
 *   switch is exhaustive by return type and because `false` is the only safe default for a scope
 *   whose matching rule is not written — a `true` here would make an unreachable case leak every
 *   registration to every step the moment the case became reachable.
 */
const isVisibleTo = (
  definition: StepDefinition<StepBody>,
  scenario: ParsedScenario,
  step: ParsedStep
): boolean => {
  switch (definition.scope.kind) {
    case "feature":
      return true
    case "background":
      return step.origin === "feature-background" || step.origin === "rule-background"
    case "scenario":
      return step.origin === "scenario" && definition.scope.name === scenario.astName
    case "rule":
      return false
  }
}

/**
 * How far up the scope chain a registration sits: `0` for the inner level, `1` for the Feature.
 *
 * `background` and `scenario` share rank `0` and cannot compete with each other, because
 * `isVisibleTo` already makes them mutually exclusive for any one step — a step's `origin` is either
 * a Background one or a Scenario one, never both.
 */
const scopeRank = (kind: RegistryScopeKind): number => kind === "feature" ? 1 : 0

/**
 * Resolve one Pickle step against the whole visible definition set.
 *
 * Three outcomes, and the shape of the function is the rule from note (b): filter the matcher's
 * results to what is visible, keep only the innermost rank that matched anything, then count.
 */
const planStep = (args: {
  readonly feature: ParsedFeature
  readonly scenario: ParsedScenario
  readonly step: ParsedStep
  readonly matches: ReadonlyArray<{
    readonly pattern: string
    readonly definition: StepDefinition<StepBody>
    readonly args: ReadonlyArray<unknown>
  }>
}): PlannedStep => {
  const { feature, matches, scenario, step } = args
  const inner = matches.filter((match) => scopeRank(match.definition.scope.kind) === 0)
  const winning = inner.length > 0 ? inner : matches

  const only = winning.length === 1 ? winning[0] : undefined
  if (only !== undefined) {
    return {
      _tag: "Resolved",
      step: {
        text: step.text,
        line: step.line,
        keyword: step.keyword,
        origin: step.origin,
        pattern: only.pattern,
        body: only.definition.body,
        args: only.args
      }
    }
  }

  return {
    _tag: "Unresolved",
    text: step.text,
    line: step.line,
    error: winning.length === 0
      ? undefinedStep({ feature, scenario, step })
      : ambiguousStep({
        feature,
        scenario,
        step,
        matches: winning.map((match) => match.definition)
      })
  }
}

/**
 * Join a parsed Feature against a registered step tree.
 *
 * Never throws for a resolution outcome. Every zero-match and every many-match becomes an
 * `Unresolved` step carrying a located `StepMatchError`, so a Feature with one broken step still
 * produces a complete, runnable plan for every other Scenario in it (ADR-EC-019).
 *
 * Takes the Feature and the definitions as separate fields rather than a `FeatureCollection`,
 * because naming that type would mean importing `describeFeature.ts` and inverting this module's
 * one hard dependency direction — see the closing paragraph of the module doc comment.
 */
export const planFeature = (args: {
  readonly feature: ParsedFeature
  readonly definitions: ReadonlyArray<StepDefinition<StepBody>>
}): FeaturePlan => {
  const { definitions, feature } = args

  // ONE matcher, over EVERY definition, against the Feature's own registry — note (d). The opaque
  // `D` payload is the WHOLE `StepDefinition`, which is the slot `StepMatcher.ts` designed it for:
  // the scope, the keyword and the definition site all have to survive the round trip, and only the
  // caller knows what they are. The type argument is left to inference rather than written out,
  // because writing it is the one thing that would let it disagree with `entries`.
  const matcher = createStepMatcher({
    registry: feature.parameterTypes,
    entries: definitions.map((definition) => ({ pattern: definition.pattern, definition }))
  })

  // Every definition that was VISIBLE to at least one step AND matched that step's text, recorded
  // BEFORE level precedence discards the shadowed ones. That ordering is the whole subtlety of
  // MATCH-05, and the object-reference key is the other half — note (g) has both arguments.
  const used = new Set<StepDefinition<StepBody>>()

  const scenarios = feature.allScenarios.map((scenario): ScenarioPlan => ({
    scenarioId: scenario.id,
    name: scenario.name,
    astName: scenario.astName,
    ruleId: scenario.ruleId,
    steps: scenario.steps.map((step) => {
      const visible = matcher.match(step.text).filter((match) => isVisibleTo(match.definition, scenario, step))
      for (const match of visible) {
        used.add(match.definition)
      }
      return planStep({ feature, scenario, step, matches: visible })
    })
  }))

  // Sorted for determinism, so a test can assert by position rather than by searching, and so the
  // list a developer reads does not reorder itself under an unrelated refactor. Same key as the
  // ambiguous list — definition site — with the pattern as the tie-break for two registrations that
  // share one site or have none, and `toSorted` is stable, so two findings that tie on both keep the
  // order they were found in. Copied, reasoning and all, from `packages/gherkin/src/Validate.ts`'s
  // own closing sort.
  const warnings = definitions
    .filter((definition) => !used.has(definition))
    .toSorted((left, right) => {
      const bySite = compareCallSites(left.definedAt, right.definedAt)
      return bySite === 0 ? left.pattern.localeCompare(right.pattern) : bySite
    })
    .map((definition) => unusedStepDefinition({ feature, definition }))

  return { feature, scenarios, warnings }
}

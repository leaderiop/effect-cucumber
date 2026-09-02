/**
 * The Plan stage: resolves every Pickle step against the registered definitions, in pure code with
 * no framework dependency, and reports unused definitions as warnings.
 *
 * Invariants a reader must not tidy away:
 * - Scope matching uses `astName` (the un-interpolated title); titles use `name`. Swapping them
 *   compiles and collapses an Outline's rows (`test/Plan.test.ts`, `test/OutlineTitle.test.ts`).
 * - Zero matches fail the Scenario with `UndefinedStep` and a snippet; more than one at the same
 *   scope level fail it with `AmbiguousStep` listing every site in call-site order; the innermost
 *   scope wins (ADR-EC-019, `test/Plan.test.ts`).
 * - `ErasedLayer` / `ErasedExtraLayer` / `ErasedEffect` are the ONE place the runtime core erases
 *   type parameters, after the dsl has checked every body (INV-EC-003).
 * - Pattern arguments come first, then the step's DataTable/DocString (BEH-EC-016).
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
import type * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import { compareCallSites, formatCallSite } from "./CallSite.ts"
import { makeUnusedStepDefinitionWarning, StepMatchError, type UnusedStepDefinitionWarning } from "./Errors.ts"
import type { RegistryScopeKind, StepDefinition } from "./Registry.ts"

/**
 * A step body after `Step.ts` has normalised it — the `Fn` the registry is instantiated with.
 */
export type StepBody = (...params: ReadonlyArray<any>) => Effect.Effect<any, any, any>

/**
 * The ONE place the runtime core erases a Layer's type parameters (INV-EC-003's boundary paragraph
 * names it): the shared tier, whose input is `never`.
 */
export type ErasedLayer = Layer.Layer<any, any, never>

/**
 * A Layer whose INPUT another tier satisfies at run time — see `ErasedLayer`.
 */
export type ErasedExtraLayer = Layer.Layer<any, any, any>

export type ErasedEffect = Effect.Effect<void, unknown, any>

/**
 * One Pickle step joined to the single step definition that will run it.
 */
export type ResolvedStep = {
  readonly text: string
  readonly line: number
  readonly keyword: string
  readonly origin: StepOwner
  readonly pattern: string
  readonly body: StepBody
  readonly args: ReadonlyArray<unknown>
}

export type ResolvedPlannedStep = {
  readonly _tag: "Resolved"
  readonly step: ResolvedStep
}

/**
 * The `PlannedStep` member for a step that found none, or more than one.
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
 */
export type PlannedStep = ResolvedPlannedStep | UnresolvedPlannedStep

/**
 * One Scenario, fully planned.
 */
export type ScenarioPlan = {
  readonly scenarioId: string
  readonly name: string
  readonly astName: string
  readonly ruleId: Option.Option<string>
  readonly tags: ReadonlyArray<string>
  readonly steps: ReadonlyArray<PlannedStep>
}

/**
 * A whole Feature, planned: every Scenario resolved, plus the non-fatal findings the resolution
 * turned up along the way.
 */
export type FeaturePlan = {
  readonly feature: ParsedFeature
  readonly scenarios: ReadonlyArray<ScenarioPlan>
  readonly warnings: ReadonlyArray<UnusedStepDefinitionWarning>
}

const at = (uri: string, line: number): string => `${uri}:${line}: `

const quoted = (value: string): string => JSON.stringify(value)

const registrarKeywords: ReadonlySet<string> = new Set(["Given", "When", "Then", "And", "But"])

const registrarKeywordByKeywordType: Readonly<Record<string, string>> = {
  Context: "Given",
  Action: "When",
  Outcome: "Then",
  Conjunction: "And"
}

const registrarKeywordOf = (step: ParsedStep): string =>
  registrarKeywords.has(step.keyword)
    ? step.keyword
    : registrarKeywordByKeywordType[step.keywordType] ?? "Given"

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
    message: `${at(feature.uri, step.line)}UndefinedStep: ${sentences.join(" ")}`
  })
}

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
    message: `${at(feature.uri, step.line)}AmbiguousStep: ${sentences.join(" ")}`
  })
}

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

const isVisibleTo = (
  definition: StepDefinition<StepBody>,
  scenario: ParsedScenario,
  step: ParsedStep
): boolean => {
  const scenarioRuleId = Option.getOrNull(scenario.ruleId)
  switch (definition.scope.kind) {
    case "feature":
      return true
    case "rule":
      return scenarioRuleId === definition.scope.ruleId
    case "background":
      return step.origin === "feature-background"
        ? definition.scope.ruleId === null
        : step.origin === "rule-background" && scenarioRuleId === definition.scope.ruleId
    case "scenario":
      return step.origin === "scenario"
        && definition.scope.name === scenario.astName
        && scenarioRuleId === definition.scope.ruleId
  }
}

const scopeRank = (kind: RegistryScopeKind): number => kind === "feature" ? 2 : kind === "rule" ? 1 : 0

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

  // The LOWEST rank present wins, computed rather than tested against a literal `0`.
  const innermost = matches.reduce(
    (rank, match) => Math.min(rank, scopeRank(match.definition.scope.kind)),
    Number.POSITIVE_INFINITY
  )
  const winning = matches.filter((match) => scopeRank(match.definition.scope.kind) === innermost)

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
        // `stepArguments` is `[]` for the overwhelming majority of steps, so this spread is the
        // identity for them and the args list is byte-identical to the matcher's output.
        args: [...only.args, ...step.stepArguments]
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
 */
export const planFeature = (args: {
  readonly feature: ParsedFeature
  readonly definitions: ReadonlyArray<StepDefinition<StepBody>>
}): FeaturePlan => {
  const { definitions, feature } = args

  // The opaque `D` payload is the whole `StepDefinition`: scope, keyword and definition site all
  // survive the match.
  const matcher = createStepMatcher({
    registry: feature.parameterTypes,
    entries: definitions.map((definition) => ({ pattern: definition.pattern, definition }))
  })

  // Every definition that was VISIBLE to at least one step AND matched that step's text, recorded
  // BEFORE level precedence discards the shadowed ones.
  const used = new Set<StepDefinition<StepBody>>()

  const scenarios = feature.allScenarios.map((scenario): ScenarioPlan => ({
    scenarioId: scenario.id,
    name: scenario.name,
    astName: scenario.astName,
    ruleId: scenario.ruleId,
    tags: scenario.tags,
    steps: scenario.steps.map((step) => {
      const visible = matcher.match(step.text).filter((match) => isVisibleTo(match.definition, scenario, step))
      for (const match of visible) {
        used.add(match.definition)
      }
      return planStep({ feature, scenario, step, matches: visible })
    })
  }))

  // Sorted for determinism, so a test can assert by position rather than by searching, and so the
  // list a developer reads does not reorder itself under an unrelated refactor.
  const warnings = definitions
    .filter((definition) => !used.has(definition))
    .toSorted((left, right) => {
      const bySite = compareCallSites(left.definedAt, right.definedAt)
      return bySite === 0 ? left.pattern.localeCompare(right.pattern) : bySite
    })
    .map((definition) => unusedStepDefinition({ feature, definition }))

  return { feature, scenarios, warnings }
}

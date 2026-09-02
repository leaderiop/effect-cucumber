/**
 * Correlating a parsed `GherkinDocument` with `compile()`'s pickles (ADR-EC-014, PARSE-02).
 *
 * The AST walk exists ONLY to recover what a pickle cannot carry: step keyword, `keywordType`, origin and line,
 * Rule membership, the un-interpolated Scenario name, and the Examples column names. Everything a pickle DOES
 * carry — placeholder substitution, tag inheritance, Background stacking — is read off the pickle; re-deriving any
 * of it here drifts from Cucumber semantics silently.
 *
 * Step origin comes from the `byStepId` index, never from `astNodeIds.length` (which carries no signal inside a
 * plain Scenario). Outline detection goes through `@cucumber/gherkin`'s `dialects` table, exact in every
 * language, and no `RegExp` is built from feature-file content. This module performs NO validation:
 * `Validate.ts` judges the correlated result, so a failing fixture says which of the two broke.
 * Imports never reach `./index.ts` (cycle).
 */
import { type Dialect, dialects } from "@cucumber/gherkin"
import {
  type Feature,
  type GherkinDocument,
  type Location,
  type Pickle,
  type PickleStep,
  type Scenario,
  type Step,
  StepKeywordType
} from "@cucumber/messages"
import * as Option from "effect/Option"
import { LoadFeatureError } from "./Errors.ts"
import type { ParsedFeatureCore, ParsedRule, ParsedScenario, ParsedStep, StepOwner } from "./Model.ts"
import { stepArgumentsOf } from "./StepArguments.ts"

/** One AST step by node id, carrying what the matching `PickleStep` lacks; held whole because `Validate.ts`
 * needs its un-interpolated `.text`. */
export interface AstStepInfo {
  readonly step: Step
  readonly owner: StepOwner
  readonly ruleId: string | undefined
}

/** One AST `Scenario` node — the Outline itself, not one of its rows. */
export interface AstScenarioInfo {
  readonly id: string
  /** Trimmed. Localised, e.g. `Plan du scénario`. */
  readonly keyword: string
  /** The un-interpolated AST name, e.g. `outline <name>`. */
  readonly name: string
  readonly description: string
  readonly ruleId: string | undefined
  readonly location: Location
  /** `scenario.examples.length`. Zero on an Outline keyword is the F3 signature. */
  readonly examplesCount: number
  /** Header cells per `Examples:` block, duplicates PRESERVED (the F11 check needs them). */
  readonly examplesHeaders: ReadonlyArray<ReadonlyArray<string>>
  /**
   * `tableBody.length` per `Examples:` block: `compile()` yields one pickle per body row, per block, so a zero
   * here is the exact per-block F1/F2 signature (`test/upstream-pin.test.ts`); `byScenarioId` keys on the shared
   * Outline id and cannot tell blocks apart.
   */
  readonly examplesRowCounts: ReadonlyArray<number>
}

/** One AST `Rule:` and the ids of the Scenarios inside it, in document order. */
export interface AstRuleInfo {
  readonly id: string
  readonly name: string
  /** Trimmed. */
  readonly keyword: string
  /** The Rule's OWN tag names, not the inherited set. */
  readonly tags: ReadonlyArray<string>
  readonly location: Location
  readonly description: string
  /** Empty for a Rule containing no Scenarios — the F13 signature. */
  readonly scenarioIds: ReadonlyArray<string>
}

/** Everything one AST walk plus one pass over the pickles produces. */
export interface AstIndex {
  /** AST step id to its recovered keyword, origin and enclosing Rule. */
  readonly byStepId: ReadonlyMap<string, AstStepInfo>
  /** AST scenario id to its pickles — an array, since an Outline's rows share `astNodeIds[0]`; a missing key
   * is legal, not a defect. */
  readonly byScenarioId: ReadonlyMap<string, ReadonlyArray<Pickle>>
  /** AST scenario id to its Examples column names — what makes the leftover-placeholder scan exact. */
  readonly exampleColumns: ReadonlyMap<string, ReadonlySet<string>>
  /** Every AST Scenario node, flat, in document order, Rule members included in place. */
  readonly astScenarios: ReadonlyArray<AstScenarioInfo>
  readonly astRules: ReadonlyArray<AstRuleInfo>
  /** `feature.language`, the key `isOutlineKeyword` and `isScenarioKeyword` are given. */
  readonly language: string
}

/** The correlated feature and its index; `Validate.ts` needs both. */
export interface CorrelationResult {
  readonly feature: ParsedFeatureCore
  readonly index: AstIndex
}

/** Structural on `{ name }` so one helper serves an AST `Tag` and a `PickleTag`. */
const tagNames = (tags: ReadonlyArray<{ readonly name: string }>): ReadonlyArray<string> => tags.map((tag) => tag.name)

/**
 * A dialect by language, through `Object.hasOwn`: a bare index on `"constructor"` reads through to
 * `Object.prototype`. `Parser.ts` rejects an unknown language first; this is for the exported helpers.
 */
const dialectOf = (language: string): Dialect | undefined =>
  Object.hasOwn(dialects, language) ? dialects[language] : undefined

/** Whether `keyword` is a Scenario Outline keyword in `language` — the only exact way to tell, since
 * `compile()` never branches on the keyword. */
export const isOutlineKeyword = (language: string, keyword: string): boolean => {
  const dialect = dialectOf(language)
  return dialect === undefined ? false : dialect.scenarioOutline.includes(keyword.trim())
}

/** Every step keyword of `language`, trimmed, without the wildcard `*` (a bullet in ordinary prose). */
export const stepKeywords = (language: string): ReadonlyArray<string> => {
  const dialect = dialectOf(language)
  if (dialect === undefined) return []
  const all = [...dialect.given, ...dialect.when, ...dialect.then, ...dialect.and, ...dialect.but]
  return [...new Set(all.map((keyword) => keyword.trim()).filter((keyword) => keyword !== "*"))]
}

/** Whether `keyword` is a plain Scenario keyword in `language`. */
export const isScenarioKeyword = (language: string, keyword: string): boolean => {
  const dialect = dialectOf(language)
  return dialect === undefined ? false : dialect.scenario.includes(keyword.trim())
}

/** Narrow `document.feature` (`undefined` for a comment-only file). `Parser.ts` rejects that case as
 * `NoFeature`; reaching this throw is a library defect. */
const featureOf = (document: GherkinDocument, uri: string): Feature => {
  const feature = document.feature
  if (feature === undefined) {
    throw new Error(`${uri} reached correlation without a Feature:, which Parser.ts rejects — this is a library defect`)
  }
  return feature
}

/** Header cells per Examples block, duplicates preserved; a headerless block contributes `[]`. */
const examplesHeadersOf = (scenario: Scenario): ReadonlyArray<ReadonlyArray<string>> =>
  scenario.examples.map((block) =>
    block.tableHeader === undefined ? [] : block.tableHeader.cells.map((cell) => cell.value)
  )

/** `tableBody.length` per Examples block — see `AstScenarioInfo.examplesRowCounts`. */
const examplesRowCountsOf = (scenario: Scenario): ReadonlyArray<number> =>
  scenario.examples.map((block) => block.tableBody.length)

const recordSteps = (
  target: Map<string, AstStepInfo>,
  steps: ReadonlyArray<Step>,
  owner: StepOwner,
  ruleId: string | undefined
): void => {
  for (const step of steps) {
    target.set(step.id, { step, owner, ruleId })
  }
}

/** The mutable half of the walk, threaded through so the traversal stays one pass. */
interface AstAccumulator {
  readonly byStepId: Map<string, AstStepInfo>
  readonly exampleColumns: Map<string, ReadonlySet<string>>
  readonly astScenarios: Array<AstScenarioInfo>
  readonly astRules: Array<AstRuleInfo>
}

const recordScenario = (acc: AstAccumulator, scenario: Scenario, ruleId: string | undefined): void => {
  recordSteps(acc.byStepId, scenario.steps, "scenario", ruleId)

  const headers = examplesHeadersOf(scenario)
  const columns = new Set<string>()
  for (const block of headers) {
    for (const value of block) {
      columns.add(value)
    }
  }
  acc.exampleColumns.set(scenario.id, columns)

  acc.astScenarios.push({
    id: scenario.id,
    keyword: scenario.keyword.trim(),
    name: scenario.name,
    description: scenario.description,
    ruleId,
    location: scenario.location,
    examplesCount: scenario.examples.length,
    examplesHeaders: headers,
    examplesRowCounts: examplesRowCountsOf(scenario)
  })
}

/** Pickles by the AST scenario id they compiled from — built from the PICKLES, so a scenario that compiled to
 * nothing has no key. The `astNodeIds[0]` guard is what `noUncheckedIndexedAccess` requires. */
const indexPicklesByScenario = (pickles: ReadonlyArray<Pickle>): ReadonlyMap<string, ReadonlyArray<Pickle>> => {
  const byScenarioId = new Map<string, Array<Pickle>>()
  for (const pickle of pickles) {
    const key = pickle.astNodeIds[0]
    if (key === undefined) {
      continue
    }
    const bucket = byScenarioId.get(key)
    if (bucket === undefined) {
      byScenarioId.set(key, [pickle])
    } else {
      bucket.push(pickle)
    }
  }
  return byScenarioId
}

/** Walk `document` once and index `pickles` once; `astScenarios` comes out in document order, Rule members in
 * place. */
export const buildAstIndex = (
  document: GherkinDocument,
  pickles: ReadonlyArray<Pickle>,
  uri: string
): AstIndex => {
  const feature = featureOf(document, uri)
  const acc: AstAccumulator = {
    byStepId: new Map(),
    exampleColumns: new Map(),
    astScenarios: [],
    astRules: []
  }

  for (const child of feature.children) {
    if (child.background !== undefined) {
      recordSteps(acc.byStepId, child.background.steps, "feature-background", undefined)
    }
    if (child.scenario !== undefined) {
      recordScenario(acc, child.scenario, undefined)
    }
    if (child.rule !== undefined) {
      const rule = child.rule
      const scenarioIds: Array<string> = []
      for (const ruleChild of rule.children) {
        if (ruleChild.background !== undefined) {
          recordSteps(acc.byStepId, ruleChild.background.steps, "rule-background", rule.id)
        }
        if (ruleChild.scenario !== undefined) {
          recordScenario(acc, ruleChild.scenario, rule.id)
          scenarioIds.push(ruleChild.scenario.id)
        }
      }
      acc.astRules.push({
        id: rule.id,
        name: rule.name,
        keyword: rule.keyword.trim(),
        tags: tagNames(rule.tags),
        location: rule.location,
        description: rule.description,
        scenarioIds
      })
    }
  }

  return {
    byStepId: acc.byStepId,
    byScenarioId: indexPicklesByScenario(pickles),
    exampleColumns: acc.exampleColumns,
    astScenarios: acc.astScenarios,
    astRules: acc.astRules,
    language: feature.language
  }
}

/**
 * Join one `PickleStep` with its AST node: the pickle supplies substituted `text` and `argument`, the AST the
 * keyword (trimmed — the raw value has a trailing space), `keywordType` (the pickle's own has no `Conjunction`,
 * so `And` after `Given` reads `Context` there), origin and line. The raw argument is wrapped here, once — the
 * package's only `DataTable` construction site. A missed lookup throws: parse and compile disagreeing about
 * one document must not be buried under a fabricated keyword.
 */
const resolveStep = (
  pickleStep: PickleStep,
  byStepId: ReadonlyMap<string, AstStepInfo>,
  uri: string
): ParsedStep => {
  const sourceId = pickleStep.astNodeIds[0]
  const info = sourceId === undefined ? undefined : byStepId.get(sourceId)
  if (info === undefined) {
    throw new LoadFeatureError({
      reason: "ParseFailed",
      uri,
      line: Option.none(),
      message: `Pickle step ${JSON.stringify(pickleStep.text)} in ${uri} references AST node `
        + `${sourceId === undefined ? "<none>" : sourceId}, which the parsed document does not `
        + `declare. The parser and the pickle compiler disagree about this file; they must have `
        + `been given the same id generator and the same document.`
    })
  }
  return {
    id: pickleStep.id,
    text: pickleStep.text,
    keyword: info.step.keyword.trim(),
    keywordType: info.step.keywordType ?? StepKeywordType.UNKNOWN,
    origin: info.owner,
    line: info.step.location.line,
    argument: Option.fromUndefinedOr(pickleStep.argument),
    stepArguments: stepArgumentsOf(pickleStep.argument, uri, info.step.location.line)
  }
}

/**
 * Correlate a parsed document with its pickles. `uri` is the caller's (`GherkinDocument.uri` is `undefined`
 * for a string). An AST Scenario with no pickles contributes nothing and is NOT an error here — that absence is
 * `Validate.ts`'s evidence. `tags`, `steps` and `location` are read off the pickle, never re-derived.
 */
export const correlateFeature = (
  document: GherkinDocument,
  pickles: ReadonlyArray<Pickle>,
  uri: string
): CorrelationResult => {
  const feature = featureOf(document, uri)
  const index = buildAstIndex(document, pickles, uri)

  const allScenarios: Array<ParsedScenario> = []
  const featureScenarios: Array<ParsedScenario> = []
  const scenariosByRule = new Map<string, Array<ParsedScenario>>()

  for (const node of index.astScenarios) {
    for (const pickle of index.byScenarioId.get(node.id) ?? []) {
      const scenario: ParsedScenario = {
        id: pickle.id,
        astId: node.id,
        name: pickle.name,
        astName: node.name,
        keyword: node.keyword,
        tags: tagNames(pickle.tags),
        steps: pickle.steps.map((pickleStep) => resolveStep(pickleStep, index.byStepId, uri)),
        // `Pickle.location` is optional upstream though always set; for an Outline it is the Examples row.
        location: pickle.location ?? node.location,
        ruleId: Option.fromUndefinedOr(node.ruleId),
        pickle
      }
      allScenarios.push(scenario)

      if (node.ruleId === undefined) {
        featureScenarios.push(scenario)
      } else {
        const bucket = scenariosByRule.get(node.ruleId)
        if (bucket === undefined) {
          scenariosByRule.set(node.ruleId, [scenario])
        } else {
          bucket.push(scenario)
        }
      }
    }
  }

  const rules: ReadonlyArray<ParsedRule> = index.astRules.map((rule) => ({
    id: rule.id,
    name: rule.name,
    keyword: rule.keyword,
    tags: rule.tags,
    location: rule.location,
    description: rule.description,
    scenarios: scenariosByRule.get(rule.id) ?? []
  }))

  const correlated: ParsedFeatureCore = {
    uri,
    name: feature.name,
    keyword: feature.keyword.trim(),
    language: feature.language,
    description: feature.description,
    tags: tagNames(feature.tags),
    location: feature.location,
    scenarios: featureScenarios,
    rules,
    allScenarios,
    document,
    pickles
  }

  return { feature: correlated, index }
}

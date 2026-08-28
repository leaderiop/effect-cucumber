/**
 * Correlating a parsed `GherkinDocument` with `compile()`'s pickles — ADR-EC-014's core, and
 * the whole of PARSE-02.
 *
 * The one non-obvious rule, and the reason this module is small: **the AST walk exists ONLY to
 * recover what a pickle structurally cannot carry.** That list is finite and closed — step
 * keyword, step `keywordType`, step origin, step line, Rule membership, the un-interpolated
 * Scenario name, and the Examples column names. Everything a pickle DOES carry is read off the
 * pickle: placeholder substitution, tag inheritance and Background stacking all come from
 * `compile()`, and re-deriving any of them here is forbidden by ADR-EC-014 and by
 * ARCHITECTURE.md's Anti-Pattern 1. A second implementation of `interpolate()` does not merely
 * duplicate work; it drifts from Cucumber semantics silently, in a direction no test in this
 * repo would notice.
 *
 * Two further decisions are recorded here because neither is visible from the code.
 *
 * (a) Step origin comes from the `byStepId` index, never from how many entries a pickle step's
 *     `astNodeIds` holds. That heuristic is verified wrong exactly half the time: inside an
 *     *Outline* pickle a Background step has one id and a Scenario step has two, so it appears
 *     to work; inside a *plain Scenario* pickle both have exactly one and it carries no signal
 *     at all. The index is built anyway, because keyword and line recovery need it.
 *
 * (b) `Scenario Outline` detection goes through `@cucumber/gherkin`'s `dialects` record rather
 *     than an English keyword list, which is what makes the downstream F3/F4 checks exact in
 *     all 80 languages. No `RegExp` is constructed anywhere in this module: keyword matching is
 *     `Array.includes` against a package-provided table, so no feature-file content ever
 *     reaches a regular-expression compiler (threat T-02-01).
 *
 * This module performs NO validation. Every silently-zero and silently-wrong case is detected
 * in `Validate.ts`, over the correlated result. That separation is what lets a failing fixture
 * tell you whether correlation or validation broke; inlining the checks here destroys the
 * signal. Its only local imports are `./Model.ts` and `./Errors.ts` — importing `./index.ts`
 * would be both an `import/no-cycle` violation and an `effect/no-import-from-barrel-package`
 * error.
 */
import { type Dialect, dialects } from "@cucumber/gherkin"
import type { Feature, GherkinDocument, Location, Pickle, Scenario, Step, Tag } from "@cucumber/messages"
import { LoadFeatureError } from "./Errors.ts"
import type { ParsedFeatureCore, StepOwner } from "./Model.ts"

/**
 * One AST step, indexed by its own node id, carrying everything the matching `PickleStep`
 * lacks.
 *
 * `step` is held whole rather than destructured: `.keyword`, `.keywordType`, `.location` and
 * `.text` are all read from it downstream, and `Validate.ts` needs `.text` un-interpolated.
 */
export interface AstStepInfo {
  readonly step: Step
  readonly owner: StepOwner
  readonly ruleId: string | undefined
}

/**
 * One AST `Scenario` node — the Outline itself, not one of its rows.
 */
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
  /**
   * One inner array per `Examples:` block, holding that block's header cell values in source
   * order **including duplicates**. Duplicates must survive: the F11 check is "the same value
   * appears twice in one `tableHeader.cells`", which a `Set` would erase.
   */
  readonly examplesHeaders: ReadonlyArray<ReadonlyArray<string>>
}

/**
 * One AST `Rule:` node and the ids of the Scenarios written inside it, in document order.
 */
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

/**
 * Everything one AST walk plus one pass over the pickle array produces.
 */
export interface AstIndex {
  /** AST step id to its recovered keyword, origin and enclosing Rule. */
  readonly byStepId: ReadonlyMap<string, AstStepInfo>
  /**
   * AST scenario id to the pickles compiled from it. An **array**, because every Examples row
   * of one Outline shares `astNodeIds[0]`. A missing key is a legal state, not a defect.
   */
  readonly byScenarioId: ReadonlyMap<string, ReadonlyArray<Pickle>>
  /**
   * AST scenario id to the union of that Outline's Examples header column names. This is what
   * makes the leftover-placeholder scan exact rather than heuristic: a `<name>` is only a
   * finding when `name` is one of THIS Outline's own columns.
   */
  readonly exampleColumns: ReadonlyMap<string, ReadonlySet<string>>
  /** Every AST Scenario node, flat, in document order, Rule members included in place. */
  readonly astScenarios: ReadonlyArray<AstScenarioInfo>
  readonly astRules: ReadonlyArray<AstRuleInfo>
  /** `feature.language`, the key `isOutlineKeyword` and `isScenarioKeyword` are given. */
  readonly language: string
}

/**
 * The correlated feature and the index it was built from. `Validate.ts` needs both: the core to
 * iterate, and the index to explain WHY a Scenario produced no pickles.
 */
export interface CorrelationResult {
  readonly feature: ParsedFeatureCore
  readonly index: AstIndex
}

const tagNames = (tags: ReadonlyArray<Tag>): ReadonlyArray<string> => tags.map((tag) => tag.name)

/**
 * Look up a dialect, narrowing the `Dialect | undefined` that `noUncheckedIndexedAccess` gives
 * for a string index into a package-provided record.
 *
 * An unknown language returns `undefined` and every caller answers `false` rather than throwing
 * or reading through to a prototype property (threat T-02-12). In practice an unrecognised
 * `# language:` header has already been rejected as `UnknownDialect` by `Parser.ts` long before
 * this point, so this branch is unreachable through `loadFeature` — it exists because the
 * helpers are exported and callable on their own.
 */
const dialectOf = (language: string): Dialect | undefined => dialects[language]

/**
 * Whether `keyword` is a Scenario Outline keyword in `language`.
 *
 * Verified: `dialects.en.scenarioOutline` is `["Scenario Outline", "Scenario Template"]` and
 * `dialects.fr.scenarioOutline` is `["Plan du scénario", "Plan du Scénario"]`. `compile()`
 * branches on `examples.length` and never on the keyword, which is exactly why F3 and F4 are
 * silent and why this lookup is the only exact way to tell an Outline from a Scenario.
 */
export const isOutlineKeyword = (language: string, keyword: string): boolean => {
  const dialect = dialectOf(language)
  return dialect === undefined ? false : dialect.scenarioOutline.includes(keyword.trim())
}

/**
 * Whether `keyword` is a plain Scenario keyword in `language`.
 *
 * Verified: `dialects.en.scenario` is `["Example", "Scenario"]`.
 */
export const isScenarioKeyword = (language: string, keyword: string): boolean => {
  const dialect = dialectOf(language)
  return dialect === undefined ? false : dialect.scenario.includes(keyword.trim())
}

/**
 * Narrow `document.feature`, which is `undefined` — not `null` — for a comment-only or empty
 * file. `Parser.ts` has already rejected that case; this repeats the guard because the type
 * says it can happen and a silent `!` would be a lie.
 */
const featureOf = (document: GherkinDocument, uri: string): Feature => {
  const feature = document.feature
  if (feature === undefined) {
    throw new LoadFeatureError({
      reason: "NoFeature",
      uri,
      message: `${uri} cannot be correlated: the parsed document declares no Feature:.`
    })
  }
  return feature
}

/**
 * One inner array per Examples block, duplicates preserved. A block with no header row at all
 * (F1) contributes an empty array, which keeps `examplesHeaders.length` equal to
 * `examplesCount` for every Scenario.
 */
const examplesHeadersOf = (scenario: Scenario): ReadonlyArray<ReadonlyArray<string>> =>
  scenario.examples.map((block) =>
    block.tableHeader === undefined ? [] : block.tableHeader.cells.map((cell) => cell.value)
  )

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

/**
 * The mutable half of the walk, threaded through so the whole traversal stays one pass.
 */
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
    examplesHeaders: headers
  })
}

/**
 * Index the pickle array by the AST scenario id each pickle was compiled from.
 *
 * Built from the PICKLES, not from the AST: an AST scenario that compiled to nothing simply has
 * no key here, and that absence is the only available evidence of F1/F2.
 *
 * `pickle.astNodeIds[0]` is `string | undefined` under `noUncheckedIndexedAccess`, so the guard
 * below is mandatory rather than defensive style — it matches cucumber-js's own idiom, since
 * `astNodeIds` legitimately holds ids absent from any given map.
 */
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

/**
 * Walk `document` once and index `pickles` once.
 *
 * The walk descends `feature.children` and, for a `Rule`, its `rule.children`, recording every
 * Background step with the owner its container implies and every Scenario step as `"scenario"`.
 * Scenarios are appended in document order with Rule members in place, so `astScenarios` is
 * directly iterable as the feature's reading order.
 */
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

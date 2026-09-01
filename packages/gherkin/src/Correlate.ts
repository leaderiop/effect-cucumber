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
 * signal. Its only local imports are `./Model.ts`, `./Errors.ts` and `./StepArguments.ts` —
 * importing `./index.ts` would be both an `import/no-cycle` violation and an
 * `effect/no-import-from-barrel-package` error.
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
  /**
   * One entry per `Examples:` block, in source order — that block's own `tableBody.length`.
   *
   * `[VERIFIED]` against `@cucumber/gherkin@42.0.1`: `compile()` contributes exactly one pickle
   * per body row of a block and zero for a block whose `tableBody` is empty, whether because the
   * block has no header row at all (F1) or a header row with no body rows (F2) — and it does this
   * per block, independently of any sibling block on the same Outline. That makes a zero here the
   * exact, per-block F1/F2 signature, readable straight off the AST with no need to cross-reference
   * `Pickle.astNodeIds` at all: `byScenarioId` (this index's own pickle map) only ever keys on
   * `astNodeIds[0]`, the shared Outline id, so it cannot distinguish which block a produced pickle
   * came from and is the wrong tool for this specific question. `examplesHeaders.length ===
   * examplesRowCounts.length === examplesCount` always holds.
   */
  readonly examplesRowCounts: ReadonlyArray<number>
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

/**
 * Structurally typed on `{ name }` alone so one helper serves both an AST `Tag` (which also
 * carries `location` and `id`) and a `PickleTag` (which carries `name` and `astNodeId`). The
 * two are unrelated nominal shapes upstream and share no common supertype.
 */
const tagNames = (tags: ReadonlyArray<{ readonly name: string }>): ReadonlyArray<string> => tags.map((tag) => tag.name)

/**
 * Look up a dialect, narrowing the `Dialect | undefined` that `noUncheckedIndexedAccess` gives
 * for a string index into a package-provided record.
 *
 * An unknown language returns `undefined` and every caller answers `false` rather than throwing.
 * The lookup is `Object.hasOwn`, not a bare index: `dialects` is a plain object, so a bare index
 * on `"constructor"` or `"toString"` reads through to `Object.prototype` and returns a function
 * where a `Dialect` is expected (audit finding F-31). In practice an unrecognised
 * `# language:` header has already been rejected as `UnknownDialect` by `Parser.ts` long before
 * this point, so this branch is unreachable through `loadFeature` — it exists because the
 * helpers are exported and callable on their own.
 */
const dialectOf = (language: string): Dialect | undefined =>
  Object.hasOwn(dialects, language) ? dialects[language] : undefined

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
 * Every step keyword of `language`, trimmed, with the wildcard `*` left out.
 *
 * Upstream stores each keyword with its trailing space (`"Given "`) and lists `"* "` under all
 * five kinds. `Validate.ts`'s swallowed-step heuristic compares description lines against these
 * by name, so `*` — which is also a bullet in ordinary prose — would only add false positives.
 */
export const stepKeywords = (language: string): ReadonlyArray<string> => {
  const dialect = dialectOf(language)
  if (dialect === undefined) return []
  const all = [...dialect.given, ...dialect.when, ...dialect.then, ...dialect.and, ...dialect.but]
  return [...new Set(all.map((keyword) => keyword.trim()).filter((keyword) => keyword !== "*"))]
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
      line: Option.none(),
      message: `${uri} cannot be correlated: the parsed document declares no Feature:.`,
      cause: Option.none()
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

/**
 * One entry per Examples block, in source order — that block's `tableBody.length`. See
 * `AstScenarioInfo.examplesRowCounts`'s own doc comment for why this is the exact, purely
 * AST-level per-block F1/F2 signature.
 */
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
    examplesHeaders: headers,
    examplesRowCounts: examplesRowCountsOf(scenario)
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

/**
 * Join one `PickleStep` with its AST node.
 *
 * The pickle supplies what only `compile()` knows — the substituted `text` and the raw
 * `argument`. The AST node supplies what only the document knows: the keyword, its
 * `keywordType`, the origin, and the line.
 *
 * Three of those four deserve a note:
 *
 * - `keyword` is trimmed here because the raw AST value carries a TRAILING SPACE (`"Given "`,
 *   `"And "`, `"* "`).
 * - `keywordType` is taken from the AST, never from the pickle step's own coarser field. The
 *   pickle's version has no `Conjunction` member, so `And b` after `Given a` reports `Context`
 *   and `But d` after `When c` reports `Action` — verified, and silently wrong. It is optional
 *   on the AST node, so an absent value normalises to `Unknown` rather than being asserted away.
 * - `line` exists nowhere on a `PickleStep`; the AST location is the only source.
 *
 * The pickle's raw `argument` is ALSO wrapped here, once, into `stepArguments` — this is the
 * package's only construction site for a `DataTable`, which is what guarantees that a consumer
 * never builds one and that every wrapper carries this step's own `uri` and line for the error
 * messages it will raise later.
 *
 * A missed lookup throws rather than defaulting (threat T-02-13): a pickle step referencing an
 * AST node no walk produced means parse and compile disagree about the same document, and a
 * fabricated keyword or origin would bury that. Per the package's full-content policy the step
 * text is quoted verbatim (threat T-02-02, accepted).
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
        + `been given the same id generator and the same document.`,
      cause: Option.none()
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
 * Correlate a parsed document with its pickles into a `ParsedFeatureCore`.
 *
 * `uri` is the caller's, always: `GherkinDocument.uri` is `undefined` when parsing from a
 * string, so the document can never be the source of this value.
 *
 * An AST Scenario with no entry in `byScenarioId` contributes no `ParsedScenario` and is NOT an
 * error here. That absence is a legal intermediate state and the only evidence `Validate.ts`
 * has for the Examples blocks that compiled to nothing, so swallowing or throwing on it would
 * destroy the finding rather than report it.
 *
 * Nothing below re-derives what `compile()` already did. `tags` is `pickle.tags` mapped to
 * names, in the order `compile()` flattened them, never sorted, deduplicated or recomputed from
 * the AST. `steps` is `pickle.steps` in order, never re-stacked. `location` is `pickle.location`,
 * which is already per-Examples-row precise for an Outline — looking the row node up in a
 * separate map would be dead code.
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
        // `Pickle.location` is declared optional by @cucumber/messages even though `compile()`
        // always sets it, and `ParsedScenario.location` is not. The AST Scenario's own location
        // is the correct fallback because that is exactly what `compile()` copies for a plain
        // Scenario; for an Outline the pickle's value — the Examples BODY ROW — wins, which is
        // the whole point of reading it from the pickle.
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

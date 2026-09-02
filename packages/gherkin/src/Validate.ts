/**
 * Validation of the correlated feature (BEH-EC-014): the checks that need an AST node AND the pickles it produced,
 * run as a separate pass after `Correlate.ts` so a failing fixture says which of the two broke.
 *
 * `@cucumber/gherkin`'s `compile()` produces runnable pickles, not authoring errors: an Outline without Examples,
 * a plain Scenario with Examples, an empty Examples block and a zero-step Scenario all compile in silence
 * (`test/upstream-pin.test.ts` pins each). Every such case gets its own reason tag here (ADR-EC-019).
 *
 * Throws the FIRST error in document order, deterministically; heuristic findings (group C) are returned as
 * warnings, never thrown. A feature-level `Background:` after a `Rule:` needs no check: the grammar rejects it
 * and `Parser.ts` reports `ParseFailed` (`parse-failed-background-after-rule.feature`).
 *
 * `PLACEHOLDER` below is a fixed literal matched against content, never a pattern compiled from it.
 * Imports never reach `./index.ts` (cycle).
 */
import * as Arr from "effect/Array"
import * as Option from "effect/Option"
import {
  type AstRuleInfo,
  type AstScenarioInfo,
  type AstStepInfo,
  type CorrelationResult,
  isOutlineKeyword,
  isScenarioKeyword,
  stepKeywords
} from "./Correlate.ts"
import { LoadFeatureError, type LoadFeatureWarning, makeWarning } from "./Errors.ts"
import type { GherkinDocument, Pickle, PickleStep } from "./Model.ts"

/** Every message is `uri:line: <reason>: what happened, then what to do` — it may be the only thing a
 * collection-time failure shows the author. */
const at = (uri: string, line: number): string => `${uri}:${line}: `

/**
 * A block the way its author would recognise it: localised keyword plus quoted name. A `Background:` or an
 * unnamed `Rule:` legitimately has an empty name, so the keyword then stands alone.
 */
const describeBlock = (keyword: string, name: string): string =>
  name === "" ? `${keyword}:` : `${keyword}: ${JSON.stringify(name)}`

/**
 * `describeBlock` for an AST Scenario node.
 */
const describeNode = (node: AstScenarioInfo): string => describeBlock(node.keyword, node.name)

/** F3: an Outline keyword with no Examples block compiles upstream to ONE pickle keeping its literal
 * placeholders (`test/upstream-pin.test.ts`). */
const outlineWithoutExamples = (uri: string, node: AstScenarioInfo): LoadFeatureError =>
  new LoadFeatureError({
    reason: "OutlineWithoutExamples",
    uri,
    line: Option.some(node.location.line),
    message: `${at(uri, node.location.line)}OutlineWithoutExamples: ${describeNode(node)} is declared with an `
      + `Outline keyword but has no Examples: block. It still compiles — to a single scenario whose step text `
      + `keeps its literal <placeholders> un-substituted — so it runs and passes instead of failing. Add an `
      + `Examples: table with a header row and at least one body row, or change the keyword to a plain scenario.`
  })

/**
 * F1/F2: one Examples block that yielded no pickles. Detected PER BLOCK through `examplesRowCounts`, not through
 * `produced.length === 0`, which is zero only when every block is empty — an Outline with one populated and one
 * empty block compiled clean before this check (`test/upstream-pin.test.ts`).
 */
const emptyExamples = (
  uri: string,
  node: AstScenarioInfo,
  blockIndex: number,
  blockCount: number,
  line: number
): LoadFeatureError => {
  const which = blockCount === 1 ? "Its Examples: block" : `Its Examples: block ${blockIndex + 1} of ${blockCount}`
  const others = blockCount === 1
    ? ""
    : " — even though this Outline's other Examples: block(s) compile normally, so this file still passes overall"
  return new LoadFeatureError({
    reason: "EmptyExamples",
    uri,
    line: Option.some(line),
    message: `${at(uri, line)}EmptyExamples: ${describeNode(node)}: ${which} compiled to zero scenarios, so it `
      + `never runs and no test reports it as missing${others}. An Examples: block with no header row, or a `
      + `header row with no body rows, produces no scenarios and no error. Give every Examples: block a header `
      + `row and at least one body row, or delete the empty block.`
  })
}

/** F4: `compile()` branches on `examples.length`, never on the keyword, so a plain Scenario carrying an Examples
 * table compiles as an Outline (`test/upstream-pin.test.ts`); the keyword check goes through the dialect table
 * so it is exact in every language. */
const scenarioKeywordWithExamples = (uri: string, node: AstScenarioInfo): LoadFeatureError =>
  new LoadFeatureError({
    reason: "ScenarioKeywordWithExamples",
    uri,
    line: Option.some(node.location.line),
    message: `${at(uri, node.location.line)}ScenarioKeywordWithExamples: ${describeNode(node)} uses a plain `
      + `scenario keyword but carries ${node.examplesCount} Examples: block(s). The compiler branches on the `
      + `presence of Examples: and never on the keyword, so this silently compiles as an Outline, one scenario `
      + `per body row. Change the keyword to the Outline form for this language, or remove the Examples: table.`
  })

/**
 * F5/F6: a zero-step Scenario compiles to a pickle with no steps and drops its Background steps too
 * (`test/upstream-pin.test.ts`). The description is quoted IN FULL: a step keyword misspelled before any valid
 * step is absorbed into the description, so that is where the missing step went. No truncation, by policy.
 */
const zeroStepScenario = (uri: string, node: AstScenarioInfo, line: number): LoadFeatureError => {
  const base = `${at(uri, line)}ZeroStepScenario: ${describeNode(node)} has no steps. It compiles to a `
    + `scenario with an empty step list — and any Background steps in scope are dropped with it — so it `
    + `passes without asserting anything. Add at least one step, or delete the scenario.`
  const description = node.description.trim()
  if (description === "") {
    return new LoadFeatureError({
      reason: "ZeroStepScenario",
      uri,
      line: Option.some(line),
      message: base
    })
  }
  return new LoadFeatureError({
    reason: "ZeroStepScenario",
    uri,
    line: Option.some(line),
    message: `${base}\n\nThis scenario has a description. A mistyped step keyword written before any valid `
      + `step is silently absorbed into the description instead of being reported, so if you meant to write a `
      + `step here, it is in the text below — check it for a misspelled keyword:\n${node.description}`
  })
}

/** The pickle's own line where it has one (an Outline row), the AST node's otherwise. */
const pickleLineOf = (pickle: Pickle, node: AstScenarioInfo): number => pickle.location?.line ?? node.location.line

/**
 * Uniqueness key: `(scope, un-interpolated name)`, scope being the enclosing Rule id or a sentinel. Keyed on the
 * AST name, never a compiled one — an Outline's rows legitimately repeat names (`outline-identical-row-names`).
 */
const uniquenessKey = (node: AstScenarioInfo): string => `${node.ruleId ?? "<feature>"}\u0000${node.name}`

/**
 * F22: two Scenarios sharing one un-interpolated name inside one scope — REJECTED (not warned, not renamed),
 * because the runner matches Scenarios to their registrations by that name. Uniqueness is PER SCOPE: two Rules
 * may each hold a `Scenario: happy path` (`duplicate-scenario-name-across-rules.feature` pins that as legal).
 */
const duplicateScenarioName = (
  uri: string,
  node: AstScenarioInfo,
  first: AstScenarioInfo,
  scope: string
): LoadFeatureError => {
  const line = node.location.line
  return new LoadFeatureError({
    reason: "DuplicateScenarioName",
    uri,
    line: Option.some(line),
    message: `${at(uri, line)}DuplicateScenarioName: ${scope} contains two scenarios named `
      + `${JSON.stringify(node.name)} — the first on line ${first.location.line}, this one on line ${line}. `
      + `Scenario names are how a scenario is matched to its registered step definitions, so a repeated name `
      + `is ambiguous with no correct runtime resolution. Rename one of them. Names only have to be unique `
      + `within a scope: two different Rule: blocks may each contain a scenario of the same name.`
  })
}

/**
 * How to name a scope in an error message: the enclosing `Rule:`, or the Feature itself.
 */
const scopeLabel = (
  ruleId: string | undefined,
  ruleNames: ReadonlyMap<string, string>
): string => {
  if (ruleId === undefined) {
    return "the Feature"
  }
  const name = ruleNames.get(ruleId)
  return name === undefined || name === "" ? "a Rule:" : `Rule: ${JSON.stringify(name)}`
}

/**
 * The one regular expression in this module: a fixed literal matched AGAINST feature-file content, never a
 * pattern compiled FROM it, with a character class that excludes both brackets so it cannot backtrack. The `g`
 * flag is what `matchAll` requires; `matchAll` clones, so one shared instance is safe at every call site.
 */
const PLACEHOLDER = /<([^<>]+)>/g

/** Where a leftover token was found; the strings reach the message verbatim. */
type PlaceholderSite = "the step text" | "a DataTable cell" | "the DocString"

/** One `<token>` found in one place; `content` is the WHOLE cell or DocString, quoted unredacted by policy. */
interface Leftover {
  readonly name: string
  readonly step: PickleStep
  readonly site: PlaceholderSite
  readonly content: string
}

/**
 * Every `<token>` in one pickle, from all three places one can survive: under an Outline a Background step's
 * DataTable cells and DocString keep their placeholders (`test/upstream-pin.test.ts`). A step may carry both
 * argument shapes, so both are scanned rather than one `if`/`else`.
 */
const scanPlaceholders = (pickle: Pickle): ReadonlyArray<Leftover> => {
  const found: Array<Leftover> = []
  const check = (step: PickleStep, site: PlaceholderSite, content: string): void => {
    for (const match of content.matchAll(PLACEHOLDER)) {
      const name = match[1]
      if (name !== undefined) {
        found.push({ name, step, site, content })
      }
    }
  }
  for (const step of pickle.steps) {
    check(step, "the step text", step.text)
    const docString = step.argument?.docString
    if (docString !== undefined) {
      check(step, "the DocString", docString.content)
    }
    const dataTable = step.argument?.dataTable
    if (dataTable !== undefined) {
      for (const row of dataTable.rows) {
        for (const cell of row.cells) {
          check(step, "a DataTable cell", cell.value)
        }
      }
    }
  }
  return found
}

/** The AST step behind a pickle step — the only source of a line. Unreachable `undefined` still falls back to
 * the Scenario's line: an error path is the worst place for a second failure. */
const astStepOf = (step: PickleStep, byStepId: ReadonlyMap<string, AstStepInfo>): AstStepInfo | undefined => {
  const id = step.astNodeIds[0]
  return id === undefined ? undefined : byStepId.get(id)
}

const isBackgroundStep = (info: AstStepInfo | undefined): boolean =>
  info !== undefined && (info.owner === "feature-background" || info.owner === "rule-background")

/** ADR-EC-014's wording, verbatim and asserted: `compile()` never interpolates Background steps under an Outline
 * (`test/upstream-pin.test.ts`). */
const BACKGROUND_LIMITATION = "Background step text still contains an unsubstituted placeholder — this is a "
  + "known `@cucumber/gherkin` limitation for Backgrounds nested under a Scenario Outline, not a bug in "
  + "your Background text."

/**
 * F7/F8, check alpha: a leftover `<token>` naming one of THIS Outline's own Examples columns is an ERROR — the
 * author wrote a column name, so a substitution was meant. Content is quoted in full, by policy.
 */
const uninterpolatedPlaceholder = (
  uri: string,
  node: AstScenarioInfo,
  leftover: Leftover,
  info: AstStepInfo | undefined
): LoadFeatureError => {
  const line = info?.step.location.line ?? node.location.line
  const explanation = isBackgroundStep(info)
    ? BACKGROUND_LIMITATION
    : "A placeholder that survives substitution can never match a step definition, so it surfaces "
      + "downstream as an unmatched step quoting text nobody wrote."
  return new LoadFeatureError({
    reason: "UninterpolatedPlaceholder",
    uri,
    line: Option.some(line),
    message: `${at(uri, line)}UninterpolatedPlaceholder: <${leftover.name}> is an Examples column of `
      + `${describeNode(node)}, but it is still present, un-substituted, in ${leftover.site} of the step on `
      + `line ${line}. ${explanation} That text reads, in full:\n${leftover.content}`
  })
}

// Group C: heuristic findings. Each admits an innocent reading, so all four are WARNINGS accumulated on the
// returned array and never thrown; `validateFeature` returns them and neither prints nor logs.

/**
 * F9, check beta: a leftover `<token>` that is NOT one of this Outline's columns. The message names the columns
 * that do exist. Upstream drops the last Examples column in silence when both header and body rows lack their
 * trailing `|` (`test/upstream-pin.test.ts`).
 */
const unknownPlaceholder = (
  uri: string,
  node: AstScenarioInfo,
  leftover: Leftover,
  info: AstStepInfo | undefined,
  columns: ReadonlySet<string>
): LoadFeatureWarning => {
  const line = info?.step.location.line ?? node.location.line
  return makeWarning({
    reason: "UnknownPlaceholder",
    uri,
    line,
    message: `${at(uri, line)}UnknownPlaceholder: <${leftover.name}> is not one of the Examples columns of `
      + `${describeNode(node)}, which declares: ${Array.from(columns).join(", ")}. It was found in `
      + `${leftover.site} of the step on line ${line}, un-substituted. The usual cause is an Examples row `
      + `missing its trailing "|" on both the header and the body rows: the cell counts stay consistent, the `
      + `last column is dropped with no error, and the placeholder survives as literal text. This is a warning `
      + `rather than an error because legitimate angle-bracket text written inside an Outline reaches the same `
      + `check. That text reads, in full:\n${leftover.content}`
  })
}

/** F11: a column name written twice; upstream lets the first win for both occurrences
 * (`test/upstream-pin.test.ts`). */
const duplicateExamplesColumn = (
  uri: string,
  node: AstScenarioInfo,
  column: string,
  line: number
): LoadFeatureWarning =>
  makeWarning({
    reason: "DuplicateExamplesColumn",
    uri,
    line,
    message: `${at(uri, line)}DuplicateExamplesColumn: an Examples: block of ${describeNode(node)} declares the `
      + `column ${JSON.stringify(column)} more than once. The first column wins for every occurrence of `
      + `<${column}>, so the later column's values are unreachable and no error is raised. Rename one of the `
      + `two columns.`
  })

/** F13: a `Rule:` with no Scenarios contributes zero pickles in silence (`test/upstream-pin.test.ts`). */
const emptyRule = (uri: string, rule: AstRuleInfo): LoadFeatureWarning => {
  const line = rule.location.line
  return makeWarning({
    reason: "EmptyRule",
    uri,
    line,
    message: `${at(uri, line)}EmptyRule: ${describeBlock(rule.keyword, rule.name)} contains no scenarios, so it `
      + `compiles to nothing and no test reports it as missing. Add a scenario to it, or delete it.`
  })
}

/**
 * Damerau–Levenshtein distance with adjacent transpositions, for two short strings. Only ever
 * called on a description line's leading token against a dialect keyword, so the quadratic table
 * is a few dozen cells.
 */
const editDistance = (left: string, right: string): number => {
  const rows = left.length + 1
  const cols = right.length + 1
  const table: Array<Array<number>> = Array.from({ length: rows }, () => Array.from({ length: cols }, () => 0))
  for (let i = 0; i < rows; i++) table[i]![0] = i
  for (let j = 0; j < cols; j++) table[0]![j] = j
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1
      let best = Math.min(table[i - 1]![j]! + 1, table[i]![j - 1]! + 1, table[i - 1]![j - 1]! + cost)
      if (i > 1 && j > 1 && left[i - 1] === right[j - 2] && left[i - 2] === right[j - 1]) {
        best = Math.min(best, table[i - 2]![j - 2]! + 1)
      }
      table[i]![j] = best
    }
  }
  return table[rows - 1]![cols - 1]!
}

/**
 * The dialect keyword a description line most plausibly meant to be, or `undefined` for prose.
 *
 * A line qualifies when its leading text is a step keyword written in the wrong case (`given x`),
 * or is within a small edit distance of one (`Ginve x`, `Whne x`): one edit for short keywords,
 * two for keywords of five characters or more. Multi-word keywords (`Étant donné que`) are
 * compared against the same number of leading words. Anything else is treated as the prose it
 * almost certainly is.
 */
const nearMissKeyword = (line: string, keywords: ReadonlyArray<string>): string | undefined => {
  const words = line.trim().split(/\s+/)
  for (const keyword of keywords) {
    const keywordWords = keyword.split(/\s+/)
    if (words.length < keywordWords.length) continue
    const head = words.slice(0, keywordWords.length).join(" ")
    if (head.length < 3) continue
    if (head.toLowerCase() === keyword.toLowerCase()) return keyword
    const budget = keyword.length >= 5 ? 2 : 1
    if (editDistance(head.toLowerCase(), keyword.toLowerCase()) <= budget) return keyword
  }
  return undefined
}

/**
 * F14: a description line that reads like a misspelled step keyword. A keyword misspelled BEFORE any valid step
 * is absorbed into the description with no report from any layer (`test/upstream-pin.test.ts`). Only near-miss
 * lines warn, each quoted with the keyword it resembles; plain prose never does (`test/Validate.test.ts`).
 */
const suspectedSwallowedStep = (
  uri: string,
  label: string,
  description: string,
  line: number,
  keywords: ReadonlyArray<string>
): Option.Option<LoadFeatureWarning> => {
  const suspects = description
    .split("\n")
    .map((text) => ({ text, keyword: nearMissKeyword(text, keywords) }))
    .filter((entry): entry is { text: string; keyword: string } => entry.keyword !== undefined)
  if (suspects.length === 0) return Option.none()
  const quoted = suspects.map(({ keyword, text }) => `  ${text.trim()}    (reads like ${keyword})`).join("\n")
  return Option.some(makeWarning({
    reason: "SuspectedSwallowedStep",
    uri,
    line,
    message: `${at(uri, line)}SuspectedSwallowedStep: ${label} has a description in which `
      + `${suspects.length === 1 ? "a line begins" : `${suspects.length} lines begin`} with what looks like a `
      + `misspelled step keyword. A step keyword misspelled before any valid step is absorbed into the description `
      + `rather than reported, so a step written there does not exist at any layer and nothing fails. `
      + `A description is legal Gherkin, so this is a heuristic: if the text is prose, ignore this.\n${quoted}`
  }))
}

/** Header values appearing more than once, each once, in source order — over the duplicate-preserving array. */
const duplicatedColumns = (header: ReadonlyArray<string>): ReadonlyArray<string> => {
  const seen = new Set<string>()
  const duplicated = new Set<string>()
  for (const value of header) {
    if (seen.has(value)) {
      duplicated.add(value)
    }
    seen.add(value)
  }
  return [...duplicated]
}

/**
 * One `Background:` node, reduced to what the F14 heuristic needs.
 */
interface BackgroundInfo {
  readonly keyword: string
  readonly name: string
  readonly description: string
  readonly line: number
}

/** The two details the warnings need that `AstIndex` does not carry, read in one pass over the document. */
interface AstDetail {
  /** Every `Background:`, at feature level and inside a `Rule:`, in document order. */
  readonly backgrounds: ReadonlyArray<BackgroundInfo>
  /** AST scenario id to the source line of each of its `Examples:` blocks, in source order. */
  readonly examplesLines: ReadonlyMap<string, ReadonlyArray<number>>
}

const astDetailOf = (document: GherkinDocument): AstDetail => {
  const backgrounds: Array<BackgroundInfo> = []
  const examplesLines = new Map<string, ReadonlyArray<number>>()
  const feature = document.feature
  if (feature !== undefined) {
    // A `Rule:` is Gherkin's only nesting level; the guard above is unreachable through `loadFeature`.
    const children = feature.children.flatMap((child) => child.rule === undefined ? [child] : child.rule.children)
    for (const child of children) {
      const background = child.background
      if (background !== undefined) {
        backgrounds.push({
          keyword: background.keyword.trim(),
          name: background.name,
          description: background.description,
          line: background.location.line
        })
      }
      const scenario = child.scenario
      if (scenario !== undefined) {
        examplesLines.set(scenario.id, scenario.examples.map((block) => block.location.line))
      }
    }
  }
  return { backgrounds, examplesLines }
}

/**
 * Validate one correlated feature.
 *
 * Throws a `LoadFeatureError` on the first problem in document order; returns the accumulated
 * non-fatal findings otherwise.
 */
export const validateFeature = (result: CorrelationResult): ReadonlyArray<LoadFeatureWarning> => {
  const { feature, index } = result
  const uri = feature.uri
  const keywords = stepKeywords(index.language)
  const ruleNames = new Map(index.astRules.map((rule) => [rule.id, rule.name]))
  /** Populated in document order, so the retained entry is always the FIRST occurrence. */
  const seenByScope = new Map<string, AstScenarioInfo>()
  const detail = astDetailOf(feature.document)

  // Structural checks AND check alpha run in ONE loop, one node at a time, so the first error in DOCUMENT order
  // wins — two passes would let every finding of the first outrank every finding of the second. Beta (F9) is the
  // one non-throwing finding produced here, collected locally.
  const unknownPlaceholderWarnings: Array<LoadFeatureWarning> = []

  for (const node of index.astScenarios) {
    const produced = index.byScenarioId.get(node.id) ?? []
    const isOutline = isOutlineKeyword(index.language, node.keyword)

    if (isOutline && node.examplesCount === 0) {
      throw outlineWithoutExamples(uri, node)
    }

    // Per BLOCK: `findIndex`, not `some`, so the FIRST empty block in source order is the one named.
    const emptyBlockIndex = isOutline ? node.examplesRowCounts.findIndex((count) => count === 0) : -1
    if (emptyBlockIndex !== -1) {
      const blockLine = detail.examplesLines.get(node.id)?.[emptyBlockIndex] ?? node.location.line
      throw emptyExamples(uri, node, emptyBlockIndex, node.examplesCount, blockLine)
    } else if (!isOutline && node.examplesCount > 0 && isScenarioKeyword(index.language, node.keyword)) {
      // Positively a plain-scenario keyword, not merely "not an Outline keyword": the error accuses the author.
      throw scenarioKeywordWithExamples(uri, node)
    }

    for (const pickle of produced) {
      if (pickle.steps.length === 0) {
        throw zeroStepScenario(uri, node, pickleLineOf(pickle, node))
      }
    }

    const key = uniquenessKey(node)
    const first = seenByScope.get(key)
    if (first === undefined) {
      seenByScope.set(key, node)
    } else {
      throw duplicateScenarioName(uri, node, first, scopeLabel(node.ruleId, ruleNames))
    }

    // Check alpha/beta. Two restrictions keep this exact: only Outline-correlated pickles are scanned (`2 < 3`,
    // `<div>` and `<a@b.com>` are valid text in a plain Scenario), and only a token naming one of THIS
    // Outline's columns is an error.
    const columns = index.exampleColumns.get(node.id)
    if (columns !== undefined && columns.size > 0 && isOutline) {
      for (const pickle of produced) {
        for (const leftover of scanPlaceholders(pickle)) {
          const info = astStepOf(leftover.step, index.byStepId)
          if (columns.has(leftover.name)) {
            throw uninterpolatedPlaceholder(uri, node, leftover, info)
          }
          unknownPlaceholderWarnings.push(unknownPlaceholder(uri, node, leftover, info, columns))
        }
      }
    }
  }

  // The remaining warnings: zero-or-one finding per element, `map` to `Option` then `getSomes`.

  const scenarioWarnings = Arr.flatMap(index.astScenarios, (node) => {
    const blockLines = detail.examplesLines.get(node.id) ?? []
    const columnWarnings = Arr.flatMap(
      [...node.examplesHeaders.entries()],
      ([blockIndex, header]) =>
        Arr.map(
          duplicatedColumns(header),
          (column) => duplicateExamplesColumn(uri, node, column, blockLines[blockIndex] ?? node.location.line)
        )
    )
    const swallowedStepWarning = Arr.getSomes([
      suspectedSwallowedStep(uri, describeNode(node), node.description, node.location.line, keywords)
    ])
    return [...columnWarnings, ...swallowedStepWarning]
  })

  const emptyRuleWarnings = Arr.getSomes(
    Arr.map(index.astRules, (rule) => rule.scenarioIds.length === 0 ? Option.some(emptyRule(uri, rule)) : Option.none())
  )

  const backgroundWarnings = Arr.getSomes(
    Arr.map(
      detail.backgrounds,
      (background) =>
        suspectedSwallowedStep(
          uri,
          describeBlock(background.keyword, background.name),
          background.description,
          background.line,
          keywords
        )
    )
  )

  // Document order; `sort` is stable, so two findings on one line keep discovery order.
  const warnings = [...unknownPlaceholderWarnings, ...scenarioWarnings, ...emptyRuleWarnings, ...backgroundWarnings]
  warnings.sort((left, right) => left.line - right.line)
  return warnings
}

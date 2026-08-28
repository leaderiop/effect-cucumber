/**
 * Reconciling the correlated result against what its author actually wrote — PARSE-03, and the
 * deliverable this whole phase exists for.
 *
 * **Why this is a separate pass, and not checks scattered through `Correlate.ts`'s walk.**
 * Several checks below need the *correlated* view — an AST node PLUS the pickle set it produced
 * — and nothing else can answer them: "this Outline compiled to zero scenarios" is only
 * expressible once both halves are in hand. Inlining them into the walk would make the walk both
 * build and judge, and a failing fixture could no longer tell you which of the two broke. The
 * fixture table is a 1:1 test table precisely because correlation and validation are separable.
 *
 * **Why any of this is needed at all.** `@cucumber/gherkin` does the right thing for its own
 * purpose — producing runnable pickles — and the wrong thing for ours, which is telling an author
 * their feature file is broken. `compile()` branches on `examples.length` and never on the
 * keyword, so a `Scenario Outline:` with no Examples and a plain `Scenario:` with an Examples
 * table both compile happily into something the author did not write. An `Examples:` block with
 * no body rows compiles to nothing at all, in silence. A zero-step Scenario compiles to a pickle
 * with an empty step list, taking its Background steps down with it, and then passes. Every one
 * of those is a false-green test (threat T-02-16); ADR-EC-019's "fail loudly" is applied here at
 * the parse layer, one distinct reason tag per failure mode.
 *
 * **Why it throws.** BEH-EC-001's signature is `(path: string) => ParsedFeature`, a plain value,
 * so a throw is the only in-signature failure mode. It throws on the FIRST error in document
 * order, deterministically, so a fixture can assert *which* error fired. Warnings — the Group C
 * findings, where detection is heuristic — are accumulated and returned instead, never thrown.
 *
 * **A check that is deliberately NOT implemented.** PITFALLS.md Pitfall 30 claims a feature-level
 * `Background:` written after a `Rule:` is permitted by Gherkin and silently changes semantics,
 * and recommends a walk-time check for it. That premise is false, and the refutation is
 * `[VERIFIED]`: Gherkin's grammar is `Feature := header Background? ScenarioDefinition* Rule*`,
 * and the parser throws `UnexpectedTokenException` on that input, which `Parser.ts` already wraps
 * as `ParseFailed` (fixture `parse-failed-background-after-rule.feature` pins it). The check
 * would be dead code guarding a case that cannot reach this module. Do not add it back
 * (threat T-02-17).
 *
 * No `RegExp` is constructed here. Every check is a structural comparison or a `Map` lookup, so
 * no feature-file content reaches a regular-expression compiler at this stage (threat T-02-01).
 *
 * Local imports are `./Correlate.ts`, `./Errors.ts` and `./Model.ts`. Never `./index.ts` — that
 * would be both an `import/no-cycle` violation and an `effect/no-import-from-barrel-package`
 * error.
 */
import { type AstScenarioInfo, type CorrelationResult, isOutlineKeyword, isScenarioKeyword } from "./Correlate.ts"
import { LoadFeatureError, type LoadFeatureWarning } from "./Errors.ts"
import type { Pickle } from "./Model.ts"

/**
 * Every message is shaped `uri:line: <reason>: <what happened, then what to do>`.
 *
 * Message quality is not cosmetic here. `loadFeature` is called at module top level, so a throw
 * from this module surfaces as a vitest COLLECTION error for the entire test file — the author
 * sees this string and no test names at all. It has to be self-contained.
 */
const at = (uri: string, line: number): string => `${uri}:${line}: `

/**
 * Name an AST Scenario node the way the author would recognise it: its localised keyword and its
 * un-interpolated name, quoted. `JSON.stringify` rather than hand-added quotes so a name
 * containing a quote character stays unambiguous.
 */
const describeNode = (node: AstScenarioInfo): string => `${node.keyword}: ${JSON.stringify(node.name)}`

/**
 * F3 — an Outline keyword with no `Examples:` block at all.
 *
 * `[VERIFIED]`: `compile()` sees `examples.length === 0`, takes the plain-Scenario branch, and
 * emits ONE pickle whose step text keeps its literal `<placeholders>`. The Scenario runs, with
 * un-substituted text, and nothing upstream complains. This path is distinct from F1/F2 — those
 * produce zero pickles — and it is not in PITFALLS.md.
 */
const outlineWithoutExamples = (uri: string, node: AstScenarioInfo): LoadFeatureError =>
  new LoadFeatureError({
    reason: "OutlineWithoutExamples",
    uri,
    line: node.location.line,
    message: `${at(uri, node.location.line)}OutlineWithoutExamples: ${describeNode(node)} is declared with an `
      + `Outline keyword but has no Examples: block. It still compiles — to a single scenario whose step text `
      + `keeps its literal <placeholders> un-substituted — so it runs and passes instead of failing. Add an `
      + `Examples: table with a header row and at least one body row, or change the keyword to a plain scenario.`
  })

/**
 * F1 and F2 — an Outline whose `Examples:` block yielded no pickles.
 *
 * `[VERIFIED]`: an `Examples:` with no header row at all (F1), or a header row with no body rows
 * (F2), produces ZERO pickles and no upstream error. The AST node is simply orphaned, which is
 * why `Correlate.ts` deliberately keeps a missing `byScenarioId` key as a legal state — that
 * absence is the only available evidence, and swallowing it would destroy the finding.
 */
const emptyExamples = (uri: string, node: AstScenarioInfo): LoadFeatureError =>
  new LoadFeatureError({
    reason: "EmptyExamples",
    uri,
    line: node.location.line,
    message: `${at(uri, node.location.line)}EmptyExamples: ${describeNode(node)} declares `
      + `${node.examplesCount} Examples: block(s) but compiled to zero scenarios, so it never runs and no test `
      + `reports it as missing. An Examples: block with no header row, or a header row with no body rows, `
      + `produces no scenarios and no error. Give every Examples: block a header row and at least one body row, `
      + `or delete the empty block.`
  })

/**
 * F4 — a plain Scenario keyword carrying an `Examples:` table.
 *
 * `[VERIFIED]`: `compile()` branches on `examples.length` and NEVER on the keyword, so this
 * silently compiles as an Outline and produces N scenarios the author did not declare. Detecting
 * it needs an exact keyword classification, which is why both `isOutlineKeyword` and
 * `isScenarioKeyword` go through `@cucumber/gherkin`'s own `dialects` table rather than an
 * English keyword list — the check is then exact in all 80 languages.
 */
const scenarioKeywordWithExamples = (uri: string, node: AstScenarioInfo): LoadFeatureError =>
  new LoadFeatureError({
    reason: "ScenarioKeywordWithExamples",
    uri,
    line: node.location.line,
    message: `${at(uri, node.location.line)}ScenarioKeywordWithExamples: ${describeNode(node)} uses a plain `
      + `scenario keyword but carries ${node.examplesCount} Examples: block(s). The compiler branches on the `
      + `presence of Examples: and never on the keyword, so this silently compiles as an Outline, one scenario `
      + `per body row. Change the keyword to the Outline form for this language, or remove the Examples: table.`
  })

/**
 * F5 and F6 — a Scenario with no steps, at feature level or inside a `Rule:`.
 *
 * `[VERIFIED]`: it compiles to one pickle with `steps: []`, AND the Background steps in scope are
 * dropped along with it, at both feature and Rule level. The result is a test that passes while
 * asserting nothing.
 *
 * The message quotes the AST node's `description` VERBATIM when it is non-empty. That is the
 * cheap, high-signal mitigation for Pitfall P7 / row F14: `[VERIFIED]`, a typo'd step keyword
 * written BEFORE any valid step is absorbed into `scenario.description` — the AST gets one fewer
 * step, the pickle gets one fewer step, and no layer reports anything. The same typo written
 * AFTER a valid step is a loud parse error, so the behavior is position-dependent and will not be
 * found by casual testing. When the swallowed step was the scenario's ONLY step, the result is
 * exactly this zero-step case, and the description is where the missing step went. Quoting it
 * turns the phase's most confusing failure into a self-explaining one.
 *
 * The description is reproduced in full, never truncated and never elided, per the package's
 * locked full-content policy. Threat T-02-02 (author-written text reaching CI logs unredacted) is
 * an explicitly ACCEPTED tradeoff, not an oversight. Do not add an ellipsis or a length cap.
 */
const zeroStepScenario = (uri: string, node: AstScenarioInfo, line: number): LoadFeatureError => {
  const base = `${at(uri, line)}ZeroStepScenario: ${describeNode(node)} has no steps. It compiles to a `
    + `scenario with an empty step list — and any Background steps in scope are dropped with it — so it `
    + `passes without asserting anything. Add at least one step, or delete the scenario.`
  const description = node.description.trim()
  if (description === "") {
    return new LoadFeatureError({ reason: "ZeroStepScenario", uri, line, message: base })
  }
  return new LoadFeatureError({
    reason: "ZeroStepScenario",
    uri,
    line,
    message: `${base}\n\nThis scenario has a description. A mistyped step keyword written before any valid `
      + `step is silently absorbed into the description instead of being reported, so if you meant to write a `
      + `step here, it is in the text below — check it for a misspelled keyword:\n${node.description}`
  })
}

/**
 * The pickle's own line where it has one, the AST node's otherwise.
 *
 * `Pickle.location` is declared optional by `@cucumber/messages` even though `compile()` always
 * sets it. For an Outline the pickle's value is the Examples BODY ROW, which is the more precise
 * answer and the one an author needs; falling back to the node's location keeps the error located
 * either way, and a located error is half of PARSE-03.
 */
const lineOf = (pickle: Pickle, node: AstScenarioInfo): number => pickle.location?.line ?? node.location.line

/**
 * The uniqueness key for the duplicate-name check: the pair `(scope, un-interpolated name)`.
 *
 * The scope half is the enclosing `Rule.id`, or the sentinel `<feature>` for a Scenario written
 * at feature level. `Rule` ids are generator-produced and contain no NUL, so a NUL separator makes
 * the encoding of the pair unambiguous for every possible Scenario name.
 *
 * The name half is the AST node's OWN un-interpolated name (`outline <name>`), never a compiled
 * scenario name. An Outline's rows legitimately produce many interpolated names from one node, so
 * comparing those would report false collisions on any Outline with repeating rows — fixture
 * `outline-identical-row-names.feature` pins exactly that shape as legal. Keying on the AST node
 * also makes double-counting impossible: an Outline appears once in `astScenarios` however many
 * pickles it yields.
 */
const uniquenessKey = (node: AstScenarioInfo): string => `${node.ruleId ?? "<feature>"}\u0000${node.name}`

/**
 * F22 — two Scenarios sharing one un-interpolated name inside one scope.
 *
 * **Why this is checked at all.** `[VERIFIED]`: two Scenarios named `dup` in one Feature parse
 * fine and compile to two scenarios with identical names and distinct `astNodeIds`. Nothing
 * upstream objects. But the roadmap's success criterion 4 and ARCHITECTURE.md's Open Question 4
 * both match a Scenario to its registered step definitions BY the un-interpolated name, and
 * neither noticed that names are not unique. Phase 6 would join `ParsedFeature` against the
 * registry by that name and hit a genuine ambiguity with no good runtime answer. Rejecting it
 * here turns a Phase-6 design hole into an authoring-time error — this project's stated core value
 * applied to one more axis, at the cost of one `Map`.
 *
 * **LOCKED DECISION 1 — severity: REJECT.** A Feature containing two Scenarios with the same
 * un-interpolated name in the same scope is rejected with a `LoadFeatureError`. Not a warning, not
 * an automatic rename, not a positional fallback. (Research Assumption A1, decided.)
 *
 * **LOCKED DECISION 2 — scope: PER-SCOPE.** Uniqueness holds within one scope only: feature level,
 * or within one `Rule:`. Two different Rules may each legally contain a `Scenario: happy path`,
 * and fixture `duplicate-scenario-name-across-rules.feature` is the executable proof that they
 * still may. Whole-Feature uniqueness is explicitly rejected as too strict. The per-scope choice
 * mirrors Phase 6's per-scope scope-chain resolution (ARCHITECTURE.md Pattern 5), so the two
 * layers agree on what a scope is. (Research Assumption A6, decided.)
 *
 * Both decisions are locked developer decisions, not recommendations. Do not relax either one
 * without changing the fixtures that pin them.
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
    line,
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
 * Validate one correlated feature.
 *
 * Throws a `LoadFeatureError` on the first problem in document order; returns the accumulated
 * non-fatal findings otherwise.
 */
export const validateFeature = (result: CorrelationResult): ReadonlyArray<LoadFeatureWarning> => {
  const { feature, index } = result
  const uri = feature.uri
  const warnings: Array<LoadFeatureWarning> = []
  const ruleNames = new Map(index.astRules.map((rule) => [rule.id, rule.name]))
  /** Populated in document order, so the retained entry is always the FIRST occurrence. */
  const seenByScope = new Map<string, AstScenarioInfo>()

  for (const node of index.astScenarios) {
    const produced = index.byScenarioId.get(node.id) ?? []
    const isOutline = isOutlineKeyword(index.language, node.keyword)

    if (isOutline && node.examplesCount === 0) {
      throw outlineWithoutExamples(uri, node)
    } else if (isOutline && produced.length === 0) {
      throw emptyExamples(uri, node)
    } else if (!isOutline && node.examplesCount > 0 && isScenarioKeyword(index.language, node.keyword)) {
      // `isScenarioKeyword` rather than the bare negative of `isOutlineKeyword`: a dialect may
      // carry keyword forms that are neither, and this error accuses the author of using the
      // wrong keyword, so it must only fire when the keyword is positively a plain scenario one.
      throw scenarioKeywordWithExamples(uri, node)
    }

    for (const pickle of produced) {
      if (pickle.steps.length === 0) {
        throw zeroStepScenario(uri, node, lineOf(pickle, node))
      }
    }

    const key = uniquenessKey(node)
    const first = seenByScope.get(key)
    if (first === undefined) {
      seenByScope.set(key, node)
    } else {
      throw duplicateScenarioName(uri, node, first, scopeLabel(node.ruleId, ruleNames))
    }
  }

  // --- EXTENSION POINT -------------------------------------------------------------------
  // Plan 02-08 adds to THIS file, after the loop above and before this return:
  //   * the exact leftover-placeholder scan (F7/F8, reason `UninterpolatedPlaceholder`), which
  //     scans step text, DocString content and every DataTable cell, scoped to Outline-correlated
  //     pickles and matched against that Outline's own `index.exampleColumns` — the one place a
  //     fixed-literal RegExp is introduced, matched AGAINST feature text (the safe direction).
  //   * the Group C warnings pushed onto `warnings`: `UnknownPlaceholder` (F9),
  //     `DuplicateExamplesColumn` (F11) via `index.examplesHeaders`, `EmptyRule` (F13) via
  //     `index.astRules`, and `SuspectedSwallowedStep` (F14).
  // ---------------------------------------------------------------------------------------

  return warnings
}

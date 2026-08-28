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
 * Exactly ONE regular expression lives in this package, the `PLACEHOLDER` literal below, and the
 * direction of its use is the security-relevant fact: it is a fixed literal matched AGAINST
 * feature-file content, never a pattern compiled FROM it (threat T-02-01). Every other check here
 * is a structural comparison or a `Map` lookup.
 *
 * Local imports are `./Correlate.ts`, `./Errors.ts` and `./Model.ts`. Never `./index.ts` — that
 * would be both an `import/no-cycle` violation and an `effect/no-import-from-barrel-package`
 * error.
 */
import {
  type AstRuleInfo,
  type AstScenarioInfo,
  type AstStepInfo,
  type CorrelationResult,
  isOutlineKeyword,
  isScenarioKeyword
} from "./Correlate.ts"
import { LoadFeatureError, type LoadFeatureWarning, makeWarning } from "./Errors.ts"
import type { GherkinDocument, Pickle, PickleStep } from "./Model.ts"

/**
 * Every message is shaped `uri:line: <reason>: <what happened, then what to do>`.
 *
 * Message quality is not cosmetic here. `loadFeature` is called at module top level, so a throw
 * from this module surfaces as a vitest COLLECTION error for the entire test file — the author
 * sees this string and no test names at all. It has to be self-contained.
 */
const at = (uri: string, line: number): string => `${uri}:${line}: `

/**
 * Name any AST block the way the author would recognise it: its localised keyword and its
 * un-interpolated name, quoted. `JSON.stringify` rather than hand-added quotes so a name
 * containing a quote character stays unambiguous.
 *
 * A `Background:` and an unnamed `Rule:` both legitimately have an empty name, and
 * `Background: ""` reads as a defect rather than as the anonymous block it is, so the keyword
 * stands alone in that case.
 */
const describeBlock = (keyword: string, name: string): string =>
  name === "" ? `${keyword}:` : `${keyword}: ${JSON.stringify(name)}`

/**
 * `describeBlock` for an AST Scenario node.
 */
const describeNode = (node: AstScenarioInfo): string => describeBlock(node.keyword, node.name)

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
 * The one regular expression in this package. The DIRECTION of its use is what makes it safe.
 *
 * It is a fixed literal declared at module scope and matched AGAINST feature-file content.
 * Compiling a pattern FROM feature-file content is the direction that admits a
 * catastrophic-backtracking denial of service (threat T-02-01), and that direction appears
 * nowhere in `packages/gherkin/src`. Here the inner character class excludes both angle brackets,
 * so the quantifier cannot nest and no input has a super-linear match path. `compile()`'s own
 * `interpolate` does build a pattern per Examples column, but that is upstream's code and its
 * input is a column name.
 *
 * The `g` flag is required by `String.prototype.matchAll`, which iterates a clone rather than
 * advancing this object's `lastIndex`, so one shared instance is safe at every call site. Both
 * the exact check and the heuristic check use THIS expression; a second one would only be a
 * second thing to keep in step with the first.
 */
const PLACEHOLDER = /<([^<>]+)>/g

/**
 * Where inside a step a leftover token was found.
 *
 * These strings reach the message verbatim, so `a DataTable cell` and `the DocString` are the
 * reader-visible proof that the scan looked at a step's ARGUMENT and not only at its text.
 */
type PlaceholderSite = "the step text" | "a DataTable cell" | "the DocString"

/**
 * One `<token>` found in one place, carrying everything a message needs.
 *
 * `content` is the WHOLE string the token was found in — a complete DataTable cell value or a
 * complete DocString body — because the message reproduces it with nothing removed, per the
 * package's locked full-content policy (threat T-02-02, accepted).
 */
interface Leftover {
  readonly name: string
  readonly step: PickleStep
  readonly site: PlaceholderSite
  readonly content: string
}

/**
 * Every `<token>` in one pickle, from all THREE places a placeholder can survive.
 *
 * Scanning `step.text` alone misses row F8 entirely. `[VERIFIED]`: under an Outline, a Background
 * step's DataTable cell values and DocString body keep their placeholders, while that same
 * Outline's own Scenario-step table cell IS interpolated. The two argument shapes are tested
 * independently rather than as an `if`/`else` chain, because `@cucumber/gherkin@42` permits one
 * step to carry both and the `else` form silently drops whichever came second.
 *
 * Classification is deliberately left to the caller. The same token set feeds the exact check
 * (naming a column is an error) and the heuristic check (not naming one is a warning), and which
 * is which is a policy question rather than a scanning one.
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

/**
 * The AST step behind a pickle step.
 *
 * A `PickleStep` carries no line and no origin — both live only on the AST node — so this lookup
 * is the only way to LOCATE a leftover placeholder and the only way to know whether it sits in a
 * Background. A located error is half of PARSE-03.
 *
 * `correlateFeature` already throws on an unresolvable step id, so `undefined` is unreachable
 * through `loadFeature`. The callers fall back to the Scenario's own line anyway rather than
 * asserting it away: an error path is the worst possible place for a second failure.
 */
const astStepOf = (step: PickleStep, byStepId: ReadonlyMap<string, AstStepInfo>): AstStepInfo | undefined => {
  const id = step.astNodeIds[0]
  return id === undefined ? undefined : byStepId.get(id)
}

const isBackgroundStep = (info: AstStepInfo | undefined): boolean =>
  info !== undefined && (info.owner === "feature-background" || info.owner === "rule-background")

/**
 * ADR-EC-014's prescribed wording, reproduced verbatim. It is the deliverable of PARSE-03, not
 * decoration, and a test asserts it on purpose.
 *
 * `[VERIFIED]` against `@cucumber/gherkin@42.0.1`'s `compile.js`: `compileScenarioOutline` pushes
 * an Outline's Background steps with EMPTY `variableCells`, so a placeholder written in a
 * Background step under an Outline is never interpolated, in any Examples row. Without this
 * sentence the author meets a downstream "no step matched" failure quoting text they never wrote,
 * with nothing pointing at their Background — which is precisely the confusion this phase exists
 * to remove.
 */
const BACKGROUND_LIMITATION = "Background step text still contains an unsubstituted placeholder — this is a "
  + "known `@cucumber/gherkin` limitation for Backgrounds nested under a Scenario Outline, not a bug in "
  + "your Background text."

/**
 * F7 and F8 — check alpha: a leftover `<token>` whose name IS one of this Outline's own Examples
 * header columns.
 *
 * That coincidence is proof of intent, which is why this is an ERROR and not a warning: the
 * author wrote a column name, so they meant a substitution, and it did not happen. The
 * complementary case — a token that is NOT a column — is check beta below, and it is a warning
 * exactly because it has no such proof.
 *
 * The offending content is reproduced in FULL. This is the package's locked full-content policy
 * at its most consequential call site: the string being quoted is a DataTable cell or a DocString
 * body, which is where a fixture credential would live (threat T-02-02, ACCEPTED). Do not add a
 * length cap, an elision marker, or a slice here.
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
    line,
    message: `${at(uri, line)}UninterpolatedPlaceholder: <${leftover.name}> is an Examples column of `
      + `${describeNode(node)}, but it is still present, un-substituted, in ${leftover.site} of the step on `
      + `line ${line}. ${explanation} That text reads, in full:\n${leftover.content}`
  })
}

// --- Group C: the four heuristic findings, which are WARNINGS ------------------------------
//
// **LOCKED DECISION 3 — severity: WARN, for all four.** F9, F11, F13 and F14 accumulate onto the
// returned array and NEVER throw. (Research Assumption A2, decided.)
//
// The reasoning, because it is not visible from the code. Each of these four is a REAL defect
// with a verified silent-failure path, but for each one the detector admits an innocent reading:
// a `<div>`-shaped string inside an Outline is legal text, a description is legal Gherkin, and a
// `Rule:` may be a placeholder an author is about to fill in. Raising them as errors would reject
// legitimate feature files, which costs this library the trust it is asking for; leaving them
// silent would let a dropped Examples column ship unnoticed, which is the exact failure mode the
// phase exists to remove. A returned, reason-tagged warning is the only option that pays neither
// price.
//
// `validateFeature` returns these; it does not print, log or throw them. How a warning reaches a
// human is Phase 6's decision — MATCH-05 already needs a Feature-level warning channel — and this
// phase produces only the data (Decision D6).
// -------------------------------------------------------------------------------------------

/**
 * F9 — check beta: a leftover `<token>` that is NOT one of this Outline's Examples columns.
 *
 * The message NAMES the columns that do exist, because the gap between what the author wrote and
 * what the parser kept is the whole finding — "unknown placeholder" alone sends them looking in
 * the wrong place.
 *
 * `[VERIFIED]` upstream signature (cucumber/gherkin#22, still open): an Examples header row
 * missing its trailing `|` on BOTH the header and the body rows silently drops the last column.
 * Header and body cell counts stay consistent, so no upstream guard fires, and the placeholder
 * survives into the compiled step as literal text. Omitting the pipe from the body row alone is a
 * loud `AstBuilderException` instead — the two differ by one character and take opposite paths.
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

/**
 * F11 — the same column name written twice in one `Examples:` header row.
 *
 * `[VERIFIED]`: the FIRST column wins for BOTH occurrences. Header `| a | a |` with body
 * `| 1 | 2 |` compiles `<a> twice <a>` to `1 twice 1`, and the second column's values are simply
 * unreachable. No error at any layer (cucumber/gherkin#28).
 */
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

/**
 * F13 — a `Rule:` with no Scenarios inside it.
 *
 * `[VERIFIED]`: it contributes zero pickles, in silence. Nothing runs and nothing reports the
 * absence, so a Rule left as a heading reads like covered behavior.
 */
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
 * F14 — a Scenario or Background carrying a description, which is where a swallowed step lands.
 *
 * `[VERIFIED]`: a step keyword misspelled BEFORE any valid step is absorbed into the block's
 * `description`. The AST has one fewer step, the compiled scenario has one fewer step, and no
 * layer reports anything — a step the author wrote simply does not exist. The same typo written
 * AFTER a valid step is a loud parse error, so the behavior is position-dependent and casual
 * testing will not find it.
 *
 * There is no exact detector, because a description is legal Gherkin; the message says so, and
 * quotes the text so the author can judge in one glance. Nothing fuzzier is attempted — matching
 * the description against dialect keywords by similarity is marked speculative and out of scope
 * by the phase research.
 *
 * This is additive to, not a replacement for, the `ZeroStepScenario` message quoting the same
 * description. That error covers the case where the swallowed step was the block's ONLY step;
 * this warning covers every other case, where the block still has steps and so never reaches it.
 *
 * The description is quoted in full, per the package's locked full-content policy (threat
 * T-02-02, accepted).
 */
const suspectedSwallowedStep = (
  uri: string,
  label: string,
  description: string,
  line: number
): LoadFeatureWarning =>
  makeWarning({
    reason: "SuspectedSwallowedStep",
    uri,
    line,
    message: `${at(uri, line)}SuspectedSwallowedStep: ${label} has a description. A step keyword misspelled `
      + `before any valid step is absorbed into the description rather than reported, so a step written there `
      + `does not exist at any layer and nothing fails. A description is legal Gherkin, so this is a heuristic, `
      + `not a defect: if the text below is prose, ignore this. It reads, in full:\n${description}`
  })

/**
 * The values in one header row that appear more than once, each reported once, in source order.
 *
 * Takes the duplicate-PRESERVING `examplesHeaders` array. A `Set` of the header cells would erase
 * the very thing being detected.
 */
const duplicatedColumns = (header: ReadonlyArray<string>): ReadonlyArray<string> => {
  const seen = new Set<string>()
  const duplicated: Array<string> = []
  for (const value of header) {
    if (seen.has(value) && !duplicated.includes(value)) {
      duplicated.push(value)
    }
    seen.add(value)
  }
  return duplicated
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

/**
 * The two details the Group C warnings need that `AstIndex` does not carry.
 *
 * `AstIndex` records what CORRELATION needs, and neither of these is that: a Background produces
 * no pickle of its own, and an `Examples:` block's location is not needed to join a pickle to its
 * AST node. Rather than widen `Correlate.ts`'s index with fields only this file reads, both are
 * recovered here in one small pass over the document that `ParsedFeatureCore` already carries.
 * Nothing below re-derives anything `compile()` produced; it reads two source locations and one
 * description.
 */
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
    // A `Rule:` is the only nesting level Gherkin has, so flattening its children into the
    // feature's own gives one list holding every block that can own a Background or an Examples
    // table. `Parser.ts` has already rejected a comment-only file, so the guard above is
    // unreachable through `loadFeature` and exists because the type says it can happen.
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

  // Checks alpha and beta — the leftover-placeholder scan (rows F7, F8 and F9). Check alpha is
  // PARSE-03 itself.
  //
  // One scan, one regular expression, two verdicts. A token that names one of this Outline's own
  // columns is an ERROR (alpha); any other token found in the same places is a WARNING (beta).
  //
  // Two restrictions are load-bearing, and dropping either one turns this from an exact check
  // into a source of rejected-but-valid feature files (threat T-02-18).
  //
  // 1. Only Outline-correlated pickles are scanned. `[VERIFIED]`: `the assertion 2 < 3 holds`,
  //    `the html is <div>hello</div>` and `an email <a@b.com>` all survive `compile()` unchanged
  //    and are perfectly valid Gherkin. A plain Scenario has no Examples columns, so it is never
  //    scanned, and that single exclusion removes the whole false-positive class.
  // 2. Only a token naming one of THIS Outline's own columns is a hit. Inside an Outline, writing
  //    a column name is proof the author expected a substitution, so a hit has no innocent
  //    reading.
  for (const node of index.astScenarios) {
    const columns = index.exampleColumns.get(node.id)
    if (columns === undefined || columns.size === 0 || !isOutlineKeyword(index.language, node.keyword)) {
      continue
    }
    for (const pickle of index.byScenarioId.get(node.id) ?? []) {
      for (const leftover of scanPlaceholders(pickle)) {
        const info = astStepOf(leftover.step, index.byStepId)
        if (columns.has(leftover.name)) {
          throw uninterpolatedPlaceholder(uri, node, leftover, info)
        }
        warnings.push(unknownPlaceholder(uri, node, leftover, info, columns))
      }
    }
  }

  // The remaining Group C findings (F11, F13, F14). None of these throws.
  const detail = astDetailOf(feature.document)

  for (const node of index.astScenarios) {
    const blockLines = detail.examplesLines.get(node.id) ?? []
    for (const [blockIndex, header] of node.examplesHeaders.entries()) {
      for (const column of duplicatedColumns(header)) {
        warnings.push(duplicateExamplesColumn(uri, node, column, blockLines[blockIndex] ?? node.location.line))
      }
    }
    if (node.description.trim() !== "") {
      warnings.push(suspectedSwallowedStep(uri, describeNode(node), node.description, node.location.line))
    }
  }

  for (const rule of index.astRules) {
    if (rule.scenarioIds.length === 0) {
      warnings.push(emptyRule(uri, rule))
    }
  }

  for (const background of detail.backgrounds) {
    if (background.description.trim() !== "") {
      const label = describeBlock(background.keyword, background.name)
      warnings.push(suspectedSwallowedStep(uri, label, background.description, background.line))
    }
  }

  // Deterministic document order, so a test can assert the array by position rather than by
  // searching it. `Array.prototype.sort` is stable, so two findings on one line keep the order
  // they were found in.
  warnings.sort((left, right) => (left.line ?? 0) - (right.line ?? 0))
  return warnings
}

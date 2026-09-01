/**
 * D-03's Scenario title: every Outline row's emitted test title shows every Examples column and
 * that row's value for it — `Applying a valid discount code (code=SAVE10, percent=10,
 * expected=31.50)`.
 *
 * `Runner.ts` note (d) already established that `ScenarioPlan.name` — the interpolated `Pickle.name`
 * — is the title and `astName` never is. This module does not overturn that; it adds the suffix D-03
 * asks for ON TOP of that name. Everything else about emission is unchanged, and a plain Scenario's
 * title comes back byte-for-byte what the author wrote.
 *
 * Three things about this module are not visible from the code.
 *
 * (a) **`ParsedScenario.name` alone does NOT already produce this format, and the appealing reading
 *     of D-03 that says it does is wrong.** 08-CONTEXT.md's own D-03 notes that `Pickle.name`
 *     "already has `<placeholder>` tokens substituted with that row's Examples values", and infers
 *     that "the raw material for this title format may already be sitting in the Pickle". It is
 *     sitting there only when the Outline's TITLE TEXT references a placeholder. Verified
 *     empirically against the installed `@cucumber/gherkin@42.0.1`: interpolation substitutes
 *     tokens found in the title, so an Outline titled `Applying a valid discount code` — which
 *     contains no `<...>` at all — produces a BYTE-IDENTICAL `Pickle.name` for every one of its
 *     rows, no matter how many columns its Examples table has. That is the worked example from the
 *     phase's own context document, so the case is not hypothetical. `test/OutlineTitle.test.ts`
 *     asserts that identity directly, as a standing check that this note is still true.
 *
 *     The consequence for the walk below: the column NAMES and the per-row VALUES exist nowhere on
 *     `ParsedScenario` or on `ScenarioPlan`. Neither carries the Examples header, and the row's
 *     values survive only where interpolation happened to place them inside some string. They are
 *     present, as data, only on the raw AST's `Examples`/`TableRow` nodes — so this module walks
 *     `feature.document`, which `ParsedFeatureCore` deliberately keeps as an escape hatch for
 *     exactly this kind of consumer, rather than deriving anything from the planned view.
 *
 * (b) **The join key is the ROW's own `TableRow.id`, reached through `pickle.astNodeIds.at(-1)` —
 *     never `astNodeIds[0]`, and never `ParsedScenario.astId`.** Pitfall 9 is the verified failure:
 *     `compileScenarioOutline` sets `astNodeIds: [scenario.id, valuesRow.id]` once per Examples row,
 *     so every row of one Outline SHARES `astNodeIds[0]`, and `ParsedScenario.astId` is documented
 *     as being exactly that shared first element. Keying on it does not throw and does not fail to
 *     type-check; it silently hands every row of one Outline the SAME row's values — which, for the
 *     no-placeholder Outline in note (a), renders N identical titles again and undoes the entire
 *     point of the module. `.at(-1)` is the concrete node: the Examples table row itself.
 *
 *     A row id that is absent from the map is treated as "this is a plain Scenario" and the title is
 *     the unmodified name. That is not defensive padding around a suspected bug — a plain Scenario's
 *     `astNodeIds` is `[scenario.id]`, so its `.at(-1)` IS the Scenario id and legitimately misses a
 *     map that only ever holds Examples-row ids. cucumber-js's own idiom is the same shape: look the
 *     ids up and take what resolves, rather than assert that one must.
 *
 * (c) **This module adds no dependency to `packages/vitest`, and adding one to reach these AST types
 *     would be the natural-looking mistake.** The nodes it reads are declared by the upstream
 *     Cucumber messages package, and the obvious way to name them is to declare THAT package here
 *     and import them from it. Its name is deliberately never spelled out anywhere in this file,
 *     because an acceptance criterion greps for it to prove this module does not depend on it, and a
 *     grep cannot tell an import from an explanation of a non-import — the same collision
 *     `CallSite.ts` note (b) works around. `packages/vitest` depends only on
 *     `@effect-cucumber/gherkin` (`scripts/verify-no-runner-dep.sh` and the gherkin package's own
 *     `Model.ts` header are the standing statements of that boundary), and the gherkin barrel already
 *     re-exports `GherkinDocument` — precisely so a consumer "is never forced to declare either
 *     package itself". Every nested shape below is therefore reached by INDEXED ACCESS off that one
 *     re-exported type. The aliases are structural, so they cannot drift from what the parser
 *     actually produces the way a hand-copied interface would.
 *
 * Its one import is a type, from the gherkin barrel. It is INTERNAL and is not re-exported from
 * `packages/vitest/src/index.ts` — a consumer calls `describeFeature`, never a title builder, and
 * publishing this would freeze a presentation detail of emission into the package's contract.
 * `CallSite.ts`, `Registry.ts` and `Runner.ts` all set the same precedent.
 */
import type { GherkinDocument, ParsedFeature } from "@effect-cucumber/gherkin"

/**
 * The AST shapes this module reads, derived structurally from the one re-exported document type —
 * note (c).
 *
 * `Feature`, `Rule` and `Scenario` are `NonNullable<...>` because a `FeatureChild` carries all three
 * of `rule`/`background`/`scenario` as optional and exactly one of them is populated; the walk below
 * narrows with an `undefined` check before ever holding one of these.
 */
type Feature = NonNullable<GherkinDocument["feature"]>
type FeatureChild = Feature["children"][number]
type Rule = NonNullable<FeatureChild["rule"]>
type RuleChild = Rule["children"][number]
type Scenario = NonNullable<FeatureChild["scenario"]>
type Examples = Scenario["examples"][number]
type TableRow = NonNullable<Examples["tableHeader"]>

/** One table row's cells, left to right. The same shape serves a header row and a body row. */
const cellValuesOf = (row: TableRow): ReadonlyArray<string> => row.cells.map((cell) => cell.value)

/**
 * One Examples row's header and values, both in the table's own left-to-right column order.
 *
 * The header is stored PER ROW rather than per Examples block, even though every row of one block
 * shares it. One Outline may carry several `Examples:` blocks with DIFFERENT headers, and the row is
 * the only key the pickle side can offer — so a per-block structure would have to be found by a
 * second lookup that the pickle has no key for. Duplicating a short array per row is the cheaper
 * half of that trade, and it makes borrowing a neighbouring block's header structurally impossible
 * rather than merely unlikely.
 */
interface RowInfo {
  readonly header: ReadonlyArray<string>
  readonly values: ReadonlyArray<string>
}

/**
 * Every `Scenario` node in the document, with `Rule:` children flattened into the feature's own.
 *
 * The flatten is `Validate.ts`'s `astDetailOf` verbatim in shape — a `Rule:` is the only nesting
 * level Gherkin has, so replacing a rule-bearing child with its own children gives one flat list of
 * every block that can own an `Examples:` table. It is reimplemented here rather than imported
 * because that helper is private to the gherkin package and crossing the boundary for four lines
 * would mean publishing an internal validation detail.
 */
const astScenariosOf = (document: GherkinDocument): ReadonlyArray<Scenario> => {
  const feature = document.feature
  if (feature === undefined) {
    // Unreachable through `loadFeature` — `Parser.ts` already rejects a document with no Feature —
    // and handled rather than thrown because the TYPE says it can happen and a title builder is the
    // wrong place to be the second module enforcing that invariant.
    return []
  }
  const children: ReadonlyArray<FeatureChild | RuleChild> = feature.children.flatMap(
    (child) => child.rule === undefined ? [child] : child.rule.children
  )
  const scenarios: Array<Scenario> = []
  for (const child of children) {
    const scenario = child.scenario
    if (scenario !== undefined) {
      scenarios.push(scenario)
    }
  }
  return scenarios
}

/**
 * Every Examples row in the document, keyed by the row's OWN `TableRow.id` — note (b).
 *
 * A block with no `tableHeader` contributes rows with an empty header, so their titles get an empty
 * `()` suffix rather than a crash; `Validate.ts` is what rejects such a table upstream, and
 * duplicating its judgement here would mean two modules deciding what a malformed Examples block is.
 */
const rowsOf = (document: GherkinDocument): ReadonlyMap<string, RowInfo> => {
  const rows = new Map<string, RowInfo>()
  for (const scenario of astScenariosOf(document)) {
    for (const block of scenario.examples) {
      const header: ReadonlyArray<string> = block.tableHeader === undefined
        ? []
        : cellValuesOf(block.tableHeader)
      for (const row of block.tableBody) {
        rows.set(row.id, { header, values: cellValuesOf(row) })
      }
    }
  }
  return rows
}

/**
 * Every Scenario's emitted test title, keyed by `ParsedScenario.id` (the `Pickle.id`, which is also
 * `ScenarioPlan.scenarioId`).
 *
 * TOTAL over `feature.allScenarios`: every Scenario gets an entry, so a caller never has to decide
 * what a miss means. An Outline row's entry is its interpolated name plus the `(col=value, ...)`
 * suffix in the Examples table's own column order; every other Scenario's entry is its name
 * unchanged.
 *
 * Column names and cell values are rendered VERBATIM, not escaped — `Runner.ts` note (c)'s standing
 * policy for Feature, Rule and Scenario names, for the same reason: a test title's whole job is to
 * render what the author wrote, and the `.feature` file is trusted source, not user input
 * (threat T-08-04-01).
 *
 * Two Examples rows with byte-identical cells render byte-identical suffixes, and the suffix exists
 * to keep every emitted title distinct, so the second and later occurrences of a title within one
 * Feature get ` #2`, ` #3`, ... appended in document order (BEH-EC-010). The first occurrence is
 * left as written so a table without duplicates is titled exactly as before.
 *
 * The explicit return annotation is required, not stylistic: `composite: true` demands it for
 * declaration emit on anything exported.
 */
export const buildScenarioTitles = (feature: ParsedFeature): ReadonlyMap<string, string> => {
  const rows = rowsOf(feature.document)
  const titles = new Map<string, string>()
  const occurrences = new Map<string, number>()
  for (const scenario of feature.allScenarios) {
    // `.at(-1)`, never `[0]` and never `scenario.astId` — note (b). `undefined` here is a plain
    // Scenario, whose only `astNodeId` is its own and is legitimately absent from a map of row ids.
    const rowId = scenario.pickle.astNodeIds.at(-1)
    const rowInfo = rowId === undefined ? undefined : rows.get(rowId)
    const base = rowInfo === undefined
      ? scenario.name
      : `${scenario.name} (${rowInfo.header.map((name, index) => `${name}=${rowInfo.values[index] ?? ""}`).join(", ")})`
    const seen = (occurrences.get(base) ?? 0) + 1
    occurrences.set(base, seen)
    titles.set(scenario.id, seen === 1 ? base : `${base} #${seen}`)
  }
  return titles
}

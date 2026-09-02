/**
 * Emitted test titles: a plain Scenario's `name`, an Outline row's `name` plus `(col=value, ...)`,
 * and ` #2`, ` #3` for byte-identical titles (BEH-EC-010). The row is found through
 * `pickle.astNodeIds.at(-1)`, never `[0]` (`test/OutlineTitle.test.ts`).
 */
import type { GherkinDocument, ParsedFeature } from "@effect-cucumber/gherkin"

type Feature = NonNullable<GherkinDocument["feature"]>
type FeatureChild = Feature["children"][number]
type Rule = NonNullable<FeatureChild["rule"]>
type RuleChild = Rule["children"][number]
type Scenario = NonNullable<FeatureChild["scenario"]>
type Examples = Scenario["examples"][number]
type TableRow = NonNullable<Examples["tableHeader"]>

const cellValuesOf = (row: TableRow): ReadonlyArray<string> => row.cells.map((cell) => cell.value)

interface RowInfo {
  readonly header: ReadonlyArray<string>
  readonly values: ReadonlyArray<string>
}

const astScenariosOf = (document: GherkinDocument): ReadonlyArray<Scenario> => {
  const feature = document.feature
  if (feature === undefined) {
    // Unreachable through `loadFeature` (`Parser.ts` rejects a document without a Feature); handled
    // rather than thrown because the type allows it.
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
 */
export const buildScenarioTitles = (feature: ParsedFeature): ReadonlyMap<string, string> => {
  const rows = rowsOf(feature.document)
  const titles = new Map<string, string>()
  const occurrences = new Map<string, number>()
  for (const scenario of feature.allScenarios) {
    // `undefined` here is a plain Scenario, whose only `astNodeId` is its own and is legitimately
    // absent from a map of row ids.
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

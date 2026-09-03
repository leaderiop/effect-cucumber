/**
 * Emitted test titles: a plain Scenario's `name`, an Outline row's `name` plus `(col=value, ...)`,
 * and ` #2`, ` #3` for byte-identical titles (BEH-EC-010). Reads `ParsedScenario.exampleRow`
 * (ADR-EC-032) rather than walking the raw `GherkinDocument` itself — `Correlate.ts`'s `rowById`
 * index is the one place a Pickle's row id (`pickle.astNodeIds.at(-1)`, never `[0]`) is resolved
 * against the AST now, and this module reuses that result instead of resolving it a second time
 * (`test/OutlineTitle.test.ts`).
 */
import type { ParsedFeature } from "@effect-cucumber/gherkin"
import * as Option from "effect/Option"

/**
 * Every Scenario's emitted test title, keyed by `ParsedScenario.id` (the `Pickle.id`, which is also
 * `ScenarioPlan.scenarioId`).
 */
export const buildScenarioTitles = (feature: ParsedFeature): ReadonlyMap<string, string> => {
  const titles = new Map<string, string>()
  const occurrences = new Map<string, number>()
  for (const scenario of feature.allScenarios) {
    // `Option.none()` here is a plain Scenario, whose title carries no row suffix at all.
    const base = Option.isNone(scenario.exampleRow) ? scenario.name : (() => {
      const row = scenario.exampleRow.value
      // Positional, not `row.raw[name]`: a duplicate column name (Validate.ts's own tolerated,
      // first-wins case) must still show EVERY occurrence's own value in the title, which a
      // deduplicated record lookup could not.
      return `${scenario.name} (${row.header.map((name, index) => `${name}=${row.values[index] ?? ""}`).join(", ")})`
    })()
    const seen = (occurrences.get(base) ?? 0) + 1
    occurrences.set(base, seen)
    titles.set(scenario.id, seen === 1 ? base : `${base} #${seen}`)
  }
  return titles
}

/**
 * SPIKE (issue #34): the rerun-manifest key. Answers "how is a Scenario keyed so the key is STABLE
 * across two separate runs of the same `.feature` file" — a different question from
 * `ScenarioKey.ts`'s, which only needs to be stable WITHIN one `collect()` call.
 *
 * `ScenarioKey.ts` keys `(ruleId, astName)`, and `ruleId` is the AST `Rule.id` — assigned by
 * `IdGenerator.uuid()`, fresh per `loadFeature()` call (`packages/gherkin/src/loadFeature.ts`).
 * That id is a RANDOM UUID, different on every parse, so it cannot key a file that has to be read
 * back on a LATER run. The same is true of `ParsedScenario.id` (the Pickle id) that
 * `ScenarioPlan.scenarioId` carries. Neither survives a second `loadFeature()` call over the exact
 * same bytes.
 *
 * What IS stable across two parses of the same file: the Feature's `name`, each `Rule`'s `name`,
 * and the per-Scenario TITLE `OutlineTitle.ts` already computes for the emitted test name — the
 * Scenario's `name` plus its Outline row's `(header=value, ...)` suffix plus the ` #2`/` #3`
 * disambiguator for byte-identical titles. That title only depends on the document's CONTENT and
 * ITERATION ORDER, neither of which depends on the random id generator, so it reproduces
 * identically across runs — which is exactly the property a rerun-manifest key needs. This module
 * reuses `buildScenarioTitles` rather than duplicating that disambiguation logic.
 *
 * Known limitation, left as a rough edge rather than solved here (see
 * research/rerun-failed-only-spike.md): the key does NOT include `ParsedFeature.uri` (the `.feature`
 * file path). Two different Feature FILES that happen to share a Feature `name` would collide. The
 * write side (a JSON test reporter) sees the vitest TEST file, not the `.feature` file, and nothing
 * in this library currently threads the Feature's `uri` into the emitted test hierarchy for a
 * reporter to recover it from. A real implementation likely needs to fix this (e.g. embed `uri` in
 * the outer `describe` title, or stamp it onto vitest task `meta`) before this key is trustworthy
 * across multi-file suites.
 */
import * as Option from "effect/Option"
import type { FeaturePlan } from "../../src/Plan.ts"
import { buildScenarioTitles } from "../../src/OutlineTitle.ts"

/**
 * @param featureName - `ParsedFeature.name`
 * @param ruleName - the enclosing `Rule.name`, or `null` for a Scenario declared at Feature level
 * @param title - the emitted test title, from `OutlineTitle.ts`'s `buildScenarioTitles`
 */
export const rerunKey = (featureName: string, ruleName: string | null, title: string): string =>
  `${featureName}::${ruleName ?? ""}::${title}`

/**
 * Every Scenario in `plan`, mapped to its rerun-manifest key — computed once and shared by the
 * registration-time filter (`Runner.rerun.ts`) and the stale-key warning (`describeFeature.rerun.ts`),
 * so the two cannot drift apart on how a key is built.
 */
export const rerunKeysForPlan = (plan: FeaturePlan): ReadonlyMap<string, string> => {
  const titles = buildScenarioTitles(plan.feature)

  const ruleNameById = new Map<string, string>()
  for (const rule of plan.feature.rules) {
    ruleNameById.set(rule.id, rule.name)
  }

  const keys = new Map<string, string>()
  for (const scenarioPlan of plan.scenarios) {
    const ruleId = Option.getOrNull(scenarioPlan.ruleId)
    const ruleName = ruleId === null ? null : ruleNameById.get(ruleId) ?? null
    const title = titles.get(scenarioPlan.scenarioId) ?? scenarioPlan.name
    keys.set(scenarioPlan.scenarioId, rerunKey(plan.feature.name, ruleName, title))
  }
  return keys
}

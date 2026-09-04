/**
 * The stable "did this Scenario fail last run" key: `(uri, ruleName, emittedTitle)`. Deliberately
 * NOT `ScenarioKey.ts`'s `(ruleId, astName)` — that key's `ruleId` comes from a fresh
 * `IdGenerator.uuid()` on every `loadFeature()`/`parseFeature()` call (`@effect-cucumber/gherkin`'s
 * `loadFeature.ts` module doc: "node ids are stable only within one `ParsedFeature` — never persist
 * or compare them across calls"), so it is a different random value on every run and can never be
 * looked up against a manifest written by an EARLIER run (ADR-EC-038).
 *
 * Reuses `OutlineTitle.ts`'s existing per-row/per-occurrence title disambiguation rather than
 * inventing a second one — an Outline row's key is already unique the same way its printed test
 * title already is. The Feature's own `uri` is the FIRST component, so a prefix check against it
 * (done by `describeFeature.ts`'s stale-key detection) is a plain `startsWith(uri + separator)`,
 * and two same-named Features in two different `.feature` files never collide. The `::` separator
 * matches the one the `research/rerun-failed-only-spike.md` spike already used; it is a pragmatic
 * choice, not a collision-proof one — a Feature/Rule/Scenario name containing a literal `::` could
 * in principle produce two different `(uri, ruleName, title)` triples that stringify to the same
 * key. Not defended against here, same as `ScenarioKey.ts`'s own `\0`-joined key next to it makes
 * no stronger a guarantee against a name containing that separator; ADR-EC-038 records this as a
 * known, accepted limitation rather than a silently assumed one.
 */
import * as Option from "effect/Option"
import { buildScenarioTitles } from "./OutlineTitle.ts"
import type { FeaturePlan } from "./Plan.ts"

/**
 * @param uri - `ParsedFeature.uri`, the `.feature` file this Scenario was parsed from
 * @param ruleName - the enclosing Rule's name, or `null` for a Scenario declared at Feature level
 * @param title - the Scenario's own EMITTED title (`OutlineTitle.ts`'s `buildScenarioTitles` output)
 */
export const rerunKey = (uri: string, ruleName: string | null, title: string): string =>
  `${uri}::${ruleName ?? ""}::${title}`

/**
 * One rerun key per Scenario in `plan`, keyed by `ScenarioPlan.scenarioId` — computed ONCE and
 * shared by every reader (`describeFeature.ts`'s `anyRunnable` check and stale-key detection,
 * `Runner.ts`'s emission walk, which also stamps each real Scenario's key into
 * `EmitOptions.rerunKey` so `VitestTestApi.ts` can record it on the vitest `TestContext.task.meta`
 * for the write-side script to read back) so none of those readers can compute a different value
 * for the same Scenario and silently drift from one another.
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
    keys.set(scenarioPlan.scenarioId, rerunKey(plan.feature.uri, ruleName, title))
  }
  return keys
}

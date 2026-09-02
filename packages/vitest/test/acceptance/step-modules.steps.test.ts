/**
 * Acceptance pair for BEH-EC-019 (typed step modules, ADR-EC-027): `step-modules.feature` run
 * through the real `describeFeature`, with every Feature-level step coming from a module defined
 * in `step-modules.module.ts` and one Rule-level step from a module `use`d inside the Rule.
 *
 * Deviations from a consumer's file, for the same reasons as every pair in this directory:
 * `describeFeature`, `loadFeature` and `defineSteps` are imported by relative path from `../../src`
 * (oxlint forbids the barrel from inside the package).
 *
 * Mutation record:
 * - C — change `Then I have 2 apples left` to `3` in the `.feature` file: the tagged Scenario fails.
 * - D — delete `use(applesSteps)` below: both Scenarios fail with `UndefinedStep`.
 * - E — delete this pair's §5 row from `spec/traceability.md`: `pnpm verify:spec` fails naming
 *   `REQ-EC-023`.
 * - F — move `useInRule(ruleModule)` to Feature level: the Rule's Scenario still resolves, which is
 *   why the module's Rule scoping is asserted where it can be observed, in `test/StepModule.test.ts`.
 */
import { assert } from "@effect/vitest"
import * as Ref from "effect/Ref"
import { fileURLToPath } from "node:url"
import { describeFeature } from "../../src/describeFeature.ts"
import { loadFeature } from "../../src/loadFeature.ts"
import { defineSteps } from "../../src/StepModule.ts"
import { applesSteps, World } from "./step-modules.module.ts"

const featurePath = fileURLToPath(new URL("./step-modules.feature", import.meta.url))

const feature = await loadFeature(featurePath)

/** A second module, used inside the Rule only. */
const ruleModule = defineSteps<World>(({ Then }) => {
  Then("the rule module reports {int} apples", function*(expected) {
    const { apples } = yield* World
    assert.strictEqual(yield* Ref.get(apples), expected)
  })
})

describeFeature(feature, World.layer, ({ Rule, use }) => {
  use(applesSteps)
  Rule("A module used inside a Rule is scoped to it", ({ use: useInRule }) => {
    useInRule(ruleModule)
  })
})

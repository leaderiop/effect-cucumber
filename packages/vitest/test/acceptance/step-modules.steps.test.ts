/**
 * Acceptance pair for BEH-EC-019 (typed step modules, ADR-EC-027): `step-modules.feature` run through the real
 * `describeFeature`, with every Feature-level step coming from a module defined in `step-modules.module.ts` and one
 * Rule-level step from a module `use`d inside the Rule.
 *
 * Carries: ADR-EC-027, BEH-EC-019, REQ-EC-023.
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

// A second module, used inside the Rule only.
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

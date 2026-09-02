/**
 * `defineSteps` / `use` (ADR-EC-027, BEH-EC-019): a step module is a value whose steps register
 * into whichever container `use`s it, scoped like a step written there.
 *
 * mutation: registering module steps into the FEATURE frame regardless of where `use` was called
 * turns "Rule-scoped" red; dropping `definedAt` from the module record turns the call-site test
 * red; skipping duplicate patterns on `use` turns the ambiguity test red.
 */
import { ParameterTypeStore, parseFeature } from "@effect-cucumber/gherkin"
import { describe, expect, it } from "@effect/vitest"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Ref from "effect/Ref"
import { collectFeature } from "../src/describeFeature.ts"
import type { PlannedStep, UnresolvedPlannedStep } from "../src/Plan.ts"
import { defineSteps } from "../src/StepModule.ts"

class World extends Context.Service<World, { readonly apples: Ref.Ref<number> }>()("StepModule.test/World") {
  static readonly layer = Layer.effect(
    this,
    Effect.gen(function*() {
      return World.of({ apples: yield* Ref.make(0) })
    })
  )
}

const parse = (source: string, uri: string) =>
  Effect.runSync(parseFeature(source, uri).pipe(Effect.provide(ParameterTypeStore.Default)))

const feature = parse(
  `Feature: modules
  Scenario: at feature level
    Given I have 3 apples
    Then only in the rule
  Rule: scoped
    Scenario: inside the rule
      Given I have 5 apples
      Then only in the rule
`,
  "test/step-module.feature"
)

const isUnresolved = (planned: PlannedStep): planned is UnresolvedPlannedStep => {
  const { _tag } = planned
  return _tag === "Unresolved"
}

const errorOf = (planned: PlannedStep | undefined): UnresolvedPlannedStep["error"] | null =>
  planned !== undefined && isUnresolved(planned) ? planned.error : null

const tagsOf = (steps: ReadonlyArray<PlannedStep> | undefined): ReadonlyArray<string> =>
  (steps ?? []).map(({ _tag }) => _tag)

/** The reusable module — defined ONCE here, used from two containers below. */
const apples = defineSteps<World>(({ Given }) => {
  Given("I have {int} apples", function*(count) {
    const { apples: ref } = yield* World
    yield* Ref.set(ref, count)
  })
})

const ruleOnly = defineSteps(({ Then }) => {
  Then("only in the rule", function*() {
    yield* Effect.void
  })
})

describe("a step module registers into the scope that uses it", () => {
  it("serves a Feature-level Scenario when used at Feature level, and its steps come from the module file", () => {
    const collected = collectFeature(feature, World.layer, ({ Rule, use }) => {
      use(apples)
      Rule("scoped", ({ use: useInRule }) => useInRule(ruleOnly))
    })
    const featureScenario = collected.plan.scenarios[0]
    expect(tagsOf(featureScenario?.steps)[0]).toBe("Resolved")
    const definition = collected.definitions.find((d) => d.pattern === "I have {int} apples")
    expect(definition?.definedAt?.file.endsWith("StepModule.test.ts")).toBe(true)
    expect(collected.plan.warnings).toEqual([])
  })

  it("is Rule-scoped when used inside a Rule: the Rule's Scenario resolves, the Feature's does not", () => {
    const collected = collectFeature(feature, World.layer, ({ Rule, use }) => {
      use(apples)
      Rule("scoped", ({ use: useInRule }) => useInRule(ruleOnly))
    })
    const [featureScenario, ruleScenario] = collected.plan.scenarios
    expect(tagsOf(ruleScenario?.steps)).toEqual(["Resolved", "Resolved"])
    expect(errorOf(featureScenario?.steps[1])?.reason).toBe("UndefinedStep")
  })

  it("used twice in one scope is an ambiguity, reported with the module's own definition sites", () => {
    const collected = collectFeature(feature, World.layer, ({ use }) => {
      use(apples)
      use(apples)
    })
    const error = errorOf(collected.plan.scenarios[0]?.steps[0])
    expect(error?.reason).toBe("AmbiguousStep")
    expect(error?.message).toContain("StepModule.test.ts")
  })

  it("composes: a module that uses another carries the inner module's steps", () => {
    const composed = defineSteps<World>(({ use }) => {
      use(apples)
      use(ruleOnly)
    })
    expect(composed.steps.map((s) => [s.keyword, s.pattern])).toEqual([
      ["Given", "I have {int} apples"],
      ["Then", "only in the rule"]
    ])
    expect(Effect.runSync(Effect.provide(composed.requires, World.layer))).toBeUndefined()
  })
})

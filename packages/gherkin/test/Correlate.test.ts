/**
 * PARSE-02, asserted row by row on the F21 fixture.
 *
 * Deliberately NOT a snapshot. The roadmap's success criterion says "asserted row by row", and
 * a single deep-equal would pass just as happily on a correlation that stacked Background steps
 * itself, sorted the tags, or read the keyword off the pickle — the three things this module is
 * forbidden to do. Every value below is named, so a regression names itself.
 *
 * Imports reach into `../src/Parser.ts`, `../src/Pickles.ts` and `../src/Correlate.ts`
 * directly, never through `../src/index.ts`: `effect/no-import-from-barrel-package` runs with
 * `checkRelativeIndexImports: true` and fails `pnpm lint` on a relative value-import whose
 * basename is `index.*`.
 */
import { IdGenerator } from "@cucumber/messages"
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { correlateFeature, type CorrelationResult, isOutlineKeyword, isScenarioKeyword } from "../src/Correlate.ts"
import type { ParsedScenario, ParsedStep } from "../src/Model.ts"
import { parseDocument } from "../src/Parser.ts"
import { compilePickles } from "../src/Pickles.ts"

const readFixture = (name: string): string => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8")

/**
 * Parse, compile and correlate one fixture, with ONE `IdGenerator.uuid()` shared by the parser
 * and the compiler (decision D3). Independent generators are verified to give a Scenario and a
 * pickle the same id inside one document, which would make every assertion below meaningless.
 *
 * The fixture name doubles as the `uri`, so the `uri`-comes-from-the-caller assertion has
 * something recognisable to check.
 */
const correlateFixture = (name: string): CorrelationResult => {
  const newId = IdGenerator.uuid()
  const document = parseDocument(readFixture(name), name, newId)
  return correlateFeature(document, compilePickles(document, name, newId), name)
}

const scenarioAt = (scenarios: ReadonlyArray<ParsedScenario>, at: number): ParsedScenario => {
  const scenario = scenarios[at]
  if (scenario === undefined) {
    throw new Error(`expected a correlated scenario at index ${at}, found ${scenarios.length} in total`)
  }
  return scenario
}

const stepAt = (scenario: ParsedScenario, at: number): ParsedStep => {
  const step = scenario.steps[at]
  if (step === undefined) {
    throw new Error(`expected a step at index ${at} of ${scenario.name}, found ${scenario.steps.length} in total`)
  }
  return step
}

describe("correlateFeature on correlation-full.feature (F21)", () => {
  const onlyScenario = (): ParsedScenario =>
    scenarioAt(correlateFixture("correlation-full.feature").feature.allScenarios, 0)

  it("produces exactly one scenario, the Outline's single Examples row", () => {
    expect(correlateFixture("correlation-full.feature").feature.allScenarios).toHaveLength(1)
  })

  it("stacks four steps: both Backgrounds ahead of the Scenario's own two", () => {
    expect(onlyScenario().steps).toHaveLength(4)
  })

  it("recovers step 0 as the feature Background step, keyword and line included", () => {
    const step = stepAt(onlyScenario(), 0)
    expect(step.origin).toBe("feature-background")
    expect(step.text).toBe("a feature background step")
    expect(step.keyword).toBe("Given")
    expect(step.line).toBe(5)
  })

  it("recovers step 1 as the rule Background step, distinct from the feature one", () => {
    const step = stepAt(onlyScenario(), 1)
    expect(step.origin).toBe("rule-background")
    expect(step.text).toBe("a rule background step")
    expect(step.keyword).toBe("Given")
    expect(step.line).toBe(11)
  })

  it("recovers step 2 as the Scenario's own step, with the placeholder substituted", () => {
    const step = stepAt(onlyScenario(), 2)
    expect(step.origin).toBe("scenario")
    expect(step.text).toBe("I use a")
    expect(step.keyword).toBe("When")
    expect(step.line).toBe(15)
  })

  it("recovers step 3 as the Scenario's closing step", () => {
    const step = stepAt(onlyScenario(), 3)
    expect(step.origin).toBe("scenario")
    expect(step.text).toBe("it works")
    expect(step.keyword).toBe("Then")
    expect(step.line).toBe(16)
  })

  it("trims the trailing space the raw AST keyword carries", () => {
    // The AST value is "Given ", "When " and "Then " — with the space. An untrimmed keyword
    // would still pass a `toContain`, which is why every keyword above uses `toBe`.
    for (const step of onlyScenario().steps) {
      expect(step.keyword.endsWith(" ")).toBe(false)
      expect(step.keyword.trim()).toBe(step.keyword)
    }
  })

  it("flattens tags in feature, rule, scenario, examples-block order", () => {
    // Whole-array `toEqual`, never `toContain`: a reordering must fail, because the order is
    // what proves the list came from `compile()` rather than from a local re-derivation.
    expect(onlyScenario().tags).toEqual(["@featuretag", "@ruletag", "@scenariotag", "@exampletag"])
  })

  it("exposes the un-interpolated astName beside the interpolated name", () => {
    const scenario = onlyScenario()
    expect(scenario.astName).toBe("outline <name>")
    expect(scenario.name).toBe("outline a")
    expect(scenario.astName).not.toBe(scenario.name)
  })

  it("reports the scenario keyword from the AST, trimmed", () => {
    expect(onlyScenario().keyword).toBe("Scenario Outline")
  })

  it("points the scenario's ruleId at the ParsedRule that contains it", () => {
    const { feature } = correlateFixture("correlation-full.feature")
    const rule = feature.rules[0]
    expect(rule).toBeDefined()
    expect(scenarioAt(feature.allScenarios, 0).ruleId).toBe(rule?.id)
    expect(rule?.name).toBe("a rule")
  })

  it("takes uri from the caller, because GherkinDocument.uri is undefined for a string parse", () => {
    const { feature } = correlateFixture("correlation-full.feature")
    expect(feature.uri).toBe("correlation-full.feature")
    expect(feature.document.uri).toBeUndefined()
  })

  it("locates the scenario at the Examples body row, not at the Outline header", () => {
    expect(onlyScenario().location.line).toBe(21)
  })

  it("shares one scenario object between allScenarios and the Rule that owns it", () => {
    const { feature } = correlateFixture("correlation-full.feature")
    expect(feature.scenarios).toHaveLength(0)
    expect(feature.rules).toHaveLength(1)
    expect(scenarioAt(feature.allScenarios, 0)).toBe(scenarioAt(feature.rules[0]?.scenarios ?? [], 0))
  })
})

describe("dialect-aware keyword helpers", () => {
  it("recognises the English Scenario Outline keyword", () => {
    expect(isOutlineKeyword("en", "Scenario Outline")).toBe(true)
  })

  it("does not mistake a plain English Scenario for an Outline", () => {
    expect(isOutlineKeyword("en", "Scenario")).toBe(false)
  })

  it("recognises the English Scenario keyword", () => {
    expect(isScenarioKeyword("en", "Scenario")).toBe(true)
  })

  it("recognises the French Outline keyword, proving the check is not an English word list", () => {
    expect(isOutlineKeyword("fr", "Plan du scénario")).toBe(true)
  })

  it("answers false for a language the dialects record does not carry", () => {
    expect(isOutlineKeyword("xx", "Scenario Outline")).toBe(false)
    expect(isScenarioKeyword("xx", "Scenario")).toBe(false)
  })
})

describe("step origin comes from the AST index, not from a node-id count", () => {
  it("separates Background from Scenario in a plain-Scenario pickle where the id counts match", () => {
    // The negative control. In a PLAIN Scenario pickle both the Background step and the
    // Scenario step carry exactly one entry in `astNodeIds` — the length heuristic gives no
    // signal at all here, so an implementation that regressed to it would still pass every
    // other assertion in this file. Only the `byStepId` index can tell these two apart.
    const { feature } = correlateFixture("zero-step-scenario.feature")
    const withSteps = scenarioAt(feature.allScenarios, 1)

    expect(withSteps.name).toBe("has steps")
    expect(withSteps.pickle.steps.map((step) => step.astNodeIds.length)).toEqual([1, 1])
    expect(withSteps.steps.map((step) => step.origin)).toEqual(["feature-background", "scenario"])
    expect(withSteps.steps.map((step) => step.line)).toEqual([4, 9])
  })

  it("keeps a zero-step scenario correlated with no steps at all", () => {
    const { feature } = correlateFixture("zero-step-scenario.feature")
    const noSteps = scenarioAt(feature.allScenarios, 0)

    expect(noSteps.name).toBe("no steps")
    expect(noSteps.steps).toHaveLength(0)
    expect(noSteps.ruleId).toBeUndefined()
  })
})

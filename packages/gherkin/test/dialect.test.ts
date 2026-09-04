/**
 * Gap 5: a `# language:` non-English feature file parses, correlates and validates with ZERO
 * special handling.
 */
import { assert, describe, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import { fileURLToPath } from "node:url"
import { isOutlineKeyword, isScenarioKeyword } from "../src/Correlate.ts"
import type { ParsedScenario, ParsedStep } from "../src/Model.ts"
import { load, parse } from "./support/loadFixture.ts"

const frenchPath = fileURLToPath(new URL("./fixtures/dialect-fr.feature", import.meta.url))

const scenarioAt = (scenarios: ReadonlyArray<ParsedScenario>, at: number): ParsedScenario => {
  const scenario = scenarios[at]
  if (scenario === undefined) {
    throw new Error(`expected a scenario at index ${at}, found ${scenarios.length} in total`)
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

describe("loadFeature on dialect-fr.feature (F19)", () => {
  it.effect("loads a French feature file without throwing", () =>
    Effect.gen(function*() {
      // Failure here fails the Effect, which fails the test — the same guarantee
      // `resolves.not.toThrow()` gave, now enforced by it.effect itself.
      yield* load(frenchPath)
    }))

  it.effect("reports the declared language and the localised Feature keyword", () =>
    Effect.gen(function*() {
      const feature = yield* load(frenchPath)
      assert.strictEqual(feature.language, "fr")
      assert.strictEqual(feature.keyword, "Fonctionnalité")
      assert.strictEqual(feature.name, "un fichier écrit en français")
    }))

  it.effect("correlates the single Scenario with its localised keyword", () =>
    Effect.gen(function*() {
      const feature = yield* load(frenchPath)
      const scenario = scenarioAt(feature.allScenarios, 0)
      assert.lengthOf(feature.allScenarios, 1)
      assert.strictEqual(scenario.keyword, "Scénario")
      assert.strictEqual(scenario.name, "un scénario simple")
    }))

  it.effect("puts the Contexte step first, recognised as a feature background step", () =>
    Effect.gen(function*() {
      const feature = yield* load(frenchPath)
      const step = stepAt(scenarioAt(feature.allScenarios, 0), 0)
      assert.strictEqual(step.origin, "feature-background")
      assert.strictEqual(step.text, "le contexte est prêt")
    }))

  it.effect("trims the trailing space off the localised step keyword", () =>
    Effect.gen(function*() {
      // The raw AST keyword is `"Etant donné que "`. `strictEqual`, not a substring check: the
      // assertion is about the trailing space, so a substring match would pass on the untrimmed
      // value.
      const feature = yield* load(frenchPath)
      assert.strictEqual(stepAt(scenarioAt(feature.allScenarios, 0), 0).keyword, "Etant donné que")
    }))

  it.effect("keeps run order, with the Scenario's own step after the background one", () =>
    Effect.gen(function*() {
      const feature = yield* load(frenchPath)
      const scenario = scenarioAt(feature.allScenarios, 0)
      assert.lengthOf(scenario.steps, 2)
      assert.strictEqual(stepAt(scenario, 1).origin, "scenario")
      assert.strictEqual(stepAt(scenario, 1).text, "le scénario démarre")
    }))

  it.effect("produces no warnings for a legitimate non-English file", () =>
    Effect.gen(function*() {
      const feature = yield* load(frenchPath)
      assert.deepStrictEqual(feature.warnings, [])
    }))
})

/**
 * A `Plan du scénario` with an `Exemples:` block. Inline rather than a fixture file: the value
 * of this source is that it is a second dialect shape, not that it lives on disk, and
 * `parseFeature` needs no filesystem.
 */
const frenchOutline = `# language: fr
Fonctionnalité: un plan de scénario en français

  Plan du scénario: utiliser <outil>
    Quand j'utilise <outil>
    Alors cela fonctionne

    Exemples:
      | outil    |
      | marteau  |
      | tournevis |
`

describe("a prototype-key language never reads through to Object.prototype", () => {
  it("answers false for every keyword lookup instead of throwing or returning a function", () => {
    assert.strictEqual(isOutlineKeyword("constructor", "Scenario Outline"), false)
    assert.strictEqual(isScenarioKeyword("toString", "Scenario"), false)
    assert.strictEqual(isOutlineKeyword("__proto__", "Scenario Outline"), false)
  })
})

describe("Outline detection is dialect-independent", () => {
  it("recognises the French Scenario Outline keyword through the dialect table", () => {
    assert.strictEqual(isOutlineKeyword("fr", "Plan du scénario"), true)
    assert.strictEqual(isOutlineKeyword("fr", "Scénario"), false)
  })

  it.effect("compiles one scenario per Exemples row without raising a keyword mismatch", () =>
    Effect.gen(function*() {
      const feature = yield* parse(frenchOutline, "inline-fr-outline.feature")
      assert.lengthOf(feature.allScenarios, 2)
      assert.strictEqual(scenarioAt(feature.allScenarios, 0).name, "utiliser marteau")
      assert.strictEqual(scenarioAt(feature.allScenarios, 1).name, "utiliser tournevis")
      assert.deepStrictEqual(feature.warnings, [])
    }))

  it.effect("does not mistake the French Outline for a plain Scenario with Examples", () =>
    Effect.gen(function*() {
      // A hardcoded English keyword list would classify `Plan du scénario` as a plain Scenario
      // and fail this Effect with `ScenarioKeywordWithExamples`; the dialect lookup is what makes
      // it succeed instead.
      const feature = yield* parse(frenchOutline, "inline-fr-outline.feature")
      assert.strictEqual(scenarioAt(feature.allScenarios, 0).keyword, "Plan du scénario")
    }))
})

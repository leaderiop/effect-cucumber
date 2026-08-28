/**
 * Gap 5: a `# language:` non-English feature file parses, correlates and validates with ZERO
 * special handling.
 *
 * The point is not that French works. The point is that nothing in this package branches on
 * English. `Parser.ts` hands the dialect header to `@cucumber/gherkin`'s own token matcher, and
 * the two places that must recognise a keyword — the Outline and plain-Scenario checks behind
 * F3 and F4 — look the keyword up in `dialects[language]` rather than in a hardcoded list. The
 * inline-source test at the bottom is what distinguishes those two implementations: a hardcoded
 * English list would read `Plan du scénario` as a plain Scenario and raise
 * `ScenarioKeywordWithExamples` on a completely legitimate file.
 *
 * Markdown feature files (`GherkinInMarkdownTokenMatcher`) are a different axis and are
 * deliberately out of scope for this milestone — the omission is a decision, not an oversight.
 * Only `GherkinClassicTokenMatcher` is wired.
 *
 * Imports reach `../src/loadFeature.ts` and `../src/Correlate.ts` directly, never
 * `../src/index.ts`: `effect/no-import-from-barrel-package` runs with
 * `checkRelativeIndexImports: true`.
 */
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { isOutlineKeyword } from "../src/Correlate.ts"
import { loadFeature, parseFeature } from "../src/loadFeature.ts"
import type { ParsedScenario, ParsedStep } from "../src/Model.ts"
import { ParameterTypeStore } from "../src/ParameterTypes.ts"

/**
 * `loadFeature` requires `FileSystem.FileSystem | ParameterTypeStore` as of ADR-EC-023 — real
 * `NodeFileSystem` isn't `Effect.runSync`-safe (suspends), so `load` provides both Layers and
 * runs via `Effect.runPromise`. `parseFeature` only requires `ParameterTypeStore`, and
 * `Layer.succeed`-backed services ARE `runSync`-safe (confirmed by reproduction), so `parse`
 * still uses `Effect.runSync`. Neither test in this file cares about custom parameter types, so
 * both always provide `ParameterTypeStore.Default`.
 */
const load = (path: string) =>
  Effect.runPromise(
    loadFeature(path).pipe(Effect.provide(Layer.mergeAll(NodeFileSystem.layer, ParameterTypeStore.Default)))
  )
const parse = (source: string, uri: string) =>
  Effect.runSync(parseFeature(source, uri).pipe(Effect.provide(ParameterTypeStore.Default)))

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
  it("loads a French feature file without throwing", async () => {
    await expect(load(frenchPath)).resolves.not.toThrow()
  })

  it("reports the declared language and the localised Feature keyword", async () => {
    const feature = await load(frenchPath)
    expect(feature.language).toBe("fr")
    expect(feature.keyword).toBe("Fonctionnalité")
    expect(feature.name).toBe("un fichier écrit en français")
  })

  it("correlates the single Scenario with its localised keyword", async () => {
    const feature = await load(frenchPath)
    const scenario = scenarioAt(feature.allScenarios, 0)
    expect(feature.allScenarios).toHaveLength(1)
    expect(scenario.keyword).toBe("Scénario")
    expect(scenario.name).toBe("un scénario simple")
  })

  it("puts the Contexte step first, recognised as a feature background step", async () => {
    const feature = await load(frenchPath)
    const step = stepAt(scenarioAt(feature.allScenarios, 0), 0)
    expect(step.origin).toBe("feature-background")
    expect(step.text).toBe("le contexte est prêt")
  })

  it("trims the trailing space off the localised step keyword", async () => {
    // The raw AST keyword is `"Etant donné que "`. `toBe`, not `toContain`: the assertion is
    // about the trailing space, so a substring match would pass on the untrimmed value.
    const feature = await load(frenchPath)
    expect(stepAt(scenarioAt(feature.allScenarios, 0), 0).keyword).toBe("Etant donné que")
  })

  it("keeps run order, with the Scenario's own step after the background one", async () => {
    const feature = await load(frenchPath)
    const scenario = scenarioAt(feature.allScenarios, 0)
    expect(scenario.steps).toHaveLength(2)
    expect(stepAt(scenario, 1).origin).toBe("scenario")
    expect(stepAt(scenario, 1).text).toBe("le scénario démarre")
  })

  it("produces no warnings for a legitimate non-English file", async () => {
    const feature = await load(frenchPath)
    expect(feature.warnings).toEqual([])
  })
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

describe("Outline detection is dialect-independent", () => {
  it("recognises the French Scenario Outline keyword through the dialect table", () => {
    expect(isOutlineKeyword("fr", "Plan du scénario")).toBe(true)
    expect(isOutlineKeyword("fr", "Scénario")).toBe(false)
  })

  it("compiles one scenario per Exemples row without raising a keyword mismatch", () => {
    const feature = parse(frenchOutline, "inline-fr-outline.feature")
    expect(feature.allScenarios).toHaveLength(2)
    expect(scenarioAt(feature.allScenarios, 0).name).toBe("utiliser marteau")
    expect(scenarioAt(feature.allScenarios, 1).name).toBe("utiliser tournevis")
    expect(feature.warnings).toEqual([])
  })

  it("does not mistake the French Outline for a plain Scenario with Examples", () => {
    // A hardcoded English keyword list would classify `Plan du scénario` as a plain Scenario and
    // throw `ScenarioKeywordWithExamples` here; the dialect lookup is what makes it pass.
    expect(() => parse(frenchOutline, "inline-fr-outline.feature")).not.toThrow()
    expect(scenarioAt(parse(frenchOutline, "inline-fr-outline.feature").allScenarios, 0).keyword)
      .toBe("Plan du scénario")
  })
})

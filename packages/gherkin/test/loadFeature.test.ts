/**
 * PARSE-01 (BEH-EC-001): `loadFeature` parses a `.feature` file and has no observable effect on
 * the test run by itself.
 *
 * ## Read this before "cleaning up" the top-level call
 *
 * `topLevelFeature` below is computed at MODULE TOP LEVEL, outside every `describe` and `it`,
 * exactly where a real consumer writes it. That placement IS the test. The literal form of the
 * criterion — a file that calls `loadFeature` and declares no tests at all — cannot be written:
 * verified, vitest answers `Error: No test suite found in file ...` and the suite goes red, so
 * the file that proves the point best is the one that looks broken.
 *
 * The working formulation is this one. The file declares N tests and vitest reports exactly N in
 * exactly one file. `loadFeature` ran during module evaluation and contributed none of them.
 * Moving the call inside an `it` deletes the only evidence this file exists to produce.
 *
 * ## Imports
 *
 * `../src/loadFeature.ts` directly, never `../src/index.ts`:
 * `effect/no-import-from-barrel-package` runs with `checkRelativeIndexImports: true` and fails
 * `pnpm lint` on a relative value-import whose basename is `index.*`.
 */
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { loadFeature, parseFeature } from "../src/loadFeature.ts"
import type { ParsedFeature } from "../src/Model.ts"
import rawFixture from "./fixtures/correlation-full.feature?raw"

const fixtureUrl = new URL("./fixtures/correlation-full.feature", import.meta.url)
const fixturePath = fileURLToPath(fixtureUrl)

// The load-bearing line. Module top level, zero indentation, above every describe.
const topLevelFeature = loadFeature(fixturePath)

/**
 * Everything about a `ParsedFeature` that is stable across two calls.
 *
 * Node ids are deliberately excluded. One uuid-backed generator is constructed per call, so
 * `id` and `astId` differ between two parses of identical bytes by design — a deep-equal on the
 * whole object would fail for the one reason that is not a regression. What must agree is the
 * content: names, keywords, tags, and every step's text, keyword, origin and line.
 */
const shapeOf = (feature: ParsedFeature) => ({
  uri: feature.uri,
  name: feature.name,
  keyword: feature.keyword,
  language: feature.language,
  tags: feature.tags,
  line: feature.location.line,
  scenarios: feature.allScenarios.map((scenario) => ({
    name: scenario.name,
    astName: scenario.astName,
    keyword: scenario.keyword,
    tags: scenario.tags,
    line: scenario.location.line,
    steps: scenario.steps.map((step) => ({
      text: step.text,
      keyword: step.keyword,
      origin: step.origin,
      line: step.line
    }))
  }))
})

describe("loadFeature at module top level", () => {
  it("has already produced a populated ParsedFeature by the time any test runs", () => {
    expect(topLevelFeature.allScenarios.length).toBeGreaterThan(0)
    expect(topLevelFeature.uri).toBe(fixturePath)
    expect(topLevelFeature.name).toBe("correlation across every nesting level")
  })

  it("contributes no tests of its own — this file reports only the tests it declares", () => {
    // Nothing to call. The assertion is the reported test count of this file, which is why the
    // count must stay equal to the number of `it` blocks written here.
    expect(topLevelFeature.allScenarios).toHaveLength(1)
  })

  it("carries a warnings array even when the file is clean", () => {
    expect(Array.isArray(topLevelFeature.warnings)).toBe(true)
    expect(topLevelFeature.warnings).toHaveLength(0)
  })
})

describe("loadFeature is synchronous", () => {
  it("returns a plain object, not a thenable", () => {
    const result = loadFeature(fixturePath)
    expect(typeof result).toBe("object")
    expect(result).not.toHaveProperty("then")
    expect(result).not.toBeInstanceOf(Promise)
  })
})

describe("source-form parity", () => {
  it("readFileSync + parseFeature agrees with loadFeature on the same file", () => {
    const fromDisk = parseFeature(readFileSync(fixtureUrl, "utf8"), fixturePath)
    expect(shapeOf(fromDisk)).toEqual(shapeOf(topLevelFeature))
  })

  it("the Vite ?raw string is byte-identical to what readFileSync returns", () => {
    expect(rawFixture).toBe(readFileSync(fixtureUrl, "utf8"))
  })

  it("parseFeature over the ?raw string agrees with loadFeature over the path", () => {
    expect(shapeOf(parseFeature(rawFixture, fixturePath))).toEqual(shapeOf(topLevelFeature))
  })

  it("gives the same content but different node ids on a second call", () => {
    const second = loadFeature(fixturePath)
    expect(shapeOf(second)).toEqual(shapeOf(topLevelFeature))
    const firstId = topLevelFeature.allScenarios[0]?.id
    const secondId = second.allScenarios[0]?.id
    expect(typeof firstId).toBe("string")
    expect(secondId).not.toBe(firstId)
  })
})

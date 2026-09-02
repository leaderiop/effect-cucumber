/**
 * PARSE-01 (BEH-EC-001): `loadFeature` parses a `.feature` file and has no observable effect on
 * the test run by itself.
 */
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem"
import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Layer from "effect/Layer"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { loadFeature, parseFeature } from "../src/loadFeature.ts"
import type { ParsedFeature } from "../src/Model.ts"
import { createParameterTypeStore, ParameterTypeStore, type ParameterTypeStoreShape } from "../src/ParameterTypes.ts"
import rawFixture from "./fixtures/correlation-full.feature?raw"

const fixtureUrl = new URL("./fixtures/correlation-full.feature", import.meta.url)
const fixturePath = fileURLToPath(fixtureUrl)

/**
 * Every test in this file provides the same concrete `FileSystem` and the default
 * `ParameterTypeStore` this way — see the module doc comment and ADR-EC-023. Nothing in this
 * file cares about custom parameter types, so `ParameterTypeStore.Default` always suffices.
 */
const load = (path: string) =>
  Effect.runPromise(
    loadFeature(path).pipe(Effect.provide(Layer.mergeAll(NodeFileSystem.layer, ParameterTypeStore.Default)))
  )

// The load-bearing line. Module top level, zero indentation, above every describe.
const topLevelFeature = await load(fixturePath)

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

describe("loadFeature returns an Effect requiring FileSystem", () => {
  it("loadFeature itself is not a thenable — it is an unresolved Effect, not a Promise", () => {
    // `result` here is NOT a ParsedFeature: it is the Effect returned by `loadFeature`,
    // deliberately not run and not provided a FileSystem. Effects are lazy descriptions, never
    // thenables — this holds regardless of what the Effect requires.
    const result = loadFeature(fixturePath)
    expect(result).not.toHaveProperty("then")
    expect(result).not.toBeInstanceOf(Promise)
  })

  it("Effect.runSync throws AsyncFiberError — the real NodeFileSystem suspends internally", () => {
    // This is the confirmed trade-off documented in Source.ts/loadFeature.ts: adopting the
    // real, maintained `@effect/platform-node` implementation instead of a hand-rolled
    // sync-only workaround costs the `Effect.runSync` recovery path. This test exists so a
    // future attempt to bring `runSync` back (e.g. swapping in a different Layer) is forced to
    // notice and update this file, not silently regress it.
    expect(() =>
      Effect.runSync(
        loadFeature(fixturePath).pipe(Effect.provide(Layer.mergeAll(NodeFileSystem.layer, ParameterTypeStore.Default)))
      )
    ).toThrowError(/asynchronous Effect was executed with Effect\.runSync/)
  })

  it("Effect.runPromise(loadFeature(...).pipe(Effect.provide(...))) returns a plain object", async () => {
    const result = await load(fixturePath)
    expect(typeof result).toBe("object")
    expect(result).not.toHaveProperty("then")
    expect(result).not.toBeInstanceOf(Promise)
  })
})

describe("an unanticipated throw is a defect, not a typed failure", () => {
  it("a store whose buildRegistry throws a plain Error makes parseFeature die rather than fail with ParseFailed", () => {
    const broken: ParameterTypeStoreShape = {
      ...createParameterTypeStore(),
      buildRegistry: () => {
        throw new Error("dependency changed under us")
      }
    }
    const exit = Effect.runSyncExit(
      parseFeature(rawFixture, "inline.feature").pipe(Effect.provide(ParameterTypeStore.layerOf(broken)))
    )
    const cause = Exit.isFailure(exit) ? exit.cause : undefined

    expect(cause !== undefined && Cause.hasDies(cause)).toBe(true)
    expect(cause !== undefined && Cause.hasFails(cause)).toBe(false)
  })
})

describe("source-form parity", () => {
  it("readFileSync + parseFeature agrees with loadFeature on the same file", () => {
    // parseFeature takes source text directly — no FileSystem requirement, only
    // ParameterTypeStore, and Layer.succeed-backed services are confirmed Effect.runSync-safe,
    // so Effect.runSync still works here exactly as before; only the FileSystem-touching
    // loadFeature lost it.
    const fromDisk = Effect.runSync(
      parseFeature(readFileSync(fixtureUrl, "utf8"), fixturePath).pipe(Effect.provide(ParameterTypeStore.Default))
    )
    expect(shapeOf(fromDisk)).toEqual(shapeOf(topLevelFeature))
  })

  it("the Vite ?raw string is byte-identical to what readFileSync returns", () => {
    expect(rawFixture).toBe(readFileSync(fixtureUrl, "utf8"))
  })

  it("parseFeature over the ?raw string agrees with loadFeature over the path", () => {
    const fromRaw = Effect.runSync(
      parseFeature(rawFixture, fixturePath).pipe(Effect.provide(ParameterTypeStore.Default))
    )
    expect(shapeOf(fromRaw)).toEqual(shapeOf(topLevelFeature))
  })

  it("gives the same content but different node ids on a second call", async () => {
    const second = await load(fixturePath)
    expect(shapeOf(second)).toEqual(shapeOf(topLevelFeature))
    const firstId = topLevelFeature.allScenarios[0]?.id
    const secondId = second.allScenarios[0]?.id
    expect(typeof firstId).toBe("string")
    expect(secondId).not.toBe(firstId)
  })
})

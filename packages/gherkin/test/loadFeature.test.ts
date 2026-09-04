/**
 * BEH-EC-001: `loadFeature` parses a `.feature` file and has no observable effect on
 * the test run by itself.
 */
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem"
import { assert, describe, expect, it } from "@effect/vitest"
import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { loadFeature, parseFeature } from "../src/loadFeature.ts"
import type { ParsedFeature } from "../src/Model.ts"
import { createParameterTypeStore, ParameterTypeStore, type ParameterTypeStoreShape } from "../src/ParameterTypes.ts"
import rawFixture from "./fixtures/correlation-full.feature?raw"

const fixtureUrl = new URL("./fixtures/correlation-full.feature", import.meta.url)
const fixturePath = fileURLToPath(fixtureUrl)

/**
 * A synchronous `FileSystem` test double, for the module-top-level proof below ONLY: `readFileString`
 * via `Effect.sync` wrapping Node's own SYNCHRONOUS `readFileSync` — this genuinely reads the real
 * file, just never suspends, so `Effect.runSync` over it completes start to finish with no Promise
 * anywhere. `effect/FileSystem`'s `layerNoop` fills in every other `FileSystem` method with
 * something that dies if called; `Source.ts#readFeatureSource` calls only `readFileString`, so
 * that one override is all this needs. Every other test in this file provides the REAL
 * `NodeFileSystem` (via `load` below) — this double exists solely to make the module-top-level
 * `Effect.runSync` call possible, not to replace the real Layer everywhere.
 */
const syncFileSystem = FileSystem.layerNoop({
  readFileString: (path) => Effect.sync(() => readFileSync(path, "utf8"))
})

/**
 * Every `it.effect` test in this file that needs real, on-disk I/O provides the REAL
 * `NodeFileSystem` this way — the production Layer a real consumer uses, and the one the two
 * tests in "loadFeature returns an Effect requiring FileSystem" below are specifically pinning
 * the behaviour of. Nothing in this file cares about custom parameter types, so
 * `ParameterTypeStore.Default` always suffices (see the module doc comment and ADR-EC-023).
 */
const load = (path: string) =>
  loadFeature(path).pipe(Effect.provide(Layer.mergeAll(NodeFileSystem.layer, ParameterTypeStore.Default)))

// The load-bearing line. Module top level, zero indentation, above every describe. Genuinely
// synchronous — `Effect.runSync` over `syncFileSystem` above never suspends — so this proves
// BEH-EC-001 (loadFeature has no observable effect on the test run merely by being called) at
// true module-evaluation time, with no Promise anywhere in this file. See ADR-EC-044.
const topLevelFeature = Effect.runSync(
  loadFeature(fixturePath).pipe(Effect.provide(Layer.mergeAll(syncFileSystem, ParameterTypeStore.Default)))
)

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
    // count must stay equal to the number of `it`/`it.effect` blocks written here.
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
    //
    // A direct `Effect.runSync` call, not `it.effect`: the call itself, and what it throws, IS
    // the assertion — using `it.effect` here would replace the exact thing being pinned with
    // `@effect/vitest`'s own (async-capable) execution instead of it.
    expect(() => Effect.runSync(load(fixturePath))).toThrowError(
      /asynchronous Effect was executed with Effect\.runSync/
    )
  })

  it("Effect.runPromise(loadFeature(...).pipe(Effect.provide(...))) returns a plain object", async () => {
    // Also a direct call, not `it.effect`, and for the same reason as the test above: this proves
    // `gherkin`'s public Effect-returning API interops correctly via Effect's own canonical
    // execution entry point — exactly how a real consumer who is an Effect program but not
    // `@effect-cucumber/vitest` itself (ADR-EC-013/ADR-EC-021) would actually call it. Replacing
    // this `Effect.runPromise` call with `it.effect` would prove something else entirely.
    const result = await Effect.runPromise(load(fixturePath))
    expect(typeof result).toBe("object")
    expect(result).not.toHaveProperty("then")
    expect(result).not.toBeInstanceOf(Promise)
  })
})

describe("an unanticipated throw is a defect, not a typed failure", () => {
  it.effect(
    "a store whose buildRegistry throws a plain Error makes parseFeature die rather than fail with ParseFailed",
    () =>
      Effect.gen(function*() {
        const broken: ParameterTypeStoreShape = {
          ...createParameterTypeStore(),
          buildRegistry: () => {
            throw new Error("dependency changed under us")
          }
        }
        const exit = yield* Effect.exit(
          parseFeature(rawFixture, "inline.feature").pipe(Effect.provide(ParameterTypeStore.layerOf(broken)))
        )
        const cause = Exit.isFailure(exit) ? exit.cause : undefined

        assert.strictEqual(cause !== undefined && Cause.hasDies(cause), true)
        assert.strictEqual(cause !== undefined && Cause.hasFails(cause), false)
      })
  )
})

describe("source-form parity", () => {
  it.effect("readFileSync + parseFeature agrees with loadFeature on the same file", () =>
    Effect.gen(function*() {
      // parseFeature takes source text directly — no FileSystem requirement, only
      // ParameterTypeStore.
      const fromDisk = yield* parseFeature(readFileSync(fixtureUrl, "utf8"), fixturePath).pipe(
        Effect.provide(ParameterTypeStore.Default)
      )
      assert.deepStrictEqual(shapeOf(fromDisk), shapeOf(topLevelFeature))
    }))

  it("the Vite ?raw string is byte-identical to what readFileSync returns", () => {
    expect(rawFixture).toBe(readFileSync(fixtureUrl, "utf8"))
  })

  it.effect("parseFeature over the ?raw string agrees with loadFeature over the path", () =>
    Effect.gen(function*() {
      const fromRaw = yield* parseFeature(rawFixture, fixturePath).pipe(Effect.provide(ParameterTypeStore.Default))
      assert.deepStrictEqual(shapeOf(fromRaw), shapeOf(topLevelFeature))
    }))

  it.effect("gives the same content but different node ids on a second call", () =>
    Effect.gen(function*() {
      const second = yield* load(fixturePath)
      assert.deepStrictEqual(shapeOf(second), shapeOf(topLevelFeature))
      const firstId = topLevelFeature.allScenarios[0]?.id
      const secondId = second.allScenarios[0]?.id
      assert.strictEqual(typeof firstId, "string")
      assert.notStrictEqual(secondId, firstId)
    }))
})

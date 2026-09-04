/**
 * BEH-EC-015 (roadmap success criterion 2) end to end, through the REAL `loadFeature`.
 */
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { StepPatternError } from "../src/Errors.ts"
import { loadFeature, parseFeature } from "../src/loadFeature.ts"
import type { ParameterTypeRegistry } from "../src/Model.ts"
import { createParameterTypeStore, ParameterTypeStore, type ParameterTypeStoreShape } from "../src/ParameterTypes.ts"
import { createStepMatcher, type StepMatch } from "../src/StepMatcher.ts"

/**
 * `loadFeature` requires `FileSystem.FileSystem | ParameterTypeStore` as of ADR-EC-023 —
 * `Effect.runSync` no longer works for `loadFeature` (the real `NodeFileSystem` suspends), so
 * `load` provides both Layers and runs via `Effect.runPromise`. `parseFeature` only requires
 * `ParameterTypeStore`, and `Layer.succeed`-backed services are confirmed `runSync`-safe (unlike
 * `FileSystem`), so `parse` still uses `Effect.runSync`. Both default to
 * `ParameterTypeStore.Default` when the caller doesn't supply a Layer, matching the old
 * "omitted option = default store" behavior.
 */
const load = (path: string, parameterTypes: Layer.Layer<ParameterTypeStore> = ParameterTypeStore.Default) =>
  Effect.runPromise(loadFeature(path).pipe(Effect.provide(Layer.mergeAll(NodeFileSystem.layer, parameterTypes))))
const parse = (
  source: string,
  uri: string,
  parameterTypes: Layer.Layer<ParameterTypeStore> = ParameterTypeStore.Default
) => Effect.runSync(parseFeature(source, uri).pipe(Effect.provide(parameterTypes)))

/**
 * Two DIFFERENT fixtures, so "two separate calls" is genuinely two files and not one file twice.
 * Both are Group D correctness fixtures and parse cleanly — see `fixtures/README.md`.
 */
const fixtureA = fileURLToPath(new URL("./fixtures/correlation-full.feature", import.meta.url))
const fixtureB = fileURLToPath(new URL("./fixtures/dialect-fr.feature", import.meta.url))

/** What the `money` transform produces: an object, so a passthrough string cannot masquerade as it. */
interface Money {
  readonly amount: number
}

/** A store carrying exactly one custom parameter type, defined ONCE, as data. */
const storeWithMoney = (): ParameterTypeStoreShape => {
  const store = createParameterTypeStore()
  store.define<Money>({
    name: "money",
    regexp: "\\d+",
    transform: (...match) => ({ amount: Number(match[0]) }),
    definedAt: Option.some("test/ParameterTypeLifecycle.test.ts"),
    useForSnippets: Option.none(),
    preferForRegexpMatch: Option.none()
  })
  return store
}

/**
 * Match `I pay 42` against `I pay {money}` using the registry THIS feature was handed.
 *
 * Going through `createStepMatcher` is the point: `lookupByTypeName` returning something only
 * proves a name is present, while an actual match proves the replayed definition is the one the
 * compiled expression resolved and that its transform ran.
 */
const payMatchOf = (registry: ParameterTypeRegistry): ReadonlyArray<StepMatch<string>> =>
  createStepMatcher({
    registry,
    entries: [{ pattern: "I pay {money}", definition: "pay" }]
  }).match("I pay 42")

/**
 * Runs `action`, asserts it threw a `StepPatternError`, and returns it.
 *
 * Deliberately not `expect(...).toThrow()`: oxlint's `vitest(require-to-throw-message)` is
 * error-level in this repo and would force the rejection to be pinned by upstream-adjacent prose.
 */
const rejectedBy = (action: () => void): StepPatternError => {
  try {
    action()
  } catch (thrown) {
    if (thrown instanceof StepPatternError) {
      return thrown
    }
    throw thrown
  }
  throw new Error("expected define() to throw a StepPatternError, but it returned normally")
}

/**
 * Runs `action` `count` times, strictly sequentially — never concurrently. Exists because the
 * only way to guarantee each call fully completes before the next starts is an `await` inside a
 * loop, which `no-await-in-loop` flags on sight; centralizing that one, deliberate exception here
 * — instead of inline at the call site — is what the suppression below is actually annotating.
 */
const sequentially = async <A>(count: number, action: () => Promise<A>): Promise<A> => {
  let last = await action()
  for (let call = 1; call < count; call += 1) {
    // eslint-disable-next-line no-await-in-loop -- the entire point of this helper is serial execution
    last = await action()
  }
  return last
}

describe("a custom parameter type defined once resolves in two separate loadFeature calls", () => {
  it("resolves {money} in both calls and matches step text against each call's own registry", async () => {
    const store = storeWithMoney()
    const storeLayer = ParameterTypeStore.layerOf(store)

    // No try/catch anywhere in this test on purpose: a throw from either call fails it outright,
    // which is exactly the assertion the criterion asks for. This is the case a process-global
    // registry fails on call two — the first call's names are already registered, so the replay
    // collides — and the case a top-level-registration-into-a-per-call-registry design fails on
    // call two for the opposite reason: the registry that was written to no longer exists.
    const featureA = await load(fixtureA, storeLayer)
    const featureB = await load(fixtureB, storeLayer)

    expect(featureA.parameterTypes.lookupByTypeName("money")).toBeDefined()
    expect(featureB.parameterTypes.lookupByTypeName("money")).toBeDefined()

    const matchesA = payMatchOf(featureA.parameterTypes)
    const matchesB = payMatchOf(featureB.parameterTypes)

    expect(matchesA).toHaveLength(1)
    expect(matchesB).toHaveLength(1)
    expect(matchesA[0]?.args).toEqual([{ amount: 42 }])
    expect(matchesB[0]?.args).toEqual([{ amount: 42 }])
  })

  it("hands the two calls two DIFFERENT registry objects", async () => {
    const storeLayer = ParameterTypeStore.layerOf(storeWithMoney())
    const featureA = await load(fixtureA, storeLayer)
    const featureB = await load(fixtureB, storeLayer)

    // Reference inequality, and nothing weaker. A memoized registry passes every other assertion
    // in this file; this is the only one it fails.
    expect(featureA.parameterTypes).not.toBe(featureB.parameterTypes)
  })

  it("does not accumulate across twenty repeated calls on the same fixture", async () => {
    const storeLayer = ParameterTypeStore.layerOf(storeWithMoney())

    // Sequential on purpose, not `Promise.all`: the criterion is that REPEATED, ORDERED calls on
    // one store don't accumulate cross-call state — a process-global registry fails on exactly a
    // second SEQUENTIAL call (see the test above this describe block).
    const last = await sequentially(20, () => load(fixtureA, storeLayer))

    expect(last.parameterTypes.lookupByTypeName("money")).toBeDefined()
    expect(payMatchOf(last.parameterTypes)[0]?.args).toEqual([{ amount: 42 }])
  })
})

describe("the default store path", () => {
  it("gives a one-argument loadFeature call a registry carrying the built-ins", async () => {
    // The path a real consumer takes. Reads only — nothing is ever defined into the default store
    // from this file.
    const feature = await load(fixtureA)

    expect(feature.parameterTypes.lookupByTypeName("int")).toBeDefined()
    expect(feature.parameterTypes.lookupByTypeName("word")).toBeDefined()
  })
})

describe("a built-in name is rejected before any feature is loaded", () => {
  it("throws BuiltInParameterTypeName from define, with no loadFeature call involved", () => {
    const store = createParameterTypeStore()

    // Roadmap success criterion 3, observed from the consumer's side: the rejection lands on the
    // caller's own `define` call, not several modules away inside a later `loadFeature`.
    const error = rejectedBy(() => {
      store.define<number>({
        name: "int",
        regexp: "\\d+",
        transform: (...match) => Number(match[0]),
        definedAt: Option.none(),
        useForSnippets: Option.none(),
        preferForRegexpMatch: Option.none()
      })
    })

    expect(error.reason).toBe("BuiltInParameterTypeName")
    expect(error.parameterTypeName).toEqual(Option.some("int"))
  })
})

describe("parseFeature honours the same Layer", () => {
  it("resolves the store's custom type for an inline source string", () => {
    const source = "Feature: inline\n\n  Scenario: pays\n    Given I pay 42\n"
    const feature = parse(source, "inline.feature", ParameterTypeStore.layerOf(storeWithMoney()))

    expect(feature.parameterTypes.lookupByTypeName("money")).toBeDefined()
    expect(payMatchOf(feature.parameterTypes)[0]?.args).toEqual([{ amount: 42 }])
  })
})

describe("the new Layer does not disturb the existing contract", () => {
  it("still accepts BEH-EC-001's one-argument call form", async () => {
    const feature = await load(fixtureA)

    expect(Array.isArray(feature.warnings)).toBe(true)
    expect(feature.warnings).toHaveLength(0)
  })

  it("leaves uri, name, allScenarios and warnings exactly as they were", async () => {
    const feature = await load(fixtureA, ParameterTypeStore.layerOf(storeWithMoney()))

    expect(feature.uri).toBe(fixtureA)
    expect(feature.name).toBe("correlation across every nesting level")
    expect(Array.isArray(feature.allScenarios)).toBe(true)
    expect(feature.allScenarios.length).toBeGreaterThan(0)
    expect(Array.isArray(feature.warnings)).toBe(true)
  })
})

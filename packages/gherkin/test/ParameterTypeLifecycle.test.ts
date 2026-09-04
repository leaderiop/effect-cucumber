/**
 * BEH-EC-015 (roadmap success criterion 2) end to end, through the REAL `loadFeature`.
 */
import { assert, describe, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import { fileURLToPath } from "node:url"
import { StepPatternError } from "../src/Errors.ts"
import type { ParameterTypeRegistry } from "../src/Model.ts"
import { createParameterTypeStore, ParameterTypeStore, type ParameterTypeStoreShape } from "../src/ParameterTypes.ts"
import { createStepMatcher, type StepMatch } from "../src/StepMatcher.ts"
import { load, parse } from "./support/loadFixture.ts"

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
 * Runs `action`, requires it to fail with a `StepPatternError`, and returns it.
 *
 * A failure of any other kind propagates rather than being absorbed: swallowing it would let a
 * `TypeError` inside `define` masquerade as a correctly reported rejection.
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

describe("a custom parameter type defined once resolves in two separate loadFeature calls", () => {
  it.effect("resolves {money} in both calls and matches step text against each call's own registry", () =>
    Effect.gen(function*() {
      const store = storeWithMoney()
      const storeLayer = ParameterTypeStore.layerOf(store)

      // No catch anywhere in this test on purpose: a failure from either call fails the Effect,
      // which fails this test outright — exactly the assertion the criterion asks for. This is
      // the case a process-global registry fails on call two — the first call's names are
      // already registered, so the replay collides — and the case a
      // top-level-registration-into-a-per-call-registry design fails on call two for the
      // opposite reason: the registry that was written to no longer exists.
      const featureA = yield* load(fixtureA, storeLayer)
      const featureB = yield* load(fixtureB, storeLayer)

      assert.isDefined(featureA.parameterTypes.lookupByTypeName("money"))
      assert.isDefined(featureB.parameterTypes.lookupByTypeName("money"))

      const matchesA = payMatchOf(featureA.parameterTypes)
      const matchesB = payMatchOf(featureB.parameterTypes)

      assert.lengthOf(matchesA, 1)
      assert.lengthOf(matchesB, 1)
      assert.deepStrictEqual(matchesA[0]?.args, [{ amount: 42 }])
      assert.deepStrictEqual(matchesB[0]?.args, [{ amount: 42 }])
    }))

  it.effect("hands the two calls two DIFFERENT registry objects", () =>
    Effect.gen(function*() {
      const storeLayer = ParameterTypeStore.layerOf(storeWithMoney())
      const featureA = yield* load(fixtureA, storeLayer)
      const featureB = yield* load(fixtureB, storeLayer)

      // Reference inequality, and nothing weaker. A memoized registry passes every other
      // assertion in this file; this is the only one it fails.
      assert.notStrictEqual(featureA.parameterTypes, featureB.parameterTypes)
    }))

  it.effect("does not accumulate across twenty repeated calls on the same fixture", () =>
    Effect.gen(function*() {
      const storeLayer = ParameterTypeStore.layerOf(storeWithMoney())

      // Sequential on purpose, not concurrent: the criterion is that REPEATED, ORDERED calls on
      // one store don't accumulate cross-call state — a process-global registry fails on exactly
      // a second SEQUENTIAL call (see the test above this describe block). `Effect.forEach` is
      // sequential by default (no `{ concurrency: 1 }` needed), which is what makes it a direct
      // replacement for a hand-rolled `for` loop here, not merely a stylistic one.
      const results = yield* Effect.forEach(Array.from({ length: 20 }), () => load(fixtureA, storeLayer))
      const last = results.at(-1)!

      assert.isDefined(last.parameterTypes.lookupByTypeName("money"))
      assert.deepStrictEqual(payMatchOf(last.parameterTypes)[0]?.args, [{ amount: 42 }])
    }))
})

describe("the default store path", () => {
  it.effect("gives a one-argument loadFeature call a registry carrying the built-ins", () =>
    Effect.gen(function*() {
      // The path a real consumer takes. Reads only — nothing is ever defined into the default
      // store from this file.
      const feature = yield* load(fixtureA)

      assert.isDefined(feature.parameterTypes.lookupByTypeName("int"))
      assert.isDefined(feature.parameterTypes.lookupByTypeName("word"))
    }))
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

    assert.strictEqual(error.reason, "BuiltInParameterTypeName")
    assert.deepStrictEqual(error.parameterTypeName, Option.some("int"))
  })
})

describe("parseFeature honours the same Layer", () => {
  it.effect("resolves the store's custom type for an inline source string", () =>
    Effect.gen(function*() {
      const source = "Feature: inline\n\n  Scenario: pays\n    Given I pay 42\n"
      const feature = yield* parse(source, "inline.feature", ParameterTypeStore.layerOf(storeWithMoney()))

      assert.isDefined(feature.parameterTypes.lookupByTypeName("money"))
      assert.deepStrictEqual(payMatchOf(feature.parameterTypes)[0]?.args, [{ amount: 42 }])
    }))
})

describe("the new Layer does not disturb the existing contract", () => {
  it.effect("still accepts BEH-EC-001's one-argument call form", () =>
    Effect.gen(function*() {
      const feature = yield* load(fixtureA)

      assert.isTrue(Array.isArray(feature.warnings))
      assert.lengthOf(feature.warnings, 0)
    }))

  it.effect("leaves uri, name, allScenarios and warnings exactly as they were", () =>
    Effect.gen(function*() {
      const feature = yield* load(fixtureA, ParameterTypeStore.layerOf(storeWithMoney()))

      assert.strictEqual(feature.uri, fixtureA)
      assert.strictEqual(feature.name, "correlation across every nesting level")
      assert.isTrue(Array.isArray(feature.allScenarios))
      assert.isAbove(feature.allScenarios.length, 0)
      assert.isTrue(Array.isArray(feature.warnings))
    }))
})

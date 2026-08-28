/**
 * MATCH-02 (roadmap success criterion 2) end to end, through the REAL `loadFeature`.
 *
 * A custom parameter type declared once as data must resolve in TWO separate `loadFeature` calls
 * in the same process, with no duplicate-registration throw on the second. Every other Phase 3
 * test exercises `ParameterTypes.ts` or `StepMatcher.ts` in isolation against a hand-built
 * registry; this file is the only one that goes through the composition root, which is what makes
 * it the executable form of the criterion rather than a restatement of a unit test.
 *
 * ## This file never writes to the module-level default store
 *
 * `defaultParameterTypeStore` is append-only for the life of the process — there is no `remove`
 * and no `clear`, by design. A definition recorded into it here would be visible to every later
 * test in the same worker, and a second run of the same name would fail with
 * `DuplicateParameterTypeName` for reasons having nothing to do with what that test checks. Every
 * test below that needs a custom type builds its own store with `createParameterTypeStore()` and
 * passes it through `LoadFeatureOptions`, which is the whole reason that option exists. The one
 * test that touches the default store only READS from it, via a built-in name.
 *
 * ## Imports
 *
 * `../src/*.ts` directly, never `../src/index.ts`: `effect/no-import-from-barrel-package` runs
 * with `checkRelativeIndexImports: true` and fails `pnpm lint` on a relative value-import whose
 * basename is `index.*`.
 */
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { StepPatternError } from "../src/Errors.ts"
import { loadFeature, parseFeature } from "../src/loadFeature.ts"
import type { ParameterTypeRegistry } from "../src/Model.ts"
import { createParameterTypeStore, type ParameterTypeStore } from "../src/ParameterTypes.ts"
import { createStepMatcher, type StepMatch } from "../src/StepMatcher.ts"

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
const storeWithMoney = (): ParameterTypeStore => {
  const store = createParameterTypeStore()
  store.define<Money>({
    name: "money",
    regexp: "\\d+",
    transform: (...match) => ({ amount: Number(match[0]) }),
    definedAt: "test/ParameterTypeLifecycle.test.ts"
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

describe("a custom parameter type defined once resolves in two separate loadFeature calls", () => {
  it("resolves {money} in both calls and matches step text against each call's own registry", () => {
    const store = storeWithMoney()

    // No try/catch anywhere in this test on purpose: a throw from either call fails it outright,
    // which is exactly the assertion the criterion asks for. This is the case a process-global
    // registry fails on call two — the first call's names are already registered, so the replay
    // collides — and the case a top-level-registration-into-a-per-call-registry design fails on
    // call two for the opposite reason: the registry that was written to no longer exists.
    const featureA = loadFeature(fixtureA, { parameterTypes: store })
    const featureB = loadFeature(fixtureB, { parameterTypes: store })

    expect(featureA.parameterTypes.lookupByTypeName("money")).toBeDefined()
    expect(featureB.parameterTypes.lookupByTypeName("money")).toBeDefined()

    const matchesA = payMatchOf(featureA.parameterTypes)
    const matchesB = payMatchOf(featureB.parameterTypes)

    expect(matchesA).toHaveLength(1)
    expect(matchesB).toHaveLength(1)
    expect(matchesA[0]?.args).toEqual([{ amount: 42 }])
    expect(matchesB[0]?.args).toEqual([{ amount: 42 }])
  })

  it("hands the two calls two DIFFERENT registry objects", () => {
    const store = storeWithMoney()
    const featureA = loadFeature(fixtureA, { parameterTypes: store })
    const featureB = loadFeature(fixtureB, { parameterTypes: store })

    // Reference inequality, and nothing weaker. A memoized registry passes every other assertion
    // in this file; this is the only one it fails.
    expect(featureA.parameterTypes).not.toBe(featureB.parameterTypes)
  })

  it("does not accumulate across twenty repeated calls on the same fixture", () => {
    const store = storeWithMoney()

    let last = loadFeature(fixtureA, { parameterTypes: store })
    for (let call = 1; call < 20; call += 1) {
      last = loadFeature(fixtureA, { parameterTypes: store })
    }

    expect(last.parameterTypes.lookupByTypeName("money")).toBeDefined()
    expect(payMatchOf(last.parameterTypes)[0]?.args).toEqual([{ amount: 42 }])
  })
})

describe("the default store path", () => {
  it("gives a one-argument loadFeature call a registry carrying the built-ins", () => {
    // The path a real consumer takes. Reads only — nothing is ever defined into the default store
    // from this file.
    const feature = loadFeature(fixtureA)

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
      store.define<number>({ name: "int", regexp: "\\d+", transform: (...match) => Number(match[0]) })
    })

    expect(error.reason).toBe("BuiltInParameterTypeName")
    expect(error.parameterTypeName).toBe("int")
  })
})

describe("parseFeature honours the same option", () => {
  it("resolves the store's custom type for an inline source string", () => {
    const source = "Feature: inline\n\n  Scenario: pays\n    Given I pay 42\n"
    const feature = parseFeature(source, "inline.feature", { parameterTypes: storeWithMoney() })

    expect(feature.parameterTypes.lookupByTypeName("money")).toBeDefined()
    expect(payMatchOf(feature.parameterTypes)[0]?.args).toEqual([{ amount: 42 }])
  })
})

describe("the new option does not disturb the existing contract", () => {
  it("still accepts BEH-EC-001's one-argument call form", () => {
    const feature = loadFeature(fixtureA)

    expect(Array.isArray(feature.warnings)).toBe(true)
    expect(feature.warnings).toHaveLength(0)
  })

  it("leaves uri, name, allScenarios and warnings exactly as they were", () => {
    const feature = loadFeature(fixtureA, { parameterTypes: storeWithMoney() })

    expect(feature.uri).toBe(fixtureA)
    expect(feature.name).toBe("correlation across every nesting level")
    expect(Array.isArray(feature.allScenarios)).toBe(true)
    expect(feature.allScenarios.length).toBeGreaterThan(0)
    expect(Array.isArray(feature.warnings)).toBe(true)
  })
})

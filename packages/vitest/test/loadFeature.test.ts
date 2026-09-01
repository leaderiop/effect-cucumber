/**
 * `loadFeature` (ADR-EC-024): the Promise-returning wrapper over a module-scoped ManagedRuntime.
 *
 * Mutations that turn this file red: dropping the `ParameterTypeStore` default; providing the
 * per-call store OUTSIDE the runtime (the override would then lose to the runtime's base Layer);
 * catching the typed failure and rethrowing a plain Error.
 */
import { createParameterTypeStore, LoadFeatureError, ParameterTypeStore } from "@effect-cucumber/gherkin"
import { describe, expect, it } from "@effect/vitest"
import * as Option from "effect/Option"
import { fileURLToPath } from "node:url"
import { loadFeature } from "../src/loadFeature.ts"

const fixture = fileURLToPath(new URL("./fixtures/load-feature.feature", import.meta.url))

describe("loadFeature", () => {
  it("resolves a ParsedFeature from a path with the built-ins-only store by default", async () => {
    const feature = await loadFeature(fixture)
    expect(feature.name).toBe("Loaded through the vitest wrapper")
    expect(feature.scenarios).toHaveLength(1)
    expect(feature.parameterTypes.lookupByTypeName("int")).toBeDefined()
    expect(feature.parameterTypes.lookupByTypeName("money")).toBeUndefined()
  })

  it("lets a per-call ParameterTypeStore Layer win over the default", async () => {
    const store = createParameterTypeStore()
    store.define({
      name: "money",
      regexp: /\d+ [A-Z]{3}/,
      transform: (text) => text,
      definedAt: Option.none(),
      useForSnippets: Option.none(),
      preferForRegexpMatch: Option.none()
    })
    const feature = await loadFeature(fixture, ParameterTypeStore.layerOf(store))
    expect(feature.parameterTypes.lookupByTypeName("money")).toBeDefined()
  })

  it("is repeatable: two loads of one file on the shared runtime agree", async () => {
    const [first, second] = await Promise.all([loadFeature(fixture), loadFeature(fixture)])
    expect(first.name).toBe(second.name)
    expect(first.scenarios.map((s) => s.name)).toEqual(second.scenarios.map((s) => s.name))
  })

  it("rejects a missing path with the gherkin package's typed LoadFeatureError", async () => {
    const missing = fileURLToPath(new URL("./fixtures/does-not-exist.feature", import.meta.url))
    let caught: unknown = null
    try {
      await loadFeature(missing)
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(LoadFeatureError)
    expect((caught as LoadFeatureError).reason).toBe("MissingFile")
  })
})

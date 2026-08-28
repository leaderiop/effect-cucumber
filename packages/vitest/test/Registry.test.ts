/**
 * DSL-04's per-instance isolation, proven at runtime.
 *
 * The requirement is that two registries built in ONE process share no step definitions and no
 * scope stack. That claim has a specific failure mode — a factory that closes over module-level
 * state — and a specific trap: such a factory still returns two different objects, so every
 * reference-identity check passes while nothing is isolated. The assertions below are chosen so
 * that hoisting `records` or `stack` out of `createRegistry` makes at least one of them fail.
 * `packages/gherkin/test/ParameterTypeLifecycle.test.ts` proves the same proposition one package
 * over, and is the file this one is modelled on.
 *
 * ## Imports
 *
 * `../src/*.ts` directly, never `../src/index.ts`: `effect/no-import-from-barrel-package` runs
 * with `checkRelativeIndexImports: true` and fails `pnpm lint` on a relative value-import whose
 * basename is `index.*`. `Registry` is not in that barrel anyway (Registry.ts note (d)).
 */
import { describe, expect, it } from "vitest"
import { createRegistry, type RegistryScope } from "../src/Registry.ts"

/** A step body's real type belongs to the DSL; this file only needs something identifiable. */
type Body = () => string

const scenario = (name: string): RegistryScope => ({ kind: "scenario", name })

describe("two registries built in the same process share no state", () => {
  it("hands back two different objects", () => {
    const a = createRegistry<Body>("feature A")
    const b = createRegistry<Body>("feature B")

    // Reference inequality, and nothing weaker — but note this assertion alone proves almost
    // nothing. A factory closing over a module-level array passes it every time, which is why the
    // two tests below exist rather than this one standing in for them.
    expect(a).not.toBe(b)
  })

  it("leaves the second registry empty when the first is registered into", () => {
    const a = createRegistry<Body>("feature A")
    const b = createRegistry<Body>("feature B")

    a.register("Given", "a step in A", () => "a")

    // THE load-bearing assertion. A hoisted `records` array makes b.definitions() length 1.
    expect(a.definitions()).toHaveLength(1)
    expect(b.definitions()).toHaveLength(0)
  })

  it("leaves the second registry's scope at its own feature root when the first pushes a scope", () => {
    const a = createRegistry<Body>("feature A")
    const b = createRegistry<Body>("feature B")

    a.pushScope(scenario("a scenario in A"))

    // The scope-stack half of the same claim. A hoisted `stack` makes b report A's scenario.
    expect(a.currentScope()).toEqual({ kind: "scenario", name: "a scenario in A" })
    expect(b.currentScope()).toEqual({ kind: "feature", name: "feature B" })
  })
})

describe("definitions() returns a snapshot rather than the live array", () => {
  it("does not grow a previously returned array when another step is registered", () => {
    const registry = createRegistry<Body>("a feature")

    registry.register("Given", "the first step", () => "first")
    const captured = registry.definitions()
    expect(captured).toHaveLength(1)

    registry.register("When", "the second step", () => "second")

    // Returning the internal array directly would make `captured` length 2 here, because it would
    // be the same object the registry keeps pushing onto.
    expect(captured).toHaveLength(1)
    expect(registry.definitions()).toHaveLength(2)
  })
})

describe("the scope stack refuses to underflow", () => {
  it("throws a message naming the condition when popScope is called at the feature root", () => {
    const registry = createRegistry<Body>("a feature")

    // A bare toThrow() is rejected by oxlint's vitest/require-to-throw-message, and would also
    // pass for a TypeError thrown by an unrelated defect.
    expect(() => registry.popScope()).toThrow("scope stack underflow")
  })

  it("throws only at the root, not after a matched push and pop", () => {
    const registry = createRegistry<Body>("a feature")

    registry.pushScope(scenario("a scenario"))
    expect(() => registry.popScope()).not.toThrow()
    expect(registry.currentScope()).toEqual({ kind: "feature", name: "a feature" })
    expect(() => registry.popScope()).toThrow("scope stack underflow")
  })
})

describe("a step definition carries the scope that was current when it was registered", () => {
  it("attributes steps to the pushed scenario and to the feature root after popScope", () => {
    const registry = createRegistry<Body>("a feature")

    registry.pushScope(scenario("a scenario"))
    registry.register("When", "a step inside the scenario", () => "inner")
    registry.popScope()
    registry.register("Then", "a step back at the feature root", () => "outer")

    const [inner, outer] = registry.definitions()

    expect(inner?.scope).toEqual({ kind: "scenario", name: "a scenario" })
    expect(inner?.keyword).toBe("When")
    expect(outer?.scope).toEqual({ kind: "feature", name: "a feature" })
    expect(outer?.keyword).toBe("Then")
  })

  it("records a background scope with a null name", () => {
    const registry = createRegistry<Body>("a feature")

    registry.pushScope({ kind: "background", name: null })
    registry.register("Given", "a background step", () => "background")

    expect(registry.definitions()[0]?.scope).toEqual({ kind: "background", name: null })
  })
})

/**
 * Tests for `Registry`.
 */
import { describe, expect, it } from "vitest"
import { createRegistry, type DefinitionSite, type RegistryScope } from "../src/Registry.ts"

// A step body's real type belongs to the DSL; this file only needs something identifiable.
type Body = () => string

const scenario = (name: string): RegistryScope => ({ kind: "scenario", name, ruleId: null })

// A stand-in site for the tests that are not about the site.
const elsewhere: DefinitionSite = { file: "/repo/test/elsewhere.test.ts", line: 1, column: 1 }

describe("two registries built in the same process share no state", () => {
  it("hands back two different objects", () => {
    const a = createRegistry<Body>("feature A")
    const b = createRegistry<Body>("feature B")

    // Reference inequality, and nothing weaker — but note this assertion alone proves almost nothing.
    expect(a).not.toBe(b)
  })

  it("leaves the second registry empty when the first is registered into", () => {
    const a = createRegistry<Body>("feature A")
    const b = createRegistry<Body>("feature B")

    a.register("Given", "a step in A", () => "a", elsewhere)

    // THE load-bearing assertion.
    expect(a.definitions()).toHaveLength(1)
    expect(b.definitions()).toHaveLength(0)
  })

  it("leaves the second registry's scope at its own feature root when the first pushes a scope", () => {
    const a = createRegistry<Body>("feature A")
    const b = createRegistry<Body>("feature B")

    a.pushScope(scenario("a scenario in A"))

    // The scope-stack half of the same claim.
    expect(a.currentScope()).toEqual({ kind: "scenario", name: "a scenario in A", ruleId: null })
    expect(b.currentScope()).toEqual({ kind: "feature", name: "feature B", ruleId: null })
  })
})

describe("definitions() returns a snapshot rather than the live array", () => {
  it("does not grow a previously returned array when another step is registered", () => {
    const registry = createRegistry<Body>("a feature")

    registry.register("Given", "the first step", () => "first", elsewhere)
    const captured = registry.definitions()
    expect(captured).toHaveLength(1)

    registry.register("When", "the second step", () => "second", elsewhere)

    // Returning the internal array directly would make `captured` length 2 here, because it would be the same object
    // the registry keeps pushing onto.
    expect(captured).toHaveLength(1)
    expect(registry.definitions()).toHaveLength(2)
  })
})

describe("the scope stack refuses to underflow", () => {
  it("throws a message naming the condition when popScope is called at the feature root", () => {
    const registry = createRegistry<Body>("a feature")

    // A bare toThrow() is rejected by oxlint's vitest/require-to-throw-message, and would also pass for a TypeError
    // thrown by an unrelated defect.
    expect(() => registry.popScope()).toThrow("scope stack underflow")
  })

  it("throws only at the root, not after a matched push and pop", () => {
    const registry = createRegistry<Body>("a feature")

    registry.pushScope(scenario("a scenario"))
    expect(() => registry.popScope()).not.toThrow()
    expect(registry.currentScope()).toEqual({ kind: "feature", name: "a feature", ruleId: null })
    expect(() => registry.popScope()).toThrow("scope stack underflow")
  })
})

describe("a step definition carries the scope that was current when it was registered", () => {
  it("attributes steps to the pushed scenario and to the feature root after popScope", () => {
    const registry = createRegistry<Body>("a feature")

    registry.pushScope(scenario("a scenario"))
    registry.register("When", "a step inside the scenario", () => "inner", elsewhere)
    registry.popScope()
    registry.register("Then", "a step back at the feature root", () => "outer", elsewhere)

    const [inner, outer] = registry.definitions()

    expect(inner?.scope).toEqual({ kind: "scenario", name: "a scenario", ruleId: null })
    expect(inner?.keyword).toBe("When")
    expect(outer?.scope).toEqual({ kind: "feature", name: "a feature", ruleId: null })
    expect(outer?.keyword).toBe("Then")
  })

  it("records a background scope with a null name", () => {
    const registry = createRegistry<Body>("a feature")

    registry.pushScope({ kind: "background", name: null, ruleId: null })
    registry.register("Given", "a background step", () => "background", elsewhere)

    expect(registry.definitions()[0]?.scope).toEqual({ kind: "background", name: null, ruleId: null })
  })

  it("records a rule scope with the caller-supplied ruleId, name and all", () => {
    const registry = createRegistry<Body>("a feature")

    registry.pushScope({ kind: "rule", name: "a rule", ruleId: "r1" })
    registry.register("Given", "a step inside the rule", () => "rule", elsewhere)

    // The WHOLE object, `ruleId` included.
    expect(registry.definitions()[0]?.scope).toEqual({ kind: "rule", name: "a rule", ruleId: "r1" })
  })

  it("keeps a rule-nested background frame distinct from the Feature's own background frame", () => {
    const registry = createRegistry<Body>("a feature")

    registry.pushScope({ kind: "background", name: null, ruleId: null })
    registry.register("Given", "a feature background step", () => "feature-background", elsewhere)
    registry.popScope()

    registry.pushScope({ kind: "background", name: null, ruleId: "r1" })
    registry.register("Given", "a rule background step", () => "rule-background", elsewhere)

    const [featureLevel, ruleLevel] = registry.definitions()

    // Same `kind`, same `null` name — `ruleId` is the ONLY thing that tells these two apart, which is exactly why
    // Registry.ts records it rather than leaving Plan.ts to re-derive the nesting.
    expect(featureLevel?.scope).toEqual({ kind: "background", name: null, ruleId: null })
    expect(ruleLevel?.scope).toEqual({ kind: "background", name: null, ruleId: "r1" })
    expect(featureLevel?.scope).not.toEqual(ruleLevel?.scope)
  })
})

describe("a step definition carries the definition site it was registered with", () => {
  it("hands back the exact object it was given, not a copy or a rebuild", () => {
    const registry = createRegistry<Body>("a feature")
    const site: DefinitionSite = { file: "/repo/packages/vitest/test/example.test.ts", line: 12, column: 5 }

    registry.register("Given", "a located step", () => "located", site)

    // Reference identity, and nothing weaker.
    expect(registry.definitions()[0]?.definedAt).toBe(site)
  })

  it("preserves an absent site as null rather than substituting a placeholder", () => {
    const registry = createRegistry<Body>("a feature")

    registry.register("Given", "an unlocated step", () => "unlocated", null)

    // `null` means the capture FAILED.
    expect(registry.definitions()[0]?.definedAt).toBeNull()
  })
})

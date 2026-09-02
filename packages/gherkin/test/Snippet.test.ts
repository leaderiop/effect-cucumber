/**
 * BEH-EC-015's authoring-help half: the suggested step-definition snippet an undefined-step error
 */
import { ParameterTypeRegistry } from "@cucumber/cucumber-expressions"
import * as Option from "effect/Option"
import { describe, expect, it } from "vitest"
import { createParameterTypeStore } from "../src/ParameterTypes.ts"
import { generateStepSnippet } from "../src/Snippet.ts"

/** A registry carrying nothing but the eleven built-ins, sharing no state with any other test. */
const builtInRegistry = (): ParameterTypeRegistry => new ParameterTypeRegistry()

/** A registry carrying the built-ins plus one custom parameter type, built the way `loadFeature` builds one. */
const registryWithCustomType = (name: string, regexp: RegExp): ParameterTypeRegistry => {
  const store = createParameterTypeStore()
  store.define({
    name,
    regexp,
    transform: (matched: string) => matched,
    definedAt: Option.some("test/Snippet.test.ts"),
    useForSnippets: Option.some(true),
    preferForRegexpMatch: Option.some(true)
  })
  return store.buildRegistry()
}

/**
 * The pattern literal the snippet emitted, sliced back out of it as raw source text.
 *
 * Deliberately reads the snippet as a STRING rather than trusting the generator: the point of the
 * quote test is that this substring is a well-formed JavaScript string literal, which can only be
 * checked by parsing what was actually written.
 */
const patternLiteralOf = (snippet: string): string =>
  snippet.slice(snippet.indexOf("(") + 1, snippet.indexOf(", function*("))

describe("generateStepSnippet", () => {
  it("generalises an integer literal into {int} and annotates it number", () => {
    const snippet = generateStepSnippet({ keyword: "Given", text: "I have 5 apples", registry: builtInRegistry() })

    expect(snippet).toContain(`Given("I have {int} apples", function*(int: number) {`)
  })

  it("keeps the two parameters of a repeated type distinctly named", () => {
    const snippet = generateStepSnippet({ keyword: "When", text: "I add 3 and 4 apples", registry: builtInRegistry() })

    expect(snippet).toContain(`When("I add {int} and {int} apples", function*(int: number, int2: number) {`)
  })

  it("emits an empty parameter list for a step text with nothing to generalise", () => {
    const snippet = generateStepSnippet({ keyword: "Then", text: "nothing special", registry: builtInRegistry() })

    expect(snippet).toContain(`Then("nothing special", function*() {`)
  })

  it("uses the keyword it was given verbatim as the registrar name", () => {
    const snippet = generateStepSnippet({ keyword: "Then", text: "nothing special", registry: builtInRegistry() })

    expect(snippet.startsWith("Then(")).toBe(true)
  })

  it("escapes a double quote in the pattern so the emitted literal stays well-formed", () => {
    const snippet = generateStepSnippet({
      keyword: "Given",
      text: `I have 5 "apples`,
      registry: builtInRegistry()
    })

    // The escaped form, asserted literally: mutation A emits a bare `"` here and fails this line.
    expect(snippet).toContain(`Given("I have {int} \\"apples", function*(int: number) {`)
    // ...and the round trip, which no amount of hand-added quoting can fake.
    expect(JSON.parse(patternLiteralOf(snippet))).toBe(`I have {int} "apples`)
  })

  it("escapes a backslash in the pattern so the emitted literal stays well-formed", () => {
    const snippet = generateStepSnippet({
      keyword: "Given",
      text: "a path C:\\temp\\x",
      registry: builtInRegistry()
    })

    expect(JSON.parse(patternLiteralOf(snippet))).toBe("a path C:\\temp\\x")
  })

  it("annotates a custom parameter type unknown rather than guessing at its transform's type", () => {
    const snippet = generateStepSnippet({
      keyword: "Given",
      text: "I pick red today",
      registry: registryWithCustomType("colour", /red|blue|green/)
    })

    // `unknown` by name, not "an annotation exists": mutation B emits `any` here and fails this line.
    expect(snippet).toContain(`Given("I pick {colour} today", function*(colour: unknown) {`)
  })

  it("substitutes a positional name for a parameter type name that is not a JavaScript identifier", () => {
    // `ripe-fruit` passes `ParameterType.isValidParameterTypeName` — a hyphen is not among the
    // characters upstream rejects — but `function*(ripe-fruit: unknown)` is a syntax error.
    const snippet = generateStepSnippet({
      keyword: "Given",
      text: "I eat an apple now",
      registry: registryWithCustomType("ripe-fruit", /apple|pear/)
    })

    expect(snippet).toContain(`Given("I eat an {ripe-fruit} now", function*(arg1: unknown) {`)
  })

  for (const name of ["eval", "arguments", "yield", "class"]) {
    it(`substitutes a positional name for {${name}}, which cannot be a strict-mode generator parameter`, () => {
      const snippet = generateStepSnippet({
        keyword: "Given",
        text: "I eat an apple now",
        registry: registryWithCustomType(name, /apple|pear/)
      })

      expect(snippet).toContain(`Given("I eat an {${name}} now", function*(arg1: unknown) {`)
      // The proof that the substitution was needed: with its type annotations stripped, the emitted
      // body must parse as strict-mode JavaScript — `function*(eval) {}` does not.
      const body = snippet.slice(snippet.indexOf("function*"), snippet.lastIndexOf(")")).replace(/: \w+/g, "")
      expect(() => new Function(`"use strict"; return (${body})`)).not.toThrow()
      expect(() => new Function(`"use strict"; return (function*(${name}) {})`)).toThrow(SyntaxError)
    })
  }

  it("closes the snippet with a TODO body and a closing paren, and adds no trailing newline", () => {
    const snippet = generateStepSnippet({ keyword: "Given", text: "nothing special", registry: builtInRegistry() })

    expect(snippet).toBe(`Given("nothing special", function*() {\n  // TODO: implement this step\n})`)
  })
})

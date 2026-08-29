/**
 * MATCH-03's authoring-help half: the suggested step-definition snippet an undefined-step error
 * carries (CONTEXT.md D-01, ADR-EC-019, BEH-EC-013).
 *
 * Two properties keep this file from being vacuous, and both are asserted more strictly than they
 * look like they need to be.
 *
 * (a) **The pattern is asserted as an escaped JavaScript string literal, not as prose.** A snippet
 *     is CODE the reader is invited to paste. An implementation that interpolates the generated
 *     source straight into the template produces a perfectly readable-looking line for every step
 *     text in this repo's fixtures — it only breaks for a step text carrying a `"` or a `\`, which
 *     is exactly the input a `.feature` author writes when quoting something. The quote test
 *     therefore does not merely assert "the text appears": it slices the pattern literal back out
 *     of the snippet and `JSON.parse`s it, so the assertion fails unless the emitted literal is
 *     genuinely well-formed. Mutation A below is that assertion's justification.
 *
 * (b) **The unknown-parameter-type case asserts `unknown` by name, never "some annotation is
 *     present".** `any` would also compile, would also look fine in a terminal, and would silently
 *     hand the step author an unchecked value — the one outcome `StepArgs.ts`'s doc comment (b)
 *     rules out at the type level. Mutation B is the demonstration that this assertion separates
 *     the two.
 *
 * Mutation-tested (both performed, then reverted, both confirmed failing):
 * - A. `generateStepSnippet` renders the pattern with a plain `${source}` interpolation instead of
 *   `JSON.stringify(source)` → "escapes a double quote in the pattern" fails.
 * - B. the unknown-parameter-type fallback is changed from `?? "unknown"` to `?? "any"` → "a custom
 *   parameter type is annotated unknown" fails.
 *
 * ## Registries
 *
 * The built-in cases build a bare `new ParameterTypeRegistry()` — the snippet generator's real
 * input for a Feature with no custom parameter types, and the shape verified fact 3 of the plan was
 * recorded against. The custom cases go through this package's OWN
 * `createParameterTypeStore()` + `buildRegistry()` rather than calling upstream's
 * `defineParameterType` by hand, so they run against the registry shape `loadFeature` really
 * produces (`useForSnippets` unwrapped from an `Option`, the definition replayed into a fresh
 * registry), never a fabricated one.
 *
 * ## Imports
 *
 * `../src/Snippet.ts` and `../src/ParameterTypes.ts` directly, never `../src/index.ts`:
 * `effect/no-import-from-barrel-package` runs with `checkRelativeIndexImports: true`. `expect` is
 * used throughout because every test here is synchronous and sits directly inside `it`, where
 * oxlint's `vitest/no-standalone-expect` is satisfied.
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

  it("closes the snippet with a TODO body and a closing paren, and adds no trailing newline", () => {
    const snippet = generateStepSnippet({ keyword: "Given", text: "nothing special", registry: builtInRegistry() })

    expect(snippet).toBe(`Given("nothing special", function*() {\n  // TODO: implement this step\n})`)
  })
})

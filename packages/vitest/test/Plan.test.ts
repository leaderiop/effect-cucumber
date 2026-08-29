/**
 * `planFeature`'s contract: MATCH-03, MATCH-04 and MATCH-05, asserted end to end.
 *
 * ## The `ParsedFeature` fixtures
 *
 * Every fixture is a REAL `ParsedFeature`, parsed from an inline source with
 * `@effect-cucumber/gherkin`'s own `parseFeature` at module scope — never fabricated with a type
 * assertion. `planFeature` reads `uri`, `name`, `parameterTypes` and the whole `allScenarios` tree
 * including each step's `origin`, `line`, `keyword` and `keywordType`, and a cast would compile
 * against whatever subset a test happened to write down and would keep compiling after the contract
 * changed underneath it. `parseFeature` requires `ParameterTypeStore` and nothing else (ADR-EC-023),
 * and a `Layer.succeed`-backed service is `runSync`-safe, so these resolve at module scope with no
 * await.
 *
 * The `definitions` arrays are hand-built `StepDefinition<StepBody>` literals rather than the output
 * of `collectFeature`, so a test can put a definition at an arbitrary scope with an arbitrary
 * `definedAt` — which is the whole point of several of them, and is not reachable through the DSL.
 *
 * ## Assertions written more strictly than they look
 *
 * - **Inner-shadows-outer** uses two DIFFERENT pattern strings that both match the same step text
 *   (`I do the thing` at Scenario scope, `I do the {word}` at Feature scope), so the assertion can
 *   name WHICH one won. Asserting only `_tag: "Resolved"` would pass against an implementation that
 *   picked the Feature-level one, which is the defect.
 * - **The Scenario Outline case** asserts BOTH Examples rows resolve. One row resolving proves
 *   nothing about the scope key, because a single-row Outline's interpolated `name` and its
 *   `astName` can coincide; two rows with different interpolated names cannot both match on `name`.
 * - **Registration-order independence** compares the two `message` strings for byte equality, not
 *   just the `matchedPatterns` arrays. The message is where the ordering is actually READ by a
 *   developer, and an implementation that sorted the array while rendering the sentences from the
 *   unsorted list would pass the array check alone.
 * - **The 9-before-10 case** uses definition sites on lines 9 and 10 of one file. Any lexicographic
 *   comparison — including one over the fully formatted `file:line:column` strings — puts `10`
 *   before `9`, so this is the one assertion that discriminates a numeric site comparison from a
 *   plausible string one.
 * - **The two-definitions-one-pattern case** registers the identical pattern string at two different
 *   scopes and asserts each is tracked independently. A used-set keyed on the pattern string passes
 *   every other test in this file.
 *
 * ## Mutation-tested — the drift errors (MATCH-03 / MATCH-04)
 *
 * All three performed against the implementation, observed failing, then reverted:
 * - A. `ambiguousStep` renders the matches in the order `StepMatcher` returned them (the ordering
 *      step dropped) → the registration-order-independence test fails.
 * - B. the site comparison at that call site is replaced with one over the formatted site STRINGS →
 *      the 9-before-10 test fails.
 * - C. `undefinedStep` sets `suggestion: Option.none()` → the snippet-content assertions fail.
 *
 * ## Mutation-tested — the unused-pattern warnings (MATCH-05)
 *
 * All three performed, observed failing, then reverted:
 * - A. the used-set records only the SELECTED definition rather than every visible match → the
 *      shadowed-pattern test reports a spurious warning and fails.
 * - B. the used-set is keyed on `definition.pattern` instead of the object reference → the
 *      same-pattern-two-scopes test fails.
 * - C. the warning ordering is dropped → the order-independence test fails when the definitions are
 *      supplied in reverse.
 *
 * ## Imports
 *
 * `../src/Plan.ts` directly, never `../src/index.ts`: `Plan.ts` is not in that barrel, and
 * `effect/no-import-from-barrel-package` runs with `checkRelativeIndexImports: true` and fails
 * `pnpm lint` on a relative value-import whose basename is `index.*` anyway.
 *
 * `expect` rather than `assert` throughout, because every test here is synchronous — `planFeature`
 * returns a plain value and runs no Effect. oxlint's `vitest/no-standalone-expect` is satisfied
 * because none of these is nested in an `it.effect`.
 */
import { generateStepSnippet, ParameterTypeStore, parseFeature } from "@effect-cucumber/gherkin"
import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import {
  planFeature,
  type PlannedStep,
  type ResolvedPlannedStep,
  type StepBody,
  type UnresolvedPlannedStep
} from "../src/Plan.ts"
import type { DefinitionSite, RegistryScope, StepDefinition, StepKeyword } from "../src/Registry.ts"

/** Parse an inline Feature the way a consumer would, so the fixtures are real contract values. */
const parse = (source: string, uri: string) =>
  Effect.runSync(parseFeature(source, uri).pipe(Effect.provide(ParameterTypeStore.Default)))

const checkoutUri = "test/plan-checkout.feature"

/**
 * A Background step and two Scenario steps, one of which carries an `{int}`.
 *
 * The `{int}` is load-bearing twice over: it is the only way to observe that `args` survives the
 * join positionally and with its coercion intact, and it is what makes the undefined-step
 * suggestion a GENERALISED pattern rather than the literal step text.
 */
const checkout = parse(
  `Feature: Checkout
  Background:
    Given the cart is empty

  Scenario: paying
    When I add 3 apples
    Then the total is 3
`,
  checkoutUri
)

const shopUri = "test/plan-two-scenarios.feature"

/** Two Scenarios whose single step is worded IDENTICALLY — the scope-isolation fixture. */
const twoScenarios = parse(
  `Feature: Shop

  Scenario: A
    Given I do the thing

  Scenario: B
    Given I do the thing
`,
  shopUri
)

/**
 * A step written with the `*` keyword.
 *
 * `*` is legal Gherkin anywhere a step keyword is, and it is no registrar's name — which is the one
 * case where the suggested snippet's keyword cannot be the step's own literal keyword.
 */
const starKeyword = parse(
  `Feature: Star

  Scenario: starred
    * I do something
`,
  "test/plan-star.feature"
)

/**
 * A Scenario Outline with two Examples rows.
 *
 * The two rows share one `astName` (`adding <count>`) and have two different interpolated `name`s
 * (`adding 1`, `adding 2`), which is exactly the discrimination the scope key has to get right.
 */
const outline = parse(
  `Feature: Outline

  Scenario Outline: adding <count>
    Given I add <count> apples

    Examples:
      | count |
      | 1     |
      | 2     |
`,
  "test/plan-outline.feature"
)

/** A step body that touches no service. Never called here; only its identity is asserted. */
const noop: StepBody = () => Effect.void

const featureScope = (name: string): RegistryScope => ({ kind: "feature", name })
const backgroundScope: RegistryScope = { kind: "background", name: null }
const scenarioScope = (name: string): RegistryScope => ({ kind: "scenario", name })

/**
 * A definition site in one fixed file, so two sites differ only in their line.
 *
 * Lines 9 and 10 are the pair that matters: every lexicographic comparison — including one over the
 * fully formatted `file:line:column` string — puts `10` before `9`, so an assertion built on them
 * fails against a plausible string ordering and passes only against a numeric one.
 */
const site = (line: number): DefinitionSite => ({ file: "/repo/test/steps.ts", line, column: 5 })

/** One `StepDefinition` literal, with every field a test might want to control exposed. */
const define = (args: {
  readonly pattern: string
  readonly scope: RegistryScope
  readonly keyword?: StepKeyword
  readonly definedAt?: DefinitionSite | null
  readonly body?: StepBody
}): StepDefinition<StepBody> => ({
  keyword: args.keyword ?? "Given",
  pattern: args.pattern,
  body: args.body ?? noop,
  scope: args.scope,
  definedAt: args.definedAt ?? null
})

/**
 * Narrow a `PlannedStep` to its resolved member.
 *
 * Destructuring rather than `planned._tag`, because oxlint's `no-underscore-dangle` rejects reading
 * a leading-underscore property through member access and permits object destructuring — the same
 * workaround `test/Errors.test.ts` already carries for the same rule.
 */
const isResolved = (planned: PlannedStep): planned is ResolvedPlannedStep => {
  const { _tag } = planned
  return _tag === "Resolved"
}

/** Narrow a `PlannedStep` to its unresolved member. */
const isUnresolved = (planned: PlannedStep): planned is UnresolvedPlannedStep => {
  const { _tag } = planned
  return _tag === "Unresolved"
}

/** The pattern a step resolved to, or `null` when it did not resolve. */
const patternOf = (planned: PlannedStep | undefined): string | null =>
  planned !== undefined && isResolved(planned) ? planned.step.pattern : null

/** The resolved payload, or `null` — so an assertion reads one field without re-narrowing. */
const resolvedOf = (planned: PlannedStep | undefined): ResolvedPlannedStep["step"] | null =>
  planned !== undefined && isResolved(planned) ? planned.step : null

/** The `StepMatchError` a step failed with, or `null` when it resolved. */
const errorOf = (planned: PlannedStep | undefined): UnresolvedPlannedStep["error"] | null =>
  planned !== undefined && isUnresolved(planned) ? planned.error : null

/** Every step's discriminant, in document order. */
const tagsOf = (steps: ReadonlyArray<PlannedStep>): ReadonlyArray<string> => steps.map(({ _tag }) => _tag)

describe("planFeature — resolution and the scope chain", () => {
  it("resolves a Background step and both Scenario steps, in document order, with coerced args", () => {
    const plan = planFeature({
      feature: checkout,
      definitions: [
        define({ pattern: "the cart is empty", scope: backgroundScope }),
        define({ pattern: "I add {int} apples", scope: scenarioScope("paying"), keyword: "When" }),
        define({ pattern: "the total is {int}", scope: scenarioScope("paying"), keyword: "Then" })
      ]
    })

    expect(plan.scenarios).toHaveLength(1)
    const scenario = plan.scenarios[0]
    expect(scenario?.name).toBe("paying")
    expect(scenario?.astName).toBe("paying")
    expect(tagsOf(scenario?.steps ?? [])).toEqual(["Resolved", "Resolved", "Resolved"])

    const steps = scenario?.steps ?? []
    expect(patternOf(steps[0])).toBe("the cart is empty")
    expect(patternOf(steps[1])).toBe("I add {int} apples")
    expect(patternOf(steps[2])).toBe("the total is {int}")

    const background = resolvedOf(steps[0])
    expect(background?.origin).toBe("feature-background")
    expect(background?.args).toEqual([])

    const when = resolvedOf(steps[1])
    expect(when?.args).toEqual([3])
    expect(when?.keyword).toBe("When")
    expect(when?.origin).toBe("scenario")
    expect(when?.body).toBe(noop)
  })

  it("does not let a Background-scope pattern resolve a Scenario step", () => {
    const plan = planFeature({
      feature: checkout,
      definitions: [
        define({ pattern: "the cart is empty", scope: backgroundScope }),
        // Registered inside the Background, but the step it matches lives in the Scenario.
        define({ pattern: "I add {int} apples", scope: backgroundScope, keyword: "And" })
      ]
    })

    expect(tagsOf(plan.scenarios[0]?.steps ?? [])).toEqual(["Resolved", "Unresolved", "Unresolved"])
  })

  it("does not let a pattern registered in Scenario A resolve the same step text in Scenario B", () => {
    const plan = planFeature({
      feature: twoScenarios,
      definitions: [define({ pattern: "I do the thing", scope: scenarioScope("A") })]
    })

    expect(plan.scenarios.map((scenario) => scenario.name)).toEqual(["A", "B"])
    expect(tagsOf(plan.scenarios[0]?.steps ?? [])).toEqual(["Resolved"])
    expect(tagsOf(plan.scenarios[1]?.steps ?? [])).toEqual(["Unresolved"])

    const unresolved = errorOf(plan.scenarios[1]?.steps[0])
    expect(unresolved?.reason).toBe("UndefinedStep")
    expect(unresolved?.scenarioName).toBe("B")
  })

  it("lets a Feature-scope pattern resolve steps in every Scenario", () => {
    const plan = planFeature({
      feature: twoScenarios,
      definitions: [define({ pattern: "I do the thing", scope: featureScope("Shop") })]
    })

    expect(tagsOf(plan.scenarios[0]?.steps ?? [])).toEqual(["Resolved"])
    expect(tagsOf(plan.scenarios[1]?.steps ?? [])).toEqual(["Resolved"])
  })

  it("shadows a Feature-scope pattern with a Scenario-scope one instead of calling it ambiguous", () => {
    const plan = planFeature({
      feature: twoScenarios,
      definitions: [
        define({ pattern: "I do the {word}", scope: featureScope("Shop") }),
        define({ pattern: "I do the thing", scope: scenarioScope("A") })
      ]
    })

    expect(tagsOf(plan.scenarios[0]?.steps ?? [])).toEqual(["Resolved"])
    expect(patternOf(plan.scenarios[0]?.steps[0])).toBe("I do the thing")

    // Scenario B has no override, so the Feature-level default still serves it.
    expect(patternOf(plan.scenarios[1]?.steps[0])).toBe("I do the {word}")
  })

  it("resolves every Examples row of a Scenario Outline, proving astName is the scope key", () => {
    const plan = planFeature({
      feature: outline,
      definitions: [define({ pattern: "I add {int} apples", scope: scenarioScope("adding <count>") })]
    })

    expect(plan.scenarios).toHaveLength(2)
    expect(plan.scenarios.map((scenario) => scenario.name)).toEqual(["adding 1", "adding 2"])
    expect(plan.scenarios.map((scenario) => scenario.astName)).toEqual(["adding <count>", "adding <count>"])
    expect(tagsOf(plan.scenarios[0]?.steps ?? [])).toEqual(["Resolved"])
    expect(tagsOf(plan.scenarios[1]?.steps ?? [])).toEqual(["Resolved"])

    expect(resolvedOf(plan.scenarios[0]?.steps[0])?.args).toEqual([1])
    expect(resolvedOf(plan.scenarios[1]?.steps[0])?.args).toEqual([2])
  })
})

describe("planFeature — MATCH-03, the undefined step", () => {
  /** No definitions at all, so every step of `checkout` is undefined. */
  const nothingRegistered = () => planFeature({ feature: checkout, definitions: [] })

  it("names the step, its Feature and its line, with an empty matchedPatterns list", () => {
    const error = errorOf(nothingRegistered().scenarios[0]?.steps[1])

    expect(error?.reason).toBe("UndefinedStep")
    expect(error?.stepText).toBe("I add 3 apples")
    expect(error?.scenarioName).toBe("paying")
    expect(error?.uri).toBe(checkoutUri)
    // Hard-coded: line 6 of the `checkout` source above. Moves if that fixture is edited above it.
    expect(error?.line).toStrictEqual(Option.some(6))
    expect(error?.matchedPatterns).toEqual([])
  })

  it("carries a suggested snippet whose first line is the step's own registrar keyword", () => {
    const error = errorOf(nothingRegistered().scenarios[0]?.steps[1])
    const suggestion = Option.getOrNull(error?.suggestion ?? Option.none())

    expect(suggestion).not.toBeNull()
    // The step is written `When`, so the suggestion must be a `When` registrar — not the `Given` a
    // keywordType-first derivation would produce for a step whose type is `Action`.
    expect(suggestion?.split("\n")[0]?.startsWith("When(")).toBe(true)
    // Generalised, not literal: `3` became `{int}`. A literal-text suggestion matches one step and
    // no other, which is a suggestion the developer has to rewrite before it is useful.
    expect(suggestion).toContain("{int}")
    expect(suggestion).not.toContain("I add 3 apples")
  })

  it("starts its message with the uri:line:reason prefix and quotes the step text", () => {
    const error = errorOf(nothingRegistered().scenarios[0]?.steps[1])

    expect(error?.message.startsWith(`${checkoutUri}:6: UndefinedStep: `)).toBe(true)
    expect(error?.message).toContain(JSON.stringify("I add 3 apples"))
    expect(error?.message).toContain(JSON.stringify("paying"))
  })

  it("embeds the generated snippet in the message VERBATIM, never summarised", () => {
    const error = errorOf(nothingRegistered().scenarios[0]?.steps[1])
    // Generated independently here, against the same registry, so the assertion pins the exact
    // bytes rather than a shape this test also decides.
    const expected = generateStepSnippet({
      keyword: "When",
      text: "I add 3 apples",
      registry: checkout.parameterTypes
    })

    expect(error?.message).toContain(expected)
    expect(Option.getOrNull(error?.suggestion ?? Option.none())).toBe(expected)
  })

  it("derives the registrar keyword from keywordType when the literal keyword is not one", () => {
    const plan = planFeature({ feature: starKeyword, definitions: [] })
    const suggestion = Option.getOrNull(errorOf(plan.scenarios[0]?.steps[0])?.suggestion ?? Option.none())

    // `*` is a legal Gherkin keyword and is no registrar's name, so the suggestion has to come from
    // somewhere. It must still be one of the five a test author can actually write.
    expect(suggestion?.split("\n")[0]).toMatch(/^(Given|When|Then|And|But)\(/)
  })
})

describe("planFeature — MATCH-04, the ambiguous step", () => {
  /** Two Feature-scope patterns that both match `I do the thing`, at two known sites. */
  const thing = define({
    pattern: "I do the thing",
    scope: featureScope("Shop"),
    definedAt: site(10)
  })
  const word = define({
    pattern: "I do the {word}",
    scope: featureScope("Shop"),
    definedAt: site(9)
  })

  const ambiguity = (definitions: ReadonlyArray<StepDefinition<StepBody>>) =>
    errorOf(planFeature({ feature: twoScenarios, definitions }).scenarios[0]?.steps[0])

  it("names every matching pattern rather than silently picking one", () => {
    const error = ambiguity([thing, word])

    expect(error?.reason).toBe("AmbiguousStep")
    expect([...(error?.matchedPatterns ?? [])].toSorted()).toEqual(["I do the thing", "I do the {word}"])
    expect(error?.stepText).toBe("I do the thing")
    expect(error?.message.startsWith(`${shopUri}:4: AmbiguousStep: `)).toBe(true)
  })

  it("suggests nothing — the patterns already exist", () => {
    expect(ambiguity([thing, word])?.suggestion).toStrictEqual(Option.none())
  })

  it("names each matching pattern together with its formatted definition site", () => {
    const message = ambiguity([thing, word])?.message ?? ""

    expect(message).toContain(
      `${JSON.stringify("I do the {word}")} was registered as a Given at /repo/test/steps.ts:9:5.`
    )
    expect(message).toContain(
      `${JSON.stringify("I do the thing")} was registered as a Given at /repo/test/steps.ts:10:5.`
    )
  })

  it("orders line 9 before line 10 in the same file, numerically and not lexicographically", () => {
    // A comparison over the formatted `file:line:column` strings puts `:10:` before `:9:`, so this
    // is the one assertion in the repo that tells a numeric site order from a plausible string one.
    expect(ambiguity([thing, word])?.matchedPatterns).toEqual(["I do the {word}", "I do the thing"])
  })

  it("produces a byte-identical list AND message when the two definitions are registered in reverse", () => {
    const forward = ambiguity([thing, word])
    const backward = ambiguity([word, thing])

    expect(backward?.matchedPatterns).toEqual(forward?.matchedPatterns)
    expect(backward?.message).toBe(forward?.message)
  })

  it("lists a definition with no recorded site, in words, after every located one", () => {
    const anonymous = define({ pattern: "I do the {word}", scope: featureScope("Shop"), definedAt: null })
    const error = ambiguity([anonymous, thing])

    expect(error?.matchedPatterns).toEqual(["I do the thing", "I do the {word}"])
    expect(error?.message).toContain("was registered as a Given at an unrecorded location.")
  })
})

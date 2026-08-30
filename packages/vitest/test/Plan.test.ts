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
 * - **Every Rule-scope case** runs against the `rules` fixture, in which all THREE Scenarios are
 *   named `shared` and worded identically and only their `ruleId` differs. A fixture with distinct
 *   Scenario names would let a name-based comparison pass every isolation assertion below, which is
 *   the one defect those assertions exist to catch. `Validate.ts`'s `uniquenessKey` is
 *   `${ruleId}\0${name}`, so that document is legal Gherkin and legal here — this is a real
 *   arrangement an author can write, not a contrived one.
 * - **The cross-Rule isolation case** asserts BODY REFERENCE and not the pattern string, because it
 *   registers one identical pattern in each of two Rules. The pattern cannot name the winner, and
 *   two matches at one rank that were never visible to each other must not become an ambiguity.
 * - **The tag case** compares the WHOLE array with `toEqual`, not membership with `toContain`, and
 *   uses a two-row Outline. The order is the assertion: it is what proves the set arrived already
 *   flattened from `compile()` rather than being re-derived here, and a membership check would pass
 *   against a re-derivation that collected the same four names in another order. The tag names are
 *   `packages/gherkin/test/fixtures/correlation-full.feature`'s, so this expectation and
 *   `packages/gherkin/test/Correlate.test.ts`'s cannot drift apart.
 *
 * ## Mutation-tested — the Rule level of the scope chain (DSL-05)
 *
 * All four performed against the implementation, observed failing, then reverted:
 * - A. `isVisibleTo`'s `background` arm is restored to the pre-Phase-8
 *      `origin === "feature-background" || origin === "rule-background"` → both Background-isolation
 *      tests fail. This is the mutation that proves the behavior CHANGE is asserted rather than
 *      assumed; no pre-existing test in the repo notices it.
 * - B. `scopeRank` collapses `rule` back into `feature`'s rank → the rule-beats-feature precedence
 *      test fails with an `AmbiguousStep` instead of a resolution.
 * - C. the `ruleId` conjunct is dropped from the `scenario` arm → the same-named-Scenario-across-two-
 *      Rules test fails, and so does the Feature-level-Scenario one.
 * - D. `planStep`'s lowest-rank selection is restored to the two-level `rank === 0, else everything`
 *      split → the rule-beats-feature test fails. Rank values alone are not enough; the selection has
 *      to read them.
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
 * ## Mutation-tested — the step-argument join (BEH-EC-016)
 *
 * Both performed against `Plan.ts`'s `planStep`, observed failing, then reverted. Both are recorded
 * BECAUSE THEY WERE GREEN BEFORE THESE TESTS EXISTED — the repository had no arrangement in which an
 * append and a prepend differ, and no arrangement in which a `DocString` reached a step body at all:
 * - A. the spread is flipped to `[...step.stepArguments, ...only.args]` → both APPENDS tests fail on
 *      index 0, and nothing else in the repository notices.
 * - B. the `...step.stepArguments` half is dropped → all three tests fail on the length assertion.
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
import {
  type DataTable,
  type DocString,
  generateStepSnippet,
  ParameterTypeStore,
  type ParsedFeature,
  parseFeature
} from "@effect-cucumber/gherkin"
import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import type { UnusedStepDefinitionWarning } from "../src/Errors.ts"
import {
  type FeaturePlan,
  planFeature,
  type PlannedStep,
  type ResolvedPlannedStep,
  type ScenarioPlan,
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
 * ONE Scenario and ONE step.
 *
 * The shadowing test needs a Feature in which a shadowed Feature-level pattern has no OTHER Scenario
 * to be used by — otherwise "not reported unused" would be satisfied by the wrong reason.
 */
const single = parse(
  `Feature: Single

  Scenario: A
    Given I do the thing
`,
  "test/plan-single.feature"
)

/** Two Scenarios whose steps are worded DIFFERENTLY — the never-visible-to-a-match fixture. */
const split = parse(
  `Feature: Split

  Scenario: A
    Given only in A

  Scenario: B
    Given only in B
`,
  "test/plan-split.feature"
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

const stepArgumentsUri = "test/plan-step-arguments.feature"

/**
 * THREE steps that each carry a `.feature`-level argument, and the first two also carry a
 * cucumber-expression parameter.
 *
 * THE PATTERN PARAMETER IS THE ENTIRE POINT OF THE FIRST TWO SCENARIOS, and its absence is what let
 * `planStep`'s join go unguarded. BEH-EC-016's step-body-signature REQUIREMENT states three separate
 * things — that `stepArguments` is delivered at all, that it is APPENDED rather than prepended, and
 * that it covers a DocString as well as a DataTable — and before this fixture existed only the first
 * was asserted anywhere. Every `args` assertion in this file ran against a step with no table and no
 * doc string, and the suite's one runtime exercise of a table
 * (`test/acceptance/worked-example-03-discounts.steps.test.ts`) used the pattern
 * `"the cart contains:"`, which has ZERO parameters. With zero pattern arguments an append and a
 * prepend produce the identical one-element array, so flipping `Plan.ts`'s spread to
 * `[...step.stepArguments, ...only.args]` left the whole repository green.
 *
 * A step carrying `{int}` AND a table is the smallest arrangement in which the two orders differ,
 * and the doc-string Scenario is the only place in the repository where a `DocString` reaches
 * `ResolvedStep.args` at all — `test/acceptance/pitfalls-checklist.test.ts`'s P-20 asserts one on the
 * PARSED model, upstream of `planStep`, so the delivery arm could have been deleted outright with
 * nothing red.
 *
 * The third Scenario has no pattern parameter on purpose: it pins the single-argument case that the
 * other two would otherwise leave to inference.
 */
const stepArguments = parse(
  `Feature: Step arguments

  Scenario: a table beside a pattern argument
    Given I add 3 apples from:
      | fruit |
      | pear  |

  Scenario: a doc string beside a pattern argument
    Given I add 7 apples described as:
      """text/plain
      windfalls, bruised
      """

  Scenario: a doc string alone
    Given I read the note:
      """
      plain
      """
`,
  stepArgumentsUri
)

const rulesUri = "test/plan-rules.feature"

/**
 * Two Rules and a Feature-level Scenario, all THREE Scenarios named `shared` and all three worded
 * identically.
 *
 * `Validate.ts`'s `uniquenessKey` is `${ruleId}\0${name}`, so this document is legal Gherkin and
 * legal under this repo's own validation — which is the whole point. `astName` alone cannot tell
 * these three apart, so every isolation claim about Rule scope has to be made against a fixture
 * where the name genuinely collides, or it is being proved by the name and not by the `ruleId`.
 */
const rules = parse(
  `Feature: Rules

  Scenario: shared
    Given I do the thing

  Rule: first
    Scenario: shared
      Given I do the thing

  Rule: second
    Scenario: shared
      Given I do the thing
`,
  rulesUri
)

/**
 * A Feature-level `Background` and a Rule with its OWN `Background`.
 *
 * The Scenario inside the Rule carries three steps with two different Background origins —
 * `feature-background` then `rule-background` then `scenario` — which is the only arrangement in
 * which the two halves of `isVisibleTo`'s `background` arm can be told apart.
 */
const ruleBackgrounds = parse(
  `Feature: Backgrounds
  Background:
    Given the feature is ready

  Scenario: top level
    Given I do the thing

  Rule: r
    Background:
      Given the rule is ready

    Scenario: inside
      Given I do the thing
`,
  "test/plan-rule-backgrounds.feature"
)

const taggedUri = "test/plan-tagged.feature"

/**
 * A tag at all FOUR levels — Feature, Rule, Scenario Outline and Examples block — over an Outline
 * with TWO rows.
 *
 * The four tag names are `packages/gherkin/test/fixtures/correlation-full.feature`'s, so the
 * expectation here is byte-identical to `packages/gherkin/test/Correlate.test.ts`'s already-verified
 * ordering assertion and the two cannot drift into disagreeing about what `compile()` produces.
 *
 * TWO Examples rows and not one, which is where this fixture differs from that one: the
 * Examples-block tag is part of the flattened set on EVERY Pickle the Outline compiles to, and a
 * single-row Outline cannot tell "every row carries it" from "the one row carries it".
 */
const tagged = parse(
  `@featuretag
Feature: Tagged

  @ruletag
  Rule: a rule

    @scenariotag
    Scenario Outline: adding <count>
      Given I add <count> apples

      @exampletag
      Examples:
        | count |
        | 1     |
        | 2     |
`,
  taggedUri
)

/** A step body that touches no service. Never called here; only its identity is asserted. */
const noop: StepBody = () => Effect.void

/**
 * Two more of the same, distinguishable ONLY by reference.
 *
 * The cross-Rule isolation test registers one identical pattern string in each of two Rules, so the
 * pattern cannot say which definition won and the body has to. Declared here rather than inside that
 * test because `unicorn(consistent-function-scoping)` rejects a nested function that captures
 * nothing from its enclosing scope.
 */
const inFirstRule: StepBody = () => Effect.void
const inSecondRule: StepBody = () => Effect.void

/**
 * `ruleId` defaults to `null` on all three, because a Feature-level frame genuinely is not nested in
 * a Rule — Registry.ts note (e) reserves `null` for exactly that and for nothing else. The default
 * is not a convenience for the existing call sites; it is the correct value at every one of them.
 */
const featureScope = (name: string, ruleId: string | null = null): RegistryScope => ({
  kind: "feature",
  name,
  ruleId
})
const backgroundScope = (ruleId: string | null = null): RegistryScope => ({ kind: "background", name: null, ruleId })
const scenarioScope = (name: string, ruleId: string | null = null): RegistryScope => ({
  kind: "scenario",
  name,
  ruleId
})
/** `ruleId` is REQUIRED here: a Rule-scope frame carrying `null` would read as Feature-level. */
const ruleScope = (name: string, ruleId: string): RegistryScope => ({ kind: "rule", name, ruleId })

/**
 * The real `ParsedRule.id` a fixture's Rule was parsed with.
 *
 * Read from the parse rather than hard-coded, because the id is `Correlate.ts`'s to mint and a
 * literal here would be asserting against this test's guess at that format instead of against the
 * value `planFeature` actually receives.
 */
const ruleIdOf = (feature: ParsedFeature, name: string): string => {
  const rule = feature.rules.find((candidate) => candidate.name === name)
  if (rule === undefined) {
    throw new Error(`the fixture has no Rule named ${JSON.stringify(name)}`)
  }
  return rule.id
}

/** The planned Scenario belonging to `ruleId` — `null` for the Feature-level one. */
const scenarioIn = (plan: FeaturePlan, ruleId: string | null): ScenarioPlan | undefined =>
  plan.scenarios.find((candidate) => Option.getOrNull(candidate.ruleId) === ruleId)

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

/**
 * The `_tag` of an arbitrary `args` element, or `null` when it has none.
 *
 * `args` is `ReadonlyArray<unknown>` by design — `planStep` joins the matcher's coerced values with
 * the step's own arguments and neither side is statically known — so the step-argument tests below
 * need a total narrowing rather than a cast. Reads `_tag` by DESTRUCTURING, never by member access:
 * oxlint's `no-underscore-dangle` rejects the latter and permits the former, the same workaround
 * `isResolved` above carries. Declared at module scope because
 * `unicorn(consistent-function-scoping)` rejects a nested function that captures nothing.
 */
const argTagOf = (value: unknown): string | null => {
  if (typeof value !== "object" || value === null) {
    return null
  }
  const { _tag } = value as { readonly _tag?: unknown }
  return typeof _tag === "string" ? _tag : null
}

/** Every warning's pattern, in the order the plan returned them. */
const patternsOfWarnings = (
  warnings: ReadonlyArray<UnusedStepDefinitionWarning>
): ReadonlyArray<string> => warnings.map((warning) => warning.pattern)

describe("planFeature — resolution and the scope chain", () => {
  it("resolves a Background step and both Scenario steps, in document order, with coerced args", () => {
    const plan = planFeature({
      feature: checkout,
      definitions: [
        define({ pattern: "the cart is empty", scope: backgroundScope() }),
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
        define({ pattern: "the cart is empty", scope: backgroundScope() }),
        // Registered inside the Background, but the step it matches lives in the Scenario.
        define({ pattern: "I add {int} apples", scope: backgroundScope(), keyword: "And" })
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

/**
 * BEH-EC-016's step-body-signature REQUIREMENT, all three clauses.
 *
 * `Plan.ts` note (h) and `packages/gherkin/src/StepArguments.ts` note (b) both record that for five
 * phases `planStep` forwarded the matcher's arguments ALONE, so every body declaring a table
 * parameter received `undefined` — silently, because no document stated the delivery and no gate can
 * check a contract no document states. The document states it now; these are the gate.
 *
 * Each assertion is written to fail against a DIFFERENT single-character regression:
 * - flipping the spread to `[...step.stepArguments, ...only.args]` moves the table off index 1
 * - dropping `...step.stepArguments` entirely empties the tail
 * - a delivery that handled only the `DataTable` arm leaves the doc-string Scenario with `[7]`
 */
describe("planFeature — the step-argument join (BEH-EC-016)", () => {
  it("APPENDS a DataTable after the pattern's own coerced arguments", () => {
    const plan = planFeature({
      feature: stepArguments,
      definitions: [
        define({
          pattern: "I add {int} apples from:",
          scope: scenarioScope("a table beside a pattern argument")
        })
      ]
    })

    const args = resolvedOf(plan.scenarios[0]?.steps[0])?.args
    // Length FIRST and by itself, so a regression that drops the tail is attributed to the drop
    // rather than reported as an index mismatch.
    expect(args).toHaveLength(2)
    // `toBe`, not `toEqual`: this is the coerced `{int}`, and it must be at index 0.
    expect(args?.[0]).toBe(3)
    expect(argTagOf(args?.[1])).toBe("DataTable")

    // The table is the STEP's, not some other step's — asserted through the accessor a body would
    // actually call, so a delivery that forwarded a correctly-tagged but wrong table is caught.
    const table = args?.[1] as DataTable
    expect(table.raw()).toEqual([["fruit"], ["pear"]])
    expect(table.uri).toBe(stepArgumentsUri)
  })

  it("APPENDS a DocString after the pattern's own coerced arguments, mediaType included", () => {
    const plan = planFeature({
      feature: stepArguments,
      definitions: [
        define({
          pattern: "I add {int} apples described as:",
          scope: scenarioScope("a doc string beside a pattern argument")
        })
      ]
    })

    const args = resolvedOf(plan.scenarios[1]?.steps[0])?.args
    expect(args).toHaveLength(2)
    expect(args?.[0]).toBe(7)
    expect(argTagOf(args?.[1])).toBe("DocString")

    const docString = args?.[1] as DocString
    expect(docString.content).toBe("windfalls, bruised")
    // An `Option`, not a bare string — ADR-EC-022 put this whole surface on `Option<T>`, and an
    // assertion that read `"text/plain"` here would pass against a regression that unwrapped it.
    expect(Option.getOrNull(docString.mediaType)).toBe("text/plain")
  })

  it("delivers a lone DocString as the only argument, with mediaType absent", () => {
    const plan = planFeature({
      feature: stepArguments,
      definitions: [define({ pattern: "I read the note:", scope: scenarioScope("a doc string alone") })]
    })

    const args = resolvedOf(plan.scenarios[2]?.steps[0])?.args
    expect(args).toHaveLength(1)
    expect(argTagOf(args?.[0])).toBe("DocString")

    const docString = args?.[0] as DocString
    expect(docString.content).toBe("plain")
    expect(Option.isNone(docString.mediaType)).toBe(true)
  })
})

describe("planFeature — the Rule level of the scope chain", () => {
  const firstRuleId = ruleIdOf(rules, "first")
  const secondRuleId = ruleIdOf(rules, "second")

  it("parses two distinct Rule ids for two Rules, so the fixture can discriminate at all", () => {
    // Not a tautology: every isolation assertion below is `===` between two ids, and all of them
    // would pass vacuously against a parse that minted one id for both Rules.
    expect(firstRuleId).not.toBe(secondRuleId)
    expect(scenarioIn(planFeature({ feature: rules, definitions: [] }), null)?.astName).toBe("shared")
  })

  it("lets a Rule-scope pattern resolve steps inside that Rule and nowhere else", () => {
    const plan = planFeature({
      feature: rules,
      definitions: [define({ pattern: "I do the thing", scope: ruleScope("first", firstRuleId) })]
    })

    expect(tagsOf(scenarioIn(plan, firstRuleId)?.steps ?? [])).toEqual(["Resolved"])
    // The other Rule's Scenario is worded IDENTICALLY and named IDENTICALLY. Only the id differs.
    expect(tagsOf(scenarioIn(plan, secondRuleId)?.steps ?? [])).toEqual(["Unresolved"])
    // And a Feature-level Scenario is not inside any Rule, so it does not see a Rule's default.
    expect(tagsOf(scenarioIn(plan, null)?.steps ?? [])).toEqual(["Unresolved"])
  })

  it("never lets one Rule's registration serve another Rule's Scenario, even under one pattern text", () => {
    const plan = planFeature({
      feature: rules,
      definitions: [
        define({ pattern: "I do the thing", scope: ruleScope("first", firstRuleId), body: inFirstRule }),
        define({ pattern: "I do the thing", scope: ruleScope("second", secondRuleId), body: inSecondRule })
      ]
    })

    // NOT an ambiguity, even though both carry the same pattern at the same rank: neither was ever
    // VISIBLE to the other Rule's Scenario, so each Scenario saw exactly one match. Body identity is
    // the assertion and not the pattern string, because the pattern strings are indistinguishable —
    // which is precisely the case a name-based comparison would get wrong.
    expect(resolvedOf(scenarioIn(plan, firstRuleId)?.steps[0])?.body).toBe(inFirstRule)
    expect(resolvedOf(scenarioIn(plan, secondRuleId)?.steps[0])?.body).toBe(inSecondRule)
    expect(tagsOf(scenarioIn(plan, null)?.steps ?? [])).toEqual(["Unresolved"])
  })

  it("does not let a Scenario-scope pattern cross into a same-named Scenario in a different Rule", () => {
    const plan = planFeature({
      feature: rules,
      // All three Scenarios in this fixture have astName `shared`, so `astName` alone selects all
      // three. `Validate.ts`'s duplicate-scenario-name-across-rules fixture is the proof that this
      // document is legal, which is what makes the `ruleId` half of the check load-bearing.
      definitions: [define({ pattern: "I do the thing", scope: scenarioScope("shared", firstRuleId) })]
    })

    expect(tagsOf(scenarioIn(plan, firstRuleId)?.steps ?? [])).toEqual(["Resolved"])
    expect(tagsOf(scenarioIn(plan, secondRuleId)?.steps ?? [])).toEqual(["Unresolved"])
    expect(tagsOf(scenarioIn(plan, null)?.steps ?? [])).toEqual(["Unresolved"])
  })

  it("still scopes a Feature-level Scenario registration to the Feature level and not into a Rule", () => {
    const plan = planFeature({
      feature: rules,
      definitions: [define({ pattern: "I do the thing", scope: scenarioScope("shared") })]
    })

    expect(tagsOf(scenarioIn(plan, null)?.steps ?? [])).toEqual(["Resolved"])
    expect(tagsOf(scenarioIn(plan, firstRuleId)?.steps ?? [])).toEqual(["Unresolved"])
    expect(tagsOf(scenarioIn(plan, secondRuleId)?.steps ?? [])).toEqual(["Unresolved"])
  })

  it("keeps a Feature-scope registration visible everywhere, inside every Rule included", () => {
    const plan = planFeature({
      feature: rules,
      definitions: [define({ pattern: "I do the thing", scope: featureScope("Rules") })]
    })

    expect(tagsOf(scenarioIn(plan, null)?.steps ?? [])).toEqual(["Resolved"])
    expect(tagsOf(scenarioIn(plan, firstRuleId)?.steps ?? [])).toEqual(["Resolved"])
    expect(tagsOf(scenarioIn(plan, secondRuleId)?.steps ?? [])).toEqual(["Resolved"])
  })
})

describe("planFeature — three-level precedence, Scenario over Rule over Feature", () => {
  const firstRuleId = ruleIdOf(rules, "first")

  // Three DIFFERENT pattern strings that all match `I do the thing`, so the winner can be named.
  const atScenario = define({ pattern: "I do the thing", scope: scenarioScope("shared", firstRuleId) })
  const atRule = define({ pattern: "I do the {word}", scope: ruleScope("first", firstRuleId) })
  const atFeature = define({ pattern: "I {word} the thing", scope: featureScope("Rules") })

  const winnerInFirstRule = (definitions: ReadonlyArray<StepDefinition<StepBody>>): string | null =>
    patternOf(scenarioIn(planFeature({ feature: rules, definitions }), firstRuleId)?.steps[0])

  it("picks the Scenario-scope match when all three levels match the same step", () => {
    expect(winnerInFirstRule([atFeature, atRule, atScenario])).toBe("I do the thing")
  })

  it("picks the Rule-scope match over the Feature-scope one when the Scenario level is absent", () => {
    // The load-bearing half of the three-level rank. A rank that still collapsed `rule` into
    // `feature` would see two matches at one level here and report an AmbiguousStep instead.
    expect(winnerInFirstRule([atFeature, atRule])).toBe("I do the {word}")
  })

  it("falls back to the Feature-scope match when neither inner level matches", () => {
    expect(winnerInFirstRule([atFeature])).toBe("I {word} the thing")
  })

  it("does not report the shadowed Rule- and Feature-level patterns as unused", () => {
    // Both matched; both then lost to an inner level. Note (g)'s visible-and-matched reading, one
    // level deeper than the test that already asserts it for Feature-over-Scenario.
    const plan = planFeature({ feature: rules, definitions: [atFeature, atRule, atScenario] })

    expect(plan.warnings).toEqual([])
  })
})

describe("planFeature — a Rule's own Background", () => {
  const ruleId = ruleIdOf(ruleBackgrounds, "r")

  it("gives the Rule's Scenario a feature-background, a rule-background and a scenario step", () => {
    const plan = planFeature({
      feature: ruleBackgrounds,
      definitions: [
        define({ pattern: "the feature is ready", scope: backgroundScope() }),
        define({ pattern: "the rule is ready", scope: backgroundScope(ruleId) }),
        define({ pattern: "I do the thing", scope: featureScope("Backgrounds") })
      ]
    })

    const inside = scenarioIn(plan, ruleId)
    expect(tagsOf(inside?.steps ?? [])).toEqual(["Resolved", "Resolved", "Resolved"])
    expect(resolvedOf(inside?.steps[0])?.origin).toBe("feature-background")
    expect(resolvedOf(inside?.steps[1])?.origin).toBe("rule-background")
    expect(resolvedOf(inside?.steps[2])?.origin).toBe("scenario")

    // The Feature-level Scenario has no rule-background step of its own, so it is served entirely by
    // the Feature-level registrations — nothing regressed for the pre-Phase-8 arrangement.
    expect(tagsOf(scenarioIn(plan, null)?.steps ?? [])).toEqual(["Resolved", "Resolved"])
    expect(plan.warnings).toEqual([])
  })

  it("no longer lets a Feature-level Background registration resolve a rule-background step", () => {
    const plan = planFeature({
      feature: ruleBackgrounds,
      // Registered in the FEATURE's Background (`ruleId: null`) but worded to match the RULE's
      // Background step. This RESOLVED before this phase, because one `background` arm covered both
      // origins — a deliberate behavior change, not a bug fix, and one no pre-existing test can see.
      definitions: [define({ pattern: "the rule is ready", scope: backgroundScope() })]
    })

    expect(tagsOf(scenarioIn(plan, ruleId)?.steps ?? [])).toEqual(["Unresolved", "Unresolved", "Unresolved"])
    expect(errorOf(scenarioIn(plan, ruleId)?.steps[1])?.reason).toBe("UndefinedStep")
    // Never visible to any step anywhere, so it is also genuinely dead code — MATCH-05 agrees.
    expect(patternsOfWarnings(plan.warnings)).toEqual(["the rule is ready"])
  })

  it("does not let a rule-background registration resolve the Feature's own Background step", () => {
    const plan = planFeature({
      feature: ruleBackgrounds,
      definitions: [define({ pattern: "the feature is ready", scope: backgroundScope(ruleId) })]
    })

    // The mirror of the test above. The Feature's Background step keeps `origin:
    // "feature-background"` in BOTH Scenarios, including the one nested in the Rule.
    expect(tagsOf(scenarioIn(plan, null)?.steps ?? [])).toEqual(["Unresolved", "Unresolved"])
    expect(tagsOf(scenarioIn(plan, ruleId)?.steps ?? [])).toEqual(["Unresolved", "Unresolved", "Unresolved"])
    expect(patternsOfWarnings(plan.warnings)).toEqual(["the feature is ready"])
  })

  it("serves a rule-background step from a Rule-scope registration, the Rule-level default", () => {
    const plan = planFeature({
      feature: ruleBackgrounds,
      // `rule` scope is the Rule-level analogue of `feature` scope: visible to EVERY step of every
      // Scenario in that Rule, Background steps included. It is not a second Background container.
      definitions: [define({ pattern: "the rule is ready", scope: ruleScope("r", ruleId) })]
    })

    expect(patternOf(scenarioIn(plan, ruleId)?.steps[1])).toBe("the rule is ready")
    // ...and still not visible outside the Rule.
    expect(tagsOf(scenarioIn(plan, null)?.steps ?? [])).toEqual(["Unresolved", "Unresolved"])
  })
})

describe("planFeature — the Scenario's tag set (RUN-05)", () => {
  it("carries a Feature, Rule, Scenario and Examples tag onto the plan, in that order", () => {
    const plan = planFeature({
      feature: tagged,
      definitions: [define({ pattern: "I add {int} apples", scope: featureScope("Tagged") })]
    })

    // Whole-array `toEqual`, never `toContain` — copied from `Correlate.test.ts`'s own assertion for
    // its own reason: the ORDER is what proves the list came through `compile()`'s flattening rather
    // than from a re-derivation somewhere in this package. A `toContain` set of four passes against
    // an implementation that recomputed inheritance and happened to collect the same four names.
    expect(plan.scenarios[0]?.tags).toEqual(["@featuretag", "@ruletag", "@scenariotag", "@exampletag"])
  })

  it("gives every Examples row of an Outline the same tag set, the Examples-block tag included", () => {
    const plan = planFeature({
      feature: tagged,
      definitions: [define({ pattern: "I add {int} apples", scope: featureScope("Tagged") })]
    })

    // Two rows, so "every row carries it" is discriminated from "the first row carries it". The
    // interpolated names differ; the tag sets must not.
    expect(plan.scenarios.map((scenario) => scenario.name)).toEqual(["adding 1", "adding 2"])
    expect(plan.scenarios[1]?.tags).toEqual(["@featuretag", "@ruletag", "@scenariotag", "@exampletag"])
  })

  it("plans an untagged Scenario with a present empty array, never a missing field", () => {
    // `single` is an untagged Scenario in an untagged Feature, so there is genuinely no tag anywhere
    // to inherit. `toEqual([])` and not `toBeUndefined`: the field is REQUIRED, and the emission walk
    // reading `undefined` here would emit nothing with nothing going red.
    const plan = planFeature({ feature: single, definitions: [] })

    expect(plan.scenarios[0]?.tags).toEqual([])
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

describe("planFeature — MATCH-05, the unused step definition", () => {
  it("reports a Feature-scope pattern that matched nothing, without disturbing any Scenario", () => {
    const plan = planFeature({
      feature: twoScenarios,
      definitions: [
        define({ pattern: "I do the thing", scope: featureScope("Shop") }),
        define({ pattern: "I never appear anywhere", scope: featureScope("Shop") })
      ]
    })

    expect(patternsOfWarnings(plan.warnings)).toEqual(["I never appear anywhere"])
    // Non-fatal by decision (ADR-EC-019): the plan is still completely usable.
    expect(tagsOf(plan.scenarios[0]?.steps ?? [])).toEqual(["Resolved"])
    expect(tagsOf(plan.scenarios[1]?.steps ?? [])).toEqual(["Resolved"])
  })

  it("emits nothing when every registered pattern resolved at least one step", () => {
    const plan = planFeature({
      feature: checkout,
      definitions: [
        define({ pattern: "the cart is empty", scope: backgroundScope() }),
        define({ pattern: "I add {int} apples", scope: scenarioScope("paying"), keyword: "When" }),
        define({ pattern: "the total is {int}", scope: scenarioScope("paying"), keyword: "Then" })
      ]
    })

    expect(plan.warnings).toEqual([])
  })

  it("reports a Scenario-scope pattern whose text only ever appears in a different Scenario", () => {
    const plan = planFeature({
      feature: split,
      // Registered inside Scenario A, but `only in B` is a step of Scenario B — so this pattern was
      // never once VISIBLE to a step it could have matched.
      definitions: [define({ pattern: "only in B", scope: scenarioScope("A") })]
    })

    expect(patternsOfWarnings(plan.warnings)).toEqual(["only in B"])
  })

  it("does NOT report a pattern that matched but lost to an inner-scope registration", () => {
    const plan = planFeature({
      feature: single,
      definitions: [
        // Matches the only step in the Feature, and is then shadowed by the Scenario-scope override
        // below. That is the Feature-level-default arrangement Pattern 5 exists to support, not dead
        // code: ADR-EC-019's own wording is "matches zero steps across the whole Feature".
        define({ pattern: "I do the {word}", scope: featureScope("Single") }),
        define({ pattern: "I do the thing", scope: scenarioScope("A") })
      ]
    })

    expect(plan.warnings).toEqual([])
    expect(patternOf(plan.scenarios[0]?.steps[0])).toBe("I do the thing")
  })

  it("tracks two definitions sharing one pattern string at two scopes independently", () => {
    const plan = planFeature({
      feature: single,
      definitions: [
        // Resolves the step.
        define({ pattern: "I do the thing", scope: featureScope("Single"), definedAt: site(10) }),
        // Scoped to a Scenario this Feature does not have, so it is never visible to anything.
        define({ pattern: "I do the thing", scope: scenarioScope("nonexistent"), definedAt: site(9) })
      ]
    })

    // A used-set keyed on the pattern STRING marks both as used and reports nothing here.
    expect(plan.warnings).toHaveLength(1)
    expect(plan.warnings[0]?.definedAt).toStrictEqual(Option.some("/repo/test/steps.ts:9:5"))
  })

  it("carries the pattern, keyword, Feature name, uri and site, and says what to do", () => {
    const plan = planFeature({
      feature: twoScenarios,
      definitions: [
        define({ pattern: "I do the thing", scope: featureScope("Shop") }),
        define({
          pattern: "I never appear anywhere",
          scope: featureScope("Shop"),
          keyword: "Then",
          definedAt: site(9)
        })
      ]
    })

    const warning = plan.warnings[0]
    expect(warning?.reason).toBe("UnusedStepDefinition")
    expect(warning?.pattern).toBe("I never appear anywhere")
    expect(warning?.keyword).toBe("Then")
    expect(warning?.featureName).toBe("Shop")
    expect(warning?.uri).toBe(shopUri)
    expect(warning?.definedAt).toStrictEqual(Option.some("/repo/test/steps.ts:9:5"))

    const message = warning?.message ?? ""
    // No line number in the prefix: the Feature has no single line for this finding, so the
    // definition site carries the location instead and appears in the sentences.
    expect(message.startsWith(`${shopUri}: UnusedStepDefinition: `)).toBe(true)
    expect(message).toContain(JSON.stringify("I never appear anywhere"))
    expect(message).toContain("registered as a Then at /repo/test/steps.ts:9:5")
    expect(message).toContain(JSON.stringify("Shop"))
    expect(message).toContain("Delete it")
  })

  it("returns warnings in an order that does not depend on the registration order", () => {
    const later = define({ pattern: "unused later", scope: featureScope("Shop"), definedAt: site(10) })
    const earlier = define({ pattern: "unused earlier", scope: featureScope("Shop"), definedAt: site(9) })
    const used = define({ pattern: "I do the thing", scope: featureScope("Shop") })

    const forward = planFeature({ feature: twoScenarios, definitions: [used, later, earlier] }).warnings
    const backward = planFeature({ feature: twoScenarios, definitions: [earlier, later, used] }).warnings

    expect(patternsOfWarnings(forward)).toEqual(["unused earlier", "unused later"])
    expect(backward).toEqual(forward)
  })
})

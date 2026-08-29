/**
 * RUN-01's emission half: the SHAPE of what `emitFeature` registers — one block per Feature, one
 * nested block per `Rule`, one test per Scenario, and the unused-definition nodes last.
 *
 * ## The recording fake, and why it had to be invented here
 *
 * Nothing in this repository had a test double, spy, mock or recording fake before this file — the
 * pattern map for this phase went looking and found none — so `makeRecordingApi` below is designed
 * fresh rather than copied, and it is the house style from here on.
 *
 * It exists because the obvious alternative does not work at all. Asserting against the real
 * `describe`/`it.effect` would mean a vitest test observing what its own run registered, and a test
 * cannot see the collection it is part of: the nodes are declared during collection, this assertion
 * runs afterwards, and nothing hands the registered tree back. Substituting an injected object makes
 * the whole question ordinary — the calls land in an array and the array is a value. That is exactly
 * the payoff `.planning/research/ARCHITECTURE.md`'s Pattern 3 predicted for the seam, and this file
 * is where the indirection is paid back.
 *
 * ## Three assertions are written more strictly than they look
 *
 * - **Nesting is asserted, not just counts.** Every record carries a `depth`, so
 *   `describe(Rule) → effect(Scenario)` is distinguishable from `describe(Rule)` followed by two
 *   SIBLING `effect`s. An implementation that emits the Rule's block and then its Scenarios beside
 *   it registers the identical five calls with the identical five names, and produces a reporter
 *   tree that is simply wrong. Only the depth tells them apart — mutation A.
 * - **Every shape assertion is POSITIONAL** (`deepStrictEqual` against the whole array), never a
 *   `.some(...)` or a `.find(...)`. A search passes against an implementation that reordered the
 *   Scenarios, emitted the Rules before the Feature-level Scenarios, or hoisted the warning nodes to
 *   the top of the block — all three of which are orderings this module deliberately does not have.
 * - **The Scenario Outline case asserts BOTH rows' titles.** One row proves nothing: `astName` and
 *   `name` are the same string for every plain Scenario in every other fixture here, so titling with
 *   the wrong one is invisible until two rows of one Outline have to be told apart — mutation B.
 *
 * Mutation-tested (all three performed, then reverted, all three confirmed failing) — see the plan
 * summary for the recorded output:
 * - A. `emitFeature` emits a Rule's Scenarios as SIBLINGS of the Rule's block instead of inside it
 *      → the Rule-nesting test fails on `depth`.
 * - B. `emitFeature` titles each test with `scenarioPlan.astName` instead of `scenarioPlan.name`
 *      → the Scenario Outline test fails, because both Examples rows get the same title.
 * - C. the unused-definition node is emitted with a failing Effect instead of `Effect.void`
 *      → the always-passing test fails.
 *
 * ## The fixtures
 *
 * `ParsedFeature`s come from the real `parseFeature` at module scope, provided
 * `ParameterTypeStore.Default` and run with `Effect.runSync` — the convention
 * `test/describeFeature.test.ts` set. Never a type assertion: a cast keeps compiling after the
 * contract changes underneath it, so the assertion would go on passing while proving nothing about
 * the value that actually crosses the package boundary.
 *
 * `FeaturePlan`s come from the real `planFeature`, because the join between `plan.scenarios` (built
 * off the flat `feature.allScenarios`) and the Feature/Rule nesting this module re-derives is a real
 * part of what is under test — a hand-built plan could not get that join wrong. The one exception is
 * the hand-written warning list, which is the only way to reach an `Option.none()` definition site:
 * `planFeature` always fills the field, so the absent-site branch of the title has no other producer.
 *
 * One trivial marker Layer is shared by every test. This file asserts emission shape; Layer
 * behaviour, build counts and freshness are `test/ScenarioEffect.test.ts`'s, and duplicating them
 * here would mean two files going red for one regression. It is a `Layer.succeed` over a marker
 * service and NOT `Layer.empty`, which is the reading of the plan's "trivial Layer" that does not
 * type-check: `Layer.empty` is `Layer<never, never, never>` and `emitFeature`'s parameter is
 * `Layer<any, any, never>`, whose `ROut` this build treats as invariant — so `any` is reported as
 * not assignable to `never`. `pnpm build` and a `vitest run` both stay green on it, because neither
 * type-checks this file; only `pnpm typecheck:test` sees it.
 *
 * ## `assert` throughout
 *
 * oxlint's `vitest/no-standalone-expect` does not recognise `it.effect` as a test block, so an
 * `expect` nested in the `Effect.gen` body it takes fails `pnpm lint`. `assert` is outside that
 * rule's scope and reads the same in the synchronous tests, so this file uses it everywhere rather
 * than switching form halfway. `test/Step.test.ts` has the longer version of the argument.
 *
 * ## Imports
 *
 * `../src/Runner.ts` and its siblings directly, never `../src/index.ts`:
 * `effect/no-import-from-barrel-package` runs with `checkRelativeIndexImports: true` and fails
 * `pnpm lint` on a relative value-import whose basename is `index.*`. `emitFeature` is not in that
 * barrel anyway (Runner.ts's closing note).
 */
import { ParameterTypeStore, parseFeature } from "@effect-cucumber/gherkin"
import { assert, describe, it } from "@effect/vitest"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Layer from "effect/Layer"
import type * as Scope from "effect/Scope"
import { makeUnusedStepDefinitionWarning, type UnusedStepDefinitionWarning } from "../src/Errors.ts"
import { type FeaturePlan, planFeature, type StepBody } from "../src/Plan.ts"
import type { DefinitionSite, RegistryScope, StepDefinition, StepKeyword } from "../src/Registry.ts"
import { emitFeature } from "../src/Runner.ts"
import type { TestApi } from "../src/TestApi.ts"

/**
 * One call the fake received, with enough context to reconstruct the emitted tree.
 *
 * `depth` is what makes this more than a call log: two implementations that register the same names
 * in the same order can still build two different reporter trees, and the depth is the only thing
 * that separates them.
 *
 * `self` is the thunk `effect` was handed, kept so a test can invoke it and see which Scenario it was
 * wired to. `null` on a `describe` record, which has no thunk — a union of two record types would say
 * that more precisely, at the cost of a narrowing helper in every assertion, and every consumer here
 * already knows which kind it is looking at.
 */
type EmissionRecord = {
  readonly kind: "describe" | "effect"
  readonly name: string
  readonly depth: number
  readonly self: (() => Effect.Effect<void, unknown, Scope.Scope>) | null
}

/**
 * A `TestApi` that records what it was asked to emit instead of emitting it.
 *
 * Returned from a factory rather than declared at module scope, so each test gets its own array and
 * its own counter and the tests stay order-independent — `test/ScenarioEffect.test.ts`'s
 * `makeRecording` is the precedent, and a module-scope fake would make every assertion here depend
 * on which test ran first.
 *
 * `depth` is incremented before `define` runs and decremented in a `finally`, copying
 * `src/describeFeature.ts`'s scope-stack discipline verbatim and for the same reason: a `define` that
 * throws must not leave the counter wrong for every record that comes after it. Without the
 * `finally`, one throwing block would silently shift the depth of the entire rest of the file's
 * recording, and the assertions that failed would be the ones for the tests that came LATER — a
 * red run that points at the wrong test. One test below covers exactly that.
 */
const makeRecordingApi = (): {
  readonly api: TestApi
  readonly records: ReadonlyArray<EmissionRecord>
} => {
  const records: Array<EmissionRecord> = []
  let depth = 0
  const api: TestApi = {
    describe: (name, define) => {
      records.push({ kind: "describe", name, depth, self: null })
      depth += 1
      try {
        define()
      } finally {
        depth -= 1
      }
    },
    effect: (name, self) => {
      records.push({ kind: "effect", name, depth, self })
    }
  }
  return { api, records }
}

/** The comparable projection of a recording: everything except the thunk, which has no equality. */
const shapeOf = (
  records: ReadonlyArray<EmissionRecord>
): ReadonlyArray<{ readonly kind: string; readonly name: string; readonly depth: number }> =>
  records.map(({ depth, kind, name }) => ({ kind, name, depth }))

/**
 * The thunk recorded at `index`, or a thrown explanation.
 *
 * A helper rather than `records[index]!.self!`: under `noUncheckedIndexedAccess` the two assertions
 * would turn a wrong index into `Cannot read properties of undefined`, which says nothing about
 * which assertion was mis-indexed.
 */
const thunkAt = (
  records: ReadonlyArray<EmissionRecord>,
  index: number
): () => Effect.Effect<void, unknown, Scope.Scope> => {
  const record = records[index]
  if (record === undefined || record.self === null) {
    throw new Error(`no recorded effect thunk at index ${index} of ${records.length} records`)
  }
  return record.self
}

/** A service no step below actually reads. It exists only to keep `layer` off `Layer<never, …>`. */
class Marker extends Context.Service<Marker, { readonly who: string }>()("Marker") {}

/**
 * The Layer every test hands `emitFeature`, and the only one in this file.
 *
 * Trivial by design — see the header. `emitFeature` passes it straight through to
 * `buildScenarioEffect` without inspecting it, so nothing here can observe what it provides.
 */
const layer = Layer.succeed(Marker, Marker.of({ who: "runner-test" }))

/** Parse an inline Feature the way a consumer would, so the fixtures are real contract values. */
const parse = (source: string, uri: string) =>
  Effect.runSync(parseFeature(source, uri).pipe(Effect.provide(ParameterTypeStore.Default)))

/**
 * A Background step and two Scenarios whose own steps are worded DIFFERENTLY.
 *
 * The difference is what makes the thunk-wiring test possible: if both Scenarios ran the same step
 * text, an implementation that handed every test node the FIRST Scenario's plan would produce the
 * identical execution log.
 */
const checkout = parse(
  `Feature: Checkout
  Background:
    Given the cart is empty

  Scenario: paying
    When I pay

  Scenario: refunding
    When I refund
`,
  "test/runner-checkout.feature"
)

/** A Feature-level Scenario followed by a Rule holding two of its own. */
const shop = parse(
  `Feature: Shop

  Scenario: browsing
    When I browse

  Rule: refunds

    Scenario: refund granted
      When I get my money back

    Scenario: refund denied
      When I keep the goods
`,
  "test/runner-shop.feature"
)

/**
 * A Scenario Outline with two Examples rows.
 *
 * Both rows share the `astName` `adding <count>` and carry the distinct interpolated `name`s
 * `adding 1` and `adding 2`. This is the only fixture in the file where the two names differ, so it
 * is the only thing that can catch a title taken from the wrong field — mutation B.
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
  "test/runner-outline.feature"
)

/** A step body that touches no service. */
const noop: StepBody = () => Effect.void

const featureScope = (name: string): RegistryScope => ({ kind: "feature", name })

/** A definition site in one fixed file, so two sites differ only in their line. */
const site = (line: number): DefinitionSite => ({ file: "/repo/test/runner.steps.ts", line, column: 5 })

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

/** Every step of `checkout`, defined at Feature scope so all three resolve. */
const checkoutDefinitions: ReadonlyArray<StepDefinition<StepBody>> = [
  define({ pattern: "the cart is empty", scope: featureScope("Checkout") }),
  define({ pattern: "I pay", scope: featureScope("Checkout"), keyword: "When" }),
  define({ pattern: "I refund", scope: featureScope("Checkout"), keyword: "When" })
]

/**
 * The same three definitions, with bodies that append their own pattern to `ran`.
 *
 * The log is a plain array closed over by the bodies, and that is adequate HERE in a way it is not
 * in `test/ScenarioEffect.test.ts`: that file counts how many times a Layer was BUILT, which a
 * closed-over array cannot see. This one only needs to know which step texts ran, and the Layer is
 * empty.
 */
const recordingDefinitions = (ran: Array<string>): ReadonlyArray<StepDefinition<StepBody>> =>
  ["the cart is empty", "I pay", "I refund"].map((pattern) =>
    define({
      pattern,
      scope: featureScope("Checkout"),
      keyword: "When",
      body: () =>
        Effect.sync(() => {
          ran.push(pattern)
        })
    })
  )

/** Replace a real plan's warning list, keeping its real Feature and its real Scenario plans. */
const withWarnings = (
  base: FeaturePlan,
  warnings: ReadonlyArray<UnusedStepDefinitionWarning>
): FeaturePlan => ({ feature: base.feature, scenarios: base.scenarios, warnings })

describe("a Feature emits one block with one test per Scenario", () => {
  it("names the block after the Feature and each test after its Scenario, in document order", () => {
    const { api, records } = makeRecordingApi()

    emitFeature({
      api,
      plan: planFeature({ feature: checkout, definitions: checkoutDefinitions }),
      layer
    })

    // Positional, and over the WHOLE array: a search would pass against an implementation that
    // emitted `refunding` before `paying`, which is the reordering nothing else here can see.
    assert.deepStrictEqual(shapeOf(records), [
      { kind: "describe", name: "Checkout", depth: 0 },
      { kind: "effect", name: "paying", depth: 1 },
      { kind: "effect", name: "refunding", depth: 1 }
    ])
  })

  it("emits the tests INSIDE the Feature's block, never beside it", () => {
    const { api, records } = makeRecordingApi()

    emitFeature({
      api,
      plan: planFeature({ feature: checkout, definitions: checkoutDefinitions }),
      layer
    })

    // Exactly one record at the top level, and it is the Feature's block. An implementation that
    // registered the tests as siblings produces the same three names with two records at depth 0.
    assert.deepStrictEqual(records.filter(({ depth }) => depth === 0).map(({ name }) => name), ["Checkout"])
  })

  it("throws a located explanation when a Scenario has no plan", () => {
    const { api } = makeRecordingApi()
    // Unreachable through `planFeature`, which maps `feature.allScenarios`. Reached here by handing
    // `emitFeature` a plan whose Scenario list was emptied — the only way to exercise the branch, and
    // the branch is what stops the same state becoming a `Cannot read properties of undefined` from
    // somewhere else entirely.
    const plan: FeaturePlan = { feature: checkout, scenarios: [], warnings: [] }

    assert.throws(
      () => emitFeature({ api, plan, layer }),
      /no ScenarioPlan for scenario id/
    )
  })
})

describe("a Rule emits a nested block", () => {
  it("puts the Rule's Scenarios inside the Rule's block, and the Rule after the Feature's own", () => {
    const { api, records } = makeRecordingApi()

    emitFeature({
      api,
      plan: planFeature({
        feature: shop,
        definitions: [
          define({ pattern: "I browse", scope: featureScope("Shop"), keyword: "When" }),
          define({ pattern: "I get my money back", scope: featureScope("Shop"), keyword: "When" }),
          define({ pattern: "I keep the goods", scope: featureScope("Shop"), keyword: "When" })
        ]
      }),
      layer
    })

    // The two Rule Scenarios sit at depth 2 beneath a block at depth 1. Emitted as siblings of the
    // Rule's block they would read `depth: 1`, with every name and every position unchanged — which
    // is the whole of mutation A. `browsing` at index 1 is the Feature-level-Scenarios-first claim.
    assert.deepStrictEqual(shapeOf(records), [
      { kind: "describe", name: "Shop", depth: 0 },
      { kind: "effect", name: "browsing", depth: 1 },
      { kind: "describe", name: "refunds", depth: 1 },
      { kind: "effect", name: "refund granted", depth: 2 },
      { kind: "effect", name: "refund denied", depth: 2 }
    ])
  })
})

describe("each recorded thunk is wired to its own Scenario", () => {
  it.effect("runs that Scenario's Background and own steps, and no other Scenario's", () =>
    Effect.gen(function*() {
      const ran: Array<string> = []
      const { api, records } = makeRecordingApi()

      emitFeature({
        api,
        plan: planFeature({ feature: checkout, definitions: recordingDefinitions(ran) }),
        layer
      })

      // Nothing has run yet: `emitFeature` registers thunks, it does not execute them. An eager
      // implementation would already have both Scenarios' steps in the log here — Runner.ts note (b).
      assert.deepStrictEqual(ran, [])

      yield* thunkAt(records, 1)()
      assert.deepStrictEqual(ran, ["the cart is empty", "I pay"])

      yield* thunkAt(records, 2)()
      // The second thunk ran `I refund`, not `I pay` again: an implementation that closed over one
      // shared `scenarioPlan` would repeat the first Scenario's steps with the right test titles.
      assert.deepStrictEqual(ran, ["the cart is empty", "I pay", "the cart is empty", "I refund"])
    }))
})

describe("a Scenario Outline emits one distinctly-titled test per Examples row", () => {
  it("titles each row with its interpolated name, not the shared AST name", () => {
    const { api, records } = makeRecordingApi()

    emitFeature({
      api,
      plan: planFeature({
        feature: outline,
        definitions: [define({ pattern: "I add {int} apples", scope: featureScope("Outline") })]
      }),
      layer
    })

    // Titled with `astName`, both rows read `adding <count>` — two identically-named tests, which
    // `vitest/no-identical-title` cannot catch because it only sees literals (mutation B).
    assert.deepStrictEqual(shapeOf(records), [
      { kind: "describe", name: "Outline", depth: 0 },
      { kind: "effect", name: "adding 1", depth: 1 },
      { kind: "effect", name: "adding 2", depth: 1 }
    ])
  })
})

describe("an unused step definition surfaces as a test node", () => {
  const unusedPlan = planFeature({
    feature: checkout,
    definitions: [
      ...checkoutDefinitions,
      define({ pattern: "I never happen", scope: featureScope("Checkout"), definedAt: site(9) })
    ]
  })

  it("adds exactly one node, titled with the keyword, the pattern and the site, AFTER every Scenario", () => {
    const { api, records } = makeRecordingApi()

    emitFeature({ api, plan: unusedPlan, layer })

    // Last, not first. Hoisted to the top of the block the Feature's own Scenarios get pushed below a
    // variable-length list of footnotes — Runner.ts note (c).
    assert.deepStrictEqual(shapeOf(records), [
      { kind: "describe", name: "Checkout", depth: 0 },
      { kind: "effect", name: "paying", depth: 1 },
      { kind: "effect", name: "refunding", depth: 1 },
      {
        kind: "effect",
        name: `⚠ unused step definition: Given "I never happen" (/repo/test/runner.steps.ts:9:5)`,
        depth: 1
      }
    ])
  })

  it.effect("emits it as an always-PASSING test, never a failing or a skipped one", () =>
    Effect.gen(function*() {
      const { api, records } = makeRecordingApi()

      emitFeature({ api, plan: unusedPlan, layer })

      // ADR-EC-019 makes an unused pattern a warning and not a failure. Asserted on the Exit rather
      // than by the test simply not throwing, so a node that fails is reported as a failed assertion
      // here instead of as a red test somewhere downstream (mutation C).
      assert.isTrue(Exit.isSuccess(yield* Effect.exit(thunkAt(records, 3)())))
    }))

  it("gives two definitions sharing one pattern string two distinct titles", () => {
    const { api, records } = makeRecordingApi()

    emitFeature({
      api,
      plan: planFeature({
        feature: checkout,
        definitions: [
          ...checkoutDefinitions,
          define({ pattern: "I never happen", scope: featureScope("Checkout"), definedAt: site(9) }),
          define({ pattern: "I never happen", scope: featureScope("Checkout"), definedAt: site(10) })
        ]
      }),
      layer
    })

    // Titled with the pattern alone, these two would be one string twice — two identically-named
    // nodes the reporter and `vitest/no-identical-title` both handle badly (threat T-06-06-02). The
    // sites are 9 and 10, so the order is `planFeature`'s numeric site sort and not a string one.
    assert.deepStrictEqual(records.slice(3).map(({ name }) => name), [
      `⚠ unused step definition: Given "I never happen" (/repo/test/runner.steps.ts:9:5)`,
      `⚠ unused step definition: Given "I never happen" (/repo/test/runner.steps.ts:10:5)`
    ])
  })

  it("says so in words when the definition site was never recorded", () => {
    const { api, records } = makeRecordingApi()
    // The one hand-written warning in this file. `planFeature` always fills `definedAt`, so nothing
    // it produces can reach the absent-site branch of the title.
    const plan = withWarnings(planFeature({ feature: checkout, definitions: checkoutDefinitions }), [
      makeUnusedStepDefinitionWarning({
        reason: "UnusedStepDefinition",
        featureName: checkout.name,
        uri: checkout.uri,
        keyword: "When",
        pattern: `I am "quoted"`,
        message: "hand-written for this test"
      })
    ])

    emitFeature({ api, plan, layer })

    // The pattern is rendered with `JSON.stringify`, so the embedded quotes are escaped and cannot
    // forge the end of the quoted span in a reporter's output (threat T-06-06-01).
    assert.deepStrictEqual(records.slice(3).map(({ name }) => name), [
      `⚠ unused step definition: When "I am \\"quoted\\"" (an unrecorded location)`
    ])
  })
})

describe("the recording fake itself", () => {
  it("restores its depth counter when a define callback throws", () => {
    const { api, records } = makeRecordingApi()

    assert.throws(() =>
      api.describe("throwing", () => {
        throw new Error("the define callback blew up")
      }), /the define callback blew up/)
    api.effect("after", () => Effect.void)

    // Without the `finally`, `after` is recorded at depth 1 and so is every record in every
    // assertion that followed — the failure would surface in an unrelated test.
    assert.deepStrictEqual(shapeOf(records), [
      { kind: "describe", name: "throwing", depth: 0 },
      { kind: "effect", name: "after", depth: 0 }
    ])
  })
})

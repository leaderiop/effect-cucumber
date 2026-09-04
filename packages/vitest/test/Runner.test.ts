/**
 * Tests for `Runner`.
 *
 * Carries: ADR-EC-019, INV-EC-002, INV-EC-005.
 */
import { ParameterTypeStore, parseFeature } from "@effect-cucumber/gherkin"
import { assert, describe, flakyTest, it } from "@effect/vitest"
import * as Cause from "effect/Cause"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Ref from "effect/Ref"
import type * as Scope from "effect/Scope"
import { makeUnusedStepDefinitionWarning, type UnusedStepDefinitionWarning } from "../src/Errors.ts"
import type { HookEntry, HookSet } from "../src/Hook.ts"
import { type FeaturePlan, planFeature, type PlannedStep, type ScenarioPlan, type StepBody } from "../src/Plan.ts"
import type { DefinitionSite, RegistryScope, StepDefinition, StepKeyword } from "../src/Registry.ts"
import { emitFeature } from "../src/Runner.ts"
import { makeTagFilter, noTagFilter, onlyTag, retryTag, skipTag } from "../src/Tags.ts"
import type { EmitOptions, TestApi } from "../src/TestApi.ts"

// One call the fake received, with enough context to reconstruct the emitted tree.
type EmissionRecord = {
  readonly kind: "describe" | "effect" | "afterAll"
  readonly name: string
  readonly depth: number
  readonly self: (() => Effect.Effect<void, unknown, Scope.Scope>) | null
  readonly options: EmitOptions | null
}

// A `TestApi` that records what it was asked to emit instead of emitting it.
const makeRecordingApi = (): {
  readonly api: TestApi
  readonly records: ReadonlyArray<EmissionRecord>
} => {
  const records: Array<EmissionRecord> = []
  let depth = 0
  const api: TestApi = {
    describe: (name, define) => {
      records.push({ kind: "describe", name, depth, self: null, options: null })
      depth += 1
      try {
        define()
      } finally {
        depth -= 1
      }
    },
    effect: (name, self, options) => {
      records.push({ kind: "effect", name, depth, self, options })
    },
    afterAll: (name, self) => {
      records.push({ kind: "afterAll", name, depth, self, options: null })
    }
  }
  return { api, records }
}

// The comparable projection of a recording: everything except the thunk, which has no equality.
const shapeOf = (
  records: ReadonlyArray<EmissionRecord>
): ReadonlyArray<{ readonly kind: string; readonly name: string; readonly depth: number }> =>
  records.map(({ depth, kind, name }) => ({ kind, name, depth }))

// `shapeOf` plus the emit options — a SIBLING projection, not a replacement, and every tag or skip assertion in this
// file goes through it.
const emissionOf = (
  records: ReadonlyArray<EmissionRecord>
): ReadonlyArray<{
  readonly kind: string
  readonly name: string
  readonly depth: number
  readonly tags: ReadonlyArray<string> | null
  readonly skip: boolean | null
}> =>
  records.map(({ depth, kind, name, options }) => ({
    kind,
    name,
    depth,
    tags: options === null ? null : options.tags,
    skip: options === null ? null : options.skip
  }))

// Just the emitted test titles, in order — the projection an ABSENCE claim is asserted through.
const titlesOf = (records: ReadonlyArray<EmissionRecord>): ReadonlyArray<string> =>
  records.filter(({ kind }) => kind === "effect").map(({ name }) => name)

const routingOf = (
  records: ReadonlyArray<EmissionRecord>
): ReadonlyArray<{ readonly kind: string; readonly name: string; readonly contextFree: boolean | null }> =>
  records.map(({ kind, name, options }) => ({
    kind,
    name,
    contextFree: options === null ? null : options.contextFree
  }))

// The thunk recorded at `index`, or a thrown explanation.
const teardownAt = (records: ReadonlyArray<EmissionRecord>): () => Effect.Effect<void, unknown, Scope.Scope> => {
  const found = records.find(({ kind }) => kind === "afterAll")
  if (found === undefined || found.self === null) {
    throw new Error("no afterAll was registered")
  }
  return found.self
}

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

// A service no step below actually reads.
class Marker extends Context.Service<Marker, { readonly who: string }>()("Marker") {}

// The Layer every test hands `emitFeature`, and the only one in this file.
const layer = Layer.succeed(Marker, Marker.of({ who: "runner-test" }))

// All six `HookKind` keys present, every one an empty array — the `hooks` argument every test in this file hands
// `emitFeature`.
const emptyHooks: HookSet = {
  Before: [],
  After: [],
  BeforeStep: [],
  AfterStep: [],
  BeforeAllScenarios: [],
  AfterAllScenarios: []
}

// `emptyHooks` with one or more kinds overridden — keeps each all-scenarios test's intent to one line.
const hooksWith = (overrides: Partial<HookSet>): HookSet => ({ ...emptyHooks, ...overrides })

const noRuleScope = {
  ruleHooks: new Map<string, HookSet>(),
  ruleLayers: new Map<string, Layer.Layer<any, any, never>>(),
  scenarioLayers: new Map<string, Layer.Layer<any, any, never>>()
}

const unfiltered = { tagFilter: noTagFilter }

// The one service every hook and step body in the `BeforeAllScenarios`/`AfterAllScenarios` describe blocks below
// reads: an append-only log of what ran, in run order.
class Recorder extends Context.Service<Recorder, { readonly log: Ref.Ref<ReadonlyArray<string>> }>()("Recorder") {}

// A fresh `Recorder` Layer over a fresh, single, shared `Ref` — one per test, per the house factory convention.
// A `Recorder` service every hook and step body in this file writes to, delivered as a Layer.
const makeRecorderLayer = (): {
  readonly layer: Layer.Layer<Recorder>
  readonly log: Ref.Ref<ReadonlyArray<string>>
} => {
  const log = Ref.makeUnsafe<ReadonlyArray<string>>([])
  return { layer: Layer.succeed(Recorder, Recorder.of({ log })), log }
}

// Unconditional (`matches: null`) — this file is about the RUNNER's own bracketing/teardown, not tag
// filtering, which `Hook.test.ts` and the acceptance pair own (ADR-EC-035, BEH-EC-027).
const recordingHook = (name: string): HookEntry => ({
  matches: null,
  body: () =>
    Effect.gen(function*() {
      const recorder = yield* Recorder
      yield* Ref.update(recorder.log, (seen) => [...seen, `${name}:start`])
      yield* Effect.yieldNow
      yield* Ref.update(recorder.log, (seen) => [...seen, `${name}:end`])
    })
})

// A hook entry whose body records its own `:start`, suspends, then fails with `error` — no `:end`.
const failingHook = (name: string, error: unknown): HookEntry => ({
  matches: null,
  body: () =>
    Effect.gen(function*() {
      const recorder = yield* Recorder
      yield* Ref.update(recorder.log, (seen) => [...seen, `${name}:start`])
      yield* Effect.yieldNow
      return yield* Effect.fail(error)
    })
})

const recordingStep = (name: string): StepBody => () =>
  Effect.gen(function*() {
    const recorder = yield* Recorder
    yield* Ref.update(recorder.log, (seen) => [...seen, name])
  })

// A step body that brackets a real suspension with `${name}:start`/`${name}:end`, written onto the SAME `Recorder`
// log `recordingHook`/`failingHook` write to — used ONLY by the headline full-ordering test below.
const bracketedStep = (name: string): StepBody => () =>
  Effect.gen(function*() {
    const recorder = yield* Recorder
    yield* Ref.update(recorder.log, (seen) => [...seen, `${name}:start`])
    yield* Effect.yieldNow
    yield* Ref.update(recorder.log, (seen) => [...seen, `${name}:end`])
  })

// Parse an inline Feature the way a consumer would, so the fixtures are real contract values.
const parse = (source: string, uri: string) =>
  Effect.runSync(parseFeature(source, uri).pipe(Effect.provide(ParameterTypeStore.Default)))

// A Background step and two Scenarios whose own steps are worded DIFFERENTLY.
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

// A Feature-level Scenario followed by a Rule holding two of its own.
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

// A Scenario Outline with two Examples rows.
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

// All four tag-inheritance levels at once, over a Rule-nested Outline — the SC1 fixture.
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
`,
  "test/runner-tagged.feature"
)

// Both reserved tags and an untagged control, in one Feature — the SC2 and SC3 fixture.
const reserved = parse(
  `Feature: Reserved

  @skip
  Scenario: skipped one
    When I browse

  @only
  Scenario: only one
    When I browse

  Scenario: plain one
    When I browse
`,
  "test/runner-reserved.feature"
)

// A dedicated fixture for `@retry` (ADR-EC-034, BEH-EC-026), separate from `reserved` above so this file's
// existing `records.length`/fixed-index assertions over `reserved` stay untouched.
const retryTagged = parse(
  `Feature: Retry tag

  @retry
  Scenario: retried one
    When I browse

  Scenario: plain one
    When I browse
`,
  "test/runner-retry-tagged.feature"
)

// A single `@retry` Scenario behind a `BeforeAllScenarios` hook that always fails — design question 2 from
// ADR-EC-034: does a Scenario-level retry rescue a failed once-per-Feature setup?
const retryAfterFailedBeforeAll = parse(
  `Feature: Retry cannot rescue a failed BeforeAllScenarios

  @retry
  Scenario: a retried scenario after a failed BeforeAllScenarios
    Given a step that never runs
`,
  "test/runner-retry-beforeall.feature"
)

// Five Scenarios across BOTH of `emitFeature`'s loops, tagged so every filter case has a hit and a miss at each
// nesting level — the SC4 fixture.
const filtering = parse(
  `Feature: Filtering

  @slow
  Scenario: slow one
    When I browse

  @wip
  Scenario: wip one
    When I browse

  Scenario: plain one
    When I browse

  Rule: nested

    @slow
    Scenario: slow nested
      When I browse

    @wip
    Scenario: wip nested
      When I browse
`,
  "test/runner-filtering.feature"
)

// Every Scenario `@skip`-tagged — one of the three teardown no-op cases.
const allSkipped = parse(
  `@skip
Feature: All Skipped

  Scenario: skipped one
    When I browse

  Scenario: skipped two
    When I browse
`,
  "test/runner-all-skipped.feature"
)

// A Feature declaring no Scenario at all — the third suppression case, and the one that is not about tags in the
// slightest.
const emptyFeature = parse(
  `Feature: Empty
`,
  "test/runner-empty.feature"
)

// A step body that touches no service.
const noop: StepBody = () => Effect.void

const featureScope = (name: string): RegistryScope => ({ kind: "feature", name, ruleId: null })

// A definition site in one fixed file, so two sites differ only in their line.
const site = (line: number): DefinitionSite => ({ file: "/repo/test/runner.steps.ts", line, column: 5 })

// One `StepDefinition` literal, with every field a test might want to control exposed.
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

// Every step of `checkout`, defined at Feature scope so all three resolve.
const checkoutDefinitions: ReadonlyArray<StepDefinition<StepBody>> = [
  define({ pattern: "the cart is empty", scope: featureScope("Checkout") }),
  define({ pattern: "I pay", scope: featureScope("Checkout"), keyword: "When" }),
  define({ pattern: "I refund", scope: featureScope("Checkout"), keyword: "When" })
]

// The one `When I browse` definition every tag fixture above resolves all of its steps through.
const browseIn = (featureName: string): ReadonlyArray<StepDefinition<StepBody>> => [
  define({ pattern: "I browse", scope: featureScope(featureName), keyword: "When" })
]

// `tagged`'s single Outline step, cucumber-expression typed so both a 1 and a 2 row would resolve.
const taggedDefinitions: ReadonlyArray<StepDefinition<StepBody>> = [
  define({ pattern: "I add {int} apples", scope: featureScope("Tagged") })
]

// The same three definitions, with bodies that append their own pattern to `ran`.
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

const recorderCheckoutDefinitions: ReadonlyArray<StepDefinition<StepBody>> = [
  define({ pattern: "the cart is empty", scope: featureScope("Checkout"), body: recordingStep("the cart is empty") }),
  define({ pattern: "I pay", scope: featureScope("Checkout"), keyword: "When", body: recordingStep("I pay") }),
  define({ pattern: "I refund", scope: featureScope("Checkout"), keyword: "When", body: recordingStep("I refund") })
]

// `retryAfterFailedBeforeAll`'s one step — never resolved to a running body in the test that uses this fixture,
// since its whole point is that `BeforeAllScenarios` fails before any Scenario step is reached.
const retryAfterFailedBeforeAllDefinitions: ReadonlyArray<StepDefinition<StepBody>> = [
  define({
    pattern: "a step that never runs",
    scope: featureScope("Retry cannot rescue a failed BeforeAllScenarios"),
    body: recordingStep("a step that never runs")
  })
]

const shopRecorderDefinitions: ReadonlyArray<StepDefinition<StepBody>> = [
  define({ pattern: "I browse", scope: featureScope("Shop"), keyword: "When", body: recordingStep("I browse") }),
  define({
    pattern: "I get my money back",
    scope: featureScope("Shop"),
    keyword: "When",
    body: recordingStep("I get my money back")
  }),
  define({
    pattern: "I keep the goods",
    scope: featureScope("Shop"),
    keyword: "When",
    body: recordingStep("I keep the goods")
  })
]

// A service naming which of the three Layer tiers built it — the only thing the three-tier block at the bottom of
// this file needs a Layer to be distinguishable BY.
class Tier extends Context.Service<Tier, { readonly name: string }>()("Tier") {}

// The shared `Recorder` plus a `Tier` naming this Layer's own tier.
const withTier = (recorderLayer: Layer.Layer<Recorder>, name: string): Layer.Layer<Recorder | Tier> =>
  Layer.merge(recorderLayer, Layer.succeed(Tier, Tier.of({ name })))

// A step body that records WHICH tier's Layer the Scenario it belongs to was actually provided.
const tierStep = (): StepBody => () =>
  Effect.gen(function*() {
    const recorder = yield* Recorder
    const tier = yield* Tier
    yield* Ref.update(recorder.log, (seen) => [...seen, `tier=${tier.name}`])
  })

// `shop`'s three steps, every one reporting its own Scenario's effective tier.
const shopTierDefinitions: ReadonlyArray<StepDefinition<StepBody>> = [
  define({ pattern: "I browse", scope: featureScope("Shop"), keyword: "When", body: tierStep() }),
  define({ pattern: "I get my money back", scope: featureScope("Shop"), keyword: "When", body: tierStep() }),
  define({ pattern: "I keep the goods", scope: featureScope("Shop"), keyword: "When", body: tierStep() })
]

// `shop`'s only Rule, resolved once and asserted on rather than indexed with `!`.
const shopRule = shop.rules[0]
if (shopRule === undefined) {
  throw new Error("fixture `shop` must declare exactly one Rule — every 08-07 block below keys on its id")
}

// The composite key `emitFeature` looks `scenarioLayers` up under, REBUILT here rather than imported from
// `src/ScenarioKey.ts`.
const scenarioKeyIn = (ruleId: string | null, name: string): string => `${ruleId ?? "<feature>"}\u0000${name}`

// Replace a real plan's warning list, keeping its real Feature and its real Scenario plans.
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
      layer,
      hooks: emptyHooks,
      ...noRuleScope,
      ...unfiltered
    })

    // Positional, and over the WHOLE array: a search would pass against an implementation that emitted `refunding`
    // before `paying`, which is the reordering nothing else here can see.
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
      layer,
      hooks: emptyHooks,
      ...noRuleScope,
      ...unfiltered
    })

    // Exactly one record at the top level, and it is the Feature's block.
    assert.deepStrictEqual(records.filter(({ depth }) => depth === 0).map(({ name }) => name), ["Checkout"])
  })

  it("throws a located explanation when a Scenario has no plan", () => {
    const { api } = makeRecordingApi()
    // Unreachable through `planFeature`, which maps `feature.allScenarios`.
    const plan: FeaturePlan = { feature: checkout, scenarios: [], warnings: [] }

    assert.throws(
      () => emitFeature({ api, plan, layer, hooks: emptyHooks, ...noRuleScope, ...unfiltered }),
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
      layer,
      hooks: emptyHooks,
      ...noRuleScope,
      ...unfiltered
    })

    // The two Rule Scenarios sit at depth 2 beneath a block at depth 1.
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
        layer,
        hooks: emptyHooks,
        ...noRuleScope,
        ...unfiltered
      })

      // Nothing has run yet: `emitFeature` registers thunks, it does not execute them.
      assert.deepStrictEqual(ran, [])

      yield* thunkAt(records, 1)()
      assert.deepStrictEqual(ran, ["the cart is empty", "I pay"])

      yield* thunkAt(records, 2)()
      // The second thunk ran `I refund`, not `I pay` again: an implementation that closed over one shared
      // `scenarioPlan` would repeat the first Scenario's steps with the right test titles.
      assert.deepStrictEqual(ran, ["the cart is empty", "I pay", "the cart is empty", "I refund"])
    }))
})

describe("a Scenario Outline emits one distinctly-titled test per Examples row", () => {
  it("titles each row with its interpolated name plus 08-04's column=value suffix", () => {
    const { api, records } = makeRecordingApi()

    emitFeature({
      api,
      plan: planFeature({
        feature: outline,
        definitions: [define({ pattern: "I add {int} apples", scope: featureScope("Outline") })]
      }),
      layer,
      hooks: emptyHooks,
      ...noRuleScope,
      ...unfiltered
    })

    // TWO properties in one comparison, and each fails on its own mutation.
    assert.deepStrictEqual(shapeOf(records), [
      { kind: "describe", name: "Outline", depth: 0 },
      { kind: "effect", name: "adding 1 (count=1)", depth: 1 },
      { kind: "effect", name: "adding 2 (count=2)", depth: 1 }
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

    emitFeature({ api, plan: unusedPlan, layer, hooks: emptyHooks, ...noRuleScope, ...unfiltered })

    // Last, not first.
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

      emitFeature({ api, plan: unusedPlan, layer, hooks: emptyHooks, ...noRuleScope, ...unfiltered })

      // ADR-EC-019 makes an unused pattern a warning and not a failure.
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
      layer,
      hooks: emptyHooks,
      ...noRuleScope,
      ...unfiltered
    })

    assert.deepStrictEqual(records.slice(3).map(({ name }) => name), [
      `⚠ unused step definition: Given "I never happen" (/repo/test/runner.steps.ts:9:5)`,
      `⚠ unused step definition: Given "I never happen" (/repo/test/runner.steps.ts:10:5)`
    ])
  })

  it("says so in words when the definition site was never recorded", () => {
    const { api, records } = makeRecordingApi()
    // The one hand-written warning in this file.
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

    emitFeature({ api, plan, layer, hooks: emptyHooks, ...noRuleScope, ...unfiltered })

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
    // The one place in this file that drives the fake directly rather than through `emitFeature`.
    api.effect("after", () => Effect.void, { tags: [], skip: false, retry: false, contextFree: true })

    // Without the `finally`, `after` is recorded at depth 1 and so is every record in every assertion that followed —
    // the failure would surface in an unrelated test.
    assert.deepStrictEqual(shapeOf(records), [
      { kind: "describe", name: "throwing", depth: 0 },
      { kind: "effect", name: "after", depth: 0 }
    ])
  })
})

describe("BeforeAllScenarios runs exactly once across every Scenario in the Feature", () => {
  it.effect("runs ahead of both Scenarios' steps, exactly once, when run in document order (1 then 2)", () =>
    Effect.gen(function*() {
      const { api, records } = makeRecordingApi()
      const { layer: recorderLayer, log } = makeRecorderLayer()
      const hooks = hooksWith({ BeforeAllScenarios: [recordingHook("beforeAll")] })

      emitFeature({
        api,
        plan: planFeature({ feature: checkout, definitions: recorderCheckoutDefinitions }),
        layer: recorderLayer,
        hooks,
        ...noRuleScope,
        ...unfiltered
      })

      yield* thunkAt(records, 1)().pipe(Effect.provide(recorderLayer))
      yield* thunkAt(records, 2)().pipe(Effect.provide(recorderLayer))

      // ONE whole-log assertion carrying both halves at once: the hook's `:start`/`:end` pair appears exactly ONCE,
      // ahead of both Scenarios' step entries — mutation K's target.
      assert.deepStrictEqual(yield* Ref.get(log), [
        "beforeAll:start",
        "beforeAll:end",
        "the cart is empty",
        "I pay",
        "the cart is empty",
        "I refund"
      ])
    }))

  it.effect("runs exactly once and still ahead of whichever Scenario runs first, in reverse order (2 then 1)", () =>
    Effect.gen(function*() {
      const { api, records } = makeRecordingApi()
      const { layer: recorderLayer, log } = makeRecorderLayer()
      const hooks = hooksWith({ BeforeAllScenarios: [recordingHook("beforeAll")] })

      emitFeature({
        api,
        plan: planFeature({ feature: checkout, definitions: recorderCheckoutDefinitions }),
        layer: recorderLayer,
        hooks,
        ...noRuleScope,
        ...unfiltered
      })

      yield* thunkAt(records, 2)().pipe(Effect.provide(recorderLayer))
      yield* thunkAt(records, 1)().pipe(Effect.provide(recorderLayer))

      // Proves the cell is order-independent rather than "the first emitted node happens to run first": the hook
      // still runs once, ahead of whichever Scenario the test ran first.
      assert.deepStrictEqual(yield* Ref.get(log), [
        "beforeAll:start",
        "beforeAll:end",
        "the cart is empty",
        "I refund",
        "the cart is empty",
        "I pay"
      ])
    }))

  it.effect("fails both Scenario thunks with the SAME error by reference identity, and runs the hook once", () =>
    Effect.gen(function*() {
      const { api, records } = makeRecordingApi()
      const { layer: recorderLayer, log } = makeRecorderLayer()
      const boom = { why: "the BeforeAllScenarios hook's own error" }
      const hooks = hooksWith({ BeforeAllScenarios: [failingHook("beforeAll", boom)] })

      emitFeature({
        api,
        plan: planFeature({ feature: checkout, definitions: recorderCheckoutDefinitions }),
        layer: recorderLayer,
        hooks,
        ...noRuleScope,
        ...unfiltered
      })

      const exit1 = yield* Effect.exit(thunkAt(records, 1)().pipe(Effect.provide(recorderLayer)))
      const exit2 = yield* Effect.exit(thunkAt(records, 2)().pipe(Effect.provide(recorderLayer)))

      assert.isTrue(Exit.isFailure(exit1))
      assert.isTrue(Exit.isFailure(exit2))
      assert.strictEqual(Exit.isFailure(exit1) ? Cause.squash(exit1.cause) : undefined, boom)
      assert.strictEqual(Exit.isFailure(exit2) ? Cause.squash(exit2.cause) : undefined, boom)
      // The hook body ran ONCE: one `:start`, no `:end` (it failed), and no Scenario step ran at all —
      // `Effect.flatMap` short-circuits before `buildScenarioEffect`'s body is ever reached.
      assert.deepStrictEqual(yield* Ref.get(log), ["beforeAll:start"])
    }))

  it.effect("runs before the Scenario's own Before hook, in the whole log's order", () =>
    Effect.gen(function*() {
      const { api, records } = makeRecordingApi()
      const { layer: recorderLayer, log } = makeRecorderLayer()
      const hooks = hooksWith({
        BeforeAllScenarios: [recordingHook("beforeAll")],
        Before: [recordingHook("before")]
      })

      emitFeature({
        api,
        plan: planFeature({ feature: checkout, definitions: recorderCheckoutDefinitions }),
        layer: recorderLayer,
        hooks,
        ...noRuleScope,
        ...unfiltered
      })

      yield* thunkAt(records, 1)().pipe(Effect.provide(recorderLayer))

      assert.deepStrictEqual(yield* Ref.get(log), [
        "beforeAll:start",
        "beforeAll:end",
        "before:start",
        "before:end",
        "the cart is empty",
        "I pay"
      ])
    }))
})

describe("AfterAllScenarios is registered as one teardown hook after every Scenario and before every warning", () => {
  it("registers exactly one afterAll, named '⚙ AfterAllScenarios', after every Scenario and before every warning", () => {
    const { api, records } = makeRecordingApi()
    const hooks = hooksWith({ AfterAllScenarios: [recordingHook("afterAll")] })

    emitFeature({
      api,
      plan: planFeature({
        feature: checkout,
        definitions: [
          ...checkoutDefinitions,
          define({ pattern: "I never happen", scope: featureScope("Checkout"), definedAt: site(9) })
        ]
      }),
      layer,
      hooks,
      ...noRuleScope,
      ...unfiltered
    })

    // Positional, over the whole array — mutation M's target: emitted after the warnings instead of before them, this
    // array's last two entries would swap.
    assert.deepStrictEqual(shapeOf(records), [
      { kind: "describe", name: "Checkout", depth: 0 },
      { kind: "effect", name: "paying", depth: 1 },
      { kind: "effect", name: "refunding", depth: 1 },
      { kind: "afterAll", name: "⚙ AfterAllScenarios", depth: 1 },
      {
        kind: "effect",
        name: `⚠ unused step definition: Given "I never happen" (/repo/test/runner.steps.ts:9:5)`,
        depth: 1
      }
    ])
  })

  it.effect("runs and succeeds even when BeforeAllScenarios failed and a Scenario thunk failed", () =>
    Effect.gen(function*() {
      const { api, records } = makeRecordingApi()
      const { layer: recorderLayer, log } = makeRecorderLayer()
      const boom = { why: "the BeforeAllScenarios hook's own error" }
      const hooks = hooksWith({
        BeforeAllScenarios: [failingHook("beforeAll", boom)],
        AfterAllScenarios: [recordingHook("afterAll")]
      })

      emitFeature({
        api,
        plan: planFeature({ feature: checkout, definitions: recorderCheckoutDefinitions }),
        layer: recorderLayer,
        hooks,
        ...noRuleScope,
        ...unfiltered
      })

      // Run the failing thunks FIRST: both Scenario nodes fail because BeforeAllScenarios failed.
      yield* Effect.exit(thunkAt(records, 1)().pipe(Effect.provide(recorderLayer)))
      yield* Effect.exit(thunkAt(records, 2)().pipe(Effect.provide(recorderLayer)))

      // Records: describe(0), paying(1), refunding(2), AfterAllScenarios(3) — no warnings here.
      const afterAllExit = yield* Effect.exit(thunkAt(records, 3)().pipe(Effect.provide(recorderLayer)))

      // Mutation N's target: composing the node's body to await the BeforeAllScenarios cell first would turn this
      // into a failure.
      assert.isTrue(Exit.isSuccess(afterAllExit))
      assert.deepStrictEqual(yield* Ref.get(log), ["beforeAll:start", "afterAll:start", "afterAll:end"])
    }))

  it.effect("fails its own node by reference identity, and does not affect any Scenario thunk's exit", () =>
    Effect.gen(function*() {
      const { api, records } = makeRecordingApi()
      const { layer: recorderLayer } = makeRecorderLayer()
      const boom = { why: "the AfterAllScenarios hook's own error" }
      const hooks = hooksWith({ AfterAllScenarios: [failingHook("afterAll", boom)] })

      emitFeature({
        api,
        plan: planFeature({ feature: checkout, definitions: recorderCheckoutDefinitions }),
        layer: recorderLayer,
        hooks,
        ...noRuleScope,
        ...unfiltered
      })

      const scenario1Exit = yield* Effect.exit(thunkAt(records, 1)().pipe(Effect.provide(recorderLayer)))
      const scenario2Exit = yield* Effect.exit(thunkAt(records, 2)().pipe(Effect.provide(recorderLayer)))
      const afterAllExit = yield* Effect.exit(thunkAt(records, 3)().pipe(Effect.provide(recorderLayer)))

      assert.isTrue(Exit.isSuccess(scenario1Exit))
      assert.isTrue(Exit.isSuccess(scenario2Exit))
      assert.isTrue(Exit.isFailure(afterAllExit))
      assert.strictEqual(Exit.isFailure(afterAllExit) ? Cause.squash(afterAllExit.cause) : undefined, boom)
    }))
})

describe("EmitOptions.contextFree routes each node kind correctly", () => {
  it("marks every Scenario NOT context-free, every ⚠ warning node context-free, and the teardown as an afterAll with no options", () => {
    const { api, records } = makeRecordingApi()
    const hooks = hooksWith({ AfterAllScenarios: [recordingHook("afterAll")] })

    emitFeature({
      api,
      plan: planFeature({
        feature: checkout,
        definitions: [
          ...checkoutDefinitions,
          define({ pattern: "I never happen", scope: featureScope("Checkout"), definedAt: site(9) })
        ]
      }),
      layer,
      hooks,
      ...noRuleScope,
      ...unfiltered
    })

    // ONE whole-array comparison through the new projection: the two Scenario nodes and the `⚙ AfterAllScenarios`
    // node all read `contextFree: false`, and only the trailing `⚠` warning node reads `true`.
    assert.deepStrictEqual(routingOf(records), [
      { kind: "describe", name: "Checkout", contextFree: null },
      { kind: "effect", name: "paying", contextFree: false },
      { kind: "effect", name: "refunding", contextFree: false },
      { kind: "afterAll", name: "⚙ AfterAllScenarios", contextFree: null },
      {
        kind: "effect",
        name: `⚠ unused step definition: Given "I never happen" (/repo/test/runner.steps.ts:9:5)`,
        contextFree: true
      }
    ])
  })

  it("marks a RULE-NESTED Scenario NOT context-free — Runner.ts's second Scenario loop", () => {
    const { api, records } = makeRecordingApi()
    emitFeature({
      api,
      plan: planFeature({ feature: shop, definitions: shopRecorderDefinitions }),
      layer,
      hooks: emptyHooks,
      ...noRuleScope,
      ...unfiltered
    })
    assert.deepStrictEqual(routingOf(records), [
      { kind: "describe", name: "Shop", contextFree: null },
      { kind: "effect", name: "browsing", contextFree: false },
      { kind: "describe", name: "refunds", contextFree: null },
      { kind: "effect", name: "refund granted", contextFree: false },
      { kind: "effect", name: "refund denied", contextFree: false }
    ])
  })
})

describe("the phase's headline assertion: the full six-hook ordering across a two-Scenario Feature (roadmap SC #2)", () => {
  it.effect(
    "BeforeAllScenarios -> (Before -> BeforeStep/step/AfterStep x2 -> After) x2 -> AfterAllScenarios",
    () =>
      Effect.gen(function*() {
        const { api, records } = makeRecordingApi()
        const { layer: recorderLayer, log } = makeRecorderLayer()

        // One hook of each of the six kinds, each hook's own entries named after its kind — so the expected array
        // below reads as the sequence itself.
        const hooks: HookSet = {
          Before: [recordingHook("Before")],
          After: [recordingHook("After")],
          BeforeStep: [recordingHook("BeforeStep")],
          AfterStep: [recordingHook("AfterStep")],
          BeforeAllScenarios: [recordingHook("BeforeAllScenarios")],
          AfterAllScenarios: [recordingHook("AfterAllScenarios")]
        }

        const [payingId, refundingId] = checkout.scenarios.map((scenario) => scenario.id)
        if (payingId === undefined || refundingId === undefined) {
          throw new Error("fixture `checkout` must have exactly two Feature-level Scenarios")
        }

        const stepsOf = (prefix: string): ReadonlyArray<PlannedStep> => [
          {
            _tag: "Resolved",
            step: {
              text: `${prefix}-step1`,
              line: 1,
              keyword: "When",
              origin: "scenario",
              pattern: `${prefix}-step1`,
              body: bracketedStep(`${prefix}-step1`),
              args: [],
              uri: "test/runner-hook-ordering.feature"
            }
          },
          {
            _tag: "Resolved",
            step: {
              text: `${prefix}-step2`,
              line: 2,
              keyword: "When",
              origin: "scenario",
              pattern: `${prefix}-step2`,
              body: bracketedStep(`${prefix}-step2`),
              args: [],
              uri: "test/runner-hook-ordering.feature"
            }
          }
        ]

        // `tags: []` on both, and it is not filler: `checkout`'s two Scenarios genuinely carry no tags, so an empty
        // array is what `planFeature` would have produced for them.
        const scenario1: ScenarioPlan = {
          scenarioId: payingId,
          name: "paying",
          astName: "paying",
          ruleId: Option.none(),
          tags: [],
          steps: stepsOf("scenario1")
        }
        const scenario2: ScenarioPlan = {
          scenarioId: refundingId,
          name: "refunding",
          astName: "refunding",
          ruleId: Option.none(),
          tags: [],
          steps: stepsOf("scenario2")
        }

        const plan: FeaturePlan = { feature: checkout, scenarios: [scenario1, scenario2], warnings: [] }

        emitFeature({ api, plan, layer: recorderLayer, hooks, ...noRuleScope, ...unfiltered })

        // Emitted order: the Feature's `describe` block (index 0), Scenario 1, Scenario 2, then the `⚙
        // AfterAllScenarios` node — run them in that same order.
        yield* thunkAt(records, 1)().pipe(Effect.provide(recorderLayer))
        yield* thunkAt(records, 2)().pipe(Effect.provide(recorderLayer))
        yield* thunkAt(records, 3)().pipe(Effect.provide(recorderLayer))

        // THE headline assertion.
        assert.deepStrictEqual(yield* Ref.get(log), [
          "BeforeAllScenarios:start",
          "BeforeAllScenarios:end",

          "Before:start",
          "Before:end",
          "BeforeStep:start",
          "BeforeStep:end",
          "scenario1-step1:start",
          "scenario1-step1:end",
          "AfterStep:start",
          "AfterStep:end",
          "BeforeStep:start",
          "BeforeStep:end",
          "scenario1-step2:start",
          "scenario1-step2:end",
          "AfterStep:start",
          "AfterStep:end",
          "After:start",
          "After:end",

          "Before:start",
          "Before:end",
          "BeforeStep:start",
          "BeforeStep:end",
          "scenario2-step1:start",
          "scenario2-step1:end",
          "AfterStep:start",
          "AfterStep:end",
          "BeforeStep:start",
          "BeforeStep:end",
          "scenario2-step2:start",
          "scenario2-step2:end",
          "AfterStep:start",
          "AfterStep:end",
          "After:start",
          "After:end",

          "AfterAllScenarios:start",
          "AfterAllScenarios:end"
        ])
      })
  )
})

describe("a Feature registering neither all-scenarios hook emits exactly what it emitted before this plan", () => {
  it("adds no extra node, changes no title, changes no order", () => {
    const { api, records } = makeRecordingApi()

    emitFeature({
      api,
      plan: planFeature({ feature: checkout, definitions: checkoutDefinitions }),
      layer,
      hooks: emptyHooks,
      ...noRuleScope,
      ...unfiltered
    })

    // Identical to this file's very first assertion for this same fixture — a hookless Feature's emission is
    // unchanged by this plan.
    assert.deepStrictEqual(shapeOf(records), [
      { kind: "describe", name: "Checkout", depth: 0 },
      { kind: "effect", name: "paying", depth: 1 },
      { kind: "effect", name: "refunding", depth: 1 }
    ])
  })
})

describe("a Rule's hooks merge with the Feature's in the specified order", () => {
  // Feature-level `Before`/`After`, both bracketing a real suspension.
  const featureHooks = (): HookSet =>
    hooksWith({ Before: [recordingHook("featureBefore")], After: [recordingHook("featureAfter")] })

  // The Rule's own `Before`/`After`, in the shape `FeatureCollection.ruleHooks` carries them.
  const ruleScopedHooks = (): ReadonlyMap<string, HookSet> =>
    new Map([[
      shopRule.id,
      hooksWith({ Before: [recordingHook("ruleBefore")], After: [recordingHook("ruleAfter")] })
    ]])

  it.effect("runs Feature Before, then Rule Before, then the step, then Rule After, then Feature After", () =>
    Effect.gen(function*() {
      const { api, records } = makeRecordingApi()
      const { layer: recorderLayer, log } = makeRecorderLayer()

      emitFeature({
        api,
        plan: planFeature({ feature: shop, definitions: shopRecorderDefinitions }),
        layer: recorderLayer,
        hooks: featureHooks(),
        ruleHooks: ruleScopedHooks(),
        ruleLayers: new Map(),
        scenarioLayers: new Map(),
        ...unfiltered
      })

      // Emission shape for `shop`, pinned by the Rule-nesting test far above: describe Shop (0), browsing (1),
      // describe refunds (2), refund granted (3), refund denied (4).
      yield* thunkAt(records, 3)()

      assert.deepStrictEqual(yield* Ref.get(log), [
        "featureBefore:start",
        "featureBefore:end",
        "ruleBefore:start",
        "ruleBefore:end",
        "I get my money back",
        "ruleAfter:start",
        "ruleAfter:end",
        "featureAfter:start",
        "featureAfter:end"
      ])
    }))

  it.effect("runs NEITHER of the Rule's hooks for a Feature-level Scenario in the same document", () =>
    Effect.gen(function*() {
      const { api, records } = makeRecordingApi()
      const { layer: recorderLayer, log } = makeRecorderLayer()

      emitFeature({
        api,
        plan: planFeature({ feature: shop, definitions: shopRecorderDefinitions }),
        layer: recorderLayer,
        hooks: featureHooks(),
        ruleHooks: ruleScopedHooks(),
        ruleLayers: new Map(),
        scenarioLayers: new Map(),
        ...unfiltered
      })

      // Index 1 is `browsing`, declared before the `Rule:` block and therefore in no Rule at all.
      yield* thunkAt(records, 1)()

      assert.deepStrictEqual(yield* Ref.get(log), [
        "featureBefore:start",
        "featureBefore:end",
        "I browse",
        "featureAfter:start",
        "featureAfter:end"
      ])
    }))

  it.effect("runs the Feature's own hooks exactly ONCE for a Rule that registered none of its own", () =>
    Effect.gen(function*() {
      const { api, records } = makeRecordingApi()
      const { layer: recorderLayer, log } = makeRecorderLayer()

      emitFeature({
        api,
        plan: planFeature({ feature: shop, definitions: shopRecorderDefinitions }),
        layer: recorderLayer,
        hooks: featureHooks(),
        // EMPTY, so the Rule-nested loop takes its `??
        ruleHooks: new Map(),
        ruleLayers: new Map(),
        scenarioLayers: new Map(),
        ...unfiltered
      })

      yield* thunkAt(records, 3)()

      // `??
      assert.deepStrictEqual(yield* Ref.get(log), [
        "featureBefore:start",
        "featureBefore:end",
        "I get my money back",
        "featureAfter:start",
        "featureAfter:end"
      ])
    }))
})

describe("each Scenario is emitted with the innermost of the three Layer tiers", () => {
  it.effect("gives a Feature-level Scenario the Feature's, a Rule's the Rule's, and an overridden one its own", () =>
    Effect.gen(function*() {
      const { api, records } = makeRecordingApi()
      const { layer: recorderLayer, log } = makeRecorderLayer()

      emitFeature({
        api,
        plan: planFeature({ feature: shop, definitions: shopTierDefinitions }),
        layer: withTier(recorderLayer, "feature"),
        hooks: emptyHooks,
        ruleHooks: new Map(),
        ruleLayers: new Map([[shopRule.id, withTier(recorderLayer, "rule")]]),
        // Only `refund denied` brings its own — `refund granted` sits in the same Rule with no entry, so one emission
        // covers the hit and the miss at the SAME nesting level.
        scenarioLayers: new Map([[scenarioKeyIn(shopRule.id, "refund denied"), withTier(recorderLayer, "scenario")]]),
        ...unfiltered
      })

      yield* thunkAt(records, 1)()
      yield* thunkAt(records, 3)()
      yield* thunkAt(records, 4)()

      // Three tiers, three fallback branches, one comparison.
      assert.deepStrictEqual(yield* Ref.get(log), ["tier=feature", "tier=rule", "tier=scenario"])
    }))

  it.effect("gives BOTH rows of an Outline the one entry their shared registration recorded", () =>
    Effect.gen(function*() {
      const { api, records } = makeRecordingApi()
      const { layer: recorderLayer, log } = makeRecorderLayer()

      emitFeature({
        api,
        plan: planFeature({
          feature: outline,
          definitions: [
            define({ pattern: "I add {int} apples", scope: featureScope("Outline"), body: tierStep() })
          ]
        }),
        layer: withTier(recorderLayer, "feature"),
        hooks: emptyHooks,
        ruleHooks: new Map(),
        ruleLayers: new Map(),
        // The UN-INTERPOLATED name, which is what the author passed to `Scenario(...)` and therefore the only key
        // `describeFeature.ts` could have written.
        scenarioLayers: new Map([[scenarioKeyIn(null, "adding <count>"), withTier(recorderLayer, "scenario")]]),
        ...unfiltered
      })

      yield* thunkAt(records, 1)()
      yield* thunkAt(records, 2)()

      assert.deepStrictEqual(yield* Ref.get(log), ["tier=scenario", "tier=scenario"])
    }))
})

// Roadmap success criterion 1: every tag a Scenario inherits reaches the emitted node, in order, with its `@` prefix
// intact — and reaches the TEST node only, never the enclosing block.
describe("every inherited tag reaches the emitted test node, in order (roadmap SC #1)", () => {
  it("carries all four inheritance levels onto the node, @ prefixes intact, in document order", () => {
    const { api, records } = makeRecordingApi()

    emitFeature({
      api,
      plan: planFeature({ feature: tagged, definitions: taggedDefinitions }),
      layer,
      hooks: emptyHooks,
      ...noRuleScope,
      ...unfiltered
    })

    // Positional over the whole array, like every shape assertion in this file, so a tag arriving on the wrong node
    // fails here rather than passing a `.find(...)`.
    assert.deepStrictEqual(emissionOf(records), [
      { kind: "describe", name: "Tagged", depth: 0, tags: null, skip: null },
      { kind: "describe", name: "a rule", depth: 1, tags: null, skip: null },
      {
        kind: "effect",
        name: "adding 1 (count=1)",
        depth: 2,
        tags: ["@featuretag", "@ruletag", "@scenariotag", "@exampletag"],
        skip: false
      }
    ])
  })

  it("puts NO emit options on either describe — the Feature's block or the Rule's", () => {
    const { api, records } = makeRecordingApi()

    emitFeature({
      api,
      plan: planFeature({ feature: tagged, definitions: taggedDefinitions }),
      layer,
      hooks: emptyHooks,
      ...noRuleScope,
      ...unfiltered
    })

    assert.deepStrictEqual(records.filter(({ kind }) => kind === "describe").map(({ options }) => options), [
      null,
      null
    ])
  })
})

// Roadmap success criterion 2's emission half, and criterion 3 entire.
describe("@skip routes to a real skip and @only routes to nothing at all", () => {
  const emitReserved = (): ReadonlyArray<EmissionRecord> => {
    const { api, records } = makeRecordingApi()
    emitFeature({
      api,
      plan: planFeature({ feature: reserved, definitions: browseIn("Reserved") }),
      layer,
      hooks: emptyHooks,
      ...noRuleScope,
      ...unfiltered
    })
    return records
  }

  it("emits a @skip Scenario with skip true, its tags still present, and an untagged one with skip false", () => {
    const records = emitReserved()

    // Both halves in one comparison.
    assert.deepStrictEqual(emissionOf(records), [
      { kind: "describe", name: "Reserved", depth: 0, tags: null, skip: null },
      { kind: "effect", name: "skipped one", depth: 1, tags: [skipTag], skip: true },
      { kind: "effect", name: "only one", depth: 1, tags: [onlyTag], skip: false },
      { kind: "effect", name: "plain one", depth: 1, tags: [], skip: false }
    ])
  })

  it("emits an @only Scenario as a plain tagged test, differing from an untagged one ONLY in its tags", () => {
    const records = emitReserved()
    const only = records[2]
    const plain = records[3]
    if (only === undefined || plain === undefined) {
      throw new Error("fixture `reserved` must emit `only one` at index 2 and `plain one` at index 3")
    }

    // Same record count as an emission with no `@only` in it — index 3 is the last record, so nothing extra was
    // registered alongside the `@only` node.
    assert.strictEqual(records.length, 4)
    // Every recorded dimension except the tag array itself is identical to the untagged control's.
    assert.strictEqual(only.kind, plain.kind)
    assert.strictEqual(only.depth, plain.depth)
    assert.strictEqual(only.options?.skip, plain.options?.skip)
    assert.strictEqual(only.options?.skip, false)
  })

  it("puts @only in options.tags and NOWHERE else in the whole recording", () => {
    const records = emitReserved()

    // The structural half of criterion 3, and it is worth being explicit about what makes it structural rather than
    // merely observed.
    assert.deepStrictEqual(records.filter(({ name }) => name.includes(onlyTag)), [])
    assert.strictEqual(
      records.filter(({ options }) => options !== null && options.tags.includes(onlyTag)).length,
      1
    )
  })
})

describe("@retry reaches EmitOptions.retry, and composes independently of @skip/@only (ADR-EC-034, BEH-EC-026)", () => {
  it("emits a @retry Scenario with retry true, its tags still present, and an untagged one with retry false", () => {
    const { api, records } = makeRecordingApi()

    emitFeature({
      api,
      plan: planFeature({ feature: retryTagged, definitions: browseIn("Retry tag") }),
      layer,
      hooks: emptyHooks,
      ...noRuleScope,
      ...unfiltered
    })

    assert.deepStrictEqual(
      records.map(({ kind, name, options }) => ({
        kind,
        name,
        tags: options === null ? null : options.tags,
        retry: options === null ? null : options.retry
      })),
      [
        { kind: "describe", name: "Retry tag", tags: null, retry: null },
        { kind: "effect", name: "retried one", tags: [retryTag], retry: true },
        { kind: "effect", name: "plain one", tags: [], retry: false }
      ]
    )
  })
})

describe("`@retry` cannot rescue a Scenario whose BeforeAllScenarios already failed (ADR-EC-034 design question 2, BEH-EC-026)", () => {
  it.effect(
    "keeps failing across every retry attempt, and the hook body's own log entry appears only once",
    () =>
      Effect.gen(function*() {
        const { api, records } = makeRecordingApi()
        const { layer: recorderLayer, log } = makeRecorderLayer()
        const boom = { why: "the BeforeAllScenarios hook's own error" }
        const hooks = hooksWith({ BeforeAllScenarios: [failingHook("beforeAll", boom)] })

        emitFeature({
          api,
          plan: planFeature({ feature: retryAfterFailedBeforeAll, definitions: retryAfterFailedBeforeAllDefinitions }),
          layer: recorderLayer,
          hooks,
          ...noRuleScope,
          ...unfiltered
        })

        // Mirrors `VitestTestApi.ts`'s `withRetry` exactly: the recorded thunk is CALLED first — so its
        // `Effect.flatMap(beforeAllScenariosCell, ...)` is already a built value, `Effect.provide` innermost
        // where one is needed — and only THEN is the RESULT wrapped in `flakyTest` (ADR-EC-034).
        const exit = yield* Effect.exit(flakyTest(thunkAt(records, 1)().pipe(Effect.provide(recorderLayer))))

        assert.isTrue(Exit.isFailure(exit))
        // The hook's own body ran exactly once — a single "beforeAll:start", never a "beforeAll:end" (it fails),
        // and no second "beforeAll:start" from a later attempt — proving every one of flakyTest's (up to 10)
        // retry attempts re-awaited the SAME already-failed `Deferred` inside `Runner.ts`'s once-cell rather than
        // re-running `BeforeAllScenarios` itself. `packages/vitest/README.md`'s "never retried, so a
        // Scenario-level retry cannot make a failed setup pass" statement holds for exactly this reason.
        assert.deepStrictEqual(yield* Ref.get(log), ["beforeAll:start"])
      })
  )
})

// Roadmap success criterion 4: a Scenario the filter removes produces NO emission record — it is absent, not skipped.
describe("a filtered-out Scenario produces no emission record at all", () => {
  const filteringPlan = planFeature({ feature: filtering, definitions: browseIn("Filtering") })

  const emitFiltered = (tagFilter: Parameters<typeof emitFeature>[0]["tagFilter"]) => {
    const { api, records } = makeRecordingApi()
    const outcome = emitFeature({
      api,
      plan: filteringPlan,
      layer,
      hooks: emptyHooks,
      ...noRuleScope,
      tagFilter
    })
    return { records, outcome }
  }

  it("emits every Scenario, in both loops, under noTagFilter — the control the rest of this block reads against", () => {
    const { outcome, records } = emitFiltered(noTagFilter)

    assert.deepStrictEqual(titlesOf(records), ["slow one", "wip one", "plain one", "slow nested", "wip nested"])
    assert.deepStrictEqual(outcome, { excludedScenarioCount: 0 })
  })

  it("excludeTags removes the excluded Scenarios ENTIRELY — absent by title, not present-and-skipped", () => {
    const { outcome, records } = emitFiltered(makeTagFilter({ excludeTags: ["@wip"] }))

    // Whole-list comparison: a `@wip` Scenario emitted as a skipped node would appear here and fail, which a length
    // check alone would not distinguish from this passing.
    assert.deepStrictEqual(titlesOf(records), ["slow one", "plain one", "slow nested"])
    assert.isFalse(titlesOf(records).includes("wip one"))
    assert.isFalse(titlesOf(records).includes("wip nested"))
    assert.deepStrictEqual(outcome, { excludedScenarioCount: 2 })
  })

  it("includeTags restricts emission to matching Scenarios, across the Rule's nested loop too", () => {
    const { outcome, records } = emitFiltered(makeTagFilter({ includeTags: ["@slow"] }))

    // `slow nested` is what proves the Rule-level loop got its own filter: the two loops are written out separately
    // in `Runner.ts` on purpose, so a filter added to only one of them leaves the other emitting everything.
    assert.deepStrictEqual(titlesOf(records), ["slow one", "slow nested"])
    // Three excluded: `wip one` and `plain one` from the Feature-level loop, `wip nested` from the Rule's.
    assert.deepStrictEqual(outcome, { excludedScenarioCount: 3 })
  })

  it("excludes a tag named in BOTH arrays — exclude wins the author's self-contradiction", () => {
    const { outcome, records } = emitFiltered(makeTagFilter({ includeTags: ["@slow"], excludeTags: ["@slow"] }))

    // Nothing survives, and the blocks are still emitted: `Runner.ts` note (g) records that as a decision, not an
    // oversight — a Feature the reader can find and see is empty beats one that silently is not there.
    assert.deepStrictEqual(shapeOf(records), [
      { kind: "describe", name: "Filtering", depth: 0 },
      { kind: "describe", name: "nested", depth: 1 }
    ])
    assert.deepStrictEqual(outcome, { excludedScenarioCount: 5 })
  })
})

describe("a tag filter cannot change which step definitions are reported unused (Pitfall 4)", () => {
  const planWithUnused = planFeature({
    feature: filtering,
    definitions: [
      ...browseIn("Filtering"),
      define({ pattern: "I never happen", scope: featureScope("Filtering"), definedAt: site(9) })
    ]
  })

  const warningTitlesOf = (records: ReadonlyArray<EmissionRecord>): ReadonlyArray<string> =>
    titlesOf(records).filter((title) => title.startsWith("⚠"))

  const emitWith = (tagFilter: Parameters<typeof emitFeature>[0]["tagFilter"]): ReadonlyArray<EmissionRecord> => {
    const { api, records } = makeRecordingApi()
    emitFeature({ api, plan: planWithUnused, layer, hooks: emptyHooks, ...noRuleScope, tagFilter })
    return records
  }

  it("emits identical ⚠ nodes with no filter and with a filter that excludes every Scenario", () => {
    // Captured BEFORE either emission, so the second comparison below can see `emitFeature` mutating the plan it was
    // handed — which it must never do.
    const warningsBefore = planWithUnused.warnings.map(({ message }) => message)

    const unfilteredRecords = emitWith(noTagFilter)
    // `@exampletag` is a declared tag that no Scenario in `filtering` carries, so this include-filter excludes all
    // five without naming any of them.
    const fullyExcludedRecords = emitWith(makeTagFilter({ includeTags: ["@exampletag"] }))

    // Not vacuous: there IS a warning to compare.
    assert.strictEqual(warningTitlesOf(unfilteredRecords).length, 1)

    // The warning nodes survive full exclusion, byte for byte.
    assert.deepStrictEqual(warningTitlesOf(fullyExcludedRecords), warningTitlesOf(unfilteredRecords))
    // And the structured list itself is untouched by either call.
    assert.deepStrictEqual(planWithUnused.warnings.map(({ message }) => message), warningsBefore)
  })
})

// `Runner.ts` note (e)'s run-time gate: the `AfterAllScenarios` teardown is ALWAYS registered, and its body is a
// no-op exactly when no Scenario in the Feature was attempted.
describe("the AfterAllScenarios teardown is a no-op when nothing was attempted, and runs once something was", () => {
  const afterAllHooks = (): HookSet => hooksWith({ AfterAllScenarios: [recordingHook("afterAll")] })
  it.effect("runs the hook after a Scenario was attempted, even with a skipped sibling", () =>
    Effect.gen(function*() {
      const { api, records } = makeRecordingApi()
      const { layer: recorderLayer, log } = makeRecorderLayer()

      emitFeature({
        api,
        plan: planFeature({ feature: reserved, definitions: browseIn("Reserved") }),
        layer: recorderLayer,
        hooks: afterAllHooks(),
        ...noRuleScope,
        ...unfiltered
      })

      // `skipped one` is skipped; `only one` and `plain one` are not.
      assert.deepStrictEqual(titlesOf(records), ["skipped one", "only one", "plain one"])

      // Before anything ran: the teardown does nothing.
      yield* teardownAt(records)().pipe(Effect.provide(recorderLayer))
      assert.deepStrictEqual(yield* Ref.get(log), [])

      // One Scenario attempted — `only one`, records index 2 — and the SAME teardown now runs the hook.
      yield* Effect.exit(thunkAt(records, 2)().pipe(Effect.provide(recorderLayer)))
      yield* teardownAt(records)().pipe(Effect.provide(recorderLayer))
      assert.deepStrictEqual(yield* Ref.get(log), ["afterAll:start", "afterAll:end"])
    }))

  it.effect("does nothing when EVERY Scenario is @skip-tagged — the Scenarios still emit", () =>
    Effect.gen(function*() {
      const { api, records } = makeRecordingApi()
      const { layer: recorderLayer, log } = makeRecorderLayer()

      emitFeature({
        api,
        plan: planFeature({ feature: allSkipped, definitions: browseIn("All Skipped") }),
        layer: recorderLayer,
        hooks: afterAllHooks(),
        ...noRuleScope,
        ...unfiltered
      })

      assert.deepStrictEqual(emissionOf(records), [
        { kind: "describe", name: "All Skipped", depth: 0, tags: null, skip: null },
        { kind: "effect", name: "skipped one", depth: 1, tags: [skipTag], skip: true },
        { kind: "effect", name: "skipped two", depth: 1, tags: [skipTag], skip: true },
        { kind: "afterAll", name: "⚙ AfterAllScenarios", depth: 1, tags: null, skip: null }
      ])
      yield* teardownAt(records)()
      assert.deepStrictEqual(yield* Ref.get(log), [])
    }))

  it.effect("does nothing when EVERY Scenario is filtered out", () =>
    Effect.gen(function*() {
      const { api, records } = makeRecordingApi()
      const { layer: recorderLayer, log } = makeRecorderLayer()

      emitFeature({
        api,
        plan: planFeature({ feature: filtering, definitions: browseIn("Filtering") }),
        layer: recorderLayer,
        hooks: afterAllHooks(),
        ...noRuleScope,
        tagFilter: makeTagFilter({ includeTags: ["@exampletag"] })
      })

      assert.deepStrictEqual(titlesOf(records), [])
      yield* teardownAt(records)()
      assert.deepStrictEqual(yield* Ref.get(log), [])
    }))

  it.effect("does nothing for a Feature that declares no Scenario at all", () =>
    Effect.gen(function*() {
      const { api, records } = makeRecordingApi()
      const { layer: recorderLayer, log } = makeRecorderLayer()

      emitFeature({
        api,
        // No definitions: a Feature with no steps to resolve also has no definition that could go unused, so this
        // recording contains the `describe`, the teardown, and nothing else.
        plan: planFeature({ feature: emptyFeature, definitions: [] }),
        layer: recorderLayer,
        hooks: afterAllHooks(),
        ...noRuleScope,
        ...unfiltered
      })

      // Not a tag case at all, and it falls out of the same gate for the same reason — which is why the gate is "was
      // anything attempted" rather than an inspection of the filter.
      assert.deepStrictEqual(shapeOf(records), [
        { kind: "describe", name: "Empty", depth: 0 },
        { kind: "afterAll", name: "⚙ AfterAllScenarios", depth: 1 }
      ])
      yield* teardownAt(records)()
      assert.deepStrictEqual(yield* Ref.get(log), [])
    }))
})

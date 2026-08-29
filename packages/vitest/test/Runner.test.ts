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
 * Mutation-tested (all seven performed against real source, run, confirmed to fail exactly the
 * intended test(s), then reverted) — see the plan summary for the recorded output:
 * - A. `emitFeature` emits a Rule's Scenarios as SIBLINGS of the Rule's block instead of inside it
 *      → the Rule-nesting test fails on `depth`.
 * - B. `emitFeature` titles each test with `scenarioPlan.astName` instead of `scenarioPlan.name`
 *      → the Scenario Outline test fails, because both Examples rows get the same title.
 * - C. the unused-definition node is emitted with a failing Effect instead of `Effect.void`
 *      → the always-passing test fails.
 * - K. `makeOnce`'s `started` flag is removed, so the batch runs once PER CALLER instead of once per
 *      Feature → every test that exercises the once-cell across two thunk executions fails (4 of 19):
 *      both once-across-N-Scenarios tests (the hook's `:start`/`:end` pair appears twice, once per
 *      Scenario, instead of once), the failing-`BeforeAllScenarios` test (the second Scenario's
 *      "isFailure" assertion sees `false` — `Deferred.into` on an already-completed `Deferred` still
 *      re-runs `body`, so the hook fails "again" for the second thunk rather than the first failure
 *      being replayed), and the runs-even-when-`BeforeAllScenarios`-failed `AfterAllScenarios` test
 *      (same re-run leaks an extra `:start` entry into the log).
 * - L. `Deferred.await` on the second and later callers is replaced with `Effect.void` → 2 of 19 tests
 *      fail: the failing-`BeforeAllScenarios` test (the second Scenario thunk now SUCCEEDS instead of
 *      failing, because it no longer awaits the deferred's real outcome) and the runs-even-when-
 *      `BeforeAllScenarios`-failed `AfterAllScenarios` test (the second Scenario's steps now actually
 *      run, since its own `flatMap` proceeds on the once-cell's fabricated success, leaking "the cart
 *      is empty"/"I refund" into the log).
 * - M. the `AfterAllScenarios` node is emitted after the warnings loop instead of before it → the
 *      emission-shape test fails, because the node's position in `shapeOf(records)` no longer matches.
 * - N. the `AfterAllScenarios` node's body is composed to `Effect.flatMap` the `BeforeAllScenarios`
 *      cell first → the runs-even-when-`BeforeAllScenarios`-failed test fails, because the node's own
 *      exit becomes a failure instead of a success.
 * - O. `ScenarioEffect.ts`'s per-step unit has its `BeforeStep` and `AfterStep` batches swapped (the
 *      unit's `yield*` runs `AfterStep` and its `onExit` finalizer runs `BeforeStep`) → the headline
 *      full-ordering test below fails, and by construction nothing else in this file does: no other
 *      test here asserts BeforeStep/AfterStep ordering, which is `test/ScenarioEffect.test.ts`'s job
 *      (its own mutation J is the identical swap, caught there too).
 * - P. `BeforeAllScenarios` composed inside `ScenarioEffect.ts`'s `buildScenarioEffect` (run once per
 *      Scenario execution) instead of through `Runner.ts`'s once-cell → the headline full-ordering
 *      test below fails: the sequence gains a SECOND `BeforeAllScenarios:start`/`:end` pair, ahead of
 *      Scenario 2's own `Before`, instead of the once-cell's single pair ahead of Scenario 1's.
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
import * as Cause from "effect/Cause"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Ref from "effect/Ref"
import type * as Scope from "effect/Scope"
import { makeUnusedStepDefinitionWarning, type UnusedStepDefinitionWarning } from "../src/Errors.ts"
import type { HookBody, HookSet } from "../src/Hook.ts"
import { type FeaturePlan, planFeature, type PlannedStep, type ScenarioPlan, type StepBody } from "../src/Plan.ts"
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

/**
 * All six `HookKind` keys present, every one an empty array — the `hooks` argument every test in
 * this file hands `emitFeature`. This file asserts emission SHAPE; hook weaving is
 * `test/ScenarioEffect.test.ts`'s, and this constant is the regression guard that `emptyHooks`
 * changes nothing here.
 */
const emptyHooks: HookSet = {
  Before: [],
  After: [],
  BeforeStep: [],
  AfterStep: [],
  BeforeAllScenarios: [],
  AfterAllScenarios: []
}

/** `emptyHooks` with one or more kinds overridden — keeps each all-scenarios test's intent to one line. */
const hooksWith = (overrides: Partial<HookSet>): HookSet => ({ ...emptyHooks, ...overrides })

/**
 * The one service every hook and step body in the `BeforeAllScenarios`/`AfterAllScenarios` describe
 * blocks below reads: an append-only log of what ran, in run order.
 *
 * `test/ScenarioEffect.test.ts`'s own `Recorder` is per-BUILD by design — that is exactly what proves
 * INV-EC-002 there. This file's claim is different and spans TWO Scenario thunk executions plus, in
 * the `AfterAllScenarios` tests, a THIRD node's execution — an ordering a per-build log cannot express
 * at all, since each of those runs its own `Effect.provide` and therefore builds its own Layer
 * instance. So the `Ref` here is created ONCE, outside the Layer, and handed to `Layer.succeed` rather
 * than `Layer.effect`: every build of this Layer, no matter how many, returns a service wrapping the
 * SAME `Ref`. This deliberately gives up build-counting — `test/ScenarioEffect.test.ts`'s own
 * `Recorder`/`makeRecording` still covers INV-EC-002 — because a per-build log cannot express a
 * multi-Scenario ordering, which is exactly what the tests below need. Do not "fix" this back to
 * `Layer.effect`.
 */
class Recorder extends Context.Service<Recorder, { readonly log: Ref.Ref<ReadonlyArray<string>> }>()("Recorder") {}

/** A fresh `Recorder` Layer over a fresh, single, shared `Ref` — one per test, per the house factory convention. */
const makeRecorderLayer = (): {
  readonly layer: Layer.Layer<Recorder>
  readonly log: Ref.Ref<ReadonlyArray<string>>
} => {
  const log = Ref.makeUnsafe<ReadonlyArray<string>>([])
  return { layer: Layer.succeed(Recorder, Recorder.of({ log })), log }
}

/**
 * A hook body that brackets a suspension with `${name}:start`/`${name}:end` — copies
 * `test/ScenarioEffect.test.ts`'s `recordingHook` exactly, and for the identical reason: without a
 * real suspension in the middle, an ordering assertion cannot tell sequential execution from
 * concurrent execution that happens to finish in the same tick (07-PATTERNS.md's finding).
 */
const recordingHook = (name: string): HookBody => () =>
  Effect.gen(function*() {
    const recorder = yield* Recorder
    yield* Ref.update(recorder.log, (seen) => [...seen, `${name}:start`])
    yield* Effect.yieldNow
    yield* Ref.update(recorder.log, (seen) => [...seen, `${name}:end`])
  })

/**
 * A hook body that records its own `:start`, suspends, then fails with `error` — no `:end`. Mirrors
 * `test/ScenarioEffect.test.ts`'s `failingHook`: it records before failing so the log proves the hook
 * ran, and the error value stays available for a reference-identity assertion.
 */
const failingHook = (name: string, error: unknown): HookBody => () =>
  Effect.gen(function*() {
    const recorder = yield* Recorder
    yield* Ref.update(recorder.log, (seen) => [...seen, `${name}:start`])
    yield* Effect.yieldNow
    return yield* Effect.fail(error)
  })

/**
 * A step body that appends its own name to the SAME `Recorder` log the hooks above write to — no
 * `:start`/`:end` bracketing, because this file only asserts MACRO-ordering (the once-cell versus a
 * Scenario, one thunk versus another), never within-Scenario step interleaving, which is
 * `test/ScenarioEffect.test.ts`'s job.
 */
const recordingStep = (name: string): StepBody => () =>
  Effect.gen(function*() {
    const recorder = yield* Recorder
    yield* Ref.update(recorder.log, (seen) => [...seen, name])
  })

/**
 * A step body that brackets a real suspension with `${name}:start`/`${name}:end`, written onto the
 * SAME `Recorder` log `recordingHook`/`failingHook` write to — used ONLY by the headline full-ordering
 * test below. Mirrors `test/ScenarioEffect.test.ts`'s `recordingStep` exactly, for the identical
 * reason recorded there: without a real suspension in the middle, an ordering assertion cannot tell
 * sequential execution from concurrent execution that happens to finish in the same tick
 * (07-PATTERNS.md's finding). `recordingStep` above stays unbracketed on purpose — it is used only for
 * MACRO-ordering (a whole Scenario versus a whole once-cell); the headline test below needs the finer
 * step-level ordering `BeforeStep`/`AfterStep` bracket around.
 */
const bracketedStep = (name: string): StepBody => () =>
  Effect.gen(function*() {
    const recorder = yield* Recorder
    yield* Ref.update(recorder.log, (seen) => [...seen, `${name}:start`])
    yield* Effect.yieldNow
    yield* Ref.update(recorder.log, (seen) => [...seen, `${name}:end`])
  })

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

/**
 * `checkout`'s three steps, with bodies that append their own step text to the SAME `Recorder` log
 * `recordingHook`/`failingHook` write to — the fixture the `BeforeAllScenarios`/`AfterAllScenarios`
 * describe blocks below use, so a hook's entries and a Scenario's own step entries land in one
 * whole-log ordering assertion.
 */
const recorderCheckoutDefinitions: ReadonlyArray<StepDefinition<StepBody>> = [
  define({ pattern: "the cart is empty", scope: featureScope("Checkout"), body: recordingStep("the cart is empty") }),
  define({ pattern: "I pay", scope: featureScope("Checkout"), keyword: "When", body: recordingStep("I pay") }),
  define({ pattern: "I refund", scope: featureScope("Checkout"), keyword: "When", body: recordingStep("I refund") })
]

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
      layer,
      hooks: emptyHooks
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
      layer,
      hooks: emptyHooks
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
      () => emitFeature({ api, plan, layer, hooks: emptyHooks }),
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
      hooks: emptyHooks
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
        layer,
        hooks: emptyHooks
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
      layer,
      hooks: emptyHooks
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

    emitFeature({ api, plan: unusedPlan, layer, hooks: emptyHooks })

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

      emitFeature({ api, plan: unusedPlan, layer, hooks: emptyHooks })

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
      layer,
      hooks: emptyHooks
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

    emitFeature({ api, plan, layer, hooks: emptyHooks })

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

/**
 * D-08's runtime proof: running the recorded thunks shows `BeforeAllScenarios` executes exactly once
 * across N Scenarios, in either run order, and that its failure reaches every Scenario individually by
 * reference identity — never only the first one to run.
 */
describe("BeforeAllScenarios runs exactly once across every Scenario in the Feature (D-08)", () => {
  it.effect("runs ahead of both Scenarios' steps, exactly once, when run in document order (1 then 2)", () =>
    Effect.gen(function*() {
      const { api, records } = makeRecordingApi()
      const { layer: recorderLayer, log } = makeRecorderLayer()
      const hooks = hooksWith({ BeforeAllScenarios: [recordingHook("beforeAll")] })

      emitFeature({
        api,
        plan: planFeature({ feature: checkout, definitions: recorderCheckoutDefinitions }),
        layer: recorderLayer,
        hooks
      })

      yield* thunkAt(records, 1)()
      yield* thunkAt(records, 2)()

      // ONE whole-log assertion carrying both halves at once: the hook's `:start`/`:end` pair appears
      // exactly ONCE, ahead of both Scenarios' step entries — mutation K's target.
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
        hooks
      })

      yield* thunkAt(records, 2)()
      yield* thunkAt(records, 1)()

      // Proves the cell is order-independent rather than "the first emitted node happens to run
      // first": the hook still runs once, ahead of whichever Scenario the test ran first.
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
        hooks
      })

      const exit1 = yield* Effect.exit(thunkAt(records, 1)())
      const exit2 = yield* Effect.exit(thunkAt(records, 2)())

      assert.isTrue(Exit.isFailure(exit1))
      assert.isTrue(Exit.isFailure(exit2))
      // D-08's literal requirement: BOTH Scenario thunks fail, with the SAME error object — mutation
      // L's target. `Cause.squash` is safe here: only one hook fails, so the cause is never combined.
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
        hooks
      })

      yield* thunkAt(records, 1)()

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

/**
 * D-09's runtime proof: `AfterAllScenarios` is emitted as one constant-titled node, positioned after
 * every Scenario and before every warning, and it runs — and succeeds — regardless of what failed
 * before it.
 */
describe("AfterAllScenarios is emitted as one node after every Scenario and before every warning (D-09)", () => {
  it("adds exactly one extra node, titled '⚙ AfterAllScenarios', after every Scenario and before every warning", () => {
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
      hooks
    })

    // Positional, over the whole array — mutation M's target: emitted after the warnings instead of
    // before them, this array's last two entries would swap.
    assert.deepStrictEqual(shapeOf(records), [
      { kind: "describe", name: "Checkout", depth: 0 },
      { kind: "effect", name: "paying", depth: 1 },
      { kind: "effect", name: "refunding", depth: 1 },
      { kind: "effect", name: "⚙ AfterAllScenarios", depth: 1 },
      {
        kind: "effect",
        name: `⚠ unused step definition: Given "I never happen" (/repo/test/runner.steps.ts:9:5)`,
        depth: 1
      }
    ])
  })

  it.effect("runs and succeeds even when BeforeAllScenarios failed and a Scenario thunk failed (D-09)", () =>
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
        hooks
      })

      // Run the failing thunks FIRST: both Scenario nodes fail because BeforeAllScenarios failed.
      yield* Effect.exit(thunkAt(records, 1)())
      yield* Effect.exit(thunkAt(records, 2)())

      // Records: describe(0), paying(1), refunding(2), AfterAllScenarios(3) — no warnings here.
      const afterAllExit = yield* Effect.exit(thunkAt(records, 3)())

      // Mutation N's target: composing the node's body to await the BeforeAllScenarios cell first
      // would turn this into a failure.
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
        hooks
      })

      const scenario1Exit = yield* Effect.exit(thunkAt(records, 1)())
      const scenario2Exit = yield* Effect.exit(thunkAt(records, 2)())
      const afterAllExit = yield* Effect.exit(thunkAt(records, 3)())

      assert.isTrue(Exit.isSuccess(scenario1Exit))
      assert.isTrue(Exit.isSuccess(scenario2Exit))
      assert.isTrue(Exit.isFailure(afterAllExit))
      assert.strictEqual(Exit.isFailure(afterAllExit) ? Cause.squash(afterAllExit.cause) : undefined, boom)
    }))
})

/**
 * Roadmap success criterion 2, literally: one comparison over one append-only log proves the WHOLE
 * `BeforeAllScenarios → (Before → BeforeStep/step/AfterStep per step → After) per Scenario →
 * AfterAllScenarios` sequence across a two-Scenario Feature, all six hook kinds registered at once.
 *
 * Deliberately a SINGLE `assert.deepStrictEqual`, not a set of narrower per-hook-kind checks: an
 * arrangement that gets every PAIRWISE ordering right but the overall INTERLEAVING wrong — e.g. both
 * Scenarios' `Before` hooks running ahead of either Scenario's steps, or `BeforeAllScenarios` composed
 * per Scenario instead of once for the Feature (mutation P) — would still pass a suite of narrower
 * assertions built from projections or `.some(...)` searches. Only the whole log, compared at once
 * against the literal expected array, rules every one of those out simultaneously.
 */
describe("the phase's headline assertion: the full six-hook ordering across a two-Scenario Feature (roadmap SC #2)", () => {
  it.effect(
    "BeforeAllScenarios -> (Before -> BeforeStep/step/AfterStep x2 -> After) x2 -> AfterAllScenarios",
    () =>
      Effect.gen(function*() {
        const { api, records } = makeRecordingApi()
        const { layer: recorderLayer, log } = makeRecorderLayer()

        // One hook of each of the six kinds, each hook's own entries named after its kind — so the
        // expected array below reads as the sequence itself.
        const hooks: HookSet = {
          Before: [recordingHook("Before")],
          After: [recordingHook("After")],
          BeforeStep: [recordingHook("BeforeStep")],
          AfterStep: [recordingHook("AfterStep")],
          BeforeAllScenarios: [recordingHook("BeforeAllScenarios")],
          AfterAllScenarios: [recordingHook("AfterAllScenarios")]
        }

        // Hand-built ScenarioPlans over `checkout`'s real two Feature-level Scenarios (paying,
        // refunding) — their real `scenarioId`s so `emitFeature`'s `planFor` lookup resolves, but
        // hand-crafted BRACKETED step bodies (not `checkoutDefinitions`' real step text) so this test
        // controls exactly what each Scenario's TWO resolved steps record, named after their position.
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
              args: []
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
              args: []
            }
          }
        ]

        const scenario1: ScenarioPlan = {
          scenarioId: payingId,
          name: "paying",
          astName: "paying",
          ruleId: Option.none(),
          steps: stepsOf("scenario1")
        }
        const scenario2: ScenarioPlan = {
          scenarioId: refundingId,
          name: "refunding",
          astName: "refunding",
          ruleId: Option.none(),
          steps: stepsOf("scenario2")
        }

        const plan: FeaturePlan = { feature: checkout, scenarios: [scenario1, scenario2], warnings: [] }

        emitFeature({ api, plan, layer: recorderLayer, hooks })

        // Emitted order: the Feature's `describe` block (index 0), Scenario 1, Scenario 2, then the
        // `⚙ AfterAllScenarios` node — run them in that same order.
        yield* thunkAt(records, 1)()
        yield* thunkAt(records, 2)()
        yield* thunkAt(records, 3)()

        // THE headline assertion. Written out in full, grouped by line so the sequence reads directly:
        // one `BeforeAllScenarios` pair; then, per Scenario, `Before` gates two `BeforeStep`/step/
        // `AfterStep` units, followed by `After`; then, once, `AfterAllScenarios`.
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
      hooks: emptyHooks
    })

    // Identical to this file's very first assertion for this same fixture — a hookless Feature's
    // emission is unchanged by this plan.
    assert.deepStrictEqual(shapeOf(records), [
      { kind: "describe", name: "Checkout", depth: 0 },
      { kind: "effect", name: "paying", depth: 1 },
      { kind: "effect", name: "refunding", depth: 1 }
    ])
  })
})

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
 * - **Every tag and skip assertion goes through `emissionOf`, never `shapeOf`.** The two projections
 *   are siblings on purpose: a value absent from a projection is invisible to every assertion
 *   comparing through it, so the fifteen `shapeOf` assertions written before plan 09-04 would all pass
 *   against an implementation that emitted every Scenario untagged. They are left untouched precisely
 *   so they keep meaning what they meant, and the tag claims are made separately.
 * - **A filtered-out Scenario is asserted ABSENT BY TITLE, never by a smaller count.** D-03's claim is
 *   that an excluded Scenario never becomes a node at all, while a CLI `--tagsFilter` leaves one as a
 *   skipped node — a count comparison cannot tell those two outcomes apart, and telling them apart is
 *   the entire point of the decision.
 *
 * Mutation-tested (every one performed against real source, run, confirmed to fail exactly the
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
 * - Q. `mergeHookSets`'s two arguments swapped in the per-Rule merge → 1 of 25 fails, the
 *      Feature-then-Rule/Rule-then-Feature ordering test. Both ends of D-02 invert at once, and every
 *      hook name and every count in the log stays exactly right — only the order moves.
 * - R. the per-Rule merge's `?? emptyHookSet` miss branch replaced with `?? hooks` (the plausible
 *      "fall back to what we already have") → 1 of 25 fails, the exactly-ONCE test: the Feature's own
 *      set is merged with itself, so every Feature-level hook runs twice for a Rule that declared
 *      none of its own. The relative order stays correct, so only a count-pinning comparison sees it.
 * - S. `scenarioKeyFor` built from `scenarioPlan.name` instead of `.astName` → 1 of 25 fails, the
 *      both-Outline-rows test. Every plain Scenario in every other fixture in this file has
 *      `name === astName`, so this is the only test in the file the mutation is visible in at all.
 * - T. the per-Rule `ruleLayers.get(rule.id) ?? layer` reduced to `layer` → 1 of 25 fails, the
 *      three-tier test, on its middle entry alone (`tier=feature` where `tier=rule` belongs). The
 *      Feature-level and Scenario-override tiers are untouched, which is what makes the failure name
 *      the tier that broke.
 * - U. the FEATURE-level loop given `mergeHookSets(hooks, [...ruleHooks.values()][0] ?? emptyHookSet)`
 *      — the "both loops are the same three lines" tidy-up `Runner.ts` note (f) warns about → 1 of 25
 *      fails, the Feature-level-Scenario-sees-neither-Rule-hook test (threat T-08-07-03). Nothing
 *      about the emitted SHAPE changes, so every positional assertion in this file still passes.
 * - V. the FEATURE-level loop's `continue` removed, so the filter counts an exclusion and emits the
 *      Scenario anyway → 4 of 39 fail, and every one of them names the criterion it carries: the
 *      excludeTags test, the includeTags test, the both-arrays test, and the filtered-out
 *      `⚙ AfterAllScenarios` suppression test. This is the proof the filter is asserted by TITLE and
 *      not merely by a count — the `excludedScenarioCount` half of each of those tests still passes
 *      under this mutation, because the counter is exactly what the mutation leaves intact.
 * - W. the filter moved OUT of the walk and into a pre-filter of `plan.scenarios` in
 *      `src/describeFeature.ts` — RESEARCH Finding 12 reproduced on purpose → `test/emission.test.ts`
 *      dies with `emitFeature: no ScenarioPlan for scenario id "…"`, reporting `Tests no tests` for
 *      the whole file. Not a failed assertion: a thrown `Error` during collection, whose own message
 *      blames `Plan.ts` for a filter written two modules away. This is why the placement is a lettered
 *      note in `Runner.ts` rather than a comment on the `continue`.
 * - X. the `runnableScenarioCount > 0` conjunct dropped from the `⚙ AfterAllScenarios` condition → 3
 *      of 39 fail, one per way of reaching zero: every Scenario `@skip`-tagged, every Scenario
 *      filtered out, and a Feature declaring no Scenario at all. Nothing else moves, which is what
 *      makes the conjunct's three separate justifications each independently load-bearing.
 * - Y. `Tags.ts`'s `isSkipped` made to always return `false` → 4 of 713 fail across the whole repo: in
 *      this file the `@skip`-routes-to-skip test and the fully-skipped suppression test, and in
 *      `test/Tags.test.ts` its own two `isSkipped` truth cases. Nothing in the SC1, SC3 or SC4 blocks
 *      moves — the skip flag and the tag array are separate claims and are asserted separately.
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
import { makeTagFilter, noTagFilter, onlyTag, skipTag } from "../src/Tags.ts"
import type { EmitOptions, TestApi } from "../src/TestApi.ts"

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
 *
 * `options` is the `EmitOptions` value `effect` was handed, and is `null` on a `describe` record for
 * exactly the reason `self` is: `TestApi.describe` takes no options at all, and it must stay that way
 * — `Runner.ts` note (g)'s last paragraph and the framework's own tag inheritance are why. Recording
 * it as `null` rather than as an empty-and-unskipped value is deliberate: the two are indistinguishable
 * in an assertion, and an implementation that started passing options to `describe` would then be
 * invisible here. The SC1 test below asserts on this `null` directly.
 *
 * There is no `only` field, and the absence is the point rather than an omission — see the SC3 block
 * far below. `EmitOptions` has no only channel, so this fake has nothing to record one on; an
 * implementation that reached the framework's only-mode could not do it through this seam at all.
 */
type EmissionRecord = {
  readonly kind: "describe" | "effect"
  readonly name: string
  readonly depth: number
  readonly self: (() => Effect.Effect<void, unknown, Scope.Scope>) | null
  readonly options: EmitOptions | null
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
 * `shapeOf` plus the emit options — a SIBLING projection, not a replacement, and every tag or skip
 * assertion in this file goes through it.
 *
 * Two projections rather than one widened one, on purpose. `shapeOf` is what fifteen assertions
 * written across plans 06-06, 07-06 and 08-07 compare through, and every one of them is a claim about
 * emission SHAPE that this plan must leave exactly as it found it — widening the projection would have
 * meant editing all fifteen expected arrays to carry tag data they say nothing about, which is how a
 * regression gets committed inside a diff too large to read.
 *
 * The corollary is the reason this exists at all and is worth stating plainly: a value absent from a
 * projection is INVISIBLE to every assertion comparing through it. Tags and the skip flag are absent
 * from `shapeOf`, so no pre-existing assertion in this file can see them, and an implementation that
 * emitted every Scenario untagged would pass all fifteen.
 */
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

/** Just the emitted test titles, in order — the projection an ABSENCE claim is asserted through. */
const titlesOf = (records: ReadonlyArray<EmissionRecord>): ReadonlyArray<string> =>
  records.filter(({ kind }) => kind === "effect").map(({ name }) => name)

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
 * `emitFeature`'s three Rule/Scenario-scope maps, all EMPTY — spread into every call in this file
 * that predates plan 08-07's signature change.
 *
 * That spread is the backward-compatibility assertion, not boilerplate around it: a Feature that
 * declares no `Rule` and no three-argument `Scenario(...)` collects exactly these three empty maps, so
 * every shape and ordering assertion written before 08-07 goes on holding BYTE-FOR-BYTE with the new
 * parameters in place. If the merge/override paths regressed the no-Rule case, they fail here, in the
 * tests that already knew what the answer was — which is a far better place to find out than in the
 * 08-07 tests at the bottom of this file, whose expectations were written after the change.
 *
 * ONE shared object rather than a factory, which is safe rather than merely convenient for the reason
 * `Hook.ts`'s `emptyHookSet` gives on its own side: `emitFeature` only ever calls `.get` on these, and
 * a `ReadonlyMap` parameter gives it no way to mutate one, so no test can observe another test's use
 * of them. `emptyHooks` above is the same call.
 */
const noRuleScope = {
  ruleHooks: new Map<string, HookSet>(),
  ruleLayers: new Map<string, Layer.Layer<any, any, never>>(),
  scenarioLayers: new Map<string, Layer.Layer<any, any, never>>()
}

/**
 * `emitFeature`'s eighth field, set to the "filters nothing" sentinel — spread into EVERY call in
 * this file that predates plan 09-04's signature change.
 *
 * The same backward-compatibility argument `noRuleScope` above makes, one plan later: every shape,
 * ordering and hook-ordering assertion in this file was written before the tag filter existed, and
 * every one of them must still hold BYTE-FOR-BYTE under `noTagFilter`. That is the whole of the claim
 * "an absent filter changes nothing", and it is asserted here by the tests that already knew what the
 * answer was rather than by a new test written after the change.
 *
 * ONE shared object, safe for `Hook.ts`'s `emptyHookSet` reason: `TagFilter`'s two fields are
 * `ReadonlyArray`s, `emitFeature` only reads them, and nothing in `Runner.ts` mutates a filter — so no
 * test can observe another test's use of this value.
 */
const unfiltered = { tagFilter: noTagFilter }

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

/**
 * All four tag-inheritance levels at once, over a Rule-nested Outline — the SC1 fixture.
 *
 * The four tag names are `packages/gherkin/test/Correlate.test.ts:173`'s and `test/Plan.test.ts`'s,
 * reused rather than invented so the expectation here and the already-verified one over there cannot
 * drift apart. Nested inside a `Rule:` deliberately: `emitFeature` has TWO Scenario loops and the
 * Rule-level one is the only place a `@ruletag` can reach, so a Feature-level Outline would leave half
 * the walk unasserted.
 *
 * One Examples row, not two. `test/Plan.test.ts` needs two to prove every row carries the block's tag;
 * that claim is asserted there, against `planFeature`, and re-asserting it here would test `Plan.ts`
 * through `Runner.ts` — this fixture's job is that whatever `ScenarioPlan.tags` holds arrives at the
 * emitted node in the same order with the same prefixes.
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
`,
  "test/runner-tagged.feature"
)

/**
 * Both reserved tags and an untagged control, in one Feature — the SC2 and SC3 fixture.
 *
 * The untagged `plain one` is what makes SC3's claim assertable at all: D-06 says an `@only` Scenario
 * is emitted like any other, and "like any other" needs an any-other in the same emission to compare
 * against, at the same depth, from the same walk.
 */
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

/**
 * Five Scenarios across BOTH of `emitFeature`'s loops, tagged so every filter case has a hit and a
 * miss at each nesting level — the SC4 fixture.
 *
 * Three at Feature level (`@slow`, `@wip`, untagged) and two more inside a Rule (`@slow`, `@wip`). The
 * Rule half is not decoration: the filter is written out twice in `Runner.ts`, once per loop, and a
 * fixture with no Rule would leave the second copy free to be deleted with every assertion still
 * green.
 */
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

/** Every Scenario `@skip`-tagged — one of the three `⚙ AfterAllScenarios` suppression cases. */
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

/**
 * A Feature declaring no Scenario at all — the third suppression case, and the one that is not about
 * tags in the slightest.
 *
 * It falls out of the same condition for the same reason (`Runner.ts` note (e)): a Feature with
 * nothing to run never reaches the `BeforeAllScenarios` once-cell either, so an `⚙ AfterAllScenarios`
 * node would tear down what was never built. Asserted separately because a reader would otherwise
 * reasonably assume the suppression is tag-specific and "fix" it by guarding on the filter alone.
 */
const emptyFeature = parse(
  `Feature: Empty
`,
  "test/runner-empty.feature"
)

/** A step body that touches no service. */
const noop: StepBody = () => Effect.void

const featureScope = (name: string): RegistryScope => ({ kind: "feature", name, ruleId: null })

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
 * The one `When I browse` definition every tag fixture above resolves all of its steps through.
 *
 * A function of the Feature name because `RegistryScope` carries it and `Plan.ts` matches on it, so a
 * shared module-scope array would resolve nothing for four of the five fixtures. Every step in
 * `reserved`, `filtering` and `allSkipped` is worded identically on purpose: those fixtures are about
 * which Scenarios get EMITTED, and giving each one distinct step text would add a second reason for a
 * Scenario to be missing from a recording.
 */
const browseIn = (featureName: string): ReadonlyArray<StepDefinition<StepBody>> => [
  define({ pattern: "I browse", scope: featureScope(featureName), keyword: "When" })
]

/** `tagged`'s single Outline step, cucumber-expression typed so both a 1 and a 2 row would resolve. */
const taggedDefinitions: ReadonlyArray<StepDefinition<StepBody>> = [
  define({ pattern: "I add {int} apples", scope: featureScope("Tagged") })
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

/**
 * `shop`'s three steps, with bodies that append their own step text to the shared `Recorder` log —
 * the fixture the Rule-hook-ordering block at the bottom of this file uses, so a Feature-level hook's
 * entries, a Rule-level hook's entries and the Scenario's own step entry land in ONE whole-log
 * ordering assertion.
 */
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

/**
 * A service naming which of the three Layer tiers built it — the only thing the three-tier block at
 * the bottom of this file needs a Layer to be distinguishable BY.
 *
 * `Marker` above cannot do this job: it is one module-scope value, so every tier would be the same
 * instance and a Scenario provided the wrong tier's Layer would read exactly what it should have.
 */
class Tier extends Context.Service<Tier, { readonly name: string }>()("Tier") {}

/**
 * The shared `Recorder` plus a `Tier` naming this Layer's own tier.
 *
 * `Layer.merge` and not `Layer.provideMerge`: the two halves are independent — `Recorder` needs
 * nothing from `Tier` — and this file is not asserting anything about how `describeFeature.ts`
 * composes tiers. That composition already happened at REGISTRATION time by the time `emitFeature` is
 * handed a `ruleLayers`/`scenarioLayers` entry (`Runner.ts` note (f)), so what these tests hand it is
 * a fully-built effective Layer, exactly as the real caller does.
 *
 * The SAME `recorderLayer` goes into every tier, so all three write to one log and the assertion can
 * be a single ordered comparison rather than three separate reads.
 */
const withTier = (recorderLayer: Layer.Layer<Recorder>, name: string): Layer.Layer<Recorder | Tier> =>
  Layer.merge(recorderLayer, Layer.succeed(Tier, Tier.of({ name })))

/** A step body that records WHICH tier's Layer the Scenario it belongs to was actually provided. */
const tierStep = (): StepBody => () =>
  Effect.gen(function*() {
    const recorder = yield* Recorder
    const tier = yield* Tier
    yield* Ref.update(recorder.log, (seen) => [...seen, `tier=${tier.name}`])
  })

/** `shop`'s three steps, every one reporting its own Scenario's effective tier. */
const shopTierDefinitions: ReadonlyArray<StepDefinition<StepBody>> = [
  define({ pattern: "I browse", scope: featureScope("Shop"), keyword: "When", body: tierStep() }),
  define({ pattern: "I get my money back", scope: featureScope("Shop"), keyword: "When", body: tierStep() }),
  define({ pattern: "I keep the goods", scope: featureScope("Shop"), keyword: "When", body: tierStep() })
]

/**
 * `shop`'s only Rule, resolved once and asserted on rather than indexed with `!`.
 *
 * Every 08-07 block below keys `ruleHooks`/`ruleLayers` on `rule.id`, and under
 * `noUncheckedIndexedAccess` a bare `shop.rules[0]` is `ParsedRule | undefined`. A `!` would turn a
 * fixture edit that dropped the `Rule:` block into `Cannot read properties of undefined` inside
 * whichever test ran first; this says which fixture is wrong instead.
 */
const shopRule = shop.rules[0]
if (shopRule === undefined) {
  throw new Error("fixture `shop` must declare exactly one Rule — every 08-07 block below keys on its id")
}

/**
 * The composite key `emitFeature` looks `scenarioLayers` up under, REBUILT here rather than imported
 * from `src/ScenarioKey.ts`.
 *
 * `test/describeFeature.test.ts`'s own `scenarioKeyIn` makes the identical choice for the identical
 * reason, one stage earlier: the map is only usable by a party that can build the key, so the
 * ENCODING is the contract between the two stages, and a test that asked the implementation for its
 * own key could not notice that encoding changing underneath it. Written independently on BOTH sides
 * of the seam, these two constants are also what would catch `src/ScenarioKey.ts` drifting away from
 * `packages/gherkin/src/Validate.ts`'s `uniquenessKey`, which it deliberately mirrors.
 *
 * NUL separator, `<feature>` head for a Scenario in no Rule.
 */
const scenarioKeyIn = (ruleId: string | null, name: string): string => `${ruleId ?? "<feature>"}\u0000${name}`

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
      hooks: emptyHooks,
      ...noRuleScope,
      ...unfiltered
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
      hooks: emptyHooks,
      ...noRuleScope,
      ...unfiltered
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
        hooks: emptyHooks,
        ...noRuleScope,
        ...unfiltered
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
    //
    // The BASE of each title is the row's own interpolated `name`: titled with `astName` instead,
    // both rows read `adding <count>` — two identically-named tests, which `vitest/no-identical-title`
    // cannot catch because it only sees literals (mutation B).
    //
    // The SUFFIX is 08-04's D-03 format, added by `OutlineTitle.ts` on top of that name rather than
    // in place of it. `emitFeature` reverted to passing `scenarioPlan.name` straight through still
    // produces two distinct, plausible titles here — `adding 1` and `adding 2` — and fails only on
    // the parenthesised half. That the suffix is UNCONDITIONAL, i.e. present even on an Outline
    // whose title text already interpolated, is exactly what this fixture pins: it is the case
    // where the suffix is redundant for uniqueness and required anyway.
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

      emitFeature({ api, plan: unusedPlan, layer, hooks: emptyHooks, ...noRuleScope, ...unfiltered })

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
      hooks: emptyHooks,
      ...noRuleScope,
      ...unfiltered
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

    emitFeature({ api, plan, layer, hooks: emptyHooks, ...noRuleScope, ...unfiltered })

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
    // The one place in this file that drives the fake directly rather than through `emitFeature`.
    // The options are inert here — this test is about the depth counter and asserts nothing about
    // tags — so they are the untagged, unskipped pair a synthetic node would carry.
    api.effect("after", () => Effect.void, { tags: [], skip: false })

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
        hooks,
        ...noRuleScope,
        ...unfiltered
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
        hooks,
        ...noRuleScope,
        ...unfiltered
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
        hooks,
        ...noRuleScope,
        ...unfiltered
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
        hooks,
        ...noRuleScope,
        ...unfiltered
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
      hooks,
      ...noRuleScope,
      ...unfiltered
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
        hooks,
        ...noRuleScope,
        ...unfiltered
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
        hooks,
        ...noRuleScope,
        ...unfiltered
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

        // `tags: []` on both, and it is not filler: `checkout`'s two Scenarios genuinely carry no
        // tags, so an empty array is what `planFeature` would have produced for them. This test is
        // about hook ORDERING and asserts nothing about tags.
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
      hooks: emptyHooks,
      ...noRuleScope,
      ...unfiltered
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

/**
 * D-02's runtime proof against the recording fake: a Scenario INSIDE a Rule runs the Feature's
 * Before-shaped hooks then that Rule's own, and unwinds the Rule's After-shaped hooks then the
 * Feature's — while a Scenario OUTSIDE every Rule, in the same emission, sees neither of the Rule's.
 *
 * Every assertion here is one ordered comparison over the WHOLE log, never a `.includes` or a
 * per-hook count. `mergeHookSets`'s entire contract is ORDER (`Hook.ts` note (h)), so an assertion
 * that only checked both hooks RAN would pass against every wrong order there is — which is the one
 * thing this block exists to rule out.
 */
describe("a Rule's hooks merge with the Feature's in D-02's order (08-07)", () => {
  /** Feature-level `Before`/`After`, both bracketing a real suspension. */
  const featureHooks = (): HookSet =>
    hooksWith({ Before: [recordingHook("featureBefore")], After: [recordingHook("featureAfter")] })

  /** The Rule's own `Before`/`After`, in the shape `FeatureCollection.ruleHooks` carries them. */
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

      // Emission shape for `shop`, pinned by the Rule-nesting test far above: describe Shop (0),
      // browsing (1), describe refunds (2), refund granted (3), refund denied (4). Index 3 is the
      // first Scenario INSIDE the Rule.
      yield* thunkAt(records, 3)()

      // BOTH halves of D-02 in one comparison, and each fails on its own mutation. Before-shaped
      // kinds run outer-to-inner and After-shaped kinds unwind inner-to-outer, so swapping
      // `mergeHookSets`'s two arguments inverts both ends of this array at once while leaving every
      // name present and every count right.
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

      // INV-EC-005 at the hook tier, and threat T-08-07-03's assertion: the Feature-level emission
      // loop must never consult `ruleHooks`. A loop that shared the Rule-nested one's merged set —
      // the plausible "both loops are the same three lines" tidy-up `Runner.ts` warns about — leaves
      // every name here spelled correctly and simply runs two hooks that belong to a Rule this
      // Scenario is not in.
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
        // EMPTY, so the Rule-nested loop takes its `?? emptyHookSet` miss branch.
        ruleHooks: new Map(),
        ruleLayers: new Map(),
        scenarioLayers: new Map(),
        ...unfiltered
      })

      yield* thunkAt(records, 3)()

      // `?? hooks` instead of `?? emptyHookSet` on the miss — the plausible "fall back to what we
      // already have" reading — merges the Feature's set with itself and runs every Feature-level
      // hook TWICE. Both hooks still run, in the right relative order, so only a comparison that
      // pins the COUNT can see it.
      assert.deepStrictEqual(yield* Ref.get(log), [
        "featureBefore:start",
        "featureBefore:end",
        "I get my money back",
        "featureAfter:start",
        "featureAfter:end"
      ])
    }))
})

/**
 * DSL-05's runtime proof against the recording fake: three Layer tiers, one emission, three Scenarios
 * that each report which tier they were actually provided.
 *
 * `test/describeFeature.test.ts` already proves the tiers are BUILT correctly — that a Rule's entry
 * carries the Feature's services and a Scenario's carries both — by resolving the collected Layers
 * directly. Nothing there can see which of them a given emitted test node is wired to, which is this
 * block's whole subject and the one thing that makes INV-EC-005 a runtime property rather than a
 * collection-time one.
 */
describe("each Scenario is emitted with the innermost of the three Layer tiers (08-07)", () => {
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
        // Only `refund denied` brings its own — `refund granted` sits in the same Rule with no entry,
        // so one emission covers the hit and the miss at the SAME nesting level.
        scenarioLayers: new Map([[scenarioKeyIn(shopRule.id, "refund denied"), withTier(recorderLayer, "scenario")]]),
        ...unfiltered
      })

      yield* thunkAt(records, 1)()
      yield* thunkAt(records, 3)()
      yield* thunkAt(records, 4)()

      // Three tiers, three fallback branches, one comparison. Each entry fails on its own mutation:
      // `tier=feature` on the Feature-level loop consulting `ruleLayers` (T-08-07-03), `tier=rule` on
      // the Rule-nested loop keeping `layer` instead of `ruleLayer`, and `tier=scenario` on the
      // `scenarioLayers` lookup being dropped or mis-keyed. A `Layer.merge` of a hit onto the tier
      // below it — threat T-08-07-01's re-merge — leaves this array unchanged, which is exactly why
      // the no-re-merge claim is argued structurally in `Runner.ts` note (f) rather than asserted
      // here: it is a BUILD-count property, and `Recorder`'s deliberately per-`Ref`-shared Layer
      // cannot count builds (see `makeRecorderLayer`).
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
        // The UN-INTERPOLATED name, which is what the author passed to `Scenario(...)` and therefore
        // the only key `describeFeature.ts` could have written. One entry for the whole Outline.
        scenarioLayers: new Map([[scenarioKeyIn(null, "adding <count>"), withTier(recorderLayer, "scenario")]]),
        ...unfiltered
      })

      yield* thunkAt(records, 1)()
      yield* thunkAt(records, 2)()

      // `Runner.ts`'s `scenarioKeyFor` reading `scenarioPlan.name` instead of `.astName` — note (d)'s
      // trap from the other direction — builds `adding 1` and `adding 2` here, matches NEITHER, and
      // silently drops the Outline's own extra Layer: both rows read `tier=feature`. Every plain
      // Scenario in every other fixture in this file has `name === astName`, so this two-row Outline
      // is the only place in the file where that mutation is visible at all.
      assert.deepStrictEqual(yield* Ref.get(log), ["tier=scenario", "tier=scenario"])
    }))
})

/**
 * Roadmap success criterion 1: every tag a Scenario inherits reaches the emitted node, in order, with
 * its `@` prefix intact — and reaches the TEST node only, never the enclosing block.
 *
 * Everything below this line goes through `emissionOf`, never `shapeOf`. That is the whole reason the
 * sibling projection exists (see its comment): tags and the skip flag are invisible to `shapeOf`, so
 * an implementation emitting every Scenario untagged passes every assertion written above this point.
 */
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

    // Positional over the whole array, like every shape assertion in this file, so a tag arriving on
    // the wrong node fails here rather than passing a `.find(...)`.
    //
    // The ORDER is asserted, not the membership: feature, then rule, then scenario, then examples. It
    // is the order `compile()` produced and `ScenarioPlan.tags` carried through, and a set-style
    // comparison would pass against an implementation that sorted or reversed it. The `@` prefixes are
    // part of every expected string for the same reason D-04 keeps them: they are the bytes a
    // `--tagsFilter '@slow'` invocation matches against.
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

    // `Runner.ts` note (g): the framework already merges and de-duplicates a parent suite's tags onto
    // each test, so emitting on both is redundant — and suite tags are separately validated, which is
    // one more site that can throw on a Feature author's typo. Both blocks, not just the Feature's:
    // the Rule's is emitted from the other loop and could gain them independently.
    assert.deepStrictEqual(records.filter(({ kind }) => kind === "describe").map(({ options }) => options), [
      null,
      null
    ])
  })
})

/**
 * Roadmap success criterion 2's emission half, and criterion 3 entire.
 *
 * The RUNTIME half of criterion 2 — that a skipped Scenario's hooks do not run — is not asserted here
 * and cannot be: it is a property of the real framework never invoking the thunk (`TestApi.ts`'s
 * `skip` field comment), and this fake records a thunk it never runs. What is assertable here, and is
 * the only thing that could go wrong on this side of the seam, is that the flag reaches the node.
 */
describe("@skip routes to a real skip and @only routes to nothing at all (D-05, D-06)", () => {
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

    // Both halves in one comparison. `skip: true` on the tagged one is D-05; `skip: false` on the
    // untagged one is what stops "skip is hard-coded true" from passing, which a single-Scenario
    // fixture could not tell apart. The `@skip` Scenario keeps its tags: routing to a real skip is
    // ADDITIONAL to tag emission, not instead of it, so `--tagsFilter '@skip'` still selects it.
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

    // Same record count as an emission with no `@only` in it — index 3 is the last record, so nothing
    // extra was registered alongside the `@only` node.
    assert.strictEqual(records.length, 4)
    // Every recorded dimension except the tag array itself is identical to the untagged control's.
    assert.strictEqual(only.kind, plain.kind)
    assert.strictEqual(only.depth, plain.depth)
    assert.strictEqual(only.options?.skip, plain.options?.skip)
    assert.strictEqual(only.options?.skip, false)
  })

  it("puts @only in options.tags and NOWHERE else in the whole recording", () => {
    const records = emitReserved()

    // The structural half of criterion 3, and it is worth being explicit about what makes it
    // structural rather than merely observed. `EmitOptions` has no only channel — so this fake, which
    // implements `TestApi` exactly, has nothing to record an only-marking ON. There is no assertion
    // that could fail if the library "started emitting only", because the seam gives it no way to.
    // What IS assertable, and is asserted here, is the weaker sibling claim: the string never leaks
    // into a node title (where a reporter would show it) and appears in exactly one tag array.
    assert.deepStrictEqual(records.filter(({ name }) => name.includes(onlyTag)), [])
    assert.strictEqual(
      records.filter(({ options }) => options !== null && options.tags.includes(onlyTag)).length,
      1
    )
  })
})

/**
 * Roadmap success criterion 4: a Scenario the filter removes produces NO emission record — it is
 * absent, not skipped.
 *
 * That distinction is the entire point of D-03 and it is real and observable in the framework:
 * `--tagsFilter` sets a non-matching test's mode to "skip", so a CLI-filtered Scenario appears in the
 * report as a skipped node, while a Scenario excluded here was never registered and appears nowhere.
 * Every assertion below therefore compares the whole emitted title list, so a Scenario that reappeared
 * as a skipped node would fail rather than merely change a count.
 */
describe("a filtered-out Scenario produces no emission record at all (roadmap SC #4, D-03)", () => {
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

    // Whole-list comparison: a `@wip` Scenario emitted as a skipped node would appear here and fail,
    // which a length check alone would not distinguish from this passing.
    assert.deepStrictEqual(titlesOf(records), ["slow one", "plain one", "slow nested"])
    // Stated a second time as a bare absence, because that is the claim D-03 actually makes and a
    // reader should not have to derive it from the positional array above.
    assert.isFalse(titlesOf(records).includes("wip one"))
    assert.isFalse(titlesOf(records).includes("wip nested"))
    assert.deepStrictEqual(outcome, { excludedScenarioCount: 2 })
  })

  it("includeTags restricts emission to matching Scenarios, across the Rule's nested loop too", () => {
    const { outcome, records } = emitFiltered(makeTagFilter({ includeTags: ["@slow"] }))

    // `slow nested` is what proves the Rule-level loop got its own filter: the two loops are written
    // out separately in `Runner.ts` on purpose, so a filter added to only one of them leaves the other
    // emitting everything. The untagged `plain one` is excluded — an include filter is a whitelist,
    // and "carries no tags" is not a match.
    assert.deepStrictEqual(titlesOf(records), ["slow one", "slow nested"])
    // Three excluded: `wip one` and `plain one` from the Feature-level loop, `wip nested` from the
    // Rule's. One counter, both loops.
    assert.deepStrictEqual(outcome, { excludedScenarioCount: 3 })
  })

  it("excludes a tag named in BOTH arrays — exclude wins the author's self-contradiction", () => {
    const { outcome, records } = emitFiltered(makeTagFilter({ includeTags: ["@slow"], excludeTags: ["@slow"] }))

    // Nothing survives, and the blocks are still emitted: `Runner.ts` note (g) records that as a
    // decision, not an oversight — a Feature the reader can find and see is empty beats one that
    // silently is not there. So this is the emission shape, not an empty array.
    assert.deepStrictEqual(shapeOf(records), [
      { kind: "describe", name: "Filtering", depth: 0 },
      { kind: "describe", name: "nested", depth: 1 }
    ])
    assert.deepStrictEqual(outcome, { excludedScenarioCount: 5 })
  })
})

/**
 * Pitfall 4, and the ONLY assertion in this repository that can see it.
 *
 * If the tag filter were ever moved earlier — into `planFeature`, or into a pre-filter of
 * `plan.scenarios` — every step definition used exclusively by an excluded Scenario would newly report
 * as unused, on all three of D-02's warning channels at once. Warning nodes always pass, so nothing
 * would go red anywhere else in this suite. This block is the regression guard for that, and it is
 * labelled so nobody deletes it as redundant with the SC4 block above.
 */
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
    // Captured BEFORE either emission, so the second comparison below can see `emitFeature` mutating
    // the plan it was handed — which it must never do.
    const warningsBefore = planWithUnused.warnings.map(({ message }) => message)

    const unfilteredRecords = emitWith(noTagFilter)
    // `@exampletag` is a declared tag that no Scenario in `filtering` carries, so this include-filter
    // excludes all five without naming any of them.
    const fullyExcludedRecords = emitWith(makeTagFilter({ includeTags: ["@exampletag"] }))

    // Not vacuous: there IS a warning to compare. Without this line the two empty arrays below would
    // match each other forever, including under the plan-time filtering this test exists to forbid.
    assert.strictEqual(warningTitlesOf(unfilteredRecords).length, 1)

    // The warning nodes survive full exclusion, byte for byte. They describe REGISTRATION, not
    // execution, and a filtered run that dropped them would claim this Feature has no unused
    // definitions — a different and false statement.
    assert.deepStrictEqual(warningTitlesOf(fullyExcludedRecords), warningTitlesOf(unfilteredRecords))
    // And the structured list itself is untouched by either call.
    assert.deepStrictEqual(planWithUnused.warnings.map(({ message }) => message), warningsBefore)
  })
})

/**
 * `Runner.ts` note (e)'s new conjunct: the `⚙ AfterAllScenarios` node is suppressed exactly when no
 * runnable Scenario was emitted.
 *
 * "Runnable" is both halves — survived the filter AND not `@skip` — because a skipped test's thunk is
 * never invoked either, so it reaches the `BeforeAllScenarios` once-cell no more than an excluded
 * Scenario does. All three ways of reaching zero get their own test, because a reader would otherwise
 * reasonably assume the condition is about tags and guard on the filter alone.
 */
describe("the AfterAllScenarios node is suppressed when nothing runnable was emitted (D-09, Pitfall 6)", () => {
  const afterAllHooks = (): HookSet => hooksWith({ AfterAllScenarios: [recordingHook("afterAll")] })

  it("still emits the node when at least one emitted Scenario is not skipped", () => {
    const { api, records } = makeRecordingApi()

    emitFeature({
      api,
      plan: planFeature({ feature: reserved, definitions: browseIn("Reserved") }),
      layer,
      hooks: afterAllHooks(),
      ...noRuleScope,
      ...unfiltered
    })

    // `skipped one` is skipped; `only one` and `plain one` are not. One runnable Scenario is the
    // threshold, and this fixture clears it while containing a skipped Scenario — so it also rules out
    // the wrong reading "suppress whenever ANY Scenario is skipped".
    assert.deepStrictEqual(titlesOf(records), ["skipped one", "only one", "plain one", "⚙ AfterAllScenarios"])
  })

  it("suppresses the node when EVERY Scenario is @skip-tagged — the Scenarios still emit", () => {
    const { api, records } = makeRecordingApi()

    emitFeature({
      api,
      plan: planFeature({ feature: allSkipped, definitions: browseIn("All Skipped") }),
      layer,
      hooks: afterAllHooks(),
      ...noRuleScope,
      ...unfiltered
    })

    // Both Scenarios ARE emitted, as skipped tests — that is D-05 and it is unchanged. What is absent
    // is the teardown node: `BeforeAllScenarios` is a once-cell reached only from inside a Scenario
    // thunk, and no thunk here will ever be invoked, so it structurally cannot have run.
    assert.deepStrictEqual(emissionOf(records), [
      { kind: "describe", name: "All Skipped", depth: 0, tags: null, skip: null },
      { kind: "effect", name: "skipped one", depth: 1, tags: [skipTag], skip: true },
      { kind: "effect", name: "skipped two", depth: 1, tags: [skipTag], skip: true }
    ])
  })

  it("suppresses the node when EVERY Scenario is filtered out", () => {
    const { api, records } = makeRecordingApi()

    emitFeature({
      api,
      plan: planFeature({ feature: filtering, definitions: browseIn("Filtering") }),
      layer,
      hooks: afterAllHooks(),
      ...noRuleScope,
      tagFilter: makeTagFilter({ includeTags: ["@exampletag"] })
    })

    assert.deepStrictEqual(titlesOf(records), [])
  })

  it("suppresses the node for a Feature that declares no Scenario at all", () => {
    const { api, records } = makeRecordingApi()

    emitFeature({
      api,
      // No definitions: a Feature with no steps to resolve also has no definition that could go
      // unused, so this recording contains the `describe` and nothing else.
      plan: planFeature({ feature: emptyFeature, definitions: [] }),
      layer,
      hooks: afterAllHooks(),
      ...noRuleScope,
      ...unfiltered
    })

    // Not a tag case at all, and it falls out of the same conjunct for the same reason — which is why
    // the condition counts RUNNABLE EMISSIONS rather than inspecting the filter.
    assert.deepStrictEqual(shapeOf(records), [{ kind: "describe", name: "Empty", depth: 0 }])
  })
})

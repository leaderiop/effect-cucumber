/**
 * INV-EC-001's runtime proof: a Scenario is one Effect, its steps run in list order, the first
 * failure stops every step after it, and the Feature's Layer is built fresh on every execution.
 *
 * The claim under test is not "a broken Scenario fails" — that is easy and almost every wrong
 * implementation satisfies it. The claim is WHERE it stopped, and that is only observable as a
 * record of what actually ran. So every assertion below reads a recorded execution order rather
 * than the absence of an exception:
 *
 * - **fail-fast is asserted by the recorded array, never by `Exit.isFailure` alone.** An
 *   implementation that ran all four steps and reported the second one's failure at the end is
 *   indistinguishable from a correct one by the exit value. The array names the steps that ran and,
 *   by omission, the ones that did not.
 * - **each step records a `:start` and an `:end` around a real suspension point**, so the log
 *   distinguishes sequential execution from interleaved execution. `recordingStep`'s own comment has
 *   the measurement that forced this: without the suspension, mutation A survives the whole file.
 * - **the Layer's freshness is asserted by observing a BUILT value across two executions**, never by
 *   comparing Layer object references. `Registry.ts` note (a) records that exact trap for the
 *   sibling case: a closure over module-level state still hands back two different objects, so
 *   reference inequality passes against the defect it looks like it is guarding. Here the Layer's
 *   construction pushes the `Ref` it built onto a list, so "how many times was this Layer built, and
 *   did the second build share the first's state" are both answered by looking at the list.
 * - **the error is asserted by REFERENCE IDENTITY** (`assert.strictEqual` against the very object the
 *   step failed with). A structural comparison passes against an implementation that re-wraps,
 *   re-tags or reconstructs the failure, which is the actual defect: the value the reporter prints
 *   would no longer be the value the step author wrote.
 *
 * Mutation-tested (all seven performed, then reverted, all seven confirmed failing) — see the plan
 * summary for the recorded output:
 * - A. the `for` loop replaced with `Effect.forEach(args.plan.steps, …, { concurrency: "unbounded" })`
 *      → the ordering and fail-fast tests fail.
 * - B. the `Unresolved` branch changed from a failure to a no-op `continue` → the unresolved-step
 *      test fails, because the Scenario succeeds.
 * - C. the Layer provided inside the loop, once per step → the freshness test sees four builds
 *      instead of two, and the ordering test's log stops accumulating.
 * - D. `Effect.onExit` replaced with `Effect.ensuring` plus a widened hook type → the
 *      step-fails-and-After-fails test fails, because the After hook's cause is dropped instead of
 *      combined with the step's own.
 * - E. the `Before` batch moved INSIDE the step loop → the Before-hooks-then-steps ordering test
 *      fails.
 * - F. the `Before` batch replaced with a first-wins fold → the three-Before independence test
 *      fails, because only the first hook's `:start` (and none of the other two) appears in the log.
 * - G. the `onExit` moved to wrap only the step loop instead of the whole generator → the
 *      Before-failed-but-After-ran test fails, because the After hook's entries are absent from the
 *      log.
 * - H. the per-step `onExit` narrowed to wrap only `planned.step.body`, leaving `BeforeStep` outside
 *      it → the BeforeStep-fails-and-AfterStep-still-ran test fails, because the AfterStep hook's
 *      entries are absent from the log.
 * - I. the per-step unit hoisted out of the `for` loop into `Effect.forEach(args.plan.steps, …, {
 *      concurrency: "unbounded" })` → the four-step (second fails) test fails, because steps three
 *      and four's hook entries appear in the log despite the second step's failure.
 * - J. the `AfterStep` batch moved to run before the `BeforeStep` batch inside the per-step unit → the
 *      one-BeforeStep/one-AfterStep ordering test fails, because the log records the AfterStep hook
 *      before the step body ever ran.
 *
 * ## The plan values are built here, by hand, and never through `planFeature`
 *
 * This module's contract IS the plan: a `ScenarioPlan` in, an Effect out. Routing the fixtures
 * through `planFeature` would make a `Plan.ts` regression fail in this file too, so a red run would
 * no longer say which of the two modules broke. `test/Plan.test.ts` covers the planner, against real
 * parsed Features, and it is the only file that should.
 *
 * ## `expect` in the sync test, `assert` inside every `it.effect`
 *
 * Same reason as `test/Step.test.ts`: oxlint's `vitest/no-standalone-expect` does not recognise
 * `it.effect` as a test block, so an `expect` nested in the `Effect.gen` body it takes is reported as
 * standalone and fails `pnpm lint`. The one synchronous test calls `expect` directly inside `it`,
 * where the rule is satisfied. Do not "make them consistent".
 *
 * ## Imports
 *
 * `../src/ScenarioEffect.ts` and `../src/Errors.ts` directly, never `../src/index.ts`:
 * `effect/no-import-from-barrel-package` runs with `checkRelativeIndexImports: true` and fails
 * `pnpm lint` on a relative value-import whose basename is `index.*`. `buildScenarioEffect` is not in
 * that barrel anyway (ScenarioEffect.ts's closing note).
 */
import { assert, describe, expect, it } from "@effect/vitest"
import * as Cause from "effect/Cause"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Ref from "effect/Ref"
import { StepMatchError } from "../src/Errors.ts"
import type { HookBody, HookSet } from "../src/Hook.ts"
import type { PlannedStep, ScenarioPlan, StepBody } from "../src/Plan.ts"
import { buildScenarioEffect } from "../src/ScenarioEffect.ts"

/**
 * The one service the fixture Layer provides: an append-only log of the steps that ran.
 *
 * The log lives INSIDE the service rather than in a module-scope array the step bodies close over,
 * and that is the whole point of the fixture. A closed-over array records the steps no matter how
 * many times the Layer was built, so it cannot tell one build from four — which is exactly what
 * mutation C changes. Routed through the service, the log is per-build, and `makeRecording` below
 * keeps every build's log so a test can count them.
 */
class Recorder extends Context.Service<Recorder, { readonly log: Ref.Ref<ReadonlyArray<string>> }>()("Recorder") {}

/**
 * A Layer that records each of its own builds, plus the list of what it built.
 *
 * `builds` grows by one entry every time the Layer is constructed, and each entry is that build's
 * own `Ref`. Two executions of one Scenario Effect must produce two entries holding two different
 * `Ref`s with independent contents (INV-EC-002); one execution of a four-step Scenario must produce
 * exactly one.
 *
 * Returned from a factory rather than declared at module scope so each test gets its own counter and
 * the tests stay order-independent.
 */
const makeRecording = (): {
  readonly layer: Layer.Layer<Recorder>
  readonly builds: ReadonlyArray<Ref.Ref<ReadonlyArray<string>>>
} => {
  const builds: Array<Ref.Ref<ReadonlyArray<string>>> = []
  const layer = Layer.effect(
    Recorder,
    Effect.gen(function*() {
      const log = yield* Ref.make<ReadonlyArray<string>>([])
      builds.push(log)
      return Recorder.of({ log })
    })
  )
  return { layer, builds }
}

/**
 * A step body that brackets a SUSPENSION POINT with a `:start` and a `:end` entry, then succeeds.
 *
 * Both halves of that sentence are load-bearing, and the reason is measured rather than assumed —
 * the first draft of this file recorded one entry per step, with no suspension, and mutation A
 * SURVIVED it, passing all eight tests.
 *
 * A step body built only from `Ref.update` never suspends, so a fibre running it runs it to
 * completion before the next one is even forked. `Effect.forEach(steps, …, { concurrency:
 * "unbounded" })` over such bodies therefore produces the identical single-entry-per-step log a
 * sequential loop does, and a failure in step two still interrupts three and four before they get
 * scheduled — so a log of bare names cannot tell interleaved execution from sequential execution at
 * all. It asserts an ordering the fixture made unfalsifiable.
 *
 * `Effect.yieldNow` puts a real suspension in the middle, which is what every non-trivial step has,
 * and the bracketing makes the interleaving legible: sequential execution logs
 * `["a:start", "a:end", "b:start", "b:end"]`, and concurrent execution logs
 * `["a:start", "b:start", …]` no matter what order the fibres happen to resume in. Do not
 * "simplify" this back to a single entry per step.
 */
const recordingStep = (name: string): StepBody => () =>
  Effect.gen(function*() {
    const recorder = yield* Recorder
    yield* Ref.update(recorder.log, (seen) => [...seen, `${name}:start`])
    yield* Effect.yieldNow
    yield* Ref.update(recorder.log, (seen) => [...seen, `${name}:end`])
  })

/**
 * A step body that records its own `:start`, suspends, and then fails with `error` — no `:end`.
 *
 * It records before failing on purpose: the fail-fast assertion is that the steps AFTER this one are
 * absent from the log, which is only meaningful if this one is present.
 */
const failingStep = (name: string, error: unknown): StepBody => () =>
  Effect.gen(function*() {
    const recorder = yield* Recorder
    yield* Ref.update(recorder.log, (seen) => [...seen, `${name}:start`])
    yield* Effect.yieldNow
    return yield* Effect.fail(error)
  })

/**
 * A hook body that brackets a SUSPENSION POINT with a `:start` and a `:end` entry, then succeeds —
 * mirrors `recordingStep` exactly, for the identical reason recorded on that function's own doc
 * comment: without a real suspension in the middle, the ordering assertions below are unfalsifiable
 * against a concurrent implementation (07-PATTERNS.md's finding at this file's own L108-127).
 */
const recordingHook = (name: string): HookBody => () =>
  Effect.gen(function*() {
    const recorder = yield* Recorder
    yield* Ref.update(recorder.log, (seen) => [...seen, `${name}:start`])
    yield* Effect.yieldNow
    yield* Ref.update(recorder.log, (seen) => [...seen, `${name}:end`])
  })

/**
 * A hook body that records its own `:start`, suspends, and then fails with `error` — no `:end`.
 * Mirrors `failingStep` exactly: it records before failing so the log proves the hook ran, and the
 * error value stays available for a reference-identity assertion.
 */
const failingHook = (name: string, error: unknown): HookBody => () =>
  Effect.gen(function*() {
    const recorder = yield* Recorder
    yield* Ref.update(recorder.log, (seen) => [...seen, `${name}:start`])
    yield* Effect.yieldNow
    return yield* Effect.fail(error)
  })

/** A `Resolved` planned step. `origin` is what says a step came from a Background. */
const resolved = (
  name: string,
  body: StepBody,
  origin: "feature-background" | "scenario" = "scenario"
): PlannedStep => ({
  _tag: "Resolved",
  step: {
    text: name,
    line: 1,
    keyword: origin === "scenario" ? "When" : "Given",
    origin,
    pattern: name,
    body,
    args: []
  }
})

/** An `Unresolved` planned step carrying the exact error instance the Scenario must fail with. */
const unresolved = (name: string, error: StepMatchError): PlannedStep => ({
  _tag: "Unresolved",
  text: name,
  line: 7,
  error
})

/**
 * A `ScenarioPlan` around a step list. Nothing but `steps` is read by this module.
 *
 * `tags` is present and empty for the same reason every other field here is present and inert: the
 * type requires it. `ScenarioEffect.ts` composes a Scenario's Effect and never reads a tag — tag
 * routing happens at emission, one stage later — so there is nothing here for a tag to change.
 */
const planOf = (steps: ReadonlyArray<PlannedStep>): ScenarioPlan => ({
  scenarioId: "pickle-1",
  name: "a scenario",
  astName: "a scenario",
  ruleId: Option.none(),
  tags: [],
  steps
})

/** The `StepMatchError` the unresolved-step test asserts by reference. */
const undefinedStepError = new StepMatchError({
  reason: "UndefinedStep",
  uri: "test/scenario-effect.feature",
  line: Option.some(7),
  stepText: "I am not registered anywhere",
  scenarioName: "a scenario",
  matchedPatterns: [],
  suggestion: Option.none(),
  message: "test/scenario-effect.feature:7: UndefinedStep: the step matched none of the step definitions"
})

/**
 * All six `HookKind` keys present, every one an empty array — the regression-guard value for every
 * test in this file that is not itself about hooks. Module scope and capture-free, per
 * `unicorn/consistent-function-scoping`'s house convention for a repeated call-site literal.
 */
const emptyHooks: HookSet = {
  Before: [],
  After: [],
  BeforeStep: [],
  AfterStep: [],
  BeforeAllScenarios: [],
  AfterAllScenarios: []
}

/** `emptyHooks` with one or more kinds overridden — keeps each hook test's intent to one line. */
const hooksWith = (overrides: Partial<HookSet>): HookSet => ({ ...emptyHooks, ...overrides })

/**
 * Every original error value inside `cause`, walked STRUCTURALLY via `cause.reasons` and
 * `Cause.isFailReason` — never `Cause.squash`, which does not return either original by identity
 * from a COMBINED cause (the plan's Verified API Constraints). Order matches `reasons`'s own order,
 * which both `Hook.ts`'s `runHookBatch` fold and `Effect.onExit`'s merge preserve as encounter
 * order — verified against the installed `effect@4.0.0-rc.112` build, not assumed.
 */
const failedErrors = (cause: Cause.Cause<unknown>): ReadonlyArray<unknown> =>
  cause.reasons.filter(Cause.isFailReason).map((reason) => reason.error)

describe("a Scenario runs its steps in list order", () => {
  it.effect("runs a Background step first, then its own steps, each exactly once", () =>
    Effect.gen(function*() {
      const { builds, layer } = makeRecording()
      const plan = planOf([
        resolved("background", recordingStep("background"), "feature-background"),
        resolved("one", recordingStep("one")),
        resolved("two", recordingStep("two")),
        resolved("three", recordingStep("three"))
      ])

      yield* buildScenarioEffect({ plan, layer, hooks: emptyHooks })

      // ADR-EC-004's "Background inlined as the leading yield*s", asserted as an ORDER and not as a
      // membership: a concurrent or reordered implementation records the same four names. Each step
      // is fully closed before the next one opens — that non-interleaving is the actual claim, and
      // it is what mutation A breaks.
      assert.deepStrictEqual(yield* Ref.get(builds[0]!), [
        "background:start",
        "background:end",
        "one:start",
        "one:end",
        "two:start",
        "two:end",
        "three:start",
        "three:end"
      ])
    }))

  it.effect("builds the Layer once around the whole Scenario, not once per step", () =>
    Effect.gen(function*() {
      const { builds, layer } = makeRecording()
      const plan = planOf([
        resolved("one", recordingStep("one")),
        resolved("two", recordingStep("two")),
        resolved("three", recordingStep("three")),
        resolved("four", recordingStep("four"))
      ])

      yield* buildScenarioEffect({ plan, layer, hooks: emptyHooks })

      // Provided per step instead, this is 4, and every step gets its own World — a silent
      // behavioural bug with an identical type and an identical pass/fail result (mutation C).
      assert.strictEqual(builds.length, 1)
    }))

  it.effect("succeeds when the Scenario has no steps at all", () =>
    Effect.gen(function*() {
      const { layer } = makeRecording()

      const exit = yield* Effect.exit(buildScenarioEffect({ plan: planOf([]), layer, hooks: emptyHooks }))

      assert.isTrue(Exit.isSuccess(exit))
    }))
})

describe("a failing step stops the Scenario", () => {
  it.effect("runs the steps before it and none of the steps after it", () =>
    Effect.gen(function*() {
      const { builds, layer } = makeRecording()
      const plan = planOf([
        resolved("one", recordingStep("one")),
        resolved("two", failingStep("two", "boom" as const)),
        resolved("three", recordingStep("three")),
        resolved("four", recordingStep("four"))
      ])

      const exit = yield* Effect.exit(buildScenarioEffect({ plan, layer, hooks: emptyHooks }))

      assert.isTrue(Exit.isFailure(exit))
      // THE load-bearing assertion of this file, and the roadmap's success criterion 2. Asserting
      // only that the exit is a failure passes against an implementation that ran all four steps and
      // reported the second one's error at the end. The two absent names are the proof.
      assert.deepStrictEqual(yield* Ref.get(builds[0]!), ["one:start", "one:end", "two:start"])
    }))

  it.effect("surfaces the step's own error value, unmodified", () =>
    Effect.gen(function*() {
      const { layer } = makeRecording()
      // An object, so identity is distinguishable from an equal-looking reconstruction.
      const boom = { why: "the step author's own error" }
      const plan = planOf([
        resolved("one", recordingStep("one")),
        resolved("two", failingStep("two", boom))
      ])

      const exit = yield* Effect.exit(buildScenarioEffect({ plan, layer, hooks: emptyHooks }))

      // Through Exit, never a try/catch on a promise: a step that unexpectedly SUCCEEDS is reported
      // as the wrong value rather than silently passing an absent-throw check (Step.test.ts).
      assert.strictEqual(
        Exit.isFailure(exit) ? Cause.squash(exit.cause) : "the Scenario unexpectedly succeeded",
        boom
      )
    }))
})

describe("an unresolved step fails the Scenario in position", () => {
  it.effect("fails with the exact StepMatchError, after the steps before it have run", () =>
    Effect.gen(function*() {
      const { builds, layer } = makeRecording()
      const plan = planOf([
        resolved("one", recordingStep("one")),
        unresolved("I am not registered anywhere", undefinedStepError),
        resolved("three", recordingStep("three")),
        resolved("four", recordingStep("four"))
      ])

      const exit = yield* Effect.exit(buildScenarioEffect({ plan, layer, hooks: emptyHooks }))

      // Reference identity: the error `Plan.ts` built is the error the reporter prints, with no
      // re-wrap and no reconstruction in between.
      assert.strictEqual(
        Exit.isFailure(exit) ? Cause.squash(exit.cause) : "the Scenario unexpectedly succeeded",
        undefinedStepError
      )
      // ADR-EC-019 fails the containing Scenario, not the file, and `Plan.ts` note (a) is why the
      // verdict is delivered in position: how far the Scenario got is the developer's evidence. An
      // up-front scan would make this array empty; mutation B makes the whole test fail by never
      // failing at all.
      assert.deepStrictEqual(yield* Ref.get(builds[0]!), ["one:start", "one:end"])
    }))
})

describe("the Feature's Layer is built fresh on every execution", () => {
  it.effect("two runs of the same Effect see two independent service instances", () =>
    Effect.gen(function*() {
      const { builds, layer } = makeRecording()
      const scenario = buildScenarioEffect({
        plan: planOf([resolved("one", recordingStep("one"))]),
        layer,
        hooks: emptyHooks
      })

      yield* scenario
      yield* scenario

      // Reference inequality of the LAYER would prove nothing here — Registry.ts note (a) records
      // that trap — so what is observed is the value each build produced. Two builds, two different
      // Refs, and neither carries the other's state: that is INV-EC-002 for the per-Scenario case.
      assert.strictEqual(builds.length, 2)
      assert.notStrictEqual(builds[0]!, builds[1]!)
      assert.deepStrictEqual(yield* Ref.get(builds[0]!), ["one:start", "one:end"])
      assert.deepStrictEqual(yield* Ref.get(builds[1]!), ["one:start", "one:end"])
    }))
})

describe("the composed Scenario is a value, not a running test", () => {
  it("builds nothing until it is executed", () => {
    const { builds, layer } = makeRecording()

    // Bound rather than discarded: `@effect/tsgo`'s `effect(floatingEffect)` rejects an
    // Effect-valued expression statement, which is the diagnostic that exists to catch a composed
    // Effect nobody ever runs — and an unrun Effect is precisely what this test is about.
    const scenario = buildScenarioEffect({
      plan: planOf([resolved("one", recordingStep("one"))]),
      layer,
      hooks: emptyHooks
    })

    // `Runner.ts` hands the result to `TestApi.effect` as a thunk, and the framework decides when —
    // and how many times — to run it. A `buildScenarioEffect` that ran anything eagerly would build
    // the Layer at collection time, which is where the per-execution freshness above comes from.
    expect(builds).toHaveLength(0)
    // And a value did come back — so the emptiness above is laziness, not a `buildScenarioEffect`
    // that returned early without composing anything.
    expect(scenario).toBeTypeOf("object")
  })
})

/**
 * RUN-02 and INV-EC-004's runtime proof, plan 07-04's headline: `Before` gates the step loop
 * structurally, its independent-and-collecting batch semantics (D-02/D-03) are proven at THIS layer
 * (not re-proven from `Hook.ts`'s own suite, which already covers the batch mechanism in isolation —
 * these tests prove the WEAVING), and `After` is guaranteed via `Effect.onExit` around the whole
 * composed generator, on success, on a step failure, and even when `Before` itself failed.
 */
describe("Before gates the step loop, and After is guaranteed via Effect.onExit", () => {
  it.effect("runs two Before hooks then the Scenario's own steps, in registration order (D-01)", () =>
    Effect.gen(function*() {
      const { builds, layer } = makeRecording()
      const plan = planOf([
        resolved("one", recordingStep("one")),
        resolved("two", recordingStep("two"))
      ])
      const hooks = hooksWith({ Before: [recordingHook("before1"), recordingHook("before2")] })

      yield* buildScenarioEffect({ plan, layer, hooks })

      // Registration order, and BEFORE the steps: a Before batch run concurrently, or moved inside
      // the step loop (mutation E), still records the same four names in a different arrangement.
      assert.deepStrictEqual(yield* Ref.get(builds[0]!), [
        "before1:start",
        "before1:end",
        "before2:start",
        "before2:end",
        "one:start",
        "one:end",
        "two:start",
        "two:end"
      ])
    }))

  it.effect("runs the Scenario's own steps then two After hooks, in registration order, on success", () =>
    Effect.gen(function*() {
      const { builds, layer } = makeRecording()
      const plan = planOf([
        resolved("one", recordingStep("one")),
        resolved("two", recordingStep("two"))
      ])
      const hooks = hooksWith({ After: [recordingHook("after1"), recordingHook("after2")] })

      yield* buildScenarioEffect({ plan, layer, hooks })

      // INV-EC-004's success half: After runs, in registration order, after every step.
      assert.deepStrictEqual(yield* Ref.get(builds[0]!), [
        "one:start",
        "one:end",
        "two:start",
        "two:end",
        "after1:start",
        "after1:end",
        "after2:start",
        "after2:end"
      ])
    }))

  it.effect("guarantees the one After hook even when the first of two steps fails (RUN-02)", () =>
    Effect.gen(function*() {
      const { builds, layer } = makeRecording()
      const boom = { why: "the first step's own error" }
      const plan = planOf([
        resolved("one", failingStep("one", boom)),
        resolved("two", recordingStep("two"))
      ])
      const hooks = hooksWith({ After: [recordingHook("after")] })

      const exit = yield* Effect.exit(buildScenarioEffect({ plan, layer, hooks }))

      assert.isTrue(Exit.isFailure(exit))
      // THE load-bearing assertion of this block, and the roadmap's success criterion 3: the log
      // ENDS with the After hook's entries, and the second step's `:start` is ABSENT. Asserting only
      // `Exit.isFailure` passes against an implementation that ran the second step anyway.
      assert.deepStrictEqual(yield* Ref.get(builds[0]!), ["one:start", "after:start", "after:end"])
    }))

  it.effect("runs all three Before hooks independently when the first fails, and no step runs (D-02, D-04)", () =>
    Effect.gen(function*() {
      const { builds, layer } = makeRecording()
      const boom = { why: "the first Before hook's own error" }
      const plan = planOf([resolved("one", recordingStep("one"))])
      const hooks = hooksWith({
        Before: [failingHook("before1", boom), recordingHook("before2"), recordingHook("before3")]
      })

      const exit = yield* Effect.exit(buildScenarioEffect({ plan, layer, hooks }))

      assert.isTrue(Exit.isFailure(exit))
      // ONE assertion carrying both halves at once: all three hooks' `:start` entries — the second
      // and third also run their `:end`, proving the batch does NOT stop at the first failure (D-02,
      // mutation F) — and ZERO step entries, because the Scenario's steps only run if every Before
      // hook succeeded (D-04).
      assert.deepStrictEqual(yield* Ref.get(builds[0]!), [
        "before1:start",
        "before2:start",
        "before2:end",
        "before3:start",
        "before3:end"
      ])
    }))

  it.effect("combines both Before hook failures into the reported cause, by reference identity (D-03)", () =>
    Effect.gen(function*() {
      const { layer } = makeRecording()
      const boom1 = { why: "the first Before hook's own error" }
      const boom2 = { why: "the second Before hook's own error" }
      const plan = planOf([resolved("one", recordingStep("one"))])
      const hooks = hooksWith({ Before: [failingHook("before1", boom1), failingHook("before2", boom2)] })

      const exit = yield* Effect.exit(buildScenarioEffect({ plan, layer, hooks }))

      assert.isTrue(Exit.isFailure(exit))
      // Walked STRUCTURALLY via `cause.reasons`, never `Cause.squash`ed: squashing a COMBINED cause
      // does not return either original error by identity, so a first-wins fold (mutation F) and a
      // correct independent-and-collect batch both leave `Cause.squash` looking identical — only
      // walking the reasons array tells them apart.
      const errors = Exit.isFailure(exit) ? failedErrors(exit.cause) : []
      assert.strictEqual(errors.length, 2)
      assert.strictEqual(errors[0], boom1)
      assert.strictEqual(errors[1], boom2)
    }))

  it.effect("combines the step's own failure and the After hook's failure, by reference identity (roadmap SC #4)", () =>
    Effect.gen(function*() {
      const { layer } = makeRecording()
      const stepBoom = { why: "the step's own error" }
      const afterBoom = { why: "the After hook's own error" }
      const plan = planOf([resolved("one", failingStep("one", stepBoom))])
      const hooks = hooksWith({ After: [failingHook("after", afterBoom)] })

      const exit = yield* Effect.exit(buildScenarioEffect({ plan, layer, hooks }))

      assert.isTrue(Exit.isFailure(exit))
      // Both errors recoverable by reference identity — a failing After hook must not MASK or
      // replace the step's own failure. `Effect.ensuring` cannot produce this: its finalizer's error
      // channel is `never` in the installed `effect@4.0.0-rc.112` build, so a fallible After hook is
      // not even assignable to it, and forcing it through by widening the type merges no causes
      // (mutation D).
      const errors = Exit.isFailure(exit) ? failedErrors(exit.cause) : []
      assert.strictEqual(errors.length, 2)
      assert.strictEqual(errors[0], stepBoom)
      assert.strictEqual(errors[1], afterBoom)
    }))

  it.effect("still runs the one After hook when the one Before hook that gates it failed (D-07)", () =>
    Effect.gen(function*() {
      const { builds, layer } = makeRecording()
      const boom = { why: "the Before hook's own error" }
      const plan = planOf([resolved("one", recordingStep("one"))])
      const hooks = hooksWith({ Before: [failingHook("before", boom)], After: [recordingHook("after")] })

      const exit = yield* Effect.exit(buildScenarioEffect({ plan, layer, hooks }))

      assert.isTrue(Exit.isFailure(exit))
      // The guarantee wraps the WHOLE Scenario, not just the step loop: the After hook's entries are
      // present even though Before failed before any step ran. Wrapping `onExit` around only the step
      // loop (mutation G) would leave this log with the Before hook's `:start` alone.
      assert.deepStrictEqual(yield* Ref.get(builds[0]!), ["before:start", "after:start", "after:end"])
    }))

  it.effect("emits exactly the pre-hook log when no hooks are registered at all", () =>
    Effect.gen(function*() {
      const { builds, layer } = makeRecording()
      const plan = planOf([
        resolved("one", recordingStep("one")),
        resolved("two", recordingStep("two"))
      ])

      yield* buildScenarioEffect({ plan, layer, hooks: emptyHooks })

      // A regression guard: threading `hooks` through `buildScenarioEffect` changes nothing about a
      // Scenario that registers none. Every describe block above this one already exercises this
      // exact shape via `emptyHooks`; this test names the claim explicitly.
      assert.deepStrictEqual(yield* Ref.get(builds[0]!), ["one:start", "one:end", "two:start", "two:end"])
    }))
})

/**
 * D-05, D-06, D-07's runtime proof — plan 07-05's headline: every resolved step, Background steps
 * included, runs inside its own `BeforeStep` → body unit, and `AfterStep` is guaranteed across the
 * WHOLE unit — on success, on the step's own failure, and even when the paired `BeforeStep` itself
 * failed before the step body ever ran. The `Unresolved` branch stays outside the unit entirely: an
 * unresolved step never runs, so it gets no hook entries at all.
 */
describe("BeforeStep/AfterStep bracket every step, including Background, and AfterStep is guaranteed", () => {
  it.effect("brackets every step, Background included, with the one BeforeStep/AfterStep pair (ADR-EC-004)", () =>
    Effect.gen(function*() {
      const { builds, layer } = makeRecording()
      const plan = planOf([
        resolved("background", recordingStep("background"), "feature-background"),
        resolved("one", recordingStep("one")),
        resolved("two", recordingStep("two"))
      ])
      const hooks = hooksWith({ BeforeStep: [recordingHook("before")], AfterStep: [recordingHook("after")] })

      yield* buildScenarioEffect({ plan, layer, hooks })

      // A partitioning implementation that treats the Background step specially fails HERE and
      // nowhere else — `ParsedScenario.steps` already carries it ahead of the Scenario's own
      // (ADR-EC-004), so it is wrapped by the identical unit as "one" and "two".
      assert.deepStrictEqual(yield* Ref.get(builds[0]!), [
        "before:start",
        "before:end",
        "background:start",
        "background:end",
        "after:start",
        "after:end",
        "before:start",
        "before:end",
        "one:start",
        "one:end",
        "after:start",
        "after:end",
        "before:start",
        "before:end",
        "two:start",
        "two:end",
        "after:start",
        "after:end"
      ])
    }))

  it.effect("runs both BeforeStep hooks then the body then both AfterStep hooks, in registration order (D-01)", () =>
    Effect.gen(function*() {
      const { builds, layer } = makeRecording()
      const plan = planOf([resolved("one", recordingStep("one"))])
      const hooks = hooksWith({
        BeforeStep: [recordingHook("before1"), recordingHook("before2")],
        AfterStep: [recordingHook("after1"), recordingHook("after2")]
      })

      yield* buildScenarioEffect({ plan, layer, hooks })

      assert.deepStrictEqual(yield* Ref.get(builds[0]!), [
        "before1:start",
        "before1:end",
        "before2:start",
        "before2:end",
        "one:start",
        "one:end",
        "after1:start",
        "after1:end",
        "after2:start",
        "after2:end"
      ])
    }))

  it.effect("ends with the failing step's AfterStep, and no later BeforeStep/step/AfterStep runs (D-06)", () =>
    Effect.gen(function*() {
      const { builds, layer } = makeRecording()
      const boom = { why: "the second step's own error" }
      const plan = planOf([
        resolved("one", recordingStep("one")),
        resolved("two", failingStep("two", boom)),
        resolved("three", recordingStep("three")),
        resolved("four", recordingStep("four"))
      ])
      const hooks = hooksWith({ BeforeStep: [recordingHook("before")], AfterStep: [recordingHook("after")] })

      const exit = yield* Effect.exit(buildScenarioEffect({ plan, layer, hooks }))

      assert.isTrue(Exit.isFailure(exit))
      // THE load-bearing assertion of this test: steps three and four, and their BeforeStep/AfterStep
      // entries, are entirely absent — the Scenario stopped advancing, and the failing step's own
      // AfterStep is still the last thing to run.
      assert.deepStrictEqual(yield* Ref.get(builds[0]!), [
        "before:start",
        "before:end",
        "one:start",
        "one:end",
        "after:start",
        "after:end",
        "before:start",
        "before:end",
        "two:start",
        "after:start",
        "after:end"
      ])
    }))

  it.effect("still runs AfterStep when the paired BeforeStep failed, and the step body never ran (D-07)", () =>
    Effect.gen(function*() {
      const { builds, layer } = makeRecording()
      const boom = { why: "the BeforeStep hook's own error" }
      const plan = planOf([resolved("one", recordingStep("one"))])
      const hooks = hooksWith({ BeforeStep: [failingHook("before", boom)], AfterStep: [recordingHook("after")] })

      const exit = yield* Effect.exit(buildScenarioEffect({ plan, layer, hooks }))

      assert.isTrue(Exit.isFailure(exit))
      // "one:start" is ABSENT — the step body never ran — and the AfterStep hook's entries are
      // PRESENT. This is the assertion that discriminates a whole-unit wrap (correct) from a
      // body-only wrap (mutation H): a body-only wrap would leave this log with no entries at all.
      assert.deepStrictEqual(yield* Ref.get(builds[0]!), ["before:start", "after:start", "after:end"])
    }))

  it.effect("combines a step's own failure and its AfterStep's failure, by reference identity (D-06)", () =>
    Effect.gen(function*() {
      const { layer } = makeRecording()
      const stepBoom = { why: "the step's own error" }
      const afterStepBoom = { why: "the AfterStep hook's own error" }
      const plan = planOf([resolved("one", failingStep("one", stepBoom))])
      const hooks = hooksWith({ AfterStep: [failingHook("afterStep", afterStepBoom)] })

      const exit = yield* Effect.exit(buildScenarioEffect({ plan, layer, hooks }))

      assert.isTrue(Exit.isFailure(exit))
      // Walked STRUCTURALLY via `cause.reasons`, never `Cause.squash`ed — squashing a COMBINED cause
      // does not return either original error by identity. Both original error objects must stay
      // recoverable, proving the AfterStep failure does not MASK the step's own.
      const errors = Exit.isFailure(exit) ? failedErrors(exit.cause) : []
      assert.strictEqual(errors.length, 2)
      assert.strictEqual(errors[0], stepBoom)
      assert.strictEqual(errors[1], afterStepBoom)
    }))

  it.effect("fails the unresolved step in position with no hook entries for it (the deliberate asymmetry)", () =>
    Effect.gen(function*() {
      const { builds, layer } = makeRecording()
      const plan = planOf([
        resolved("one", recordingStep("one")),
        unresolved("I am not registered anywhere", undefinedStepError),
        resolved("three", recordingStep("three"))
      ])
      const hooks = hooksWith({ BeforeStep: [recordingHook("before")], AfterStep: [recordingHook("after")] })

      const exit = yield* Effect.exit(buildScenarioEffect({ plan, layer, hooks }))

      assert.strictEqual(
        Exit.isFailure(exit) ? Cause.squash(exit.cause) : "the Scenario unexpectedly succeeded",
        undefinedStepError
      )
      // Step one's hook pair ran; the unresolved step gets NO hook entry at all, and step three never
      // runs. This pins the deliberate asymmetry from task 1's `isUnresolved` branch — a later "make
      // it uniform" edit fails this test rather than passing silently.
      assert.deepStrictEqual(yield* Ref.get(builds[0]!), [
        "before:start",
        "before:end",
        "one:start",
        "one:end",
        "after:start",
        "after:end"
      ])
    }))

  it.effect("emits exactly the pre-BeforeStep/AfterStep log when no per-step hooks are registered", () =>
    Effect.gen(function*() {
      const { builds, layer } = makeRecording()
      const plan = planOf([
        resolved("one", recordingStep("one")),
        resolved("two", recordingStep("two"))
      ])

      yield* buildScenarioEffect({ plan, layer, hooks: emptyHooks })

      // The unconditional-wrap regression guard: threading BeforeStep/AfterStep through every step
      // changes nothing about a Scenario that registers neither.
      assert.deepStrictEqual(yield* Ref.get(builds[0]!), ["one:start", "one:end", "two:start", "two:end"])
    }))
})

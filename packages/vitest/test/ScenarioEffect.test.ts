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
 * Mutation-tested (all three performed, then reverted, all three confirmed failing) — see the plan
 * summary for the recorded output:
 * - A. the `for` loop replaced with `Effect.forEach(args.plan.steps, …, { concurrency: "unbounded" })`
 *      → the ordering and fail-fast tests fail.
 * - B. the `Unresolved` branch changed from a failure to a no-op `continue` → the unresolved-step
 *      test fails, because the Scenario succeeds.
 * - C. the Layer provided inside the loop, once per step → the freshness test sees four builds
 *      instead of two, and the ordering test's log stops accumulating.
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
import type { HookSet } from "../src/Hook.ts"
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

/** A `ScenarioPlan` around a step list. Nothing but `steps` is read by this module. */
const planOf = (steps: ReadonlyArray<PlannedStep>): ScenarioPlan => ({
  scenarioId: "pickle-1",
  name: "a scenario",
  astName: "a scenario",
  ruleId: Option.none(),
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
  message: "test/scenario-effect.feature:7: UndefinedStep: the step matched none of the step definitions",
  cause: Option.none()
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

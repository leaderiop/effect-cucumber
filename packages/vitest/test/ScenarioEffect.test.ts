/**
 * INV-EC-001's runtime proof: a Scenario is one Effect, its steps run in list order, the first failure stops every
 * step after it, and the Feature's Layer is built fresh on every execution. Also carries the failure-panel fix's in-process half (ADR-EC-033):
 * a step's own failure or defect gains a `StepFailureLocation` `.cause` before it can propagate (ADR-EC-033); the
 * real-vitest-output half lives in `scripts/verify-failure-panel.sh`.
 *
 * Carries: ADR-EC-004, ADR-EC-019, ADR-EC-033, BEH-EC-025, INV-EC-001, INV-EC-002, INV-EC-004.
 */
import { assert, describe, expect, it } from "@effect/vitest"
import * as Cause from "effect/Cause"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Ref from "effect/Ref"
import { StepFailureLocation, StepMatchError } from "../src/Errors.ts"
import type { HookBody, HookSet } from "../src/Hook.ts"
import type { PlannedStep, ScenarioPlan, StepBody } from "../src/Plan.ts"
import { buildScenarioEffect } from "../src/ScenarioEffect.ts"

// The one service the fixture Layer provides: an append-only log of the steps that ran.
class Recorder extends Context.Service<Recorder, { readonly log: Ref.Ref<ReadonlyArray<string>> }>()("Recorder") {}

// A Layer that records each of its own builds, plus the list of what it built.
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

// A step body that brackets a SUSPENSION POINT with a `:start` and a `:end` entry, then succeeds.
const recordingStep = (name: string): StepBody => () =>
  Effect.gen(function*() {
    const recorder = yield* Recorder
    yield* Ref.update(recorder.log, (seen) => [...seen, `${name}:start`])
    yield* Effect.yieldNow
    yield* Ref.update(recorder.log, (seen) => [...seen, `${name}:end`])
  })

// A step body that records its own `:start`, suspends, and then fails with `error` — no `:end`.
const failingStep = (name: string, error: unknown): StepBody => () =>
  Effect.gen(function*() {
    const recorder = yield* Recorder
    yield* Ref.update(recorder.log, (seen) => [...seen, `${name}:start`])
    yield* Effect.yieldNow
    return yield* Effect.fail(error)
  })

// A step body that THROWS rather than `yield* Effect.fail`s — a DEFECT (`Cause.Die`), not a typed failure. The
// common real-world shape of a failing step: `assert.strictEqual` and friends throw, they do not `Effect.fail`.
const throwingStep = (name: string, error: unknown): StepBody => () =>
  Effect.gen(function*() {
    const recorder = yield* Recorder
    yield* Ref.update(recorder.log, (seen) => [...seen, `${name}:start`])
    yield* Effect.yieldNow
    throw error
  })

const recordingHook = (name: string): HookBody => () =>
  Effect.gen(function*() {
    const recorder = yield* Recorder
    yield* Ref.update(recorder.log, (seen) => [...seen, `${name}:start`])
    yield* Effect.yieldNow
    yield* Ref.update(recorder.log, (seen) => [...seen, `${name}:end`])
  })

// A hook body that records its own `:start`, suspends, and then fails with `error` — no `:end`.
const failingHook = (name: string, error: unknown): HookBody => () =>
  Effect.gen(function*() {
    const recorder = yield* Recorder
    yield* Ref.update(recorder.log, (seen) => [...seen, `${name}:start`])
    yield* Effect.yieldNow
    return yield* Effect.fail(error)
  })

// A `Resolved` planned step.
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
    args: [],
    uri: "test/scenario-effect.feature"
  }
})

// An `Unresolved` planned step carrying the exact error instance the Scenario must fail with.
const unresolved = (name: string, error: StepMatchError): PlannedStep => ({
  _tag: "Unresolved",
  text: name,
  line: 7,
  error
})

// A `ScenarioPlan` around a step list.
const planOf = (steps: ReadonlyArray<PlannedStep>): ScenarioPlan => ({
  scenarioId: "pickle-1",
  name: "a scenario",
  astName: "a scenario",
  ruleId: Option.none(),
  tags: [],
  steps
})

// The `StepMatchError` the unresolved-step test asserts by reference.
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

// All six `HookKind` keys present, every one an empty array — the regression-guard value for every test in this file
// that is not itself about hooks.
const emptyHooks: HookSet = {
  Before: [],
  After: [],
  BeforeStep: [],
  AfterStep: [],
  BeforeAllScenarios: [],
  AfterAllScenarios: []
}

// `emptyHooks` with one or more kinds overridden — keeps each hook test's intent to one line.
const hooksWith = (overrides: Partial<HookSet>): HookSet => ({ ...emptyHooks, ...overrides })

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

      // ADR-EC-004's "Background inlined as the leading yield*s", asserted as an ORDER and not as a membership: a
      // concurrent or reordered implementation records the same four names.
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

      // Provided per step instead, this is 4, and every step gets its own World — a silent behavioural bug with an
      // identical type and an identical pass/fail result (mutation C).
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
      // THE load-bearing assertion of this file, and the roadmap's success criterion 2.
      assert.deepStrictEqual(yield* Ref.get(builds[0]!), ["one:start", "one:end", "two:start"])
    }))

  it.effect("surfaces the step's own error value BY REFERENCE, with a StepFailureLocation .cause attached (ADR-EC-033)", () =>
    Effect.gen(function*() {
      const { layer } = makeRecording()
      // An object, so identity is distinguishable from an equal-looking reconstruction.
      const boom = { why: "the step author's own error" }
      const plan = planOf([
        resolved("one", recordingStep("one")),
        resolved("two", failingStep("two", boom))
      ])

      const exit = yield* Effect.exit(buildScenarioEffect({ plan, layer, hooks: emptyHooks }))

      // `boom` itself gained a `.cause` (ADR-EC-033's own describe block below covers this in full) — this
      // test's own claim is narrower and older: the value reported IS `boom`, by reference, not a reconstruction of
      // it. Through Exit, never a try/catch on a promise: a step that unexpectedly SUCCEEDS is reported as the wrong
      // value rather than silently passing an absent-throw check (Step.test.ts).
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

      // Reference identity: the error `Plan.ts` built is the error the reporter prints, with no re-wrap and no
      // reconstruction in between.
      assert.strictEqual(
        Exit.isFailure(exit) ? Cause.squash(exit.cause) : "the Scenario unexpectedly succeeded",
        undefinedStepError
      )
      // ADR-EC-019 fails the containing Scenario, not the file, and `Plan.ts` note (a) is why the verdict is
      // delivered in position: how far the Scenario got is the developer's evidence.
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

      // Reference inequality of the LAYER would prove nothing here — Registry.ts note (a) records that trap — so what
      // is observed is the value each build produced.
      assert.strictEqual(builds.length, 2)
      assert.notStrictEqual(builds[0]!, builds[1]!)
      assert.deepStrictEqual(yield* Ref.get(builds[0]!), ["one:start", "one:end"])
      assert.deepStrictEqual(yield* Ref.get(builds[1]!), ["one:start", "one:end"])
    }))
})

describe("the composed Scenario is a value, not a running test", () => {
  it("builds nothing until it is executed", () => {
    const { builds, layer } = makeRecording()

    const scenario = buildScenarioEffect({
      plan: planOf([resolved("one", recordingStep("one"))]),
      layer,
      hooks: emptyHooks
    })

    // `Runner.ts` hands the result to `TestApi.effect` as a thunk, and the framework decides when — and how many
    // times — to run it.
    expect(builds).toHaveLength(0)
    // And a value did come back — so the emptiness above is laziness, not a `buildScenarioEffect` that returned early
    // without composing anything.
    expect(scenario).toBeTypeOf("object")
  })
})

describe("Before gates the step loop, and After is guaranteed via Effect.onExit", () => {
  it.effect("runs two Before hooks then the Scenario's own steps, in registration order", () =>
    Effect.gen(function*() {
      const { builds, layer } = makeRecording()
      const plan = planOf([
        resolved("one", recordingStep("one")),
        resolved("two", recordingStep("two"))
      ])
      const hooks = hooksWith({ Before: [recordingHook("before1"), recordingHook("before2")] })

      yield* buildScenarioEffect({ plan, layer, hooks })

      // Registration order, and BEFORE the steps: a Before batch run concurrently, or moved inside the step loop
      // (mutation E), still records the same four names in a different arrangement.
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

  it.effect("guarantees the one After hook even when the first of two steps fails", () =>
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
      // THE load-bearing assertion of this block, and the roadmap's success criterion 3: the log ENDS with the After
      // hook's entries, and the second step's `:start` is ABSENT.
      assert.deepStrictEqual(yield* Ref.get(builds[0]!), ["one:start", "after:start", "after:end"])
    }))

  it.effect("runs all three Before hooks independently when the first fails, and no step runs", () =>
    Effect.gen(function*() {
      const { builds, layer } = makeRecording()
      const boom = { why: "the first Before hook's own error" }
      const plan = planOf([resolved("one", recordingStep("one"))])
      const hooks = hooksWith({
        Before: [failingHook("before1", boom), recordingHook("before2"), recordingHook("before3")]
      })

      const exit = yield* Effect.exit(buildScenarioEffect({ plan, layer, hooks }))

      assert.isTrue(Exit.isFailure(exit))
      assert.deepStrictEqual(yield* Ref.get(builds[0]!), [
        "before1:start",
        "before2:start",
        "before2:end",
        "before3:start",
        "before3:end"
      ])
    }))

  it.effect("combines both Before hook failures into the reported cause, by reference identity", () =>
    Effect.gen(function*() {
      const { layer } = makeRecording()
      const boom1 = { why: "the first Before hook's own error" }
      const boom2 = { why: "the second Before hook's own error" }
      const plan = planOf([resolved("one", recordingStep("one"))])
      const hooks = hooksWith({ Before: [failingHook("before1", boom1), failingHook("before2", boom2)] })

      const exit = yield* Effect.exit(buildScenarioEffect({ plan, layer, hooks }))

      assert.isTrue(Exit.isFailure(exit))
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
      // Both errors recoverable by reference identity — a failing After hook must not MASK or replace the step's own
      // failure.
      const errors = Exit.isFailure(exit) ? failedErrors(exit.cause) : []
      assert.strictEqual(errors.length, 2)
      assert.strictEqual(errors[0], stepBoom)
      assert.strictEqual(errors[1], afterBoom)
    }))

  it.effect("still runs the one After hook when the one Before hook that gates it failed", () =>
    Effect.gen(function*() {
      const { builds, layer } = makeRecording()
      const boom = { why: "the Before hook's own error" }
      const plan = planOf([resolved("one", recordingStep("one"))])
      const hooks = hooksWith({ Before: [failingHook("before", boom)], After: [recordingHook("after")] })

      const exit = yield* Effect.exit(buildScenarioEffect({ plan, layer, hooks }))

      assert.isTrue(Exit.isFailure(exit))
      // The guarantee wraps the WHOLE Scenario, not just the step loop: the After hook's entries are present even
      // though Before failed before any step ran.
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

      // A regression guard: threading `hooks` through `buildScenarioEffect` changes nothing about a Scenario that
      // registers none.
      assert.deepStrictEqual(yield* Ref.get(builds[0]!), ["one:start", "one:end", "two:start", "two:end"])
    }))
})

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

  it.effect("runs both BeforeStep hooks then the body then both AfterStep hooks, in registration order", () =>
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

  it.effect("ends with the failing step's AfterStep, and no later BeforeStep/step/AfterStep runs", () =>
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

  it.effect("still runs AfterStep when the paired BeforeStep failed, and the step body never ran", () =>
    Effect.gen(function*() {
      const { builds, layer } = makeRecording()
      const boom = { why: "the BeforeStep hook's own error" }
      const plan = planOf([resolved("one", recordingStep("one"))])
      const hooks = hooksWith({ BeforeStep: [failingHook("before", boom)], AfterStep: [recordingHook("after")] })

      const exit = yield* Effect.exit(buildScenarioEffect({ plan, layer, hooks }))

      assert.isTrue(Exit.isFailure(exit))
      // "one:start" is ABSENT — the step body never ran — and the AfterStep hook's entries are PRESENT.
      assert.deepStrictEqual(yield* Ref.get(builds[0]!), ["before:start", "after:start", "after:end"])
    }))

  it.effect("combines a step's own failure and its AfterStep's failure, by reference identity", () =>
    Effect.gen(function*() {
      const { layer } = makeRecording()
      const stepBoom = { why: "the step's own error" }
      const afterStepBoom = { why: "the AfterStep hook's own error" }
      const plan = planOf([resolved("one", failingStep("one", stepBoom))])
      const hooks = hooksWith({ AfterStep: [failingHook("afterStep", afterStepBoom)] })

      const exit = yield* Effect.exit(buildScenarioEffect({ plan, layer, hooks }))

      assert.isTrue(Exit.isFailure(exit))
      // Walked STRUCTURALLY via `cause.reasons`, never `Cause.squash`ed — squashing a COMBINED cause does not return
      // either original error by identity.
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
      // Step one's hook pair ran; the unresolved step gets NO hook entry at all, and step three never runs.
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

      // The unconditional-wrap regression guard: threading BeforeStep/AfterStep through every step changes nothing
      // about a Scenario that registers neither.
      assert.deepStrictEqual(yield* Ref.get(builds[0]!), ["one:start", "one:end", "two:start", "two:end"])
    }))
})

// A `Resolved` planned step at a specific pattern/uri/line, for the ADR-EC-033 tests below, where the exact located
// values matter and `resolved()`'s hardcoded `line: 1, uri: "test/scenario-effect.feature"` would hide a
// pattern/text mismatch bug rather than catch one.
const resolvedAt = (
  args: { readonly pattern: string; readonly uri: string; readonly line: number; readonly body: StepBody }
): PlannedStep => ({
  _tag: "Resolved",
  step: {
    text: args.pattern,
    line: args.line,
    keyword: "When",
    origin: "scenario",
    pattern: args.pattern,
    body: args.body,
    args: [],
    uri: args.uri
  }
})

describe("a step's own failure gains a StepFailureLocation .cause before it can propagate (ADR-EC-033)", () => {
  it.effect("attaches step/file/line to a step's TYPED failure (Effect.fail)", () =>
    Effect.gen(function*() {
      const { layer } = makeRecording()
      const boom = new Error("assertion boom")
      const plan = planOf([
        resolvedAt({
          pattern: "I have {int} apples",
          uri: "features/apples.feature",
          line: 12,
          body: failingStep("one", boom)
        })
      ])

      const exit = yield* Effect.exit(buildScenarioEffect({ plan, layer, hooks: emptyHooks }))

      assert.isTrue(Exit.isFailure(exit))
      const reported = Exit.isFailure(exit) ? Cause.squash(exit.cause) : undefined
      // BY REFERENCE: the reported failure is still `boom` itself, not a wrapper replacing it.
      assert.strictEqual(reported, boom)
      assert.instanceOf(boom.cause, StepFailureLocation)
      const location = boom.cause as StepFailureLocation
      assert.strictEqual(location.step, "I have {int} apples")
      assert.strictEqual(location.file, "features/apples.feature")
      assert.strictEqual(location.line, 12)
      // `.name` is what makes vitest's own reporter recurse into `.cause` and print it as "Caused
      // by:" (`scripts/verify-failure-panel.sh` proves this against a real `vitest run`) — a plain
      // `{ step, file, line }` object without one would be silently invisible to that mechanism.
      assert.strictEqual(location.name, "StepFailureLocation")
    }))

  it.effect("attaches step/file/line to a step's DEFECT (a thrown exception, not Effect.fail)", () =>
    Effect.gen(function*() {
      const { layer } = makeRecording()
      const boom = new Error("thrown, not failed")
      const plan = planOf([
        resolvedAt({
          pattern: "I throw",
          uri: "features/throwing.feature",
          line: 3,
          body: throwingStep("one", boom)
        })
      ])

      const exit = yield* Effect.exit(buildScenarioEffect({ plan, layer, hooks: emptyHooks }))

      assert.isTrue(Exit.isFailure(exit))
      // The DEFECT lane specifically: `Cause.Die`, not `Cause.Fail` — this is what proves the
      // `Effect.catchDefect` half of `withStepFailureLocation` actually ran, and not only its
      // `Effect.mapError` half.
      assert.isTrue(Exit.isFailure(exit) && Cause.hasDies(exit.cause) && !Cause.hasFails(exit.cause))
      const reported = Exit.isFailure(exit) ? Cause.squash(exit.cause) : undefined
      assert.strictEqual(reported, boom)
      assert.instanceOf(boom.cause, StepFailureLocation)
      const location = boom.cause as StepFailureLocation
      assert.strictEqual(location.step, "I throw")
      assert.strictEqual(location.file, "features/throwing.feature")
      assert.strictEqual(location.line, 3)
    }))

  it.effect("preserves a failure's PRE-EXISTING .cause as the new StepFailureLocation's own .cause", () =>
    Effect.gen(function*() {
      const { layer } = makeRecording()
      const original = { why: "the real root cause" }
      const boom = new Error("outer failure", { cause: original })
      const plan = planOf([
        resolvedAt({
          pattern: "I fail with a cause",
          uri: "features/cause.feature",
          line: 9,
          body: failingStep("one", boom)
        })
      ])

      const exit = yield* Effect.exit(buildScenarioEffect({ plan, layer, hooks: emptyHooks }))

      assert.isTrue(Exit.isFailure(exit))
      assert.instanceOf(boom.cause, StepFailureLocation)
      const location = boom.cause as StepFailureLocation
      // Nothing already attached was silently dropped: it survives one level deeper.
      assert.strictEqual(location.cause, original)
    }))

  it.effect("does NOT attach a location to a Before hook's own failure (out of scope for ADR-EC-033)", () =>
    Effect.gen(function*() {
      const { layer } = makeRecording()
      const boom = { why: "the Before hook's own error" }
      const plan = planOf([resolved("one", recordingStep("one"))])
      const hooks = hooksWith({ Before: [failingHook("before", boom)] })

      const exit = yield* Effect.exit(buildScenarioEffect({ plan, layer, hooks }))

      assert.isTrue(Exit.isFailure(exit))
      const reported = Exit.isFailure(exit) ? Cause.squash(exit.cause) : undefined
      assert.strictEqual(reported, boom)
      // A hook is not a step: `withStepFailureLocation` never wraps `runHookBatch`, so `boom` never
      // gains a `.cause` at all.
      assert.strictEqual((boom as { cause?: unknown }).cause, undefined)
    }))

  it.effect("does NOT attach a location to an Unresolved step's StepMatchError (it already self-locates)", () =>
    Effect.gen(function*() {
      const { layer } = makeRecording()
      const plan = planOf([unresolved("I am not registered anywhere", undefinedStepError)])

      const exit = yield* Effect.exit(buildScenarioEffect({ plan, layer, hooks: emptyHooks }))

      assert.isTrue(Exit.isFailure(exit))
      assert.strictEqual(
        Exit.isFailure(exit) ? Cause.squash(exit.cause) : "the Scenario unexpectedly succeeded",
        undefinedStepError
      )
      // `StepMatchError.cause` is `Schema.optionalKey` and was never set by `Plan.ts`'s `undefinedStep` builder —
      // still absent, because the `Unresolved` branch returns via a plain `Effect.fail` OUTSIDE
      // `withStepFailureLocation`'s reach.
      assert.strictEqual(undefinedStepError.cause, undefined)
    }))
})

/**
 * DSL-07's runtime proof: a bare-generator hook body is auto-wrapped with the hook's own kind as its
 * span name, and an already-wrapped hook function is returned UNCHANGED — plus `groupHooks`'
 * per-kind partitioning and `runHookBatch`'s independent-batch execution with combined causes (D-02,
 * D-03).
 *
 * Both halves of ADR-EC-005, applied to hooks, are invisible to the type system for the same reason
 * `test/Step.test.ts` documents for steps: `Effect.fn`'s v4 overloads accept a generator body and an
 * Effect-returning body alike with no cast, so an implementation that wraps unconditionally compiles
 * perfectly and still runs. The only observable damage is a second span nested inside the author's
 * own. This file copies `test/Step.test.ts`'s two load-bearing assertion styles for that reason:
 *
 * - the pass-through is asserted by REFERENCE IDENTITY (`toBe`), never structurally.
 * - the span is asserted by READING THE ACTIVE SPAN from inside the running hook body, never by
 *   inspecting a returned function's own `.name`.
 *
 * `runHookBatch`'s ordering assertion copies `ScenarioEffect.test.ts`'s `:start`/`:end`-bracketed
 * log around a real `Effect.yieldNow` suspension (L108-127 records that a single entry per body let
 * a concurrency mutation survive all eight tests there) — do NOT "simplify" it back to one entry.
 *
 * Mutation-tested (performed, then reverted, confirmed failing):
 * - A. `registerHook` wraps unconditionally (drops the delegation to `register`'s guard) → the
 *      identity test fails.
 * - B. `registerHook` returns `fn` unconditionally (never wraps) → the span-name test fails.
 * - C. `groupHooks` pushes into the wrong kind's array (e.g. every hook lands under `Before`) → the
 *      mixed-kind grouping test fails.
 * - D. `runHookBatch`'s `for` loop replaced with
 *      `Effect.forEach(hooks, (hook) => Effect.exit(hook()), { concurrency: "unbounded" })` → the
 *      ordered `:start`/`:end` log test fails (interleaved rather than sequential).
 * - E. the fold replaced with first-wins (`return yield* Effect.failCause(exit.cause)` on the first
 *      failing exit, breaking out of the loop) → the two-failure identity test fails, because only
 *      one original error is present in the reported cause, and the "runs every hook even when an
 *      earlier one fails" test fails too, because the batch stops after the first hook.
 * - F. `mergeHookSets`'s `After`/`AfterStep` concatenated feature-first like `Before` (the copy-paste
 *      defect) → the reversed-order tests fail. Note this is invisible to the type system and to
 *      every length- or membership-based assertion: both orders produce a two-element array holding
 *      the same two bodies, which is why the assertions below are positional AND by reference.
 * - G. `mergeHookSets`'s `BeforeAllScenarios`/`AfterAllScenarios` concatenated rather than passed
 *      through → the pass-through test fails, but ONLY because that test builds a `rule` set with
 *      entries under those two keys. Against a rule set that is empty there (which is every real one
 *      by construction) concatenation is an invisible no-op — do NOT "simplify" that fixture.
 *
 * ## `mergeHookSets`'s ordering is asserted twice, on purpose
 *
 * Once structurally (the merged arrays' contents, positionally, by reference) and once through
 * `runHookBatch` on a real merged array with an append-only `Ref` log. The structural assertion
 * pins the data; the log assertion is what proves concatenation order IS execution order, which is
 * the actual claim D-02 makes and the only one a reader of `ScenarioEffect.ts` cares about.
 *
 * ## `expect` in the sync tests, `assert` inside every `it.effect`
 *
 * Not a style preference — oxlint's `vitest/no-standalone-expect` does not recognise `it.effect` as
 * a test block, so an `expect` nested in the `Effect.gen` body it takes is reported as standalone.
 *
 * ## Imports
 *
 * `../src/Hook.ts` directly, never `../src/index.ts` — `effect/no-import-from-barrel-package` runs
 * with `checkRelativeIndexImports: true`. `@effect/vitest` is the one `@effect/*` package that same
 * rule exempts.
 */
import { assert, describe, expect, it } from "@effect/vitest"
import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Ref from "effect/Ref"
import {
  emptyHookSet,
  groupHooks,
  type HookBody,
  type HookSet,
  mergeHookSets,
  registerHook,
  runHookBatch
} from "../src/Hook.ts"
import type { HookDefinition } from "../src/HookRegistry.ts"

/**
 * A bare-generator hook body, at module scope because it captures nothing
 * (`unicorn/consistent-function-scoping`). `registerHook` must NOT return this one by identity.
 */
const bareBefore = function*() {
  return yield* Effect.succeed("before ran")
}

/**
 * Capture-free hook bodies for the `groupHooks` ordering test, at module scope because they capture
 * nothing (`unicorn/consistent-function-scoping`).
 */
const firstBefore: HookBody = () => Effect.succeed(undefined)
const anAfter: HookBody = () => Effect.succeed(undefined)
const secondBefore: HookBody = () => Effect.succeed(undefined)

/**
 * A no-op successful hook body for the `runHookBatch` independence tests, at module scope because it
 * captures nothing (`unicorn/consistent-function-scoping`).
 */
const succeedingHook: HookBody = () => Effect.succeed(undefined)

/**
 * A hook body whose only property is being a reference nothing else in the process shares — every
 * call returns a fresh closure. `mergeHookSets`'s ordering is a claim about WHICH body sits at
 * WHICH index, so the fixtures it is asserted against have to be distinguishable by identity and by
 * nothing else; bodies that differ by name or by what they return would let a structural assertion
 * stand in for the positional one this file actually needs.
 */
const distinctHook = (): HookBody => () => Effect.succeed(undefined)

/**
 * A `HookSet` carrying exactly one distinct body under every one of the six keys, so a merge's
 * result can be read positionally (`merged.Before[0]` is `feature.Before[0]`, and so on).
 *
 * A factory and not a shared constant: two calls must produce twelve mutually distinct bodies, or
 * "the Feature's hook came first" and "the Rule's hook came first" would be the same assertion.
 */
const oneOfEachKind = (): HookSet => ({
  Before: [distinctHook()],
  After: [distinctHook()],
  BeforeStep: [distinctHook()],
  AfterStep: [distinctHook()],
  BeforeAllScenarios: [distinctHook()],
  AfterAllScenarios: [distinctHook()]
})

describe("an already-wrapped hook function is accepted unchanged", () => {
  it("comes back as the identical reference, not a re-wrap", () => {
    const alreadyWrapped = Effect.fn("Before")(function*() {
      return yield* Effect.succeed("before ran")
    })

    // THE load-bearing assertion of this file. Reference identity, and nothing weaker: a structural
    // comparison, a `typeof === "function"` check, or asserting the result behaves the same all pass
    // against an implementation that re-wraps — which is the actual defect. Mutation A makes exactly
    // this line fail.
    expect(registerHook("Before", alreadyWrapped)).toBe(alreadyWrapped)
  })
})

describe("a bare generator hook function is wrapped", () => {
  it("does not come back by identity", () => {
    expect(registerHook("Before", bareBefore)).not.toBe(bareBefore)
  })

  it.effect("makes the hook kind observable as the active span's name", () =>
    Effect.gen(function*() {
      const wrapped = registerHook("Before", function*() {
        return (yield* Effect.currentSpan).name
      })

      // Read from the ACTIVE span inside the running body, never from the returned function's own
      // `.name` — that would pass against an implementation that never calls `Effect.fn`, making
      // this test vacuous; mutation B is the demonstration that it is not.
      assert.strictEqual(yield* wrapped(), "Before")
    }))
})

describe("a failing hook", () => {
  it.effect("neither swallows nor converts the failure", () =>
    Effect.gen(function*() {
      const wrapped = registerHook("After", function*() {
        return yield* Effect.fail("boom" as const)
      })

      const exit = yield* Effect.exit(wrapped())

      // Asserted through Exit, never a try/catch on a Promise, so a hook that SUCCEEDS is reported
      // as the wrong value rather than silently passing an absent-throw check.
      assert.strictEqual(
        Exit.isFailure(exit) ? Cause.squash(exit.cause) : "the hook unexpectedly succeeded",
        "boom"
      )
    }))
})

describe("groupHooks partitions a flat list by kind", () => {
  it("puts each body under its own kind and preserves registration order within a kind", () => {
    // `ruleId: null` on every one of them: `groupHooks` partitions whatever flat list it is handed
    // and never filters by scope itself, so this test stays a pure Feature-level partition test.
    const definitions: ReadonlyArray<HookDefinition<HookBody>> = [
      { kind: "Before", body: firstBefore, ruleId: null },
      { kind: "After", body: anAfter, ruleId: null },
      { kind: "Before", body: secondBefore, ruleId: null }
    ]

    const grouped = groupHooks(definitions)

    expect(grouped.Before).toHaveLength(2)
    // Reference identity, `toBe` and never `toEqual`.
    expect(grouped.Before[0]).toBe(firstBefore)
    expect(grouped.Before[1]).toBe(secondBefore)
    expect(grouped.After).toHaveLength(1)
    expect(grouped.After[0]).toBe(anAfter)
  })

  it("returns all six keys as empty arrays, not a partial object, for an empty list", () => {
    const grouped = groupHooks([])

    expect(grouped.Before).toEqual([])
    expect(grouped.After).toEqual([])
    expect(grouped.BeforeStep).toEqual([])
    expect(grouped.AfterStep).toEqual([])
    expect(grouped.BeforeAllScenarios).toEqual([])
    expect(grouped.AfterAllScenarios).toEqual([])
  })
})

describe("emptyHookSet is a complete HookSet, not a partial one", () => {
  it("has all six keys present and empty", () => {
    expect(emptyHookSet.Before).toEqual([])
    expect(emptyHookSet.After).toEqual([])
    expect(emptyHookSet.BeforeStep).toEqual([])
    expect(emptyHookSet.AfterStep).toEqual([])
    expect(emptyHookSet.BeforeAllScenarios).toEqual([])
    expect(emptyHookSet.AfterAllScenarios).toEqual([])
  })
})

describe("mergeHookSets orders a Feature's hooks against an enclosing Rule's (D-02)", () => {
  it("runs the Feature's Before first, then the Rule's — outer to inner", () => {
    const feature = oneOfEachKind()
    const rule = oneOfEachKind()

    const merged = mergeHookSets(feature, rule)

    expect(merged.Before).toHaveLength(2)
    // Positional AND by reference. Length alone, or a membership check, passes against the reversed
    // implementation (mutation F) — both orders hold exactly these two bodies.
    expect(merged.Before[0]).toBe(feature.Before[0])
    expect(merged.Before[1]).toBe(rule.Before[0])
  })

  it("runs the Feature's BeforeStep first, then the Rule's — the same ordering one level down", () => {
    const feature = oneOfEachKind()
    const rule = oneOfEachKind()

    const merged = mergeHookSets(feature, rule)

    expect(merged.BeforeStep).toHaveLength(2)
    expect(merged.BeforeStep[0]).toBe(feature.BeforeStep[0])
    expect(merged.BeforeStep[1]).toBe(rule.BeforeStep[0])
  })

  it("runs the Rule's After first, then the Feature's — inner to outer, the reverse of Before", () => {
    const feature = oneOfEachKind()
    const rule = oneOfEachKind()

    const merged = mergeHookSets(feature, rule)

    expect(merged.After).toHaveLength(2)
    // THE assertion the whole of D-02 reduces to: `After` is NOT ordered like `Before`. An
    // implementation that copy-pasted the `Before` line fails here and nowhere else.
    expect(merged.After[0]).toBe(rule.After[0])
    expect(merged.After[1]).toBe(feature.After[0])
  })

  it("runs the Rule's AfterStep first, then the Feature's — the same reversal", () => {
    const feature = oneOfEachKind()
    const rule = oneOfEachKind()

    const merged = mergeHookSets(feature, rule)

    expect(merged.AfterStep).toHaveLength(2)
    expect(merged.AfterStep[0]).toBe(rule.AfterStep[0])
    expect(merged.AfterStep[1]).toBe(feature.AfterStep[0])
  })
})

describe("emptyHookSet is an identity element for mergeHookSets", () => {
  it("leaves the Rule's four Rule-scopeable arrays alone when the Feature side is empty", () => {
    const rule = oneOfEachKind()

    const merged = mergeHookSets(emptyHookSet, rule)

    // Only the four kinds ADR-EC-010 makes Rule-scopeable are checked here. The two AllScenarios
    // keys are deliberately NOT an identity case in this direction — they pass `feature`'s arrays
    // through, so an empty Feature side correctly yields empty arrays for them (asserted below).
    expect(merged.Before).toHaveLength(1)
    expect(merged.Before[0]).toBe(rule.Before[0])
    expect(merged.After).toHaveLength(1)
    expect(merged.After[0]).toBe(rule.After[0])
    expect(merged.BeforeStep).toHaveLength(1)
    expect(merged.BeforeStep[0]).toBe(rule.BeforeStep[0])
    expect(merged.AfterStep).toHaveLength(1)
    expect(merged.AfterStep[0]).toBe(rule.AfterStep[0])
  })

  it("leaves all six of the Feature's arrays alone when the Rule side is empty", () => {
    const feature = oneOfEachKind()

    const merged = mergeHookSets(feature, emptyHookSet)

    // This is the Scenario-with-no-enclosing-Rule case, and it must be a true no-op: every one of
    // the Feature's bodies, at index 0, by reference.
    expect(merged.Before[0]).toBe(feature.Before[0])
    expect(merged.After[0]).toBe(feature.After[0])
    expect(merged.BeforeStep[0]).toBe(feature.BeforeStep[0])
    expect(merged.AfterStep[0]).toBe(feature.AfterStep[0])
    expect(merged.BeforeAllScenarios[0]).toBe(feature.BeforeAllScenarios[0])
    expect(merged.AfterAllScenarios[0]).toBe(feature.AfterAllScenarios[0])
  })

  it("merges two empty sets into six empty arrays", () => {
    const merged = mergeHookSets(emptyHookSet, emptyHookSet)

    expect(merged.Before).toEqual([])
    expect(merged.After).toEqual([])
    expect(merged.BeforeStep).toEqual([])
    expect(merged.AfterStep).toEqual([])
    expect(merged.BeforeAllScenarios).toEqual([])
    expect(merged.AfterAllScenarios).toEqual([])
  })
})

describe("mergeHookSets never Rule-scopes BeforeAllScenarios/AfterAllScenarios", () => {
  it("passes the Feature's arrays through by reference, ignoring the Rule's even when non-empty", () => {
    const feature = oneOfEachKind()
    // `oneOfEachKind` deliberately populates these two keys on the RULE side too, which no real
    // `RuleDsl` can produce — that is the point. Against a rule set that is empty there,
    // concatenation and pass-through are indistinguishable, so this fixture is what makes mutation
    // G falsifiable at all. Do not "fix" it to match reality.
    const rule = oneOfEachKind()

    const merged = mergeHookSets(feature, rule)

    // `toBe` on the ARRAY itself, not `toEqual` on its contents: pass-through means the very same
    // array object, which no concatenating implementation can produce.
    expect(merged.BeforeAllScenarios).toBe(feature.BeforeAllScenarios)
    expect(merged.AfterAllScenarios).toBe(feature.AfterAllScenarios)
    expect(merged.BeforeAllScenarios).toHaveLength(1)
    expect(merged.AfterAllScenarios).toHaveLength(1)
    expect(merged.BeforeAllScenarios).not.toContain(rule.BeforeAllScenarios[0])
    expect(merged.AfterAllScenarios).not.toContain(rule.AfterAllScenarios[0])
  })
})

describe("a merged HookSet's array order is its execution order", () => {
  it.effect("runs the Feature's Before hook before the Rule's when handed to runHookBatch", () =>
    Effect.gen(function*() {
      const log = yield* Ref.make<ReadonlyArray<string>>([])
      const recordingHook = (name: string): HookBody => () => Ref.update(log, (seen) => [...seen, name])

      const merged = mergeHookSets(
        { ...emptyHookSet, Before: [recordingHook("feature:before")] },
        { ...emptyHookSet, Before: [recordingHook("rule:before")] }
      )

      yield* runHookBatch(merged.Before)

      // The end-to-end claim: concatenation order IS execution order. The positional assertions
      // above pin the data structure; this pins what D-02 actually promises a test author.
      assert.deepStrictEqual(yield* Ref.get(log), ["feature:before", "rule:before"])
    }))

  it.effect("runs the Rule's After hook before the Feature's when handed to runHookBatch", () =>
    Effect.gen(function*() {
      const log = yield* Ref.make<ReadonlyArray<string>>([])
      const recordingHook = (name: string): HookBody => () => Ref.update(log, (seen) => [...seen, name])

      const merged = mergeHookSets(
        { ...emptyHookSet, After: [recordingHook("feature:after")] },
        { ...emptyHookSet, After: [recordingHook("rule:after")] }
      )

      yield* runHookBatch(merged.After)

      // The unwind, observed rather than inferred from the merge's shape.
      assert.deepStrictEqual(yield* Ref.get(log), ["rule:after", "feature:after"])
    }))
})

describe("runHookBatch runs an independent batch of hooks (D-02, D-03)", () => {
  it.effect("an empty batch succeeds", () =>
    Effect.gen(function*() {
      const exit = yield* Effect.exit(runHookBatch([]))
      assert.isTrue(Exit.isSuccess(exit))
    }))

  it.effect("runs every hook even when an earlier one fails", () =>
    Effect.gen(function*() {
      const log = yield* Ref.make<ReadonlyArray<string>>([])

      const failing: HookBody = () =>
        Effect.gen(function*() {
          yield* Ref.update(log, (seen) => [...seen, "one"])
          return yield* Effect.fail("one failed" as const)
        })
      const second: HookBody = () => Ref.update(log, (seen) => [...seen, "two"])
      const third: HookBody = () => Ref.update(log, (seen) => [...seen, "three"])

      const exit = yield* Effect.exit(runHookBatch([failing, second, third]))

      assert.isTrue(Exit.isFailure(exit))
      // THE load-bearing assertion of this test — not merely that the batch failed, but that all
      // three hooks ran. An implementation that stops at the first failure passes a bare
      // `Exit.isFailure` check while this log has only one entry.
      assert.deepStrictEqual(yield* Ref.get(log), ["one", "two", "three"])
    }))

  it.effect("combines two failures into one cause, preserving both original errors by identity", () =>
    Effect.gen(function*() {
      const errorOne = { tag: "one failed" }
      const errorTwo = { tag: "two failed" }
      const failingOne: HookBody = () => Effect.fail(errorOne)
      const failingTwo: HookBody = () => Effect.fail(errorTwo)

      const exit = yield* Effect.exit(runHookBatch([failingOne, succeedingHook, failingTwo]))

      assert.isTrue(Exit.isFailure(exit))
      if (Exit.isFailure(exit)) {
        const failedErrors = exit.cause.reasons.filter(Cause.isFailReason).map((reason) => reason.error)

        // Reference identity on BOTH original errors, not a structural comparison — a wrapper error
        // class would lose this. `Cause.squash` is deliberately NOT used here: squashing a combined
        // cause does not return either original error by identity (Hook.ts note (g)).
        assert.strictEqual(failedErrors.length, 2)
        assert.isTrue(failedErrors.includes(errorOne))
        assert.isTrue(failedErrors.includes(errorTwo))
      }
    }))

  it.effect(
    "a batch with exactly one failure fails with the original cause, recoverable by Cause.squash",
    () =>
      Effect.gen(function*() {
        const theError = { tag: "the only failure" }
        const failing: HookBody = () => Effect.fail(theError)

        const exit = yield* Effect.exit(runHookBatch([succeedingHook, failing, succeedingHook]))

        // `Cause.combine(Cause.empty, c)` returns `c` unchanged, so a batch with exactly one failure
        // fails with the ORIGINAL cause, and the existing squash-based reference-identity assertion
        // style still works for it.
        assert.strictEqual(
          Exit.isFailure(exit) ? Cause.squash(exit.cause) : "the batch unexpectedly succeeded",
          theError
        )
      })
  )

  it.effect("runs hooks in array order, not concurrently", () =>
    Effect.gen(function*() {
      const log = yield* Ref.make<ReadonlyArray<string>>([])
      const recordingHook = (name: string): HookBody => () =>
        Effect.gen(function*() {
          yield* Ref.update(log, (seen) => [...seen, `${name}:start`])
          yield* Effect.yieldNow
          yield* Ref.update(log, (seen) => [...seen, `${name}:end`])
        })

      yield* runHookBatch([recordingHook("one"), recordingHook("two"), recordingHook("three")])

      // Bracketed around a real suspension (`Effect.yieldNow`), so a concurrent implementation is
      // actually falsifiable — a single entry per hook would let a concurrency mutation survive.
      assert.deepStrictEqual(yield* Ref.get(log), [
        "one:start",
        "one:end",
        "two:start",
        "two:end",
        "three:start",
        "three:end"
      ])
    }))
})

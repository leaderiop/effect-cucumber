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
import { groupHooks, type HookBody, registerHook, runHookBatch } from "../src/Hook.ts"
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

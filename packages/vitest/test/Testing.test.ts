/**
 * `Testing.failureTag` / `Testing.settleThroughClock` (ADR-EC-028, ADR-EC-029, BEH-EC-020,
 * BEH-EC-021): a plain synchronous tag narrower that fails loudly on anything but a tagged
 * failure, and a fork/adjust/poll/join settle helper that dies rather than hangs past its bound.
 *
 * Carries: ADR-EC-028, ADR-EC-029, BEH-EC-020, BEH-EC-021.
 */
import { assert, describe, expect, it } from "@effect/vitest"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Result from "effect/Result"
import { failureTag, settleThroughClock } from "../src/Testing.ts"

class Boom extends Data.TaggedError("Boom")<{ readonly detail: string }> {}
class OtherFailure extends Data.TaggedError("OtherFailure")<{}> {}

// A step that sleeps `n` times, one second each — the shape every "settles after N clock
// advances" test below is built from, since sequential sleeps are what real backoff looks like.
const sleepNTimes = (n: number) =>
  Effect.gen(function*() {
    for (let i = 0; i < n; i++) {
      yield* Effect.sleep("1 second")
    }
    return "settled"
  })

describe("failureTag", () => {
  it("returns the _tag of a failed Exit whose typed error carries a string _tag", () => {
    const exit = Exit.fail(new Boom({ detail: "rate limited" }))

    // THE load-bearing assertion of the positive case.
    expect(failureTag(exit)).toBe("Boom")
  })

  it("fails loudly, naming the value, when the Exit succeeded instead of failing", () => {
    const exit = Exit.succeed(42)

    expect(() => failureTag(exit)).toThrow(/42/)
  })

  it("fails loudly, naming the defect, when the Exit died instead of failing with a tag", () => {
    const exit = Exit.die("boom")

    expect(() => failureTag(exit)).toThrow(/boom/)
  })

  it("fails loudly when the failure's squashed value has no _tag property at all", () => {
    // A plain object rather than `new Error(...)`: this repository's own `@effect/tsgo` gate
    // (ADR-EC-016) flags a bare global `Error` reaching an Effect/Exit failure channel, which
    // would fail `pnpm typecheck:test` here for an unrelated reason — the point of this case is
    // "no _tag", not "an Error instance".
    const exit = Exit.fail({ message: "plain, untagged failure" })

    expect(() => failureTag(exit)).toThrow(/plain, untagged failure/)
  })

  it("fails loudly when _tag is present but is not a string", () => {
    const exit = Exit.fail({ _tag: 123 })

    expect(() => failureTag(exit)).toThrow(/_tag/)
  })

  it("fails loudly rather than throwing a second failure when the defect is null", () => {
    // `typeof null === "object"`, which is exactly the trap `hasStringTag`'s explicit `u !== null`
    // guard exists for — this input would otherwise reach `"_tag" in null` and throw a TypeError
    // instead of the intended assertion failure.
    const exit = Exit.die(null)

    expect(() => failureTag(exit)).toThrow(/null/)
  })

  it("never yields a string for anything but the tagged-failure case (never silently 'Unknown')", () => {
    // The behavior this helper replaces: every one of these four inputs used to collapse to the
    // same "Unknown" string. None of them may return a string at all now — asserted individually
    // rather than over an array, since each Exit below closes over a different `E`.
    expect(() => failureTag(Exit.succeed("ok"))).toThrow(/ok/)
    expect(() => failureTag(Exit.die("defect"))).toThrow(/defect/)
    expect(() => failureTag(Exit.fail({ message: "untagged" }))).toThrow(/untagged/)
    expect(() => failureTag(Exit.fail({ _tag: 123 }))).toThrow(/_tag/)
  })
})

describe("settleThroughClock", () => {
  it.effect("joins immediately, with zero clock advances, when the fork never suspends", () =>
    Effect.gen(function*() {
      const result = yield* settleThroughClock(Effect.succeed("immediate"))
      assert.strictEqual(result, "immediate")
    }))

  it.effect("settles a fork that completes after exactly `maxSteps` advances and joins its result", () =>
    Effect.gen(function*() {
      const result = yield* settleThroughClock(sleepNTimes(3), { step: "1 second", maxSteps: 3 })
      assert.strictEqual(result, "settled")
    }))

  it.effect("propagates the forked Effect's own typed failure, composing with failureTag", () =>
    Effect.gen(function*() {
      const effect = Effect.gen(function*() {
        yield* Effect.sleep("1 second")
        return yield* Effect.fail(new OtherFailure())
      })

      const exit = yield* Effect.exit(settleThroughClock(effect, { step: "1 second", maxSteps: 3 }))
      assert.isTrue(Exit.isFailure(exit))
      assert.strictEqual(failureTag(exit), "OtherFailure")
    }))

  it.effect("dies, naming the bound tried, instead of hanging, when the fork needs one more step than it gets", () =>
    Effect.gen(function*() {
      // Needs 3 advances to settle; only 2 are given — the exact boundary ADR-EC-029 describes.
      const exit = yield* Effect.exit(settleThroughClock(sleepNTimes(3), { step: "1 second", maxSteps: 2 }))

      assert.isTrue(Exit.isFailure(exit))
      assert.isTrue(Exit.hasDies(exit))

      const defect = Exit.findDefect(exit)
      assert.isTrue(Result.isSuccess(defect))
      if (Result.isSuccess(defect)) {
        assert.instanceOf(defect.success, Error)
        assert.include((defect.success as Error).message, "2")
        assert.include((defect.success as Error).message, "settleThroughClock")
      }
    }))

  it.effect("defaults maxSteps to 12: settles at exactly 12 advances, dies at 13", () =>
    Effect.gen(function*() {
      const settled = yield* settleThroughClock(sleepNTimes(12))
      assert.strictEqual(settled, "settled")

      const exit = yield* Effect.exit(settleThroughClock(sleepNTimes(13)))
      assert.isTrue(Exit.hasDies(exit))
    }))

  it.effect("defaults step to \"1 second\": a 12-second sleep settles unassisted, a 13-second one does not", () =>
    Effect.gen(function*() {
      const settled = yield* settleThroughClock(Effect.gen(function*() {
        yield* Effect.sleep("12 seconds")
        return "settled"
      }))
      assert.strictEqual(settled, "settled")

      const exit = yield* Effect.exit(
        settleThroughClock(Effect.gen(function*() {
          yield* Effect.sleep("13 seconds")
          return "settled"
        }))
      )
      assert.isTrue(Exit.hasDies(exit))
    }))

  it.effect("a larger `step` settles an Effect the default step could never reach within maxSteps", () =>
    Effect.gen(function*() {
      // 10 minutes needs 600 one-second advances — far past the default 12 — but exactly 10
      // one-minute advances, which is why `step` stays a caller parameter (ADR-EC-029).
      const effect = Effect.gen(function*() {
        yield* Effect.sleep("10 minutes")
        return "settled"
      })

      const result = yield* settleThroughClock(effect, { step: "1 minute", maxSteps: 12 })
      assert.strictEqual(result, "settled")
    }))
})

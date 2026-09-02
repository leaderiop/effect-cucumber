/**
 * Tests for `Step`.
 *
 * Carries: ADR-EC-005.
 */
import { assert, describe, expect, it } from "@effect/vitest"
import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import { register } from "../src/Step.ts"

// A bare generator step body, at module scope because it captures nothing (`unicorn/consistent-function-scoping`).
const addOne = function*(n: number) {
  return yield* Effect.succeed(n + 1)
}

describe("an already-wrapped step function is accepted unchanged", () => {
  it("comes back as the identical reference, not a re-wrap", () => {
    const stepText = "I wrapped this step myself"
    const alreadyWrapped = Effect.fn(stepText)(function*(n: number) {
      return yield* Effect.succeed(n + 1)
    })

    // THE load-bearing assertion of this file.
    expect(register(stepText, alreadyWrapped)).toBe(alreadyWrapped)
  })
})

describe("a bare generator step function is wrapped", () => {
  it("does not come back by identity", () => {
    expect(register("I add one to {int}", addOne)).not.toBe(addOne)
  })

  it.effect("resolves to the generator's return value with its arguments intact", () =>
    Effect.gen(function*() {
      const wrapped = register("I have {int} cukes and {word} left", function*(count: number, kind: string) {
        const doubled = yield* Effect.succeed(count * 2)
        return `${doubled}:${kind}`
      })

      // Proves the wrap is transparent to BOTH the parameter list and the success channel.
      assert.strictEqual(yield* wrapped(21, "jam"), "42:jam")
    }))

  it.effect("makes the step text observable as the span name", () =>
    Effect.gen(function*() {
      const stepText = "I am observable in a failure's trace"
      const wrapped = register(stepText, function*() {
        return (yield* Effect.currentSpan).name
      })

      assert.strictEqual(yield* wrapped(), stepText)
    }))
})

describe("a failure inside a wrapped step", () => {
  it.effect("still surfaces in the error channel", () =>
    Effect.gen(function*() {
      const wrapped = register("a step that fails", function*() {
        return yield* Effect.fail("boom" as const)
      })

      const exit = yield* Effect.exit(wrapped())

      // The wrap must neither swallow the failure nor convert it into a defect or a success.
      assert.strictEqual(Exit.isFailure(exit) ? Cause.squash(exit.cause) : "the step unexpectedly succeeded", "boom")
    }))
})

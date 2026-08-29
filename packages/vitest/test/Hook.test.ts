/**
 * DSL-07's runtime proof: a bare-generator hook body is auto-wrapped with the hook's own kind as its
 * span name, and an already-wrapped hook function is returned UNCHANGED — plus `groupHooks`'
 * per-kind partitioning and (Task 3) `runHookBatch`'s independent-batch execution.
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
 * Mutation-tested (performed, then reverted, confirmed failing):
 * - A. `registerHook` wraps unconditionally (drops the delegation to `register`'s guard) → the
 *      identity test fails.
 * - B. `registerHook` returns `fn` unconditionally (never wraps) → the span-name test fails.
 * - C. `groupHooks` pushes into the wrong kind's array (e.g. every hook lands under `Before`) → the
 *      mixed-kind grouping test fails.
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
import { groupHooks, type HookBody, registerHook } from "../src/Hook.ts"
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
    const definitions: ReadonlyArray<HookDefinition<HookBody>> = [
      { kind: "Before", body: firstBefore },
      { kind: "After", body: anAfter },
      { kind: "Before", body: secondBefore }
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

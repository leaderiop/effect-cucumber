/**
 * Tests for `Hook`.
 *
 * Carries: ADR-EC-005, ADR-EC-010, ADR-EC-035, BEH-EC-027.
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
  type HookEntry,
  type HookSet,
  mergeHookSets,
  registerHook,
  runHookBatch
} from "../src/Hook.ts"
import type { HookDefinition } from "../src/HookRegistry.ts"
import { HookTagExpressionError } from "../src/HookTagExpression.ts"

// A bare-generator hook body, at module scope because it captures nothing (`unicorn/consistent-function-scoping`).
const bareBefore = function*() {
  return yield* Effect.succeed("before ran")
}

// Capture-free hook bodies for the `groupHooks` ordering test, at module scope because they capture nothing
// (`unicorn/consistent-function-scoping`).
const firstBefore: HookBody = () => Effect.succeed(undefined)
const anAfter: HookBody = () => Effect.succeed(undefined)
const secondBefore: HookBody = () => Effect.succeed(undefined)

// A no-op successful hook body for the `runHookBatch` independence tests, at module scope because it captures nothing
// (`unicorn/consistent-function-scoping`).
const succeedingHook: HookBody = () => Effect.succeed(undefined)

// Capture-free failing hook bodies for the "filtered-out entry never surfaces, survivors still combine" test, at
// module scope for the same reason (`unicorn/consistent-function-scoping`).
const failingUnconditional: HookBody = () => Effect.fail("unconditional failed")
const filteredOutFailure: HookBody = () => Effect.fail("must never surface — never invoked")
const failingScoped: HookBody = () => Effect.fail("db-scoped failed")

// An UNCONDITIONAL entry wrapping a plain body — `matches: null`, today's only shape before ADR-EC-035 — for the
// `runHookBatch` tests below that are not about tag filtering at all.
const unconditional = (body: HookBody): HookEntry => ({ body, matches: null })

// A hook entry whose only property is being a reference nothing else in the process shares — every call returns a
// fresh object, unconditional (`matches: null`).
const distinctEntry = (): HookEntry => unconditional(() => Effect.succeed(undefined))

// A `HookSet` carrying exactly one distinct entry under every one of the six keys, so a merge's result can be read
// positionally (`merged.Before[0]` is `feature.Before[0]`, and so on).
const oneOfEachKind = (): HookSet => ({
  Before: [distinctEntry()],
  After: [distinctEntry()],
  BeforeStep: [distinctEntry()],
  AfterStep: [distinctEntry()],
  BeforeAllScenarios: [distinctEntry()],
  AfterAllScenarios: [distinctEntry()]
})

describe("an already-wrapped hook function is accepted unchanged", () => {
  it("comes back as the identical reference, not a re-wrap", () => {
    const alreadyWrapped = Effect.fn("Before")(function*() {
      return yield* Effect.succeed("before ran")
    })

    // THE load-bearing assertion of this file.
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

      // Asserted through Exit, never a try/catch on a Promise, so a hook that SUCCEEDS is reported as the wrong value
      // rather than silently passing an absent-throw check.
      assert.strictEqual(
        Exit.isFailure(exit) ? Cause.squash(exit.cause) : "the hook unexpectedly succeeded",
        "boom"
      )
    }))
})

describe("groupHooks partitions a flat list by kind", () => {
  it("puts each body under its own kind and preserves registration order within a kind", () => {
    // `ruleId: null` on every one of them: `groupHooks` partitions whatever flat list it is handed and never filters
    // by scope itself, so this test stays a pure Feature-level partition test. `tagExpr: null` — unconditional,
    // today's only shape before ADR-EC-035 — since tag compilation itself is its own describe block below.
    const definitions: ReadonlyArray<HookDefinition<HookBody>> = [
      { kind: "Before", body: firstBefore, ruleId: null, tagExpr: null },
      { kind: "After", body: anAfter, ruleId: null, tagExpr: null },
      { kind: "Before", body: secondBefore, ruleId: null, tagExpr: null }
    ]

    const grouped = groupHooks(definitions, [], "test.feature")

    expect(grouped.Before).toHaveLength(2)
    // Reference identity on the BODY, `toBe` and never `toEqual` — each `HookSet` slot is now a `HookEntry`
    // wrapping the registered body, not the body itself (ADR-EC-035).
    expect(grouped.Before[0]?.body).toBe(firstBefore)
    expect(grouped.Before[1]?.body).toBe(secondBefore)
    expect(grouped.After).toHaveLength(1)
    expect(grouped.After[0]?.body).toBe(anAfter)
  })

  it("returns all six keys as empty arrays, not a partial object, for an empty list", () => {
    const grouped = groupHooks([], [], "test.feature")

    expect(grouped.Before).toEqual([])
    expect(grouped.After).toEqual([])
    expect(grouped.BeforeStep).toEqual([])
    expect(grouped.AfterStep).toEqual([])
    expect(grouped.BeforeAllScenarios).toEqual([])
    expect(grouped.AfterAllScenarios).toEqual([])
  })

  it("gives an unconditional definition (tagExpr: null) a matches of null, never consulted by runHookBatch", () => {
    const definitions: ReadonlyArray<HookDefinition<HookBody>> = [
      { kind: "Before", body: firstBefore, ruleId: null, tagExpr: null }
    ]

    const grouped = groupHooks(definitions, [], "test.feature")

    expect(grouped.Before[0]?.matches).toBeNull()
  })
})

describe("groupHooks compiles each definition's own tagExpr into a matcher (ADR-EC-035)", () => {
  it("gives a bare-tag definition a matcher that reuses vitest's real createTagsFilter grammar", () => {
    const definitions: ReadonlyArray<HookDefinition<HookBody>> = [
      { kind: "Before", body: firstBefore, ruleId: null, tagExpr: "@db" }
    ]

    const grouped = groupHooks(definitions, ["@db", "@slow"], "test.feature")
    const matches = grouped.Before[0]?.matches

    expect(matches).not.toBeNull()
    expect(matches?.(["@db"])).toBe(true)
    expect(matches?.(["@db", "@slow"])).toBe(true)
    expect(matches?.(["@slow"])).toBe(false)
    expect(matches?.([])).toBe(false)
  })

  it("compiles a compound and/not expression through the same real parser", () => {
    const definitions: ReadonlyArray<HookDefinition<HookBody>> = [
      { kind: "Before", body: firstBefore, ruleId: null, tagExpr: "@db and not @slow" }
    ]

    const grouped = groupHooks(definitions, ["@db", "@slow"], "test.feature")
    const matches = grouped.Before[0]?.matches

    expect(matches?.(["@db"])).toBe(true)
    expect(matches?.(["@db", "@slow"])).toBe(false)
    expect(matches?.(["@slow"])).toBe(false)
  })

  it("throws a HookTagExpressionError, not vitest's own bare thrown string, for a tag absent from the universe", () => {
    const definitions: ReadonlyArray<HookDefinition<HookBody>> = [
      { kind: "Before", body: firstBefore, ruleId: null, tagExpr: "@nonexistent" }
    ]

    expect(() => groupHooks(definitions, ["@db"], "checkout.feature")).toThrowError(HookTagExpressionError)

    let caught: unknown = null
    try {
      groupHooks(definitions, ["@db"], "checkout.feature")
    } catch (error) {
      caught = error
    }

    // The message NAMES the offending kind, expression and .feature file — not a bare parser string.
    expect(caught).toBeInstanceOf(HookTagExpressionError)
    const hookError = caught as HookTagExpressionError
    expect(hookError.kind).toBe("Before")
    expect(hookError.tagExpr).toBe("@nonexistent")
    expect(hookError.featureUri).toBe("checkout.feature")
    expect(hookError.message).toContain("checkout.feature")
    expect(hookError.message).toContain("@nonexistent")
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

describe("mergeHookSets orders a Feature's hooks against an enclosing Rule's", () => {
  it("runs the Feature's Before first, then the Rule's — outer to inner", () => {
    const feature = oneOfEachKind()
    const rule = oneOfEachKind()

    const merged = mergeHookSets(feature, rule)

    expect(merged.Before).toHaveLength(2)
    // Positional AND by reference.
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

    // Only the four kinds ADR-EC-010 makes Rule-scopeable are checked here.
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

    // This is the Scenario-with-no-enclosing-Rule case, and it must be a true no-op: every one of the Feature's
    // bodies, at index 0, by reference.
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
    // `oneOfEachKind` deliberately populates these two keys on the RULE side too, which no real `RuleDsl` can produce
    // — that is the point.
    const rule = oneOfEachKind()

    const merged = mergeHookSets(feature, rule)

    // `toBe` on the ARRAY itself, not `toEqual` on its contents: pass-through means the very same array object, which
    // no concatenating implementation can produce.
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
        { ...emptyHookSet, Before: [unconditional(recordingHook("feature:before"))] },
        { ...emptyHookSet, Before: [unconditional(recordingHook("rule:before"))] }
      )

      yield* runHookBatch(merged.Before, [])

      // The end-to-end claim: concatenation order IS execution order.
      assert.deepStrictEqual(yield* Ref.get(log), ["feature:before", "rule:before"])
    }))

  it.effect("runs the Rule's After hook before the Feature's when handed to runHookBatch", () =>
    Effect.gen(function*() {
      const log = yield* Ref.make<ReadonlyArray<string>>([])
      const recordingHook = (name: string): HookBody => () => Ref.update(log, (seen) => [...seen, name])

      const merged = mergeHookSets(
        { ...emptyHookSet, After: [unconditional(recordingHook("feature:after"))] },
        { ...emptyHookSet, After: [unconditional(recordingHook("rule:after"))] }
      )

      yield* runHookBatch(merged.After, [])

      // The unwind, observed rather than inferred from the merge's shape.
      assert.deepStrictEqual(yield* Ref.get(log), ["rule:after", "feature:after"])
    }))
})

describe("runHookBatch runs an independent batch of hooks", () => {
  it.effect("an empty batch succeeds", () =>
    Effect.gen(function*() {
      const exit = yield* Effect.exit(runHookBatch([], []))
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

      const exit = yield* Effect.exit(
        runHookBatch([unconditional(failing), unconditional(second), unconditional(third)], [])
      )

      assert.isTrue(Exit.isFailure(exit))
      // THE load-bearing assertion of this test — not merely that the batch failed, but that all three hooks ran.
      assert.deepStrictEqual(yield* Ref.get(log), ["one", "two", "three"])
    }))

  it.effect("combines two failures into one cause, preserving both original errors by identity", () =>
    Effect.gen(function*() {
      const errorOne = { tag: "one failed" }
      const errorTwo = { tag: "two failed" }
      const failingOne: HookBody = () => Effect.fail(errorOne)
      const failingTwo: HookBody = () => Effect.fail(errorTwo)

      const exit = yield* Effect.exit(
        runHookBatch(
          [unconditional(failingOne), unconditional(succeedingHook), unconditional(failingTwo)],
          []
        )
      )

      assert.isTrue(Exit.isFailure(exit))
      if (Exit.isFailure(exit)) {
        const failedErrors = exit.cause.reasons.filter(Cause.isFailReason).map((reason) => reason.error)

        // Reference identity on BOTH original errors, not a structural comparison — a wrapper error class would lose
        // this.
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

        const exit = yield* Effect.exit(
          runHookBatch(
            [unconditional(succeedingHook), unconditional(failing), unconditional(succeedingHook)],
            []
          )
        )

        // `Cause.combine(Cause.empty, c)` returns `c` unchanged, so a batch with exactly one failure fails with the
        // ORIGINAL cause, and the existing squash-based reference-identity assertion style still works for it.
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

      yield* runHookBatch(
        [
          unconditional(recordingHook("one")),
          unconditional(recordingHook("two")),
          unconditional(recordingHook("three"))
        ],
        []
      )

      // Bracketed around a real suspension (`Effect.yieldNow`), so a concurrent implementation is actually
      // falsifiable — a single entry per hook would let a concurrency mutation survive.
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

describe("runHookBatch excludes a tag-filtered-out entry BEFORE the batch, not from within it (ADR-EC-035, BEH-EC-027)", () => {
  it.effect("never invokes an entry whose matches predicate rejects the Scenario's tags", () =>
    Effect.gen(function*() {
      const log = yield* Ref.make<ReadonlyArray<string>>([])
      const recordingHook = (name: string): HookBody => () => Ref.update(log, (seen) => [...seen, name])

      const entries: ReadonlyArray<HookEntry> = [
        unconditional(recordingHook("always")),
        { body: recordingHook("db-only"), matches: (tags) => tags.includes("@db") }
      ]

      yield* runHookBatch(entries, ["@ui"])

      // "db-only" never ran at all — not run-and-ignored, simply never invoked.
      assert.deepStrictEqual(yield* Ref.get(log), ["always"])
    }))

  it.effect("invokes a tag-scoped entry when the Scenario's tags do match", () =>
    Effect.gen(function*() {
      const log = yield* Ref.make<ReadonlyArray<string>>([])
      const recordingHook = (name: string): HookBody => () => Ref.update(log, (seen) => [...seen, name])

      const entries: ReadonlyArray<HookEntry> = [
        { body: recordingHook("db-only"), matches: (tags) => tags.includes("@db") }
      ]

      yield* runHookBatch(entries, ["@db", "@slow"])

      assert.deepStrictEqual(yield* Ref.get(log), ["db-only"])
    }))

  it.effect("preserves registration order among the entries that DO survive filtering", () =>
    Effect.gen(function*() {
      const log = yield* Ref.make<ReadonlyArray<string>>([])
      const recordingHook = (name: string): HookBody => () => Ref.update(log, (seen) => [...seen, name])

      const entries: ReadonlyArray<HookEntry> = [
        unconditional(recordingHook("first")),
        { body: recordingHook("second-filtered-out"), matches: (tags) => tags.includes("@slow") },
        { body: recordingHook("third"), matches: (tags) => tags.includes("@db") }
      ]

      yield* runHookBatch(entries, ["@db"])

      // "second-filtered-out" is silently absent, but "first" and "third" keep their REGISTRATION order.
      assert.deepStrictEqual(yield* Ref.get(log), ["first", "third"])
    }))

  it.effect(
    "a filtered-out entry's own failure never surfaces, and survivors' failures still COMBINE (BEH-EC-017)",
    () =>
      Effect.gen(function*() {
        const entries: ReadonlyArray<HookEntry> = [
          unconditional(failingUnconditional),
          { body: filteredOutFailure, matches: (tags) => tags.includes("@slow") },
          { body: failingScoped, matches: (tags) => tags.includes("@db") }
        ]

        const exit = yield* Effect.exit(runHookBatch(entries, ["@db"]))

        assert.isTrue(Exit.isFailure(exit))
        if (Exit.isFailure(exit)) {
          const failedErrors = exit.cause.reasons.filter(Cause.isFailReason).map((reason) => reason.error)
          // Exactly the two hooks that actually ran — the filtered-out one contributes NOTHING to combine or drop.
          assert.deepStrictEqual(failedErrors, ["unconditional failed", "db-scoped failed"])
        }
      })
  )
})

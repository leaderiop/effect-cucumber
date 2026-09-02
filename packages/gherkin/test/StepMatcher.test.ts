/**
 * BEH-EC-015's runtime half, plus the two properties `StepMatcher` exists for.
 */
import * as Option from "effect/Option"
import { describe, expect, it } from "vitest"
import { StepPatternError } from "../src/Errors.ts"
import { createParameterTypeStore, type ParameterTypeStoreShape } from "../src/ParameterTypes.ts"
import type { StepArgs } from "../src/StepArgs.ts"
import { compileExpression, createStepMatcher, type StepMatch, type StepPatternEntry } from "../src/StepMatcher.ts"

/** A registry carrying nothing but the eleven built-ins, sharing no state with any other test. */
const builtInRegistry = () => createParameterTypeStore().buildRegistry()

/** A store plus the registry built from it, for the tests that need a custom parameter type. */
const storeWith = (define: (store: ParameterTypeStoreShape) => void): ParameterTypeStoreShape => {
  const store = createParameterTypeStore()
  define(store)
  return store
}

/** Build a matcher over one or more `pattern → definition` pairs, in the order given. */
const matcherOver = (
  registry: ReturnType<typeof builtInRegistry>,
  entries: ReadonlyArray<StepPatternEntry<string>>
) => createStepMatcher({ registry, entries })

/** Match `text` against a single-entry matcher built on the built-ins, and return the one match. */
const soleMatch = (pattern: string, text: string): StepMatch<string> => {
  const matches = matcherOver(builtInRegistry(), [{ pattern, definition: "only" }]).match(text)
  const first = matches[0]
  if (matches.length !== 1 || first === undefined) {
    throw new Error(`expected ${pattern} to produce exactly one match for ${text}, got ${matches.length}`)
  }
  return first
}

/**
 * Runs `action`, asserts it threw a `StepPatternError`, and returns it.
 *
 * A throw of any other kind is re-thrown rather than absorbed: swallowing it would let a `TypeError`
 * inside the matcher masquerade as a correctly reported failure. Returning normally is itself a
 * failure, and says so. Deliberately not `expect(...).toThrow()`: oxlint's
 * `vitest(require-to-throw-message)` is error-level here and would pin every failure to its prose.
 */
const rejectedBy = (action: () => void): StepPatternError => {
  try {
    action()
  } catch (thrown) {
    if (thrown instanceof StepPatternError) {
      return thrown
    }
    throw thrown
  }
  throw new Error("expected the matcher to throw a StepPatternError, but it returned normally")
}

describe("StepMatcher coerces built-in parameter types at runtime (BEH-EC-015)", () => {
  it("hands {int} to the caller as a JavaScript number", () => {
    const { args } = soleMatch("I have {int} cukes", "I have 42 cukes")

    // Both assertions are required. `toEqual([42])` alone passes for the string "42" under a
    // matcher that never coerced anything, which is exactly the regression this test exists for.
    expect(args).toEqual([42])
    expect(typeof args[0]).toBe("number")
  })

  it("hands {float} to the caller as a JavaScript number", () => {
    const { args } = soleMatch("I paid {float} euros", "I paid 3.5 euros")

    expect(args).toEqual([3.5])
    expect(typeof args[0]).toBe("number")
  })

  it("matches integer text with {float} and still yields a number", () => {
    const { args } = soleMatch("I paid {float} euros", "I paid 4 euros")

    expect(args).toEqual([4])
    expect(typeof args[0]).toBe("number")
  })

  it("hands {string} to the caller as a quote-stripped JavaScript string", () => {
    const { args } = soleMatch("my name is {string}", "my name is \"bob\"")

    expect(args).toEqual(["bob"])
    expect(typeof args[0]).toBe("string")
  })

  it("hands {word} to the caller as a JavaScript string", () => {
    const { args } = soleMatch("the {word} is red", "the apple is red")

    expect(args).toEqual(["apple"])
    expect(typeof args[0]).toBe("string")
  })

  it("preserves parameter order and per-position types across all four built-ins in one pattern", () => {
    const { args } = soleMatch(
      "I have {int} cukes and {float} kg of {word} named {string}",
      "I have 42 cukes and 3.5 kg of apple named \"bob\""
    )

    expect(args).toEqual([42, 3.5, "apple", "bob"])
    expect(typeof args[0]).toBe("number")
    expect(typeof args[1]).toBe("number")
    expect(typeof args[2]).toBe("string")
    expect(typeof args[3]).toBe("string")
  })

  it("returns an empty array — not null, not a throw — when {int} is given decimal text", () => {
    const matches = matcherOver(builtInRegistry(), [{ pattern: "v {int}", definition: "int" }]).match("v 5.5")

    expect(matches).toEqual([])
  })

  it("hands a custom parameter type's transform result through unchanged", () => {
    const store = storeWith((target) =>
      target.define({
        name: "money",
        regexp: /\d+/,
        transform: (...match: Array<string>) => ({ amount: Number(match[0]), currency: "EUR" }),
        definedAt: Option.none(),
        useForSnippets: Option.none(),
        preferForRegexpMatch: Option.none()
      })
    )
    const { args } = matcherOver(store.buildRegistry(), [{ pattern: "I pay {money}", definition: "pay" }])
      .match("I pay 7")[0] ?? { args: [] }

    expect(args).toEqual([{ amount: 7, currency: "EUR" }])
    expect(typeof args[0]).toBe("object")
  })
})

/**
 * The compile-time companion to Group A, in the same file so the two halves of BEH-EC-015 are read
 * together. Checked by `pnpm typecheck:test` (a required step in `check.yml`'s `types` job), never
 * by vitest — the values below are exported so `noUnusedLocals` does not elide the claim.
 */
export const stepArgsCompanion: StepArgs<"I have {int} cukes and {word} left"> = [42, "two"]

/** The negative half: `{int}` is `number`, so a string in that position must not type-check. */
// @ts-expect-error {int} resolves to number, never to the string "42"
export const stepArgsRejectsStringForInt: StepArgs<"I have {int} cukes and {word} left"> = ["42", "two"]

describe("StepMatcher returns every matching pattern, never the first registered", () => {
  it("returns both matches when two registered patterns match one step text", () => {
    const matches = matcherOver(builtInRegistry(), [
      { pattern: "I have {int} apples", definition: "as-int" },
      { pattern: "I have {word} apples", definition: "as-word" }
    ]).match("I have 5 apples")

    expect(matches).toHaveLength(2)
    expect(matches.map((match) => match.pattern)).toEqual(["I have {int} apples", "I have {word} apples"])
    expect(matches.map((match) => match.definition)).toEqual(["as-int", "as-word"])
    expect(matches[0]?.args).toEqual([5])
    expect(typeof matches[0]?.args[0]).toBe("number")
    expect(matches[1]?.args).toEqual(["5"])
    expect(typeof matches[1]?.args[0]).toBe("string")
  })

  it("returns the same set of patterns when the two entries are registered in the opposite order", () => {
    // Compared as Sets, matching expressions-pin.test.ts: the immutable ES2023 ordering method is
    // unavailable under this repo's ES2022 lib and the in-place one is rejected by oxlint's
    // unicorn(no-array-sort), and the claim here is about the SET anyway.
    const forwards = matcherOver(builtInRegistry(), [
      { pattern: "I have {int} apples", definition: "as-int" },
      { pattern: "I have {word} apples", definition: "as-word" }
    ]).match("I have 5 apples")
    const backwards = matcherOver(builtInRegistry(), [
      { pattern: "I have {word} apples", definition: "as-word" },
      { pattern: "I have {int} apples", definition: "as-int" }
    ]).match("I have 5 apples")

    expect(new Set(backwards.map((match) => match.pattern))).toEqual(new Set(forwards.map((match) => match.pattern)))
    expect(backwards).toHaveLength(2)
  })

  it("returns an empty array and does not throw when no registered pattern matches", () => {
    const matches = matcherOver(builtInRegistry(), [
      { pattern: "I have {int} apples", definition: "as-int" },
      { pattern: "the {word} is red", definition: "colour" }
    ]).match("something else entirely")

    expect(matches).toEqual([])
  })

  it("returns exactly the middle entry when it is the only one of three that matches", () => {
    const matches = matcherOver(builtInRegistry(), [
      { pattern: "the {word} is red", definition: "first" },
      { pattern: "I have {int} apples", definition: "middle" },
      { pattern: "I paid {float} euros", definition: "last" }
    ]).match("I have 5 apples")

    expect(matches).toHaveLength(1)
    expect(matches[0]?.definition).toBe("middle")
  })

  it("returns an empty array for any text when the matcher has no entries at all", () => {
    const matcher = matcherOver(builtInRegistry(), [])

    expect(matcher.match("I have 5 apples")).toEqual([])
    expect(matcher.match("")).toEqual([])
  })

  it("exposes its entries unchanged, in registration order", () => {
    const entries: ReadonlyArray<StepPatternEntry<string>> = [
      { pattern: "I have {int} apples", definition: "as-int" },
      { pattern: "I have {word} apples", definition: "as-word" }
    ]

    expect(matcherOver(builtInRegistry(), entries).entries).toEqual(entries)
  })
})

describe("StepMatcher memoizes compilation per (registry, pattern) pair", () => {
  it("returns the identical expression instance for the same registry and pattern", () => {
    const registry = builtInRegistry()

    expect(compileExpression(registry, "I have {int} apples")).toBe(compileExpression(registry, "I have {int} apples"))
  })

  it("returns two different expression instances for one pattern against two different registries", () => {
    // The assertion a pattern-keyed cache fails. An expression snapshots its resolved parameter
    // types at construction, so serving the first registry's expression to the second would bind a
    // step to parameter types that registry never had.
    const first = builtInRegistry()
    const second = builtInRegistry()

    expect(compileExpression(second, "I have {int} apples")).not.toBe(compileExpression(first, "I have {int} apples"))
  })

  it("does not recompile while matching, however many times match is called", () => {
    const registry = builtInRegistry()
    const pattern = "I have {int} apples"
    const compiled = compileExpression(registry, pattern)
    const matcher = matcherOver(registry, [{ pattern, definition: "as-int" }])

    for (let iteration = 0; iteration < 50; iteration += 1) {
      matcher.match("I have 5 apples")
    }

    expect(compileExpression(registry, pattern)).toBe(compiled)
  })

  it("shares one compiled expression between two matchers built over the same registry", () => {
    const registry = builtInRegistry()
    const shared = "I have {int} apples"
    const compiled = compileExpression(registry, shared)

    matcherOver(registry, [{ pattern: shared, definition: "a" }]).match("I have 5 apples")
    matcherOver(registry, [{ pattern: shared, definition: "b" }, { pattern: "the {word} is red", definition: "c" }])
      .match("I have 5 apples")

    expect(compileExpression(registry, shared)).toBe(compiled)
  })
})

describe("StepMatcher converts every upstream and transform failure into a StepPatternError", () => {
  it("compiles nothing at construction, so an unregistered parameter type surfaces at the first match", () => {
    const matcher = matcherOver(builtInRegistry(), [{ pattern: "I pay {money}", definition: "pay" }])

    // If construction compiled eagerly, the line above would already have thrown and this test
    // would fail there, naming construction rather than the assertion below.
    expect(matcher.entries).toHaveLength(1)
    expect(
      rejectedBy(() => {
        matcher.match("I pay 5")
      }).reason
    ).toBe("UndefinedParameterType")
  })

  it("names the parameter type and the whole pattern when a pattern uses an unregistered type", () => {
    const pattern = "I pay {money} on {word}"
    const error = rejectedBy(() => {
      matcherOver(builtInRegistry(), [{ pattern, definition: "pay" }]).match("I pay 5 on tuesday")
    })

    expect(error.reason).toBe("UndefinedParameterType")
    expect(error.parameterTypeName).toEqual(Option.some("money"))
    expect(error.pattern).toEqual(Option.some(pattern))
    expect(error.message).toContain("money")
    expect(error.message).toContain(pattern)
  })

  it("raises InvalidStepPattern for a pattern whose parameter brace is never closed", () => {
    const pattern = "I have {int cukes"
    const error = rejectedBy(() => {
      matcherOver(builtInRegistry(), [{ pattern, definition: "broken" }]).match("I have 5 cukes")
    })

    expect(error.reason).toBe("InvalidStepPattern")
    expect(error.pattern).toEqual(Option.some(pattern))
  })

  it("raises the same failure again on a second match, rather than reporting no match", () => {
    const matcher = matcherOver(builtInRegistry(), [{ pattern: "I have {int cukes", definition: "broken" }])

    expect(
      rejectedBy(() => {
        matcher.match("I have 5 cukes")
      }).reason
    ).toBe("InvalidStepPattern")
    expect(
      rejectedBy(() => {
        matcher.match("I have 5 cukes")
      }).reason
    ).toBe("InvalidStepPattern")
  })

  it("raises AsyncParameterTransform for a transform that returns a thenable", () => {
    // The cast is deliberate. `ParameterTypeDefinition.transform` omits upstream's `PromiseLike<T>`
    // half, so an async transform is already a compile error — this simulates the plain-JavaScript
    // caller, or the `any`-cast one, that the type-level prohibition cannot reach.
    const store = storeWith((target) =>
      target.define({
        name: "later",
        regexp: /\d+/,
        transform: (async (...match: Array<string>) => Number(match[0])) as unknown as (
          ...match: Array<string>
        ) => number,
        definedAt: Option.none(),
        useForSnippets: Option.none(),
        preferForRegexpMatch: Option.none()
      })
    )
    const error = rejectedBy(() => {
      matcherOver(store.buildRegistry(), [{ pattern: "v {later}", definition: "later" }]).match("v 5")
    })

    expect(error.reason).toBe("AsyncParameterTransform")
    expect(error.parameterTypeName).toEqual(Option.some("later"))
    expect(error.pattern).toEqual(Option.some("v {later}"))
  })

  it("raises ParameterTransformFailed quoting the raw matched text in full when a transform throws", () => {
    const rawText = "a-very-long-raw-token-that-must-reach-the-message-whole-and-unabbreviated"
    const store = storeWith((target) =>
      target.define({
        name: "boom",
        regexp: /\S+/,
        transform: (): number => {
          throw new Error("transform blew up")
        },
        definedAt: Option.none(),
        useForSnippets: Option.none(),
        preferForRegexpMatch: Option.none()
      })
    )
    const error = rejectedBy(() => {
      matcherOver(store.buildRegistry(), [{ pattern: "v {boom}", definition: "boom" }]).match(`v ${rawText}`)
    })

    expect(error.reason).toBe("ParameterTransformFailed")
    expect(error.parameterTypeName).toEqual(Option.some("boom"))
    expect(error.message).toContain(rawText)
    // The locked no-truncation decision, asserted rather than assumed.
    expect(error.message).not.toContain("…")
    expect(error.message).not.toContain("...")
  })
})

describe("StepMatcher positive control", () => {
  it("matches a parameterless literal pattern against its exact text, yielding an empty args array", () => {
    // Without this, an implementation that simply returned nothing would pass most of Group B.
    const matches = matcherOver(builtInRegistry(), [{ pattern: "I am ready", definition: "ready" }]).match("I am ready")

    expect(matches).toHaveLength(1)
    expect(matches[0]?.definition).toBe("ready")
    expect(matches[0]?.args).toEqual([])
  })
})

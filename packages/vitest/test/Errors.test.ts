/**
 * MATCH-03/04/05's two data shapes, proven to construct under `effect@4.0.0-rc.112`'s real
 * constraints and to carry full, unmodified content.
 *
 * Three of the assertions below are written more strictly than they look like they need to be,
 * and each one defends a property that a weaker check would let rot silently.
 *
 * - **The untruncated-message assertion pins `message.length` against a HARD-CODED number, never a
 *   substring.** A `toContain` check passes against a truncated message that happens to keep its
 *   prefix, which is exactly what every truncating formatter produces. The no-truncation policy is
 *   a locked developer decision (`packages/gherkin/src/Errors.ts` note (b), pinned byte for byte in
 *   `packages/gherkin/test/Contracts.test.ts`) and `packages/vitest/src/Errors.ts` note (d) extends
 *   it to this package; the length is the only assertion that actually enforces it.
 *
 * - **The ambiguous-match assertion uses a NON-ALPHABETICAL pattern order.** `matchedPatterns` is
 *   in the order the caller supplied, and the caller's order is the contract: 06-CONTEXT.md D-03
 *   orders the list by each pattern's definition site (`file:line`), and `Plan.ts` owns applying
 *   that sort. If `Errors.ts` ever sorts as well, the two rules can disagree — so the array here is
 *   ordered `I…`, `A…`, `G…`, and an accidental `.sort()` anywhere on the path fails this test
 *   rather than quietly agreeing with it.
 *
 * - **The omitted-key assertion goes through `thrownBy`, never vitest's throw matcher.** That
 *   matcher is unusable here in both of its forms: called with no argument it is rejected outright
 *   by oxlint's error-level `vitest(require-to-throw-message)`, and called WITH one it would pin
 *   this file to `effect`'s own upstream prose, which is free to change inside an rc bump.
 *   `thrownBy` returns the thrown value so the test can assert `instanceof Error` structurally
 *   instead. The helper is reproduced locally rather than imported from
 *   `packages/gherkin/test/expressions-pin.test.ts` — a cross-package test import is not a
 *   dependency this repo has, and the helper is six lines.
 *
 * Mutation-tested (both performed, then reverted, both confirmed failing):
 * - A. A `.slice(0, 200)` is introduced at the one construction site `src/Errors.ts` currently has
 *      — `makeUnusedStepDefinitionWarning`'s `message` — → the 4000-character length assertion on
 *      the warning fails. `StepMatchError` has no construction site in src yet (its plain-optionals
 *      factory is `Plan.ts`'s, plan 06-04), which is why the identical length assertion is pinned
 *      on the error here too: it is already waiting for that factory before the factory exists.
 * - B. `makeUnusedStepDefinitionWarning` returns `Option.some(args.definedAt)` unconditionally
 *      instead of `Option.fromUndefinedOr(args.definedAt)` → the omitted-`definedAt` test fails
 *      (`Option.some(undefined)` is not `Option.none()`).
 *
 * ## Imports
 *
 * `../src/Errors.ts` directly, never `../src/index.ts`: `effect/no-import-from-barrel-package` runs
 * with `checkRelativeIndexImports: true` and fails `pnpm lint` on a relative value-import whose
 * basename is `index.*`. Neither type is in that barrel yet anyway — plan 06-07 owns that edit
 * (`src/Errors.ts`'s closing note).
 *
 * `@effect/vitest` is the one `@effect/*` barrel that same rule exempts; the exemption and its
 * bounds are documented at the rule's config in `.oxlintrc.json`. Every test here is synchronous,
 * so `expect` is called directly inside `it`, where `vitest/no-standalone-expect` is satisfied.
 */
import { describe, expect, it } from "@effect/vitest"
import * as Option from "effect/Option"
import {
  makeUnusedStepDefinitionWarning,
  StepMatchError,
  type UnusedStepDefinitionWarningReason
} from "../src/Errors.ts"

/**
 * Runs `action` and returns whatever it threw.
 *
 * Used in place of vitest's throw matcher — see this module's doc comment. Throws rather than
 * returning a sentinel when the action does NOT throw, so a construction that silently starts
 * succeeding fails at the assertion it belongs to instead of reading as a pass.
 */
const thrownBy = (action: () => unknown): unknown => {
  try {
    action()
  } catch (error) {
    return error
  }
  throw new Error("expected the action to throw, but it returned normally")
}

/**
 * Exactly 4000 characters: a 40-character unit repeated 100 times.
 *
 * The unit carries the two things a truncating formatter eats first — embedded newlines and a
 * quoted step text — so a mutation that keeps the length while eating structure would still be
 * visible to the newline count below.
 */
const UNTRUNCATED_MESSAGE_LENGTH = 4000
const untruncatedMessage = "Given I have a very long step text \"x\"\n\n".repeat(100)

/**
 * Deliberately NOT in alphabetical order (`I…`, `A…`, `G…`). Sorting this array would produce
 * `A…`, `G…`, `I…`, so any accidental sort on the path fails the order assertion below.
 */
const ambiguousPatterns = [
  "I have {int} cucumbers in my basket",
  "A user {string} logs in",
  "Given nothing at all happens"
]

/** The constructor's argument type, named once so the omitted-key cast below reads as deliberate. */
type StepMatchErrorArgs = ConstructorParameters<typeof StepMatchError>[0]

const undefinedStepError = () =>
  new StepMatchError({
    reason: "UndefinedStep",
    uri: "features/checkout.feature",
    line: Option.some(17),
    stepText: "I have 42 cucumbers in my basket",
    scenarioName: "a shopper fills a basket",
    matchedPatterns: [],
    suggestion: Option.some("Given(\"I have {int} cucumbers in my basket\", function*(count: number) {})"),
    message: untruncatedMessage,
    cause: Option.none()
  })

const ambiguousStepError = () =>
  new StepMatchError({
    reason: "AmbiguousStep",
    uri: "features/checkout.feature",
    line: Option.some(23),
    stepText: "I have 42 cucumbers in my basket",
    scenarioName: "a shopper fills a basket",
    matchedPatterns: ambiguousPatterns,
    suggestion: Option.none(),
    message: untruncatedMessage,
    cause: Option.none()
  })

const unusedWarning = (definedAt?: string) =>
  definedAt === undefined
    ? makeUnusedStepDefinitionWarning({
      reason: "UnusedStepDefinition",
      featureName: "Checkout",
      uri: "features/checkout.feature",
      keyword: "Then",
      pattern: "the basket total is {int}",
      message: untruncatedMessage
    })
    : makeUnusedStepDefinitionWarning({
      reason: "UnusedStepDefinition",
      featureName: "Checkout",
      uri: "features/checkout.feature",
      keyword: "Then",
      pattern: "the basket total is {int}",
      definedAt,
      message: untruncatedMessage
    })

describe("StepMatchError, reason UndefinedStep (MATCH-03)", () => {
  it("is an instance of Error and of StepMatchError", () => {
    expect(undefinedStepError()).toBeInstanceOf(Error)
    expect(undefinedStepError()).toBeInstanceOf(StepMatchError)
  })

  it("carries the exact _tag the Plan stage discriminates on", () => {
    // Destructured rather than read by dotted member access: `no-underscore-dangle` is error-level
    // in this repo for member expressions, and allows object destructuring.
    const { _tag } = undefinedStepError()
    expect(_tag).toBe("StepMatchError")
  })

  it("derives name from the tag rather than inheriting the useless \"Error\"", () => {
    expect(undefinedStepError().name).toBe("StepMatchError")
  })

  it("round-trips reason, stepText, uri and scenarioName unchanged", () => {
    const error = undefinedStepError()
    expect(error.reason).toBe("UndefinedStep")
    // BEH-EC-013's literal requirement: the EXACT step text, not a normalised or quoted variant.
    expect(error.stepText).toBe("I have 42 cucumbers in my basket")
    expect(error.uri).toBe("features/checkout.feature")
    expect(error.scenarioName).toBe("a shopper fills a basket")
  })

  it("round-trips the D-01 suggested snippet as Option.some of the supplied string", () => {
    expect(undefinedStepError().suggestion).toEqual(
      Option.some("Given(\"I have {int} cucumbers in my basket\", function*(count: number) {})")
    )
  })

  it("exposes line as Option.some of the supplied number", () => {
    expect(undefinedStepError().line).toEqual(Option.some(17))
  })

  it("reports matchedPatterns as an empty ARRAY, not an absent value", () => {
    // "no patterns matched" is genuinely a zero-length list, which is why the field is
    // `Schema.Array` and not `Schema.OptionFromUndefinedOr` — src/Errors.ts's field notes.
    expect(undefinedStepError().matchedPatterns).toEqual([])
  })
})

describe("StepMatchError, reason AmbiguousStep (MATCH-04)", () => {
  it("preserves matchedPatterns in the exact order supplied, applying no sort of its own", () => {
    // THE load-bearing assertion of this block. `ambiguousPatterns` is non-alphabetical on purpose;
    // 06-CONTEXT.md D-03's definition-site sort belongs to Plan.ts and must not be duplicated here.
    expect(ambiguousStepError().matchedPatterns).toEqual([
      "I have {int} cucumbers in my basket",
      "A user {string} logs in",
      "Given nothing at all happens"
    ])
  })

  it("names every matching pattern rather than resolving the ambiguity", () => {
    expect(ambiguousStepError().matchedPatterns).toHaveLength(3)
  })

  it("carries suggestion as Option.none(), since the patterns already exist", () => {
    expect(ambiguousStepError().suggestion).toEqual(Option.none())
  })

  it("round-trips a second reason tag, proving reason is not hard-coded", () => {
    expect(ambiguousStepError().reason).toBe("AmbiguousStep")
  })
})

describe("StepMatchError construction under this rc build's constraints", () => {
  it("fails when an Option-typed key is omitted, rather than defaulting it", () => {
    // Verified fact 3 of the plan, and `packages/gherkin/src/Errors.ts` note (a): every optional
    // field is `Schema.OptionFromUndefinedOr`, a TRANSFORMATION, and the constructor validates
    // against the Type side — so there is no implicit `Option.none()` for an omitted key. The cast
    // is load-bearing rather than a workaround: the parameter type REQUIRES `cause`, so the
    // omission is unwriteable without one, and this test is about the runtime behaviour a
    // JavaScript caller or a Schema-decoded reconstruction would otherwise meet unannounced.
    const withoutCause = {
      reason: "UndefinedStep",
      uri: "features/checkout.feature",
      line: Option.none(),
      stepText: "I omit a required key",
      scenarioName: "omission",
      matchedPatterns: [],
      suggestion: Option.none(),
      message: "cause was omitted"
    } as unknown as StepMatchErrorArgs

    const thrown = thrownBy(() => new StepMatchError(withoutCause))
    expect(thrown).toBeInstanceOf(Error)
  })

  it("exposes cause as Option.some of the supplied value, preserving reference equality", () => {
    const upstream = new Error("the step body threw")
    const error = new StepMatchError({
      reason: "UndefinedStep",
      uri: "features/checkout.feature",
      line: Option.none(),
      stepText: "I have 42 cucumbers in my basket",
      scenarioName: "a shopper fills a basket",
      matchedPatterns: [],
      suggestion: Option.none(),
      message: "wrapping an upstream throw",
      cause: Option.some(upstream)
    })
    expect(error.cause).toEqual(Option.some(upstream))
    expect(Option.getOrThrow(error.cause)).toBe(upstream)
  })
})

describe("StepMatchError carries full, untruncated message content", () => {
  it("survives a 4000-character message with its length unchanged", () => {
    // Length, never a substring: a truncated message that keeps its prefix passes every
    // `toContain` check ever written. Mutation A makes exactly this shape of assertion fail.
    expect(untruncatedMessage.length).toBe(UNTRUNCATED_MESSAGE_LENGTH)
    expect(undefinedStepError().message.length).toBe(UNTRUNCATED_MESSAGE_LENGTH)
  })

  it("preserves the message byte for byte, newlines and quotes included", () => {
    expect(undefinedStepError().message).toBe(untruncatedMessage)
  })

  it("adds no ellipsis or elision marker to a long message", () => {
    const { message } = undefinedStepError()
    expect(message.includes("…")).toBe(false)
    expect(message.endsWith("...")).toBe(false)
  })
})

describe("UnusedStepDefinitionWarning (MATCH-05)", () => {
  it("carries the exact _tag, distinct from gherkin's parse-time LoadFeatureWarning", () => {
    const { _tag } = unusedWarning()
    expect(_tag).toBe("UnusedStepDefinitionWarning")
  })

  it("is plain data, not an Error subclass", () => {
    // src/Errors.ts note (c): it never enters an error channel and is constructed in a loop.
    expect(unusedWarning()).not.toBeInstanceOf(Error)
  })

  it("wraps a supplied definedAt in Option.some", () => {
    expect(unusedWarning("features/checkout.steps.ts:31:5").definedAt).toEqual(
      Option.some("features/checkout.steps.ts:31:5")
    )
  })

  it("normalises an omitted definedAt to Option.none()", () => {
    // Mutation B — an unconditional `Option.some(args.definedAt)` — fails exactly here.
    expect(unusedWarning().definedAt).toEqual(Option.none())
  })

  it("round-trips featureName, uri, keyword and pattern unchanged", () => {
    const warning = unusedWarning()
    expect(warning.featureName).toBe("Checkout")
    expect(warning.uri).toBe("features/checkout.feature")
    expect(warning.keyword).toBe("Then")
    expect(warning.pattern).toBe("the basket total is {int}")
  })

  it("round-trips the reason tag", () => {
    const reason: UnusedStepDefinitionWarningReason = "UnusedStepDefinition"
    expect(unusedWarning().reason).toBe(reason)
  })

  it("survives a 4000-character message with its length unchanged", () => {
    // Mutation A — a `.slice(0, 200)` in `makeUnusedStepDefinitionWarning` — fails exactly here.
    expect(unusedWarning().message.length).toBe(UNTRUNCATED_MESSAGE_LENGTH)
    expect(unusedWarning().message).toBe(untruncatedMessage)
  })
})

import * as Option from "effect/Option"
import { inspect } from "node:util"
import { describe, expect, it } from "vitest"
import { LoadFeatureError, makeWarning, StepPatternError, type StepPatternErrorReason } from "../src/Errors.ts"

// Imported directly from ../src/Errors.ts, never through ../src/index.ts:
// `effect/no-import-from-barrel-package` runs with `checkRelativeIndexImports: true` and
// fails `pnpm lint` on any relative value-import whose basename is `index.*`.

describe("LoadFeatureError", () => {
  // A message long enough that any hypothetical truncation would be visible, carrying the
  // two things a truncating formatter would eat first: embedded newlines and pipe-delimited
  // DataTable rows. This is the executable form of the locked no-truncation policy.
  const verboseTableMessage = [
    "features/checkout.feature:12: EmptyExamples: this Examples table produced zero pickles.",
    "",
    "  | username          | password                       | token                                  |",
    "  | alice@example.com | correct-horse-battery-staple-1 | 6f1c2d3e-4a5b-6c7d-8e9f-0a1b2c3d4e5f |",
    "  | bob@example.com   | correct-horse-battery-staple-2 | 7a2d3e4f-5b6c-7d8e-9f0a-1b2c3d4e5f60 |",
    "",
    "Every cell above is reproduced verbatim, by decision: no shortening of any kind.",
    "Add body rows to the Examples block, or convert the Scenario Outline to a Scenario."
  ].join("\n")

  const makeError = () =>
    new LoadFeatureError({
      reason: "EmptyExamples",
      uri: "features/checkout.feature",
      line: Option.some(12),
      message: verboseTableMessage
    })

  it("is an instance of Error", () => {
    expect(makeError()).toBeInstanceOf(Error)
  })

  it("is an instance of LoadFeatureError", () => {
    expect(makeError()).toBeInstanceOf(LoadFeatureError)
  })

  it("reports name as the literal LoadFeatureError, not the inherited Error", () => {
    // @cucumber/gherkin's own error classes never set this, so their .name is "Error".
    expect(makeError().name).toBe("LoadFeatureError")
  })

  it("carries the _tag discriminator for the Phase 6 error channel", () => {
    // Destructured rather than read by dotted member access off the error:
    // `no-underscore-dangle` is error-level in this repo for member expressions, and allows
    // object destructuring.
    const { _tag } = makeError()
    expect(_tag).toBe("LoadFeatureError")
  })

  it("round-trips the reason tag given to the constructor", () => {
    expect(makeError().reason).toBe("EmptyExamples")
  })

  it("round-trips a different reason tag, proving reason is not hard-coded", () => {
    const err = new LoadFeatureError({
      reason: "DuplicateScenarioName",
      uri: "features/dup.feature",
      line: Option.none(),
      message: "two Scenarios named \"checkout\" at lines 4 and 11"
    })
    expect(err.reason).toBe("DuplicateScenarioName")
  })

  it("round-trips the uri", () => {
    expect(makeError().uri).toBe("features/checkout.feature")
  })

  it("exposes line as Option.some(the supplied number)", () => {
    expect(makeError().line).toEqual(Option.some(12))
  })

  it("exposes line as Option.none() when the constructor argument is Option.none()", () => {
    // `line`/`cause` are `Option<T>`, not `T | undefined`: the constructor KEY is always
    // required (a `Schema.TaggedError` constraint, not an ergonomic choice — see Errors.ts's
    // doc comment), so there is no "omitted argument" case left to distinguish from an
    // explicit `Option.none()`. Both read identically, which is the point.
    const err = new LoadFeatureError({
      reason: "MissingFile",
      uri: "features/absent.feature",
      line: Option.none(),
      message: "no such file"
    })
    expect(err.line).toEqual(Option.none())
  })

  it("reproduces a long multi-line message verbatim, with no truncation", () => {
    expect(verboseTableMessage.length).toBeGreaterThanOrEqual(400)
    expect(makeError().message).toBe(verboseTableMessage)
  })

  it("preserves newlines and pipe characters inside the message", () => {
    const message = makeError().message
    expect(message.split("\n")).toHaveLength(8)
    expect(message).toContain("| bob@example.com   | correct-horse-battery-staple-2 |")
  })

  it("adds no ellipsis or elision marker to a long message", () => {
    const message = makeError().message
    expect(message.includes("…")).toBe(false)
    expect(message.endsWith("...")).toBe(false)
  })

  it("exposes cause natively, so reference equality holds and util.inspect shows the chain", () => {
    const upstream = new Error("(1:1): expected: #EOF, got 'Feture: x'")
    const err = new LoadFeatureError({
      reason: "ParseFailed",
      uri: "features/typo.feature",
      line: Option.some(1),
      message: "the parser rejected this file",
      cause: upstream
    })
    expect(err.cause).toBe(upstream)
    expect(inspect(err)).toContain("expected: #EOF, got 'Feture: x'")
  })

  it("leaves cause undefined when no upstream error is supplied", () => {
    expect(makeError().cause).toBeUndefined()
  })
})

describe("makeWarning", () => {
  const warning = makeWarning({
    reason: "UnknownPlaceholder",
    uri: "features/outline.feature",
    line: 9,
    message: "<b> is not one of the Examples columns of this Outline: a"
  })

  it("carries the _tag discriminator", () => {
    const { _tag } = warning
    expect(_tag).toBe("LoadFeatureWarning")
  })

  it("round-trips the warning reason tag", () => {
    expect(warning.reason).toBe("UnknownPlaceholder")
  })

  it("round-trips the warning uri", () => {
    expect(warning.uri).toBe("features/outline.feature")
  })

  it("round-trips the warning message", () => {
    expect(warning.message).toBe("<b> is not one of the Examples columns of this Outline: a")
  })

  it("round-trips the warning line as Option.some(9)", () => {
    expect(warning.line).toEqual(Option.some(9))
  })

  it("normalises an omitted warning line to Option.none()", () => {
    // `makeWarning`'s own `line?: number` argument stays plain and omittable (it is not a
    // Schema-constrained class, see Errors.ts) — it is the one place that converts to the
    // field's `Option<number>` type.
    const noLine = makeWarning({
      reason: "EmptyRule",
      uri: "features/empty-rule.feature",
      message: "this Rule contains no Scenarios and produced no pickles"
    })
    expect(noLine.line).toEqual(Option.none())
  })

  it("is not an Error instance, because Group C findings never throw", () => {
    expect(warning).not.toBeInstanceOf(Error)
  })
})

describe("StepPatternError", () => {
  // Every member of StepPatternErrorReason, listed here rather than derived, so that adding a
  // reason to the union without a test is a visible omission rather than an invisible one.
  const allReasons: ReadonlyArray<StepPatternErrorReason> = [
    "BuiltInParameterTypeName",
    "DuplicateParameterTypeName",
    "IllegalParameterTypeName",
    "InvalidParameterTypeRegexp",
    "InvalidParameterTypeDefinition",
    "UndefinedParameterType",
    "InvalidStepPattern",
    "AsyncParameterTransform",
    "ParameterTransformFailed"
  ]

  // A step pattern long enough that any hypothetical truncation would be visible, carrying the
  // things a truncating formatter eats first: embedded newlines, cucumber-expression braces,
  // and an alternation. The no-truncation policy of Errors.ts note (b) extends to this class,
  // and this is its executable form.
  const verbosePatternMessage = [
    "InvalidStepPattern: this step pattern is not a valid cucumber-expression.",
    "",
    "  the customer {word} pays {money} for {int} apple(s)/pear(s) on {date} at the counter",
    "  and then receives a receipt numbered {biginteger} with the cashier's note {string}",
    "  and the register reconciles to {bigdecimal} before the next customer is served",
    "",
    "Every character of the pattern above is reproduced verbatim, by decision: no shortening",
    "of any kind, so the pattern can be copied straight back into the step definition."
  ].join("\n")

  const makeError = () =>
    new StepPatternError({
      reason: "InvalidStepPattern",
      parameterTypeName: Option.some("money"),
      pattern: Option.some("the customer {word} pays {money}"),
      message: verbosePatternMessage
    })

  it("is an Error instance, unlike a LoadFeatureWarning", () => {
    expect(makeError()).toBeInstanceOf(Error)
  })

  it("is an instance of StepPatternError", () => {
    expect(makeError()).toBeInstanceOf(StepPatternError)
  })

  it("reports name as the literal StepPatternError, not the inherited Error", () => {
    // @cucumber/cucumber-expressions' own error classes never set this, so their .name is
    // "Error" and they are not exported from its barrel either. Deleting the explicit
    // assignment in the constructor must fail exactly here.
    expect(makeError().name).toBe("StepPatternError")
  })

  it("carries the StepPatternError _tag discriminator for the Phase 6 error channel", () => {
    // Destructured rather than read by dotted member access off the error:
    // `no-underscore-dangle` is error-level in this repo for member expressions, and allows
    // object destructuring.
    const { _tag } = makeError()
    expect(_tag).toBe("StepPatternError")
  })

  for (const reason of allReasons) {
    it(`round-trips the ${reason} reason tag given to the constructor`, () => {
      const err = new StepPatternError({
        reason,
        parameterTypeName: Option.none(),
        pattern: Option.none(),
        message: `raised for ${reason}`
      })
      expect(err.reason).toBe(reason)
    })
  }

  it("round-trips the parameterTypeName as Option.some(...) when it is supplied", () => {
    expect(makeError().parameterTypeName).toEqual(Option.some("money"))
  })

  it("round-trips the step pattern as Option.some(...) when it is supplied", () => {
    expect(makeError().pattern).toEqual(Option.some("the customer {word} pays {money}"))
  })

  it("exposes parameterTypeName and pattern as Option.none() when both are Option.none()", () => {
    // The constructor KEY is always required now (a `Schema.TaggedError` constraint — see
    // Errors.ts's doc comment), so both properties always exist on every instance; the `in`
    // check below is now guaranteed by the type system too, but stays as a runtime pin.
    const err = new StepPatternError({
      reason: "InvalidParameterTypeDefinition",
      parameterTypeName: Option.none(),
      pattern: Option.none(),
      message: "the upstream ParameterType constructor rejected this definition"
    })

    expect(err.parameterTypeName).toEqual(Option.none())
    expect(err.pattern).toEqual(Option.none())
    expect("parameterTypeName" in err).toBe(true)
    expect("pattern" in err).toBe(true)
  })

  it("forwards the cause natively, preserving reference equality and the inspected chain", () => {
    const upstream = new Error("This Cucumber Expression has a problem at column 7")
    const err = new StepPatternError({
      reason: "UndefinedParameterType",
      parameterTypeName: Option.some("money"),
      pattern: Option.some("I pay {money}"),
      message: "no parameter type named money is registered",
      cause: upstream
    })

    expect(err.cause).toBe(upstream)
    expect(inspect(err)).toContain("has a problem at column 7")
  })

  it("leaves the cause undefined when no upstream error is supplied", () => {
    expect(makeError().cause).toBeUndefined()
  })

  it("reproduces a long multi-line step pattern message verbatim, with no truncation", () => {
    expect(verbosePatternMessage.length).toBeGreaterThanOrEqual(400)
    expect(makeError().message).toBe(verbosePatternMessage)
    expect(makeError().message.includes("...")).toBe(false)
  })

  it("adds no ellipsis or elision marker to a long step pattern message", () => {
    const message = makeError().message
    expect(message.includes("…")).toBe(false)
    expect(message.split("\n")).toHaveLength(8)
  })
})

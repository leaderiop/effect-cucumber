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
      line: 12,
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
      message: "two Scenarios named \"checkout\" at lines 4 and 11"
    })
    expect(err.reason).toBe("DuplicateScenarioName")
  })

  it("round-trips the uri", () => {
    expect(makeError().uri).toBe("features/checkout.feature")
  })

  it("exposes line as the supplied number", () => {
    expect(makeError().line).toBe(12)
  })

  it("exposes line as undefined when the constructor argument is omitted", () => {
    // The exactOptionalPropertyTypes asymmetry: the argument is `line?: number` while the
    // field is `number | undefined`. That must hold at runtime, not only in the type.
    const err = new LoadFeatureError({
      reason: "MissingFile",
      uri: "features/absent.feature",
      message: "no such file"
    })
    expect(err.line).toBeUndefined()
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

  it("exposes cause as the supplied value", () => {
    const upstream = new Error("(1:1): expected: #EOF, got 'Feture: x'")
    const err = new LoadFeatureError({
      reason: "ParseFailed",
      uri: "features/typo.feature",
      line: 1,
      message: "the parser rejected this file",
      cause: upstream
    })
    expect(err.cause).toBe(upstream)
  })

  it("exposes cause as undefined when the constructor argument is omitted", () => {
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

  it("round-trips the warning line when supplied", () => {
    expect(warning.line).toBe(9)
  })

  it("normalises an omitted warning line to undefined", () => {
    const noLine = makeWarning({
      reason: "EmptyRule",
      uri: "features/empty-rule.feature",
      message: "this Rule contains no Scenarios and produced no pickles"
    })
    expect(noLine.line).toBeUndefined()
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
      parameterTypeName: "money",
      pattern: "the customer {word} pays {money}",
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
      const err = new StepPatternError({ reason, message: `raised for ${reason}` })
      expect(err.reason).toBe(reason)
    })
  }

  it("round-trips the parameterTypeName when it is supplied", () => {
    expect(makeError().parameterTypeName).toBe("money")
  })

  it("round-trips the step pattern when it is supplied", () => {
    expect(makeError().pattern).toBe("the customer {word} pays {money}")
  })

  it("exposes parameterTypeName and pattern as undefined when both arguments are omitted", () => {
    // The exactOptionalPropertyTypes asymmetry: the constructor arguments are optional while
    // the fields are `string | undefined`, so both properties must EXIST on every instance and
    // answer the question rather than being absent.
    const err = new StepPatternError({
      reason: "InvalidParameterTypeDefinition",
      message: "the upstream ParameterType constructor rejected this definition"
    })

    expect(err.parameterTypeName).toBeUndefined()
    expect(err.pattern).toBeUndefined()
    expect("parameterTypeName" in err).toBe(true)
    expect("pattern" in err).toBe(true)
  })

  it("forwards the cause when a wrapped upstream error is supplied", () => {
    const upstream = new Error("This Cucumber Expression has a problem at column 7")
    const err = new StepPatternError({
      reason: "UndefinedParameterType",
      parameterTypeName: "money",
      pattern: "I pay {money}",
      message: "no parameter type named money is registered",
      cause: upstream
    })

    expect(err.cause).toBe(upstream)
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

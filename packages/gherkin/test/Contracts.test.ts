import { describe, expect, it } from "vitest"
import { LoadFeatureError, makeWarning } from "../src/Errors.ts"

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
    // Destructured rather than read as `err._tag`: `no-underscore-dangle` is error-level in
    // this repo for dotted member access, and allows object destructuring.
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

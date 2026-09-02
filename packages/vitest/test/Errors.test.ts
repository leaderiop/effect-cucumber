/**
 * Tests for `Errors`.
 *
 * Carries: ADR-EC-022, BEH-EC-013.
 */
import { describe, expect, it } from "@effect/vitest"
import * as Option from "effect/Option"
import { inspect } from "node:util"
import {
  type ExcludedScenariosNoticeReason,
  makeExcludedScenariosNotice,
  makeUndeclaredTagWarning,
  makeUnknownContainerWarning,
  makeUnusedStepDefinitionWarning,
  StepMatchError,
  type UndeclaredTagWarningReason,
  type UnusedStepDefinitionWarningReason
} from "../src/Errors.ts"

// Runs `action` and returns whatever it threw.
const thrownBy = (action: () => unknown): unknown => {
  try {
    action()
  } catch (error) {
    return error
  }
  throw new Error("expected the action to throw, but it returned normally")
}

// Exactly 4000 characters: a 40-character unit repeated 100 times.
const UNTRUNCATED_MESSAGE_LENGTH = 4000
const untruncatedMessage = "Given I have a very long step text \"x\"\n\n".repeat(100)

// Deliberately NOT in alphabetical order (`I…`, `A…`, `G…`).
const ambiguousPatterns = [
  "I have {int} cucumbers in my basket",
  "A user {string} logs in",
  "Given nothing at all happens"
]

// The constructor's argument type, named once so the omitted-key cast below reads as deliberate.
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
    message: untruncatedMessage
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
    message: untruncatedMessage
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

describe("StepMatchError, reason UndefinedStep", () => {
  it("is an instance of Error and of StepMatchError", () => {
    expect(undefinedStepError()).toBeInstanceOf(Error)
    expect(undefinedStepError()).toBeInstanceOf(StepMatchError)
  })

  it("carries the exact _tag the Plan stage discriminates on", () => {
    // Destructured rather than read by dotted member access: `no-underscore-dangle` is error-level in this repo for
    // member expressions, and allows object destructuring.
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

  it("round-trips the suggested snippet as Option.some of the supplied string", () => {
    expect(undefinedStepError().suggestion).toEqual(
      Option.some("Given(\"I have {int} cucumbers in my basket\", function*(count: number) {})")
    )
  })

  it("exposes line as Option.some of the supplied number", () => {
    expect(undefinedStepError().line).toEqual(Option.some(17))
  })

  it("reports matchedPatterns as an empty ARRAY, not an absent value", () => {
    // "no patterns matched" is genuinely a zero-length list, which is why the field is `Schema.Array` and not
    // `Schema.OptionFromUndefinedOr` — src/Errors.ts's field notes.
    expect(undefinedStepError().matchedPatterns).toEqual([])
  })
})

describe("StepMatchError, reason AmbiguousStep", () => {
  it("preserves matchedPatterns in the exact order supplied, applying no sort of its own", () => {
    // THE load-bearing assertion of this block.
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
    const withoutSuggestion = {
      reason: "UndefinedStep",
      uri: "features/checkout.feature",
      line: Option.none(),
      stepText: "I omit a required key",
      scenarioName: "omission",
      matchedPatterns: [],
      message: "suggestion was omitted"
    } as unknown as StepMatchErrorArgs

    const thrown = thrownBy(() => new StepMatchError(withoutSuggestion))
    expect(thrown).toBeInstanceOf(Error)
  })

  it("constructs with cause omitted, and exposes it as undefined", () => {
    const error = new StepMatchError({
      reason: "UndefinedStep",
      uri: "features/checkout.feature",
      line: Option.none(),
      stepText: "I omit the cause",
      scenarioName: "omission",
      matchedPatterns: [],
      suggestion: Option.none(),
      message: "cause was omitted"
    })
    expect(error.cause).toBeUndefined()
  })

  it("exposes cause natively, preserving reference equality and the inspected chain", () => {
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
      cause: upstream
    })
    expect(error.cause).toBe(upstream)
    expect(inspect(error)).toContain("the step body threw")
  })
})

describe("StepMatchError carries full, untruncated message content", () => {
  it("survives a 4000-character message with its length unchanged", () => {
    // Length, never a substring: a truncated message that keeps its prefix passes every `toContain` check ever
    // written.
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

describe("UnusedStepDefinitionWarning", () => {
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

// A single 1000-character tag, long enough that any plausible truncation cap sits inside it.
const LONG_TAG_LENGTH = 1000
const longTag = `@${"a".repeat(LONG_TAG_LENGTH - 1)}`

// ONE tag carrying BOTH of the characters a forged output line needs: a double quote to close this library's own
// quoting early, and a real newline to start what reads as a second warning line.
const forgingTag = "@wip\"\n⚠ unused step definition: Then \"forged\""

// The exact rendered length of `undeclaredWarning()`'s message, hard-coded — see this module's doc comment.
const UNDECLARED_MESSAGE_LENGTH = 1396

// The exact rendered length of `bothFiltersNotice()`'s message, hard-coded for the same reason.
const BOTH_FILTERS_MESSAGE_LENGTH = 1286

const undeclaredWarning = () =>
  makeUndeclaredTagWarning({
    uri: "features/checkout.feature",
    scenarioName: "a shopper fills a basket",
    tags: ["@slow", longTag]
  })

const forgingUndeclaredWarning = () =>
  makeUndeclaredTagWarning({
    uri: "features/checkout.feature",
    scenarioName: "a shopper fills a basket",
    tags: [forgingTag]
  })

const includeOnlyNotice = () =>
  makeExcludedScenariosNotice({
    featureName: "Checkout",
    uri: "features/checkout.feature",
    count: 3,
    includeTags: ["@slow"],
    excludeTags: []
  })

const excludeOnlyNotice = () =>
  makeExcludedScenariosNotice({
    featureName: "Checkout",
    uri: "features/checkout.feature",
    count: 2,
    includeTags: [],
    excludeTags: ["@wip"]
  })

const bothFiltersNotice = () =>
  makeExcludedScenariosNotice({
    featureName: "Checkout",
    uri: "features/checkout.feature",
    count: 3,
    includeTags: ["@slow"],
    excludeTags: [longTag]
  })

const forgingNotice = () =>
  makeExcludedScenariosNotice({
    featureName: "Checkout",
    uri: "features/checkout.feature",
    count: 1,
    includeTags: [],
    excludeTags: [forgingTag]
  })

describe("UndeclaredTagWarning", () => {
  it("carries the exact _tag and the one reason member", () => {
    const { _tag } = undeclaredWarning()
    const reason: UndeclaredTagWarningReason = "UndeclaredTag"
    expect(_tag).toBe("UndeclaredTagWarning")
    expect(undeclaredWarning().reason).toBe(reason)
  })

  it("is plain data, not an Error subclass", () => {
    // src/Errors.ts note (c): the upstream event is a throw, but this is what the catch produces.
    expect(undeclaredWarning()).not.toBeInstanceOf(Error)
  })

  it("round-trips uri, scenarioName and the Scenario's whole tag list unchanged", () => {
    const warning = undeclaredWarning()
    expect(warning.uri).toBe("features/checkout.feature")
    expect(warning.scenarioName).toBe("a shopper fills a basket")
    expect(warning.tags).toEqual(["@slow", longTag])
  })

  it("stores no field carrying the caught framework error's own text", () => {
    // src/Errors.ts note (f), second half: upstream prose never becomes this library's contract.
    expect(Object.keys(undeclaredWarning())).toEqual([
      "_tag",
      "reason",
      "uri",
      "scenarioName",
      "tags",
      "message"
    ])
  })

  it("renders a message of exactly the expected length, truncating nothing", () => {
    // Mutation D fails exactly here.
    expect(undeclaredWarning().message.length).toBe(UNDECLARED_MESSAGE_LENGTH)
    expect(undeclaredWarning().message).toContain(longTag)
  })

  it("names the file, the Scenario and every tag the Scenario carried", () => {
    const { message } = undeclaredWarning()
    expect(message).toContain(JSON.stringify("features/checkout.feature"))
    expect(message).toContain(JSON.stringify("a shopper fills a basket"))
    expect(message).toContain(JSON.stringify("@slow"))
    expect(message).toContain(JSON.stringify(longTag))
  })

  it("says at least one of the listed tags is undeclared, never that all of them are", () => {
    // The producer is handed the Scenario's WHOLE tag list and cannot compute the offending subset without reading
    // the framework's message, which describeFeature.ts's adapter refuses to do by design.
    const { message } = undeclaredWarning()
    expect(message).toContain("at least one of which")
    expect(message).not.toContain("tag(s) this project's vitest config does not declare")
  })

  it("says the Scenario still ran and was emitted untagged, and points at the tag docs", () => {
    // Without both facts the obvious reading is "my Scenario was skipped", which is the one thing that did not
    // happen.
    const { message } = undeclaredWarning()
    expect(message).toContain("still ran")
    expect(message).toContain("UNTAGGED")
    expect(message).toContain("--tagsFilter")
    expect(message.endsWith("https://vitest.dev/guide/test-tags")).toBe(true)
  })

  it("adds no ellipsis and caps no tag list", () => {
    const manyTags = Array.from({ length: 50 }, (_, index) => `@tag-${index}`)
    const { message } = makeUndeclaredTagWarning({
      uri: "features/checkout.feature",
      scenarioName: "a shopper fills a basket",
      tags: manyTags
    })
    for (const tag of manyTags) {
      expect(message).toContain(JSON.stringify(tag))
    }
    expect(message.includes("…")).toBe(false)
  })

  it("escapes a tag containing a quote and a newline instead of letting it forge a second line", () => {
    // Mutation C fails exactly here.
    // visibly inside a quoted span rather than at the start of one.
    const { message } = forgingUndeclaredWarning()
    expect(message).toContain(JSON.stringify(forgingTag))
    expect(message.includes("\n")).toBe(false)
    expect(message).not.toContain(forgingTag)
  })
})

describe("ExcludedScenariosNotice derives its reason from the two arrays", () => {
  it("reports ExcludedByIncludeTags when only includeTags is non-empty", () => {
    const reason: ExcludedScenariosNoticeReason = "ExcludedByIncludeTags"
    expect(includeOnlyNotice().reason).toBe(reason)
  })

  it("reports ExcludedByExcludeTags when only excludeTags is non-empty", () => {
    const reason: ExcludedScenariosNoticeReason = "ExcludedByExcludeTags"
    expect(excludeOnlyNotice().reason).toBe(reason)
  })

  it("reports ExcludedByBothTagFilters when both are non-empty", () => {
    // Mutation E fails exactly here while the other two arms still pass, which is why each
    // combination has its own named test.
    const reason: ExcludedScenariosNoticeReason = "ExcludedByBothTagFilters"
    expect(bothFiltersNotice().reason).toBe(reason)
  })

  it("names the derived reason in the message, so the derivation is observable in the terminal", () => {
    expect(includeOnlyNotice().message).toContain("ExcludedByIncludeTags")
    expect(excludeOnlyNotice().message).toContain("ExcludedByExcludeTags")
    expect(bothFiltersNotice().message).toContain("ExcludedByBothTagFilters")
  })
})

describe("ExcludedScenariosNotice content", () => {
  it("carries the exact _tag", () => {
    const { _tag } = includeOnlyNotice()
    expect(_tag).toBe("ExcludedScenariosNotice")
  })

  it("is plain data, not an Error subclass", () => {
    expect(includeOnlyNotice()).not.toBeInstanceOf(Error)
  })

  it("round-trips featureName, uri, count and both tag arrays unchanged", () => {
    const notice = bothFiltersNotice()
    expect(notice.featureName).toBe("Checkout")
    expect(notice.uri).toBe("features/checkout.feature")
    expect(notice.count).toBe(3)
    expect(notice.includeTags).toEqual(["@slow"])
    expect(notice.excludeTags).toEqual([longTag])
  })

  it("renders a message of exactly the expected length, truncating nothing", () => {
    // Mutation D fails exactly here.
    expect(bothFiltersNotice().message.length).toBe(BOTH_FILTERS_MESSAGE_LENGTH)
    expect(bothFiltersNotice().message).toContain(longTag)
  })

  it("names the count, the Feature and the file, and says the Scenarios were never registered", () => {
    // "excluded" alone reads as "skipped" to anyone used to `@skip`, and a skipped test at least
    // appears in the reporter.
    const { message } = excludeOnlyNotice()
    expect(message).toContain("2 Scenario(s)")
    expect(message).toContain(JSON.stringify("Checkout"))
    expect(message).toContain(JSON.stringify("features/checkout.feature"))
    expect(message).toContain("never registered")
  })

  it("names only the option that was in play, and both when both were", () => {
    expect(includeOnlyNotice().message).toContain("includeTags")
    expect(includeOnlyNotice().message).not.toContain("excludeTags")
    expect(excludeOnlyNotice().message).not.toContain("includeTags")
    expect(excludeOnlyNotice().message).toContain("excludeTags")
    expect(bothFiltersNotice().message).toContain("includeTags")
    expect(bothFiltersNotice().message).toContain("excludeTags")
  })

  it("escapes a tag containing a quote and a newline instead of letting it forge a second line", () => {
    // Mutation C fails exactly here too — the same control, on the second factory.
    const { message } = forgingNotice()
    expect(message).toContain(JSON.stringify(forgingTag))
    expect(message.includes("\n")).toBe(false)
    expect(message).not.toContain(forgingTag)
  })
})

describe("UnknownContainerWarning", () => {
  it("quotes the file, the name and every known name, and says none when nothing is known", () => {
    const withKnown = makeUnknownContainerWarning({
      uri: "features/a \"quoted\".feature",
      kind: "Scenario",
      name: "Creating a usr",
      ruleName: "Limits",
      known: ["Over the limit", "line\nbreak"]
    })
    const { _tag, reason } = withKnown
    expect(_tag).toBe("UnknownContainerWarning")
    expect(reason).toBe("UnknownContainer")
    expect(withKnown).not.toBeInstanceOf(Error)
    expect(withKnown.message).toContain(
      "\"features/a \\\"quoted\\\".feature\": UnknownContainer: no Scenario named \"Creating a usr\" exists in this Feature inside Rule \"Limits\" (known: \"Over the limit\", \"line\\nbreak\")"
    )
    const withoutKnown = makeUnknownContainerWarning({
      uri: "f.feature",
      kind: "Rule",
      name: "Limts",
      ruleName: null,
      known: []
    })
    expect(withoutKnown.message).toContain("no Rule named \"Limts\" exists in this Feature (known: none)")
    expect(withoutKnown.message).toContain("steps, Background and hooks")
  })
})

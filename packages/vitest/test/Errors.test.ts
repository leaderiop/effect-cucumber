/**
 * MATCH-03/04/05's two data shapes plus RUN-05's two collection-time notices, proven to construct
 * under `effect@4.0.0-rc.112`'s real constraints and to carry full, unmodified content.
 *
 * `StepMatchError` and `UnusedStepDefinitionWarning` take their `message` from the caller, so their
 * blocks assert that the string SURVIVES. `UndeclaredTagWarning` and `ExcludedScenariosNotice`
 * BUILD theirs, so their blocks assert two further things the first two cannot: that every
 * author-controlled component is `JSON.stringify`'d on the way in (`src/Errors.ts` note (f)), and
 * that `makeExcludedScenariosNotice` DERIVES its `reason` from the two tag arrays rather than
 * accepting one that could disagree with them.
 *
 * Five of the assertions below are written more strictly than they look like they need to be,
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
 * - **The two BUILT messages are pinned to a hard-coded total length, not to a lower bound.** They
 *   are assembled by their factories rather than supplied, so "did it survive" is not a question that
 *   can be asked of them — the only way note (d)'s no-truncation policy is enforceable on a built
 *   string is an exact character count against a fixture carrying a 1000-character tag. Those two
 *   numbers change whenever the wording changes, and that is the intended cost: a reworded message is
 *   a deliberate edit and a truncated one is not.
 *
 * - **The forging assertions use ONE fixture tag carrying both a `"` and a real newline.** Splitting
 *   them into two tags would let an escaping bug that handles quotes but not newlines pass half the
 *   suite; a single tag carrying both makes the message either fully escaped or visibly wrong.
 *
 * Mutation-tested (each performed, then reverted, each confirmed failing):
 * - A. A `.slice(0, 200)` is introduced at the one construction site `src/Errors.ts` currently has
 *      — `makeUnusedStepDefinitionWarning`'s `message` — → the 4000-character length assertion on
 *      the warning fails. `StepMatchError` has no construction site in src yet (its plain-optionals
 *      factory is `Plan.ts`'s, plan 06-04), which is why the identical length assertion is pinned
 *      on the error here too: it is already waiting for that factory before the factory exists.
 * - B. `makeUnusedStepDefinitionWarning` returns `Option.some(args.definedAt)` unconditionally
 *      instead of `Option.fromUndefinedOr(args.definedAt)` → the omitted-`definedAt` test fails
 *      (`Option.some(undefined)` is not `Option.none()`).
 * - C. `quotedList` drops its `.map(quoted)` and joins the raw tag strings → 6 failures, both
 *      forging tests among them: the escaped form is absent and a raw newline appears in the
 *      message.
 * - D. `quoted` gains a `.slice(0, 200)` → 3 failures, both exact-length assertions among them.
 * - E. `excludedScenariosNoticeReason` returns `"ExcludedByIncludeTags"` whenever `includeTags` is
 *      non-empty (dropping the both-arrays arm) → 4 failures, the `ExcludedByBothTagFilters`
 *      derivation test among them, while the OTHER TWO derivation tests still pass — which is why
 *      all three combinations have their own named test rather than one parameterised sweep.
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
  type ExcludedScenariosNoticeReason,
  makeExcludedScenariosNotice,
  makeUndeclaredTagWarning,
  makeUnusedStepDefinitionWarning,
  StepMatchError,
  type UndeclaredTagWarningReason,
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

/**
 * A single 1000-character tag, long enough that any plausible truncation cap sits inside it.
 *
 * `@` plus 999 `a`s rather than a random string: the messages below are pinned by exact character
 * count, so the fixture has to be reproducible from its own definition.
 */
const LONG_TAG_LENGTH = 1000
const longTag = `@${"a".repeat(LONG_TAG_LENGTH - 1)}`

/**
 * ONE tag carrying BOTH of the characters a forged output line needs: a double quote to close this
 * library's own quoting early, and a real newline to start what reads as a second warning line. The
 * `⚠` prefix is `Runner.ts`'s own warning marker, so an unescaped render would be indistinguishable
 * from output this library really produced (threats T-06-06-01 / T-06-07-01).
 *
 * Split across two tags it would let a half-correct escaping bug pass half the suite.
 */
const forgingTag = "@wip\"\n⚠ unused step definition: Then \"forged\""

/**
 * The exact rendered length of `undeclaredWarning()`'s message, hard-coded — see this module's doc
 * comment. Any truncation, cap or ellipsis on the construction path moves it.
 */
const UNDECLARED_MESSAGE_LENGTH = 1396

/**
 * The exact rendered length of `bothFiltersNotice()`'s message, hard-coded for the same reason.
 */
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

describe("UndeclaredTagWarning (RUN-05, D-08)", () => {
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
    // Asserted structurally, since there is no wording to assert the absence of.
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
    // Mutation D fails exactly here. Length, never a substring — a truncated message that keeps its
    // prefix passes every `toContain` check ever written.
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
    // The producer is handed the Scenario's WHOLE tag list and cannot compute the offending subset
    // without reading the framework's message, which describeFeature.ts's adapter refuses to do by
    // design. The earlier wording claimed every listed tag was undeclared, which sent a reader off
    // to declare tags that were already declared. This assertion is what pins the honest claim.
    const { message } = undeclaredWarning()
    expect(message).toContain("at least one of which")
    expect(message).not.toContain("tag(s) this project's vitest config does not declare")
  })

  it("says the Scenario still ran and was emitted untagged, and points at the tag docs", () => {
    // Without both facts the obvious reading is "my Scenario was skipped", which is the one thing
    // that did not happen.
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
    // Mutation C fails exactly here. `JSON.stringify` renders the quote as `\"` and the newline as
    // the two characters `\` and `n`, so the message stays one line and the forged `⚠` prefix is
    // visibly inside a quoted span rather than at the start of one.
    const { message } = forgingUndeclaredWarning()
    expect(message).toContain(JSON.stringify(forgingTag))
    expect(message.includes("\n")).toBe(false)
    expect(message).not.toContain(forgingTag)
  })
})

describe("ExcludedScenariosNotice derives its reason from the two arrays (RUN-05, D-10)", () => {
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

describe("ExcludedScenariosNotice content (RUN-05, D-10)", () => {
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

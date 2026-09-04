/**
 * BEH-EC-008's pure half: the two reserved tag constants and the registration-time filter's exact semantics, asserted
 * with no framework, no Layer and no `.feature` file in scope — `Tags.ts` imports nothing, so its tests need nothing
 * either.
 *
 * Carries: BEH-EC-008.
 */
import { assert, describe, expect, it } from "@effect/vitest"
import {
  isRetried,
  isSkipped,
  makeTagFilter,
  noTagFilter,
  onlyTag,
  readScenarioTimeoutTag,
  retryTag,
  shouldEmit,
  skipTag
} from "../src/Tags.ts"

// A Scenario carrying nothing — the case an over-eager include half silently deletes.
const noTags: ReadonlyArray<string> = []

describe("the reserved tag constants keep their literal @ prefix", () => {
  it("skipTag is exactly \"@skip\", prefix included", () => {
    expect(skipTag).toBe("@skip")
  })

  it("onlyTag is exactly \"@only\", prefix included", () => {
    // The prefix is the contract, not decoration: it is the string a `--tagsFilter '@only'` invocation has to match,
    // and it is what `ParsedScenario.tags` actually contains.
    expect(onlyTag).toBe("@only")
  })

  it("the two reserved tags are distinct strings", () => {
    expect(skipTag).not.toBe(onlyTag)
  })

  it("retryTag is exactly \"@retry\", prefix included", () => {
    expect(retryTag).toBe("@retry")
  })

  it("all three reserved tags are pairwise distinct strings", () => {
    expect(retryTag).not.toBe(skipTag)
    expect(retryTag).not.toBe(onlyTag)
  })
})

describe("noTagFilter filters nothing", () => {
  it("is true for a tagged Scenario", () => {
    expect(shouldEmit(noTagFilter, ["@slow"])).toBe(true)
  })

  it("is true for a Scenario with no tags at all", () => {
    expect(shouldEmit(noTagFilter, noTags)).toBe(true)
  })

  it("holds both of its arrays empty", () => {
    expect(noTagFilter).toStrictEqual({ include: [], exclude: [] })
  })
})

describe("an empty or absent filter array means NO FILTER, never \"match nothing\"", () => {
  it("makeTagFilter({}) emits every Scenario, including one with no tags at all", () => {
    const filter = makeTagFilter({})
    expect(shouldEmit(filter, noTags)).toBe(true)
    expect(shouldEmit(filter, ["@slow"])).toBe(true)
  })

  it("an explicitly EMPTY includeTags emits every Scenario, never none of them", () => {
    // The whole-suite-deletion case: a consumer computed `includeTags` from a variable that came out empty.
    const filter = makeTagFilter({ includeTags: [] })
    expect(shouldEmit(filter, noTags)).toBe(true)
    expect(shouldEmit(filter, ["@slow"])).toBe(true)
  })

  it("an explicitly EMPTY excludeTags silences nothing", () => {
    const filter = makeTagFilter({ excludeTags: [] })
    expect(shouldEmit(filter, noTags)).toBe(true)
    expect(shouldEmit(filter, ["@wip"])).toBe(true)
  })

  it("an explicitly undefined pair normalises to the same two empty arrays noTagFilter holds", () => {
    expect(makeTagFilter({ includeTags: undefined, excludeTags: undefined })).toStrictEqual(noTagFilter)
  })
})

describe("includeTags restricts registration to a tag set", () => {
  it("emits a Scenario carrying an included tag", () => {
    expect(shouldEmit(makeTagFilter({ includeTags: ["@slow"] }), ["@slow"])).toBe(true)
  })

  it("does not emit a Scenario carrying only some OTHER tag", () => {
    expect(shouldEmit(makeTagFilter({ includeTags: ["@slow"] }), ["@wip"])).toBe(false)
  })

  it("does not emit a Scenario with no tags at all", () => {
    expect(shouldEmit(makeTagFilter({ includeTags: ["@slow"] }), noTags)).toBe(false)
  })

  it("emits a Scenario carrying ANY ONE of several included tags", () => {
    expect(shouldEmit(makeTagFilter({ includeTags: ["@slow", "@wip"] }), ["@wip"])).toBe(true)
  })
})

describe("excludeTags removes a tag set", () => {
  it("does not emit a Scenario carrying an excluded tag", () => {
    expect(shouldEmit(makeTagFilter({ excludeTags: ["@wip"] }), ["@wip"])).toBe(false)
  })

  it("emits a Scenario carrying only some other tag", () => {
    expect(shouldEmit(makeTagFilter({ excludeTags: ["@wip"] }), ["@slow"])).toBe(true)
  })

  it("does not emit a Scenario carrying an excluded tag alongside unexcluded ones", () => {
    expect(shouldEmit(makeTagFilter({ excludeTags: ["@wip"] }), ["@slow", "@wip"])).toBe(false)
  })
})

describe("the two halves compose", () => {
  it("a tag named in BOTH arrays excludes — exclude wins the conflict", () => {
    // Exclude is its own conjunct, not a fallback the include half can short-circuit.
    const filter = makeTagFilter({ includeTags: ["@slow"], excludeTags: ["@slow"] })
    expect(shouldEmit(filter, ["@slow"])).toBe(false)
  })

  it("a Scenario must survive both halves, not either one", () => {
    const filter = makeTagFilter({ includeTags: ["@slow"], excludeTags: ["@wip"] })
    expect(shouldEmit(filter, ["@slow"])).toBe(true)
    expect(shouldEmit(filter, ["@slow", "@wip"])).toBe(false)
    expect(shouldEmit(filter, ["@wip"])).toBe(false)
  })
})

describe("a tag repeated in the Scenario's own array is inert", () => {
  it("emits identically whether an included tag appears once or twice", () => {
    // `ParsedScenario.tags` is a flattened inheritance chain, so a tag written on BOTH a Feature and one of its
    // Scenarios really does appear twice.
    const filter = makeTagFilter({ includeTags: ["@slow"] })
    expect(shouldEmit(filter, ["@slow", "@slow"])).toBe(shouldEmit(filter, ["@slow"]))
    expect(shouldEmit(filter, ["@slow", "@slow"])).toBe(true)
  })

  it("excludes identically whether an excluded tag appears once or twice", () => {
    const filter = makeTagFilter({ excludeTags: ["@wip"] })
    expect(shouldEmit(filter, ["@wip", "@wip"])).toBe(false)
  })

  it("a tag repeated in the FILTER's own array is inert too", () => {
    expect(shouldEmit(makeTagFilter({ includeTags: ["@slow", "@slow"] }), ["@slow"])).toBe(true)
  })
})

describe("matching is exact-string and case-sensitive (the Cucumber convention)", () => {
  it("includeTags: [\"@slow\"] does not match a Scenario tagged \"@Slow\"", () => {
    expect(shouldEmit(makeTagFilter({ includeTags: ["@slow"] }), ["@Slow"])).toBe(false)
  })

  it("excludeTags: [\"@wip\"] does not exclude a Scenario tagged \"@WIP\"", () => {
    expect(shouldEmit(makeTagFilter({ excludeTags: ["@wip"] }), ["@WIP"])).toBe(true)
  })

  it("a filter tag is not a PREFIX match either", () => {
    expect(shouldEmit(makeTagFilter({ includeTags: ["@wip"] }), ["@wip-only"])).toBe(false)
  })
})

describe("isSkipped recognises exactly the reserved @skip tag", () => {
  it("is true for a Scenario tagged @skip", () => {
    expect(isSkipped([skipTag])).toBe(true)
  })

  it("is true when @skip sits among other tags", () => {
    expect(isSkipped(["@slow", "@skip", "@wip"])).toBe(true)
  })

  it("is false for @skipped — not a prefix match", () => {
    expect(isSkipped(["@skipped"])).toBe(false)
  })

  it("is false for @SKIP — not a case-insensitive match", () => {
    expect(isSkipped(["@SKIP"])).toBe(false)
  })

  it("is false for a Scenario with no tags at all", () => {
    expect(isSkipped(noTags)).toBe(false)
  })

  it("is false for @only — the other reserved tag is deliberately inert", () => {
    expect(isSkipped([onlyTag])).toBe(false)
  })
})

describe("isRetried recognises exactly the reserved @retry tag (ADR-EC-034, BEH-EC-026)", () => {
  it("is true for a Scenario tagged @retry", () => {
    expect(isRetried([retryTag])).toBe(true)
  })

  it("is true when @retry sits among other tags", () => {
    expect(isRetried(["@slow", retryTag, "@wip"])).toBe(true)
  })

  it("is false for @retried — not a prefix match", () => {
    expect(isRetried(["@retried"])).toBe(false)
  })

  it("is false for @RETRY — not a case-insensitive match", () => {
    expect(isRetried(["@RETRY"])).toBe(false)
  })

  it("is false for a Scenario with no tags at all", () => {
    expect(isRetried(noTags)).toBe(false)
  })

  it("is false for @skip or @only — the other two reserved tags are independent of this one", () => {
    expect(isRetried([skipTag])).toBe(false)
    expect(isRetried([onlyTag])).toBe(false)
  })
})

describe("readScenarioTimeoutTag reads @timeout-<ms> (ADR-EC-040, BEH-EC-032)", () => {
  it("is null for a Scenario with no tags at all", () => {
    expect(readScenarioTimeoutTag(noTags)).toBe(null)
  })

  it("is null when no @timeout-* tag is present", () => {
    expect(readScenarioTimeoutTag(["@slow", retryTag, skipTag])).toBe(null)
  })

  it("reads the numeric suffix as milliseconds", () => {
    expect(readScenarioTimeoutTag(["@timeout-5000"])).toBe(5000)
  })

  it("reads it alongside unrelated tags, in either position", () => {
    expect(readScenarioTimeoutTag(["@slow", "@timeout-100", "@wip"])).toBe(100)
  })

  it("keeps the LAST occurrence — the most specific declaration (closer to the Scenario) wins over an inherited one", () => {
    // Mirrors the Feature/Rule/Scenario/Examples flattening order (ADR-EC-026): an earlier, inherited
    // @timeout-* is overridden by a later, more specific one in the SAME array.
    expect(readScenarioTimeoutTag(["@timeout-5000", "@timeout-100"])).toBe(100)
  })

  it("throws a located Error for @timeout with no numeric suffix at all", () => {
    assert.throws(() => readScenarioTimeoutTag(["@timeout"]), /Malformed @timeout tag/)
  })

  it("throws for a non-numeric suffix", () => {
    assert.throws(() => readScenarioTimeoutTag(["@timeout-abc"]), /Malformed @timeout tag/)
  })

  it("throws for the old parenthesised shape — a real, previously-considered format this tag deliberately does NOT accept (ADR-EC-040)", () => {
    assert.throws(() => readScenarioTimeoutTag(["@timeout(5000)"]), /Malformed @timeout tag/)
  })

  it("throws for a zero milliseconds value", () => {
    assert.throws(() => readScenarioTimeoutTag(["@timeout-0"]), /must be a positive integer/)
  })

  it("throws for any other tag starting with the reserved \"@timeout\" prefix — a deliberately wide net, not a narrow one, since a near-miss like this is far more likely to be a typo of the reserved tag than an unrelated custom tag someone chose to prefix identically", () => {
    assert.throws(() => readScenarioTimeoutTag(["@timeoutish"]), /Malformed @timeout tag/)
  })
})

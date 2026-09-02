/**
 * BEH-EC-008's pure half: the two reserved tag constants and the registration-time filter's exact semantics, asserted
 * with no framework, no Layer and no `.feature` file in scope — `Tags.ts` imports nothing, so its tests need nothing
 * either.
 *
 * Carries: BEH-EC-008.
 */
import { describe, expect, it } from "@effect/vitest"
import { isSkipped, makeTagFilter, noTagFilter, onlyTag, shouldEmit, skipTag } from "../src/Tags.ts"

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

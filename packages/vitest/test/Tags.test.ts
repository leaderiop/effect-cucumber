/**
 * BEH-EC-008's pure half: the two reserved tag constants and the registration-time filter's exact
 * semantics, asserted with no framework, no Layer and no `.feature` file in scope — `Tags.ts` imports
 * nothing, so its tests need nothing either.
 *
 * The load-bearing claim in this file is the EMPTY-ARRAY one. D-03 makes a filtered-out Scenario never
 * become a test node at all, so an `includeTags`/`excludeTags` half that read `[]` as "match nothing"
 * would delete a whole suite behind a GREEN run — zero tests emitted and zero tests failed are
 * indistinguishable in a reporter. That is why three separate named tests below assert the empty and
 * absent forms rather than one parameterised sweep: each names the shape of the caller mistake it
 * defends against, and each has to be readable in a failure report on its own.
 *
 * Mutation-tested (each performed, run, then reverted; observed counts recorded):
 * - A. `shouldEmit`'s include half reduced from `filter.include.length === 0 || …` to the `some(…)`
 *      alone → 7 failures, among them "makeTagFilter({}) emits every Scenario, including one with no
 *      tags at all", "an explicitly EMPTY includeTags emits every Scenario, never none of them" and
 *      "an explicitly EMPTY excludeTags silences nothing". This is the proof the empty-array
 *      assertions are not vacuous.
 * - B. exclude made a FALLBACK rather than a conjunct (`… .some(…) || !… .some(…)`, so an include
 *      match short-circuits the exclude half) → 6 failures, among them "a tag named in BOTH arrays
 *      excludes — exclude wins the conflict" and "a Scenario must survive both halves, not either
 *      one".
 * - C. both `includes` calls replaced with a `toLowerCase()` comparison → 2 failures, exactly the two
 *      case-sensitivity tests, and NOTHING else — which is why those two exist as their own tests
 *      rather than as extra assertions folded into a neighbour.
 * - D. `isSkipped` replaced with `tags.some((tag) => tag.startsWith(skipTag))` → 1 failure, "is false
 *      for @skipped — not a prefix match". The `@SKIP` test does not catch this one, so neither test
 *      is redundant.
 *
 * ## Imports
 *
 * `../src/Tags.ts` directly, never `../src/index.ts` — `effect/no-import-from-barrel-package` runs
 * with `checkRelativeIndexImports: true`. `@effect/vitest` is the one `@effect/*` package that same
 * rule exempts. Nothing from `effect/*` is needed: every value under test is plain data.
 */
import { describe, expect, it } from "@effect/vitest"
import { isSkipped, makeTagFilter, noTagFilter, onlyTag, shouldEmit, skipTag } from "../src/Tags.ts"

/** A Scenario carrying nothing — the case an over-eager include half silently deletes. */
const noTags: ReadonlyArray<string> = []

describe("the reserved tag constants keep their literal @ prefix (D-04)", () => {
  it("skipTag is exactly \"@skip\", prefix included", () => {
    expect(skipTag).toBe("@skip")
  })

  it("onlyTag is exactly \"@only\", prefix included", () => {
    // The prefix is the contract, not decoration: it is the string a `--tagsFilter '@only'`
    // invocation has to match, and it is what `ParsedScenario.tags` actually contains.
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
    // The whole-suite-deletion case: a consumer computed `includeTags` from a variable that came out
    // empty. Reading `[]` as "match nothing" would emit zero tests and report a green run.
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
    // Exclude is its own conjunct, not a fallback the include half can short-circuit. An author who
    // wrote the same tag into both lists has contradicted themselves, and the safe reading of a
    // contradiction is the one that runs FEWER tests — visible in a test count.
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
    // `ParsedScenario.tags` is a flattened inheritance chain, so a tag written on BOTH a Feature and
    // one of its Scenarios really does appear twice. Membership, never occurrence counting.
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

describe("isSkipped recognises exactly the reserved @skip tag (D-05)", () => {
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

  it("is false for @only — the other reserved tag is deliberately inert (D-06)", () => {
    expect(isSkipped([onlyTag])).toBe(false)
  })
})

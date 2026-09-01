import * as path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { gherkinTags } from "../src/GherkinTags.ts"

/**
 * The pattern prefix every test below builds on, derived rather than hardcoded — and the derivation
 * is the point.
 *
 * `gherkinTags` resolves a pattern against `process.cwd()` (GherkinTags.ts note (e)), while this
 * repo's fixture-locating precedent — `packages/gherkin/test/Parser.test.ts` — yields an ABSOLUTE
 * path from `import.meta.url`. Those two only agree once the absolute path is made relative to the
 * runner's own working directory, which is what `path.relative` does here; the `split`/`join` pair
 * normalises Windows separators back to the `/` a glob needs.
 *
 * A hardcoded `packages/vitest/test/fixtures/**\/*.feature` would work from the repo root and match
 * NOTHING if the suite were ever run with `packages/vitest` as the cwd. That failure would be
 * invisible: a zero-match pattern deliberately returns `[]` instead of throwing (note (b)), so every
 * "excludes X" assertion below would still pass and every "includes X" one would have to be deleted
 * to keep the file green. Deriving the prefix is what stops this file from passing vacuously.
 */
const fixtures = path.relative(process.cwd(), fileURLToPath(new URL("./fixtures", import.meta.url)))
  .split(path.sep)
  .join("/")

/** Every tag written across the fixtures, sorted ascending, minus the DocStrings' decoys. */
const allFixtureTags = [
  "@fixture-alpha",
  "@fixture-beta",
  "@fixture-delta",
  "@fixture-docstring",
  "@fixture-epsilon",
  "@fixture-gamma",
  "@fixture-nested",
  "@fixture-nested-fence"
]

/** The same list without the tags only the nested-directory fixture carries. */
const topLevelFixtureTags = allFixtureTags.filter((name) => name !== "@fixture-nested")

const names = (tags: ReadonlyArray<{ readonly name: string }>): ReadonlyArray<string> => tags.map((tag) => tag.name)

describe("gherkinTags", () => {
  it("expands a globstar pattern into every tag in the tree, sorted and de-duplicated", () => {
    const result = gherkinTags(`${fixtures}/**/*.feature`)

    // Exact equality, not `toContain`: a scan that returned every token in the file would satisfy a
    // containment assertion while being useless. The list is also the sort/dedup proof — the fixtures
    // write `@fixture-alpha` in two different files and `@fixture-beta @fixture-gamma` on one line.
    expect(names(result)).toEqual(allFixtureTags)
  })

  it("excludes a DocString's @-leading line, which is prose rather than a tag line", () => {
    const result = names(gherkinTags(`${fixtures}/tag-scan-docstring.feature`))

    expect(result).not.toContain("@fixture-not-a-tag")
    // The same file's real Feature tag IS collected, so the exclusion above is fence tracking rather
    // than the file being skipped wholesale.
    expect(result).toEqual(["@fixture-docstring"])
  })

  it("closes a DocString only on the SAME fence that opened it, not on an embedded fence of the other kind", () => {
    // Regression for a real bug: treating "\"\"\"" and "```" as interchangeable toggles desyncs the
    // scanner's in/out-of-DocString state on any DocString containing an odd count of the OTHER
    // fence's lines, silently dropping every @tag for the rest of the file. This fixture's DocString
    // is opened with """ and contains four bare ``` lines (an even count on its own, but each one
    // toggled a shared boolean under the old implementation, so the state was wrong by the real closer).
    const result = names(gherkinTags(`${fixtures}/tag-scan-docstring-nested-fence.feature`))

    expect(result).toEqual(["@fixture-nested-fence"])
  })

  it("honours the pattern: a single-star pattern does not reach the nested fixture", () => {
    const recursive = names(gherkinTags(`${fixtures}/**/*.feature`))
    const flat = names(gherkinTags(`${fixtures}/*.feature`))

    expect(recursive).toContain("@fixture-nested")
    expect(flat).not.toContain("@fixture-nested")
    expect(flat).toEqual(topLevelFixtureTags)
  })

  it("returns only the named file's tags when the pattern names one file", () => {
    expect(names(gherkinTags(`${fixtures}/tag-scan-a.feature`))).toEqual([
      "@fixture-alpha",
      "@fixture-beta",
      "@fixture-delta",
      "@fixture-epsilon",
      "@fixture-gamma"
    ])
  })

  it("returns the union of an array of patterns, sorted and de-duplicated", () => {
    const result = names(gherkinTags([
      `${fixtures}/tag-scan-a.feature`,
      `${fixtures}/tag-scan-nested/**/*.feature`
    ]))

    // `@fixture-alpha` is written in BOTH matched files, so a union that did not de-duplicate would
    // return it twice and fail here.
    expect(result).toEqual([
      "@fixture-alpha",
      "@fixture-beta",
      "@fixture-delta",
      "@fixture-epsilon",
      "@fixture-gamma",
      "@fixture-nested"
    ])
  })

  it("returns an empty array, without throwing, for a well-formed pattern that matches nothing", () => {
    expect(gherkinTags(`${fixtures}/no-such-directory/**/*.feature`)).toEqual([])
  })

  it("throws, naming gherkinTags, on an empty string", () => {
    expect(() => gherkinTags("")).toThrow(/gherkinTags/)
  })

  it("throws, naming gherkinTags, on an empty array", () => {
    expect(() => gherkinTags([])).toThrow(/gherkinTags/)
  })

  it("resolves a relative pattern against options.cwd instead of process.cwd() when one is given", () => {
    const fixturesDir = fileURLToPath(new URL("./fixtures", import.meta.url))

    // `process.cwd()` is the repo root (or the package directory under `pnpm -r test`); neither
    // contains a top-level `tag-scan-a.feature`, so without `cwd` this pattern matches nothing.
    expect(gherkinTags("tag-scan-a.feature")).toEqual([])
    expect(names(gherkinTags("tag-scan-a.feature", { cwd: fixturesDir }))).toEqual([
      "@fixture-alpha",
      "@fixture-beta",
      "@fixture-delta",
      "@fixture-epsilon",
      "@fixture-gamma"
    ])
    // The recursive form agrees with the cwd-less scan of the same tree, so `cwd` changes the base
    // and nothing else.
    expect(names(gherkinTags("**/*.feature", { cwd: fixturesDir }))).toEqual(allFixtureTags)
  })

  it("is stable across calls — no cached state and no dependence on filesystem ordering", () => {
    const first = gherkinTags(`${fixtures}/**/*.feature`)
    const second = gherkinTags(`${fixtures}/**/*.feature`)

    expect(second).toEqual(first)
    // Distinct arrays, so the equality above is a re-scan agreeing rather than the same object twice.
    expect(second).not.toBe(first)
  })
})

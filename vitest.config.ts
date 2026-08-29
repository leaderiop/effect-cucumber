// The tag universe for this repository's own test suite.
//
// vitest validates every tag a test emits against the `test.tags` list below. RESEARCH Finding 1
// verified empirically against vitest 4.1.11 that emitting a tag this list does not declare throws
// at COLLECTION time and fails the WHOLE test file to `0 tests` — not just the one test. This file
// is therefore load-bearing infrastructure for every tag-emitting test in Phase 9, not polish.
//
// Five facts that are not visible from the code below:
//
// (a) `strictTags` is deliberately left at its default `true`, and is never written here. RESEARCH
//     Finding 1 verified that default empirically against vitest 4.1.11, both in source
//     (`strictTags: config.strictTags ?? true`) and via `vitest --help` (`(default: true)`). A
//     typo'd tag in a fixture must fail loudly in this repo, because that is exactly what a
//     consumer gets too. Turning it off is not a fix: RESEARCH Finding 2 verified that
//     `--tagsFilter` validates its pattern against `test.tags` REGARDLESS of that flag, so
//     disabling it silences the test side and leaves the filter side just as broken.
//
// (b) The `allowOnly` key is pinned off below so that every LOCAL run behaves like CI. vitest's own
//     default for it is `!isCI`, so without that line a committed `.only` would fail in GitHub
//     Actions and pass on a developer's machine — roadmap success criterion 3 would hold in CI and
//     be unverifiable locally. Accepted cost: a developer using `.only` locally must pass
//     `--allowOnly`. (The literal setting is written exactly once, below, so that an acceptance
//     grep counting it cannot be satisfied by this paragraph instead — STATE.md's 03-04 lesson.)
//
// (c) The two glob keys vitest uses to choose test files are deliberately ABSENT. Setting either is
//     the likeliest way to silently stop running some package's tests; omitting them preserves the
//     defaults every existing test file in this repo relies on. `pnpm test` reported 30 test files
//     and 645 tests both immediately before and immediately after this file first landed, which is
//     the empirical check RESEARCH assumption A5 asked for.
//
// (d) `@undeclared-on-purpose` is RESERVED and must NEVER be added to the list below. Plan 09-06
//     emits it from `packages/vitest/test/emission.test.ts` to prove the D-08 catch-and-degrade
//     path: the Scenario still runs untagged and a located warning prints, instead of the file
//     collecting zero tests. Declaring it here deletes that test's meaning while leaving it green.
//     That is why the list stops at eight entries — the ninth slot is deliberately empty.
//
// (e) `@skip` and `@only` are the library's two reserved tags (D-05, D-06): `@skip` additionally
//     routes to a real vitest skip, and `@only` is emitted as a plain tag and is NEVER routed to
//     `it.effect.only`. The other six are probes used by this repo's own suite — `@slow` and `@wip`
//     are pass-through probes (D-07), and the four `…tag` entries mirror the tag-inheritance
//     fixture at `packages/gherkin/test/Correlate.test.ts:173`. A future phase that adds
//     `@REQ-EC-NNN` acceptance tags (AGENTS.md §5) adds them here, or reaches the D-08 degradation
//     path instead.
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    tags: [
      { name: "@skip" },
      { name: "@only" },
      { name: "@slow" },
      { name: "@wip" },
      { name: "@featuretag" },
      { name: "@ruletag" },
      { name: "@scenariotag" },
      { name: "@exampletag" }
    ],
    allowOnly: false
  }
})

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
// (c) `include` is deliberately ABSENT and `exclude` only EXTENDS vitest's defaults. Replacing either
//     is the likeliest way to silently stop running some package's tests; keeping the defaults is
//     what every existing test file in this repo relies on. The one addition, `**/.claude/**`, keeps
//     the agent worktrees git parks under `.claude/worktrees/` (gitignored) out of a root run. `pnpm test` reported 30 test files
//     and 645 tests both immediately before and immediately after this file first landed, which is
//     the empirical check RESEARCH assumption A5 asked for. That default is also why every
//     acceptance step module under `packages/vitest/test/acceptance/` is named `*.steps.test.ts`
//     rather than `*.steps.ts`: the include glob is what collects it, and this note is why the
//     glob cannot simply be widened to meet a nicer filename.
//
// (d) `@undeclared-on-purpose` is RESERVED and must NEVER be added to the list below, nor to any
//     `.feature` file the glob in (e) expands. Plan 09-06 emits it from
//     `packages/vitest/test/emission.test.ts` to prove the D-08 catch-and-degrade path: the
//     Scenario still runs untagged and a located warning prints, instead of the file collecting
//     zero tests. Declaring it here deletes that test's meaning while leaving it green. The
//     hand-written list below therefore still stops at eight entries and its ninth slot is still
//     deliberately empty — what changed in Phase 11 is that the list is no longer the WHOLE tag
//     universe, only its hand-written half. The other half is derived, and derived entries cannot
//     reintroduce the reserved tag unless someone writes it into an acceptance `.feature` file,
//     which is the same prohibition stated one layer out.
//
// (e) `@skip` and `@only` are the library's two reserved tags (D-05, D-06): `@skip` additionally
//     routes to a real vitest skip, and `@only` is emitted as a plain tag and is NEVER routed to
//     `it.effect.only`. The other six are probes used by this repo's own suite — `@slow` and `@wip`
//     are pass-through probes (D-07), and the four `…tag` entries mirror the tag-inheritance
//     fixture at `packages/gherkin/test/Correlate.test.ts:173`. This note used to offer a future
//     phase two options for the acceptance tags AGENTS.md §5 requires: declare them here, or reach
//     the D-08 degradation path instead. Phase 11 took the first, through `gherkinTags` (D-09,
//     RUN-05) rather than by hand — so this file contains ZERO acceptance-tag literals and adding
//     a tagged Scenario to the acceptance suite needs no edit here at all. Both halves of that
//     choice were observed rather than assumed: with the glob in place the acceptance Scenario is
//     emitted carrying its tag; with the acceptance tag left undeclared, D-08 catches the
//     collection-time throw and the Scenario runs UNTAGGED behind one located warning while
//     `pnpm test` still exits 0. That second observation is why the acceptance suite asserts its
//     own collected test COUNT and does not rely on the exit code.
//
// The tag list itself lives in `./vitest.tags.ts` so that this root config and the per-package
// `packages/vitest/vitest.config.ts` declare ONE universe from ONE derivation.
import { fileURLToPath } from "node:url"
import { configDefaults, defineConfig } from "vitest/config"
import { declaredTags } from "./vitest.tags.ts"

export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, "**/.claude/**"],
    // The universe is computed from THIS file's directory, so `pnpm test` from the root and
    // `pnpm -r test` from a package directory declare the same list. `./vitest.tags.ts` holds the
    // one hand-written half and the one derivation; `packages/vitest/vitest.config.ts` reuses both.
    tags: declaredTags(fileURLToPath(new URL(".", import.meta.url))),
    allowOnly: false
  }
})

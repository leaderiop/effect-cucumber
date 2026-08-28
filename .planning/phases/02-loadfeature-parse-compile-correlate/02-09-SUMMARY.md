---
phase: 02-loadfeature-parse-compile-correlate
plan: 09
subsystem: gherkin-parsing
tags: [gherkin, cucumber, loadfeature, public-api, barrel, dialect, i18n, vite-raw, parse-01, parse-02, parse-03, beh-ec-001, adr-ec-015]

# Dependency graph
requires:
  - phase: 02-02
    provides: "packages/gherkin/src/Errors.ts — LoadFeatureError, LoadFeatureErrorReason, LoadFeatureWarning, LoadFeatureWarningReason"
  - phase: 02-03
    provides: "packages/gherkin/src/Model.ts — ParsedFeature / ParsedFeatureCore / ParsedRule / ParsedScenario / ParsedStep / StepOwner and the @cucumber/messages re-exports; the correlation-full and dialect-fr fixtures"
  - phase: 02-04
    provides: "packages/gherkin/src/Source.ts (readFeatureSource) and src/Parser.ts (parseDocument)"
  - phase: 02-05
    provides: "packages/gherkin/src/Correlate.ts — correlateFeature, CorrelationResult, isOutlineKeyword"
  - phase: 02-06
    provides: "packages/gherkin/src/Pickles.ts — compilePickles"
  - phase: 02-07
    provides: "packages/gherkin/src/Validate.ts — validateFeature (Group A/B errors)"
  - phase: 02-08
    provides: "packages/gherkin/src/Validate.ts — the leftover-placeholder scan and the Group C warnings"
provides:
  - "packages/gherkin/src/loadFeature.ts — parseFeature(source, uri) as the testable core and loadFeature(path) as its two-line readFeatureSource wrapper, both synchronous"
  - "The composition root: Source then Parser then Pickles then Correlate then Validate, over ONE IdGenerator.uuid() shared by AstBuilder and compile"
  - "packages/gherkin/src/index.ts — the real public barrel, replacing the Phase 1 stand-in, while keeping packageName / PackageName for packages/vitest"
  - "packages/gherkin/test/loadFeature.test.ts — 8 tests, the PARSE-01 behavioral proof plus ?raw / readFileSync / path three-way parity"
  - "packages/gherkin/test/dialect.test.ts — 10 tests, Gap 5: a # language: fr feature parses with zero special handling and Outline detection is dialect-independent"
  - "packages/gherkin/test/feature-raw.d.ts — the *.feature?raw ambient module 02-10's test type-check needs"
affects: [02-10, 02-11, 03, 04, 05, 06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Two entry points, not two implementations: loadFeature(path) is literally parseFeature(readFeatureSource(path), path) — the path form satisfies BEH-EC-001, the source form serves Vite ?raw and needs no filesystem"
    - "The composition root is the only file that knows the pipeline order; every module below it is a leaf or near-leaf, so pnpm circular stays trivially green"
    - "One uuid-backed id generator constructed per call and threaded into both parseDocument and compilePickles (D3) — the shared-namespace invariant lives at the one place that can enforce it"
    - "Success criterion 1 is tested by SHAPE, not by assertion: the call sits at module top level and the file's reported test count equals its declared test count"
    - "Cross-form parity is asserted on a normalised projection that omits node ids, because uuid makes ids differ per call by design"
    - "The barrel re-exports the @cucumber/messages types the contract is written in, so a consumer reading .document or .pickles never has to declare that dependency"
    - "Dialect independence is proven by an inline fr Outline, which distinguishes a dialects[language] lookup from a hardcoded English keyword list — the two implementations agree on every English fixture"

key-files:
  created:
    - packages/gherkin/src/loadFeature.ts
    - packages/gherkin/test/loadFeature.test.ts
    - packages/gherkin/test/dialect.test.ts
    - packages/gherkin/test/feature-raw.d.ts
  modified:
    - packages/gherkin/src/index.ts
    - .planning/REQUIREMENTS.md

key-decisions:
  - "The test file declares 8 tests, not the single `it` the plan's prose named — the plan's own acceptance criteria require at least 5 passing tests in exactly 1 test file, and the zero-contribution evidence is the file/count relationship, which any N preserves"
  - "Node-id instability is asserted as a positive test rather than only documented, so a future switch to a counter-based generator fails by name instead of silently making cross-call id comparison look safe"
  - "PARSE-01, PARSE-02 and PARSE-03 marked Complete together, each verified end-to-end through the shipped loadFeature rather than through the pipeline stages"
  - "spec/roadmap.md's now-stale Current state table left alone — plan 02-11 owns it explicitly (its files_modified and threat T-02-27)"

patterns-established:
  - "When a criterion cannot be tested literally because the literal form is a runner hard-failure, encode it in the file's structure and write the reason into the module doc comment addressed to the person who would 'clean it up'"
  - "An i18n claim is proven by the test that would fail on the naive implementation, not by the test that passes on both"

requirements-completed: [PARSE-01, PARSE-02, PARSE-03]

# Metrics
duration: 14min
completed: 2026-08-28
---

# Phase 02 Plan 09: loadFeature and the Public Barrel Summary

**`@effect-cucumber/gherkin` now has a public API: a synchronous `loadFeature(path)` and `parseFeature(source, uri)` over one shared uuid generator, behind a single barrel that replaces the Phase 1 stand-in — and with `loadFeature` finally existing, PARSE-01, PARSE-02 and PARSE-03 are all verified true of the library's actual surface.**

## Performance

- **Duration:** ~14 min
- **Tasks:** 3
- **Files created:** 4 · **Files modified:** 2

## Accomplishments

- **`src/loadFeature.ts` — the composition root.** `parseFeature(source, uri)` constructs exactly one `IdGenerator.uuid()` and threads it into both `parseDocument` and `compilePickles`, then `correlateFeature`, then `validateFeature`, returning `ParsedFeatureCore` spread with the returned `warnings`. `loadFeature(path)` is the two-line wrapper Decision D1 specifies. Both are synchronous: `grep -cE 'async |Promise<|await '` over the file is 0, and the "one-way door" reasoning (PITFALLS.md rates the recovery cost HIGH and marks it "Never") is written into the module doc comment rather than left to be rediscovered.
- **The doc comment records the three things the code cannot say.** (a) A throw at module top level becomes a vitest *collection* error for the whole file — which is exactly why the validation messages are shaped `uri:line: Reason: what to do`, since that one message is all a collection error shows, and why Phase 6 may re-route at the `describeFeature` boundary. (b) uuid makes node ids differ between two calls on identical bytes, so ids are stable only within one `ParsedFeature` and must never be persisted or compared across calls. (c) `GherkinInMarkdownTokenMatcher` is deliberately unused — Markdown feature files are out of scope for this milestone, so the omission reads as a decision.
- **`src/index.ts` — the real barrel.** Exports `loadFeature` and `parseFeature`; `LoadFeatureError` as a value with `LoadFeatureErrorReason` / `LoadFeatureWarning` / `LoadFeatureWarningReason` as types; every public `Model.ts` type; and the six `@cucumber/messages` types the contract is written in (`GherkinDocument`, `Pickle`, `PickleStep`, `PickleStepArgument`, `Location`, `StepKeywordType`), so a consumer reading the `document` / `pickles` escape hatches is never forced to declare that dependency (Open Question 3). `Parser`, `Pickles`, `Correlate`, `Source` and `Validate` stay unexported — they are pipeline stages with no standalone contract (threat T-02-21).
- **The correctness trap was honoured.** `packageName` and `PackageName` are kept verbatim, under a comment marking them internal build-graph exports rather than public API, because `packages/vitest/src/index.ts` line 13 reads both and Phase 5 owns that file. `pnpm build` compiles both packages through the project reference and is green (threat T-02-06).
- **No subpath export was added.** `packages/gherkin/package.json` still has exactly two `exports` keys and two `publishConfig.exports` keys. A subpath has to be added to both or it resolves locally and 404s for consumers; one barrel is the shape that cannot drift.
- **`test/loadFeature.test.ts` — PARSE-01 proven behaviorally, 8 tests in 1 file.** `const topLevelFeature = loadFeature(fixturePath)` sits at module top level, zero indentation, above every `describe`. Pitfall P1's finding is written into the file's doc comment addressed to whoever would "clean it up": the literal form of success criterion 1 (a file that calls `loadFeature` and declares no tests) is a vitest hard failure — `Error: No test suite found in file ...` — so the file that proves the point best is the one that looks broken.
- **Three-way source parity is asserted, not assumed.** The Vite `?raw` string is asserted byte-identical to `readFileSync(new URL(...), "utf8")`, and `parseFeature` over each agrees with `loadFeature` over the path on a projection covering feature name/keyword/language/tags/line and every scenario's `name`, `astName`, `keyword`, `tags`, `location.line` plus every step's `text`, `keyword`, `origin`, `line`. Node ids are excluded from the projection by design — and a separate test asserts they *do* differ across two calls, so a regression to a counter-based generator fails by name.
- **`test/dialect.test.ts` — Gap 5, 10 tests.** `dialect-fr.feature` loads without throwing: `language` is `"fr"`, the Feature keyword is `Fonctionnalité`, the Scenario keyword is `Scénario`, the `Contexte:` step arrives first with `origin: "feature-background"`, the Scenario's own step follows it in run order, and `warnings` is empty. The step keyword is asserted `toBe("Etant donné que")` — `toBe`, not `toContain`, because the assertion is *about* the trailing space the raw AST keyword carries.
- **Outline detection is proven language-independent.** An inline `fr` source with `Plan du scénario: utiliser <outil>` and an `Exemples:` block compiles to two scenarios named `utiliser marteau` and `utiliser tournevis`, with no `OutlineWithoutExamples` and no `ScenarioKeywordWithExamples`, and `isOutlineKeyword("fr", "Plan du scénario")` is `true` while `isOutlineKeyword("fr", "Scénario")` is `false`. This is the test that separates a `dialects[language]` lookup from a hardcoded English keyword list — the two implementations agree on every English fixture in the corpus.
- **The full `check.yml` phase gate ran green for the first time with real source in the package:** `pnpm test` (10 files, 211 tests), `pnpm build`, `pnpm lint`, `pnpm circular`, `pnpm verify:pack`, `pnpm verify:spec`, `pnpm verify:tsgo-gate`, `pnpm verify:oxlint-plugin`.

## Task Commits

1. **Task 1: `src/loadFeature.ts` and the replacement `src/index.ts`** — `bb40012` (feat)
2. **Task 2: `test/loadFeature.test.ts` and `test/feature-raw.d.ts`** — `cf05749` (test)
3. **Task 3: `test/dialect.test.ts`** — `7ddd3c6` (test)

## Files Modified

- `packages/gherkin/src/loadFeature.ts` (new, 88 lines) — `parseFeature`, `loadFeature`
- `packages/gherkin/src/index.ts` (12 → 51 lines) — the real barrel; the Phase 1 framing is gone (`grep -ci 'placeholder'` is 0)
- `packages/gherkin/test/loadFeature.test.ts` (new, 116 lines) — 8 tests, `shapeOf` normaliser
- `packages/gherkin/test/dialect.test.ts` (new, 127 lines) — 10 tests, `scenarioAt` / `stepAt` helpers, the inline `frenchOutline` source
- `packages/gherkin/test/feature-raw.d.ts` (new, 12 lines) — one ambient `*.feature?raw` declaration
- `.planning/REQUIREMENTS.md` — PARSE-01, PARSE-02, PARSE-03 checked off and moved to `Complete` in the traceability table

## Decisions Made

- **The test file declares 8 tests, not the single `it` the plan's prose named.** Task 2's `<action>` says "exactly ONE `it`", but its own `<acceptance_criteria>` requires "at least 5 passing tests" in "exactly 1 test FILE". The acceptance criteria govern, and the two are reconcilable: Pitfall P1's evidence is the *relationship* between the top-level call and the file's reported test count, which holds for any N. The doc comment states it in that general form ("the file declares N tests and vitest reports exactly N"), so the property survives someone adding a test.
- **Node-id instability is a positive assertion, not just a doc note.** The plan asked for the parity comparison to strip ids. It is also worth asserting that they genuinely differ: that turns the uuid decision into something a regression can fail, rather than a comment that quietly stops being true if someone swaps in a counter-based generator to make a test deterministic.
- **`isOutlineKeyword` is asserted directly in addition to the end-to-end inline-source test.** The end-to-end test is the real proof (it is what a hardcoded English list would fail); the direct assertion names the mechanism, so a failure says *which* of the two layers broke.
- **PARSE-01, PARSE-02 and PARSE-03 marked Complete, each verified against the shipped `loadFeature`.** 02-04, 02-05, 02-07 and 02-08 all deliberately left them Pending because every one is worded around a `loadFeature` that did not exist. Rather than take that as given, each was re-verified end-to-end through the new public function: PARSE-01 by `test/loadFeature.test.ts`; PARSE-02 by confirming `loadFeature("correlation-full.feature")` yields a scenario whose text is substituted (`I use a`), whose tags are inherited in flattened order (`@featuretag @ruletag @scenariotag @exampletag`), and whose steps are Background-stacked (`feature-background`, `rule-background`, then its own two); PARSE-03 by confirming `loadFeature("uninterpolated-placeholder-background.feature")` throws a `LoadFeatureError` with `reason: "UninterpolatedPlaceholder"` carrying ADR-EC-014's Background-limitation sentence. All three are now true of the library's surface, not only of its internals.
- **`spec/roadmap.md`'s Current state table is stale but was left alone.** It still says the packages "contain **no source files**" and that there are no unit tests, which AGENTS.md §4 would normally require fixing in the same change. It is not this plan's to fix: `02-11-PLAN.md` lists `spec/roadmap.md` in its `files_modified`, has a must-have truth for exactly this table, greps for those two sentences being gone, and registers it as threat T-02-27. Editing it from here would collide with that plan and would assert a phase-end state this plan can only partially verify. Flagged, not deferred — it is already owned.
- **`vitest` was left out of the barrel's reach, structurally.** `grep -rc 'from "effect'` across `packages/gherkin/src` is 0 and the package's only imports are local modules plus `@cucumber/*` — the ADR-EC-015 / threat T-02-20 invariant. The structural gate script that enforces it is 02-10's deliverable.

## Deviations from Plan

**1. [Rule 3 - Blocking] `node_modules` was absent in the worktree**

- **Found during:** Task 1 verification
- **Issue:** `pnpm build` failed with `sh: tsc: command not found` — the fresh worktree had no installed dependencies.
- **Fix:** `pnpm install --frozen-lockfile`. No manifest or lockfile change; this is worktree setup, not a dependency change.
- **Files modified:** none
- **Commit:** n/a

Otherwise the plan executed as written. The 8-vs-1 test count discussed under Decisions Made is a resolution of an internal contradiction in the plan's own Task 2, decided in favour of its acceptance criteria, not a departure from what it specified.

## Threat Flags

None. The three trust boundaries this plan touches were all dispositioned in the plan's own register (T-02-03 accept, T-02-20/T-02-21/T-02-06 mitigate, T-02-02 accept) and no new security-relevant surface was introduced: no network endpoint, no auth path, no schema at a trust boundary. The one new filesystem read is `readFeatureSource`, which already existed and is unchanged.

## Known Stubs

None. Every export is wired to real behavior and exercised by a test.

## Self-Check: PASSED

- `packages/gherkin/src/loadFeature.ts` — FOUND
- `packages/gherkin/src/index.ts` — FOUND
- `packages/gherkin/test/loadFeature.test.ts` — FOUND
- `packages/gherkin/test/dialect.test.ts` — FOUND
- `packages/gherkin/test/feature-raw.d.ts` — FOUND
- commit `bb40012` — FOUND
- commit `cf05749` — FOUND
- commit `7ddd3c6` — FOUND

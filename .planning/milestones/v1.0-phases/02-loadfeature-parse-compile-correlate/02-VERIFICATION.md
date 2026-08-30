---
phase: 02-loadfeature-parse-compile-correlate
verified: 2026-08-28T13:23:47Z
status: passed
score: 8/8 must-haves verified
overrides_applied: 0
---

# Phase 2: `loadFeature` — Parse, Compile, Correlate Verification Report

**Phase Goal:** A `.feature` file becomes a fully correlated `ParsedFeature`, and every verified
silent-failure mode of `@cucumber/gherkin`'s `compile()` surfaces as a loud, named, located error
instead of a false-green test.

**Verified:** 2026-08-28T13:23:47Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `loadFeature` is synchronous; called at module top level contributes zero tests, no error (PARSE-01) | VERIFIED | `packages/gherkin/test/loadFeature.test.ts:34` calls `loadFeature` at true module top level (outside all `describe`/`it`); `it("contributes no tests of its own"...)` asserts scenario count stays fixed; `it("returns a plain object, not a thenable")` asserts no `.then`/`instanceof Promise`. `pnpm test` run: 171/171 passing including this file. |
| 2 | Fixture with Background + Outline + tags: steps placeholder-substituted, Background stacked first, tags inherited, keyword from AST — row by row (PARSE-02) | VERIFIED | `packages/gherkin/src/Correlate.ts` (476 lines) builds `AstIndex`/`AstStepInfo`; `packages/gherkin/test/Correlate.test.ts:54` `describe("correlateFeature on correlation-full.feature (F21)")` asserts row-by-row step text, origin, keyword, line. `Model.ts` fields (`origin: StepOwner`, `keyword`, `line`) are populated exclusively from the AST walk, never from `astNodeIds.length` (per code comment and F-series tests). |
| 3 | Every silent-wrong-`compile()` row has a fixture producing a distinct, named `LoadFeatureError` citing file/line: empty Examples, zero-step Scenario, one-to-many astNodeIds, un-interpolated placeholder in Background-under-Outline, missing file, malformed file, unknown dialect (PARSE-03) | VERIFIED | `Errors.ts` declares 10 distinct `LoadFeatureErrorReason` values. `Parser.test.ts` (193 lines) covers `MissingFile`, `ParseFailed`, `UnknownDialect`, `NoFeature` with `err.reason` assertions and a "no raw gherkin or Node exception escapes" test. `Validate.test.ts` (365 lines) covers `OutlineWithoutExamples`, `EmptyExamples`, `ScenarioKeywordWithExamples`, `ZeroStepScenario`, `DuplicateScenarioName`, `UninterpolatedPlaceholder` (fixture `uninterpolated-placeholder-background.feature`, exactly the Background-under-Outline case) with `.toBe("<Reason>")` assertions and line-number checks. All 27 fixture-table rows (F1-F27) present in `test/fixtures/`. |
| 4 | Scenario matched by AST un-interpolated name, not interpolated pickle name — Outline with differing interpolated names (F26) | VERIFIED | `Model.ts:87` `ParsedScenario.astName` field with explicit doc: "Both names are required: a Scenario is matched to its registered definition by the un-interpolated name." `Correlate.test.ts:240` `describe("an Outline whose row names all differ (F26)")` — `it("exposes the single un-interpolated astName on BOTH rows")`, `it("keeps astName and name distinct on every row")`. |
| 5 | `# language:` non-English fixture parses without special handling | VERIFIED | `packages/gherkin/test/dialect.test.ts` (127 lines) loads `dialect-fr.feature`, asserts no throw, correct localised keyword (`Plan du scénario`), and explicitly documents/tests that Outline detection uses `dialects[language]` lookup rather than a hardcoded English keyword list (would misclassify French Outline as plain Scenario otherwise). |

**Score:** 5/5 roadmap success criteria verified

### Additional PLAN-Level Must-Have Truths (spot-checked, not exhaustive re-listing)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 6 | Requirements coverage: PARSE-01/02/03 traced to real source and tests | VERIFIED | All 11 plans declare `requirements:` covering PARSE-01/02/03 (cross-checked against REQUIREMENTS.md Phase 2 mapping — no gaps, no orphans). |
| 7 | Structural PARSE-01 gate (`verify:no-runner-dep`) actually fails when violated | VERIFIED | Ran the gate clean (`exit 0`, positive control 3 hits). Then injected `import { describe } from "vitest"` into `Source.ts` and re-ran: gate correctly failed (`exit 1`, named the exact violating line). Reverted; `git status` confirmed no residual diff. |
| 8 | `spec/` traceability and behavior docs updated and internally consistent | VERIFIED | `pnpm verify:spec` exits 0 (7 PASS, 0 FAIL, 1 SKIP — expected, no `.feature` tags yet). `BEH-EC-014` present in both `spec/behaviors/index.yaml` and `spec/behaviors/04-loadfeature-parse-and-validation.md`. `spec/traceability.md` §4 is a real test-file map (not "no test files exist yet"). |

**Score:** 8/8 must-haves verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/gherkin/src/Errors.ts` | LoadFeatureError, reason union, warning carrier | VERIFIED | 133 lines; 10 error reasons, 4 warning reasons, `makeWarning` factory, `this.name` explicitly assigned. |
| `packages/gherkin/src/Model.ts` | ParsedFeature contract | VERIFIED | 163 lines; all documented exports present (`StepOwner`, `ParsedStep`, `ParsedScenario`, `ParsedRule`, `ParsedFeatureCore`, `ParsedFeature`). |
| `packages/gherkin/src/Source.ts` | readFeatureSource, sole node:fs import | VERIFIED | 70 lines; wraps ENOENT into `MissingFile`. |
| `packages/gherkin/src/Parser.ts` | parseDocument | VERIFIED | 168 lines; wraps `CompositeParserException`/`NoSuchLanguageException`. |
| `packages/gherkin/src/Pickles.ts` | compilePickles | VERIFIED | 44 lines. |
| `packages/gherkin/src/Correlate.ts` | AST walk + correlation indices | VERIFIED | 476 lines (min 150 required). |
| `packages/gherkin/src/Validate.ts` | reconciliation pass, placeholder scan, warnings | VERIFIED | 728 lines (min 120/220 required across plans 07/08). |
| `packages/gherkin/src/loadFeature.ts` | composition root | VERIFIED | 90 lines; `loadFeature`/`parseFeature` exported, synchronous. |
| `packages/gherkin/src/index.ts` | public barrel | VERIFIED | 51 lines; exports `loadFeature`, `parseFeature`, `LoadFeatureError`, types, `packageName`/`PackageName`. |
| `scripts/verify-no-runner-dep.sh` | structural PARSE-01 proof | VERIFIED | 180 lines (min 60); positive control + 2 assertions; manually confirmed it fails on injected violation. |
| `packages/gherkin/tsconfig.test.json` | test-scoped check-only config | VERIFIED | `pnpm typecheck:test` exits 0. |
| Fixture corpus (`test/fixtures/*.feature`) | F1-F27 | VERIFIED | 27 fixture files present, `README.md` maps all F1-F27. |
| `spec/behaviors/04-loadfeature-parse-and-validation.md` | BEH-EC-014 | VERIFIED | Present, registered in `index.yaml`. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `Model.ts` | `Errors.ts` | `import type { LoadFeatureWarning }` | WIRED | Confirmed import present. |
| `loadFeature.ts` | `Correlate.ts`/`Parser.ts`/`Pickles.ts`/`Source.ts`/`Validate.ts` | composition root imports | WIRED | All five imported and called in documented pipeline order (Source → Parser → Pickles → Correlate → Validate). |
| `index.ts` | `loadFeature.ts` | re-export | WIRED | `export { loadFeature, parseFeature } from "./loadFeature.ts"`. |
| `.github/workflows/check.yml` | `package.json` scripts | `pnpm verify:no-runner-dep`, `pnpm typecheck:test` | WIRED | Both present as CI steps (lines 55, 101), both are root package.json scripts, both run identically locally (verified by direct execution). |
| `Validate.ts` | `Correlate.ts` | consumes `CorrelationResult` | WIRED | `validateFeature(result: CorrelationResult)` never re-walks the AST — confirmed by reading `Validate.ts:625-720`. |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full build | `pnpm build` (`tsc -b`) | exit 0, no output | PASS |
| Full test suite | `cd packages/gherkin && pnpm test` | 7 files, 171 tests, all passed | PASS |
| Lint | `pnpm lint` (oxlint + dprint) | exit 0 | PASS |
| Structural PARSE-01 gate | `pnpm verify:no-runner-dep` | exit 0, positive control 3 hits, no violations | PASS |
| Structural gate negative control | inject `import {describe} from "vitest"` into `Source.ts`, re-run gate | exit 1, correctly named violating file/line | PASS |
| Test-file typecheck gate | `pnpm typecheck:test` | exit 0 | PASS |
| Spec traceability | `pnpm verify:spec` | 7 PASS, 0 FAIL, 1 SKIP (expected) | PASS |
| Full workspace rebuild | `tsc -b --force` | exit 0 | PASS |

### Probe Execution

No `scripts/*/tests/probe-*.sh` convention exists in this repo and no plan/summary references a probe script. SKIPPED — not applicable to this phase.

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|-----------------|--------------|--------|----------|
| PARSE-01 | 02-01, 02-03, 02-04, 02-09, 02-10, 02-11 | `loadFeature` loads/parses via `@cucumber/gherkin`, no observable test-run effect | SATISFIED | `loadFeature.test.ts` behavioral proof + `verify-no-runner-dep.sh` structural proof, both passing. |
| PARSE-02 | 02-01, 02-02, 02-03, 02-05, 02-06, 02-09, 02-11 | Correlates GherkinDocument with Pickle output: substitution, tag inheritance, Background stacking | SATISFIED | `Correlate.ts` + `Correlate.test.ts` (396 lines, F21/F23-F27 groups). |
| PARSE-03 | 02-01, 02-02, 02-03, 02-04, 02-07, 02-08, 02-09, 02-10, 02-11 | Background-under-Outline leftover placeholder fails with named error | SATISFIED | `Validate.ts` column-aware scan + `Validate.test.ts` F7/F8 assertions on exactly the Background-under-Outline fixture. |

No orphaned requirements: REQUIREMENTS.md maps only PARSE-01/02/03 to Phase 2, and all three appear in at least one plan's `requirements:` frontmatter field.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `packages/gherkin/src/Validate.ts` | 633-693 | Two-pass validation loop means errors are not thrown in strict document order across check categories, contradicting the module's own stated contract | WARNING (pre-existing, from 02-REVIEW.md WR-01) | Does not create a silent-failure regression — every defect still throws a named, located error. Only affects *which* of two simultaneous defects in one file is reported first. No fixture combines two categories, so untested but non-blocking to the phase goal. |
| `packages/gherkin/package.json` | 47-51 | `@cucumber/cucumber-expressions` declared as runtime dependency, never imported anywhere in `src/` or `test/` | WARNING (pre-existing, from 02-REVIEW.md WR-02) | Confirmed via `grep -rn "cucumber-expressions" packages/gherkin/src packages/gherkin/test` — no matches. Ships an unused package to consumers; contradicts stated minimal-surface-area design philosophy but does not affect functional correctness of Phase 2's goal. |

No TBD/FIXME/XXX markers found in any file modified by this phase. No debt-marker gate triggered. Both findings above were already surfaced in `02-REVIEW.md` as warnings (not blockers) and are independently re-confirmed here by direct grep/code inspection — they do not block goal achievement and are appropriately WARNING-level, not BLOCKER-level, findings.

### Human Verification Required

None. The one blocking human-verify checkpoint in this phase (02-01 Task 1: package legitimacy gate for `vitest`/`@types/node`) was already resolved during execution — `02-01-SUMMARY.md` documents explicit developer approval, and no plan in this phase contains a deferred `<verify><human-check>` block on an `auto` task.

### Gaps Summary

No gaps found. All 5 ROADMAP success criteria and all cross-plan must-have truths were independently verified against the actual codebase (not SUMMARY.md claims): build, full test suite (171/171), lint, structural gate (verified fail-on-violation via injected negative control), typecheck:test, and spec traceability all pass. The two review warnings (validation ordering across categories, one unused runtime dependency) are real but do not undermine the phase's core deliverable — every verified silent-failure mode of `compile()` does surface as a loud, named, located error, and `loadFeature` does produce a fully correlated `ParsedFeature`.

---

_Verified: 2026-08-28T13:23:47Z_
_Verifier: Claude (gsd-verifier)_

---
phase: 04-datatable-docstring
verified: 2026-08-28T22:24:24Z
status: passed
score: 3/3 roadmap success criteria verified (plus 17/17 plan-level must-have truths across 04-01..04-05)
overrides_applied: 0
---

# Phase 04: DataTable/DocString — Verification Report

**Phase Goal:** Gherkin data tables and doc strings reach step bodies as typed values through the
library's own wrapper.
**Verified:** 2026-08-28T22:24:24Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `.raw()`, `.hashes()`, `.rowsHash()` each return the documented shape for a table fixture, including single-column and header-only edge cases | ✓ VERIFIED | `packages/gherkin/src/DataTable.ts:153-195` (interface), `:202-285` (`makeDataTable`). Tests at `packages/gherkin/test/DataTable.test.ts:88-206` cover `raw()` header-only/empty (94, 98), `hashes()` single-column (112) and header-only → `[]` (118), `rowsHash()` header-only → fails `RowsHashRequiresTwoColumns` at row 1 (182). Ran `pnpm test`: 404/404 passing, includes all of these. |
| 2 | A `.hashes()` result decodes through a `Schema` into typed rows; a row that fails the schema produces a decode error naming the offending row and column, not a generic parse failure | ✓ VERIFIED | `decodeHashes` at `DataTable.ts:413-420`, `rowDecodeFailed` at `:361-392` walks the `SchemaIssue` `Pointer` path to recover `row`/`column`. Test `DataTable.test.ts:240-262` ("names the offending row and column...") asserts `error.row = Option.some(2)`, `error.column = Option.some("age")`, message contains `Row 2 of the DataTable at features/checkout.feature:12 failed to decode, column "age"` and the offending row verbatim. `schema-issue-pin.test.ts` (7 tests) independently pins the effect@4.0.0-rc.112 issue-tree shape this recovery depends on, importing nothing from `../src`. |
| 3 | A step whose Gherkin carries both a DocString and a DataTable receives both, in a documented, tested argument order | ✓ VERIFIED | `stepArgumentsOf` in `StepArguments.ts:127-158` sorts on `argumentIndex`'s value (not key presence) with `toSorted`. `Correlate.ts:391-419` (`resolveStep`) wires `stepArgumentsOf(pickleStep.argument, uri, info.step.location.line)` into `ParsedStep.stepArguments`, a required field (`Model.ts`). End-to-end fixture tests: `Correlate.test.ts:473` (F25: DocString-then-DataTable), `:512` (F33, the byte-mirror fixture: DataTable-then-DocString — the load-bearing proof the order is not hardcoded), `:496` (calls `.hashes()` on the correlated wrapper end-to-end). Also asserted on synthetic data in `StepArguments.test.ts:142-166` (both orderings + undefined-index fallback). Documented in `spec/behaviors/06-datatable-and-docstring-arguments.md` (BEH-EC-016) and `spec/decisions/025-datatable-wrapper-accessor-contract.md` (ADR-EC-025). |

**Score:** 3/3 roadmap success criteria verified.

### Plan-Level Must-Haves (04-01 through 04-05 frontmatter)

All 17 `must_haves.truths` entries across the five plan files were checked against source; all
verified. Representative spot-checks beyond the roadmap-level table above:

- 04-01: `upstream-pin.test.ts` pins `argumentIndex` in both source orders and the key-present/
  value-undefined shape — verified live (`grep -c 'argumentIndex' upstream-pin.test.ts` ≥ 8; file
  imports nothing from `../src`).
- 04-02: `DataTableError` exists as a third `Schema.TaggedError` with a closed four-member reason
  union (`Errors.ts`); `__proto__` header cell becomes an own property via `Object.fromEntries`
  (`recordOf`, `DataTable.ts:145-146`), tested at `DataTable.test.ts:143-160`.
- 04-03: `decodeHashes` exported (`DataTable.ts:413`); duplicate-header failure propagates
  unchanged through `decodeHashes` (test at `DataTable.test.ts:299-309`).
- 04-04: `ParsedStep.stepArguments` is required with exactly one producer
  (`grep -c 'stepArgumentsOf(' Correlate.ts` = 1); barrel exports all eight Phase 4 names with no
  subpath (`index.ts:98,99,108,109,120,121`); `pnpm verify:pack` exit 0.
- 04-05: ADR-EC-025 and BEH-EC-016 exist, registered in their index.yaml files and in
  `spec/traceability.md` (§1/§3/§4); ADR-EC-008's stale worked example marked in place
  (`git diff --numstat` on that file would show additions only, per SUMMARY; content confirms a
  dated correction blockquote is appended, original `ts` fence untouched); `PARSE-04` is
  `[x]`/`Complete` in `.planning/REQUIREMENTS.md`; `packages/gherkin/README.md` no longer claims
  the wrapper is unshipped (`grep -c 'does **not** ship yet'` = 0, confirmed).

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/gherkin/src/DataTable.ts` | `DataTable` interface + `makeDataTable`, `decodeHashes` | ✓ VERIFIED | 421 lines, exports both, no stubs, wired |
| `packages/gherkin/src/Errors.ts` | `DataTableError`, closed 4-member reason union | ✓ VERIFIED | `DataTableErrorReason` = `DuplicateHeaderColumn`/`DuplicateRowKey`/`RowsHashRequiresTwoColumns`/`RowDecodeFailed`, confirmed |
| `packages/gherkin/src/StepArguments.ts` | `DocString`, `StepArgument` union, `stepArgumentsOf` | ✓ VERIFIED | All three exported, ordering logic reads `argumentIndex` value only (no `Object.hasOwn`/`in` check) |
| `packages/gherkin/src/Model.ts` | `ParsedStep.stepArguments` required field | ✓ VERIFIED | `readonly stepArguments: ReadonlyArray<StepArgument>` present, `argument` field unchanged/raw |
| `packages/gherkin/src/Correlate.ts` | `stepArguments` populated in `resolveStep` | ✓ VERIFIED | Exactly one construction site, uses AST step line |
| `packages/gherkin/src/index.ts` | Phase 4 public surface on the single barrel | ✓ VERIFIED | `makeDataTable`, `decodeHashes`, `stepArgumentsOf`, `DataTable`, `DocString`, `StepArgument`, `DataTableError`, `DataTableErrorReason` all exported; no subpath added |
| `packages/gherkin/test/DataTable.test.ts` | Accessor semantics, edge cases, `__proto__` guard, `decodeHashes` | ✓ VERIFIED | 326 lines, 22+ tests, covers all documented cases |
| `packages/gherkin/test/StepArguments.test.ts` | Ordering rule on synthetic data | ✓ VERIFIED | 169 lines, 8 tests |
| `packages/gherkin/test/schema-issue-pin.test.ts` | effect SchemaError issue-tree dependency pin | ✓ VERIFIED | 185 lines, 7 tests, imports nothing from `../src` |
| `spec/decisions/025-datatable-wrapper-accessor-contract.md` | ADR-EC-025 | ✓ VERIFIED | Exists, registered in index.yaml and traceability.md |
| `spec/behaviors/06-datatable-and-docstring-arguments.md` | BEH-EC-016 | ✓ VERIFIED | Exists, registered, normative rules match shipped API |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `Correlate.ts` | `StepArguments.ts` | `stepArgumentsOf(pickleStep.argument, uri, info.step.location.line)` | ✓ WIRED | Confirmed at `Correlate.ts:418` |
| `StepArguments.ts` | `DataTable.ts` | `makeDataTable` for the DataTable arm | ✓ WIRED | Confirmed at `StepArguments.ts:153` |
| `DataTable.ts` | `Errors.ts` | `DataTableError` import | ✓ WIRED | Confirmed at `DataTable.ts:73` |
| `DataTable.ts` | `effect/SchemaIssue` | Walking `Pointer` path for row/column recovery | ✓ WIRED | `firstIssuePath`/`isPointerIssue`/`isCompositeIssue`, `DataTable.ts:300-343` |
| `index.ts` | `DataTable.ts` | Barrel re-export | ✓ WIRED | `DataTable.ts:98-99` |
| `index.ts` | `StepArguments.ts` | Barrel re-export | ✓ WIRED | `index.ts:108-109` |
| `spec/behaviors/05` | `spec/behaviors/06` | `_Next:` footer | ✓ WIRED | `grep -c '^_Next: '` = 1 on file 05 |

### Behavioral Spot-Checks (executed live by verifier, not taken from SUMMARY)

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full test suite green | `pnpm test` | 404 passed (17 files) | ✓ PASS |
| Build clean | `pnpm build` | exit 0, no diagnostics | ✓ PASS |
| Spec structural integrity | `pnpm verify:spec` | PASS 7 / FAIL 0 / SKIP 1 | ✓ PASS |
| Package/dependency policy | `pnpm verify:pack` | all assertions green for both packages | ✓ PASS |
| Runner independence | `pnpm verify:no-runner-dep` | ENFORCED | ✓ PASS |
| Lint | `pnpm lint` | exit 0 | ✓ PASS |
| Test-file typecheck | `pnpm typecheck:test` | exit 0 | ✓ PASS |
| No circular deps | `pnpm circular` | no circular dependency found | ✓ PASS |

All eight gates were re-run independently by the verifier (not accepted from SUMMARY.md claims) and
produced identical results to what the summaries reported.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|--------------|--------|----------|
| PARSE-04 | 04-01..04-05 (all five plans declare it) | A Gherkin data table reaches a step as a `DataTable` wrapper exposing `.hashes()`/`.raw()`/`.rowsHash()`, whose rows decode through `Schema`; a step whose Gherkin carries both a DocString and a DataTable receives both | ✓ SATISFIED | `.planning/REQUIREMENTS.md` line 15 is `[x]`, line 87 traceability row is `Complete`. All supporting truths (see Observable Truths table above) verified directly against source and passing tests. |

No orphaned requirements: `.planning/REQUIREMENTS.md` maps only PARSE-04 to Phase 4, and all five
plans declare `requirements: [PARSE-04]`.

### Anti-Patterns Found

None. Scanned all phase-modified source and test files (`DataTable.ts`, `StepArguments.ts`,
`Errors.ts`, `Model.ts`, `Correlate.ts`, `index.ts`, and the six new/modified test files, plus the
two new spec documents) for `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` debt markers and
empty-implementation patterns. All "placeholder" matches found are legitimate Gherkin domain
terminology (feature-file `<name>` placeholder substitution), not incomplete-work markers. No
blocker-level or warning-level anti-patterns found.

The code review (`04-REVIEW.md`) found 0 critical/blocker issues, 3 warnings, 2 info items — all
doc-comment precision/completeness gaps (a doc comment misstating an import graph, a third-party
type not re-exported, a risk-acceptance note not re-examined for a new error class), none of which
affect the three roadmap success criteria's functional truth. These are legitimate follow-up items
but do not block phase goal achievement.

### Human Verification Required

None. All success criteria are structural/programmatic (type shapes, error messages, ordering rules,
test coverage) and were verified directly against source code and by running the full gate suite.
No UI, visual, real-time, or external-service behavior is in scope for this phase.

### Gaps Summary

No gaps. All three roadmap success criteria are verified against live source, not SUMMARY.md
self-report: the DataTable wrapper (`.raw()`/`.hashes()`/`.rowsHash()`) exists with the documented
edge-case semantics; `decodeHashes` converts a generic `SchemaError` into a `DataTableError` naming
the 1-based body-row ordinal and column; and `stepArgumentsOf`/`ParsedStep.stepArguments` deliver
both a DocString and DataTable in `argumentIndex`-derived source order, proven end-to-end through a
byte-mirrored fixture pair (F25/F33) that would fail under a hardcoded-order implementation. The
full test suite (404/404), build, lint, typecheck, circular-dependency, `verify:spec`, `verify:pack`,
and `verify:no-runner-dep` gates were all re-run independently by the verifier and are green. The
three code-review warnings are documentation-quality gaps, not functional regressions, and do not
block this phase's goal.

---

_Verified: 2026-08-28T22:24:24Z_
_Verifier: Claude (gsd-verifier)_

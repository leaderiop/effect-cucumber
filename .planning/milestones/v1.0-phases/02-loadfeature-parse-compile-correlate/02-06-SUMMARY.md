---
phase: 02-loadfeature-parse-compile-correlate
plan: 06
subsystem: gherkin-parsing
tags: [gherkin, cucumber, correlation, outline, examples, node-ids, docstring, datatable, adr-ec-014, vitest]

# Dependency graph
requires:
  - phase: 02-05
    provides: "packages/gherkin/src/Correlate.ts — correlateFeature and the CorrelationResult shape being asserted; packages/gherkin/test/Correlate.test.ts — the correlateFixture / scenarioAt / stepAt helpers reused verbatim"
  - phase: 02-03
    provides: "packages/gherkin/src/Model.ts — ParsedScenario and ParsedStep, and the Group D fixtures (outline-two-examples-blocks, outline-distinct-row-names, outline-identical-row-names, id-collision-a, id-collision-b, docstring-and-datatable)"
  - phase: 02-04
    provides: "parseDocument and compilePickles — the two halves correlateFixture threads one IdGenerator.uuid() through"
provides:
  - "packages/gherkin/test/Correlate.test.ts — 40 tests total (19 added here), closing Group D: F21, F23, F24, F25, F26, F27"
  - "F26 as the executable form of roadmap success criterion 4 — astName survives correlation un-interpolated on every Outline row"
  - "F27 as the executable guarantee that per-row location.line is distinct, the raw material Phase 6 needs for unique test titles"
  - "F23 as the regression pin for decision D3 — a return to IdGenerator.incrementing() fails by name instead of corrupting a cross-file map"
  - "F25 as the scope-boundary guard for PARSE-04 — the step argument stays a raw PickleStepArgument, with no DataTable wrapper methods on it"
affects: [02-08, 02-09, 02-10, 02-11]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Fixture-row-id title prefixes (F23:, F24:, F25:, F26:, F27:) guarantee uniqueness under vitest/no-identical-title across a growing single-file suite"
    - "Cross-file id independence asserted by comparing an array's length to the size of a Set built from it, never by pre-deduplicating"
    - "A scope boundary owned by a later phase is pinned with a NEGATIVE assertion (the wrapper methods are absent), so premature scope creep becomes a named test failure rather than a merge conflict"
    - "A property that exists only to be consumed downstream (astName, per-row location) is asserted with toBe on the exact literal, never toContain, so the interpolated value cannot satisfy it by accident"

key-files:
  created: []
  modified:
    - packages/gherkin/test/Correlate.test.ts

key-decisions:
  - "REQUIREMENTS.md left untouched: PARSE-02 is worded as a claim about `loadFeature`, which does not exist until plan 02-08 — same precedent 02-04 and 02-05 set"
  - "allNodeIds is a module-level helper rather than inline, because F23's three assertions each need the same union and an inline version would invite one of them to quietly deduplicate"
  - "F24's tag assertion is a whole-array toEqual plus an explicit not.toContain of the other block's tag, because a union-every-Examples-tag regression would pass toContain on all three rows"
  - "The F25 wrapper guard checks both `argument` and `argument.dataTable`, since a Phase 4 DataTable wrapper could plausibly be installed at either level"

patterns-established:
  - "A downstream phase's contract is pinned in the phase that produces the data, with an inline comment naming the owning phase, so a future reader does not 'helpfully' implement it early"
  - "Where uuid() makes ids non-reproducible, that cost is recorded as a passing test (two correlations of identical source produce different ids) rather than only as a comment"

requirements-completed: []

# Metrics
duration: 8min
completed: 2026-08-28
---

# Phase 02 Plan 06: Group D Correlation Correctness Summary

**Closes PARSE-02's fixture set by pinning the five Group D properties that are expensive to retrofit once a downstream phase has consumed them: per-Examples-block tag scoping, cross-file node-id independence, the un-interpolated `astName` that success criterion 4 rests on, the per-row `location.line` Phase 6 needs for unique titles, and a step carrying both a DocString and a DataTable with neither dropped nor prematurely wrapped.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-08-28T14:24:00Z
- **Completed:** 2026-08-28T14:32:00Z
- **Tasks:** 2
- **Files modified:** 1 (`Correlate.test.ts`, 196 → 396 lines)
- **Tests added:** 19 (21 → 40 in the file; 147 → 166 repo-wide)

## Accomplishments

- **F24 — two `Examples:` blocks, one Outline.** Three scenarios, one per body row across both blocks, all sharing a single `astId`. That shared id is asserted directly (`new Set(astIds).size === 1`) because it is the structural reason `AstIndex.byScenarioId` maps to an *array*; a one-to-one map would silently drop every row but one. Per-block tags land only on their own block's rows, asserted both positively (whole-array `toEqual`, so the examples-block tag is pinned as last in `compile()`'s flattening order) and negatively (`not.toContain` the other block's tag) — a regression that unioned every Examples tag onto every row would pass a `toContain` check on all three.
- **F26 — roadmap success criterion 4.** Both rows of `outline-distinct-row-names.feature` expose `astName === "outline <name>"`, asserted with `toBe` on the exact literal including the angle brackets, while their `name` values interpolate to `outline a` and `outline b`. This is the property ARCHITECTURE.md Open Question 4 settles on: a Scenario is matched to its registered definition by the *un-interpolated* name, because that is the only string the author typed in the `.steps.ts` file. If correlation ever stopped carrying `astName` — or set it to the interpolated value — every Outline row would fail to find its definition, and nothing else in the suite would have said so.
- **F27 — identical row names, distinct locations.** `outline-identical-row-names.feature` gives three rows the same `name` (`same title`, the Outline title references no column) and three distinct `location.line` values, asserted via `new Set(lines).size === 3`. The inline comment records that this phase deliberately does *not* invent a test title: exposing per-row `location` is this phase's job, deciding the title format is Phase 6's (Pitfalls 21/23, Gap 4). Appending a row index here would put the format in two places at once.
- **F23 — decision D3's regression pin.** `id-collision-a.feature` and `id-collision-b.feature` are correlated in one test, each with its own fresh `IdGenerator.uuid()`, and the union of every scenario id, `astId` and step id is duplicate-free. Three complementary assertions: the union has no duplicates; the two files' id sets are *disjoint* (a per-file uniqueness check would pass even if both numbered from `"1"`); and two correlations of the *same* source produce different ids, which is D3's cost recorded as an executable fact rather than only a comment — the reason node ids must never be persisted or compared across `loadFeature` calls.
- **F25 — both step arguments survive.** The single step of `docstring-and-datatable.feature` carries a `docString` (`argumentIndex` 1) *and* a `dataTable` (`argumentIndex` 2), with content and rows passed through unmodified. This is a real `@cucumber/gherkin@42` capability that the `if (docString) … else if (dataTable)` shape in every pre-v42 example silently drops.
- **F25's scope-boundary guard.** The argument is asserted to be a *raw* `PickleStepArgument`: neither it nor its `dataTable` has a `hashes`, `raw` or `rowsHash` method. The `DataTable` wrapper and the DocString+DataTable calling convention are PARSE-04's deliverable (ADR-EC-008). A wrapper added here would not conflict at merge time — it would quietly ship a second, competing DataTable API; the negative assertion turns that into a named failure the moment someone adds one.

## Task Commits

1. **Task 1: Outline shape assertions — F24, F26, F27** — `64d8001` (test)
2. **Task 2: cross-file id independence (F23) and dual step arguments (F25)** — `a190ec9` (test)

## Files Modified

- `packages/gherkin/test/Correlate.test.ts` (196 → 396 lines) — five new `describe` blocks and one new module-level helper (`allNodeIds`). The existing `correlateFixture`, `scenarioAt` and `stepAt` helpers from 02-05 are reused; no copy was made.

## Decisions Made

- **`REQUIREMENTS.md` left untouched.** PARSE-02 is worded "`loadFeature` correlates the raw `GherkinDocument` …". `loadFeature` does not exist until plan 02-08. Checking the box today would make `REQUIREMENTS.md` assert something untrue, which AGENTS.md §4 forbids. The correlation engine and its full Group D fixture set are complete and tested; the row stays `Pending` for whichever plan lands `loadFeature.ts`. This follows the precedent 02-04 and 02-05 set.
- **`allNodeIds` is a module-level helper, deliberately not deduplicating.** F23's whole mechanism is comparing an array's length against the size of a `Set` built from it. A helper that returned a `Set`, or deduplicated internally, would make all three F23 assertions vacuously true. Extracting it also keeps the three assertions honest about using the *same* union.
- **The F25 guard checks two levels.** A Phase 4 `DataTable` wrapper could plausibly be installed either on `argument` itself or on `argument.dataTable`. Both are asserted method-free, so neither placement slips through.
- **F24's location assertion pins concrete lines (`[9, 10, 15]`), not just distinctness.** F27 already covers "distinct"; F24's value is proving that the *second block's* row is located in the second block (line 15) rather than continuing the first block's numbering, which a per-Outline rather than per-row location lookup would get wrong.

## Deviations from Plan

None on scope, design or assertions — every property the plan specified is asserted, on the fixture it named, with the assertion shape it called for.

### Environment Fixes

**1. [Rule 3 - Blocking] The worktree had a stale base and no `node_modules`**

- **Found during:** startup, before Task 1
- **Issue:** The worktree was spawned at `f640f4a` (before Phase 2 existed) and carried no `node_modules`, so no verification command could run.
- **Fix:** `git reset --hard 57098a8` per the startup branch check — which ran only *after* the HEAD assertion confirmed a `worktree-agent-*` branch — then `pnpm install --frozen-lockfile`. No package was added, changed or substituted; the lockfile was not modified. `git status` was clean afterwards (`node_modules` is gitignored).
- **Files modified:** none
- **Verification:** `pnpm test` exit 0
- **Committed in:** n/a (no tracked file changed)

### Deliberate Non-Deviations

- **F24's rows carry exactly one tag each, so the "examples-block tag last" ordering is asserted as a whole-array `toEqual` on a one-element array.** The fixture declares no Feature- or Scenario-level tag, so `["@blockone"]` *is* the full flattened list and the block tag *is* last. The multi-level flattening order (`@featuretag`, `@ruletag`, `@scenariotag`, `@exampletag`) is already asserted order-sensitively on F21 by plan 02-05; duplicating it here would test `compile()` twice rather than testing per-block scoping once. The per-block property this fixture exists for is covered by the `not.toContain` pair.
- **`grep -cE 'hashes|rowsHash'` is 2, both in the F25 guard.** One occurrence is the explanatory comment naming Phase 4 as the owner; the other is the `["hashes", "raw", "rowsHash"]` array driving the `not.toHaveProperty` loop. Neither is a positive assertion, and `Correlate.ts` itself still has zero occurrences.
- **No fixture was created or edited.** All six Group D fixtures already existed from plan 02-03; every assertion was written against the fixtures as authored, after probing their real correlated output rather than assuming it.

---

**Total deviations:** 0 to the plan; 1 environment fix (Rule 3, worktree bootstrap).
**Impact on plan:** None.

## Issues Encountered

- Real correlated output was probed with a throwaway test file before any assertion was written, so no assertion was guessed. It confirmed the two non-obvious values the plan did not state: F24's rows are at lines 9, 10 and 15 (the second block restarts after its own header, it does not continue the first block's numbering), and F25's `argumentIndex` values are 1 and 2 rather than 0 and 1. The probe file was deleted before Task 1's commit and never staged.
- `outline-two-examples-blocks.feature`'s Outline title is a bare `outline` with no placeholder, so its `astName` and `name` are equal on every row. The `astName !== name` assertion therefore belongs to F26 (where the title *does* reference a column) and is not made on F24.

## Verification Results

| Gate | Result |
| --- | --- |
| `pnpm vitest run packages/gherkin/test/Correlate.test.ts` after Task 1 | 33 passed (requirement: > 21 and at least 18) |
| `pnpm vitest run packages/gherkin/test/Correlate.test.ts` after Task 2 | 40 passed (requirement: at least 22) |
| `pnpm test` (whole repo) | 7 files, 166 tests passed |
| `pnpm build` (`tsc -b`) | exit 0 |
| `pnpm lint` (oxlint + dprint check) | exit 0 — proves no duplicate `it` title across the file |
| `pnpm circular` (madge) | no circular dependency found |
| `grep -c 'outline-two-examples-blocks\|outline-distinct-row-names\|outline-identical-row-names'` | 3 (requirement: at least 3) |
| `grep -c 'outline <name>'` | 2 (requirement: at least 1) |
| `grep -c 'new Set'` | 4 (requirement: at least 1) |
| `grep -c '@blockone'` | 4 (requirement: at least 1) |
| `grep -c '@blocktwo'` | 3 (requirement: at least 1) |
| `grep -c 'id-collision-a\|id-collision-b'` | 6 (requirement: at least 2) |
| `grep -c 'incrementing'` | 2 (requirement: at least 1) |
| `grep -cE 'hashes\|rowsHash'` | 2, both inside the negative F25 guard (requirement: at least 1, negative only) |
| `grep -c 'docString'` | 4 (requirement: at least 1) |
| `grep -c 'dataTable'` | 5 (requirement: at least 1) |
| `Correlate.test.ts` line count | 396 (requirement: at least 200) |
| Deletions in either commit | none |

## Must-Haves

| Truth | Where asserted |
| --- | --- |
| An Outline with two Examples blocks yields one scenario per row, with per-block tags landing only on that block's rows | F24, four assertions in `describe("one Outline with two Examples blocks (F24)")` |
| Two Features loaded in one process share no node ids | F23, `"collects a duplicate-free union of node ids across two separate features"` plus the disjointness check |
| An Outline whose interpolated row names all differ still exposes the single un-interpolated AST name | F26, `"exposes the single un-interpolated astName on BOTH rows"` |
| An Outline whose rows share a name exposes distinct per-row locations, so Phase 6 can build unique titles | F27, `"gives each row a distinct location.line, the raw material for a unique title"` |
| A step carrying both a DocString and a DataTable survives correlation with both arguments intact | F25, three assertions plus the raw-argument guard |

## Known Stubs

None. This plan adds no source code and no production surface — it is assertions over an implementation that plan 02-05 completed. Every fixture it names already existed and every assertion runs against real correlated output.

## Threat Flags

None. This plan adds no network endpoint, no auth path, no file access beyond `readFileSync` of repo-local fixtures, and no schema at a trust boundary.

Register dispositions honoured:

- **T-02-14 (Spoofing, node-id collision across `loadFeature` calls)** — mitigated: F23 asserts a duplicate-free union across two Features correlated in one process, and separately asserts the two files' id sets are disjoint. A regression from `IdGenerator.uuid()` to `incrementing()` fails these by name rather than corrupting a downstream cross-file map silently.
- **T-02-15 (Tampering, scope creep of `PickleStepArgument` into a Phase 4 wrapper)** — mitigated: F25 asserts neither `argument` nor `argument.dataTable` carries a `hashes`, `raw` or `rowsHash` method, so a premature wrapper is a test failure rather than a Phase 4 merge conflict.
- **T-02-01 (DoS, ReDoS)** — mitigated: no `RegExp` is constructed anywhere in this plan. Every assertion is a literal string comparison, a whole-array `toEqual`, or a `Set` size check.

## Next Phase Readiness

- **PARSE-02's fixture set is closed.** Group D is complete: F21 (02-05) plus F23, F24, F25, F26, F27 (here). Roadmap success criteria 2 and 4 both have explicit passing assertions.
- **Phase 6 has what it needs for unique titles** and knows the format is its own decision: F27 guarantees distinct `location.line` per row, F26 guarantees `astName` is available un-interpolated for definition matching, and both carry inline comments naming Phase 6 as the owner of the title format.
- **Phase 4 (PARSE-04) inherits an unwrapped argument** with both `docString` and `dataTable` present and `argumentIndex` intact, and a test that will fail the moment a `DataTable` wrapper is introduced anywhere but PARSE-04.
- **`REQUIREMENTS.md` row for PARSE-02 remains `Pending`** and belongs to whichever plan lands `loadFeature.ts` (02-08).
- No source file was touched, so plan 02-07's concurrent work on `Validate.ts` / `Validate.test.ts` cannot conflict with this one.

## Self-Check: PASSED

- `packages/gherkin/test/Correlate.test.ts` verified present on disk at 396 lines.
- Both claimed commits verified present in `git log`: `64d8001`, `a190ec9`.
- No file deletions in either commit; working tree clean after each.

---

*Phase: 02-loadfeature-parse-compile-correlate*
*Completed: 2026-08-28*

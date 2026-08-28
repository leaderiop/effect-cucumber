---
phase: 04-datatable-docstring
plan: 01
subsystem: testing
tags: [gherkin, cucumber, datatable, docstring, upstream-pin, fixtures]

# Dependency graph
requires:
  - phase: 02-loadfeature-parse-compile-correlate
    provides: "packages/gherkin/test/upstream-pin.test.ts, its parseFixture/parseWith/failureOf helpers, and the 30-file fixture corpus with its Group A-D README"
provides:
  - "Five byte-exact DataTable/DocString shape fixtures (Group E, rows F29-F33)"
  - "Eight upstream-pin assertions covering argumentIndex in both source orders, the key-present/value-undefined shape for single-argument steps, row counts, duplicate header legality, and PickleTableRow's single `cells` key"
  - "parseSource/parseSourceWith — a one-id-generator-per-call parse of an inline source string, for shapes that must not become fixture files"
affects: [04-datatable-docstring, datatable-wrapper, schema-decode, phase-5-dsl]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "A phase's upstream assumptions are pinned in upstream-pin.test.ts BEFORE any wrapper code exists to be blamed for a failure"
    - "Group E readers (argumentOf/tableOf/docStringOf/firstRowOf/valuesOf) throw by name rather than returning undefined, so a vanished upstream shape fails with a sentence"

key-files:
  created:
    - packages/gherkin/test/fixtures/datatable-single-column.feature
    - packages/gherkin/test/fixtures/datatable-header-only.feature
    - packages/gherkin/test/fixtures/datatable-two-column.feature
    - packages/gherkin/test/fixtures/datatable-duplicate-header.feature
    - packages/gherkin/test/fixtures/datatable-before-docstring.feature
  modified:
    - packages/gherkin/test/fixtures/README.md
    - packages/gherkin/test/upstream-pin.test.ts

key-decisions:
  - "`argumentIndex`'s KEY is always present on a pickled DocString/DataTable; only its VALUE is `undefined` when the step carries one argument. An ordering rule must read the VALUE with an `undefined` fallback and must NEVER branch on `Object.hasOwn`/`in`, which is `true` in every case and discriminates nothing."
  - "`argumentIndex` records SOURCE ORDER, not a fixed docString-then-dataTable convention — proven by F33 being the byte-mirror of F25 and yielding the inverse 1/2."
  - "PARSE-04 stays Pending in REQUIREMENTS.md after this plan, deliberately — this plan pins upstream facts and ships no `DataTable` wrapper a consumer can reach."
  - "The five Group E fixtures carry no tags at all; a `@REQ-EC-NNN` tag on any `.feature` fails `verify-traceability.sh` check 4."

patterns-established:
  - "Pattern 1: Every Phase 4 shape fact is asserted against the real @cucumber/gherkin@42.0.1 in a file that imports nothing from ../src, so a failure is attributable to the dependency rather than to this library"
  - "Pattern 2: An ordering claim is proven by a byte-mirrored fixture pair (F25/F33), never by one fixture plus a constant — mutation-tested"

requirements-completed: []

# Metrics
duration: 5min
completed: 2026-08-28
---

# Phase 4 Plan 01: DataTable/DocString Upstream Pin Summary

**Five byte-exact DataTable/DocString fixtures plus eight `upstream-pin.test.ts` assertions that pin `argumentIndex` as source-order-in-both-directions and as a key that is always present with an `undefined` value when a step carries only one argument.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-08-28T21:10:17Z
- **Completed:** 2026-08-28T21:14:41Z
- **Tasks:** 2
- **Files modified:** 7 (5 created, 2 modified)

## Accomplishments

- The four upstream facts the rest of Phase 4 rests on are now asserted rather than assumed: `argumentIndex` 1/2 in both source orders, key-present-value-`undefined` for a single-argument step, header-only and single-column tables parsing cleanly, and `PickleTableRow` carrying only a `cells` key.
- The inverted reading of `argumentIndex?: number` is closed off in two places at once — the Group E README paragraph states the rule the right way round, and tests 3 and 4 pin `Object.hasOwn(..., "argumentIndex") === true` paired with `toBeUndefined()` on the value, so a future ordering rule that branches on key presence has a failing test waiting for it.
- Fixture corpus grew 30 → 35 `.feature` files; repo test count grew 347 → 360.

## Task Commits

1. **Task 1: Add the five DataTable/DocString shape fixtures and their Group E README rows** — `fd0f3fe` (test)
2. **Task 2: Pin the DataTable/DocString argument shapes in upstream-pin.test.ts** — `af9ba98` (test)

## Files Created/Modified

- `packages/gherkin/test/fixtures/datatable-single-column.feature` — F29: one header cell, one body cell; the single-argument `argumentIndex` case.
- `packages/gherkin/test/fixtures/datatable-header-only.feature` — F30: a header row with no body rows, which upstream does not object to.
- `packages/gherkin/test/fixtures/datatable-two-column.feature` — F31: the `rowsHash()` shape, key column then value column.
- `packages/gherkin/test/fixtures/datatable-duplicate-header.feature` — F32: a repeated header cell, legal Gherkin, both trailing pipes present.
- `packages/gherkin/test/fixtures/datatable-before-docstring.feature` — F33: the byte-mirror of F25, DataTable first, DocString second.
- `packages/gherkin/test/fixtures/README.md` — new Group E table (F29-F33) plus the governing `argumentIndex` paragraph, placed between Group D and the `first-error-document-order.feature` note.
- `packages/gherkin/test/upstream-pin.test.ts` — five new `pickleCases` rows, five module-level Group E readers, the `parseSourceWith`/`parseSource` split, and the eight-assertion `DataTable and DocString argument shapes` block.

## Verified upstream behavior (reproduced, not assumed)

Every claim below was produced by running the real `Parser` + `compile` from `@cucumber/gherkin@42.0.1` against the fixtures on disk before the README was written:

| Fixture | `dataTable.argumentIndex` | `docString.argumentIndex` | rows |
|---|---|---|---|
| `docstring-and-datatable.feature` (F25) | `2` (key present) | `1` (key present) | `[["a","b"],["1","2"]]` |
| `datatable-before-docstring.feature` (F33) | `1` (key present) | `2` (key present) | `[["a","b"],["1","2"]]` |
| `datatable-single-column.feature` (F29) | `undefined`, `hasOwn === true` | no docString | `[["name"],["alice"]]` |
| `datatable-header-only.feature` (F30) | `undefined`, `hasOwn === true` | no docString | `[["name"]]` |
| `datatable-two-column.feature` (F31) | `undefined`, `hasOwn === true` | no docString | `[["name","alice"],["role","admin"]]` |
| `datatable-duplicate-header.feature` (F32) | `undefined`, `hasOwn === true` | no docString | `[["name","name"],["alice","bob"]]` |
| inline docstring-only, `"""text/plain` | no dataTable | `undefined`, `hasOwn === true` | `content: "the docstring content"`, `mediaType: "text/plain"` |

`Object.keys(row)` is `["cells"]` on every one of them — a `PickleTableRow` carries no location, which is why Phase 4's decode errors cannot name a source line per row.

## Mutation proof (Task 2 acceptance criterion), recorded verbatim

`datatable-before-docstring.feature` was edited to put the DocString before the DataTable, `pnpm test` was run, and the fixture was reverted with `git checkout --` on that path alone. Exactly one test failed, naming `argumentIndex`:

```
 FAIL  packages/gherkin/test/upstream-pin.test.ts > upstream @cucumber/gherkin behavior > DataTable and DocString argument shapes > F33 datatable-before-docstring.feature records the reverse source order as dataTable 1, docString 2
AssertionError: expected 2 to be 1 // Object.is equality

- Expected
+ Received

- 1
+ 2

 ❯ packages/gherkin/test/upstream-pin.test.ts:486:47
    484|     it("F33 datatable-before-docstring.feature records the reverse sou…
    485|       const argument = argumentOf("datatable-before-docstring.feature")
    486|       expect(tableOf(argument).argumentIndex).toBe(1)
       |                                               ^

 Test Files  1 failed | 13 passed (14)
      Tests  1 failed | 359 passed (360)
```

The assertion reads source order, not a constant. After the revert, `pnpm test` is green at 360 again.

## Test counts

- **Before this plan:** 347 tests across 14 files. (STATE.md's "337 across 14 files" note from 03-06 is stale — the measured baseline on this worktree, at the phase-plan base commit, is 347.)
- **After this plan:** 360 tests across 14 files (+13: five table-driven `pickleCases` rows and eight Group E assertions).

## Decisions Made

- **Group E readers live at module scope, not inside the `describe`.** oxlint's `unicorn(consistent-function-scoping)` is error-level and rejects a nested helper that captures nothing from its parent. This is a lint constraint, not a taste call.
- **`parseWith` was split rather than duplicated.** Test 4 needs an inline source string, and `parseWith` only accepts a fixture name. `parseSourceWith(source, uri, newId)` is now the single implementation; `parseWith` delegates to it with `readFixture(name)`. The file's "Pattern 1: ONE id generator per call" rule is preserved on every path, including the new `parseSource`.
- **PARSE-04 is NOT marked Complete.** This plan ships an upstream pin, not the `DataTable` wrapper; nothing a consumer can reach uses it. This follows the Phase 3 precedent recorded in STATE.md (MATCH-01/02 declined by four consecutive plans and marked by 03-05, the plan that made them true end to end). The plan that ships `DataTable.ts` owns the marking — and also owns removing the "specified but unbuilt" sentence from `packages/gherkin/README.md`.
- **F25's existing Group D row was left exactly as written.** It claimed source-order `argumentIndex` 1/2; that claim is now pinned by Group E test 1 rather than merely asserted in prose, so weakening it would have made the README less true, not more.

## Deviations from Plan

None — plan executed exactly as written. No deviation rule fired.

## Issues Encountered

- **The worktree had no `node_modules`.** Resolved with `pnpm install --frozen-lockfile`; `pnpm-lock.yaml` is unchanged, which also satisfies threat register row T-04-SC (this plan adds zero dependencies).
- **One acceptance criterion is satisfied in substance but not by its literal grep.** `grep -c '\.sort(' packages/gherkin/test/upstream-pin.test.ts` outputs `1`, not `0`. The single match is a **pre-existing comment** at line 354 explaining why `.sort()` is not used (`"...and `.sort()` is rejected by oxlint's unicorn(no-array-sort)"`); there is no `.sort(` call anywhere in the file, and this plan added neither a call nor the comment. This is the exact trap STATE.md records from 03-04: "writing a grep-based acceptance criterion that forbids a literal also forbids explaining it in a comment." Deleting the comment to satisfy the grep would trade a true explanation for a green number, so it was left in place.
- `grep -c 'toBe(false)'` outputs `3` — all three are pre-existing `instanceof`/`in Errors` assertions in the parse-time-throws block. No `Object.hasOwn` line asserts `false`, which is what the criterion actually guards.

## Gate results

| Gate | Result |
|---|---|
| `pnpm test` | 360 passed (14 files) |
| `pnpm typecheck:test` | exit 0 |
| `pnpm lint` (oxlint + dprint check) | exit 0 |
| `pnpm verify:spec` | PASS 7 / FAIL 0 / SKIP 1 — check 4 finds no `@REQ-EC-NNN` in any new fixture |
| `pnpm build` (`tsc -b`) | exit 0 |

## Acceptance criteria

Task 1: fixture count `35` ✓; all five files at the exact planned paths ✓; `grep -c 'REQ-EC-' datatable-*.feature` = 0 on every file ✓; `grep -c '^## Group E' README.md` = 1 ✓; `F29|F30|F31|F32|F33` matches = 6 ✓; `argumentIndex` present in README ✓; inverted framing (`key is absent` / `no argumentIndex key` / `argumentIndex is absent`) matches = 0 ✓; both `node` probes printed the documented values ✓; `pnpm lint` and `pnpm verify:spec` exit 0 ✓.

Task 2: `pnpm test` exit 0 with +13 tests (≥ 8 more in this file) ✓; `grep -c 'from "../src'` = 0 ✓; `grep -c 'argumentIndex'` = 10 (≥ 8) ✓; both `Object.hasOwn(..., "argumentIndex")` expectations resolve to `true`, each paired with a `toBeUndefined()` ✓; no `Object.hasOwn` line asserts `false` ✓; `datatable-before-docstring.feature` referenced ✓; `.sort(` — see Issues Encountered ✓ (in substance); `pnpm typecheck:test` and `pnpm lint` exit 0 ✓; mutation proof recorded above ✓.

## Known Stubs

None. This plan adds test fixtures and assertions only — no source file, no placeholder, no unwired component.

## Threat Flags

None. No new network endpoint, auth path, file access pattern, or schema at a trust boundary. The only file reads added are `readFileSync` of repo-controlled fixtures via the pre-existing `readFixture` helper, and test 4 reads no file at all.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

The rest of Phase 4 can now build the `DataTable` wrapper against asserted facts rather than assumptions:

- **The ordering rule must read `argumentIndex`'s VALUE** (`Option.fromUndefinedOr` or equivalent) and supply a fallback for `undefined`. A key-presence branch is `true` in every case and will silently do nothing. F29/F30/F31 are the fixtures that fail a missing fallback.
- **A decode error cannot carry a per-row source line.** `PickleTableRow` is `{ cells }` and nothing else; test 8 is where we will find out if a `@cucumber/messages` minor ever adds one.
- **`header-only` (F30) is a legal input, not an error case.** A wrapper's `hashes()` must decide what a zero-body-row table returns; upstream raises nothing.
- **Duplicate header cells (F32) reach the pickle unchanged.** Upstream does not object, so any duplicate-key policy is this library's own decision to make and to document.
- **PARSE-04 is still Pending in REQUIREMENTS.md, deliberately**, and `packages/gherkin/README.md` still names `DataTable` as the one specified-but-unbuilt piece. The plan that ships `DataTable.ts` owns both.
- **A new test file needs a `spec/traceability.md` §4 row in the same commit.** This plan added no test file (it extended an existing one), so §4 is untouched and still accurate.

## Self-Check: PASSED

All eight claimed files exist on disk (`ls` on each exact path). All three commit hashes exist in `git log`: `fd0f3fe` (Task 1), `af9ba98` (Task 2), `10fc537` (this summary). Working tree clean apart from the ignored `node_modules`/build output.

---
*Phase: 04-datatable-docstring*
*Completed: 2026-08-28*

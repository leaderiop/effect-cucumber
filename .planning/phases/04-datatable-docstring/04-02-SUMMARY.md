---
phase: 04-datatable-docstring
plan: 02
subsystem: gherkin
tags: [effect, effect-schema, cucumber-messages, datatable, prototype-pollution, tagged-error]

# Dependency graph
requires:
  - phase: 02-loadfeature
    provides: "Errors.ts's Schema.TaggedError pattern (Schema.Literals array form, Option-typed optional fields, no custom constructor) and the no-truncation message policy"
  - phase: 03-step-matching
    provides: "StepPatternError as the precedent for a separate error class rather than widening a closed reason union, and StepPatternMessages.ts's `<reason>: <sentences>` message convention"
provides:
  - "DataTableError: a third Schema.TaggedError with a closed four-member reason union and a row/column locator"
  - "DataTable.ts: the makeDataTable factory and the DataTable interface (_tag, uri, line, rows, raw, hashes, rowsHash)"
  - "raw(): total, returns every row including the header"
  - "hashes(): Effect-returning, maps body rows against the header, fails loudly on a duplicate header column"
  - "rowsHash(): Effect-returning, fails loudly on a row that is not exactly two cells wide and on a duplicate key"
  - "A mutation-proven prototype-pollution guard for __proto__ header cells (threat T-04-03)"
affects: [04-03-decode-hashes, 04-04-step-argument-union-and-barrel, 04-05-spec-reconciliation, 06-step-registration-and-matching]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Total accessor stays pure; fallible accessors return Effect — the asymmetry is the loud-failure contract, not an oversight"
    - "Records over feature-file-derived keys are built with Object.fromEntries, never an indexed assignment"
    - "A new failure kind gets its own Schema.TaggedError class rather than widening a closed reason union"

key-files:
  created:
    - packages/gherkin/src/DataTable.ts
    - packages/gherkin/test/DataTable.test.ts
  modified:
    - packages/gherkin/src/Errors.ts

key-decisions:
  - "DataTableError is a third error class, not more members on LoadFeatureErrorReason (closed at ten by BEH-EC-014) or StepPatternErrorReason (scoped to author-written patterns)"
  - "DataTableError.line is the STEP's line because a PickleTableRow carries no location field at all; DataTableError.row is a 1-based body-row ordinal that narrows it"
  - "raw() is pure, hashes()/rowsHash() return Effect — the two fallible accessors have real failure modes @cucumber/cucumber resolves by letting the last cell win"
  - "hashes() validates the header row even when there are zero body rows, so a duplicate header column cannot hide behind a header-only table"
  - "rowsHash() checks every row's width before reading any key, so the 'not a two-column table' verdict never depends on which row repeated a key first"
  - "No ragged-row branch anywhere: @cucumber/gherkin's parser guarantees equal cell counts within one table (F10), so a defensive branch would be unreachable and untestable"

patterns-established:
  - "Object.fromEntries for every record keyed by .feature file content — a correctness requirement (T-04-03), enforced by a mutation-proven test"
  - "Effect failure assertions in this package use an Effect.match-based outcome helper, not expect().toThrow() (vitest/require-to-throw-message is error-level)"
  - "Accessor-semantics tests build inline PickleTable literals and parse no fixture, so a failure is attributable to DataTable.ts alone"

requirements-completed: [PARSE-04]

# Metrics
duration: 8min
completed: 2026-08-28
---

# Phase 4 Plan 02: DataTable Wrapper Summary

**`@effect-cucumber/gherkin`'s own DataTable wrapper — a total `raw()` plus Effect-returning `hashes()`/`rowsHash()` that fail loudly with a named `DataTableError` and a row/column locator where `@cucumber/cucumber` lets the last cell win.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-08-28T23:10:44Z
- **Completed:** 2026-08-28T23:18:56Z
- **Tasks:** 3
- **Files modified:** 3 (2 created, 1 modified)

## Accomplishments

- `DataTableError` added to `Errors.ts` as a third `Schema.TaggedError`, with a closed four-member reason union (`DuplicateHeaderColumn`, `DuplicateRowKey`, `RowsHashRequiresTwoColumns`, `RowDecodeFailed`) and the `row`/`column` locator neither existing error class carries. Note (e) of the module doc comment records why a third class was correct rather than widening BEH-EC-014's closed ten-member union.
- `DataTable.ts` implements ADR-EC-008's correction: the accessors that live in `@cucumber/cucumber` (a runner ADR-EC-011 keeps out of this dependency graph) are implemented here instead, over the raw `{ rows: [{ cells: [{ value }] }] }` shape.
- Both silently-wrong shapes this repo refuses to ship are surfaced as named failures: a duplicate header column, and a `rowsHash()` over a table that is not two columns wide.
- The prototype-pollution guard (threat T-04-03) is mutation-proven live: replacing `Object.fromEntries` with an assignment loop makes the guard test fail, and reverting makes it pass.
- Repo test count: **347 → 362** (15 new tests, 14 → 15 test files). No pre-existing test changed.

## Task Commits

1. **Task 1: Add DataTableError as a third error class on Errors.ts** — `45b369e` (feat)
2. **Task 2: Create DataTable.ts with the raw/hashes/rowsHash accessors** — `086303b` (feat)
3. **Task 3: Test the accessor semantics, the edge cases, and the `__proto__` guard** — `b13904c` (test)

## Files Created/Modified

- `packages/gherkin/src/Errors.ts` — added `DataTableErrorReason` (four members) and the `DataTableError` class; extended the module doc comment with note (e). The existing ten-member `LoadFeatureErrorReason` and nine-member `StepPatternErrorReason` unions are untouched (`grep -c '"MissingFile"'` still outputs `2`, exactly as before).
- `packages/gherkin/src/DataTable.ts` — new, 267 lines. The `DataTable` interface, the `makeDataTable` factory, and the module-scope helpers `cellsOf`, `quoteRow`, `firstDuplicate`, `dataTableError` and `recordOf`.
- `packages/gherkin/test/DataTable.test.ts` — new, 221 lines, 15 tests. Inline `PickleTable` literals only; parses no feature fixture.

`packages/gherkin/src/index.ts` is provably untouched (`git diff 3ebb845 HEAD -- packages/gherkin/src/index.ts` is empty) — plan 04-04 owns the Phase 4 barrel surface, matching the convention `StepPatternError` followed in Phase 3.

## Verification

All six gates green at the final commit:

| Gate | Result |
|------|--------|
| `pnpm build` | exit 0 — no `overriddenSchemaConstructor` or other `@effect/tsgo` diagnostic on the new `Schema.TaggedError` subclass |
| `pnpm test` | exit 0 — 362 passed / 15 files; `Contracts.test.ts`'s closed-union assertions still pass |
| `pnpm typecheck:test` | exit 0 |
| `pnpm lint` | exit 0 (oxlint + dprint) |
| `pnpm circular` | exit 0 — no intra-package cycle from `DataTable.ts` → `Errors.ts` |
| `pnpm verify:no-runner-dep` | exit 0 — runner/runtime independence ENFORCED |

Threat T-04-SC (dependency supply chain): zero dependencies added. `git diff 3ebb845 HEAD -- pnpm-lock.yaml` is empty — the lockfile is byte-identical, and `pnpm install --frozen-lockfile` succeeded against it.

## Mutation Proofs

Both were run against the committed implementation, observed, and reverted. `git diff --stat` was empty after each revert, confirming byte-identical restoration.

### Mutation proof 1 — the `__proto__` guard is live

**Changed:** `recordOf` in `packages/gherkin/src/DataTable.ts`, replacing

```ts
Object.fromEntries(header.map((name, index) => [name, row.cells[index]?.value ?? ""]))
```

with an assignment loop over a `{}` literal:

```ts
const record: Record<string, string> = {}
for (const [index, name] of header.entries()) {
  record[name] = row.cells[index]?.value ?? ""
}
return record
```

**Result:** exactly one test failed — `hashes > gives a __proto__ header cell an own property rather than mutating a prototype`, at the `Object.hasOwn` assertion:

```
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ packages/gherkin/test/DataTable.test.ts:154:48
    154|     expect(Object.hasOwn(record, "__proto__")).toBe(true)
```

Totals: `1 failed | 361 passed (362)`.

This is exactly the failure mode the comment on that test names: assigning a *string* to `record.__proto__` is silently a no-op under the spec (only an object or `null` is accepted), so the naive form leaves **no own property behind at all** and the column simply disappears from the result. `Object.getPrototypeOf(record) === Object.prototype` still holds in the naive case, so the `hasOwn` assertion — not the prototype-identity one — is the assertion carrying the guard.

### Mutation proof 2 — the `DuplicateHeaderColumn` reason tag is tested

**Changed:** deleted the entire duplicate-header check from `hashes()` in `packages/gherkin/src/DataTable.ts` (the `firstDuplicate(header)` guard and its `Effect.fail`), leaving the last cell to win.

**Result:** exactly one test failed — `hashes > fails with DuplicateHeaderColumn, naming the repeated column and quoting the whole header`:

```
Error: expected the accessor to fail, but it succeeded with [{"name":"bob"}]
 ❯ fails packages/gherkin/test/DataTable.test.ts:82:11
 ❯ packages/gherkin/test/DataTable.test.ts:128:19
```

Totals: `1 failed | 361 passed (362)`.

The success value in the failure message — `[{"name":"bob"}]` — is the last-cell-wins result itself, the exact silently-wrong output this reason tag exists to prevent. The failing test is the reason-tag test, not a content-shape test, which is what the acceptance criterion required: the tag is genuinely asserted, and the `fails` helper's "succeeded when it should have failed" branch is live rather than decorative.

## Decisions Made

- **`hashes()` validates the header row before, and independently of, the body rows.** The plan specified `[]` for a header-only table and a `DuplicateHeaderColumn` failure for a repeated header cell, without saying which wins when both hold. A duplicate header column is a fault in the header itself, so it is reported whether or not body rows exist — a header-only table that quietly returned `[]` would hide the fault until someone added a row. Recorded in a comment at the check.
- **`rowsHash()` checks widths across every row before reading any key.** Both orderings give the same answer for every case the plan enumerated, but a single interleaved pass would make the verdict "this is not a two-column table" depend on which row happened to repeat a key first. Two explicit passes make that independence structural.
- **One `?? ""` in `recordOf` is a type-level requirement, not a defensive branch.** `noUncheckedIndexedAccess` is on workspace-wide, so any index expression is `T | undefined`. The plan forbade a ragged-row branch because it would be unreachable and untestable; this is not that branch, and the module doc comment (d) says so explicitly so no one later "hardens" it into a real one.
- **Test outcomes are discriminated on a `failed: boolean` field, not on a `_tag`.** `no-underscore-dangle` is error-level in this repo for member expressions (documented in `Contracts.test.ts`), so a `_tag`-discriminated outcome helper would have required destructuring at every branch. The one place the test file does read a `_tag` — the `makeDataTable` identity test — destructures, matching the existing convention.

## Deviations from Plan

Two documentation-only adjustments; no behavioural deviation from the plan.

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed workspace dependencies in the worktree**

- **Found during:** Task 1 (before the first verification run)
- **Issue:** The parallel-execution worktree was created without `node_modules`, so `pnpm build`/`pnpm test` could not run at all.
- **Fix:** `pnpm install --frozen-lockfile`. Not a package-manager *add* — no package name was resolved, no manifest or lockfile changed; this is a restore of the already-pinned graph, so the package-legitimacy exclusion does not apply.
- **Files modified:** none (`pnpm-lock.yaml` byte-identical, verified against the base commit).
- **Verification:** `pnpm test` baseline 347 passed before any source change.
- **Committed in:** n/a — produced no tracked change.

**2. [Rule 3 - Blocking] Reworded a doc comment that tripped its own acceptance grep**

- **Found during:** Task 2 (acceptance criteria check)
- **Issue:** `grep -cE '\[[a-zA-Z]+\] = ' packages/gherkin/src/DataTable.ts` must output `0`, but returned `2` — both matches were prose in `recordOf`'s doc comment naming the forbidden `record[header] = value` pattern in order to warn against it. No code matched; the criterion's intent (no assignment-loop record building) was already satisfied.
- **Fix:** reworded the two prose mentions to "a loop that assigns into `record[header]`" and "written through an indexed assignment", preserving the warning while dropping the literal token sequence.
- **Files modified:** `packages/gherkin/src/DataTable.ts`
- **Verification:** the grep now outputs `0`; `pnpm build` and `pnpm lint` re-run clean.
- **Committed in:** `086303b` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 3 — blocking).
**Impact on plan:** None on behaviour or scope. Neither changed what was built; one restored a runnable environment, the other made a mechanical check agree with the intent it encodes.

## Issues Encountered

- The worktree's base commit was `f640f4a` rather than the plan's `3ebb845`. Resolved by the mandated `git reset --hard 3ebb845` in the worktree branch check, on a verified `worktree-agent-*` branch — no protected ref involved.
- `Effect.either` does not exist in `effect@4.0.0-rc.112`, and `Effect.flip` cannot express "assert this failed" cleanly (a success becomes a failure, so `Effect.runSync` throws before the type check can run). Resolved by building an `Outcome<A>` helper on `Effect.match`, which converts both channels to values and lets the "succeeded when it should have failed" case report what came back — a property mutation proof 2 then depended on.

## Known Stubs

None. `RowDecodeFailed` is a declared reason tag with no construction site yet; that is deliberate and specified by the plan (the reason union is written once and closed, and plan 04-03's `decodeHashes` raises it). It is a forward declaration, not a stub: nothing renders it and no code path returns a placeholder.

## Threat Flags

None. The only new surface is `.feature` file content flowing into object keys and into error messages, both already in the plan's threat register (T-04-03 mitigated by `Object.fromEntries` and mutation-proven; T-04-04 accepted under the existing no-truncation policy).

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Plan 04-03 can build `decodeHashes` directly on `hashes()`: the `RowDecodeFailed` reason tag, the `uri`/`line`/`row`/`column` locator fields, and the `Effect`-returning accessor signature are all in place.
- Plan 04-04 owns `packages/gherkin/src/index.ts`, which this plan deliberately left untouched. It needs to export `DataTable`, `makeDataTable`, `DataTableError` and `DataTableErrorReason`, and to add the `DataTable` arm to the `StepArgument` union — `_tag: "DataTable"` is already in place for that discrimination.
- Plan 04-05 should carry module doc comment (c) of `DataTable.ts` into `spec/`: ADR-EC-008's worked example is stale in two independent ways (`table.hashes()` is now an `Effect` that must be `yield*`-ed, and `Schema.decodeUnknown` is `Schema.decodeUnknownEffect` in effect v4). That note is written as the correction's source text.
- No blockers.

---
*Phase: 04-datatable-docstring*
*Completed: 2026-08-28*

---
phase: 04-datatable-docstring
plan: 03
subsystem: gherkin
tags: [effect, effect-schema, schema-issue, datatable, dependency-pin, tagged-error]

# Dependency graph
requires:
  - phase: 04-datatable-docstring
    plan: 02
    provides: "DataTable.ts's hashes() accessor, the DataTableError class, and the RowDecodeFailed reason tag declared-but-unconstructed"
  - phase: 02-loadfeature
    provides: "Errors.ts's no-truncation message policy and the Option-typed optional-field constructor requirement"
provides:
  - "decodeHashes: a data table's body rows decode through a caller-supplied Schema into typed rows"
  - "A failing row produces a DataTableError with reason RowDecodeFailed carrying uri, the step line, the 1-based body-row ordinal, the column name, the offending row verbatim, and the SchemaError as cause"
  - "firstIssuePath: the Pointer/Composite walk that recovers [rowIndex, columnName] from a SchemaError issue tree"
  - "schema-issue-pin.test.ts: the effect@4.0.0-rc.112 SchemaError issue-tree dependency pin"
  - "A DuplicateHeaderColumn table still fails as a shape fault through decodeHashes, mutation-proven"
affects: [04-04-step-argument-union-and-barrel, 04-05-spec-reconciliation, 06-step-registration-and-matching]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "A dependency's internal data shape that this library's own arithmetic depends on gets its own pin file importing nothing from ../src (third instance, after expressions-pin and upstream-pin)"
    - "SchemaIssue trees are discriminated on the _tag STRING, never instanceof — effect is a peer dependency and a duplicate copy would make instanceof silently false"
    - "A recovered locator is narrowed by an explicit typeof before use, so a reshaped path yields an ABSENT locator rather than a silently-wrong one"

key-files:
  created:
    - packages/gherkin/test/schema-issue-pin.test.ts
  modified:
    - packages/gherkin/src/DataTable.ts
    - packages/gherkin/test/DataTable.test.ts

key-decisions:
  - "decodeHashes owns the Schema.Array wrapping: the array index in the issue path is the .hashes() body-row index only because this function is what introduced the array level"
  - "table.hashes() runs before the decoder, so DuplicateHeaderColumn keeps its own reason tag instead of being flattened into RowDecodeFailed"
  - "The issue tree is walked by _tag string, not by instanceof SchemaIssue.Pointer — a duplicate effect copy would make instanceof false and degrade every located error into an unlocated one"
  - "decodeHashes' message leads with the row ordinal rather than with uri:line, deliberately departing from the three shape-fault messages' <uri>:<line>: <reason>: shape"
  - "SchemaIssue is imported as `import type` — it is used only in type positions and typescript/consistent-type-imports is error-level"
  - "The both-locators-absent branch is unreachable through this API against rc.112 and is kept anyway, justified by pin case 5 and threat T-04-06 rather than by speculation"

patterns-established:
  - "A pin file carries a deliberate SECOND COPY of a walk implemented in src, so an rc bump fails at the dependency rather than inside this library's logic"
  - "A precondition that did not hold is reported by throwing, never by wrapping an expect in an if (vitest/no-conditional-expect is error-level)"

requirements-completed: []

# Metrics
duration: 15min
completed: 2026-08-28
---

# Phase 4 Plan 03: decodeHashes Summary

**ADR-EC-008's actual promise made true: a data table decodes through `Schema` into typed rows, and a row that fails names its feature file, its step line, its 1-based body-row ordinal and its column instead of an array index into a value the step author never constructed.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-08-28T23:22:30Z
- **Completed:** 2026-08-28T23:37:40Z
- **Tasks:** 3
- **Files modified:** 3 (1 created, 2 modified)

## Accomplishments

- `decodeHashes(rowSchema)(table)` decodes every body row through a caller-supplied `Schema`, with the decoding-services channel propagating into the returned Effect's `R` rather than being erased to `never`.
- The generic parse failure `Schema` produces — `Expected string\n  at [1]["name"]`, an index into a value the step author never built — becomes a `DataTableError` naming the file, the step line, the row and the column.
- `schema-issue-pin.test.ts` pins the exact `effect@4.0.0-rc.112` issue-tree shape that recovery depends on, importing nothing from `../src`, so an rc bump that reshapes it fails where it is attributable to the dependency.
- The `DuplicateHeaderColumn` pass-through is mutation-proven: a decoder that ran before `hashes()` reports a generic decode failure and buries the real, fixable header fault.
- Repo test count: **375 → 389** (14 new tests, 15 → 16 test files). No pre-existing test changed.

## Task Commits

1. **Task 1: Pin effect's SchemaError issue-tree shape** — `bab10d3` (test)
2. **Task 2: Add decodeHashes to DataTable.ts** — `d8a52fa` (feat)
3. **Task 3: Test decodeHashes' success path and its located failure** — `5aa2971` (test)

Base commit for all three: `cb1c694`.

## Files Created/Modified

- `packages/gherkin/test/schema-issue-pin.test.ts` — new, 185 lines, 7 tests. `grep -c 'from "../src'` outputs `0`.
- `packages/gherkin/src/DataTable.ts` — added `isPointerIssue`, `isCompositeIssue`, `firstIssuePath`, `rowDecodeFailed` and the exported `decodeHashes`; extended the module doc comment with note (e). +155 / −2.
- `packages/gherkin/test/DataTable.test.ts` — added `describe("decodeHashes")` with 7 tests, reusing the existing `tableOf`/`dataTableOf`/`succeeds`/`fails` helpers. +106 / −1.

`packages/gherkin/src/index.ts` is provably untouched (`git diff cb1c694 HEAD -- packages/gherkin/src/index.ts` is empty) — plan 04-04 owns the Phase 4 barrel surface. `pnpm-lock.yaml` is byte-identical over the same range: zero dependencies added (threat T-04-SC).

## Verification

All six gates green at the final task commit:

| Gate | Result |
|------|--------|
| `pnpm build` | exit 0 — `S["DecodingServices"]` flows through the Effect `R` channel with no `@effect/tsgo` diagnostic |
| `pnpm test` | exit 0 — 389 passed / 16 files |
| `pnpm typecheck:test` | exit 0 |
| `pnpm lint` | exit 0 (oxlint + dprint) |
| `pnpm circular` | exit 0 |
| `pnpm verify:no-runner-dep` | exit 0 — runner/runtime independence ENFORCED |

## The message decodeHashes produces

Byte for byte, from test 4's table (`| name | age |` / `| alice | 30 |` / `| bob | old |` at `features/checkout.feature:12`):

```
Row 2 of the DataTable at features/checkout.feature:12 failed to decode, column "age": Expected a finite number
  at [1]["age"] The row was {"name":"bob","age":"old"}.
```

The newline is upstream's — `SchemaError.message` is embedded unedited, so the `at [1]["age"]` fragment retains its own line break. Nothing is elided.

And from test 6, where no single cell is at fault (the row schema rejects the whole row):

```
Row 1 of the DataTable at features/checkout.feature:12 failed to decode: Expected string
  at [0] The row was {"name":"alice","age":"30"}.
```

No `, column "..."` clause appears, because no column was recovered and none is guessed at.

## Mutation Proofs

Both were run against the committed implementation, observed, and reverted. `git diff --stat` showed `DataTable.ts` unchanged after each revert.

### Mutation proof 1 — the 1-based body-row ordinal is genuinely asserted

**Changed:** the `row` derivation in `rowDecodeFailed`, `Option.some(index + 1)` → `Option.some(index)`.

**Result:** 3 tests failed, the first being the ordinal assertion itself:

```
FAIL  packages/gherkin/test/DataTable.test.ts > decodeHashes > names the offending row and column when a body row fails the schema
AssertionError: expected { _id: 'Option', _tag: 'Some', …(1) } to deeply equal { _id: 'Option', _tag: 'Some', …(1) }

- Expected
+ Received

  {
    "_id": "Option",
    "_tag": "Some",
-   "value": 2,
+   "value": 1,
  }

 ❯ packages/gherkin/test/DataTable.test.ts:248:23
```

The two collateral failures are the message test (`expected 'Row 1 of the DataTable at features/ch…' to contain 'Row 2 of the DataTable at features/ch…'`) and test 6's `row` assertion (`value: 1` → `value: 0`). Totals: `3 failed | 386 passed (389)`.

The off-by-one is exactly the silently-wrong locator this ordinal exists to prevent: `Row 1` would point a reader at `alice`, whose row is fine.

### Mutation proof 2 — the `DuplicateHeaderColumn` pass-through is satisfied by ordering, not by accident

**Changed:** `decodeHashes` runs over `table.raw()` instead of `table.hashes()` — `Effect.flatMap(table.hashes(), …)` → `Effect.flatMap(Effect.succeed(table.raw() as never), …)`.

**Result:** all 7 `decodeHashes` tests failed, including both of the two the acceptance criterion named:

```
FAIL  packages/gherkin/test/DataTable.test.ts > decodeHashes > decodes every body row into the schema's type
Error: expected the accessor to succeed, but it failed with RowDecodeFailed
 ❯ succeeds packages/gherkin/test/DataTable.test.ts:67:11
```

```
FAIL  packages/gherkin/test/DataTable.test.ts > decodeHashes > propagates DuplicateHeaderColumn unchanged rather than reporting a decode failure
AssertionError: expected 'RowDecodeFailed' to be 'DuplicateHeaderColumn' // Object.is equality

Expected: "DuplicateHeaderColumn"
Received: "RowDecodeFailed"

 ❯ packages/gherkin/test/DataTable.test.ts:305:26
```

Totals: `7 failed | 382 passed (389)`. Test 7 failing with `RowDecodeFailed` is the point: the pass-through depends on `hashes()` running FIRST, not on the duplicate header happening to be rejected by the schema anyway.

## Decisions Made

- **`decodeHashes` owns the `Schema.Array` wrapping, and that is the mechanism rather than an ergonomic nicety.** The array index in the recovered path is the `.hashes()` body-row index *because* this function is what introduced the array level. A caller passing `Schema.Array(Row)` would push every path one level deeper and the reported ordinal would silently name the wrong row — so the signature takes a ROW schema and the double-wrap is rejected by the decode itself (pinned as one of the six element-failure shapes in `schema-issue-pin.test.ts`).
- **The issue tree is discriminated on the `_tag` string, never on `instanceof SchemaIssue.Pointer`.** `effect` is a peer dependency (ADR-EC-021), so a consuming project can hold two copies in one graph — the exact duplicate-package risk ADR-EC-015 was written about. `instanceof` returns `false` across two copies and would degrade every located error into an unlocated one with nothing failing. The pin asserts that the `_tag` string and the exported class still agree, so the copy-independent choice costs nothing.
- **`decodeHashes`' message leads with the row ordinal, not with `uri:line`.** The three failures already in this module are faults in the table's SHAPE, where the file location is the first thing a reader needs, and they use the house `<uri>:<line>: <reason>: <sentences>` form. A decode failure is a fault in one ROW against a schema the step author wrote, so the ordinal leads and the location follows inline. Recorded in module doc note (e); no cross-class message-format assertion exists in `Contracts.test.ts` to contradict it.
- **The both-locators-absent branch is kept although it is unreachable through this API.** Against `effect@4.0.0-rc.112` every element failure of an array decode is wrapped in a `Pointer` carrying the index — asserted over six element-failure shapes — and `decodeHashes` always feeds an array, so `firstIssuePath` never returns `[]` here today. It stays because the two `typeof` narrowings are required by `noUncheckedIndexedAccess` regardless (a `PropertyKey` is `string | number | symbol`, and `index + 1` on a string would concatenate) and because that is threat T-04-06's mitigation. This is NOT the kind of unreachable branch module doc note (d) forbids: note (d)'s ragged-row case is ruled out by an upstream PARSER GUARANTEE, while this one is ruled out only by a PINNED SHAPE that pin case 5 explicitly asserts can be otherwise.
- **`PARSE-04` is left Pending in `REQUIREMENTS.md`.** Its text also requires that "a step whose Gherkin carries both a DocString and a DataTable receives both", which is plan 04-04's `StepArgument` union. Marking it complete here would make the traceability table say something untrue (AGENTS.md §4).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed workspace dependencies in the worktree**

- **Found during:** Task 1 (before the first verification run)
- **Issue:** the parallel-execution worktree was created without `node_modules`, so no gate could run.
- **Fix:** `pnpm install --frozen-lockfile`. Not a package-manager *add* — no package name was resolved and no manifest or lockfile changed; this restores an already-pinned graph, so the package-legitimacy exclusion does not apply.
- **Files modified:** none (`pnpm-lock.yaml` byte-identical against `cb1c694`).
- **Verification:** `pnpm test` baseline 375 passed before any source change.
- **Committed in:** n/a — produced no tracked change.

**2. [Rule 3 - Blocking] `SchemaIssue` is imported with `import type`, not `import * as`**

- **Found during:** Task 1 (`pnpm lint`), and again in Task 2
- **Issue:** the plan specifies `import * as SchemaIssue from "effect/SchemaIssue"` and an acceptance grep for that exact string. `SchemaIssue` is used only in type positions in `DataTable.ts`, and oxlint's `typescript/consistent-type-imports` is error-level: *"All imports in the declaration are only used as types. Use `import type`."* The value form does not lint.
- **Fix:** `import type * as SchemaIssue from "effect/SchemaIssue"` in `DataTable.ts`. Still a submodule namespace import (AGENTS.md §3); the criterion's intent is met and `grep -c 'as SchemaIssue from "effect/SchemaIssue"'` outputs `1`. In the PIN file the value form is retained and justified — the pin asserts `SchemaIssue.isIssue` and `SchemaIssue.Composite` at RUNTIME, so it must fail if the module stops existing rather than merely if its declarations drift.
- **Files modified:** `packages/gherkin/src/DataTable.ts`
- **Verification:** the plan's literal grep now outputs `0`; the intent-preserving grep outputs `1`; `pnpm lint` exits 0.
- **Committed in:** `d8a52fa`

**3. [Rule 3 - Blocking] Task 3 test 6 asserts the reachable locator-absence case, not the unreachable one**

- **Found during:** Task 3 (design), after six exploratory reproductions run against the installed rc
- **Issue:** the plan's test 6 asks for a failure where `row` AND `column` are both `Option.none()`, triggered by "a schema that rejects the array as a whole". Task 2 requires `decodeHashes` to wrap the row schema in `Schema.Array` itself and to feed it `table.hashes()`, which is always an array — so the array can never be rejected as a whole, and every element failure arrives wrapped in a `Pointer` carrying the index. The two tasks are in tension; as written, test 6 asserts something this API cannot produce.
- **Fix:** test 6 asserts the case that IS reachable and carries the same requirement — `column` is `Option.none()` and no `, column "…"` clause is fabricated when the failure is not attributable to one cell — while `row` is correctly `Option.some(1)`. Its comment states plainly why the both-absent case is unreachable and where the dependency-level possibility is asserted instead. To make the unreachability a *tested* claim rather than an assertion in a comment, a seventh test was added to `schema-issue-pin.test.ts` proving that six different element-failure shapes (wrong primitive, `Never`, union, already-arrayed, missing key, failed transform) all reach a `Pointer` carrying index `0`. If an rc bump ever breaks that, the pin fails and the branch's reachability becomes a known fact rather than a surprise.
- **Files modified:** `packages/gherkin/test/DataTable.test.ts`, `packages/gherkin/test/schema-issue-pin.test.ts`
- **Verification:** `pnpm test` exits 0 with 22 tests in `DataTable.test.ts` (the plan's floor) and 7 in the pin (the plan's floor was 6).
- **Committed in:** `bab10d3` (pin test 7), `5aa2971` (test 6)

**4. [Rule 3 - Blocking] The `cause` assertion throws rather than branching around an `expect`**

- **Found during:** Task 3 (`pnpm lint`)
- **Issue:** `if (Option.isSome(cause)) { expect(...) }` trips `vitest(no-conditional-expect)`, which is error-level.
- **Fix:** invert to `if (!Option.isSome(cause)) { throw ... }` and assert unconditionally after — the same throw-on-unmet-precondition idiom the file's `succeeds`/`fails` helpers already use.
- **Files modified:** `packages/gherkin/test/DataTable.test.ts`
- **Verification:** `pnpm lint` exits 0.
- **Committed in:** `5aa2971`

### Wording adjustment

**5. [Rule 2 - Correctness] The no-row message fallback reads "The rows were", not "The row was"**

The plan's format appends `The row was {JSON.stringify(theRow)}.` where `theRow` is "the whole hashes array" when no ordinal was recovered — which would print `The row was [{…},{…}]`, saying "row" about a list of rows. The fallback says `The rows were {…}` instead. No acceptance criterion or test pins that wording; the located path (the only one reachable today) is unchanged and matches the plan byte for byte.

---

**Total deviations:** 5 (4 auto-fixed Rule 3 — blocking; 1 Rule 2 wording).
**Impact on plan:** none on the delivered behaviour. `decodeHashes`' signature, wrapping, ordering, locator derivation, reason tag and message format are exactly as specified. One test asserts a reachable case in place of an unreachable one, and gains an extra pin test that makes the unreachability itself checkable.

## Issues Encountered

- The worktree's base commit was `f640f4a` rather than the required `cb1c694`. Resolved by the mandated `git reset --hard cb1c694` in the worktree branch check, on a verified `worktree-agent-*` branch with a clean tree — no protected ref involved.
- `Schema.decodeUnknownEffect` over a bare `Schema.Constraint` yields `R = unknown`, which `Effect.runSync` rejects. The pin's `failureOf` helper therefore takes an already-built `Effect<unknown, Schema.SchemaError>` rather than a schema, so the concrete schema's `R = never` is fixed at the call site.
- `Schema.refine` is not the API for attaching a check in this rc (it produced `TypeError: check.run is not a function` during exploration). That exploratory case was dropped; no committed code uses it.

## Known Stubs

None. Every function added is wired and exercised: `decodeHashes` is exported and covered by 7 tests, `firstIssuePath` and `rowDecodeFailed` are reached by every one of the failure tests, and both predicates are on the live walk path.

## Threat Flags

None. The two boundaries this plan crosses were both already in the plan's register. T-04-06 (walking an attacker-influenced issue tree) is mitigated as specified: the walk reads only `_tag`, `path` and `issues`, never indexes user data with a recovered key, and narrows both locator elements by `typeof` before use — so a non-number index yields an absent row rather than `NaN + 1`. T-04-07 (the offending row embedded verbatim) is inherited unchanged from `Errors.ts` note (b)'s locked no-truncation policy, and `grep -c 'slice(0,\|substring(\|ELLIPSIS'` over `DataTable.ts` outputs `0`.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Plan 04-04 needs to export `decodeHashes` alongside `DataTable`, `makeDataTable`, `DataTableError` and `DataTableErrorReason` from `packages/gherkin/src/index.ts`, which this plan deliberately left untouched.
- Plan 04-05's spec reconciliation now has a second correction to carry into `spec/`: ADR-EC-008's worked example calls `Schema.decodeUnknown(Schema.Array(User))(table.hashes())`, which is wrong in three ways against the shipped API — `hashes()` is an `Effect` and must be `yield*`-ed, `decodeUnknown` is `decodeUnknownEffect` in effect v4, and the step author should reach for `decodeHashes(User)(table)` instead, which is the only form that produces a located error. Module doc note (e) of `DataTable.ts` is the source text.
- `PARSE-04` stays Pending until plan 04-04 delivers the `StepArgument` union half of its text.
- No blockers.

## Self-Check: PASSED

All three claimed files exist on disk (`packages/gherkin/test/schema-issue-pin.test.ts`, `packages/gherkin/src/DataTable.ts`, `packages/gherkin/test/DataTable.test.ts`), and all three claimed commits are present in `git log` (`bab10d3`, `d8a52fa`, `5aa2971`), all on branch `worktree-agent-a4252b586a410e19e` above base `cb1c694`. No item missing.

---
*Phase: 04-datatable-docstring*
*Completed: 2026-08-28*

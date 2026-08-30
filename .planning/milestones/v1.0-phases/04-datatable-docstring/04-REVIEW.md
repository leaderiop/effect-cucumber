---
phase: 04-datatable-docstring
reviewed: 2026-08-29T00:00:00Z
depth: standard
files_reviewed: 27
files_reviewed_list:
  - packages/gherkin/README.md
  - packages/gherkin/src/Correlate.ts
  - packages/gherkin/src/DataTable.ts
  - packages/gherkin/src/Errors.ts
  - packages/gherkin/src/Model.ts
  - packages/gherkin/src/StepArguments.ts
  - packages/gherkin/src/index.ts
  - packages/gherkin/test/Correlate.test.ts
  - packages/gherkin/test/DataTable.test.ts
  - packages/gherkin/test/StepArguments.test.ts
  - packages/gherkin/test/fixtures/README.md
  - packages/gherkin/test/fixtures/datatable-before-docstring.feature
  - packages/gherkin/test/fixtures/datatable-duplicate-header.feature
  - packages/gherkin/test/fixtures/datatable-header-only.feature
  - packages/gherkin/test/fixtures/datatable-single-column.feature
  - packages/gherkin/test/fixtures/datatable-two-column.feature
  - packages/gherkin/test/schema-issue-pin.test.ts
  - packages/gherkin/test/upstream-pin.test.ts
  - scripts/verify-pack.sh
  - spec/behaviors/05-step-matching-and-parameter-types.md
  - spec/behaviors/06-datatable-and-docstring-arguments.md
  - spec/behaviors/index.yaml
  - spec/decisions/008-data-tables-and-doc-strings-decode-through-schema.md
  - spec/decisions/025-datatable-wrapper-accessor-contract.md
  - spec/decisions/index.yaml
  - spec/roadmap.md
  - spec/traceability.md
findings:
  critical: 0
  warning: 3
  info: 2
  total: 5
status: issues_found
---

# Phase 04: Code Review Report

**Reviewed:** 2026-08-29T00:00:00Z
**Depth:** standard
**Files Reviewed:** 27
**Status:** issues_found

## Summary

This phase adds the `DataTable`/`DocString` wrapper (`DataTable.ts`, `StepArguments.ts`), wires
`stepArguments` into `Correlate.ts`/`Model.ts`, adds `DataTableError` to `Errors.ts`, publishes the
new surface from `index.ts`, and extends the spec/traceability documents accordingly. The
implementation is careful about the documented risk areas — prototype pollution in `recordOf`/the
`rowsHash()` record builder is correctly defended with `Object.fromEntries` and pinned by a test,
the header-duplicate and width checks run in the order the spec requires, `decodeHashes`'s row/column
recovery matches the `schema-issue-pin.test.ts` pin, and the ordering rule in `stepArgumentsOf`
correctly reads `argumentIndex`'s *value* rather than testing key presence. No hardcoded secrets,
`eval`, or dangerous-function usage was found, and no empty catch blocks or debug artifacts turned up
in the reviewed source.

The issues found are all quality/documentation defects, not functional regressions: one doc comment
introduced in this diff makes a factually incorrect claim about the module dependency graph that
directly contradicts another doc comment in the very same diff; the new `DataTable.rows` field
surfaces a third-party type (`PickleTableRow`) that the package's own re-export philosophy says
should be exported but is not; and the pre-existing "error messages carry full content, unredacted"
policy is silently extended to a new class (`DataTableError`) covering DataTable cell content, which
is exactly the kind of test-fixture/PII-shaped data most likely to appear in a `.feature` file's data
table. No blockers were found.

## Warnings

### WR-01: `Model.ts`'s new doc comment misstates `StepArguments.ts`'s import graph

**File:** `packages/gherkin/src/Model.ts:9`
**Issue:** The doc comment added in this phase reads:

> Neither import can cycle back: `StepArguments.ts` reaches `./DataTable.ts` and `./Errors.ts` and
> nothing else...

This is false. `StepArguments.ts`'s actual imports are:

```ts
import type { PickleStepArgument } from "@cucumber/messages"
import * as Option from "effect/Option"
import { type DataTable, makeDataTable } from "./DataTable.ts"
```

`StepArguments.ts` imports only `./DataTable.ts` locally — it reaches `./Errors.ts` transitively
(through `DataTable.ts`, which does import it), not directly. This directly contradicts
`StepArguments.ts`'s own doc comment in the same diff, which correctly states "Local imports:
`./DataTable.ts` only." This codebase places unusual weight on doc-comment precision (many
`[VERIFIED]` annotations, a whole no-truncation-message-policy built on trusting exact prose), so an
internally-contradictory, unverified claim about the no-cycle guarantee is a real defect: a future
reader relying on `Model.ts`'s claim to reason about the module DAG (e.g. when deciding whether a new
edge would introduce a cycle) is working from wrong information.
**Fix:**
```diff
- * `./StepArguments.ts`, both type-only — the second joined in Phase 4, when `ParsedStep` gained
- * `stepArguments` and the contract started surfacing a first-party wrapper type rather than only
- * third-party ones. Neither import can cycle back: `StepArguments.ts` reaches `./DataTable.ts` and
- * `./Errors.ts` and nothing else, and nothing under `src/` imports this module for a runtime value,
- * because it has none to give.
+ * `./StepArguments.ts`, both type-only — the second joined in Phase 4, when `ParsedStep` gained
+ * `stepArguments` and the contract started surfacing a first-party wrapper type rather than only
+ * third-party ones. Neither import can cycle back: `StepArguments.ts` reaches `./DataTable.ts`
+ * only (which in turn reaches `./Errors.ts`), and nothing under `src/` imports this module for a
+ * runtime value, because it has none to give.
```

### WR-02: `DataTable.rows`'s `PickleTableRow` type is not re-exported, breaking the package's own escape-hatch rule

**File:** `packages/gherkin/src/index.ts:98-99`, `packages/gherkin/src/DataTable.ts:168`
**Issue:** `Model.ts`'s doc comment states the package's design rule explicitly: third-party types the
public contract surfaces are re-exported "so a consumer is never forced to declare either package
[`@cucumber/messages`/`@cucumber/cucumber-expressions`] themselves." That rule is honored for
`GherkinDocument`, `Pickle`, `PickleStep`, `PickleStepArgument`, `StepKeywordType`, and
`ParameterTypeRegistry` — all re-exported from `index.ts`.

`DataTable` (also public API, exported via `export type { DataTable } from "./DataTable.ts"`) declares
`readonly rows: ReadonlyArray<PickleTableRow>`, and `makeDataTable`'s signature takes a `table:
PickleTable`. Neither `PickleTable` nor `PickleTableRow` is re-exported anywhere from `index.ts`. A
consumer who wants to name the element type of `DataTable.rows` explicitly (e.g. to write a helper
function `(row: PickleTableRow) => ...`) has no choice but to import `@cucumber/messages` directly —
exactly the friction the package's own stated design rule exists to avoid, and a `@cucumber/messages`
version mismatch between what the consumer imports and what `@effect-cucumber/gherkin`'s `dependencies`
pin (`^34.2.1`) could resolve to is now a possibility the design rule was meant to close off.
**Fix:**
```diff
 export { decodeHashes, makeDataTable } from "./DataTable.ts"
 export type { DataTable } from "./DataTable.ts"
+export type { PickleTable, PickleTableRow } from "./DataTable.ts"
```
(re-exporting the barrel-level `@cucumber/messages` types through `DataTable.ts` or `Model.ts`,
consistent with how the other `@cucumber/messages` types are surfaced.)

### WR-03: The no-truncation error-message policy is extended to `DataTableError` without re-examining the risk for table content specifically

**File:** `packages/gherkin/src/Errors.ts:79-87`, `packages/gherkin/src/DataTable.ts:129, 226-233, 251-257, 273-276, 379-381, 389`
**Issue:** `Errors.ts`'s module doc comment (b) records an *already-accepted* tradeoff for
`LoadFeatureError`/`StepPatternError`: full, unredacted content in error messages, explicitly
including the acknowledgement that "a feature file containing fixture credentials will reproduce
those credentials in error output that may reach a publicly readable CI log." This phase's new note
(e) extends that same policy verbatim to `DataTableError`, and the implementation follows through:
`quoteRow` in `DataTable.ts` reproduces whole table rows unedited in `DuplicateHeaderColumn` and
`RowsHashRequiresTwoColumns` messages, and `rowDecodeFailed` embeds `JSON.stringify(rows)` /
`JSON.stringify(offending)` — the entire decoded row object — verbatim into `RowDecodeFailed`
messages.

Data tables are the single most common place in a `.feature` file for exactly the kind of content this
tradeoff was written to warn about — test user credentials, tokens, PII-shaped fixture data — more so
than a DocString or a bare parse error. Extending an already-accepted policy to a new, high-incidence
surface without a fresh sentence weighing that specific risk is a gap worth calling out even though it
is consistent with prior precedent; the original acceptance note talks about "a feature file" in
general, not about the row-shaped tabular data that step authors most often use for exactly this
purpose.
**Fix:** Not a code change — this is a documentation/risk-acceptance gap. Add a sentence to
`Errors.ts` note (e) (or a new note) explicitly re-affirming the tradeoff for `DataTableError`'s row
content specifically (the way note (b) already does for the original two classes), so the decision is
visibly re-examined rather than silently inherited.

## Info

### IN-01: `rowsHash()`'s `__proto__`-safe record construction has no equivalent pinned test

**File:** `packages/gherkin/src/DataTable.ts:281`, `packages/gherkin/test/DataTable.test.ts`
**Issue:** `hashes()`'s `recordOf` helper is protected by a dedicated test ("gives a `__proto__`
header cell an own property rather than mutating a prototype", `DataTable.test.ts:143-160`) that
guards threat T-04-03 by asserting `Object.fromEntries` is used rather than an assignment loop.
`rowsHash()`'s own record construction —
`Object.fromEntries(rows.map((row) => [row.cells[0]?.value ?? "", row.cells[1]?.value ?? ""]))` at
`DataTable.ts:281` — uses the identical safe pattern, but has no equivalent test asserting a
`__proto__`-valued key column is handled the same way. Both call sites carry the same threat class;
only one is pinned.
**Fix:** Add a test to the `rowsHash` describe block mirroring the existing `hashes()` one, e.g.
`dataTableOf(["__proto__", "polluted"]).rowsHash()` asserted to produce an own property and leave
`Object.prototype` untouched.

### IN-02: `decodeHashes`'s recovered `column` only names the first-level field for a nested row schema

**File:** `packages/gherkin/src/DataTable.ts:361-370`
**Issue:** `rowDecodeFailed` reads `path[1]` as the column name (`typeof key === "string" ?
Option.some(key) : Option.none()`), which is correct for a flat `Schema.Struct` row (the common case,
and the only shape `test/DataTable.test.ts` and `schema-issue-pin.test.ts` exercise). If a caller
supplies a row schema with a nested struct field (e.g. `Schema.Struct({ address: Schema.Struct({
street: Schema.String }) })`), the accumulated `Pointer` path would be `[rowIndex, "address",
"street"]`; `rowDecodeFailed` reports only `column: Option.some("address")`, silently dropping
`"street"` — the exact field that actually failed. This is a real information loss for a schema shape
the type signature permits (`decodeHashes<S extends Schema.Constraint>` places no flatness constraint
on `rowSchema`) but that no test exercises.
**Fix:** Either document the flat-row-schema assumption explicitly on `decodeHashes`'s signature (a
one-line addition to the existing doc comment), or join the remaining path segments
(`path.slice(1).join(".")`) into `column` so a nested failure still names the full field path instead
of only its first segment.

---

_Reviewed: 2026-08-29T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

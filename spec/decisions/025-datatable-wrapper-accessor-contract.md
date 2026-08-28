# ADR-EC-025: The DataTable wrapper's accessors fail loudly, and both step arguments arrive in source order

> **Status:** Accepted and implemented
> **Date:** 2026-08-28
> **Context:** Phase 4 of `.planning/ROADMAP.md` built the wrapper
> [ADR-EC-008](008-data-tables-and-doc-strings-decode-through-schema.md)'s correction said this
> package would have to write for itself. This ADR is the shape that wrapper took, and it
> **implements** ADR-EC-008 rather than superseding it — that decision, "data tables and doc strings
> decode through `Schema`", is unchanged and now true in code.

## Context

ADR-EC-008 decided that a data table decodes through `Schema`. Its correction then established the
part that decision had assumed away: `.hashes()`/`.raw()`/`.rowsHash()` do not exist anywhere in
`@cucumber/gherkin`/`@cucumber/messages`. A `PickleTable` is plain data — `{ rows: [{ cells: [{
value }] }] }` — with no methods on it at all, and the accessors every Cucumber user expects live in
`@cucumber/cucumber`, the full Cucumber.js runner that
[ADR-EC-011](011-official-cucumber-parser-packages.md) keeps out of this dependency graph. So
`@effect-cucumber/gherkin` writes its own thin wrapper.

Writing it forced three design questions that neither ADR-EC-008 nor its correction answers, and
that the implementation cannot answer implicitly: what a fallible accessor does when the table is
malformed, which error class carries that failure, and what order a step's two arguments arrive in
when it carries both. All three were decided during Phase 4 and, until this ADR, lived only in
`packages/gherkin/src/DataTable.ts`'s and `packages/gherkin/src/StepArguments.ts`'s module doc
comments — which is not where a decision belongs.

## Decision

### 1. `raw()` is total; `hashes()` and `rowsHash()` return `Effect`

`raw()` has no failure mode: every row has cells, every cell has a string value, and returning them
in order — header row included — cannot go wrong. It returns a plain
`ReadonlyArray<ReadonlyArray<string>>`, and `[]` for an empty table.

`hashes()` and `rowsHash()` return `Effect<..., DataTableError>` instead, because both have real
failure modes:

- `hashes()` cannot produce a row record for a header that repeats a column name — no record can
  carry both columns.
- `rowsHash()` reads every row as a key/value pair, which is only meaningful when every row is
  exactly two cells wide, and only unambiguous when no key repeats.

**Rejected alternative:** all three pure, with `@cucumber/cucumber`'s own semantics — last cell wins
on a duplicate header, and `rowsHash()` silently reading the first two cells of a wider row.
Rejected because a silently-wrong result is the exact failure class this package exists to
eliminate: `Validate.ts` and [BEH-EC-014](../behaviors/04-loadfeature-parse-and-validation.md)'s
ten-member `LoadFeatureErrorReason` are an entire subsystem built on the premise that a feature file
which compiles into something its author did not write must be rejected rather than run. A duplicate
header cell is precisely that shape: `@cucumber/gherkin` accepts it without complaint and hands it
through to the pickle unchanged (fixture row F32, pinned), so nothing upstream of this wrapper will
ever notice.

The call-site cost of the asymmetry is one keyword. A step body is already a generator under
[ADR-EC-005](005-effect-fn-for-step-and-hook-bodies.md), so the author writes `yield* table.hashes()`
where they would otherwise have written `table.hashes()`.

### 2. `DataTableError` is a third error class, not more members on the existing two

A data-table failure raises `DataTableError`, a `Schema.TaggedError` alongside `LoadFeatureError` and
`StepPatternError` rather than inside either of them. Its reason union is closed at four, one per
real failure mode:

- `DuplicateHeaderColumn` — the header row repeats a column name, so `hashes()` cannot build a record
  carrying both.
- `RowsHashRequiresTwoColumns` — a row handed to `rowsHash()` is not exactly two cells wide.
- `DuplicateRowKey` — two rows handed to `rowsHash()` share a key, so the second would overwrite the
  first.
- `RowDecodeFailed` — a body row failed to decode against the `Schema` the step author supplied.

**Rejected alternative:** widening one of the two existing unions. Rejected on three independent
grounds:

- BEH-EC-014 closes `LoadFeatureErrorReason` at exactly ten with the words "drawn from exactly this
  set". Adding to it would make a normative, published sentence false — and every one of those ten
  is a load-time verdict about the document, which a table accessor is not.
- `StepPatternError` is scoped to a pattern the STEP AUTHOR wrote, and is raised at declaration time
  so the error points at the caller's own call. A data-table failure is raised at step-body time,
  against `.feature` content, long after loading has already succeeded.
- Neither existing class carries a `row`/`column` locator, and both would have had to grow one for a
  failure only this third class can raise.

### 3. A step carrying both arguments receives them in source order, as an ordered array

`ParsedStep.stepArguments` is a `ReadonlyArray<StepArgument>` where `StepArgument` is
`DocString | DataTable`. When a step carries both, they arrive ascending by the `argumentIndex` that
`@cucumber/gherkin`'s own `compile()` recorded — which is the order the step's author wrote them in
the `.feature` file.

**Rejected alternative:** a fixed DocString-then-DataTable convention, or a
`{ docString, dataTable }` record. Rejected because `argumentIndex` is a real upstream fact, not
something this package has to invent: it is `1`/`2` for `docstring-and-datatable.feature` and `2`/`1`
for its byte-mirror `datatable-before-docstring.feature`. A fixed convention would throw that fact
away and silently reorder half of all real feature files; a record has no order at all, so every
consumer — starting with Phase 5's step-body signature, which spreads this array — would have to
re-derive it from `argumentIndex` themselves, duplicating in every call site the one rule that
belongs in exactly one place.

**The trap this rule hides, stated the correct way round.** The declaration is
`argumentIndex?: number`, which invites the reading "the key is present when a step has both
arguments and absent otherwise". That reading is wrong, and an implementation built on it
discriminates nothing at all. `compile()` assigns a NUMBER only when a step carries both arguments —
but when a step carries just one, `compile()` still writes the `argumentIndex` KEY:
`pickleDocString()` and `pickleTable()` are unconditional object literals, and
`createPickleArguments()` calls them with `argumentIndex: undefined` in the single-argument branches.
So the key is **always present** and only its VALUE is `undefined`. An implementation must therefore
read the value and supply a fallback for `undefined`; a key-presence test — `"argumentIndex" in x`,
`Object.hasOwn(x, "argumentIndex")` — is `true` for every step ever pickled.

## Consequences

**Positive**:

- Every silently-wrong table shape `@cucumber/cucumber` resolves by dropping data becomes a named,
  located failure carrying the feature `uri`, the step's line, a 1-based body-row ordinal and the
  offending column name.
- `decodeHashes(rowSchema)` makes ADR-EC-008's decision true with a better error than the decision
  anticipated: because `decodeHashes` is what wraps the row schema in `Schema.Array`, the resulting
  issue path's first element IS the `.hashes()` body-row index, so a failure names the row and the
  column instead of an index into a value the step author never constructed.
- `stepArguments` is an ordered array a Phase 5 consumer can spread unconditionally, with the
  ordering question already answered once.
- `ParsedStep.argument` is untouched and still carries the raw `PickleStepArgument`, so nothing that
  the three accessors do not expose became unreachable.

**Negative**:

- Two of the three accessors are `Effect`-returning, so `raw()` and `hashes()` are not
  interchangeable at a call site and a reader has to know which is which. The doc comments on the
  `DataTable` interface are the mitigation; there is no way to have both totality and loud failure.
- A fourth error class would have been the alternative to a fourth reason on this one, so
  `DataTableError`'s union has to stay closed by review rather than by a compiler.
- A consumer migrating from `@cucumber/cucumber` will find `hashes()` rejecting a table that runner
  accepted. That is the intended behaviour, but it is a real incompatibility, not a strict superset.

**Trade-off accepted**: one `yield*` at every fallible accessor call site, and a deliberate
incompatibility with `@cucumber/cucumber`'s lenient semantics, in exchange for a data table that can
never quietly drop a column or half a row.

## Verified, not assumed

Following [ADR-EC-022](022-option-replaces-undefined-in-gherkins-public-api.md)'s convention, the
facts this decision rests on were reproduced against the installed dependencies rather than assumed,
and each is held by a named pin test:

- `argumentIndex` holds `1`/`2` in source order when a step carries both arguments — and `2`/`1` for
  the byte-mirrored fixture — while its KEY is present holding `undefined` when a step carries only
  one. Both halves, including the `Object.hasOwn` assertion that makes the key-presence trap
  explicit: `packages/gherkin/test/upstream-pin.test.ts`.
- A `PickleTableRow` has no location field of any kind — `Object.keys(row)` is exactly `["cells"]` —
  which is why `DataTableError.line` is the STEP's line and `DataTableError.row` is an ordinal rather
  than a source location: `packages/gherkin/test/upstream-pin.test.ts`.
- A duplicate header cell is legal Gherkin that `@cucumber/gherkin` accepts and passes through to the
  pickle unchanged (fixture F32), which is why decision 1's loud failure has to be raised here or
  nowhere: `packages/gherkin/test/upstream-pin.test.ts`.
- `Schema.decodeUnknownEffect` over `Schema.Array(Row)` yields a `SchemaError` whose accumulated
  `Pointer` path is `[rowIndex, columnName]` — which is how `decodeHashes` recovers the locator — and
  yields an EMPTY path for a top-level type failure, which is why the locator is `Option`-typed:
  `packages/gherkin/test/schema-issue-pin.test.ts`.
- `Object.fromEntries` makes a `__proto__` header cell an ordinary own property, while a
  `record[key] = value` loop rewrites the record's prototype and leaves no own property behind at
  all — so the column silently disappears. This is why every record keyed by `.feature` content is
  built with `Object.fromEntries`: `packages/gherkin/test/DataTable.test.ts`.

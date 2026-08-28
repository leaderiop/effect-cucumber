# ADR-EC-008: Data tables and doc strings decode through Schema

> **Status:** Accepted
> **Date:** 2026-08-28

## Context

A Gherkin data table or doc string arrives as raw strings (a `DataTable`'s
`.hashes()`, or a doc string's raw text). Turning that into a typed value
needs validation somewhere — either an ad-hoc manual parse inside every step
that uses one, or a single, consistent decoding mechanism.

## Decision

Data tables and doc strings decode through `effect/Schema`:

```ts
Given('the following users:', function* (table: DataTable) {
  const users = yield* Schema.decodeUnknown(Schema.Array(User))(table.hashes())
  ...
})
```

## Consequences

**Positive**:

- Decode failures are a typed error in the step's `E` channel, not a thrown
  exception a step author has to remember to catch.
- Reuses whatever `Schema` definitions the application under test already has
  for its domain types — no separate table-shape-validation vocabulary.

**Negative**:

- Every step that consumes a table/doc string needs a `Schema` on hand, which
  is more upfront ceremony than reading `table.hashes()` directly and trusting
  the shape.

**Trade-off accepted**: the ceremony cost is paid once per table shape (the
`Schema` definition is reusable across every step and Scenario that consumes
that shape of table), in exchange for catching a malformed table at decode
time with a structured error instead of a confusing downstream failure.

---

> **Correction (2026-08-28, resolving [research ticket #2](https://github.com/leaderiop/effect-cucumber/issues/2)):**
> `.hashes()` does not exist anywhere in `@cucumber/gherkin`/`@cucumber/messages`
> — verified against the real installed `@cucumber/gherkin@42.0.1` package. A
> `DataTable`/`PickleTable` is plain data (`{ rows: [{ cells: [{ value }] }] }`),
> with no methods; `.hashes()`/`.raw()`/`.rowsHash()` are runtime wrapper
> methods that live in `@cucumber/cucumber` (the full Cucumber.js test
> runner), a package this library does not depend on (per
> [ADR-EC-011](011-official-cucumber-parser-packages.md)). The Decision above
> still holds — data tables and doc strings decode through Schema — but
> `@effect-cucumber/gherkin` must implement its own thin `DataTable` wrapper
> (`.hashes()`, and whatever else the DSL needs) around the raw
> `rows`/`cells` structure; it is not free from the upstream package. A doc
> string is simpler: a step just receives `{ content: string }` (plus
> optional `mediaType`), a plain field, not an object needing a wrapper.
>
> Full primary-source findings: [`research/gherkin-parsed-shape.md`](https://github.com/leaderiop/effect-cucumber/blob/research/gherkin-parsed-shape/research/gherkin-parsed-shape.md)
> (branch `research/gherkin-parsed-shape`, not merged to `main`).

---

> **Correction (2026-08-28, Phase 4 implementation, pinned by
> `packages/gherkin/test/DataTable.test.ts` and `packages/gherkin/test/schema-issue-pin.test.ts`):**
> the `ts` fence in the Decision section above shows
> `Schema.decodeUnknown(Schema.Array(User))(table.hashes())`. Two things about that line are now
> stale. It is a `ts` fence — reference material, never compiled (AGENTS.md §2), which is exactly why
> the drift went unnoticed — so it is marked here rather than rewritten, and nothing above this line
> is deleted.
>
> **`Schema.decodeUnknown` is effect v3's name.** On `effect@4.0.0-rc.112` the `Effect`-returning
> form is `Schema.decodeUnknownEffect`. (This package could not name either one when the fence was
> written: `effect` only became reachable from `@effect-cucumber/gherkin` under
> [ADR-EC-021](021-effect-and-platform-are-peer-dependencies-of-gherkin.md).)
>
> **`table.hashes()` is no longer a plain value.** It returns
> `Effect<ReadonlyArray<Record<string, string>>, DataTableError>` under
> [ADR-EC-025](025-datatable-wrapper-accessor-contract.md) — a duplicate header column is a real
> failure this library refuses to resolve by letting the last cell win — so passing it straight into
> a decoder is a type error; a step body writes `yield* table.hashes()`. The ergonomic path a step
> body actually uses is `decodeHashes(User)(table)`, which wraps the row schema in `Schema.Array`
> itself and, because it owns that wrapping, can name the offending ROW and COLUMN on failure rather
> than an array index into a value the step author never constructed.
>
> **The Decision itself is unchanged and fully implemented.** Data tables and doc strings decode
> through `Schema`; ADR-EC-025 records the shape the wrapper this correction's predecessor called for
> actually took.

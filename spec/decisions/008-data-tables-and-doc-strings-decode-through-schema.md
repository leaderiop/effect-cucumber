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

# ADR-EC-046: A DocString decodes through Schema on demand via `decodeDocString`, mirroring `decodeHashes` one level shallower — closes a gap against the DataTable/ExamplesRow precedent

> **Status:** Accepted
> **Date:** 2026-09-06
> **Context:** a comparison against [tatemz/effect-bdd](https://github.com/tatemz/effect-bdd) found
> that library ships `Bdd.docString(schema)`, decoding a step's DocString through a caller-supplied
> Schema, with no equivalent anywhere in `@effect-cucumber/gherkin`

## Context

[ADR-EC-008](008-data-tables-and-doc-strings-decode-through-schema.md) decided, up front, that "data
tables **and doc strings** decode through Schema" — the decision names both argument kinds in one
sentence. Its own Phase-4 correction records that only the DataTable half was ever actually built:
`decodeHashes` exists, is pinned by `packages/gherkin/test/DataTable.test.ts`, and is the mechanism
[ADR-EC-025](025-datatable-wrapper-accessor-contract.md) gives a concrete shape. No `decodeDocString`
was ever written. `packages/gherkin/src/StepArguments.ts`'s `DocString` interface stayed exactly what
ADR-EC-008's own correction describes it as — `content` plus an `Option<string>` `mediaType`, "a
plain field, not an object needing a wrapper" — and nothing in this codebase has since revisited that
sentence to ask whether "not needing a wrapper" also meant "not needing a decode helper." It did not:
those are two different claims, and the second one was simply never addressed, positive or negative,
by any ADR.

[ADR-EC-025](025-datatable-wrapper-accessor-contract.md) is the DataTable-side precedent for
LOCATING a failure: `DataTableError` carries `uri`/`line` (the step's own — a `PickleTableRow` has no
location of its own) alongside `row`/`column`, and `makeDataTable(table, uri, line)` is how
`StepArguments.ts`'s `stepArgumentsOf` gets that `uri`/`line` onto a wrapped `DataTable` in the first
place. `DocString` had never received the same treatment: `stepArgumentsOf` already takes `uri` and
`line` as its own parameters (used today only to build a `DataTable` via `makeDataTable`), but its
DocString-construction branch dropped them on the floor — a location this function already had in
hand was simply not attached to the value it built.

[ADR-EC-032](032-outline-examplesrow-carries-the-raw-row-decoded-on-demand-not-a-per-feature-schema.md)
is the closer precedent, one level up from this one rather than sideways: `decodeExamplesRow` decodes
an `ExamplesRow`'s whole `raw` record through a `Schema` to ONE value, with `ExamplesRowError`'s
reason set closed at exactly one (`RowDecodeFailed`) because an `ExamplesRow` has no header/width
shape of its own to violate — only a value handed straight to the caller's `Schema`. A `DocString` is
the SAME shape one level shallower again: not even a record, a single `content: string`, decoded
straight through whatever `Schema` the caller supplies (`Schema.fromJsonString(...)` being the
obvious and most common case, though nothing here is coupled to JSON specifically — any
`Schema.decodeUnknownEffect`-compatible schema over a string works). There is no row, no column, and
no header to get wrong — `decodeDocString`'s failure surface is smaller than `decodeExamplesRow`'s
for the identical reason `decodeExamplesRow`'s is smaller than `decodeHashes`'s.

This ADR is not a novel design. It closes a gap in a pattern this codebase already established twice
(DataTable, then ExamplesRow), prompted by comparing against an external library that had already
filled the analogous gap. Nothing here reopens `decodeHashes`'s or `decodeExamplesRow`'s own design
questions — this decision reuses their answers directly, one level down.

## Decision

**`DocString` gains `uri: string` and `line: number`, populated by `stepArgumentsOf` from the
parameters it already receives, mirroring `DataTable`'s own fields:**

```ts
// packages/gherkin/src/StepArguments.ts
export interface DocString {
  readonly _tag: "DocString"
  readonly content: string
  readonly mediaType: Option.Option<string>
  /** The feature file this DocString came from, mirroring DataTable.uri. */
  readonly uri: string
  /** This step's line, mirroring DataTable.line — a DocString carries no location of its own. */
  readonly line: number
}
```

`stepArgumentsOf`'s DocString-construction branch now forwards its own `uri`/`line` parameters onto
the value it builds, the same parameters it already forwards to `makeDataTable` on the DataTable
branch — no new parameter, no new caller-facing signature, just a value that was in scope and
unattached.

**A new file, `packages/gherkin/src/DocString.ts`, exports `decodeDocString`:**

```ts
export const decodeDocString: <S extends Schema.Constraint>(
  schema: S
) => (docString: DocString) => Effect.Effect<S["Type"], DocStringError, S["DecodingServices"]>
```

It is a standalone function, not a method on `DocString`, and — the placement rule this ADR states
explicitly — it does **not** live in `StepArguments.ts` alongside the interface it decodes.
`StepArguments.ts`'s own module header says every function there is total, with no failure surface;
`decodeDocString` can fail, so it needs a file whose contract allows that, exactly the way
`decodeHashes` lives in `DataTable.ts` rather than being folded into whatever module defines
`PickleStepArgument` wrapping, and `decodeExamplesRow` lives in `ExamplesRow.ts` rather than
`Correlate.ts`. The type parameter mirrors `Schema.decodeUnknownEffect`'s own, so a schema's decoding
services propagate into the resulting Effect's `R` channel rather than being erased to `never` — the
identical shape `decodeHashes`/`decodeExamplesRow` already have.

**`DocStringError` is a new `Schema.TaggedError`, its reason set closed at exactly one —
`DecodeFailed` — for the same reason `ExamplesRowError`'s is closed at one rather than
`DataTableError`'s four:**

```ts
export type DocStringErrorReason = "DecodeFailed"

export class DocStringError extends Schema.TaggedError<DocStringError>()("DocStringError", {
  reason: Schema.Literals(["DecodeFailed"]),
  uri: Schema.String,
  line: Schema.OptionFromUndefinedOr(Schema.Number),
  message: Schema.String,
  cause: Schema.optionalKey(Schema.Unknown)
}) {}
```

A `DocString` has no header, no width, no row count — nothing an author-supplied shape can violate
the way a hand-written table's header can repeat a column, or a table's row can be the wrong width.
The only way `decodeDocString` fails is the caller's `Schema` rejecting `content`, so one reason
covers the entire failure surface, exactly as it does for `ExamplesRowError`. `line` stays `Option`
for the same reason every other located field in `Errors.ts` does (ADR-EC-022), though in practice it
is never absent: `stepArgumentsOf` always has a real `line` in hand when it builds a `DocString`.

**The error message quotes `content` WHOLE — no ellipsis, no truncation — per `Errors.ts`'s existing
no-truncation policy, naming the DocString's own `uri`/`line`:**

```
The DocString at <uri>:<line> failed to decode: <schemaError.message> The content was <JSON.stringify(content)>.
```

**`firstIssuePath`/row-column-locating logic is explicitly NOT APPLICABLE here, stated rather than
left silently unaddressed.** `DataTable.ts`'s `firstIssuePath` and `rowDecodeFailed` exist because
`decodeHashes` wraps a row schema in `Schema.Array` itself, which is what makes a decode failure's
issue path locatable to a specific row and column. `decodeDocString` decodes a single string to a
single value with no array wrapping and no record fields of its own to attribute a failure to — there
is no row, no column, and no path-walking to do. Reusing `firstIssuePath` here would not fail, but it
would also never do anything: every call would resolve to the empty path, because there is nothing
above the schema's own top-level issue to walk through. This ADR states outright that the row/column
locating machinery the two closest precedents both need is simply the wrong tool for a single-value
decode, rather than leaving a reader to wonder why `DocString.ts` does not import it.

## Consequences

**Positive**:

- Closes the exact gap the effect-bdd comparison found, using a mechanism this codebase has already
  proven twice (`decodeHashes`, `decodeExamplesRow`) rather than inventing a third decode shape.
- `DocString.uri`/`.line` make a DocString as self-locating as a `DataTable` already is — a consumer
  holding either value can build a `<uri>:<line>` message without threading the step's own location
  through separately, closing a small but real asymmetry between the two `StepArgument` arms.
- `DocStringError`'s reason set closed at one keeps its type-level surface exactly as small as its
  actual failure surface — a caller `switch`ing on `reason` never has to handle a case that cannot
  occur, the same guarantee `ExamplesRowError` already gives.

**Negative**:

- `DocString` gaining `uri`/`line` is a public API surface change: existing code building a `DocString`
  literal by hand (as `packages/gherkin/test/StepArguments.test.ts`'s synthetic fixtures already do)
  must supply the two new fields, and `spec/overview.md`'s API-surface table and
  `scripts/verify-api-surface.sh`'s gate both need the new exports named. This is accepted because the
  package is pre-1.0 (README's stated policy: breaking changes are expected and acceptable pre-1.0),
  and because the two new fields are strictly additive to what a real `DocString` value already
  carries in practice — `stepArgumentsOf` always has both on hand when it builds one.
- `decodeDocString` is called freshly by every step that wants a typed view of a DocString's content;
  a step calling it more than once pays the decode cost each time, since `DocString` itself carries no
  memoised decode. Accepted as the same deliberate, previously-stated trade-off
  `decodeExamplesRow`/`decodeHashes` already make, not a new cost specific to this decision.

**Trade-off accepted**: `firstIssuePath`-style row/column location, proven valuable for `DataTable`
and reused (one level down) for `ExamplesRow`, is deliberately NOT extended a third time here — not
because it was overlooked, but because a single-value decode has no row or column for it to locate.
Considered and explicitly rejected: sharing `docStringDecodeFailed`'s logic with `ExamplesRow.ts`'s
`rowDecodeFailed` by extracting a common helper. Both functions are short, and the fields differ
(`DocStringError` carries no `column`, `ExamplesRowError` does) enough that a shared helper would need
its own parameterization for a saving of a few lines — premature abstraction for two call sites,
noted here explicitly rather than left as a silent inconsistency between two independently written but
similar-looking functions.

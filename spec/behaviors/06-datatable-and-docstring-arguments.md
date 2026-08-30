# 06 — DataTable and DocString arguments

What happens to a step's non-text arguments.
[BEH-EC-014](./04-loadfeature-parse-and-validation.md) specifies how a `.feature` file becomes a
`ParsedFeature`, and [BEH-EC-015](./05-step-matching-and-parameter-types.md) specifies how a step's
TEXT becomes typed arguments; this file specifies what happens to a step's DocString and DataTable —
the two arguments a cucumber-expression never sees, because they are not part of the step text a
pattern is matched against at all.

> **See:** [ADR-EC-008](../decisions/008-data-tables-and-doc-strings-decode-through-schema.md), [ADR-EC-025](../decisions/025-datatable-wrapper-accessor-contract.md)

See [`spec/roadmap.md`](../roadmap.md) for what is built versus what is only specified — this
document describes the contract, not the build status.

This file previously declined to specify the STEP-BODY SIGNATURE — how these arguments are positioned
relative to the cucumber-expression arguments in a `Given`/`When`/`Then` callback — and deferred it to
Phase 5's DSL territory (DSL-02), next to [BEH-EC-002](./01-steps-and-world.md)'s callback shape. That
deferral is **withdrawn**, and the question is answered by the last REQUIREMENT below. It is answered
here rather than in `01` because the deferral turned out to be the reason nothing implemented it: the
producing side of the contract had already been written into
`packages/gherkin/src/StepArguments.ts` on the assumption that a consumer would spread this array
after the pattern's arguments, and for five phases no consumer did. A step body declaring a
`DataTable` parameter received `undefined`, and no gate noticed, because the only document that could
have stated the delivery had declined to. The order and the delivery are one contract and now live in
one place.

What this file still does not own is the REGISTRATION call shape around the callback — that remains
BEH-EC-002's, and is not duplicated here.

---

## BEH-EC-016: A step's DataTable and DocString arrive as typed values in source order

A data table and a doc string are the two pieces of a step that the pattern layer cannot touch.
BEH-EC-015's coercion machinery reads a step's text, so everything below the text — a `|`-delimited
table, a `"""`-delimited block — reaches a step body untouched by it. Three things then have to be
true, and each is a place a naive implementation goes wrong in a way nothing fails on: the accessors
a step body wants do not exist upstream and have to be written; the ones with real failure modes have
to fail rather than silently drop data the way `@cucumber/cucumber` does; and a step carrying BOTH
arguments has to hand them over in the order its author wrote them, which is recoverable from
upstream data only if the implementation reads that data the correct way round.

```
REQUIREMENT: ParsedStep.stepArguments MUST be a ReadonlyArray<StepArgument>,
             where StepArgument is DocString | DataTable, discriminated by a
             literal _tag. A consumer narrows it with a plain switch on _tag,
             never with an `in` probe and never with instanceof — neither arm is
             a class instance.

             It MUST be [] for a step carrying no argument. Not absent, not an
             Option, not a one-element array holding a placeholder: an empty
             array is the honest representation of "this step carries nothing",
             and it is the one a consumer can spread unconditionally.
```

```
REQUIREMENT: ParsedStep.argument MUST remain the RAW upstream argument, carried
             as Option<PickleStepArgument>. It is an escape hatch, kept for the
             reason ParsedFeature.document and ParsedFeature.pickles are kept: a
             consumer needing something the accessors do not expose MUST NOT
             have to re-parse anything.

             Neither field is derived from the other at READ time. Both are
             produced once, in the same place, from the same PickleStep — so
             reading one can never disagree with reading the other, and no
             consumer is ever tempted to rebuild a DataTable from the raw side.
```

```
REQUIREMENT: When a step carries BOTH a DocString and a DataTable, they MUST
             arrive in the source order @cucumber/gherkin recorded on
             argumentIndex — ascending — never in a fixed convention this
             library chose.

             The trap, stated the correct way round because the declaration
             (argumentIndex?: number) invites the wrong reading: compile()
             assigns a NUMBER only when a step carries both arguments. When a
             step carries only ONE, compile() still writes the argumentIndex
             KEY, holding the value undefined — pickleDocString() and
             pickleTable() are unconditional object literals called with
             argumentIndex: undefined in the single-argument branches.

             So the key is ALWAYS PRESENT and only its VALUE is undefined. An
             implementation MUST read the VALUE and supply a fallback for
             undefined. A key-presence test — "argumentIndex" in x, or
             Object.hasOwn(x, "argumentIndex") — is true for every step ever
             pickled and therefore discriminates nothing at all.
```

```
REQUIREMENT: A DocString MUST be plain data with no accessors: content, plus
             mediaType as a REQUIRED field holding Option<string> — absent when
             the author wrote no content-type annotation after the opening
             delimiter. content IS the value; there is nothing to call.

             This is ADR-EC-008's correction drawing the line explicitly: a
             DataTable needs a wrapper because the accessors live in a package
             this library does not depend on, and a doc string does not. The
             _tag exists anyway, purely as the union's discriminant, and is NOT
             a hint that methods are coming.
```

```
REQUIREMENT: A DataTable MUST expose exactly three accessors, and MUST decode
             through Schema via decodeHashes (ADR-EC-008, ADR-EC-025).

             raw() is TOTAL. It returns every row's cell values in order,
             INCLUDING the header row, and [] for an empty table. Including the
             header matches @cucumber/cucumber's own raw(), and is precisely why
             hashes() exists as a separate accessor rather than as an option on
             this one.

             hashes() returns an Effect. It maps every BODY row to a record
             keyed by the header row's cell values. It MUST return [] for a
             header-only table and for an empty table — neither is a failure,
             both are simply tables with no body rows. It MUST fail with reason
             DuplicateHeaderColumn when the header row repeats a value, and MUST
             do so even when there are zero body rows, so the fault cannot hide
             behind a header-only table.

             rowsHash() returns an Effect. It reads EVERY row as a key/value
             pair; this shape has no header row. It MUST return {} for an empty
             table. It MUST fail with RowsHashRequiresTwoColumns when any row is
             not exactly two cells wide, checked across every row BEFORE any key
             is read, and with DuplicateRowKey when two rows share a key. A
             one-column table therefore FAILS at row 1 rather than returning {}:
             it is not a rowsHash table, and saying so is the whole point.

             decodeHashes(rowSchema) takes a ONE-ROW schema and wraps it in
             Schema.Array itself; passing an already-arrayed schema MUST be a
             type error. hashes() runs first and its failure propagates
             untouched, keeping its own DuplicateHeaderColumn tag rather than
             being flattened into a generic decode failure.

             DataTableError's reason set is closed at exactly four:
             DuplicateHeaderColumn, DuplicateRowKey, RowsHashRequiresTwoColumns,
             RowDecodeFailed.
```

```
REQUIREMENT: A failed decode MUST name the 1-based BODY-ROW ordinal and the
             column, alongside the feature uri and the step's line. The row
             ordinal is recoverable precisely because decodeHashes owns the
             Schema.Array wrapping: the first element of the resulting issue
             path IS the hashes() body-row index.

             The line reported is the STEP's, not the row's, and the reason is
             an upstream fact rather than a shortcut: a PickleTableRow carries
             no location field at all. row is therefore an ordinal that narrows
             the step's line, and BOTH row and column are Option-typed, because
             a header fault has no body-row ordinal, a width fault has no single
             column, and a top-level decode failure produces an empty issue
             path. An absent locator MUST be reported as absent, never as a
             silently-wrong "Row 1".
```

```
REQUIREMENT: A step body MUST receive its stepArguments POSITIONALLY, APPENDED
             after the cucumber-expression arguments, in the order this file
             already settled. A step carrying no argument spreads [] and its
             body's parameter list is exactly the pattern's — which is why the
             empty array above is required to be an array and not an absent
             field.

             The two sources cannot collide. A cucumber-expression is matched
             against a step's TEXT and these arguments are everything BELOW that
             text, so no parameter token can consume a table cell and no table
             can displace a pattern argument.

             StepArgs<P> MUST NOT infer these parameters, and this is a
             REQUIREMENT rather than a limitation being excused. StepArgs<P>
             resolves a step body's parameters from the pattern LITERAL, and a
             pattern literal cannot express a table's presence: there is no
             brace token for a DataTable and there deliberately is none, because
             a table is not part of the text a pattern matches. So the author
             MUST annotate the trailing parameter explicitly — (table: DataTable)
             — and the annotation is the only place that claim exists.

             APPENDED, never prepended, and the ordering is load-bearing rather
             than conventional. Prepending would place an un-inferrable
             parameter ahead of every inferred one, so StepArgs<P> would report
             each pattern argument at an index one lower than the position it
             actually arrives at, and a step body taking a table would receive
             its own pattern's arguments shifted. Appending leaves every
             inferred parameter at the index StepArgs<P> assigns it.
```

### Two decisions a reader will otherwise ask about

**Why `hashes()` and `rowsHash()` return an `Effect` while `raw()` does not.** The asymmetry is the
contract, not an oversight. `raw()` genuinely cannot fail; the other two can, and
`@cucumber/cucumber` resolves both failures by silently dropping data — the last cell wins on a
duplicate header, and `rowsHash()` keeps the first two cells of a wider row. `@cucumber/gherkin`
accepts a duplicate header cell without complaint, so nothing upstream of this wrapper will ever
notice. The call-site cost is one keyword: a step body is already a generator under
[ADR-EC-005](../decisions/005-effect-fn-for-step-and-hook-bodies.md), so the author writes
`yield* table.hashes()`. See [ADR-EC-025](../decisions/025-datatable-wrapper-accessor-contract.md)
for the rejected alternative in full.

**Why the result is an ordered array rather than a `{ docString, dataTable }` record.** A record has
no order, so it would push the ordering question onto every consumer and answer it nowhere — and
`argumentIndex` is a real upstream fact, verified in both directions against a byte-mirrored fixture
pair, so the answer exists and only has to be read once. The step-body signature above spreads this
array, which only works because the order is already settled here; `packages/vitest/src/Plan.ts`'s
`planStep` is the single place that spread happens, and it neither re-sorts the array nor inspects
it.

### Signatures

```ts
export interface DocString {
  readonly _tag: "DocString"
  readonly content: string
  readonly mediaType: Option.Option<string>
}

export interface DataTable {
  readonly _tag: "DataTable"
  readonly uri: string
  readonly line: number
  readonly rows: ReadonlyArray<PickleTableRow>
  readonly raw: () => ReadonlyArray<ReadonlyArray<string>>
  readonly hashes: () => Effect.Effect<ReadonlyArray<Readonly<Record<string, string>>>, DataTableError>
  readonly rowsHash: () => Effect.Effect<Readonly<Record<string, string>>, DataTableError>
}

export type StepArgument = DocString | DataTable

export const makeDataTable: (table: PickleTable, uri: string, line: number) => DataTable

export const decodeHashes: <S extends Schema.Constraint>(
  rowSchema: S
) => (table: DataTable) => Effect.Effect<ReadonlyArray<S["Type"]>, DataTableError, S["DecodingServices"]>

export const stepArgumentsOf: (
  argument: PickleStepArgument | undefined,
  uri: string,
  line: number
) => ReadonlyArray<StepArgument>

export class DataTableError extends Schema.TaggedError<DataTableError>()("DataTableError", {
  reason: Schema.Literals([
    "DuplicateHeaderColumn",
    "DuplicateRowKey",
    "RowsHashRequiresTwoColumns",
    "RowDecodeFailed"
  ]),
  uri: Schema.String,
  line: Schema.OptionFromUndefinedOr(Schema.Number),
  row: Schema.OptionFromUndefinedOr(Schema.Number),
  column: Schema.OptionFromUndefinedOr(Schema.String),
  message: Schema.String,
  cause: Schema.OptionFromUndefinedOr(Schema.Unknown)
}) {}
```

`DataTableErrorReason` is exported alongside the class as the plain union of the four literals above.
`makeDataTable` and `stepArgumentsOf` are exported for a consumer building a `ParsedStep` by hand;
correlation already applies `stepArgumentsOf` to every step, so a caller reading a `ParsedFeature`
never needs either one. `stepArgumentsOf` takes the raw upstream `PickleStepArgument | undefined`
rather than `ParsedStep.argument`'s `Option<PickleStepArgument>`, because it runs during correlation,
upstream of the point where that `Option` is constructed.

`decodeHashes`' type parameter mirrors `Schema.decodeUnknownEffect`'s own, so a row schema carrying
decoding services propagates them into the resulting Effect's `R` channel rather than erasing them to
`never`.

### Worked example

```typescript
import { type DataTable, decodeHashes } from "@effect-cucumber/gherkin"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"

// One ROW, never Schema.Array(User) — decodeHashes does the array wrapping itself, and that is
// what lets it name the offending row rather than an index into a value nobody wrote.
const User = Schema.Struct({ name: Schema.String, email: Schema.String })

// A step-shaped body. The step-registration call shape AROUND this function is BEH-EC-002's, not
// this file's, so only the body is shown. `table` is annotated rather than inferred, and it is the
// LAST parameter: this pattern happens to take no cucumber-expression arguments, so it is also the
// first, but a pattern with parameters puts them ahead of it.
export const registerUsers = Effect.fn("registerUsers")(function*(table: DataTable) {
  // Fails with a located DataTableError naming the row and the column when a row does not decode,
  // and propagates DuplicateHeaderColumn untouched when the table's own header is at fault.
  const users = yield* decodeHashes(User)(table)

  // raw() is total, so it needs no yield*: header row included, [] for an empty table.
  const columnCount = table.raw()[0]?.length ?? 0

  return { columnCount, users }
})
```

---

_Previous: [05 — Step matching and parameter types](./05-step-matching-and-parameter-types.md)_

_Next: [07 — Hook ordering and guarantees](./07-hook-ordering-and-guarantees.md)_

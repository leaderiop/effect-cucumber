# 12 — An Outline column no step pattern references

What happens to an Examples column no `Given`/`When`/`Then` pattern's cucumber-expression ever
mentions. [BEH-EC-010](./03-rules-outlines-and-testclock.md#beh-ec-010-scenario-outline-examples-are-typed-for-free)
specifies the column that IS referenced — a `<placeholder>` substituted into a step's text before
matching, coerced by that pattern's own token (`{int}`, `{float}`, ...). This file specifies the
complementary case: a column that appears only in the `Examples:` table, never inside any step's
text at all, so cucumber-expressions never touches it and no pattern hole can type it.

> **See:** [ADR-EC-008](../decisions/008-data-tables-and-doc-strings-decode-through-schema.md), [ADR-EC-032](../decisions/032-outline-examplesrow-carries-the-raw-row-decoded-on-demand-not-a-per-feature-schema.md)

See [`spec/roadmap.md`](../roadmap.md) for what is built versus what is only specified — this
document describes the contract, not the build status.

---

## BEH-EC-024: An Outline row's raw Examples data reaches every step of that row, decoded through Schema on demand

```
REQUIREMENT: ParsedScenario.exampleRow MUST be Option.some(ExamplesRow) for a
             Scenario compiled from an Examples tableBody row, and
             Option.none() for a plain Scenario. ExamplesRow MUST carry the
             row's own header (column names, in declaration order,
             duplicates preserved), values (that row's own cells, positional
             with header) and raw (header/values zipped into a record, a
             duplicate column name keeping its FIRST value — mirroring the
             existing DuplicateExamplesColumn WARNING this library already
             emits for that shape, not DataTable's harder failure).

             For an Outline with more than one Examples: block, each row's
             ExamplesRow MUST carry that block's OWN header, never another
             block's.
```

```
REQUIREMENT: A step's body parameters are StepParams<P> (BEH-EC-003):
             pattern holes typed by StepArgs, then the unchecked tail
             BEH-EC-016 already gives a DataTable/DocString. This Scenario's
             own ExamplesRow, when Option.some, MUST be appended to that SAME
             tail, LAST — after any DataTable/DocString the step itself
             carries — for EVERY step of the Scenario, not only a step whose
             author declared a trailing parameter for it. A plain Scenario's
             steps MUST gain no extra tail item at all: Option.none()
             contributes nothing.

             The annotation is UNVERIFIED, the same standing gap BEH-EC-016
             already states for DataTable/DocString: StepParams<P>'s tail is
             `...ReadonlyArray<any>`, so a step body that does not declare a
             trailing parameter silently receives (and ignores) the extra
             argument, and one that declares the wrong type compiles anyway.
```

```
REQUIREMENT: decodeExamplesRow(rowSchema) MUST decode an ExamplesRow's raw
             record through a caller-supplied Schema, the same mechanism
             decodeHashes gives a DataTable (ADR-EC-008) — same
             Schema.decodeUnknownEffect call, same type parameter shape
             (S["Type"] / S["DecodingServices"] propagated, never erased to
             never). It MUST fail with a located ExamplesRowError
             (reason: "RowDecodeFailed") naming the uri, the row's own line,
             and the offending column when the issue path resolves one.

             No Schema is EVER declared ahead of a step body that wants one —
             not on describeFeature, not on loadFeature, not on any other
             Feature-scoped surface. A step that wants typed columns calls
             decodeExamplesRow inside its own body, exactly where a step that
             wants a typed DataTable already calls decodeHashes.
```

### Two decisions a reader will otherwise ask about

**Why every step of the row, not only the one an author annotates.** BEH-EC-016's DataTable/DocString
is optional PER STEP because `compile()`'s `PickleStepArgument` really is a property of that one
step's own Gherkin text — one step in a Scenario can carry a table the next does not. An Examples row
has no equivalent per-step shape: it is a property of the whole Scenario (one row, shared by every
step inside it), the same way `scenario.astName` and `scenario.tags` already are. See
[ADR-EC-032](../decisions/032-outline-examplesrow-carries-the-raw-row-decoded-on-demand-not-a-per-feature-schema.md)
for the fuller argument, including why "attach it only where an author asked" has no mechanism to
hang on anywhere else in this DSL's registration model.

**Why no per-Feature Schema declaration, unlike the original roadmap sketch.** One Feature can
contain more than one `Scenario Outline`, and one Outline can carry more than one `Examples:` block
with a DIFFERENT header (this repository's own `outline-two-examples-blocks.feature` fixture is
exactly that shape) — there is no single "the Feature's columns" a per-Feature Schema could type. See
ADR-EC-032 for the full correction; it is the same category of correction ADR-EC-030/031 made to
their own roadmap sketches once the real API was checked against them.

### Signatures

```ts
export interface ExamplesRow {
  readonly _tag: "ExamplesRow"
  readonly uri: string
  readonly line: number
  readonly header: ReadonlyArray<string>
  readonly values: ReadonlyArray<string>
  readonly raw: Readonly<Record<string, string>>
}

export const decodeExamplesRow: <S extends Schema.Constraint>(
  rowSchema: S
) => (row: ExamplesRow) => Effect.Effect<S["Type"], ExamplesRowError, S["DecodingServices"]>

export class ExamplesRowError extends Schema.TaggedError<ExamplesRowError>()("ExamplesRowError", {
  reason: Schema.Literals(["RowDecodeFailed"]),
  uri: Schema.String,
  line: Schema.OptionFromUndefinedOr(Schema.Number),
  column: Schema.OptionFromUndefinedOr(Schema.String),
  message: Schema.String,
  cause: Schema.optionalKey(Schema.Unknown)
}) {}
```

### Worked example

```typescript
import { decodeExamplesRow, type ExamplesRow } from "@effect-cucumber/gherkin"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"

// A row schema covering a column no step pattern's text ever mentions (`priority`), beside one that
// IS pattern-coerced elsewhere in the same Scenario (`sku`, typically via a `{string}` hole).
const ShipmentRow = Schema.Struct({
  sku: Schema.String,
  priority: Schema.NumberFromString
})

// A step-shaped body. The registration call shape AROUND this function is BEH-EC-002's, not this
// file's, so only the body is shown — the trailing `row` parameter is annotated, never inferred,
// the same UNVERIFIED-annotation shape BEH-EC-016 already documents for a DataTable.
export const decodeShipmentRow = Effect.fn("decodeShipmentRow")(function*(row: ExamplesRow) {
  // Fails with a located ExamplesRowError naming the column when the row does not decode.
  const shipment = yield* decodeExamplesRow(ShipmentRow)(row)

  // raw is total, so it needs no yield* — every column this row's Examples header declared,
  // whether or not any step pattern ever mentioned it.
  const columnCount = Object.keys(row.raw).length

  return { columnCount, shipment }
})
```

---

_Previous: [11 — Per-Scenario deterministic Random seeding](./11-scenario-seeding.md)_

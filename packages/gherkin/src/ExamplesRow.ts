/**
 * The raw Examples row (column name -> string) for one Scenario Outline row, wrapped so a step body
 * can decode selected columns through Schema (ADR-EC-008's precedent, extended by ADR-EC-032) — the
 * same construct DataTable's `hashes()` + `decodeHashes` gives a step for a table, applied one level
 * up: a whole Outline row rather than a table's body rows. `ParsedScenario.exampleRow` is `Option.none()`
 * for a plain Scenario; only a Pickle correlated back to a tableBody row (`Correlate.ts`'s `rowById`
 * index) carries one.
 *
 * A duplicate Examples column keeps the FIRST value in `raw`, mirroring `Validate.ts`'s existing
 * `DuplicateExamplesColumn` WARNING — an Examples column already tolerates a duplicate name that way
 * upstream, unlike a DataTable's duplicate header, which ADR-EC-008/025 deliberately refuse to
 * resolve at all. `header`/`values` stay POSITIONAL and undeduped beside `raw`, because
 * `OutlineTitle.ts`'s title suffix already reads a row this same way (`header[i]=values[i]`) and must
 * keep doing so unchanged by this module's arrival.
 */
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import { firstIssuePath } from "./DataTable.ts"
import { ExamplesRowError } from "./Errors.ts"

/** One Scenario Outline row, before any column is decoded. */
export interface ExamplesRow {
  readonly _tag: "ExamplesRow"
  /** The feature file this row came from, carried so a decode failure can name it unprompted. */
  readonly uri: string
  /** This row's own line — `Pickle.location`, per-Examples-row for an Outline (`Model.ts`). */
  readonly line: number
  /** Column names, in the order the `Examples:` block's header declares them; duplicates preserved. */
  readonly header: ReadonlyArray<string>
  /** This row's cell values, positional with `header` — `values[i]` is `header[i]`'s cell. */
  readonly values: ReadonlyArray<string>
  /** `header`/`values` zipped into a record; a duplicate column name keeps its FIRST value. */
  readonly raw: Readonly<Record<string, string>>
}

/** Build an `ExamplesRow` from the header/value pair `Correlate.ts` already has in hand. */
export const makeExamplesRow = (
  header: ReadonlyArray<string>,
  values: ReadonlyArray<string>,
  uri: string,
  line: number
): ExamplesRow => {
  const raw: Record<string, string> = {}
  header.forEach((name, index) => {
    if (!Object.hasOwn(raw, name)) {
      raw[name] = values[index] ?? ""
    }
  })
  return { _tag: "ExamplesRow", uri, line, header, values, raw }
}

/** Locate a decode failure the same way `DataTable.ts`'s `rowDecodeFailed` does, one level shallower:
 * an `ExamplesRow` decodes to ONE value, so the issue path's first element is already the column. */
const rowDecodeFailed = (row: ExamplesRow, schemaError: Schema.SchemaError): ExamplesRowError => {
  const path = firstIssuePath(schemaError.issue, [])
  const key = path[0]
  const column: Option.Option<string> = typeof key === "string" ? Option.some(key) : Option.none()
  const opening = Option.isSome(column)
    ? `The Examples row at ${row.uri}:${row.line} failed to decode, column ${JSON.stringify(column.value)}`
    : `The Examples row at ${row.uri}:${row.line} failed to decode`
  return new ExamplesRowError({
    reason: "RowDecodeFailed",
    uri: row.uri,
    line: Option.some(row.line),
    column,
    // Reproduced whole, no ellipsis, per `Errors.ts`.
    message: `${opening}: ${schemaError.message} The row was ${JSON.stringify(row.raw)}.`,
    cause: schemaError
  })
}

/**
 * Decode an `ExamplesRow`'s `raw` record through a `Schema`, naming the offending column on failure
 * (ADR-EC-032, mirroring `decodeHashes`, ADR-EC-008). The type parameter mirrors
 * `Schema.decodeUnknownEffect`'s own, so a row schema's decoding services propagate into the
 * resulting Effect's `R` channel rather than being erased to `never`.
 */
export const decodeExamplesRow =
  <S extends Schema.Constraint>(rowSchema: S) =>
  (row: ExamplesRow): Effect.Effect<S["Type"], ExamplesRowError, S["DecodingServices"]> =>
    Effect.mapError(
      Schema.decodeUnknownEffect(rowSchema)(row.raw),
      (schemaError) => rowDecodeFailed(row, schemaError)
    )

/**
 * The DataTable wrapper — `raw()`, `hashes()`, `rowsHash()` over a raw `PickleTable` — plus `decodeHashes`
 * (ADR-EC-008). A `PickleTable` is plain data with no methods; the accessors live in `@cucumber/cucumber`, which
 * ADR-EC-011 keeps out of this dependency graph (`pnpm verify:no-runner-dep`).
 *
 * `raw()` is pure; `hashes()` and `rowsHash()` return an `Effect` because they have real failure modes that
 * `@cucumber/cucumber` resolves by letting the last cell win — surfaced here as a named `DataTableError` instead,
 * at zero call-site cost under ADR-EC-005 (`yield* table.hashes()`).
 *
 * Rows are rectangular: the parser rejects an inconsistent cell count (`test/upstream-pin.test.ts`), so there is
 * no ragged-row branch; the `?? ""` in `recordOf` is `noUncheckedIndexedAccess`'s requirement, not one.
 * `decodeHashes` is a standalone function, not a method: the `DataTable` value is built per step by
 * `Correlate.ts`, where no schema is in hand. Every message quotes content whole (`Errors.ts`).
 */
import type { PickleTable, PickleTableRow } from "@cucumber/messages"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import type * as SchemaIssue from "effect/SchemaIssue"
import { DataTableError, type DataTableErrorReason } from "./Errors.ts"

/** Every cell value of one row, in order. */
const cellsOf = (row: PickleTableRow): ReadonlyArray<string> => row.cells.map((cell) => cell.value)

/** One row rendered as its author wrote it, values reproduced whole. */
const quoteRow = (values: ReadonlyArray<string>): string => `| ${values.join(" | ")} |`

/** The first value appearing twice, left to right, so the message is deterministic. */
const firstDuplicate = (values: ReadonlyArray<string>): Option.Option<string> => {
  const seen = new Set<string>()
  for (const value of values) {
    if (seen.has(value)) {
      return Option.some(value)
    }
    seen.add(value)
  }
  return Option.none()
}

/**
 * Build a `DataTableError` shaped `<uri>:<line>: <reason>: ...`. `row` and `column` are `Option`s so a header
 * fault (no row) and a width fault (no column) are visible as `Option.none()` at the call site.
 */
const dataTableError = (args: {
  reason: DataTableErrorReason
  uri: string
  line: number
  row: Option.Option<number>
  column: Option.Option<string>
  sentences: ReadonlyArray<string>
}): DataTableError =>
  new DataTableError({
    reason: args.reason,
    uri: args.uri,
    line: Option.some(args.line),
    row: args.row,
    column: args.column,
    message: `${args.uri}:${args.line}: ${args.reason}: ${args.sentences.join(" ")}`
  })

/**
 * One body row keyed by the header cells — through `Object.fromEntries`, never indexed assignment: a header cell
 * named `__proto__` would otherwise rewrite the record's prototype and vanish (`test/DataTable.test.ts`).
 */
const recordOf = (header: ReadonlyArray<string>, row: PickleTableRow): Readonly<Record<string, string>> =>
  Object.fromEntries(header.map((name, index) => [name, row.cells[index]?.value ?? ""]))

/** A step's DataTable argument with the three accessors a step body wants; one arm of `StepArgument`. */
export interface DataTable {
  readonly _tag: "DataTable"
  /** The feature file this table came from, carried so every failure can name it unprompted. */
  readonly uri: string
  /** The STEP's line: a `PickleTableRow` carries no location (`test/upstream-pin.test.ts`). */
  readonly line: number
  /** The raw pickle rows, by reference — the escape hatch for anything the accessors do not expose. */
  readonly rows: ReadonlyArray<PickleTableRow>
  /** Every row's cells INCLUDING the header, as `@cucumber/cucumber`'s `raw()` does; total, `[]` when empty. */
  readonly raw: () => ReadonlyArray<ReadonlyArray<string>>
  /**
   * Every BODY row keyed by the header; `[]` for a header-only or empty table. Fails `DuplicateHeaderColumn`
   * when the header repeats a value.
   */
  readonly hashes: () => Effect.Effect<ReadonlyArray<Readonly<Record<string, string>>>, DataTableError>
  /**
   * EVERY row as a key/value pair (no header row); `{}` when empty. Fails `RowsHashRequiresTwoColumns` when a
   * row is not two cells wide and `DuplicateRowKey` when two rows share a key.
   */
  readonly rowsHash: () => Effect.Effect<Readonly<Record<string, string>>, DataTableError>
}

/** Wrap a raw `PickleTable` as a `DataTable` located at `uri`:`line` (the step's line). */
export const makeDataTable = (table: PickleTable, uri: string, line: number): DataTable => {
  const rows = table.rows

  const raw = (): ReadonlyArray<ReadonlyArray<string>> => rows.map(cellsOf)

  const hashes = (): Effect.Effect<ReadonlyArray<Readonly<Record<string, string>>>, DataTableError> => {
    const headerRow = rows[0]
    if (headerRow === undefined) {
      return Effect.succeed([])
    }
    const header = cellsOf(headerRow)

    // Checked before the body rows and even without any: a header fault must not hide behind `[]`.
    const repeated = firstDuplicate(header)
    if (Option.isSome(repeated)) {
      return Effect.fail(dataTableError({
        reason: "DuplicateHeaderColumn",
        uri,
        line,
        // The fault is in the header row, not in any body row, so there is no ordinal to report.
        row: Option.none(),
        column: Option.some(repeated.value),
        sentences: [
          `the header row of this DataTable repeats the column \`${repeated.value}\`,`,
          `so a row record cannot carry both columns:`,
          `${quoteRow(header)}.`,
          `Rename one of them. @cucumber/cucumber's own hashes() resolves this by letting the last`,
          `cell win, which silently drops a column; this library refuses to.`
        ]
      }))
    }

    return Effect.succeed(rows.slice(1).map((row) => recordOf(header, row)))
  }

  const rowsHash = (): Effect.Effect<Readonly<Record<string, string>>, DataTableError> => {
    // Width over EVERY row before any key is read, so the verdict never depends on which row repeated first.
    for (const [index, row] of rows.entries()) {
      if (row.cells.length !== 2) {
        return Effect.fail(dataTableError({
          reason: "RowsHashRequiresTwoColumns",
          uri,
          line,
          row: Option.some(index + 1),
          // No single column is at fault: the row's whole width is.
          column: Option.none(),
          sentences: [
            `rowsHash() reads every row of this DataTable as a key/value pair, so each row must be`,
            `exactly 2 cells wide, but row ${index + 1} is ${row.cells.length} cells wide:`,
            `${quoteRow(cellsOf(row))}.`,
            `Use hashes() for a table with a header row and three or more columns.`
          ]
        }))
      }
    }

    const keys = rows.map((row) => row.cells[0]?.value ?? "")
    const repeated = firstDuplicate(keys)
    if (Option.isSome(repeated)) {
      // The SECOND occurrence is the offending one.
      const second = keys.indexOf(repeated.value, keys.indexOf(repeated.value) + 1)
      return Effect.fail(dataTableError({
        reason: "DuplicateRowKey",
        uri,
        line,
        row: Option.some(second + 1),
        column: Option.some(repeated.value),
        sentences: [
          `rowsHash() found the key \`${repeated.value}\` twice in this DataTable, at rows`,
          `${keys.indexOf(repeated.value) + 1} and ${second + 1}, so the second row would overwrite`,
          `the first. Rename one key, or use hashes() if both rows are meant to be kept.`
        ]
      }))
    }

    return Effect.succeed(Object.fromEntries(rows.map((row) => [row.cells[0]?.value ?? "", row.cells[1]?.value ?? ""])))
  }

  return { _tag: "DataTable", uri, line, rows, raw, hashes, rowsHash }
}

/**
 * Discriminate on the `_tag` STRING, never `instanceof`: `effect` is a peer dependency and two copies in one
 * graph make `instanceof` false. `test/schema-issue-pin.test.ts` asserts tag and class still agree.
 */
const isPointerIssue = (issue: SchemaIssue.Issue): issue is SchemaIssue.Pointer => {
  const { _tag } = issue
  return _tag === "Pointer"
}

const isCompositeIssue = (issue: SchemaIssue.Issue): issue is SchemaIssue.Composite => {
  const { _tag } = issue
  return _tag === "Composite"
}

/**
 * The first locatable leaf's accumulated `Pointer` path, or `[]`. Relies on the issue-tree shape
 * `test/schema-issue-pin.test.ts` pins against the installed `effect`; keep the two walks in step.
 */
const firstIssuePath = (
  issue: SchemaIssue.Issue,
  prefix: ReadonlyArray<PropertyKey>
): ReadonlyArray<PropertyKey> => {
  if (isPointerIssue(issue)) {
    return firstIssuePath(issue.issue, [...prefix, ...issue.path])
  }
  if (isCompositeIssue(issue)) {
    for (const child of issue.issues) {
      const path = firstIssuePath(child, prefix)
      if (path.length > 0) {
        return path
      }
    }
    return []
  }
  return prefix
}

/**
 * Convert a `SchemaError` from decoding one table's `hashes()` into a LOCATED `DataTableError`: the path's first
 * element is the body-row index (because `decodeHashes` introduced the array level), its second the column.
 * Both `typeof` checks are load-bearing: a reshaped path must yield an ABSENT locator, never a wrong "Row 1".
 */
const rowDecodeFailed = (
  table: DataTable,
  rows: ReadonlyArray<Readonly<Record<string, string>>>,
  schemaError: Schema.SchemaError
): DataTableError => {
  const path = firstIssuePath(schemaError.issue, [])
  const index = path[0]
  const key = path[1]
  const row: Option.Option<number> = typeof index === "number" ? Option.some(index + 1) : Option.none()
  const column: Option.Option<string> = typeof key === "string" ? Option.some(key) : Option.none()
  const offending = typeof index === "number" ? rows[index] : undefined

  const opening = Option.isSome(row)
    ? `Row ${row.value} of the DataTable at ${table.uri}:${table.line} failed to decode`
    : `The DataTable at ${table.uri}:${table.line} failed to decode`
  const located = Option.isSome(column) ? `${opening}, column ${JSON.stringify(column.value)}` : opening
  // Reproduced whole, no ellipsis, per `Errors.ts`.
  const subject = offending === undefined
    ? `The rows were ${JSON.stringify(rows)}.`
    : `The row was ${JSON.stringify(offending)}.`

  return new DataTableError({
    reason: "RowDecodeFailed",
    uri: table.uri,
    line: Option.some(table.line),
    row,
    column,
    message: `${located}: ${schemaError.message} ${subject}`,
    cause: schemaError
  })
}

/**
 * Decode a DataTable's body rows through a `Schema`, naming the offending row and column (ADR-EC-008).
 * `rowSchema` describes ONE row; this function does the `Schema.Array` wrapping, which is what makes the issue
 * path's index the body-row index. `table.hashes()` runs first and its own failure propagates untouched. The
 * type parameter mirrors `Schema.decodeUnknownEffect`'s so a row schema's decoding services reach `R`.
 */
export const decodeHashes =
  <S extends Schema.Constraint>(rowSchema: S) =>
  (table: DataTable): Effect.Effect<ReadonlyArray<S["Type"]>, DataTableError, S["DecodingServices"]> =>
    Effect.flatMap(table.hashes(), (rows) =>
      Effect.mapError(
        Schema.decodeUnknownEffect(Schema.Array(rowSchema))(rows),
        (schemaError) => rowDecodeFailed(table, rows, schemaError)
      ))

/**
 * `@effect-cucumber/gherkin`'s own DataTable wrapper: `raw()`, `hashes()` and `rowsHash()` over a
 * raw `PickleTable`, plus the `decodeHashes` decoder that makes ADR-EC-008 true.
 *
 * Five decisions are recorded here, because none of them is visible from the code that implements
 * them.
 *
 * (a) **This module exists because those three accessors are not free.**
 *     [ADR-EC-008](../../../spec/decisions/008-data-tables-and-doc-strings-decode-through-schema.md)'s
 *     correction states it plainly: `.hashes()` does not exist anywhere in
 *     `@cucumber/gherkin`/`@cucumber/messages` — a `PickleTable` is plain data,
 *     `{ rows: [{ cells: [{ value }] }] }`, with no methods at all. The accessor methods live in
 *     `@cucumber/cucumber`, the full Cucumber.js runner, which
 *     [ADR-EC-011](../../../spec/decisions/011-official-cucumber-parser-packages.md) keeps out of
 *     this dependency graph. So this package implements its own thin wrapper, and
 *     `pnpm verify:no-runner-dep` is the gate that keeps it that way.
 *
 * (b) **`raw()` is pure while `hashes()` and `rowsHash()` return an `Effect`, and the asymmetry is
 *     deliberate.** `raw()` has no failure mode: every row has cells, every cell has a string
 *     value, and returning them in order cannot go wrong. The other two have real failure modes
 *     that `@cucumber/cucumber` resolves by letting the last cell win — a duplicate header column
 *     silently drops a column, and a `rowsHash()` over a table that is not two columns wide
 *     silently keeps only the first two cells of each row. This package's whole reason for
 *     existing (see `Validate.ts`) is that a silently-wrong result is worse than a loud one, so
 *     both are surfaced as a named `DataTableError` instead. The call-site cost is zero: a step
 *     body is already a generator under
 *     [ADR-EC-005](../../../spec/decisions/005-hooks-and-steps-are-effects.md), so the caller
 *     writes `yield* table.hashes()` where it would otherwise have written `table.hashes()`.
 *
 * (c) **ADR-EC-008's worked example is out of date in two ways, and this note is the source text
 *     for the correction plan 04-05 records in `spec/`.** That example passes `table.hashes()`
 *     straight into a decoder as a plain value; under (b) it is an `Effect` and has to be
 *     `yield*`-ed first. It also calls `Schema.decodeUnknown`, which effect v4 renamed to
 *     `Schema.decodeUnknownEffect` — and it predates
 *     [ADR-EC-021](../../../spec/decisions/021-effect-and-platform-are-peer-dependencies-of-gherkin.md)
 *     making `effect` reachable from this package at all. The fence is a `ts` fence, i.e.
 *     reference material that is never compiled (AGENTS.md §2), which is exactly why the drift
 *     went unnoticed. The Decision itself — data tables decode through `Schema` — is unaffected.
 *
 * (d) **Rows are guaranteed rectangular, so there is no ragged-row branch anywhere below.**
 *     `@cucumber/gherkin`'s own parser rejects an inconsistent cell count within one table
 *     (fixture row F10, pinned in `test/upstream-pin.test.ts`), so every row of a parsed table has
 *     the same width as the header. A defensive ragged-row branch here would be unreachable and
 *     therefore untestable, which is worse than absent. The single `?? ""` in `recordOf` is not
 *     that branch: it is what `noUncheckedIndexedAccess` requires of any index expression, and it
 *     cannot be reached at runtime for the reason just given.
 *
 * (e) **`decodeHashes` is a standalone exported function, not a `decode` method on the `DataTable`
 *     interface.** A generic method would have to carry the `Schema.Constraint` type parameter
 *     through the interface declaration itself, and the `DataTable` VALUE is constructed per step
 *     by `Correlate.ts`, where no schema is in hand and none could be — the schema belongs to the
 *     step body, which is written by the consuming project. Keeping it standalone also keeps
 *     `makeDataTable`'s return value a plain data record with no schema-shaped hole in it, which
 *     is what lets `DataTable` be one arm of plan 04-04's `StepArgument` union without dragging a
 *     type parameter into that union.
 *
 *     Its message deliberately does NOT follow the `<uri>:<line>: <reason>: <sentences>` shape the
 *     three failures above use. Those are faults in the table's own SHAPE, where the file location
 *     is the first thing a reader needs. A decode failure is a fault in one ROW against a schema
 *     the step author wrote, so the row ordinal leads and the location follows it inline. The
 *     no-truncation policy of `Errors.ts` note (b) still applies verbatim: the offending row is
 *     reproduced whole, and the underlying `SchemaError` message is embedded unedited.
 *
 * Local imports: `./Errors.ts` only. Third-party imports reach the `@cucumber/messages` BARREL,
 * never a deep path into its published build directory — the rule `Model.ts` and `StepMatcher.ts`
 * already follow.
 */
import type { PickleTable, PickleTableRow } from "@cucumber/messages"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import type * as SchemaIssue from "effect/SchemaIssue"
import { DataTableError, type DataTableErrorReason } from "./Errors.ts"

/** Every cell value of one row, in order. */
const cellsOf = (row: PickleTableRow): ReadonlyArray<string> => row.cells.map((cell) => cell.value)

/**
 * One row rendered the way its author wrote it in the `.feature` file, so an error message can be
 * read against the source without counting columns.
 *
 * Values are reproduced whole — `Errors.ts` note (b)'s no-truncation policy governs every message
 * this module builds. Do not add an ellipsis, a maximum length, or a slice here.
 */
const quoteRow = (values: ReadonlyArray<string>): string => `| ${values.join(" | ")} |`

/**
 * The first value that appears twice, scanning left to right, or `Option.none()` if every value is
 * distinct.
 *
 * "First repeat in left-to-right order" is the reported one, so two independently duplicated
 * columns report the leftward fault first and the message stays deterministic.
 */
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
 * Build a `DataTableError` shaped `<uri>:<line>: <reason>: <what happened, then what to do>`,
 * matching the message convention `Validate.ts` established for `LoadFeatureError` and
 * `StepPatternMessages.ts` for `StepPatternError`.
 *
 * `row` and `column` are taken as `Option` values rather than as plain omittable arguments,
 * unlike `raiseStepPatternError`'s: every failure below has a considered answer for both — a
 * header fault genuinely has no body-row ordinal, a width fault genuinely has no single column —
 * and writing `Option.none()` at the call site is what makes that visible in review.
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
 * One body row as a record keyed by the header cell values.
 *
 * `Object.fromEntries`, never a loop that assigns into `record[header]`, and this is a correctness
 * requirement rather than a style preference (threat T-04-03). A header cell is `.feature` file
 * content, and a feature file may be third-party or generated; a cell literally named `__proto__`
 * written through an indexed assignment REWRITES the record's prototype and leaves no own property
 * behind, so the key silently disappears from the result. `Object.defineProperty` semantics — which
 * is what `Object.fromEntries` uses — instead define it as an ordinary own property. Both
 * behaviours were verified against Node 22 before this module was written, and
 * `test/DataTable.test.ts` pins the difference.
 */
const recordOf = (header: ReadonlyArray<string>, row: PickleTableRow): Readonly<Record<string, string>> =>
  Object.fromEntries(header.map((name, index) => [name, row.cells[index]?.value ?? ""]))

/**
 * A step's DataTable argument, wrapped with the three accessors a step body actually wants.
 *
 * One arm of the `StepArgument` union plan 04-04 assembles, which is what `_tag` discriminates.
 */
export interface DataTable {
  readonly _tag: "DataTable"
  /** The feature file this table came from, carried so every failure can name it unprompted. */
  readonly uri: string
  /**
   * The STEP's line, not any row's. A `PickleTableRow` carries no location field at all —
   * `Object.keys(row)` is exactly `["cells"]`, pinned in `test/upstream-pin.test.ts` — so this is
   * the finest source location a table has, and `DataTableError.row` is what narrows it further.
   */
  readonly line: number
  /**
   * The raw pickle rows, passed through by reference and never copied. Kept as an escape hatch for
   * the same reason `ParsedFeature.document` and `ParsedFeature.pickles` are kept: a consumer
   * needing something these three accessors do not expose should not have to re-parse anything.
   */
  readonly rows: ReadonlyArray<PickleTableRow>
  /**
   * Every row's cell values, in order, INCLUDING the header row. Total: it has no failure mode and
   * returns `[]` for an empty table.
   *
   * Including the header matches `@cucumber/cucumber`'s own `raw()`, and is precisely why
   * `hashes()` exists as a separate accessor rather than as an option on this one.
   */
  readonly raw: () => ReadonlyArray<ReadonlyArray<string>>
  /**
   * Every BODY row as a record keyed by the header row's cell values.
   *
   * `[]` for a header-only table and for an empty table — neither is a failure, both are simply
   * tables with no body rows. Fails with reason `DuplicateHeaderColumn` when the header row
   * repeats a value, because no record can carry both columns and `@cucumber/cucumber` resolves
   * that by letting the last cell win (see the module doc comment (b)).
   */
  readonly hashes: () => Effect.Effect<ReadonlyArray<Readonly<Record<string, string>>>, DataTableError>
  /**
   * EVERY row read as a key/value pair — this shape has no header row.
   *
   * `{}` for an empty table. Fails with reason `RowsHashRequiresTwoColumns` when any row is not
   * exactly two cells wide, and with `DuplicateRowKey` when two rows share a key. A one-column
   * table therefore fails at row 1 rather than returning `{}`: it is not a `rowsHash` table, and
   * saying so is the whole point.
   */
  readonly rowsHash: () => Effect.Effect<Readonly<Record<string, string>>, DataTableError>
}

/**
 * Wrap a raw `PickleTable` as a `DataTable` located at `uri`:`line`.
 *
 * `line` is the step's line — see the `line` field's own comment for why there is no better one.
 */
export const makeDataTable = (table: PickleTable, uri: string, line: number): DataTable => {
  const rows = table.rows

  const raw = (): ReadonlyArray<ReadonlyArray<string>> => rows.map(cellsOf)

  const hashes = (): Effect.Effect<ReadonlyArray<Readonly<Record<string, string>>>, DataTableError> => {
    const headerRow = rows[0]
    if (headerRow === undefined) {
      return Effect.succeed([])
    }
    const header = cellsOf(headerRow)

    // Checked before the body rows are touched, and checked even when there are none: a repeated
    // header column is a fault in the header itself, and a header-only table that quietly returns
    // `[]` would hide it until someone added a body row.
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
    // Width is checked over every row BEFORE any key is read, so the verdict "this is not a
    // two-column table" never depends on which row happened to repeat a key first.
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
      // The SECOND occurrence is the offending one: the first row is fine on its own, and it is
      // the repeat that would collapse two rows into one entry.
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
 * Discriminate on the `_tag` STRING, never on `instanceof SchemaIssue.Pointer`.
 *
 * `effect` is a peer dependency (ADR-EC-021), so a consuming project can end up with two copies of
 * it in one graph — exactly the duplicate-package risk ADR-EC-015 was written about. `instanceof`
 * silently returns `false` across two copies and would degrade every located error into an
 * unlocated one; a `_tag` comparison is copy-independent. `test/schema-issue-pin.test.ts` asserts
 * that the `_tag` string and the exported class still agree, so this choice costs nothing.
 *
 * `_tag` is read by destructuring rather than by member access because `no-underscore-dangle` is
 * error-level in this repo for member expressions. The predicate form is what carries the
 * narrowing, which a bare destructured comparison could not.
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
 * The first locatable leaf's accumulated `Pointer` path, or `[]` when the tree contains no
 * `Pointer` at all.
 *
 * Walks down concatenating every `Pointer.path` on the way, and recurses through `Composite`'s
 * `issues`. Every other tag — `Filter`, `Encoding`, `AnyOf`, and the six `Leaf` tags — terminates
 * the walk, because none of them adds a path segment.
 *
 * This is safe to rely on ONLY because `test/schema-issue-pin.test.ts` asserts the shape it
 * assumes against the installed `effect@4.0.0-rc.112`: that an array decode wraps every element
 * failure in a `Pointer` carrying the element index, that a struct decode wraps every field
 * failure in a nested `Pointer` carrying the key, that `Composite`'s children field is named
 * `issues`, and that a location-free failure produces no `Pointer` at all. Keep the two walks in
 * step: that pin is a deliberate second copy of this logic, so an rc bump that reshapes the tree
 * fails there — where it is attributable to the dependency — rather than here.
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
 * Convert a `SchemaError` raised while decoding one table's `hashes()` into a LOCATED
 * `DataTableError`.
 *
 * The whole mechanism is the accumulated `Pointer` path: its first element is the index into the
 * array that was decoded — which is the `.hashes()` body-row index, because `decodeHashes` is what
 * wrapped the row schema in `Schema.Array` — and its second is the record key, which is the header
 * column name.
 *
 * Both `typeof` checks are load-bearing rather than defensive (threat T-04-06). A `PropertyKey` is
 * `string | number | symbol`; `index + 1` on a string would produce a concatenation and on a symbol
 * would throw, so a reshaped path must yield `Option.none()` — an ABSENT locator — and never a
 * silently-wrong "Row 1". The pin's fifth case is where the empty-path possibility is asserted at
 * the dependency level; against rc.112 no element failure reaches this function without a
 * `Pointer`, and the pin is what will notice if that ever stops being true.
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
  // Reproduced whole, with no ellipsis and no maximum length: `Errors.ts` note (b) governs this
  // message exactly as it governs the three above.
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
 * Decode a DataTable's body rows through a `Schema`, naming the offending row and column when one
 * of them fails. This is what ADR-EC-008 promises, made true.
 *
 * `rowSchema` describes ONE row, not the array of them, and `decodeHashes` does the
 * `Schema.Array` wrapping itself. That is not an ergonomic nicety — it is the mechanism. The array
 * index in the resulting issue path is the `.hashes()` body-row index precisely BECAUSE this
 * function is what introduced the array level. A caller who passed `Schema.Array(Row)` would push
 * every path one level deeper, and the recovered row ordinal would silently name the wrong row, so
 * this function owns the wrapping and the type signature makes passing an array schema a mistake
 * the decode itself rejects.
 *
 * `table.hashes()` runs FIRST and its failure propagates untouched: a duplicate header column is a
 * fault in the table's SHAPE, not in decoding, and it keeps its own `DuplicateHeaderColumn` reason
 * tag rather than being flattened into a generic decode failure.
 *
 * The type parameter mirrors `Schema.decodeUnknownEffect`'s own, so a row schema carrying decoding
 * services propagates them into this Effect's `R` channel instead of erasing them to `never`.
 */
export const decodeHashes =
  <S extends Schema.Constraint>(rowSchema: S) =>
  (table: DataTable): Effect.Effect<ReadonlyArray<S["Type"]>, DataTableError, S["DecodingServices"]> =>
    Effect.flatMap(table.hashes(), (rows) =>
      Effect.mapError(
        Schema.decodeUnknownEffect(Schema.Array(rowSchema))(rows),
        (schemaError) => rowDecodeFailed(table, rows, schemaError)
      ))

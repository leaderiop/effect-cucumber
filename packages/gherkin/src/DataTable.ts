/**
 * `@effect-cucumber/gherkin`'s own DataTable wrapper: `raw()`, `hashes()` and `rowsHash()` over a
 * raw `PickleTable`.
 *
 * Four decisions are recorded here, because none of them is visible from the code that implements
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
 * Local imports: `./Errors.ts` only. Third-party imports reach the `@cucumber/messages` BARREL,
 * never a deep path into its published build directory — the rule `Model.ts` and `StepMatcher.ts`
 * already follow.
 */
import type { PickleTable, PickleTableRow } from "@cucumber/messages"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
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
    message: `${args.uri}:${args.line}: ${args.reason}: ${args.sentences.join(" ")}`,
    cause: Option.none()
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

/**
 * BEH-EC-016's accessor semantics: `raw()`, `hashes()` and `rowsHash()` over a raw `PickleTable`.
 */
import type { PickleTable } from "@cucumber/messages"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as SchemaIssue from "effect/SchemaIssue"
import { describe, expect, it } from "vitest"
import { decodeHashes, firstIssuePath, makeDataTable, rowDecodeFailed } from "../src/DataTable.ts"
import { DataTableError } from "../src/Errors.ts"

/** The uri and line every table below is located at, so the locator assertions have a target. */
const uri = "features/checkout.feature"
const line = 12

/** Build a `PickleTable` from rows of plain strings: `{ rows: [{ cells: [{ value }] }] }`. */
const tableOf = (...rows: ReadonlyArray<ReadonlyArray<string>>): PickleTable => ({
  rows: rows.map((cells) => ({ cells: cells.map((value) => ({ value })) }))
})

/** Wrap rows at the shared `uri`/`line`. */
const dataTableOf = (...rows: ReadonlyArray<ReadonlyArray<string>>) => makeDataTable(tableOf(...rows), uri, line)

/**
 * The result of running one accessor, as a value rather than as a throw.
 *
 * Discriminated on `failed` rather than on a `_tag`, so no assertion below has to read an
 * underscore-prefixed member off an object.
 */
type Outcome<A> =
  | { readonly failed: false; readonly value: A }
  | { readonly failed: true; readonly error: DataTableError }

const outcomeOf = <A>(effect: Effect.Effect<A, DataTableError>): Outcome<A> =>
  Effect.runSync(Effect.match(effect, {
    onFailure: (error): Outcome<A> => ({ failed: true, error }),
    onSuccess: (value): Outcome<A> => ({ failed: false, value })
  }))

/**
 * Run an accessor that must succeed, and return its value.
 *
 * A failure is re-raised naming the reason it failed with, so a regression reads as
 * "expected success, got DuplicateHeaderColumn" rather than as an opaque shape mismatch.
 */
const succeeds = <A>(effect: Effect.Effect<A, DataTableError>): A => {
  const outcome = outcomeOf(effect)
  if (outcome.failed) {
    throw new Error(`expected the accessor to succeed, but it failed with ${outcome.error.reason}`)
  }
  return outcome.value
}

/**
 * Run an accessor that must fail, and return the `DataTableError` it failed with.
 *
 * Succeeding is itself a failure and says so, quoting what came back — a silently-wrong result is
 * exactly what these two accessors exist to prevent, so a test that stopped detecting one must not
 * read as a passing test. Deliberately not `expect(...).toThrow()`: nothing here throws, and
 * oxlint's `vitest(require-to-throw-message)` is error-level anyway.
 */
const fails = <A>(effect: Effect.Effect<A, DataTableError>): DataTableError => {
  const outcome = outcomeOf(effect)
  if (!outcome.failed) {
    throw new Error(`expected the accessor to fail, but it succeeded with ${JSON.stringify(outcome.value)}`)
  }
  return outcome.error
}

describe("raw", () => {
  it("returns every row including the header, in order", () => {
    const table = dataTableOf(["name", "role"], ["alice", "admin"])
    expect(table.raw()).toEqual([["name", "role"], ["alice", "admin"]])
  })

  it("returns the single row of a header-only table", () => {
    expect(dataTableOf(["name", "role"]).raw()).toEqual([["name", "role"]])
  })

  it("returns [] for an empty table", () => {
    expect(dataTableOf().raw()).toEqual([])
  })
})

describe("hashes", () => {
  it("maps every body row against the header row", () => {
    const table = dataTableOf(["name", "role"], ["alice", "admin"], ["bob", "viewer"])
    expect(succeeds(table.hashes())).toEqual([
      { name: "alice", role: "admin" },
      { name: "bob", role: "viewer" }
    ])
  })

  it("handles a single-column table", () => {
    // The roadmap's first named edge case. A one-column table is a perfectly ordinary table for
    // hashes(); only rowsHash() rejects it, and for its own reason.
    expect(succeeds(dataTableOf(["name"], ["alice"]).hashes())).toEqual([{ name: "alice" }])
  })

  it("returns [] for a header-only table", () => {
    // The roadmap's second named edge case (F30). Zero body rows is not a failure — it is a table
    // with nothing in it, and the empty array says exactly that.
    expect(succeeds(dataTableOf(["name", "role"]).hashes())).toEqual([])
  })

  it("returns [] for an empty table", () => {
    expect(succeeds(dataTableOf().hashes())).toEqual([])
  })

  it("fails with DuplicateHeaderColumn, naming the repeated column and quoting the whole header", () => {
    const error = fails(dataTableOf(["name", "name"], ["alice", "bob"]).hashes())

    expect(error).toBeInstanceOf(DataTableError)
    expect(error.reason).toBe("DuplicateHeaderColumn")
    expect(error.column).toEqual(Option.some("name"))
    // The fault is in the header row, so there is no body-row ordinal to report.
    expect(error.row).toEqual(Option.none())
    expect(error.uri).toBe(uri)
    expect(error.line).toEqual(Option.some(line))
    // Both repeated header cells, verbatim: Errors.ts note (b)'s no-truncation policy applies to
    // this class too, and this is where it is pinned for DataTableError.
    expect(error.message).toContain("| name | name |")
  })

  it("gives a __proto__ header cell an own property rather than mutating a prototype", () => {
    const [record] = succeeds(dataTableOf(["__proto__"], ["polluted"]).hashes())
    if (record === undefined) {
      throw new Error("expected hashes() to produce exactly one record for a single body row")
    }

    expect(Object.hasOwn(record, "__proto__")).toBe(true)
    expect(Object.getOwnPropertyDescriptor(record, "__proto__")?.value).toBe("polluted")
    expect(Object.getPrototypeOf(record) === Object.prototype).toBe(true)
    // Nothing else in the process was touched: a fresh object knows nothing about "polluted".
    expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined()
  })

  it("fills a missing trailing cell with the empty string, for a row shorter than the header", () => {
    // A real .feature file can never produce this: `test/upstream-pin.test.ts` pins the parser's own
    // rectangular-row guarantee, and `recordOf`'s `?? ""` exists only because `noUncheckedIndexedAccess`
    // requires SOME value at a type level (DataTable.ts's own module header says so). Reaching it means
    // building the `PickleTable` by hand rather than through a real parse, deliberately bypassing that
    // guarantee to pin what `recordOf` actually does if it were ever violated.
    const raggedTable: PickleTable = {
      rows: [
        { cells: [{ value: "name" }, { value: "age" }] },
        { cells: [{ value: "alice" }] }
      ]
    }
    const [record] = succeeds(makeDataTable(raggedTable, uri, line).hashes())

    expect(record).toEqual({ name: "alice", age: "" })
  })
})

describe("firstIssuePath", () => {
  it("skips a path-less first child of a Composite to find the second child's path", () => {
    // No schema this library builds today produces a Composite whose first child carries no
    // Pointer path (`test/schema-issue-pin.test.ts`'s own case notes), so the tree is built by
    // hand from the real `SchemaIssue` classes rather than from an actual decode failure.
    const pathlessLeaf = new SchemaIssue.InvalidType(Schema.String.ast)
    const locatedLeaf = new SchemaIssue.Pointer(["age"], new SchemaIssue.InvalidType(Schema.String.ast))
    const composite = new SchemaIssue.Composite(Schema.String.ast, [pathlessLeaf, locatedLeaf])

    expect(firstIssuePath(composite, [])).toEqual(["age"])
  })

  it("returns [] when every child of a Composite is itself path-less", () => {
    const composite = new SchemaIssue.Composite(Schema.String.ast, [
      new SchemaIssue.InvalidType(Schema.String.ast),
      new SchemaIssue.InvalidType(Schema.String.ast)
    ])

    expect(firstIssuePath(composite, [])).toEqual([])
  })
})

describe("rowsHash", () => {
  it("reads every row as a key/value pair, with no header row", () => {
    const table = dataTableOf(["name", "alice"], ["role", "admin"])
    expect(succeeds(table.rowsHash())).toEqual({ name: "alice", role: "admin" })
  })

  it("fails with RowsHashRequiresTwoColumns on a three-column table, naming both widths", () => {
    const error = fails(dataTableOf(["name", "alice", "extra"]).rowsHash())

    expect(error.reason).toBe("RowsHashRequiresTwoColumns")
    expect(error.row).toEqual(Option.some(1))
    expect(error.column).toEqual(Option.none())
    // The message IS the requirement here: "must be 2 wide, this row is 3 wide" is the whole
    // content of the error, and a reason tag alone would not tell the author what to change.
    expect(error.message).toContain("exactly 2 cells wide")
    expect(error.message).toContain("row 1 is 3 cells wide")
    expect(error.message).toContain("| name | alice | extra |")
  })

  it("fails the same way on a one-column table rather than returning {}", () => {
    // A header-only, one-column table is NOT special-cased into a silent empty result: it is not a
    // rowsHash table at all, and saying so at row 1 is the point.
    const error = fails(dataTableOf(["name"]).rowsHash())

    expect(error.reason).toBe("RowsHashRequiresTwoColumns")
    expect(error.row).toEqual(Option.some(1))
    expect(error.message).toContain("row 1 is 1 cells wide")
  })

  it("fails with DuplicateRowKey at the SECOND occurrence of the repeated key", () => {
    const error = fails(dataTableOf(["name", "alice"], ["name", "bob"]).rowsHash())

    expect(error.reason).toBe("DuplicateRowKey")
    expect(error.column).toEqual(Option.some("name"))
    // The second row is the offending one: the first is fine on its own, and it is the repeat that
    // would collapse two rows into one entry.
    expect(error.row).toEqual(Option.some(2))
  })

  it("returns {} for an empty table", () => {
    expect(succeeds(dataTableOf().rowsHash())).toEqual({})
  })
})

describe("decodeHashes", () => {
  /**
   * `age` is a TRANSFORMATION, not another string field, so a decoded row's `age` is a real
   * `number` and "decodes into typed rows" is exercised rather than being a string-to-string
   * identity that would pass against no transformation at all.
   */
  const Row = Schema.Struct({ name: Schema.String, age: Schema.FiniteFromString })

  it("decodes every body row into the schema's type", () => {
    const table = dataTableOf(["name", "age"], ["alice", "30"], ["bob", "41"])
    const rows = succeeds(decodeHashes(Row)(table))

    expect(rows).toEqual([{ name: "alice", age: 30 }, { name: "bob", age: 41 }])
    const [first] = rows
    if (first === undefined) {
      throw new Error("expected decodeHashes to produce two rows")
    }
    // The transformation actually ran: this is a number, not the string "30".
    expect(typeof first.age).toBe("number")
  })

  it("decodes a single-column table", () => {
    const rows = succeeds(decodeHashes(Schema.Struct({ name: Schema.String }))(dataTableOf(["name"], ["alice"])))

    expect(rows).toEqual([{ name: "alice" }])
  })

  it("decodes a header-only table to an empty array", () => {
    // Zero body rows is not a decode failure — it is a table with nothing to decode, and the
    // schema is never consulted.
    expect(succeeds(decodeHashes(Row)(dataTableOf(["name", "age"])))).toEqual([])
  })

  it("names the offending row and column when a body row fails the schema", () => {
    const table = dataTableOf(["name", "age"], ["alice", "30"], ["bob", "old"])
    const error = fails(decodeHashes(Row)(table))

    expect(error).toBeInstanceOf(DataTableError)
    expect(error.reason).toBe("RowDecodeFailed")
    // The 1-based BODY-row ordinal, written as a literal rather than computed: "bob" is the second
    // row under the header, and effect's own path names it as element 1.
    expect(error.row).toEqual(Option.some(2))
    expect(error.column).toEqual(Option.some("age"))
    expect(error.uri).toBe(uri)
    expect(error.line).toEqual(Option.some(line))

    // Thrown rather than branched around an `expect`: `vitest(no-conditional-expect)` is
    // error-level, and this file's `succeeds`/`fails` helpers already establish throwing as how a
    // precondition that did not hold is reported.
    const { cause } = error
    if (cause === undefined) {
      throw new Error("expected the decode failure to carry the underlying SchemaError as its cause")
    }
    const { _tag } = cause as { readonly _tag: string }
    expect(_tag).toBe("SchemaError")
  })

  it("reproduces the offending row verbatim in the message", () => {
    const table = dataTableOf(["name", "age"], ["alice", "30"], ["bob", "old"])
    const { message } = fails(decodeHashes(Row)(table))

    expect(message).toContain("Row 2 of the DataTable at features/checkout.feature:12 failed to decode")
    expect(message).toContain("column \"age\"")
    // Both cell values of the offending row, whole: Errors.ts note (b)'s no-truncation policy
    // pinned on the newest DataTableError reason.
    expect(message).toContain("{\"name\":\"bob\",\"age\":\"old\"}")
    expect(message.includes("…")).toBe(false)
    expect(message.endsWith("...")).toBe(false)
  })

  it("leaves the column as none when the failure is not attributable to one cell", () => {
    // A row schema that rejects the WHOLE row rather than one of its fields. effect's path is
    // then just [0] — an element index and no property key — so the row ordinal is reported and
    // the column is honestly absent rather than guessed at.
    //
    // The both-absent case (row AND column none) is the empty-path branch of `firstIssuePath`.
    // It is not reachable through this API against effect@4.0.0-rc.112: `decodeHashes` always
    // feeds an array to a `Schema.Array`, and every element failure of an array decode is wrapped
    // in a `Pointer` carrying the index — asserted over six element-failure shapes in
    // `schema-issue-pin.test.ts`. That pin's fifth case is where the Pointer-free tree IS
    // asserted to exist, which is why the branch stays: an rc bump could make it reachable, and
    // fabricating "Row 1" for an unlocatable failure is exactly the silently-wrong answer this
    // library refuses to give.
    const error = fails(decodeHashes(Schema.String)(dataTableOf(["name", "age"], ["alice", "30"])))

    expect(error.reason).toBe("RowDecodeFailed")
    expect(error.row).toEqual(Option.some(1))
    expect(error.column).toEqual(Option.none())
    expect(error.message).not.toContain("column ")
    expect(error.message).toContain("{\"name\":\"alice\",\"age\":\"30\"}")
  })

  it("reports both row and column as absent for a genuinely unlocatable failure", () => {
    // The both-absent case the test above's comment documents as unreachable through
    // `decodeHashes` today — driven here by calling `rowDecodeFailed` directly with a hand-built
    // `SchemaError` whose issue is a bare leaf (no `Pointer` at all), rather than through a real
    // decode.
    const table = dataTableOf(["name", "age"], ["alice", "30"])
    const schemaError = new Schema.SchemaError(new SchemaIssue.InvalidType(Schema.String.ast))

    const error = rowDecodeFailed(table, [], schemaError)

    expect(error.row).toEqual(Option.none())
    expect(error.column).toEqual(Option.none())
    expect(error.message).not.toContain("Row ")
    expect(error.message).not.toContain("column ")
    expect(error.message).toContain("The rows were [].")
  })

  it("propagates DuplicateHeaderColumn unchanged rather than reporting a decode failure", () => {
    // hashes() runs BEFORE the decoder, so a fault in the table's shape keeps its own reason tag.
    // A wrapper that ran the decode first — or that caught everything and relabelled it — would
    // report RowDecodeFailed here and bury the real, fixable problem in the header row.
    const error = fails(decodeHashes(Row)(dataTableOf(["name", "name"], ["alice", "bob"])))

    expect(error.reason).toBe("DuplicateHeaderColumn")
    expect(error.column).toEqual(Option.some("name"))
    expect(error.row).toEqual(Option.none())
  })
})

describe("makeDataTable", () => {
  it("carries the _tag, the location it was handed, and the raw rows by reference", () => {
    const raw = tableOf(["name", "role"], ["alice", "admin"])
    const table = makeDataTable(raw, uri, line)

    // Destructured rather than read by dotted member access off the object: `no-underscore-dangle`
    // is error-level in this repo for member expressions, and allows object destructuring.
    const { _tag } = table
    expect(_tag).toBe("DataTable")
    expect(table.uri).toBe(uri)
    expect(table.line).toBe(line)
    // The escape hatch is a pass-through, not a copy — the same guarantee ParsedFeature.pickles
    // makes.
    expect(table.rows).toBe(raw.rows)
  })
})

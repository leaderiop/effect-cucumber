/**
 * BEH-EC-016's accessor semantics: `raw()`, `hashes()` and `rowsHash()` over a raw `PickleTable`.
 */
import type { PickleTable } from "@cucumber/messages"
import { assert, describe, expect, it } from "@effect/vitest"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as SchemaIssue from "effect/SchemaIssue"
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
 * `succeeds`/`fails` below fail the Effect with this instead of a plain `Error`: `@effect/tsgo`'s
 * `globalErrorInEffectFailure` check (ADR-EC-016) flags an untagged `Error` in an Effect's failure
 * channel — the same convention `Boom`/`OtherFailure` already establish in
 * `packages/vitest/test/Testing.test.ts`.
 */
class UnexpectedOutcome extends Data.TaggedError("UnexpectedOutcome")<{ readonly message: string }> {}

/**
 * An accessor that must succeed, as an Effect: a failure is remapped to a descriptive
 * `UnexpectedOutcome` so a regression reads as "expected success, got DuplicateHeaderColumn"
 * rather than an opaque failure. `yield*`-ed directly inside an `it.effect` body — no Promise, no
 * `Effect.runSync`.
 */
const succeeds = <A>(effect: Effect.Effect<A, DataTableError>): Effect.Effect<A, UnexpectedOutcome> =>
  Effect.mapError(
    effect,
    (error) =>
      new UnexpectedOutcome({ message: `expected the accessor to succeed, but it failed with ${error.reason}` })
  )

/**
 * An accessor that must fail, as an Effect resolving to the `DataTableError` it failed with.
 * Succeeding is itself a failure and says so, quoting what came back — a silently-wrong result is
 * exactly what these two accessors exist to prevent, so a test that stopped detecting one must not
 * read as a passing test.
 */
const fails = <A>(effect: Effect.Effect<A, DataTableError>): Effect.Effect<DataTableError, UnexpectedOutcome> =>
  Effect.matchEffect(effect, {
    onFailure: (error) => Effect.succeed(error),
    onSuccess: (value): Effect.Effect<DataTableError, UnexpectedOutcome> =>
      Effect.fail(
        new UnexpectedOutcome({
          message: `expected the accessor to fail, but it succeeded with ${JSON.stringify(value)}`
        })
      )
  })

/**
 * Narrows away `undefined`, or throws. A plain function defined OUTSIDE any `Effect.gen` body on
 * purpose — `@effect/tsgo`'s `globalErrorInEffectFailure` check (ADR-EC-016) flags a `new Error(...)`
 * lexically inside an `Effect.gen` generator, even one that's thrown rather than failed/died with;
 * calling a plain helper from inside the generator keeps the construction outside that scope.
 */
const definedOrThrow = <A>(value: A | undefined, message: string): A => {
  if (value === undefined) {
    throw new Error(message)
  }
  return value
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
  it.effect("maps every body row against the header row", () =>
    Effect.gen(function*() {
      const table = dataTableOf(["name", "role"], ["alice", "admin"], ["bob", "viewer"])
      const rows = yield* succeeds(table.hashes())
      assert.deepStrictEqual(rows, [
        { name: "alice", role: "admin" },
        { name: "bob", role: "viewer" }
      ])
    }))

  it.effect("handles a single-column table", () =>
    Effect.gen(function*() {
      // The roadmap's first named edge case. A one-column table is a perfectly ordinary table for
      // hashes(); only rowsHash() rejects it, and for its own reason.
      const rows = yield* succeeds(dataTableOf(["name"], ["alice"]).hashes())
      assert.deepStrictEqual(rows, [{ name: "alice" }])
    }))

  it.effect("returns [] for a header-only table", () =>
    Effect.gen(function*() {
      // The roadmap's second named edge case (F30). Zero body rows is not a failure — it is a
      // table with nothing in it, and the empty array says exactly that.
      const rows = yield* succeeds(dataTableOf(["name", "role"]).hashes())
      assert.deepStrictEqual(rows, [])
    }))

  it.effect("returns [] for an empty table", () =>
    Effect.gen(function*() {
      const rows = yield* succeeds(dataTableOf().hashes())
      assert.deepStrictEqual(rows, [])
    }))

  it.effect("fails with DuplicateHeaderColumn, naming the repeated column and quoting the whole header", () =>
    Effect.gen(function*() {
      const error = yield* fails(dataTableOf(["name", "name"], ["alice", "bob"]).hashes())

      assert.instanceOf(error, DataTableError)
      assert.strictEqual(error.reason, "DuplicateHeaderColumn")
      assert.deepStrictEqual(error.column, Option.some("name"))
      // The fault is in the header row, so there is no body-row ordinal to report.
      assert.deepStrictEqual(error.row, Option.none())
      assert.strictEqual(error.uri, uri)
      assert.deepStrictEqual(error.line, Option.some(line))
      // Both repeated header cells, verbatim: Errors.ts note (b)'s no-truncation policy applies to
      // this class too, and this is where it is pinned for DataTableError.
      assert.include(error.message, "| name | name |")
    }))

  it.effect("gives a __proto__ header cell an own property rather than mutating a prototype", () =>
    Effect.gen(function*() {
      const rows = yield* succeeds(dataTableOf(["__proto__"], ["polluted"]).hashes())
      const record = definedOrThrow(rows[0], "expected hashes() to produce exactly one record for a single body row")

      assert.isTrue(Object.hasOwn(record, "__proto__"))
      assert.strictEqual(Object.getOwnPropertyDescriptor(record, "__proto__")?.value, "polluted")
      assert.isTrue(Object.getPrototypeOf(record) === Object.prototype)
      // Nothing else in the process was touched: a fresh object knows nothing about "polluted".
      assert.isUndefined(({} as Record<string, unknown>)["polluted"])
    }))

  it.effect("fills a missing trailing cell with the empty string, for a row shorter than the header", () =>
    Effect.gen(function*() {
      // A real .feature file can never produce this: `test/upstream-pin.test.ts` pins the parser's
      // own rectangular-row guarantee, and `recordOf`'s `?? ""` exists only because
      // `noUncheckedIndexedAccess` requires SOME value at a type level (DataTable.ts's own module
      // header says so). Reaching it means building the `PickleTable` by hand rather than through a
      // real parse, deliberately bypassing that guarantee to pin what `recordOf` actually does if it
      // were ever violated.
      const raggedTable: PickleTable = {
        rows: [
          { cells: [{ value: "name" }, { value: "age" }] },
          { cells: [{ value: "alice" }] }
        ]
      }
      const [record] = yield* succeeds(makeDataTable(raggedTable, uri, line).hashes())

      assert.deepStrictEqual(record, { name: "alice", age: "" })
    }))
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
  it.effect("reads every row as a key/value pair, with no header row", () =>
    Effect.gen(function*() {
      const table = dataTableOf(["name", "alice"], ["role", "admin"])
      const record = yield* succeeds(table.rowsHash())
      assert.deepStrictEqual(record, { name: "alice", role: "admin" })
    }))

  it.effect("fails with RowsHashRequiresTwoColumns on a three-column table, naming both widths", () =>
    Effect.gen(function*() {
      const error = yield* fails(dataTableOf(["name", "alice", "extra"]).rowsHash())

      assert.strictEqual(error.reason, "RowsHashRequiresTwoColumns")
      assert.deepStrictEqual(error.row, Option.some(1))
      assert.deepStrictEqual(error.column, Option.none())
      // The message IS the requirement here: "must be 2 wide, this row is 3 wide" is the whole
      // content of the error, and a reason tag alone would not tell the author what to change.
      assert.include(error.message, "exactly 2 cells wide")
      assert.include(error.message, "row 1 is 3 cells wide")
      assert.include(error.message, "| name | alice | extra |")
    }))

  it.effect("fails the same way on a one-column table rather than returning {}", () =>
    Effect.gen(function*() {
      // A header-only, one-column table is NOT special-cased into a silent empty result: it is not
      // a rowsHash table at all, and saying so at row 1 is the point.
      const error = yield* fails(dataTableOf(["name"]).rowsHash())

      assert.strictEqual(error.reason, "RowsHashRequiresTwoColumns")
      assert.deepStrictEqual(error.row, Option.some(1))
      assert.include(error.message, "row 1 is 1 cells wide")
    }))

  it.effect("fails with DuplicateRowKey at the SECOND occurrence of the repeated key", () =>
    Effect.gen(function*() {
      const error = yield* fails(dataTableOf(["name", "alice"], ["name", "bob"]).rowsHash())

      assert.strictEqual(error.reason, "DuplicateRowKey")
      assert.deepStrictEqual(error.column, Option.some("name"))
      // The second row is the offending one: the first is fine on its own, and it is the repeat
      // that would collapse two rows into one entry.
      assert.deepStrictEqual(error.row, Option.some(2))
    }))

  it.effect("returns {} for an empty table", () =>
    Effect.gen(function*() {
      const record = yield* succeeds(dataTableOf().rowsHash())
      assert.deepStrictEqual(record, {})
    }))
})

describe("decodeHashes", () => {
  /**
   * `age` is a TRANSFORMATION, not another string field, so a decoded row's `age` is a real
   * `number` and "decodes into typed rows" is exercised rather than being a string-to-string
   * identity that would pass against no transformation at all.
   */
  const Row = Schema.Struct({ name: Schema.String, age: Schema.FiniteFromString })

  it.effect("decodes every body row into the schema's type", () =>
    Effect.gen(function*() {
      const table = dataTableOf(["name", "age"], ["alice", "30"], ["bob", "41"])
      const rows = yield* succeeds(decodeHashes(Row)(table))

      assert.deepStrictEqual(rows, [{ name: "alice", age: 30 }, { name: "bob", age: 41 }])
      const first = definedOrThrow(rows[0], "expected decodeHashes to produce two rows")
      // The transformation actually ran: this is a number, not the string "30".
      assert.strictEqual(typeof first.age, "number")
    }))

  it.effect("decodes a single-column table", () =>
    Effect.gen(function*() {
      const rows = yield* succeeds(
        decodeHashes(Schema.Struct({ name: Schema.String }))(dataTableOf(["name"], ["alice"]))
      )
      assert.deepStrictEqual(rows, [{ name: "alice" }])
    }))

  it.effect("decodes a header-only table to an empty array", () =>
    Effect.gen(function*() {
      // Zero body rows is not a decode failure — it is a table with nothing to decode, and the
      // schema is never consulted.
      const rows = yield* succeeds(decodeHashes(Row)(dataTableOf(["name", "age"])))
      assert.deepStrictEqual(rows, [])
    }))

  it.effect("names the offending row and column when a body row fails the schema", () =>
    Effect.gen(function*() {
      const table = dataTableOf(["name", "age"], ["alice", "30"], ["bob", "old"])
      const error = yield* fails(decodeHashes(Row)(table))

      assert.instanceOf(error, DataTableError)
      assert.strictEqual(error.reason, "RowDecodeFailed")
      // The 1-based BODY-row ordinal, written as a literal rather than computed: "bob" is the
      // second row under the header, and effect's own path names it as element 1.
      assert.deepStrictEqual(error.row, Option.some(2))
      assert.deepStrictEqual(error.column, Option.some("age"))
      assert.strictEqual(error.uri, uri)
      assert.deepStrictEqual(error.line, Option.some(line))

      const cause = definedOrThrow(
        error.cause,
        "expected the decode failure to carry the underlying SchemaError as its cause"
      )
      const { _tag } = cause as { readonly _tag: string }
      assert.strictEqual(_tag, "SchemaError")
    }))

  it.effect("reproduces the offending row verbatim in the message", () =>
    Effect.gen(function*() {
      const table = dataTableOf(["name", "age"], ["alice", "30"], ["bob", "old"])
      const { message } = yield* fails(decodeHashes(Row)(table))

      assert.include(message, "Row 2 of the DataTable at features/checkout.feature:12 failed to decode")
      assert.include(message, "column \"age\"")
      // Both cell values of the offending row, whole: Errors.ts note (b)'s no-truncation policy
      // pinned on the newest DataTableError reason.
      assert.include(message, "{\"name\":\"bob\",\"age\":\"old\"}")
      assert.isFalse(message.includes("…"))
      assert.isFalse(message.endsWith("..."))
    }))

  it.effect("leaves the column as none when the failure is not attributable to one cell", () =>
    Effect.gen(function*() {
      // A row schema that rejects the WHOLE row rather than one of its fields. effect's path is
      // then just [0] — an element index and no property key — so the row ordinal is reported and
      // the column is honestly absent rather than guessed at.
      //
      // The both-absent case (row AND column none) is the empty-path branch of `firstIssuePath`.
      // It is not reachable through this API against effect@4.0.0-rc.112: `decodeHashes` always
      // feeds an array to a `Schema.Array`, and every element failure of an array decode is
      // wrapped in a `Pointer` carrying the index — asserted over six element-failure shapes in
      // `schema-issue-pin.test.ts`. That pin's fifth case is where the Pointer-free tree IS
      // asserted to exist, which is why the branch stays: an rc bump could make it reachable, and
      // fabricating "Row 1" for an unlocatable failure is exactly the silently-wrong answer this
      // library refuses to give.
      const error = yield* fails(decodeHashes(Schema.String)(dataTableOf(["name", "age"], ["alice", "30"])))

      assert.strictEqual(error.reason, "RowDecodeFailed")
      assert.deepStrictEqual(error.row, Option.some(1))
      assert.deepStrictEqual(error.column, Option.none())
      assert.notInclude(error.message, "column ")
      assert.include(error.message, "{\"name\":\"alice\",\"age\":\"30\"}")
    }))

  it("reports both row and column as absent for a genuinely unlocatable failure", () => {
    // The both-absent case the test above's comment documents as unreachable through
    // `decodeHashes` today — driven here by calling `rowDecodeFailed` directly with a hand-built
    // `SchemaError` whose issue is a bare leaf (no `Pointer` at all), rather than through a real
    // decode. `rowDecodeFailed` is a pure function, not an Effect — no `it.effect` needed.
    const table = dataTableOf(["name", "age"], ["alice", "30"])
    const schemaError = new Schema.SchemaError(new SchemaIssue.InvalidType(Schema.String.ast))

    const error = rowDecodeFailed(table, [], schemaError)

    expect(error.row).toEqual(Option.none())
    expect(error.column).toEqual(Option.none())
    expect(error.message).not.toContain("Row ")
    expect(error.message).not.toContain("column ")
    expect(error.message).toContain("The rows were [].")
  })

  it.effect("propagates DuplicateHeaderColumn unchanged rather than reporting a decode failure", () =>
    Effect.gen(function*() {
      // hashes() runs BEFORE the decoder, so a fault in the table's shape keeps its own reason
      // tag. A wrapper that ran the decode first — or that caught everything and relabelled it —
      // would report RowDecodeFailed here and bury the real, fixable problem in the header row.
      const error = yield* fails(decodeHashes(Row)(dataTableOf(["name", "name"], ["alice", "bob"])))

      assert.strictEqual(error.reason, "DuplicateHeaderColumn")
      assert.deepStrictEqual(error.column, Option.some("name"))
      assert.deepStrictEqual(error.row, Option.none())
    }))
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

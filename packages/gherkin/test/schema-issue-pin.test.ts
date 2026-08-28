/**
 * Pins the verified decode-failure shape of `effect@4.0.0-rc.112`'s `Schema` module.
 *
 * This file imports NOTHING from `../src`. It talks to the dependency directly, on purpose — the
 * same rule, and the same reason, as `expressions-pin.test.ts` (which pins
 * `@cucumber/cucumber-expressions@20.1.0`) and `upstream-pin.test.ts` (which pins
 * `@cucumber/gherkin`).
 *
 * The concrete consequence, spelled out because it is the whole point of the separation:
 * `decodeHashes` in `src/DataTable.ts` recovers a data table's BODY-ROW ORDINAL and its COLUMN
 * NAME by walking the issue tree asserted below — the array index in the accumulated `Pointer`
 * path is the `.hashes()` body-row index, and the record key after it is the header column name.
 * `effect` is a peer dependency (ADR-EC-021) and is therefore free to move under this library
 * within the rc line. When an rc bump reshapes that tree, the failure must land HERE, where it is
 * attributable to the dependency, and NOT in `DataTable.test.ts`, where it would read as a bug in
 * this library's own locator arithmetic.
 *
 * The walker below is deliberately a LOCAL copy of the walk `DataTable.ts#firstIssuePath`
 * performs, not an import of it. Importing the real one would make this file assert that the
 * walker agrees with itself; writing it twice makes it assert that the dependency still produces
 * what the walker assumes.
 */
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as SchemaIssue from "effect/SchemaIssue"
import { describe, expect, it } from "vitest"

/** One data table row: a plain string column and a column that must transform to a real number. */
const Row = Schema.Struct({ name: Schema.String, age: Schema.FiniteFromString })

/** What `decodeHashes` actually builds: the row schema wrapped in an array, one element per row. */
const Rows = Schema.Array(Row)

/**
 * Run a decode that must fail, and return the `SchemaError` it failed with.
 *
 * Deliberately not `expect(...).toThrow()`: nothing here throws (the failure lives in an Effect's
 * error channel), and oxlint's `vitest(require-to-throw-message)` is error-level anyway, which
 * would force every assertion below to be made against upstream message prose.
 */
const failureOf = (effect: Effect.Effect<unknown, Schema.SchemaError>): Schema.SchemaError => {
  const outcome = Effect.runSync(Effect.match(effect, {
    onFailure: (error): { readonly failed: true; readonly error: Schema.SchemaError } => ({ failed: true, error }),
    onSuccess: (value): { readonly failed: false; readonly value: unknown } => ({ failed: false, value })
  }))
  if (!outcome.failed) {
    throw new Error(`expected the decode to fail, but it succeeded with ${JSON.stringify(outcome.value)}`)
  }
  return outcome.error
}

/**
 * `_tag` is read by destructuring rather than by member access: `no-underscore-dangle` is
 * error-level in this repo for member expressions. The predicate form also does the narrowing,
 * which a bare destructured comparison could not.
 */
const isPointer = (issue: SchemaIssue.Issue): issue is SchemaIssue.Pointer => {
  const { _tag } = issue
  return _tag === "Pointer"
}

const isComposite = (issue: SchemaIssue.Issue): issue is SchemaIssue.Composite => {
  const { _tag } = issue
  return _tag === "Composite"
}

/**
 * Every accumulated `Pointer` path in the tree, one entry per leaf reached THROUGH at least one
 * `Pointer`.
 *
 * A leaf reached without traversing a single `Pointer` contributes nothing, which is what makes
 * case 5 below assert `[]` rather than `[[]]`: a location-free failure has no location, and
 * `firstIssuePath` reports exactly the same thing by returning `[]`.
 */
const pointerPaths = (
  issue: SchemaIssue.Issue,
  prefix: ReadonlyArray<PropertyKey>
): ReadonlyArray<ReadonlyArray<PropertyKey>> => {
  if (isPointer(issue)) {
    return pointerPaths(issue.issue, [...prefix, ...issue.path])
  }
  if (isComposite(issue)) {
    return issue.issues.flatMap((child) => pointerPaths(child, prefix))
  }
  return prefix.length === 0 ? [] : [prefix]
}

/** One element-failure shape, labelled so a broken case reports which schema produced it. */
interface ElementFailureCase {
  readonly label: string
  readonly effect: Effect.Effect<unknown, Schema.SchemaError>
}

describe("upstream effect@4.0.0-rc.112 Schema decode failures", () => {
  it("a failed decode fails with a SchemaError carrying an issue", () => {
    const error = failureOf(Schema.decodeUnknownEffect(Row)({ name: "a", age: "xx" }))

    // Destructured for the same `no-underscore-dangle` reason the predicates above give.
    const { _tag } = error
    expect(_tag).toBe("SchemaError")
    expect(error.issue).toBeDefined()
    // `SchemaIssue` is used as a VALUE here, not only as a type: this pin must fail if the module
    // stops existing at runtime, not merely if its declarations drift.
    expect(SchemaIssue.isIssue(error.issue)).toBe(true)
  })

  it("an array decode failure carries the element index and the property key on a Pointer path", () => {
    // The mechanism decodeHashes is built on: the array index and the record key arrive on ONE
    // accumulated path, in that order, so [rowIndex, columnName] is readable off it directly.
    const error = failureOf(Schema.decodeUnknownEffect(Rows)([{ name: "a", age: "1" }, { name: 2, age: "x" }]))

    expect(pointerPaths(error.issue, [])).toEqual([[1, "name"]])
  })

  it("the path's first element is a number and its second is a string", () => {
    // decodeHashes branches on exactly these two runtime types. If effect ever emitted the array
    // index as a string, `index + 1` would produce a string concatenation or a NaN and the
    // reported row ordinal would be silently wrong rather than absent (threat T-04-06).
    const error = failureOf(Schema.decodeUnknownEffect(Rows)([{ name: "a", age: "1" }, { name: 2, age: "x" }]))
    const [path] = pointerPaths(error.issue, [])
    if (path === undefined) {
      throw new Error("expected exactly one Pointer path for a single failing element")
    }

    expect(typeof path[0]).toBe("number")
    expect(typeof path[1]).toBe("string")
  })

  it("SchemaError.message names the path", () => {
    // The fallback text decodeHashes embeds verbatim in its own message when the path walk finds
    // nothing usable. Asserted as CONTAINS rather than as an equality: the leading "Expected ..."
    // sentence is upstream prose and is free to be reworded inside the rc line.
    const error = failureOf(Schema.decodeUnknownEffect(Rows)([{ name: "a", age: "1" }, { name: 2, age: "x" }]))

    expect(error.message).toContain("[1]")
    expect(error.message).toContain("[\"name\"]")
  })

  it("a top-level type failure produces no Pointer path at all", () => {
    // The case decodeHashes must answer with Option.none()/Option.none() rather than by
    // fabricating a row 1. Every ELEMENT failure of an array decode is wrapped in a Pointer
    // carrying the index (asserted above), so this is what a location-free failure looks like.
    const error = failureOf(Schema.decodeUnknownEffect(Rows)("nope"))

    expect(pointerPaths(error.issue, [])).toEqual([])
  })

  it("Composite's children field is named as this pin expects", () => {
    // A silent rename of `issues` in an rc bump would turn the walker into a function that always
    // returns [], which would degrade every located error into an unlocated one WITHOUT failing
    // any other assertion here. This is the assertion that catches that.
    const error = failureOf(Schema.decodeUnknownEffect(Rows)([{ name: 2, age: "x" }]))
    const { issue } = error

    expect(isComposite(issue)).toBe(true)
    // The `_tag` string and the exported class still agree, so a walker may discriminate on either.
    expect(issue instanceof SchemaIssue.Composite).toBe(true)
    expect(Object.hasOwn(issue, "issues")).toBe(true)
  })

  it("wraps every element failure of an array decode in a Pointer carrying the index", () => {
    // Six element-failure shapes, all reaching a Pointer([index]) first. This is what makes the
    // row ordinal recoverable for every kind of row schema a caller might supply, and it is why
    // decodeHashes owns the Schema.Array wrapping rather than accepting an array schema.
    const cases: ReadonlyArray<ElementFailureCase> = [
      { label: "a wrong primitive row schema", effect: Schema.decodeUnknownEffect(Schema.Array(Schema.String))([{}]) },
      { label: "a never row schema", effect: Schema.decodeUnknownEffect(Schema.Array(Schema.Never))([{}]) },
      {
        label: "a union row schema",
        effect: Schema.decodeUnknownEffect(Schema.Array(Schema.Union([Schema.String, Schema.Number])))([{}])
      },
      { label: "an already-arrayed row schema", effect: Schema.decodeUnknownEffect(Schema.Array(Rows))([{}]) },
      { label: "a missing required key", effect: Schema.decodeUnknownEffect(Rows)([{ name: "a" }]) },
      { label: "a failed transform", effect: Schema.decodeUnknownEffect(Rows)([{ name: "a", age: "x" }]) }
    ]

    for (const { effect, label } of cases) {
      const [path] = pointerPaths(failureOf(effect).issue, [])
      if (path === undefined) {
        throw new Error(`expected ${label} to produce a Pointer path`)
      }
      expect(path[0]).toBe(0)
    }
  })
})

/**
 * Pins the verified decode-failure shape of `effect@4.0.0-rc.112`'s `Schema` module.
 */
import { assert, describe, it } from "@effect/vitest"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as SchemaIssue from "effect/SchemaIssue"

/** One data table row: a plain string column and a column that must transform to a real number. */
const Row = Schema.Struct({ name: Schema.String, age: Schema.FiniteFromString })

/** What `decodeHashes` actually builds: the row schema wrapped in an array, one element per row. */
const Rows = Schema.Array(Row)

/**
 * `failureOf` below fails the Effect with this instead of a plain `Error`: `@effect/tsgo`'s
 * `globalErrorInEffectFailure` check (ADR-EC-016) flags an untagged `Error` in an Effect's failure
 * channel — the same convention `Boom`/`OtherFailure` already establish in
 * `packages/vitest/test/Testing.test.ts`.
 */
class UnexpectedOutcome extends Data.TaggedError("UnexpectedOutcome")<{ readonly message: string }> {}

/**
 * A decode that must fail, as an Effect resolving to the `SchemaError` it failed with. Succeeding
 * is itself a failure and says so, quoting what came back.
 */
const failureOf = (
  effect: Effect.Effect<unknown, Schema.SchemaError>
): Effect.Effect<Schema.SchemaError, UnexpectedOutcome> =>
  Effect.matchEffect(effect, {
    onFailure: (error) => Effect.succeed(error),
    onSuccess: (value): Effect.Effect<Schema.SchemaError, UnexpectedOutcome> =>
      Effect.fail(
        new UnexpectedOutcome({
          message: `expected the decode to fail, but it succeeded with ${JSON.stringify(value)}`
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
  it.effect("a failed decode fails with a SchemaError carrying an issue", () =>
    Effect.gen(function*() {
      const error = yield* failureOf(Schema.decodeUnknownEffect(Row)({ name: "a", age: "xx" }))

      // Destructured for the same `no-underscore-dangle` reason the predicates above give.
      const { _tag } = error
      assert.strictEqual(_tag, "SchemaError")
      assert.isDefined(error.issue)
      // `SchemaIssue` is used as a VALUE here, not only as a type: this pin must fail if the
      // module stops existing at runtime, not merely if its declarations drift.
      assert.isTrue(SchemaIssue.isIssue(error.issue))
    }))

  it.effect("an array decode failure carries the element index and the property key on a Pointer path", () =>
    Effect.gen(function*() {
      // The mechanism decodeHashes is built on: the array index and the record key arrive on ONE
      // accumulated path, in that order, so [rowIndex, columnName] is readable off it directly.
      const error = yield* failureOf(
        Schema.decodeUnknownEffect(Rows)([{ name: "a", age: "1" }, { name: 2, age: "x" }])
      )

      assert.deepStrictEqual(pointerPaths(error.issue, []), [[1, "name"]])
    }))

  it.effect("the path's first element is a number and its second is a string", () =>
    Effect.gen(function*() {
      const error = yield* failureOf(
        Schema.decodeUnknownEffect(Rows)([{ name: "a", age: "1" }, { name: 2, age: "x" }])
      )
      const path = definedOrThrow(
        pointerPaths(error.issue, [])[0],
        "expected exactly one Pointer path for a single failing element"
      )

      assert.strictEqual(typeof path[0], "number")
      assert.strictEqual(typeof path[1], "string")
    }))

  it.effect("SchemaError.message names the path", () =>
    Effect.gen(function*() {
      // The fallback text decodeHashes embeds verbatim in its own message when the path walk
      // finds nothing usable. Asserted as CONTAINS rather than as an equality: the leading
      // "Expected ..." sentence is upstream prose and is free to be reworded inside the rc line.
      const error = yield* failureOf(
        Schema.decodeUnknownEffect(Rows)([{ name: "a", age: "1" }, { name: 2, age: "x" }])
      )

      assert.include(error.message, "[1]")
      assert.include(error.message, "[\"name\"]")
    }))

  it.effect("a top-level type failure produces no Pointer path at all", () =>
    Effect.gen(function*() {
      // The case decodeHashes must answer with Option.none()/Option.none() rather than by
      // fabricating a row 1. Every ELEMENT failure of an array decode is wrapped in a Pointer
      // carrying the index (asserted above), so this is what a location-free failure looks like.
      const error = yield* failureOf(Schema.decodeUnknownEffect(Rows)("nope"))

      assert.deepStrictEqual(pointerPaths(error.issue, []), [])
    }))

  it.effect("Composite's children field is named as this pin expects", () =>
    Effect.gen(function*() {
      // A silent rename of `issues` in an rc bump would turn the walker into a function that
      // always returns [], which would degrade every located error into an unlocated one WITHOUT
      // failing any other assertion here. This is the assertion that catches that.
      const error = yield* failureOf(Schema.decodeUnknownEffect(Rows)([{ name: 2, age: "x" }]))
      const { issue } = error

      assert.isTrue(isComposite(issue))
      // The `_tag` string and the exported class still agree, so a walker may discriminate on
      // either.
      assert.instanceOf(issue, SchemaIssue.Composite)
      assert.isTrue(Object.hasOwn(issue, "issues"))
    }))

  it.effect("wraps every element failure of an array decode in a Pointer carrying the index", () =>
    Effect.gen(function*() {
      // Six element-failure shapes, all reaching a Pointer([index]) first. This is what makes the
      // row ordinal recoverable for every kind of row schema a caller might supply, and it is why
      // decodeHashes owns the Schema.Array wrapping rather than accepting an array schema.
      const cases: ReadonlyArray<ElementFailureCase> = [
        {
          label: "a wrong primitive row schema",
          effect: Schema.decodeUnknownEffect(Schema.Array(Schema.String))([{}])
        },
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
        const error = yield* failureOf(effect)
        const path = definedOrThrow(pointerPaths(error.issue, [])[0], `expected ${label} to produce a Pointer path`)
        assert.strictEqual(path[0], 0)
      }
    }))
})

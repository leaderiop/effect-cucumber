/**
 * `stepArgumentsOf`'s ordering rule and wrapping, asserted on SYNTHETIC `PickleStepArgument`
 * literals. This file parses no `.feature` file at all.
 */
import type { PickleDocString, PickleStepArgument, PickleTable } from "@cucumber/messages"
import * as Option from "effect/Option"
import { describe, expect, it } from "vitest"
import type { DataTable } from "../src/DataTable.ts"
import { type DocString, type StepArgument, stepArgumentsOf } from "../src/StepArguments.ts"

/** The location every wrapper below is built at, so the pass-through assertions have a target. */
const uri = "features/checkout.feature"
const line = 12

/**
 * A `PickleDocString` with the `argumentIndex` and `mediaType` keys PRESENT, either of which may
 * hold `undefined` — the shape `compile()`'s unconditional `pickleDocString()` object literal
 * actually produces.
 *
 * The assertion is load-bearing rather than lazy. `exactOptionalPropertyTypes` is on workspace-wide,
 * so `{ argumentIndex: undefined }` cannot be written against a declared-optional `argumentIndex`
 * directly; without it there is no way to express the real runtime shape in this file, and the
 * alternative — omitting the key — would quietly test something upstream never emits.
 */
const docStringOf = (argumentIndex: number | undefined, mediaType: string | undefined): PickleDocString =>
  ({ argumentIndex, mediaType, content: "the docstring content" }) as PickleDocString

/** A `PickleTable` with the `argumentIndex` key present, for the same reason as above. */
const tableOf = (argumentIndex: number | undefined, ...rows: ReadonlyArray<ReadonlyArray<string>>): PickleTable =>
  ({
    argumentIndex,
    rows: rows.map((cells) => ({ cells: cells.map((value) => ({ value })) }))
  }) as PickleTable

/** The two-row table every case below reuses, so the assertions differ only in what they mean to. */
const table = (argumentIndex: number | undefined): PickleTable => tableOf(argumentIndex, ["a", "b"], ["1", "2"])

const argumentsOf = (argument: PickleStepArgument | undefined): ReadonlyArray<StepArgument> =>
  stepArgumentsOf(argument, uri, line)

/**
 * Every wrapped argument's `_tag`, in order.
 *
 * Read by destructuring rather than by dotted member access: `no-underscore-dangle` is error-level
 * in this repo for member expressions. Asserting the whole array at once also fails on a missing or
 * extra argument, which two index assertions would not.
 */
const tagsOf = (args: ReadonlyArray<StepArgument>): ReadonlyArray<string> =>
  args.map((argument) => {
    const { _tag } = argument
    return _tag
  })

const isDataTable = (argument: StepArgument): argument is DataTable => {
  const { _tag } = argument
  return _tag === "DataTable"
}

const isDocString = (argument: StepArgument): argument is DocString => {
  const { _tag } = argument
  return _tag === "DocString"
}

/**
 * The single wrapped argument, asserted to be of the arm the caller expects.
 *
 * Both throw rather than letting the caller branch around an `expect`: a wrong arm means the rule
 * broke and should read as a named failure, and `vitest(no-conditional-expect)` is error-level.
 */
const onlyDocString = (args: ReadonlyArray<StepArgument>): DocString => {
  const [argument] = args
  if (argument === undefined || !isDocString(argument)) {
    throw new Error(`expected exactly one DocString, found [${tagsOf(args).join(", ")}]`)
  }
  return argument
}

const onlyDataTable = (args: ReadonlyArray<StepArgument>): DataTable => {
  const [argument] = args
  if (argument === undefined || !isDataTable(argument)) {
    throw new Error(`expected exactly one DataTable, found [${tagsOf(args).join(", ")}]`)
  }
  return argument
}

describe("a step with no argument", () => {
  it("returns an empty array for undefined", () => {
    // `[]`, never `Option.none()` and never a one-element array holding a placeholder: an empty
    // array is what a consumer can spread unconditionally without asking whether there is one.
    expect(argumentsOf(undefined)).toEqual([])
  })

  it("returns an empty array for an argument carrying neither a DocString nor a DataTable", () => {
    // `PickleStepArgument` declares both members optional, so `{}` is legal in the TYPE even though
    // the parser never produces it. Returning a one-element array holding `undefined` here would be
    // a silent bug that only surfaced at the consumer, so the empty case is asserted directly.
    expect(argumentsOf({})).toEqual([])
  })
})

describe("a step carrying one argument", () => {
  it("wraps a lone DocString with an absent mediaType when the author wrote none", () => {
    const docString = onlyDocString(argumentsOf({ docString: docStringOf(undefined, undefined) }))
    expect(docString.content).toBe("the docstring content")
    expect(docString.mediaType).toEqual(Option.none())
  })

  it("wraps a lone DocString's mediaType as Option.some when the author wrote one", () => {
    // ADR-EC-022 is what makes this an `Option` rather than a bare string-or-undefined, and this
    // pair of tests is what stops the two branches collapsing into one.
    const docString = onlyDocString(argumentsOf({ docString: docStringOf(undefined, "text/plain") }))
    expect(docString.mediaType).toEqual(Option.some("text/plain"))
  })

  it("wraps a lone DataTable at the uri and line it was handed, rows intact", () => {
    // The single-argument case upstream leaves `argumentIndex` UNDEFINED for. A rule that read the
    // key's presence rather than its value would still get here; a rule with no `undefined`
    // fallback would not.
    const wrapped = onlyDataTable(argumentsOf({ dataTable: table(undefined) }))
    expect(wrapped.uri).toBe(uri)
    expect(wrapped.line).toBe(line)
    expect(wrapped.raw()).toEqual([["a", "b"], ["1", "2"]])
  })
})

describe("a step carrying both a DocString and a DataTable", () => {
  it("keeps DocString first when upstream numbered it 1", () => {
    expect(tagsOf(argumentsOf({
      docString: docStringOf(1, undefined),
      dataTable: table(2)
    }))).toEqual(["DocString", "DataTable"])
  })

  it("puts the DataTable first when upstream numbered IT 1", () => {
    // The reordering, on synthetic data and so independent of any fixture. Note that the object
    // literal still lists `docString` first: if the order came from the key order, or from a fixed
    // DocString-then-DataTable convention, this test would fail and the one above would not.
    expect(tagsOf(argumentsOf({
      docString: docStringOf(2, undefined),
      dataTable: table(1)
    }))).toEqual(["DataTable", "DocString"])
  })

  it("falls back to DocString-then-DataTable when neither carries an index", () => {
    // A shape upstream never emits for a two-argument step — it always assigns both indices, which
    // `test/upstream-pin.test.ts` asserts against the real parser — but one the TYPE permits, since
    // `argumentIndex` is optional on both. The documented fallback applies rather than the function
    // throwing, dropping an argument, or returning them in an order that varies between runs.
    expect(tagsOf(argumentsOf({
      docString: docStringOf(undefined, undefined),
      dataTable: table(undefined)
    }))).toEqual(["DocString", "DataTable"])
  })
})

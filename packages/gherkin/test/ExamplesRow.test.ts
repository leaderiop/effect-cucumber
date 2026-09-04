/**
 * Tests for `ExamplesRow.ts` (ADR-EC-032, BEH-EC-024): `makeExamplesRow`, `decodeExamplesRow`, and
 * `Correlate.ts`'s population of `ParsedScenario.exampleRow` end to end through the real parser.
 */
import { IdGenerator } from "@cucumber/messages"
import { assert, describe, expect, it } from "@effect/vitest"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import { correlateFeature } from "../src/Correlate.ts"
import { ExamplesRowError } from "../src/Errors.ts"
import { decodeExamplesRow, makeExamplesRow } from "../src/ExamplesRow.ts"
import { parseFeature } from "../src/loadFeature.ts"
import { ParameterTypeStore } from "../src/ParameterTypes.ts"
import { parseDocument } from "../src/Parser.ts"
import { compilePickles } from "../src/Pickles.ts"

const parse = (source: string, uri: string) =>
  parseFeature(source, uri).pipe(Effect.provide(ParameterTypeStore.Default))

describe("makeExamplesRow", () => {
  it("zips header and values positionally into raw", () => {
    const row = makeExamplesRow(["a", "b"], ["1", "2"], "u.feature", 5)
    expect(row).toMatchObject({
      _tag: "ExamplesRow",
      uri: "u.feature",
      line: 5,
      header: ["a", "b"],
      values: ["1", "2"]
    })
    expect(row.raw).toEqual({ a: "1", b: "2" })
  })

  it("keeps the FIRST value for a duplicate column name in raw, mirroring Validate.ts's own DuplicateExamplesColumn tolerance", () => {
    const row = makeExamplesRow(["a", "a"], ["first", "second"], "u.feature", 1)
    expect(row.raw).toEqual({ a: "first" })
    // header/values stay POSITIONAL and undeduped, unlike raw — OutlineTitle.ts relies on this.
    expect(row.header).toEqual(["a", "a"])
    expect(row.values).toEqual(["first", "second"])
  })

  it("defaults a missing value to the empty string (noUncheckedIndexedAccess's requirement, mirroring DataTable.ts's recordOf)", () => {
    const row = makeExamplesRow(["a", "b"], ["1"], "u.feature", 1)
    expect(row.raw).toEqual({ a: "1", b: "" })
  })
})

/**
 * `succeeds`/`fails` fail the Effect with this instead of a plain `Error`: `@effect/tsgo`'s
 * `globalErrorInEffectFailure` check (ADR-EC-016) flags an untagged `Error` in an Effect's failure
 * channel — the same convention `Boom`/`OtherFailure` establish in
 * `packages/vitest/test/Testing.test.ts`.
 */
class UnexpectedOutcome extends Data.TaggedError("UnexpectedOutcome")<{ readonly message: string }> {}

/** A decode that must succeed, as an Effect resolving to the decoded value. */
const succeeds = <A>(effect: Effect.Effect<A, ExamplesRowError>): Effect.Effect<A, UnexpectedOutcome> =>
  Effect.mapError(
    effect,
    (error) =>
      new UnexpectedOutcome({ message: `expected decodeExamplesRow to succeed, but it failed with ${error.reason}` })
  )

/** A decode that must fail, as an Effect resolving to the `ExamplesRowError` it failed with. */
const fails = <A>(effect: Effect.Effect<A, ExamplesRowError>): Effect.Effect<ExamplesRowError, UnexpectedOutcome> =>
  Effect.matchEffect(effect, {
    onFailure: (error) => Effect.succeed(error),
    onSuccess: (value): Effect.Effect<ExamplesRowError, UnexpectedOutcome> =>
      Effect.fail(
        new UnexpectedOutcome({
          message: `expected decodeExamplesRow to fail, but it succeeded with ${JSON.stringify(value)}`
        })
      )
  })

describe("decodeExamplesRow", () => {
  const Row = Schema.Struct({ name: Schema.String, count: Schema.NumberFromString })

  it.effect("decodes a well-formed row through the given Schema", () =>
    Effect.gen(function*() {
      const row = makeExamplesRow(["name", "count"], ["widget", "3"], "u.feature", 2)
      const value = yield* succeeds(decodeExamplesRow(Row)(row))
      assert.deepStrictEqual(value, { name: "widget", count: 3 })
    }))

  // `Schema.Number`, not `Schema.NumberFromString`: a raw cell value is always a string, so `Number`
  // rejects it outright regardless of content — `NumberFromString` accepts a non-numeric string
  // rather than failing on this installed `effect@4.0.0-rc.112`, which would make this test assert
  // nothing.
  const StrictRow = Schema.Struct({ name: Schema.String, count: Schema.Number })

  it.effect("fails with a located ExamplesRowError naming the offending column", () =>
    Effect.gen(function*() {
      const row = makeExamplesRow(["name", "count"], ["widget", "not-a-number"], "u.feature", 7)
      const error = yield* fails(decodeExamplesRow(StrictRow)(row))

      assert.instanceOf(error, ExamplesRowError)
      assert.strictEqual(error.reason, "RowDecodeFailed")
      assert.strictEqual(error.uri, "u.feature")
      assert.strictEqual(Option.getOrNull(error.line), 7)
      assert.strictEqual(Option.getOrNull(error.column), "count")
      assert.include(error.message, "u.feature:7")
      assert.include(error.message, "count")
    }))

  // A schema over the WHOLE row, not one of its fields (mirroring `DataTable.test.ts`'s identical
  // `decodeHashes(Schema.String)` case): the issue path is empty, so no single column is at fault.
  it.effect("reports an absent column when the decode failure has no locatable field", () =>
    Effect.gen(function*() {
      const row = makeExamplesRow(["name", "count"], ["widget", "3"], "u.feature", 4)
      const error = yield* fails(decodeExamplesRow(Schema.String)(row))

      assert.isTrue(Option.isNone(error.column))
      assert.notInclude(error.message, "column")
    }))
})

describe("Correlate.ts populates ParsedScenario.exampleRow (ADR-EC-032)", () => {
  it.effect("is Option.none() for a plain Scenario", () =>
    Effect.gen(function*() {
      const feature = yield* parse(
        `Feature: Checkout
  Scenario: paying
    When I pay
`,
        "checkout.feature"
      )
      assert.lengthOf(feature.allScenarios, 1)
      assert.isTrue(Option.isNone(feature.allScenarios[0]!.exampleRow))
    }))

  it.effect("is Option.some(ExamplesRow) for an Outline row, carrying that row's own header and values", () =>
    Effect.gen(function*() {
      const feature = yield* parse(
        `Feature: Discounts
  Scenario Outline: applying <code>
    When I apply <code>

    Examples:
      | code   | percent |
      | SAVE10 | 10      |
      | SAVE50 | 50      |
`,
        "discounts.feature"
      )
      assert.lengthOf(feature.allScenarios, 2)
      const [first, second] = feature.allScenarios

      const firstRow = Option.getOrThrow(first!.exampleRow)
      assert.deepStrictEqual(firstRow.header, ["code", "percent"])
      assert.deepStrictEqual(firstRow.values, ["SAVE10", "10"])
      assert.deepStrictEqual(firstRow.raw, { code: "SAVE10", percent: "10" })
      assert.strictEqual(firstRow.uri, "discounts.feature")

      const secondRow = Option.getOrThrow(second!.exampleRow)
      assert.deepStrictEqual(secondRow.raw, { code: "SAVE50", percent: "50" })

      // Two DIFFERENT row objects, not one shared reference — each row keeps its own values.
      assert.notStrictEqual(firstRow, secondRow)
    }))

  it.effect("gives each Examples block of a two-block Outline its OWN header (F24-style)", () =>
    Effect.gen(function*() {
      const feature = yield* parse(
        `Feature: Payments
  Scenario Outline: paying <amount>
    Given I pay <amount>

    Examples: in euros
      | amount | currency |
      | 10     | EUR      |

    Examples: with a card
      | amount | card |
      | 20     | visa |
`,
        "payments.feature"
      )
      const [inEuros, withCard] = feature.allScenarios
      assert.deepStrictEqual(Option.getOrThrow(inEuros!.exampleRow).raw, { amount: "10", currency: "EUR" })
      assert.deepStrictEqual(Option.getOrThrow(withCard!.exampleRow).raw, { amount: "20", card: "visa" })
    }))

  it.effect("locates an ExamplesRow at its own row's line, not the Outline's declaration line", () =>
    Effect.gen(function*() {
      const feature = yield* parse(
        `Feature: Outline

  Scenario Outline: adding <count>
    Given I add <count> apples

    Examples:
      | count |
      | 1     |
      | 2     |
`,
        "outline.feature"
      )
      const [first, second] = feature.allScenarios
      assert.strictEqual(Option.getOrThrow(first!.exampleRow).line, 8)
      assert.strictEqual(Option.getOrThrow(second!.exampleRow).line, 9)
    }))
})

// A defensive re-derivation using the parse/compile/correlate pipeline directly, the same shape
// `Correlate.test.ts` uses elsewhere in this package, so this file does not depend solely on the
// wrapped `parseFeature` entry point for its ADR-EC-032 coverage.
describe("correlateFeature directly", () => {
  it("resolves the row through the LAST astNodeId, never the first (the Outline's own shared id)", () => {
    const source = `Feature: Outline
  Scenario Outline: adding <count>
    Given I add <count> apples

    Examples:
      | count |
      | 1     |
`
    const newId = IdGenerator.uuid()
    const document = parseDocument(source, "outline.feature", newId)
    const pickles = compilePickles(document, "outline.feature", newId)
    const { feature } = correlateFeature(document, pickles, "outline.feature")
    const scenario = feature.allScenarios[0]!
    // `astNodeIds[0]` is the Outline's own AST id, shared by every row — if the lookup used that
    // instead of `.at(-1)`, this would resolve to nothing (the map is keyed by ROW ids only).
    expect(scenario.pickle.astNodeIds[0]).not.toBe(scenario.pickle.astNodeIds.at(-1))
    expect(Option.isSome(scenario.exampleRow)).toBe(true)
  })
})

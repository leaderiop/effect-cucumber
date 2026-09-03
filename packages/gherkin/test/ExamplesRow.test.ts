/**
 * Tests for `ExamplesRow.ts` (ADR-EC-032, BEH-EC-024): `makeExamplesRow`, `decodeExamplesRow`, and
 * `Correlate.ts`'s population of `ParsedScenario.exampleRow` end to end through the real parser.
 */
import { IdGenerator } from "@cucumber/messages"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import { describe, expect, it } from "vitest"
import { correlateFeature } from "../src/Correlate.ts"
import { ExamplesRowError } from "../src/Errors.ts"
import { decodeExamplesRow, makeExamplesRow } from "../src/ExamplesRow.ts"
import { parseFeature } from "../src/loadFeature.ts"
import { ParameterTypeStore } from "../src/ParameterTypes.ts"
import { parseDocument } from "../src/Parser.ts"
import { compilePickles } from "../src/Pickles.ts"

const parse = (source: string, uri: string) =>
  Effect.runSync(parseFeature(source, uri).pipe(Effect.provide(ParameterTypeStore.Default)))

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
 * The result of running `decodeExamplesRow`, as a value rather than as a throw — the same shape
 * `DataTable.test.ts`'s `outcomeOf` uses for `decodeHashes`.
 */
type Outcome<A> =
  | { readonly failed: false; readonly value: A }
  | { readonly failed: true; readonly error: ExamplesRowError }

const outcomeOf = <A>(effect: Effect.Effect<A, ExamplesRowError>): Outcome<A> =>
  Effect.runSync(Effect.match(effect, {
    onFailure: (error): Outcome<A> => ({ failed: true, error }),
    onSuccess: (value): Outcome<A> => ({ failed: false, value })
  }))

describe("decodeExamplesRow", () => {
  const Row = Schema.Struct({ name: Schema.String, count: Schema.NumberFromString })

  it("decodes a well-formed row through the given Schema", () => {
    const row = makeExamplesRow(["name", "count"], ["widget", "3"], "u.feature", 2)
    const outcome = outcomeOf(decodeExamplesRow(Row)(row))
    expect(outcome).toEqual({ failed: false, value: { name: "widget", count: 3 } })
  })

  // `Schema.Number`, not `Schema.NumberFromString`: a raw cell value is always a string, so `Number`
  // rejects it outright regardless of content — `NumberFromString` accepts a non-numeric string
  // rather than failing on this installed `effect@4.0.0-rc.112`, which would make this test assert
  // nothing.
  const StrictRow = Schema.Struct({ name: Schema.String, count: Schema.Number })

  it("fails with a located ExamplesRowError naming the offending column", () => {
    const row = makeExamplesRow(["name", "count"], ["widget", "not-a-number"], "u.feature", 7)
    const outcome = outcomeOf(decodeExamplesRow(StrictRow)(row))
    if (!outcome.failed) {
      throw new Error(`expected decodeExamplesRow to fail, but it succeeded with ${JSON.stringify(outcome.value)}`)
    }
    expect(outcome.error).toBeInstanceOf(ExamplesRowError)
    expect(outcome.error.reason).toBe("RowDecodeFailed")
    expect(outcome.error.uri).toBe("u.feature")
    expect(Option.getOrNull(outcome.error.line)).toBe(7)
    expect(Option.getOrNull(outcome.error.column)).toBe("count")
    expect(outcome.error.message).toContain("u.feature:7")
    expect(outcome.error.message).toContain("count")
  })

  // A schema over the WHOLE row, not one of its fields (mirroring `DataTable.test.ts`'s identical
  // `decodeHashes(Schema.String)` case): the issue path is empty, so no single column is at fault.
  it("reports an absent column when the decode failure has no locatable field", () => {
    const row = makeExamplesRow(["name", "count"], ["widget", "3"], "u.feature", 4)
    const outcome = outcomeOf(decodeExamplesRow(Schema.String)(row))
    if (!outcome.failed) {
      throw new Error(`expected decodeExamplesRow to fail, but it succeeded with ${JSON.stringify(outcome.value)}`)
    }
    expect(Option.isNone(outcome.error.column)).toBe(true)
    expect(outcome.error.message).not.toContain("column")
  })
})

describe("Correlate.ts populates ParsedScenario.exampleRow (ADR-EC-032)", () => {
  it("is Option.none() for a plain Scenario", () => {
    const feature = parse(
      `Feature: Checkout
  Scenario: paying
    When I pay
`,
      "checkout.feature"
    )
    expect(feature.allScenarios).toHaveLength(1)
    expect(Option.isNone(feature.allScenarios[0]!.exampleRow)).toBe(true)
  })

  it("is Option.some(ExamplesRow) for an Outline row, carrying that row's own header and values", () => {
    const feature = parse(
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
    expect(feature.allScenarios).toHaveLength(2)
    const [first, second] = feature.allScenarios

    const firstRow = Option.getOrThrow(first!.exampleRow)
    expect(firstRow.header).toEqual(["code", "percent"])
    expect(firstRow.values).toEqual(["SAVE10", "10"])
    expect(firstRow.raw).toEqual({ code: "SAVE10", percent: "10" })
    expect(firstRow.uri).toBe("discounts.feature")

    const secondRow = Option.getOrThrow(second!.exampleRow)
    expect(secondRow.raw).toEqual({ code: "SAVE50", percent: "50" })

    // Two DIFFERENT row objects, not one shared reference — each row keeps its own values.
    expect(firstRow).not.toBe(secondRow)
  })

  it("gives each Examples block of a two-block Outline its OWN header (F24-style)", () => {
    const feature = parse(
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
    expect(Option.getOrThrow(inEuros!.exampleRow).raw).toEqual({ amount: "10", currency: "EUR" })
    expect(Option.getOrThrow(withCard!.exampleRow).raw).toEqual({ amount: "20", card: "visa" })
  })

  it("locates an ExamplesRow at its own row's line, not the Outline's declaration line", () => {
    const feature = parse(
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
    expect(Option.getOrThrow(first!.exampleRow).line).toBe(8)
    expect(Option.getOrThrow(second!.exampleRow).line).toBe(9)
  })
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

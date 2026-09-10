/**
 * `StepRegistrar`'s second, `decode`-carrying overload (ADR-EC-057): a step declares `{ table:
 * Schema }`/`{ docstring: Schema }` alongside its pattern and receives the already-decoded value as
 * its own trailing parameter, with no `yield* decodeHashes(...)`/`decodeDocString(...)` call inside
 * the body.
 *
 * Tests go straight at `collectFeature`'s returned `StepDefinition.body` — the same level
 * `describeFeature.test.ts` already tests the DSL at — rather than through a full `vitest run`,
 * since the claim under test (the wrapper decodes and substitutes the right argument before calling
 * the real handler) is fully observable by invoking `body` directly with a real `DataTable`/
 * `DocString` argument and running the Effect it returns.
 */
import { type DataTable, DataTableError, type DocString, makeDataTable } from "@effect-cucumber/gherkin"
import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import { fileURLToPath } from "node:url"
import { collectFeature } from "../src/describeFeature.ts"
import type { ScenarioDsl } from "../src/Dsl.ts"
import { assert, describe, it } from "../src/EffectVitest.ts"
import { loadFeature } from "../src/loadFeature.ts"

const featurePath = fileURLToPath(new URL("./acceptance/worked-example-03-discounts.feature", import.meta.url))
const feature = await loadFeature(featurePath)

const bodyOf = (define: (dsl: ScenarioDsl<never>) => void, pattern: string) => {
  const collected = collectFeature(feature, Layer.empty, define)
  const definition = collected.definitions.find((d) => d.pattern === pattern)
  if (definition === undefined) {
    throw new Error(`no step registered for pattern ${JSON.stringify(pattern)}`)
  }
  return definition.body
}

// A two-row DataTable, header `item`/`price`, exactly as `Correlate.ts` would build one.
const realDataTable = (): DataTable =>
  makeDataTable(
    {
      rows: [
        { cells: [{ value: "item" }, { value: "price" }] },
        { cells: [{ value: "widget" }, { value: "10" }] }
      ]
    } as any,
    "features/decode.feature",
    5
  )

const realDocString = (content: string): DocString => ({
  _tag: "DocString",
  content,
  mediaType: Option.none(),
  uri: "features/decode.feature",
  line: 5
})

const ItemRow = Schema.Struct({ item: Schema.String, price: Schema.NumberFromString })

describe("StepRegistrar's decode overload — table", () => {
  it.effect("decodes the DataTable through the schema and hands the body an already-typed array", () =>
    Effect.gen(function*() {
      const seen: Array<unknown> = []
      // Annotated, not inferred: `decodeHashes` (which this overload delegates to) always wraps
      // `rowSchema` in `Schema.Array` itself, so `{ table: ItemRow }` decodes to
      // `ReadonlyArray<ItemRow>`, never a bare `ItemRow` — an explicit annotation here is what would
      // have caught the real Dsl.ts type bug `verify:doc-examples` found (`S["Type"]` alone,
      // un-wrapped, typed this parameter as a single row, not an array).
      const body = bodyOf(({ Given }) => {
        Given(
          "the following items:",
          { table: ItemRow },
          function*(items: ReadonlyArray<{ item: string; price: number }>) {
            seen.push(items)
            yield* Effect.void
          }
        )
      }, "the following items:")

      yield* body(realDataTable())

      assert.deepStrictEqual(seen, [[{ item: "widget", price: 10 }]])
    }))

  it.effect("keeps positional pattern arguments before the decoded value, in order", () =>
    Effect.gen(function*() {
      const seen: Array<unknown> = []
      const body = bodyOf(({ Given }) => {
        Given(
          "transfer {int} with:",
          { table: ItemRow },
          function*(amount: number, items: ReadonlyArray<{ item: string; price: number }>) {
            seen.push([amount, items])
            yield* Effect.void
          }
        )
      }, "transfer {int} with:")

      yield* body(7, realDataTable())

      // `items` is `ReadonlyArray<ItemRow>` (see the note above) — one row, still an array.
      assert.deepStrictEqual(seen, [[7, [{ item: "widget", price: 10 }]]])
    }))

  it.effect("a decode failure surfaces as a real DataTableError, not a defect", () =>
    Effect.gen(function*() {
      const body = bodyOf(({ Given }) => {
        Given("the following items:", { table: ItemRow }, function*(items) {
          yield* Effect.succeed(items)
        })
      }, "the following items:")

      // A malformed table: the header omits `price` entirely, so the decoded row record has no
      // `price` key at all — a required-property failure `ItemRow` cannot satisfy.
      const malformed = makeDataTable(
        {
          rows: [
            { cells: [{ value: "item" }] },
            { cells: [{ value: "widget" }] }
          ]
        } as any,
        "features/decode.feature",
        5
      )

      const exit = yield* Effect.exit(body(malformed))
      assert.isTrue(Exit.isFailure(exit))
      const failure = Exit.isFailure(exit) ? Cause.squash(exit.cause) : undefined
      assert.instanceOf(failure, DataTableError)
    }))
})

describe("StepRegistrar's decode overload — docstring", () => {
  it.effect("decodes the DocString through the schema and hands the body an already-typed value", () =>
    Effect.gen(function*() {
      const seen: Array<unknown> = []
      const body = bodyOf(({ Given }) => {
        Given(
          "the payload:",
          { docstring: Schema.fromJsonString(Schema.Struct({ ok: Schema.Boolean })) },
          // Annotated as a bare object (not an array): `docstring` decodes one level shallower than
          // `table` (ADR-EC-046) — the other half of the same type contract the array test above pins.
          function*(payload: { ok: boolean }) {
            seen.push(payload)
            yield* Effect.void
          }
        )
      }, "the payload:")

      yield* body(realDocString(JSON.stringify({ ok: true })))

      assert.deepStrictEqual(seen, [{ ok: true }])
    }))
})

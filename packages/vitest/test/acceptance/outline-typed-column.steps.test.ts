/**
 * Acceptance pair for ADR-EC-032 / BEH-EC-024: `outline-typed-column.feature` run through the real
 * `describeFeature`, proving from INSIDE running steps that an Outline column no step pattern
 * references still reaches a step body — typed, decoded through `Schema` via `decodeExamplesRow`
 * (ADR-EC-008's precedent, extended) — while the ordinary pattern-referenced column (`sku`) keeps
 * working exactly as BEH-EC-010 already documents.
 *
 * Carries: ADR-EC-008, ADR-EC-032, BEH-EC-024, REQ-EC-025.
 *
 * Deliberate choices this pair proves at once rather than each in its own Scenario, following
 * `random-seeding.steps.test.ts`'s "recompute independently, don't import" shape where it applies:
 *
 * 1. `sku` is referenced by the FIRST step's cucumber-expression pattern (`{string}`), so it is
 *    coerced the ordinary BEH-EC-010 way. `note` and `priority` are referenced by NO step's pattern
 *    text at all — not even the `Then` step's, which is worded generically on purpose
 *    ("this row's own Examples values", no `<note>`/`<priority>` placeholder anywhere) so that
 *    `compile()` never substitutes them into any step text for cucumber-expressions to coerce. The
 *    ONLY way either column reaches a step body is through the trailing `ExamplesRow`.
 * 2. `expectedBySku` below is this pair's own independent ground truth, hand-copied from the
 *    `.feature` file's Examples cells and keyed by the ONE column a pattern DOES coerce (`sku`) —
 *    not derived from `feature` or from the decoded value itself, so a wiring bug that fed the
 *    wrong row (or no row) into `decodeExamplesRow` cannot make the `Then` step's comparison pass by
 *    construction, the same shape `random-seeding.steps.test.ts`'s `emittedTitleFor` uses.
 * 3. The `Given` step ALSO receives the trailing `ExamplesRow`, despite declaring no reason to want
 *    it and only reading it for one cross-check — proving ADR-EC-032's design decision that EVERY
 *    step of an Outline row carries it, not only the one step an author bothers to annotate.
 *    `row.raw["sku"]` is asserted equal to that SAME step's own pattern-coerced `sku` parameter.
 * 4. `decodeExamplesRow` runs inside the `When` step against a real `Schema.Struct` covering all
 *    three columns — the same Schema-decode mechanism `decodeHashes` already gives a DataTable
 *    (ADR-EC-008), applied one level up to a whole row.
 *
 * Mutation record (performed, run, and reverted — nothing from any of the three remains in this
 * commit):
 *
 * - **C** — changed the first Outline row's `note` cell in `outline-typed-column.feature` from
 *   `"fragile, handle carefully"` to `"handle with care"`, WITHOUT touching this file's
 *   `expectedBySku`. The first row's `Then` assertion turned RED
 *   (`AssertionError: expected 'handle with care' to be 'fragile, handle carefully'` — the DECODED
 *   value now disagreeing with this module's own independently-hand-copied expectation), while the
 *   second row's stayed GREEN. This is what proves the decoded `note` really comes from the
 *   `.feature` file's own Examples cell through `decodeExamplesRow`, not from a value silently
 *   agreeing with itself.
 * - **D** — deleted the body of the `When` step (the one that WRITES the decoded row into the
 *   shared `World`), leaving only `yield* Effect.void`. Both rows' `Then` assertions turned RED
 *   (`Error: getOrThrow called on a None`, off `Option.getOrThrow` reading `World`'s still-`None`
 *   `decoded` Ref), proving the `Then` step reads what the `When` step decoded and wrote, rather
 *   than recomputing or hard-coding it.
 * - **E** — deleted this pair's row from `spec/traceability.md` §5. `pnpm verify:spec` failed at
 *   check 5, naming `REQ-EC-025` as tagged but with no §5 row.
 */
import { decodeExamplesRow, type ExamplesRow } from "@effect-cucumber/gherkin"
import { assert } from "@effect/vitest"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Ref from "effect/Ref"
import * as Schema from "effect/Schema"
import { fileURLToPath } from "node:url"
import { describeFeature } from "../../src/describeFeature.ts"
import { loadFeature } from "../../src/loadFeature.ts"

// The `.feature` file beside this one, resolved relative to this module rather than to `process.cwd()`, so the pair
// keeps working whichever directory the runner was invoked from.
const featurePath = fileURLToPath(new URL("./outline-typed-column.feature", import.meta.url))

// Real bytes off disk, through the real parser, at module top level.
const feature = await loadFeature(featurePath)

// ONE row schema covering every Examples column, `note` and `priority` included, even though neither
// appears in any step's pattern text.
const ShipmentRow = Schema.Struct({
  sku: Schema.String,
  note: Schema.String,
  priority: Schema.NumberFromString
})

type DecodedShipment = typeof ShipmentRow.Type

// This pair's own independent ground truth (choice 2 above) — hand-copied from
// `outline-typed-column.feature`'s Examples table, never imported from `feature` or from the
// decoded value under test.
const expectedBySku: Readonly<Record<string, { readonly note: string; readonly priority: number }>> = {
  WIDGET: { note: "fragile, handle carefully", priority: 1 },
  GADGET: { note: "standard shipping", priority: 3 }
}

// Per-Scenario, fresh for every Outline row: the pattern-coerced `sku` (for the cross-check) and the
// decoded row the `When` step writes and the `Then` step reads back (INV-EC-006, ADR-EC-009 — a
// `Ref` on a Layer-provided service, never a closure variable).
class World extends Context.Service<World, {
  readonly sku: Ref.Ref<string>
  readonly decoded: Ref.Ref<Option.Option<DecodedShipment>>
}>()("World") {
  static readonly layer = Layer.effect(
    this,
    Effect.gen(function*() {
      return World.of({
        sku: yield* Ref.make(""),
        decoded: yield* Ref.make<Option.Option<DecodedShipment>>(Option.none())
      })
    })
  )
}

// THE CALL UNDER TEST.
describeFeature(feature, World.layer, ({ Scenario }) => {
  Scenario("Shipping a typed, unreferenced column", ({ Given, Then, When }) => {
    Given("a shipment for {string}", function*(sku: string, row: ExamplesRow) {
      // The SAME row a `{string}`-pattern argument coerced, reached through the trailing
      // `ExamplesRow` tail item this step never asked for by declaring an unused parameter type —
      // proving every step of the row carries it (ADR-EC-032), not only the one that decodes it.
      assert.strictEqual(row.raw["sku"], sku)
      yield* Ref.set((yield* World).sku, sku)
    })

    When("the shipment note is decoded from the row", function*(row: ExamplesRow) {
      const decoded = yield* decodeExamplesRow(ShipmentRow)(row)
      yield* Ref.set((yield* World).decoded, Option.some(decoded))
    })

    Then("the decoded note and priority match this row's own Examples values", function*() {
      const { decoded, sku } = yield* World
      const value = Option.getOrThrow(yield* Ref.get(decoded))
      const expected = expectedBySku[yield* Ref.get(sku)]
      if (expected === undefined) {
        assert.fail(`no expected value hand-copied for this row's sku ${JSON.stringify(value.sku)}`)
      }
      assert.strictEqual(value.note, expected.note)
      assert.strictEqual(value.priority, expected.priority)
      // The decoded row's OWN `sku` field, read through `decodeExamplesRow` rather than through the
      // pattern argument, agrees with what step 1 recorded from the pattern — one row, two
      // independent readings of it.
      assert.strictEqual(value.sku, yield* Ref.get(sku))
    })
  })
})

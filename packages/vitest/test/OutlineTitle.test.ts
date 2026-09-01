/**
 * D-03's title format: every Outline row's emitted test title carries every Examples column and
 * that row's value for it.
 *
 * ## Why every fixture here is parsed, never hand-built
 *
 * `buildScenarioTitles` reads the RAW `GherkinDocument` — `Examples.tableHeader`, `Examples
 * .tableBody`, `TableRow.id` — and joins it to the pickles through `astNodeIds.at(-1)`. A
 * hand-written `GherkinDocument` literal would let this file assert against whatever shape the test
 * author BELIEVED the parser produces, which is precisely the mistake the module's own note (a)
 * warns about on the other side (believing `Pickle.name` already contains this format). Every
 * fixture below therefore goes through the real `parseFeature`, module-scope, exactly as
 * `test/Runner.test.ts` and `test/describeFeature.test.ts` do.
 *
 * ## The three assertions that are stricter than they look
 *
 * - **The no-placeholder fixture is the headline case.** `Applying a valid discount code` contains
 *   no `<placeholder>` at all, so `@cucumber/gherkin` has nothing to interpolate and BOTH rows'
 *   `Pickle.name` are byte-identical. An implementation that returned `scenario.name` unchanged —
 *   the "the raw material is already sitting in the Pickle" reading of D-03 — passes every
 *   placeholder-bearing fixture in this file and fails only here.
 * - **The placeholder fixture proves the suffix is ADDITIVE.** `adding 1 (count=1)`, not `adding 1`
 *   and not `adding <count> (count=1)`. D-03 asks for the suffix on every row unconditionally, so
 *   an implementation that appends it only when two rows would otherwise collide is wrong even
 *   though every title it produces is unique.
 * - **The multi-Examples-block fixture pins the join key.** Both blocks' rows belong to ONE AST
 *   Scenario node, so a lookup keyed on the Scenario's own id (`astNodeIds[0]`, which every row of
 *   one Outline SHARES — Pitfall 9) cannot tell the four rows apart. Their headers differ, so
 *   borrowing the wrong block's header renders visibly wrong column NAMES rather than merely
 *   swapped values.
 *
 * ## Imports
 *
 * `../src/OutlineTitle.ts` directly, never `../src/index.ts`: `effect/no-import-from-barrel-package`
 * runs with `checkRelativeIndexImports: true` and fails `pnpm lint` on a relative value-import whose
 * basename is `index.*`. `buildScenarioTitles` is not in that barrel anyway — `OutlineTitle.ts`'s
 * closing note.
 *
 * `assert` throughout, for `test/Runner.test.ts`'s reason: oxlint's `vitest/no-standalone-expect`
 * does not recognise an Effect-bodied test as a test block, and switching form halfway between the
 * synchronous and Effect-bodied tests of one file reads worse than using one everywhere.
 */
import { ParameterTypeStore, type ParsedFeature, parseFeature } from "@effect-cucumber/gherkin"
import { assert, describe, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import { buildScenarioTitles } from "../src/OutlineTitle.ts"

/** The `test/Runner.test.ts` fixture convention: the real parser, at module scope, run with `runSync`. */
const parse = (source: string, uri: string): ParsedFeature =>
  Effect.runSync(parseFeature(source, uri).pipe(Effect.provide(ParameterTypeStore.Default)))

/**
 * Every Scenario's title, in `allScenarios` (document) order.
 *
 * The map is keyed by `ParsedScenario.id`, so reading it back through `allScenarios` is also what
 * proves the map is TOTAL over that array — a missing key surfaces as `undefined` in the compared
 * array rather than as a silently shorter one.
 */
const titlesOf = (feature: ParsedFeature): ReadonlyArray<string | undefined> => {
  const titles = buildScenarioTitles(feature)
  return feature.allScenarios.map((scenario) => titles.get(scenario.id))
}

/**
 * The headline fixture: an Outline whose OWN title carries no placeholder.
 *
 * `percent` is deliberately a column no step reads. An implementation that derived the suffix from
 * the placeholders it found in the step text — rather than from the Examples HEADER — would drop it
 * and produce a two-column title here while staying green on every other fixture in this file.
 */
const discountCodes = parse(
  `Feature: Discounts

  Scenario Outline: Applying a valid discount code
    Given a cart worth 35.00
    When I apply <code>
    Then the total is <expected>

    Examples:
      | code   | percent | expected |
      | SAVE10 | 10      | 31.50    |
      | SAVE50 | 50      | 17.50    |
`,
  "test/outline-title-discounts.feature"
)

/** An Outline whose title DOES reference a placeholder — `Runner.test.ts`'s own `outline` fixture. */
const counted = parse(
  `Feature: Outline

  Scenario Outline: adding <count>
    Given I add <count> apples

    Examples:
      | count |
      | 1     |
      | 2     |
`,
  "test/outline-title-counted.feature"
)

/** No `Examples:` anywhere: every title must come back exactly as the author wrote it. */
const plain = parse(
  `Feature: Checkout

  Scenario: checkout
    When I pay
    Then I am charged
`,
  "test/outline-title-plain.feature"
)

/**
 * Two `Examples:` blocks under ONE Outline, with DIFFERENT headers (F24-style).
 *
 * The differing headers are the point: a lookup that found the right ROW but reused the first
 * block's header would render `currency=EUR` for the second block's rows, which is a wrong column
 * NAME and not merely a wrong value.
 */
const twoBlocks = parse(
  `Feature: Payments

  Scenario Outline: paying
    Given I pay <amount>

    Examples: in euros
      | amount | currency |
      | 10     | EUR      |

    Examples: with a card
      | amount | card |
      | 20     | visa |
`,
  "test/outline-title-two-blocks.feature"
)

/** A Rule-nested Outline plus a Rule-nested plain Scenario, reachable only through `rule.children`. */
const ruleNested = parse(
  `Feature: Shop

  Rule: refunds

    Scenario: refund denied
      When I keep the goods

    Scenario Outline: refunding <amount>
      When I refund <amount>

      Examples:
        | amount |
        | 5      |
        | 7      |
`,
  "test/outline-title-rule.feature"
)

describe("an Outline row's title carries every column and that row's value", () => {
  it("suffixes a placeholder-FREE Outline title, whose rows are otherwise byte-identical", () => {
    // The exact D-03 string, verbatim from 08-CONTEXT.md. Both rows' `Pickle.name` are
    // `Applying a valid discount code` — nothing distinguishes them before this module runs.
    assert.deepStrictEqual(titlesOf(discountCodes), [
      "Applying a valid discount code (code=SAVE10, percent=10, expected=31.50)",
      "Applying a valid discount code (code=SAVE50, percent=50, expected=17.50)"
    ])
  })

  it("proves those two rows' interpolated names really were identical without the suffix", () => {
    // The standing justification for the module existing at all. If this ever goes red, the
    // installed `@cucumber/gherkin` changed its interpolation rules and the module's note (a) —
    // "verified empirically against @cucumber/gherkin@42.0.1" — is stale, not merely this test.
    assert.deepStrictEqual(
      discountCodes.allScenarios.map((scenario) => scenario.name),
      ["Applying a valid discount code", "Applying a valid discount code"]
    )
  })

  it("ADDS the suffix to an already-interpolated title rather than replacing it", () => {
    // `adding 1 (count=1)`, not the bare `adding 1` the interpolation alone gives and not
    // `adding <count> (count=1)`. D-03 is unconditional: the suffix goes on every row.
    assert.deepStrictEqual(titlesOf(counted), ["adding 1 (count=1)", "adding 2 (count=2)"])
  })

  it("leaves a plain Scenario's title exactly as written", () => {
    assert.deepStrictEqual(titlesOf(plain), ["checkout"])
  })

  it("uses each Examples block's OWN header when one Outline has two", () => {
    // Row 1 belongs to `| amount | currency |` and row 2 to `| amount | card |`. Both rows share
    // one AST Scenario id, so this is the case that a `astNodeIds[0]` join cannot express at all.
    assert.deepStrictEqual(titlesOf(twoBlocks), [
      "paying (amount=10, currency=EUR)",
      "paying (amount=20, card=visa)"
    ])
  })

  it("reaches an Outline nested inside a Rule, and its plain sibling", () => {
    assert.deepStrictEqual(titlesOf(ruleNested), [
      "refund denied",
      "refunding 5 (amount=5)",
      "refunding 7 (amount=7)"
    ])
  })

  it("suffixes ` #2`, ` #3` onto rows whose cells are byte-identical, and only those", () => {
    // mutation: dropping the `occurrences` counter in buildScenarioTitles turns this red — two of
    // the three rows would then carry one title, which vitest's reporter conflates and `-t` cannot
    // tell apart.
    const duplicateRows = parse(
      `Feature: duplicate rows
  Scenario Outline: retrying
    Given I retry <times> times
    Examples:
      | times |
      | 3     |
      | 3     |
      | 5     |
      | 3     |
`,
      "test/outline-title-duplicate-rows.feature"
    )
    assert.deepStrictEqual(titlesOf(duplicateRows), [
      "retrying (times=3)",
      "retrying (times=3) #2",
      "retrying (times=5)",
      "retrying (times=3) #3"
    ])
  })

  it("is keyed by Pickle id and is total over allScenarios", () => {
    // Every fixture at once: no `undefined` anywhere above could hide behind a shorter array,
    // because `titlesOf` maps over `allScenarios` rather than over the map's own keys.
    for (const feature of [discountCodes, counted, plain, twoBlocks, ruleNested]) {
      const titles = buildScenarioTitles(feature)
      assert.strictEqual(titles.size, feature.allScenarios.length)
      for (const scenario of feature.allScenarios) {
        assert.isTrue(titles.has(scenario.id), `no title for scenario id ${JSON.stringify(scenario.id)}`)
      }
    }
  })
})

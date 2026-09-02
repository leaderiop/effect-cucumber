/**
 * Tests for `OutlineTitle`.
 */
import { ParameterTypeStore, type ParsedFeature, parseFeature } from "@effect-cucumber/gherkin"
import { assert, describe, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import { buildScenarioTitles } from "../src/OutlineTitle.ts"

// The `test/Runner.test.ts` fixture convention: the real parser, at module scope, run with `runSync`.
const parse = (source: string, uri: string): ParsedFeature =>
  Effect.runSync(parseFeature(source, uri).pipe(Effect.provide(ParameterTypeStore.Default)))

// Every Scenario's title, in `allScenarios` (document) order.
const titlesOf = (feature: ParsedFeature): ReadonlyArray<string | undefined> => {
  const titles = buildScenarioTitles(feature)
  return feature.allScenarios.map((scenario) => titles.get(scenario.id))
}

// The headline fixture: an Outline whose OWN title carries no placeholder.
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

// An Outline whose title DOES reference a placeholder — `Runner.test.ts`'s own `outline` fixture.
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

// No `Examples:` anywhere: every title must come back exactly as the author wrote it.
const plain = parse(
  `Feature: Checkout

  Scenario: checkout
    When I pay
    Then I am charged
`,
  "test/outline-title-plain.feature"
)

// Two `Examples:` blocks under ONE Outline, with DIFFERENT headers (F24-style).
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

// A Rule-nested Outline plus a Rule-nested plain Scenario, reachable only through `rule.children`.
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
    assert.deepStrictEqual(titlesOf(discountCodes), [
      "Applying a valid discount code (code=SAVE10, percent=10, expected=31.50)",
      "Applying a valid discount code (code=SAVE50, percent=50, expected=17.50)"
    ])
  })

  it("proves those two rows' interpolated names really were identical without the suffix", () => {
    // The standing justification for the module existing at all.
    assert.deepStrictEqual(
      discountCodes.allScenarios.map((scenario) => scenario.name),
      ["Applying a valid discount code", "Applying a valid discount code"]
    )
  })

  it("ADDS the suffix to an already-interpolated title rather than replacing it", () => {
    // `adding 1 (count=1)`, not the bare `adding 1` the interpolation alone gives and not `adding <count> (count=1)`.
    assert.deepStrictEqual(titlesOf(counted), ["adding 1 (count=1)", "adding 2 (count=2)"])
  })

  it("leaves a plain Scenario's title exactly as written", () => {
    assert.deepStrictEqual(titlesOf(plain), ["checkout"])
  })

  it("uses each Examples block's OWN header when one Outline has two", () => {
    // Row 1 belongs to `| amount | currency |` and row 2 to `| amount | card |`.
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
    // Every fixture at once: no `undefined` anywhere above could hide behind a shorter array, because `titlesOf` maps
    // over `allScenarios` rather than over the map's own keys.
    for (const feature of [discountCodes, counted, plain, twoBlocks, ruleNested]) {
      const titles = buildScenarioTitles(feature)
      assert.strictEqual(titles.size, feature.allScenarios.length)
      for (const scenario of feature.allScenarios) {
        assert.isTrue(titles.has(scenario.id), `no title for scenario id ${JSON.stringify(scenario.id)}`)
      }
    }
  })
})

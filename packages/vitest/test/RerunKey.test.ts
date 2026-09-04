/**
 * Tests for `RerunKey.ts` (ADR-EC-038, BEH-EC-030): the stable `(uri, ruleName, title)` key, built
 * entirely from `ParsedFeature.uri`, a Rule's own `.name`, and `OutlineTitle.ts`'s already-computed
 * emitted title — deliberately NOT `ScenarioKey.ts`'s `(ruleId, astName)` key, whose `ruleId` comes
 * from a fresh `IdGenerator.uuid()` on every parse and so can never be compared across two separate
 * runs. Every function here is pure, so this file uses a plain `it` throughout, never `it.effect`
 * (`AGENTS.md` §5), and `assert`, never `expect`.
 *
 * `collectFeature` (not `describeFeature`) is used to obtain a real `FeaturePlan` without emitting
 * any test nodes — the same "collect, don't run" boundary `describeFeature.test.ts` itself relies on.
 */
import { ParameterTypeStore, type ParsedFeature, parseFeature } from "@effect-cucumber/gherkin"
import { assert, describe, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { collectFeature } from "../src/describeFeature.ts"
import { rerunKey, rerunKeysForPlan } from "../src/RerunKey.ts"

// The `OutlineTitle.test.ts`/`Runner.test.ts` fixture convention: the real parser, at module scope,
// run with `runSync`, so every fixture below is real parsed data rather than a hand-built stub.
const parse = (source: string, uri: string): ParsedFeature =>
  Effect.runSync(parseFeature(source, uri).pipe(Effect.provide(ParameterTypeStore.Default)))

describe("rerunKey", () => {
  it("joins uri, ruleName and title with `::`, uri first", () => {
    assert.strictEqual(rerunKey("a.feature", "My Rule", "My Scenario"), "a.feature::My Rule::My Scenario")
  })

  it("normalises a null ruleName (Feature-level Scenario) to an empty string, still `::`-joined twice", () => {
    assert.strictEqual(rerunKey("a.feature", null, "My Scenario"), "a.feature::::My Scenario")
  })
})

describe("rerunKeysForPlan", () => {
  it("keys a Feature-level Scenario as `<uri>::::<title>` — empty ruleName component", () => {
    const feature = parse(
      `Feature: Checkout

  Scenario: Paying with a card
    Given I pay
`,
      "checkout.feature"
    )
    const collection = collectFeature(feature, Layer.empty, ({ Given }) => {
      Given("I pay", function*() {
        yield* Effect.void
      })
    })
    const keys = rerunKeysForPlan(collection.plan)
    const scenarioId = feature.scenarios[0]?.id
    assert.ok(scenarioId !== undefined)
    assert.strictEqual(keys.get(scenarioId), "checkout.feature::::Paying with a card")
  })

  it("keys a Rule-scoped Scenario with the RULE'S NAME, never its generator-produced id", () => {
    const feature = parse(
      `Feature: Billing

  Rule: Refunds must be approved
    Scenario: A refund under the limit
      Given a refund request
`,
      "billing.feature"
    )
    const collection = collectFeature(feature, Layer.empty, ({ Rule }) => {
      Rule("Refunds must be approved", ({ Given }) => {
        Given("a refund request", function*() {
          yield* Effect.void
        })
      })
    })
    const keys = rerunKeysForPlan(collection.plan)
    const rule = feature.rules[0]
    const scenario = rule?.scenarios[0]
    assert.ok(rule !== undefined && scenario !== undefined)
    // The key names the Rule's NAME ("Refunds must be approved"), not `rule.id` — a fresh
    // `IdGenerator.uuid()` value this test never even reads.
    assert.strictEqual(keys.get(scenario.id), "billing.feature::Refunds must be approved::A refund under the limit")
  })

  it("rough edge 2, directly: two Features sharing a Scenario title but a DIFFERENT uri produce DIFFERENT keys", () => {
    const source = `Feature: Calculator

  Scenario: Adds two numbers
    Given two numbers
`
    const featureA = parse(source, "calculator-a.feature")
    const featureB = parse(source, "calculator-b.feature")
    const collectionA = collectFeature(featureA, Layer.empty, ({ Given }) => {
      Given("two numbers", function*() {
        yield* Effect.void
      })
    })
    const collectionB = collectFeature(featureB, Layer.empty, ({ Given }) => {
      Given("two numbers", function*() {
        yield* Effect.void
      })
    })
    const keysA = rerunKeysForPlan(collectionA.plan)
    const keysB = rerunKeysForPlan(collectionB.plan)
    const scenarioIdA = featureA.scenarios[0]?.id
    const scenarioIdB = featureB.scenarios[0]?.id
    assert.ok(scenarioIdA !== undefined && scenarioIdB !== undefined)
    const keyA = keysA.get(scenarioIdA)
    const keyB = keysB.get(scenarioIdB)
    assert.ok(keyA !== undefined && keyB !== undefined)
    // Same Feature name, same Rule (none), same Scenario title — the ONLY thing that differs is
    // `uri`, which is exactly what rough edge 2 needed fixed: without `uri` as the first component,
    // these two keys would collide.
    assert.notStrictEqual(keyA, keyB)
    assert.strictEqual(keyA, "calculator-a.feature::::Adds two numbers")
    assert.strictEqual(keyB, "calculator-b.feature::::Adds two numbers")
  })

  it("Outline row disambiguation flows through unmodified from OutlineTitle.ts's buildScenarioTitles", () => {
    const feature = parse(
      `Feature: Discounts

  Scenario Outline: Applying a discount code
    Given a cart worth 35.00
    When I apply <code>
    Then the total is <expected>

    Examples:
      | code   | expected |
      | SAVE10 | 31.50    |
      | SAVE50 | 17.50    |
`,
      "discounts.feature"
    )
    const collection = collectFeature(feature, Layer.empty, ({ Given, Then, When }) => {
      Given("a cart worth 35.00", function*() {
        yield* Effect.void
      })
      When("I apply {word}", function*() {
        yield* Effect.void
      })
      Then("the total is {float}", function*() {
        yield* Effect.void
      })
    })
    const keys = rerunKeysForPlan(collection.plan)
    const [rowOne, rowTwo] = feature.allScenarios
    assert.ok(rowOne !== undefined && rowTwo !== undefined)
    const keyOne = keys.get(rowOne.id)
    const keyTwo = keys.get(rowTwo.id)
    // Every row shares one `astName` ("Applying a discount code"); the two keys below are only
    // distinct because `rerunKeysForPlan` reads OutlineTitle.ts's already-disambiguated EMITTED
    // title (`buildScenarioTitles`) rather than `astName` directly — the same title each row's own
    // `it.effect` node is registered under.
    assert.ok(keyOne !== undefined && keyTwo !== undefined)
    assert.notStrictEqual(keyOne, keyTwo)
    assert.ok(keyOne.startsWith("discounts.feature::::Applying a discount code"))
    assert.ok(keyTwo.startsWith("discounts.feature::::Applying a discount code"))
  })

  it(
    "INV-EC-009: parsing the SAME .feature source twice, through two SEPARATE loadFeature/parseFeature calls, produces IDENTICAL rerun keys",
    () => {
      const source = `Feature: Checkout

  Scenario: Paying with a card
    Given I pay
`
      // Two independent parses — a fresh IdGenerator.uuid() sequence each time, so
      // ScenarioKey.ts's own (ruleId, astName) key would differ across them. This is the direct
      // proof for INV-EC-009: the rerun key must NOT be built from anything that varies here.
      const firstParse = parse(source, "checkout.feature")
      const secondParse = parse(source, "checkout.feature")
      assert.notStrictEqual(
        firstParse.scenarios[0]?.id,
        secondParse.scenarios[0]?.id,
        "precondition: the two parses must actually produce different generator ids, or this test would prove nothing"
      )

      const firstCollection = collectFeature(firstParse, Layer.empty, ({ Given }) => {
        Given("I pay", function*() {
          yield* Effect.void
        })
      })
      const secondCollection = collectFeature(secondParse, Layer.empty, ({ Given }) => {
        Given("I pay", function*() {
          yield* Effect.void
        })
      })
      const firstKeys = rerunKeysForPlan(firstCollection.plan)
      const secondKeys = rerunKeysForPlan(secondCollection.plan)

      const firstScenarioId = firstParse.scenarios[0]?.id
      const secondScenarioId = secondParse.scenarios[0]?.id
      assert.ok(firstScenarioId !== undefined && secondScenarioId !== undefined)

      const firstKey = firstKeys.get(firstScenarioId)
      const secondKey = secondKeys.get(secondScenarioId)
      assert.ok(firstKey !== undefined)
      assert.strictEqual(firstKey, secondKey)
      assert.strictEqual(firstKey, "checkout.feature::::Paying with a card")
    }
  )
})

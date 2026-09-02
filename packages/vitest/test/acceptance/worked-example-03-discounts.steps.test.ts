/**
 * The third acceptance pair, and the densest composition this suite runs: a `Background` whose one step takes a
 * Gherkin data table, a `Rule` carrying its own extra Layer, a two-row `Scenario Outline`, and a simulated clock
 * advanced from inside a Rule-scoped Scenario.
 *
 * Carries: ADR-EC-006, ADR-EC-008, ADR-EC-009, ADR-EC-017, ADR-EC-024, BEH-EC-009, BEH-EC-010, BEH-EC-012, BEH-EC-016, BEH-EC-018, INV-EC-005, INV-EC-006, REQ-EC-004, REQ-EC-014, REQ-EC-015.
 */
import { type DataTable, decodeHashes } from "@effect-cucumber/gherkin"
import { assert } from "@effect/vitest"
import * as Clock from "effect/Clock"
import * as Context from "effect/Context"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Ref from "effect/Ref"
import * as Schema from "effect/Schema"
import * as TestClock from "effect/testing/TestClock"
import { fileURLToPath } from "node:url"
import { describeFeature } from "../../src/describeFeature.ts"
import { loadFeature } from "../../src/loadFeature.ts"

// The `.feature` file beside this one, resolved relative to this module rather than to `process.cwd()`, so the pair
// keeps working whichever directory the runner was invoked from.
const featurePath = fileURLToPath(new URL("./worked-example-03-discounts.feature", import.meta.url))

// Real bytes off disk, through the real parser, at module top level.
const feature = await loadFeature(featurePath)

// One row of the Background's table, exactly as the worked example declares it.
const CartRow = Schema.Struct({ item: Schema.String, price: Schema.NumberFromString })

// The worked example's own tagged error, field for field.
class DiscountError extends Schema.TaggedError<DiscountError>()("DiscountError", {
  message: Schema.String
}) {}

// Per-Scenario, Feature-wide: the cart's decoded subtotal plus the two cross-step scratch fields, from the worked
// example's own declaration.
class World extends Context.Service<World, {
  readonly subtotal: Ref.Ref<number>
  readonly total: Ref.Ref<number>
  readonly rejection: Ref.Ref<Option.Option<DiscountError>>
}>()("World") {
  static readonly layer = Layer.effect(
    this,
    Effect.gen(function*() {
      return World.of({
        subtotal: yield* Ref.make(0),
        total: yield* Ref.make(0),
        rejection: yield* Ref.make<Option.Option<DiscountError>>(Option.none())
      })
    })
  )
}

// The Rule-scoped extra Layer (BEH-EC-009, INV-EC-005): only Scenarios written inside `Rule("Percentage discounts
// expire at midnight", DiscountRegistry.layer, …)` can reach this service.
class DiscountRegistry extends Context.Service<DiscountRegistry, {
  readonly register: (code: string, percent: number, expiresIn: string) => Effect.Effect<void, Schema.SchemaError>
  readonly apply: (code: string, subtotal: number) => Effect.Effect<number, DiscountError>
}>()("DiscountRegistry") {
  static readonly layer = Layer.effect(
    this,
    Effect.gen(function*() {
      const codes = yield* Ref.make(new Map<string, { readonly percent: number; readonly expiresAt: number }>())
      return DiscountRegistry.of({
        register: (code, percent, expiresIn) =>
          Effect.gen(function*() {
            const now = yield* Clock.currentTimeMillis
            // Header translation 6: the expiry text arrives as a plain string and is decoded, never widened into the
            // template-literal input type `Duration.toMillis` asks for.
            const window = yield* Schema.decodeUnknownEffect(Schema.DurationFromString)(expiresIn)
            const expiresAt = now + Duration.toMillis(window)
            yield* Ref.update(codes, (held) => new Map(held).set(code, { percent, expiresAt }))
          }),
        apply: (code, subtotal) =>
          Effect.gen(function*() {
            const now = yield* Clock.currentTimeMillis
            const entry = (yield* Ref.get(codes)).get(code)
            if (entry === undefined) {
              return yield* Effect.fail(new DiscountError({ message: "code not found" }))
            }
            if (now > entry.expiresAt) {
              return yield* Effect.fail(new DiscountError({ message: "code expired" }))
            }
            return subtotal * (1 - entry.percent / 100)
          })
      })
    })
  )
}

// THE CALL UNDER TEST.
describeFeature(feature, World.layer, (dsl) => {
  // Destructured for the two CONTAINERS only.
  const { Background, Rule } = dsl

  Background(({ Given }) => {
    Given("the cart contains:", function*(table: DataTable) {
      // pattern's own arguments` and by `test/Plan.test.ts`'s step-argument-join suite, both of
      // which put an `{int}` beside the argument.
      const rows = yield* decodeHashes(CartRow)(table)
      yield* Ref.set((yield* World).subtotal, rows.reduce((sum, row) => sum + row.price, 0))
    })
  })

  // The `@REQ-EC-004` Scenario's only step, registered at FEATURE level.
  dsl.Then("the cart subtotal is {float}", function*(expected: number) {
    assert.strictEqual(yield* Ref.get((yield* World).subtotal), expected)
  })

  Rule("Percentage discounts expire at midnight", DiscountRegistry.layer, ({ Scenario }) => {
    Scenario("Applying a valid discount code", ({ Given, Then, When }) => {
      Given(
        "a discount code {string} worth {int}% expiring in {string}",
        function*(code: string, percent: number, expiresIn: string) {
          // `percent` arrives as a `number` and not as the string `"10"`: the `{int}` pattern coerced the Examples
          // cell on the way in, with no typed-example mechanism anywhere.
          yield* (yield* DiscountRegistry).register(code, percent, expiresIn)
        }
      )

      When("I apply the discount code {string}", function*(code: string) {
        const { subtotal, total } = yield* World
        yield* Ref.set(total, yield* (yield* DiscountRegistry).apply(code, yield* Ref.get(subtotal)))
      })

      Then("the total is {float}", function*(expected: number) {
        // Row 1 expects 31.50 and row 2 expects 17.50, each out of its OWN row's `expected` column.
        assert.strictEqual(yield* Ref.get((yield* World).total), expected)
      })
    })

    // ADR-EC-017's correction, and the reason this example was worth running rather than reading: the four step
    // definitions below are registered through the `Scenario` callback's OWN dsl parameter.
    Scenario("Expired discount codes are rejected", ({ Given, Then, When }) => {
      Given(
        "a discount code {string} worth {int}% expiring in {string}",
        function*(code: string, percent: number, expiresIn: string) {
          // The same pattern text as the Outline's, registered a second time in a different Scenario's scope.
          yield* (yield* DiscountRegistry).register(code, percent, expiresIn)
        }
      )

      When("{int} hours pass", function*(hours: number) {
        // The anchor for "two hours PAST the registration".
        assert.strictEqual(yield* Clock.currentTimeMillis, 0)
        yield* TestClock.adjust(`${hours} hours`)
      })

      When("I apply the discount code {string}", function*(code: string) {
        const { rejection, subtotal } = yield* World
        yield* (yield* DiscountRegistry).apply(code, yield* Ref.get(subtotal)).pipe(
          Effect.catchTag("DiscountError", (error) => Ref.set(rejection, Option.some(error)))
        )
      })

      Then("the discount is rejected with {string}", function*(message: string) {
        const rejection = yield* Ref.get((yield* World).rejection)
        // The message the REGISTRY produced, compared against the one the `.feature` file carries.
        assert.isTrue(Option.isSome(rejection), "no DiscountError was captured — the code was accepted")
        assert.strictEqual(Option.getOrThrow(rejection).message, message)
      })
    })
  })
})

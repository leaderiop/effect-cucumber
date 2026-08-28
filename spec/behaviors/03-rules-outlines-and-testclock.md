# 03 — Rules, Scenario Outlines, and `TestClock`

_Pre-implementation: `@effect-cucumber/vitest` doesn't exist yet (see
`spec/roadmap.md`). Code fences below describe the intended API — reference
material, not a compiled example._

---

## BEH-EC-009: A Rule can extend the ambient Layer

> **Invariant:** [INV-EC-005](../invariants.md#inv-ec-005-a-rule-scoped-layer-is-invisible-outside-that-rule)
> **See:** [ADR-EC-010](../decisions/010-rule-and-scenario-scoped-extra-layers.md)

```ts
export const Rule: <R2, E2>(
  name: string,
  extraLayer: Layer.Layer<R2, E2, any>,
  define: (dsl: RuleDsl<R | R2>) => void,
) => void
```

```
REQUIREMENT: A service contributed by extraLayer MUST be usable by a step
             defined inside this Rule's `define` callback. A step defined
             outside this Rule (at the Feature's top level, or inside a
             different Rule) that attempts to use that service MUST fail to
             compile.
```

## BEH-EC-010: Scenario Outline Examples are typed for free

> **See:** [ADR-EC-007](../decisions/007-cucumber-expressions-for-step-matching.md), [ADR-EC-014](../decisions/014-loadfeature-consumes-gherkindocument-and-pickles.md)

`<placeholder>` tokens in a Scenario Outline are substituted into the step
text by `@cucumber/gherkin`'s `compile()` step (correlated back to the
Scenario Outline's structure by `loadFeature`, per ADR-EC-014 — not by
`Parser.parse()` alone) before cucumber-expression matching happens, so by
the time a step function runs, a pattern like `{int}%` or `{float}` already
coerces the substituted example value — the same type-checking as any
regular step.

```
REQUIREMENT: A Scenario Outline row value referenced from inside a step's
             cucumber-expression pattern MUST be coerced to that pattern's
             declared type (e.g. {int}, {float}) with no separate decoding
             step required from the step author.
```

## BEH-EC-011: Cross-step state lives in World, never a closure

> **Invariant:** [INV-EC-006](../invariants.md#inv-ec-006-cross-step-scenario-data-survives-only-via-a-layer-provided-ref)
> **See:** [ADR-EC-009](../decisions/009-cross-step-state-lives-in-a-ref.md)

```
REQUIREMENT [OPERATIONAL]: A value computed by one step and consumed by a
             later step in the same Scenario SHOULD be stored in a Ref
             obtained from World, never a bare `let` in the enclosing
             Scenario/Rule/Background callback. Not automated yet (see
             INV-EC-006) — currently a reviewed convention, not a compiler or
             lint error.
```

## BEH-EC-012: `TestClock` composes transparently

> **See:** [ADR-EC-004](../decisions/004-one-it-effect-per-scenario.md)

```
REQUIREMENT: A step reading Clock.currentTimeMillis (or any Clock-derived
             value) inside a Scenario MUST observe @effect/vitest's simulated
             TestClock, starting at 0, with no test-specific code required in
             the service under test. A step MUST be able to advance it
             deterministically via TestClock.adjust.
```

### Worked example

```typescript
// Pre-implementation reference — not yet compiled against a real API.
import { describeFeature, loadFeature } from '@effect-cucumber/vitest'
import { Clock, Context, Duration, Effect, Layer, Option, Ref, Schema } from 'effect'
import { TestClock } from 'effect/testing'

const feature = loadFeature('./discounts.feature')
// discounts.feature:
//   Background:
//     Given the cart contains:
//       | item   | price |
//       | Widget | 10.00 |
//       | Gadget | 25.00 |
//   Rule: Percentage discounts expire at midnight
//     Scenario Outline: Applying a valid discount code
//       Given a discount code "<code>" worth <percent>% expiring in "1 hour"
//       When I apply the discount code "<code>"
//       Then the total is <expected>
//       Examples:
//         | code   | percent | expected |
//         | SAVE10 | 10      | 31.50    |
//         | SAVE50 | 50      | 17.50    |
//     Scenario: Expired discount codes are rejected
//       Given a discount code "OLD5" worth 5% expiring in "1 hour"
//       When 2 hours pass
//       And I apply the discount code "OLD5"
//       Then the discount is rejected with "code expired"

const CartRow = Schema.Struct({ item: Schema.String, price: Schema.NumberFromString })

class DiscountError extends Schema.TaggedError<DiscountError>()('DiscountError', {
  message: Schema.String,
}) {}

// Per-Scenario, Feature-wide: cart contents + cross-step scratch state (BEH-EC-011 — no bare `let`s)
class World extends Context.Service<World, {
  readonly subtotal: Ref.Ref<number>
  readonly total: Ref.Ref<number>
  readonly rejection: Ref.Ref<Option.Option<DiscountError>>
}>()('World') {
  static readonly layer = Layer.effect(this, Effect.gen(function* () {
    return World.of({
      subtotal: yield* Ref.make(0),
      total: yield* Ref.make(0),
      rejection: yield* Ref.make(Option.none()),
    })
  }))
}

// Rule-scoped extra Layer (BEH-EC-009) — only Scenarios inside "Percentage
// discounts expire at midnight" can `yield* DiscountRegistry`.
class DiscountRegistry extends Context.Service<DiscountRegistry, {
  readonly register: (code: string, percent: number, expiresIn: string) => Effect.Effect<void>
  readonly apply: (code: string, subtotal: number) => Effect.Effect<number, DiscountError>
}>()('DiscountRegistry') {
  static readonly layer = Layer.effect(this, Effect.gen(function* () {
    const codes = yield* Ref.make(new Map<string, { percent: number; expiresAt: number }>())
    return DiscountRegistry.of({
      register: (code, percent, expiresIn) => Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis
        const expiresAt = now + Duration.toMillis(Duration.decode(expiresIn))
        yield* Ref.update(codes, (m) => new Map(m).set(code, { percent, expiresAt }))
      }),
      apply: (code, subtotal) => Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis
        const entry = (yield* Ref.get(codes)).get(code)
        if (!entry) return yield* new DiscountError({ message: 'code not found' })
        if (now > entry.expiresAt) return yield* new DiscountError({ message: 'code expired' })
        return subtotal * (1 - entry.percent / 100)
      }),
    })
  }))
}

describeFeature(feature, World.layer, ({ Background, Rule }) => {
  Background(function* (table) {
    const rows = yield* Schema.decodeUnknown(Schema.Array(CartRow))(table.hashes())
    yield* Ref.set((yield* World).subtotal, rows.reduce((sum, r) => sum + r.price, 0))
  })

  Rule('Percentage discounts expire at midnight', DiscountRegistry.layer, ({ ScenarioOutline, Scenario }) => {
    ScenarioOutline('Applying a valid discount code', ({ Given, When, Then }) => {
      Given('a discount code {string} worth {int}% expiring in {string}',
        function* (code: string, percent: number, expiresIn: string) {
          yield* (yield* DiscountRegistry).register(code, percent, expiresIn)
        })

      When('I apply the discount code {string}', function* (code: string) {
        const subtotal = yield* Ref.get((yield* World).subtotal)
        const result = yield* (yield* DiscountRegistry).apply(code, subtotal)
        yield* Ref.set((yield* World).total, result)
      })

      Then('the total is {float}', function* (expected: number) {
        expect(yield* Ref.get((yield* World).total)).toBeCloseTo(expected)
      })
    })

    Scenario('Expired discount codes are rejected', () => {
      Given('a discount code {string} worth {int}% expiring in {string}',
        function* (code: string, percent: number, expiresIn: string) {
          yield* (yield* DiscountRegistry).register(code, percent, expiresIn)
        })

      When('{int} hours pass', function* (hours: number) {
        yield* TestClock.adjust(`${hours} hours`)
      })

      When('I apply the discount code {string}', function* (code: string) {
        const subtotal = yield* Ref.get((yield* World).subtotal)
        const outcome = yield* Effect.either((yield* DiscountRegistry).apply(code, subtotal))
        if (outcome._tag === 'Left') yield* Ref.set((yield* World).rejection, Option.some(outcome.left))
      })

      Then('the discount is rejected with {string}', function* (message: string) {
        const rejection = yield* Ref.get((yield* World).rejection)
        expect(Option.isSome(rejection) && rejection.value.message).toBe(message)
      })
    })
  })
})
```

Three things this exercises: `TestClock` composes transparently (`DiscountRegistry.apply`
has zero test-awareness); `DiscountRegistry` is a real Rule-scoped type
boundary; every value crossing steps lives in `World`'s Refs, so the two
Scenarios in the same Rule don't leak into each other despite sharing the
Rule's `DiscountRegistry.layer` merge point (each still gets a *fresh* `World`
per Scenario — the default per-Scenario scope from
[ADR-EC-006](../decisions/006-two-layer-scopes-only.md)).

---

_This is the last behavior file for now — see `spec/roadmap.md` for what's
planned next._

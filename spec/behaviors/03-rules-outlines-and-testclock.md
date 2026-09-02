# 03 — Rules, Scenario Outlines, and `TestClock`

_Pre-implementation: `@effect-cucumber/vitest` doesn't exist yet (see
`spec/roadmap.md`). Code fences below describe the intended API — reference
material, not a compiled example._

> **Correction (2026-08-29, Phase 8 implementation):** the header note above was written before
> `@effect-cucumber/vitest` had any source, and its first clause is no longer true — the package is
> real, and `Rule`, `Rule`-level `Background`, the `Scenario` extra-Layer form and Outline row
> titling all ship. It is kept rather than rewritten because it still correctly describes the status
> of the WORKED EXAMPLE below, which remains a `typescript`-tagged reference fence that no
> doc-examples check compiles (that gate is still unwired — `spec/process/definitions-of-done.md`).
> `spec/roadmap.md` remains the single authority on build status.
>
> BEH-EC-009 and BEH-EC-010 below were both checked against the shipped implementation during this
> phase and needed no correction. What was simply UNWRITTEN — the registration mechanics, the
> Rule/Feature hook ordering, Rule-level `Background`, and the exact Outline row title format — is
> now stated as BEH-EC-018 at the end of this file, following the same precedent BEH-EC-017 set for
> Phase 7's hook ordering.

---

## BEH-EC-009: A Rule can extend the ambient Layer

> **Invariant:** [INV-EC-005](../invariants.md#inv-ec-005-a-rule-scoped-layer-is-invisible-outside-that-rule)
> **See:** [ADR-EC-010](../decisions/010-rule-and-scenario-scoped-extra-layers.md)

```ts
export interface RuleRegistrar<R> {
  (name: string, define: (dsl: RuleDsl<R>) => void): void
  <R2, E2>(name: string, extraLayer: Layer.Layer<R2, E2, any>, define: (dsl: RuleDsl<R | R2>) => void): void
}
```

```
REQUIREMENT: A service contributed by extraLayer MUST be usable by a step
             defined inside this Rule's `define` callback. A step defined
             outside this Rule (at the Feature's top level, or inside a
             different Rule) that attempts to use that service MUST fail to
             compile.

             The extra Layer is OPTIONAL: Rule(name, define) declares a Rule
             whose Scenarios see the ambient Layer unchanged, exactly as the
             two-argument Scenario(name, define) form does. A Rule declared
             that way contributes no services of its own.
```

```
REQUIREMENT: A Rule(...) container registered under a name the Feature does
             not contain MUST produce one UnknownContainerWarning naming the
             file, the name written and the Rules the Feature does contain;
             its steps, Background and hooks are inert and the warning is the
             only signal. Scenarios registered inside such a Rule produce no
             warning of their own — the Rule's covers them. Asserted by
             packages/vitest/test/describeFeature.test.ts.
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
             step required from the step author — at run time by the
             cucumber-expression transform, and at compile time by
             StepParams<P> (BEH-EC-003), so the body's parameter is `number`
             without an annotation.
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

## BEH-EC-012: `TestClock` composes transparently, on both Layer scopes

> **See:** [ADR-EC-004](../decisions/004-one-it-effect-per-scenario.md), [ADR-EC-018](../decisions/018-shared-layer-testclock-isolation.md)

```
REQUIREMENT: A step reading Clock.currentTimeMillis (or any Clock-derived
             value) inside a Scenario MUST observe @effect/vitest's simulated
             TestClock, starting at 0, with no test-specific code required in
             the service under test. A step MUST be able to advance it
             deterministically via TestClock.adjust. This MUST hold
             identically whether the Feature uses the default per-Scenario
             Layer or an opt-in `shared` Layer (ADR-EC-006) — one Scenario's
             TestClock.adjust MUST NOT be observable by any other Scenario in
             either case.
```

### Worked example

The REQUIREMENT above is built and asserted on BOTH Layer scopes —
`packages/vitest/test/emission.test.ts` advances the clock by an hour in one Scenario of a
`shared`-Layer Feature and asserts the next three still start at 0, and
[`spec/traceability.md`](../traceability.md) §2's INV-EC-002 row, together with ADR-EC-018's own
implementation note, names every test and gate script that carries it.
The caveat below is about THIS EXAMPLE's imports and nothing else, and is narrowed to name exactly
what still does not resolve, so the `TestClock` guarantee it sits above is no longer hedged by
association.

```typescript
// Two lines below are still pre-implementation; everything else in this example corresponds to a
// real export and to behaviour that ships.
//   1. `expect` is used in two step bodies and imported nowhere.
//   2. The two `effect` imports are barrel imports; AGENTS.md §3 requires submodule namespace
//      imports, and `effect/testing` has no barrel at all — `TestClock` lives at
//      `effect/testing/TestClock`.
import { describeFeature, loadFeature } from "@effect-cucumber/vitest"
import { Clock, Context, Duration, Effect, Layer, Option, Ref, Schema } from "effect"
import { TestClock } from "effect/testing"

// @effect-cucumber/vitest's loadFeature (ADR-EC-024) returns a Promise, already wired to a
// shared NodeFileSystem.layer and defaulting ParameterTypeStore — distinct from
// @effect-cucumber/gherkin's own Effect-returning loadFeature (see BEH-EC-001).
const feature = await loadFeature("./discounts.feature")
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

class DiscountError extends Schema.TaggedError<DiscountError>()("DiscountError", {
  message: Schema.String
}) {}

// Per-Scenario, Feature-wide: cart contents + cross-step scratch state (BEH-EC-011 — no bare `let`s)
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
        rejection: yield* Ref.make(Option.none())
      })
    })
  )
}

// Rule-scoped extra Layer (BEH-EC-009) — only Scenarios inside "Percentage
// discounts expire at midnight" can `yield* DiscountRegistry`.
class DiscountRegistry extends Context.Service<DiscountRegistry, {
  readonly register: (code: string, percent: number, expiresIn: string) => Effect.Effect<void>
  readonly apply: (code: string, subtotal: number) => Effect.Effect<number, DiscountError>
}>()("DiscountRegistry") {
  static readonly layer = Layer.effect(
    this,
    Effect.gen(function*() {
      const codes = yield* Ref.make(new Map<string, { percent: number; expiresAt: number }>())
      return DiscountRegistry.of({
        register: (code, percent, expiresIn) =>
          Effect.gen(function*() {
            const now = yield* Clock.currentTimeMillis
            const expiresAt = now + Duration.toMillis(Duration.decode(expiresIn))
            yield* Ref.update(codes, (m) => new Map(m).set(code, { percent, expiresAt }))
          }),
        apply: (code, subtotal) =>
          Effect.gen(function*() {
            const now = yield* Clock.currentTimeMillis
            const entry = (yield* Ref.get(codes)).get(code)
            if (!entry) return yield* new DiscountError({ message: "code not found" })
            if (now > entry.expiresAt) return yield* new DiscountError({ message: "code expired" })
            return subtotal * (1 - entry.percent / 100)
          })
      })
    })
  )
}

describeFeature(feature, World.layer, ({ Background, Rule }) => {
  // Background is a step-definition container (ADR-EC-017) — the registered
  // Given pattern is matched against "the cart contains:" from
  // discounts.feature's literal Background text.
  Background(({ Given }) => {
    Given("the cart contains:", function*(table) {
      const rows = yield* Schema.decodeUnknown(Schema.Array(CartRow))(table.hashes())
      yield* Ref.set((yield* World).subtotal, rows.reduce((sum, r) => sum + r.price, 0))
    })
  })

  Rule("Percentage discounts expire at midnight", DiscountRegistry.layer, ({ ScenarioOutline, Scenario }) => {
    ScenarioOutline("Applying a valid discount code", ({ Given, When, Then }) => {
      Given(
        "a discount code {string} worth {int}% expiring in {string}",
        function*(code: string, percent: number, expiresIn: string) {
          yield* (yield* DiscountRegistry).register(code, percent, expiresIn)
        }
      )

      When("I apply the discount code {string}", function*(code: string) {
        const subtotal = yield* Ref.get((yield* World).subtotal)
        const result = yield* (yield* DiscountRegistry).apply(code, subtotal)
        yield* Ref.set((yield* World).total, result)
      })

      Then("the total is {float}", function*(expected: number) {
        expect(yield* Ref.get((yield* World).total)).toBeCloseTo(expected)
      })
    })

    // Scenario receives its own dsl object (ADR-EC-017) — this is the fix
    // for a real spec bug: an earlier version of this example called Given
    // here without it ever being in scope.
    Scenario("Expired discount codes are rejected", ({ Given, When, Then }) => {
      Given(
        "a discount code {string} worth {int}% expiring in {string}",
        function*(code: string, percent: number, expiresIn: string) {
          yield* (yield* DiscountRegistry).register(code, percent, expiresIn)
        }
      )

      When("{int} hours pass", function*(hours: number) {
        yield* TestClock.adjust(`${hours} hours`)
      })

      When("I apply the discount code {string}", function*(code: string) {
        const subtotal = yield* Ref.get((yield* World).subtotal)
        const outcome = yield* Effect.either((yield* DiscountRegistry).apply(code, subtotal))
        if (outcome._tag === "Left") yield* Ref.set((yield* World).rejection, Option.some(outcome.left))
      })

      Then("the discount is rejected with {string}", function*(message: string) {
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
Rule's `DiscountRegistry.layer` merge point (each still gets a _fresh_ `World`
per Scenario — the default per-Scenario scope from
[ADR-EC-006](../decisions/006-two-layer-scopes-only.md)).

## BEH-EC-018: Rule/Scenario registration, hook ordering, Rule `Background`, and Outline row titling

> **Invariant:** [INV-EC-005](../invariants.md#inv-ec-005-a-rule-scoped-layer-is-invisible-outside-that-rule)
> **See:** [ADR-EC-010](../decisions/010-rule-and-scenario-scoped-extra-layers.md), [ADR-EC-006](../decisions/006-two-layer-scopes-only.md), [ADR-EC-007](../decisions/007-cucumber-expressions-for-step-matching.md), [ADR-EC-017](../decisions/017-background-and-scenario-are-step-definition-containers.md), [BEH-EC-017](./07-hook-ordering-and-guarantees.md)

BEH-EC-009 states the Rule Layer's compile-time BOUNDARY and BEH-EC-010 states the Outline
COERCION guarantee. Neither states how a Rule or an extra-Layer Scenario is REGISTERED, what
happens when a Feature and a Rule both declare a hook of the same kind, where a `Rule:`-level
`Background:` block's steps are declared, or what an Outline row's emitted test title actually
reads. This section is the normative source for all four, and stands to BEH-EC-009/010 exactly as
BEH-EC-017 stands to BEH-EC-006.

```
REQUIREMENT: BOTH extra-Layer forms exist and share one mechanism, and
             BOTH containers also accept the two-argument (name, define)
             form, which merges nothing onto the ambient Layer.
             Rule(name, extraLayer, define) and
             Scenario(name, extraLayer, define) each MUST combine extraLayer
             with whatever Layer was ambient AT THAT CALL SITE via
             Layer.provideMerge(ambient)(extraLayer) — never Layer.merge.
             provideMerge, and only provideMerge, feeds the ambient Layer's
             output into extraLayer's own requirements, which is what lets an
             extra Layer DEPEND on ambient services rather than merely sit
             beside them (ADR-EC-010's "extraLayer can itself depend on
             ambient services").

             "Ambient at that call site" is literal and nests: a Scenario
             written inside a Rule merges onto that RULE's already-merged
             Layer, so all three tiers — Feature, Rule, Scenario — are
             reachable from one merged Layer inside that Scenario's steps.

             Both forms are ALWAYS per-Scenario scope, built fresh for every
             Scenario, on the same lifecycle as the Feature's default Layer.
             There is NO third "shared within a Rule" scope
             (ADR-EC-006, ADR-EC-010): a Rule's extra Layer is not built once
             per Rule and shared by its Scenarios. A resource needing that
             MUST be promoted to the Feature's `shared` Layer.

             Scenario's extra Layer is OPTIONAL — Scenario(name, define)
             stays valid and unchanged. Rule's is REQUIRED: a Rule with
             nothing to contribute passes Layer.empty.
```

```
REQUIREMENT: A hook declared inside a Rule applies to that Rule's Scenarios
             ONLY, and composes with the Feature's own hooks of the same kind
             in this order:

               Before-shaped kinds (Before, BeforeStep) run OUTER TO INNER:
                 every Feature-level hook of that kind first, then that
                 Rule's own.

               After-shaped kinds (After, AfterStep) run INNER TO OUTER:
                 that Rule's own first, then every Feature-level one.

             This mirrors the describe(feature) -> describe(rule) nesting the
             runner already emits: outer setup before inner setup, inner
             guarantee before outer guarantee. It is the same "outer wraps
             inner, and unwinds symmetrically" rule BEH-EC-017 already applies
             to Before/After around a single Scenario, applied one level up —
             at the Rule/Feature nesting instead of the hook/step nesting.

             Composition is ORDER ONLY. The merged result is ONE batch, and
             every guarantee BEH-EC-017 states about a batch — independence,
             combined causes, registration order within a kind, the Before
             gate, the After/AfterStep guarantee — holds over the merged
             array unchanged. A Rule's After hooks MUST NOT be given a second,
             separately-nested finalizer.

             A Scenario NOT inside any Rule runs the Feature's hooks alone.
```

```
REQUIREMENT: RuleDsl exposes exactly Given/When/Then/And/But, Background,
             Scenario, and exactly four hook registrars —
             Before, After, BeforeStep, AfterStep.

             It MUST NOT expose BeforeAllScenarios or AfterAllScenarios.
             ADR-EC-010's Rule-scopeable hook list is those four and no more,
             and "once per Feature" (BEH-EC-017) does not narrow to "once per
             Rule" without its own design pass. Those two remain Feature-only,
             they are never merged into a Rule's set, and reaching for either
             on a Rule's dsl MUST be a compile error.

             Rule's Background receives Given/And ONLY, the identical
             restriction ADR-EC-017 places on the Feature's own Background —
             the Gherkin grammar does not change one nesting level down. Its
             steps are step DEFINITIONS matched against that Rule's literal
             Background text, not steps run unconditionally.

             Rule-level and Feature-level registrations do not cross. A
             Rule-scoped registration MUST NOT resolve a step in a different
             Rule or in a Feature-level Scenario; a Feature-level Background
             registration MUST NOT resolve a Rule's Background step, and vice
             versa. Where a Scenario-, Rule- and Feature-level registration
             all match one step, the innermost wins.
```

```
REQUIREMENT: A Scenario Outline row's emitted test title is that row's own
             interpolated name, followed by a suffix naming EVERY Examples
             column and that row's value for it, in the Examples table's own
             left-to-right column order:

               `{interpolated name} ({col}={value}, {col}={value}, ...)`

             The suffix is UNCONDITIONAL. It is appended whether or not the
             Outline's title text already references a placeholder — the two
             concrete forms are:

               "Applying a valid discount code (code=SAVE10, percent=10, expected=31.50)"
                 — the Outline's title text contains no <placeholder> at all,
                   so every row's interpolated name is BYTE-IDENTICAL and the
                   suffix is the ONLY thing that distinguishes the rows.

               "adding 1 (count=1)"
                 — the Outline is titled "adding <count>", so the name is
                   already row-distinct, and the suffix is appended anyway.

             The suffix is ADDED TO the interpolated name, never substituted
             for it, and a plain (non-Outline) Scenario's title MUST come back
             byte-for-byte as written, with no parenthesised suffix.

             Making the suffix conditional on the title already being distinct
             is expressly rejected: a filterable title is one whose FORM is
             predictable, and one an author can `-t` against by grepping any
             column value directly.

             Two rows whose cells are byte-identical render the same suffix.
             The second and every later occurrence of a title within one
             Feature therefore gets ` #2`, ` #3`, ... appended, in document
             order; the first occurrence is left as written. Two emitted tests
             never share a title. Asserted by
             `packages/vitest/test/OutlineTitle.test.ts`.
```

```
REQUIREMENT: Two rows of one Outline share NO mutable state. Each emitted row
             is its own test, running its own Effect against its own Layer
             build, and observes only its own Examples values — never a later
             row's, and never the last row's for all of them. This is the
             regression class Pitfall 34 records (the loop-variable-capture
             bug a comparable library shipped), and it MUST be proven by a
             real running test PER ROW that asserts the value its own row
             carried, not by inspecting emitted titles alone.
```

---

_Next: [04 — loadFeature parse and validation](./04-loadfeature-parse-and-validation.md)_

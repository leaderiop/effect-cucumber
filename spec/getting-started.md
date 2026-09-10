# Getting started

This is the on-ramp: one complete worked example, the one idea that motivates the whole design, and a map
of where to read next. [`spec/overview.md`](./overview.md) and the 60 ADRs under [`spec/decisions/`](./decisions)
remain the normative record of _why_ each piece is the way it is — this page exists only to get a first-time
reader to the point of writing their own Scenario without reading all of that first.

If you haven't installed anything yet, see the root [`README.md`](../README.md#install) — this page assumes
`@effect-cucumber/vitest` (and its peers, `effect`/`@effect/platform-node`/`vitest`) are already installed.

## The one idea

A step is `(...params) => Effect<A, E, R>` — not a promise, not a callback taking a mutable `context` bag.
`describeFeature` takes a `Layer`, and that Layer is checked against every step's own `R` requirement **at compile
time**. Forget to provide a service a step needs, and TypeScript rejects the step definition itself — not a
runtime "service not found" discovered when the Scenario happens to run. That single guarantee is what
[`spec/overview.md`](./overview.md#design-philosophy) calls the mission, and it shapes almost everything else in
this specification.

## A complete example

A `.feature` file — plain Gherkin, nothing library-specific in it at all:

```gherkin
# checkout.feature
Feature: Checkout

  Scenario: A cart with one item checks out
    Given a cart with 1 item at $20
    When the customer checks out
    Then the order total is $20
```

The **World** — the typed state a Scenario's steps share, replacing the mutable `context` object other
Gherkin-on-vitest libraries thread through steps. It's a plain `Context.Service`:

```ts
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Ref from "effect/Ref"

class Cart extends Context.Service<Cart, { readonly total: Ref.Ref<number> }>()("Cart") {
  static readonly layer = Layer.effect(
    Cart,
    Effect.gen(function*() {
      return Cart.of({ total: yield* Ref.make(0) })
    })
  )
}
```

The step definitions — one `Given`/`When`/`Then` per line of Gherkin, each an `Effect` reading from `Cart`:

```ts
import { assert, describeFeature, loadFeature } from "@effect-cucumber/vitest"
import * as Effect from "effect/Effect"
import * as Ref from "effect/Ref"
import { fileURLToPath } from "node:url"

const feature = await loadFeature(fileURLToPath(new URL("./checkout.feature", import.meta.url)))

describeFeature(feature, Cart.layer, ({ Given, Then, When }) => {
  Given("a cart with {int} item at ${int}", function*(_count: number, price: number) {
    yield* Ref.set((yield* Cart).total, price)
  })

  When("the customer checks out", function*() {
    // nothing to do in this toy example — a real step might call a checkout service here
    yield* Effect.void
  })

  Then("the order total is ${int}", function*(expected: number) {
    assert.strictEqual(yield* Ref.get((yield* Cart).total), expected)
  })
})
```

Run it exactly like any other vitest test — `vitest run`, `vitest --watch`, `vitest run -t "checks out"`, all work
unmodified, because `describeFeature` compiles down to real `describe`/`it.effect` calls
([`spec/overview.md`](./overview.md#design-philosophy)).

## Now break it on purpose

Delete `Cart.layer` from the `describeFeature` call above — pass `Layer.empty` instead, or simply provide a Layer
for some _other_ service. The `Given`/`Then` steps above both do `yield* Cart`, and TypeScript now reports a
compile error at the `describeFeature` call itself: `Cart` is missing from the Layer's output. Nothing ran; nothing
needed to run. That's [INV-EC-003](./invariants.md#inv-ec-003-a-steps-effect-can-only-use-services-the-ambient-layer-provides)
— "a step's Effect can only use services the ambient Layer provides" — made visible, not just asserted.

## Where to read next

- **Writing more Scenarios** — [`packages/vitest/README.md`](../packages/vitest/README.md) is the full
  walkthrough: `Background`, `Rule`, `Scenario Outline`, tags, hooks, retries, attachments, and the JUnit
  reporter, each with a runnable example.
- **The vocabulary** — [`spec/glossary.md`](./glossary.md) defines every term (`World`, `Rule`, `Background`,
  `Layer` scoping) precisely, one heading each.
- **The contract for a specific behavior** — [`spec/behaviors/`](./behaviors) is organized by feature area
  (`01-steps-and-world.md`, `02-shared-layers-and-tags.md`, …), each a `REQUIREMENT:`-worded contract plus a
  worked example, not prose about intent.
- **Why a specific design choice was made** — [`spec/decisions/`](./decisions) (the ADRs) record the
  alternatives considered and the trade-off accepted, in the order they were made. Start from
  [ADR-EC-001](./decisions/001-steps-are-effects.md) if you want the origin story; jump to a specific one via
  [`spec/traceability.md`](./traceability.md) if you already know which decision you're curious about.
- **What's built versus only specified** — [`spec/roadmap.md`](./roadmap.md) is the single authority on build
  status; nothing else in this specification tracks that.

---

_Next: [Overview](./overview.md)_

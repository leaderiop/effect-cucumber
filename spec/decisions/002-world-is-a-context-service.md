# ADR-EC-002: World is a typed `Context.Service`, not `context: any`

> **Status:** Accepted
> **Date:** 2026-08-28

## Context

vitest-cucumber threads a `context: T` object through every step in a
Scenario, mutated by convention. Nothing stops a step from reading a field
before an earlier step has set it, and in practice `T` is usually `any` — the
type system offers no help distinguishing "world state a Scenario has
initialized" from "world state that doesn't exist yet."

## Decision

World is an ordinary Effect `Context.Service`, built by a `Layer` like any
other dependency:

```ts
class World extends Context.Service<World, {
  readonly apples: Ref.Ref<number>
}>()("World") {
  static readonly layer = Layer.effect(
    this,
    Effect.gen(function*() {
      return World.of({ apples: yield* Ref.make(0) })
    })
  )
}
```

Steps `yield* World` for typed, compiler-checked access instead of
destructuring an untyped bag. Because World is just a Layer, it composes with
real application services under test — a Scenario testing a checkout flow can
depend on both `World` and a real (or faked) `PaymentGateway` service in the
same ambient Layer.

## Consequences

**Positive**:

- No field of World can be read before it's declared in the service's type —
  the compiler enforces shape, not convention.
- World composes with real application services via ordinary Layer merging.
- A World's lifecycle (fresh per Scenario vs. shared) is just a Layer-scope
  choice — see [ADR-EC-006](006-two-layer-scopes-only.md) — not a separate
  mechanism from any other dependency.

**Negative**:

- More ceremony to declare a World than a plain object literal — a
  `Context.Service` class plus a `Layer.effect` builder for even a
  single-field World.
- Every field that needs to be read/written across steps must be a `Ref` (or
  similar mutable cell), not a plain property, since the World's _service
  object_ is fixed once built.

**Trade-off accepted**: the extra ceremony is a one-time cost per Feature file
(one World declaration), paid once to get compiler-checked cross-step state for
every Scenario in that file.

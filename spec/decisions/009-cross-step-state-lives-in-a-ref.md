# ADR-EC-009: Cross-step scenario state lives in a `Ref`, never a closure variable

> **Status:** Accepted
> **Date:** 2026-08-28

## Context

While stress-testing the design against a worked example (a discount-codes
Feature with a Rule and two Scenarios), it became apparent that a `let`
declared inside a `Scenario`/`Rule`/`Background` callback is dangerous:
`Scenario(name, () => { Given(...); ... })`'s callback runs exactly **once, at
registration time** — when `describeFeature`'s define callback executes,
before any `it.effect` body has run — not once per actual test execution. The
Given/When/Then function references captured in that closure are what the
generated `it.effect` body invokes, possibly more than once (retries,
`it.flakyTest`, a rerun in watch mode without a full module reload). A bare
`let` is therefore one shared variable across every execution of that
Scenario's `it.effect` — never reset between runs — which silently
reintroduces the exact cross-run state leakage [ADR-EC-002](002-world-is-a-context-service.md)'s
World was built to prevent.

## Decision

Any value one step computes and a later step consumes — a running total, a
caught error, a derived subtotal — must live in a `Ref` obtained from `World`
(or another Layer-provided service), never a `let` in the enclosing closure.

```ts
// Wrong: `total` is one shared variable across every retry of this Scenario.
Scenario('...', () => {
  let total = 0
  When('...', function* () { total = /* ... */ })
  Then('...', function* () { expect(total).toBe(/* ... */) })
})

// Right: `total` lives in a Ref from World, fresh per Scenario execution.
Scenario('...', () => {
  When('...', function* () {
    yield* Ref.set((yield* World).total, /* ... */)
  })
  Then('...', function* () {
    expect(yield* Ref.get((yield* World).total)).toBe(/* ... */)
  })
})
```

## Consequences

**Positive**:

- State genuinely resets between every execution of a Scenario's `it.effect`,
  including retries — the property `World`
  ([ADR-EC-002](002-world-is-a-context-service.md)) was introduced to
  guarantee actually holds in practice, not just for the "run once" case.

**Negative**:

- No automated enforcement exists yet (see
  [INV-EC-006](../invariants.md#inv-ec-006-cross-step-scenario-data-survives-only-via-a-layer-provided-ref)) —
  this is currently a documented convention a step author can still violate
  without a compiler or lint error.

**Trade-off accepted**: shipping the rule as documented convention now, rather
than delaying the whole design until a lint rule exists to enforce it,
is acceptable because the failure mode (state leaking across retries) is rare
in practice until a suite actually uses retries — but it's recorded here so
the eventual lint rule has a clear specification to implement against.

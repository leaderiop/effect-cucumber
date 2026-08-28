# ADR-EC-010: `Rule` and `Scenario` can extend the ambient Layer with an extra per-Scenario Layer

> **Status:** Accepted
> **Date:** 2026-08-28

## Context

[ADR-EC-003](003-describefeature-takes-a-layer.md) fixes one Layer for the
whole Feature. Stress-testing against a worked example (discount codes valid
only under one `Rule`) surfaced a real need: a service that should only be
available to Scenarios inside one `Rule`, not the whole Feature — and ideally
enforced as a real type boundary, not just an informal "don't use this
elsewhere" comment.

## Decision

`Rule` and `Scenario` accept an optional extra Layer:

```ts
Rule(name, extraLayer, (dsl) => { ... })     // extraLayer available only inside this Rule
Scenario(name, extraLayer, () => { ... })    // same, scoped to just this Scenario
```

`extraLayer` combines with whatever's already ambient via
`Layer.provideMerge(ambient)(extraLayer)`, so `extraLayer` can itself depend on
ambient services, and both remain available to steps afterward. This is always
per-Scenario scope — built fresh every Scenario, same lifecycle as the
Feature's default Layer. There is no third "shared within a Rule" scope (see
[ADR-EC-006](006-two-layer-scopes-only.md)); a resource needing that must be
promoted to the Feature's `shared` Layer.

Hooks (`Before`/`After`/`BeforeStep`/`AfterStep`) declared inside a `Rule`'s
dsl apply only to Scenarios within that Rule. Hooks declared at the Feature's
top-level dsl apply to every Scenario in the Feature, including ones nested
inside a Rule.

## Consequences

**Positive**:

- A Rule-scoped service is a real compile-time boundary — a step defined
  outside the Rule that tries to use it doesn't typecheck, verified directly
  in the discount-codes worked example.
- No new Layer-composition primitive was invented — `Layer.provideMerge` is an
  existing Effect combinator, reused rather than wrapped in new API surface.

**Negative**:

- No mechanism exists for a Layer shared across some-but-not-all Scenarios in
  a Rule; the only two granularities are "this one Scenario" and "the whole
  Feature."

**Trade-off accepted**: this is the same trade [ADR-EC-006](006-two-layer-scopes-only.md)
already made, extended consistently to Rule/Scenario scope rather than
introducing a special case just because the need surfaced one level lower in
the Gherkin hierarchy.

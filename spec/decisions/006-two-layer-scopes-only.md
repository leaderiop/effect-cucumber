# ADR-EC-006: Two Layer scopes only: per-Scenario default, per-Feature `shared` opt-in

> **Status:** Accepted
> **Date:** 2026-08-28

## Context

Some dependencies (an in-memory fake) should be rebuilt fresh for every
Scenario; others (a testcontainer, a real DB connection) are too expensive to
rebuild per Scenario and need to be shared across every Scenario in a Feature.
`@effect/vitest` already has both shapes — `it.effect` builds fresh per test,
`layer(...)` builds once and shares — so the question was whether to
reimplement equivalent bookkeeping or delegate to what already exists.

## Decision

Exactly two Layer scopes exist:

```ts
describeFeature(feature, {
  shared: Database.layer,      // built once, via @effect/vitest's `layer(...)`
  perScenario: World.layer,    // fresh per Scenario, merged with `shared`
}, define)
```

The `shared` case delegates directly to `@effect/vitest`'s own `layer(...)`
helper — `layer(SomeLayer)((it) => { it.effect(...) })` — rather than a
hand-rolled `beforeAll`/`Ref`/`afterAll` reimplementation. There is no third
scope (e.g. "shared within a Rule but not the whole Feature" — see
[ADR-EC-010](010-rule-and-scenario-scoped-extra-layers.md)).

## Consequences

**Positive**:

- `layer(...)`'s build-once memoization and correct teardown (via its own
  `Scope`) are inherited for free, rather than reimplemented and risking a
  subtly worse copy.
- The mental model stays small: "fresh every time" or "built once," nothing
  in between.

**Negative**:

- A `Background` running against a `shared` Layer can't assume the Layer is
  fresh — the step author must reset shared state themselves (e.g. `Database.clear`
  in Background), which the DSL cannot do on their behalf since it doesn't know
  what "reset" means for an arbitrary service.
- A resource that should be shared across only some Scenarios in a Feature
  (e.g. all Scenarios in one Rule, but not the whole Feature) has no direct
  scope — it must be promoted to the Feature-wide `shared` Layer instead.

**Trade-off accepted**: the missing third scope is deliberate, not an
oversight — adding "shared within a Rule" would require re-deriving `layer(...)`'s
build-once/teardown guarantees at a finer grain than `@effect/vitest` exposes
them, which isn't worth the complexity until a real use case demands it.

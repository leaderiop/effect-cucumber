# ADR-EC-003: `describeFeature` takes a Layer; step requirements are typechecked against it

> **Status:** Accepted
> **Date:** 2026-08-28

## Context

Given steps return `Effect<A, E, R>`, something has to supply `R` before a
step can run. Neither existing library (`@effect/vitest`, `@amiceli/vitest-cucumber`)
has a notion of "the set of dependencies every step in this Feature/Scenario is
allowed to assume" — `@effect/vitest`'s `it.effect`/`it.layer` operate per test,
not per Gherkin structure, and vitest-cucumber has no dependency-injection
concept at all.

## Decision

`describeFeature` takes a `Layer` as its second argument:

```ts
describeFeature(
  feature,          // from loadFeature(...)
  World.layer,       // Layer<World, E, never> — fresh per Scenario
  ({ Background, Scenario, Given, When, Then }) => { ... },
)
```

Every step defined inside that `describeFeature` call must have an `R` this
Layer (or a Rule/Scenario-level extension of it — see
[ADR-EC-010](010-rule-and-scenario-scoped-extra-layers.md)) can satisfy.

## Consequences

**Positive**:

- A step's dependency on a service the ambient Layer doesn't provide is a
  compile error at the step definition, not a runtime "service not found"
  discovered when the Scenario runs.
- The Feature's Layer is a single, greppable place to see everything a suite
  of Scenarios depends on.

**Negative**:

- Every Feature file needs at least one Layer declared, even for the simplest
  Scenario — there's no zero-configuration path.
- A step accidentally defined for the wrong Feature (copy-paste across files)
  fails loudly at compile time rather than being silently tolerated, which is
  a deliberate trade rather than a defect, but is a bigger change to existing
  habits than a drop-in migration would be.

**Trade-off accepted**: the up-front cost of declaring a Layer per Feature is
what buys compile-time dependency checking — the entire reason this library
exists over the two source libraries it's replacing.

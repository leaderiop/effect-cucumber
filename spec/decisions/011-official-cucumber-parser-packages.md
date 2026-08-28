# ADR-EC-011: Depend on official `@cucumber/gherkin` and `cucumber-expressions`

> **Status:** Accepted
> **Date:** 2026-08-28

## Context

Gherkin parsing and step-text matching are needed (see
[ADR-EC-007](007-cucumber-expressions-for-step-matching.md) for the matching
syntax decision itself). Two sources exist: the official, standalone Cucumber
packages (`@cucumber/gherkin`, `@cucumber/cucumber-expressions`), or reaching
into `@amiceli/vitest-cucumber`'s internals, which already bundle equivalent
parsing/matching but were never published as a stable public API of that
library.

## Decision

Depend directly on `@cucumber/gherkin` and `@cucumber/cucumber-expressions`.

## Consequences

**Positive**:

- Stable, officially maintained, public API — no risk of a non-public export
  changing shape out from under this library on a vitest-cucumber version
  bump.
- Decouples this library's release cadence from `@amiceli/vitest-cucumber`'s
  entirely — no dependency on that package at all.

**Negative**:

- More integration glue to write ourselves (`@effect-cucumber/gherkin`)
  instead of reusing vitest-cucumber's already-built adapter layer.

**Trade-off accepted**: the extra glue code is a one-time cost, paid to avoid
an ongoing maintenance risk (silent breakage from another library's internals)
for the entire lifetime of this project.

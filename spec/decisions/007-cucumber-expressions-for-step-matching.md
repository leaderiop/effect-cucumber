# ADR-EC-007: Step matching stays cucumber-expressions

> **Status:** Accepted
> **Date:** 2026-08-28

## Context

Step text needs to be matched against a pattern and have typed parameters
extracted (`{int}`, `{string}`, custom types via `defineParameterExpression`).
`@amiceli/vitest-cucumber` already implements this via cucumber-expressions
semantics. Reimplementing a bespoke matcher would be pure risk for no benefit
— this is a solved, standardized problem (see
[ADR-EC-011](011-official-cucumber-parser-packages.md) for the related
question of *which* package supplies it).

## Decision

Step patterns use the same `{int}`, `{string}`, `{word}`, custom-type syntax
as `@cucumber/cucumber-expressions` and `@amiceli/vitest-cucumber`. No new
pattern syntax is introduced.

## Consequences

**Positive**:

- Migrating an existing vitest-cucumber suite to this library is a rewrite of
  step *bodies* into Effects — not a rewrite of feature files or step
  patterns.
- `Scenario Outline`/`Examples` values substituted into step text are already
  coerced to the right type by the pattern itself (`{int}`, `{float}`) — no
  separate typed "example row" mechanism is needed for the common case (see
  [BEH-EC-010](../behaviors/03-rules-outlines-and-testclock.md)).

**Negative**:

- Any future step-matching feature this library might want (e.g. a
  richer type-safe pattern DSL) is constrained by staying compatible with
  cucumber-expressions syntax.

**Trade-off accepted**: syntax familiarity and migration cost savings outweigh
any theoretical gain from inventing a stricter, non-standard step-matching
syntax.

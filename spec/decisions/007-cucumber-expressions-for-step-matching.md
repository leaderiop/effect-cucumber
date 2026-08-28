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

---

> **Correction (2026-08-28, resolving [research ticket #3](https://github.com/leaderiop/effect-cucumber/issues/3)):**
> `defineParameterExpression` does not exist anywhere in
> `@cucumber/cucumber-expressions@20.1.0` — verified against the package's
> actual `.d.ts`/`.js` files and a real runtime match. The real API for a
> custom parameter type is two steps: construct a `ParameterType` (a class,
> `new ParameterType(name, regexps, type, transform, ...)`), then register it
> on a `ParameterTypeRegistry` instance via its `defineParameterType(parameterType)`
> **instance method** — not a standalone function taking bare
> name/regexp/transform arguments the way "`defineParameterExpression`"
> implied. Every consequence above still holds; only the named API was wrong.
>
> This also surfaced a gap the original decision didn't address: a
> `ParameterTypeRegistry` is a stateful, instance-scoped object — not global —
> and a `CucumberExpression` permanently binds to whichever registry instance
> it was constructed with. `@effect-cucumber/gherkin` must therefore own at
> least one registry's lifecycle explicitly (built once, with any custom
> types registered into it before the first `CucumberExpression` is compiled
> against it), rather than assuming a global/ambient registry the way the
> original decision's silence implied. The simplest approach consistent with
> this library's existing design — one registry per `loadFeature`
> call/process, custom types registered up front (mirroring
> `@amiceli/vitest-cucumber`'s own top-level `defineParameterExpression`
> call pattern) — is assumed sufficient until a real need for per-Rule or
> per-Scenario custom types appears; see `spec/roadmap.md` § Not yet specified.
>
> Full primary-source findings: [`research/cucumber-expressions-api.md`](https://github.com/leaderiop/effect-cucumber/blob/research/cucumber-expressions-api/research/cucumber-expressions-api.md)
> (branch `research/cucumber-expressions-api`, not merged to `main`).

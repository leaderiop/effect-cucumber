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
question of _which_ package supplies it).

## Decision

Step patterns use the same `{int}`, `{string}`, `{word}`, custom-type syntax
as `@cucumber/cucumber-expressions` and `@amiceli/vitest-cucumber`. No new
pattern syntax is introduced.

## Consequences

**Positive**:

- Migrating an existing vitest-cucumber suite to this library is a rewrite of
  step _bodies_ into Effects — not a rewrite of feature files or step
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

---

> **Correction (2026-08-28, GSD Pitfalls research):** the previous
> correction's proposed lifecycle — "one registry per `loadFeature`
> call/process, custom types registered up front" — is **internally
> self-contradictory** and cannot be implemented as written.
> `ParameterTypeRegistry`'s constructor pre-populates 11 built-in names, and
> `defineParameterType` **throws on any name collision**, including with
> those built-ins. "One registry per process" (a module-level singleton) means
> a second `loadFeature()` call's custom-type registration throws on the
> first call's names already being present. "One registry per `loadFeature`
> call" (fresh each time) means "registered up front" can only ever mean
> "re-registered on every single call" — which is fine functionally, but the
> original wording didn't say that, and a naive top-level
> `defineParameterExpression`-style call (run once, module-load time) would
> populate a registry that no longer exists by the time a _second_
> `loadFeature()` call needs one.
>
> The actual fix: custom parameter types are **data**, not a live registry.
> A call that "defines" a custom parameter type appends a plain
> `{ name, regexp, transform }` record to an array this library owns —
> nothing touches a `ParameterTypeRegistry` at definition time. Each
> `loadFeature()` call constructs a **fresh** `ParameterTypeRegistry`
> (safely re-acquiring the 11 built-ins with no risk of a duplicate-name
> throw, since nothing has been registered into _this_ instance yet) and
> **replays** every recorded custom-type record into it via `new
> ParameterType(...)` + `registry.defineParameterType(...)`. Definitions are
> permanent, ordinary data — safe to add at any point before any
> `loadFeature()` call runs, and correctly present in every subsequent call's
> fresh registry, with no cross-call state and no duplicate-registration risk
> ever surfacing.
>
> This is also the one place `Layer` genuinely earns its keep against the
> problem the rest of the Cucumber ecosystem has no answer for: the "list of
> pending custom-type records" is naturally exactly the kind of state a
> `Context.Service` + `Layer` already model well, if `@effect-cucumber/gherkin`
> chooses to expose custom-type registration as a Layer-provided service
> rather than an ambient global list — an implementation detail left open for
> Phase 2 of the roadmap, not decided here.

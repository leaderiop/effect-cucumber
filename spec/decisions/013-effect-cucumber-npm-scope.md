# ADR-EC-013: One package per module under the `@effect-cucumber` npm scope

> **Status:** Accepted
> **Date:** 2026-08-28

## Context

The library splits into a Gherkin-parsing module with no Effect-specific logic
and a vitest-integration module that depends on it (see `spec/overview.md` §
Packages). That split could be published as one package with subpath exports
(`effect-cucumber/gherkin`, `effect-cucumber/vitest`) or as separate packages
under a shared npm scope.

## Decision

A monorepo under the `@effect-cucumber` npm scope, one published package per
module: `@effect-cucumber/gherkin`, `@effect-cucumber/vitest`. Not a single
unscoped `effect-cucumber` package with subpath exports.

## Consequences

**Positive**:

- `@effect-cucumber/gherkin` is independently installable and testable with no
  Effect-specific logic in its dependency tree, useful even to something that
  isn't `@effect-cucumber/vitest`.
- Room to add further packages under the same scope later (e.g. a future
  reporter package) without renegotiating the naming scheme.

**Negative**:

- More release/versioning surface than a single package — two `package.json`s
  to keep in sync when a breaking change spans both.

**Trade-off accepted**: the versioning overhead of two packages is worth
`@effect-cucumber/gherkin`'s independent usefulness and testability, especially
since it has no Effect-specific logic and is the easier of the two to get
right in isolation (see `spec/roadmap.md`'s suggested build order).

---

> **Amendment (2026-08-28, following [ADR-EC-021](021-effect-and-platform-are-peer-dependencies-of-gherkin.md)):**
> the first Positive consequence above — "`@effect-cucumber/gherkin` is
> independently installable and testable with no Effect-specific logic in its
> dependency tree, useful even to something that isn't
> `@effect-cucumber/vitest`" — no longer holds as written. `gherkin` now takes
> `effect`/`@effect/platform` as peer dependencies and its internals become
> Effect-native; it has Effect-specific logic in its dependency tree.
>
> The package split itself is **not** superseded — `gherkin` and `vitest`
> remain separate packages. What changes is _why_ the split is worth keeping:
> this project serves Effect users exclusively (established during the
> ADR-EC-021 design session), so "useful to something that isn't
> `@effect-cucumber/vitest`" was never actually a goal being pursued — it now
> reads as "useful to any Effect program that isn't
> `@effect-cucumber/vitest`," which is a real but narrower value than
> originally stated. The split's second Positive consequence (room for future
> packages under the scope without renegotiating naming) and the parsing/
> runner concerns remaining logically separate are unaffected and continue to
> justify keeping two packages.

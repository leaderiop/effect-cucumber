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

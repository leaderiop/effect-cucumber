# ADR-EC-012: Target Effect v4 (beta)

> **Status:** Accepted
> **Date:** 2026-08-28

## Context

Effect has a stable v3 (`Context.Tag`, `effect/TestClock` re-exported through
`@effect/vitest`) and a beta v4 (`Context.Service`, `effect/testing`). Nearly
every current `@effect/vitest` user has v3 installed today; v4 is newer and
carries beta-stability risk.

## Decision

Target Effect v4 (beta) — `Context.Service`, `effect/testing`'s `TestClock`.
Pin an exact v4 beta version rather than a version range.

## Consequences

**Positive**:

- Building against the shapes Effect's own team is converging on, rather than
  the shapes v4 is migrating away from (`Context.Tag`/`Effect.Service` →
  `Context.Service`, per Effect's own v3-to-v4 migration guide).
- Avoids building a library today on APIs already documented as superseded.

**Negative**:

- Beta instability — a version bump can break this library's own build
  before v4 stabilizes, and adopters need to already be on v4 beta themselves
  to use this library at all, which shrinks the initial addressable audience
  relative to targeting stable v3.
- Every `@effect/vitest` API surface referenced in this spec (`it.effect`,
  `layer(...)`, `TestClock`) needs re-verifying against each v4 beta bump
  until it stabilizes.

**Trade-off accepted**: building against soon-to-be-legacy v3 shapes would
mean a migration to v4 shapes later, for every consumer of this library, at
exactly the moment Effect's own ecosystem is making the same move — betting on
v4 now avoids that churn, accepting beta-instability risk in its place.

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

---

> **Amendment (2026-08-28, following [ADR-EC-021](021-effect-and-platform-are-peer-dependencies-of-gherkin.md)):**
> this ADR's v4-only commitment originally governed `@effect-cucumber/vitest`
> alone, the only package that depended on `effect` at the time. ADR-EC-021
> extends `effect`/`@effect/platform` peer dependencies to
> `@effect-cucumber/gherkin` too, pinned to the same v4 range this ADR
> establishes — no separate version policy for `gherkin`. Every consequence
> and trade-off above now applies to both packages equally.

> **Amendment (2026-10-02, Effect v4 reached stable `4.0.0`):** "Pin an exact v4 beta version" no longer
> describes the repository. The `catalog:` block in `pnpm-workspace.yaml` now holds the npm **`rc`
> dist-tag** for `effect`, `@effect/platform-node` and `@effect/vitest` (devDependencies only), and
> `pnpm-lock.yaml` is what makes a given checkout reproducible. The `peer` catalog stays a range, floored
> at `^4.0.0-rc.116`, which admits any later rc and stable `4.0.0` alike (npm's `latest` tag is `4.0.0`
> for all three packages; the README install lines are untagged, asserted by P-17). The tag stops moving
> once Effect stops publishing rcs; at that point switch the dev catalog to `latest`. The canary workflow
> now runs `pnpm update` rather than rewriting pins, and `scripts/canary-bump-effect-rc.mjs` is removed.
> `@effect/vitest@4.0.0` also forwards vitest's test context as a second argument to
> `it.effect.each` callbacks (present from rc.117 or rc.118); `EffectVitestEach.test.ts` asserts it.

> **Amendment (2026-10-02, supersedes the previous amendment's `rc` choice):** with `4.0.0` stable there
> is no reason to follow the `rc` tag, which stops at `4.0.0-rc.118`. The `catalog:` block now holds the
> npm **`latest`** dist-tag for `effect`, `@effect/platform-node` and `@effect/vitest`, so the repository
> always tracks the newest stable release without a pin; `pnpm-lock.yaml` still makes a checkout
> reproducible. The `peer` catalog is `^4.0.0` (stable Effect v4 and any later 4.x). Both packages keep
> Effect as a **peer** dependency, which is correct for libraries: the consumer owns the one `effect`
> instance. Release candidates are no longer a supported range.

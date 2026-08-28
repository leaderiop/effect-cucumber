# ADR-EC-015: `effect` is a peer dependency of `@effect-cucumber/vitest`; `@effect-cucumber/gherkin` has no `effect` dependency at all

> **Status:** Superseded by [ADR-EC-021](021-effect-and-platform-are-peer-dependencies-of-gherkin.md) — `@effect-cucumber/gherkin`'s "no `effect` dependency at all" clause no longer holds; the peer-dependency mechanism for `@effect-cucumber/vitest` described below is unaffected and still applies.
> **Date:** 2026-08-28
> **Context:** resolves an open question from GSD Stack research and an independently-confirmed live defect from GSD Pitfalls research, both run against the scaffolded workspace from [ADR-EC-013](013-effect-cucumber-npm-scope.md)

## Context

The workspace scaffolded under ADR-EC-013 declared `effect` as a regular `dependency` in both packages. Two independent research passes flagged this as wrong, for different but compounding reasons:

- **Stack research**: every real Effect-ecosystem library checked (`@effect/vitest` itself, `@typeonce/effect-machine`, `effect-mq`) declares `effect` as a `peerDependency`, never a hard dependency. A hard dependency risks two copies of `effect` landing in a consumer's `node_modules` tree, which silently breaks `Context.Service`/`Context.Tag` identity checks — string TypeIds mean a duplicate copy can pass another copy's brand checks incorrectly rather than failing loudly. `@effect/tsgo`'s `duplicatePackage` diagnostic exists specifically to catch this class of bug.
- **Pitfalls research**: independently reproduced the same finding and named a near-twin community project (`@systemfsoftware/effect-gherkin-spec`) that shipped exactly this defect.
- **Stack research, separately**: flagged as an open question whether `@effect-cucumber/gherkin` needs `effect` as a dependency at all, given [ADR-EC-013](013-effect-cucumber-npm-scope.md)'s own stated rationale that this package has "no Effect-specific logic." Re-reading [BEH-EC-001](../behaviors/01-steps-and-world.md#beh-ec-001-loading-a-feature-file)'s actual signature — `loadFeature: (path: string) => ParsedFeature`, a plain synchronous function, not `Effect`-returning — confirms the package never touches the `effect` package at all.

## Decision

- `@effect-cucumber/gherkin` depends on `@cucumber/gherkin`, `@cucumber/messages` (see the [Related correction](#related-correction) below), and `@cucumber/cucumber-expressions` only. No `effect` dependency, matching its own "no Effect-specific logic" charter.
- `@effect-cucumber/vitest` moves `effect` and `@effect/vitest` from `dependencies` to `peerDependencies`, using a caret range anchored to the tested prerelease (`^4.0.0-rc.112`) rather than an exact pin — semver's prerelease-matching rules mean this range matches any later `4.0.0-rc.NNN` but not a different major/minor/patch line or a jump straight to stable `4.0.0`, which is the right conservative window while v4 is still a release candidate. `effect`/`@effect/vitest`/`vitest` remain exact-pinned in `devDependencies` for reproducible local development and testing.

## Consequences

**Positive**:

- No risk of a duplicate `effect` install silently breaking `Context.Service` identity for a consumer — the consumer's own single `effect` install satisfies the peer range.
- `@effect-cucumber/gherkin` genuinely has zero Effect-specific logic in its dependency tree, matching what ADR-EC-013 already claimed but the scaffold hadn't yet delivered.
- `@effect/tsgo`'s `duplicatePackage` diagnostic (wired in [ADR-EC-016](016-effect-tsgo-language-service-plugin.md)) now has nothing to catch in this repo's own manifests, since the risky pattern no longer exists here.

**Negative**:

- A peerDependency puts the burden on the consumer to have a compatible `effect`/`@effect/vitest` installed themselves — no "just works" zero-config install the way a hard dependency would give.
- The caret-on-a-prerelease range (`^4.0.0-rc.112`) needs to be revisited once `effect` v4 ships stable — this is a deliberately temporary window, not a permanent versioning strategy.

**Trade-off accepted**: the consumer-side burden of providing a compatible peer is the standard, correct cost of avoiding silent multi-instance bugs in a framework whose core guarantee (`Context.Service` identity, and by extension this library's own Layer-checking value proposition) depends on there being exactly one `effect` in the tree.

## Related correction

Fixing `@effect-cucumber/gherkin`'s dependency list also fixes a live defect Pitfalls research reproduced directly (`ERR_MODULE_NOT_FOUND`): `@cucumber/messages` — where `IdGenerator` and every message type (`Pickle`, `GherkinDocument`, ...) actually live — was only a transitive dependency of `@cucumber/gherkin`, never declared explicitly. pnpm's isolated `node_modules` layout doesn't let a package resolve a transitive dependency's exports, so this blocked `loadFeature`'s very first line. `@cucumber/messages` is now an explicit dependency of `@effect-cucumber/gherkin`.

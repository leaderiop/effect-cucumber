# ADR-EC-059: Vendor `@effect/vitest` and `@vitest/runner`'s tag-expression parser in-tree to upgrade to vitest 5 — `@effect-cucumber/vitest` now re-exports its own replacement instead of depending on either package

> **Status:** Accepted and implemented — `packages/vitest/src/{EffectVitest,EffectVitestInternal,EffectVitestTypes,VitestTagsFilter}.ts`, `packages/gherkin/test/support/EffectVitestIt.ts`, `pnpm-workspace.yaml`, both packages' manifests, both consumer-facing READMEs
> **Date:** 2026-09-10
> **Context:** requested directly — track vitest 5 rather than wait on an upstream `@effect/vitest` release with no committed date

## Context

`pnpm-workspace.yaml`'s catalog pinned `vitest: ^4.1.0` (peer: `>=4.1.0 <5.0.0`), with an explicit
comment: _"vitest 5 exists as a prerelease and is NOT supported — do not widen this."_ That comment
was accurate when written. By this ADR's date, `vitest@5.0.0` had shipped as npm's `latest`
dist-tag — no longer a prerelease — but the actual blocker the comment described still held, for
two independent reasons:

**Blocker 1 — `@effect/vitest`'s own peer range.** The pinned `@effect/vitest@4.0.0-rc.112` (this
repo's only source of `it.effect`, `layer(...)`, `assert`, `flakyTest`) declares
`peerDependencies.vitest: ">=4.1.0 <5.0.0"` — it explicitly forbids vitest 5. Checked directly
against a local `Effect-TS/effect` checkout: upstream's `main` branch HAD already migrated
`packages/vitest`'s own source to vitest 5 (commit `e9915d5d7a13c2abab99eea4603bfb945d6090b7`,
"Upgrade Vitest integrations to version 5") — the diff is tiny, an added optional `concurrent`
option on `layer(...)` plus a `package.json` peer-range bump from `>=4.1.0 <5.0.0` to
`>=5.0.0 <6.0.0` — but had not cut a release containing it. The npm registry's `rc` dist-tag for
`@effect/vitest` was still `4.0.0-rc.112`, last published 2026-08-25, unchanged since. (A version-
bump commit that WOULD have published it, `Version Packages (rc) (#7446)`, was itself reverted the
next day, `Revert "Version Packages (rc) (#7446)" (#8124)` — the vitest-5 source change stayed on
`main`; only its release got pulled back.)

**Blocker 2 — `@vitest/runner`'s tag-expression parser has no vitest-5 release at all.**
[ADR-EC-035](035-tag-expression-scoped-hooks-reuse-vitests-createtagsfilter.md) and
[ADR-EC-054](054-describefeature-tagexpression-option-reuses-vitests-createtagsfilter.md) both
depend on `createTagsFilter` from `@vitest/runner/utils` for this library's own boolean
tag-expression grammar. `@vitest/runner`'s `latest` npm dist-tag is still `4.1.11` — only
`5.0.0-beta.1` through `.4` exist past it, no `rc`, no stable release. Worse: vitest 5 folded the
tag-expression engine INTO the main `vitest` package internally and does not re-export it publicly
at all (verified absent from `vitest@5.0.0`'s own `dist/index.d.ts` export list). Depending on
`@vitest/runner@4.x` alongside `vitest@5.x` would run two independent, version-mismatched copies of
this engine against a shape neither line necessarily guarantees stays compatible.

Two paths were available: wait for `@effect/vitest` (and, separately, `@vitest/runner`) to publish
a real vitest-5 release with no committed date, or vendor the specific pieces this repository
actually uses. The user directed vendoring — "don't rely on `@effect/vitest@4.0.0-rc.112`, bring
the code from the main repository and keep your own version with vitest's latest version" — and,
once `@effect/vitest` was confirmed to also be a documented CONSUMER-facing peer dependency (this
repo's own READMEs told installers to `pnpm add @effect/vitest@rc` and import `assert`/`layer`
directly in their own test files, not merely an internal implementation detail), to vendor far
enough to also replace that consumer-facing install rather than leave it half-migrated.

## Decision

**`@effect-cucumber/vitest` vendors, maintains, and re-exports its own `@effect/vitest`-equivalent
surface from its own public barrel; neither `@effect/vitest` nor `@vitest/runner` remains a
dependency anywhere reachable from a published package. `vitest` itself moves to `^5.0.0`
(catalog) / `>=5.0.0 <6.0.0` (peer).**

### What was vendored, from where

- **`packages/vitest/src/EffectVitest.ts`** and **`EffectVitestInternal.ts`** — vendored from
  `Effect-TS/effect`'s `packages/vitest/src/{index,internal/internal}.ts` at commit
  `5a802043984727b0c5a291af39d1b9bbfa8d7b8b` (MIT, Copyright (c) 2023-present Effectful
  Technologies Inc.) — the exact already-migrated-to-vitest-5 source Blocker 1 describes.
  `EffectVitest.ts` is the new public surface, re-exported from `index.ts` (`export * from
  "./EffectVitest.ts"`) so `it`, `layer`, `assert`, `flakyTest`, `describeWrapped`,
  `addEqualityTesters`, `makeMethods`, the `Vitest` namespace type, and vitest's own passthrough
  (`describe`, `beforeAll`, `afterAll`, `expect`, `vi`, …) all come from `@effect-cucumber/vitest`
  directly. `VitestTestApi.ts` and `Testing.ts` — the two internal modules that used to import
  `@effect/vitest` — import from `./EffectVitest.ts` instead; their own behavior is unchanged,
  since it is the identical code.
- **`packages/vitest/src/VitestTagsFilter.ts`** — vendored from `@vitest/runner@4.1.11`'s own
  installed `dist/chunk-artifact.js` (the compiled source backing its published
  `dist/utils.js`'s `createTagsFilter`/`validateTags` exports; MIT, Vitest Team) — a small
  (~200-line), pure, dependency-free recursive-descent parser for the `and`/`or`/`not`/`&&`/`||`/
  `!`/parens/wildcard-`*` grammar, with no dependency on `@vitest/runner`'s own task types or
  `vitest`'s runtime. `TagExpression.ts` (and, through it, `HookTagExpression.ts` and
  `describeFeature.ts`'s own `tagExpression` option) imports it in place of
  `@vitest/runner/utils`.
- **`packages/gherkin/test/support/EffectVitestIt.ts`** — a SECOND, independently-trimmed vendor
  of the same upstream `internal/internal.ts`, for `@effect-cucumber/gherkin`'s own test suite.
  This package cannot depend on `@effect-cucumber/vitest` for `it.effect` (that package depends on
  `@effect-cucumber/gherkin`, not the reverse — a real dependency direction, not a style choice),
  and a private, unpublished internal package could not be a solution either: `@effect-cucumber/
  vitest`'s own copy MUST ship inside its published `dist/` (real consumers need it at runtime),
  and a package that never publishes to npm cannot be a real dependency of one that does. Trimmed
  to only what `packages/gherkin/test/` actually calls (`it(...)` bare and `it.effect(...)` —
  verified by grep at vendoring time: never `.live`, `.layer(...)`, `.flakyTest`, `.prop`), and it
  also re-exports `* from "vitest"` so `assert`/`describe`/`expect`/`vi` come from the SAME module
  specifier `it` does (see the Consequences section's oxlint note for why that matters).

### What was trimmed, and why

`prop` (Effect-aware property-based testing over `Schema`/`Arbitrary` inputs) is REMOVED from both
`EffectVitest.ts`/`EffectVitestInternal.ts` vendors, not merely left unexported. Upstream's `prop`
implementation imports `effect/unstable/arbitrary/Arbitrary` — a subpath this repo's pinned
`effect@4.0.0-rc.112` ([ADR-EC-012](012-effect-v4-beta.md)) does not export at all (verified: absent
from that exact version's `dist/unstable/` directory listing). `@effect-cucumber/vitest` never
surfaced `prop` to begin with, so nothing observable changes; keeping the import would have made
the whole module fail to resolve for a feature nothing here ever called. If this repo's own
`effect` pin ever moves to a version that exports that subpath AND a consumer asks for `prop`,
re-vendor it from upstream at that point rather than hand-rolling it.

### The acyclic-imports split

Upstream's `index.ts` and `internal/internal.ts` reference each other — the internal module needs
the public module's `Vitest` namespace TYPES to annotate its exports, and the public module needs
the internal module's VALUES. In one file (or upstream's own two, since TypeScript's module graph
doesn't care whether a `.d.ts`-only edge is a real cycle to the compiler), that's an ordinary
mutually-recursive type/value relationship. This repository's own `no-circular` dependency-cruiser
rule ([ADR-EC-050](050-dependency-cruiser-replaces-madge-and-adds-import-boundary-rules.md)) does
not carve out type-only edges, and flagged it as a real violation. Rather than weaken that rule for
one vendored pair, the `Vitest` namespace and `API` type moved to a third file,
**`EffectVitestTypes.ts`**: both `EffectVitest.ts` and `EffectVitestInternal.ts` import FROM it,
neither imports the other for types, and only `EffectVitest.ts` still imports
`EffectVitestInternal.ts` — for its values, one direction only. `packages/*/src` stays acyclic
(verified: `pnpm verify:package-boundaries` passes unmodified).

### Everywhere else touched

- `pnpm-workspace.yaml`: `@effect/vitest` and `@vitest/runner` removed from both the plain and
  `peer` catalogs (they resolved to nothing real anymore); `vitest` moves `^4.1.0` → `^5.0.0`
  (catalog) and `>=4.1.0 <5.0.0` → `>=5.0.0 <6.0.0` (peer); `@vitest/coverage-v8` follows to
  `^5.0.0` to keep a matching provider/runner pair; `@types/node` bumps `^20.0.0` → `^22.0.0` —
  `vitest@5.0.0` itself declares a peer of `@types/node: "^22.0.0 || >=24.0.0"` (types only; this
  repo's own runtime floor stays `"engines": { "node": ">=20" }` in every package.json).
- `packages/vitest/package.json` and `packages/gherkin/package.json`: `@effect/vitest` (and, for
  `packages/vitest`, `@vitest/runner`) dropped from every dependency field.
- `benchmarks/`: its four source files' `import { assert } from "@effect/vitest"` became
  `from "@effect-cucumber/vitest"` (it already depended on that package for `describeFeature`/
  `loadFeature`, so this removes a dependency rather than adding one); `@effect/vitest` dropped
  from its `package.json`, left decoupled from the shared `vitest` catalog bump only where its own
  manifest already used explicit non-catalog versions.
- Both consumer-facing READMEs (`README.md`, `packages/vitest/README.md`): the `pnpm add` line
  drops `@effect/vitest@rc`; `vitest` needs no `@rc` tag anymore (5.x is npm's `latest`); prose
  naming `@effect/vitest`'s mechanics (`layer(...)`, `flakyTest`, `assert.*`) now names
  `@effect-cucumber/vitest`'s own, since it is the same code under a different install.
- `scripts/verify-pack.sh`: the packed `@effect-cucumber/vitest` manifest's expected
  `peerDependencies` set drops `@effect/vitest`.
- `scripts/verify-pitfalls-checklist.sh` and `scripts/verify-watch-rerun.sh`: their own
  shell-heredoc-embedded probe test files' `import { assert } from "@effect/vitest"` updated to
  the local vendor path; P-17's README-install-line check flips from asserting `@effect/vitest@rc`
  IS present to asserting it is ABSENT (mirroring the check the gherkin README already had).
- `scripts/canary-bump-effect-rc.mjs`: `@effect/vitest` dropped from the package list this
  weekly canary bump script rewrites `pnpm-workspace.yaml` catalog entries for — there is no
  catalog entry left to rewrite.
- `spec/behaviors/11-scenario-seeding.md`: its one compiled `\`\`\`typescript`worked example
  (checked by`scripts/verify-doc-examples.sh`) updated its import to match the README changes.
- `spec/overview.md`: a new row under "### Not listed above" documents that `it`/`layer`/`assert`/
  etc. now forward from `EffectVitest.ts` via a bare `export * from "./EffectVitest.ts"` —
  deliberately placed OUTSIDE the `<!-- api-surface:exports -->` markers `scripts/
  verify-api-surface.sh` scans, since a bare `export *` (no `as Name`) is invisible to that
  script's regex-based barrel scan, and itemizing vitest's entire public surface by name would
  just duplicate vitest's own docs.

## Consequences

**Positive**:

- Tracks vitest 5 today, without a blocking dependency on an upstream release with no committed
  date. Verified against the REAL running framework, not merely type-checked: `pnpm test` (1103
  tests, 66 files, all passing), `pnpm verify:tags-filter`, `verify:shared-layer-once`,
  `verify:watch-rerun`, `verify:pitfalls`, `verify:concurrent-execution`, `verify:rerun-failed-only`,
  `verify:failure-panel`, `verify:attachments-panel` — every gate that exercises real vitest
  behavior end to end — pass unmodified in behavior, only in import source.
- Two fewer peer dependencies for every consumer: `@effect/vitest` and `@vitest/runner` are gone
  from the published `peerDependencies` entirely (`pnpm verify:pack` confirms the packed manifest).
  A consumer's own install line is one dependency shorter than before this ADR.
- `packages/*/src` stays acyclic (a real, enforced invariant this repo has held since
  ADR-EC-050) despite vendoring code whose own upstream shape is naturally two mutually-referencing
  files — the three-way split earns that back structurally rather than by exception.

**Negative**:

- This repository now owns re-syncing two vendored surfaces against upstream Vitest-ecosystem
  changes it previously got for free via `pnpm update`. Each vendored file's own header documents
  the exact commit vendored from and the re-sync procedure (re-diff against the same upstream path
  at whatever release eventually ships, reapply what changed).
- `packages/gherkin/test/support/EffectVitestIt.ts` is a genuine second copy of the same core
  `it.effect` logic `EffectVitestInternal.ts` carries — unavoidable given the dependency direction
  (gherkin cannot depend on vitest) and the publish constraint (a private package cannot be a real
  dependency of a published one), but a real duplication a future re-sync must remember to repeat.
- Oxlint's `vitest/no-standalone-expect` cannot trace a call to a custom-wrapped `it` re-exported
  from a DIFFERENT module specifier than `expect` — it flagged every `expect(...)` in five gherkin
  test files as unnested even though they plainly sat inside `it(...)`, once `it` and `expect` came
  from two different local files. The fix (documented in `EffectVitestIt.ts`'s own header) is
  importing everything a test file needs from the ONE module that re-exports `* from "vitest"`
  alongside the custom `it` — worth knowing before it surprises the next file added to either
  vendor's consumer set.

**Trade-off accepted**: maintaining two small, independently-vendored copies of upstream logic
until `@effect/vitest` (and, less urgently, `@vitest/runner`) publish a real vitest-5-compatible
release — at which point this ADR's own RE-SYNCING notes (in each vendored file's header) are the
procedure for reconsidering whether to drop the vendor copies and re-add the real dependencies.

## Note: ADR-EC-044 is superseded for `@effect/vitest`, not overturned

[ADR-EC-044](044-effect-vitest-is-a-devdependency-of-gherkins-own-test-suite.md) settled that
`@effect/vitest` could be a `devDependency` of `@effect-cucumber/gherkin`'s own test suite without
conflicting with ADR-EC-021's runner-independence boundary. That reasoning is not wrong — it is
just moot now that `@effect/vitest` is not a dependency of anything in this repository at all.
`packages/gherkin/package.json` no longer declares it; `packages/gherkin/test/support/
EffectVitestIt.ts` is gherkin's own vendored `it.effect`, not an import of the npm package. Kept as
historical record rather than deleted or rewritten, per this repository's own ADR convention.

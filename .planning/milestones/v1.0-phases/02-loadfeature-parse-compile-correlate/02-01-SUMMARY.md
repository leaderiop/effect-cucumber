---
phase: 02-loadfeature-parse-compile-correlate
plan: 01
subsystem: infra
tags: [pnpm, catalog, vitest, types-node, typescript, tsconfig, lockfile]

# Dependency graph
requires:
  - phase: 01-workspace-toolchain-and-dependency-policy
    provides: "pnpm-workspace.yaml default catalog (vitest ^4.1.0, @types/node ^26.4.0), tsconfig.base.json with types:[], check.yml --frozen-lockfile CI gate"
provides:
  - "packages/gherkin devDependencies block with catalog: references for vitest and @types/node"
  - "packages/gherkin tsconfig opting into node ambient types via types: [\"node\"]"
  - "pnpm-lock.yaml regenerated with @types/node@26.4.0 resolved"
  - "packages/gherkin test script (vitest run)"
affects: [02-02, 02-03, 02-10, any plan writing a node:fs consumer or a vitest test in packages/gherkin]

# Tech tracking
tech-stack:
  added: ["@types/node@26.4.0 (first install in repo)", "vitest catalog: devDependency in packages/gherkin"]
  patterns:
    - "Package manifests reference versions only via catalog:, never literal semver"
    - "Per-package tsconfig re-enables ambient types with an explicit types array, overriding tsconfig.base.json's types: []"

key-files:
  created: []
  modified:
    - packages/gherkin/package.json
    - packages/gherkin/tsconfig.json
    - pnpm-lock.yaml

key-decisions:
  - "Used default catalog: for both entries, not catalog:peer — catalog:peer holds ranges reserved for peerDependencies"
  - "tsconfig include left as [\"src\"]; test-file type-checking deferred to plan 02-10 because rootDir is ${configDir}/src"
  - "files: [\"src/**/*.ts\", \"dist\"] left untouched — it already excludes test/ from the tarball"

patterns-established:
  - "Ambient-types opt-in: tsconfig.base.json sets types: [] workspace-wide; a package that needs node globals adds compilerOptions.types: [\"node\"] locally"

requirements-completed: [PARSE-01, PARSE-02, PARSE-03]

# Metrics
duration: 6min
completed: 2026-08-28
---

# Phase 02 Plan 01: Gherkin devDependencies and node types Summary

**`packages/gherkin` now declares `vitest` and `@types/node` as `catalog:` devDependencies and opts into node ambient types, unblocking every `node:fs` consumer and vitest test in Phase 2.**

## Performance

- **Duration:** ~6 min
- **Completed:** 2026-08-28T11:36:40Z
- **Tasks:** 2 (1 blocking checkpoint, 1 auto)
- **Files modified:** 3

## Accomplishments

- Closed both blocking Wave 0 gaps from `02-VALIDATION.md` / `02-RESEARCH.md` Pitfall P2: `packages/gherkin` had no `devDependencies` block at all, and `@types/node` was installed nowhere in the repo.
- Added a `devDependencies` block with exactly two `catalog:` entries — no literal semver enters the package manifest, preserving `pnpm-workspace.yaml` as the single version bump point (ADR-EC-012).
- Added `compilerOptions.types: ["node"]` to the package tsconfig, overriding the workspace-wide `"types": []` that otherwise suppresses `@types/node` even once installed.
- Regenerated and committed `pnpm-lock.yaml` in the same commit as the manifest change, so the `--frozen-lockfile` gate in all four `check.yml` jobs passes.
- Added `"test": "vitest run"` to `scripts`, matching `packages/vitest/package.json`.

## Task Commits

1. **Task 1: Package legitimacy gate for the two new devDependencies** — no commit (blocking human-verify checkpoint, no file changes). Developer explicitly approved `vitest` (slopcheck `[SUS]`, adjudicated a false positive in `02-RESEARCH.md`) and `@types/node` (types-only, DefinitelyTyped).
2. **Task 2: Add vitest and @types/node as catalog devDependencies, opt into node ambient types** — `8ba83f0` (chore)

## Files Created/Modified

- `packages/gherkin/package.json` — added `devDependencies` (`vitest: catalog:`, `@types/node: catalog:`) and a `test` script. `exports`, `publishConfig`, `files`, `dependencies`, and `engines` untouched.
- `packages/gherkin/tsconfig.json` — added `compilerOptions.types: ["node"]`. `extends` and `include: ["src"]` unchanged.
- `pnpm-lock.yaml` — regenerated; adds `@types/node@26.4.0` and re-keys the `vite`/`vitest` peer-resolution entries to include it.

## Decisions Made

- **Default `catalog:` over `catalog:peer`.** The `peer` catalog holds ranges intended for `peerDependencies` (e.g. `vitest: ">=4.1.0 <5.0.0"`); dev pins belong in the default catalog. The two are not interchangeable.
- **`include` left as `["src"]`.** Widening it to cover `test` would place files outside `rootDir: ${configDir}/src` and break the build. Test-file type-checking gets its own config in plan 02-10, as the plan specifies.
- **Lockfile peer re-keying accepted as expected.** Installing `@types/node` changed the resolution keys for `vite`/`vitest` (which declare `@types/node` as an optional peer), e.g. `vitest@4.1.11(vite@8.2.2)` became `vitest@4.1.11(@types/node@26.4.0)(vite@8.2.2(@types/node@26.4.0))`. This is normal pnpm peer-suffix behavior, not dependency drift — confirmed by `--frozen-lockfile` exiting 0 against the committed lockfile.

## Deviations from Plan

None — plan executed exactly as written.

## Verification Performed

All acceptance criteria in the plan were checked:

- `pnpm install --frozen-lockfile` exits 0 ("Lockfile is up to date, resolution step is skipped") — proves the lockfile was regenerated and committed consistently with the manifest.
- `@types/node/package.json` and `vitest/package.json` both resolve from `packages/gherkin/package.json` via `createRequire` — printed `resolved`.
- **`node:fs` probe compiled.** A disposable `packages/gherkin/src/__node_probe.ts` importing `node:fs` built cleanly under `pnpm build`.
- **Negative control run.** Temporarily setting `types: []` reproduced exactly the failure the plan predicted:
  `packages/gherkin/src/__node_probe.ts(1,21): error TS2591: Cannot find name 'node:fs'.`
  This confirms the `types: ["node"]` change is load-bearing rather than incidentally passing. The tsconfig was restored immediately and is committed in its intended form.
- Probe source and its four `dist/__node_probe.*` build artifacts removed; `packages/gherkin/src/` contains only `index.ts`, and `pnpm build` exits 0 on the clean tree.
- `grep -n 'catalog:' packages/gherkin/package.json` returns exactly two matches (lines 53–54), both inside `devDependencies`, neither `catalog:peer`.
- No literal semver string for `vitest` or `@types/node` appears in the manifest.
- `pnpm lint` (`oxlint -f unix && dprint check`) exits 0.
- Post-commit deletion check: no tracked files deleted. Working tree clean, no untracked files left behind.

## Issues Encountered

None blocking. One pre-existing, out-of-scope warning surfaced during install and was deliberately not acted on (scope boundary): `madge 8.0.0` declares `unmet peer typescript@^5.4.4: found 7.0.2`. This predates this plan, is unrelated to the two packages added here, and affects only the `circular` script.

## Threat Model Compliance

- **T-02-SC (Tampering — package install):** mitigated. The blocking human-verify gate ran before any install and was explicitly approved by the developer. Neither package declares a `postinstall` script; zero new runtime dependencies were added.
- **T-02-05 (Tampering — lockfile):** mitigated. Lockfile regenerated and committed in the same commit (`8ba83f0`) as the manifest edits.
- **T-02-06 (Elevation — version pinning bypass):** mitigated. Both entries use `catalog:`; verified no literal version string appears in the manifest.

## Known Stubs

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- `packages/gherkin` can now host both a `node:fs` consumer (`Source.ts` in the plans that follow) and vitest test files. Wave 1 is unblocked for the downstream Phase 2 plans.
- **Carry-forward for plan 02-10:** `packages/gherkin/tsconfig.json` still has `include: ["src"]`, so files under `test/` are not yet type-checked by `pnpm build`. A separate test tsconfig is required, as the plan anticipated.
- `files: ["src/**/*.ts", "dist"]` already excludes `test/`, so the `.feature` fixtures arriving in plan 02-03 stay out of the published tarball with no manifest change needed.

## Self-Check: PASSED

- `packages/gherkin/package.json` — modified, present, committed.
- `packages/gherkin/tsconfig.json` — modified, present, committed.
- `pnpm-lock.yaml` — regenerated, present, committed.
- Commit `8ba83f0` — found in `git log`.
- `.planning/phases/02-loadfeature-parse-compile-correlate/02-01-SUMMARY.md` — present on disk.
- Working tree clean; no untracked or uncommitted files remain.

---
*Phase: 02-loadfeature-parse-compile-correlate*
*Completed: 2026-08-28*

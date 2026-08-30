---
phase: 01-workspace-toolchain-and-dependency-policy
verified: 2026-08-28T07:00:00Z
status: passed
score: 4/4 must-haves verified
overrides_applied: 0
---

# Phase 1: Workspace, Toolchain, and Dependency Policy — Verification Report

**Phase Goal:** The two-package workspace builds, lints, formats, and type-checks under the Effect v4 convention — and the `@effect/tsgo` Layer diagnostics are a real build gate, not advice.
**Verified:** 2026-08-28T07:00:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Method

All build/lint/test/pack/gate commands were executed directly against the working tree (Node v22.22.0, pnpm 10.26.1) after deleting `packages/*/dist` and all `*.tsbuildinfo` files, so the results below reflect a genuine cold-cache run, not SUMMARY.md narration.

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `tsc -b` compiles both packages clean from a cold cache, emitting `.d.ts` + declaration maps, with cross-package project references resolving | ✓ VERIFIED | `rm -rf packages/*/dist *.tsbuildinfo && pnpm build` → exit 0. Both `packages/gherkin/dist/` and `packages/vitest/dist/` contain `index.js`, `index.d.ts`, `index.d.ts.map`, `index.js.map`. `packages/vitest/src/index.ts` imports `@effect-cucumber/gherkin` by package name (not a relative path) and consumes its exported type; `packages/vitest/tsconfig.json` declares `"references": [{ "path": "../gherkin" }]`. `index.d.ts.map` contains a real `sourceRoot`/`sources` mapping back to `../src/index.ts`, not an empty stub map. |
| 2 | A probe file with a deliberate `missingLayerContext`/`missingEffectContext` diagnostic makes the tsgo gate exit non-zero — proving ADR-EC-016's gate is enforced, not advisory | ✓ VERIFIED | `pnpm verify:tsgo-gate` → exit 0, printing: positive control (`satisfied.ts`) compiles clean; `floating-effect.ts` is valid plain TypeScript (no non-`TS377xxx` diagnostics) yet still fails only on `effect(floatingEffect)`; that failure alone flips the exit code non-zero, proving `ignoreEffectErrorsInTscExitCode: false` is load-bearing and not just cosmetic; `missing-layer-context.ts` fails compilation by name with `effect(missingLayerContext)`. Per the roadmap's own documented design-choice note, the gate fixture (`packages/vitest/test/tsgo-gate/`) is excluded from the main solution graph — confirmed: root `tsconfig.json`'s `references` array only lists `packages/gherkin` and `packages/vitest`, and `pnpm build` (assertion above) exits 0 despite the negative fixtures existing on disk. |
| 3 | `oxlint` (incl. vendored `@effect/oxc` rules) and `dprint --check` both run clean over the repo, and CI runs build+lint+format+test on Node 22 and 24 | ✓ VERIFIED | `pnpm lint` (`oxlint -f unix && dprint check`) → exit 0. `pnpm verify:oxlint-plugin` → exit 0, proving the vendored `tools/oxlint/effect/` plugin is actually loaded (not decoratively configured): a namespace import (`import * as Effect from "effect/Effect"`) lints clean, a barrel import (`import { Effect } from "effect"`) fails with `effect(no-import-from-barrel-package)`. `git status tools/` shows a clean tree (tracked, not untracked). The vendored rules' own test suite passes: `npx vitest run tools/oxlint/effect/test` → 3 files, 40 tests passed (same 40 tests that `pnpm test` runs at the repo level). `.github/workflows/check.yml` has 4 jobs (`lint`, `types`, `test`, `package`) all installing with `--frozen-lockfile`; `test` is matrixed over `node-version: [22, 24]` with `fail-fast: false`; `concurrency.cancel-in-progress: true` cancels superseded runs. `types` job runs `pnpm build` then `pnpm verify:tsgo-gate`. See note below on Node-matrix scope. |
| 4 | `pnpm pack` yields an ESM-only tarball with `publishConfig.exports` applied, an `effect` peer *range* (not the catalog's exact rc pin), and a README install line carrying `@rc` explicitly | ✓ VERIFIED | `pnpm verify:pack` → exit 0 for both packages: `publishConfig.exports["."]` → `./dist/index.js` applied over the dev-time `exports["."]` → `./src/index.ts`; no `main`/`types`/`typings` field; no `require` condition; no leftover `catalog:`/`workspace:` protocol string in any packed dependency field; no `.cjs` output in either tarball; `peerDependencies.effect = "^4.0.0-rc.112"` and `peerDependencies["@effect/vitest"] = "^4.0.0-rc.112"` in the packed `@effect-cucumber/vitest` tarball — a range, distinct from the devDependency catalog's exact `4.0.0-rc.112` pin (`pnpm-workspace.yaml` defines separate `catalog` (exact) and `catalogs.peer` (range) entries). `publint` reports "All good!" for both packages. Root `README.md` and `packages/vitest/README.md` both contain `pnpm add -D @effect-cucumber/vitest effect@rc @effect/vitest@rc vitest` with an explicit `@rc` callout; `packages/gherkin/README.md` (no `effect` dependency, confirmed by its `package.json` having no `effect` key) installs with `pnpm add @effect-cucumber/gherkin` and names neither `effect` nor `@effect/vitest`. |

**Score:** 4/4 truths verified

**Note on truth 3 (Node matrix scope):** The roadmap wording "CI runs build + lint + format + test on Node 22 and 24" is satisfied at the level of "CI, as a whole, covers both runtimes" rather than every individual job being matrixed. In the actual `check.yml`, only the `test` job is matrixed over `[22, 24]`; `lint`, `types` (which runs `pnpm build`), and `package` run on Node 24 only. This is a deliberate, documented choice in `01-06-SUMMARY.md` ("Node 24 is the primary target and the runtime for lint/types/package; 22 is carried in the test matrix only... A testing library gets installed into whatever runtime the consumer already has, so runtime breadth matters for tests specifically.") — lint/type-check output does not vary by Node runtime the way test execution can, so matrixing only the `test` job is a reasonable engineering interpretation of the intent, not a scope reduction. This verifier independently re-ran `build`, `lint`, `verify:tsgo-gate`, `verify:oxlint-plugin`, and `test` locally on Node v22.22.0 and all passed, corroborating that the non-matrixed jobs are not Node-version-sensitive in this codebase today. Not treated as a gap.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `tsconfig.base.json` | Effect v4 base compiler options + tsgo diagnostic plugin | ✓ VERIFIED | Contains `@effect/language-service` plugin block with `ignoreEffectErrorsInTscExitCode: false`, `ignoreEffectWarningsInTscExitCode: false`; `composite: true`, `declaration: true`, `declarationMap: true`. |
| `packages/gherkin/src/index.ts` | Placeholder entry point emitting declarations | ✓ VERIFIED | Exports `packageName`/`PackageName`; explicitly documented as a Phase-2 placeholder, not a stub masquerading as real behavior — matches plan 01-01's literal intent. |
| `packages/vitest/src/index.ts` | Placeholder entry point consuming gherkin package | ✓ VERIFIED | Imports `* as Gherkin from "@effect-cucumber/gherkin"`, re-exports a value typed from it — exercises the project reference at build time. |
| `scripts/verify-tsgo-gate.sh` | Executable proof the tsgo gate is enforced | ✓ VERIFIED | Ran directly; 4 assertions all pass with real exit-code discrimination (not grep-only). |
| `scripts/verify-oxlint-plugin.sh` | Executable proof the vendored oxlint plugin is loaded | ✓ VERIFIED | Ran directly; positive + negative probe both correct. |
| `scripts/verify-pack.sh` | Packed-tarball shape assertions | ✓ VERIFIED | Ran directly; all assertions pass for both packages, including `publint`. |
| `.oxlintrc.json` | oxlint config + vendored Effect plugin wiring | ✓ VERIFIED | `jsPlugins: [{ name: "effect", specifier: "./tools/oxlint/effect/index.ts" }]`; `no-import-from-barrel-package` set to error. |
| `dprint.json` | Effect's formatting config, ASI | ✓ VERIFIED | `"semiColons": "asi"` present; `dprint check` passes. |
| `tools/oxlint/effect/**` | Vendored Effect oxlint rules, tracked in git | ✓ VERIFIED | `git status tools/` clean (tracked); 3 test files, 40 passing tests. |
| `pnpm-workspace.yaml` | Two-catalog policy (pin vs. peer range) | ✓ VERIFIED | Default `catalog:` holds exact `4.0.0-rc.112` pins; `catalogs.peer` holds `^4.0.0-rc.112` ranges. |
| `packages/gherkin/package.json` | Publishable ESM-only, no `effect` dependency | ✓ VERIFIED | No `effect` key anywhere; `publishConfig.exports` present; no `main`/`types`. |
| `packages/vitest/package.json` | Publishable ESM-only, ranged peers | ✓ VERIFIED | `peerDependencies` use `catalog:peer`; `devDependencies` use `catalog:`; `publishConfig.exports` present. |
| `.github/workflows/check.yml` | Merge gate: lint, types, test matrix, package | ✓ VERIFIED | 4 jobs, all `--frozen-lockfile`, `test` matrixed `[22, 24]`, `concurrency.cancel-in-progress: true`. |
| `.github/workflows/snapshot.yml` | pkg-pr-new preview releases | ✓ VERIFIED | Present; explicitly documented as never a required check, using default `GITHUB_TOKEN` + OIDC. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `packages/vitest/src/index.ts` | `packages/gherkin/src/index.ts` | package-name import through project reference | ✓ WIRED | `import * as Gherkin from "@effect-cucumber/gherkin"`; type flows through (`Gherkin.PackageName`); resolves via `tsconfig.json` references, not a relative path. |
| `packages/vitest/tsconfig.json` | `packages/gherkin/tsconfig.json` | `references` entry | ✓ WIRED | `"references": [{ "path": "../gherkin" }]` present and functional (build succeeds, `.d.ts.map` sources resolve correctly). |
| `scripts/verify-tsgo-gate.sh` | `packages/vitest/test/tsgo-gate/tsconfig.json` | direct `tsc -p` invocation | ✓ WIRED | Script invokes `$TSC -p "$NEG_CONFIG"` etc. against the repo-local patched compiler; ran and confirmed non-zero exits where expected. |
| `package.json` | `scripts/verify-tsgo-gate.sh` | `verify:tsgo-gate` script | ✓ WIRED | `"verify:tsgo-gate": "bash scripts/verify-tsgo-gate.sh"`; ran via `pnpm verify:tsgo-gate`, exit 0. |
| `.oxlintrc.json` | `tools/oxlint/effect/index.ts` | `jsPlugins` specifier `name: "effect"` | ✓ WIRED | Confirmed live (not decorative) via `verify:oxlint-plugin`'s barrel-import probe reporting `effect(no-import-from-barrel-package)`. |
| `.github/workflows/check.yml` (`types` job) | `scripts/verify-tsgo-gate.sh` | `pnpm verify:tsgo-gate` step | ✓ WIRED | Step present after `pnpm build` in the `types` job. |
| `.github/workflows/check.yml` (`lint` job) | `scripts/verify-oxlint-plugin.sh` | `pnpm verify:oxlint-plugin` step | ✓ WIRED | Step present after `pnpm lint` in the `lint` job. |
| `.github/workflows/check.yml` (`package` job) | `scripts/verify-pack.sh` | `pnpm verify:pack` step | ✓ WIRED | Step present, plus `pnpm circular` and `pnpm verify:spec`. |
| `packages/vitest/package.json` | `pnpm-workspace.yaml` `catalogs.peer` | `catalog:peer` entries | ✓ WIRED | `peerDependencies.effect = "catalog:peer"`; expands to `^4.0.0-rc.112` in the packed tarball (verified above). |
| `packages/vitest/package.json` | `packages/gherkin` | `workspace:^` protocol dependency | ✓ WIRED | Build succeeds cross-package; `pnpm circular` reports no cycles (intra-package coverage; cross-package cycle protection documented as covered by `tsc -b`'s own project-reference cycle rejection — see `deferred-items.md`). |

### Behavioral Spot-Checks / Command Re-Execution

All commands below were executed directly by the verifier against the working tree, not sourced from SUMMARY.md narration.

| Command | Result | Status |
|---------|--------|--------|
| `pnpm build` (cold cache: dist + tsbuildinfo deleted first) | exit 0, all 8 expected output files present | ✓ PASS |
| `pnpm verify:tsgo-gate` | exit 0, all 4 assertions pass, "tsgo gate: ENFORCED" | ✓ PASS |
| `pnpm verify:oxlint-plugin` | exit 0, "oxlint effect plugin: ENFORCED" | ✓ PASS |
| `pnpm lint` (`oxlint -f unix && dprint check`) | exit 0 | ✓ PASS |
| `pnpm format:check` (`dprint check`) | exit 0 | ✓ PASS |
| `pnpm test` (`vitest run`) | exit 0, 3 files / 40 tests passed | ✓ PASS |
| `pnpm circular` (`madge --circular`) | exit 0, "No circular dependency found!" | ✓ PASS |
| `pnpm verify:pack` | exit 0, all manifest-shape + publint assertions pass for both packages | ✓ PASS |

### Requirements Coverage

Phase 1 is an enabling/infrastructure phase. `.planning/REQUIREMENTS.md` explicitly states: "Phase 1 (Workspace, toolchain, dependency policy) carries no v1 requirement." No plan in this phase declares a `requirements:` frontmatter field. No orphaned requirements found.

### Anti-Patterns Found

None. Scanned all files touched across the phase's commits (`packages/`, `scripts/`, `.github/`, `tools/`, `tsconfig.base.json`, `.oxlintrc.json`, `dprint.json`, `pnpm-workspace.yaml`, `package.json`) for `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER`/"not yet implemented"/"coming soon" markers. Zero unreferenced debt markers found. The two occurrences of the word "Placeholder" (`packages/gherkin/src/index.ts`, `packages/vitest/src/index.ts`) are documented, intentional entry-point stubs that this phase's own plan (01-01) explicitly scopes as "Placeholder entry point" — Phase 1's goal is the toolchain, not package behavior, and these two files exist solely to give `tsc -b` something to compile and cross-reference. Not classified as a stub anti-pattern.

### Deferred Items (recorded in `deferred-items.md`, not gaps)

- No `LICENSE` file in either package's tarball — recorded, non-blocking, no publish happens in this milestone.
- `workspace:^` packs as `^0.0.0` (an exact match at version 0.0.0) — recorded, expected, will widen naturally once versions leave `0.0.0`.
- `madge` cannot follow cross-package `exports`-map imports, so `pnpm circular` covers intra-package cycles only; cross-package cycle protection is covered by `tsc -b`'s own project-reference cycle rejection. Recorded as a known tool limitation, not a phase gap — the architectural intent (gherkin is a one-way leaf dependency) is enforced by the build itself.

### Human Verification Required

None. Every observable truth for this phase is a deterministic build/lint/test/pack command with an exit code, and all were re-executed directly by this verifier rather than trusted from SUMMARY.md. The one manual, human-owned setup step (installing the pkg-pr-new GitHub App per `01-06-PLAN.md`'s `user_setup` block) is explicitly documented as non-blocking for CI and out of scope for the phase's success criteria (the snapshot workflow is intentionally excluded from required merge checks).

### Gaps Summary

No gaps. All 4 ROADMAP success criteria are independently verified against a freshly re-run cold-cache build and all six verification/gate scripts, not against SUMMARY.md claims. The tsgo-gate and oxlint-plugin scripts in particular are well-designed to resist the "advisory, not enforced" failure mode this phase exists to prevent — each proves enforcement via exit-code discrimination on a file that is valid outside the Effect-specific diagnostic, not by grepping output text (which would be identical whether or not the gate actually fails the build).

---

_Verified: 2026-08-28T07:00:00Z_
_Verifier: Claude (gsd-verifier)_

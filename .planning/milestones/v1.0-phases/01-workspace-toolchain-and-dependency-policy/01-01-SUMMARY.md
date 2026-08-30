---
phase: 01-workspace-toolchain-and-dependency-policy
plan: 01
subsystem: build-toolchain
tags: [typescript, tsconfig, composite-build, project-references, effect-v4]

requires: []
provides:
  - "compiling two-package composite workspace (`tsc -b` exits 0 cold)"
  - "Effect v4 convention tsconfig.base.json"
  - "declaration + declaration-map emit in both packages"
  - "placeholder public entry points for both packages"
affects:
  - "01-02 (tsgo Layer diagnostics gate — depends on the unchanged plugin block)"
  - "01-03/01-04/01-05 (lint/format/pack/CI — all need a compiling workspace)"
  - "02 (gherkin package source replaces the placeholder entry point)"
  - "05 (vitest package source replaces the placeholder entry point)"

tech-stack:
  added: []
  patterns:
    - "`${configDir}`-relative rootDir/outDir in the shared base config — package tsconfigs carry no path duplication"
    - "composite project references for cross-package resolution; imports go by package name, never relative path"
    - "`verbatimModuleSyntax` + `erasableSyntaxOnly` (no enums, no parameter properties, no namespaces)"

key-files:
  created:
    - packages/gherkin/src/index.ts
    - packages/vitest/src/index.ts
  modified:
    - tsconfig.base.json
    - packages/gherkin/tsconfig.json
    - packages/vitest/tsconfig.json

decisions:
  - "Kept the `@effect/language-service` plugin block byte-for-byte, including both `ignoreEffect*InTscExitCode: false` — deliberately diverging from STACK.md §5.3, which suggests `ignoreEffectWarningsInTscExitCode: true`. Plan 01-02 depends on Effect warnings failing the build."
  - "Did not add `\"types\": [\"node\"]` to `packages/vitest`. `types: []` is inherited from the base; the vitest package opts in when it actually needs Node globals (Phase 5), not speculatively."

duration: ~5m
completed: 2026-08-28
---

# Phase 01 Plan 01: TypeScript Build Foundation Summary

`tsc -b` now compiles both packages clean from a cold cache, emitting declarations and declaration maps, with `@effect-cucumber/vitest` resolving `@effect-cucumber/gherkin` through a composite project reference.

## What Was Built

The workspace did not build at all before this plan — two independent hard failures, both confirmed by running the repo's own compiler:

- `packages/gherkin/tsconfig.json(3,3): error TS5108: Option 'esModuleInterop=false' has been removed.` TypeScript 7 removed the option outright; it is not defaulted, it is gone. Its presence in `tsconfig.base.json` made every build exit 2 before compiling a single file.
- `error TS18003: No inputs were found` in both projects — neither package had a `src/` directory.

Both are fixed. `tsconfig.base.json` was also brought up to the Effect v4 convention per `.planning/research/STACK.md` §5.3.

**`tsconfig.base.json` changes:**

- Removed `esModuleInterop: false` (the blocking bug).
- Replaced `isolatedModules: true` with `verbatimModuleSyntax: true`, which supersedes it.
- Added `outDir: "${configDir}/dist"`, `rootDir: "${configDir}/src"`, `incremental`, `moduleDetection: "force"`, `rewriteRelativeImportExtensions`, `erasableSyntaxOnly`, `noUnusedLocals`, `noUnusedParameters`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, `types: []`.
- Left the `plugins` block untouched.

**Package tsconfigs** shrank to `extends` + `include` (+ `references` for vitest), since `${configDir}` now supplies the paths from the base.

**Entry points** are honest placeholders — no library logic (that is Phase 2 and Phase 5), but real exported values so declaration emit is observable and the cross-package reference is actually exercised rather than merely declared.

## Key Implementation Details

`${configDir}` expands per-package, not per-base-file. This was the plan's one flagged risk (with a documented fallback to explicit per-package `rootDir`/`outDir`), and **the fallback was not needed**. Two independent confirmations:

1. TypeScript's auto-`exclude` for the gherkin project resolved to `/packages/gherkin/dist`, not the repo root.
2. After a cold build, `dist/` exists in each package and there is no `dist/` at the repo root.

`packages/vitest/dist/index.d.ts` emits `export declare const gherkinPackageName: Gherkin.PackageName;` with `import * as Gherkin from "@effect-cucumber/gherkin"` at the top — the type came across the package boundary intact rather than being widened to `any`, which is the actual proof the reference resolved. The cold build (both `dist/` trees and both `.tsbuildinfo` files deleted) succeeding also proves build *ordering* came from the `references` entry: without it, vitest would have compiled before gherkin's `dist/index.d.ts` existed.

The `namespaceImportPackages` setting includes `@effect-cucumber/*`, so the workspace's own packages are held to the same submodule-namespace import rule AGENTS.md §3 mandates for `effect` — the vitest entry point uses `import * as Gherkin` accordingly.

## Deviations from Plan

None. The plan executed exactly as written, including its instruction to preserve the plugin block against STACK.md's own suggestion.

## Verification

| Check | Result |
|-------|--------|
| Cold `tsc -b` (dist + tsbuildinfo deleted) | `EXIT=0`, no diagnostics |
| Warm `tsc -b` | `EXIT=0` |
| `grep -c esModuleInterop tsconfig.base.json` | `0` |
| `grep -c diagnosticSeverity tsconfig.base.json` | `0` |
| `grep -c '"ignoreEffectErrorsInTscExitCode": false'` | `1` |
| `TS5108` in build output | absent |
| gherkin `dist/index.{js,js.map,d.ts,d.ts.map}` | all 4 present |
| vitest `dist/index.{js,js.map,d.ts,d.ts.map}` | all 4 present |
| `@effect-cucumber/gherkin` in vitest `index.d.ts` | present (CROSS-REF OK) |
| stray `dist/` at repo root | none |

Phase 1 success criterion 1 is met.

## Next Phase Readiness

**Ready.** Every downstream plan in this phase (lint, format, pack, CI) has the compiling workspace it needs.

Notes for whoever picks up next:

- **Plan 01-02 must not relax the plugin block.** Both `ignoreEffectWarningsInTscExitCode` and `ignoreEffectErrorsInTscExitCode` are `false`, which is what makes `missingLayerContext` (TS377034) and `floatingEffect` (TS377001) fail the build. That is the gate 01-02 exists to prove.
- **`types: []` is inherited by both packages.** `packages/vitest` will need `"types": ["node"]` (and whatever `@effect/vitest` requires) when real test infrastructure lands in Phase 5. It does not need it yet.
- **`erasableSyntaxOnly` and `verbatimModuleSyntax` are now on workspace-wide.** No enums, no parameter properties, no `namespace` blocks, and type-only imports must be marked `import type` or inline `type`. This constrains all Phase 2+ source.
- **Both entry points are placeholders and say so in their doc comments.** Phase 2 replaces the gherkin one with `loadFeature`/`ParsedFeature`; Phase 5 replaces the vitest one with the `Feature`/`Scenario`/`Step` surface. Neither `packageName` export is public API worth preserving.
- **`tools/` remains untracked** — the vendored Effect oxlint rules from `01-CONTEXT.md`. Out of this plan's scope; plan 01-03 (or whichever plan owns lint) commits it.

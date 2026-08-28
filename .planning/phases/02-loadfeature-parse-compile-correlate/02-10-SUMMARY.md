---
phase: 02-loadfeature-parse-compile-correlate
plan: 10
subsystem: build-gates
tags: [ci, gate, tsconfig, parse-01, adr-ec-015, decision-d7]

requires:
  - packages/gherkin/src (plans 02-02 .. 02-09)
  - packages/gherkin/test/feature-raw.d.ts (plan 02-09)
  - .github/workflows/check.yml (plan 01-06)
provides:
  - pnpm verify:no-runner-dep — structural PARSE-01 / ADR-EC-015 gate
  - pnpm typecheck:test — type-checks packages/gherkin/test/**
  - packages/gherkin/tsconfig.test.json — non-emitting test-only config
affects:
  - .github/workflows/check.yml (types job, package job)
  - root package.json scripts

tech-stack:
  added: []
  patterns:
    - "gate script: METHOD NOTE header, positive control, then the load-bearing assertion"
    - "manifest assertions parse JSON with node -e, never grep"
    - "check-but-do-not-emit tsconfig run explicitly, outside tsc -b"

key-files:
  created:
    - scripts/verify-no-runner-dep.sh
    - packages/gherkin/tsconfig.test.json
  modified:
    - package.json
    - .github/workflows/check.yml
    - packages/gherkin/test/upstream-pin.test.ts

decisions:
  - "D7 closed: yes, wire test-file type-checking — as a root script AND a check.yml step"
  - "The manifest assertion is scoped to dependencies + peerDependencies only; devDependencies.vitest is legitimate and excluded by design"
  - "tsconfig.test.json includes src as well as test, so tests check against real source rather than emitted declarations"
  - "moduleDetection is overridden to auto so test/feature-raw.d.ts stays an ambient declaration rather than a module augmentation"

metrics:
  duration: ~25 min
  completed: 2026-08-28
---

# Phase 02 Plan 10: Structural PARSE-01 Gate and Test-File Type-Checking Summary

Two Phase 2 conventions became mechanical gates: a mutation-tested script proving
`@effect-cucumber/gherkin` cannot reach a test runner or Effect, and a non-emitting tsconfig that
type-checks `packages/gherkin/test/**` — both wired as root scripts and CI steps.

## What Was Built

**`scripts/verify-no-runner-dep.sh`** (179 lines) — PARSE-01's structural proof. Three assertions:

1. **Positive control** — at least one file under `packages/gherkin/src/` must import
   `@cucumber/gherkin`. Found 3. Without this, a moved or renamed source tree would make
   assertions 2 and 3 pass by scanning nothing.
2. **Source side** — no file under `packages/gherkin/src/` may import `vitest`,
   `@effect/vitest`, or `effect`. Matches only real import specifiers (the quoted module string
   in a `from` / `import` / `require` position), with comment lines stripped *before* any
   occurrence is counted. The comment filter is load-bearing: `src/Errors.ts` cites ADR-EC-015 and
   names `effect` in prose, so a raw text scan would make documenting the rule violate it.
   The `effect` alternative matches exactly or as an `effect/...` submodule, so
   `@effect-cucumber/gherkin` and `@cucumber/gherkin` are not false hits.
3. **Manifest side** — `dependencies` and `peerDependencies` may not name any of the three.
   Parsed with `node -e` + `JSON.parse`, never grep, because grep cannot tell which dependency
   field a key sits in — the exact distinction the assertion turns on.

**`packages/gherkin/tsconfig.test.json`** — closes Decision D7. Extends `tsconfig.base.json` with
`composite`/`declaration`/`declarationMap`/`incremental` off, `noEmit: true`,
`rootDir: "${configDir}"`, `types: ["node"]`, and `moduleDetection: "auto"`.
`include: ["src", "test"]`. Not in the root `tsconfig.json` `references` array — run explicitly by
`pnpm typecheck:test`, never by `tsc -b`, matching how `packages/vitest/test/tsgo-gate/tsconfig.json`
is used. No fallback exclusion was needed: the `./fixtures/<name>.feature?raw` specifier resolved
against `test/feature-raw.d.ts` on the first attempt.

**Wiring** — `verify:no-runner-dep` and `typecheck:test` added to the root `package.json`;
`pnpm typecheck:test` added to the `types` job (after `pnpm build`, before `pnpm verify:tsgo-gate`)
and `pnpm verify:no-runner-dep` added to the `package` job, each preceded by a comment stating what
a green run fails to prove. No inline commands were introduced, `snapshot.yml` was not touched.

## Mutation Test Results

The gate-script discipline STATE.md records (01-02: a grep-based gate that passed and was proven
vacuous) requires every assertion to be shown non-vacuous. All five required results, plus one
extra:

| # | Mutation | Expected | Observed |
|---|----------|----------|----------|
| a | `import * as Effect from "effect/Effect"` appended to `packages/gherkin/src/Model.ts` | non-zero, names the file | **exit 1** — `packages/gherkin/src/Model.ts:165:import * as Effect from "effect/Effect"` |
| b | `peerDependencies.effect = "^4.0.0"` added to `packages/gherkin/package.json` | non-zero, names the field | **exit 1** — `peerDependencies.effect = "^4.0.0"` |
| c | `dependencies.vitest = "^4.0.0"` added to `packages/gherkin/package.json` | non-zero, names the field | **exit 1** — `dependencies.vitest = "^4.0.0"` |
| d | `devDependencies.vitest = "catalog:"` — the real, current state | exit 0 (must NOT fail) | **exit 0**, `vitest` confirmed present at `packages/gherkin/package.json:53` |
| e | Clean tree after all reverts | exit 0 | **exit 0**, three ✓ lines printed |
| f *(extra)* | `// import * as Effect from "effect/Effect"` and `/* import { x } from "vitest" */` appended as comments | exit 0 (comment filter works) | **exit 0** — commented imports are not counted |

`git status --porcelain packages/gherkin/src` was empty after every revert and at task end.

**Type-check gate non-vacuity:** `const deliberateTypeError: number = "not a number"` appended to
`packages/gherkin/test/loadFeature.test.ts` produced
`error TS2322: Type 'string' is not assignable to type 'number'` and **exit 1**. Reverted; the
check returned to exit 0.

**CI/local cross-check:** every `- run: pnpm <x>` step in `check.yml` maps to a root
`package.json` script — `ok 10 CI pnpm steps map to root scripts`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Two real type errors in `packages/gherkin/test/upstream-pin.test.ts`**

- **Found during:** Task 2, on the very first run of the new type-check gate
- **Issue:** `Object.keys(Errors).toSorted()` — `Array.prototype.toSorted` is ES2023 while
  `tsconfig.base.json` sets `lib: ["ES2022"]` (TS2550). And `pickle.location.line` — `location` is
  optional on upstream's `Pickle` type (TS18048).
- **Fix:** the sort was replaced with a `Set` comparison and `location` with optional chaining.
  The `Set` spelling is not cosmetic: **neither** sorting spelling is available here.
  `.toSorted()` fails the type check under an ES2022 `lib`, and `.sort()` fails `pnpm lint` under
  oxlint's `unicorn(no-array-sort)`, which mandates `toSorted`. Since sorting existed only to make
  the comparison order-independent and `Object.keys` returns unique keys, set equality asserts
  exactly the same thing while satisfying both gates. Both edits carry an inline comment recording
  the reason.
- **Files modified:** `packages/gherkin/test/upstream-pin.test.ts`
- **Commit:** `f0e984a`

This is the gate finding exactly the class of defect D7 predicted: two type errors sitting in a
committed test file that a fully green `pnpm test` never noticed, because vitest transpiles tests
without checking them.

**2. [Rule 3 - Blocking] The plan's own CI/local cross-check command could never pass**

- **Found during:** Task 3
- **Issue:** the verify block's `node -e` cross-check matches `- run: pnpm ([a-z:-]+)` and then
  requires every capture to be a key of root `scripts`. That captures `install` from the four
  `pnpm install --frozen-lockfile` steps. `install` is a pnpm builtin, not a repo script, so the
  command reports `CI steps with no root script: [ 'install', 'install', 'install', 'install' ]`
  and exits 1 regardless of how the workflow is wired.
- **Fix:** the check was run with pnpm builtins (`install`, `exec`, `dlx`, `run`, `add`, `remove`,
  `why`, `licenses`, `audit`, `publish`, `pack`) filtered out of the captured list. The property
  the plan wanted — every CI step that invokes a *repo* script maps to a root script — then holds:
  `ok 10 CI pnpm steps map to root scripts`.
- **Files modified:** none (verification-command correction only)
- **Commit:** n/a

**3. [Rule 3 - Blocking] `node_modules` absent in the worktree**

- **Found during:** Task 1 verification (`pnpm exec dprint` reported `Command "dprint" not found`)
- **Fix:** ran `pnpm install --frozen-lockfile`. No dependency was added and the lockfile was not
  modified — `git status --short` showed no manifest or lockfile change afterwards.
- **Commit:** n/a

## Decisions Made

**Decision D7 is closed: yes, wire it.** `packages/gherkin/test/**` is now type-checked by a
dedicated non-emitting config, as a root script *and* a `check.yml` step, per STATE.md's 01-06 rule.
The decision paid for itself immediately — see deviation 1.

**The `devDependencies` exclusion is permanent and documented in the script.** Widening the
manifest assertion to all three dependency fields would make the gate permanently red for a state
that is correct: `devDependencies.vitest` is how this package's own tests run, and
`devDependencies` are never installed by a consumer, so they grant the shipped package no
capability. The METHOD NOTE says this explicitly so nobody "fixes" the scope.

**`include: ["src", "test"]`, not `["test"]`.** Including `src` means the tests type-check against
the real source rather than against emitted `.d.ts` files, so a test can never pass against a stale
declaration.

## Threat Model Coverage

| Threat ID | Disposition | Status |
|-----------|-------------|--------|
| T-02-20 (src acquires a runner/Effect import) | mitigate | Enforced by assertion 2, mutation (a). Wired into the `package` job. |
| T-02-22 (`dependencies`/`peerDependencies` gain `effect`) | mitigate | Enforced by assertion 3 via `node -e` + `JSON.parse`, mutations (b) and (c). |
| T-02-23 (a vacuous gate) | mitigate | Positive control (assertion 1) plus six recorded mutation results. |
| T-02-24 (type errors in test files reach main) | mitigate | `pnpm typecheck:test` in the `types` job; proven non-vacuous, and it caught two real errors on first run. |
| T-02-25 (CI/local divergence) | mitigate | Cross-check passes for all 10 repo-script CI steps; no inline command was added. |
| T-02-SC (supply chain) | mitigate | No dependency added; `--frozen-lockfile` untouched on every CI install. |

## Verification

| Check | Result |
|-------|--------|
| `pnpm verify:no-runner-dep` | exit 0, three ✓ lines |
| `pnpm typecheck:test` | exit 0 |
| `pnpm test` | 10 files, 211 tests passed |
| `pnpm build` | exit 0 (`tsconfig.json` not widened, root references unchanged) |
| `pnpm lint` | exit 0 |
| `pnpm circular` | no circular dependency |
| `pnpm verify:pack` | pack shape OK, publint clean for both packages |
| `pnpm verify:spec` | PASS 7 / FAIL 0 / SKIP 1 |
| `pnpm verify:tsgo-gate` | ENFORCED |
| `pnpm verify:oxlint-plugin` | ENFORCED |
| `node -e` root-tsconfig assertion | exit 0 (`tsconfig.test.json` not in `references`) |
| `grep -c 'packages/vitest' packages/gherkin/tsconfig.test.json` | 0 |
| `grep -c 'JSON.parse' scripts/verify-no-runner-dep.sh` | 2 |
| `git diff --stat .github/workflows/snapshot.yml` | empty |

The full phase gate ran green end to end in a single chained command.

## Known Stubs

None.

## Threat Flags

None. This plan adds no network endpoint, auth path, or schema; both new gates are read-only
static checks over files already in the repository.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | `266b454` | `feat(02-10): add verify-no-runner-dep.sh structural PARSE-01 gate` |
| 2 | `f0e984a` | `feat(02-10): type-check packages/gherkin/test via tsconfig.test.json (D7)` |
| 3 | `afe3c1d` | `ci(02-10): wire typecheck:test and verify:no-runner-dep as root scripts and CI steps` |

## Notes for Future Phases

`packages/vitest/test/` is still not covered by any type-check. It deliberately holds broken probe
fixtures for the tsgo gate, so it cannot simply be added to a config — a future phase that writes
real tests there will need its own `tsconfig.test.json` with the fixture directory excluded.

The `unicorn(no-array-sort)` lint rule mandates `Array.prototype.toSorted`, which
`tsconfig.base.json`'s `lib: ["ES2022"]` does not declare. Any future `.sort()` in *source* would
hit the same unwinnable pair this plan worked around in a test file. Raising `lib` to `ES2023`
(both packages set `engines.node >= 20`, which has the ES2023 array methods) would resolve it
permanently, but it is a shared-config change outside this plan's scope.

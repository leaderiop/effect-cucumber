---
phase: 09-tags
plan: 01
subsystem: infra
tags: [vitest, test-tags, ci, gate-script, structural-scan, bash]

# Dependency graph
requires:
  - phase: 06-runner-emission
    provides: "packages/vitest/src/Runner.ts and TestApi.ts — the injected emission seam this plan's gate script protects"
  - phase: 01-workspace-toolchain-and-dependency-policy
    provides: "scripts/verify-no-runner-dep.sh (the structural-scan method copied wholesale) and .github/workflows/check.yml's four-job gate"
provides:
  - "Root vitest.config.ts declaring the phase's eight-tag universe, without which emitting ANY tag fails a whole test file to `0 tests`"
  - "allowOnly: false, making a committed .only fail a plain local `pnpm test` run rather than only a CI run"
  - "scripts/verify-testapi-seam.sh — a mutation-tested structural gate rejecting any test-framework import in Runner.ts or TestApi.ts"
  - "`pnpm verify:testapi-seam` npm script plus a CI step in check.yml's package job"
affects: [09-02, 09-03, 09-04, 09-05, 09-06, 09-07, 09-08, 09-09, phase-12-dogfooding]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Tag universe declared once, at the repo root, in vitest.config.ts"
    - "Structural CI gate mirroring verify-no-runner-dep.sh: comment-stripping scan(), positive control first, forbidden specifiers spelled in exactly one variable assignment"

key-files:
  created:
    - vitest.config.ts
    - scripts/verify-testapi-seam.sh
  modified:
    - package.json
    - .github/workflows/check.yml

key-decisions:
  - "strictTags is left at its default `true` and never written into vitest.config.ts — RESEARCH Finding 2 verified that `strictTags: false` silences the test-side check but leaves `--tagsFilter` just as broken, so it is not an escape hatch"
  - "allowOnly: false is set explicitly rather than relying on GitHub Actions' CI=true, so success criterion 3 is verifiable on a plain local `pnpm test`; accepted cost is that local `.only` now needs `--allowOnly`"
  - "`include`/`exclude` are deliberately absent from vitest.config.ts; RESEARCH A5 was verified empirically — 30 test files / 645 tests before and after"
  - "@undeclared-on-purpose is reserved and NOT declared; declaring it would delete plan 09-06's D-08 degradation test's meaning while leaving it green"
  - "verify-testapi-seam.sh names its forbidden specifiers only in the FORBIDDEN_RE assignment, never in `#` prose, so a citation cannot false-positive its own gate"

patterns-established:
  - "Pattern 1: a grep-based acceptance criterion that counts a literal also forbids writing that literal in a comment — vitest.config.ts note (b) paraphrases `allowOnly` rather than quoting it, and says why (STATE.md's 03-04 lesson)"
  - "Pattern 2: a new gate script lands together with its npm script AND its CI step in the same commit — a script nobody runs is back to being a convention"

requirements-completed: []

# Metrics
duration: ~12m
completed: 2026-08-29
---

# Phase 9 Plan 01: Tag Universe and TestApi Seam Gate Summary

**A root `vitest.config.ts` declaring eight tags with `allowOnly: false` that provably did not change which tests run, plus a mutation-tested structural gate (`verify:testapi-seam`) rejecting any test-framework import in `Runner.ts` or `TestApi.ts`, wired into CI.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-08-29T23:32Z
- **Completed:** 2026-08-29T23:44Z
- **Tasks:** 2
- **Files modified:** 4 (2 created, 2 modified)

## Accomplishments

- The repo now has a root `vitest.config.ts` declaring the exact tag universe later plans in this phase may emit. Without it, emitting *any* tag throws at collection and fails the whole test file to `0 tests` (RESEARCH Finding 1), so this unblocks the integration halves of success criteria 1, 3 and 4.
- `allowOnly: false` makes a committed `.only` fail a plain local `pnpm test`, not only a run with `CI=true` set — success criterion 3 is now locally verifiable rather than CI-only.
- `scripts/verify-testapi-seam.sh` closes RESEARCH Finding 16's gap: the "no test framework in `Runner.ts`/`TestApi.ts`" rule was convention-enforced only, and Phase 9 is the first phase that gives someone a concrete reason to break it.
- The gate runs on every PR as `pnpm verify:testapi-seam` in `check.yml`'s `package` job.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add the root vitest.config.ts declaring the tag universe** — `ac705f6` (feat)
2. **Task 2: Add scripts/verify-testapi-seam.sh and wire it into the npm scripts and CI** — `81e43aa` (feat)

## Files Created/Modified

- `vitest.config.ts` (new, 60 lines) — declares `test.tags` (eight entries) and `allowOnly: false`. Five lettered notes record what is not visible from the code: why `strictTags` is unwritten, why `allowOnly` is pinned, why the file-discovery globs are absent, why `@undeclared-on-purpose` is reserved, and what each declared tag is for.
- `scripts/verify-testapi-seam.sh` (new, 149 lines, mode 755) — structural scan of `packages/vitest/src/Runner.ts` and `packages/vitest/src/TestApi.ts`.
- `package.json` — added `"verify:testapi-seam": "bash scripts/verify-testapi-seam.sh"` immediately after `verify:no-runner-dep`.
- `.github/workflows/check.yml` — added `- run: pnpm verify:testapi-seam` to the `package` job with a rationale comment in the same shape as the `verify:no-runner-dep` step's.

## The exact eight declared tags

Later plans in this phase must emit **only** these, plus the one deliberately-undeclared probe:

| Tag | Role |
|-----|------|
| `@skip` | Reserved, library-defined (D-05) — additionally routes to a real vitest skip |
| `@only` | Reserved, library-defined (D-06) — plain tag only, NEVER `it.effect.only` |
| `@slow` | Pass-through probe (D-07) |
| `@wip` | Pass-through probe (D-07) |
| `@featuretag` | Inheritance probe, mirrors `packages/gherkin/test/Correlate.test.ts:173` |
| `@ruletag` | Inheritance probe, same |
| `@scenariotag` | Inheritance probe, same |
| `@exampletag` | Inheritance probe, same |

**`@undeclared-on-purpose` is deliberately NOT declared** and must never be added. Plan 09-06 emits it from `packages/vitest/test/emission.test.ts` to prove the D-08 catch-and-degrade path. Declaring it deletes that test's meaning while leaving it green.

`pnpm exec vitest run --listTags` lists exactly these eight, in this order.

## RESEARCH A5: `pnpm test` counts, before and after the config landed

Captured verbatim from two runs of `pnpm test` in this worktree, the first with no `vitest.config.ts` on disk and the second immediately after creating it — nothing else changed between them:

**Before (no `vitest.config.ts`):**

```
 Test Files  30 passed (30)
      Tests  645 passed (645)
```

**After (`vitest.config.ts` present):**

```
 Test Files  30 passed (30)
      Tests  645 passed (645)
```

Identical on both numbers. RESEARCH assumption A5 holds, and threat T-09-01-01 (denial of signal via `include`/`exclude`) is empirically closed rather than merely asserted.

## Mutation proofs for `scripts/verify-testapi-seam.sh`

### Proof 1 — the gate catches a type-only framework import that nothing else catches

A type-only import of the framework's own options type was added to `packages/vitest/src/TestApi.ts` (`import type { TestOptions } from "vitest"` plus a type alias so it was genuinely used, not elided as unused). With that mutation in place:

| Command | Exit code | Notes |
|---------|-----------|-------|
| `pnpm build` | **0** | `tsc -b` is entirely happy with it |
| `pnpm test` | **0** | 30 test files / 645 tests, all passing |
| `bash scripts/verify-testapi-seam.sh` | **1** | naming `packages/vitest/src/TestApi.ts` |

The failure output named the file, the line and the offending import:

```
✓ positive control: both packages/vitest/src/Runner.ts and packages/vitest/src/TestApi.ts import "effect/Scope" — the scan reaches real imports in each
✓ packages/vitest/src/Runner.ts imports no test framework, in any import form

  forbidden import specifiers found:
    packages/vitest/src/TestApi.ts:62:import type { TestOptions } from "vitest"

✗ TestApi/Runner framework-independence seam: NOT ENFORCED

  packages/vitest/src/TestApi.ts imports a test framework (listed above). …
```

That asymmetry — build green, tests green, gate red — is the entire reason the script exists, and is exactly what the METHOD NOTE claims. The mutation was reverted; `git status` was confirmed clean of it before Task 2's commit.

### Proof 2 — the precondition fires instead of the scan passing on nothing

`packages/vitest/src/TestApi.ts` was renamed to `TestApi.ts.moved` and the script re-run. It exited **1** on the missing-file precondition, before reaching any assertion:

```
✗ TestApi/Runner framework-independence seam: NOT ENFORCED

  missing file packages/vitest/src/TestApi.ts — a target this gate scans is absent, so the scan would be vacuous and nothing was verified. Did the file move or get renamed?
```

Without the precondition (and the positive control behind it), a moved target would have made the gate pass by scanning nothing — the exact vacuity STATE.md 01-02 records this repo having shipped once before. Threat T-09-01-02 is closed by demonstration. The file was restored and the gate re-run green.

## Verification

| Check | Result |
|-------|--------|
| `pnpm test` | 0 — 30 test files, 645 tests, identical to the pre-plan baseline |
| `pnpm lint` | 0 |
| `bash scripts/verify-testapi-seam.sh` | 0 — three `✓` lines, one per assertion |
| `pnpm verify:testapi-seam` | 0 |
| `pnpm build` | 0 |
| `pnpm exec vitest run --listTags` | lists the eight declared tags |
| `grep -c 'allowOnly: false' vitest.config.ts` | 1 |
| eight `name: "@…"` entries, non-comment lines | 1 each |
| `@undeclared-on-purpose` / `include:`/`exclude:` / `strictTags`, non-comment lines | 0 each |
| `grep -c CONTROL scripts/verify-testapi-seam.sh` | 4 (> 0), control regex targets `effect/Scope` |
| `FORBIDDEN_RE=` on non-`#` lines | 1; zero `#` prose lines name either forbidden specifier |
| `node -e` check on `scripts['verify:testapi-seam']` | 0 |
| `grep -c 'pnpm verify:testapi-seam' .github/workflows/check.yml` | 1 |

## Decisions Made

- **`strictTags` is left at its default `true` and is never written into the config.** RESEARCH Finding 1 verified the default empirically (`strictTags: config.strictTags ?? true`, and `vitest --help` prints `(default: true)`). Turning it off is not a fix: Finding 2 verified that `--tagsFilter` validates its pattern against `test.tags` regardless of the flag, so `strictTags: false` silences the test side and leaves the filter side — ADR-EC-020's entire `@only` story — just as broken.
- **`allowOnly: false` is written explicitly rather than inherited from `!isCI`.** The alternative gives an assertion that holds in GitHub Actions and is unverifiable locally. Accepted cost, recorded in the file: a developer using `.only` locally must pass `--allowOnly`.
- **The two file-discovery glob keys are absent.** Setting either is the likeliest way to silently stop running some package's tests; the before/after counts above are the proof that omitting them changed nothing.
- **The forbidden specifiers appear in exactly one line of `verify-testapi-seam.sh`** — the `FORBIDDEN_RE` assignment. Every `#` comment refers to "a test framework" instead, mirroring `Runner.ts` note (a)'s own refusal. This is why the script can document the rule it enforces without a citation false-positiving its own gate.
- **The positive control asserts per-file, not per-run.** `verify-no-runner-dep.sh` counts control hits across a whole directory; here there are exactly two targets, and a control satisfied only by `Runner.ts` would let a gutted `TestApi.ts` pass silently. Proof 2 exercises this path.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `allowOnly: false` was written twice, failing its own acceptance criterion**

- **Found during:** Task 1 (verification of the acceptance greps)
- **Issue:** The first draft's note (b) quoted the literal `allowOnly: false` while explaining it, so `grep -c 'allowOnly: false' vitest.config.ts` returned 2 where the criterion requires 1. The criterion greps raw text, not comment-stripped text.
- **Fix:** Reworded note (b) to name the key and its value separately ("The `allowOnly` key is pinned off below…") and added a parenthetical saying why the literal is written exactly once. This is STATE.md's own 03-04 lesson — "writing a grep-based acceptance criterion that forbids a literal also forbids explaining it in a comment" — applied to a criterion that *counts* rather than forbids.
- **Files modified:** `vitest.config.ts`
- **Verification:** `grep -c 'allowOnly: false' vitest.config.ts` is now 1; `pnpm lint` still exits 0.
- **Committed in:** `ac705f6` (Task 1 commit — the fix landed before the commit)

**2. [Rule 2 - Missing Critical] `scripts/verify-testapi-seam.sh` was created without the executable bit**

- **Found during:** Task 2 (before commit)
- **Issue:** All four existing scripts under `scripts/` are mode 755. The new file was 644. It runs today only because every caller invokes it as `bash scripts/…`; a future caller (or a developer) running `./scripts/verify-testapi-seam.sh` would get a permission error, and the file carries a `#!/usr/bin/env bash` shebang that claims otherwise.
- **Fix:** `chmod +x scripts/verify-testapi-seam.sh`. Git recorded it as mode 100755, matching its four siblings.
- **Files modified:** `scripts/verify-testapi-seam.sh` (mode only)
- **Verification:** `git commit` output shows `create mode 100755`; `bash scripts/verify-testapi-seam.sh` still exits 0.
- **Committed in:** `81e43aa` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 missing critical)
**Impact on plan:** Both are small and local. Neither changed the plan's scope, the file set it named, or any assertion it specified. No scope creep.

## Issues Encountered

- The worktree started with no `node_modules`, so `pnpm install --frozen-lockfile` was run before any verification. The lockfile was already up to date; no dependency change was made by this plan, and `pnpm-lock.yaml` is untouched (consistent with threat T-09-01-SC: this plan installs nothing).

## Known Stubs

None. Both artifacts are complete and enforced — the config is read by every `pnpm test` run, and the gate script runs in CI.

## Threat Flags

None. This plan adds no network endpoint, auth path, file-access pattern, or schema at a trust boundary. The one new file-reading surface is a build-time gate script that reads two fixed, hard-coded repo-relative paths and never writes.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

Ready. Wave 1 is complete; every later plan in this phase can now emit tags.

**Constraints later plans in this phase must respect:**

- **Emit only the eight tags listed above.** A ninth tag needs a `vitest.config.ts` entry in the same commit, or the file emitting it collects `0 tests` — and the failure message names neither the `.feature` file nor the Scenario.
- **`@undeclared-on-purpose` must never be added to `test.tags`.** It is plan 09-06's D-08 probe. Declaring it leaves 09-06 green while deleting what it proves.
- **Do not add `include`/`exclude` to `vitest.config.ts`,** and do not set `strictTags`. Both are argued against in the file's own notes (a) and (c); the before/after counts in this summary are the empirical backing.
- **`.only` no longer works locally without `--allowOnly`.** This is deliberate (note (b)); it is not a misconfiguration to route around.
- **`Runner.ts` and `TestApi.ts` may not import the test framework, and this is now mechanically enforced on every PR.** Plan 09-02/09-03's `EmitOptions` must be the library's own type, exactly as RESEARCH Pattern 1 shows. `pnpm verify:testapi-seam` is the thing that will go red, with a message naming the file.
- **Adding a target to the seam gate means adding its `[[ -f ]]` precondition and a positive-control hit in the same edit** — the control asserts per-file, not per-run, on purpose.
- Repo test count is unchanged at **645 across 30 files** — this plan added infrastructure, not tests.

**Not owed to a later plan by this one:** nothing. The spec-reconciliation debt this phase carries (ADR-EC-020's `includeTags`/`excludeTags` amendment, BEH-EC-008) belongs to the plan that ships the filtering, not to this one.

## Self-Check

- `vitest.config.ts` — FOUND
- `scripts/verify-testapi-seam.sh` — FOUND
- `package.json` — FOUND (contains `verify:testapi-seam`)
- `.github/workflows/check.yml` — FOUND (contains `pnpm verify:testapi-seam`)
- commit `ac705f6` — FOUND
- commit `81e43aa` — FOUND

## Self-Check: PASSED

---
*Phase: 09-tags*
*Completed: 2026-08-29*

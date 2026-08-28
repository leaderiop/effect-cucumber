---
phase: 01-workspace-toolchain-and-dependency-policy
plan: 06
subsystem: ci
tags: [github-actions, ci, node-matrix, pnpm, frozen-lockfile, pkg-pr-new, preview-releases]

requires:
  - "01-01 (`pnpm build` == `tsc -b`, pnpm workspace + packageManager pin that pnpm/action-setup reads)"
  - "01-02 (`pnpm verify:tsgo-gate` — the ADR-EC-016 build gate CI now enforces)"
  - "01-03 (`pnpm lint` == `oxlint -f unix && dprint check`, and `pnpm verify:oxlint-plugin`)"
  - "01-04 (two-catalog dependency policy — `--frozen-lockfile` is what stops CI silently repairing a stale lockfile)"
  - "01-05 (`pnpm verify:pack`, `pnpm circular` — the packaging and structure gates CI now runs)"
provides:
  - "`.github/workflows/check.yml` — the merge gate: four independent parallel jobs (lint, types, test, package)"
  - "a Node 22 + Node 24 test matrix with `fail-fast: false`, so one runtime failing still reports the other"
  - "`--frozen-lockfile` on every install in every job — a stale lockfile fails CI instead of being silently updated"
  - "`concurrency` + `cancel-in-progress` — a superseded commit's run is cancelled, not queued"
  - "`.github/workflows/snapshot.yml` — per-PR pkg-pr-new preview installs, no npm token and no repository secret"
  - "`pnpm snapshot` root script (`pkg-pr-new publish --pnpm ./packages/*`)"
  - "every gate built in Phase 1 is now enforced on every pull request rather than being a convention"
affects:
  - "Phase 2 onward — every new source file inherits lint, types, tests on two runtimes, circular-import and packaging checks with no further CI work"
  - "the first real .feature file — `pnpm verify:spec` currently SKIPs the features->traceability check; it starts asserting once tags exist"
  - "any future release workflow — deliberately not built here; check.yml is the gate it would depend on"

tech-stack:
  added:
    - "pkg-pr-new 0.0.88 (root devDependency, exact pin — matches the exact-pin convention of dprint/madge/oxlint/publint)"
    - "GitHub Actions: actions/checkout@v6, pnpm/action-setup@v6, actions/setup-node@v7 (plain tags, not pinned SHAs)"
  patterns:
    - "every CI step is a root package.json script that also runs locally — there is no command that exists only in CI, so `it passes on my machine` and `it passes in CI` cannot diverge"
    - "independent parallel jobs rather than one serial `check` job, so a lint failure and a type failure are reported in the same run"
    - "pnpm/action-setup runs BEFORE setup-node, because `cache: pnpm` needs pnpm on PATH to resolve the store"
    - "no `version:` input on pnpm/action-setup — the root `packageManager: pnpm@10.26.1` field is the single source of truth"
    - "a workflow that can fail for reasons outside the PR (snapshot.yml) is deliberately excluded from required checks"

key-files:
  created:
    - .github/workflows/check.yml
    - .github/workflows/snapshot.yml
  modified:
    - package.json
    - pnpm-lock.yaml

key-decisions:
  - "`pnpm verify:oxlint-plugin` was added to the lint job (not in the plan). `pnpm lint` exiting 0 does NOT prove the vendored effect/* rules loaded — an unresolvable jsPlugins specifier produces the same silent exit-0 run as a correct one. Without this step the lint gate could decay into a no-op while CI stayed green."
  - "The `package` job runs `pnpm verify:pack` with no preceding `pnpm build` step, because verify-pack.sh builds before packing itself. A separate build step would be a duplicate."
  - "Plain action tags (`@v6`) rather than pinned SHAs. Effect pins SHAs; effect-machine uses tags. Tags are the right posture for a project this size."
  - "Node 24 is the primary target and the runtime for lint/types/package; 22 is carried in the test matrix only. A testing library gets installed into whatever runtime the consumer already has, so runtime breadth matters for tests specifically."
  - "snapshot.yml uses `id-token: write` for pkg-pr-new build attestation — no npm token, no repository secret. The only external requirement is installing the pkg-pr-new GitHub App."

patterns-established:
  - "CI-script parity: a machine-checkable invariant that every `run:` in a workflow is `pnpm <script>` for a declared root script"
  - "Gate-liveness verification: a gate that can silently stop running (oxlint jsPlugins, tsgo diagnostics) gets its own CI step proving it still fires"

requirements-completed: []

duration: 3min
completed: 2026-08-28
---

# Phase 1 Plan 6: CI Merge Gate and Preview Releases Summary

**Two GitHub Actions workflows that turn every Phase 1 gate into an enforced merge requirement — four parallel jobs (lint, types, test on Node 22+24, package) all installing with `--frozen-lockfile`, plus per-PR pkg-pr-new preview installs needing no npm token.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-08-28T04:46:39Z
- **Completed:** 2026-08-28T04:49:40Z
- **Tasks:** 2
- **Files modified:** 4 (2 created, 2 modified)

## Accomplishments

- **Phase 1 success criterion 3 is complete.** CI runs build + lint + format + test on Node 22 and 24, plus the tsgo gate, the packaging check, the circular-import check and the spec traceability check.
- Every gate built across plans 01-01 through 01-05 now runs on every pull request. Before this plan each was a script somebody had to remember to run.
- The `test` job runs on Node 22 and Node 24 with `fail-fast: false`, so a failure on one runtime does not hide the result on the other.
- Every job installs with `--frozen-lockfile`, so the two-catalog dependency policy from 01-04 cannot be bypassed by a stale lockfile being silently repaired in CI.
- `concurrency` with `cancel-in-progress` means a force-push cancels the run it superseded rather than queueing it.
- Per-PR preview installs via pkg-pr-new — with zero published versions, this is the only way to try a branch without touching the registry.

## Task Commits

1. **Task 1: Create the check.yml merge gate with a Node 22/24 test matrix** — `8267a90` (ci)
2. **Task 2: Add pkg-pr-new preview releases** — `0f96ca9` (ci)

## Files Created/Modified

- `.github/workflows/check.yml` — the merge gate. Four independent parallel jobs:
  - `lint` — `pnpm lint` (oxlint + dprint check, covering both the lint and format halves of criterion 3), then `pnpm verify:oxlint-plugin`
  - `types` — `pnpm build` (`tsc -b`), then `pnpm verify:tsgo-gate` (ADR-EC-016, a required check)
  - `test` — matrix over Node 22 and 24, `pnpm test`
  - `package` — `pnpm verify:pack`, `pnpm circular`, `pnpm verify:spec`
- `.github/workflows/snapshot.yml` — pkg-pr-new preview publish on PRs and pushes to main. `id-token: write` for attestation; no secrets.
- `package.json` — added the `snapshot` script and `pkg-pr-new@0.0.88` devDependency.
- `pnpm-lock.yaml` — pkg-pr-new resolution.

## Decisions Made

- **Job granularity: four parallel jobs, not one serial `check`.** Effect uses a single serial job; at this project's size the more useful property is seeing a lint failure and a type failure in the same run instead of discovering them one push at a time.
- **`pnpm/action-setup` before `actions/setup-node`.** `cache: pnpm` needs pnpm resolvable to locate the store. The reverse order fails at the cache step.
- **No `version:` input on pnpm/action-setup.** The root `packageManager: pnpm@10.26.1` field already pins it; duplicating the version in five workflow steps would be five places to forget on a bump.
- **Plain tags, not pinned SHAs.** Deliberate, per the plan.
- **snapshot.yml is not a required check.** A preview publish failing (most likely because the GitHub App is not installed yet) must never be able to block a merge. This is documented in a comment at the top of the file so it does not get added to branch protection later by reflex.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added `pnpm verify:oxlint-plugin` to the lint job**

- **Found during:** Task 1 (check.yml)
- **Issue:** The plan's `lint` job ran only `pnpm lint`. But `scripts/verify-oxlint-plugin.sh` documents in its own METHOD NOTE that `pnpm lint` exiting 0 does *not* prove the vendored `effect/*` rules loaded: an unresolvable `jsPlugins` specifier, a renamed plugin `name`, or a deleted `tools/` directory all produce the same clean, silent, exit-0 run as a correctly wired one. Wiring `pnpm lint` into CI without the liveness check means the lint gate could silently degrade into a no-op for the vendored rules while CI stayed green — which directly contradicts both this plan's objective ("make every gate built in this phase run on every pull request") and the phase context decision that "a vendored-rule violation fails CI (not warn-only)".
- **Fix:** Added `- run: pnpm verify:oxlint-plugin` to the `lint` job, with a comment explaining why the preceding `pnpm lint` step is insufficient on its own.
- **Files modified:** `.github/workflows/check.yml`
- **Verification:** `pnpm verify:oxlint-plugin` passes locally (positive control lints clean; a barrel import fails by the exact rule ID `effect(no-import-from-barrel-package)`). It is a declared root script, so the plan's "every command CI runs is a root package.json script that also works locally" invariant still holds.
- **Committed in:** `8267a90` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** One extra step in an existing job. No new files, no new dependencies, no scope creep. Every `must_haves` truth and artifact assertion still holds — the addition is a superset of what the plan enumerated.

## Issues Encountered

None. All three action versions named in the plan were confirmed to exist upstream before use (`actions/checkout@v6`, `pnpm/action-setup@v6`, `actions/setup-node@v7` — checkout and setup-node both have a newer major available, v7 and v7 respectively; the plan's choices are current-enough and were kept as written). `pkg-pr-new@0.0.88` was confirmed on the registry as the canonical `stackblitz-labs/pkg.pr.new` package before installing.

## Verification Performed

Every command the two workflows run was executed locally on Node v22.22.0 (which independently exercises the Node 22 leg of the test matrix):

| Command | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | OK (still consistent after adding pkg-pr-new) |
| `pnpm lint` | exit 0 |
| `pnpm verify:oxlint-plugin` | `oxlint effect plugin: ENFORCED` |
| `pnpm build` | exit 0 |
| `pnpm verify:tsgo-gate` | `tsgo gate: ENFORCED` |
| `pnpm test` | 3 files, 40 tests passed |
| `pnpm verify:pack` | `pack shape: OK` (publint clean for both packages) |
| `pnpm circular` | no circular dependency found |
| `pnpm verify:spec` | PASS 7, FAIL 0, SKIP 1 |
| `pnpm snapshot` (resolution only) | `pkg-pr-new` resolves via `pnpm exec` |

Structural assertions:

- Both workflow files parse as valid YAML.
- A script cross-check confirms **every** non-install `run:` step in both workflows is exactly `pnpm <script>` for a script declared in the root `package.json` — there is no command that exists only in CI.
- Every `pnpm install` step in every job carries `--frozen-lockfile`.
- `check.yml` declares exactly the four jobs `lint`, `types`, `test`, `package`; `test` matrix is `[22, 24]`.
- `.github/workflows/` contains exactly `check.yml` and `snapshot.yml` — no `canary.yml`, no `release.yml`, no `publish.yml` (all deferred).

## User Setup Required

**One manual step, and it is the only thing in this plan Claude could not do.**

- **Service:** pkg-pr-new
- **Action:** Install the pkg-pr-new GitHub App on the `leaderiop/effect-cucumber` repository — <https://github.com/apps/pkg-pr-new> → Install → select the repo.
- **Why:** Per-PR preview installs of both packages, so a branch can be tried before anything is published to npm.
- **Secrets needed:** None. The workflow uses the default `GITHUB_TOKEN` plus `id-token: write` for attestation. There is no token to create and no repository secret to add.
- **Until it is installed:** `snapshot.yml` will fail on PRs. This is expected and harmless — the workflow is deliberately excluded from required checks, so a failing preview publish cannot block a merge. `check.yml` is unaffected.

**Also worth doing once (optional, not required for correctness):** add the four `check.yml` jobs (`Lint and format`, `Types and tsgo gate`, `Test (Node 22)`, `Test (Node 24)`, `Packaging and structure`) to branch protection as required checks on `main`. Do **not** add `Publish preview`.

## Next Phase Readiness

- **Phase 1 is complete.** All six plans executed; success criterion 3 (lint + format clean, CI on Node 22 and 24) is satisfied, along with the tsgo, packaging, circular-import and traceability gates.
- Phase 2 inherits full enforcement automatically: the first real source file is linted, type-checked, tested on two runtimes, and checked for cycles and packaging correctness with zero additional CI work.
- **Carried-forward limitation (unchanged, not this plan's job):** `pnpm circular` covers intra-package cycles only — madge does not follow the cross-package `exports` map. Known and accepted.
- **Carried-forward note:** `pnpm verify:spec` currently reports `SKIP` for the features→traceability check because no `.feature` tags exist yet. That check starts asserting for real in Phase 2 and later; the CI wiring for it is already in place.
- **Deliberately still absent:** the weekly `effect@rc` canary workflow (deferred per phase context — revisit once the core test suite is worth protecting against a moving prerelease) and any release/publish workflow (this milestone's destination is "working and tested", not "published").

## Self-Check: PASSED

- `.github/workflows/check.yml` — FOUND
- `.github/workflows/snapshot.yml` — FOUND
- `.planning/phases/01-workspace-toolchain-and-dependency-policy/01-06-SUMMARY.md` — FOUND
- Commit `8267a90` — FOUND
- Commit `0f96ca9` — FOUND
- `snapshot` root script — FOUND

No stubs, no placeholder content, no deferred issues. No new threat surface: both workflows have least-privilege `permissions` blocks (`contents: read`, plus `id-token: write` only where pkg-pr-new needs it for attestation), neither consumes a repository secret, and neither uses `pull_request_target`.

---
*Phase: 01-workspace-toolchain-and-dependency-policy*
*Completed: 2026-08-28*

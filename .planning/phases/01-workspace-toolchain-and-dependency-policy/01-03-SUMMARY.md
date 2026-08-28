---
phase: 01-workspace-toolchain-and-dependency-policy
plan: 03
subsystem: lint-format-toolchain
tags: [oxlint, dprint, vendored-rules, agents-md-conventions, lint-gate]

requires:
  - "01-01 (compiling workspace, tsconfig.base.json)"
  - "01-02 (verify-tsgo-gate.sh — the exit-code gate pattern this plan reuses)"
provides:
  - "`pnpm lint` / `pnpm lint-fix` — oxlint + dprint over the whole repo"
  - "`pnpm format` / `pnpm format:check`"
  - "`pnpm verify:oxlint-plugin` — proof the vendored Effect rules are loaded, not decorative"
  - "AGENTS.md §3 (submodule namespace imports) as a build-breaking lint error"
  - "tools/oxlint/effect/ tracked in git (was untracked)"
  - "repo formatted in Effect house style (no semicolons)"
affects:
  - "01-06 (CI — `pnpm lint`, `pnpm verify:oxlint-plugin` belong in the merge gate)"
  - "every future package under packages/*/src — must use `import * as X from \"effect/X\"`"
  - "spec/**/*.md — now dprint-formatted; future spec edits must survive `dprint check`"

tech-stack:
  added:
    - "dprint 0.56.1"
    - "oxlint 1.80.0"
    - "@oxlint/plugins 1.80.0"
  patterns:
    - "vendored code is exempted from *style* rules only (via `overrides`), never from correctness/suspicious/perf — keeps the documented curl resync path viable"
    - "a lint plugin is proven loaded by the EXIT CODE on a deliberate violation, never by a clean `pnpm lint` run"
    - "gate fixtures are written and deleted by the gate script (trap EXIT), gitignored as a hard-kill backstop"

key-files:
  created:
    - dprint.json
    - .oxlintrc.json
    - scripts/verify-oxlint-plugin.sh
    - tools/oxlint/effect/** (10 files — newly tracked, not newly written)
  modified:
    - package.json
    - pnpm-lock.yaml
    - .gitignore
    - "AGENTS.md, CONTRIBUTING.md, spec/**/*.md (formatting only)"

decisions:
  - "Effect's dprint config adopted wholesale including `semiColons: \"asi\"`. Verified non-destructive: the four vendored rule sources are MD5-identical before and after `dprint fmt`, which independently confirms this config matches the one Effect formats its own tools with — and preserves ATTRIBUTION.md's byte-identical-to-upstream claim."
  - "`spec/**` is formatted (not excluded). The markdown plugin also reformats fenced `ts` blocks, so normative spec examples now match the house style the linter enforces — `'x'` became `\"x\"`, `function* (` became `function*(`. Traceability still passes (151 links), so no deviation was needed."
  - "`unicorn/consistent-function-scoping` is disabled for `tools/oxlint/effect/**` via `overrides`, rather than fixing the 12 violations. Those files are upstream's; editing them to satisfy our style would silently break the `curl` resync command ATTRIBUTION.md documents. Correctness/suspicious/perf categories remain ON for vendored code, so a broken resync would still be caught."
  - "Added `scripts/verify-oxlint-plugin.sh` (not in the plan, which called for a throwaway probe). The plan's own reasoning — 'a jsPlugins specifier that silently fails to resolve would leave the whole thing decorative' — is a permanent risk, not a one-time one, and `pnpm lint` exiting 0 is identical whether the plugin loaded or not. This mirrors 01-02's established exit-code-gate pattern."
  - "No `vitest.config.ts` was added. Vitest's default include already reaches `tools/**/*.test.ts`; the plan's fallback was unnecessary."

duration: ~18m
completed: 2026-08-28
---

# Phase 01 Plan 03: Lint and Format Toolchain Summary

AGENTS.md §3 — "import `* as Effect from \"effect/Effect\"`, never from the `effect` barrel" — stopped being prose and became a build-breaking lint error, and the `tools/` directory that enforces it stopped being one `rm -rf` away from nonexistence.

## What Was Built

**dprint** (Effect's config verbatim, `semiColons: "asi"`) formatted 26 files across `spec/`, `AGENTS.md`, `CONTRIBUTING.md`, and the JSON configs. **oxlint 1.80.0** runs the base rule set from STACK.md §5.1 plus the four vendored Effect rules, loaded by path as plugin name `"effect"` so rule IDs match upstream. `pnpm lint` is `oxlint -f unix && dprint check`, matching Effect's own script line.

`tools/oxlint/effect/` (10 files) is now tracked in git.

## The Barrel-Import Probe

The plan required proving the vendored rules actually load. Observed output:

```
packages/vitest/src/__probe.ts:1:10: Use import * as Effect from "effect/Effect" instead [Error/effect(no-import-from-barrel-package)]
1 problem
```

Exit code 1. The rule ID and message are upstream's, confirming both that the plugin resolved and that the `name: "effect"` wiring produces upstream-compatible IDs. The throwaway file was deleted; the assertion now lives permanently in `scripts/verify-oxlint-plugin.sh`.

## Why a Permanent Gate Replaced the Throwaway Probe

`pnpm lint` exiting 0 does not distinguish a loaded plugin from an unloaded one — with no violations committed, both are silent and both exit 0. This is structurally the same trap 01-02 documented for the tsgo gate (where grepping output passed regardless of whether the gate was enforced).

`scripts/verify-oxlint-plugin.sh` makes two assertions against fixtures it writes and deletes:

| Assertion | Fixture | Role |
|---|---|---|
| 1 (positive control) | `import * as Effect from "effect/Effect"` | must lint **clean** — discriminates a working rule from one that rejects everything |
| 2 (**the gate**) | `import { Effect } from "effect"` | must **fail**, by the name `effect(no-import-from-barrel-package)` |

Mutation-tested — all three trip the gate:

| Mutation | Would `pnpm lint` catch it? | Gate result |
|---|---|---|
| A — `jsPlugins` entry removed | yes (config parse error) | ✗ NOT ENFORCED |
| B — specifier points at a nonexistent file | yes (cannot find module) | ✗ NOT ENFORCED |
| **C — rule downgraded to `"off"`** | **no — config parses, lint exits 0** | ✗ NOT ENFORCED |

Mutation C is the one that matters: it is invisible to every other check in the repo. The config was byte-restored after each mutation (`diff` confirmed).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] `unicorn/consistent-function-scoping` failed on 12 vendored test helpers**

- **Found during:** Task 2, first `pnpm exec oxlint` run
- **Issue:** The enabled unicorn rules flagged 12 test helpers defined inside `describe` blocks in `tools/oxlint/effect/test/*.test.ts`. These are upstream Effect's files. `pnpm lint` could not exit 0.
- **Fix:** Added an `overrides` block scoping `unicorn/consistent-function-scoping: "off"` to `tools/oxlint/effect/**`, with an inline comment explaining why. Editing the vendored files instead would have broken the `curl` resync path ATTRIBUTION.md documents — every resync would reintroduce the 12 errors. Correctness/suspicious/perf categories remain enabled on vendored code.
- **Files modified:** `.oxlintrc.json`
- **Commit:** `9e9f71c`

**2. [Rule 2 — Missing critical functionality] No regression guard on the plugin wiring**

- **Found during:** Task 2, after the probe succeeded
- **Issue:** The plan's probe-then-delete approach left the plan's own declared `key_link` (`.oxlintrc.json` → `tools/oxlint/effect/index.ts`) with zero ongoing verification. Mutation C above demonstrates a config change that unwires the enforcement while every existing check still passes.
- **Fix:** Added `scripts/verify-oxlint-plugin.sh` + `pnpm verify:oxlint-plugin`, mirroring `scripts/verify-tsgo-gate.sh`. Added `.oxlint-probe/` to `.gitignore` as a hard-kill backstop for the script's transient fixtures.
- **Files modified:** `scripts/verify-oxlint-plugin.sh` (new), `package.json`, `.gitignore`
- **Commit:** `9e9f71c`

### Plan Contingencies That Did Not Trigger

- **`spec/**` did not need excluding.** The plan pre-authorized reverting `spec/` if formatting broke traceability. It did not — all 151 relative links still resolve, both index.yaml checks pass. `spec/` stays formatted.
- **No `vitest.config.ts` was needed.** Vitest's default include already picks up `tools/**/*.test.ts`; the vendored tests were in fact already running (40 tests) before this plan touched anything.

## Verification Results

| # | Check | Result |
|---|---|---|
| 1 | `pnpm lint` (oxlint + dprint check) | EXIT 0 |
| 2 | `pnpm test` — 3 files, 40 tests, all vendored rule tests | EXIT 0 |
| 3 | `git ls-files tools/` | 10 files tracked |
| 4 | barrel import reported by `effect/no-import-from-barrel-package` | confirmed, exit 1 |
| 5 | `bash spec/scripts/verify-traceability.sh` | EXIT 0 — 7 PASS, 0 FAIL, 1 SKIP |
| 6 | `bash scripts/verify-tsgo-gate.sh` (01-02 regression) | EXIT 0 |
| 7 | `node node_modules/typescript/bin/tsc -b` | EXIT 0 |
| 8 | working tree clean | clean |

Checks 6 and 7 were run because `dprint fmt` reformatted the tsgo gate's tsconfigs — worth confirming the 01-02 gate survived.

## Known Gaps

- **`no-bigint-literals` has no vendored test.** Upstream shipped tests for three of the four copied rules; `tools/oxlint/effect/test/` has 3 files for 4 rules. The rule is enabled and loads, but its behavior is unverified locally. Low impact (ATTRIBUTION.md rates its relevance "Low" — this project targets ES2022).
- **`pnpm install` prints "Ignored build scripts: dprint@0.56.1".** pnpm 10 blocks postinstall by default. dprint works regardless (the binary resolves via its platform-specific optional dependency — `dprint --version` and all runs confirmed). Left unapproved rather than widening the build-script allowlist. 01-06 may want to silence the warning in CI.
- **`ignoreEffectWarningsInTscExitCode` still has no behavioral test** (carried over from 01-02, unchanged by this plan).

## Self-Check: PASSED

All created files verified present on disk (`dprint.json`, `.oxlintrc.json`, `scripts/verify-oxlint-plugin.sh`, 10 files under `tools/`). Both commits verified in `git log`: `0831e31`, `9e9f71c`.

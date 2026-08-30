---
phase: 10-layer-scopes-per-scenario-default-shared
plan: 08
subsystem: testing
tags: [spec, documentation, traceability, requirements, layer-scoping]

# Dependency graph
requires:
  - phase: 10-layer-scopes-per-scenario-default-shared
    provides: "EmitOptions.contextFree, the two named EmitOptions constants, sharedLayerTestApi's routing branch, and the emission.test.ts regression block (plan 10-07) — this plan records what that fix made true"
provides:
  - "spec/invariants.md's INV-EC-002 entry — Mechanism paragraph narrowed to 'every node whose body needs it', Assertions paragraph naming the 10-07 zero-runnable-Scenario test block and correcting the prior misdescription of scripts/verify-shared-layer-once.sh"
  - "spec/behaviors/02-shared-layers-and-tags.md's BEH-EC-007 — a second, append-only dated correction recording the BUILD half's unstated zero-runnable-Scenario boundary as a strengthening, not a divergence"
  - "spec/traceability.md's §2 INV-EC-002 row (Mechanism/Test cells) reconciled with the corrected invariants.md paragraphs; §4's disk cross-check re-run and recorded clean in both directions"
  - ".planning/REQUIREMENTS.md — RUN-03 and RUN-04 marked Complete again, gated behind a green run of all thirteen repository gates in this plan's own session"
affects: [11-composition-root-and-dogfooded-acceptance-suite]

# Actuals (#2632)
actuals:
  tokens: 8004
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "A requirement flipped back to 'Gaps Found' by the verifier is re-marked Complete only by the plan that (a) proves the gap is closed with a real gate run in its own session, done here by re-running all thirteen repository gates rather than trusting plan 10-07's own SUMMARY, and (b) marks last, after every spec edit is on disk."

key-files:
  created: []
  modified:
    - spec/invariants.md
    - spec/behaviors/02-shared-layers-and-tags.md
    - spec/traceability.md
    - .planning/REQUIREMENTS.md

key-decisions:
  - "spec/traceability.md's §4 (test file map) gained no new row: plan 10-07 appended a describe block to the ALREADY-LISTED packages/vitest/test/emission.test.ts rather than creating a new file, confirmed by running the disk-vs-table cross-check in both directions (32 files on disk, 32 named, comm -23/-13 both empty)."
  - "packages/vitest/README.md and packages/vitest/src/index.ts's doc comment were read and left untouched: both state the shared tier is 'built exactly once for the whole Feature' without asserting anything about the zero-runnable-Scenario case, so plan 10-07's fix does not make either sentence false — 'checked and found clean' rather than 'not checked'."
  - "spec/traceability.md required a dprint reformat pass (column realignment only, verified by diff — no content change) after editing the §2 table row, because dprint recomputes every column's width from the widest cell in a markdown table and a longer Mechanism/Test cell shifts every other row's padding."

requirements-completed: [RUN-03, RUN-04]

coverage:
  - id: D1
    description: "spec/invariants.md's INV-EC-002 Mechanism paragraph narrowed to 'every node whose body needs it' (not every node the Feature emits), naming the routing-field mechanism and the caller-visible consequence"
    requirement: "RUN-03"
    verification:
      - kind: other
        ref: "pnpm verify:spec (PASS 7/7, SKIP 1, 279 relative links resolve)"
        status: pass
    human_judgment: true
    rationale: "Whether the new prose accurately describes the contextFree routing mechanism against the real source (TestApi.ts, Runner.ts, describeFeature.ts) is a semantic claim; verify:spec only checks link/index integrity, not truthfulness of the description."
  - id: D2
    description: "spec/invariants.md's INV-EC-002 Assertions paragraph adds the 10-07 emission.test.ts zero-runnable-Scenario block by name and corrects the prior misdescription of scripts/verify-shared-layer-once.sh (three runs, two independent build-once 'passed' assertions, one whole-vs-filtered status-equality assertion)"
    requirement: "RUN-03"
    verification:
      - kind: other
        ref: "grep -c 'verify-shared-layer-once' spec/invariants.md == 1; manually cross-read against scripts/verify-shared-layer-once.sh's A2/C2/B2 assertions"
        status: pass
    human_judgment: true
    rationale: "The correction's accuracy against the script's actual assertions is a semantic reading; the grep only confirms the script is named, not that the description of what it asserts is correct."
  - id: D3
    description: "BEH-EC-007 gains a second, append-only dated correction recording the BUILD half's unstated zero-runnable-Scenario boundary as a strengthening rather than a divergence; the fenced REQUIREMENT block and the first correction are untouched"
    requirement: "RUN-03"
    verification:
      - kind: other
        ref: "git diff --numstat spec/behaviors/02-shared-layers-and-tags.md shows '38 0' (0 deletions)"
        status: pass
      - kind: other
        ref: "grep -c 'ADR-EC-026\\|026-registration-time' spec/behaviors/02-shared-layers-and-tags.md == 2"
        status: pass
    human_judgment: true
    rationale: "0 deletions proves the append-only structural constraint; whether the appended content is factually accurate against 10-07-SUMMARY.md and ADR-EC-026's real wording is a semantic reading a human should confirm."
  - id: D4
    description: "spec/traceability.md's §2 INV-EC-002 row (Mechanism/Test cells) reconciled with the corrected invariants.md paragraphs; §4's disk-vs-table cross-check re-run in both directions and recorded clean"
    requirement: "RUN-03"
    verification:
      - kind: other
        ref: "pnpm verify:spec (PASS 7/7, 279 links); manual disk cross-check (find packages/*/test -name '*.test.ts' -o -name '*.types.ts' vs §4 table, comm -23/-13 both empty)"
        status: pass
    human_judgment: false
  - id: D5
    description: "RUN-03 marked Complete in .planning/REQUIREMENTS.md (checklist line 39 and traceability table), gated behind all thirteen repository gates exiting 0 in this plan's own session, run BEFORE either requirement row was edited"
    requirement: "RUN-03"
    verification:
      - kind: other
        ref: "pnpm build && pnpm typecheck:test && pnpm lint && pnpm test && pnpm circular && pnpm verify:pack && pnpm verify:spec && pnpm verify:tsgo-gate && pnpm verify:oxlint-plugin && pnpm verify:no-runner-dep && pnpm verify:testapi-seam && pnpm verify:tags-filter && pnpm verify:shared-layer-once"
        status: pass
    human_judgment: false
  - id: D6
    description: "RUN-04 marked Complete in .planning/REQUIREMENTS.md (checklist line 40 and traceability table), gated behind the same green thirteen-gate sweep"
    requirement: "RUN-04"
    verification:
      - kind: other
        ref: "pnpm build && pnpm typecheck:test && pnpm lint && pnpm test && pnpm circular && pnpm verify:pack && pnpm verify:spec && pnpm verify:tsgo-gate && pnpm verify:oxlint-plugin && pnpm verify:no-runner-dep && pnpm verify:testapi-seam && pnpm verify:tags-filter && pnpm verify:shared-layer-once"
        status: pass
    human_judgment: false

duration: 8min
completed: 2026-08-30
status: complete
---

# Phase 10 Plan 08: Record the Zero-Runnable-Scenario Clause and Re-Mark RUN-03/RUN-04 Summary

**Corrected `spec/invariants.md` and `spec/behaviors/02-shared-layers-and-tags.md` to describe the zero-runnable-Scenario build-discipline clause plan 10-07 made true, fixed a duplicated misdescription of `scripts/verify-shared-layer-once.sh` in two files, and re-marked RUN-03/RUN-04 Complete in `.planning/REQUIREMENTS.md` only after re-running all thirteen repository gates green in this session.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-08-30T13:37:00Z (approximate)
- **Completed:** 2026-08-30T13:44:48Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- `spec/invariants.md`'s INV-EC-002 Mechanism paragraph now states the shared tier is built around every node whose BODY needs it, not every node the Feature emits, and names the caller-visible consequence: a Feature filtered down to zero Scenarios never builds its shared tier.
- The same entry's Assertions paragraph names plan 10-07's `emission.test.ts` regression block by its exact `describe` title and corrects a misdescription of `scripts/verify-shared-layer-once.sh` that had been carried since plan 10-06: the script runs THREE real CLI invocations (not two), the build-once claim is carried as two INDEPENDENT "passed" assertions (not a compared count), and the whole-vs-filtered claim is a STATUS equality on the clock-isolation Scenario (not a build-count comparison).
- `spec/behaviors/02-shared-layers-and-tags.md`'s BEH-EC-007 gains a second dated correction, appended below the existing one in the same blockquote format, quoting ADR-EC-026's real registration-time exclusion wording and naming the exact mutation pair (plan 10-07 Task 3) that proves the new assertion is non-vacuous. The fenced REQUIREMENT block is byte-identical — `git diff --numstat` shows 0 deletions on the file.
- `spec/traceability.md`'s §2 INV-EC-002 row (Mechanism and Test cells) brought into agreement with the corrected `spec/invariants.md` paragraphs; §4's disk-vs-table cross-check re-run in both directions and recorded clean (32 files on disk, 32 named, no orphans in either direction) — confirming plan 10-07 needed no new §4 row because it appended to an already-listed file.
- `.planning/REQUIREMENTS.md`'s RUN-03 and RUN-04 marked Complete again — checklist lines 39-40 and the traceability table — only after all thirteen repository gates were re-run in this plan's own session and every one exited 0.

## Task Commits

Each task was committed atomically:

1. **Task 1: The invariant and the behavior gain the clause the fix made true** - `e63ba4f` (docs)
2. **Task 2: Traceability, the two requirement rows, and the gate sweep that gates them** - `6b95833` (docs)

**Plan metadata:** committed alongside this SUMMARY (see final commit in this plan's history)

## Files Created/Modified

- `spec/invariants.md` — INV-EC-002's Mechanism paragraph narrowed to "every node whose body needs it"; Assertions paragraph adds the 10-07 zero-runnable-Scenario test block and corrects the `verify-shared-layer-once.sh` misdescription
- `spec/behaviors/02-shared-layers-and-tags.md` — BEH-EC-007's second dated correction appended (0 deletions)
- `spec/traceability.md` — §2's INV-EC-002 row's Mechanism/Test cells reconciled with `invariants.md`; reformatted with `dprint fmt` (column realignment only, verified by diff)
- `.planning/REQUIREMENTS.md` — RUN-03/RUN-04 checklist lines and traceability table rows marked Complete

## Decisions Made

See `key-decisions` in the frontmatter above. In brief:
- §4 of `spec/traceability.md` gained no new row — plan 10-07 appended to an already-listed file, confirmed by a two-direction disk cross-check.
- `packages/vitest/README.md` and `src/index.ts`'s doc comment were read and found clean — both make the "built exactly once" claim without asserting anything about the zero-runnable-Scenario case, so the fix does not make either sentence false.
- `spec/traceability.md` needed a `dprint fmt` pass after the table-cell edit purely for column-width realignment (verified via `git diff` to contain no content change).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `node_modules` missing at worktree start; installed via `pnpm install --frozen-lockfile`**
- **Found during:** Task 1, first `pnpm lint` invocation
- **Issue:** The worktree had no `node_modules`, so `oxlint`/`dprint`/`vitest`/etc. were all unavailable — every gate in both tasks would have failed on "command not found" rather than on any real defect.
- **Fix:** Ran `pnpm install --frozen-lockfile`, the sole command this plan's own threat model (T-10-08-SC) permits for exactly this situation — it restores the already-declared dependency set from the committed lockfile with no manifest or lockfile edit.
- **Files modified:** none (node_modules is gitignored; no package.json/pnpm-lock.yaml change)
- **Verification:** `pnpm lint` and all subsequent gates ran and reported real PASS/FAIL results afterward.
- **Committed in:** not committed — `node_modules` is gitignored, nothing to commit.

**2. [Rule 1 - Bug] `spec/traceability.md` needed a `dprint fmt` pass after the §2 table-cell edit**
- **Found during:** Task 2, first `pnpm lint` invocation
- **Issue:** `dprint check` failed on `spec/traceability.md` — a markdown table's column widths are recomputed from the widest cell, and lengthening the INV-EC-002 row's Mechanism/Test cells shifted every other row's padding out of alignment with what `dprint` expects.
- **Fix:** Ran `node_modules/.bin/dprint fmt spec/traceability.md`, then verified via `git diff` that the resulting change was column-width realignment only (8 lines touched, all in the same table, no wording changed) before re-running `pnpm lint` to confirm it now passed.
- **Files modified:** `spec/traceability.md`
- **Verification:** `git diff spec/traceability.md` reviewed line-by-line; `pnpm lint` exit 0 afterward.
- **Committed in:** `6b95833` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking dependency-install, 1 formatting bug). Neither touched scope beyond what this plan's own tasks required. No architectural change.

## Issues Encountered

None beyond the two deviations documented above.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- RUN-03 and RUN-04 are Complete in `.planning/REQUIREMENTS.md`, backed by a thirteen-gate sweep run in this session (not inherited from plan 10-07's own SUMMARY).
- No document in the repo now describes the `shared` Layer's build discipline, or `scripts/verify-shared-layer-once.sh`'s assertions, in terms the code does not support — D-05's standing rule for Phase 10 holds.
- CR-01 (`BeforeAllScenarios` scoped-resource release timing, `10-VERIFICATION.md`) remains untouched and out of scope for this plan, exactly as the plan's `<objective>` states — it predates Phase 10 and is orthogonal to Layer-scope choice. Flagged as a candidate follow-up phase before Phase 11's dogfooded acceptance suite exercises the `shared` + `BeforeAllScenarios` combination.
- Phase 11 (Composition Root and Dogfooded Acceptance Suite) depends on all prior phases, including this plan's RUN-03/RUN-04 completion, and is now unblocked on that front.

## Self-Check: PASSED

Both modified spec files, the traceability file, and `.planning/REQUIREMENTS.md` confirmed present on disk with the expected content; both commit hashes (`e63ba4f`, `6b95833`) confirmed present in `git log --oneline --all`.

---
*Phase: 10-layer-scopes-per-scenario-default-shared*
*Completed: 2026-08-30*

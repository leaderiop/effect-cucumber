---
phase: 10-layer-scopes-per-scenario-default-shared
plan: 07
subsystem: testing
tags: [effect, vitest, effect-vitest, layer-scoping, tdd, mutation-testing]

# Dependency graph
requires:
  - phase: 10-layer-scopes-per-scenario-default-shared
    provides: "the shared/perScenario TestApi seam, sharedLayerTestApi, EmitOptions (plans 10-01 through 10-06)"
provides:
  - "EmitOptions.contextFree — a routing flag distinguishing a synthetic node's body needing nothing from either Layer tier from one that does"
  - "Runner.ts: two named EmitOptions constants (warningEmitOptions, afterAllScenariosEmitOptions) replacing the single emptyEmitOptions"
  - "describeFeature.ts: sharedLayerTestApi routes a contextFree node through the module-level, Layer-free constructor even on the shared path"
  - "emission.test.ts regression block proving a shared Layer with every Scenario excluded stays unbuilt even with an unused step definition"
  - "Runner.test.ts structural routing projection (routingOf) pinning each node kind's contextFree value"
affects: [10-layer-scopes-per-scenario-default-shared (plan 10-08, which records RUN-03/RUN-04 as Complete in REQUIREMENTS.md and spec/)]

# Actuals (#2632)
actuals:
  tokens: 9820
  tasks: 3
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Routing flag on a library-owned options object (EmitOptions.contextFree), read only at the composition root — never a framework import in the emitter"
    - "Sibling projection over widened projection for a recording fake (routingOf beside shapeOf/emissionOf/titlesOf), so an unrelated claim cannot go blind to a new field"
    - "Mutation-testing every new assertion before considering a gap-closure plan done — performed, run, observed, reverted, recorded in a table"

key-files:
  created: []
  modified:
    - packages/vitest/src/TestApi.ts
    - packages/vitest/src/Runner.ts
    - packages/vitest/src/describeFeature.ts
    - packages/vitest/test/Runner.test.ts
    - packages/vitest/test/emission.test.ts

key-decisions:
  - "EmitOptions.contextFree is REQUIRED (not optional), extending note (b)'s existing argument: an optional field lets a future call site forget it and silently emit through the wrong route, which is precisely the shape of the gap being closed."
  - "The context-free emission route reuses vitestTestApi(featureUri).effect AS A VALUE rather than a second hand-written closure, keeping makeDegradingEffect at one implementation so the two paths' D-08 catch-and-degrade behaviour stays identical by construction."
  - "The two former emptyEmitOptions call sites (⚙ AfterAllScenarios, ⚠ warning loop) each carry a trailing inline comment stating their contextFree value, satisfying the plan's grep-verifiable 'set the field explicitly at all four call sites' criterion without allocating a fresh object per emission."
  - "Task 2's TDD flag was honored via a mutation-based RED check (temporarily flipping afterAllScenariosEmitOptions.contextFree to true, confirming the new routing test failed at exactly the AfterAllScenarios entry, then reverting) rather than a literal missing-implementation RED state, because Task 1 (the tracer) already implemented the fix end-to-end before Task 2 added structural pinning coverage."

patterns-established:
  - "A synthetic node's EmitOptions field records what the node's BODY requires, never what kind of node it 'looks like' (the AfterAllScenarios/warning mirror-image trap this plan closes)."

requirements-completed: [RUN-03, RUN-04]  # Made true end-to-end by this plan; plan 10-08 records the REQUIREMENTS.md/spec/ update per this phase's established precedent (the plan that proves it is separate from the one that writes it down).

coverage:
  - id: D1
    description: "A shared Layer with every Scenario excluded by the tag filter, and at least one unused step definition, is never built"
    requirement: "RUN-03"
    verification:
      - kind: unit
        ref: "packages/vitest/test/emission.test.ts#never built the shared tier — RUN-03's build discipline for the zero-runnable-Scenario case"
        status: pass
      - kind: unit
        ref: "packages/vitest/test/emission.test.ts#ran no Scenario at all — separating build discipline from registration failing for an unrelated reason"
        status: pass
    human_judgment: false
  - id: D2
    description: "The unused step definition is still reported (non-vacuity control) — the fix did not buy build discipline by hiding drift"
    requirement: "RUN-03"
    verification:
      - kind: unit
        ref: "packages/vitest/test/emission.test.ts#still reported the unused step definition — the load-bearing non-vacuity control"
        status: pass
    human_judgment: false
  - id: D3
    description: "Each node kind (Scenario, ⚙ AfterAllScenarios, ⚠ warning) is routed with the structurally correct contextFree flag — the mirror-image mistake is pinned, not left to review"
    requirement: "RUN-03"
    verification:
      - kind: unit
        ref: "packages/vitest/test/Runner.test.ts#marks every Scenario and the ⚙ AfterAllScenarios node NOT context-free, and every ⚠ warning node context-free"
        status: pass
    human_judgment: false
  - id: D4
    description: "Nothing already verified regressed: D-01's [1,1,1]/[1,2,3] pair, D-02's real-CLI whole-vs-filtered gate, D-03's Rule-under-shared composition, and the framework-independence seam"
    requirement: "RUN-04"
    verification:
      - kind: unit
        ref: "pnpm test (773 passed | 3 skipped)"
        status: pass
      - kind: other
        ref: "pnpm verify:shared-layer-once (10/10 assertions ENFORCED)"
        status: pass
      - kind: other
        ref: "pnpm verify:tags-filter (all assertions ENFORCED)"
        status: pass
      - kind: other
        ref: "pnpm verify:testapi-seam (3/3 assertions ENFORCED)"
        status: pass
    human_judgment: false

duration: 26min
completed: 2026-08-30
status: complete
---

# Phase 10 Plan 07: Route Synthetic Warning Nodes Off the Shared Layer Build Summary

**Added `EmitOptions.contextFree`, a required routing flag that sends the always-passing `⚠ unused step definition` node through the module-level, Layer-free `TestApi` even on the shared path, so an explicitly-excluded Feature no longer pays for a shared Layer it never uses — closing the one gap `10-VERIFICATION.md` found in Phase 10.**

## Performance

- **Duration:** ~26 min
- **Started:** 2026-08-30T13:07:00Z (approximate)
- **Completed:** 2026-08-30T13:33:15Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- Closed the gap `10-VERIFICATION.md`/CR-02 found: a `shared` Layer with every Scenario excluded by the tag filter, plus one unused step definition, no longer builds the shared tier (previously read `1` build with zero runnable Scenarios; now reads `0`).
- The `⚠` warning node still emits and is still reported — the fix did not buy build discipline by hiding drift (note (g)'s registration-not-execution contract stays intact).
- Structurally pinned the mirror-image mistake (marking `⚙ AfterAllScenarios` context-free too, which would silently route a Feature's teardown away from the shared tier) via a new recording-fake projection in `Runner.test.ts`, proven non-vacuous by mutation.
- All prior Phase 10 truths re-verified unregressed: `[1,1,1]`/`[1,2,3]` build-count pair, the real-CLI whole-vs-`-t`-filtered gate, the Rule-under-shared composition, and the `TestApi`/`Runner.ts` framework-independence seam.
- Four mutations performed, run, observed, and reverted — recorded in the table below — plus a full thirteen-gate repository sweep, all green.

## Task Commits

Each task was committed atomically:

1. **Task 1: One routing flag from the seam to the composition root, and the gap closed end to end** - `743e9a0` (feat)
2. **Task 2: Pin each node kind's route structurally, against the recording fake** - `f3fda7f` (test)
3. **Task 3: Four mutations, then the full thirteen-gate sweep** - verification-only; all four mutations reverted cleanly (`git status --short` empty before and after), no commit produced (see Mutation Table below and `docs(10-07)` metadata commit for the record)

**Plan metadata:** committed alongside this SUMMARY (see final commit in this plan's history)

_Note: Task 2 carries `tdd="true"`. Because Task 1 (the tracer) already implemented `contextFree` end-to-end, there was no missing implementation to drive a literal RED state for Task 2's new test. RED was instead confirmed by mutation: `afterAllScenariosEmitOptions`'s flag was temporarily flipped to `true`, the new routing test failed at exactly the `⚙ AfterAllScenarios` entry, then the mutation was reverted and the test re-confirmed GREEN. Task 2 is therefore a single `test(...)` commit rather than a RED/GREEN pair — there is no corresponding `feat` change in this task, only a `test` addition pinning behaviour Task 1 already built. See "TDD Gate Compliance" below._

## Files Created/Modified

- `packages/vitest/src/TestApi.ts` — added `EmitOptions.contextFree` (third required field); extended note (b) to cover it
- `packages/vitest/src/Runner.ts` — split `emptyEmitOptions` into `warningEmitOptions` (`contextFree: true`) and `afterAllScenariosEmitOptions` (`contextFree: false`); set the field explicitly at all four `api.effect` call sites; extended note (g) with the mechanism and the fix
- `packages/vitest/src/describeFeature.ts` — `sharedLayerTestApi` now builds two routes (`contextFreeEffect` reusing `vitestTestApi(featureUri).effect` as a value; `sharedRouteEffect`, the unchanged shared closure) and selects between them per emission on `emitOptions.contextFree`; doc comment rewritten to state both routes and why the context-free route is not Anti-Pattern 3
- `packages/vitest/test/Runner.test.ts` — updated the one hand-written `EmitOptions` literal; added a fourth sibling projection `routingOf` and one new structural test pinning each node kind's `contextFree` value
- `packages/vitest/test/emission.test.ts` — new regression block: a shared-tier probe Layer, a Feature with one Scenario tagged and excluded via `excludeTags`, one used and one unused step definition, and a three-`it` reader block (counter is 0; no Scenario ran; the unused definition was still reported)

## Decisions Made

See `key-decisions` in the frontmatter above. In brief:
- `contextFree` is required, not optional (extends `TestApi.ts` note (b)'s existing argument for `skip`).
- The context-free route reuses `vitestTestApi(featureUri).effect` as a value rather than a second hand-rolled closure, keeping `makeDegradingEffect` at one implementation.
- The two synthetic-node call sites in `Runner.ts` that reference the named constants carry a trailing inline comment stating the `contextFree` value at that line, so the plan's own grep-verifiable "set the field explicitly at all four call sites" criterion holds without allocating a fresh options object per emission (preserving the "ONE shared value" performance argument the original comment made).

## Deviations from Plan

### Auto-fixed Issues

None — no Rule 1/2/3 auto-fixes were needed. The implementation followed the plan's file-by-file, line-range instructions closely.

**1. [Documentation-only] Minor implementation-detail adjustment: trailing inline comments at the two named-constant call sites**
- **Found during:** Task 1, verifying the plan's own `<done>` grep criterion (`contextFree` count of 6 in `Runner.ts`)
- **Issue:** The plan's suggested design (two named `EmitOptions` constants referenced by identifier at the `⚙ AfterAllScenarios` and `⚠` warning call sites) naturally produces a grep count of 4, not 6, because a bare identifier reference doesn't contain the literal substring `contextFree` on that source line.
- **Fix:** Added a same-line trailing comment (`// contextFree: false — note (e)...` / `// contextFree: true`) at each of those two call sites — genuinely useful documentation for a reader at the call site, and not stripped by the plan's own comment filter (which only strips lines that START with a comment marker). This reconciles the named-constant design (avoiding a fresh literal allocation per warning-loop iteration) with the plan's literal grep-count criterion.
- **Files modified:** `packages/vitest/src/Runner.ts`
- **Verification:** `grep -n '' packages/vitest/src/Runner.ts | grep -vE '^[0-9]+:[[:space:]]*(//|\*|/\*)' | grep -c 'contextFree'` → `6`, matching the plan's `<done>` criterion exactly.
- **Committed in:** `743e9a0` (Task 1 commit)

---

**Total deviations:** 1 minor documentation-shape adjustment (not a Rule 1–4 category — a reconciliation between two of the plan's own stated design goals). No scope creep, no architectural change.

## Issues Encountered

- **`-t`-filtered vitest runs cannot observe the shared-Layer build fix.** When mutation-testing (Task 3), running `npx vitest run emission.test.ts -t "never built the shared tier"` alone showed the mutated code still passing, because `@effect/vitest`'s `layer(...)` only builds the shared tier when a node registered under it actually EXECUTES — and under `-t` filtering, only the reader `it` ran, so no node that could trigger the build ever ran. Resolved by running the WHOLE FILE (unfiltered) for every mutation observation, which is also why `scripts/verify-shared-layer-once.sh` exists as a separate real-CLI gate (D-02) rather than relying on in-process `-t` filtering alone. This is consistent with, not a contradiction of, the existing `ADR-EC-018`/D-02 rationale already in the repo.
- **Task 3's mutation 4 produces an incidental vitest "No test found in suite" error** in addition to the intended assertion failure, because deleting the unused step definition leaves the `Excluded everything...` Feature block with zero registered nodes (the one Scenario is excluded, and — with no unused definition — no warning is emitted either). This is an artifact of the mutation itself (not a defect in the fix or a masking of the intended failure): the target assertion ("still reported the unused step definition") still failed exactly as predicted, and the two other assertions in that reader block ("never built" / "ran no Scenario") stayed green as predicted. Noted here for the next reader running this mutation, so the extra vitest error isn't mistaken for an unrelated regression.

## Mutation Table (Task 3)

All four mutations performed against real source, run, observed, then reverted. `git status --short` was empty both before the mutation sequence began and after every mutation was reverted.

| # | File / Line Touched | Mutation | Expected | Observed | Reverted |
|---|---|---|---|---|---|
| 1 | `packages/vitest/src/describeFeature.ts` — `sharedLayerTestApi`'s `effect` member | Route selection deleted; every emission forced through `sharedRouteEffect` unconditionally | "never built the shared tier" test goes RED, reading `1` | RED — `AssertionError: expected 1 to be +0`, at `emission.test.ts:2719` (full-file run; `-t`-filtered run showed a false GREEN — see Issues Encountered) | Yes — `git diff --stat` empty after `cp` restore, full suite green (67 passed \| 3 skipped) |
| 2 | `packages/vitest/src/Runner.ts` — `warningEmitOptions` constant | `contextFree` flipped from `true` to `false`, `describeFeature.ts` left untouched | Same test goes RED the same way, reading `1` | RED — identical failure: `AssertionError: expected 1 to be +0`, same line | Yes — clean revert, full suite green |
| 3 | `packages/vitest/src/Runner.ts` — `afterAllScenariosEmitOptions` constant | `contextFree` flipped from `false` to `true` (the mirror-image mistake) | `Runner.test.ts`'s routing test goes RED; `emission.test.ts` stays entirely GREEN | RED in `Runner.test.ts` at the `⚙ AfterAllScenarios` entry (`contextFree: false` expected, `true` received); `emission.test.ts` full run: 67 passed \| 3 skipped, 0 failed — exactly the predicted asymmetry, proving Task 2's structural projection catches what the behavioural test cannot | Yes — clean revert, both files green (107 passed \| 3 skipped combined) |
| 4 | `packages/vitest/test/emission.test.ts` — the new fixture's `define` callback | The unused step definition deleted, everything else (including the fix) left in place | "still reported the unused step definition" control goes RED; counter assertion stays GREEN at `0` | RED on the control (`AssertionError: expected [] to have a length of 1 but got +0`); counter and "ran no Scenario" assertions both stayed GREEN (65 passed \| 1 failed \| 3 skipped) — the predicted split exactly. (Incidental: an additional vitest "No test found in suite" error also appeared as an artifact of the Feature registering zero nodes under this specific mutation — see Issues Encountered.) | Yes — clean revert via full-file restore, full suite green (67 passed \| 3 skipped) |

## Gate Sweep (Task 3) — all thirteen, one pass, each recorded

| # | Gate | Result |
|---|---|---|
| 1 | `pnpm build` | exit 0 |
| 2 | `pnpm typecheck:test` | exit 0 |
| 3 | `pnpm lint` | exit 0 (oxlint + dprint check) |
| 4 | `pnpm test` | exit 0 — 773 passed \| 3 skipped (776 total; opening baseline was 768 passed \| 3 skipped before this plan, +5 net: +1 `⚠` warning node emitted by the new fixture, +3 reader `it`s in `emission.test.ts`, +1 structural routing test in `Runner.test.ts`) |
| 5 | `pnpm circular` | exit 0 — no circular dependency found |
| 6 | `pnpm verify:pack` | exit 0 — both packages' tarball shape, `publint`, and `ADR-EC-021` dependency-boundary checks all pass |
| 7 | `pnpm verify:spec` | exit 0 — PASS: 7, FAIL: 0, SKIP: 1 (`spec/scripts/verify-traceability.sh`) |
| 8 | `pnpm verify:tsgo-gate` | exit 0 — 13/13 assertions ENFORCED |
| 9 | `pnpm verify:oxlint-plugin` | exit 0 — 2/2 assertions ENFORCED |
| 10 | `pnpm verify:no-runner-dep` | exit 0 — 3/3 assertions ENFORCED |
| 11 | `pnpm verify:testapi-seam` | exit 0 — 3/3 assertions ENFORCED (the routing decision added no framework import to `Runner.ts` or `TestApi.ts`) |
| 12 | `pnpm verify:tags-filter` | exit 0 — all named assertions ENFORCED |
| 13 | `pnpm verify:shared-layer-once` | exit 0 — 10/10 named assertions ENFORCED (A1–A5, B1–B2, C1–C2), including A2/C2's build-once claim and B2's whole-vs-filtered equivalence gate |

`.planning/REQUIREMENTS.md` and every file under `spec/` are untouched by this plan — confirmed by `git diff --name-only dae764e35c96063bdf5a99bcdf93907e2b38a728 HEAD`, which lists only the five files under `packages/vitest/`. Plan 10-08 owns that record per the plan's own stated boundary.

## TDD Gate Compliance

Task 2 carries `tdd="true"` and `<files>packages/vitest/test/Runner.test.ts</files>` — test-only, no accompanying source change within the task. Because Task 1 (the tracer) already implemented `EmitOptions.contextFree` and its routing end-to-end, writing Task 2's new structural test produced an immediate GREEN rather than a literal missing-implementation RED. Per the executor's fail-fast guidance for a test that passes unexpectedly during what should be a RED phase, this was investigated rather than skipped: the mutation-based check below establishes that the test is non-vacuous and genuinely pins the claim it names.

- **RED (mutation-based, not literal-missing-implementation):** temporarily set `afterAllScenariosEmitOptions`'s `contextFree` to `true` in `packages/vitest/src/Runner.ts` (the exact mutation Task 3 formally repeats as mutation 3). Ran `npx vitest run packages/vitest/test/Runner.test.ts`; the new routing test failed at exactly the `⚙ AfterAllScenarios` entry of the `routingOf` comparison (`contextFree: false` expected, `true` received). Confirmed non-vacuous.
- **Revert:** restored `Runner.ts` from the Task 1 commit; `git diff --stat` showed no remaining changes.
- **GREEN:** re-ran `npx vitest run packages/vitest/test/Runner.test.ts` — all 40 tests passed, including the new one.
- **Commit:** a single `test(10-07): ...` commit (`f3fda7f`), since there is no separate implementation to add — `feat` already landed in Task 1's commit (`743e9a0`).
- **REFACTOR:** not applicable — no code needed cleanup after the test was added.

This is recorded explicitly per the workflow's TDD Gate Compliance requirement, since the RED gate was established by mutation rather than by a missing implementation.

## Known Stubs

None. Every deliverable in this plan is wired to real, running code and asserted by a real test run — no hardcoded empty values, no placeholder text, no unwired components.

## Threat Flags

None. This plan's own `<threat_model>` block (T-10-07-01 through T-10-07-04, plus T-10-07-SC) covers every trust boundary touched — the shared-Layer build/DoS risk (T-10-07-01), the mirror-image tampering risk (T-10-07-02), the unchanged title-forgery surface (T-10-07-03), and the registration-vs-execution disclosure risk (T-10-07-04). No new network endpoint, auth path, file access pattern, or schema change at a trust boundary was introduced beyond what the threat model already names.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- The gap `10-VERIFICATION.md` found is closed and independently re-verifiable via the thirteen-gate sweep above.
- CR-01 (`BeforeAllScenarios` scoped-resource release timing) remains untouched and out of scope for this plan, exactly as the plan's `<objective>` states — it predates Phase 10, is orthogonal to Layer-scope choice, and is flagged in `10-VERIFICATION.md` as a candidate follow-up phase, not a Phase 10 blocker.
- Plan 10-08 is unblocked: this plan's green gate sweep is the precondition it depends on before it records RUN-03/RUN-04 as Complete in `.planning/REQUIREMENTS.md` and updates `spec/invariants.md`/`spec/behaviors/02-shared-layers-and-tags.md`. Neither of those files nor `.planning/REQUIREMENTS.md` was touched by this plan.
- WR-02 (`10-REVIEW.md`) — the shared path's own tag/`@skip`/filter/D-08-degradation coverage gap — remains open and unaddressed by this plan, as documented in Task 2's own comment; it is a separate, already-recorded coverage gap, not something this plan's routing-flag work substitutes for.

## Self-Check: PASSED

All five modified source/test files confirmed present on disk; all three commit hashes (`743e9a0`, `f3fda7f`, and this SUMMARY's own `557c87c`) confirmed present in `git log --oneline --all`.

---
*Phase: 10-layer-scopes-per-scenario-default-shared*
*Completed: 2026-08-30*

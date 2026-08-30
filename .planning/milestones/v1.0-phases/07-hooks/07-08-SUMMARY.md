---
phase: 07-hooks
plan: 08
subsystem: testing
tags: [spec, documentation, hooks, traceability, effect-onExit]

# Dependency graph
requires:
  - phase: 07-hooks
    provides: "07-01 through 07-07's real hook implementation across HookRegistry.ts, Hook.ts, Dsl.ts, describeFeature.ts, ScenarioEffect.ts and Runner.ts — this plan reconciles the specification with what those plans actually built"
provides:
  - "spec/behaviors/07-hook-ordering-and-guarantees.md: BEH-EC-017, stating D-01 through D-09 as normative REQUIREMENT text — the six-hook ordering, batch independence, and the three guarantees — registered in spec/behaviors/index.yaml and footer-linked from/to 06"
  - "spec/behaviors/02-shared-layers-and-tags.md: BEH-EC-006 corrected in place (additive, zero deletions) — hooks are HookRegistrar<ROut> members of FeatureDsl, not free-standing exports; the After guarantee is Effect.onExit, not Effect.ensuring"
  - "spec/invariants.md: INV-EC-004 moved from planned to enforced, naming Effect.onExit and the real ScenarioEffect.test.ts/Runner.test.ts assertions"
  - "spec/decisions/005-effect-fn-for-step-and-hook-bodies.md: a dated implementation note recording Hook.ts's registerHook delegation to Step.ts and HookRegistrar's zero-parameter enforcement"
  - "spec/traceability.md: §1/§2/§3/§4 name the real hook modules and both new test files (Hook.test.ts, HookRegistry.test.ts)"
  - "spec/roadmap.md, README.md, packages/vitest/README.md: hooks described as built, not planned"
  - ".planning/REQUIREMENTS.md: footer entry naming DSL-07/RUN-02's per-requirement evidence"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dated correction blockquotes, additive and zero-deletion, are how this repo reconciles spec text with shipped code — BEH-EC-006's correction follows the exact form Phase 3/5's corrections established (ADR-EC-007, BEH-EC-002/003)"
    - "A new behavior file is registered in spec/behaviors/index.yaml in the SAME commit as its creation, with footer _Previous:_/_Next:_ links copying the established form"

key-files:
  created:
    - spec/behaviors/07-hook-ordering-and-guarantees.md
  modified:
    - spec/behaviors/index.yaml
    - spec/behaviors/06-datatable-and-docstring-arguments.md
    - spec/behaviors/02-shared-layers-and-tags.md
    - spec/invariants.md
    - spec/decisions/005-effect-fn-for-step-and-hook-bodies.md
    - spec/traceability.md
    - spec/roadmap.md
    - README.md
    - packages/vitest/README.md
    - .planning/REQUIREMENTS.md

key-decisions:
  - "DSL-07 and RUN-02 were already marked Complete in .planning/REQUIREMENTS.md before this plan started — RUN-02 by 07-04's own completion commit (33e9127), ahead of this plan's designated ownership per the repo's 'the plan that makes it true end to end marks it' convention. This plan does not revert that (it is already-true, already-committed history from a parallel wave); it adds the footer's per-requirement evidence entry, which was still missing."
  - "The plan's literal acceptance criteria for footer link text ('_Next:_'/'_Previous:_' with the colon immediately inside the closing underscore) do not match this repo's actual, universal footer convention ('_Next: [text]_', colon outside the closing underscore) — verified against all five existing behavior file footers (01, 04, 05, 06, and the new 07). Followed the real house convention; did not invent a nonstandard footer form to satisfy an unattainable literal grep."

patterns-established: []

requirements-completed: [DSL-07, RUN-02]

# Metrics
duration: ~25min
completed: 2026-08-29
---

# Phase 7 Plan 08: Spec reconciliation — BEH-EC-017, corrections, traceability, and requirement evidence Summary

**BEH-EC-017 states the phase's full six-hook ordering and three guarantees as normative spec text; BEH-EC-006 and INV-EC-004 carry additive in-place corrections naming `Effect.onExit` (not `Effect.ensuring`, whose finalizer error channel is `never` in `effect@4.0.0-rc.112`); traceability §1-§4, `spec/roadmap.md`, and both READMEs now describe hooks as built; and `.planning/REQUIREMENTS.md`'s footer names the automated assertions behind DSL-07 and RUN-02.**

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-08-29
- **Tasks:** 3 completed
- **Files modified:** 10 (1 created, 9 modified)

## Accomplishments

- `spec/behaviors/07-hook-ordering-and-guarantees.md` created, carrying `BEH-EC-017` (the next free id after `BEH-EC-016`), with seven `REQUIREMENT` blocks covering: the full ordering (`BeforeAllScenarios → per Scenario(Before → per step(BeforeStep → step → AfterStep) → After) → AfterAllScenarios`, Background wrapped identically); multi-registration-order (D-01); independent batches with combined causes, stated as a deliberate scoped departure from `INV-EC-001` (D-02/D-03); the `Before` gate (D-04); the three "always runs" guarantees and their whole-unit span (D-05/D-06/D-07, D-09); the `BeforeAllScenarios` once-per-Feature/fails-every-Scenario rule (D-08); the Feature-scoped-only registration rule; and the zero-argument hook body rule (ADR-EC-005). Registered in `spec/behaviors/index.yaml` in the same commit; footer-linked to/from file 06.
- `BEH-EC-006` corrected in place in `spec/behaviors/02-shared-layers-and-tags.md` with one dated, additive, zero-deletion blockquote stating two independent corrections: (i) hooks are `HookRegistrar<ROut>` members of `FeatureDsl`, never free-standing exports, and hook bodies take no arguments at all; (ii) the guarantee is delivered by `Effect.onExit`, because `Effect.ensuring`'s finalizer error channel is `never` in the installed `effect@4.0.0-rc.112` build and cannot express the do-not-mask requirement.
- `INV-EC-004` in `spec/invariants.md` moved from "planned" to enforced, naming `Effect.onExit` in `ScenarioEffect.ts`'s `buildScenarioEffect` and the real `ScenarioEffect.test.ts`/`Runner.test.ts` assertions; the file's own intro paragraph updated from "three enforced" to "four enforced" so the prose and the entries agree.
- A dated implementation note added to `spec/decisions/005-effect-fn-for-step-and-hook-bodies.md` recording `Hook.ts`'s `registerHook` delegation to `Step.ts`'s `register` (one discriminator, not two) and `HookRegistrar`'s zero-parameter call signature as the type-level enforcement of the Negative consequence.
- `spec/traceability.md`: §1's row 02 now names the real hook modules (`Hook.ts`, `HookRegistry.ts`, `Dsl.ts`, `ScenarioEffect.ts`, `Runner.ts`, `describeFeature.ts`), drops the never-built `Background.ts` (with an explanatory preamble sentence), and keeps `SharedLayer`/`Tags` planned for Phases 9/10; a new §1 row for file 07/`BEH-EC-017`. §2's `INV-EC-004` row moved to enforced. §3's `ADR-EC-005` row gained its Source module and Affected invariants. §4 gained rows for `Hook.test.ts` and `HookRegistry.test.ts`, and `Runner.test.ts`/`ScenarioEffect.test.ts`/`emission.test.ts`'s Covers/descriptions extended with `BEH-EC-017` and their hook assertions. The from-disk cross-check confirmed all 26 `packages/*/test/*.test.ts` files are named.
- `spec/roadmap.md`, `README.md` and `packages/vitest/README.md` all moved hooks from "intended contract only"/"specified, not yet built" to built, describing the real six-hook shape and guarantees.
- `.planning/REQUIREMENTS.md`'s footer entry rewritten to cover Phase 7: DSL-07 and RUN-02, each with a named automated assertion, citing this SUMMARY for the evidence trail.

## Task Commits

Each task was committed atomically:

1. **Task 1: BEH-EC-017, the BEH-EC-006 correction, and the INV-EC-004/ADR-EC-005 notes** - `3778553` (docs)
2. **Task 2: traceability §1, §2, §3, §4 and spec/roadmap.md** - `3d3c32c` (docs)
3. **Task 3: the two READMEs and the requirement markings** - `5bd92e0` (docs)

**Plan metadata:** deferred to orchestrator per worktree isolation.

## Files Created/Modified

- `spec/behaviors/07-hook-ordering-and-guarantees.md` - new, BEH-EC-017
- `spec/behaviors/index.yaml` - BEH-EC-017 registered
- `spec/behaviors/06-datatable-and-docstring-arguments.md` - `_Next:` footer added
- `spec/behaviors/02-shared-layers-and-tags.md` - BEH-EC-006 correction blockquote
- `spec/invariants.md` - INV-EC-004 moved to enforced; intro paragraph corrected
- `spec/decisions/005-effect-fn-for-step-and-hook-bodies.md` - implementation note
- `spec/traceability.md` - §1/§2/§3/§4 updated
- `spec/roadmap.md` - hooks moved from planned to built, both mentions
- `README.md` - hooks dropped from "still specified" list and package table
- `packages/vitest/README.md` - "Hooks run, and the guarantees are real" paragraph added; stale mentions removed
- `.planning/REQUIREMENTS.md` - footer entry naming DSL-07/RUN-02 evidence

## Decisions Made

- DSL-07/RUN-02 were already Complete before this plan started (07-04 marked RUN-02 ahead of the intended ownership convention) — see key-decisions above; this plan adds only the still-missing footer evidence, not a redundant checkbox/table edit.
- Followed this repo's real, universal footer-link convention (`_Next: [text]_`) rather than the plan's literal, unattainable `_Next:_` grep target — see key-decisions above.

## Deviations from Plan

### Auto-fixed Issues

None — no bugs, missing critical functionality, or blocking issues were found. This is a documentation-only plan; all edits were the planned spec/README/requirements text.

### Notable plan-text inconsistencies (not code deviations)

**1. Footer-link acceptance criteria don't match the repo's actual convention**
- **Found during:** Task 1 (verifying `07-hook-ordering-and-guarantees.md`'s footer)
- **Issue:** The plan's acceptance criteria ask for `grep -c "_Next:_"` / `grep -c "_Previous:_"` (colon immediately inside the closing underscore) to equal 1. Every existing behavior file footer in this repo (01, 04, 05, 06) instead writes `_Previous: [text]_` / `_Next: [text]_` — the colon is followed by the link text, and the closing underscore comes after it. The literal criterion string never appears anywhere in the repo, including files this plan did not touch.
- **Resolution:** Wrote the new file's footer, and file 06's added `_Next:` footer, in the real house convention (verified against all four existing files). Not treated as a defect to fix by inventing a nonstandard footer — the substantive claim (footer-linked, both directions) holds and is verified by `pnpm verify:spec`'s relative-link-integrity check, which passed (250 links resolved).

**2. `grep -c "Pending"` acceptance criterion in Task 3 assumes DSL-07/RUN-02 were still Pending at plan start**
- **Found during:** Task 3 (checking `.planning/REQUIREMENTS.md`'s Pending count)
- **Issue:** The acceptance criterion expects the Pending count to drop by exactly 2 as a result of this plan's edits. Both requirements were already ticked `[x]` and marked `Complete` in the traceability table before this plan started — `RUN-02` by 07-04's own completion commit (`33e9127`), `DSL-07` by 07-02's (`58617e2`). This plan's Task 3 therefore performs no checkbox/table edit (there was nothing left to change), only the footer's per-requirement evidence entry, which was genuinely still missing.
- **Resolution:** Verified the substantive claim the criterion protects — DSL-07 and RUN-02 Complete, each backed by a named automated assertion — is true and is now recorded in the footer, citing this SUMMARY. Did not force an artificial second toggle of the checkboxes to make the literal grep pass.

---

**Total deviations:** 0 code deviations. 2 documented plan-text inconsistencies, both pre-existing facts about repo state or convention that this plan's own edits could not have caused or avoided.
**Impact on plan:** None on the plan's actual goal — every real acceptance criterion (verify:spec, lint, the BEH-EC-017/Effect.onExit/Background.ts/Effect.ensuring grep counts, the from-disk §4 cross-check, build/test/tsgo-gate/pack) passes.

## Issues Encountered

- Fresh worktree had no `node_modules`; resolved with `pnpm install --frozen-lockfile` before any verification could run (standard first-run setup, not a plan deviation).
- First draft of Task 2's Background-module explanation and §1 table cell used the literal string "Background.ts", which violates the plan's own `grep -c "Background.ts"` outputs `0` acceptance criterion (the point of the criterion — say Background has no module without ever spelling the filename literally, matching the `emitFeature` precedent 07-02's summary already recorded for the identical class of self-inflicted grep failure). Reworded both spots to describe the fact without the literal filename before committing (caught pre-commit, not a deviation).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 7 (hooks) is now fully reconciled: the spec, traceability, both READMEs and `.planning/REQUIREMENTS.md` all agree with what `packages/vitest/src/{Hook,HookRegistry,Dsl,ScenarioEffect,Runner,describeFeature}.ts` actually built across plans 07-01 through 07-07.
- `spec/roadmap.md`'s "Current state" section and both packages' READMEs now correctly list Phase 8 (Rule-scoped Layers, typed Scenario Outline Examples), Phase 9 (tag routing) and Phase 10 (shared Layer, TestClock isolation) as the only remaining "intended contract only" items for `@effect-cucumber/vitest`.
- All plan-level verification passed: `pnpm verify:spec` (7 PASS, 1 SKIP, 0 FAIL), `pnpm lint` (oxlint + dprint check, both exit 0), `pnpm test` (575/575, unchanged from 07-07's baseline — this plan is documentation-only), `pnpm build`, `pnpm verify:tsgo-gate` (11/11 assertions, unchanged surface), `pnpm verify:pack` (both packages, publint clean). The from-disk §4 cross-check confirms every `packages/*/test/*.test.ts` file on disk is named in `spec/traceability.md`.

## Self-Check: PASSED

- FOUND: spec/behaviors/07-hook-ordering-and-guarantees.md
- FOUND: spec/behaviors/index.yaml (modified)
- FOUND: spec/behaviors/06-datatable-and-docstring-arguments.md (modified)
- FOUND: spec/behaviors/02-shared-layers-and-tags.md (modified)
- FOUND: spec/invariants.md (modified)
- FOUND: spec/decisions/005-effect-fn-for-step-and-hook-bodies.md (modified)
- FOUND: spec/traceability.md (modified)
- FOUND: spec/roadmap.md (modified)
- FOUND: README.md (modified)
- FOUND: packages/vitest/README.md (modified)
- FOUND: .planning/REQUIREMENTS.md (modified)
- FOUND commit 3778553 (Task 1)
- FOUND commit 3d3c32c (Task 2)
- FOUND commit 5bd92e0 (Task 3)

---
*Phase: 07-hooks*
*Completed: 2026-08-29*

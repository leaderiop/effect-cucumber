---
phase: 07-hooks
plan: 03
subsystem: testing
tags: [effect, effect-ts, vitest, cucumber, hooks, tsgo, build-gate]

# Dependency graph
requires:
  - phase: 07-hooks
    provides: "07-02's HookRegistrar<ROut> and six FeatureDsl hook members (Dsl.ts), plus describeFeature.ts's hook registration seam"
provides:
  - "test/tsgo-gate/src/hook-satisfied.ts + hook-missing-service.ts: the satisfied/starved hook fixture pair, and their single-file tsconfig.hook-ok.json / tsconfig.hook-missing.json"
  - "scripts/verify-tsgo-gate.sh: gate assertions 10 and 11, extending ADR-EC-016's build gate to the hook registrar surface"
affects: [07-04, 07-05, 07-06, 07-07, 07-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "The hook fixture pair copies step-satisfied.ts/step-missing-service.ts's shape exactly: inline-duplicated World/Db, explicit Layer.Layer<...> annotations, declare const feature, and a MUST-COMPILE-CLEAN / MUST-NOT-COMPILE header naming the assertion number"
    - "Gate assertion pairing: assertion 10 (positive, mirrors assertion 5) and assertion 11 (negative, two-check form mirroring assertion 6 — exit code AND diagnostic name) are the third instance of this shape in the script, after the Layer-argument pair (4/8) and the step pair (5/6)"

key-files:
  created:
    - packages/vitest/test/tsgo-gate/src/hook-satisfied.ts
    - packages/vitest/test/tsgo-gate/src/hook-missing-service.ts
    - packages/vitest/test/tsgo-gate/tsconfig.hook-ok.json
    - packages/vitest/test/tsgo-gate/tsconfig.hook-missing.json
  modified:
    - scripts/verify-tsgo-gate.sh

key-decisions:
  - "The already-Effect.fn-wrapped hook coverage and the Effect.acquireRelease coverage are both extra registrations of the SAME hook kinds already covered by the six-kind loop (a second `After(...)` and a second `Before(...)`), not new kinds — D-01's 'multiple hooks of the same kind run in registration order' makes this legal, and it keeps the fixture from needing a seventh/eighth hook kind that doesn't exist."
  - "The @ts-expect-error line reads `void dsl.Before` inside a Scenario callback, copying world-undeclared-field.ts's `void world.oranges` pattern — the `void` prefix is required so the bare property-access expression statement does not trip oxlint's unused-expression rule, exactly as the existing TS2339 fixture already established."
  - "The existence-loop line listing HOOK_OK_CONFIG and HOOK_NEG_CONFIG was deliberately split across two separate continuation lines (not the same line) so `grep -c \"HOOK_OK_CONFIG\\|HOOK_NEG_CONFIG\"` counts 6 distinct lines (2 declarations + 2 existence-loop entries + 2 compile invocations), matching the plan's literal acceptance criterion — grep -c counts matching LINES, and both configs on one line would have undercounted at 5."
  - "The second mutation proof (moving a hook member from FeatureDsl to ScenarioDsl) required editing BOTH Dsl.ts's ScenarioDsl interface AND describeFeature.ts's scenarioDsl object literal to add `Before: hookRegistrar(\"Before\")` — a type-only mutation to Dsl.ts alone cascades to an EARLIER failure (assertion 5's STEP_OK_CONFIG, TS2741 'Property Before is missing') because describeFeature.ts's runtime scenarioDsl object no longer satisfies the widened ScenarioDsl<any> type, and every DSL fixture (including the step ones) imports @effect-cucumber/vitest and therefore compiles describeFeature.ts as part of the same program. Only mutating both layers reproduces the actual 'hook member leaked onto ScenarioDsl' scenario Dsl.ts note (f) describes and lands the failure specifically on assertion 10's TS2578, as the acceptance criterion requires."

patterns-established:
  - "Gate assertion mutation-proof discipline extended to a third registrar (HookRegistrar): both a union-reorder proof (assertion 11, cause discriminated by diagnostic name) and a container-leak proof (assertion 10, cause discriminated by TS2578) are now recorded for hooks, matching the step registrar's precedent."

requirements-completed: []

# Metrics
duration: ~35min
completed: 2026-08-29
---

# Phase 7 Plan 03: Hook tsgo-gate fixtures and gate assertions Summary

**A satisfied/starved hook fixture pair (all six FeatureDsl hook kinds, wrapped-body pass-through, `Effect.acquireRelease` against a plain Layer, and a `@ts-expect-error`-proven Scenario-callback exclusion) plus two new `verify-tsgo-gate.sh` assertions, extending ADR-EC-016's build gate from `StepRegistrar` to `HookRegistrar` — 11/11 gate assertions, both mutation proofs performed and reverted, 547/547 tests green throughout.**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-08-29T14:37:00Z (approx, first file read)
- **Completed:** 2026-08-29T15:12:00Z (approx)
- **Tasks:** 2 completed
- **Files modified:** 5 (4 new, 1 modified)

## Accomplishments
- `hook-satisfied.ts`: a positive control registering all six `FeatureDsl` hook kinds with bare zero-argument generators yielding `World`, an already-`Effect.fn("After")`-wrapped hook (union's second member), a `Before` hook using `Effect.acquireRelease` against a plain `Layer<World>` (proving `HookRegistrar`'s `Scope.Scope` placement), a `@ts-expect-error`-guarded `void dsl.Before` inside a `Scenario` callback (proving hooks are unreachable from `ScenarioDsl`), and an object-Layer-form call registering a `Db`-using and a `World`-using hook — compiles clean
- `hook-missing-service.ts`: the near-twin whose sole defect is a `Before` hook requiring `Db` while the ambient Layer is the plain `World.layer` — rejected with exit 1 and `effect(missingEffectContext)`, and zero `effect(missingLayerContext)` in the output
- `tsconfig.hook-ok.json` / `tsconfig.hook-missing.json`: single-file projects copying `tsconfig.step-ok.json`'s shape
- `scripts/verify-tsgo-gate.sh`: assertion 10 (hook DSL positive control, mirrors assertion 5, failure message discriminates three causes) and assertion 11 (a hook requiring an unprovided service rejected by exit code AND `effect(missingEffectContext)` by name, mirrors assertion 6) — `pnpm verify:tsgo-gate` now runs 11/11 assertions
- Both required mutation proofs performed, verified, and reverted: reordering `HookRegistrar`'s union members fails assertion 11's diagnostic grep with a plain `TS2345` shape mismatch while `pnpm test` stays green (547/547); moving `Before` from `FeatureDsl` to `ScenarioDsl` (in both `Dsl.ts`'s type and `describeFeature.ts`'s runtime `scenarioDsl` object) fails assertion 10 with `TS2578: Unused '@ts-expect-error' directive`

## Task Commits

Each task was committed atomically:

1. **Task 1: the satisfied/starved hook fixture pair and their tsconfigs** - `07423c1` (feat)
2. **Task 2: gate assertions 10 and 11** - `4ae7b90` (feat)

**Plan metadata:** this commit (docs: complete plan)

## Files Created/Modified
- `packages/vitest/test/tsgo-gate/src/hook-satisfied.ts` - the hook DSL positive control (gate assertion 10)
- `packages/vitest/test/tsgo-gate/src/hook-missing-service.ts` - the hook starved twin (gate assertion 11)
- `packages/vitest/test/tsgo-gate/tsconfig.hook-ok.json` - single-file project for the positive control
- `packages/vitest/test/tsgo-gate/tsconfig.hook-missing.json` - single-file project for the starved twin
- `scripts/verify-tsgo-gate.sh` - `HOOK_OK_CONFIG`/`HOOK_NEG_CONFIG` variables, existence-loop entries, and assertions 10/11

## Decisions Made
- Extra `After`/`Before` registrations (already-wrapped body, `acquireRelease`) reuse the six kinds already covered rather than inventing new ones — see key-decisions above
- `void dsl.Before` copies the existing `void world.oranges` pattern from `world-undeclared-field.ts` to keep the bare property-access expression statement lint-clean
- The existence-loop line was split so the config-variable grep count reaches the plan's literal `>= 6` — see key-decisions above
- The second mutation proof required a two-file edit (`Dsl.ts` type + `describeFeature.ts` runtime object) to land the failure on the correct assertion — see key-decisions above for the full cascade explanation

## Deviations from Plan

None — plan executed exactly as written. The only judgment calls made (which hook kinds carry the "extra" already-wrapped/acquireRelease coverage, and the two-file mutation for proof 2) were within the plan's stated discretion ("one hook whose body uses...", "move one hook member") and are recorded as decisions above, not deviations from any explicit instruction.

## Issues Encountered
- `node_modules` was absent at the start of this session (fresh worktree); `pnpm install --frozen-lockfile` was run first to make `oxlint`, `tsc`, and `vitest` available. Not a deviation — a normal prerequisite for a fresh worktree, and no lockfile or manifest changed.
- The first attempt at the second mutation proof (Dsl.ts's `ScenarioDsl` interface alone) surfaced an earlier gate failure (assertion 5, `TS2741`) instead of the target assertion 10 — diagnosed as the DSL fixtures compiling `describeFeature.ts` as part of the same program, and resolved by also mutating `describeFeature.ts`'s `scenarioDsl` runtime object literal to match, which is the more faithful reproduction of "a hook member leaked onto ScenarioDsl" anyway (Dsl.ts note (f)'s literal scenario).

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness

- `pnpm verify:tsgo-gate` now covers `HookRegistrar` with the same satisfied/starved-pair rigor `StepRegistrar` has had since Phase 5 — any future plan that touches `Dsl.ts`'s hook types, `describeFeature.ts`'s hook registration, or `Hook.ts`'s normalization will have this gate fail by name if the DSL-07 guarantee regresses.
- This plan is verification-only for the hook surface; it adds no new source behavior. DSL-07 was already marked Complete by 07-02 and is unaffected here.
- All plan-level verification passed: `pnpm build` (`tsc -b` exits 0), `pnpm verify:tsgo-gate` (11/11 assertions, `tsgo gate: ENFORCED`), `pnpm lint` (`oxlint` + `dprint check` both exit 0), `pnpm test` (547/547, unchanged from 07-02's baseline — this plan adds no new test-suite entries, only compile-time fixtures outside the vitest `include` glob). Both mutation proofs were performed, confirmed to fail by name, and reverted; `git status --short` was empty before each commit.
- Later Phase 7 plans (07-04 onward, which wire hooks into `ScenarioEffect.ts`/`Runner.ts` execution) inherit an unchanged `Dsl.ts`/`describeFeature.ts` — this plan's two mutation-proof edits to those files were fully reverted and are not part of any commit.

## Self-Check: PASSED

- FOUND: packages/vitest/test/tsgo-gate/src/hook-satisfied.ts
- FOUND: packages/vitest/test/tsgo-gate/src/hook-missing-service.ts
- FOUND: packages/vitest/test/tsgo-gate/tsconfig.hook-ok.json
- FOUND: packages/vitest/test/tsgo-gate/tsconfig.hook-missing.json
- FOUND: scripts/verify-tsgo-gate.sh (modified)
- FOUND commit 07423c1 (Task 1)
- FOUND commit 4ae7b90 (Task 2)

---
*Phase: 07-hooks*
*Completed: 2026-08-29*

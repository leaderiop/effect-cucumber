---
phase: 07-hooks
plan: 05
subsystem: testing
tags: [effect, effect-ts, vitest, cucumber, hooks, onExit, before-step, after-step]

# Dependency graph
requires:
  - phase: 07-hooks
    provides: "07-04's ScenarioEffect.ts (buildScenarioEffect takes a required hooks: HookSet; Before gates the step loop; After is guaranteed via Effect.onExit around the whole composed generator)"
provides:
  - "ScenarioEffect.ts: every resolved step, Background included, runs inside its own BeforeStep -> body unit; AfterStep is guaranteed via Effect.onExit around the WHOLE unit (BeforeStep included), unconditionally, D-05/D-06/D-07"
affects: [07-06, 07-07, 07-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "The per-step unit is a nested Effect.gen of exactly two yield*s (BeforeStep, then the step body), piped through Effect.onExit(() => runHookBatch(hooks.AfterStep)) -- the identical Before-gate/After-guarantee shape 07-04 established at the Scenario level, reapplied one level down at the step level"
    - "The wrap is UNCONDITIONAL, never behind a hooks.BeforeStep.length > 0 branch -- runHookBatch([]) succeeds immediately, and a conditional wrap would create a code path only Features with hooks exercise, making a defect in the wrapped path invisible to every hookless test"
    - "The isUnresolved early-failure branch stays OUTSIDE the per-step unit -- an unresolved step never runs, so there is no step for an AfterStep to follow; this is a deliberate asymmetry, pinned by a dedicated test rather than left to be discovered"
    - "Background steps get the identical unit as the Scenario's own steps -- no origin-based partitioning, because ParsedScenario.steps already carries them in the right order (ADR-EC-004)"

key-files:
  created: []
  modified:
    - packages/vitest/src/ScenarioEffect.ts
    - packages/vitest/test/ScenarioEffect.test.ts

key-decisions:
  - "The per-step unit is composed as a NESTED Effect.gen inside the existing for loop's body, not hoisted into a combinator over the step list -- the bare for loop of yield*s remains the whole invariant (ScenarioEffect.ts note (a)), extended rather than replaced."
  - "AfterStep's finalizer takes no parameter, mirroring the Scenario-level After hook (ADR-EC-005's Negative consequence) -- BeforeStep/AfterStep hooks receive no step text."
  - "Module doc note (f) records the whole-unit guarantee, the plausible tidy-up (wrap only the step body), and the discriminating test -- following the house convention already established by notes (a)-(e)."

patterns-established:
  - "ScenarioEffect.test.ts's mutation header extended from A-G to A-J: H (onExit narrowed to the step body only), I (per-step unit hoisted into a concurrent Effect.forEach), J (AfterStep/BeforeStep batches swapped) -- each performed against real source, run against the full 23-test file, confirmed to fail exactly the intended assertions, then reverted."

requirements-completed: [DSL-07, RUN-02]

# Metrics
duration: ~30min
completed: 2026-08-29
---

# Phase 7 Plan 05: The per-step BeforeStep/step/AfterStep unit Summary

**Every resolved step, Background steps included, now runs inside its own `BeforeStep` -> body unit, with `AfterStep` guaranteed via `Effect.onExit` across the WHOLE unit -- on success, on the step's own failure, and even when the paired `BeforeStep` itself failed before the step body ever ran (D-05/D-06/D-07).**

## Performance

- **Duration:** ~30 min
- **Completed:** 2026-08-29 (approx)
- **Tasks:** 2 completed
- **Files modified:** 2 (1 source, 1 test)

## Accomplishments

- `ScenarioEffect.ts`'s `buildScenarioEffect`: inside the existing `for (const planned of args.plan.steps)` loop, the single `yield* planned.step.body(...)` line is replaced with a per-step UNIT -- one `Effect.gen` containing exactly `runHookBatch(args.hooks.BeforeStep)` then `planned.step.body(...)`, piped through `Effect.onExit(() => runHookBatch(args.hooks.AfterStep))`
- The wrap is unconditional (no `hooks.BeforeStep.length > 0` branch), the loop stays a bare `for` of `yield*` (no `Effect.forEach`/`Effect.all`), the `isUnresolved` branch stays outside the unit and unchanged, and `Effect.provide(args.layer)` remains the last `.pipe` call
- Module doc note (f) added, recording the whole-unit guarantee, the plausible "wrap only the step body" tidy-up, the test that goes red, and the Background-steps-wrapped-identically claim
- `test/ScenarioEffect.test.ts`: 7 new tests (562 total repo tests, up from 555) proving Background steps bracketed identically to Scenario steps (ADR-EC-004), D-01 ordering with two `BeforeStep`/two `AfterStep` hooks, D-06's fail-fast-in-the-middle log (no entries for steps three/four), D-07's BeforeStep-failed-AfterStep-still-ran log, D-06's combine-don't-mask by reference identity (step error + AfterStep error both recoverable), the deliberate `Unresolved`-gets-no-hook-entries asymmetry, and the unconditional-wrap regression guard
- Module mutation header extended from A-G to A-J: H (`onExit` narrowed to the step body alone), I (per-step unit hoisted into a concurrent `Effect.forEach`), J (`AfterStep`/`BeforeStep` batches swapped) -- all three performed against real source, run against the full 23-test file, confirmed to fail exactly the intended assertion(s), then reverted (confirmed via `git diff` showing zero change after each revert)

## Task Commits

Each task was committed atomically:

1. **Task 1: the per-step BeforeStep/step/AfterStep unit** - `2bc1e13` (feat)
2. **Task 2: the BeforeStep/AfterStep assertions in ScenarioEffect.test.ts** - `5cd73f9` (test)

**Plan metadata:** this commit (docs: complete plan) -- deferred to orchestrator per worktree isolation

## Files Created/Modified

- `packages/vitest/src/ScenarioEffect.ts` - `buildScenarioEffect`'s step loop gains the per-step `BeforeStep`/body/`AfterStep` unit; module doc note (f) added; `buildScenarioEffect`'s own doc comment updated to mention the per-step guarantee
- `packages/vitest/test/ScenarioEffect.test.ts` - 7 new tests in a new `describe` block; mutation header extended from A-G to H-J

## Decisions Made

- The per-step unit is a nested `Effect.gen`, composed inline inside the existing `for` loop -- not hoisted into a helper function or a combinator, preserving note (a)'s "the `for` loop IS the invariant" principle one level down
- `AfterStep`'s finalizer ignores its `exit` argument, mirroring the Scenario-level `After` hook's finalizer -- both hook kinds receive no arguments per ADR-EC-005
- The `isUnresolved` branch is explicitly documented (both in the module header and inline) as staying OUTSIDE the per-step unit, so the asymmetry is a stated decision rather than an implicit gap

## Deviations from Plan

### Auto-fixed Issues

None. The plan's acceptance criteria (grep-based unconditional-wrap check, forbidden-combinator check, `Effect.provide` position, build/lint/test/typecheck all exiting 0) were all met on the first implementation without needing a Rule 1/2/3 fix.

### Notable implementation note (not a code deviation)

Mutation I's literal description ("the per-step unit hoisted out of the `for` loop into an `Effect.forEach` over the step list") required an adjustment during mutation testing: passing a bare generator function directly to `Effect.forEach`'s second argument threw `Fiber.runLoop: Not a valid effect: [object Generator]` at runtime in the installed `effect@4.0.0-rc.112` build -- `Effect.forEach` does not auto-wrap a generator function the way `Effect.gen` does. The mutation was corrected to `Effect.forEach(args.plan.steps, (planned) => Effect.gen(function*() { ... }), { concurrency: "unbounded" })`, which is the mechanically correct form of the described tidy-up and produced the intended failure (11 of 23 tests failed, including the four-step fail-fast test). This is a mutation-testing implementation detail, not a deviation in the shipped source -- the shipped `ScenarioEffect.ts` never contains `Effect.forEach` (confirmed by the acceptance grep both before and after this plan's commits).

---

**Total deviations:** 0 code deviations. 1 documented mutation-testing implementation note (does not affect shipped source or any acceptance criterion).
**Impact on plan:** None on functionality or correctness -- all acceptance criteria pass (grep-based checks, `pnpm build`/`lint`/`test`/`typecheck:test` all exit 0, `pnpm verify:tsgo-gate` 11/11 assertions, `pnpm circular` no cycles, `git status` clean apart from this plan's own files).

## Issues Encountered

None beyond the mutation-testing note above.

## User Setup Required

None - no external service configuration required.

## Mutation Testing Record

All three required mutations (H, I, J) were performed against the real `ScenarioEffect.ts` source, run against the full `test/ScenarioEffect.test.ts` suite (23 tests, not just the targeted test), confirmed to fail exactly the intended test(s), then reverted (confirmed via `git diff --stat` showing no change after each revert):

- **H.** `Effect.onExit` narrowed to wrap only `planned.step.body`, leaving `BeforeStep` outside it -> "still runs AfterStep when the paired BeforeStep failed, and the step body never ran (D-07)" failed (`AfterStep`'s entries absent from the log). Exactly 1 of 23 tests failed.
- **I.** The per-step unit hoisted out of the `for` loop into `Effect.forEach(args.plan.steps, (planned) => Effect.gen(...), { concurrency: "unbounded" })` -> 11 of 23 tests failed, including "ends with the failing step's AfterStep, and no later BeforeStep/step/AfterStep runs (D-06)" -- steps that should never run under fail-fast interleaved with steps that already ran, and combined-cause tests reported zero errors because the `Unresolved` branch's early `return` no longer terminates the whole generator.
- **J.** The `AfterStep`/`BeforeStep` batches swapped (`AfterStep` run as the gen's first `yield*`, `BeforeStep` moved into the `onExit` finalizer) -> 6 of 23 tests failed, including the "runs both BeforeStep hooks then the body then both AfterStep hooks, in registration order (D-01)" ordering test -- the log recorded `AfterStep` before the step body and `BeforeStep` after it, the reverse of the correct order.

## Next Phase Readiness

- `BeforeAllScenarios`/`AfterAllScenarios` sharing across N Scenarios (D-08/D-09) is still not addressed by this plan -- this plan's scope was strictly the per-step `BeforeStep`/`AfterStep` weaving inside `buildScenarioEffect`'s existing step loop.
- All plan-level verification passed: `pnpm build`, `pnpm lint`, `pnpm test` (562 tests across 29 files, up from 555 before this plan -- exactly the 7 new tests this plan added), `pnpm typecheck:test`, `pnpm verify:tsgo-gate` (11/11 assertions, unchanged from before this plan -- this plan touches no DSL type surface), `pnpm circular` (no cycles).
- BEH-EC-006's spec text still literally says "via `Effect.ensuring`" -- as recorded by plan 07-04's summary, plan 07-08 is the named owner of correcting that spec text now that `Effect.onExit` is the proven implementation at both the Scenario level and (as of this plan) the per-step level.

## Self-Check: PASSED

- FOUND: packages/vitest/src/ScenarioEffect.ts
- FOUND: packages/vitest/test/ScenarioEffect.test.ts
- FOUND commit 2bc1e13 (Task 1)
- FOUND commit 5cd73f9 (Task 2)

Both claimed files verified present on disk; both claimed commits verified present in `git log --oneline`. No missing items.

---
*Phase: 07-hooks*
*Completed: 2026-08-29*

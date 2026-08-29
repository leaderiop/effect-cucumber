---
phase: 07-hooks
plan: 06
subsystem: testing
tags: [effect, effect-ts, vitest, cucumber, hooks, deferred, once-cell]

# Dependency graph
requires:
  - phase: 07-hooks
    provides: "07-04's Runner.ts/ScenarioEffect.ts threading a required hooks: HookSet through emitFeature and buildScenarioEffect, with BeforeAllScenarios/AfterAllScenarios collected but unconsumed"
provides:
  - "Runner.ts: a module-private makeOnce helper (Deferred.makeUnsafe + Deferred.into/Deferred.await) that shares one BeforeAllScenarios execution — success or failure — across every Scenario thunk in a Feature, sequenced ahead of buildScenarioEffect via Effect.flatMap"
  - "Runner.ts: one constant-titled '⚙ AfterAllScenarios' node emitted after every Scenario (Rules included) and before the warnings, as a sibling node (not a finalizer), so D-09's 'runs always' guarantee is structural"
  - "TestApi.ts unchanged — the sharing mechanism needs no new describe/effect member"
  - "Runner.test.ts: 8 new tests proving once-across-N in either order, failure-fans-out by reference identity, BeforeAllScenarios-before-Scenario's-own-Before ordering, AfterAllScenarios emission position, runs-even-when-earlier-failed, and a hookless-Feature regression guard"
affects: [07-07, 07-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Deferred.makeUnsafe (synchronous) + Deferred.into + Deferred.await is the once-across-N-executions primitive in this codebase — Effect.cached needs an Effect run first to reach its memo, and Effect.once does not exist in effect@4.0.0-rc.112"
    - "A once-cell's first caller must ALSO Deferred.await after Deferred.into, not just complete the deferred and return the into effect's own boolean — otherwise the first caller reports success even when body failed, which breaks D-08's 'every Scenario including the first' requirement"
    - "A guarantee that must survive an earlier failure (D-09) is a separate emitted node that never awaits the thing it must survive, not a finalizer wrapped around a describe block — TestApi.describe's define returns void, so there is nothing to attach a finalizer to"

key-files:
  created: []
  modified:
    - packages/vitest/src/Runner.ts
    - packages/vitest/test/Runner.test.ts

key-decisions:
  - "makeOnce is a module-private helper in Runner.ts (not a new TestApi.ts member) — D-08's 'Claude's Discretion' resolved toward the composition-only path 07-CONTEXT.md and 07-PATTERNS.md both anticipated. TestApi.ts's note (b) 'omission by decision' precedent survives unchanged."
  - "The BeforeAllScenarios cell is built ONCE in emitFeature, before api.describe, with the Feature's Layer provided INSIDE the cell (at makeOnce's call site) rather than inside whichever Scenario's own composed Effect triggers it — binding the Feature-wide hook to Scenario one's particular Layer instance would be wrong."
  - "AfterAllScenarios is NOT a once-cell: it is one extra api.effect node, body-composed directly from runHookBatch, that never awaits the BeforeAllScenarios deferred and is a sibling of the Scenario nodes — that is what makes 'runs always' (D-09) structural rather than arranged."
  - "The two Scenario-emission loops (Feature-level and Rule-nested) stay written out separately, per the existing file's precedent — the once-cell wiring is duplicated at both call sites rather than factored into a shared helper."
  - "Runner.test.ts's Recorder Ref is created ONCE outside the Layer and handed to Layer.succeed (never Layer.effect) — every Layer build across two Scenario thunk executions and a third AfterAllScenarios node execution shares one log, deliberately giving up build-counting because a per-build log cannot express a multi-Scenario ordering. ScenarioEffect.test.ts's own per-build Recorder still covers INV-EC-002."

patterns-established:
  - "House module-doc convention: Runner.ts's numbered notes extended from (a)-(d) to (a)-(e); note (e) covers both the BeforeAllScenarios once-cell mechanism and the AfterAllScenarios separate-node mechanism, naming the plausible tidy-ups ('wrap describe in a finalizer', 'emit after the warnings') and why each is wrong."
  - "Test-file mutation header convention: Runner.test.ts's header extended from three entries (A-C) to seven (A-C, K-N), each performed against real source, run, confirmed to fail exactly the intended test(s), and reverted."

requirements-completed: [DSL-07]

# Metrics
duration: ~30min
completed: 2026-08-29
---

# Phase 7 Plan 06: BeforeAllScenarios once-cell and AfterAllScenarios node Summary

**`Runner.ts`'s `emitFeature` shares one `BeforeAllScenarios` execution across every Scenario in a Feature via a synchronous `Deferred`-backed once-cell, and emits a constant-titled `⚙ AfterAllScenarios` node — a sibling of the Scenario nodes, never a finalizer — that always runs regardless of earlier failures, with `TestApi.ts` left completely unchanged.**

## Performance

- **Duration:** ~30 min
- **Completed:** 2026-08-29 (approx)
- **Tasks:** 2 completed
- **Files modified:** 2

## Accomplishments
- `Runner.ts`'s module-scope `makeOnce(body)`: a `Deferred.makeUnsafe<void, unknown>()` created eagerly (synchronous, so constructible during the emission walk) plus a closure `started` boolean; on the first execution the body is run through `Deferred.into` and the caller then `Deferred.await`s the same deferred to get `body`'s own outcome; on every later execution the caller just `Deferred.await`s — giving every Scenario, including the first, the SAME success-or-failure outcome (D-08)
- `emitFeature` composes the `BeforeAllScenarios` cell once per Feature, before `api.describe`, only when `hooks.BeforeAllScenarios` is non-empty, with the Feature's Layer provided inside the cell; both Scenario-emission loops (Feature-level and Rule-nested) sequence the cell ahead of `buildScenarioEffect` via `Effect.flatMap`, with `buildScenarioEffect`'s own call staying inside the sequencing callback — never evaluated at emit time
- One `⚙ AfterAllScenarios` node (a bare, non-interpolated literal) is emitted via `api.effect` after every Scenario (Rules included) and before the warnings loop, only when `hooks.AfterAllScenarios` is non-empty; its body runs the batch directly and never touches the `BeforeAllScenarios` deferred, which is what makes D-09's "runs always" guarantee structural
- A hookless Feature's emission is unchanged (byte-for-byte the same thunks plan 07-04 left)
- `test/Runner.test.ts`: 8 new tests — once-across-two-Scenarios in document order and in reverse order, failure-fans-out to both Scenario thunks by reference identity with the hook body running only once, `BeforeAllScenarios` running before the Scenario's own `Before` hook, `AfterAllScenarios`'s emission position (after every Scenario, before every warning), `AfterAllScenarios` running and succeeding even when `BeforeAllScenarios` and a Scenario both failed, a failing `AfterAllScenarios` failing only its own node without touching any Scenario's exit, and a no-all-scenarios-hooks regression guard identical to the file's original fixture assertion
- Mutation header extended from A-C to A-C, K-N; all four new mutations performed against real source, run, confirmed to fail exactly the intended test(s) (mutation K failed 4 of 19 tests, all correctly attributable to the once-cell's guarantee; L failed 2 of 19; M and N each failed exactly 1), then reverted

## Task Commits

Each task was committed atomically:

1. **Task 1: the BeforeAllScenarios once-cell and the AfterAllScenarios node** - `9e75fba` (feat)
2. **Task 2: the all-scenarios assertions against the recording fake** - `30c3da5` (test)

**Plan metadata:** this commit (docs: complete plan)

## Files Created/Modified
- `packages/vitest/src/Runner.ts` - `makeOnce` module-private helper; `emitFeature` composes and threads the `BeforeAllScenarios` cell through both Scenario loops; emits the `⚙ AfterAllScenarios` node; module doc note (e) added, "Four things" header corrected to "Five things"
- `packages/vitest/test/Runner.test.ts` - `Recorder`/`makeRecorderLayer`/`recordingHook`/`failingHook`/`recordingStep`/`recorderCheckoutDefinitions`/`hooksWith` fixtures; two new `describe` blocks (`BeforeAllScenarios runs exactly once...` and `AfterAllScenarios is emitted as one node...`) plus a regression-guard block; mutation header extended to K-N

## Decisions Made
- `makeOnce` stays module-private in `Runner.ts`; `TestApi.ts` gains no new member — see key-decisions above
- The Feature's Layer is provided inside the once-cell, at `makeOnce`'s call site, not inside whichever Scenario's own composed Effect happens to trigger it
- `AfterAllScenarios` is a separate emitted node, not a once-cell and not a finalizer — see key-decisions above
- The two Scenario-emission loops keep the once-cell wiring duplicated rather than factored into a shared helper, following the existing file's "written out separately" precedent for the loops themselves
- `Runner.test.ts`'s `Recorder` Ref is created once and shared via `Layer.succeed`, deliberately giving up build-counting for this file (covered elsewhere by `ScenarioEffect.test.ts`)

## Deviations from Plan

### Auto-fixed Issues

None. The plan's interfaces block (`Deferred.makeUnsafe`, `Deferred.await`, `Deferred.into`, `Effect.suspend`, `Effect.flatMap`) was verified accurate against the installed `effect@4.0.0-rc.112` build before use, and no blocking or bug-fix deviations were needed to implement either task as specified.

### Notable plan-inconsistency (not a code deviation)

Task 1's acceptance criteria include `` `grep -cE "vitest" packages/vitest/src/Runner.ts` outputs `0` ``. As 07-04's summary already documented for this same file, this criterion is unattainable independent of any change this plan makes: `Runner.ts`'s own module-doc note (a) — the note that STATES the "no vitest import" rule — necessarily discusses the word "vitest" in prose several times (e.g. "one vitest `describe(...)` block", "a vitest test cannot observe what its own run registered"). This plan added zero new "vitest" mentions (verified: the pre-existing count of 7 is unchanged by this plan's edits, all of which land in the new note (e) and in code, neither of which mentions the word). The substantive claim note (a) actually makes — no `import` of `vitest`, not even in a comment — holds: `packages/vitest/src/TestApi.ts` reports no diff, and every import statement in `Runner.ts` is from `@effect-cucumber/gherkin`, `effect/*`, or a local `./*.ts` module. Not treated as a Rule 1/3 auto-fix because there is no code defect to fix.

---

**Total deviations:** 0 code deviations. 1 documented plan-text inconsistency (pre-existing, unrelated to this plan's edits, already flagged by 07-04's summary for the same file).
**Impact on plan:** None on functionality or correctness — every other acceptance criterion (import-absence of `vitest`, `TestApi.ts` diff-emptiness, `Deferred.makeUnsafe`/`Effect.cached`/`Effect.once` counts, `⚙ AfterAllScenarios` literal count and position, `buildScenarioEffect` call-site placement, build/lint/test/typecheck/tsgo-gate/circular) passes.

## Issues Encountered

None. `Deferred.into`'s data-first two-argument form (`Deferred.into(body, deferred)`) was used rather than the data-last pipe form shown in the plan's interfaces block (`body.pipe(Deferred.into(deferred))`) — both are the same exported overload set (verified against `Deferred.d.ts`), so this is a style choice, not a deviation from the verified API.

## User Setup Required
None - no external service configuration required.

## Mutation Testing Record

All seven mutations recorded in `test/Runner.test.ts`'s module header were performed against the real source (three, A-C, predate this plan and were re-confirmed unaffected; four, K-N, are new to this plan), run against the full `Runner.test.ts` suite, confirmed to fail exactly the tests attributable to each, then reverted (confirmed via `git diff --stat packages/vitest/src/Runner.ts` reporting empty after each revert):

- **K.** `makeOnce`'s `started` flag removed → the batch runs once PER CALLER instead of once per Feature. 4 of 19 tests failed: both once-across-two-Scenarios tests (the hook's `:start`/`:end` pair appears twice instead of once), the failing-`BeforeAllScenarios` test (the second Scenario's `Exit.isFailure` assertion sees `false`, because `Deferred.into` on an already-completed `Deferred` still re-runs `body`), and the runs-even-when-`BeforeAllScenarios`-failed `AfterAllScenarios` test (the re-run leaks an extra `beforeAll:start` entry into the log).
- **L.** `Deferred.await` on the second and later callers replaced with `Effect.void` → 2 of 19 tests failed: the failing-`BeforeAllScenarios` test (the second Scenario thunk now SUCCEEDS, and its own steps actually run, leaking `"the cart is empty"`/`"I refund"` into what should be a `["beforeAll:start"]`-only log) and the runs-even-when-`BeforeAllScenarios`-failed test (same leak, this time into the `AfterAllScenarios`-node-observed log).
- **M.** the `AfterAllScenarios` node moved to after the warnings loop instead of before it → exactly 1 of 19 tests failed, the emission-shape test, on the node's position in `shapeOf(records)`.
- **N.** the `AfterAllScenarios` node's body composed to `Effect.flatMap` the `BeforeAllScenarios` cell first → exactly 1 of 19 tests failed, the runs-even-when-`BeforeAllScenarios`-failed test, because the node's own exit became a failure instead of a success.

## Next Phase Readiness

- All six hook kinds (`Before`, `After`, `BeforeStep`, `AfterStep`, `BeforeAllScenarios`, `AfterAllScenarios`) are now fully wired end to end: `BeforeStep`/`AfterStep` weaving into the per-step unit is plan 07-05's completed job (parallel wave), and `BeforeAllScenarios`/`AfterAllScenarios` sharing (this plan) closes 07-CONTEXT.md's one remaining "Claude's Discretion" mechanism question (D-08/D-09).
- `TestApi.ts` remains completely unchanged across the whole of Phase 7 — the composition-only path anticipated by 07-CONTEXT.md and confirmed feasible by 07-PATTERNS.md's Verified API Constraints held for real, with no new member ever needed.
- BEH-EC-006's spec text still literally says `Effect.ensuring` for the `After` guarantee (07-04's finding, `Effect.onExit` is what is actually used) — 07-CONTEXT.md and multiple module doc notes across this phase name **plan 07-08** as the owner of correcting that spec text now that every hook kind's real implementation has landed.
- All plan-level verification passed: `pnpm build`, `pnpm lint`, `pnpm test` (563 tests across 29 files, up from 555 before this plan — exactly the 8 new tests this plan added), `pnpm typecheck:test`, `pnpm verify:tsgo-gate` (11/11 assertions, unchanged surface — this plan touches no DSL type surface), `pnpm circular` (no cycles), `git diff --stat packages/vitest/src/TestApi.ts` (empty).

## Self-Check: PASSED

- FOUND: packages/vitest/src/Runner.ts
- FOUND: packages/vitest/test/Runner.test.ts
- FOUND commit 9e75fba (Task 1)
- FOUND commit 30c3da5 (Task 2)

Both claimed files verified present on disk; both claimed commits verified present in `git log --oneline --all`. No missing items.

---
*Phase: 07-hooks*
*Completed: 2026-08-29*

---
phase: 07-hooks
plan: 04
subsystem: testing
tags: [effect, effect-ts, vitest, cucumber, hooks, onExit, cause-combine]

# Dependency graph
requires:
  - phase: 07-hooks
    provides: "07-01's Hook.ts (HookBody, HookSet, runHookBatch) and 07-02's FeatureCollection.hooks: HookSet, collected but not yet consumed"
provides:
  - "ScenarioEffect.ts: buildScenarioEffect takes a required hooks: HookSet; Before gates the step loop structurally (one yield*, D-04); After is guaranteed via Effect.onExit around the whole composed generator (D-05/D-06/D-07), never Effect.ensuring"
  - "Runner.ts: emitFeature takes a required hooks: HookSet, threaded straight through to every buildScenarioEffect call in the emission walk"
  - "describeFeature.ts: the emitFeature call inside describeFeature's own body now passes hooks: collection.hooks"
affects: [07-05, 07-06, 07-07, 07-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Effect.onExit, never Effect.ensuring, for a guarantee whose finalizer can fail — ensuring's finalizer error channel is never in effect@4.0.0-rc.112 (verified against Effect.d.ts), so a fallible After hook is not assignable to it, and forcing it through by widening the type merges no causes (empirically confirmed: onExit and ensuring share ONE runtime implementation, ensuring(self, f) = onExit(self, _ => f), so only the TYPE signature differs — a widened-type mutation must also swallow the finalizer's own failure to type-check, which is exactly what drops the cause)"
    - "Before is a GATE built from a single yield*, not an explicit flag — the same structural short-circuit ScenarioEffect.ts note (a) already uses for a step's own failure, extended to the hook batch"
    - "The onExit wraps the WHOLE composed generator, Before gate included, so After also runs when a Before hook failed (D-07's 'the guarantee wraps the whole unit' principle) — not just the step loop"
    - "Cause reference identity is asserted by walking cause.reasons and filtering Cause.isFailReason, never by Cause.squash, which does not return either original error by identity from a COMBINED cause"

key-files:
  created: []
  modified:
    - packages/vitest/src/ScenarioEffect.ts
    - packages/vitest/src/Runner.ts
    - packages/vitest/src/describeFeature.ts
    - packages/vitest/test/ScenarioEffect.test.ts
    - packages/vitest/test/Runner.test.ts

key-decisions:
  - "buildScenarioEffect's args.hooks and emitFeature's args.hooks are REQUIRED fields, not optional — same reasoning 07-02 already applied to FeatureCollection.hooks (03-05's precedent): an optional field lets a consumer forget hooks exist, and every such forgetting compiles."
  - "Effect.onExit is the ONLY combinator used for the After guarantee; Effect.ensuring appears nowhere outside a doc note explaining why it cannot express D-06's combine-don't-mask requirement. Verified empirically (not just from the type declaration) that ensuring and onExit share one runtime implementation in this build (ensuring(self, f) = onExit(self, _ => f)), so the only way to make ensuring type-check for a fallible hook is to first swallow the hook's own failure (e.g. Effect.catchCause), which is precisely what mutation D proved drops the After hook's error from the reported cause."
  - "The Before gate is one yield* placed as the FIRST statement of the existing Effect.gen, not a new branch or an explicit 'did Before fail' flag — the structural fail-fast INV-EC-001 already establishes for steps is reused unchanged for the Before batch."
  - "emptyHooks (ScenarioEffect.test.ts) and hooksWith(...) (both test files) are the house pattern for handing every non-hook-focused test the same six-key HookSet without repeating the literal at every call site, per unicorn/consistent-function-scoping's capture-free-helper convention."
  - "failedErrors(cause) — a module-scope helper in ScenarioEffect.test.ts that walks cause.reasons and filters Cause.isFailReason — replaces Cause.squash for every multi-failure assertion, because squash does not return either original error by identity from a combined cause (Verified API Constraints, 07-PATTERNS.md)."

patterns-established:
  - "House module-doc convention: ScenarioEffect.ts's numbered notes extended from (a)-(c) to (a)-(e), notes (d) and (e) naming the Before-gate and After-guarantee constraints, each with the plausible tidy-up and the test that goes red."
  - "Test-file mutation header convention: ScenarioEffect.test.ts's header extended from three entries (A-C) to seven (A-G), each mutation performed against real source, run, confirmed to fail exactly the intended test(s) and no others, then reverted — verified via full-suite runs after each mutation, not just the targeted test."

requirements-completed: [DSL-07, RUN-02]

# Metrics
duration: ~35min
completed: 2026-08-29
---

# Phase 7 Plan 04: Before gates the step loop, After is guaranteed via Effect.onExit Summary

**`buildScenarioEffect` and `emitFeature` both take a required `hooks: HookSet`; `Before` hooks gate the step loop with a single structural `yield*` (D-04) and `After` hooks are guaranteed via `Effect.onExit` around the whole composed generator — on success, on a step failure, and even when a `Before` hook itself failed (D-05/D-06/D-07, RUN-02, INV-EC-004) — never `Effect.ensuring`, whose finalizer error channel is `never` in the installed `effect@4.0.0-rc.112` build.**

## Performance

- **Duration:** ~35 min
- **Completed:** 2026-08-29T15:16:00Z (approx)
- **Tasks:** 2 completed
- **Files modified:** 5 (2 source, 1 composition root, 2 test files)

## Accomplishments
- `ScenarioEffect.ts`'s `buildScenarioEffect`: `args.hooks: HookSet` is a required field; `yield* runHookBatch(args.hooks.Before)` is the first statement inside the existing `Effect.gen`, gating the step loop structurally with no explicit flag; the whole composed generator is wrapped with `Effect.onExit(() => runHookBatch(args.hooks.After))`, with `Effect.provide(args.layer)` staying the last `.pipe` call
- `Runner.ts`'s `emitFeature`: `args.hooks: HookSet` is a required field, passed straight through to every `buildScenarioEffect` call in both loops of the emission walk (Feature-level Scenarios and Rule-nested Scenarios)
- `describeFeature.ts`: the `emitFeature` call inside `describeFeature`'s own body now passes `hooks: collection.hooks` — the one call site 07-02 deliberately left untouched
- `test/ScenarioEffect.test.ts`: 8 new tests proving Before ordering (D-01), After on success (INV-EC-004's success half), After guaranteed on a step failure (RUN-02's headline), three independent Before hooks with the first failing (D-02/D-04 in one assertion), combined Before-failure cause by reference identity (D-03), combined step-failure-and-After-failure cause (roadmap SC #4's combine-don't-mask), After still running when the gating Before hook failed (D-07), and an explicit no-hooks regression guard
- `test/Runner.test.ts`: every existing `emitFeature` call site updated with an `emptyHooks` fixture, keeping the whole suite green under the widened required contract
- All four required mutations (D: `onExit`→`ensuring`, E: Before moved inside the step loop, F: Before as a first-wins fold, G: `onExit` wrapping only the step loop) performed against real source, run, confirmed to fail exactly the intended test(s) — see Mutation Testing Record below — and reverted

## Task Commits

Each task was committed atomically:

1. **Task 1: thread the HookSet, gate on Before, guarantee After** - `bfd8590` (feat)
2. **Task 2: the Before/After assertions in ScenarioEffect.test.ts** - `aebcf59` (test)

**Plan metadata:** this commit (docs: complete plan)

## Files Created/Modified
- `packages/vitest/src/ScenarioEffect.ts` - `buildScenarioEffect` gains `hooks: HookSet`; Before gate; After guarantee via `Effect.onExit`; module doc notes (d) and (e) added
- `packages/vitest/src/Runner.ts` - `emitFeature` gains `hooks: HookSet`, threaded to both `buildScenarioEffect` call sites
- `packages/vitest/src/describeFeature.ts` - `emitFeature({ ..., hooks: collection.hooks })`; two now-stale doc comments (which said "Plan 07-04 threads it... untouched by this plan") updated to reflect this plan's own completion
- `packages/vitest/test/ScenarioEffect.test.ts` - `recordingHook`/`failingHook` helpers, `emptyHooks`/`hooksWith`/`failedErrors` fixtures, 8 new tests, mutation header extended from A-C to A-G
- `packages/vitest/test/Runner.test.ts` - `emptyHooks` fixture; all 10 `emitFeature` call sites updated

## Decisions Made
- `hooks` is required (not optional) on both widened contracts — see key-decisions above
- `Effect.onExit` is the sole After-guarantee combinator; `Effect.ensuring` appears only in a doc note — see key-decisions above for the empirical proof that the two share one runtime implementation and only the type signature differs
- The Before gate is one `yield*`, no explicit flag — reuses INV-EC-001's structural fail-fast pattern
- `failedErrors(cause)` replaces `Cause.squash` for every multi-failure assertion — squash does not preserve reference identity across a combined cause

## Deviations from Plan

### Auto-fixed Issues

None. The plan's interfaces block (verified against the installed `effect@4.0.0-rc.112` build) was accurate for `Effect.onExit`'s signature and doc text, and no blocking or bug-fix deviations were needed to implement Task 1 or Task 2 as specified.

### Notable plan-inconsistency (not a code deviation)

Task 1's acceptance criteria include: `` `grep -cE "vitest" packages/vitest/src/Runner.ts` outputs `0` — note (a)'s rule survives the edit, comments included ``. This criterion was **already unattainable before this plan started**: `Runner.ts`'s own module-doc note (a) — the note that STATES the "no vitest import" rule — necessarily discusses the word "vitest" several times in prose (e.g. "one vitest `describe(...)` block", "a vitest test cannot observe what its own run registered", "vitest/no-identical-title"). Verified via `git diff --unified=0 packages/vitest/src/Runner.ts | grep -iE "vitest"` against this plan's own changes: the only line touched by the `+` diff marker is the `+++ b/...` header — this plan added zero new "vitest" mentions to the file. The criterion appears to be a copy-paste of the real, load-bearing rule ("no `import` of `vitest`, not even in a comment" — which the file genuinely does satisfy, confirmed by inspecting every import statement) rather than a literal grep the file's own explanatory prose could ever pass. Not treated as a Rule 1/3 auto-fix because there is no code defect to fix — the file's actual import statements contain zero "vitest" references, which is the substantive claim note (a) makes.

---

**Total deviations:** 0 code deviations. 1 documented plan-text inconsistency (pre-existing, unrelated to this plan's edits).
**Impact on plan:** None on functionality or correctness — all real acceptance criteria (import-absence, `Effect.onExit`/`Effect.ensuring` counts, `hooks: HookSet` counts, pipe-chain order, build/lint/test/typecheck/tsgo-gate/no-runner-dep/circular) pass.

## Issues Encountered

**`Effect.zipRight`/`Effect.catchAll` do not exist in the installed `effect@4.0.0-rc.112` build** (the same finding 07-01's summary recorded for `zipRight`). While probing mutation D, an initial attempt used `Effect.catchAll(() => Effect.void)` to widen the After hook's error channel for `Effect.ensuring` — this compiled as `unknown` (untyped call) and threw `TypeError: catchAll is not a function` at runtime rather than producing the intended semantic failure. Switched to `Effect.catchCause(() => Effect.void)`, which exists in this build and produced the correct, targeted assertion failure (`errors.length` 1 instead of 2). No source or test file was left in this state — the mutation was reverted immediately after confirming it failed the intended test and nothing else.

## User Setup Required
None - no external service configuration required.

## Mutation Testing Record

All four required mutations were performed against the real `ScenarioEffect.ts` source, run against the full `test/ScenarioEffect.test.ts` suite (not just the targeted test), confirmed to fail exactly the intended test(s) and no others, then reverted (confirmed via `git diff` showing zero change after revert):

- **D.** `Effect.onExit(() => runHookBatch(args.hooks.After))` replaced with `Effect.ensuring(runHookBatch(args.hooks.After).pipe(Effect.catchCause(() => Effect.void)))` → "combines the step's own failure and the After hook's failure, by reference identity (roadmap SC #4)" failed with `expected 1 to equal 2` (the After hook's error silently dropped). Exactly 1 of 16 tests failed.
- **E.** The `yield* runHookBatch(args.hooks.Before)` gate moved from before the `for` loop to the first statement inside it → "runs two Before hooks then the Scenario's own steps, in registration order (D-01)" failed: the log recorded the two Before hooks TWICE (once per step) instead of once before both steps. Exactly 1 of 16 tests failed.
- **F.** The `Before` batch replaced with a bare `for (const hook of args.hooks.Before) { yield* hook() }` (structural fail-fast, no independent-and-collect) → both "runs all three Before hooks independently when the first fails, and no step runs (D-02, D-04)" and "combines both Before hook failures into the reported cause, by reference identity (D-03)" failed — the second and third Before hooks' entries were absent from the log, and only one error reached the combined cause. Exactly 2 of 16 tests failed, both correctly attributable to the mutated independent-batch semantics.
- **G.** `Effect.onExit` moved to wrap only the step loop (via a nested `Effect.gen`), leaving the Before gate outside it → "still runs the one After hook when the one Before hook that gates it failed (D-07)" failed: the After hook's entries were absent from the log entirely. Exactly 1 of 16 tests failed.

## Next Phase Readiness

- `BeforeStep`/`AfterStep` weaving into the per-step unit inside the step loop is explicitly **plan 07-05's** job — this plan's task 1 instructions state "Do NOT touch the step `for` loop in this task; `BeforeStep`/`AfterStep` are plan 07-05's."
- `BeforeAllScenarios`/`AfterAllScenarios` sharing across N Scenarios (D-08/D-09) is not addressed by this plan — `Runner.ts`'s emission walk still builds and hands each Scenario its own `hooks` object unchanged; the `BeforeAllScenarios`/`AfterAllScenarios` arrays in every `HookSet` this plan threads through are present but unconsumed until a later plan wires the sharing mechanism (`Deferred.makeUnsafe` per 07-PATTERNS.md's Verified API Constraints).
- BEH-EC-006's spec text still literally says "via `Effect.ensuring`" — 07-CONTEXT.md and this plan's own module doc note (e) both name **plan 07-08** as the owner of correcting that spec text now that the real implementation (`Effect.onExit`) is landed and proven.
- All plan-level verification passed: `pnpm build`, `pnpm lint`, `pnpm test` (555 tests across 29 files, up from 547 before this plan — exactly the 8 new tests this plan added), `pnpm typecheck:test`, `pnpm verify:tsgo-gate` (9/9 assertions, unchanged — this plan touches no DSL type surface), `pnpm verify:no-runner-dep`, `pnpm circular` (no cycles).

## Self-Check: PASSED

- FOUND: packages/vitest/src/ScenarioEffect.ts
- FOUND: packages/vitest/src/Runner.ts
- FOUND: packages/vitest/src/describeFeature.ts
- FOUND: packages/vitest/test/ScenarioEffect.test.ts
- FOUND: packages/vitest/test/Runner.test.ts
- FOUND commit bfd8590 (Task 1)
- FOUND commit aebcf59 (Task 2)

All five claimed files verified present on disk; both claimed commits verified present in `git log
--oneline --all`. No missing items.

---
*Phase: 07-hooks*
*Completed: 2026-08-29*

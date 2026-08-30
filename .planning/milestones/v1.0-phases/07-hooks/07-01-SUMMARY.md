---
phase: 07-hooks
plan: 01
subsystem: testing
tags: [effect, effect-ts, vitest, cucumber, hooks, cause-combine]

# Dependency graph
requires:
  - phase: 05-dsl-and-scenario-execution
    provides: Step.ts's register/isGeneratorFn discriminator, Registry.ts's per-call factory shape
provides:
  - "HookRegistry.ts: a per-call hook store (createHookRegistry, HookKind, HookDefinition, HookRegistryShape)"
  - "Hook.ts: registerHook (normalization via delegation to Step.ts's register), groupHooks (per-kind partitioning), runHookBatch (independent execution with Cause.combine)"
affects: [07-02, 07-03, 07-04, 07-05, dsl-wiring-plans-in-phase-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Sibling-store-not-extension: HookRegistry.ts copies Registry.ts's factory shape but omits the scope stack entirely, since hooks are Feature-scoped only"
    - "Delegate-not-duplicate normalization: registerHook forwards to Step.ts's register with the hook kind in the pattern position, rather than re-implementing isGeneratorFn"
    - "Independent-batch-with-combined-cause: runHookBatch runs every hook to an Exit via Effect.exit inside a bare for loop, folds failing causes with Cause.combine starting from Cause.empty, and fails via Effect.failCause — never a wrapper error class, never Effect.forEach/Effect.all, never Effect.ensuring"

key-files:
  created:
    - packages/vitest/src/HookRegistry.ts
    - packages/vitest/src/Hook.ts
    - packages/vitest/test/HookRegistry.test.ts
    - packages/vitest/test/Hook.test.ts
  modified: []

key-decisions:
  - "DSL-07 left Pending in REQUIREMENTS.md: this plan lands only the two leaf modules (HookRegistry.ts, Hook.ts) that a later Phase 7 plan wires into Dsl.ts/describeFeature.ts. Per this repo's established precedent (MATCH-01/02 across 03-01..03-04), a requirement is marked complete by the plan that delivers it end to end and reachable by a consumer, not by the plan that lands its leaf dependency."
  - "registerHook<A, E, R>(kind, fn) delegates entirely to Step.ts's register(pattern, fn), passing kind in the pattern position, rather than duplicating isGeneratorFn — strictly less code, needs no edit to Step.ts, and reuses the exact discriminator steps already trust."
  - "runHookBatch is a bare for loop of yield* inside ONE Effect.gen, never Effect.forEach/Effect.all — matches ScenarioEffect.ts note (a)'s precedent that a combinator's default concurrency is an accident, not a guarantee."
  - "Batch failures are folded with Cause.combine(Cause.empty, ...) and reported via Effect.failCause, never wrapped in a named HookBatchError class — preserves each original error's reference identity inside the combined cause, which a wrapper class would lose."
  - "Effect.ensuring is not used anywhere in this module — verified against the installed effect@4.0.0-rc.112 build that its finalizer's error channel is never, so a failable hook is not even assignable to it. BEH-EC-006's literal 'via Effect.ensuring' names the guarantee later Phase 7 plans provide via Effect.onExit, not this module's combinator."

patterns-established:
  - "House module-doc convention (numbered (a)/(b)/... notes, each naming a constraint, a plausible tidy-up, and the test that goes red) extended to both new files with seven and six notes respectively."
  - "Test-file mutation header convention: every mutation performed, reverted and confirmed failing is recorded at the top of the test file, matching Step.test.ts/Registry.test.ts/ScenarioEffect.test.ts precedent."

requirements-completed: []

# Metrics
duration: 12min
completed: 2026-08-29
---

# Phase 7 Plan 01: Hook store and normalization seam Summary

**HookRegistry.ts (per-call hook store) and Hook.ts (registerHook normalization, groupHooks partitioning, runHookBatch independent-batch execution with Cause.combine) — the two leaf modules every later Phase 7 plan builds on.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-08-29T14:40:00Z (approx, first file read)
- **Completed:** 2026-08-29T14:49:27Z
- **Tasks:** 3 completed
- **Files modified:** 4 (all new)

## Accomplishments
- `HookRegistry.ts`: a per-call, zero-import factory (`createHookRegistry`) storing `HookDefinition<Fn>` records in registration order, snapshot-returning `hooks()`, sharing no state across instances — proven by isolation, snapshot and registration-order tests, all mutation-tested
- `Hook.ts`'s `registerHook`: normalises a hook body by delegating to `Step.ts`'s `register` with the hook kind as the span name (ADR-EC-005), returning an already-wrapped body by reference identity and wrapping a bare generator with `Effect.fn(kind)`
- `Hook.ts`'s `groupHooks`: partitions a flat list of `HookDefinition<HookBody>` into a `HookSet` with all six `HookKind` keys always present (empty arrays for unused kinds), preserving per-kind registration order
- `Hook.ts`'s `runHookBatch`: runs a batch of hooks independently (D-02) — every hook runs even when an earlier one fails — and folds every failure into one combined `Cause` via `Cause.combine` (D-03), preserving each original error's reference identity; verified against the installed `effect@4.0.0-rc.112` build that `Effect.ensuring`'s finalizer error channel is `never` and therefore cannot express this semantics

## Task Commits

Each task was committed atomically:

1. **Task 1: HookRegistry.ts — the per-call hook store** - `ba2f78e` (feat)
2. **Task 2: Hook.ts — normalization and the per-kind grouping** - `326a3f9` (feat)
3. **Task 3: runHookBatch — independent execution with combined causes** - `833c21f` (feat)

**Plan metadata:** this commit (docs: complete plan)

## Files Created/Modified
- `packages/vitest/src/HookRegistry.ts` - `HookKind`, `HookDefinition<Fn>`, `createHookRegistry<Fn>()`, `HookRegistryShape<Fn>`; zero imports, no scope stack, no `definedAt`
- `packages/vitest/src/Hook.ts` - `HookBody`, `HookSet`, `registerHook`, `groupHooks`, `runHookBatch`
- `packages/vitest/test/HookRegistry.test.ts` - isolation, snapshot, and registration-order assertions
- `packages/vitest/test/Hook.test.ts` - normalization identity/span-name assertions, `groupHooks` partitioning assertions, `runHookBatch` independence/combined-cause/ordering assertions

## Decisions Made
- registerHook delegates to Step.ts's register (kind in the pattern position) instead of duplicating `isGeneratorFn` — see key-decisions above for full rationale
- runHookBatch is a bare `for` loop of `yield*`, never a combinator, to keep "every hook runs" independent of any combinator's default concurrency
- Batch failures fold via `Cause.combine`/`Cause.empty`/`Effect.failCause`, never a wrapper error class, to preserve reference identity on each original error
- DSL-07 intentionally left Pending in REQUIREMENTS.md — see key-decisions above

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `Effect.zipRight` does not exist in the installed `effect@4.0.0-rc.112` build**
- **Found during:** Task 3 (writing the "runs every hook even when an earlier one fails" test)
- **Issue:** The test fixture used `Ref.update(log, ...).pipe(Effect.zipRight(Effect.fail(...)))` to sequence a Ref update before a failure. `Effect.zipRight` is not exported by this build of `effect`, so calling it threw a `TypeError` at hook-body-invocation time, which surfaced as a `Die` (not the intended `Fail`) inside `runHookBatch`'s collected causes — silently breaking the whole test (an empty log, a `Die`-tagged failure) rather than raising a compile error, because `Effect.zipRight` type-checked as `undefined` called as a function only at runtime.
- **Fix:** Rewrote the fixture as a two-step `Effect.gen` (`yield* Ref.update(...)`, then `return yield* Effect.fail(...)`), matching the house style already used elsewhere in this file and in `ScenarioEffect.test.ts`'s recording fixtures.
- **Files modified:** `packages/vitest/test/Hook.test.ts`
- **Verification:** `pnpm vitest run packages/vitest/test/Hook.test.ts` — all 11 tests pass; isolated a minimal repro test first to confirm the root cause before fixing
- **Committed in:** `833c21f` (Task 3 commit)

**2. [Rule 3 - Blocking] `unicorn/consistent-function-scoping` lint failures on capture-free test helper functions**
- **Found during:** Task 1 and Task 2 (writing `HookRegistry.test.ts` and `Hook.test.ts`)
- **Issue:** Several hook-body test fixtures (`firstBefore`, `anAfter`, `secondBefore`, `succeeding`) were declared inline inside `it(...)` callbacks but captured no variables from their enclosing scope, which oxlint's `unicorn/consistent-function-scoping` rejects.
- **Fix:** Hoisted the capture-free fixtures to module scope with a doc comment explaining why (matching `Step.test.ts`'s established convention for the same rule).
- **Files modified:** `packages/vitest/test/HookRegistry.test.ts`, `packages/vitest/test/Hook.test.ts`
- **Verification:** `pnpm lint` exits 0
- **Committed in:** `ba2f78e`, `326a3f9`, `833c21f` (part of each task's own commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking lint)
**Impact on plan:** Both fixes were necessary to reach a working, lint-clean test suite. No scope creep — neither touched `packages/vitest/src/Step.ts` (confirmed via `git diff --stat`, which the plan's own acceptance criteria require to report no change).

## Issues Encountered
None beyond the two auto-fixed deviations above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness

- `HookRegistry.ts` and `Hook.ts` are ready for the next Phase 7 plan(s) to wire `registerHook`/`groupHooks`/`runHookBatch` into `Dsl.ts`'s new `HookRegistrar<ROut>` and `FeatureDsl` members, `describeFeature.ts`'s hook registrar closure, and `ScenarioEffect.ts`'s per-Scenario hook weaving (D-04/D-05/D-06/D-07) and `Runner.ts`'s `BeforeAllScenarios`/`AfterAllScenarios` sharing (D-08/D-09) — none of that wiring exists yet, which is why DSL-07 stays Pending.
- Both new modules follow the internal-stage export policy (not in `packages/vitest/src/index.ts`'s barrel) and the house module-doc-comment convention, so the wiring plans have both a stable contract and a fully-reasoned rationale to build against.
- All plan-level verification passed: `pnpm build`, `pnpm lint`, `pnpm test` (541 tests across 29 files, up from the phase-3-end baseline of 337/14 — reflecting Phases 4-6 landing in the interim), `pnpm circular` (no cycles), `pnpm verify:no-runner-dep` (unaffected — `@effect-cucumber/gherkin` untouched).
- Every load-bearing assertion (isolation, snapshot, registration order, identity/span-name, per-kind grouping, batch independence, ordered `:start`/`:end` log, two-failure identity, single-failure `Cause.squash` reference identity) was mutation-tested by hand — the specific mutation performed, reverted, and confirmed to make the relevant test(s) fail is recorded both in each source file's module doc comment (notes (f)/(g) in `Hook.ts`) and in each test file's mutation header.

## Self-Check: PASSED

- FOUND: packages/vitest/src/HookRegistry.ts
- FOUND: packages/vitest/src/Hook.ts
- FOUND: packages/vitest/test/HookRegistry.test.ts
- FOUND: packages/vitest/test/Hook.test.ts
- FOUND: .planning/phases/07-hooks/07-01-SUMMARY.md
- FOUND commit ba2f78e (Task 1)
- FOUND commit 326a3f9 (Task 2)
- FOUND commit 833c21f (Task 3)

---
*Phase: 07-hooks*
*Completed: 2026-08-29*

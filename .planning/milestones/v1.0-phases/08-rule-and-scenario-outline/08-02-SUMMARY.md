---
phase: 08-rule-and-scenario-outline
plan: 02
subsystem: testing
tags: [effect, hooks, rule-scoping, hook-registry, adr-ec-010]

# Dependency graph
requires:
  - phase: 07-hooks-and-world
    provides: HookRegistry.ts's per-call hook store, Hook.ts's groupHooks/runHookBatch/HookSet, describeFeature.ts's Feature-level hookRegistrar
provides:
  - "HookDefinition<Fn>.ruleId — a required string | null on every stored hook, null meaning Feature-level"
  - "createHookRegistry().register(kind, ruleId, body) — Rule attribution supplied per registration, no scope stack"
  - "Hook.ts's emptyHookSet — one shared all-six-keys-empty HookSet, safe as the no-enclosing-Rule input"
  - "Hook.ts's mergeHookSets(feature, rule) — D-02's Feature-then-Rule / Rule-then-Feature ordering encoded once"
affects: [08-05a rule-scoped hook registration, 08-07 Runner/ScenarioEffect merge call sites]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Scope-by-field, not scope-by-stack: a hook's ruleId is supplied once at registration and never pushed/popped"
    - "Ordering encoded once in a pure merge function rather than reconstructed at each call site"
    - "Deliberate pass-through over no-op concatenation, so an invariant is stated in source rather than depended on"

key-files:
  created: []
  modified:
    - packages/vitest/src/HookRegistry.ts
    - packages/vitest/src/Hook.ts
    - packages/vitest/src/describeFeature.ts
    - packages/vitest/test/HookRegistry.test.ts
    - packages/vitest/test/Hook.test.ts

key-decisions:
  - "ruleId sits between kind and body in register's signature so every classifier precedes the body and a forgotten argument is a type error rather than a body silently read as the scope (Fn is unconstrained)"
  - "HookRegistry.ts still imports nothing: ruleId is a bare string | null, deliberately not Registry.ts's RegistryScope, so the store stays dependency-free"
  - "mergeHookSets passes feature's BeforeAllScenarios/AfterAllScenarios arrays through by reference rather than concatenating rule's always-empty ones, so the Feature-only invariant is visible in source"
  - "No second Effect.onExit tier anywhere: runHookBatch's independent-batch-with-combined-causes semantics are a property of the batch, not of how many tiers contributed entries, so ordering is the whole contract of the merge"

patterns-established:
  - "Rule attribution as a plain data field: 08-05a filters a flat hook list by ruleId BEFORE calling groupHooks, which stays a pure partition with no scope-awareness of its own"
  - "Positional-and-by-reference assertions for ordering claims: length and membership checks pass against a reversed implementation, so both orderings are asserted by index and by identity"
  - "Falsifiability fixtures: the AllScenarios pass-through test deliberately populates the rule side with entries no real RuleDsl can produce, because against an empty rule side concatenation and pass-through are indistinguishable"

requirements-completed: [DSL-05]

# Metrics
duration: 11min
completed: 2026-08-29
---

# Phase 8 Plan 02: Rule-aware hook store and D-02 hook merge Summary

**Every stored hook now carries a required `ruleId` (null = Feature level), and `Hook.ts` exports `mergeHookSets`, which encodes D-02's Feature-then-Rule / Rule-then-Feature ordering once as pure array concatenation.**

## Performance

- **Duration:** ~11 min
- **Started:** 2026-08-29T18:00:19Z
- **Completed:** 2026-08-29T18:10:37Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- `HookDefinition<Fn>` gained a required `ruleId: string | null`, mirroring `Registry.ts`'s `RegistryScope.ruleId` invariant exactly (`null` iff the hook was registered through the Feature-level dsl). `register` takes it as a parameter; no second scope stack was introduced, and `HookRegistry.ts` still imports nothing.
- The module header's now-false claim ("Hooks are Feature-scoped only… There is no Rule-scoped hook narrowing in this roadmap") was rewritten to state the new invariant, why `BeforeAllScenarios`/`AfterAllScenarios` stay Feature-only, why that constraint lives in the DSL rather than in the store, and why a hook's `ruleId` is fixed at registration and never pushed/popped.
- `Hook.ts` gained `emptyHookSet` (one shared instance, safe because `HookSet`'s arrays are read-only and nothing in the package mutates one in place) and `mergeHookSets`, whose four Rule-scopeable keys concatenate in D-02's order and whose two AllScenarios keys pass `feature`'s arrays straight through by reference.
- New `Hook.ts` note (h) records why no second `Effect.onExit` tier is needed at any consuming call site — `runHookBatch` already treats whatever array it is handed as one independent batch with combined causes, so ORDER is the entire contract of the merge.
- Both test files were extended with mutation-tested assertions: `hooks().filter(h => h.ruleId === …)` separates three same-kind hooks by that field alone; both merge orderings are asserted positionally AND by reference; and `runHookBatch` on a merged array proves concatenation order is execution order in both directions.

## Task Commits

Each task was committed atomically:

1. **Task 1: HookRegistry.ts — a required ruleId on every stored hook** — `c0fa940` (feat)
2. **Task 2: Hook.ts — emptyHookSet and mergeHookSets** — `3b69551` (feat)

## Files Created/Modified

- `packages/vitest/src/HookRegistry.ts` — `HookDefinition.ruleId`, `register(kind, ruleId, body)`, rewritten header stating the Rule-scoping invariant and why no scope stack appears
- `packages/vitest/src/Hook.ts` — `emptyHookSet`, `mergeHookSets`, new note (h) on why array order is the whole contract
- `packages/vitest/src/describeFeature.ts` — the Feature-level `hookRegistrar` now passes `null` explicitly (call-site fix forced by the signature change)
- `packages/vitest/test/HookRegistry.test.ts` — every existing `register` call updated; two new tests proving `ruleId` is intact and that Feature-/Rule-scoped hooks separate by that field alone
- `packages/vitest/test/Hook.test.ts` — `HookDefinition` fixtures gained `ruleId: null`; eleven new tests covering both merge orderings, `emptyHookSet` as identity element, the AllScenarios pass-through by array reference, and the two ordered-log `runHookBatch` proofs

## Decisions Made

- **Argument position for `ruleId`.** Placed between `kind` and `body` rather than appended. `Fn` is an unconstrained type parameter, so a trailing-`ruleId` signature would let `register(kind, body)` type-check with `body` read as the scope whenever `Fn` admits `string | null`. Leading with the classifiers makes a forgotten argument a compile error.
- **No `RegistryScope` import.** `08-PATTERNS.md` offered `scope: RegistryScope | null` or the narrower `ruleId: string | null`. The narrower field was chosen because it preserves `HookRegistry.ts` note (c)'s zero-import property, and because a hook has no `kind`/`name` scope data to carry — only a Rule identity.
- **Pass-through, not no-op concatenation, for the two AllScenarios keys.** Concatenating `rule`'s always-empty arrays would work today and leave nothing in the source saying those kinds are Feature-only; a later change that made `rule`'s arrays reachable would silently start merging them.
- **Ordering asserted twice.** Once structurally (positional, by reference) and once end-to-end through `runHookBatch` with an append-only `Ref`. The structural assertions pin the data; the log assertions prove the claim D-02 actually makes.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated `describeFeature.ts`'s Feature-level `hookRegistrar` call site**

- **Found during:** Task 1 (HookRegistry signature change)
- **Issue:** `describeFeature.ts:215` called `hookRegistry.register(kind, registerHook(kind, fn))`. The plan's `files_modified` did not list `describeFeature.ts`, but the two-argument call is the only production consumer of `register` and does not compile against the three-argument signature — `pnpm build` fails without this edit.
- **Fix:** Changed the call to `hookRegistry.register(kind, null, registerHook(kind, fn))`, with a comment stating that `null` is this store's spelling of "registered through the Feature-level dsl" and not a placeholder awaiting a value (so a later reader does not "complete" it).
- **Files modified:** `packages/vitest/src/describeFeature.ts`
- **Verification:** `pnpm build`, `pnpm lint`, `pnpm test` (577 passing at that commit) all exit 0
- **Committed in:** `c0fa940` (Task 1 commit)

**2. [Rule 3 - Blocking] Added `ruleId: null` to `Hook.test.ts`'s `HookDefinition` literals during Task 1**

- **Found during:** Task 1 (HookRegistry type change)
- **Issue:** `Hook.test.ts`'s `groupHooks` fixture builds `HookDefinition<HookBody>` object literals directly. A required `ruleId` makes those literals a type error, so `pnpm typecheck:test` fails between Task 1 and Task 2 — leaving the tree type-broken at an intermediate commit.
- **Fix:** Added `ruleId: null` to all three fixture literals in the Task 1 commit (rather than deferring to Task 2, which owns that file), with a comment noting that `groupHooks` partitions whatever list it is handed and never filters by scope itself.
- **Files modified:** `packages/vitest/test/Hook.test.ts`
- **Verification:** `pnpm typecheck:test` exits 0 at commit `c0fa940`
- **Committed in:** `c0fa940` (Task 1 commit)

**3. [Rule 3 - Blocking] Installed workspace dependencies in the worktree**

- **Found during:** Task 1 verification
- **Issue:** The parallel-execution worktree had no `node_modules`, so `pnpm vitest run …` failed with `Command "vitest" not found`. No verification command in either task could run.
- **Fix:** Ran `pnpm install --frozen-lockfile`. No manifest or lockfile change — this is environment setup, not a dependency addition (threat register entry T-08-02-SC still holds: `pnpm-lock.yaml` and both manifests are untouched by this plan).
- **Files modified:** none (`node_modules/` is gitignored)
- **Verification:** `git status --short` clean after both task commits; `git diff` shows no change to `pnpm-lock.yaml` or any `package.json`
- **Committed in:** n/a (no tracked file changed)

**4. [Rule 3 - Blocking] Reworded the header to satisfy the "no scope stack" acceptance grep**

- **Found during:** Task 1 acceptance check
- **Issue:** The rewritten header explained the absence of a stack by naming `pushScope`/`popScope`/`currentScope` in prose, which made the acceptance criterion `grep -cE "pushScope|popScope|currentScope" packages/vitest/src/HookRegistry.ts` output `1` instead of `0`.
- **Fix:** Reworded to "`Registry.ts`'s push/pop scope stack", preserving the explanation while restoring the criterion's intent (the identifiers appear nowhere in this module, in code or in prose).
- **Files modified:** `packages/vitest/src/HookRegistry.ts`
- **Verification:** the grep outputs `0`; `pnpm lint` exits 0
- **Committed in:** `c0fa940` (Task 1 commit)

---

**Total deviations:** 4 auto-fixed (4 blocking)
**Impact on plan:** All four were mechanically forced by the plan's own signature change or by the worktree environment. No behavior beyond the plan's stated scope was added, and no dependency was introduced.

## Issues Encountered

None beyond the blocking items above. All acceptance criteria were met on first verification once the environment was installed.

## Verification Results

Plan-level `<verification>`, all exit 0:

- `pnpm build` — both packages compile clean
- `pnpm lint` — `oxlint -f unix && dprint check`
- `pnpm test` — 29 files, 588 tests passing (up from 577; 11 new tests)
- `pnpm typecheck:test` — both test projects
- `pnpm circular` — no cycles; `Hook.ts`'s local imports remain `HookRegistry.ts` and `Step.ts`
- `pnpm verify:tsgo-gate` — `tsgo gate: ENFORCED`, all 11 checks pass

Task acceptance greps:

| Criterion | Required | Actual |
|-----------|----------|--------|
| `grep -c "ruleId" src/HookRegistry.ts` | ≥ 4 | 14 |
| `grep -c "^import" src/HookRegistry.ts` | 0 | 0 |
| `grep -cE "pushScope\|popScope\|currentScope" src/HookRegistry.ts` | 0 | 0 |
| `grep -c "register(.*null.*)" test/HookRegistry.test.ts` | ≥ 1 | 8 |
| `grep -cE 'ruleId: "r1"\|filter\(.*ruleId' test/HookRegistry.test.ts` | ≥ 1 | 3 |
| `grep -c "emptyHookSet" src/Hook.ts` | ≥ 1 | 3 |
| `grep -c "mergeHookSets" src/Hook.ts` | ≥ 1 | 4 |
| `grep -vE '^\s*(//\|\*\|/\*)' src/Hook.ts \| grep -c "Effect.onExit"` | 0 | 0 |
| `grep -A2 "After:" src/Hook.ts \| grep -c "\.\.\.rule.After.*\.\.\.feature.After"` | ≥ 1 | 2 |

## Known Stubs

None. Every export added by this plan is fully implemented and exercised by tests. `mergeHookSets` and `emptyHookSet` have no production consumer yet — that wiring is 08-05a's and 08-07's job, as the plan's own objective states — but they are complete functions, not placeholders.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- **08-05a (rule-scoped hook registration)** has its contract: build a Rule's dsl registrar that calls `hookRegistry.register(kind, thatRule.id, registerHook(kind, fn))`, then filter `hooks()` by `ruleId` before handing the flat list to `groupHooks`. `groupHooks` needs no change and was not modified.
- **08-07 (Runner.ts / ScenarioEffect.ts call sites)** has its contract: call `mergeHookSets(featureHookSet, ruleHookSet)` once per Rule and pass the result to the existing `buildScenarioEffect` parameter. Pass `emptyHookSet` as the `rule` argument for a Scenario with no enclosing Rule. No new `Effect.onExit` tier, no change to `runHookBatch`.
- **Dependency on 08-01 (same wave):** this plan's `HookRegistry.ts` header cites `Registry.ts`'s `RegistryScope.ruleId`, which 08-01 adds. Both land in wave 1, so the citation is accurate post-merge. Nothing in this plan's code imports or reads `Registry.ts`, so the two plans do not conflict at the file level.
- No blockers.

---
*Phase: 08-rule-and-scenario-outline*
*Completed: 2026-08-29*

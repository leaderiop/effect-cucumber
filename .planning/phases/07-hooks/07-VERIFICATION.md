---
phase: 07-hooks
verified: 2026-08-29T18:20:00Z
status: passed
score: 9/9 must-haves verified
overrides_applied: 0
---

# Phase 7: Hooks Verification Report

**Phase Goal:** All six hooks are Effects with a defined execution order, and `After` runs whether the Scenario passed or failed.
**Verified:** 2026-08-29
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Each of `Before`/`After`/`BeforeStep`/`AfterStep`/`BeforeAllScenarios`/`AfterAllScenarios` accepts a bare generator function and is registered auto-wrapped as a named `Effect.fn` (SC #1, DSL-07) | VERIFIED | `packages/vitest/src/Hook.ts`'s `registerHook` delegates to `Step.ts`'s `register`, wrapping a bare generator with `Effect.fn(kind)` using the hook's own name; an already-wrapped body is returned by identity. `packages/vitest/src/Dsl.ts` exposes all six members (`Before`, `After`, `BeforeStep`, `AfterStep`, `BeforeAllScenarios`, `AfterAllScenarios`) on `FeatureDsl` only (lines 215-226), not on `ScenarioDsl`. `packages/vitest/test/Hook.test.ts` asserts the span-name and reference-identity-on-already-wrapped behavior; `verify-tsgo-gate.sh` assertion 10 proves a Scenario callback cannot reach a hook registrar (`@ts-expect-error`). All confirmed passing (`pnpm test`: 575/575; `verify:tsgo-gate`: 11/11). |
| 2 | An append-only `Ref` log asserts the full ordering across a two-Scenario Feature: `BeforeAllScenarios → (Before → BeforeStep/AfterStep per step → After) per Scenario → AfterAllScenarios` (SC #2, DSL-07) | VERIFIED | `packages/vitest/test/Runner.test.ts` lines 917-1043, the headline test literally titled "the phase's headline assertion: the full six-hook ordering across a two-Scenario Feature (roadmap SC #2)". A single `assert.deepStrictEqual` compares one append-only `Ref` log against the exact expected 36-entry sequence for a two-Scenario Feature with all six hook kinds registered. Test passes. Also proven through a real `describeFeature` run in `packages/vitest/test/emission.test.ts` (lines 372-520). |
| 3 | `After` runs and its effect is observable in the log both when every step succeeded and when a step failed mid-Scenario, via the guaranteed mechanism (SC #3, RUN-02, INV-EC-004) | VERIFIED (mechanism is `Effect.onExit`, not the ROADMAP's literal `Effect.ensuring` wording — see note below) | `packages/vitest/src/ScenarioEffect.ts` line 222: `Effect.onExit(() => runHookBatch(args.hooks.After))` wraps the whole composed generator (Before gate + step loop). Source comment (note e, lines 88-98) explains `Effect.ensuring`'s finalizer error channel is `never` in the installed `effect@4.0.0-rc.112` build (verified against `Effect.d.ts`), so a fallible `After` hook isn't assignable to it and it merges no causes — `Effect.onExit` is used instead. `spec/behaviors/02-shared-layers-and-tags.md` BEH-EC-006 §correction (ii) and `spec/invariants.md` INV-EC-004 both document this in place with the same reasoning. `test/ScenarioEffect.test.ts` (lines 449-624) asserts `After` on success, on step failure, and on Before-gate failure. |
| 4 | A failing `After` does not mask or replace the original step failure in the reported error (SC #4) | VERIFIED | `test/ScenarioEffect.test.ts` line 564: "combines the step's own failure and the After hook's failure, by reference identity (roadmap SC #4)" — passing. `Hook.ts`'s `runHookBatch` folds failures with `Cause.combine` (never `Cause.squash`, which would lose identity). Mutation D in `07-04-SUMMARY.md` (swapping `Effect.onExit` for `Effect.ensuring` + `catchCause`) was performed and confirmed to fail the intended test (`errors.length` 1 instead of 2, i.e. the After failure silently dropped) — direct proof the guard is load-bearing. |
| 5 | `BeforeStep`/`AfterStep` bracket every step including Background, with `AfterStep` guaranteed across the whole unit (D-05/D-06/D-07) | VERIFIED | `ScenarioEffect.ts` lines 201-214: per-step `Effect.gen` (BeforeStep + body) wrapped in `Effect.onExit(() => runHookBatch(args.hooks.AfterStep))`. `test/ScenarioEffect.test.ts` lines 626-802 cover Background bracketing, registration order, fail-fast-stops-later-units, AfterStep-runs-when-BeforeStep-failed, and combine-don't-mask. Mutations H, I, J in `07-05-SUMMARY.md` performed and confirmed to fail the intended tests. |
| 6 | `BeforeAllScenarios` runs exactly once per Feature and fans a failure out to every Scenario; `AfterAllScenarios` always runs (D-08/D-09) | VERIFIED | `packages/vitest/src/Runner.ts`'s `makeOnce` (lines 170-185) uses a synchronous `Deferred.makeUnsafe` cell so every Scenario thunk awaits the same outcome; `AfterAllScenarios` is emitted as a separate always-attempted node (lines 287-294), a sibling of Scenario nodes so no Scenario or `BeforeAllScenarios` failure can suppress it. `test/Runner.test.ts` lines 698-1044 cover once-across-N (both document and reverse order), failure-fans-out by reference identity, ordering relative to `Before`, and runs-even-when-earlier-failed. Mutations K-N in `07-06-SUMMARY.md` performed and confirmed to fail the intended tests. |
| 7 | Hooks attach via the Feature-level DSL only, never a module-level registry (DSL-04 compliance, phase boundary) | VERIFIED | `packages/vitest/src/HookRegistry.ts`'s `createHookRegistry` is a factory (no module-level mutable state); `describeFeature.ts` creates one fresh `hookRegistry` per invocation (line 187) and only `FeatureDsl` exposes the six registrar members (`Dsl.ts` lines 215-226); `ScenarioDsl` does not. `verify-tsgo-gate.sh` assertion 10 proves a hook registrar is unreachable from a Scenario callback. |
| 8 | DSL-07 and RUN-02 are marked Complete in REQUIREMENTS.md, each backed by a named automated assertion | VERIFIED | `.planning/REQUIREMENTS.md` lines 33, 38, 99, 101 mark both `[x]` Complete, with a dated traceability note (lines 118-127) naming the specific test files (`Hook.test.ts`, `verify-tsgo-gate.sh` assertions 10/11, `Runner.test.ts`'s full ordering test, `ScenarioEffect.test.ts`'s After-guarantee tests, `emission.test.ts`'s real-run proof). All confirmed present and passing. |
| 9 | The phase's own spec corrections (BEH-EC-006, INV-EC-004, new BEH-EC-017) are in place and traceability is intact | VERIFIED | `spec/behaviors/07-hook-ordering-and-guarantees.md` (BEH-EC-017) is new and complete; `spec/behaviors/02-shared-layers-and-tags.md` BEH-EC-006 carries an in-place, dated correction naming `Effect.onExit` as the real combinator; `spec/invariants.md` INV-EC-004 names the real source module and test. `pnpm verify:spec` passes (7 PASS, 1 SKIP, 0 FAIL, 250 links resolved). |

**Score:** 9/9 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/vitest/src/HookRegistry.ts` | Per-call hook store, `createHookRegistry` | VERIFIED | Factory pattern, no module state, registration-order preserving snapshot copy |
| `packages/vitest/src/Hook.ts` | `registerHook`, `groupHooks`, `runHookBatch` | VERIFIED | Delegates normalization to `Step.ts`; `runHookBatch` is a bare `for` loop with `Cause.combine` folding, never `Effect.ensuring`/`Effect.forEach` |
| `packages/vitest/src/Dsl.ts` | `HookRegistrar<ROut>`, six `FeatureDsl` members | VERIFIED | All six members present on `FeatureDsl` only |
| `packages/vitest/src/describeFeature.ts` | Per-call hook registry, `FeatureCollection.hooks` | VERIFIED | `hooks: groupHooks(hookRegistry.hooks())` wired into `FeatureCollection`, passed to `emitFeature` |
| `packages/vitest/src/ScenarioEffect.ts` | `Before` gating and `After`/`AfterStep` guarantees via `Effect.onExit` | VERIFIED | Contains `Effect.onExit` twice (Scenario-level After, per-step AfterStep); no `Effect.ensuring` in the file |
| `packages/vitest/src/Runner.ts` | Hooks threaded through, once-cell for `BeforeAllScenarios`, `AfterAllScenarios` node | VERIFIED | `makeOnce`/`Deferred`-based once-cell; `hooks: HookSet` required field on `emitFeature` |
| `packages/vitest/test/{HookRegistry,Hook,ScenarioEffect,Runner,emission}.test.ts` | Ordering, gating, guarantee, combined-cause, real-run assertions | VERIFIED | 2211+ lines across these five files; 575/575 workspace tests pass |
| `packages/vitest/test/tsgo-gate/src/hook-{satisfied,missing-service}.ts` | Gate assertions 10/11 | VERIFIED | `verify-tsgo-gate.sh`: 11/11 assertions pass, including both hook-specific ones |
| `spec/behaviors/07-hook-ordering-and-guarantees.md` | BEH-EC-017 | VERIFIED | Present, registered in `spec/behaviors/index.yaml`, `verify:spec` passes |
| `.planning/REQUIREMENTS.md` | DSL-07 and RUN-02 marked Complete | VERIFIED | Both `[x]`, traceability note present |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `Hook.ts` | `Step.ts` | `registerHook` delegates to `register` with the hook kind as pattern | WIRED | `import { register } from "./Step.ts"`, used in `registerHook` |
| `Hook.ts` | `effect/Cause` | `Cause.combine` folding a batch's failures | WIRED | `runHookBatch` reduces failures with `Cause.combine` from `Cause.empty` |
| `describeFeature.ts` | `Hook.ts` | `hookRegistrar` normalizes via `registerHook` | WIRED | `hookRegistry.register(kind, registerHook(kind, fn))` |
| `describeFeature.ts` | `HookRegistry.ts` | one fresh registry per `collect()`/call | WIRED | `const hookRegistry = createHookRegistry<HookBody>()` inside `describeFeature` |
| `describeFeature.ts` | `Runner.ts` | `emitFeature` receives `collection.hooks` | WIRED | `emitFeature({ api: vitestTestApi, plan: collection.plan, layer: collection.layer, hooks: collection.hooks })` |
| `Runner.ts` | `ScenarioEffect.ts` | `buildScenarioEffect` receives the `HookSet` | WIRED | `buildScenarioEffect({ plan: scenarioPlan, layer, hooks })` called in both Scenario-emission loops |
| `ScenarioEffect.ts` | `Hook.ts` | `runHookBatch` for Before/After/BeforeStep/AfterStep batches | WIRED | Four call sites: Before gate, After guarantee, BeforeStep, AfterStep |
| `Runner.ts` | `effect/Deferred` | `Deferred.makeUnsafe` once-cell, awaited by every later Scenario | WIRED | `makeOnce` function, lines 170-185 |
| `Runner.ts` | `Hook.ts` | `runHookBatch` for the two all-scenarios batches | WIRED | `runHookBatch(hooks.BeforeAllScenarios)` and `runHookBatch(hooks.AfterAllScenarios)` |
| `index.ts` | `Dsl.ts` | `HookRegistrar` exported on the existing type-export line | WIRED | `export type { BackgroundDsl, FeatureDsl, HookRegistrar, ScenarioDsl, StepRegistrar } from "./Dsl.ts"` |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full workspace test suite passes | `pnpm -w test` | 29 files, 575 tests passed | PASS |
| `packages/vitest` package test suite passes | `pnpm --filter @effect-cucumber/vitest test` | 11 files, 162 tests passed | PASS |
| Full type-check | `pnpm -w tsc -b` | 0 errors | PASS |
| tsgo compile-time gate (hooks assertions 10/11 included) | `bash scripts/verify-tsgo-gate.sh` | 11/11 assertions pass, "tsgo gate: ENFORCED" | PASS |
| Spec traceability | `pnpm -w verify:spec` | 7 PASS, 1 SKIP, 0 FAIL, 250 links resolved | PASS |
| Lint (oxlint + dprint) | `pnpm -w lint` | 0 errors | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| DSL-07 | 07-01 through 07-08 | Hooks accept a bare generator function, auto-wrapped with `Effect.fn(name)` | SATISFIED | `Hook.test.ts` span-name/identity assertions; `Runner.test.ts` full six-hook ordering test; `verify-tsgo-gate.sh` assertions 10-11; `.planning/REQUIREMENTS.md` line 33/99 marked Complete |
| RUN-02 | 07-04, 07-05 | `After` hook runs whether every step succeeded or one failed | SATISFIED | `ScenarioEffect.test.ts` After-on-step-failure and failing-After-does-not-mask assertions; `emission.test.ts` real-run hook proof; `.planning/REQUIREMENTS.md` line 38/101 marked Complete |

No orphaned requirements — both IDs declared in every relevant plan's `requirements` field and present in REQUIREMENTS.md's Phase 7 traceability row.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `.planning/ROADMAP.md` | 26, 294 | Headline and Success Criterion #3 text literally say `Effect.ensuring`, while the actual (and correctly documented) mechanism is `Effect.onExit` | INFO (documentation nit, not a goal-achievement failure) | The roadmap's own "Resolved at planning time..." paragraph (line 328) already documents the correction and the reason (`Effect.ensuring`'s finalizer error channel is `never` in the installed `effect@4.0.0-rc.112` build). `spec/behaviors/02-shared-layers-and-tags.md` and `spec/invariants.md` both carry the in-place, dated correction. This is the same class of correction Phase 3/4 made to other spec text — a deliberate, well-documented deviation, not an unresolved gap. No override needed since it does not fail a truth (see Truth #3 above, marked VERIFIED against the actual mechanism). Recommend updating ROADMAP.md line 26 and line 294's literal wording to say `Effect.onExit` for future-reader clarity, but this does not block the phase. |

No `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` markers found in any of the phase's modified source files (`HookRegistry.ts`, `Hook.ts`, `Dsl.ts`, `describeFeature.ts`, `ScenarioEffect.ts`, `Runner.ts`, `index.ts`). No stub returns (`return null`, empty handlers, hardcoded empty data) found in any hook-related source file.

### Human Verification Required

None. This phase's deliverables (Effect composition, ordering guarantees, DSL type surface) are fully verifiable through automated tests, mutation testing (documented per-plan in each SUMMARY.md and independently confirmed present in the test files), the tsgo compile-time gate, and spec traceability checks — no visual, real-time, or external-service behavior is in scope.

### Gaps Summary

None. All 9 derived must-haves (roadmap Success Criteria 1-4, DSL-07, RUN-02, plus phase-boundary/spec-reconciliation truths) are VERIFIED against actual source, with all supporting artifacts substantive and wired end-to-end (`describeFeature.ts` → `Runner.ts` → `ScenarioEffect.ts` → `Hook.ts`), and the full automated suite (575 tests, 11-assertion tsgo gate, spec traceability, lint, full type-check) passes. The one documentation nit (ROADMAP.md's stale `Effect.ensuring` wording) does not affect goal achievement — the actual mechanism (`Effect.onExit`) is correctly implemented and is the one described, with reasoning, everywhere that matters (source comments, spec/behaviors, spec/invariants, and the roadmap's own resolution paragraph).

---

_Verified: 2026-08-29T18:20:00Z_
_Verifier: Claude (gsd-verifier)_

---
phase: 07-hooks
plan: 02
subsystem: testing
tags: [effect, effect-ts, vitest, cucumber, hooks, dsl, type-surface]

# Dependency graph
requires:
  - phase: 07-hooks
    provides: "07-01's HookRegistry.ts (createHookRegistry) and Hook.ts (registerHook, groupHooks) leaf modules"
provides:
  - "Dsl.ts: HookRegistrar<ROut> callable interface and six FeatureDsl<ROut> hook members (Before/After/BeforeStep/AfterStep/BeforeAllScenarios/AfterAllScenarios)"
  - "describeFeature.ts: one fresh hook registry per collect() invocation, a hookRegistrar closure wired to Hook.ts's registerHook, six hook members on the dsl object literal, and FeatureCollection.hooks: HookSet (required field)"
affects: [07-03, 07-04, 07-05, 07-06, 07-07, 07-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "HookRegistrar<ROut> copies StepRegistrar<ROut>'s callable-interface shape verbatim, minus Params/pattern — generator branch first, Scope.Scope spelled on both union members, R bound to ROut through the interface (never a free call-signature type parameter)"
    - "hookRegistrar closure mirrors describeFeature.ts's step registrar exactly, except it deliberately omits captureCallSite() — hooks have no definedAt field (HookRegistry.ts note (e)), so a hook failure's attribution channel is its Effect.fn(kind) span name, not a captured site"
    - "Hook members are siblings of Background/Scenario in the dsl object literal, never spread into scenarioDsl — scenarioDsl is the same object handed to every Scenario(...) callback, so spreading there would leak hooks into a container that must not have them"

key-files:
  created: []
  modified:
    - packages/vitest/src/Dsl.ts
    - packages/vitest/src/describeFeature.ts
    - packages/vitest/test/describeFeature.test.ts

key-decisions:
  - "DSL-07 marked Complete in REQUIREMENTS.md by this plan. Its literal text ('Hooks accept a bare generator function, auto-wrapped with Effect.fn(name)') is now reachable by a consumer through describeFeature/collectFeature, not just internal to Hook.ts as it was after 07-01. RUN-02 (the After-runs-via-Effect.ensuring execution guarantee) stays Pending — this plan stops at COLLECTION, nothing hooks-related is executed yet; that is plan 07-04's job."
  - "HookRegistrar<ROut> has no Params and no pattern parameter, unlike StepRegistrar<ROut> — a hook takes no arguments (ADR-EC-005's Negative consequence: BeforeStep/AfterStep do not receive the step). This makes HookRegistrar the only registrar interface in the file containing zero any, keeping the StepRegistrar's ReadonlyArray<any> the sole any in the module."
  - "The six hook members live on FeatureDsl only, never on ScenarioDsl or BackgroundDsl, verified both at the type level (all six member lines report at a greater line number than 'export interface FeatureDsl') and at runtime (a new test asserts the object handed to a Scenario callback has no Before/After/etc. keys)."
  - "No captureCallSite() call in the hookRegistrar closure — a deliberate omission, not a gap. Recorded as a comment at the call site itself so a future reader does not 'helpfully' add one: HookRegistry.ts's HookDefinition carries no definedAt, and adding an unconsumed capture would be the 'say only what is true' violation AGENTS.md §4 names."

patterns-established:
  - "House module-doc convention: Dsl.ts's note (a) extended to name a third generator-branch-first copy (Hook.ts, alongside itself and Step.ts), and a new note (f) added stating the FeatureDsl-only placement, its plausible tidy-up ('make the containers consistent'), and its behavioral proof (plan 07-03's hook-satisfied.ts @ts-expect-error fixture, gate assertion 10)."
  - "describeFeature.test.ts's mutation header extended from four to six entries (E: hookRegistry hoisted to module scope, F: hook members spread into scenarioDsl), matching the file's existing convention of naming every mutation the test suite is built to catch."

requirements-completed: [DSL-07]

# Metrics
duration: ~20min
completed: 2026-08-29
---

# Phase 7 Plan 02: Hook DSL type surface and registration seam Summary

**HookRegistrar<ROut> and six FeatureDsl members give hooks a compile-time surface identical in shape to StepRegistrar's; describeFeature's composition root registers all six kinds into a per-call hook registry and exposes them on FeatureCollection.hooks, grouped by kind and in registration order — collection only, nothing executes yet.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-08-29T14:50:00Z (approx, first file read)
- **Completed:** 2026-08-29T14:59:04Z
- **Tasks:** 2 completed
- **Files modified:** 3

## Accomplishments
- `Dsl.ts`'s `HookRegistrar<ROut>`: a callable interface with the generator branch first, `Scope.Scope` spelled on both union members, `R` bound to `ROut` through the interface, and zero `any` — the file's existing single `any` (in `StepRegistrar`'s `ReadonlyArray<any>`) remains the only one
- Six new `FeatureDsl<ROut>` members (`Before`/`After`/`BeforeStep`/`AfterStep`/`BeforeAllScenarios`/`AfterAllScenarios`), each `readonly HookRegistrar<ROut>`, placed on `FeatureDsl` only — verified both by a line-number acceptance grep and by a new runtime assertion that a `Scenario` callback's dsl carries none of the six keys
- `describeFeature.ts`'s `collect`: one fresh `createHookRegistry<HookBody>()` per invocation, a `hookRegistrar` closure that normalises every body through `Hook.ts`'s `registerHook` at registration time (no `captureCallSite()` — hooks have no `definedAt`, by design), and the six hook registrars as `dsl` siblings of `Background`/`Scenario`
- `FeatureCollection.hooks: HookSet` — a required field, populated via `groupHooks(hookRegistry.hooks())` inside the shared `collect` implementation so `describeFeature` and `collectFeature` cannot drift into two behaviours
- Six new assertions in `describeFeature.test.ts`: all six kinds land under their own key; two `Before` hooks come back in registration order by reference identity (using already-`Effect.fn`-wrapped bodies so identity is meaningful); a kind nobody registered is an empty array, not an absent key; two `collectFeature` calls in one test share no hook state; an already-wrapped hook reaches `collection.hooks` by reference identity; a `Scenario` callback's dsl has no `Before` key at runtime

## Task Commits

Each task was committed atomically:

1. **Task 1: HookRegistrar and the six FeatureDsl members** - `7411578` (feat)
2. **Task 2: hook registration in the composition root, and FeatureCollection.hooks** - `1293641` (feat)

**Plan metadata:** this commit (docs: complete plan)

## Files Created/Modified
- `packages/vitest/src/Dsl.ts` - `HookRegistrar<ROut>` interface; six `FeatureDsl` hook members; note (a) extended, note (f) added
- `packages/vitest/src/describeFeature.ts` - per-call `hookRegistry`, `hookRegistrar` closure, six `dsl` hook members, `FeatureCollection.hooks: HookSet` (required), populated in `collect`'s return
- `packages/vitest/test/describeFeature.test.ts` - six new assertions under a new `describe("the collection carries every registered hook, grouped by kind")` block; mutation header extended with entries E and F; a position-sensitive hardcoded line number (`givenLine`) updated from 259 to 262 to track the mutation-header insertion

## Decisions Made
- DSL-07 marked Complete — see key-decisions above for the full "reachable by a consumer" argument and why RUN-02 stays Pending
- `HookRegistrar` has no `Params`/`pattern`, unlike `StepRegistrar` — hooks take no arguments (ADR-EC-005's Negative consequence)
- Six hook members are `FeatureDsl`-only, never `ScenarioDsl`/`BackgroundDsl` — verified at both the type level and at runtime
- No `captureCallSite()` in `hookRegistrar` — hooks have no `definedAt` per 07-01's `HookRegistry.ts` note (e); the omission is recorded as a comment, not left silent

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `it.effect` wrapper with no top-level `yield*` failed oxlint's `require-yield`**
- **Found during:** Task 2 (writing the already-wrapped-hook identity test)
- **Issue:** The first draft wrapped the assertion in `it.effect(..., () => Effect.gen(function*() { ... }))` where the outer generator's only `yield*` was nested inside a separately-constructed `Effect.fn` body, not in the outer generator itself — `pnpm lint` failed with `This generator function does not have yield [Error/eslint(require-yield)]`.
- **Fix:** The test needs no `Effect` context at all (`collectFeature` is synchronous), so it was rewritten as a plain `it(...)` using `expect`/`toBe`, consistent with every other synchronous assertion in this file.
- **Files modified:** `packages/vitest/test/describeFeature.test.ts`
- **Verification:** `pnpm lint` exits 0; `pnpm vitest run packages/vitest/test/describeFeature.test.ts` — 20/20 pass
- **Committed in:** `1293641` (Task 2 commit)

**2. [Rule 1 - Bug] Hardcoded `givenLine` position-sensitive literal went stale**
- **Found during:** Task 2 (extending the mutation header by two lines, E and F)
- **Issue:** `test/describeFeature.test.ts` has an existing assertion (`names this test file and the exact line of the Given call`) that hardcodes the real line number of a `Given(...)` call as a literal. Extending the module-doc mutation header above it by two lines shifted that call from line 259 to 262, and the test failed with `expected 262 to be 259` until the literal was updated.
- **Fix:** Updated the `givenLine` constant from `259` to `262` to match the call's real position after the edit.
- **Files modified:** `packages/vitest/test/describeFeature.test.ts`
- **Verification:** `pnpm vitest run packages/vitest/test/describeFeature.test.ts` — 20/20 pass
- **Committed in:** `1293641` (Task 2 commit)

**3. [Rule 1 - Bug] Comments mentioning `emitFeature` by name violated the plan's own acceptance criterion**
- **Found during:** Task 2 (writing doc comments explaining the deferred emission wiring)
- **Issue:** The plan's acceptance criteria require `git diff packages/vitest/src/describeFeature.ts | grep -c "emitFeature"` to output `0`, proving the emission call is untouched by this plan. The first draft of two new doc comments named `emitFeature` explicitly while explaining that plan 07-04 will wire hooks into it, which made the literal string appear in the diff even though the actual call site was never touched.
- **Fix:** Reworded both comments to refer to "the emission stage" / "the emission stage's own entry point" instead of naming `emitFeature` literally.
- **Files modified:** `packages/vitest/src/describeFeature.ts`
- **Verification:** `git diff packages/vitest/src/describeFeature.ts | grep -c "emitFeature"` outputs `0`
- **Committed in:** `1293641` (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (all Rule 1 bugs, all self-inflicted by earlier edits in this same plan, none touching planned scope)
**Impact on plan:** All three were necessary to reach a lint-clean, acceptance-criteria-clean state. No scope creep — `git diff --stat` confirms only the three files the plan named were touched.

## Issues Encountered

One acceptance criterion could not be satisfied literally without deviating from house style: the plan's Task 2 acceptance criteria state `grep -c "createHookRegistry" packages/vitest/src/describeFeature.ts` should output `1`, but a named import (`import { createHookRegistry, ... } from "./HookRegistry.ts"`) plus its one call site (`const hookRegistry = createHookRegistry<HookBody>()`) necessarily produces `2` grep-counted lines — the identical footprint the file's own pre-existing `createRegistry` import/call pair has (also 2, with no such acceptance criterion written against it). A namespace import (`import * as HookRegistry from "./HookRegistry.ts"`) would make the import line not contain the literal call name and satisfy the grep at `1`, but every other local module in this file (`Registry.ts`, `Step.ts`, `Runner.ts`, `CallSite.ts`) uses a named import, and switching only `HookRegistry.ts` to a namespace import to satisfy an incidental grep count would be an inconsistent, cosmetic change made for the wrong reason. Kept the named-import form matching house style and `createRegistry`'s established precedent; the substantive claim the criterion exists to protect — "one fresh hook registry per invocation, never memoised, never hoisted" — is independently verified by the isolation test (`shares no hook state between two collectFeature calls in one test`), which the plan's own text calls "THE load-bearing isolation assertion."

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness

- `HookRegistrar<ROut>`, the six `FeatureDsl` members, and `FeatureCollection.hooks` are ready for plan 07-03's `test/tsgo-gate/` fixture pair (`hook-satisfied.ts` / `hook-missing-service.ts`) to prove the type surface behaviorally, exactly as `Dsl.ts` note (a) and note (f) both name as their own proof.
- `collection.hooks: HookSet` is collected but not yet consumed — plan 07-04 is where `Before`/`After`/`BeforeStep`/`AfterStep` get woven into `ScenarioEffect.ts`'s per-Scenario `Effect.gen`, and where `BeforeAllScenarios`/`AfterAllScenarios` sharing (D-08/D-09) lands in `Runner.ts`. `emitFeature`'s call inside `describeFeature`'s own body is byte-identical to before this plan (verified: `git diff packages/vitest/src/describeFeature.ts | grep -c emitFeature` is `0`).
- All plan-level verification passed: `pnpm build` (dist/Dsl.js emits only `export {}`), `pnpm lint`, `pnpm verify:tsgo-gate` (9/9 assertions, unchanged from 07-01 — this plan added no new gate fixture, that is 07-03's job), `pnpm typecheck:test`, `pnpm test` (547 tests across 29 files, up from 541 before this plan).
- DSL-07 is now Complete in `REQUIREMENTS.md`. RUN-02 and the rest of Phase 7's execution-semantics requirements stay Pending against the plans that wire hooks into actual Scenario execution.

## Self-Check: PASSED

- FOUND: packages/vitest/src/Dsl.ts
- FOUND: packages/vitest/src/describeFeature.ts
- FOUND: packages/vitest/test/describeFeature.test.ts
- FOUND: .planning/phases/07-hooks/07-02-SUMMARY.md
- FOUND commit 7411578 (Task 1)
- FOUND commit 1293641 (Task 2)

---
*Phase: 07-hooks*
*Completed: 2026-08-29*

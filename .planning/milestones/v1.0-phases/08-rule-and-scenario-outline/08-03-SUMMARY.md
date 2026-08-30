---
phase: 08-rule-and-scenario-outline
plan: 03
subsystem: testing
tags: [typescript, effect, layer, dsl, type-surface, gherkin, rule, scenario-outline]

# Dependency graph
requires:
  - phase: 05-describefeature-type-surface
    provides: "Dsl.ts's StepRegistrar/ScenarioDsl/BackgroundDsl/FeatureDsl, and notes (a)-(f)"
  - phase: 07-hooks
    provides: "HookRegistrar<ROut> and note (f)'s original six-hooks-on-FeatureDsl-only claim"
provides:
  - "RuleDsl<ROut> — extends ScenarioDsl<ROut> with Background, Scenario, and exactly Before/After/BeforeStep/AfterStep"
  - "FeatureDsl<ROut>.Rule — BEH-EC-009's <R2, E2>(name, extraLayer, define) signature, callback receives RuleDsl<ROut | R2>"
  - "ScenarioRegistrar<ROut> — two call signatures, used by both FeatureDsl.Scenario and RuleDsl.Scenario"
  - "Dsl.ts note (f) rewritten to the real hook-placement rule; note (d) amended for extraLayer's RIn any; note (e) extended for per-call R2"
  - "describeFeature.ts placeholders keeping the build green until 08-05a/08-05b wire the runtime"
affects: [08-05a, 08-05b, 08-06, 08-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Multi-call-signature callable interface for a variable-arity DSL member (ScenarioRegistrar), extending the single-signature StepRegistrar/HookRegistrar precedent"
    - "Type surface lands before runtime wiring (Interface-First), with a loud throwing placeholder rather than a silent no-op at the composition root"

key-files:
  created: []
  modified:
    - packages/vitest/src/Dsl.ts
    - packages/vitest/src/describeFeature.ts

key-decisions:
  - "RuleDsl<ROut> extends ScenarioDsl<ROut>, mirroring FeatureDsl — the established precedent, no concrete reason argued otherwise (Claude's Discretion, 08-CONTEXT.md)"
  - "RuleDsl exposes exactly four hooks; BeforeAllScenarios/AfterAllScenarios are deliberately absent (Claude's Discretion default; ADR-EC-010's Rule-scopeable list)"
  - "RuleDsl.Background reuses BackgroundDsl<ROut> verbatim rather than a Rule-flavoured copy (D-04) — the Given/And grammar restriction does not change one nesting level down"
  - "Scenario's extra Layer is genuinely optional (two call signatures), NOT always-required-but-possibly-Layer.empty — unlike describeFeature's D-03 object, Scenario has no collision precedence for a required key to document"
  - "ScenarioRegistrar is a callable interface with two call signatures, not a union of two function types — a union does not resolve by argument count"
  - "The three-argument Scenario and the Rule member throw at the composition root until 08-05b/08-05a land, rather than registering steps while dropping extraLayer (which would be a false green)"

patterns-established:
  - "Variable-arity DSL member: declare N call signatures on one interface, commonest form first (TypeScript resolves top-down); the implementation must be a single arity-dispatching function, because a shorter function is not assignable to a signature taking a different type in that position"
  - "Unimplemented runtime behind a landed type surface throws with a named plan reference, never no-ops — AGENTS.md §4"

# Metrics
duration: 12min
completed: 2026-08-29
---

# Phase 8 Plan 03: Rule/Scenario DSL Type Surface Summary

**`RuleDsl<ROut>`, `FeatureDsl.Rule` and a two-signature `ScenarioRegistrar<ROut>` land ADR-EC-010's compile-time boundary in `Dsl.ts` — the type-only half of D-01 and D-04, with every existing `Scenario(...)` call site untouched.**

## Performance

- **Duration:** ~12 min
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- `RuleDsl<ROut> extends ScenarioDsl<ROut>` with `Background`, `Scenario`, and exactly `Before`/`After`/`BeforeStep`/`AfterStep` — no `BeforeAllScenarios`, no `AfterAllScenarios`.
- `FeatureDsl<ROut>.Rule` carries BEH-EC-009's literal generic signature; the `RuleDsl<ROut | R2>` union is INV-EC-005 expressed as a type.
- `ScenarioRegistrar<ROut>` gives `Scenario` a real three-argument overload while leaving the two-argument form byte-for-byte unchanged. All 5 existing two-argument call sites (3 in `describeFeature.test.ts`, 2 in `test/tsgo-gate/src/`) compile with no edit — no test file was touched by this plan.
- Three module-header notes corrected in place so the file still says only what is true: note (f) (the one this phase contradicts), note (d) (the `any` policy), note (e) (per-call-site type parameters).

## Task Commits

1. **Task 1: RuleDsl and FeatureDsl.Rule** — `2f197a0` (feat)
2. **Task 2: ScenarioRegistrar — the Scenario extra-layer overload** — `7ebd656` (feat)

## Files Created/Modified

- `packages/vitest/src/Dsl.ts` — adds `import type * as Layer`, `ScenarioRegistrar<ROut>`, `RuleDsl<ROut>`, and `FeatureDsl.Rule`; `FeatureDsl.Scenario` retyped to `ScenarioRegistrar<ROut>`; notes (d), (e), (f) rewritten. Still types only — no `const`, no function, no runtime value.
- `packages/vitest/src/describeFeature.ts` — `Scenario` becomes a single arity-dispatching `scenarioRegistrar` const, and a `Rule` member is added, both with the unimplemented branch throwing. Deviation, see below.

## Decisions Made

Four "Claude's Discretion" questions 08-CONTEXT.md left open were resolved:

1. **`RuleDsl` extends `ScenarioDsl`** rather than being a fresh interface — the precedent (`FeatureDsl extends ScenarioDsl`) applies unchanged; a `Given` means the same thing at Rule level.
2. **`RuleDsl` does NOT expose `BeforeAllScenarios`/`AfterAllScenarios`** — the documented default. ADR-EC-010's Rule-scopeable list is the four, and "once per Feature" does not narrow to "once per Rule" without its own design pass.
3. **`Scenario`'s extra Layer is genuinely optional (two call signatures)**, not always-required-but-possibly-`Layer.empty`. The reason the DSL-01/D-03 precedent does not carry over is specific: D-03's required `perScenario` key exists to force a *collision precedence rule* in front of the author (`shared` and `perScenario` may name the same service). `Scenario` has one slot and therefore no collision to disclose, so a required `Layer.empty` would document nothing and tax every ordinary Scenario.
4. **`RuleDsl.Background` reuses `BackgroundDsl<ROut>` unchanged** (D-04) — a second interface with identical members would be a synonym, not a distinction.

Two further decisions were forced by the type system rather than chosen:

5. **`ScenarioRegistrar` is a callable interface with two call signatures, not a union of two function types on a `readonly` property.** A union does not give overload resolution across a varying argument count — the checker picks a member and reports against it, so a correct three-argument call would be rejected with "Expected 2 arguments, but got 3" and the author told the form does not exist.
6. **The two-argument signature is declared FIRST.** TypeScript resolves overloads top-down; the common form first is both the better diagnostic and what keeps every existing call site compiling.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `Rule` is a required member, so the composition root stopped compiling**

- **Found during:** Task 1
- **Issue:** `describeFeature.ts` builds `const dsl: FeatureDsl<any> = { ... }`. Adding a required `Rule` member to `FeatureDsl` made that object literal fail with `TS2741: Property 'Rule' is missing`. Task 1's own acceptance criteria requires `pnpm build` to exit 0, so the plan could not land Dsl.ts alone.
- **Fix:** Added a `Rule` member to the `dsl` object literal that **throws** a named error pointing at plan 08-05a. Both silent alternatives were rejected and the rejection is documented at the call site: a no-op emits a Feature whose Rule-nested Scenarios have zero step definitions, and running `defineRule` against `scenarioDsl` registers the Rule's steps at Feature scope and makes INV-EC-005 decorative at runtime. Both turn a `.feature` file with a `Rule:` block green while enforcing nothing, and neither would fail a test in this repo — the false-green mode AGENTS.md §4 forbids.
- **Files modified:** `packages/vitest/src/describeFeature.ts`
- **Verification:** `pnpm build` exits 0; 575 tests pass; `pnpm verify:tsgo-gate` reports ENFORCED.
- **Committed in:** `2f197a0`

**2. [Rule 3 - Blocking] A two-parameter `Scenario` implementation is not assignable to an overloaded type**

- **Found during:** Task 2
- **Issue:** Two compounding problems. First, TypeScript gives no contextual parameter types from a multi-signature interface, so `Scenario: (name, defineScenario) => {...}` became `TS7006` implicit-any on both parameters. Second — and this is the part that could not be fixed by annotation alone — a two-parameter function is **not** assignable to `ScenarioRegistrar`: the second call signature expects a `Layer` in the second position, and `Layer` is not assignable to `(dsl: ScenarioDsl) => void`. The implementation had to become genuinely arity-dispatching.
- **Fix:** Extracted a `scenarioRegistrar: ScenarioRegistrar<any>` const with explicit parameter annotations and a real arity check. The two-argument branch is the previous behaviour verbatim (push `scenario` scope → run define → pop in `finally`); the three-argument branch throws, naming plan 08-05b, for the same reason as deviation 1 — registering the steps while dropping `extraLayer` would let a Scenario that type-checks against the extra service fail at runtime with the "service not found" this package exists to make impossible.
- **Files modified:** `packages/vitest/src/describeFeature.ts`
- **Verification:** `pnpm build`, `pnpm lint`, `pnpm typecheck:test`, `pnpm verify:tsgo-gate` all clean; 575 tests pass with no test file edited.
- **Committed in:** `7ebd656`

**3. [Rule 1 - Bug] `Dsl.ts`'s module header said "Five things" over six notes**

- **Found during:** Task 1
- **Issue:** The header enumerates notes (a)-(f) — six — but claimed five. Pre-existing, in the exact header sentence introducing the notes this task rewrites.
- **Fix:** "Five" → "Six".
- **Files modified:** `packages/vitest/src/Dsl.ts`
- **Committed in:** `2f197a0`

**4. [Rule 2 - Missing Critical] Note (d)'s `any` prohibition became false**

- **Found during:** Task 1
- **Issue:** Note (d) stated "The one `any` below is the ONLY one permitted in this module". `FeatureDsl.Rule` and `ScenarioRegistrar` each add a `Layer.Layer<R2, E2, any>`. Left as written, the note would either read as a violation to "clean up" (deleting the `any` narrows `RIn` to `never` and rejects ADR-EC-010's own worked example, in which `extraLayer` depends on ambient services) or license genuine `any`s in a step body's `ROut`, which silently deletes INV-EC-003. This file's whole purpose is preventing silent decay of that guarantee, so a stale prohibition here is a correctness problem, not a doc nit.
- **Fix:** Note (d) now scopes the prohibition to a step-or-hook body's declared type and states explicitly why `extraLayer`'s `RIn` is a different position, with the consequence of narrowing it named.
- **Files modified:** `packages/vitest/src/Dsl.ts`
- **Committed in:** `2f197a0`

### Planned-but-adjusted

**Task 1's forward reference to `ScenarioRegistrar` was deferred to Task 2.** The plan permitted Task 1 to declare `RuleDsl.Scenario` as `ScenarioRegistrar<ROut>` "referencing it forward in the same file", but `ScenarioRegistrar` does not exist until Task 2 — Task 1 alone would have been `TS2304`, failing its own `pnpm build` gate. Task 1 gave `RuleDsl.Scenario` the then-current inline shape and Task 2 switched **both** containers to `ScenarioRegistrar<ROut>` together. The end state is exactly what the plan's `<interfaces>` block specifies; only the intermediate commit differs.

---

**Total deviations:** 4 auto-fixed (2 blocking, 1 bug, 1 missing critical) + 1 task-ordering adjustment.
**Impact on plan:** No scope creep. Both blocking fixes are the minimum needed to keep `pnpm build` green with a required member and an overloaded member on `FeatureDsl`; both are explicitly owned and replaced by 08-05a/08-05b, whose plans already specify the real implementations (`resolveRuleId`/`ruleLayers`, `makeScenarioRegistrar`/`scenarioLayers`). The two note corrections keep `Dsl.ts` honest, which is the file's entire job.

## Issues Encountered

- The worktree had no `node_modules`; `pnpm install --frozen-lockfile` restored it from the existing lockfile. No dependency was added or changed — `package.json` and `pnpm-lock.yaml` are untouched (T-08-03-SC holds).
- `dprint` reflowed the widened `./Dsl.ts` type import in `describeFeature.ts` back onto one line (120-char limit); `pnpm format` applied it before the Task 2 commit.

## Known Stubs

| Stub | File | Reason |
|------|------|--------|
| `Rule(...)` throws | `packages/vitest/src/describeFeature.ts` | Rule-scope registration (`"rule"` `RegistryScopeKind`, `ruleLayers`, Rule-scoped hooks) is plan **08-05a**'s deliverable. Loud by design — see deviation 1. |
| `Scenario(name, extraLayer, define)` throws | `packages/vitest/src/describeFeature.ts` | The Layer merge and `scenarioLayers` map are plan **08-05b**'s deliverable (`makeScenarioRegistrar`). The two-argument form is fully functional and unchanged. Loud by design — see deviation 2. |

Neither stub blocks this plan's goal, which is the type surface only. Both are named in the plan's own objective ("the type-only half of D-01 and D-04, ahead of any runtime implementation") and both are replaced by already-written downstream plans.

## Threat Flags

None. This plan adds no network endpoint, auth path, file access, or schema at a trust boundary. `T-08-03-01` (a hook member leaking onto `RuleDsl`) is mitigated by the acceptance grep returning 0 and is behaviourally proven by 08-06. `T-08-03-02` (the two-argument form silently broken) is mitigated: all 5 existing call sites are present verbatim, no test file was edited, and `pnpm test`/`pnpm verify:tsgo-gate` both pass. `T-08-03-03` (the `ROut | R2` union silently narrowed) is declaration-only here, as the register itself states; 08-06 owns its enforcement proof.

## Verification

| Gate | Result |
|------|--------|
| `pnpm build` | exit 0 |
| `pnpm lint` (oxlint + dprint check) | exit 0 |
| `pnpm test` | 575 passed (29 files), unchanged from baseline |
| `pnpm typecheck:test` | exit 0 |
| `pnpm verify:tsgo-gate` | 11/11 assertions, "tsgo gate: ENFORCED" |

Task 1 acceptance greps: `export interface RuleDsl` = 1; `BeforeAllScenarios|AfterAllScenarios` within `RuleDsl` = 0; hook members within `RuleDsl` = 4; `readonly Rule:` = 1; `^import type \* as Layer` = 1.
Task 2 acceptance greps: `export interface ScenarioRegistrar` = 1; two-argument form = 1; `extraLayer: Layer.Layer<R2, E2, any>` = 1; `Scenario: ScenarioRegistrar<ROut>` = 2.
Existing `Scenario(...)` call sites: **5 before, 5 after, byte-for-byte identical.**

## Requirements

`DSL-05` is **not** marked complete by this plan. This plan delivers only its compile-time surface; 08-05a (Rule runtime), 08-05b (Scenario Layer runtime) and 08-07 finish it. Marking it now would violate AGENTS.md §4.

## User Setup Required

None.

## Next Phase Readiness

- **08-06** (tsgo-gate fixtures) can be written directly against `RuleDsl`/`ScenarioRegistrar`/`FeatureDsl.Rule` as landed — the shapes match the plan's `<interfaces>` block exactly. Note (f) now names 08-06's fixture pair as its behavioural proof, including the specific `@ts-expect-error` on a `RuleDsl` callback reaching for `BeforeAllScenarios`.
- **08-05a** must replace the throwing `Rule` member; **08-05b** must replace `scenarioRegistrar`'s throwing three-argument branch with `makeScenarioRegistrar`. Both are already scoped to do exactly that, and both should delete the placeholder comment blocks along with the code.
- No blockers.

---
*Phase: 08-rule-and-scenario-outline*
*Completed: 2026-08-29*

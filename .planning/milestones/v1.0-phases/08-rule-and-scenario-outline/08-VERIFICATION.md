---
phase: 08-rule-and-scenario-outline
verified: 2026-08-29T21:40:00Z
status: passed
score: 4/4 must-haves verified
overrides_applied: 0
---

# Phase 8: Rule and Scenario Outline Verification Report

**Phase Goal:** Rules can narrow the ambient Layer for the Scenarios inside them, and Outline rows are typed, distinctly titled, and independent.
**Verified:** 2026-08-29T21:40:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth (Roadmap Success Criterion) | Status | Evidence |
|---|---------|--------|----------|
| 1 | A step inside a `Rule` compiles while using a service provided only by that Rule's extra per-Scenario Layer; the identical step body placed outside the Rule is a compile error in the negative type-test file (DSL-05) | VERIFIED | `scripts/verify-tsgo-gate.sh` run live: assertion 12 ("Rule/Scenario extra-Layer positive control compiles clean") and assertion 13 ("a Rule-scoped service used outside its Rule is rejected by name: effect(missingEffectContext)") both pass. Fixture pair `packages/vitest/test/tsgo-gate/src/rule-satisfied.ts` / `rule-missing-service.ts` — the negative fixture is the byte-for-byte identical step body from the positive fixture, moved to Feature level, with no `Rule` in the file. Read both files in full; the negative half compiles with no suppression directive, relying on tsc exit code + diagnostic name. |
| 2 | The Rule's extra Layer is built fresh per Scenario and is not reachable at runtime from Scenarios outside that Rule (DSL-05) | VERIFIED | `packages/vitest/test/describeFeature.test.ts` — `"leaves the Feature's own Layer unable to provide the Rule's extra service"` runs the built `collected.layer` through `Effect.exit` and asserts `Exit.isFailure`, while a sibling test proves the Feature's own service stays reachable. `packages/vitest/test/emission.test.ts`'s real end-to-end `describe("a Rule's Layer and hooks compose with the Feature's at runtime (08-07)")` block runs TWO real Rule Scenarios (one Scenario also layering its own extra Layer on top) through actual `it.effect` tests and asserts the Before/After ordering and per-Scenario tier composition by real execution, not a recording fake. `Runner.ts` note (f)/lines ~372-386 confirms `ruleLayers.get(rule.id) ?? layer` and `scenarioLayers.get(...) ?? ruleLayer` compose per Scenario via `Layer.provideMerge`, never a shared mutable Layer instance. `pnpm test` (645/645 tests) and `pnpm build` both pass clean. |
| 3 | An Outline whose Examples columns are consumed by `{int}`/`{float}` patterns hands the step body already-coerced `number` arguments, with no separate typed-example-row mechanism — verified by both a type test and a runtime assertion (DSL-06) | VERIFIED | Runtime: `packages/vitest/test/Plan.test.ts`'s `"resolves every Examples row of a Scenario Outline, proving astName is the scope key"` asserts `resolvedOf(...)?.args` equals `[1]` and `[2]` for a `{int}`-typed Outline pattern (string `"1"`/`"2"` from the Examples table coerced to `number` per row). Type test: `packages/gherkin/test/StepArgs.types.ts` line 48 `intIsNumber` and its `@ts-expect-error` negative `intIsNotString` (line 145) prove `{int}` resolves to `number`, never `string`. `pnpm typecheck:test` compiles this file clean. No separate typed-example-row abstraction exists anywhere in `packages/vitest/src` (only `OutlineTitle.ts`, which is presentation-only). |
| 4 | Each Outline row produces a distinct, `-t`-filterable test title, and two rows provably share no mutable state (Pitfall 34 regression) | VERIFIED | `packages/vitest/src/OutlineTitle.ts`'s `buildScenarioTitles` builds a `column=value` suffix per row from the raw AST Examples table, keyed by `TableRow.id` via `pickle.astNodeIds.at(-1)` (avoiding the Pitfall-9 shared-first-id trap). `packages/vitest/test/OutlineTitle.test.ts` and `packages/vitest/test/Runner.test.ts`'s positional `adding 1 (count=1)`/`adding 2 (count=2)` assertions confirm the format. `packages/vitest/test/emission.test.ts`'s real 3-row Outline (`describe("three Outline rows ran as three independent tests")`) runs three real `it.effect` tests, asserts three distinct titles, and each row's own `Then` step asserts `observed` contains exactly one entry (its own row's value) read from a per-Scenario-rebuilt `Log` Ref — proving no cross-row mutable-state leak (the exact `@amiceli/vitest-cucumber` Pitfall 34 bug this is a regression test for). |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/vitest/src/Registry.ts` | `RegistryScopeKind` with `"rule"` member, required `RegistryScope.ruleId` | VERIFIED | Confirmed present; `Registry.test.ts` round-trips `ruleId: "r1"` and distinguishes rule-nested vs. Feature-level background frames. |
| `packages/vitest/src/Plan.ts` | rule-aware `isVisibleTo`, three-level `scopeRank` | VERIFIED | `case "rule":`, ruleId-disambiguated `"background"`/`"scenario"` arms, `scopeRank` 0/1/2 confirmed by reading the file and its extensive `Plan.test.ts` isolation/precedence suite. |
| `packages/vitest/src/HookRegistry.ts` + `Hook.ts` | required `ruleId` on every stored hook, `mergeHookSets`/`emptyHookSet` | VERIFIED | `describeFeature.test.ts`'s hook-merge tests (`"keeps a Feature-level Before out of every Rule's hooks"`, ordering tests) exercise this end to end. |
| `packages/vitest/src/Dsl.ts` | `RuleDsl<ROut>`, `FeatureDsl.Rule`, `ScenarioRegistrar` extra-Layer overload | VERIFIED | Exercised by `rule-satisfied.ts` tsgo fixture (all four Rule hooks, Rule Background, Rule Scenario, Scenario-own extra Layer) and by `describeFeature.test.ts`. |
| `packages/vitest/src/OutlineTitle.ts` + `Runner.ts` | D-03 title format, Pitfall-34 regression | VERIFIED | See truth #4 above. |
| `packages/vitest/src/describeFeature.ts` | Rule container, Rule-level Background, per-Rule Layer merge | VERIFIED | `Layer.provideMerge`, `resolveRuleId`, `ruleLayers`/`ruleHooks`/`scenarioLayers` maps confirmed via `describeFeature.test.ts`. |
| `packages/vitest/test/tsgo-gate/src/rule-satisfied.ts` + `rule-missing-service.ts` | DSL-05 compile-time boundary fixture pair | VERIFIED | Read in full; both are genuine, non-trivial fixtures (not stubs) exercising every Rule-scoped construct; gate assertions 12/13 pass live. |
| `packages/vitest/src/Runner.ts` | per-Rule merged hooks/Layer, per-Scenario Layer override threaded into emission | VERIFIED | `ruleLayers.get(rule.id) ?? layer`, `scenarioLayers.get(...) ?? ruleLayer` three-tier resolution confirmed by reading the file; exercised end-to-end by `emission.test.ts`'s real Rule-composition run. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `Plan.ts` `isVisibleTo` | `Registry.ts` `RegistryScope.ruleId` | plain string/null equality (`definition.scope.ruleId`) | WIRED | Confirmed by `grep -c "scenario.ruleId" Plan.ts` and cross-rule isolation tests passing live. |
| `describeFeature.ts` `Rule(...)` | `Layer.provideMerge` | `resolveRuleId` + `ruleAmbientLayer` | WIRED | `describeFeature.test.ts`'s `"provides both the Feature's ambient service and the Rule's own"` and `"leaves the Feature's own Layer unable to provide the Rule's extra service"` tests both pass live. |
| `Runner.ts` emission | `ruleHooks`/`ruleLayers`/`scenarioLayers` maps | three-tier `??` fallback | WIRED | `emission.test.ts`'s real `it.effect` Rule-composition run passes live, proving the wiring executes at runtime, not just compiles. |
| `OutlineTitle.ts` `buildScenarioTitles` | `Runner.ts` emission | `titles.get(scenario.id)` at both `api.effect` call sites | WIRED | `Runner.test.ts` positional title assertions and `emission.test.ts`'s 3-row real run both pass live. |

### Behavioral Spot-Checks / Full Suite Execution

Rather than isolated spot-checks, the full verification suite was run live (fast, deterministic, no server required):

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Cross-package build (tsc -b) | `pnpm build` | exit 0, no output | PASS |
| Full test suite | `pnpm test` | 30 files / 645 tests passed | PASS |
| Lint (oxlint + dprint) | `pnpm lint` | exit 0 | PASS |
| tsgo compile-time gate (all 13 assertions, incl. 12/13 new for Phase 8) | `bash scripts/verify-tsgo-gate.sh` | "tsgo gate: ENFORCED" | PASS |
| Type-only test compilation (StepArgs.types.ts etc.) | `pnpm typecheck:test` | exit 0 | PASS |
| Runner/runtime independence gate | `bash scripts/verify-no-runner-dep.sh` | exit 0 | PASS |
| Spec traceability | `bash spec/scripts/verify-traceability.sh` | 7 PASS, 0 FAIL, 1 SKIP (unrelated) | PASS |

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|---------------|-------------|--------|----------|
| DSL-05 | 08-01, 08-02, 08-03, 08-05a, 08-05b, 08-06, 08-07 | A `Rule` can extend the ambient Layer with an extra per-Scenario Layer visible only to Scenarios inside that Rule | SATISFIED | tsgo-gate assertions 12/13, `Plan.test.ts` cross-rule isolation, `describeFeature.test.ts` Layer-composition tests, `emission.test.ts` real end-to-end Rule run — all pass live. |
| DSL-06 | 08-04, 08-08 | An Outline's Examples values are typed for free by the step pattern's own coercion, distinctly titled, independent rows | SATISFIED | `StepArgs.types.ts` type test, `Plan.test.ts` runtime coercion assertion, `OutlineTitle.ts`/`Runner.test.ts`/`emission.test.ts` titling and Pitfall-34 row-independence proof — all pass live. |

No orphaned requirements — REQUIREMENTS.md maps only DSL-05 and DSL-06 to Phase 8, and both appear in PLAN frontmatter across the 9 plans.

### Anti-Patterns Found

None. Scanned all Phase-8-modified source files (`Registry.ts`, `Plan.ts`, `HookRegistry.ts`, `Hook.ts`, `Dsl.ts`, `OutlineTitle.ts`, `Runner.ts`, `describeFeature.ts`) for `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER`/"not yet implemented" markers — zero matches.

### Human Verification Required

None. All four roadmap success criteria are compile-time/runtime assertions verifiable by automated tooling (tsc, tsgo gate, vitest), and all were re-run live during this verification rather than trusted from SUMMARY.md narration.

### Gaps Summary

No gaps found. All 4 roadmap success criteria are independently verified against the actual codebase:
build, full test suite (645/645), lint, the tsgo compile-time gate (including the two new Phase-8
assertions proving DSL-05's compile-time boundary), the type-only test compilation, the
runner-independence gate, and the spec traceability script were all re-executed live in this
verification session — none of this rests on SUMMARY.md's claims alone. Read-through of the actual
fixture pair (`rule-satisfied.ts`/`rule-missing-service.ts`), the Layer-composition tests in
`describeFeature.test.ts`, the cross-rule isolation/precedence tests in `Plan.test.ts`, the type-level
coercion proof in `StepArgs.types.ts`, and the real end-to-end runs in `emission.test.ts` (both the
Rule-composition block and the 3-row Outline independence block) confirms the tests are substantive —
not stubs — and genuinely exercise the behaviors the roadmap requires.

---

*Verified: 2026-08-29T21:40:00Z*
*Verifier: Claude (gsd-verifier)*

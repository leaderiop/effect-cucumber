---
phase: 08-rule-and-scenario-outline
plan: 04
subsystem: testing
tags: [gherkin, scenario-outline, vitest, test-titles, cucumber-messages]

# Dependency graph
requires:
  - phase: 08-01
    provides: the Phase 8 baseline Runner/Plan/emission surface this plan wires into
  - phase: 06-emission
    provides: "emitFeature, its planById join, and Runner.ts note (d)'s name-vs-astName rule"
provides:
  - "packages/vitest/src/OutlineTitle.ts — buildScenarioTitles(feature): ReadonlyMap<scenarioId, title>"
  - "D-03's `name (col=value, ...)` title on every Scenario Outline row, placeholder-bearing or not"
  - "a real-execution Pitfall 34 regression proof: three Outline rows, three independent tests"
affects: [08-07, 08-08, rule-emission, reporter-output, -t-filtering]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "AST shapes reached by indexed access off the re-exported GherkinDocument, never by declaring the upstream messages package"
    - "Outline row identity joined on pickle.astNodeIds.at(-1) (the TableRow id), never astNodeIds[0]"

key-files:
  created:
    - packages/vitest/src/OutlineTitle.ts
    - packages/vitest/test/OutlineTitle.test.ts
  modified:
    - packages/vitest/src/Runner.ts
    - packages/vitest/test/Runner.test.ts
    - packages/vitest/test/emission.test.ts

key-decisions:
  - "The Examples header is stored PER ROW rather than per block: one Outline may carry several Examples blocks with different headers, and the row id is the only key the pickle side can offer, so a per-block structure would need a second lookup with no key for it."
  - "A row id absent from the row map yields the unmodified scenario.name rather than an error — a plain Scenario's astNodeIds.at(-1) IS its own Scenario id and legitimately misses a map of Examples-row ids (cucumber-js's own look-up-and-take-what-resolves idiom)."
  - "titleFor is a named local in emitFeature rather than two inline `titles.get(...) ?? plan.name` expressions, so the defensive fallback's reasoning is stated once instead of duplicated at the two emission call sites."
  - "The upstream Cucumber messages package name is deliberately never spelled out in OutlineTitle.ts, because the acceptance grep proving it is not a dependency cannot tell an import from an explanation of a non-import (CallSite.ts note (b)'s workaround)."

patterns-established:
  - "Title-suffix module: a pure, dependency-light presentation helper that emitFeature consumes through a map built once beside planById"
  - "Real-run row-independence proof: a three-row Outline whose expected value is duplicated into a second Examples column, so each row's assertion is self-contained and needs no module-scope expectation table"

requirements-completed: []

# Metrics
duration: 8min
completed: 2026-08-29
---

# Phase 8 Plan 04: Outline Row Test Titles Summary

**Every Scenario Outline row now emits `name (col=value, ...)` — the full Examples header and that row's values in table column order — including the case `@cucumber/gherkin` interpolation cannot distinguish at all, plus a real-execution proof that three rows run as three independent tests.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-08-29T18:19:40Z
- **Completed:** 2026-08-29T18:27:42Z
- **Tasks:** 2
- **Files modified:** 5 (2 created, 3 modified)

## Accomplishments

- `buildScenarioTitles` walks the raw `GherkinDocument` for each `Examples:` block's header and body rows, and joins them to pickles on `astNodeIds.at(-1)`. The map is total over `feature.allScenarios`.
- The empirical premise the module exists for is now a standing assertion, not a claim in a comment: `test/OutlineTitle.test.ts` asserts that the discount-codes Outline's two rows really do have byte-identical `Pickle.name` values. If `@cucumber/gherkin` ever changes its interpolation rules, that test — not a reviewer — is what notices.
- `emitFeature` builds the title map ONCE, beside `planById`, and both emission call sites (Feature-level scenarios and Rule-nested scenarios) look up by `scenarioId`. `warningTitle` and `afterAllScenariosTitle` are untouched — D-03 is Scenario titles only.
- `emission.test.ts` gains a third real `describeFeature` call: a three-row Outline whose every row states its own expected value in a second Examples column, so each emitted test's assertion is self-contained. The outer block counts the three rows from the inside, for `completedScenarios`'s reason (an Outline that emitted zero tests would satisfy every in-body assertion vacuously).
- No new package dependency. Every AST shape is an indexed access off the already-re-exported `GherkinDocument`; `pnpm circular` reports no new cycle.

## Task Commits

1. **Task 1 (RED): failing test for the D-03 title format** — `5e02a0c` (test)
2. **Task 1 (GREEN): OutlineTitle.ts** — `200b166` (feat)
3. **Task 2: Runner.ts wiring, updated Outline test, Pitfall 34 proof** — `92cda9d` (feat)

No REFACTOR commit: the one cleanup performed (replacing a redundant `as ReadonlyArray<Examples>` cast with a `cellValuesOf(row: TableRow)` helper, which also gives the plan-mandated `TableRow` alias a real use) happened before the GREEN commit and is contained in it.

## Files Created/Modified

- `packages/vitest/src/OutlineTitle.ts` — created. `buildScenarioTitles(feature): ReadonlyMap<string, string>`, plus a three-note module doc comment covering why the walk reads the raw AST rather than `ScenarioPlan`, why the join key is the row's own `TableRow.id`, and why no dependency is added.
- `packages/vitest/test/OutlineTitle.test.ts` — created. Seven tests over five real `parseFeature` fixtures: the placeholder-free discount-codes Outline (the headline case), the standing Pickle-name-identity check, the additive suffix on an already-interpolated title, a plain Scenario, two Examples blocks with different headers under one Outline, a Rule-nested Outline, and map totality.
- `packages/vitest/src/Runner.ts` — modified. New `./OutlineTitle.ts` import, `titles`/`titleFor` built once inside `emitFeature`, both `api.effect` Scenario call sites retitled. Note (d) rewritten to explain that `name` is now the BASE of the title and why `name` alone is not a substitute for the suffix.
- `packages/vitest/test/Runner.test.ts` — modified. The pre-existing Outline test's expected titles are now `adding 1 (count=1)` / `adding 2 (count=2)`, and its comment states that the assertion pins two properties (the interpolated base, mutation B's target, and the unconditional suffix) rather than one.
- `packages/vitest/test/emission.test.ts` — modified. New `outlineFeature` fixture, third real `describeFeature` call, and a final `describe` block reading `outlineRowValues`. The two now-stale "second and LAST real call" comments were corrected.

## Decisions Made

See `key-decisions` in the frontmatter. The two that will matter to a later reader:

- **Per-row header storage.** Duplicating a short header array per row is the cheaper half of the trade against a per-block structure that the pickle side has no key to reach, and it makes borrowing a neighbouring block's header structurally impossible rather than merely unlikely. The two-Examples-block fixture is what would catch the alternative.
- **A miss is a plain Scenario, not an error.** `Runner.ts`'s own `planFor` throws on a miss because a miss there really is impossible by construction; a miss in the row map is the NORMAL case for every plain Scenario in every suite, so the same shape would be wrong here.

## Deviations from Plan

None — plan executed exactly as written. Three notes on how the plan's own instructions were satisfied, none of which changes behaviour:

1. The plan's acceptance criterion `grep -c "@cucumber/messages" OutlineTitle.ts` outputs `0` required removing that literal from the module doc comment, which had used it to name the package it deliberately does not depend on. Reworded to "the upstream Cucumber messages package" with an explicit note that the name is withheld because the grep cannot tell a citation from an import — `CallSite.ts` note (b)'s established workaround for the same collision.
2. `pnpm install` was needed first: the worktree had no `node_modules` (`pnpm vitest` reported "Command not found"). Ran `pnpm install --frozen-lockfile`; no manifest or lockfile change resulted, so the threat register's T-08-04-SC "no dependency added" disposition still holds.
3. The plan's `<action>` names `titles.get(scenarioPlan.scenarioId) ?? scenarioPlan.name` at both call sites; it is expressed as a named local `titleFor` so the defensive fallback's reasoning is documented once rather than twice.

**Total deviations:** 0
**Impact on plan:** None.

## Issues Encountered

None. Every verification command passed on first run after each task.

## Verification

- `pnpm vitest run packages/vitest/test/OutlineTitle.test.ts` — 7 passed
- `pnpm vitest run packages/vitest/test/Runner.test.ts packages/vitest/test/emission.test.ts` — 36 passed
- `pnpm test` — 30 files, 615 tests passed
- `pnpm build` — exit 0
- `pnpm lint` — exit 0
- `pnpm typecheck:test` — exit 0
- `pnpm circular` — no circular dependency found
- `pnpm verify:tsgo-gate` — ENFORCED
- `grep -c "export const buildScenarioTitles" packages/vitest/src/OutlineTitle.ts` → 1
- `grep -c "@cucumber/messages" packages/vitest/src/OutlineTitle.ts` → 0
- `grep -c "buildScenarioTitles" packages/vitest/src/Runner.ts` → 4 (≥ 2 required)
- `grep -c 'name: "adding 1 (count=1)"' packages/vitest/test/Runner.test.ts` → 1; `'name: "adding 2 (count=2)"'` → 1
- `grep -c 'name: "adding 1",' packages/vitest/test/Runner.test.ts` → 0; `'name: "adding 2",'` → 0

## Known Stubs

None.

## Threat Flags

None. This plan adds no network endpoint, no auth path, no file access and no schema change. T-08-04-01 (an Examples cell forging a column separator in the rendered title) was accepted by the plan and is implemented as accepted: column names and cell values render verbatim, matching `Runner.ts` note (c)'s standing policy for Feature/Rule/Scenario names. `pnpm-lock.yaml` and both package manifests are byte-unchanged, so T-08-04-SC needs no package-legitimacy checkpoint.

## Requirements

`REQUIREMENTS.md` was deliberately NOT modified. This plan's `requirements: [DSL-06]` is shared with `08-08-PLAN.md`, which is a later wave, and DSL-06's own text ("a ScenarioOutline's Examples values are typed for free by the step pattern's own cucumber-expression coercion") is not what this plan delivers — this plan delivers D-03's title format. Marking it complete here would be both premature and a write to a shared file from inside a parallel worktree. 08-08 or the orchestrator should mark it.

## Next Phase Readiness

- `08-07` re-touches `Runner.ts`'s emission call sites. The contract to keep is `titleFor(scenarioPlan)` at every `api.effect` Scenario call site (including any new Rule-nesting depth it introduces); `buildScenarioTitles` itself needs no change, since it already flattens Rule children exactly as `Validate.ts` does and the Rule-nested fixture in `OutlineTitle.test.ts` proves it.
- No blockers.

---
*Phase: 08-rule-and-scenario-outline, Plan: 04*
*Completed: 2026-08-29*

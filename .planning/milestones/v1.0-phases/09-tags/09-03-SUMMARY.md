---
phase: 09-tags
plan: 03
subsystem: testing
tags: [typescript, effect, gherkin, tags, plan, contract-widening]

# Dependency graph
requires:
  - phase: 02-loadfeature-parse-compile-correlate
    provides: "ParsedScenario.tags — Pickle.tags names, already flattened by compile() in feature then rule then scenario then examples-block order"
  - phase: 06-plan-scenario-effect-runner-emission-and-drift-detection
    provides: "ScenarioPlan and planFeature's feature.allScenarios map — the three Scenario-level fields tags becomes the fourth of"
provides:
  - "ScenarioPlan.tags — a required, read-only, already-flattened ReadonlyArray<string> the emission walk reads as one object per Scenario"
  - "Plan.test.ts's `tagged` fixture — a Feature/Rule/Scenario/Examples tag over a TWO-row Outline, reusing correlation-full.feature's four tag names"
  - "tags: [] on every hand-built ScenarioPlan literal in the repo (Runner.test.ts x2, ScenarioEffect.test.ts x1)"
affects: [09-04, 09-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Copying a fourth Scenario-level field onto ScenarioPlan, with the field's own doc comment answering FeaturePlan's counter-argument rather than leaving the reader to reconstruct it"
    - "A contract-widening plan scopes every consuming fixture into the same commit set, so pnpm typecheck:test is green at every commit (STATE.md's 03-05 lesson, applied from the start)"

key-files:
  created: []
  modified:
    - packages/vitest/src/Plan.ts
    - packages/vitest/test/Plan.test.ts
    - packages/vitest/test/Runner.test.ts
    - packages/vitest/test/ScenarioEffect.test.ts

key-decisions:
  - "tags is REQUIRED, never optional — a Scenario with no tags already arrives as [] from ParsedScenario.tags, so there is no absent state to model; an optional field would let 09-04's walk see undefined and emit nothing with nothing going red (T-09-03-01)"
  - "ReadonlyArray<string> all the way down; the single mutable-array widening for the framework's options type stays in describeFeature.ts's adapter (plan 09-05) and was deliberately NOT hoisted here"
  - "The value is passed through verbatim — no re-sort, no dedupe, no @-prefix normalisation. The literal @ is what --tagsFilter '@slow' matches against (T-09-03-03)"
  - "RUN-05 left Pending in REQUIREMENTS.md — nothing is emitted as a vitest tag yet; the plan that makes it true end to end marks it, per the four-consecutive-plan precedent set in Phase 3"
  - "The untagged case reuses the existing `single` fixture rather than a new one — it is genuinely an untagged Scenario in an untagged Feature, so there is no tag anywhere to inherit"

patterns-established:
  - "A tag-ordering assertion compares the WHOLE array with toEqual, never membership with toContain: the order is what proves the set arrived flattened from compile() rather than re-derived locally"
  - "A tag fixture reuses correlation-full.feature's four tag names so the vitest-package expectation and the gherkin-package one cannot drift apart"

# Metrics
duration: 8min
completed: 2026-08-29
---

# Phase 9 Plan 03: `ScenarioPlan.tags` Summary

**`ScenarioPlan` carries each Scenario's already-flattened tag set as a required `ReadonlyArray<string>`, so plan 09-04's emission walk reads one object per Scenario instead of reaching back into the parsed document — and so the four-level inheritance is assertable from `Plan.test.ts` rather than only observable at emission.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~8 min |
| Tasks | 2 |
| Files modified | 4 |
| Commits | 2 (+1 docs) |
| Repo test count | 645 → 648 (+3) |

## What Shipped

### Task 1 — the field and the mapping (`2ebaf6b`)

`packages/vitest/src/Plan.ts` gained one required field and one mapping line.

**The final `ScenarioPlan` shape, verbatim — plan 09-04's walk depends on it:**

```typescript
export type ScenarioPlan = {
  readonly scenarioId: string
  readonly name: string
  readonly astName: string
  readonly ruleId: Option.Option<string>
  readonly tags: ReadonlyArray<string>
  readonly steps: ReadonlyArray<PlannedStep>
}
```

`tags` sits after `ruleId` and before `steps`, exactly as the plan's `<interfaces>` block specified.

**The mapping site** (`planFeature`, one added line):

```typescript
const scenarios = feature.allScenarios.map((scenario): ScenarioPlan => ({
  scenarioId: scenario.id,
  name: scenario.name,
  astName: scenario.astName,
  ruleId: scenario.ruleId,
  tags: scenario.tags,
  steps: scenario.steps.map((step) => { … })
}))
```

The field's doc comment records four things the code does not show, per this repo's module-comment norm:

1. **The flattening contract**, citing `Model.ts`: the names come off `Pickle.tags`, already stacked by `compile()` in feature → rule → scenario → examples-block order, and nothing in this package recomputes, re-sorts or dedupes it.
2. **The `@` prefix is load-bearing** and is never normalised away — it is the exact byte sequence a `--tagsFilter '@slow'` invocation matches against.
3. **Why required, not optional**, citing `describeFeature.ts`'s `FeatureCollection.hooks` comment for the general reason and "there is no absent state to model" for the specific one.
4. **Why a fourth copied field does not contradict `FeaturePlan`'s "copied a subset" sentence** — that sentence is about *Feature*-level fields, which is why `FeaturePlan` carries the whole `ParsedFeature` by reference; `ScenarioPlan` has always copied *Scenario*-level values because there is no per-Scenario reference to carry, and `tags` is the fourth of exactly that kind.

### Task 2 — the assertions and the fixture updates (`e71f2d5`)

`packages/vitest/test/Plan.test.ts` gained a `tagged` fixture and a three-test `describe` block:

```gherkin
@featuretag
Feature: Tagged

  @ruletag
  Rule: a rule

    @scenariotag
    Scenario Outline: adding <count>
      Given I add <count> apples

      @exampletag
      Examples:
        | count |
        | 1     |
        | 2     |
```

- **Four-level order:** `plan.scenarios[0]?.tags` `toEqual(["@featuretag", "@ruletag", "@scenariotag", "@exampletag"])` — byte-identical to `packages/gherkin/test/Correlate.test.ts:173`'s already-verified expectation, using the same four tag names from `correlation-full.feature` so the two cannot drift.
- **Every Outline row:** `plan.scenarios[1]?.tags` carries the identical set while the interpolated names differ (`adding 1` / `adding 2`). Two rows and not one is the point — a single-row Outline cannot tell "every row carries the Examples tag" from "the one row carries it", which is why this fixture differs from `correlation-full.feature`.
- **The untagged case:** `planFeature({ feature: single, definitions: [] })` gives `tags` `toEqual([])` — a present empty array, not a missing field.

The file's module doc comment gained a matching bullet under "Assertions written more strictly than they look", recording why the assertion is a whole-array `toEqual` and not a `toContain`.

Every hand-built `ScenarioPlan` literal in the repo gained `tags: []`, each with a comment saying why the value is inert there rather than leaving it as unexplained filler.

## Mutation Proofs

Both performed against the implementation, observed failing, then reverted. `git diff --stat` after the revert showed `Plan.ts` unmodified relative to the Task 1 commit, so the revert is byte-exact.

**1. The field is REQUIRED — deleting `tags: scenario.tags` fails `pnpm build`.**

```
packages/vitest/src/Plan.ts(632,75): error TS2741: Property 'tags' is missing in type
'{ scenarioId: string; name: string; astName: string; ruleId: Option.Option<string>;
steps: PlannedStep[]; }' but required in type 'ScenarioPlan'.
ELIFECYCLE Command failed with exit code 2.
```

This is threat T-09-03-01's mitigation, executable: an optional field would have compiled here and let 09-04's walk read `undefined`.

**2. The value is really the parsed one — changing it to `tags: []` fails the ordering assertions.**

Two tests failed (`2 failed | 39 passed`), both with:

```
AssertionError: expected [] to deeply equal [ '@featuretag', '@ruletag', …(2) ]
```

This is T-09-03-03's mitigation: an implementation that re-derived or dropped the inheritance cannot pass.

Note that the untagged-case test passes under mutation 2 — by design. It asserts `[]`, so it is the *ordering* assertions that carry the "came from the parse" claim, and the two are deliberately not consolidated.

## Verification

| Gate | Result |
|------|--------|
| `pnpm build` | exit 0 |
| `pnpm typecheck:test` | exit 0 |
| `pnpm exec vitest run packages/vitest` | 235 passed (12 files) |
| `pnpm exec vitest run` (whole repo) | 648 passed (30 files), was 645 |
| `pnpm lint` | exit 0 (oxlint + dprint check) |

**Acceptance criteria:**

| Criterion | Result |
|-----------|--------|
| `grep -c 'readonly tags: ReadonlyArray<string>' packages/vitest/src/Plan.ts` | 1 ✓ |
| `grep -c 'tags: scenario.tags' packages/vitest/src/Plan.ts` | 1 ✓ |
| `grep -c 'string\[\]' packages/vitest/src/Plan.ts` | 0 ✓ |
| Repo test count increased by at least 3 | +3 ✓ |
| `grep -c 'toEqual' packages/vitest/test/Runner.test.ts` unchanged | 0 before, 0 after ✓ |
| Four-element ordered assertion in `Plan.test.ts` | ✓ |
| `[]` assertion for an untagged Scenario | ✓ |

The `toEqual` count in `Runner.test.ts` is `0` both before and after — that file asserts with `assert.deepStrictEqual`, so the criterion holds trivially and no tag assertion was added there. Plan 09-04 owns those.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `packages/vitest/test/ScenarioEffect.test.ts` also needed the field**

- **Found during:** Task 2
- **Issue:** The plan's `files_modified` and Task 2's action named `Runner.test.ts` as the only file with hand-built `ScenarioPlan` literals. `pnpm typecheck:test` reported **three** `TS2741`s, not two — `ScenarioEffect.test.ts:224`'s `planOf` helper builds one too. Leaving it would have failed the plan's own `pnpm typecheck:test` acceptance criterion.
- **Fix:** Added `tags: []` to `planOf`, with a comment recording that `ScenarioEffect.ts` composes a Scenario's Effect and never reads a tag — tag routing is one stage later — so there is nothing there for a tag to change.
- **Files modified:** `packages/vitest/test/ScenarioEffect.test.ts`
- **Commit:** `e71f2d5`
- **Note:** This is exactly the failure mode STATE.md's 03-05 entry predicts ("a plan that adds a required field to an already-consumed contract cannot be scoped to one file"). The plan applied that lesson to `Runner.test.ts` but the census that produced its file list missed the third literal. `grep -rn "scenarioId:" packages` is the census that finds all three.

**2. [Rule 3 - Blocking] `node_modules` absent in the worktree**

- **Found during:** Task 1 verification
- **Issue:** `pnpm build` failed with `sh: tsc: command not found` — this parallel executor runs in a fresh git worktree with no installed dependencies.
- **Fix:** `pnpm install --frozen-lockfile` (restores the committed lockfile; no package added, no manifest edit, nothing to audit).
- **Files modified:** none — `node_modules` is gitignored and the working tree was clean afterwards.

### Environment note

This was a retry. A prior attempt failed mid-task on a transient API error before any commit; the worktree was also at an older base (`f640f4a`) and was reset to the expected base `8cdbc8e` before any work started, per the branch-check protocol.

## Requirements

**RUN-05 is deliberately left `Pending`.** The requirement is "every tag on a Scenario is emitted as a native vitest tag; `@skip` additionally routes to `it.effect.skip`". This plan carries the tag set onto the plan object; nothing is emitted anywhere yet. Marking it here would claim something the repo cannot back.

This follows the precedent Phase 3 set four consecutive times (03-01 through 03-04 each declined to mark MATCH-01/02 until 03-05 made them true end to end) and AGENTS.md §4's "say only what is true". Plan **09-05** — the `describeFeature.ts` adapter that reaches the real `it.effect` with the options — is the first plan at which RUN-05 becomes true, and is the one that should mark it.

## For the Next Plan (09-04)

- **`scenarioPlan.tags` is the only thing the emission walk needs to read.** It is required, so `undefined` is not a case to handle. It is already flattened and ordered — do not re-derive, re-sort or dedupe.
- **The `@` prefix is retained.** A `@skip` predicate compares against the literal `"@skip"`, not `"skip"`.
- **Do not widen the type in `Plan.ts` or `Runner.ts`.** The single mutable-array spread for the framework's options type belongs in `describeFeature.ts`'s adapter (plan 09-05). An assignment error at that boundary is expected and is 09-05's to resolve.
- **`Runner.test.ts` has no tag assertions yet, by acceptance criterion.** Its two `ScenarioPlan` literals carry `tags: []`; a test that wants a meaningful set should change them there.
- **`Plan.test.ts`'s `tagged` fixture is reusable** — a two-row Outline with all four inheritance levels, at `test/plan-tagged.feature`.

## Known Stubs

None. Both tasks are complete and every value the plan promised is wired to a real source.

## Threat Flags

None. This plan adds no network endpoint, no auth path, no file access and no schema change at a trust boundary. `Plan.ts` renders no tag into a message or a node title (T-09-03-02 remains `accept`), and no package was installed (T-09-03-SC unchanged).

## Self-Check: PASSED

- `packages/vitest/src/Plan.ts` — FOUND
- `packages/vitest/test/Plan.test.ts` — FOUND
- `packages/vitest/test/Runner.test.ts` — FOUND
- `packages/vitest/test/ScenarioEffect.test.ts` — FOUND
- Commit `2ebaf6b` — FOUND
- Commit `e71f2d5` — FOUND

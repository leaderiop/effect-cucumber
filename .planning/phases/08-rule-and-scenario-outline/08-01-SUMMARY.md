---
phase: 08-rule-and-scenario-outline
plan: 01
subsystem: testing
tags: [gherkin, rule, scope-chain, step-resolution, vitest, effect]

# Dependency graph
requires:
  - phase: 02-gherkin-parsing
    provides: "ParsedScenario.ruleId (Option<string>), ParsedRule.id, StepOwner's rule-background member — the AST data this plan matches against but does not re-derive"
  - phase: 05-registry-and-dsl
    provides: "createRegistry's scope stack and StepDefinition.scope — the frame this plan adds a field to"
  - phase: 06-plan-and-match
    provides: "isVisibleTo, scopeRank and planStep — the two-level scope chain this plan extends to three"
provides:
  - "RegistryScopeKind's fourth member, \"rule\""
  - "RegistryScope.ruleId: string | null, a REQUIRED field, with null reserved exclusively for \"not nested in any Rule\""
  - "A rule-aware isVisibleTo: a \"rule\" arm, an origin-split \"background\" arm, and a ruleId-disambiguated \"scenario\" arm"
  - "A three-level scopeRank (scenario/background 0, rule 1, feature 2) and a planStep that selects the lowest rank actually present"
  - "Executable proof of cross-Rule isolation, same-name disambiguation and three-level precedence"
affects: [08-03 Rule DSL surface, 08-05a describeFeature composition root, 08-05b Scenario-layer wiring, 08-06 tsgo-gate fixtures]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Caller-resolved id comparison: the matching layer compares ids it is handed and performs no resolution of its own"
    - "Three-level scope precedence via computed minimum rank rather than a hardcoded innermost literal"

key-files:
  created: []
  modified:
    - packages/vitest/src/Registry.ts
    - packages/vitest/src/Plan.ts
    - packages/vitest/src/describeFeature.ts
    - packages/vitest/test/Registry.test.ts
    - packages/vitest/test/Plan.test.ts
    - packages/vitest/test/Runner.test.ts
    - packages/vitest/test/describeFeature.test.ts

key-decisions:
  - "Rule membership is decided by ParsedRule.id and never by a Rule name, so two Rules sharing a name cannot see each other's registrations"
  - "null on RegistryScope.ruleId means 'not nested in any Rule' and nothing else; a Rule-scope frame carries a real id or a sentinel, never null"
  - "A Feature-level Background registration no longer blankets Rule-nested Background steps — a deliberate behavior change, asserted explicitly"
  - "planStep computes the lowest rank present instead of testing for rank 0, because a rule and a feature match would otherwise be reported as an ambiguity"
  - "rule scope is the Rule-level analogue of feature scope: visible to every step of every Scenario in that Rule, Background steps included — not a second Background container"

patterns-established:
  - "Scope isolation fixtures must collide on name: the rules fixture gives all three Scenarios the name 'shared' so no assertion can pass by name comparison"
  - "Mutation-testing record in the test file header, extended with a section per new dispatch level"

# Requirements
requirements-completed: []
requirements-advanced: [DSL-05]

# Metrics
duration: 13min
completed: 2026-08-29
---

# Phase 8 Plan 01: Rule Scope in the Registry and Plan Layers Summary

**The scope chain gained its middle level: a registration made at Rule scope, or inside a Rule's own Background, now resolves only inside that specific Rule, compared by resolved AST id rather than by author-typed name.**

## Performance

- **Duration:** ~13 min
- **Started:** 2026-08-29T18:01Z
- **Completed:** 2026-08-29T18:14Z
- **Tasks:** 2 of 2
- **Files modified:** 7

## Accomplishments

- `RegistryScope` now carries a required `ruleId: string | null`, and `"rule"` is a valid `RegistryScopeKind`. The `null`-means-Feature-level invariant is stated word for word in `Registry.ts` note (e), on the producing side, where `describeFeature.ts` (08-05a) will read it.
- `Plan.ts`'s `isVisibleTo` resolves all four scope kinds. The `"background"` arm splits by origin so a Feature Background and a Rule Background can no longer resolve each other's steps; the `"scenario"` arm gained a `ruleId` conjunct so two Rules may each legally contain a same-named Scenario without their registrations crossing.
- `scopeRank` is three levels, and `planStep` was generalized to select the lowest rank actually present — without that second change the three-level rank would have turned every Rule-level override of a Feature-level default into an `AmbiguousStep`.
- Note (e), which had claimed since Phase 6 that no `rule` scope kind existed, was rewritten in place rather than left as a stale claim.
- 14 new tests across `Registry.test.ts` and `Plan.test.ts`, all four load-bearing claims mutation-tested (see below). Full suite: 591 passing, up from 577.

## Task Commits

1. **Task 1: Registry.ts — the "rule" scope kind and RegistryScope.ruleId** — `3365a43` (feat)
2. **Task 2: Plan.ts — rule-aware isVisibleTo, three-level scopeRank, note (e) rewrite, Runner.test.ts compat** — `918aaf4` (feat)

## Files Created/Modified

- `packages/vitest/src/Registry.ts` — `"rule"` added to `RegistryScopeKind`; `RegistryScope.ruleId` added as a required field; root frame seeded with `ruleId: null`; new note (e) states the `null`-iff-not-in-a-Rule invariant and that this module resolves nothing itself.
- `packages/vitest/src/Plan.ts` — `isVisibleTo` gained a `"rule"` arm and ruleId checks on the `"background"` and `"scenario"` arms; `scopeRank` is three levels; `planStep` selects the minimum rank present; notes (b) and (e) rewritten.
- `packages/vitest/src/describeFeature.ts` — both `pushScope` call sites carry `ruleId: null` (deviation 1).
- `packages/vitest/test/Registry.test.ts` — `ruleId` threaded through every existing scope literal; two new tests: a rule frame round-tripping whole, and a rule-nested Background proven distinct from the Feature-level one.
- `packages/vitest/test/Plan.test.ts` — two new fixtures (`rules`, `ruleBackgrounds`), a `ruleScope` helper, `ruleId` parameters on the three existing scope helpers, and 12 new tests covering Rule isolation, same-name disambiguation, three-level precedence and both halves of the Background split.
- `packages/vitest/test/Runner.test.ts` — local `featureScope` helper carries `ruleId: null`. Compile compatibility only; no content change (08-04 owns this file's outline-titling work).
- `packages/vitest/test/describeFeature.test.ts` — scope assertions carry `ruleId: null`; one position-sensitive line literal corrected (deviation 2).

## Verification

All plan gates run and green at `918aaf4`:

- `pnpm build` — exit 0
- `pnpm lint` (oxlint + dprint check) — exit 0
- `pnpm test` — 29 files, 591 tests, all passing
- `pnpm typecheck:test` — exit 0 (both test projects)
- `pnpm circular` — no circular dependency found

Every acceptance grep from both tasks verified, including `grep -c 'RegistryScopeKind\` is \`feature | background | scenario\`' packages/vitest/src/Plan.ts` returning `0` (the stale note-e claim is gone).

### Mutation testing

The plan's threat register assigns `mitigate` to three threats, all of which turn on assertions being genuinely discriminating rather than incidentally passing. Each was verified by performing the mutation, observing the failure, and reverting:

| Mutation | Threat | Result |
|---|---|---|
| `background` arm restored to the pre-Phase-8 `feature-background \|\| rule-background` | T-08-01-03 | 2 tests fail — and **no other test in the repo notices**, which is exactly why the assertion was written |
| `scopeRank` collapses `rule` into `feature`'s rank | T-08-01-02 | rule-beats-feature precedence test fails |
| `ruleId` conjunct dropped from the `scenario` arm | T-08-01-01 | 2 cross-Rule tests fail |
| `planStep` restored to the two-level `rank === 0, else everything` split | T-08-01-02 | rule-beats-feature precedence test fails |

The fourth mutation is the one that justifies deviation 3 below: rank *values* alone are not enough, the selection has to read them.

## Decisions Made

- **Rule membership compares ids, never names.** `Validate.ts`'s `uniquenessKey` is `${ruleId}\0${name}` and its `duplicate-scenario-name-across-rules.feature` fixture proves two Rules may legally share a name and each hold a same-named Scenario. Name equality would be a real leak (INV-EC-005), not a style choice.
- **`rule` scope is a Rule-level *default*, not a second Background container.** It is visible to every step of every Scenario in that Rule, Background steps included — the exact analogue of what `feature` scope already does one level up. A Rule's `Background` container is the separate, narrower thing, and it is the `background` arm's `rule-background` half.
- **The `scenarioRuleId` local is hoisted once above the switch** rather than recomputing `Option.getOrNull` in three arms. Same semantics, one evaluation.
- **`backgroundScope` in `Plan.test.ts` became a function.** The plan expected a default parameter to keep existing call sites compiling unchanged, which holds for the two helpers that were already functions but not for `backgroundScope`, which was a const. Converting it and updating its four call sites was preferred over introducing a second `ruleBackgroundScope` name for the same idea.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] `describeFeature.ts` and `describeFeature.test.ts` did not compile/pass against the new required field**

- **Found during:** Task 1
- **Issue:** Making `RegistryScope.ruleId` required broke `describeFeature.ts`'s two `pushScope` literals (missing required property, `pnpm build` failure) and four `describeFeature.test.ts` `toEqual` assertions (received now carries `ruleId: null`, expected did not). The plan named `Runner.test.ts` as the only compile-compat casualty and did not anticipate these.
- **Fix:** Added `ruleId: null` at both `pushScope` call sites and in the affected assertions. This is the truthful value, not a placeholder: `describeFeature.ts` offers no `Rule` container yet (08-05a's job), so every frame it pushes genuinely is not nested in a Rule — a comment at the call site says so, to keep a later reader from mistaking it for a stub.
- **Files modified:** `packages/vitest/src/describeFeature.ts`, `packages/vitest/test/describeFeature.test.ts`
- **Verification:** `pnpm build` exit 0; `pnpm test` 591 passing
- **Committed in:** `3365a43`

**2. [Rule 1 — Bug] `describeFeature.test.ts`'s position-sensitive line literal went stale**

- **Found during:** Task 1
- **Issue:** That file carries a deliberately position-sensitive assertion (`const givenLine = 262`) pinning the real line number of a `Given(...)` call, with a comment stating that editing anything above it moves the literal. Deviation 1's edits above it did exactly that, and the test failed with 262 vs 277.
- **Fix:** Updated the literal to 277. The assertion is doing its designed job here; it was not weakened, only re-pinned.
- **Files modified:** `packages/vitest/test/describeFeature.test.ts`
- **Verification:** `pnpm test` 591 passing
- **Committed in:** `3365a43`

**3. [Rule 2 — Missing critical functionality] `planStep` still assumed a two-level rank**

- **Found during:** Task 2
- **Issue:** The plan specified `scopeRank`'s three values but not the selection that reads them. `planStep` split matches as "rank 0, else everything" — equivalent to a minimum only while there were two levels. With three, a `rule` match and a `feature` match both survive that split and land at `winning.length === 2`, producing an `AmbiguousStep` instead of letting the Rule shadow the Feature. That would have silently defeated the plan's own success criterion that `"rule"` beats `"feature"`.
- **Fix:** `planStep` now computes the minimum rank present and keeps only matches at that rank. An empty match list leaves the minimum at `Infinity` and yields an empty `winning`, preserving the existing `UndefinedStep` path exactly.
- **Files modified:** `packages/vitest/src/Plan.ts`
- **Verification:** Mutation D above — reverting this change alone fails the rule-beats-feature test.
- **Committed in:** `918aaf4`

**4. [Rule 3 — Blocking] Exhaustive-switch break at the Task 1 boundary**

- **Found during:** Task 1
- **Issue:** Widening `RegistryScopeKind` in Task 1 made `isVisibleTo`'s switch non-exhaustive (`TS2366`), so Task 1 could not be committed green on its own — the real `"rule"` arm is Task 2's content.
- **Fix:** Task 1 added a conservative `case "rule": return false` with a comment explaining that no DSL surface can produce a rule frame yet and that `false` is the only safe default for an unreachable arm. Task 2 replaced it with the real equality.
- **Files modified:** `packages/vitest/src/Plan.ts`
- **Verification:** `pnpm build` exit 0 at `3365a43`
- **Committed in:** `3365a43`, superseded by `918aaf4`

---

**Total deviations:** 4 auto-fixed (2× Rule 3 blocking, 1× Rule 1 bug, 1× Rule 2 missing functionality)
**Impact on plan:** No scope creep. Three are mechanical consequences of making a field required; the fourth (deviation 3) was necessary for the plan's own stated success criterion to hold and is covered by a mutation test.

## Issues Encountered

- **`node_modules` absent in the worktree.** Resolved with `pnpm install --frozen-lockfile --prefer-offline`. No package was added, removed or resolved differently — `pnpm-lock.yaml` and both manifests are untouched, so threat `T-08-01-SC` (package legitimacy) remains `n/a` as the plan assessed.
- **`unicorn(consistent-function-scoping)` rejected two test-local step bodies** that captured nothing from their enclosing scope. Hoisted to module scope beside `noop`, with a comment recording why they exist (body identity is the only way to name the winner when two Rules register one identical pattern).

## Requirements

`requirements-completed` is deliberately **empty**, and `REQUIREMENTS.md` was **not** modified.

DSL-05 reads: *"A `Rule` can extend the ambient Layer with an extra per-Scenario Layer visible only to Scenarios defined inside that Rule."* This plan delivers the data-model and matching half of that — the runtime boundary is now real and proven — but a test author still cannot write `Rule(...)` at all. The DSL surface (08-03), the composition root that resolves a Rule name to an id (08-05a) and the Layer composition itself are all outstanding. Marking DSL-05 complete here would put a false entry in the traceability table. The orchestrator should mark it after 08-05a lands.

## Next Phase Readiness

The `<interfaces>` contract the plan promised to 08-05a and 08-05b is delivered exactly as specified:

```typescript
export type RegistryScopeKind = "feature" | "background" | "scenario" | "rule"
export type RegistryScope = {
  readonly kind: RegistryScopeKind
  readonly name: string | null
  readonly ruleId: string | null
}
```

**The one obligation this plan hands to 08-05a:** when `describeFeature.ts` grows its `Rule(name, extraLayer, define)` container, every scope it pushes from inside that call must carry a **non-null** `ruleId` — the real `ParsedRule.id` the author's name resolved to, or a sentinel string that can never equal a real scenario's `ruleId` when the name matches no Rule in the parsed Feature. Passing `null` there would not fail to compile; it would silently make that Rule's registrations visible to every Feature-level Scenario in the document. `Registry.ts` note (e) and `Plan.ts` note (e) both state this from their respective sides.

Two smaller notes for downstream plans:

- 08-04 owns `Runner.test.ts`'s outline-titling content. This plan touched exactly one line in that file (`ruleId: null` on the local `featureScope` helper) and nothing else.
- The Feature-Background-no-longer-blankets-Rule-Background change is a real behavior change to existing semantics. It is asserted explicitly in `Plan.test.ts` and documented in `Plan.ts`'s `isVisibleTo` doc comment as deliberate, so a future reader does not "fix" it back.

## Known Stubs

None. The conservative `case "rule": return false` introduced in Task 1 was replaced by the real implementation in Task 2 and does not survive into the final state.

## Threat Flags

None. This plan adds no network endpoint, no auth path, no file access and no schema change. The one trust boundary it touches — one Rule's registrations versus another Rule's Scenarios — is the boundary it exists to enforce, and all three `mitigate` dispositions in the plan's threat register are covered by the mutation tests recorded above.

## Self-Check: PASSED

All 7 modified files present on disk. All 3 commits (`3365a43`, `918aaf4`, `d3bff90`) present in `git log`. Working tree clean, no untracked files, no deletions in any commit.

---
*Phase: 08-rule-and-scenario-outline*
*Completed: 2026-08-29*

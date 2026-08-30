---
phase: 10-layer-scopes-per-scenario-default-shared
plan: 02
subsystem: testing
tags: [typescript, effect, layer, effect-vitest, testclock, dependency-injection, composition-root]

# Dependency graph
requires:
  - phase: 10-layer-scopes-per-scenario-default-shared
    provides: "plan 10-01's `shared: Layer<R, never, never>` type constraint, which had to land before `layer()`'s `Effect.orDie` became reachable — this plan is what makes it reachable"
  - phase: 09-tag-filtering-and-the-testapi-seam
    provides: "the `TestApi` injection seam, `vitestTestApi`'s D-08 catch-and-degrade, and `scripts/verify-testapi-seam.sh` — the seam this plan puts a second implementation through"
  - phase: 08-rules-and-rule-scoped-layers
    provides: "`ruleLayers`/`scenarioLayers` and the `Layer.provideMerge(featureLayer)(extraLayer)` composition whose meaning this plan narrows to the per-Scenario tier"
provides:
  - "`FeatureCollection.sharedLayer` — the two Layer scopes carried as TWO fields, never merged; `null` discriminates the plain-Layer form"
  - "`FeatureCollection.layer` re-specified as the PER-SCENARIO tier alone, on both call forms"
  - "`sharedLayerTestApi` — the second concrete `TestApi`, closing over the `it` that `layer(...)` hands its callback"
  - "a module-scope `testEnv` reconstructed from `effect/testing/TestConsole` + `effect/testing/TestClock`, provided per emitted node (ADR-EC-018)"
  - "the one branch in `describeFeature`'s body on `collection.sharedLayer === null`, with warnings/tagFilter/onEmitted computed once above it"
  - "`makeDegradingEffect` — D-08's catch-and-degrade as one implementation both adapters share"
  - "`Runner.ts`/`ScenarioEffect.ts`/`TestApi.ts` doc comments describing the shared path in the present tense"
affects: [10-03, 10-04, 10-05, 10-06]

actuals:
  tokens: 16936
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Make the provision strategy an EXPLICIT field of the collection (`sharedLayer`) and an EXPLICIT second `TestApi`, never an implicit consequence of which branch called in (ARCHITECTURE.md Pattern 4)"
    - "`null` and not `Layer.empty` for an absent Layer scope: an empty Layer is a Layer the caller asked for, so it cannot express 'never asked for this scope at all'"
    - "A degradation path shared by two adapters is FACTORED, not duplicated — a missing `catch` on one path turns nothing red"
    - "Rename the IMPLEMENTATION signature's parameter when it shadows a needed module import; overload signatures keep the caller-facing name, and TypeScript never resolves a call against an implementation signature"

key-files:
  created: []
  modified:
    - packages/vitest/src/describeFeature.ts
    - packages/vitest/src/Runner.ts
    - packages/vitest/src/ScenarioEffect.ts
    - packages/vitest/src/TestApi.ts
    - packages/vitest/test/describeFeature.test.ts
    - spec/decisions/006-two-layer-scopes-only.md

key-decisions:
  - "The two tiers are two FIELDS on `FeatureCollection`, not one merged Layer plus a flag. A flag would leave the merged value as the single source and make the branch a reinterpretation of it; two fields make `layer` mean exactly one thing on both paths."
  - "`sharedLayer` is `Layer | null`, never `Layer.empty`. The whole downstream branch asks 'did this Feature ask for a shared scope at all', which `Layer.empty` answers as 'yes, an empty one'."
  - "D-04's collision rule is UNCHANGED but its mechanism is now provision order, not argument order. No collection-level assertion can see provision order, so the collection-level tests were RE-HOMED (two tiers, two values, each resolving to its own implementation) rather than deleted, and the runtime verdict is left to plan 10-03's real run."
  - "`describe` is the module-level one in BOTH adapters. That is not Anti-Pattern 3: `describe` carries no Layer services, and `MethodsNonLive` has no `describe` member, so it is also the only way to nest a Rule block under a shared Feature."
  - "The per-Scenario `TestEnv` is provided at the EMISSION boundary in `describeFeature.ts`, never inside `ScenarioEffect.ts` — which is what keeps `ScenarioEffect.ts` ignorant that two paths exist."
  - "The ONE-ARGUMENT `layer(...)` form only. The two-argument form opens its own `describe`, which would render `Feature > Feature > Scenario`. Measured both forms during execution."
  - "RUN-03/RUN-04 stay Pending. This plan shipped the mechanism; 10-03 proves it in process, 10-04 from outside, and 10-06 owns the requirement flip. Same call as 10-01."

patterns-established:
  - "Two-tier Layer provision: the shared tier ambient on the emitted test node, the per-Scenario tier provided inside the Scenario's own Effect, with the inner provision winning a collision by construction"
  - "An extra Layer composed against the per-Scenario tier alone leaves a shared-service dependency on its `RIn`, where the ambient `layer(...)` context satisfies it at run time — measured, and the property plan 10-04 must keep true"
  - "Throwaway runtime probe before committing a branch no committed test exercises yet: build the smallest real `describeFeature` run that observes the claim, record the numbers, delete the probe"

requirements-completed: []

coverage:
  - id: D1
    description: "A Feature declared with `{ shared, perScenario }` builds its `shared` Layer exactly once for the whole Feature, not once per Scenario"
    requirement: RUN-03
    verification:
      - kind: other
        ref: "throwaway probe run during execution (deleted): sharedBuilds=1 across two Scenarios, perScenarioBuilds=2 — see 'The runtime probe' below"
        status: pass
      - kind: unit
        ref: "packages/vitest/test/describeFeature.test.ts#carries a sharedLayer for the object form and null for the plain-Layer form (collection-level half only)"
        status: pass
    human_judgment: true
    rationale: "The committed test suite does NOT yet exercise the shared emission path — plan 10-03 owns the in-process build-count assertion and 10-04 the real-CLI gate. The probe that proved it here was deleted by design, so nothing in the repo re-proves this claim on every push until 10-03 lands. Treat as unproven-in-CI until then."
  - id: D2
    description: "On the shared path every Scenario gets a FRESH `TestClock`/`TestConsole`, provided per emitted test node rather than memoized with the shared Layer"
    requirement: RUN-04
    verification:
      - kind: other
        ref: "throwaway probe run during execution (deleted): Clock.currentTimeMillis=0 in Scenario two, after Scenario one did TestClock.adjust('1 hour')"
        status: pass
    human_judgment: true
    rationale: "Same as D1 — measured during execution but not carried by any committed test. Plan 10-03's isolation block is what makes it a standing guarantee."
  - id: D3
    description: "`FeatureCollection` carries two separate Layer tiers; nothing merges them, and `sharedLayer` is `null` exactly for the plain-Layer form"
    requirement: RUN-03
    verification:
      - kind: unit
        ref: "packages/vitest/test/describeFeature.test.ts#the layer argument separates into two independently provided tiers (3 tests) via `pnpm test`"
        status: pass
      - kind: other
        ref: "mutation B — re-collapsing the split to `Layer.merge(shared, perScenario)` turned all three red; recorded below"
        status: pass
    human_judgment: false
  - id: D4
    description: "The `TestApi` seam survives a second concrete implementation — `Runner.ts` and `TestApi.ts` still name no test framework, in any import form"
    requirement: RUN-03
    verification:
      - kind: integration
        ref: "pnpm verify:testapi-seam — positive control plus both gate assertions"
        status: pass
      - kind: integration
        ref: "pnpm verify:no-runner-dep"
        status: pass
    human_judgment: false
  - id: D5
    description: "The default (plain-Layer) path's emission tree and tag routing are byte-for-byte unchanged"
    requirement: RUN-03
    verification:
      - kind: e2e
        ref: "pnpm verify:tags-filter — real vitest CLI, 4 assertions including the vacuity control"
        status: pass
      - kind: unit
        ref: "pnpm test — 744 passed | 3 skipped, count changed only by the one `it` block Task 1 added"
        status: pass
      - kind: integration
        ref: "pnpm verify:tsgo-gate — 2 assertions, overload surface untouched"
        status: pass
    human_judgment: false
  - id: D6
    description: "No module under `packages/vitest/src` still describes the shared path as future work, and Pitfall 29's capability asymmetry is written where a reader meets the seam"
    verification:
      - kind: other
        ref: "grep: \"Phase 10's entire reason to exist\"=0 in ScenarioEffect.ts, 'from Phase 10'=0 in TestApi.ts, 'single merged Layer'=0 in Runner.ts, 'live'>=1 in TestApi.ts"
        status: pass
      - kind: other
        ref: "git diff -U0 filtered to non-comment lines across all three files: empty — no runtime line changed, import counts unchanged (Runner 14, TestApi 2)"
        status: pass
    human_judgment: false

# Metrics
duration: 16min
completed: 2026-08-30
status: complete
---

# Phase 10 Plan 02: The shared Layer scope, actually shared Summary

**`{ shared, perScenario }` now travels as two separate tiers all the way to the composition root, where the shared half is built exactly once by `@effect/vitest`'s `layer(..., { excludeTestServices: true })` and every Scenario gets a fresh `TestClock`/`TestConsole` provided at the emission boundary — with the plain-Layer path byte-for-byte unchanged and the `TestApi` seam intact under a second implementation.**

## Performance

- **Duration:** ~16 min
- **Started:** 2026-08-30T03:09:00Z
- **Completed:** 2026-08-30T03:25:00Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments

- `normalizeLayer`'s `Layer.merge` is gone. Nothing in `describeFeature.ts` merges the two scopes any more — `grep -c 'Layer.merge('` over non-comment lines returns 0.
- `FeatureCollection` carries `layer` (the per-Scenario tier, on both call forms) and `sharedLayer` (`Layer | null`), each with a doc comment stating what the other one is not.
- A second concrete `TestApi`, `sharedLayerTestApi`, emits through the `it` that `layer(...)` hands its callback and wraps every thunk in `Effect.provide(testEnv)`. `describe` stays the module-level one, and note (a) of `TestApi.ts` now records why that is legitimate and why it was also unavoidable.
- D-08's catch-and-degrade was FACTORED into `makeDegradingEffect` rather than duplicated, so the shared path cannot silently lack it.
- `describeFeature`'s body branches exactly once, with the warnings loop, `makeTagFilter` and `onEmitted` all computed above the branch and referenced from both arms.
- Three forward-references that named "Phase 10" as future work are retired, in comment lines only — no runtime statement and no import added to `Runner.ts`, `ScenarioEffect.ts` or `TestApi.ts`.
- All ten plan-level gates exit 0, including `verify:testapi-seam`, `verify:tags-filter`, `verify:tsgo-gate` and `circular`.

## Task Commits

1. **Task 1: Stop collapsing the two scopes — `FeatureCollection.sharedLayer`** — `2d828dd` (feat)
2. **Task 2: The shared-path `TestApi` and the `layer(...)` routing branch** — `02c36a2` (feat)
3. **Task 3: Retire the three forward-references that named this phase** — `784221c` (docs)

## Files Created/Modified

- `packages/vitest/src/describeFeature.ts` — `splitLayerArgument` replaces `normalizeLayer`; `FeatureCollection.sharedLayer` added and `layer` re-documented; module-scope `testEnv`; `makeDegradingEffect`; `sharedLayerTestApi`; the one routing branch; notes (d) and (e) rewritten; implementation-signature params renamed `layer` → `layerArgument`.
- `packages/vitest/test/describeFeature.test.ts` — the three-test `describe` block replacing the merged-Layer assertions, plus `whoProvidesShared`; module doc mutation list updated (mutation B replaced); the position-sensitive `givenLine` literal moved 279 → 291.
- `packages/vitest/src/ScenarioEffect.ts` — note (b)'s second paragraph and the `@param args.layer` line.
- `packages/vitest/src/Runner.ts` — note (a)'s Phase 10 forward-reference, note (f)'s new paragraph on the three-tier chain and the two `Effect.provide(layer)` call sites, and the `@param args.layer` line.
- `packages/vitest/src/TestApi.ts` — the header's future-tense sentence, and two new paragraphs in note (a) (`MethodsNonLive` has no `describe`; Pitfall 29's missing `live`).
- `spec/decisions/006-two-layer-scopes-only.md` — the call-form comment and one new paragraph; see deviation 1.

## The reversion mutation (plan Task 1 requirement)

Mutation B, as the plan specified it: `splitLayerArgument` re-collapsing to the old behaviour.

```ts
"perScenario" in argument
  ? { shared: null, perScenario: Layer.merge(argument.shared, argument.perScenario) }
  : { shared: null, perScenario: argument }
```

`pnpm build` still exits 0 — the mutation type-checks, which is the whole reason it needs tests. `pnpm test` reported **3 failed | 741 passed | 3 skipped (747)**, and the exact set that went red was:

```
FAIL  packages/vitest/test/describeFeature.test.ts > the layer argument separates into two
      independently provided tiers > keeps each tier resolving to its own implementation when
      both name the same service
FAIL  packages/vitest/test/describeFeature.test.ts > the layer argument separates into two
      independently provided tiers > keeps shared's services on the shared tier alone when
      perScenario is Layer.empty
FAIL  packages/vitest/test/describeFeature.test.ts > the layer argument separates into two
      independently provided tiers > carries a sharedLayer for the object form and null for the
      plain-Layer form
```

All three, and nothing else in the repo. That is the point of the re-homing: the pre-Phase-10 D-04 test would have gone GREEN under this mutation, because a merged Layer still resolves `Marker` to `perScenario`. **Reverted, `pnpm build && pnpm typecheck:test && pnpm test && pnpm lint` all exit 0 afterwards.**

## The runtime probe (unplanned, and the reason to read this section)

Task 2 adds a branch that **no committed test exercises** — the plan says so explicitly and assigns the proof to 10-03. Committing an unexercised branch on the strength of a type-check alone would have been exactly the "compiles, lints, passes, and is silently wrong" failure this whole phase is about, so a throwaway probe was written, run, and deleted before the Task 2 commit.

Two Scenarios, a `shared` Layer incrementing one counter, a `perScenario` Layer incrementing another, and a step that reads `Clock.currentTimeMillis` and then does `TestClock.adjust("1 hour")`:

```
stdout | Probe > one
PROBE shared=1 fresh=1 clock=0
stdout | Probe > two
PROBE shared=1 fresh=2 clock=0
PROBE TOTALS sharedBuilds=1 perScenarioBuilds=2
```

Four things measured at once, and all four are what the phase asks for:

| Claim | Evidence |
|---|---|
| shared Layer built exactly once per Feature (SC #2, RUN-03) | `sharedBuilds=1` across two Scenarios |
| per-Scenario tier still fresh every Scenario (INV-EC-002) | `perScenarioBuilds=2` |
| per-Scenario `TestClock` isolation (SC #3, ADR-EC-018) | `clock=0` in Scenario **two**, after Scenario one advanced it an hour |
| no extra `describe` block from the one-argument `layer(...)` form | reporter tree reads `Probe > one` / `Probe > two`, not `Probe > Probe > one` |

**The probe was deleted.** Nothing in the committed suite re-proves rows 1, 2 or 4 on every push yet — that is 10-03's and 10-04's job, and the `coverage` block above marks D1 and D2 `human_judgment: true` for exactly this reason. Do not read these numbers as a standing guarantee.

## `pnpm test` counts at each task boundary

| | Test Files | Tests |
|---|---|---|
| Before this plan | 32 passed (32) | 743 passed \| 3 skipped (746) |
| After Task 1 | 32 passed (32) | 744 passed \| 3 skipped (747) |
| After Task 2 | 32 passed (32) | 744 passed \| 3 skipped (747) |
| After Task 3 | 32 passed (32) | 744 passed \| 3 skipped (747) |

Task 1 added exactly ONE new `it` block (`carries a sharedLayer for the object form and null for the plain-Layer form`) and the count moved by exactly one. Tasks 2 and 3 added none, as the plan required.

## Import counts for `Runner.ts` and `TestApi.ts` (plan Task 3 requirement)

| File | Before Task 3 | After Task 3 |
|---|---|---|
| `packages/vitest/src/Runner.ts` | 14 | 14 |
| `packages/vitest/src/TestApi.ts` | 2 | 2 |

`git diff -U0` over all three Task 3 files, filtered to lines that are neither `*`, `//` nor blank, produced **no output** — every changed line is a comment line. `pnpm verify:testapi-seam` exits 0.

## Gate results

| Gate | Result |
|---|---|
| `pnpm build` | exit 0 |
| `pnpm typecheck:test` | exit 0 |
| `pnpm test` | exit 0, 744 passed \| 3 skipped |
| `pnpm lint` | exit 0 (oxlint + `dprint check`) |
| `pnpm verify:testapi-seam` | exit 0 — the seam survives a second implementation |
| `pnpm verify:no-runner-dep` | exit 0 |
| `pnpm verify:tsgo-gate` | exit 0 — overload surface untouched |
| `pnpm verify:tags-filter` | exit 0 — default path's tag routing unchanged |
| `pnpm circular` | exit 0 — no new module, no new edge between existing ones |
| `pnpm verify:spec` | exit 0 — 7 PASS, 0 FAIL, 1 SKIP |

## Acceptance criteria

### Task 1

| Criterion | Required | Result |
|---|---|---|
| `grep -c 'normalizeLayer' src/describeFeature.ts` | 0 | **0** |
| `grep -c 'splitLayerArgument' src/describeFeature.ts` | exactly 2 | **2** |
| `grep -v '^\s*\*' \| grep -c 'Layer.merge(' src/describeFeature.ts` | 0 | **0** |
| `grep -c 'readonly sharedLayer' src/describeFeature.ts` | exactly 1 | **1** |
| `grep -c 'sharedLayer' test/describeFeature.test.ts` | ≥ 4 | **6** |
| build / typecheck:test / test / lint | exit 0 | all exit 0 |
| test count up by exactly the new `it` blocks | +1 | 746 → 747 |
| reversion mutation recorded with the exact red set | yes | above |

### Task 2

| Criterion | Required | Result |
|---|---|---|
| `grep -c 'excludeTestServices: true'` | exactly 1 | **1 code / 3 raw** — see deviation 2 |
| `grep -c 'Layer.mergeAll(TestConsole.layer, TestClock.layer())'` | exactly 1 | **1** |
| `grep -c 'from "effect/testing/TestClock"'` | 1 | **1** |
| `grep -c 'from "effect/testing/TestConsole"'` | 1 | **1** |
| `grep -c 'sharedLayerTestApi'` | ≥ 2 | **4** |
| `grep -c 'emitFeature({'` | exactly 2 | **2** |
| `grep -c 'makeTagFilter'` | exactly 2 | **2 code / 4 raw** — see deviation 2 |
| `pnpm verify:testapi-seam` | exit 0 | exit 0 |
| `pnpm verify:no-runner-dep` | exit 0 | exit 0 |
| build / typecheck:test / test / lint, count unchanged | exit 0, 747 | exit 0, 747 |
| `pnpm verify:tags-filter` | exit 0 | exit 0 |

### Task 3

| Criterion | Required | Result |
|---|---|---|
| `grep -c "Phase 10's entire reason to exist" src/ScenarioEffect.ts` | 0 | **0** |
| `grep -c "from Phase 10" src/TestApi.ts` | 0 | **0** |
| `grep -c "single merged Layer" src/Runner.ts` | 0 | **0** |
| import counts unchanged | same | 14 / 14 and 2 / 2 |
| changes confined to comment lines | yes | filtered diff empty |
| `verify:testapi-seam`, `verify:no-runner-dep` | exit 0 | both exit 0 |
| build / test / lint, count unchanged | exit 0, 747 | exit 0, 747 |
| `grep -c 'live' src/TestApi.ts` | ≥ 1 | **2** |

## Decisions Made

See the `key-decisions` frontmatter. The three a reader of 10-03 needs:

- **`collection.layer` no longer means "the Feature's ambient Layer".** It is the per-Scenario tier, on both call forms. Any test or tool that reads it expecting the whole ambient set is now wrong on the object form, and wrong SILENTLY — every service it does carry still resolves.
- **The runtime collision verdict is not asserted anywhere yet.** `perScenario` winning a service both tiers name is now a provision-order property that only a real run can observe. Plan 10-03 must assert it; nothing in the collection-level suite can, and the note (d) rewrite says so in the source.
- **A Rule or Scenario `extraLayer` that depends on a SHARED service is satisfied ambiently, not by its own composition.** `Layer.provideMerge(featureLayer)(extraLayer)` now feeds only the per-Scenario tier in, leaving the shared dependency on the composed Layer's `RIn` where `layer(...)`'s context resolves it. Measured during planning and unchanged by this implementation; plan 10-04's Rule-under-`shared` block is what keeps it true.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] `spec/decisions/006-two-layer-scopes-only.md` corrected in the same commit**

- **Found during:** Task 1
- **Issue:** AGENTS.md section 1 is explicit — "a code change that isn't reflected in `spec/` in the same commit is incomplete, not merely undocumented." ADR-EC-006's own call-form example carried the comment `// fresh per Scenario, merged with \`shared\``, which describes a mechanism this plan removed. The ADR says nothing anywhere about how a collision resolves, so a reader arriving from it would have had no statement of the rule at all once the merge was gone.
- **Fix:** The code-fence comment now reads `// fresh per Scenario, provided inside each Scenario's own Effect`, and one paragraph was added under Decision stating that the two tiers are provided separately, that both remain reachable from every step, and that `perScenario` wins a collision because the inner provision is the nearer one rather than because of any argument order.
- **Files modified:** `spec/decisions/006-two-layer-scopes-only.md`
- **Verification:** `pnpm verify:spec` exit 0 (7 PASS / 0 FAIL / 1 SKIP), `pnpm lint` exit 0.
- **Committed in:** `2d828dd` (the Task 1 commit, which is the change that invalidated it).
- **Scope note:** ADR-EC-006 appears in no other plan's `files_modified` in this phase, and 10-06's spec work (status flips in `overview.md`, `roadmap.md`, `invariants.md`, ADR-EC-018 and `traceability.md`) is untouched by this edit.

**2. [Rule 3 - Blocking] Two acceptance criteria are unsatisfiable as literally written**

- **Found during:** Task 2
- **Issue:** `grep -c 'excludeTestServices: true'` returning exactly 1 and `grep -c 'makeTagFilter'` returning exactly 2 both count COMMENT lines. `excludeTestServices: true` is named in `sharedLayerTestApi`'s doc comment (as the half of ADR-EC-018 that lives at the call site) and again beside the call itself, so the literal count is 3. `makeTagFilter` is named in `DescribeFeatureOptions.includeTags`' doc comment and in the `tagFilter` comment block, so the literal count is 4. Both criteria therefore forbid documenting the very thing they require — the collision STATE.md's 03-04 entry already records, and which 10-01 hit once already.
- **Fix:** Applied the intent-preserving form, which is the one this plan's OWN sibling criterion already prescribes for `Layer.merge(` ("the `grep -v` strips doc-comment lines so a comment explaining the removal cannot fail its own criterion"): `grep -v '^\s*\*' | grep -v '^\s*//' | grep -c <literal>`. Under it, `excludeTestServices: true` returns **1** (the `layer(...)` call) and `makeTagFilter` returns **2** (the import plus one call). Both intents — one `layer(...)` call site, one filter computed and shared by both arms — hold exactly.
- **Files modified:** none (a criterion correction, not a code change).
- **Verification:** recorded in the Task 2 acceptance table above; `grep -c 'emitFeature({'` = 2 independently confirms the "one filter, two arms" claim the `makeTagFilter` criterion exists for.
- **Committed in:** n/a — recorded here.

**3. [Rule 3 - Blocking] The implementation signatures' `layer` parameter shadowed the `layer` import**

- **Found during:** Task 2
- **Issue:** Task 2 requires calling `@effect/vitest`'s `layer(...)` from inside `describeFeature`'s body, but that body's parameter is named `layer`, which shadows the import for the whole scope. `pnpm lint` additionally failed with three `no-shadow` errors — on `collect`, `collectFeature`'s implementation signature, and `splitLayerArgument` — so an alias on the import alone would not have cleared the gate either.
- **Fix:** Renamed the parameter to `layerArgument` in all three implementation signatures plus `collect`, and to `argument` in `splitLayerArgument`. Both OVERLOAD signatures of `describeFeature` and `collectFeature` still name the parameter `layer`, and those are the only ones a caller or a tooltip ever sees — TypeScript never resolves a call against an implementation signature, which is the same argument `LayerArgument`'s own doc comment already makes. A comment at each renamed signature records the reason so it does not get "tidied" back.
- **Files modified:** `packages/vitest/src/describeFeature.ts`
- **Verification:** `pnpm lint` exit 0; `pnpm verify:tsgo-gate` exit 0, including its overload-order assertion; `pnpm typecheck:test` exit 0, which compiles `SharedLayerConstraint.types.ts` against both entry points' published signatures.
- **Committed in:** `02c36a2` (Task 2 commit).

**4. [Rule 2 - Missing Critical] A throwaway runtime probe before committing the unexercised branch**

- **Found during:** Task 2
- **Issue:** Task 2 adds a branch and no test, by design — 10-03 owns the proof. Every defect this phase exists to prevent (Anti-Pattern 3, the memoised clock, the doubled `describe`) compiles, lints and passes, so a type-check is precisely the evidence that cannot distinguish a working shared path from a broken one.
- **Fix:** Wrote `packages/vitest/test/zzprobe.test.ts`, ran it, recorded the output (see "The runtime probe" above), and DELETED it with `rm` before staging. No `git clean` was used at any point.
- **Files modified:** none in the commit — the probe never entered the index.
- **Verification:** `git status --short` clean of the probe before `git add`; `pnpm test` count unchanged at 747 afterwards.
- **Committed in:** n/a — the measurements are recorded in `02c36a2`'s commit body and above.

---

**Total deviations:** 4 auto-fixed (2 missing critical, 2 blocking)
**Impact on plan:** No scope creep. Deviation 1 is mandated by AGENTS.md section 1 and touches only what this plan invalidated; deviation 2 changed no code; deviation 3 was required to make the plan's own prescribed call site compile and lint; deviation 4 added and removed a file that never entered a commit.

## Issues Encountered

- `Effect.fail(new Error(...))` in the first draft of `whoProvidesShared` tripped the `effect(globalErrorInEffectFailure)` tsgo diagnostic and failed `pnpm typecheck:test`. Resolved by making the helper THROW synchronously instead, which is the shape `ruleLayerOf` in the same file already uses for the same "this collection does not have what you asked for" situation — a precedent rather than a new convention.
- The position-sensitive `givenLine = 279` literal in `describeFeature.test.ts` had to move to 291 after the module doc comment grew. That is the assertion working as designed (its own comment says so), not a defect.

## User Setup Required

None — no external service configuration required. This plan installs no package and adds no dependency to any manifest; `effect/testing/*` and `@effect/vitest`'s `layer` are already-installed modules of already-declared peers, and `pnpm-lock.yaml` is untouched (threat T-10-02-SC).

## Next Phase Readiness

**Ready for 10-03.** The mechanism is in place and every gate is green, but the phase's two headline claims are **measured, not guarded**. What 10-03 must do:

- **Assert the build count in process.** `sharedBuilds === 1` for N Scenarios under `shared` vs. N builds under the default scope (10-CONTEXT.md D-01). Nothing in the committed suite does this today.
- **Assert the `TestClock` isolation in process.** A Scenario running after another Scenario's `TestClock.adjust` must read time 0 (ADR-EC-018). Same gap.
- **Assert the runtime collision verdict.** Which implementation a step actually REACHES when both tiers name one service is now a provision-order property no collection-level test can see. `describeFeature.test.ts`'s D-04 case was re-homed to a two-values claim precisely because it could no longer carry this one, and `describeFeature.ts` note (d) names 10-03 as where it moves to.

Constraints 10-03 and later plans must respect:

- **`collection.layer` is the PER-SCENARIO tier.** Do not read it expecting the Feature's whole ambient Layer on the object form; the shared half is not in it, and a test that does will pass while proving nothing.
- **`sharedLayer` is `Layer | null` and must stay nullable.** `Layer.empty` is the plausible tidy-up that would delete the branch and send every plain-Layer Feature down the shared path. One test pins it.
- **The ONE-ARGUMENT `layer(...)` form only.** The two-argument form renders `Feature > Feature > Scenario`. The prohibition and its measurement are at the call site.
- **`Effect.provide(testEnv)` belongs at the emission boundary.** Moving it into `ScenarioEffect.ts` would make that module know two paths exist, which its note (b) now explicitly forbids.
- **`Runner.ts` and `TestApi.ts` still import no framework.** A second `TestApi` implementation did not need one, and `pnpm verify:testapi-seam` remains the enforcement.
- **RUN-03 and RUN-04 stay Pending in `.planning/REQUIREMENTS.md`.** 10-06 owns that file and should mark both once the verification halves are in.

## Self-Check: PASSED

All six modified files verified present on disk. All three commit hashes (`2d828dd`, `02c36a2`, `784221c`) verified present in `git log --all`.

---
*Phase: 10-layer-scopes-per-scenario-default-shared*
*Completed: 2026-08-30*

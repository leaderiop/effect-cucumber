---
phase: 10-layer-scopes-per-scenario-default-shared
plan: 03
subsystem: testing
tags: [typescript, effect, layer, effect-vitest, mutation-testing, dependency-injection, gherkin]

# Dependency graph
requires:
  - phase: 10-layer-scopes-per-scenario-default-shared
    provides: "plan 10-02's `sharedLayerTestApi`, the `layer(..., { excludeTestServices: true })` routing branch and `FeatureCollection.sharedLayer` — the branch this plan is the first committed exercise of"
  - phase: 10-layer-scopes-per-scenario-default-shared
    provides: "plan 10-01's `shared: Layer<R, never, never>` constraint, which is why both tiers here can be written with a `never` error channel and compile"
  - phase: 08-rules-and-rule-scoped-layers
    provides: "`emission.test.ts`'s Rule-composition block — the structural precedent this plan's two blocks copy (own services, own counters, one real `describeFeature`, a trailing reader block)"
provides:
  - "the FIRST committed assertion in this repo that counts Layer BUILDS rather than observing state"
  - "`perScenarioBuildOrdinals` — the default scope's N-Scenarios-N-builds proof, `[1, 2, 3]`"
  - "`sharedBuildOrdinals` — the `shared` scope's build-once proof, `[1, 1, 1]`, in process"
  - "`scopedBuildOrdinals` — the paired anti-over-fix assertion, `[1, 2, 3]` in the SAME Feature"
  - "`collisionWinners` — D-04's runtime verdict, which 10-02 deferred to this plan by name"
  - "the FIRST `{ shared, perScenario }` call to the real `describeFeature` entry point anywhere in the repo"
  - "six FIXED Scenario titles that plan 10-05's CLI gate asserts on by exact suffix match"
affects: [10-04, 10-05, 10-06]

actuals:
  tokens: 5851
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Count BUILDS, not just state: a build ordinal captured inside the Layer's build effect and read back out of the resolved SERVICE, so a Layer that built N times and was handed to nobody cannot produce it"
    - "Assert the shared count from INSIDE the step body, first, so an in-process claim becomes a test node's pass/fail status — the only channel a JSON reporter has a field for"
    - "Pair every build-count assertion with its opposite tier in the SAME Feature and the SAME run: `[1, 1, 1]` alone cannot distinguish the fix from the over-fix that memoises both tiers"
    - "Record the OBSERVED mutation output, not the predicted one — two of this plan's three Task 2 mutations behaved differently from the plan's prediction, and the difference was the informative part"

key-files:
  created: []
  modified:
    - packages/vitest/test/emission.test.ts

key-decisions:
  - "ONE `When` definition matched by all three Scenarios in the shared block, rather than three identical bodies. Three copies of one claim can drift into asserting three different things; the Scenario titles already name which node failed."
  - "Task 1 keeps three DISTINCT `When` texts because Scenario two's body genuinely differs (it asserts its `Ref` is empty first). Task 2 shares one because all three bodies are identical."
  - "The three Scenarios are the MINIMUM this could have used, and mutation (ii) proved it: under a per-Scenario rebuild Scenario ONE still passes, because a Layer built per Scenario is on its first build when the first Scenario runs. Only Scenarios two and three separate `[1, 1, 1]` from `[1, 2, 3]`."
  - "`spec/` is deliberately UNTOUCHED. This plan changes no public behavior — it adds assertions about behavior 10-02 already shipped — and 10-06 owns the status flips in `invariants.md`/`roadmap.md`/`REQUIREMENTS.md`. AGENTS.md §1 binds code changes to spec changes; there is no code change here."
  - "RUN-03 stays Pending. This is the in-process half of its verification; 10-05's real-CLI gate is the other half (10-CONTEXT.md D-02 says plainly that both are wanted), and 10-06 owns the requirement flip. Same call as 10-01 and 10-02."

patterns-established:
  - "Build-count proof: a `Context.Service` carrying a `buildOrdinal` captured at build time plus a module-scope counter, with the ordinal array asserted exactly — the counter alone is satisfiable by a build nobody reached"
  - "Two-tier proof in one Feature: the shared and per-Scenario ordinals asserted together, so an over-fix that memoises both tiers is a distinct, visible failure rather than a silent pass"
  - "Scenario titles that an out-of-process gate depends on are declared FIXED in a comment at the fixture, naming the downstream plan, so a rename fails loudly in both places instead of turning a later assertion vacuously true"

requirements-completed: []

coverage:
  - id: D1
    description: "A Feature with three Scenarios and a plain (per-Scenario) Layer builds that Layer three times — one build per Scenario, in Scenario order (D-01, roadmap SC #1)"
    requirement: RUN-03
    verification:
      - kind: unit
        ref: "packages/vitest/test/emission.test.ts#the default per-Scenario Layer scope builds once per Scenario (10-03) > built the Layer three times for three Scenarios, in Scenario order"
        status: pass
      - kind: other
        ref: "mutation I — `Layer.succeed` at module scope; ordinals read [1, 1, 1], recorded below"
        status: pass
    human_judgment: false
  - id: D2
    description: "State written into a per-Scenario service in one Scenario is not observable in the next (INV-EC-002, roadmap SC #1's second half)"
    requirement: RUN-03
    verification:
      - kind: unit
        ref: "packages/vitest/test/emission.test.ts#Per-Scenario build count > the second per-scenario scenario sees a fresh build (in-body `Ref` emptiness assertion)"
        status: pass
      - kind: other
        ref: "mutation I — the same mutation turns this red independently, on `expected [ 'first' ] to deeply equal []`"
        status: pass
    human_judgment: false
  - id: D3
    description: "A Feature declared with `{ shared, perScenario }` builds the `shared` Layer exactly ONCE for all three Scenarios (D-01, roadmap SC #2, RUN-03)"
    requirement: RUN-03
    verification:
      - kind: unit
        ref: "packages/vitest/test/emission.test.ts#the opt-in shared Layer scope builds exactly once per Feature (10-03) > gave all three Scenarios the SAME single shared build"
        status: pass
      - kind: unit
        ref: "packages/vitest/test/emission.test.ts#Shared build count > (all three Scenarios' in-body `assert.strictEqual(sharedBuilds, 1)`)"
        status: pass
      - kind: other
        ref: "mutations (i) and (ii) — both turn this red; recorded below with observed output"
        status: pass
    human_judgment: false
  - id: D4
    description: "The same Feature's `perScenario` half still builds three times — the shared fix did not memoize the per-Scenario tier along with it (INV-EC-002 under the shared scope)"
    requirement: RUN-03
    verification:
      - kind: unit
        ref: "packages/vitest/test/emission.test.ts#the opt-in shared Layer scope builds exactly once per Feature (10-03) > kept the per-Scenario tier of the SAME Feature fresh for every Scenario"
        status: pass
    human_judgment: false
  - id: D5
    description: "A service named by BOTH `shared` and `perScenario` resolves to `perScenario`'s implementation inside a running step (D-04, now delivered by provision order rather than merge order)"
    requirement: RUN-03
    verification:
      - kind: unit
        ref: "packages/vitest/test/emission.test.ts#the opt-in shared Layer scope builds exactly once per Feature (10-03) > resolved a service named by BOTH tiers to the perScenario implementation (D-04)"
        status: pass
      - kind: other
        ref: "mutation (iii) — swapping the two tiers' values turns EXACTLY this assertion red and nothing else"
        status: pass
    human_judgment: false
  - id: D6
    description: "Neither block can pass vacuously: a `describeFeature` that emitted nothing fails both blocks' name recorders (T-10-03-03)"
    verification:
      - kind: unit
        ref: "packages/vitest/test/emission.test.ts#... > emitted and ran all three Scenarios, each nested under the Feature (both blocks)"
        status: pass
      - kind: other
        ref: "mutation (i) — the shared block emitted nothing through `sharedIt`, and all four readers went red on empty arrays"
        status: pass
    human_judgment: false

# Metrics
duration: 13min
completed: 2026-08-30
status: complete
---

# Phase 10 Plan 03: In-process build-count proof for both Layer scopes Summary

**The default per-Scenario scope is now proven to build its Layer once per Scenario (`[1, 2, 3]`) and the opt-in `shared` scope exactly once per Feature (`[1, 1, 1]`) by two real `describeFeature` runs in the ordinary `pnpm test` suite — the first assertions in this repo that count Layer BUILDS rather than observing state, each mutation-proven non-vacuous.**

## Performance

- **Duration:** ~13 min
- **Started:** 2026-08-30T01:27:00Z
- **Completed:** 2026-08-30T01:40:00Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- **The gap 10-02 flagged is closed.** Its summary said plainly that the shared build-count claim was "measured, not guarded" — proven by a throwaway probe that was then deleted, so nothing re-proved it on any push. Two committed blocks now do, on every run.
- **`emission.test.ts` counts builds for the first time.** Every prior assertion in this repo about Layer scope observes STATE (a `Ref`'s contents, a hook log). State and build count come apart, and only a count can tell the default scope from `shared` at all — every step resolves identically either way, which is ARCHITECTURE.md Anti-Pattern 3's whole danger.
- **The first `{ shared, perScenario }` call to the real entry point anywhere in the repo.** Plan 10-02 shipped the branch and committed no test that entered it; this is the first committed caller.
- **D-04's runtime verdict has a home again.** 10-02 re-homed the collection-level collision test to a two-tiers-two-values claim because no collection-level assertion can see provision order, and named this plan as where the runtime half moves to. `collisionWinners` is that assertion.
- **Five mutations performed, run and reverted**, with their observed output recorded in the file's own header beside the arrangements they mutate.
- All plan gates exit 0, plus `build`, `verify:spec`, `verify:testapi-seam` and `circular` for good measure.

## Task Commits

1. **Task 1: Default path — three Scenarios, three Layer builds, no state carried across** — `37030ac` (test)
2. **Task 2: Shared path — three Scenarios, ONE shared build, three per-Scenario builds** — `adc77bb` (test)

## Files Created/Modified

- `packages/vitest/test/emission.test.ts` — two new blocks appended after every existing block (the file's own declaration-order rule), each with its own service classes, its own counters and its own reader block; plus mutation `I` added to the file's header mutation list and a pointer to Task 2's block-local mutation record.

## The six Scenario titles, verbatim — for plan 10-05

Plan 10-05's real-CLI gate asserts on these by exact suffix match. **Copy them from here; do not re-derive them.** Renaming one without renaming it in both places turns that gate's assertion vacuously true, which is the precise failure `verify-tags-filter.sh`'s `title_is_declared` precondition exists to prevent.

Feature `Per-Scenario build count`, uri `test/per-scenario-build-count.feature`:

1. `the first per-scenario scenario records its own build`
2. `the second per-scenario scenario sees a fresh build`
3. `the third per-scenario scenario sees a third build`

Feature `Shared build count`, uri `test/shared-build-count.feature`:

4. `the first shared scenario observes the single shared build`
5. `the second shared scenario observes the same shared build`
6. `the third shared scenario observes the same shared build`

The shared block's three Scenarios each assert `sharedBuilds === 1` as the FIRST statement in their step body, which is deliberately the design 10-05 depends on: the build-count claim is observable from outside the process as those three nodes' pass/fail status, and a JSON reporter has a field for a test's status and none for a counter.

## The five mutation proofs

Every one performed, run, then reverted. **Two of the three Task 2 mutations behaved differently from the plan's prediction, and both differences are recorded here and in the source rather than smoothed over.**

### Task 1 — mutation I: `Layer.effect` → module-scope `Layer.succeed`

```ts
const perScenarioProbeLayer = Layer.succeed(
  PerScenarioProbe,
  PerScenarioProbe.of({ buildOrdinal: (perScenarioBuilds += 1), entries: Ref.makeUnsafe<ReadonlyArray<string>>([]) })
)
```

**3 failed | 746 passed | 3 skipped (752)**, `Test Files 1 failed | 31 passed` — all three in this block, nothing anywhere else in the repo:

```
FAIL  Per-Scenario build count > the second per-scenario scenario sees a fresh build
      AssertionError: expected [ 'first' ] to deeply equal []
FAIL  the default per-Scenario Layer scope builds once per Scenario (10-03) >
      built the Layer three times for three Scenarios, in Scenario order
      AssertionError: expected [ 1, 1 ] to deeply equal [ 1, 2, 3 ]
FAIL  the default per-Scenario Layer scope builds once per Scenario (10-03) >
      emitted and ran all three Scenarios, each nested under the Feature
      AssertionError: expected [ …(2) ] to deeply equal [ …(3) ]
```

**The plan predicted `[1, 1, 1]`; the observed value was `[1, 1]`.** The reason is benign and worth recording: Scenario two aborts at the `Ref`-emptiness assertion *before* it pushes its ordinal, so only Scenarios one and three contribute. To confirm the plan's stated `[1, 1, 1]` and — more importantly — to prove the ordinals assertion is red **on its own merits** rather than only as a side effect of the state assertion, the emptiness assertion was temporarily removed with the mutation still in place:

```
FAIL  built the Layer three times for three Scenarios, in Scenario order
      AssertionError: expected [ 1, 1, 1 ] to deeply equal [ 1, 2, 3 ]
 Tests  1 failed | 748 passed | 3 skipped (752)
```

Exactly `[1, 1, 1]`, exactly one failure. Both sub-mutations reverted; suite back to 749 passed.

### Task 2 — mutation (i): the shared branch routed through `vitestTestApi` (Anti-Pattern 3)

In `packages/vitest/src/describeFeature.ts`, the shared arm's `api:` changed from `sharedLayerTestApi(collection.plan.feature.uri, sharedIt)` to `vitestTestApi(collection.plan.feature.uri)` — the module-level `it` inside `layer(...)`'s callback, which is ARCHITECTURE.md Anti-Pattern 3 verbatim.

**7 failed | 749 passed | 3 skipped (759)**, `Test Files 1 failed | 31 passed` — all seven this block's, nothing else in the repo:

```
FAIL  Shared build count > the first shared scenario observes the single shared build
FAIL  Shared build count > the second shared scenario observes the same shared build
FAIL  Shared build count > the third shared scenario observes the same shared build
      AssertionError: expected +0 to equal 1
FAIL  ... > gave all three Scenarios the SAME single shared build
      AssertionError: expected [] to deeply equal [ 1, 1, 1 ]
FAIL  ... > kept the per-Scenario tier of the SAME Feature fresh for every Scenario
      AssertionError: expected [] to deeply equal [ 1, 2, 3 ]
FAIL  ... > resolved a service named by BOTH tiers to the perScenario implementation (D-04)
      AssertionError: expected [] to deeply equal [ 'perScenario', 'perScenario', …(1) ]
FAIL  ... > emitted and ran all three Scenarios, each nested under the Feature
      AssertionError: expected [] to deeply equal [ …(3) ]
```

**The plan predicted 5 failures and a shared Layer "built three times"; the observed result is 7 failures and a count of `0`.** This is the more interesting finding and it is now written into the source: emitting through the module-level `it` does not merely *rebuild* the shared Layer per Scenario here — it never reaches a built one at all. Nothing was registered through `sharedIt`, so at step time `sharedBuilds` is still 0, and had the count assertion not been first, the next line would have failed on `Service not found: SharedProbe` instead. The `0` records that `sharedLayerTestApi` is what **carries the shared services to a step**, not merely what causes the build to be counted once. Reverted; `grep -c 'sharedLayerTestApi'` back to 4.

### Task 2 — mutation (ii): `splitLayerArgument` re-collapsed to `Layer.merge(shared, perScenario)`

```ts
"perScenario" in argument
  ? { shared: null, perScenario: Layer.merge(argument.shared, argument.perScenario) }
  : { shared: null, perScenario: argument }
```

**9 failed | 747 passed | 3 skipped (759)**, `Test Files 2 failed | 30 passed`:

```
FAIL  describeFeature.test.ts > the layer argument separates into two independently provided tiers >
      keeps each tier resolving to its own implementation when both name the same service
FAIL  describeFeature.test.ts > ... > keeps shared's services on the shared tier alone when perScenario is Layer.empty
FAIL  describeFeature.test.ts > ... > carries a sharedLayer for the object form and null for the plain-Layer form
      AssertionError: expected null not to be null
FAIL  Shared build count > the second shared scenario observes the same shared build
      AssertionError: expected 2 to equal 1
FAIL  Shared build count > the third shared scenario observes the same shared build
      AssertionError: expected 3 to equal 1
FAIL  ... > gave all three Scenarios the SAME single shared build
      AssertionError: expected [ 1 ] to deeply equal [ 1, 1, 1 ]
FAIL  ... > kept the per-Scenario tier of the SAME Feature fresh for every Scenario
      AssertionError: expected [ 1 ] to deeply equal [ 1, 2, 3 ]
FAIL  ... > resolved a service named by BOTH tiers to the perScenario implementation (D-04)
      AssertionError: expected [ 'perScenario' ] to deeply equal [ 'perScenario', 'perScenario', …(1) ]
FAIL  ... > emitted and ran all three Scenarios, each nested under the Feature
      AssertionError: expected [ Array(1) ] to deeply equal [ …(3) ]
```

The plan predicted 10-02's three collection-level failures plus this block's; that half held exactly. Two observations the plan did not predict, both recorded in the source:

- **Scenario ONE passes under this mutation.** A merged Layer rebuilt per Scenario *is* on its first build when Scenario one runs, so `sharedBuilds` is legitimately 1 there. This is the signature of the defect, not a gap — and it is why three Scenarios are the minimum this block could have used. A two-Scenario fixture would still catch it, a one-Scenario fixture never could.
- **`collisionWinners` records `["perScenario"]` — it does NOT go red on its merits.** A merged Layer resolves the collision the same way. That is the honest result and it is exactly why 10-02 re-homed the collection-level D-04 case rather than trusting it to notice a mechanism change; mutation (iii) is what actually guards this assertion.

Reverted; `git diff` on `describeFeature.ts` empty.

### Task 2 — mutation (iii): the two tiers' `CollisionMarker` values swapped

**1 failed | 755 passed | 3 skipped (759)** — exactly one, and it is the D-04 assertion:

```
FAIL  the opt-in shared Layer scope builds exactly once per Feature (10-03) >
      resolved a service named by BOTH tiers to the perScenario implementation (D-04)
      AssertionError: expected [ 'shared', 'shared', 'shared' ] to deeply equal [ 'perScenario', …(1) ]
```

Exactly as the plan predicted, and this is the one that matters: nothing else in the repo moved, so the assertion is a real collision test rather than a tautology satisfied by either arrangement (T-10-03-04). Reverted.

## `pnpm test` counts at each task boundary, reconciled

| | Test Files | Tests | Delta |
|---|---|---|---|
| Before this plan | 32 passed (32) | 744 passed \| 3 skipped (747) | — |
| After Task 1 | 32 passed (32) | 749 passed \| 3 skipped (752) | **+5** |
| After Task 2 | 32 passed (32) | 756 passed \| 3 skipped (759) | **+7** |

**Task 1's delta is +5, and the plan's acceptance criterion said 7.** The criterion spelled out its own arithmetic as "three Scenarios plus the two reader `it` blocks plus any warning nodes actually emitted", and instructed that any difference be reconciled explicitly rather than by adjusting the criterion. The reconciliation: 3 Scenario nodes + 2 reader `it` blocks = 5, and **zero warning nodes were emitted** — every step definition in the new Feature is used by a Scenario, so ADR-EC-019's unused-pattern warning never fires and no always-passing warning node is added. The criterion's "7" assumed two warning nodes that a well-formed fixture does not produce.

Task 2's delta is +7 exactly: 3 Scenario nodes + 4 reader `it` blocks.

## Gate results

| Gate | Result |
|---|---|
| `pnpm test` | exit 0 — 756 passed \| 3 skipped (759) |
| `pnpm typecheck:test` | exit 0 — the `{ shared, perScenario }` call compiles under 10-01's narrowed overload, a live check that the constraint did not become total |
| `pnpm lint` | exit 0 (oxlint + `dprint check`) |
| `pnpm verify:tags-filter` | exit 0 — 9 assertions; the new blocks emit no tags, so Phase 9's gate over this same file is unaffected |
| `pnpm build` | exit 0 |
| `pnpm verify:spec` | exit 0 — 7 PASS, 0 FAIL, 1 SKIP |
| `pnpm verify:testapi-seam` | exit 0 — `describeFeature.ts` fully reverted after mutations (i) and (ii) |
| `pnpm circular` | exit 0 |

## Acceptance criteria

### Task 1

| Criterion | Required | Result |
|---|---|---|
| `grep -c 'per-scenario-build-count.feature'` | exactly 1 | **1** |
| `grep -c 'Scenario: the first per-scenario scenario records its own build'` | exactly 1 | **1** |
| `grep -c 'Scenario: the second per-scenario scenario sees a fresh build'` | exactly 1 | **1** |
| `grep -c 'Scenario: the third per-scenario scenario sees a third build'` | exactly 1 | **1** |
| `grep -c 'perScenarioBuildOrdinals'` | ≥ 3 | **6** |
| `grep -c 'Layer.effect('` | +1 vs pre-task | **2 → 3** |
| `pnpm test` count delta | +7 | **+5, reconciled above** |
| `pnpm lint` exit 0, no `expect(` in a `function*()` body | yes | exit 0; `expect(` 34 → 36, both in the reader `it` blocks |
| mutation recorded with exact red output, nothing outside the block failed | yes | above — `Test Files 1 failed \| 31 passed` |

### Task 2

| Criterion | Required | Result |
|---|---|---|
| `grep -c 'shared-build-count.feature'` | exactly 1 | **1** |
| `grep -c 'Scenario: the first shared scenario observes the single shared build'` | exactly 1 | **1** |
| `grep -c 'Scenario: the second shared scenario observes the same shared build'` | exactly 1 | **1** |
| `grep -c 'Scenario: the third shared scenario observes the same shared build'` | exactly 1 | **1** |
| `grep -c 'describeFeature(.*{ shared:'` | exactly 1 | **1** — the file's first object-form call |
| `grep -c 'sharedBuildOrdinals'` | ≥ 2 | **4** |
| `grep -c 'scopedBuildOrdinals'` | ≥ 2 | **4** |
| `grep -c 'collisionWinners'` | ≥ 2 | **6** |
| `pnpm test` exit 0, delta reconciled | yes | exit 0, **+7** = 3 Scenarios + 4 readers |
| `pnpm typecheck:test` | exit 0 | exit 0 |
| `pnpm lint` | exit 0 | exit 0 |
| all three mutations recorded with their exact red sets, each reverted | yes | above |

The plan's two `must_haves.key_links` patterns were checked directly:
`grep -cE 'describeFeature\([a-zA-Z]+, \{ shared:'` = **1**, `grep -c 'parseFeature('` = **13** (every Feature in the file is still parsed from an inline template literal by the real parser; no hand-built `ParsedFeature` was introduced).

## Decisions Made

See the `key-decisions` frontmatter. The two a reader of 10-05 needs:

- **The six Scenario titles are a contract, not a naming choice.** They are listed verbatim above and marked FIXED in a comment at each fixture, naming 10-05 as the reason. 10-05 should copy them rather than re-derive them.
- **The in-body `assert.strictEqual(sharedBuilds, 1)` is 10-05's actual signal.** It is the first statement in the shared block's step body specifically so that the build-count claim surfaces as those three test nodes' pass/fail status. 10-05 does not need a side channel for the counter, and the pattern map warned against inventing one.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `node_modules` absent in the fresh worktree**

- **Found during:** setup, before Task 1
- **Issue:** `pnpm test` failed with `sh: vitest: command not found` — this worktree was created without an install, so no gate could run at all.
- **Fix:** `pnpm install --frozen-lockfile`. **No package was added, no manifest changed, and `pnpm-lock.yaml` is untouched** — this restores the already-declared dependency set from the committed lockfile, so the package-manager carve-out on Rule 3 (which exists to stop slopsquatted or hallucinated package names being installed or substituted) does not apply. Threat T-10-03-SC holds.
- **Files modified:** none tracked — `git status --short` was empty after the install.
- **Verification:** baseline `pnpm test` then reported 744 passed | 3 skipped (747), matching 10-02-SUMMARY's recorded closing count exactly, which independently confirms the install reproduced the intended dependency set.
- **Committed in:** n/a — no tracked file changed.

**2. [Rule 3 - Blocking] Both Task 2 `Layer.effect` bodies failed oxlint `require-yield`**

- **Found during:** Task 2
- **Issue:** `pnpm lint` failed with two `This generator function does not have 'yield'` errors. Task 2's two build effects only increment a counter and return — there is nothing to await, unlike Task 1's Layer, which yields `Ref.make`. The plan mandates `Layer.effect` (correctly: only the effectful constructor has a build-time body to count in), so satisfying the lint by switching to `Layer.succeed` would have destroyed the measurement.
- **Fix:** Added `yield* Effect.void` as the first statement of each body — this file's own established `require-yield` satisfaction idiom, already used by every assertion-only step body in it. A comment at the first occurrence records why `Layer.effect` is still the right constructor despite having nothing to await, so the pair does not get "tidied" into `Layer.succeed` later.
- **Files modified:** `packages/vitest/test/emission.test.ts`
- **Verification:** `pnpm lint` exit 0; `pnpm test` count unchanged at 759 before and after, confirming the added yield changed no timing — `Effect.gen` defers the body either way, so the increment still happens at build time.
- **Committed in:** `adc77bb` (the Task 2 commit).

**3. [Rule 1 - Bug] Predicted mutation output corrected to observed output**

- **Found during:** Task 2
- **Issue:** The block header was drafted with the plan's *predicted* mutation results before the mutations were run. Two predictions were wrong: mutation (i) produces 7 failures and a count of `0` (not 5 and 2/3/4), and mutation (ii) leaves Scenario one passing and `collisionWinners` green. A committed comment asserting numbers nobody measured is precisely the "says something that isn't true" defect AGENTS.md §4 forbids, and it would have been read as evidence by the next person.
- **Fix:** Ran all three mutations, then rewrote the header to the observed output, including the two explanations that make the differences informative rather than noise (why the shared count is `0` under Anti-Pattern 3; why Scenario one passing is the defect's signature and why three Scenarios are therefore the minimum).
- **Files modified:** `packages/vitest/test/emission.test.ts`
- **Verification:** every figure in the header and in this summary is copied from a recorded run; each mutation was reverted and the suite returned to 759 passed.
- **Committed in:** `adc77bb` (the Task 2 commit).

---

**Total deviations:** 3 auto-fixed (3 blocking/bug, 0 architectural)
**Impact on plan:** No scope creep. Deviation 1 changed no tracked file; deviation 2 was required to make the plan's own prescribed constructor pass the lint gate; deviation 3 corrected comment text to match measurements. `spec/` is untouched, deliberately — see `key-decisions`.

## Issues Encountered

- The plan's Task 1 test-count criterion (+7) assumed warning nodes that a well-formed fixture does not emit. Reconciled explicitly above rather than by editing the criterion, per the criterion's own instruction.
- Mutation I's first run produced `[1, 1]` rather than the plan's `[1, 1, 1]`, because Scenario two aborts at the state assertion before pushing. Resolved by running a second, narrower sub-mutation that isolates the ordinals assertion — which both reproduced the plan's stated figure and established the stronger property that the two assertions fail independently.

## User Setup Required

None — no external service configuration required. This plan installs no package and adds no dependency to any manifest; the `pnpm install --frozen-lockfile` above restored the already-committed dependency set and `pnpm-lock.yaml` is unmodified (threat T-10-03-SC).

## Next Phase Readiness

**Ready for 10-04 and 10-05.** Roadmap Phase 10 Success Criterion 1 (default path: N Scenarios, N builds, state not carried across) and Success Criterion 2 (shared path: N Scenarios, 1 build) are both proven in process by committed, mutation-tested assertions that run on every push.

What remains, and who owns it:

- **10-05's real-CLI gate** is the other half of D-02, and 10-CONTEXT.md says plainly that both checks are wanted, not one instead of the other. It should target `packages/vitest/test/emission.test.ts` (the pattern map's recommendation (a), reusing this file rather than inventing a second CLI-target convention) and assert the six titles above by exact suffix match, in an unfiltered run and again under `-t` narrowed to a single Scenario. Success Criterion 3 — identical results whole vs. filtered — is the claim only that run can make; nothing in this plan filters anything.
- **10-04's Rule-under-`shared` block** (D-03) is untouched here. 10-02's constraint still stands: an extra Layer composed against the per-Scenario tier alone leaves a shared-service dependency on its `RIn`, satisfied ambiently by the `layer(...)` context.
- **10-06 owns the status flips.** RUN-03 and RUN-04 stay Pending in `.planning/REQUIREMENTS.md`; `spec/invariants.md`'s INV-EC-002 entry still says its `shared` clause "waits on Phase 10", and `spec/roadmap.md` still governs build status. This plan deliberately edited none of them.

Constraints later plans must respect:

- **The six Scenario titles are load-bearing outside this file.** Rename in both places or not at all.
- **`sharedBuilds`/`scopedBuilds` and their arrays are this block's alone.** Each block in `emission.test.ts` brings its own counters (T-10-03-05); reusing these from a new block would make one block's assertion depend on another's arrangement.
- **Do not "simplify" the `[1, 2, 3]` scoped-ordinals assertion away.** It looks redundant beside `[1, 1, 1]` and is the only thing in the repo that catches a fix which memoises both tiers (T-10-03-02).
- **Do not replace either `Layer.effect` with `Layer.succeed`.** Both carry a `yield* Effect.void` that reads as removable; removing the constructor removes the build-time body the whole measurement depends on. That is mutation I, and it turns the block red for the right reason.

## Self-Check: PASSED

- `packages/vitest/test/emission.test.ts` verified present on disk and modified (405 insertions across the two task commits).
- `.planning/phases/10-layer-scopes-per-scenario-default-shared/10-03-SUMMARY.md` verified present on disk.
- Both commit hashes (`37030ac`, `adc77bb`) verified present in `git log`.
- `packages/vitest/src/describeFeature.ts` verified byte-identical to its pre-mutation state (`git diff` empty after mutations (i) and (ii)).
- No file deleted by either commit (`git diff --diff-filter=D` empty for both).
- `STATE.md` and `ROADMAP.md` not modified — the orchestrator owns those writes.

---
*Phase: 10-layer-scopes-per-scenario-default-shared*
*Completed: 2026-08-30*

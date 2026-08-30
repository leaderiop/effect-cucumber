---
phase: 10-layer-scopes-per-scenario-default-shared
plan: 04
subsystem: testing
tags: [typescript, effect, layer, effect-vitest, testclock, testconsole, mutation-testing, gherkin, memoization]

# Dependency graph
requires:
  - phase: 10-layer-scopes-per-scenario-default-shared
    provides: "plan 10-02's `sharedLayerTestApi`, the `layer(..., { excludeTestServices: true })` branch, the module-scope `testEnv` and the `Layer.provideMerge(featureLayer)(extraLayer)` narrowing whose `RIn` consequence this plan is the first committed assertion of"
  - phase: 10-layer-scopes-per-scenario-default-shared
    provides: "plan 10-03's two build-count blocks — the structural precedent these two copy (own counters, own services, one real `describeFeature`, a trailing reader block, fixed Scenario titles)"
  - phase: 08-rules-and-rule-scoped-layers
    provides: "`emission.test.ts`'s `Rule composition` block — the three-tier/derived-value/nesting-name argument Task 2 applies one tier up, and ADR-EC-010's per-Scenario Rule scope"
provides:
  - "the FIRST committed assertion that a `shared` Layer does not leak `TestClock` state across Scenarios (ADR-EC-018, BEH-EC-012's shared-path clause)"
  - "the FIRST committed assertion of the `TestConsole` half of RUN-04, via `effect/testing/TestConsole`'s `logLines`, with its own non-vacuity control"
  - "`clockReadings` — `[0, 0, 0, 0]`, three of them read AFTER a preceding Scenario advanced the clock an hour"
  - "the D-03 regression block: a `Rule`'s `extraLayer` under a `shared` Feature, `ruleSharedOrdinals` `[1, 1]` against `ruleExtraOrdinals` `[1, 2]`"
  - "`ruleNetPrices` — the first committed proof of plan 10-02's `RIn` claim, that a Rule Layer's shared dependency is satisfied by the ambient `layer(...)` context"
  - "six more FIXED Scenario titles (four Scenarios plus one Rule name) that plan 10-05's CLI gate asserts on by exact suffix match"
  - "the memo-map finding: `Effect.provide` forks `layer(...)`'s `CurrentMemoMap`, so build counts on the shared path track Layer OBJECT IDENTITY, not composition shape"
affects: [10-05, 10-06]

actuals:
  tokens: 8889
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Prove a per-test isolation claim with an ORDERED array of readings across N Scenarios, exactly one of which mutates the shared thing — order is load-bearing, so the reader compares a sequence rather than a set"
    - "Pair every isolation assertion with a NON-VACUITY CONTROL in the same step body: assert the capture is empty, then write to it and assert it is not. An accessor that always returned nothing satisfies the first line forever"
    - "When a mutation turns NOTHING red, do not record the assertion as proven — escalate to a second mutation that defeats the mechanism absorbing the first, and record both. An assertion no mutation can move is not yet known to assert anything"
    - "Read the installed package's own `.d.ts`/`dist` before deciding a capability is absent — the plan's fallback (an honest structural argument) was NOT needed because `logLines` exists"

key-files:
  created: []
  modified:
    - packages/vitest/test/emission.test.ts

key-decisions:
  - "The `TestConsole` half of RUN-04 is ASSERTED, not argued. `effect@4.0.0-rc.112` exports `logLines`, so the plan's fallback (a structural argument from the shared `Layer.mergeAll`) was unnecessary — and mutation iv later showed that fallback would have been WRONG, because the console and the clock are guarded by different halves of ADR-EC-018's fix."
  - "`excludeTestServices: true` and the per-emission `Effect.provide(testEnv)` are BOTH necessary, and necessary for DIFFERENT services. Mutation iv (drop the option) leaks only the console; mutation v (hoist the provide) leaks only the clock. Neither half of the ADR's fix is redundant, which nothing in the repo knew before this plan."
  - "`ruleSharedOrdinals` `[1, 1]` tracks Layer object identity, not composition shape. Mutation vi — composing the Rule's `extraLayer` onto the shared tier as well — changed nothing, because `Effect.provide` forks the memo map `layer(...)` left ambient and the shared Layer is the same object. Recorded as a stated LIMIT on the assertion rather than left as an unexamined green."
  - "Mutation vi-b (`Layer.fresh` on the shared tier) was added, unplanned, because an assertion that no mutation can turn red is not yet known to assert anything. It fails 5 tests, which is what makes `[1, 1]` a real build-count claim."
  - "`spec/` is deliberately UNTOUCHED. This plan changes no public behavior — it adds assertions about behavior 10-02 already shipped — and 10-06 owns the status flips. AGENTS.md §1 binds code changes to spec changes; there is no code change here."
  - "RUN-04 and RUN-03 stay Pending. This is the in-process half; 10-05's real-CLI gate is the other half of 10-CONTEXT.md's D-02, and 10-06 owns the requirement flip. Same call as 10-01, 10-02 and 10-03."

patterns-established:
  - "Isolation proof by ordered readings: N Scenarios, exactly ONE mutation of the shared thing, and an exact-array comparison of what each Scenario observed at its own start"
  - "Non-vacuity control inside the isolation assertion itself — assert-empty then write-then-assert-present, so an instrumentation failure cannot masquerade as isolation"
  - "Escalating mutation: when the planned mutation is absorbed by a mechanism (here, memo-map identity), run a second mutation that defeats that mechanism and record BOTH — the pair says what the assertion does and does not see"
  - "Cross-tier derived value plus build ordinal, asserted side by side: the derived value proves the tiers composed, the ordinal proves how often each built, and mutation vii shows neither substitutes for the other"

requirements-completed: []

coverage:
  - id: D1
    description: "On the `shared` path, a Scenario that runs after another Scenario advanced the simulated clock by an hour still reads it at 0 (ADR-EC-018, BEH-EC-012's shared-path clause, roadmap SC #3's in-process half)"
    requirement: RUN-04
    verification:
      - kind: unit
        ref: "packages/vitest/test/emission.test.ts#Shared clock isolation > the second shared clock scenario still starts at time zero (and the third and fourth)"
        status: pass
      - kind: unit
        ref: "packages/vitest/test/emission.test.ts#a shared Layer keeps every Scenario its own TestClock and TestConsole (10-04) > started all four Scenarios at time zero, …"
        status: pass
      - kind: other
        ref: "mutation v — the per-emission `Effect.provide(testEnv)` hoisted into the shared tier; 5 fail, three Scenarios reading 3600000. Recorded below with exact output"
        status: pass
    human_judgment: false
  - id: D2
    description: "A step MUST be able to advance the simulated clock deterministically — BEH-EC-012's second clause, which an isolation-only test would leave unproven"
    requirement: RUN-04
    verification:
      - kind: unit
        ref: "packages/vitest/test/emission.test.ts#Shared clock isolation > the first shared clock scenario advances the test clock by one hour (in-body `assert.strictEqual(after, 3_600_000)`)"
        status: pass
    human_judgment: false
  - id: D3
    description: "On the `shared` path each Scenario gets its OWN `TestConsole` — output captured in one Scenario is not visible in the next"
    requirement: RUN-04
    verification:
      - kind: unit
        ref: "packages/vitest/test/emission.test.ts#Shared clock isolation > the fourth shared clock scenario gets its own test console"
        status: pass
      - kind: other
        ref: "mutation iv — `excludeTestServices: true` removed; this Scenario is one of only two failures repo-wide, on `expected [ Array(1) ] to deeply equal []`"
        status: pass
    human_judgment: false
  - id: D4
    description: "A `Rule`'s own `extraLayer` under a `shared` Feature builds once per Scenario in that Rule, while the Feature's `shared` Layer stays at exactly one build for the whole run (10-CONTEXT.md D-03)"
    requirement: RUN-03
    verification:
      - kind: unit
        ref: "packages/vitest/test/emission.test.ts#a Rule's own extraLayer under a shared Feature rebuilds only the Rule tier (10-04) > rebuilt the Rule's own extraLayer once per Scenario in the Rule"
        status: pass
      - kind: unit
        ref: "packages/vitest/test/emission.test.ts#… > gave both Rule Scenarios the SAME single shared build"
        status: pass
      - kind: unit
        ref: "packages/vitest/test/emission.test.ts#Shared rule composition > … > the second rule scenario under a shared feature rebuilds only the rule tier (in-body `assert.strictEqual(sharedCatalogBuilds, 1)`)"
        status: pass
      - kind: other
        ref: "mutation vii — hardcoded `Layer.succeed`; EXACTLY 1 fails, the ordinal assertion, while the derived-value assertion stays green"
        status: pass
      - kind: other
        ref: "mutation vi-b — `Layer.fresh(sharedLayer)` merged into the Rule's tier; 5 fail, establishing `[1, 1]` is a real build-count assertion"
        status: pass
    human_judgment: false
  - id: D5
    description: "A `Rule`'s `extraLayer` that DEPENDS on a service the `shared` tier provides resolves correctly at run time — plan 10-02's `RIn` claim, previously measured in a deleted probe and asserted nowhere"
    requirement: RUN-03
    verification:
      - kind: unit
        ref: "packages/vitest/test/emission.test.ts#a Rule's own extraLayer under a shared Feature rebuilds only the Rule tier (10-04) > computed the Rule tier's price from the SHARED tier's, in both Scenarios"
        status: pass
    human_judgment: false
  - id: D6
    description: "On the shared path the Rule's name nests BETWEEN the Feature's and the Scenario's, and neither new block can pass vacuously by emitting nothing (T-10-04-05, T-10-03-03)"
    verification:
      - kind: unit
        ref: "packages/vitest/test/emission.test.ts#… > emitted both Scenarios under the Feature AND under the Rule"
        status: pass
      - kind: unit
        ref: "packages/vitest/test/emission.test.ts#… > emitted and ran all four Scenarios, each nested under the Feature"
        status: pass
      - kind: other
        ref: "both name readers went red under mutations iv, v, vi-b and (the four-name one) under iv — an emit-nothing implementation is caught"
        status: pass
    human_judgment: false
  - id: D7
    description: "The four new blocks' Scenarios emit no tags and do not disturb the Phase 9 tag gate that runs this same file"
    verification:
      - kind: e2e
        ref: "pnpm verify:tags-filter — 9 assertions, exit 0"
        status: pass
    human_judgment: false

# Metrics
duration: 14min
completed: 2026-08-30
status: complete
---

# Phase 10 Plan 04: `TestClock`/`TestConsole` isolation and `Rule` × `shared` Summary

**A `shared` Layer now provably costs no Scenario its own `TestClock` or `TestConsole` — four Scenarios, one clock advance, all four reading 0 — and D-03's untested `Rule`-under-`shared` combination has a real run behind it at `[1, 1]` shared builds against `[1, 2]` Rule builds, with the two mutations that were supposed to prove ADR-EC-018 revealing instead that its two halves guard two DIFFERENT services.**

## Performance

- **Duration:** ~14 min
- **Started:** 2026-08-30T03:44:00Z
- **Completed:** 2026-08-30T03:58:00Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- **The gap 10-02 and 10-03 both flagged is closed.** 10-02's summary marked D2 (`TestClock` isolation on the shared path) `human_judgment: true` because it was measured by a probe that was then deleted; 10-03 left it to this plan by name. Four Scenarios now assert it on every push.
- **The `TestConsole` half of RUN-04 is asserted, not argued.** The plan allowed an honest structural fallback if `effect@4.0.0-rc.112` exposed no per-test accessor. It exposes `logLines`, so the fallback was not taken — and mutation iv then showed the fallback's reasoning would have been *false*.
- **Two halves of ADR-EC-018 turn out to guard two different services.** Dropping `excludeTestServices: true` leaks the CONSOLE and not the clock; hoisting the per-emission `Effect.provide(testEnv)` leaks the CLOCK and not the console. Nothing in the repo knew this; it is now written at the arrangement.
- **D-03 is closed.** A `Rule` with its own `extraLayer` inside a `shared` Feature: the Rule's Layer builds twice for two Scenarios, the Feature's shared Layer stays at one build for the whole run, and the Rule's Layer computes its value FROM a shared service — the first committed assertion of plan 10-02's `RIn` claim.
- **A memo-map finding that changes how build counts should be reasoned about on this path**, arrived at from two directions (mutations iv and vi) and traced to `effect`'s and `@effect/vitest`'s own source rather than guessed.
- All plan gates exit 0, plus `build`, `verify:testapi-seam`, `verify:spec` and `circular`.

## Task Commits

1. **Task 1: RUN-04 — a `shared` Layer never costs a Scenario its own `TestClock`** — `7ef5d14` (test)
2. **Task 2: D-03 — a `Rule`'s own `extraLayer` under a `shared` Feature** — `088961b` (test)

## Files Created/Modified

- `packages/vitest/test/emission.test.ts` — two new blocks appended after plan 10-03's two, each with its own service classes, its own counters and its own reader block; four new imports (`effect/Clock`, `effect/Console`, `effect/testing/TestClock`, `effect/testing/TestConsole`); block-local mutation records for iv, v, vi, vi-b and vii; and a pointer plus the memo-map finding added to the file's own header. 576 insertions across the two task commits.

`packages/vitest/src/describeFeature.ts` was mutated four times and reverted four times; `git diff` on it is empty and every gate that reads it passes.

## The six Scenario titles, verbatim — for plan 10-05

Plan 10-05's real-CLI gate asserts on these by exact suffix match. **Copy them from here; do not re-derive them.**

Feature `Shared clock isolation`, uri `test/shared-clock-isolation.feature`:

1. `the first shared clock scenario advances the test clock by one hour`
2. `the second shared clock scenario still starts at time zero`
3. `the third shared clock scenario still starts at time zero and shares one build`
4. `the fourth shared clock scenario gets its own test console`

Feature `Shared rule composition`, uri `test/shared-rule-composition.feature`, Rule `discounted checkout under a shared catalog`:

5. `the first rule scenario under a shared feature reads both tiers`
6. `the second rule scenario under a shared feature rebuilds only the rule tier`

Titles 2, 3 and 4 are the ones 10-05's `-t` comparison actually needs: they are the Scenarios whose result changes if filtering changes which Scenario runs first against the shared clock, which is the failure mode ADR-EC-018 names. Title 6 carries the in-body `sharedCatalogBuilds === 1` assertion, so its pass/fail status is the shared-build claim as a reporter field.

## The `TestConsole` export list, and the decision it drove

Read from `node_modules/.pnpm/effect@4.0.0-rc.112/node_modules/effect/dist/testing/TestConsole.d.ts` before writing the console half:

| Export | Kind |
|---|---|
| `TestConsole` | `interface` extending `Console.Console` |
| `TestConsole` | `namespace` |
| `make` | `Effect<TestConsole, never, never>` |
| `testConsoleWith` | `<A, E, R>(f: (console: TestConsole) => Effect<A, E, R>) => Effect<A, E, R>` |
| `layer` | `Layer<TestConsole>` |
| **`logLines`** | **`Effect<ReadonlyArray<unknown>, never, never>`** |
| `errorLines` | `Effect<ReadonlyArray<unknown>, never, never>` |

`logLines` is `testConsoleWith((console) => console.logLines)`, and `console.logLines` reads the `entries` array closed over by the `TestConsole` instance the ambient context currently carries. That is exactly a per-test accessor, so **the plan's fallback branch was not taken and the console half is asserted.**

Scenario four makes TWO assertions rather than one:

```ts
assert.deepStrictEqual(yield* TestConsole.logLines, [])            // isolation
yield* Console.log(fourthConsoleMarker)
assert.deepStrictEqual(yield* TestConsole.logLines, [fourthConsoleMarker])  // non-vacuity
```

Without the second line, an accessor that always returned `[]` — or a console that captured nothing at all — would satisfy the isolation claim forever.

**The fallback would have been actively wrong, and that is the more important finding.** The plan's proposed structural argument was that "`TestConsole.layer` is a member of the same per-emission `testEnv` blueprint the `TestClock` half is proven through, and the two are built by the same `Layer.mergeAll` call so they cannot diverge." Mutation iv shows they **do** diverge: under one mutation the console leaks and the clock does not. Being in the same `Layer.mergeAll` call is not sufficient, because memoisation keys on each Layer's own object identity and the two halves have different identity relationships to the framework's own `TestEnv`.

## The four planned mutation proofs, plus one unplanned — all performed, run, and reverted

### Task 1 — mutation iv: `excludeTestServices: true` removed from `describeFeature.ts`'s `layer(...)` call

**2 failed | 760 passed | 3 skipped (765)**, `Test Files 1 failed | 31 passed` — both this block's:

```
FAIL  Shared clock isolation > the fourth shared clock scenario gets its own test console
      AssertionError: expected [ Array(1) ] to deeply equal []
      + [ "first-shared-clock-scenario-marker" ]
FAIL  a shared Layer keeps every Scenario its own TestClock and TestConsole (10-04) >
      emitted and ran all four Scenarios, each nested under the Feature
      AssertionError: expected [ …(3) ] to deeply equal [ …(4) ]
```

**The plan predicted Scenarios two and three going red on 3600000. They did not — they still read 0. The CONSOLE leaked and the CLOCK did not.**

Traced to source rather than guessed:

- `@effect/vitest@4.0.0-rc.112`, `dist/internal/internal.js` line 34: `const TestEnv = Layer.mergeAll(TestConsole.layer, TestClock.layer())`.
- `effect@4.0.0-rc.112`, `Layer.ts` line 762: `buildWithMemoMap` ADDS its `MemoMap` into the context it returns (`Context.add(CurrentMemoMap, memoMap)`).
- `internal.js` line 204-ish: each test runs as `effect.pipe(Effect.scoped, Effect.provide(context))`, so the per-emission `Effect.provide(testEnv)` executes INSIDE a fiber whose context carries that map.
- `Layer.ts` line 806: `Layer.build` resolves `CurrentMemoMap.forkOrCreate(fiber.context)` — a FORK of the existing map, retaining every entry already built.

Layers are memoised by object **identity**. `TestConsole.layer` is a module-level constant, so `describeFeature.ts`'s `testEnv` references the *same object* the framework's `TestEnv` does → a memo **hit**, returning the already-built console. `TestClock.layer` is a **function**, so `TestClock.layer()` here and `TestClock.layer()` there are two distinct objects → a memo **miss**, and a genuinely fresh clock.

Confirmed directly, with the mutation still in place: wrapping the console half in `Layer.fresh(TestConsole.layer)` returned the suite to **762 passed**. That probe was reverted too.

**Consequence, now written at the arrangement:** `excludeTestServices: true` is load-bearing for the console, and the clock half survives its removal only by the accident that `TestClock.layer` is a function rather than a constant. If a future `effect` release makes it a constant — the obvious tidy-up, since `TestConsole.layer` already is one — removing that option would silently reintroduce the exact clock leak ADR-EC-018 exists to prevent. Scenario four is what stands between that change and a green suite.

### Task 1 — mutation v: the per-emission `Effect.provide(testEnv)` hoisted into the shared tier

`sharedLayerTestApi`'s `effect` member reduced to `sharedIt.effect(name, () => self(), emitOptions)`, with `layer(Layer.merge(sharedTier, testEnv), { excludeTestServices: true })` supplying one built `TestEnv` for every emission.

**5 failed | 757 passed | 3 skipped (765)**, `Test Files 1 failed | 31 passed` — all five this block's:

```
FAIL  Shared clock isolation > the second shared clock scenario still starts at time zero
FAIL  Shared clock isolation > the third shared clock scenario still starts at time zero and shares one build
FAIL  Shared clock isolation > the fourth shared clock scenario gets its own test console
      AssertionError: expected 3600000 to equal +0        (all three)
FAIL  … > started all four Scenarios at time zero, including the three that ran after the one-hour advance
      AssertionError: expected [ +0 ] to deeply equal [ +0, +0, +0, +0 ]
FAIL  … > emitted and ran all four Scenarios, each nested under the Feature
      AssertionError: expected [ Array(1) ] to deeply equal [ …(4) ]
```

`3600000` is ADR-EC-018's leak reproduced exactly. The readings array holds one entry because Scenarios two, three and four abort at their first assertion before pushing.

**Read with mutation iv, the pair says what neither says alone:** the per-emission provide delivers the clock isolation, `excludeTestServices: true` keeps the console out of the shared memo map, and both halves of the ADR's fix are necessary for *different* services.

### Task 2 — mutation vi: the Rule's `extraLayer` composed onto the shared tier as well

`Layer.provideMerge(sharedLayer === null ? featureLayer : Layer.merge(featureLayer, sharedLayer))(extraLayer)`.

**NOTHING went red — 768 passed, identical to unmutated.**

The plan predicted `ruleSharedOrdinals` becoming `[1, 2]`. It is the same memo-map mechanism as mutation iv: `sharedLayer` here is the same object `layer(...)` already built, so merging it into the Rule's provide is a memo hit, not a rebuild. Recorded rather than smoothed over, because it is a real **limit** on what that assertion can see: the composition change plan 10-02 made is guarded by `verify:testapi-seam` and by `ruleNetPrices`, **not** by the shared build count, and anyone reading `[1, 1]` as proof that the tiers stayed structurally separate is reading more into it than it says.

### Task 2 — mutation vi-b (UNPLANNED): the same change with the memoisation defeated

`Layer.merge(featureLayer, Layer.fresh(sharedLayer))`. Run because mutation vi left `ruleSharedOrdinals` unproven, and an assertion no mutation can turn red is not yet known to assert anything.

**5 failed | 763 passed | 3 skipped (771)**, all this block's:

```
FAIL  Shared rule composition > … > the second rule scenario under a shared feature rebuilds only the rule tier
      AssertionError: expected 3 to equal 1
FAIL  … > gave both Rule Scenarios the SAME single shared build
      AssertionError: expected [ 2 ] to deeply equal [ 1, 1 ]
FAIL  … > rebuilt the Rule's own extraLayer once per Scenario in the Rule
      AssertionError: expected [ 1 ] to deeply equal [ 1, 2 ]
FAIL  … > computed the Rule tier's price from the SHARED tier's, in both Scenarios
      AssertionError: expected [ 90 ] to deeply equal [ 90, 90 ]
FAIL  … > emitted both Scenarios under the Feature AND under the Rule
      AssertionError: expected [ Array(1) ] to deeply equal [ …(2) ]
```

Scenario ONE already reads shared ordinal `2`, because the Rule's provide rebuilds the catalog before that Scenario's first step runs — unlike 10-03's mutations, this one does not spare the first Scenario. So `[1, 1]` **is** a real build-count assertion; what mutation vi establishes is only that Layer identity, not composition shape, is what the count tracks.

### Task 2 — mutation vii: the Rule's `extraLayer` replaced by a hardcoded `Layer.succeed`

```ts
const ruleDiscountLayer = Layer.succeed(
  RuleDiscount,
  RuleDiscount.of({ netPrice: 90, buildOrdinal: (ruleDiscountBuilds += 1) })
)
```

**1 failed | 767 passed | 3 skipped (771)** — exactly one, and it is the ordinal assertion, exactly as the plan predicted:

```
FAIL  a Rule's own extraLayer under a shared Feature rebuilds only the Rule tier (10-04) >
      rebuilt the Rule's own extraLayer once per Scenario in the Rule
      AssertionError: expected [ 1, 1 ] to deeply equal [ 1, 2 ]
```

`ruleNetPrices` stays `[90, 90]` and passes. **That is the whole argument for keeping the build-ordinal assertion beside the derived-value one rather than folding them together (T-10-04-04):** a derived value proves the tiers composed and says nothing about how often either built.

**Every mutation reverted.** `git diff` on `packages/vitest/src/describeFeature.ts` is empty; `pnpm verify:testapi-seam` and `pnpm build` both exit 0 afterwards.

## `pnpm test` counts at each task boundary, reconciled

| | Test Files | Tests | Delta |
|---|---|---|---|
| Before this plan | 32 passed (32) | 756 passed \| 3 skipped (759) | — |
| After Task 1 | 32 passed (32) | 762 passed \| 3 skipped (765) | **+6** |
| After Task 2 | 32 passed (32) | 768 passed \| 3 skipped (771) | **+6** |

Task 1: 4 Scenario nodes + 2 reader `it` blocks = 6. Task 2: 2 Scenario nodes + 4 reader `it` blocks = 6. Zero warning nodes in either — every step definition in both new Features is used by a Scenario, so ADR-EC-019's unused-pattern warning never fires. The opening count matches 10-03-SUMMARY's recorded closing count exactly.

## Gate results

| Gate | Result |
|---|---|
| `pnpm test` | exit 0 — 768 passed \| 3 skipped (771) |
| `pnpm typecheck:test` | exit 0 — both `{ shared, perScenario }` calls compile under 10-01's narrowed overload |
| `pnpm lint` | exit 0 (oxlint + `dprint check`) |
| `pnpm verify:tags-filter` | exit 0 — 9 assertions; the new blocks emit no tags |
| `pnpm build` | exit 0 |
| `pnpm verify:testapi-seam` | exit 0 — `describeFeature.ts` fully reverted after four mutations |
| `pnpm verify:spec` | exit 0 |
| `pnpm circular` | exit 0 |

## Acceptance criteria

### Task 1

| Criterion | Required | Result |
|---|---|---|
| `grep -c 'shared-clock-isolation.feature'` | exactly 1 | **1** |
| `grep -c 'Scenario: the second shared clock scenario still starts at time zero'` | exactly 1 | **1** |
| `grep -c 'TestClock.adjust'` | exactly 1 | **1** |
| `grep -c 'from "effect/Clock"'` | exactly 1 | **1** |
| `grep -c 'TestClock.currentTimeMillis'` | 0 | **0** |
| `grep -c 'perScenario: Layer.empty'` | ≥ 1 | **2** |
| `pnpm test` exit 0, delta reconciled | yes | exit 0, **+6** = 4 Scenarios + 2 readers |
| `pnpm typecheck:test`, `pnpm lint` | exit 0 | both exit 0 |
| mutations iv and v recorded with exact readings; `TestConsole` export list recorded | yes | above |

### Task 2

| Criterion | Required | Result |
|---|---|---|
| `grep -c 'shared-rule-composition.feature'` | exactly 1 | **1** |
| `grep -c 'Rule: discounted checkout under a shared catalog'` | exactly 1 | **1** |
| `grep -c 'Scenario: the second rule scenario under a shared feature rebuilds only the rule tier'` | exactly 1 | **1** |
| `grep -c 'ruleSharedOrdinals'` | ≥ 2 | **8** |
| `grep -c 'ruleExtraOrdinals'` | ≥ 2 | **5** |
| `grep -c 'netPrice: catalog.listPrice - 10'` | exactly 1 | **2** — see deviation 2 |
| `pnpm test` exit 0, delta reconciled | yes | exit 0, **+6** = 2 Scenarios + 4 readers |
| `pnpm typecheck:test`, `pnpm lint` | exit 0 | both exit 0 |
| `pnpm verify:tags-filter` | exit 0 | exit 0 |
| mutations vi and vii recorded with the exact tests that went red | yes | above, plus unplanned vi-b |

The plan's two `must_haves.key_links` patterns were checked directly: `grep -c 'TestClock\.adjust'` = **1**, `grep -c 'Rule('` = **3** (08-07's plus this plan's plus one registrar reference). `grep -cE 'describeFeature\([a-zA-Z]+, \{ shared:'` = **3** and `grep -c 'parseFeature('` = **15** — every Feature in the file is still parsed from an inline template literal by the real parser.

## Decisions Made

See the `key-decisions` frontmatter. The three a reader of 10-05 or 10-06 needs:

- **Both halves of ADR-EC-018's fix are necessary, for different services.** The ADR itself presents them as one mechanical fix. They are two, and mutations iv and v separate them. 10-06's spec work should not describe `excludeTestServices: true` as merely enabling the explicit `TestEnv` provide.
- **Build counts on the shared path track Layer OBJECT IDENTITY.** `Effect.provide` forks `layer(...)`'s `CurrentMemoMap`, so a Layer that is the same object as one already built there is a memo hit no matter how it is composed. Any future prediction about what a composition change will do to a build count must start here.
- **The six Scenario titles are a contract, not a naming choice.** Listed verbatim above and marked FIXED in a comment at each fixture, naming 10-05 as the reason.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `node_modules` absent in the fresh worktree**

- **Found during:** setup, before Task 1
- **Issue:** this worktree was created without an install, so no gate could run at all.
- **Fix:** `pnpm install --frozen-lockfile`. **No package was added, no manifest changed, and `pnpm-lock.yaml` is untouched** — this restores the already-declared dependency set from the committed lockfile, so Rule 3's package-manager carve-out (which exists to stop slopsquatted or hallucinated package names being installed or substituted) does not apply. Threat T-10-04-SC holds. Same situation, same resolution, as 10-03's deviation 1.
- **Files modified:** none tracked — `git status --short` was empty after the install.
- **Verification:** baseline `pnpm test` reported 756 passed | 3 skipped (759), matching 10-03-SUMMARY's recorded closing count exactly.
- **Committed in:** n/a — no tracked file changed.

**2. [Rule 3 - Blocking] Task 2's derived-value criterion is unsatisfiable as literally written**

- **Found during:** Task 2
- **Issue:** `grep -c 'netPrice: catalog.listPrice - 10'` returning exactly 1 counts the **08-07 `Rule composition` block the plan itself told me to read and copy** — line 787 already contains that exact expression, because Task 2's fixture is deliberately its structural precedent one tier up. The literal count is therefore 2 and the criterion forbids following the plan's own `read_first` instruction. Same collision class as 10-02's deviation 2.
- **Fix:** applied the intent-preserving form, scoped to this block's own binding: `grep -c 'netPrice: catalog.listPrice - 10, buildOrdinal: ruleDiscountBuilds'` returns **1**. The criterion's intent — "the derived value is computed from the shared tier, not written down" — holds exactly, and mutation vii independently confirms the derivation is load-bearing.
- **Files modified:** none (a criterion correction, not a code change).
- **Verification:** both grep forms recorded in the Task 2 acceptance table.
- **Committed in:** n/a — recorded here.

**3. [Rule 1 - Bug] Mutation vi proved nothing, so an unplanned mutation vi-b was added**

- **Found during:** Task 2
- **Issue:** the plan's mutation (i) for Task 2 predicted `ruleSharedOrdinals` becoming `[1, 2]`. It changed **nothing** — 768 passed, identical to unmutated. Recording "mutation performed, nothing red" and moving on would have left `ruleSharedOrdinals` as an assertion with no evidence that it can fail, which is the exact vacuity T-10-04-03 exists to prevent and which this project's own culture treats as unfinished.
- **Fix:** ran a second mutation, `Layer.fresh(sharedLayer)`, which defeats the memo-map absorption and represents what a genuine per-Rule-Scenario rebuild looks like. 5 fail, all this block's. Both results are recorded in the source beside the assertion, with the mechanism traced to `effect`'s and `@effect/vitest`'s own source rather than guessed.
- **Files modified:** `packages/vitest/test/emission.test.ts` (the mutation record); `describeFeature.ts` mutated and reverted.
- **Verification:** `git diff` on `describeFeature.ts` empty; `pnpm verify:testapi-seam` and `pnpm build` exit 0.
- **Committed in:** `088961b` (the Task 2 commit).

**4. [Rule 1 - Bug] Predicted mutation output replaced by observed output, twice**

- **Found during:** Tasks 1 and 2
- **Issue:** the plan predicted mutation (i)/iv would turn Scenarios two and three red on 3600000, and mutation vi would turn `ruleSharedOrdinals` red. Both predictions are wrong. Committing a comment asserting numbers nobody measured is the "says something that isn't true" defect AGENTS.md §4 forbids, and it would have been read as evidence by the next person. 10-03's deviation 3 is the same finding one plan earlier.
- **Fix:** ran every mutation, then wrote the observed output into the block headers — including the two explanations that make the differences informative rather than noise (why the console leaks and the clock does not; why merging the shared tier into a Rule's provide is invisible to a build count).
- **Files modified:** `packages/vitest/test/emission.test.ts`
- **Verification:** every figure in both block headers and in this summary is copied from a recorded run; each mutation was reverted and the suite returned to 768 passed.
- **Committed in:** `7ef5d14` and `088961b`.

**5. [Rule 3 - Blocking] The `Number(...)` coercion the plan's `<interfaces>` block mandates is unnecessary**

- **Found during:** Task 1
- **Issue:** the plan states `Clock.currentTimeMillis` "yields a value that must be coerced with `Number(...)` before comparison". In `effect@4.0.0-rc.112` it is declared `Effect<number>` (`dist/Clock.d.ts` line 260), so the yielded value is already a `number` and `Number(...)` is a no-op wrapper around a value of the correct type.
- **Fix:** omitted the coercion and compared directly. Writing a redundant coercion would have implied a type fact that is not true of this build, which is the same class of untruth as deviation 4.
- **Files modified:** `packages/vitest/test/emission.test.ts`
- **Verification:** `pnpm typecheck:test` exit 0 with `assert.strictEqual(before, 0)` and `assert.strictEqual(after, 3_600_000)` comparing the yielded values directly; `pnpm lint` exit 0.
- **Committed in:** `7ef5d14`.

---

**Total deviations:** 5 auto-fixed (3 blocking, 2 bug/truthfulness; 0 architectural)
**Impact on plan:** No scope creep. Deviation 1 changed no tracked file; deviation 2 changed no code; deviation 3 added one unplanned mutation that made an otherwise unproven assertion proven; deviations 4 and 5 corrected comment and code text to match measurements. `spec/` is untouched, deliberately — see `key-decisions`.

## Issues Encountered

- **Two of the plan's four mutation predictions were wrong, and both were wrong for the same reason.** The memo-map fork behaviour is not documented anywhere in this repo and was not part of the planning research. It was traced to `effect`'s `Layer.ts` (lines 762, 806) and `@effect/vitest`'s `dist/internal/internal.js` (lines 34, 144, 204), then confirmed experimentally with a `Layer.fresh` probe, before anything was written down about it.
- **The plan's proposed `TestConsole` fallback argument would have been false.** It was not needed — `logLines` exists — but the reasoning it rested on ("the two are built by the same `Layer.mergeAll` call so they cannot diverge") is refuted by mutation iv. Recorded because a future reader might otherwise reach for the same argument.

## User Setup Required

None — no external service configuration required. This plan installs no package and adds no dependency to any manifest; `effect/Clock`, `effect/Console` and `effect/testing/*` are already-installed modules of already-declared peers, and `pnpm-lock.yaml` is untouched (threat T-10-04-SC).

## Next Phase Readiness

**Ready for 10-05 and 10-06.** Roadmap Phase 10 Success Criterion 3's in-process half is proven, and 10-CONTEXT.md's D-03 is closed.

What remains, and who owns it:

- **10-05's real-CLI gate** is the other half of D-02, and the half this plan structurally cannot supply: an in-process run cannot compare its own whole-run result against a `-t`-filtered one. It should target `packages/vitest/test/emission.test.ts` and assert the six titles above by exact suffix match, once unfiltered and once narrowed. Titles 2, 3 and 4 are the ones whose result changes under a filter that reorders which Scenario meets the clock first.
- **10-06 owns the status flips.** RUN-03 and RUN-04 stay Pending in `.planning/REQUIREMENTS.md`; `spec/invariants.md`'s INV-EC-002 entry and `spec/roadmap.md` are untouched here. When 10-06 updates ADR-EC-018's prose, it should record that the fix has **two** halves guarding two different services — the ADR currently reads as one mechanical change.

Constraints later plans must respect:

- **The six Scenario titles are load-bearing outside this file.** Rename in both places or not at all.
- **Do not delete Scenario four as redundant beside the clock Scenarios.** It is the only assertion in the repo that notices `excludeTestServices: true` going missing (mutation iv), and the clock assertions do not cover it.
- **Do not fold `ruleExtraOrdinals` into `ruleNetPrices`.** Mutation vii: a hardcoded `Layer.succeed` satisfies the derived value and fails only the ordinal.
- **Do not read `ruleSharedOrdinals` `[1, 1]` as proof the tiers stayed structurally separate.** Mutation vi is invisible to it. It proves the shared Layer was not REBUILT, which is a narrower claim.
- **Each block's counters are its own** (`clockSharedBuilds`, `sharedCatalogBuilds`, `ruleDiscountBuilds`). Reusing them from a new block would make one block's assertion depend on another's arrangement.
- **Do not replace any `Layer.effect` in these blocks with `Layer.succeed`.** Each carries a `yield* Effect.void` that reads as removable; removing the constructor removes the build-time body the whole measurement depends on. That is mutation vii.

## Self-Check: PASSED

- `packages/vitest/test/emission.test.ts` verified present on disk and modified (576 insertions across the two task commits).
- Both commit hashes (`7ef5d14`, `088961b`) verified present in `git log`.
- `packages/vitest/src/describeFeature.ts` verified byte-identical to its pre-mutation state — `git diff` empty after mutations iv, iv-probe, v, vi and vi-b.
- No file deleted by either commit (`git diff --diff-filter=D` empty for both).
- `STATE.md` and `ROADMAP.md` not modified — the orchestrator owns those writes.

---
*Phase: 10-layer-scopes-per-scenario-default-shared*
*Completed: 2026-08-30*

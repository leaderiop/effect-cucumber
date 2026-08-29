---
phase: 08-rule-and-scenario-outline
plan: 05b
subsystem: testing
tags: [typescript, effect, layer, dsl, scenario, rule, composition-root]

# Dependency graph
requires:
  - phase: 08-rule-and-scenario-outline
    provides: "08-03's two-signature ScenarioRegistrar<ROut> (the overloaded call signature this plan's one function has to satisfy)"
  - phase: 08-rule-and-scenario-outline
    provides: "08-05a's featureLayer binding, the Rule container's ruleAmbientLayer, and the two inline two-argument-only Scenario closures this plan replaces"
provides:
  - "makeScenarioRegistrar(ruleId, ambientLayer) — ONE Scenario container implementation shared by the Feature level and by every Rule, covering both call arities"
  - "scenarioKey(ruleId, name) — the composite key, mirroring packages/gherkin/src/Validate.ts's uniquenessKey (NUL separator, `<feature>` head)"
  - "FeatureCollection.scenarioLayers — ReadonlyMap<string, Layer> of each three-argument Scenario's fully merged effective Layer, sparse by design"
affects: [08-06, 08-07, 08-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Parameterise the differing ambient rather than duplicating a container closure per nesting level — the ambient Layer arrives as an argument, so composition nests automatically"
    - "A sparse side map whose ABSENCE is the contract: no entry means \"runs against its scope's ambient Layer unchanged\", because Effect gives no way to compare two Layers for equality"
    - "Reconstruct a module-private composite key in the test rather than exporting it, when the key ENCODING is the contract a later consumer will be written against"

key-files:
  created: []
  modified:
    - packages/vitest/src/describeFeature.ts
    - packages/vitest/test/describeFeature.test.ts

key-decisions:
  - "ONE arity-detecting factory taking (ruleId, ambientLayer) rather than two closures: the two call sites need identical behaviour, and duplication is exactly how the arity check, the combinator or the `finally` drifts on one level only — and the wrong level is whichever that day's test does not cover"
  - "`ambientLayer` is a PARAMETER, never a read of `featureLayer` — that single argument IS D-01's nesting rule, and passing `featureLayer` inside a Rule compiles and passes every Feature-level test while dropping the Rule's services for exactly the Scenarios that asked for a Layer of their own"
  - "The merge and the map write happen BEFORE pushScope/try, mirroring Rule's own ordering, so a Scenario whose define callback throws still resolves against the Layer it asked for"
  - "The two-argument form writes NOTHING — not `Layer.empty`. The absence is how a consumer tells the two forms apart without a Layer equality Effect does not offer"
  - "`scenarioKey` uses Validate.ts's NUL separator rather than the plan's literal space: `resolveRuleId`'s `unregistered-rule:${name}` sentinel carries an author-written Rule name and can contain any printable character, so a printable separator stops encoding the pair unambiguously"
  - "`scenarioKey` stays module-private and the TEST rebuilds it, because the key ENCODING is the contract 08-07 gets written against — a test that asked the implementation for its own key could not notice that encoding changing"

patterns-established:
  - "Probe an unfamiliar combinator's precedence empirically before asserting it: `Layer.provideMerge(ambient)(extra)` was run in a throwaway fixture and confirmed to resolve `extra` before the collision test was written"
  - "Every Layer claim settled by RESOLVING the merged Layer, never by its static shape — the file's own D-04 precedent, applied to provideMerge's two argument positions"

# Metrics
duration: 15min
completed: 2026-08-29
---

# Phase 8 Plan 05b: The Scenario-Scoped Extra Layer Summary

**`Scenario(name, extraLayer, define)` stops throwing at both nesting levels: one shared `makeScenarioRegistrar(ruleId, ambientLayer)` factory replaces 08-05a's two inline closures, merges the extra Layer onto whatever was ambient where the call was written, and records the fully merged result on `FeatureCollection.scenarioLayers`.**

## Performance

- **Duration:** ~15 min
- **Tasks:** 2
- **Files modified:** 2

## What Was Built

### Task 1 — `makeScenarioRegistrar`, `scenarioKey`, `scenarioLayers` (`171dd19`)

- **`scenarioKey(ruleId, name)`** at module scope in `packages/vitest/src/describeFeature.ts`, beside `resolveRuleId`. `${ruleId ?? "<feature>"}\u0000${name}` — `packages/gherkin/src/Validate.ts`'s `uniquenessKey` verbatim, and documented with that file's own argument: F22 makes Scenario names unique PER SCOPE only (`duplicate-scenario-name-across-rules.feature` is the executable proof), so a name-keyed map would let one Rule's Scenario silently overwrite another's entry and the loser would run against a Layer built for a different Scenario.
- **`scenarioLayers`** — a `Map<string, Layer>` declared beside `ruleLayers` in `collect`, same lifecycle: mutated by a container closure during `define(dsl)`, read only after it returns.
- **`makeScenarioRegistrar(ruleId, ambientLayer): ScenarioRegistrar<any>`** — one function covering both arities, told apart by whether the THIRD argument is present (the technique `describeFeature`/`collectFeature`'s own implementation signature already uses one level up), never by duck-typing the second argument's shape. The three-argument branch computes `Layer.provideMerge(ambientLayer)(extraLayer)` and writes it under `scenarioKey(ruleId, name)` BEFORE the `pushScope`/`try`/`finally` block, mirroring `Rule`'s ordering from 08-05a. Both branches then push `{ kind: "scenario", name, ruleId }`, run the define callback inside `try`, and pop in `finally`.
- **Both 08-05a closures deleted.** `dsl.Scenario` is now `makeScenarioRegistrar(null, featureLayer)`; the `Rule` member's `ruleScenarioRegistrar` const is gone and `RuleDsl.Scenario` is `makeScenarioRegistrar(ruleId, ruleAmbientLayer)`. Both stale comments naming this plan as the owner of the extension were removed with them.
- **`FeatureCollection.scenarioLayers`** added to the type and to `collect`'s return, REQUIRED and documented with the 08-07 invariant: an entry, when present, is the FULLY merged effective Layer for every row of that Scenario (an Outline's rows share one registration and therefore one entry), to be used as-is and never re-merged.

### Task 2 — D-01 Scenario-form composition tests (`6388f5e`)

Six new tests appended at the END of `packages/vitest/test/describeFeature.test.ts` (the `definedAt` test hard-codes its own line number, so nothing may be inserted above it — the same constraint 08-05a recorded), plus a `ScenarioMarker` service, a `scenarioMarkerBuiltOnRule` Layer with a non-`never` `RIn`, a second `Marker` implementation for the collision case, and `scenarioKeyIn`/`scenarioLayerOf` helpers:

- the Feature-level three-argument form's entry provides BOTH the Feature's `Marker` and the Scenario's own `ScenarioMarker`;
- `collection.layer` FAILS to provide `ScenarioMarker` while still providing `Marker` — the isolation half, INV-EC-005's argument one level down;
- the two-argument form used in the SAME collection produces exactly one key (the three-argument call's) and none of its own, AND still ran its define callback under its own scenario scope, so the arity branch suppresses the entry without swallowing the callback;
- a Scenario inside a Rule reaches all three tiers from one Layer — `"shared"`, `"rule A"`, and `"scenario on rule A"` — with the Scenario's own Layer BUILT on the Rule's service, plus assertions that the entry is keyed under the Rule's id and not under `<feature>`;
- the collision case resolves to `"scenario's own"` rather than the ambient `"shared"`, by RUNNING the merged Layer;
- a three-argument Scenario whose define callback throws still records its entry and still pops its scope.

## Verification

| Gate | Result |
| --- | --- |
| `pnpm build` | exit 0 |
| `pnpm lint` | exit 0 |
| `pnpm test` | 636 passed, 30 files |
| `pnpm typecheck:test` | exit 0 |
| `pnpm circular` | no cycles |

### Acceptance greps (Task 1, all pass)

| Grep | Required | Actual |
| --- | --- | --- |
| `const makeScenarioRegistrar` | 1 | 1 |
| `makeScenarioRegistrar(null, featureLayer)` | ≥1 | 1 |
| `makeScenarioRegistrar(ruleId, ruleAmbientLayer)` | ≥1 | 1 |
| `08-05b` | 0 | 0 |
| `scenarioLayers` | ≥3 | 6 |

### Mutation testing (all four performed, then reverted, all four confirmed failing)

| Mutation | Threat | Test that goes red |
| --- | --- | --- |
| `makeScenarioRegistrar(ruleId, featureLayer)` inside `Rule` | T-08-05b-02 | "reaches the Feature's, the Rule's and the Scenario's own service from one merged Layer" — `Service not found: RuleMarker` |
| `Layer.provideMerge(extraLayer)(ambientLayer)` (arguments swapped) | T-08-05b-01 | the collision test (`expected 'shared' to equal "scenario's own"`) and the three-tier test |
| the two-argument form records `Layer.empty` instead of nothing | T-08-05b-03 | "records no entry for the two-argument form, in the same collection that records one" |
| the merge/`set` moved AFTER `defineScenario(scenarioDsl)` | — | "records the entry even when the Scenario's define callback throws" |

`git status` was clean and the source file byte-identical to its committed state after every revert.

### Empirical precedence check

`Layer.provideMerge(ambient)(extra)` was run in a throwaway fixture (created, executed, deleted; never committed) and confirmed to resolve `extra` BEFORE the collision assertion was written, rather than assuming the documented precedence held in this Effect v4 beta. That is what must_haves truth 4 rests on.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `node_modules` absent in the worktree**

- **Found during:** Task 1 setup
- **Issue:** The parallel-execution worktree is a fresh checkout with no `node_modules`, so no gate could run. Identical to 08-05a's first deviation.
- **Fix:** `pnpm install --frozen-lockfile`. No manifest and no lockfile change — `git status` stayed clean afterwards.
- **Files modified:** none

**2. [Rule 2 - Correctness] `scenarioKey` uses a NUL separator, not the plan's literal space**

- **Found during:** Task 1
- **Issue:** The plan's `<interfaces>` block writes `` `${ruleId ?? "<feature>"} ${name}` `` (a space) while its own adjacent comment requires the key to mirror `Validate.ts`'s `uniquenessKey` "exactly" — and that function uses `\u0000`. With a printable separator the pair stops being unambiguously encoded the moment a `ruleId` contains one, which `resolveRuleId`'s `unregistered-rule:${name}` sentinel can: it carries an author-written Rule NAME. `Rule("a name no Rule: block in this Feature uses", …)` — a shape 08-05a's own test fixture already exercises — produces a sentinel containing spaces.
- **Fix:** `\u0000`, matching `Validate.ts` byte for byte and the plan's stated intent. No acceptance criterion constrains the separator. The test rebuilds the same encoding, so the key shape is pinned rather than assumed.
- **Files modified:** `packages/vitest/src/describeFeature.ts`
- **Commit:** `171dd19`

**3. [Rule 2 - Correctness] A sixth test the plan did not list**

- **Found during:** Task 2
- **Issue:** The plan's action requires the map write to happen BEFORE `define` runs, and the code comment states that property — but none of the four listed test cases could observe it, which is the "say only what is true" violation AGENTS.md §4 names.
- **Fix:** Added the throwing-define test, which also re-proves the `finally` pop for the new shared factory. Mutation 4 above is its behavioral proof.
- **Files modified:** `packages/vitest/test/describeFeature.test.ts`
- **Commit:** `6388f5e`

### Tooling note (not a code decision)

The `Edit`/`Write` tools transmit `\u0000` in a parameter as a RAW NUL byte rather than as the two-character escape, which silently turned `describeFeature.ts` into a binary file for `grep` and `diff` on the first write. Both occurrences (source and test) were converted to the literal `\u0000` escape sequence with `perl` and verified by grepping the resulting line. Anyone editing either `scenarioKey` or `scenarioKeyIn` should check the line is still text.

## Authentication Gates

None.

## Known Stubs

None introduced. `FeatureCollection.scenarioLayers` is populated but not yet CONSUMED — `Runner.ts` still threads only the Feature's flat `layer`/`hooks` into `buildScenarioEffect`, and that wiring is plan 08-07's, stated out of scope in this plan's objective exactly as 08-05a stated it for `ruleLayers`/`ruleHooks`.

## For the Next Plan

- **08-07** resolves a Scenario's effective Layer as `collection.scenarioLayers.get(scenarioKey(ruleId, astName)) ?? collection.ruleLayers.get(ruleId) ?? collection.layer`, in that order, and must use a hit AS-IS — the entry is already merged against its scope's ambient Layer, so re-merging rebuilds every ambient resource an extra time per Scenario while leaving every service reachable (nothing goes red).
- The lookup key is the AST node's OWN un-interpolated name (`ScenarioPlan` carries the interpolated Pickle name — `Runner.ts` note (d)), because a Scenario Outline's rows share ONE `Scenario(...)` registration and therefore one entry.
- `scenarioKey` is module-private in `describeFeature.ts` and cannot simply be imported by `Runner.ts`: that edge would close a cycle (`describeFeature` already imports `emitFeature`) and fail `pnpm circular`. 08-07 must either resolve the Layer on the `describeFeature.ts` side and pass the result down, or move the key helper to a leaf module both can import.

## Threat Flags

None. No new network endpoint, auth path, file access or schema change at a trust boundary; `pnpm-lock.yaml` and both manifests are unchanged (T-08-05b-SC is `n/a` as the plan recorded).

## Self-Check: PASSED

- `packages/vitest/src/describeFeature.ts` — FOUND
- `packages/vitest/test/describeFeature.test.ts` — FOUND
- `.planning/phases/08-rule-and-scenario-outline/08-05b-SUMMARY.md` — FOUND
- commit `171dd19` — FOUND
- commit `6388f5e` — FOUND

STATE.md and ROADMAP.md were deliberately NOT touched: this plan ran as a parallel worktree agent, and the orchestrator owns those writes after the wave merges.

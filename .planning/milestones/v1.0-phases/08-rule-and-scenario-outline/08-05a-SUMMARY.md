---
phase: 08-rule-and-scenario-outline
plan: 05a
subsystem: testing
tags: [typescript, effect, layer, dsl, rule, hooks, composition-root, gherkin]

# Dependency graph
requires:
  - phase: 08-rule-and-scenario-outline
    provides: "08-01's rule-aware Plan.ts isVisibleTo/scopeRank and Registry.ts's \"rule\" RegistryScopeKind + RegistryScope.ruleId"
  - phase: 08-rule-and-scenario-outline
    provides: "08-02's HookRegistry.register(kind, ruleId, body) three-argument signature and Hook.ts's mergeHookSets/emptyHookSet"
  - phase: 08-rule-and-scenario-outline
    provides: "08-03's RuleDsl<ROut>, FeatureDsl.Rule signature and the two-signature ScenarioRegistrar<ROut>"
provides:
  - "resolveRuleId(feature, name) — the ONLY place a Rule name becomes a ruleId, real or `unregistered-rule:` sentinel"
  - "FeatureDsl.Rule's runtime: Layer.provideMerge(featureLayer)(extraLayer), a \"rule\"-scope push/try/finally/pop, a Rule-own Background (D-04) and four Rule-scoped hook registrars (D-02)"
  - "FeatureCollection.ruleLayers — ReadonlyMap<string, Layer> of each Rule's merged ambient Layer"
  - "FeatureCollection.ruleHooks — ReadonlyMap<string, HookSet> of each Rule's own hooks"
  - "FeatureCollection.hooks now Feature-scope ONLY (ruleId === null filter)"
  - "featureLayer — the Feature's Layer normalised once per collect call, reused by every Rule merge and by the returned collection"
affects: [08-05b, 08-06, 08-07, 08-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Sentinel-over-null for an unresolvable identity, when null already carries a different meaning downstream (`unregistered-rule:${name}` vs Plan.ts's null = \"not in any Rule\")"
    - "Nested container closure at the composition root: a per-call `ruleId` closed over by a fresh RuleDsl, built from the SAME shared scenarioDsl/backgroundDsl objects the Feature level uses"
    - "Per-Rule side maps populated during define(dsl) and read only after it returns, keyed consistently so a consumer resolves Layer and hooks with one id"

key-files:
  created: []
  modified:
    - packages/vitest/src/describeFeature.ts
    - packages/vitest/test/describeFeature.test.ts

key-decisions:
  - "resolveRuleId's fallback is a colon-bearing sentinel, never null — Plan.ts compares ruleId by plain equality and reserves null for \"not nested in any Rule\", so a null would make an unresolved Rule's registrations visible to every Feature-level Scenario (a false green, since the steps DO resolve)"
  - "No counter or uniquifier on the sentinel: two unresolved calls sharing one bad name collide harmlessly, because both are equally and permanently invisible to every Scenario"
  - "normalizeLayer runs ONCE per collect call into a `featureLayer` binding, so every Rule's merged Layer and the returned collection.layer are the same value — a second normalizeLayer call at the return site would build a structurally identical Layer no Rule derived from, silently rebuilding a Feature-level resource"
  - "ruleHooks is keyed off ruleLayers.keys() rather than off the hook list, so a Rule that registered a Layer and no hooks gets an all-empty HookSet instead of an undefined a consumer must distinguish from \"no such Rule\""
  - "ruleLayers is a SEPARATE map, never folded into collection.layer — folding would make INV-EC-005's compile-time boundary decorative at runtime"
  - "The Rule's own Scenario stays a second inline two-argument-only closure (mirroring the Feature-level one) rather than being extracted now — 08-05b's plan explicitly replaces BOTH with its makeScenarioRegistrar factory and greps for zero remaining \"08-05b\" references"

patterns-established:
  - "Mutation-test every isolation claim: five mutations performed and reverted (merge-for-provideMerge, rule hooks registered at null, unfiltered Feature hooks, rule scope pushed with null ruleId, unresolved name attaching to the first Rule), each confirmed to fail a specific named test"
  - "A Layer test that discriminates provideMerge from merge must use an extraLayer with a non-never RIn — both combinators make both services reachable when the extra Layer needs nothing"

# Metrics
duration: 22min
completed: 2026-08-29
---

# Phase 8 Plan 05a: The Rule Container Summary

**`FeatureDsl.Rule` stops throwing and becomes the registration path 08-01/08-02/08-03 were each built for: a Rule name resolves to a real `ParsedRule.id` or to a provably inert sentinel, its `extraLayer` merges onto the Feature's via `Layer.provideMerge`, and every step, Background step and hook registered inside its callback carries that Rule's id.**

## Performance

- **Duration:** ~22 min
- **Tasks:** 2
- **Files modified:** 2

## What Was Built

### Task 1 — `resolveRuleId`, the Rule container, per-Rule Layer merge (`7f62971`)

- **`resolveRuleId(feature, name)`** at module scope in `packages/vitest/src/describeFeature.ts`. Matches by name against `feature.rules` and returns that `ParsedRule.id`; an unmatched name returns `unregistered-rule:${name}`. Documented at length: `Registry.ts` note (e) and `Plan.ts` note (e) both state the invariant on their own side of the seam and neither module could resolve a name if it wanted to (both are dependency-free and have no access to a `ParsedFeature`).
- **`featureLayer`** — `normalizeLayer(layer)` hoisted to a single binding near the top of `collect`, replacing the inline call that previously ran only at the return site. Both the returned `collection.layer` and every Rule's merge now derive from it.
- **`ruleLayers`** — a `Map<string, Layer>` declared before the `dsl` object literal, mutated by the `Rule` closure during `define(dsl)`.
- **`FeatureDsl.Rule`** replaces the 08-03 throwing placeholder. Per call it resolves `ruleId`, computes `Layer.provideMerge(featureLayer)(extraLayer)` and records it, then builds a fresh `RuleDsl<any>`:
  - `...scenarioDsl` — the SAME shared object the Feature level hands out, so a `Given` written directly inside the Rule's callback registers at `"rule"` scope (its registrars read `registry.currentScope()` at call time).
  - `Background` — the same `backgroundDsl` object, pushing `{ kind: "background", name: null, ruleId }` (D-04).
  - `Scenario` — a second inline two-argument-only registrar pushing `{ kind: "scenario", name, ruleId }`, with both arities spelled because `ScenarioRegistrar` is an overloaded call signature.
  - `Before`/`After`/`BeforeStep`/`AfterStep` — built by a `ruleHookRegistrar(kind)` closure that differs from the Feature-level `hookRegistrar` in exactly one thing: it passes `ruleId` where that one passes `null`.
  - Then the identical `pushScope({ kind: "rule", … })` / `try` / `finally` / `popScope()` shape `Background` and `Scenario` already use.
- The Feature-level `Background`'s stale comment ("this file offers no `Rule` container yet, that is 08-05a's job") was rewritten, since it is now false.

### Task 2 — `ruleHooks`, the Feature-hooks filter, isolation tests (`6f02ec2`)

- **`FeatureCollection.ruleLayers`** and **`.ruleHooks`**, both REQUIRED and both documented with the "an optional field lets a later consumer forget this exists" reasoning the file already gives `hooks`.
- **`FeatureCollection.hooks` is now Feature-scope only** — `groupHooks(hookDefinitions.filter((definition) => definition.ruleId === null))`. `hookRegistry.hooks()` is read once into `hookDefinitions` and shared by both groupings rather than re-snapshotted per Rule.
- **`ruleHooks` is keyed off `ruleLayers.keys()`**, so the key set is "every Rule this Feature actually called `Rule(...)` for".
- **13 new tests** in `packages/vitest/test/describeFeature.test.ts`, all appended at the END of the file (the `definedAt` test hard-codes its own line number, so nothing may be inserted above it) against a SECOND parsed fixture with two `Rule:` blocks, one of which has its own `Background`:
  - the two fixture Rules have different ids (the premise every isolation assertion rests on);
  - three-way hook isolation — a Rule A `Before` is in `ruleHooks.get(ruleAId)` **by reference identity**, absent from `hooks`, absent from `ruleHooks.get(ruleBId)`;
  - a Rule that registered no hook gets an all-empty `HookSet`, and a Rule never called gets no key;
  - a Feature-level `Before` stays out of every Rule's set (the other direction of the same filter);
  - Rule A's Layer provides BOTH the Feature's `Marker` and Rule A's own `RuleMarker`, while `collection.layer` FAILS to provide `RuleMarker` and still provides `Marker`;
  - a Rule Layer built ON TOP of the ambient one (`Layer<RuleMarker, never, Marker>`) resolves — the only shape that distinguishes `provideMerge` from `merge`;
  - `ruleLayers` and `ruleHooks` share one key set;
  - end-to-end through `collect`'s own `planFeature`: rule-scope registrations resolve every step of that Rule's Scenario; the same registrations worded to match a DIFFERENT Rule's step text resolve nothing there; a Rule's own `Background` resolves its `rule-background` step; the identical pattern registered in the FEATURE's `Background` leaves that same step Unresolved (D-04's other half);
  - a Rule callback that throws leaves the scope stack balanced;
  - inertness — a `Rule` naming no real Rule registers three patterns that each match a real step's text, and all three are reported unused with every Scenario's every step Unresolved; its key is the sentinel and matches no `ParsedRule.id` and no `ParsedScenario.ruleId`.

## Verification

| Gate | Result |
| --- | --- |
| `pnpm build` | exit 0 |
| `pnpm lint` | exit 0 |
| `pnpm test` | 619 passed, 29 files |
| `pnpm circular` | no cycles |
| `pnpm typecheck:test` | exit 0 |

### Mutation testing (all five performed, then reverted, all five confirmed failing)

| Mutation | Test that goes red |
| --- | --- |
| `Layer.merge(featureLayer, extraLayer)` for `Layer.provideMerge(featureLayer)(extraLayer)` | "builds a Rule Layer whose own requirements the Feature's ambient Layer satisfies" — `Service not found: Marker` |
| `ruleHookRegistrar` passes `null` instead of `ruleId` | "keeps a Rule-scoped Before out of the Feature's hooks and out of the other Rule's" |
| `hooks: groupHooks(hookDefinitions)` unfiltered | same test |
| the `"rule"` scope pushed with `ruleId: null` | three tests: rule-scope resolution, Rule-Background resolution, and the Feature-Background negative |
| `resolveRuleId` falling back to the FIRST Rule's id instead of the sentinel | "resolves to zero Scenarios and reports its pattern unused" and "keys the unresolved Rule under a sentinel no real Rule id can equal" |

The source file was diffed against a pre-mutation backup afterwards and confirmed byte-identical.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `node_modules` absent in the worktree**

- **Found during:** Task 1 setup
- **Issue:** The parallel-execution worktree is a fresh checkout with no `node_modules`, so `pnpm build`, `pnpm lint` and `pnpm test` could not run at all.
- **Fix:** `pnpm install --frozen-lockfile` in the worktree. No manifest and no lockfile change — `git status` stayed clean afterwards.
- **Files modified:** none

**2. [Rule 1 - Bug] The position-sensitive `givenLine` literal**

- **Found during:** Task 2
- **Issue:** Adding the `effect/Exit` and `effect/Option` imports shifted every line below them by two, invalidating `describeFeature.test.ts`'s hard-coded `const givenLine = 277` — the assertion the file's own header calls out as the only one that can catch a hoisted call-site capture.
- **Fix:** Updated to `279` and verified against the real line of the `Given("a located step", …)` call. Everything else this plan adds is appended at the END of the file precisely so nothing else shifts.
- **Files modified:** `packages/vitest/test/describeFeature.test.ts`
- **Commit:** `6f02ec2`

**3. [Rule 1 - Bug] Unused destructured `Then` failing `oxlint`**

- **Found during:** Task 2 verification
- **Issue:** The inertness test destructured `Then` from the Rule dsl without using it — `eslint(no-unused-vars)`, an error under the `correctness` category.
- **Fix:** Removed it from the destructuring pattern.
- **Files modified:** `packages/vitest/test/describeFeature.test.ts`
- **Commit:** `6f02ec2`

### Acceptance-criterion discrepancy (not a code change)

Task 1's grep
`grep -cE 'hookRegistry\.register\((Before|After|BeforeStep|AfterStep|kind), (null|ruleId)' … is at least 5`
returns **2**, and is unsatisfiable as written by any correct implementation. The alternation has no quotes, so it can only ever match the `kind` *variable* form — `hookRegistry.register("Before", ruleId, …)` does not match it, because a `"` follows the paren. Two matches is exactly right for the design the plan's own prose asks for: one Feature-level `hookRegistrar(kind)` closure passing `null`, and one Rule-level `ruleHookRegistrar(kind)` closure passing `ruleId`, with the four Rule-scoped registrars built from the latter (`Before: ruleHookRegistrar("Before")`, …). The underlying claim — must_haves truth 4, "a hook registered through RuleDsl's Before/After/BeforeStep/AfterStep carries that Rule's id, never null" — is proven by the three-way isolation test and by mutation 2 above.

Every other acceptance grep passes: `const resolveRuleId` = 1, `unregistered-rule:` = 2, `ruleLayers.set` = 1, `Layer.provideMerge(featureLayer)(extraLayer)` = 2, `kind: "rule"` = 1, `ruleHooks` = 4, `definition.ruleId === null` = 1.

## Authentication Gates

None.

## Known Stubs

The Rule's own `Scenario` registrar still throws on the three-argument form, referencing plan 08-05b — deliberate and in scope for that plan, which explicitly replaces BOTH this closure and the pre-existing Feature-level one with a shared `makeScenarioRegistrar` factory. The two-argument form (the overwhelmingly common one) is fully implemented in both places.

`FeatureCollection.ruleLayers` and `.ruleHooks` are populated but not yet CONSUMED: `Runner.ts` still threads only the Feature's flat `layer`/`hooks` into `buildScenarioEffect`. That wiring is plan 08-07's, stated in this plan's own objective as deliberately out of scope.

## For the Next Plan

- **08-05b** replaces the two inline `Scenario` closures — the Feature-level `scenarioRegistrar` (unchanged by this plan) and `ruleScenarioRegistrar` inside the `Rule` member — with `makeScenarioRegistrar(ruleId, ambientLayer)`. The two ambient Layers to pass are already named bindings: `featureLayer` at Feature level and `ruleAmbientLayer` inside the `Rule` closure. Both closures carry a comment naming 08-05b; its acceptance grep for zero `"08-05b"` occurrences will need both removed.
- **08-07** consumes `collection.ruleLayers.get(ruleId)` and `mergeHookSets(collection.hooks, collection.ruleHooks.get(ruleId) ?? emptyHookSet)` inside `Runner.ts`'s existing `for (const rule of plan.feature.rules)` loop. Both maps are keyed by the same id, and every key is either a real `ParsedRule.id` or a sentinel matching no `ParsedScenario.ruleId` — so a `.get(rule.id)` miss means the author never wrote a `Rule(...)` for that block, not that the key scheme disagrees.

## Threat Flags

None. No new network endpoint, auth path, file access or schema change; `pnpm-lock.yaml` and both manifests are unchanged.

## Self-Check: PASSED

- `packages/vitest/src/describeFeature.ts` — FOUND
- `packages/vitest/test/describeFeature.test.ts` — FOUND
- `.planning/phases/08-rule-and-scenario-outline/08-05a-SUMMARY.md` — FOUND
- commit `7f62971` — FOUND
- commit `6f02ec2` — FOUND

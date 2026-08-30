---
phase: 08-rule-and-scenario-outline
plan: 05b
type: execute
wave: 3
depends_on: ["08-05a"]
files_modified:
  - packages/vitest/src/describeFeature.ts
  - packages/vitest/test/describeFeature.test.ts
autonomous: true
requirements: [DSL-05]

must_haves:
  truths:
    - "Scenario(name, extraLayer, define) merges extraLayer onto whichever Layer was ambient at that call site — the Feature's own, or a Rule's already-merged one when called inside RuleDsl"
    - "Scenario's existing two-argument form is completely unaffected — no extra Layer, no scenarioLayers entry"
    - "A Scenario's own extra Layer composes ON TOP of its enclosing Rule's extra Layer, not instead of it, when both are present"
    - "Where a Scenario's extra Layer and its ambient Layer name the same service, the Scenario's own wins, matching Layer.provideMerge's documented precedence"
  artifacts:
    - path: "packages/vitest/src/describeFeature.ts"
      provides: "makeScenarioRegistrar, FeatureCollection.scenarioLayers"
      contains: "makeScenarioRegistrar"
  key_links:
    - from: "packages/vitest/src/describeFeature.ts"
      to: "packages/vitest/src/Registry.ts"
      via: "makeScenarioRegistrar pushes { kind: \"scenario\", name, ruleId } exactly as the 08-05a inline closures did"
      pattern: "makeScenarioRegistrar"
---

<objective>
Finish D-01: implement `Scenario`'s three-argument extra-Layer overload — reachable both at Feature
level and from inside a Rule's own dsl — by replacing the two inline, two-argument-only `Scenario`
closures 08-05a built with one shared, arity-detecting factory.

Purpose: 08-05a deliberately left `Scenario` two-argument-only in both places it appears (Feature-level
`dsl.Scenario` and `RuleDsl.Scenario` inside the `Rule` closure), to keep that plan's context budget
inside a single agent's working window. `Dsl.ts` (08-03) already declares the three-argument overload
on `ScenarioRegistrar<ROut>`, so this plan's whole job is the ONE runtime function both call sites
share, and the map that carries its result to the Scenario's actual execution.
Output: `makeScenarioRegistrar`, `FeatureCollection.scenarioLayers`, and tests proving Scenario-level,
Rule-level, and combined Rule+Scenario Layer composition.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/REQUIREMENTS.md
@.planning/phases/08-rule-and-scenario-outline/08-CONTEXT.md
@.planning/phases/08-rule-and-scenario-outline/08-PATTERNS.md
@spec/decisions/010-rule-and-scenario-scoped-extra-layers.md
@packages/vitest/src/Dsl.ts
@.planning/phases/08-rule-and-scenario-outline/08-05a-SUMMARY.md

<interfaces>
<!-- The contract 08-07 (Runner.ts final wiring) is written against. -->

packages/vitest/src/describeFeature.ts additions:

  const scenarioKey = (ruleId: string | null, name: string): string => `${ruleId ?? "<feature>"} ${name}`
  // Composite key mirroring packages/gherkin/src/Validate.ts's own uniquenessKey exactly (same
  // ruleId-or-"<feature>" plus separated-name shape), so a Feature-level Scenario and a same-named
  // Scenario inside a Rule never collide in this map, matching Validate.ts's own per-scope
  // uniqueness guarantee (F22).

  const makeScenarioRegistrar = (
    ruleId: string | null,
    ambientLayer: Layer.Layer<any, any, never>
  ): ScenarioRegistrar<any> => /* handles both the 2-arg and 3-arg call shapes */

  export type FeatureCollection = {
    ... // unchanged existing fields, plus 08-05a's ruleLayers/ruleHooks
    readonly scenarioLayers: ReadonlyMap<string, Layer.Layer<any, any, never>>   // keyed by scenarioKey
  }

INVARIANT for 08-07 to rely on: a `scenarioLayers` entry, when present for a given `(ruleId, astName)`
pair, is the FULLY merged effective Layer for every row of that Scenario (Outline rows share one
`Scenario(...)` registration and therefore one entry) — 08-07 must use it AS-IS, never re-merge it
against the Feature's or Rule's own Layer a second time.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: makeScenarioRegistrar — the shared arity-detecting factory</name>
  <files>packages/vitest/src/describeFeature.ts</files>
  <read_first>
    - packages/vitest/src/describeFeature.ts (as edited by 08-05a — the Feature-level `dsl.Scenario` inline closure and the `RuleDsl.Scenario` inline closure inside the `Rule` member's body; both carry a comment naming this plan)
    - packages/vitest/src/Dsl.ts (as edited by 08-03 — `ScenarioRegistrar<ROut>`'s two call signatures, exactly what this factory must satisfy at the type level)
    - packages/gherkin/src/Validate.ts lines ~220-235 (`uniquenessKey`'s exact composite-key shape this task's `scenarioKey` mirrors)
    - spec/decisions/010-rule-and-scenario-scoped-extra-layers.md (the `Layer.provideMerge(ambient)(extraLayer)` mechanism, and "extraLayer can itself depend on ambient services")
  </read_first>
  <action>
    Add `scenarioKey(ruleId: string | null, name: string): string` exactly as specified in this plan's
    `<interfaces>` block. Add `const scenarioLayers = new Map<string, Layer.Layer<any, any, never>>()`
    near `ruleLayers` (both are populated during `define(dsl)` and read only after it returns).

    Add `makeScenarioRegistrar(ruleId, ambientLayer): ScenarioRegistrar<any>`, implemented as a single
    function that inspects its OWN arguments at call time to tell the two-argument form from the
    three-argument form (checking whether the third argument is present distinguishes them — the same
    technique `describeFeature`/`collectFeature`'s own overload IMPLEMENTATION signature already uses
    one level up to accept either `LayerArgument` shape): when three arguments are present, the middle
    one is the extra Layer — merge it via `Layer.provideMerge(ambientLayer)(extraLayer)` and
    `scenarioLayers.set(scenarioKey(ruleId, name), merged)` BEFORE running `define`, so the map is
    populated even if `define` itself throws (mirroring `Rule`'s own ordering in 08-05a, where the Layer
    merge happens before the `pushScope`/`try`/`finally` block). Either way, push `{ kind: "scenario",
    name, ruleId }`, call `define(scenarioDsl)` inside `try`, `popScope()` in `finally` — IDENTICAL to
    the two inline closures this factory replaces.

    Replace BOTH of 08-05a's inline `Scenario` closures with `makeScenarioRegistrar(null, featureLayer)`
    (the Feature-level `dsl.Scenario`) and `makeScenarioRegistrar(ruleId, ruleAmbientLayer)` (inside the
    `Rule` member's `RuleDsl` construction) — delete the comments in both places that named this plan as
    owning the extension; they are now stale.

    Add `scenarioLayers` (already built by this task) to `FeatureCollection`'s type and to `collect`'s
    return statement.
  </action>
  <acceptance_criteria>
    - `grep -c "const makeScenarioRegistrar" packages/vitest/src/describeFeature.ts` outputs `1`
    - `grep -c "makeScenarioRegistrar(null, featureLayer)" packages/vitest/src/describeFeature.ts` is at least `1`
    - `grep -c "makeScenarioRegistrar(ruleId, ruleAmbientLayer)" packages/vitest/src/describeFeature.ts` is at least `1`
    - `grep -c "08-05b" packages/vitest/src/describeFeature.ts` outputs `0` (the stale forward-reference comments are removed)
    - `grep -c "scenarioLayers" packages/vitest/src/describeFeature.ts` is at least `3`
    - `pnpm build` exits 0
  </acceptance_criteria>
  <verify>
    <automated>pnpm build</automated>
  </verify>
  <done>One shared `makeScenarioRegistrar` handles both call arities at both the Feature level and inside every `Rule`, and `FeatureCollection.scenarioLayers` carries the merged result.</done>
</task>

<task type="auto">
  <name>Task 2: D-01 Scenario-form composition tests</name>
  <files>packages/vitest/test/describeFeature.test.ts</files>
  <read_first>
    - packages/vitest/src/describeFeature.ts (as edited by Task 1)
    - packages/vitest/test/describeFeature.test.ts (read whole — the `whoProvides`/`Marker` pattern from D-03/D-04's existing tests, and 08-05a's new per-Rule Layer test this task's own tests extend the style of)
  </read_first>
  <action>
    Extend `packages/vitest/test/describeFeature.test.ts` with:
    - a Feature-level `Scenario(name, extraLayer, define)` call whose `extraLayer` provides a service
      NOT in the Feature's own ambient Layer; resolve `collection.scenarioLayers.get(scenarioKey(null,
      name))` (or the equivalent composite-key construction available to the test) and prove it provides
      BOTH the Feature's own service and the extra one, while `collection.layer` alone does not provide
      the extra one — the isolation half of D-01's Scenario form.
    - the existing two-argument `Scenario(name, define)` form used ELSEWHERE in this same test run
      produces NO entry in `collection.scenarioLayers` for that name — proving the common case adds no
      map entry and no behavior change.
    - a `Scenario` declared INSIDE a `Rule` with its OWN extra Layer: resolve the composite key with that
      Rule's id and prove the result provides the Feature's service, the Rule's own extra service, AND
      the Scenario's own extra service — all three tiers reachable from one merged Layer, proving
      composition nests rather than replaces.
    - a collision test: a Scenario's extra Layer and its ambient Layer both provide the SAME service tag
      with distinguishable implementations (mirroring the existing `Marker`/`sharedMarker`/
      `perScenarioMarker` D-04 test's shape); resolving the merged Layer must observe the SCENARIO's own
      implementation, matching `Layer.provideMerge`'s documented "second/inner argument wins" precedence
      — verified by RUNNING the resolution, never by inspecting the merged Layer's static shape (the
      same reasoning this file's own header already states for D-04's `Layer.merge` test).
  </action>
  <acceptance_criteria>
    - `pnpm vitest run packages/vitest/test/describeFeature.test.ts` passes, including all four new cases: Feature-level Scenario isolation, two-argument-form no-entry, three-tier Rule+Scenario composition, and the collision-precedence resolution
    - `pnpm build`, `pnpm lint` and `pnpm test` all exit 0
  </acceptance_criteria>
  <verify>
    <automated>pnpm vitest run packages/vitest/test/describeFeature.test.ts && pnpm build && pnpm lint && pnpm test</automated>
  </verify>
  <done>Scenario-level, Rule-level and combined three-tier Layer composition are all proven end to end, including the ambient-vs-extra collision precedence.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| test author's Scenario-level Layer → the composition root | In-process, fully trusted code the developer wrote. No network, no serialization, no untrusted input. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-08-05b-01 | Tampering | `Layer.provideMerge`'s argument order silently swapped, inverting collision precedence | mitigate | The collision test resolves the merged Layer and asserts the SCENARIO's own implementation wins, mirroring `describeFeature.test.ts`'s existing D-04 precedent that a shape-only assertion cannot catch this. |
| T-08-05b-02 | Elevation of privilege | a Scenario's extra Layer computed against the WRONG ambient (e.g. always the Feature's, even inside a Rule) | mitigate | The three-tier composition test proves all three tiers are reachable only when `makeScenarioRegistrar` is called with the correct `ambientLayer` argument at each call site. |
| T-08-05b-03 | Repudiation | the two-argument form silently starting to populate `scenarioLayers` | mitigate | The explicit no-entry test for the two-argument form fails if the arity check is inverted or removed. |
| T-08-05b-SC | Tampering | npm/pip/cargo installs | n/a | This plan adds no dependency. `pnpm-lock.yaml` and both manifests are unchanged; no package-legitimacy checkpoint applies. |
</threat_model>

<verification>
- `pnpm build` compiles both packages clean.
- `pnpm lint` exits 0.
- `pnpm test` passes, including the extended `describeFeature.test.ts`.
- `pnpm circular` reports no new cycle.
</verification>

<success_criteria>
- `makeScenarioRegistrar` replaces both of 08-05a's inline two-argument-only `Scenario` closures.
- `FeatureCollection.scenarioLayers` is populated only for three-argument `Scenario` calls, keyed consistently with Rule identity.
- Scenario-level, Rule-level, and combined three-tier Layer composition are all proven, including collision precedence, by running the resolved Layer rather than inspecting its shape.
</success_criteria>

<output>
Create `.planning/phases/08-rule-and-scenario-outline/08-05b-SUMMARY.md` when done.
</output>

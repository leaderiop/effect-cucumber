---
phase: 08-rule-and-scenario-outline
plan: 05a
type: execute
wave: 2
depends_on: ["08-01", "08-02", "08-03"]
files_modified:
  - packages/vitest/src/describeFeature.ts
  - packages/vitest/test/describeFeature.test.ts
autonomous: true
requirements: [DSL-05]

major_component: "Rule container: extra Layer, Rule-level Background, Rule-scoped hook registration"

must_haves:
  truths:
    - "A step registered through FeatureDsl.Rule's define callback resolves against that specific Rule's id, never a different Rule with the same author-typed name"
    - "Rule(name, extraLayer, define)'s extraLayer is merged onto the Feature's ambient Layer via Layer.provideMerge before any Rule-scoped Scenario or hook sees it"
    - "A Rule's own Background registers steps that only rule-background-origin steps of THAT Rule can resolve against"
    - "A hook registered through RuleDsl's Before/After/BeforeStep/AfterStep carries that Rule's id, never null"
    - "Calling Rule with a name that matches no Rule in the parsed Feature produces a registration that is provably inert rather than silently attaching to the wrong Rule"
  artifacts:
    - path: "packages/vitest/src/describeFeature.ts"
      provides: "FeatureDsl.Rule implementation, FeatureCollection.ruleLayers and .ruleHooks"
      contains: "ruleLayers"
  key_links:
    - from: "packages/vitest/src/describeFeature.ts"
      to: "packages/vitest/src/Registry.ts"
      via: "the Rule container pushes { kind: \"rule\", name, ruleId: resolveRuleId(feature, name) }"
      pattern: "resolveRuleId"
    - from: "packages/vitest/src/describeFeature.ts"
      to: "packages/vitest/src/HookRegistry.ts"
      via: "Rule-scoped hook registrars pass the resolved ruleId into hookRegistry.register"
      pattern: "hookRegistry\\.register\\("
---

<objective>
Implement `FeatureDsl.Rule(name, extraLayer, define)` in the composition root: resolve the author's
Rule name to a real `ParsedRule.id` (or a sentinel that can never match a real Scenario), merge
`extraLayer` onto the ambient Feature Layer via `Layer.provideMerge`, build the `RuleDsl` this Rule's
`define` callback receives (its own Background container per D-04, its own four Rule-scopeable hook
registrars per D-02), and expose the per-Rule Layer and hook set on `FeatureCollection` for later plans
to consume.

Purpose: this is the composition root — `Registry.ts`/`Plan.ts` (08-01) already resolve a "rule" scope
correctly for MATCHING, `HookRegistry.ts`/`Hook.ts` (08-02) already carry and merge a `ruleId`, and
`Dsl.ts` (08-03) already declares the type surface — nothing yet REGISTERS through any of it. This plan
is that registration path. `Scenario`'s own extra-Layer form (D-01's second half) and the final
Runner.ts wiring that actually threads `ruleLayers`/`ruleHooks` into emission are deliberately NOT this
plan's job — 08-05b and 08-07 own them respectively, kept separate to stay within a single plan's
context budget.
Output: `FeatureDsl.Rule`'s implementation, `resolveRuleId`, `FeatureCollection.ruleLayers` and
`.ruleHooks`, and tests proving Rule-to-Rule isolation at the registration layer.
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
@packages/vitest/src/Registry.ts
@packages/vitest/src/HookRegistry.ts
@packages/vitest/src/Hook.ts

<interfaces>
<!-- The contract 08-05b (Scenario extra-layer) and 08-07 (Runner.ts final wiring) are written
     against. Both downstream plans read this shape directly. -->

packages/vitest/src/describeFeature.ts additions:

  const resolveRuleId = (feature: ParsedFeature, name: string): string => {
    const match = feature.rules.find((rule) => rule.name === name)
    return match === undefined ? `unregistered-rule:${name}` : match.id
  }
  // A real ParsedRule.id (generator-produced, e.g. "5") can never collide with this sentinel format
  // (it always contains a colon). No counter needed: two unresolved calls sharing one bad name produce
  // the same sentinel, which is harmless — both are equally, permanently invisible to every Scenario.

  export type FeatureCollection = {
    ... // unchanged existing fields
    readonly ruleLayers: ReadonlyMap<string, Layer.Layer<any, any, never>>   // keyed by resolveRuleId's output
    readonly ruleHooks: ReadonlyMap<string, HookSet>                        // keyed by resolveRuleId's output
  }

  // `hooks` (the existing FeatureCollection field) changes from
  //   groupHooks(hookRegistry.hooks())
  // to
  //   groupHooks(hookRegistry.hooks().filter((h) => h.ruleId === null))
  // — Feature-scoped only, now that some hooks may carry a ruleId.

INVARIANT for 08-05b and 08-07 to rely on: every key in `ruleLayers` and every key in `ruleHooks` is
either a REAL `ParsedRule.id` (found in `feature.rules`) or a sentinel that matches NOTHING in
`feature.allScenarios`'s `ruleId` field. Neither map needs a `null` key — Feature-level hooks/layer are
`FeatureCollection.hooks`/`.layer`, unchanged fields.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: resolveRuleId, the Rule container, and per-Rule Layer merge</name>
  <files>packages/vitest/src/describeFeature.ts</files>
  <read_first>
    - packages/vitest/src/describeFeature.ts (read whole — `collect`'s current body, `normalizeLayer`, the `dsl` object's `Background`/`Scenario`/hook-registrar construction, the `registrar`/`hookRegistrar` closures)
    - packages/vitest/src/Dsl.ts (as edited by 08-03 — `RuleDsl<ROut>`'s exact members, `FeatureDsl.Rule`'s exact generic signature)
    - packages/vitest/src/Registry.ts (as edited by 08-01 — `RegistryScope.ruleId`'s invariant: null means "not inside any Rule", non-null always for a rule-nested frame)
    - packages/vitest/src/HookRegistry.ts (as edited by 08-02 — `register(kind, ruleId, body)`'s new signature)
    - packages/gherkin/src/Model.ts (`ParsedFeature.rules: ReadonlyArray<ParsedRule>`, `ParsedRule.id`/`.name`)
    - spec/decisions/010-rule-and-scenario-scoped-extra-layers.md (the `Layer.provideMerge(ambient)(extraLayer)` mechanism, verbatim)
    - .planning/phases/08-rule-and-scenario-outline/08-PATTERNS.md sections "packages/vitest/src/describeFeature.ts" and its "Layer-merge pattern to copy"
  </read_first>
  <action>
    Add `resolveRuleId(feature: ParsedFeature, name: string): string` exactly as specified in this
    plan's `<interfaces>` block, as a module-level function (not a closure inside `collect`, since it
    needs nothing `collect` closes over). Document in a comment why a sentinel and not `null`: `Plan.ts`
    reserves `null` for "this scope is not nested inside any `Rule` call at all" and compares by plain
    equality — a `null` here would make an unresolved Rule's registrations wrongly visible to every
    Feature-level Scenario.

    Inside `collect`, compute `const featureLayer = normalizeLayer(layer)` ONCE, near the top (replacing
    the inline `normalizeLayer(layer)` call currently made only at the `FeatureCollection` return site —
    reuse this single binding there too, so the Layer is normalized exactly once per `collect` call).

    Declare `const ruleLayers = new Map<string, Layer.Layer<any, any, never>>()` before the `dsl` object
    literal (the `Rule` member's closure mutates it during `define(dsl)`).

    Add `Rule` to the `dsl` object literal, as a sibling of `Background`/`Scenario` (never spread into
    `scenarioDsl` — the identical "would leak into every `Scenario(...)` callback" argument
    `Dsl.ts` note (f) already makes for hooks applies here too):
    - resolve `const ruleId = resolveRuleId(feature, name)`.
    - compute `const ruleAmbientLayer = Layer.provideMerge(featureLayer)(extraLayer)` and
      `ruleLayers.set(ruleId, ruleAmbientLayer)`.
    - build a fresh `RuleDsl<any>` object for THIS Rule call: spread `...scenarioDsl` (the SAME shared
      object used at Feature level — its registrar functions read `registry.currentScope()` at call
      time and need no per-level parameterization), then override:
      - `Background: (defineBackground) => { registry.pushScope({ kind: "background", name: null,
        ruleId }); try { defineBackground(backgroundDsl) } finally { registry.popScope() } }` — the
        SAME `backgroundDsl` object (`Given`/`And` only, D-04's near-copy of `FeatureDsl`'s own
        Background container, differing only in the `ruleId` carried by the pushed scope).
      - `Scenario: (name, define) => { registry.pushScope({ kind: "scenario", name, ruleId }); try {
        define(scenarioDsl) } finally { registry.popScope() } }` — the TWO-ARGUMENT form only in this
        plan; 08-05b extends this exact function to detect a 3-argument call and merge an extra Layer.
        Leave a comment saying so at this exact line, naming plan 08-05b, so the next reader does not
        "helpfully" widen the signature here first.
      - `Before`, `After`, `BeforeStep`, `AfterStep`: each `(fn) => hookRegistry.register(kind, ruleId,
        registerHook(kind, fn))` for its own `kind` — the Rule-scoped counterpart of the Feature-level
        `hookRegistrar` closure, differing only in passing `ruleId` instead of `null`.
    - push `{ kind: "rule", name, ruleId }`, call `defineRule(ruleDsl)` inside `try`, `popScope()` in
      `finally` — the identical push/try/finally/pop shape `Background`/`Scenario` already use, so a
      `Given`/`When`/`Then` called DIRECTLY inside a Rule's `define` (a sibling of that Rule's own
      `Background`/`Scenario` calls, via the spread `...scenarioDsl`) registers at `"rule"` scope,
      resolved by `Plan.ts`'s (08-01) rule-aware `isVisibleTo`.

    Update the existing FEATURE-LEVEL `hookRegistrar` closure's `register` call to pass `null` for
    `ruleId` explicitly (it currently calls `hookRegistry.register(kind, registerHook(kind, fn))` with
    the OLD two-argument signature — 08-02 changed that signature to three arguments).
  </action>
  <acceptance_criteria>
    - `grep -c "const resolveRuleId" packages/vitest/src/describeFeature.ts` outputs `1`
    - `grep -c "unregistered-rule:" packages/vitest/src/describeFeature.ts` is at least `1`
    - `grep -c "ruleLayers.set" packages/vitest/src/describeFeature.ts` is at least `1`
    - `grep -c "Layer.provideMerge(featureLayer)(extraLayer)" packages/vitest/src/describeFeature.ts` is at least `1`
    - `grep -c 'kind: "rule"' packages/vitest/src/describeFeature.ts` is at least `1`
    - `grep -cE 'hookRegistry\.register\((Before|After|BeforeStep|AfterStep|kind), (null|ruleId)' packages/vitest/src/describeFeature.ts` is at least `5` (the four Rule-scoped registrars plus the Feature-level one, now all passing an explicit third argument)
    - `pnpm build` exits 0 (Task 2 supplies the first runnable test of this behavior)
  </acceptance_criteria>
  <verify>
    <automated>pnpm build</automated>
  </verify>
  <done>`Rule(name, extraLayer, define)` resolves a real or sentinel `ruleId`, merges `extraLayer` onto the Feature's ambient Layer, and hands `define` a `RuleDsl` whose Background/hook registrars all carry that `ruleId`.</done>
</task>

<task type="auto">
  <name>Task 2: FeatureCollection.ruleHooks, the Feature-hooks filter, and isolation tests</name>
  <files>packages/vitest/src/describeFeature.ts, packages/vitest/test/describeFeature.test.ts</files>
  <read_first>
    - packages/vitest/src/describeFeature.ts (as edited by Task 1 — `ruleLayers`, the `Rule` member)
    - packages/vitest/test/describeFeature.test.ts (read whole — the module header's mutation-testing conventions, `whoProvides`, `registerOneStep`, the `feature` fixture's real `parseFeature` source; this task's fixture needs a real `Rule:` block, so extend or add a sibling parsed feature rather than editing the existing `feature` constant other tests depend on)
    - packages/vitest/src/Hook.ts (as edited by 08-02 — `groupHooks`, the filter-before-group convention `emptyHookSet`/`mergeHookSets` were built to support)
    - .planning/phases/08-rule-and-scenario-outline/08-CONTEXT.md D-01, D-02, D-04
  </read_first>
  <action>
    Add `ruleHooks: ReadonlyMap<string, HookSet>` to `FeatureCollection`'s type, documented with the
    same "REQUIRED, not optional" reasoning the file already gives `hooks` (an optional field would let
    a later consumer forget Rule-scoped hooks exist).

    In `collect`'s return statement, after `define(dsl)` has run (so `hookRegistry.hooks()` and
    `ruleLayers` are both complete): change `hooks: groupHooks(hookRegistry.hooks())` to `hooks:
    groupHooks(hookRegistry.hooks().filter((definition) => definition.ruleId === null))` — Feature-scope
    is now only PART of what was registered. Compute `ruleHooks` by iterating `ruleLayers.keys()` (every
    ruleId this Feature actually saw a `Rule(...)` call for, real or sentinel) and, for each, calling
    `groupHooks(hookRegistry.hooks().filter((definition) => definition.ruleId === ruleId))`. Add
    `ruleLayers` (already built by Task 1) to the returned object.

    Extend `packages/vitest/test/describeFeature.test.ts`. Parse a NEW feature source (do not touch the
    existing module-scope `feature` constant — other tests in this file depend on its exact shape) with
    a `Rule:` block, e.g. two Rules each with one Scenario, following this file's own
    `Effect.runSync(parseFeature(...).pipe(Effect.provide(ParameterTypeStore.Default)))` pattern. Add
    tests:
    - a `Before` hook registered through Rule A's dsl appears in `collection.ruleHooks.get(ruleAId)
      .Before` and NOT in `collection.hooks.Before` (Feature-level) and NOT in
      `collection.ruleHooks.get(ruleBId).Before` — the three-way isolation proof.
    - the Layer resolved from `collection.ruleLayers.get(ruleAId)` provides BOTH the Feature's ambient
      service and Rule A's own extra service (using a `whoProvides`-style helper adapted to resolve
      against a `ruleLayers` entry instead of `collection.layer`), while `collection.layer` alone (the
      Feature's own) does NOT provide Rule A's extra service.
    - a `Given` step registered directly inside Rule A's `define` callback (a sibling of that Rule's own
      `Scenario` call — exercising the `"rule"`-scope registration path) resolves correctly when the
      Feature is fully planned via `collection.plan` — i.e., `collect`'s own `planFeature` call, not a
      hand-built `Plan.ts` fixture, is what proves 08-01's `isVisibleTo` "rule" case end to end against a
      REAL registration.
    - a `Given` step registered inside Rule A's own `Background` (D-04) resolves for a `rule-background`
      origin step inside Rule A's Scenario, via `collection.plan` — proving Task 1's `Background`
      override and 08-01's ruleId-aware `"background"` case compose correctly end to end.
    - calling `Rule("a name with no matching Rule in the parsed Feature", someLayer, (dsl) => { dsl.Given(...) 
      })` produces a registration that resolves to ZERO Scenarios anywhere in `collection.plan` (assert by
      checking every scenario's steps for an `Unresolved` entry attributable to that pattern, or by
      asserting the pattern surfaces on `collection.plan.warnings` as unused — whichever this repo's
      existing precedent supports more directly) — the sentinel's "provably inert" claim, proven rather
      than assumed.
  </action>
  <acceptance_criteria>
    - `grep -c "ruleHooks" packages/vitest/src/describeFeature.ts` is at least `3`
    - `grep -c "definition.ruleId === null" packages/vitest/src/describeFeature.ts` is at least `1`
    - `pnpm vitest run packages/vitest/test/describeFeature.test.ts` passes, including the three-way hook isolation test, the per-Rule Layer resolution test, the end-to-end "rule"-scope step resolution test, the end-to-end Rule-Background resolution test, and the unresolved-Rule-name inertness test
    - `pnpm build`, `pnpm lint` and `pnpm test` all exit 0
  </acceptance_criteria>
  <verify>
    <automated>pnpm vitest run packages/vitest/test/describeFeature.test.ts && pnpm build && pnpm lint && pnpm test</automated>
  </verify>
  <done>`FeatureCollection.ruleHooks`/`.ruleLayers` are populated and isolated per Rule, the Feature-level `hooks` field excludes Rule-scoped hooks, and end-to-end tests prove rule-scope step resolution, Rule-Background resolution, and unresolved-name inertness through the real `collect`/`planFeature` pipeline.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| test author's Rule/Scenario/Layer definitions → the composition root | In-process, fully trusted code the developer wrote. No network, no serialization, no untrusted input anywhere in this plan. |
| one Rule's Layer/hooks → a different Rule or the Feature level | The boundary this plan wires end to end for the first time (INV-EC-005's registration-side half; 08-01 already did the matching-side half). |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-08-05a-01 | Spoofing | two Rules sharing an author-typed name resolving to the same `ruleId` | mitigate | `resolveRuleId` matches by NAME against `feature.rules` and returns the specific `ParsedRule.id` found — if `Validate.ts` ever permits two same-named Rules, `Array.find` returns the FIRST match deterministically rather than an ambiguous one; this plan does not attempt to detect that upstream case, since no fixture or requirement in this phase exercises it. |
| T-08-05a-02 | Elevation of privilege | a Rule-scoped hook or Layer leaking into the Feature-level `hooks`/`layer` fields | mitigate | The `ruleId === null` filter on `hooks` and the separate `ruleLayers` map (never merged into `.layer`) are exactly what prevents this; the three-way isolation test is the acceptance proof. |
| T-08-05a-03 | Tampering | an unresolved `Rule(name, ...)` call silently attaching its registrations to an unrelated real Rule | mitigate | `resolveRuleId`'s sentinel format (`unregistered-rule:${name}`) can never equal a real `ParsedRule.id` (a generator-produced id never contains a colon); the inertness test is the acceptance proof. |
| T-08-05a-SC | Tampering | npm/pip/cargo installs | n/a | This plan adds no dependency. `pnpm-lock.yaml` and both manifests are unchanged; no package-legitimacy checkpoint applies. |
</threat_model>

<verification>
- `pnpm build` compiles both packages clean.
- `pnpm lint` exits 0.
- `pnpm test` passes, including the extended `describeFeature.test.ts`.
- `pnpm circular` reports no new cycle.
</verification>

<success_criteria>
- `FeatureDsl.Rule` resolves a real-or-sentinel `ruleId`, merges its extra Layer via `Layer.provideMerge`, and its `RuleDsl` registers Background/hooks/steps all carrying that `ruleId`.
- `FeatureCollection.ruleLayers` and `.ruleHooks` are populated, keyed consistently with `Plan.ts`'s (08-01) matching logic.
- `FeatureCollection.hooks` excludes Rule-scoped hooks.
- End-to-end tests (through the real `collect`/`planFeature` pipeline, not hand-built fixtures) prove rule-scope step resolution, Rule-Background resolution, three-way hook isolation, and unresolved-Rule-name inertness.
</success_criteria>

<output>
Create `.planning/phases/08-rule-and-scenario-outline/08-05a-SUMMARY.md` when done.
</output>

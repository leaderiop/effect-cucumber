# ADR-EC-010: `Rule` and `Scenario` can extend the ambient Layer with an extra per-Scenario Layer

> **Status:** Accepted
> **Date:** 2026-08-28

## Context

[ADR-EC-003](003-describefeature-takes-a-layer.md) fixes one Layer for the
whole Feature. Stress-testing against a worked example (discount codes valid
only under one `Rule`) surfaced a real need: a service that should only be
available to Scenarios inside one `Rule`, not the whole Feature — and ideally
enforced as a real type boundary, not just an informal "don't use this
elsewhere" comment.

## Decision

`Rule` and `Scenario` accept an optional extra Layer:

```ts
Rule(name, extraLayer, (dsl) => { ... })     // extraLayer available only inside this Rule
Scenario(name, extraLayer, () => { ... })    // same, scoped to just this Scenario
```

`extraLayer` combines with whatever's already ambient via
`Layer.provideMerge(ambient)(extraLayer)`, so `extraLayer` can itself depend on
ambient services, and both remain available to steps afterward. This is always
per-Scenario scope — built fresh every Scenario, same lifecycle as the
Feature's default Layer. There is no third "shared within a Rule" scope (see
[ADR-EC-006](006-two-layer-scopes-only.md)); a resource needing that must be
promoted to the Feature's `shared` Layer.

Hooks (`Before`/`After`/`BeforeStep`/`AfterStep`) declared inside a `Rule`'s
dsl apply only to Scenarios within that Rule. Hooks declared at the Feature's
top-level dsl apply to every Scenario in the Feature, including ones nested
inside a Rule.

## Consequences

**Positive**:

- A Rule-scoped service is a real compile-time boundary — a step defined
  outside the Rule that tries to use it doesn't typecheck, verified directly
  in the discount-codes worked example.
- No new Layer-composition primitive was invented — `Layer.provideMerge` is an
  existing Effect combinator, reused rather than wrapped in new API surface.

**Negative**:

- No mechanism exists for a Layer shared across some-but-not-all Scenarios in
  a Rule; the only two granularities are "this one Scenario" and "the whole
  Feature."

**Trade-off accepted**: this is the same trade [ADR-EC-006](006-two-layer-scopes-only.md)
already made, extended consistently to Rule/Scenario scope rather than
introducing a special case just because the need surfaced one level lower in
the Gherkin hierarchy.

---

> **Implementation note (2026-08-29, Phase 8):** this decision landed across six modules, and which
> half lives where is not obvious from the Decision above.
>
> **The type surface** is `packages/vitest/src/Dsl.ts`. `FeatureDsl.Rule` hands its callback a
> `RuleDsl<ROut | R2>` and the new `ScenarioRegistrar` interface gives `Scenario` TWO call
> signatures — `(name, define)` first and unchanged, `(name, extraLayer, define)` second — rather
> than a union of two function types, because a union does not resolve overloads across a varying
> argument count and would report a correct three-argument call against the two-argument member.
> `RuleDsl` carries `Before`/`After`/`BeforeStep`/`AfterStep` and deliberately not
> `BeforeAllScenarios`/`AfterAllScenarios`, matching this decision's Rule-scopeable hook list
> exactly.
>
> **The registration and Layer-merge mechanism** is `packages/vitest/src/describeFeature.ts`. Its
> `resolveRuleId` maps the author-written Rule name to a `ParsedRule.id`, or to an
> `unregistered-rule:${name}` sentinel when the Feature declares no such Rule; both forms of extra
> Layer are then merged with `Layer.provideMerge(ambient)(extraLayer)` — never `Layer.merge`, which
> would compose the two Layers beside each other and break this decision's own "`extraLayer` can
> itself depend on ambient services" clause. One shared `makeScenarioRegistrar` serves both
> `Scenario` arities at both the Feature and the Rule level, so "ambient at that call site" nests
> without a second code path. `packages/vitest/src/ScenarioKey.ts` is the one definition of the
> `(ruleId, name)` composite key the collected Scenario Layers are stored under, extracted as a leaf
> module so the writing and reading sides cannot disagree byte-for-byte; its separator is NUL,
> because the sentinel above embeds an author-written Rule name that may contain any printable
> character.
>
> **The matching mechanism** is `packages/vitest/src/Registry.ts`'s required `RegistryScope.ruleId`
> field and `packages/vitest/src/Plan.ts`'s ruleId-equality `isVisibleTo` arms plus its three-level
> `scopeRank`.
>
> **The hook ordering** — the "hooks declared inside a `Rule` apply only to Scenarios within that
> Rule" paragraph above — is `packages/vitest/src/Hook.ts`'s `mergeHookSets`, which is pure array
> concatenation in each direction: Feature-then-Rule for the Before-shaped kinds, Rule-then-Feature
> for the After-shaped ones. It deliberately does NOT wrap a Rule's `After` hooks in a second
> finalizer — `runHookBatch` already treats whatever array it is handed as one independent batch, so
> a merged array runs with exactly the semantics two separately-wrapped batches would have, minus a
> nesting level whose only effect would be a second chance to get the unwind order wrong. Per-hook
> `ruleId` bookkeeping lives in `packages/vitest/src/HookRegistry.ts`.
>
> **Threading the merged result into emission** is `packages/vitest/src/Runner.ts`, which resolves
> the innermost of the three tiers per Scenario (`scenarioLayers.get(...) ?? ruleLayer`) and emits
> each Rule's Scenarios inside a nested `describe` named after the Rule.
>
> See [BEH-EC-018](../behaviors/03-rules-outlines-and-testclock.md) for the normative statement of
> all of the above, and [INV-EC-005](../invariants.md#inv-ec-005-a-rule-scoped-layer-is-invisible-outside-that-rule)
> for the asserting tests.

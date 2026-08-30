# Runtime Invariants

Properties that hold for every execution. Each names the mechanism that
enforces it, because an invariant nobody enforces is a wish.

Four of these — INV-EC-001, INV-EC-002, INV-EC-003 and INV-EC-004 — are enforced by
code today, and each entry names the mechanism and the assertions that back it.
INV-EC-002 now holds on BOTH Layer scopes: the per-Scenario scope was built first,
and Phase 10 built the `shared` clause of its own wording, so its entry names two
mechanisms rather than one. The remaining two are not enforced at all: each still
names the **planned** enforcement mechanism and says so in its `Source` label, per
`AGENTS.md` §4 ("say only what is true"). `spec/roadmap.md` is the single source of
truth for what's actually built.

---

## INV-EC-001: Fail-fast is structural, not bookkept

Once a step's Effect fails, no later step in the same Scenario (or Rule)
executes.

**Source**: `packages/vitest/src/ScenarioEffect.ts`'s `buildScenarioEffect` —
Background and Scenario steps are compiled to sequential `yield*`s inside one
`Effect.gen`, by a `for` loop over the plan's step list. Effect's own error
channel short-circuits the generator; there is no separate "has a prior step
failed" flag to get out of sync. Asserted by
`packages/vitest/test/ScenarioEffect.test.ts`, which proves the short-circuit by
a recorded execution order rather than by the absence of an exception.

**Implication**: a step author never has to write cleanup-on-failure logic
into every subsequent step — a failing `Given` simply prevents the `When`/`Then`
that follow it from running at all.

**Related**: [BEH-EC-002](behaviors/01-steps-and-world.md), [ADR-EC-004](decisions/004-one-it-effect-per-scenario.md).

---

## INV-EC-002: A per-Scenario Layer is fresh every Scenario

Unless a Layer is explicitly declared `shared`, no state built by that Layer
for one Scenario is visible to any other Scenario.

**Source**: `packages/vitest/src/ScenarioEffect.ts` supplies the Feature's Layer
once around each Scenario Effect and never memoizes it, so every execution
rebuilds it — asserted by `packages/vitest/test/ScenarioEffect.test.ts` running
one Scenario Effect twice and observing two independent service instances.
`packages/vitest/src/Runner.ts` completes the MECHANISM: it emits one test per
Scenario, each handed its own unexecuted Effect, so no two Scenarios can share a
build. Both halves of the claim now hold for the per-Scenario scope, and the
second half is asserted end to end by
`packages/vitest/test/emission.test.ts` — a real `describeFeature` call whose two
emitted Scenarios each append to a `Ref` obtained from the ambient Layer and each
assert the WHOLE accumulated log, so a Layer built once and shared would leave
the second Scenario reading the first's entries and fail.

The `shared` half of the invariant's own wording — "unless a Layer is explicitly
declared `shared`" — is built too, as of Phase 10 (RUN-03/RUN-04, ADR-EC-018).

**Mechanism.** On the `shared` path the two tiers are provided in two different
places and never merged. The shared tier is provided by `@effect/vitest`'s
`layer(...)` at the BLOCK level, around every test node the Feature emits, and is
NOT re-provided inside any Scenario Effect — so it is built once and every Scenario
reaches that one build. The per-Scenario tier is still supplied once around each
Scenario Effect and is still rebuilt on every execution, exactly as it is on the
default path. `packages/vitest/src/describeFeature.ts` is the one branch point
(`collection.sharedLayer === null` selects the default path), and
`packages/vitest/src/ScenarioEffect.ts` is unchanged by the distinction — it
provides whatever per-Scenario Layer it is handed and has never heard of the two
paths.

**Assertions.** `packages/vitest/test/emission.test.ts` runs one Feature with both
tiers instrumented by build counters and asserts the pair side by side: the shared
ordinals each Scenario reached are `[1, 1, 1]` and the per-Scenario ordinals in the
SAME Feature are `[1, 2, 3]`. The second array is the half that catches an over-fix
— a change memoising both tiers satisfies the first and breaks this invariant for
every Feature that asked for a shared scope. `scripts/verify-shared-layer-once.sh`
(`pnpm verify:shared-layer-once`) is the other half: it runs the real `vitest` CLI
against a committed fixture Feature twice, once whole and once narrowed with `-t` to
a single Scenario, and asserts the shared build count is identical in both — which
an in-process test structurally cannot show.

"Fresh every Scenario" therefore remains true of the per-Scenario tier on BOTH
scopes, and is deliberately FALSE of the shared tier, which is the entire point of
asking for one. What a `shared` Layer never costs a Scenario is its own simulated
clock and its own console: those stay per-Scenario on both paths (BEH-EC-012,
ADR-EC-018), so opting into shared state is a choice about the caller's own
services and never silently about the test environment.

**Implication**: a `Given`/`When`/`Then` author can rely on a clean World for
every Scenario without writing manual reset logic, _unless_ that Scenario
opts into a `shared` Layer — in which case decision
[ADR-EC-006](decisions/006-two-layer-scopes-only.md) makes the author
responsible for resetting shared state themselves (e.g. in `Background`).

**Related**: [BEH-EC-004](behaviors/01-steps-and-world.md), [ADR-EC-006](decisions/006-two-layer-scopes-only.md).

---

## INV-EC-003: A step's Effect can only use services the ambient Layer provides

A `Given`/`When`/`Then` written inside a `Rule` or `Scenario` that requires a
service not present in that scope's Layer fails to compile — it is never a
runtime "service not found."

**Boundary condition**: this holds for step bodies free of `any`. It is not a
caveat that better types could remove. A bare `any`, and an
`Effect<any, any, any>`, are assignable to everything, so a step body
containing either compiles against _any_ ambient Layer — the requirement it
would otherwise declare is erased before the check has anything to check. No
DSL signature can prevent that, because the erasure happens in the author's own
body, not at the boundary this invariant guards. Stated here rather than left
implicit so the invariant claims only what a type system can actually deliver
(`.planning/research/PITFALLS.md` Pitfall 6). The practical rule: an `any`
reaching a step body's declared type is a defect in that step, not a permitted
escape hatch — the compile-gate fixtures under
`packages/vitest/test/tsgo-gate/` are asserted to contain none.

**Source**: `packages/vitest/src/Dsl.ts`'s `StepRegistrar<ROut>`, which binds a
step's required context to the ambient Layer's output type rather than leaving
it a free per-call-site type parameter, so `describeFeature`'s Layer argument
is what decides which services a step may reach. That structural check is
backed by a second, type-aware mechanism: `@effect/tsgo`'s
`missingEffectContext` (a step's required context) and `missingLayerContext`
(the Layer argument's own unhandled `RIn`) diagnostics, wired to fail the build
rather than merely advise — see
[ADR-EC-016](decisions/016-effect-tsgo-language-service-plugin.md).

Both are enforced on every push by `scripts/verify-tsgo-gate.sh` assertions 5,
6 and 8. The three are a set, not a redundancy: 5 is the positive control (a
satisfied step, plus a scoped and an already-wrapped one, compiling clean), 6
is the starved twin of 5 — the same step body against a Layer that does not
provide the service — and 8 is the Layer argument's own unsatisfied `RIn`.
Asserting the satisfied and starved cases in the same run is what keeps the
guarantee from decaying silently: every negative assertion checks the exit code
**and** greps the diagnostic by name, because a step can keep being rejected
for a plain shape reason long after the Effect diagnostic has stopped covering
it.

**Implication**: a Rule-scoped service (e.g. a `DiscountRegistry` declared only
inside one `Rule`) is a real type boundary — a step outside that Rule
attempting to use it is caught at authoring time, not at test-run time.

**Related**: [BEH-EC-002](behaviors/01-steps-and-world.md), [BEH-EC-009](behaviors/03-rules-outlines-and-testclock.md), [ADR-EC-003](decisions/003-describefeature-takes-a-layer.md), [ADR-EC-010](decisions/010-rule-and-scenario-scoped-extra-layers.md).

---

## INV-EC-004: `After` hooks run even when a step fails

A Scenario's `After` hook executes whether every step in that Scenario
succeeded or one of them failed.

**Source**: `packages/vitest/src/ScenarioEffect.ts`'s `buildScenarioEffect` wraps the WHOLE composed
Scenario Effect — the `Before` gate and the per-step `BeforeStep`/step/`AfterStep` loop included —
with `Effect.onExit(() => runHookBatch(args.hooks.After))`, with `Effect.provide` still the last
`.pipe` call. `Effect.ensuring` was the originally planned combinator (see BEH-EC-006's correction
note) and cannot express this requirement: in the installed `effect@4.0.0-rc.112` build its
finalizer's error channel is `never`, so a fallible `After` hook is not assignable to it, and forcing
it through would merge no causes. `Effect.onExit`'s finalizer runs on success, on failure and on
interruption, and merges both causes when the wrapped Effect and the finalizer both fail — which is
what the do-not-mask half of this invariant needs. Asserted by
`packages/vitest/test/ScenarioEffect.test.ts` (After on success, After on a step failure, After after
a Before failure, and the failing-After-does-not-mask case) and
`packages/vitest/test/Runner.test.ts` (the full six-hook ordering across a two-Scenario Feature). See
[BEH-EC-017](behaviors/07-hook-ordering-and-guarantees.md) for the full ordering this guarantee is
one piece of.

**Implication**: resource cleanup written in `After` is reliable even for a
failing Scenario; the hook body itself doesn't need to opt into that
guarantee (it doesn't and can't — the runner applies it, not the author).

**Related**: [BEH-EC-006](behaviors/02-shared-layers-and-tags.md), [BEH-EC-017](behaviors/07-hook-ordering-and-guarantees.md).

---

## INV-EC-005: A Rule-scoped Layer is invisible outside that Rule

A service contributed by a `Rule`'s extra Layer is available only to Scenarios
defined inside that Rule's `dsl` callback.

**Source**: two independent halves, in two places.

The REGISTRATION half is `packages/vitest/src/describeFeature.ts`. Its `Rule` container resolves the
author-written Rule name to a `ParsedRule.id` through `resolveRuleId` — falling back to an
`unregistered-rule:${name}` sentinel no real generator-produced id can equal, so a `Rule(...)` naming
no Rule in the parsed Feature registers definitions that can never match rather than silently
matching everything — and builds that Rule's ambient Layer as
`Layer.provideMerge(featureLayer)(extraLayer)`, recorded per `ruleId`. `Layer.merge` is expressly not
used: only `provideMerge` feeds the ambient Layer's output into `extraLayer`'s own requirements,
which is what lets a Rule Layer DEPEND on ambient services (ADR-EC-010). The identical mechanism
serves ADR-EC-010's `Scenario(name, extraLayer, define)` form through one shared
`makeScenarioRegistrar`, whose entries are keyed by `packages/vitest/src/ScenarioKey.ts`'s
`scenarioKey(ruleId, name)` — the pair, NUL-separated, and never the name alone, because a Scenario
name is unique per scope and no further. `packages/vitest/src/Runner.ts` threads the innermost of the
three tiers into each emitted `it.effect`.

The MATCHING half is `packages/vitest/src/Registry.ts` and `packages/vitest/src/Plan.ts`.
`RegistryScope.ruleId` is a required `string | null` field carried by every registered definition,
`null` meaning Feature level and only Feature level; `Plan.ts`'s `isVisibleTo` compares
`Option.getOrNull(scenario.ruleId)` against `definition.scope.ruleId` by plain string equality in its
`"rule"`, `"background"` and `"scenario"` arms, so one Rule's registration can never serve another
Rule's Scenario, a Feature-level Background registration can never resolve a `rule-background` step,
and a same-named Scenario in a different Rule is a different scope.

The COMPILE-TIME half is `packages/vitest/src/Dsl.ts`: `FeatureDsl.Rule` hands its callback a
`RuleDsl<ROut | R2>` and `ScenarioRegistrar`'s three-argument signature hands its callback a
`ScenarioDsl<ROut | R2>`, so `R2` is in scope inside and absent outside.

Asserted by `packages/vitest/test/Plan.test.ts`'s cross-rule isolation tests ("never lets one Rule's
registration serve another Rule's Scenario, even under one pattern text", "does not let a
Scenario-scope pattern cross into a same-named Scenario in a different Rule") and its three-level
Scenario-over-Rule-over-Feature precedence tests; by
`packages/vitest/test/describeFeature.test.ts`'s per-Rule Layer resolution tests ("provides both the
Feature's ambient service and the Rule's own from the Rule's Layer", "leaves the Feature's own Layer
unable to provide the Rule's extra service", "builds a Rule Layer whose own requirements the
Feature's ambient Layer satisfies") and their `Scenario`-form and three-tier counterparts; by
`packages/vitest/test/emission.test.ts`'s real end-to-end Rule run, where the Rule tier is a
`Layer.effect`-built service DERIVED from the Feature's, so it exists at runtime only if
`provideMerge` really composed the two; and, for the compile-time half, by
`scripts/verify-tsgo-gate.sh` assertions 12 and 13 — a committed satisfied/starved fixture pair in
which assertion 13's negative is assertion 12's Rule-scoped step body, byte-for-byte, registered at
Feature level with no Rule in the file, checked for a non-zero exit AND for
`effect(missingEffectContext)` by name.

**Implication**: there is no third "shared across a Rule's Scenarios but not
the whole Feature" scope — a resource needing that must be promoted to the
Feature's `shared` Layer instead. A Rule's extra Layer is built FRESH per
Scenario, not once per Rule, so two Scenarios in one Rule share the Rule's
services by type but never by instance.

**Related**: [BEH-EC-009](behaviors/03-rules-outlines-and-testclock.md), [BEH-EC-018](behaviors/03-rules-outlines-and-testclock.md#beh-ec-018-rulescenario-registration-hook-ordering-rule-background-and-outline-row-titling), [ADR-EC-010](decisions/010-rule-and-scenario-scoped-extra-layers.md).

---

## INV-EC-006: Cross-step scenario data survives only via a Layer-provided `Ref`

A value one step computes and a later step in the same Scenario consumes is
never a bare closure variable declared inside `Scenario`/`Rule`/`Background`'s
callback.

**Source (planned)**: no automated enforcement yet — this is currently a
convention stated in [ADR-EC-009](decisions/009-cross-step-state-lives-in-a-ref.md)
and demonstrated in [BEH-EC-011](behaviors/03-rules-outlines-and-testclock.md#beh-ec-011-cross-step-state-lives-in-world-never-a-closure).
A lint rule flagging a `let`/`var` declared inside a DSL callback that a step
function closes over is a candidate future enforcement mechanism — see
`spec/roadmap.md` § Planned.

**Implication**: the reason this matters — `Scenario(name, () => {...})`'s
callback runs once, at registration time, not once per test execution. A bare
`let` is shared across every retry/re-run of that Scenario's `it.effect`,
silently leaking state between them.

**Related**: [ADR-EC-009](decisions/009-cross-step-state-lives-in-a-ref.md).

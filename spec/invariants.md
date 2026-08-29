# Runtime Invariants

Properties that hold for every execution. Each names the mechanism that
enforces it, because an invariant nobody enforces is a wish.

Two of these — INV-EC-001 and INV-EC-003 — are enforced by code today, and each
entry names the mechanism and the assertions that back it. INV-EC-002's
mechanism is real but only half its claim is asserted, and its entry says which
half. The remaining three are not enforced at all: each still names the
**planned** enforcement mechanism and says so in its `Source` label, per
`AGENTS.md` §4 ("say only what is true"). `spec/roadmap.md` is the single
source of truth for what's actually built.

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

**Source (half built)**: `packages/vitest/src/ScenarioEffect.ts` supplies the
Feature's Layer once around each Scenario Effect and never memoizes it, so every
execution rebuilds it — asserted by `packages/vitest/test/ScenarioEffect.test.ts`
running one Scenario Effect twice and observing two independent service
instances. `packages/vitest/src/Runner.ts` now completes the MECHANISM: it emits
one test per Scenario, each handed its own unexecuted Effect, so no two
Scenarios can share a build. The other half of the CLAIM is still **planned**,
and the gap is a test rather than a module — nothing yet runs two emitted
Scenarios against a state-carrying Layer and observes that neither sees the
other's state, because `describeFeature` does not yet wire the pipeline end to
end and `Runner.test.ts` asserts emission shape against a trivial Layer.

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

**Source (planned)**: the runner composes the scenario Effect as
`scenarioEffect.pipe(Effect.ensuring(afterHookEffect))` — `Effect.ensuring`
runs regardless of the wrapped Effect's exit.

**Implication**: resource cleanup written in `After` is reliable even for a
failing Scenario; the hook body itself doesn't need to opt into that
guarantee (it doesn't and can't — the runner applies it, not the author).

**Related**: [BEH-EC-006](behaviors/02-shared-layers-and-tags.md).

---

## INV-EC-005: A Rule-scoped Layer is invisible outside that Rule

A service contributed by a `Rule`'s extra Layer is available only to Scenarios
defined inside that Rule's `dsl` callback.

**Source (planned)**: the extra Layer is combined with the ambient Layer via
`Layer.provideMerge(ambient)(extraLayer)` only within the scope of the `Rule`
call; the Feature's own top-level Layer (used outside any Rule) is unaffected.

**Implication**: there is no third "shared across a Rule's Scenarios but not
the whole Feature" scope — a resource needing that must be promoted to the
Feature's `shared` Layer instead.

**Related**: [BEH-EC-009](behaviors/03-rules-outlines-and-testclock.md), [ADR-EC-010](decisions/010-rule-and-scenario-scoped-extra-layers.md).

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

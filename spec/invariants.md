# Runtime Invariants

Properties that hold for every execution. Each names the mechanism that
enforces it, because an invariant nobody enforces is a wish.

All eight are enforced by code today, and each entry names the mechanism and the
assertions that back it. No entry on this page describes a **planned** mechanism
any more; INV-EC-006 was the last one that did, and Phase 11 built it. INV-EC-007
joined afterward, over `packages/vitest/src/Runner.ts`'s `Random.withSeed` wrap,
and INV-EC-008 joined most recently, over `packages/vitest/src/VitestTestApi.ts`'s
`Effect.Metric` wrapper. INV-EC-002 holds on BOTH Layer scopes: the per-Scenario
scope was built first, and Phase 10 built the `shared` clause of its own wording,
so its entry names two mechanisms rather than one. INV-EC-005 has been enforced
on both sides at once — runtime and compile time — since Phase 8.

INV-EC-006 is enforced WITHIN THIS REPOSITORY and the difference is not
cosmetic, so the count above is stated with it attached rather than left to be
discovered in the entry: `scripts/verify-acceptance-ref-state.sh` scans this
repository's own acceptance suite, which is the code here that plays a
consumer's part, and nothing scans a consumer's step modules automatically. For
a CONSUMER the invariant remains a reviewed convention unless they wire it in
themselves: `scripts/templates/verify-consumer-ref-state.sh` (LINT-01,
`spec/roadmap.md` § shipped) is the same scan, generalized into a template a
consumer copies into their own repository and runs in their own CI — this
package does not run it against a consumer's tree automatically, and shipping
the template does not by itself make the invariant enforced for a consumer who
has not adopted it. Stated per `AGENTS.md` §4 ("say only what is true"), which
cuts both ways: an enforced invariant must not be described as unenforced
either. `spec/roadmap.md` is the single source of truth for what's actually
built.

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
`layer(...)` in its NAMED form, which opens the Feature's own `describe` block and
builds the tier in that block's `beforeAll`, releasing it in that block's
`afterAll` — so the tier lives exactly as long as the Feature's block (F-09), and
is ambient on every node emitted inside it whose BODY needs it. The library's own
always-passing unused-step-definition nodes are deliberately routed off that path
through the module-level, Layer-free constructor the default path already uses —
the choice is made per node by a routing field on the library's own emission
options, read only at the composition root — and a Feature with no runnable
Scenario at all is routed through the plain adapter before any block opens. The
consequence a caller can rely on: a Feature whose Scenarios are all removed by a
registration-time tag filter never builds its shared tier, so the tier stays as
deferred as asking for it implies.

Wherever a body DOES need the shared tier — every Scenario, and the Feature's
own `AfterAllScenarios` teardown hook, which reaches the identical build through
the block's memo map — the tier is NOT re-provided inside any Scenario Effect, so
it is built once and every such body reaches that one build. The
per-Scenario tier is still supplied once around each Scenario Effect and is still
rebuilt on every execution, exactly as it is on the default path.
`packages/vitest/src/describeFeature.ts` is the one branch point
(`collection.sharedLayer === null` selects the default path), and
`packages/vitest/src/ScenarioEffect.ts` is unchanged by the distinction — it
provides whatever per-Scenario Layer it is handed and has never heard of the two
paths.

**Assertions.** `packages/vitest/test/emission.test.ts` runs one Feature with both
tiers instrumented by build counters and asserts the pair side by side: the shared
ordinals each Scenario reached are `[1, 1, 1]` and the per-Scenario ordinals in the
SAME Feature are `[1, 2, 3]`. The second array is the half that catches an over-fix
— a change memoising both tiers satisfies the first and breaks this invariant for
every Feature that asked for a shared scope.

The same file's "a shared Layer with every Scenario excluded stays unbuilt, even
with an unused step definition (10-07)" block covers the zero-runnable-Scenario
case the pair above does not: a Feature with both tiers declared, an `excludeTags`
filter removing its one Scenario, and one unused step definition, asserts the
shared build counter stays at `0`. Named explicitly because a reader who does not
know it exists could otherwise read that assertion as a claim satisfiable by
suppressing warnings: the SAME block also asserts the unused step definition is
STILL REPORTED — the load-bearing non-vacuity control, without which the counter
assertion would pass just as easily because nothing was ever emitted at all, rather
than because something was emitted and did not force a build.

`scripts/verify-shared-layer-once.sh` (`pnpm verify:shared-layer-once`) is the
other half, run from outside the process entirely: three real `vitest` CLI runs
against a committed fixture Feature — the whole file, the file narrowed with `-t`
to the clock-isolation Scenario alone, and the file narrowed with `-t` to the
shared-build Scenario alone. The build-once claim is carried as two INDEPENDENT
"passed" assertions — one on the shared-build Scenario's status in the whole run,
one on its status in the run narrowed to it alone — never as a compared count. The
whole-vs-filtered EQUALITY claim compares the clock-isolation Scenario's REPORTED
STATUS between the whole run and the run narrowed to it, which an in-process test
structurally cannot show.

"Fresh every Scenario" therefore remains true of the per-Scenario tier on BOTH
scopes, and is deliberately FALSE of the shared tier, which is the entire point of
asking for one. The two once-per-Feature hooks are typed by the shared tier alone
(`FeatureDsl<ROut, RShared>`, F-10) and are handed no per-Scenario build, so
nothing that runs once per Feature can touch a tier that is fresh every Scenario
— asserted by `scripts/verify-tsgo-gate.sh`'s once-per-Feature fixture. What a `shared` Layer never costs a Scenario is its own simulated
clock and its own console: those stay per-Scenario on both paths (BEH-EC-012,
ADR-EC-018), so opting into shared state is a choice about the caller's own
services and never silently about the test environment.

**Implication**: a `Given`/`When`/`Then` author can rely on a clean World for
every Scenario without writing manual reset logic, _unless_ that Scenario
opts into a `shared` Layer — in which case decision
[ADR-EC-006](decisions/006-two-layer-scopes-only.md) makes the author
responsible for resetting shared state themselves (e.g. in `Background`).

> **Correction (2026-09-03, `@retry`, [ADR-EC-034](decisions/034-retry-tag-wraps-flakytest-at-the-testapi-seam.md)):**
> "fresh every Scenario" now reads more precisely as "fresh every ATTEMPT" — a Scenario tagged `@retry` is wrapped
> in `flakyTest`, whose `Effect.retry` re-interprets the WHOLE composed Scenario Effect from scratch on each
> attempt, `Effect.provide(effectiveLayer)` included, so a retried Scenario rebuilds its per-Scenario Layer once
> per attempt rather than once total. This is not a narrowing of the invariant — for an untagged Scenario "every
> Scenario" and "every attempt" are the same single event, so nothing here changes for the common case — it is a
> more precise restatement now that a Scenario can genuinely have more than one attempt. The `shared` half is
> UNAFFECTED: a `shared` Layer beside a `@retry` Scenario still builds exactly once, because its own `Effect.provide`
> is composed outside the retried region by construction (`ADR-EC-034` design question 1). Measured by
> `packages/vitest/test/emission.test.ts`'s retry block (`[1, 2]` per-Scenario ordinals against `[1, 1]` shared
> ordinals, same retried Scenario) and `packages/vitest/test/acceptance/retry.feature`/`.steps.test.ts`
> (`REQ-EC-026`).

**Related**: [BEH-EC-004](behaviors/01-steps-and-world.md), [ADR-EC-006](decisions/006-two-layer-scopes-only.md),
[BEH-EC-026](behaviors/14-scenario-retries.md), [ADR-EC-034](decisions/034-retry-tag-wraps-flakytest-at-the-testapi-seam.md).

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
(the pitfalls research archived on the `planning-archive` branch, Pitfall 6). The practical rule: an `any`
reaching a step body's declared type is a defect in that step, not a permitted
escape hatch — the compile-gate fixtures under
`packages/vitest/test/tsgo-gate/` are asserted to contain none. As of Phase 11
the same prohibition is asserted over the acceptance suite by
`scripts/verify-acceptance-no-any.sh`, and the configuration a CONSUMER sets in
their own build to keep this boundary from opening in their step modules — this
repository cannot see that build, so it is a recommendation and not an
enforcement — is in
[`packages/vitest/README.md` § Recommended lint and compiler configuration](../packages/vitest/README.md#recommended-lint-and-compiler-configuration-for-your-step-modules).

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

**Source**: stated in [ADR-EC-009](decisions/009-cross-step-state-lives-in-a-ref.md),
demonstrated in [BEH-EC-011](behaviors/03-rules-outlines-and-testclock.md#beh-ec-011-cross-step-state-lives-in-world-never-a-closure),
and — as of Phase 11 — enforced over the acceptance suite by
`scripts/verify-acceptance-ref-state.sh`, which fails if any
`packages/vitest/test/acceptance/*.steps.test.ts` declares a `let` or `var` at
any scope, or writes to a value in place.

Be precise about the scope of that enforcement, because it is narrower in one
direction and wider in another, and both matter.

WIDER than the invariant, on the files it reaches: the invariant forbids a bare
closure variable _declared inside a `Scenario`/`Rule`/`Background` callback_,
whereas the gate forbids a `let` or `var` declared **at any scope** in an
acceptance step module — module scope, a helper function's body, a Layer
constructor. That is a deliberate superset. A structural scan cannot tell which
declarations a step body closes over without resolving scope, and the wider rule
is one this repository's own suite can live under, so it is asserted rather than
approximated.

NARROWER than the invariant, on two counts. First, it is a scan of
DECLARATIONS, so PROH-11-03's module-scope `const` holder written to by a step —
a `const` array that a step `push`es to — is caught only in its common
in-place-mutator form (assertion 4), not in general. Second and more
importantly, it covers the ACCEPTANCE SUITE only: the suite whose whole purpose
is to run the library the way a consumer does. For a CONSUMER's own step modules
the invariant remains a reviewed convention unless they adopt it themselves.
**LINT-01** — `scripts/templates/verify-consumer-ref-state.sh`, the same scan
generalized into a copyable template (glob and carve-out count as arguments
instead of this repository's own hardcoded paths) — is the mechanism a consumer
wires into their own CI to close that half; this package ships the template but
does not run it against a consumer's tree itself. See
`packages/vitest/README.md`'s "Recommended lint and compiler configuration"
section and the v2 backlog archived on the `planning-archive` branch (an
oxlint-plugin version, still deferred — `spec/roadmap.md` § Under
consideration).

**Implication**: the reason this matters — `Scenario(name, () => {...})`'s
callback runs once, at registration time, not once per test execution. A bare
`let` is shared across every retry/re-run of that Scenario's `it.effect`,
silently leaking state between them.

**Related**: [ADR-EC-009](decisions/009-cross-step-state-lives-in-a-ref.md).

---

## INV-EC-007: A Scenario's ambient `Random` is seeded, deterministic, and distinct per Outline row

Every emitted Scenario's composed Effect runs with `effect/Random` seeded from
its own Feature's `uri` and its own fully emitted title (Outline-row and
duplicate-occurrence disambiguation already applied by `OutlineTitle.ts`) — a
step reading `Random.next`/`Random.nextIntBetween`/etc. observes a value that
is reproducible across runs and distinct from any other Scenario or Outline row
whose emitted title differs.

**Source**: `packages/vitest/src/Runner.ts`'s `buildSeededScenarioEffect`,
wrapping `buildScenarioEffect`'s result in `Random.withSeed(effect,
scenarioSeed(featureUri, emittedTitle))` (`packages/vitest/src/ScenarioSeed.ts`)
before it reaches the test framework — applied uniformly on both the plain and
`shared` Layer paths, since `Runner.ts` is the one composition point both paths
share (see [ADR-EC-031](decisions/031-random-withseed-wraps-the-scenario-effect-not-a-layer.md)
for why this is a combinator wrap rather than a `Layer` joining `testEnv`, and
for why it does not collide with INV-EC-002/ADR-EC-018's `TestClock`/
`TestConsole` isolation — a different service, wrapped independently, around
the same per-Scenario Effect).

**Enforced by**: `packages/vitest/test/acceptance/random-seeding.feature` +
`.steps.test.ts` (`@REQ-EC-024`) against the real runner, and
`packages/vitest/test/ScenarioSeed.test.ts` for the pure derivation function.

**Implication**: a step that generates test data via `effect/Random` gets
reproducible-but-varied fixtures with zero setup — the same value on every CI
run and every local re-run, while two Outline rows exercising the "same" step
pattern against different Examples still draw independent sequences, so neither
row's randomness can accidentally mask the other's.

**Related**: [ADR-EC-018](decisions/018-shared-layer-testclock-isolation.md)
(the sibling per-Scenario isolation guarantee for `TestClock`/`TestConsole`,
which this invariant deliberately does not touch or depend on).

---

## INV-EC-008: A Scenario's terminal-outcome metric is recorded exactly once, reflecting only its final attempt

Every emitted Scenario contributes exactly ONE increment to the `effect_cucumber.scenario.result`
counter and exactly ONE sample to the `effect_cucumber.scenario.duration` histogram, tagged by its
FINAL outcome alone. A Scenario tagged `@retry` that fails on one or more attempts before eventually
passing (or exhausts `flakyTest`'s own retry schedule and fails) contributes neither an extra
increment nor an extra sample for any intermediate attempt — an attempt's own failure is never
separately counted as `outcome: "fail"`.

**Source**: `packages/vitest/src/VitestTestApi.ts`'s `withMetrics` composes `withScenarioMetrics`
(`packages/vitest/src/ScenarioMetrics.ts`) OUTSIDE `withRetry`'s `flakyTest` wrap — never inside it,
and never at `packages/vitest/src/Runner.ts`'s own emission call sites, where an earlier spike
(`research/metric-wiring-spike.md`) first wired this, before `@retry` existed. `Effect.exit` inside
`withScenarioMetrics` therefore only ever observes whatever `flakyTest`'s own `Effect.retry` produces
AFTER it settles — the fully-retried, terminal `Exit` — because every intermediate attempt is resolved
and discarded entirely INSIDE `flakyTest`, strictly below where this wrapper's own `Metric.update`
calls run. See [ADR-EC-037](decisions/037-effect-metric-wraps-outside-flakytest-in-vitesttestapi.md)
for the full composition-point reasoning, including why `EmitOptions` needed a new `scenario: boolean`
field this invariant's own enforcement additionally depends on (a warning node emitted through the
identical seam must never be measured at all, not merely never double-counted).

**Enforced by**: `packages/vitest/test/ScenarioMetrics.test.ts` — `withScenarioMetrics` driven
directly against a synthetic Effect that fails once then passes, composed the REAL way
(`withScenarioMetrics(flakyTest(...))`, exactly one terminal increment and one duration sample) and,
as a mutation-style demonstration in the same file, the WRONG way (`flakyTest(withScenarioMetrics(...))`,
which genuinely records two of each) — and
`packages/vitest/test/acceptance/metrics.feature`/`.steps.test.ts` (`@REQ-EC-029`) against the real
running framework: a Feature with one plain-passing Scenario and one `@retry`'d fail-then-pass
Scenario, where an observer reads `Metric.value` after both complete and finds exactly two
`outcome: "pass"` increments, zero `outcome: "fail"`, and two duration samples.

**Implication**: a consumer charting `scenario.result`'s pass/fail ratio sees each Scenario counted
exactly once regardless of how many attempts `@retry` needed — a dashboard built against this metric
cannot be skewed by a flaky Scenario's own retry count, and a Scenario that ultimately fails after
exhausting its retry schedule is counted as one failure, not eleven (`flakyTest`'s own
`Schedule.recurs(10)` plus the original attempt).

**Related**: [BEH-EC-029](behaviors/16-scenario-metrics.md),
[ADR-EC-037](decisions/037-effect-metric-wraps-outside-flakytest-in-vitesttestapi.md),
[ADR-EC-034](decisions/034-retry-tag-wraps-flakytest-at-the-testapi-seam.md) (the retry mechanism this
invariant composes around, never inside).

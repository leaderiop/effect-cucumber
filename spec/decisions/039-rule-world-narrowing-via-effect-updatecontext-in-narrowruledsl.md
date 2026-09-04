# ADR-EC-039: A Rule can narrow or replace the ambient World its own Scenarios see — a third `RuleRegistrar` overload backed by real `Effect.updateContext` calls in `narrowRuleDsl`

> **Status:** Accepted and implemented — a third `RuleRegistrar` overload
> (`packages/vitest/src/Dsl.ts`), the runtime helper `narrowRuleDsl`
> (`packages/vitest/src/RuleNarrowing.ts`), and the four-argument `Rule(...)` arity
> (`packages/vitest/src/Collect.ts`), proven by `packages/vitest/test/RuleNarrowing.test.ts`, the
> real compile-gate fixture pair
> (`packages/vitest/test/tsgo-gate/src/rule-narrowing-satisfied.ts` /
> `-starved.ts`, `scripts/verify-tsgo-gate.sh` assertions 15–16), and the acceptance pair
> (`packages/vitest/test/acceptance/rule-world-narrowing.feature`/`.steps.test.ts`, `@REQ-EC-031`)
> **Date:** 2026-09-04
> **Context:** implements the "A Rule that can narrow or replace the ambient World's
> `Context.Service`" entry locked under `spec/roadmap.md`'s § Planned
> ([#23](https://github.com/leaderiop/effect-cucumber/issues/23), itself downstream of
> [#22](https://github.com/leaderiop/effect-cucumber/issues/22)), building on a real, working spike
> (`origin/spike/rule-world-narrowing`, `research/rule-world-narrowing-spike.md`) that proved the
> signature and the `Effect.updateContext` mechanism type-check and run correctly in a LOCAL
> reconstruction, isolated from the real registration/collection pipeline — re-verified and wired
> into that real pipeline here, against a `main` the spike's own write-up flagged as having moved
> materially since (retries, tagged hooks, Attachments and Metric wiring all touched `Dsl.ts`-adjacent
> files and the DSL surface)

## Context

Every prior Rule/Scenario extra-Layer mechanism ([ADR-EC-010](010-rule-and-scenario-scoped-extra-layers.md))
only ever GROWS what a step may reach for: `RuleDsl<ROut | R2>`'s union means a Rule-scoped step's
required context is always a SUPERSET of the Feature's ambient one, never a different or narrower
shape. The downstream "BDD Quality Ceiling" audit that started this body of work identified this as
the one gap no code-only fix in a CONSUMER's own repository could reach — an actual framework
capability was needed, not better code around the existing one. The motivating case (the audit
tool this ADR's own fixtures use throughout): two mutually-exclusive `When` steps populate disjoint
result shapes — "the audit produced a remediation report" vs. "the audit produced a BOM export" —
and a Rule author wants each Rule's own Scenarios to see ONLY its own result shape, with the OTHER
Rule's shape, and the Feature's own ambient service, both structurally unreachable, not merely
unused by convention.

The spike (`research/rule-world-narrowing-spike.md`) proved, with real compiler output, that a third
`RuleRegistrar` overload backed by `Effect.updateContext` achieves exactly this — both the positive
direction (the narrowed World type-checks and runs correctly, real service values reached only
through the reshaped Tags) and, more importantly, the negative direction the current
`RuleDsl<ROut | R2>` union structurally cannot express: a step reaching for the Feature-level
ambient service is rejected BY NAME (`effect(missingEffectContext)`), the same diagnostic this
repo's whole tsgo gate already keys off. But the spike was explicit about its own limits: every
type in it was a LOCAL reconstruction, deliberately isolated from `Dsl.ts`/`Collect.ts`, and its
`narrowRuleDsl` helper handled only a trimmed three-registrar `RuleDsl` (`Given`/`When`/`Then`
alone) — not the real `RuleDsl<ROut>`, which also carries `And`/`But`/`use`/`Background`/`Scenario`
and the four tag-expression-scoped hooks (ADR-EC-035). Wiring this for real meant answering a
question the spike never had to: what does narrowing mean for EVERY member of the real interface,
not just three of them.

## Decision

### 1. The signature — the third `RuleRegistrar` overload, additive

```ts
// packages/vitest/src/Dsl.ts
export interface RuleRegistrar<ROut> {
  (name: string, define: (dsl: RuleDsl<ROut>) => void): void
  <R2, E2>(name: string, extraLayer: Layer.Layer<R2, E2, any>, define: (dsl: RuleDsl<ROut | R2>) => void): void
  <R2, E2, RNarrowed>(
    name: string,
    extraLayer: Layer.Layer<R2, E2, any>,
    narrow: (dsl: RuleDsl<ROut | R2>) => RuleDsl<RNarrowed>,
    define: (dsl: RuleDsl<RNarrowed>) => void
  ): void
}
```

Verbatim the spike's own derived shape. `RNarrowed` is genuinely free — inferred from `narrow`'s
own RETURN type, not from `ROut`/`R2` — so it may be, and in the acceptance pair IS, completely
disjoint from the wide `ROut | R2`. The first two overloads are byte-for-byte unchanged; a Rule that
never uses `narrow` compiles and runs exactly as before, confirmed by the "CONTROL" cases both the
`rule-ok.json`/`rule-narrowing-ok.json` fixtures carry.

### 2. The runtime mechanism — `narrowRuleDsl`, a real library-exported helper covering the WHOLE `RuleDsl<ROut>` interface

`packages/vitest/src/RuleNarrowing.ts` exports `narrowRuleDsl(dsl: RuleDsl<Wide>, project:
WorldProjection<Wide, Narrow>): RuleDsl<Narrow>`, which the Rule author calls from inside `narrow`:
`Rule(name, extraLayer, (dsl) => narrowRuleDsl(dsl, project), define)`. `project` mirrors
`Effect.updateContext`'s own `f` parameter exactly:

```ts
export type WorldProjection<Wide, Narrow> = (
  context: Context.Context<Wide | Scope.Scope | Attachments>
) => Context.Context<Narrow | Scope.Scope | Attachments>
```

This is the ONE real divergence from the spike's own signature, and a necessary one: the spike's
trimmed `RuleDsl` predates neither `Scope.Scope` (which it did thread through) NOR `Attachments`
(ADR-EC-036, which postdates the spike's own local reconstruction and which `StepRegistrar`/
`TaggedHookRegistrar` — the REAL ones — already add to a body's required context union). A `project`
that forgot to thread `Attachments` through would leave a narrowed step body requiring
`Narrow | Scope.Scope | Attachments` while `project` only ever produced `Narrow | Scope.Scope` —
correctly caught at compile time (`effect(missingEffectContext)` naming `Attachments`), never
silently.

Every member of the real `RuleDsl<ROut>` is covered, not just the three the spike trimmed to:

- **`Given`/`When`/`Then`/`And`/`But`**: each narrowed registrar normalises the author's body
  through the SAME `Step.ts` `register` helper the ordinary path uses (so a bare generator still
  gets `Effect.fn(pattern)`'s span naming, identically), then wraps the normalised
  `(...params) => Effect` with `Effect.updateContext(effect, project)` before handing it to the
  underlying WIDE registrar as an already-Effect-returning function. `Step.ts`'s own
  generator-function check correctly leaves an already-Effect-returning function untouched, so
  nothing double-wraps.
- **`use` (a step module, ADR-EC-027)**: each `ModuleStep.body` is wrapped identically. `use`'s real
  implementation (`Collect.ts`) never reads `module.requires` at runtime — it exists purely as a
  compile-time witness the tsgo gate checks at the `use(module)` call site — so `narrowRuleDsl`
  passes it through unchanged rather than reconstructing a wide-typed one; only `steps` (the part
  actually registered) is transformed.
- **`Background`**: the narrowed dsl's `Background` calls the underlying WIDE `Background`, and
  wraps the `Given`/`And` pair its callback receives the same way the top-level registrars are
  wrapped (ADR-EC-017's "Given/And only" contract is untouched).
- **`Before`/`After`/`BeforeStep`/`AfterStep`**: each is narrowed through the same
  `Hook.ts`/`registerHook` normalisation the ordinary path uses, preserving both call shapes
  (unconditional, and the leading-tag-expression form ADR-EC-035 added) — the tag expression itself
  passes through untouched; only the hook BODY is retyped.
- **`Scenario`**: the plain two-argument form is narrowed the same way — a Scenario nested in a
  narrowed Rule sees the SAME narrowed World for its own steps. The three-argument
  (Scenario-level `extraLayer`) form is explicitly NOT supported inside a narrowed Rule — see §3.

Because a narrowed step's stored body is, after wrapping, a real `Effect<A, E, Wide | Scope.Scope |
Attachments>` (the SAME shape an ordinary, un-narrowed Rule step already has — `Effect.updateContext`
retypes the effect's PUBLIC required-context type back to the wide one, per its own real signature,
`<A, E, R, R2>(self: Effect<A, E, R>, f: (context: Context<R2>) => Context<NoInfer<R>>): Effect<A, E,
R2>`), it is indistinguishable, to `Registry.ts`/`Plan.ts`/`Runner.ts`, from an ordinary step. **No
other runtime module changed.** `Collect.ts`'s `Rule(...)` implementation gained exactly one new
branch: detect the four-argument arity, call `narrow(ruleDsl)` once, and hand its RETURN VALUE (not
`ruleDsl` itself) to `defineRule` — every other computation in that closure (`resolveRuleId`,
`ruleAmbientLayer` via `Layer.provideMerge`, `ruleLayers.set`, the four Rule hooks' registration)
is byte-identical whether or not `narrow` was supplied, because narrowing only ever reshapes the
dsl OBJECT a Rule's `define` callback receives, never the Layer/registry bookkeeping that decides
what actually gets built and run.

### 3. One real, disclosed limitation: a Scenario's own `extraLayer` does not compose with Rule narrowing

`RuleDsl<RNarrowed>` still structurally carries the FULL `ScenarioRegistrar<RNarrowed>` interface —
both call signatures — because TypeScript has no way to express "this overload doesn't exist" on an
interface `narrowRuleDsl` must return as a whole. Composing a Scenario's own extra Layer (which adds
a REAL new `R2` to the actual runtime context) with a Rule's World narrowing (which reshapes what a
step is TYPED to see) is real, unexplored, untested complexity: the projection `project` a Rule
author writes types the AMBIENT context as exactly `Wide | Scope.Scope | Attachments`, with no
provision for an extra `R2` a nested Scenario might separately inject. Rather than attempt an
unverified composition — the task's own instruction is explicit that shipping something that
type-checks but silently mis-narrows at runtime "would be worse than not shipping at all" —
`narrowRuleDsl`'s narrowed `Scenario` registrar throws a synchronous, descriptive `Error` at
REGISTRATION time (mirroring [ADR-EC-019](019-fail-loudly-on-unmatched-or-ambiguous-steps.md)'s
"fail loudly" precedent) the moment a three-argument `Scenario(...)` call is made inside a narrowed
Rule's `define` callback, naming the Scenario and pointing at the two real workarounds: promote the
service to the Rule's own `extraLayer` (so `project` can reshape it too), or declare that Scenario
without an extra Layer of its own. This is a real, disclosed cost, not a hidden gap — a Rule author
who never nests a Scenario-level extra Layer inside a narrowed Rule never encounters it, and one who
does gets a clear, immediate, loud failure at collection time rather than a subtly wrong World at
run time.

### 4. The second real, disclosed cost — carried over from the spike, re-confirmed against the real interface

`project` is hand-written per Rule, by the Rule's author, with real code that reaches into the wide
context and reshapes it — `narrowRuleDsl` mechanically wraps every registrar, but it cannot
auto-derive what a narrower World's fields MEAN. For the audit-tool motivating case, a Rule author
declaring `RemediationWorld` has to write a real function that knows how to build one out of what
the wide context actually provides (`FeatureService`/`RemediationService`). This is now a slightly
larger surface than the spike measured, because the real `project` must also thread `Attachments`
through in addition to `Scope.Scope` (§2) — a small, mechanical addition (both fixtures do it
identically, one line each), not a qualitatively new burden. "Give me a narrower Rule" remains never
a single flag or an auto-derived subset the way `Context.pick` is for a literal subset of an
existing shape (`research/effect-context-narrowing.md`'s own negative finding) — it is a reshaping
function, strictly more powerful than a subset operation and strictly more work per Rule.

## Does not reopen ADR-EC-006

[ADR-EC-006](006-two-layer-scopes-only.md) fixes exactly two Layer-BUILD scopes: per-Scenario
default, per-Feature `shared` opt-in — a statement about WHEN a Layer is constructed and how long it
lives. This ADR adds neither: `narrowRuleDsl` builds no Layer, memoizes nothing, and does not change
when `ruleAmbientLayer` is constructed or how long it lives (still exactly once per `Rule(...)`
call, still per-Scenario lifetime, unchanged code path in `Collect.ts`). It narrows the RESULT TYPE
a Rule's Scenarios see of a Layer that was ALREADY going to be built the same way — a compile-time
(and, via `Effect.updateContext`, a real per-step-execution) RESHAPING of an existing context value,
not a new build-once tier. A narrowed Rule's `ruleAmbientLayer` is looked up from the exact same
`ruleLayers` map, by the exact same `ruleId`, through the exact same `Runner.ts` emission path every
other Rule already uses.

## Consequences

**Positive**:

- Closes the one gap the downstream "BDD Quality Ceiling" audit identified as unreachable by any
  code-only fix in a consumer's own repository — a real type-level AND run-time boundary between
  two Rules' disjoint result shapes, proven both directions with real compiler diagnostics and a
  real running acceptance pair.
- Fully additive: the existing two `RuleRegistrar` overloads, every other DSL member, and every
  other runtime module (`Registry.ts`, `Plan.ts`, `Runner.ts`, `Hook.ts`, `HookRegistry.ts`) are
  byte-for-byte unchanged. A consumer who never calls the new overload observes no difference
  whatsoever.
- The mechanism generalises past the two-Rule audit-tool example: any Rule wanting a
  differently-shaped World — not merely a wider union — now has a real, sound path, backed by the
  same `Effect.updateContext` primitive Effect itself ships, not a library-invented cast.

**Negative**:

- `project` is hand-written per Rule (§4) — a real, ongoing authoring cost this ADR states plainly
  rather than hides, the same way `INV-EC-003`'s `any`-boundary cost is documented rather than
  hidden.
- A Scenario's own extra Layer cannot be nested inside a narrowed Rule (§3) — a real, if narrow, gap
  in composability, mitigated by a loud synchronous failure rather than a silent one.
- `RuleNarrowing.ts` is a genuinely new module whose correctness depends on staying in lock-step
  with every OTHER `RuleDsl<ROut>` member `Dsl.ts` might grow in the future — a new hook kind or
  container added to `RuleDsl` without a corresponding narrowing case in `RuleNarrowing.ts` would
  silently make that member unnarrowable (a `Rule` author who tries to use it inside a narrowed dsl
  would get a real TypeScript error, since `narrowRuleDsl`'s return type would fail to satisfy
  `RuleDsl<Narrow>` — so a MISSING case fails LOUD, at the library's own build, not a consumer's).

**Trade-off accepted**: a hand-written `project` function, and no Scenario-level `extraLayer` inside
a narrowed Rule, in exchange for a real, sound, additive narrowing mechanism that needed no new
Layer-composition primitive and no change to any module outside `Dsl.ts`/`RuleNarrowing.ts`/
`Collect.ts`.

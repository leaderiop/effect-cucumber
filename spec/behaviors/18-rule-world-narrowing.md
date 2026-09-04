# 18 — Rule World narrowing

A fourth `Rule(...)` arity — `Rule(name, extraLayer, narrow, define)` — that narrows or replaces
(not merely extends) the World a Rule's own Scenarios see, backed by real `Effect.updateContext`
calls.

> **See:** [ADR-EC-039](../decisions/039-rule-world-narrowing-via-effect-updatecontext-in-narrowruledsl.md)

See [`spec/roadmap.md`](../roadmap.md) for what is built versus what is only specified — this
document describes the contract, not the build status.

---

## BEH-EC-031: `Rule(name, extraLayer, narrow, define)` narrows a Rule's own Scenarios to a genuinely different `RuleDsl<RNarrowed>`, real at both compile time and run time

```
REQUIREMENT: `RuleRegistrar<ROut>` MUST accept a fourth arity, additive alongside the existing
             two-argument `Rule(name, define)` and three-argument
             `Rule(name, extraLayer, define)` forms:
             `Rule(name, extraLayer, narrow, define)`, where `narrow` is
             `(dsl: RuleDsl<ROut | R2>) => RuleDsl<RNarrowed>` for a genuinely
             free `RNarrowed`, inferred from `narrow`'s own RETURN type — NOT
             constrained to be a subtype or supertype of `ROut | R2`, and in
             particular allowed to be completely disjoint from it. `define`
             then receives `RuleDsl<RNarrowed>`, not `RuleDsl<ROut | R2>`.
             The existing two- and three-argument forms MUST remain
             byte-for-byte unchanged — a Rule that never uses the fourth
             arity compiles and runs exactly as it did before this behavior
             existed.
```

```
REQUIREMENT: `narrowRuleDsl(dsl: RuleDsl<Wide>, project: WorldProjection<Wide, Narrow>):
             RuleDsl<Narrow>` MUST be exported from the package's public barrel, as the sanctioned
             way to produce the `RuleDsl<RNarrowed>` a `narrow` callback returns —
             `Rule(name, extraLayer, (dsl) => narrowRuleDsl(dsl, project), define)`. `project`
             MUST be typed `(context: Context.Context<Wide | Scope.Scope | Attachments>) =>
             Context.Context<Narrow | Scope.Scope | Attachments>` — mirroring
             `Effect.updateContext`'s own `f` parameter exactly, so that a `project` which forgets
             to thread `Scope.Scope` or `Attachments` through is rejected AT COMPILE TIME
             (`effect(missingEffectContext)` naming the forgotten one) rather than producing a
             narrowed step that silently cannot run.
```

```
REQUIREMENT: `narrowRuleDsl`'s returned `RuleDsl<Narrow>` MUST cover every member of the real
             `RuleDsl<ROut>` interface, not a subset: `Given`/`When`/`Then`/`And`/`But`, `use`
             (a step module's registered steps, ADR-EC-027), `Background` (`Given`/`And`,
             ADR-EC-017), `Before`/`After`/`BeforeStep`/`AfterStep` (both the unconditional and the
             tag-expression-scoped call forms, ADR-EC-035), and `Scenario`'s plain two-argument
             form (which MUST inherit the SAME narrowed World for its own nested steps). A step or
             hook body registered through the narrowed dsl MUST be normalised through the SAME
             `Step.ts`/`Hook.ts` helpers an un-narrowed body is (identical generator-vs-already-Effect
             handling, identical `Effect.fn(pattern)` span naming), then wrapped with
             `Effect.updateContext(effect, project)` BEFORE it reaches step/hook registration — a
             narrowed step's REGISTERED body MUST be a real `Effect<A, E, Wide | Scope.Scope |
             Attachments>`, indistinguishable in storage from an ordinary Rule step's, so that no
             module downstream of registration (step matching, planning, emission) needs to know
             narrowing occurred at all.
```

```
REQUIREMENT: A `Scenario(...)` call using its own three-argument (Scenario-level `extraLayer`)
             form, made INSIDE a narrowed Rule's `define` callback, MUST fail LOUDLY with a
             synchronous `Error` at Feature-registration time, naming the Scenario and the
             limitation — composing a Scenario's own extra Layer with a Rule's World narrowing is
             not supported. This MUST NOT compile-time reject (the returned dsl's `Scenario` field
             is typed as the full `ScenarioRegistrar<RNarrowed>`, both overloads, since
             `RuleDsl<RNarrowed>` cannot structurally omit one) and MUST NOT silently produce an
             incorrectly-narrowed World; it MUST throw before any step inside that Scenario call
             could register or run.
```

```
REQUIREMENT: A step inside a narrowed Rule reaching for a SIBLING Rule's own narrowed World, or
             for the Feature-level AMBIENT service `narrow`'s `project` does not reshape into the
             narrowed World, MUST be rejected at compile time by name
             (`effect(missingEffectContext)`) — the exact diagnostic this repository's tsgo gate
             already keys off everywhere else. This is the case the PLAIN three-argument
             `RuleDsl<ROut | R2>` union structurally cannot express, since `|` only ever grows what
             a step may reach for; the narrowed dsl's returned type MUST NOT still include `ROut`.
```

```
REQUIREMENT: The `narrow` callback's real reshaping MUST be observable at RUN TIME, not merely at
             the type level: a narrowed step's `Effect.updateContext`-wrapped body, executed
             against the Rule's real merged Layer (the SAME `Layer.provideMerge(featureLayer)
             (extraLayer)` value an un-narrowed Rule's steps already run against — narrowing
             changes no Layer-build behavior, see ADR-EC-039's "does not reopen ADR-EC-006"
             section), MUST produce the REAL, live service value `project` reaches into the wide
             context for — not a placeholder, not a value reconstructed independently of the
             actual ambient Layer.
```

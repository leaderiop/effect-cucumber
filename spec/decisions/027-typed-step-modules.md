# ADR-EC-027: Cross-Feature step reuse through typed step modules

> **Status:** Accepted and implemented — `packages/vitest/src/StepModule.ts` and `use` on every `ScenarioDsl`, observed by `packages/vitest/test/StepModule.test.ts`, the tsgo-gate pair `step-module-satisfied.ts` / `step-module-missing-service.ts`, and the acceptance pair `packages/vitest/test/acceptance/step-modules.feature`
> **Date:** 2026-09-02
> **Context:** closes the "Reusable step definitions across Scenarios/Features" gap `spec/roadmap.md` § Planned had deferred, and the audit's finding F-29; a new ADR rather than an amendment because no prior decision addressed reuse at all

## Context

Every step definition was registered inside one `describeFeature` call, through a registry that is
a closure of that call ([ADR-EC-003](003-describefeature-takes-a-layer.md), `Registry.ts` note (a)
forbidding module-level state). That is what makes a step's required context checkable against the
Feature's Layer (INV-EC-003) — and it is also why two Feature files could not share a step without
copying it. Every comparable library solves reuse with a global, untyped registry, which was exactly
the reason this project deferred it: a shared step's `R` has to be reconciled against every
consuming Layer, and nothing in the ecosystem had to do that.

## Decision

A step module is a **value**: `defineSteps<R>(define)` runs `define` against the five step
registrars typed for `R`, records each registration (pattern, normalised body, the call site in the
module file) and returns `{ requires: Effect.Effect<void, never, R>, steps }`. Nothing is
registered by defining a module.

Every `ScenarioDsl` — so `FeatureDsl`, `RuleDsl` and a `Scenario`'s dsl, but not `BackgroundDsl` —
gains `use(module)`, which registers the module's steps into the CURRENT scope frame of the
registry, exactly as if each had been written in that container. Scope, ambiguity and
definition-site ordering therefore need no new mechanism: `Plan.ts` sees ordinary registrations.

`R` is reconciled against the consuming container's `ROut` by ordinary Effect variance on the
`requires` witness: a module needing `Db` is accepted where the ambient Layer provides `World | Db`
and rejected where it provides `World` only. `use`'s parameter is spelled as an anonymous
structural type whose first property is that witness, because that is the spelling under which
`@effect/tsgo` reports the rejection as `effect(missingEffectContext)`; the named `StepModule<ROut>`
form was measured to report a bare `TS2345` instead. `R` is declared, default `never`, never
inferred.

## Alternatives considered

1. **A global registry, as `cucumber-js` has.** Rejected: module-level mutable state is forbidden
   (`Registry.ts` note (a), INV-EC-002's per-call registries), and an untyped shared registry is the
   thing this project exists not to be — the deferral reason itself.
2. **`use: (module: StepModule<ROut>) => void`.** Rejected after measurement: the diagnostic name
   is lost, and ADR-EC-016's gate is what keeps INV-EC-003 from decaying into "rejected somehow".
3. **Modules that carry their own Layer.** Rejected: a module must not provide, only require;
   provision is the Feature's decision ([ADR-EC-006](006-two-layer-scopes-only.md)), and a module
   with a Layer would rebuild resources per Feature in ways the two-tier model does not describe.

## Consequences

- A consumer writes `defineSteps<World>(…)` in a shared file and `use(module)` in each Feature.
  The compile-time check moves from the step to the `use` call and keeps its name.
- A module used twice in one scope is an `AmbiguousStep` per pattern, like any duplicate.
- Modules compose: a module's own dsl has `use`.
- `Background` cannot `use` a module; its grammar is `Given`/`And` only ([ADR-EC-017](017-background-and-scenario-are-step-definition-containers.md)).
- The structural parameter spelling is load-bearing and is pinned by the tsgo-gate pair.

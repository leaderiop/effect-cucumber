# 08 — Step modules

How step definitions are shared across Scenarios, Rules and Feature files without a global
registry and without losing the compile-time check that a step's Effect only uses services the
consuming Feature's Layer provides.

See [`spec/roadmap.md`](../roadmap.md) for what is built versus what is only specified — this
document describes the contract, not the build status.

---

## BEH-EC-019: Typed step modules are reusable across Features

> **Invariant:** [INV-EC-003](../invariants.md#inv-ec-003-a-steps-effect-can-only-use-services-the-ambient-layer-provides)
> **See:** [ADR-EC-027](../decisions/027-typed-step-modules.md), [ADR-EC-003](../decisions/003-describefeature-takes-a-layer.md)

```ts
export interface StepModule<R> {
  readonly requires: Effect.Effect<void, never, R> // type-level witness; Effect.void at runtime
  readonly steps: ReadonlyArray<ModuleStep>
}
export const defineSteps: <R = never>(define: (dsl: ScenarioDsl<R>) => void) => StepModule<R>

// On every ScenarioDsl (so on FeatureDsl and RuleDsl too; not on BackgroundDsl):
readonly use: (module: {
  readonly requires: Effect.Effect<void, never, ROut | Scope.Scope>
  readonly steps: ReadonlyArray<ModuleStep>
}) => void
```

```
REQUIREMENT: defineSteps<R>(define) MUST return a plain value carrying every
             step definition `define` registered, each with its pattern, its
             normalised body and the definition site in the MODULE file, and
             MUST NOT register anything anywhere. `R` is declared by the
             author (default `never`); a step body inside the module that
             requires a service `R` does not name is a compile error at that
             step, by name (effect(missingEffectContext)).

REQUIREMENT: dsl.use(module) MUST register the module's steps into the scope
             of the container the call was made in — Feature-scoped at
             Feature level, Rule-scoped inside a Rule, Scenario-scoped inside
             a Scenario — exactly as if each step had been written there,
             keeping the module's own definition sites so an ambiguity names
             the module file. A module whose `R` names a service the
             container's ambient Layer does not provide MUST be rejected at
             the `use` call, by name (effect(missingEffectContext)). Using one
             module twice in one scope is an AmbiguousStep for each of its
             patterns, like any duplicate registration. `use` is absent from
             BackgroundDsl (ADR-EC-017's grammar).
```

The rejection-by-name half depends on how `use`'s parameter is spelled, and the spelling is
therefore part of the contract: an anonymous structural type whose FIRST property is the Effect
witness. Spelling it as the named `StepModule<ROut>` alias makes TypeScript take a variance
shortcut that reports a bare `TS2345` without the Effect diagnostic — measured against
`typescript@7.0.2` + `@effect/tsgo@0.38.0`, and pinned by the tsgo-gate fixture pair
`packages/vitest/test/tsgo-gate/src/step-module-satisfied.ts` /
`step-module-missing-service.ts`.

`R` is deliberately declared rather than inferred: it sits in a contravariant position, so
inference would resolve it to whatever the body happened to need and constrain nothing (the same
vacuous-generic trap BEH-EC-003's correction records). Writing `defineSteps<World>(…)` is the
price of a module that a Feature lacking `World` cannot `use`.

### Worked example

The acceptance pair `packages/vitest/test/acceptance/step-modules.feature` +
`step-modules.steps.test.ts` executes this shape: the apples steps live in
`step-modules.module.ts`, are `use`d at Feature level, and a second module is `use`d inside a
`Rule`.

```typescript
// doc-examples:skip — illustrative shorthand for two files, not a standalone program (`./world.ts`,
// `limitSteps` and `feature` are never defined here); the real, compiled, executed proof of this
// shape is packages/vitest/test/acceptance/step-modules.feature + step-modules.steps.test.ts,
// which pnpm test already runs.
// steps/apples.ts — shared across Feature files
import { defineSteps } from "@effect-cucumber/vitest"
import * as Ref from "effect/Ref"
import { World } from "./world.ts"

export const applesSteps = defineSteps<World>(({ Given, Then, When }) => {
  Given("I have {int} apples", function*(count) {
    yield* Ref.set((yield* World).apples, count)
  })
  When("I eat {int} apples", function*(count) {
    yield* Ref.update((yield* World).apples, (n) => n - count)
  })
  Then("I have {int} apples left", function*(expected) {
    assert.strictEqual(yield* Ref.get((yield* World).apples), expected)
  })
})

// checkout.steps.test.ts
describeFeature(feature, World.layer, ({ Rule, use }) => {
  use(applesSteps)
  Rule("Limits", ({ use: useInRule }) => useInRule(limitSteps))
})
```

**What holds.** `packages/vitest/test/StepModule.test.ts` asserts scope attribution (Rule-scoped
when used in a Rule, invisible to a Feature-level Scenario), the definition site, the
double-`use` ambiguity, and module composition. `scripts/verify-tsgo-gate.sh` asserts the
positive control compiles and the missing-service module is rejected by name.

---

_Previous: [07 — Hook ordering and guarantees](./07-hook-ordering-and-guarantees.md)_

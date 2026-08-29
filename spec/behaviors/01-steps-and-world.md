# 01 — Steps, World, and `describeFeature`

_Partly implemented. `@effect-cucumber/vitest` ships a real `describeFeature`:
the two Layer argument forms, the `FeatureDsl`/`ScenarioDsl`/`BackgroundDsl`/
`StepRegistrar` type surface, per-instance step registration, the
`Effect.fn(stepText)` auto-wrap, and the compile gate that makes a step
requiring an unprovided service a type error (`scripts/verify-tsgo-gate.sh`).
What does **not** exist yet is the runner — `describeFeature` collects step
definitions and emits no `it.effect` until Phase 6, so nothing below that talks
about running a Scenario is true today. The `` ```ts `` fences below are
signature listings, not compiled examples (`AGENTS.md` §2), and
`spec/roadmap.md` remains the single place that says what is built._

---

## BEH-EC-001: Loading a feature file

A `.feature` file is parsed into data by `loadFeature`; it is never executed
by vitest directly.

```ts
export const loadFeature: (
  path: string
) => Effect.Effect<
  ParsedFeature,
  LoadFeatureError | StepPatternError,
  FileSystem.FileSystem | ParameterTypeStore
>
```

> **[ADR-EC-021](../decisions/021-effect-and-platform-are-peer-dependencies-of-gherkin.md)**
> supersedes the plain-synchronous `(path: string) => ParsedFeature` signature this behavior
> previously specified, reading through `effect`'s own `FileSystem` service rather than
> `node:fs` directly. A caller must `Effect.provide` a concrete `FileSystem` Layer —
> `@effect/platform-node`'s `NodeFileSystem.layer` for this package's own tests — before
> running the result. `Effect.runSync` does **not** recover the old synchronous, throwing call
> shape here: the real `NodeFileSystem` implementation suspends internally (confirmed by
> reproduction against the real package, not assumed), so `Effect.runSync(loadFeature(path))`
> throws `AsyncFiberError` regardless of the underlying file's success or failure. A
> module-top-level caller — the pattern the REQUIREMENT below is written around — uses a
> top-level `await Effect.runPromise(...)` instead; see
> `packages/gherkin/src/loadFeature.ts`'s and `Source.ts`'s doc comments for the full trade-off
> and `packages/gherkin/test/loadFeature.test.ts` for the executable proof. `parseFeature`
> (source text in hand, no filesystem touched) requires only `ParameterTypeStore` and is still
> `Effect.runSync`-safe.
>
> **[ADR-EC-023](../decisions/023-parametertypestore-becomes-an-ambient-context-service.md)**
> further amends this signature: the old `options?: LoadFeatureOptions` second argument is
> gone — `ParameterTypeStore` moved from a hand-passed argument to an ambient requirement in
> the `R` channel, provided via `Layer` (`ParameterTypeStore.Default` for the built-ins-only
> case, `ParameterTypeStore.layerOf(store)` for a custom one) exactly like `FileSystem.FileSystem`
> already was. There is no argument-level default left at the `@effect-cucumber/gherkin` level —
> every caller of `loadFeature`/`parseFeature` provides `ParameterTypeStore` explicitly.
>
> **[ADR-EC-024](../decisions/024-vitest-owns-a-managedruntime-for-collection-time-loadfeature.md)**
> is what keeps a Feature file's call site simple despite the above: `@effect-cucumber/vitest`'s
> own re-exported `loadFeature` (used by the worked example below, distinct from
> `@effect-cucumber/gherkin`'s `loadFeature` shown in the signature above) wraps a
> module-scoped `ManagedRuntime` over `NodeFileSystem.layer`, takes an optional
> `parameterTypes` argument defaulting to `ParameterTypeStore.Default`, and returns
> `Promise<ParsedFeature>` rather than an `Effect` — the one place in this library where a
> Promise-returning surface is deliberate, since `describeFeature` needs an already-resolved
> value at Feature-file top level, not a deferred program.

```
REQUIREMENT: loadFeature MUST parse Gherkin via @cucumber/gherkin
             (ADR-EC-011). It MUST NOT execute or register any vitest test —
             a call to Effect.runPromise(loadFeature(...)) alone must have no
             observable effect on the test run.
```

## BEH-EC-002: `describeFeature` takes a Layer

> **Invariant:** [INV-EC-003](../invariants.md#inv-ec-003-a-steps-effect-can-only-use-services-the-ambient-layer-provides)
> **See:** [ADR-EC-003](../decisions/003-describefeature-takes-a-layer.md)

```ts
// Two overloads. The object form is declared FIRST; the plain-Layer form LAST.
export function describeFeature<RShared, RScenario, E1, E2>(
  feature: ParsedFeature,
  layer: {
    readonly shared: Layer.Layer<RShared, E1, never>
    readonly perScenario: Layer.Layer<RScenario, E2, never>
  },
  define: (dsl: FeatureDsl<RShared | RScenario>) => void
): void
export function describeFeature<ROut, E>(
  feature: ParsedFeature,
  layer: Layer.Layer<ROut, E, never>,
  define: (dsl: FeatureDsl<ROut>) => void
): void
```

> **Correction (2026-08-29, Phase 5 implementation, verified by compiling the superseded form against
> `typescript@7.0.2` + `@effect/tsgo@0.38.0`):** the single-signature, union-argument form this
> behavior previously published erased `shared`. It wrote the union member as
> `shared: Layer.Layer<any, any, never>` — the output type discarded — and bound `R` to `perScenario`
> alone, so `FeatureDsl<R>` never mentioned the shared services. Reproduced: with
> `{ shared: Db.layer, perScenario: World.layer }`, a step doing `yield* (yield* Db).clear` was
> rejected with `TS2345`, because `Db` was not in the dsl's `ROut` at all.
> [ADR-EC-006](../decisions/006-two-layer-scopes-only.md)'s own motivating example — a shared
> `Database` Layer with steps that use `Database` — did not compile under this behavior's own
> published signature.
>
> Widening `shared`'s type parameter does not repair it: a union in an inference position gives
> TypeScript no way to bind two independent output types and thread their union into `define`. Two
> overloads can, and do — `packages/vitest/src/describeFeature.ts` is the shipped form, verified
> against all four cases (plain Layer; object form using `shared`; object form using `perScenario`;
> object form using both).
>
> **The plain-Layer overload is declared LAST deliberately.** TypeScript reports a failed overloaded
> call as "No overload matches this call. The last overload gave the following error", so the
> overload the diagnostics should come from goes last. Declared first, a `Layer<World, never, Db>` —
> a Layer whose own `RIn` names a service nothing provides — is reported as "missing the following
> properties from type `{ shared; perScenario }`", which names the wrong problem entirely, and
> `effect(missingLayerContext)` never fires while the call is still rejected and CI stays green. This
> is the opposite ordering rule from BEH-EC-003's union below, which is why both are written down.
> See `packages/vitest/src/describeFeature.ts` note (a) and `scripts/verify-tsgo-gate.sh` assertion
> 8, which fails by name if the two overloads are swapped.

```
REQUIREMENT: A step defined inside `define` whose Effect requires an `R` not
             provided by `layer` MUST fail to compile. It MUST NOT be
             possible for such a step to reach runtime and fail with a
             "service not found" error instead.

             In the object form, `perScenario` is a REQUIRED key (D-03), even
             for a Feature with no per-Scenario-fresh state — such a Feature
             writes `perScenario: Layer.empty`, which is Layer<never> and
             unions away, leaving the shared services reachable. `perScenario`
             MUST NOT be optional: its absence is what discriminates a plain
             Layer argument from the object form, and an optional key would
             make an omitted `perScenario` indistinguishable from a caller
             mistake. Where both Layers name the same service, `perScenario`
             wins (D-04).
```

## BEH-EC-003: A step is an Effect-returning function

> **See:** [ADR-EC-001](../decisions/001-steps-are-effects.md), [ADR-EC-005](../decisions/005-effect-fn-for-step-and-hook-bodies.md)

```ts
// `ROut` is the ambient Layer's output type, fixed by the enclosing describeFeature —
// NOT a per-call type parameter. A callable interface, so `Params`/`A`/`E` stay per call site.
export interface StepRegistrar<ROut> {
  <Params extends ReadonlyArray<any>, A, E>(
    pattern: string,
    fn:
      // ORDER IS LOAD-BEARING: the generator branch MUST be listed first.
      | ((...p: Params) => Effect.gen.Return<A, E, ROut | Scope.Scope>)
      | ((...p: Params) => Effect.Effect<A, E, ROut | Scope.Scope>)
  ): void
}
// Given, When, Then, And and But are each a StepRegistrar<ROut> on the dsl object.
```

> **Correction (2026-08-29, Phase 5 implementation, verified by compiling the superseded form against
> `typescript@7.0.2` + `@effect/tsgo@0.38.0`):** the standalone
> `Given: <Params extends unknown[], A, E, R>(...)` signature this behavior previously published had
> two defects, and the first one made INV-EC-003 decorative under the spec's own text.
>
> **(1) The generator branch's yield type was `any`.** (The literal spelling is deliberately not
> reproduced here — an acceptance grep asserts its absence from this file, so quoting it would fail
> the check that keeps it gone.) A vacuous yield type is assignable to everything: reproduced, a step
> doing `yield* Db` against a `World`-only ambient Layer **compiled clean, exit 0**. A published
> signature that accepts the exact case the invariant forbids is worse than no signature, because it
> is copied. The shipped generator branch is `Effect.gen.Return<A, E, ROut | Scope.Scope>`, which
> carries the required-context type instead of erasing it.
>
> **(2) `R` was a free type parameter of `Given`, not the ambient Layer's `ROut`.** It therefore
> inferred to whatever the body happened to need, per call site, and constrained nothing — the
> vacuous-generic trap (`.planning/research/PITFALLS.md` Pitfall 3). Binding `R` to the enclosing
> `describeFeature`'s `ROut` through `StepRegistrar<ROut>` is what makes the check run in the
> intended direction. `Params extends unknown[]` also became `ReadonlyArray<any>`, which accepts a
> generator's inferred parameter tuple cleanly.
>
> **The union's member ORDER is load-bearing.** The generator branch is listed first because
> TypeScript reports against the first union member a value fails against. With the `Effect`-returning
> branch first, a step needing an unprovided service is reported as a Generator shape mismatch
> ("missing the following properties: toJSON, [NodeInspectSymbol], [TypeId], pipe") — which the
> `@effect/tsgo` plugin has no reason to read as a context problem, so `effect(missingEffectContext)`
> never fires while the step is still rejected and every test stays green. That silent decay is the
> failure mode `scripts/verify-tsgo-gate.sh` assertion 6 exists to catch: it checks the exit code AND
> the diagnostic name, and a reorder was demonstrated failing the second check only. This is the
> opposite ordering rule from BEH-EC-002's overloads above. See `packages/vitest/src/Dsl.ts` note (a).
>
> `Scope.Scope` appears only in the step's required-context position, never on the dsl or Layer types
> — that is what lets a step using `Effect.acquireRelease` compile against a plain `Layer<World>`,
> because the runner provides the Scope, while a step using an unprovided `Db` is still rejected.

```
REQUIREMENT: Given/When/Then/And/But MUST accept a bare generator function and
             wrap it with Effect.fn(stepText) internally. They MUST also
             accept an already-Effect.fn-wrapped function directly, unchanged.

             "Unchanged" means BY IDENTITY — the same function object, not a
             re-binding and not a wrapper closure. The two accepted forms are
             indistinguishable at the type level (Effect.fn accepts both with
             no cast), so the discrimination MUST happen at runtime, via a
             generator-function check. Wrapping an already-wrapped step is not
             a compile error and not a test failure; the only symptom is a
             second span carrying the step text twice in every trace, which
             nothing but a reference-identity assertion can catch.
```

## BEH-EC-004: World provides typed, compiler-checked scenario state

> **Invariant:** [INV-EC-002](../invariants.md#inv-ec-002-a-per-scenario-layer-is-fresh-every-scenario)
> **See:** [ADR-EC-002](../decisions/002-world-is-a-context-service.md)

World replaces the untyped context bag other Gherkin-on-vitest libraries thread
through steps with an ordinary `Context.Service`.

This is enforced today. A World declared as a `Context.Service` is reachable
from a step as a typed value, and reading a field absent from its declared
shape is a plain `TS2339` — asserted by `scripts/verify-tsgo-gate.sh`
assertion 7, whose fixture reads one undeclared field off an otherwise
correct World. That assertion deliberately checks a TypeScript error code and
**not** an `effect(...)` diagnostic: nothing is wrong with the context here —
World is provided, the Layer is correct, and the sole defect is one property
read — so `@effect/tsgo` has no diagnostic to emit.

The library ships **no `World` type**, and there is no `World.ts` to import.
What it ships is the constraint: a World-shaped `Context.Service` is what steps
read, and each test author declares their own, whose shape is theirs. The
guarantee is that the declared shape is the reachable shape.

```
REQUIREMENT: A field of World MUST NOT be reachable by a step unless it
             appears in the World service's declared type. There MUST be no
             way to read a World field that "doesn't exist yet" the way an
             untyped context bag allows.
```

## BEH-EC-013: Fail loudly on an unmatched, unused, or ambiguous step

> **See:** [ADR-EC-019](../decisions/019-fail-loudly-on-unmatched-or-ambiguous-steps.md)

```
REQUIREMENT: A Pickle step matching zero registered Given/When/Then/And/But
             patterns MUST fail the containing Scenario with an error naming
             the unmatched step text and its source location. A Pickle step
             matching more than one registered pattern MUST fail the same
             way, naming every matching pattern — resolution MUST NOT
             silently pick the first-registered match. A registered pattern
             matching zero steps across the whole Feature MUST be reported
             as a Feature-level warning, not a hard failure.
```

### Worked example

```typescript
// The API below is real; this fence is still not compiled, because the doc-examples
// check is not wired yet (spec/roadmap.md). Nothing here emits a test until Phase 6.
import { describeFeature, loadFeature } from "@effect-cucumber/vitest"
import { Context, Effect, Layer, Ref } from "effect"

// @effect-cucumber/vitest's loadFeature (ADR-EC-024) returns a Promise, already
// wired to a shared NodeFileSystem.layer and defaulting ParameterTypeStore —
// distinct from @effect-cucumber/gherkin's own Effect-returning loadFeature.
const feature = await loadFeature("./apples.feature")

class World extends Context.Service<World, { apples: Ref.Ref<number> }>()("World") {
  static readonly layer = Layer.effect(
    this,
    Effect.gen(function*() {
      return World.of({ apples: yield* Ref.make(0) })
    })
  )
}

describeFeature(feature, World.layer, ({ Scenario }) => {
  // Scenario receives its own dsl object (ADR-EC-017), consistent with
  // ScenarioOutline and Rule — the outer-scope closure form also works
  // (destructuring Given/When/Then from describeFeature's own dsl above),
  // but the dsl-parameter form is shown here as the default.
  Scenario("Eating apples", ({ Given, When, Then }) => {
    Given("I have {int} apples", function*(n: number) {
      const { apples } = yield* World
      yield* Ref.set(apples, n)
    })

    When("I eat {int} apples", function*(n: number) {
      const { apples } = yield* World
      yield* Ref.update(apples, (a) => a - n)
    })

    Then("I have {int} apples left", function*(expected: number) {
      const { apples } = yield* World
      const actual = yield* Ref.get(apples)
      expect(actual).toBe(expected)
    })
  })
})
```

---

_Next: [02 — Background, hooks, shared Layers, and tags](./02-shared-layers-and-tags.md)_

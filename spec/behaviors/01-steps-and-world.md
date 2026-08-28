# 01 — Steps, World, and `describeFeature`

_Pre-implementation: `@effect-cucumber/vitest` doesn't exist yet (see
`spec/roadmap.md`). Code fences below describe the intended API — reference
material, not a compiled example. `AGENTS.md` §2 governs how this changes once
code exists._

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
export const describeFeature: <R, E>(
  feature: ParsedFeature,
  layer: Layer.Layer<R, E, never> | { shared: Layer.Layer<any, any, never>; perScenario: Layer.Layer<R, E, never> },
  define: (dsl: FeatureDsl<R>) => void
) => void
```

```
REQUIREMENT: A step defined inside `define` whose Effect requires an `R` not
             provided by `layer` MUST fail to compile. It MUST NOT be
             possible for such a step to reach runtime and fail with a
             "service not found" error instead.
```

## BEH-EC-003: A step is an Effect-returning function

> **See:** [ADR-EC-001](../decisions/001-steps-are-effects.md), [ADR-EC-005](../decisions/005-effect-fn-for-step-and-hook-bodies.md)

```ts
type StepFn<Params extends unknown[], A, E, R> = (...params: Params) => Effect.Effect<A, E, R>

export const Given: <Params extends unknown[], A, E, R>(
  pattern: string,
  fn: StepFn<Params, A, E, R> | ((...params: Params) => Generator<any, A, any>)
) => void
// When, Then, And, But share this signature.
```

```
REQUIREMENT: Given/When/Then/And/But MUST accept a bare generator function and
             wrap it with Effect.fn(stepText) internally. They MUST also
             accept an already-Effect.fn-wrapped function directly, unchanged.
```

## BEH-EC-004: World provides typed, compiler-checked scenario state

> **Invariant:** [INV-EC-002](../invariants.md#inv-ec-002-a-per-scenario-layer-is-fresh-every-scenario)
> **See:** [ADR-EC-002](../decisions/002-world-is-a-context-service.md)

World replaces the untyped `context: any` bag other Gherkin-on-vitest
libraries thread through steps with an ordinary `Context.Service`.

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
// Pre-implementation reference — not yet compiled against a real API.
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

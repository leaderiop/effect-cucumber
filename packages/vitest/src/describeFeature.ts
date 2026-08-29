/**
 * The public entry point: `describeFeature(feature, layer, define)`.
 *
 * This is the file a test author calls, and the only place the ambient Layer's output type is
 * threaded into `FeatureDsl`. `Registry.ts` supplies the per-call step container, `Step.ts` supplies
 * the auto-wrap, `Dsl.ts` supplies the compile-time surface; this module composes the three and
 * decides what the type parameter of that surface is.
 * [ADR-EC-003](../../../spec/decisions/003-describefeature-takes-a-layer.md) is the decision record.
 *
 * Four things about this module are not visible from the code.
 *
 * (a) **The plain-Layer overload is declared LAST, and the order is load-bearing — in the OPPOSITE
 *     direction from `Dsl.ts` note (a).** TypeScript reports a failed overloaded call as "No overload
 *     matches this call. The LAST overload gave the following error", so the overload you want
 *     diagnostics from goes last. The plain-Layer form is the common case and reads naturally first,
 *     which is exactly the tidy-up this note exists to stop. Declared first, a
 *     `Layer<World, never, Db>` — a Layer with an unsatisfied `RIn` — is reported as
 *     `Type 'Layer<World, never, Db>' is missing the following properties from type
 *     '{ shared; perScenario }'`, which names the wrong problem entirely, and
 *     `effect(missingLayerContext)` never fires. The call is STILL rejected, so nothing in this repo
 *     goes red: the build gate of
 *     [ADR-EC-016](../../../spec/decisions/016-effect-tsgo-language-service-plugin.md) quietly stops
 *     covering the Layer argument while CI stays green. Reproduced under BOTH orderings against this
 *     repo's own compiler in this phase's RESEARCH.md, Finding 6.
 *
 *     `Dsl.ts` note (a) says the opposite about a UNION: TypeScript reports the FIRST union member a
 *     value fails against, so there the generator branch goes first. Two constructs, two reporting
 *     rules, pointing opposite ways. Both are written down precisely because intuition cannot hold
 *     them apart, and both failure modes are silent. The behavioral proof for this one is plan
 *     05-05's `layer-missing-rin` fixture, whose assertion must fail if these two overloads are
 *     swapped.
 *
 * (b) **`describeFeature` and `collectFeature` are `function` declarations, not arrow consts.** Every
 *     other exported binding in this package is an arrow const; these two are not, because an arrow
 *     const cannot carry overload signatures. That is the whole reason, and it is written here so the
 *     next reader "restoring consistency" finds out before deleting the overloads to do it.
 *
 * (c) **`define` returns `void`, never `void` or a promise.** An async define callback returns before
 *     registering anything, so the Feature would collect zero steps and — once Phase 6 emits tests —
 *     pass with zero tests rather than failing. The type is the only thing that forbids it
 *     (PITFALLS #2, this phase's Pitfall 6). Nothing in this module returns a thenable either: the
 *     define callback is invoked synchronously, and `collectFeature` returns its result by value.
 *
 * (d) **D-04 falls out of the merge combinator's argument order, and is not special-case code.**
 *     `shared` and `perScenario` MAY name the same service, and `perScenario` wins for a step that
 *     depends on it. `Layer.merge(shared, perScenario)` gives exactly that — verified by running it,
 *     not assumed: the SECOND argument's implementation is the one a step resolves to. Swapping the
 *     two arguments compiles, type-checks, lints, and silently inverts the rule;
 *     `test/describeFeature.test.ts`'s D-04 case is the only thing that catches it.
 *
 * Neither `collectFeature` nor the registry behind it is re-exported from
 * `packages/vitest/src/index.ts` — see `index.ts`'s own header for why.
 */
import type { ParsedFeature } from "@effect-cucumber/gherkin"
import type * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { captureCallSite } from "./CallSite.ts"
import type { BackgroundDsl, FeatureDsl, ScenarioDsl, StepRegistrar } from "./Dsl.ts"
import { createRegistry, type StepDefinition, type StepKeyword } from "./Registry.ts"
import { register } from "./Step.ts"

/**
 * A step body after `Step.ts` has normalised it — the `Fn` the registry is instantiated with.
 *
 * The three `any`s are erased detail, not a widening of the public surface: `Dsl.ts`'s
 * `StepRegistrar<ROut>` has already checked every registered body against the ambient Layer's output
 * by the time one reaches here, and this type never appears in a position a caller writes against.
 * Compare PITFALLS Pitfall 6, which is about `any` in a step body's DECLARED type — a different
 * thing, and the one that would actually disable INV-EC-003.
 */
type StepBody = (...params: ReadonlyArray<any>) => Effect.Effect<any, any, any>

/**
 * The union of what the two overloads accept, as the implementation signature sees it.
 *
 * Only the implementation and the module-scope helpers below refer to this. TypeScript never
 * resolves a call against an implementation signature, so nothing here is part of the public
 * contract.
 */
type LayerArgument =
  | Layer.Layer<any, any, never>
  | { readonly shared: Layer.Layer<any, any, never>; readonly perScenario: Layer.Layer<any, any, never> }

/**
 * What `describeFeature` collected, before anything is run.
 *
 * Exported because `collectFeature`'s return annotation names it and `composite: true` demands a
 * nameable type for declaration emit — not because a consumer is meant to construct one.
 */
export type FeatureCollection = {
  readonly feature: ParsedFeature
  /** The single Layer both forms normalise to — see note (d) for the collision rule. */
  readonly layer: Layer.Layer<any, any, never>
  readonly definitions: ReadonlyArray<StepDefinition<StepBody>>
}

/**
 * Collapse the two accepted layer arguments into the one Layer the runner will provide.
 *
 * The object form is discriminated by the presence of `perScenario`, which D-03 makes a REQUIRED key
 * — so its absence means "this is a plain Layer" and never "the caller omitted the key". A Feature
 * with no per-Scenario-fresh state writes `perScenario: Layer.empty`, which is `Layer<never>` and
 * unions away, leaving `FeatureDsl<RShared>` with the shared services still reachable.
 *
 * `shared` FIRST and `perScenario` SECOND. Note (d): the second argument wins a collision, which is
 * what D-04 asks for.
 */
const normalizeLayer = (layer: LayerArgument): Layer.Layer<any, any, never> =>
  "perScenario" in layer ? Layer.merge(layer.shared, layer.perScenario) : layer

/**
 * The one implementation both public entry points delegate to.
 *
 * Not exported, and deliberately so: it exists to keep `describeFeature` and `collectFeature` from
 * drifting into two behaviours, which they would if each carried its own body.
 */
const collect = (
  feature: ParsedFeature,
  layer: LayerArgument,
  define: (dsl: FeatureDsl<any>) => void
): FeatureCollection => {
  // ONE fresh registry per invocation, built here and never hoisted to module scope or memoised.
  // Registry.ts note (a) has the full argument; the short version is that a shared registry makes
  // two Features in one file resolve each other's steps, and no content assertion can see it.
  const registry = createRegistry<StepBody>(feature.name)

  // One registrar per keyword, all five behind the same three lines: normalise the body through
  // `Step.ts` (which is where the bare-generator auto-wrap and its pass-through live), then record
  // it under the scope that is current right now, together with where the author wrote it. The
  // keyword is recorded verbatim — an `And` stays an `And` and is never rewritten to the keyword it
  // continues, because that continuation is a match-time question and this is registration time.
  const registrar = (keyword: StepKeyword): StepRegistrar<any> => (pattern, fn) => {
    // The `captureCallSite` call below MUST stay INSIDE this arrow — the one a test author calls as
    // `Given`/`When`/`Then`/`And`/`But`. An extra helper frame between the arrow and the capture is
    // fine, because frame selection is by directory and not by a frame count (CallSite.ts note (a)),
    // but hoisting the call to a `const` in `collect`'s body or to module scope is not: it would
    // then run from THIS file's frame and record this module's own line for every step in every
    // suite. That defect compiles, type-checks, lints, and produces a perfectly well-formed site —
    // it just names `describeFeature.ts` in the ambiguous-step error D-03 exists to make readable.
    registry.register(keyword, pattern, register(pattern, fn), captureCallSite())
  }

  const scenarioDsl: ScenarioDsl<any> = {
    Given: registrar("Given"),
    When: registrar("When"),
    Then: registrar("Then"),
    And: registrar("And"),
    But: registrar("But")
  }

  // ADR-EC-017: a Background gets `Given` and `And` only. The omission is the contract, not a gap.
  const backgroundDsl: BackgroundDsl<any> = { Given: scenarioDsl.Given, And: scenarioDsl.And }

  const dsl: FeatureDsl<any> = {
    ...scenarioDsl,
    Background: (defineBackground) => {
      // `name: null` and not the feature's name: a Background genuinely has none (Registry.ts's
      // note on RegistryScope).
      registry.pushScope({ kind: "background", name: null })
      try {
        defineBackground(backgroundDsl)
      } finally {
        // `finally`, so a define callback that throws cannot leave the stack unbalanced and
        // re-parent every step registered after it onto a scope the document does not have.
        registry.popScope()
      }
    },
    Scenario: (name, defineScenario) => {
      registry.pushScope({ kind: "scenario", name })
      try {
        defineScenario(scenarioDsl)
      } finally {
        registry.popScope()
      }
    }
  }

  define(dsl)

  return { feature, layer: normalizeLayer(layer), definitions: registry.definitions() }
}

/**
 * Collect a Feature's step definitions and normalised Layer, and hand them back instead of running
 * anything.
 *
 * This exists so the collection is assertable NOW, in this phase, without a runner:
 * `describeFeature` returns `void` by contract, so there is nothing for a test to look at, and
 * `test/describeFeature.test.ts` asserts against this instead. It is also Phase 6's join point —
 * RUN-01 reads a `FeatureCollection` and emits one `it.effect` per Pickle through the TestApi seam.
 *
 * Internal, and reached by relative import from inside this package. It is deliberately NOT in
 * `index.ts`: publishing it would freeze the collection shape into the package's contract before
 * Phase 6 has consumed it once.
 *
 * The two overloads mirror `describeFeature`'s exactly, including the order — note (a).
 */
export function collectFeature<RShared, RScenario, E1, E2>(
  feature: ParsedFeature,
  layer: {
    readonly shared: Layer.Layer<RShared, E1, never>
    readonly perScenario: Layer.Layer<RScenario, E2, never>
  },
  define: (dsl: FeatureDsl<RShared | RScenario>) => void
): FeatureCollection
export function collectFeature<ROut, E>(
  feature: ParsedFeature,
  layer: Layer.Layer<ROut, E, never>,
  define: (dsl: FeatureDsl<ROut>) => void
): FeatureCollection
export function collectFeature(
  feature: ParsedFeature,
  layer: LayerArgument,
  define: (dsl: FeatureDsl<any>) => void
): FeatureCollection {
  return collect(feature, layer, define)
}

/**
 * Declare the step definitions for `feature`, against the services `layer` provides.
 *
 * `define` is called synchronously with a `FeatureDsl` whose type parameter is exactly `layer`'s
 * output type, so a step whose Effect requires a service the Layer does not provide is a type error
 * where the step is written — never a runtime "service not found" discovered when the Scenario runs
 * (ADR-EC-003, INV-EC-003).
 *
 * Two accepted layer forms, per
 * [ADR-EC-006](../../../spec/decisions/006-two-layer-scopes-only.md):
 * a plain `Layer`, which is the per-Scenario scope, or `{ shared, perScenario }`. `perScenario` is
 * REQUIRED in the object form even when a Feature has no per-Scenario-fresh state — write
 * `perScenario: Layer.empty` (D-03). Where both name the same service, `perScenario` wins — note (d).
 *
 * Emits ZERO vitest tests in this phase, on purpose. The collection is built and discarded; Phase 6
 * (RUN-01) replaces the discard with `it.effect` emission through the TestApi seam. Use
 * `collectFeature` to observe what was collected.
 *
 * @param feature - a `ParsedFeature` from `@effect-cucumber/gherkin`'s `loadFeature`/`parseFeature`
 * @param layer - the ambient Layer, or `{ shared, perScenario }`
 * @param define - runs synchronously; registers steps and containers. Note (c)
 */
export function describeFeature<RShared, RScenario, E1, E2>(
  feature: ParsedFeature,
  layer: {
    readonly shared: Layer.Layer<RShared, E1, never>
    readonly perScenario: Layer.Layer<RScenario, E2, never>
  },
  define: (dsl: FeatureDsl<RShared | RScenario>) => void
): void
// The plain-Layer overload is LAST, and must stay last — note (a). This is the one TypeScript
// reports against, and the one `effect(missingLayerContext)` fires from.
export function describeFeature<ROut, E>(
  feature: ParsedFeature,
  layer: Layer.Layer<ROut, E, never>,
  define: (dsl: FeatureDsl<ROut>) => void
): void
export function describeFeature(
  feature: ParsedFeature,
  layer: LayerArgument,
  define: (dsl: FeatureDsl<any>) => void
): void {
  // Discarded on purpose — see the doc comment above. Phase 6 replaces this line with emission.
  collect(feature, layer, define)
}

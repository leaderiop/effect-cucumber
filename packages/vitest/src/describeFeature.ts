/**
 * The two public entry points: `describeFeature` (registers and emits) and `collectFeature`
 * (registers, plans, emits nothing — what `describeFeature.test.ts` asserts against).
 *
 * Invariants a reader must not tidy away:
 * - The plain-Layer overload is LAST on both functions. TypeScript reports a failed overloaded call
 *   against the last overload, and that is what makes an unsatisfied Layer fail by name with
 *   `effect(missingLayerContext)` — `scripts/verify-tsgo-gate.sh` assertion 8.
 * - `shared` is `Layer<R, never, never>`: the framework builds it through `Effect.orDie`, so a typed
 *   failure would become a defect attributed to no Scenario — `test/upstream-pin.test.ts`,
 *   `test/SharedLayerConstraint.types.ts`.
 * - `perScenario` may require what `shared` provides (BEH-EC-007); a requirement neither tier
 *   provides is rejected by overload resolution — tsgo-gate `per-scenario-missing-rin.ts`.
 * - The implementation parameter is `layerArgument`, not `layer`: `layer` is the framework import.
 */
import type { ParsedFeature } from "@effect-cucumber/gherkin"
import * as Layer from "effect/Layer"
import type { FeatureDsl } from "./Dsl.ts"
import { makeExcludedScenariosNotice } from "./Errors.ts"
// `StepBody` is declared in `Plan.ts` and imported here, never the reverse (`pnpm circular`).
import { emitFeature, type EmitOutcome } from "./Runner.ts"
// The composite `scenarioLayers` key, in a LEAF module both this file and `Runner.ts` import rather
// than private to either — `ScenarioKey.ts`'s own header has the argument.
import { collect, type FeatureCollection, type LayerArgument } from "./Collect.ts"
import { isSkipped, makeTagFilter, shouldEmit } from "./Tags.ts"
import { sharedLayerTestApi, vitestTestApi } from "./VitestTestApi.ts"

export interface DescribeFeatureOptions {
  readonly includeTags?: ReadonlyArray<string>
  readonly excludeTags?: ReadonlyArray<string>
}

/**
 * Collect a Feature's step definitions and normalised Layer, and hand them back instead of running
 * anything.
 */
export type { FeatureCollection } from "./Collect.ts"

export function collectFeature<RShared, RScenario, E2>(
  feature: ParsedFeature,
  layer: {
    readonly shared: Layer.Layer<RShared, never, never>
    readonly perScenario: Layer.Layer<RScenario, E2, RShared>
  },
  define: (dsl: FeatureDsl<RShared | RScenario, RShared>) => void
): FeatureCollection
export function collectFeature<ROut, E>(
  feature: ParsedFeature,
  layer: Layer.Layer<ROut, E, never>,
  define: (dsl: FeatureDsl<ROut>) => void
): FeatureCollection
// `layerArgument`, not `layer`, in the implementation signature: `layer` would shadow the
// framework import.
export function collectFeature(
  feature: ParsedFeature,
  layerArgument: LayerArgument,
  define: (dsl: FeatureDsl<any, any>) => void
): FeatureCollection {
  return collect(feature, layerArgument, define)
}

/**
 * Declare the step definitions for `feature`, against the services `layer` provides.
 *
 * @param feature - a `ParsedFeature` from `@effect-cucumber/gherkin`'s `loadFeature`/`parseFeature`
 * @param layer - the ambient Layer, or `{ shared, perScenario }` where `shared` is a
 * @param define - runs synchronously; registers steps and containers.
 * @param options - the registration-time tag filter; absent means no filter, and so does `[]`
 */
export function describeFeature<RShared, RScenario, E2>(
  feature: ParsedFeature,
  layer: {
    readonly shared: Layer.Layer<RShared, never, never>
    // `RShared`, not `never`: the per-Scenario tier may be built from the shared tier's services
    // (BEH-EC-007).
    readonly perScenario: Layer.Layer<RScenario, E2, RShared>
  },
  define: (dsl: FeatureDsl<RShared | RScenario, RShared>) => void,
  options?: DescribeFeatureOptions
): void
// This is the one TypeScript reports against, and the one `effect(missingLayerContext)` fires from.
export function describeFeature<ROut, E>(
  feature: ParsedFeature,
  layer: Layer.Layer<ROut, E, never>,
  define: (dsl: FeatureDsl<ROut>) => void,
  options?: DescribeFeatureOptions
): void
// `layerArgument` and not `layer` in the IMPLEMENTATION signature alone, for one mechanical reason:
// the shared branch below calls `@effect/vitest`'s own `layer(...)`, and a parameter named `layer`
export function describeFeature(
  feature: ParsedFeature,
  layerArgument: LayerArgument,
  define: (dsl: FeatureDsl<any, any>) => void,
  options?: DescribeFeatureOptions
): void {
  // REGISTER, then PLAN — both inside `collect`, which `collectFeature` shares verbatim.
  const collection = collect(feature, layerArgument, define)

  // `warning.message` is passed straight through, never rebuilt and never reformatted.
  for (const warning of collection.plan.warnings) {
    console.warn(warning.message)
  }
  for (const warning of collection.containerWarnings) {
    console.warn(warning.message)
  }

  // EMIT, and last: the loop above runs first so the warnings appear ABOVE the emitted block in
  // collection output rather than interleaved with it. All NINE fields.
  const tagFilter = makeTagFilter(options ?? {})

  // The return value is DELIBERATELY DISCARDED, and that is the fix for a defect that shipped.
  const onEmitted = (outcome: EmitOutcome): void => {
    if (outcome.excludedScenarioCount > 0) {
      console.warn(
        makeExcludedScenariosNotice({
          featureName: collection.plan.feature.name,
          uri: collection.plan.feature.uri,
          count: outcome.excludedScenarioCount,
          // The normalised arrays, not the optional `options` fields: the notice's fields are required.
          includeTags: tagFilter.include,
          excludeTags: tagFilter.exclude
        }).message
      )
    }
  }

  // THE ONE BRANCH between the two provision strategies, and it is an EXPLICIT read of an explicit
  // field rather than a re-inspection of the caller's argument shape.
  const sharedTier = collection.sharedLayer

  // The named `layer(...)` form builds the shared tier EAGERLY, in a `beforeAll` on the Feature's
  // block, so the block has to be opened through it only when something inside will run.
  const anyRunnable = collection.plan.scenarios.some((scenarioPlan) =>
    shouldEmit(tagFilter, scenarioPlan.tags) && !isSkipped(scenarioPlan.tags)
  )

  // On the shared path the memo map is made HERE and handed in, so the adapter's hooks can reach
  // the very build the framework made.
  const api = sharedTier === null || !anyRunnable
    ? vitestTestApi(collection.plan.feature.uri)
    : sharedLayerTestApi(collection.plan.feature.uri, sharedTier, Layer.makeMemoMapUnsafe())

  // Every other field is the SAME value on both paths, `layer` included — the per-Scenario tier,
  // which is what the Scenario's own Effect provides.
  emitFeature({
    api,
    plan: collection.plan,
    layer: collection.layer,
    hooks: collection.hooks,
    ruleHooks: collection.ruleHooks,
    ruleLayers: collection.ruleLayers,
    scenarioLayers: collection.scenarioLayers,
    tagFilter,
    onEmitted
  })
}

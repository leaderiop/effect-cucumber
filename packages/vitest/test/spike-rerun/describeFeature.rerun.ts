/**
 * SPIKE (issue #34) COPY of `packages/vitest/src/describeFeature.ts`, with `rerunFailedOnly` /
 * `rerunManifestPath` added to `DescribeFeatureOptions` — `main`'s real `describeFeature.ts` is
 * untouched (`git diff main -- packages/vitest/src/describeFeature.ts` is empty), same convention
 * `packages/vitest/test/spike-attachments/` used for issue #33. Diff against the real file with:
 *   diff packages/vitest/src/describeFeature.ts packages/vitest/test/spike-rerun/describeFeature.rerun.ts
 * every "SPIKE (issue #34)"-tagged line is the addition; everything else is copied verbatim,
 * imports retargeted to `../../src/...` since this file now lives one level deeper, and the one
 * `./Runner.ts` import retargeted to the sibling `./Runner.rerun.ts` copy.
 *
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
import type { FeatureDsl } from "../../src/Dsl.ts"
import { makeExcludedScenariosNotice } from "../../src/Errors.ts"
// The composite `scenarioLayers` key, in a LEAF module both this file and `Runner.ts` import rather
// than private to either — `ScenarioKey.ts`'s own header has the argument.
import { collect, type FeatureCollection, type LayerArgument } from "../../src/Collect.ts"
import { isSkipped, makeTagFilter, shouldEmit } from "../../src/Tags.ts"
import { sharedLayerTestApi, vitestTestApi } from "../../src/VitestTestApi.ts"
// SPIKE (issue #34): the rerun-manifest key/reader — see `RerunKey.ts` and `RerunManifest.ts`.
import { rerunKeysForPlan } from "./RerunKey.ts"
import { readRerunManifest } from "./RerunManifest.ts"
// `StepBody` is declared in `Plan.ts` and imported here, never the reverse (`pnpm circular`).
// SPIKE (issue #34): the SIBLING COPY, `./Runner.rerun.ts`, not `../../src/Runner.ts`.
import { emitFeature, type EmitOutcome } from "./Runner.rerun.ts"

// SPIKE (issue #34): matches every other tool in this repo (`git status`-clean by default) — a
// dotfile at the invocation cwd, never committed. A real implementation should make this
// configurable per-project rather than hardcoding a name; the spike option below lets a caller
// override it per `describeFeature` call, which is enough to prove the read side without deciding
// that question.
const defaultRerunManifestPath = ".rerun-manifest.json"

export interface DescribeFeatureOptions {
  readonly includeTags?: ReadonlyArray<string>
  readonly excludeTags?: ReadonlyArray<string>
  /**
   * SPIKE (issue #34): when `true`, only register the Scenarios whose `RerunKey.ts` key appears in
   * the manifest at `rerunManifestPath` (default `.rerun-manifest.json` in `process.cwd()`). Absent
   * manifest file, or `false`/absent here, means no filter — every Scenario registers, same as
   * today. See `research/rerun-failed-only-spike.md` for the write side and the rough edges.
   */
  readonly rerunFailedOnly?: boolean
  readonly rerunManifestPath?: string
}

/**
 * Collect a Feature's step definitions and normalised Layer, and hand them back instead of running
 * anything.
 */
export type { FeatureCollection } from "../../src/Collect.ts"

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

  // SPIKE (issue #34): `null` means no filter (option unset, or manifest file absent/unreadable —
  // `readRerunManifest` folds both into `null` on purpose, so a missing manifest behaves exactly
  // like the option never having been passed: run everything, never error).
  const rerunFilter = options?.rerunFailedOnly
    ? readRerunManifest(options.rerunManifestPath ?? defaultRerunManifestPath)
    : null

  // SPIKE (issue #34): a manifest key that matches no Scenario in THIS Feature — renamed, moved to
  // a different Rule, or the whole Feature deleted — warns rather than errors, the same posture
  // `Plan.ts`'s UnusedStepDefinitionWarning takes for a step definition nothing matches. A key can
  // legitimately belong to a DIFFERENT Feature in the same manifest, so this only reports keys that
  // are unaccounted for ACROSS EVERY Feature this process registers — approximated here, per-Feature,
  // by warning on every manifest key this Feature's own plan doesn't produce; a multi-Feature run
  // will repeat the same warning once per Feature that doesn't own the key, which is the spike's
  // known false-positive rate rather than a claim every warning here names a truly dead key.
  //
  // Rough edge (research/rerun-failed-only-spike.md has the actual run proving it): when EVERY key
  // in the manifest is stale for this Feature, `rerunFilter` still ends up excluding every one of
  // this Feature's own Scenarios, which can leave the Feature's `describe` block with zero children
  // — vitest's OWN "No test found in suite" error for the whole test FILE, not a graceful "nothing
  // to rerun here". This spike does not attempt a fix; see the writeup for the options considered.
  if (rerunFilter !== null) {
    const ownKeys = new Set(rerunKeysForPlan(collection.plan).values())
    for (const key of rerunFilter) {
      if (!ownKeys.has(key)) {
        console.warn(
          `rerunFailedOnly: the manifest references a Scenario key this Feature (${
            JSON.stringify(collection.plan.feature.name)
          }, ${collection.plan.feature.uri}) has no match for: ${
            JSON.stringify(key)
          }. It may belong to a different Feature, or the Scenario may have been renamed, moved to a different Rule, or deleted since the manifest was written.`
        )
      }
    }
  }

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
    // SPIKE (issue #34): deliberately a plain line, not a `makeExcludedScenariosNotice` (that
    // notice's shape is tags-specific — `includeTags`/`excludeTags` fields a rerun exclusion has
    // no values for).
    if (outcome.rerunExcludedScenarioCount > 0) {
      console.warn(
        `rerunFailedOnly: ${outcome.rerunExcludedScenarioCount} Scenario(s) in Feature ${
          JSON.stringify(collection.plan.feature.name)
        } were not registered because their rerun-manifest key was not among the previously-failed keys.`
      )
    }
  }

  // THE ONE BRANCH between the two provision strategies, and it is an EXPLICIT read of an explicit
  // field rather than a re-inspection of the caller's argument shape.
  const sharedTier = collection.sharedLayer

  // SPIKE (issue #34): computed once, reused by `anyRunnable` below and passed straight to
  // `emitFeature` — `null` when no filter is active.
  const rerunKeys = rerunFilter === null ? null : rerunKeysForPlan(collection.plan)

  // The named `layer(...)` form builds the shared tier EAGERLY, in a `beforeAll` on the Feature's
  // block, so the block has to be opened through it only when something inside will run.
  const anyRunnable = collection.plan.scenarios.some((scenarioPlan) =>
    shouldEmit(tagFilter, scenarioPlan.tags) && !isSkipped(scenarioPlan.tags)
    // SPIKE (issue #34): a Scenario excluded by the rerun filter is not runnable either — otherwise
    // an all-excluded rerun still pays for building the shared tier it will never use.
    && (rerunFilter === null || rerunFilter.has(rerunKeys?.get(scenarioPlan.scenarioId) ?? ""))
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
    // SPIKE (issue #34).
    rerunFilter,
    onEmitted
  })
}

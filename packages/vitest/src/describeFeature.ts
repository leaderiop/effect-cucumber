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
import * as Data from "effect/Data"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import type { FeatureDsl } from "./Dsl.ts"
import { makeExcludedScenariosNotice, makeStaleRerunManifestKeyWarning } from "./Errors.ts"
// `StepBody` is declared in `Plan.ts` and imported here, never the reverse (`pnpm circular`).
import { emitFeature, type EmitOutcome } from "./Runner.ts"
// The composite `scenarioLayers` key, in a LEAF module both this file and `Runner.ts` import rather
// than private to either — `ScenarioKey.ts`'s own header has the argument.
import { collect, type FeatureCollection, type LayerArgument } from "./Collect.ts"
// The stable cross-run key, shared by this module's `anyRunnable`/stale-key check and `Runner.ts`'s
// emission walk — `RerunKey.ts`'s own header has the argument (ADR-EC-038).
import { rerunKeysForPlan } from "./RerunKey.ts"
import { defaultRerunManifestPath, readRerunManifest } from "./RerunManifest.ts"
import { compileFeatureTagExpression, featureTagUniverse } from "./TagExpression.ts"
import { isSkipped, makeTagFilter, shouldEmit } from "./Tags.ts"
import { sharedLayerTestApi, vitestTestApi } from "./VitestTestApi.ts"

export interface DescribeFeatureOptions {
  readonly includeTags?: ReadonlyArray<string>
  readonly excludeTags?: ReadonlyArray<string>
  /**
   * A registration-time filter expressed in vitest's own boolean tag-expression grammar
   * (`and`/`or`/`not`/`&&`/`||`/`!`/parens) — the IDENTICAL `createTagsFilter` engine
   * (`@vitest/runner/utils`) this library already reuses for tag-expression-scoped hooks
   * (`Before(tagExpr, fn)`, ADR-EC-035). Compiled once per `describeFeature` call, against this
   * Feature's own declared tag universe (`featureTagUniverse(feature.allScenarios)`) — an
   * expression naming a tag literal absent from every Scenario in this Feature, or a malformed
   * expression string, throws synchronously, before anything registers (ADR-EC-054).
   *
   * Mutually exclusive with `includeTags`/`excludeTags`: setting `tagExpression` alongside either
   * throws a located error naming both option names, rather than silently picking one — see
   * [ADR-EC-054](../../../spec/decisions/054-describefeature-tagexpression-option-reuses-vitests-createtagsfilter.md).
   */
  readonly tagExpression?: string
  /**
   * Filter registration to only the Scenarios a rerun manifest names as failed (ADR-EC-038,
   * BEH-EC-030). `false`/absent (the default): no filter, `rerunManifestPath` is never read. `true`
   * with no manifest file present yet degrades to "no filter" too — the same graceful-degradation
   * posture `includeTags`/`excludeTags`'s own `undefined`/`[]` sentinel already has, since a
   * rerun-only mode that could not run without a manifest from a prior run of its own would be
   * useless on the very first run.
   */
  readonly rerunFailedOnly?: boolean
  /**
   * Where the manifest `rerunFailedOnly` reads lives. Defaults to
   * `RerunManifest.ts`'s `defaultRerunManifestPath` (`.effect-cucumber/rerun-manifest.json`,
   * resolved against `process.cwd()`). Ignored when `rerunFailedOnly` is not `true`.
   */
  readonly rerunManifestPath?: string
  /**
   * Promote this Feature's own unused-step-definition warnings to a real failure of the
   * reporter-channel warning node (BEH-EC-013, ADR-EC-019, ADR-EC-053). `false`/absent
   * (the default): the exact ADR-EC-019 behavior — a non-fatal warning on three channels, none of
   * them able to fail a run. Independent of `assertNoUnusedStepDefinitions` (the suite-wide
   * mechanism): a Feature can use either, both, or neither — they are not layered, and using one
   * does not disable or subsume the other.
   */
  readonly strict?: boolean
}

/**
 * A registration-time misuse of `describeFeature`'s options (ADR-EC-054): `tagExpression` was set
 * alongside `includeTags`/`excludeTags`, which are mutually exclusive registration filters. A real
 * `Error` subclass (via `Data.TaggedError`), thrown synchronously outside the Effect error channel,
 * consistent with this package's other registration-time argument-validation throws (`GherkinTags.ts`,
 * `GherkinWatchTriggers.ts`, `StrictMode.ts`, `Tags.ts`).
 */
export class MutuallyExclusiveTagFilterError extends Data.TaggedError("MutuallyExclusiveTagFilterError")<{
  readonly featureName: string
  readonly uri: string
  readonly tagExpression: string
  readonly includeTags: ReadonlyArray<string> | undefined
  readonly excludeTags: ReadonlyArray<string> | undefined
  readonly message: string
}> {}

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
  // ADR-EC-054: BOTH checks below run before anything else — even before `collect()`, which is
  // what actually calls `define` and registers real vitest nodes — so a throw here (a
  // self-contradictory option combination, or a malformed/undeclared-tag expression) registers
  // NOTHING, exactly like `collectFeature`/`describeFeature`'s existing "register, then plan"
  // ordering already guarantees for every other synchronous throw in this file.
  if (
    options?.tagExpression !== undefined &&
    (options.includeTags !== undefined || options.excludeTags !== undefined)
  ) {
    throw new MutuallyExclusiveTagFilterError({
      featureName: feature.name,
      uri: feature.uri,
      tagExpression: options.tagExpression,
      includeTags: options.includeTags,
      excludeTags: options.excludeTags,
      message: `describeFeature's options set BOTH tagExpression (${JSON.stringify(options.tagExpression)}) and `
        + `includeTags/excludeTags (includeTags: ${JSON.stringify(options.includeTags ?? null)}, `
        + `excludeTags: ${JSON.stringify(options.excludeTags ?? null)}) for Feature ${
          JSON.stringify(feature.name)
        } (${feature.uri}). These are mutually exclusive registration filters — choose one.`
    })
  }
  // Compiled against the WHOLE Feature's declared tag universe, the same scope
  // `HookTagExpression.ts`'s own `compileHookTagExpr` already validates a hook's tag expression
  // against (ADR-EC-035) — never only the Scenarios that happen to survive some other filter,
  // since no other filter can be active here (the mutual-exclusion check above).
  const tagExpressionMatcher = options?.tagExpression === undefined
    ? null
    : compileFeatureTagExpression({
      tagExpr: options.tagExpression,
      availableTags: featureTagUniverse(feature.allScenarios),
      featureUri: feature.uri
    })

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
  // collection output rather than interleaved with it. All NINE fields. `tagExpressionMatcher`,
  // when set, overrides `includeTags`/`excludeTags` entirely inside `makeTagFilter` — moot here
  // since the mutual-exclusion check above already guarantees the other two are absent whenever it
  // is set.
  const tagFilter = makeTagFilter({
    includeTags: options?.includeTags,
    excludeTags: options?.excludeTags,
    expression: tagExpressionMatcher
  })

  // Computed UNCONDITIONALLY — every run, not only a `rerunFailedOnly` one — because the write-side
  // script that produces a manifest for a LATER run needs each Scenario's key present in an
  // ORDINARY run's own `--reporter=json` output (ADR-EC-038). Cheap: a couple of `Map` builds over
  // this one Feature's own Scenario list.
  const rerunKeys = rerunKeysForPlan(collection.plan)

  // `Option.none()` (no filter) unless `rerunFailedOnly` is explicitly `true` — `rerunManifestPath`
  // is never even read otherwise, mirroring `includeTags`/`excludeTags`'s own "absent costs nothing"
  // shape.
  const rerunFilter = options?.rerunFailedOnly === true
    ? readRerunManifest(options.rerunManifestPath ?? defaultRerunManifestPath)
    : Option.none()

  // A manifest key under THIS Feature's own uri that matches no Scenario `rerunKeys` computed —
  // renamed, removed, or from a different revision of this file. Detected from this library's own
  // plan data alone, so it follows `plan.warnings`' printing site here rather than
  // `UndeclaredTagWarning`'s adapter-catch pattern, which reacts to a RUNNER rejection instead
  // (ADR-EC-038).
  if (Option.isSome(rerunFilter)) {
    const uriPrefix = `${collection.plan.feature.uri}::`
    const knownKeys = new Set(rerunKeys.values())
    const staleKeys = [...rerunFilter.value].filter((key) => key.startsWith(uriPrefix) && !knownKeys.has(key))
    if (staleKeys.length > 0) {
      console.warn(
        makeStaleRerunManifestKeyWarning({
          uri: collection.plan.feature.uri,
          featureName: collection.plan.feature.name,
          keys: staleKeys
        }).message
      )
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
          excludeTags: tagFilter.exclude,
          // The raw option string, not `tagFilter.expression` (a compiled function, unfit to
          // print) — `undefined` whenever `tagExpression` was not set, which is what tells
          // `makeExcludedScenariosNotice` to derive its reason from the two arrays above instead
          // (ADR-EC-054).
          tagExpression: options?.tagExpression
        }).message
      )
    }
    // No separate notice for `rerunExcludedScenarioCount`: unlike a tag-filter exclusion, a
    // rerun-filter exclusion is the ORDINARY, intended outcome of the Scenario having passed last
    // run — not something a consumer needs a warning about.
  }

  // THE ONE BRANCH between the two provision strategies, and it is an EXPLICIT read of an explicit
  // field rather than a re-inspection of the caller's argument shape.
  const sharedTier = collection.sharedLayer

  // The named `layer(...)` form builds the shared tier EAGERLY, in a `beforeAll` on the Feature's
  // block, so the block has to be opened through it only when something inside will run.
  const anyRunnable = collection.plan.scenarios.some((scenarioPlan) =>
    shouldEmit(tagFilter, scenarioPlan.tags) &&
    !isSkipped(scenarioPlan.tags) &&
    (Option.isNone(rerunFilter) || rerunFilter.value.has(rerunKeys.get(scenarioPlan.scenarioId) ?? ""))
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
    rerunKeys,
    rerunFilter,
    onEmitted,
    // Normalised here, the one place a caller-facing `undefined`/`false` is collapsed to a plain
    // boolean before crossing into `Runner.ts`'s own required field (ADR-EC-053).
    strict: options?.strict === true
  })
}

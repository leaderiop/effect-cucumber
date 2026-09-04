/**
 * The Emit stage: walks a `FeaturePlan` and registers one block per Feature and Rule, one test per
 * Scenario, a teardown hook, and one warning node per unused definition — all through the injected
 * `TestApi`, never through a framework import (`scripts/verify-testapi-seam.sh`).
 *
 * Invariants a reader must not tidy away:
 * - `attempted` is set inside every Scenario thunk and gates the AfterAllScenarios teardown, so a
 *   `-t`/`--tagsFilter` run that attempts nothing tears down nothing (BEH-EC-017,
 *   `scripts/verify-tags-filter.sh`).
 * - `makeOnce` memoises EVERY exit of BeforeAllScenarios, interruption included; every later
 *   Scenario reports the same failure (BEH-EC-017, `test/Runner.test.ts`).
 * - Titles come from `OutlineTitle.ts` (`name` plus the row suffix), keyed by `scenarioId`; never
 *   `astName` (`test/OutlineTitle.test.ts`).
 * - Once-per-Feature hooks are provided nothing: the shared tier is ambient (BEH-EC-006).
 * - Warning nodes are emitted LAST and are `contextFree`, so a Feature whose Scenarios are all
 *   excluded never builds its shared tier (`emission.test.ts` "stays unbuilt").
 * - `@retry` is DECIDED here (`isRetried(scenarioPlan.tags)`) and carried across the `TestApi` seam
 *   as `EmitOptions.retry`, never APPLIED here: this module may not import a test framework
 *   (`scripts/verify-testapi-seam.sh`), so the real `flakyTest` wrap happens one module over, in
 *   `VitestTestApi.ts` (ADR-EC-034, BEH-EC-026).
 * - `EmitOptions.scenario` is `true` for both per-Scenario loops below and `false` for the trailing
 *   warning loop — the ONE other caller of `api.effect` in this module — so `VitestTestApi.ts`'s
 *   `Effect.Metric` wrapper (ADR-EC-037, BEH-EC-029) measures a real Scenario's terminal outcome only,
 *   never a warning node's always-`Effect.void` one.
 * - `rerunKeys` (ADR-EC-038, BEH-EC-030) is computed ONCE by `describeFeature.ts` via
 *   `RerunKey.ts`'s `rerunKeysForPlan` and handed in already built — this module never computes a
 *   rerun key itself, only looks one up per Scenario and stamps it onto `EmitOptions.rerunKey`
 *   UNCONDITIONALLY (every run, not only a `rerunFailedOnly` one), because the write-side script
 *   that produces a manifest for a LATER run needs the key present in an ORDINARY run's own
 *   `--reporter=json` output.
 * - `rerunFilter === null` means no filter at all (`rerunFailedOnly` unset, or its manifest was
 *   absent/unreadable) — every Scenario survives it, mirroring `Tags.ts`'s own `noTagFilter`
 *   sentinel. When it is NOT null and it excludes every Scenario this walk would otherwise emit for
 *   a Feature or a Rule, ONE synthetic skipped node is emitted in that block instead of nothing —
 *   the rough edge the roadmap's "Rerun-failed-only" entry names: an emptied `describe` block trips
 *   vitest's own "no test found in suite" failure, worse than what the filter was trying to avoid.
 */
import type { ParsedScenario } from "@effect-cucumber/gherkin"
import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Random from "effect/Random"
import type * as Scope from "effect/Scope"
import type { UnusedStepDefinitionWarning } from "./Errors.ts"
import { emptyHookSet, type HookSet, mergeHookSets, runHookBatch } from "./Hook.ts"
import { buildScenarioTitles } from "./OutlineTitle.ts"
import type { ErasedExtraLayer, FeaturePlan, ScenarioPlan } from "./Plan.ts"
import { buildScenarioEffect } from "./ScenarioEffect.ts"
import { scenarioKey } from "./ScenarioKey.ts"
import { scenarioSeed } from "./ScenarioSeed.ts"
import { isRetried, isSkipped, shouldEmit, type TagFilter } from "./Tags.ts"
import type { EmitOptions, TestApi } from "./TestApi.ts"

export interface EmitOutcome {
  readonly excludedScenarioCount: number
  readonly rerunExcludedScenarioCount: number
}

const warningTitle = (warning: UnusedStepDefinitionWarning): string =>
  `⚠ unused step definition: ${warning.keyword} ${JSON.stringify(warning.pattern)} (${
    Option.getOrElse(warning.definedAt, () => "an unrecorded location")
  })`

const afterAllScenariosTitle = "⚙ AfterAllScenarios"

const rerunEmptyBlockTitle = "↻ rerunFailedOnly: no Scenario here matched the rerun manifest (nothing to rerun)"

const warningEmitOptions: EmitOptions = {
  tags: [],
  skip: false,
  retry: false,
  contextFree: true,
  scenario: false,
  rerunKey: null
}

/**
 * The one node emitted in place of a `describe` block a `rerunFailedOnly` filter would otherwise
 * leave with zero children (ADR-EC-038) — same shape as `warningEmitOptions` above: `contextFree`
 * so it never forces the shared tier to build, `scenario: false` so `VitestTestApi.ts`'s
 * `Effect.Metric` wrapper does not measure it, and `skip: true` so it never runs a body.
 */
const rerunEmptyBlockEmitOptions: EmitOptions = {
  tags: [],
  skip: true,
  retry: false,
  contextFree: true,
  scenario: false,
  rerunKey: null
}

const scenarioKeyFor = (scenarioPlan: ScenarioPlan): string =>
  scenarioKey(Option.getOrNull(scenarioPlan.ruleId), scenarioPlan.astName)

const makeOnce = (
  body: Effect.Effect<void, unknown, Scope.Scope>
): Effect.Effect<void, unknown, Scope.Scope> => {
  const deferred = Deferred.makeUnsafe<void, unknown>()
  let started = false
  return Effect.suspend((): Effect.Effect<void, unknown, Scope.Scope> => {
    if (started) {
      return Deferred.await(deferred)
    }
    started = true
    // `Deferred.into` completes `deferred` with `body`'s exit and never fails itself; awaiting the
    // deferred re-raises that exit for every later caller.
    return Effect.flatMap(Deferred.into(body, deferred), () => Deferred.await(deferred))
  })
}

/**
 * Declare every test node one planned Feature produces, through the injected seam alone.
 *
 * @param args.plan - one Feature, already planned by `planFeature`
 * @param args.layer - the Feature's PER-SCENARIO Layer tier, passed straight to each Scenario.
 * @param args.hooks - the FEATURE-level hooks only (those whose `ruleId` is `null`), grouped by kind.
 * @param args.ruleHooks - one `HookSet` per `Rule(...)` the Feature declared, keyed by `ParsedRule.id`
 * @param args.scenarioLayers - one already-merged Layer per THREE-argument `Scenario(...)`, keyed by
 * @param args.tagFilter - the caller's normalised registration filter, applied inside this walk and
 * @param args.rerunKeys - one rerun key per `ScenarioPlan.scenarioId`, from `RerunKey.ts`'s
 * `rerunKeysForPlan` — computed once by `describeFeature.ts` and handed in already built.
 * @param args.rerunFilter - the caller's normalised `rerunFailedOnly` manifest, or `null` for no
 * filter at all (ADR-EC-038).
 * @param args.onEmitted - called ONCE with the final `EmitOutcome`, as the last statement inside the
 */
export const emitFeature = (
  args: {
    readonly api: TestApi
    readonly plan: FeaturePlan
    readonly layer: ErasedExtraLayer
    readonly hooks: HookSet
    readonly ruleHooks: ReadonlyMap<string, HookSet>
    readonly ruleLayers: ReadonlyMap<string, ErasedExtraLayer>
    readonly scenarioLayers: ReadonlyMap<string, ErasedExtraLayer>
    readonly tagFilter: TagFilter
    readonly rerunKeys: ReadonlyMap<string, string>
    readonly rerunFilter: ReadonlySet<string> | null
    readonly onEmitted?: ((outcome: EmitOutcome) => void) | undefined
  }
): EmitOutcome => {
  const {
    api,
    hooks,
    layer,
    onEmitted,
    plan,
    rerunFilter,
    rerunKeys,
    ruleHooks,
    ruleLayers,
    scenarioLayers,
    tagFilter
  } = args

  // `excluded`/`rerunExcluded` are this call's whole reported outcome.
  let excludedScenarioCount = 0
  let rerunExcludedScenarioCount = 0
  let attempted = false

  // `rerunFilter === null` (no filter) always passes; otherwise a Scenario survives only when its
  // OWN precomputed key (never recomputed here — `rerunKeys` is the single source of truth) is a
  // member.
  const passesRerunFilter = (scenarioPlan: ScenarioPlan): boolean =>
    rerunFilter === null || rerunFilter.has(rerunKeys.get(scenarioPlan.scenarioId) ?? "")

  // Built once, before anything is emitted: the walk visits every Scenario exactly once.
  const planById = new Map<string, ScenarioPlan>()
  for (const scenarioPlan of plan.scenarios) {
    planById.set(scenarioPlan.scenarioId, scenarioPlan)
  }

  // Built once, before anything is emitted, for the same reason as `planById`.
  const titles = buildScenarioTitles(plan.feature)

  const titleFor = (scenarioPlan: ScenarioPlan): string => titles.get(scenarioPlan.scenarioId) ?? scenarioPlan.name

  // Every Scenario's ambient `Random`, seeded deterministically from its own emitted title — which
  // `OutlineTitle.ts` already disambiguates by Outline row and by byte-identical-title occurrence,
  // so no separate row index is threaded in beside it — plus the Feature's own uri, so two
  // byte-identical titles in two different Features still draw independent sequences
  // (ADR-EC-031, BEH-EC-023). Wraps OUTSIDE `buildScenarioEffect`'s own `Effect.provide(layer)`, so
  // a per-Scenario Layer that provides its own `Random` still wins for any step that reads it —
  // the same "ambient default, consumer Layer overrides" shape `testEnv` already has relative to a
  // step's own Layer.
  const buildSeededScenarioEffect = (
    scenarioPlan: ScenarioPlan,
    effectiveLayer: ErasedExtraLayer,
    hookSet: HookSet
  ): Effect.Effect<void, unknown, Scope.Scope> =>
    Random.withSeed(
      buildScenarioEffect({ plan: scenarioPlan, layer: effectiveLayer, hooks: hookSet }),
      scenarioSeed(plan.feature.uri, titleFor(scenarioPlan))
    )

  const planFor = (scenario: ParsedScenario): ScenarioPlan => {
    const found = planById.get(scenario.id)
    if (found === undefined) {
      // Unreachable by construction — `planFeature` maps `feature.allScenarios`, which is the union
      // of the two arrays this walk reads.
      throw new Error(
        `emitFeature: no ScenarioPlan for scenario id ${JSON.stringify(scenario.id)} (${
          JSON.stringify(scenario.name)
        }). Every Scenario reachable from feature.scenarios and feature.rules must appear in the plan, so this is a bug in Plan.ts or in Runner.ts, not in the .feature file.`
      )
    }
    return found
  }

  // NOTHING is provided to the batch here (F-10). `[]` for `scenarioTags`: `BeforeAllScenarios` is
  // typed `HookRegistrar<RShared>` (BEH-EC-027), never `TaggedHookRegistrar`, so every entry here has
  // `matches: null` by construction and never consults this argument — it exists only because
  // `runHookBatch`'s signature is shared across all six hook kinds.
  const beforeAllScenariosCell: Effect.Effect<void, unknown, Scope.Scope> | null = hooks.BeforeAllScenarios.length > 0
    ? makeOnce(runHookBatch(hooks.BeforeAllScenarios, []))
    : null

  api.describe(plan.feature.name, () => {
    // Feature-level Scenarios first, in the order the document has them.
    for (const scenario of plan.feature.scenarios) {
      const scenarioPlan = planFor(scenario)
      // Earlier is either a thrown "no ScenarioPlan for scenario id" or a silent rewrite of the
      // unused-definition warnings.
      if (!shouldEmit(tagFilter, scenarioPlan.tags)) {
        excludedScenarioCount += 1
        continue
      }
      // Applied AFTER the tag filter, composing the same "registration filter, then the next one
      // over whatever survived" way `includeTags`/`excludeTags` already compose with the CLI filter
      // (ADR-EC-026) — never the reverse order.
      if (!passesRerunFilter(scenarioPlan)) {
        rerunExcludedScenarioCount += 1
        continue
      }
      // `@only` reaches the node as one more entry of `tags` and changes nothing else about the
      // emission.
      const skip = isSkipped(scenarioPlan.tags)
      // `@retry` reaches the node the identical way `@skip` does — a boolean computed here from the
      // Scenario's own tags, carried as plain data across the `TestApi` seam. `Runner.ts` never wraps
      // `flakyTest` itself: only `VitestTestApi.ts` may import a test framework
      // (`scripts/verify-testapi-seam.sh`), so this walk only ever DECIDES, never APPLIES (ADR-EC-034).
      const retry = isRetried(scenarioPlan.tags)
      const effectiveLayer = scenarioLayers.get(scenarioKeyFor(scenarioPlan)) ?? layer
      api.effect(
        titleFor(scenarioPlan),
        beforeAllScenariosCell === null
          ? () => {
            attempted = true
            return buildSeededScenarioEffect(scenarioPlan, effectiveLayer, hooks)
          }
          : () => {
            attempted = true
            return Effect.flatMap(
              beforeAllScenariosCell,
              () => buildSeededScenarioEffect(scenarioPlan, effectiveLayer, hooks)
            )
          },
        // The Scenario's own tags, passed by reference: `ScenarioPlan.tags` is already the flattened,
        // de-duplicated inheritance chain. `scenario: true` — this is a real Scenario, not a warning
        // node (ADR-EC-037). `rerunKeys` always has an entry for every `scenarioId` `planFor` can
        // return — built from the SAME `plan.scenarios` this walk iterates (ADR-EC-038).
        {
          tags: scenarioPlan.tags,
          skip,
          retry,
          contextFree: false,
          scenario: true,
          rerunKey: rerunKeys.get(scenarioPlan.scenarioId) ?? null
        }
      )
    }

    // Then the Rules, each opening its own nested block.
    for (const rule of plan.feature.rules) {
      // Hoisted: `mergeHookSets` allocates six arrays, so it runs once per Rule, outside every thunk.
      const ruleHookSet = mergeHookSets(hooks, ruleHooks.get(rule.id) ?? emptyHookSet)
      // `??
      const ruleLayer = ruleLayers.get(rule.id) ?? layer

      api.describe(rule.name, () => {
        // Scoped to THIS Rule's own block, so the synthetic node below fires only for a Rule the
        // rerun filter emptied out, not for one that was always going to be empty for another reason.
        let ruleEmittedCount = 0
        let ruleRerunExcludedCount = 0
        for (const scenario of rule.scenarios) {
          const scenarioPlan = planFor(scenario)
          // The same two lines as the Feature-level loop, written out rather than shared, for the reason
          // given above.
          if (!shouldEmit(tagFilter, scenarioPlan.tags)) {
            excludedScenarioCount += 1
            continue
          }
          // Same composition order as the Feature-level loop above, for the same reason.
          if (!passesRerunFilter(scenarioPlan)) {
            rerunExcludedScenarioCount += 1
            ruleRerunExcludedCount += 1
            continue
          }
          const skip = isSkipped(scenarioPlan.tags)
          // Same computation as the Feature-level loop above, for the same reason.
          const retry = isRetried(scenarioPlan.tags)
          const effectiveLayer = scenarioLayers.get(scenarioKeyFor(scenarioPlan)) ?? ruleLayer
          ruleEmittedCount += 1
          api.effect(
            titleFor(scenarioPlan),
            beforeAllScenariosCell === null
              ? () => {
                attempted = true
                return buildSeededScenarioEffect(scenarioPlan, effectiveLayer, ruleHookSet)
              }
              : () => {
                attempted = true
                return Effect.flatMap(
                  beforeAllScenariosCell,
                  () => buildSeededScenarioEffect(scenarioPlan, effectiveLayer, ruleHookSet)
                )
              },
            // `contextFree: false` and `scenario: true`, for the same reason as the Feature-level
            // loop's identical fields above.
            {
              tags: scenarioPlan.tags,
              skip,
              retry,
              contextFree: false,
              scenario: true,
              rerunKey: rerunKeys.get(scenarioPlan.scenarioId) ?? null
            }
          )
        }
        // The Rule-level twin of the Feature-level synthetic node below: this Rule's own block would
        // otherwise end up with zero children, purely because of the rerun filter.
        if (rerunFilter !== null && ruleEmittedCount === 0 && ruleRerunExcludedCount > 0) {
          api.effect(rerunEmptyBlockTitle, () => Effect.void, rerunEmptyBlockEmitOptions)
        }
      })
    }

    // Registered whenever a hook exists; `attempted` decides at run time whether it does anything.
    if (hooks.AfterAllScenarios.length > 0) {
      api.afterAll(afterAllScenariosTitle, () => {
        if (!attempted) {
          return Effect.void
        }
        // Same as the once-cell above: no per-Scenario tier is provided to a once-per-Feature hook,
        // and `[]` for the same "never consulted" reason documented on that once-cell.
        const afterAllScenariosEffect: Effect.Effect<void, unknown, Scope.Scope> = runHookBatch(
          hooks.AfterAllScenarios,
          []
        )
        return afterAllScenariosEffect
      })
    }

    // The Feature-level twin of the Rule-level synthetic node above: fires when the rerun filter is
    // the reason NOTHING at all — feature-level or nested in any Rule — was emitted, i.e. every
    // Scenario `plan.scenarios` names was either tag-excluded or rerun-excluded, and at least one
    // was rerun-excluded specifically. Without this, an emptied Feature block trips vitest's own
    // "no test found in suite" — the roadmap's named rough edge (ADR-EC-038).
    if (
      rerunFilter !== null &&
      rerunExcludedScenarioCount > 0 &&
      plan.scenarios.length - excludedScenarioCount - rerunExcludedScenarioCount === 0
    ) {
      api.effect(rerunEmptyBlockTitle, () => Effect.void, rerunEmptyBlockEmitOptions)
    }

    // Reversing this to put the warnings first pushes the Feature's own Scenarios off the top of
    // the block.
    for (const warning of plan.warnings) {
      api.effect(warningTitle(warning), () => Effect.void, warningEmitOptions) // contextFree: true
    }

    // Every counter above is final by the time this line runs, whether the framework runs the
    // callback synchronously or defers it.
    onEmitted?.({ excludedScenarioCount, rerunExcludedScenarioCount })
  })

  // Note (h): CORRECT only for a synchronous `api.describe`, which the recording fake is and vitest
  // is not.
  return { excludedScenarioCount, rerunExcludedScenarioCount }
}

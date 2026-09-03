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
}

const warningTitle = (warning: UnusedStepDefinitionWarning): string =>
  `⚠ unused step definition: ${warning.keyword} ${JSON.stringify(warning.pattern)} (${
    Option.getOrElse(warning.definedAt, () => "an unrecorded location")
  })`

const afterAllScenariosTitle = "⚙ AfterAllScenarios"

const warningEmitOptions: EmitOptions = { tags: [], skip: false, retry: false, contextFree: true }

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
    readonly onEmitted?: ((outcome: EmitOutcome) => void) | undefined
  }
): EmitOutcome => {
  const { api, hooks, layer, onEmitted, plan, ruleHooks, ruleLayers, scenarioLayers, tagFilter } = args

  // `excluded` is this call's whole reported outcome.
  let excludedScenarioCount = 0
  let attempted = false

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

  // NOTHING is provided to the batch here (F-10).
  const beforeAllScenariosCell: Effect.Effect<void, unknown, Scope.Scope> | null = hooks.BeforeAllScenarios.length > 0
    ? makeOnce(runHookBatch(hooks.BeforeAllScenarios))
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
        // de-duplicated inheritance chain.
        { tags: scenarioPlan.tags, skip, retry, contextFree: false }
      )
    }

    // Then the Rules, each opening its own nested block.
    for (const rule of plan.feature.rules) {
      // Hoisted: `mergeHookSets` allocates six arrays, so it runs once per Rule, outside every thunk.
      const ruleHookSet = mergeHookSets(hooks, ruleHooks.get(rule.id) ?? emptyHookSet)
      // `??
      const ruleLayer = ruleLayers.get(rule.id) ?? layer

      api.describe(rule.name, () => {
        for (const scenario of rule.scenarios) {
          const scenarioPlan = planFor(scenario)
          // The same two lines as the Feature-level loop, written out rather than shared, for the reason
          // given above.
          if (!shouldEmit(tagFilter, scenarioPlan.tags)) {
            excludedScenarioCount += 1
            continue
          }
          const skip = isSkipped(scenarioPlan.tags)
          // Same computation as the Feature-level loop above, for the same reason.
          const retry = isRetried(scenarioPlan.tags)
          const effectiveLayer = scenarioLayers.get(scenarioKeyFor(scenarioPlan)) ?? ruleLayer
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
            // `contextFree: false`, for the same reason as the Feature-level loop's identical field
            // above.
            { tags: scenarioPlan.tags, skip, retry, contextFree: false }
          )
        }
      })
    }

    // Registered whenever a hook exists; `attempted` decides at run time whether it does anything.
    if (hooks.AfterAllScenarios.length > 0) {
      api.afterAll(afterAllScenariosTitle, () => {
        if (!attempted) {
          return Effect.void
        }
        // Same as the once-cell above: no per-Scenario tier is provided to a once-per-Feature hook.
        const afterAllScenariosEffect: Effect.Effect<void, unknown, Scope.Scope> = runHookBatch(
          hooks.AfterAllScenarios
        )
        return afterAllScenariosEffect
      })
    }

    // Reversing this to put the warnings first pushes the Feature's own Scenarios off the top of
    // the block.
    for (const warning of plan.warnings) {
      api.effect(warningTitle(warning), () => Effect.void, warningEmitOptions) // contextFree: true
    }

    // Every counter above is final by the time this line runs, whether the framework runs the
    // callback synchronously or defers it.
    onEmitted?.({ excludedScenarioCount })
  })

  // Note (h): CORRECT only for a synchronous `api.describe`, which the recording fake is and vitest
  // is not.
  return { excludedScenarioCount }
}

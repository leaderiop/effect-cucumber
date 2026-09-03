/**
 * The Emit stage: walks a `FeaturePlan` and registers one block per Feature and Rule, one test per
 * Scenario, a teardown hook, and one warning node per unused definition — all through the injected
 * `TestApi`, never through a framework import (`scripts/verify-testapi-seam.sh`).
 *
 * SPIKE (issue #37, following up on issue #36's research): `BeforeAllScenarios` no longer runs
 * inside whichever Scenario attempts it first — it runs via a real `TestApi.beforeAll`, with its
 * OWN timeout budget, registered once at the Feature block level. See
 * `research/concurrent-execution-spike.md` for the full writeup, the reproduced bug, and why the
 * once-cell/`Deferred` approach (`makeOnce`, removed by this spike) could not just be reused as-is.
 *
 * Invariants a reader must not tidy away:
 * - `attempted` is set inside every Scenario thunk and gates the AfterAllScenarios teardown, so a
 *   `-t`/`--tagsFilter` run that attempts nothing tears down nothing (BEH-EC-017,
 *   `scripts/verify-tags-filter.sh`).
 * - `beforeAllScenariosExit` memoises EVERY exit of BeforeAllScenarios, interruption included;
 *   every later Scenario re-raises the SAME failure (BEH-EC-017, `test/Runner.test.ts`) — but the
 *   batch itself now runs ONCE, inside the real `beforeAll` below, never inside a Scenario's own
 *   body. Capturing the Exit (rather than letting a failing `beforeAll` propagate to vitest
 *   directly) is what preserves "every Scenario reports individually" — vitest's own reporting for
 *   a directly-thrown `beforeAll` failure is ONE suite-level failure with every sibling test marked
 *   skipped, which is exactly the shape BEH-EC-017 rules out (verified empirically, see the spike
 *   writeup).
 * - Titles come from `OutlineTitle.ts` (`name` plus the row suffix), keyed by `scenarioId`; never
 *   `astName` (`test/OutlineTitle.test.ts`).
 * - Once-per-Feature hooks are provided nothing: the shared tier is ambient (BEH-EC-006).
 * - Warning nodes are emitted LAST and are `contextFree`, so a Feature whose Scenarios are all
 *   excluded never builds its shared tier (`emission.test.ts` "stays unbuilt").
 * - No manual "was anything attempted" guard exists for the new `beforeAll`'s BODY: vitest itself
 *   never invokes a block's `beforeAll`/`afterAll` when every descendant leaf test in that block is
 *   skipped or filtered out (verified empirically across `.skip`, `-t`, and `--tagsFilter` — see the
 *   spike writeup), so registering `api.beforeAll` only when `hooks.BeforeAllScenarios.length > 0`
 *   (the same guard `AfterAllScenarios` already used) is sufficient.
 */
import type { ParsedScenario } from "@effect-cucumber/gherkin"
import * as Effect from "effect/Effect"
import type * as Exit from "effect/Exit"
import * as Option from "effect/Option"
import type * as Scope from "effect/Scope"
import type { UnusedStepDefinitionWarning } from "./Errors.ts"
import { emptyHookSet, type HookSet, mergeHookSets, runHookBatch } from "./Hook.ts"
import { buildScenarioTitles } from "./OutlineTitle.ts"
import type { ErasedExtraLayer, FeaturePlan, ScenarioPlan } from "./Plan.ts"
import { buildScenarioEffect } from "./ScenarioEffect.ts"
import { scenarioKey } from "./ScenarioKey.ts"
import { isSkipped, shouldEmit, type TagFilter } from "./Tags.ts"
import type { EmitOptions, TestApi } from "./TestApi.ts"

export interface EmitOutcome {
  readonly excludedScenarioCount: number
}

const warningTitle = (warning: UnusedStepDefinitionWarning): string =>
  `⚠ unused step definition: ${warning.keyword} ${JSON.stringify(warning.pattern)} (${
    Option.getOrElse(warning.definedAt, () => "an unrecorded location")
  })`

const afterAllScenariosTitle = "⚙ AfterAllScenarios"
// SPIKE (issue #37/#36): the real `beforeAll` node's own title.
const beforeAllScenariosTitle = "⚙ BeforeAllScenarios"

const warningEmitOptions: EmitOptions = { tags: [], skip: false, contextFree: true }

const scenarioKeyFor = (scenarioPlan: ScenarioPlan): string =>
  scenarioKey(Option.getOrNull(scenarioPlan.ruleId), scenarioPlan.astName)

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

  // SPIKE (issue #37/#36): whether the Feature declared a BeforeAllScenarios hook at all — decided
  // once, outside every thunk, exactly like the once-cell's own `=== null` check used to be.
  const hasBeforeAllScenarios = hooks.BeforeAllScenarios.length > 0

  // Set exactly once, by the real `beforeAll` registered below — `null` until then. Every Scenario
  // thunk reads this (never re-runs the batch) and re-raises the SAME Exit, success or failure,
  // preserving BEH-EC-017's "every Scenario reports individually" guarantee even though the batch
  // itself now runs outside any Scenario's own body. See this file's header comment.
  let beforeAllScenariosExit: Exit.Exit<void, unknown> | null = null

  // A Scenario's own body, gated on BeforeAllScenarios's captured Exit when the Feature declared
  // one. `Effect.suspend` so a still-`null` exit (only reachable if a Scenario's thunk somehow runs
  // before its Feature's `beforeAll` — never true under real vitest scheduling, see the header
  // comment's guard note) is read at RUN time, not at registration time.
  const scenarioThunk = (
    scenarioPlan: ScenarioPlan,
    effectiveLayer: ErasedExtraLayer,
    scenarioHooks: HookSet
  ): () => Effect.Effect<void, unknown, Scope.Scope> =>
  () => {
    attempted = true
    const runScenario = (): Effect.Effect<void, unknown, Scope.Scope> =>
      buildScenarioEffect({ plan: scenarioPlan, layer: effectiveLayer, hooks: scenarioHooks })
    if (!hasBeforeAllScenarios) {
      return runScenario()
    }
    return Effect.suspend(() =>
      // `Exit` is itself an `Effect` in v4 (`Exit.Proto<A, E> extends Effect.Effect<A, E>`), so the
      // captured Exit needs no `fromExit`-style conversion: `flatMap`ing it directly re-raises its
      // failure (with the exact same `Cause`) or proceeds into the Scenario on success.
      beforeAllScenariosExit === null
        ? runScenario()
        : Effect.flatMap(beforeAllScenariosExit, runScenario)
    )
  }

  api.describe(plan.feature.name, () => {
    // SPIKE (issue #37/#36): registered FIRST, ahead of every Scenario and every nested Rule block,
    // so — under real vitest scheduling — it always completes (or is itself skipped by vitest when
    // nothing in this block will run, per the header comment's guard note) before any Scenario's own
    // body starts, regardless of which Scenario vitest happens to run first and regardless of that
    // Scenario's OWN `testTimeout`. NOTHING is provided to the batch (F-10) — the shared tier is
    // ambient via `sharedLayerTestApi`'s own `beforeAll`/`layer(...)` wiring.
    if (hasBeforeAllScenarios) {
      api.beforeAll(
        beforeAllScenariosTitle,
        () =>
          Effect.map(Effect.exit(runHookBatch(hooks.BeforeAllScenarios)), (exit) => {
            beforeAllScenariosExit = exit
          })
      )
    }

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
      const effectiveLayer = scenarioLayers.get(scenarioKeyFor(scenarioPlan)) ?? layer
      api.effect(
        titleFor(scenarioPlan),
        scenarioThunk(scenarioPlan, effectiveLayer, hooks),
        // The Scenario's own tags, passed by reference: `ScenarioPlan.tags` is already the flattened,
        // de-duplicated inheritance chain.
        { tags: scenarioPlan.tags, skip, contextFree: false }
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
          const effectiveLayer = scenarioLayers.get(scenarioKeyFor(scenarioPlan)) ?? ruleLayer
          api.effect(
            titleFor(scenarioPlan),
            scenarioThunk(scenarioPlan, effectiveLayer, ruleHookSet),
            // `contextFree: false`, for the same reason as the Feature-level loop's identical field
            // above.
            { tags: scenarioPlan.tags, skip, contextFree: false }
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

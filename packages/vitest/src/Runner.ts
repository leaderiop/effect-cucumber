/**
 * The Emit stage, and the ONLY module in this repo whose job is emission.
 *
 * `Plan.ts` resolved every step and `ScenarioEffect.ts` composed each Scenario into one Effect.
 * All that is left is to declare the test nodes: one `describe` per Feature, one nested `describe`
 * per `Rule`, one test per Scenario, and — last — one always-passing node per registered step
 * definition nothing used. That is pass 3 of `.planning/research/ARCHITECTURE.md`'s
 * Register→Plan→Emit pipeline, and `spec/glossary.md` already locks the shape: a Feature "compiles
 * to one vitest `describe(feature.name, ...)` block" and a Rule to a nested
 * `describe(rule.name, ...)`.
 *
 * It reaches those two functions exclusively through the `TestApi` it is handed. It imports no test
 * framework, and `describeFeature.ts` — the composition root — is the single place that decides
 * which real implementation to pass.
 *
 * Six things about this module are not visible from the code.
 *
 * (a) **No import from `vitest`, or from the `@effect` package wrapping it, may ever appear here —
 *     not even an `import type`.** Neither name is written out anywhere in this file, comments
 *     included, because the acceptance grep that enforces the rule cannot tell a citation from an
 *     import; `TestApi.ts` note (a) spells both out and is the place to read them.
 *     ARCHITECTURE.md's Anti-Pattern 3 is the verified failure this rule exists
 *     for: `layer(sharedLayer)` hands its callback a `Vitest.MethodsNonLive<R>` carrying the shared
 *     Layer's services, and calling the MODULE-LEVEL `it.effect` inside that callback still
 *     compiles and still passes, because each Scenario provides its own Layers — while silently
 *     rebuilding the "shared" resource once per Scenario. That is a BEH-EC-007 violation with no
 *     failing test anywhere, invisible until someone counts testcontainer starts, and it becomes
 *     live in Phase 10 when RUN-03/RUN-04 add the shared path. Taking the framework only through
 *     the parameter makes the wrong `it` unreachable rather than merely discouraged. `TestApi.ts`
 *     note (a) is the other half of the argument, and an acceptance grep enforces both.
 *
 *     The second payoff is that this module is testable at all: with no framework in its type
 *     graph, `test/Runner.test.ts` asserts what was emitted against a recording fake, from inside a
 *     vitest test, with no vitest machinery in scope. Asserting against the real `describe`/`it`
 *     is not merely harder — a vitest test cannot observe what its own run registered.
 *
 * (b) **`buildScenarioEffect` is called inside a THUNK, never eagerly while the block is being
 *     collected.** `TestApi.effect` takes `() => Effect<…>` precisely so the decision of when to
 *     build belongs to the framework. Passing `buildScenarioEffect({ … })` directly would compose
 *     every Scenario's Effect during collection — and since the composed value is what carries the
 *     `Effect.provide`, it would move Layer construction into collection for every Scenario in the
 *     file, including the ones a `-t` filter is about to skip. `ScenarioEffect.ts` note (b) is the
 *     invariant that depends on this: the Layer is built when the Effect RUNS, and every execution
 *     builds it again (INV-EC-002). An eagerly-built Effect still type-checks and still passes.
 *
 * (c) **An unused step definition emits an always-passing node, and the warnings come LAST.**
 *     ADR-EC-019 makes an unused pattern a WARNING and not a failure — dead code, not a broken
 *     Scenario — so the node can be neither failing nor skipped. `Effect.void` is the whole body. A
 *     skipped node would be worse than a failing one in one specific way: the count of skipped tests
 *     a reporter prints would stop meaning "tests the author chose not to run", which is the only
 *     thing that number is good for. This is 06-CONTEXT.md D-02's channel 2, reading the same
 *     `plan.warnings` list channels 1 and 3 read; it is a presentation, never a second computation.
 *
 *     They are emitted after every Scenario, and the plausible reversal is "put the warnings first,
 *     they are more visible". They must not go first: a Feature's own Scenarios are what a reader
 *     opens the reporter to look at, and pushing them below a variable-length block of warnings
 *     moves the thing being tested off the top of the block. The warning is a footnote by design —
 *     visible in the reporter rather than only in scrollback, which is all D-02 asks of channel 2.
 *
 *     The title carries the keyword and the definition site, not the pattern alone. Two identical
 *     pattern strings registered at two different sites are a real arrangement — `test/Plan.test.ts`
 *     has one — and two identically-titled test nodes are handled badly by `vitest`'s reporter and
 *     by `vitest/no-identical-title` alike (threat T-06-06-02). The pattern is rendered with
 *     `JSON.stringify`, copying `Plan.ts`'s `quoted`: a pattern containing a quote or a newline
 *     cannot then forge what looks like a second node in the reporter's output (T-06-06-01).
 *     Feature, Rule and Scenario names are deliberately NOT escaped — they must render exactly the
 *     way the author wrote them, which is the entire job of a test title.
 *
 * (d) **`ScenarioPlan.name` is the BASE of the title; `astName` never is.** `name` is the
 *     interpolated Pickle name, so a Scenario Outline's two Examples rows read `adding 1` and
 *     `adding 2`; `astName` is the un-interpolated `adding <count>` that every row of one Outline
 *     shares. Titling with `astName` compiles, type-checks, and works perfectly on every plain
 *     Scenario in a suite before collapsing an Outline's rows into N identically-named tests.
 *     `Plan.ts` note (c) records the mirrored trap on the other side: `astName` is the scope-match
 *     key and `name` never is.
 *
 *     What actually reaches `api.effect` is `OutlineTitle.ts`'s `buildScenarioTitles` result, which
 *     is that same `name` for a plain Scenario and `name` plus D-03's `(col=value, ...)` suffix for
 *     an Outline row. The suffix is not cosmetic and `name` alone is not a substitute for it:
 *     interpolation only substitutes placeholders the TITLE TEXT actually references, so an Outline
 *     titled with no `<placeholder>` at all gives every one of its rows a byte-identical `name` —
 *     the same N-identically-named-tests outcome `astName` produces, arrived at from the other
 *     direction. `OutlineTitle.ts` note (a) has the empirical verification. Only Scenario titles go
 *     through it; `warningTitle` and `afterAllScenariosTitle` are untouched by D-03.
 *
 * (e) **`BeforeAllScenarios`/`AfterAllScenarios` share one Feature-wide execution through a
 *     synchronous `Deferred`, computed and composed entirely inside this module — `TestApi.ts` gains
 *     no new member.** `Deferred`'s unsafe constructor is synchronous, so it is constructible during the
 *     emission walk itself, unlike `Effect.cached` (whose memo is only reachable by running an
 *     Effect first — it does not compose with a synchronous walk that must hand N independent
 *     thunks to `TestApi.effect`) or `Effect.once` (which does not exist in this build). `makeOnce`,
 *     declared at module scope below, turns a `BeforeAllScenarios` batch into an Effect that runs the
 *     batch on its first execution and hands every later caller the SAME outcome — success or
 *     failure — via `Deferred.await`. That `await` on the second and later callers is what makes
 *     D-08's literal requirement true: a failing `BeforeAllScenarios` reaches every Scenario
 *     individually, not only whichever one happened to run first. The Feature's Layer is provided
 *     INSIDE the cell, at the point `makeOnce` is called, rather than inside whichever Scenario's own
 *     composed Effect happens to trigger it — providing it there would bind the Feature-wide hook to
 *     Scenario one's particular Layer instance, which is not what a Feature-wide hook means.
 *
 *     `AfterAllScenarios`, by contrast, is not a once-cell at all: it is ONE extra node emitted after
 *     every Scenario (Rules included) and before the warnings, whose body runs the batch directly. A
 *     separate emitted node is what makes D-09's "runs always" structural rather than arranged: it
 *     does not await the `BeforeAllScenarios` deferred, so a failed `BeforeAllScenarios` cannot stop
 *     it, and it is a sibling of the Scenario nodes, so a failed Scenario cannot stop it either. The
 *     plausible tidy-up "wrap the whole `describe` block in a finalizer instead" has nothing to wrap —
 *     `TestApi.describe`'s `define` returns `void` (note (c) above), so there is no Effect there to
 *     attach a finalizer to. The other plausible tidy-up, "emit it after the warnings, they come
 *     last", is note (c)'s own rule read backwards: the warnings are always-passing footnotes and
 *     this node can fail, so it belongs with the things that report results, not below them. Emission
 *     order stays document order throughout; running "always" is a runtime property of the emitted
 *     Effects, never a reordering of the emitted nodes.
 *
 * (f) **The Layer a Scenario runs with is SUBSTITUTED from three tiers, never merged here; the
 *     `HookSet` is the opposite, and is merged here — once per Rule.** The two look symmetrical in
 *     the loops below and are not, which is the single most plausible thing to "make consistent".
 *
 *     Layers: `describeFeature.ts` does every merge at REGISTRATION time, where the extra Layer is
 *     captured — a Rule's entry is already `Layer.provideMerge(featureLayer)(extraLayer)` and a
 *     Scenario's is already built on top of whatever was ambient where its `Scenario(...)` call was
 *     written, which inside a Rule is that Rule's already-merged Layer. So the resolution here is
 *     three `??` fallbacks and nothing else: `scenarioLayers` hit, else the Rule's, else the
 *     Feature's. `provideMerge` is idempotent in SERVICES and not in BUILDS, so re-merging a hit
 *     against the tier below it compiles, type-checks, leaves every service reachable, and rebuilds
 *     every ambient `Layer.effect` resource an extra time per Scenario with nothing going red
 *     (`describeFeature.ts`'s `scenarioLayers` field comment states the invariant this depends on).
 *
 *     Hooks: `describeFeature.ts` deliberately does NOT pre-merge those, because the ORDER is
 *     D-02's and belongs in one place — `Hook.ts`'s `mergeHookSets`, whose note (h) is why a merged
 *     array needs no second `Effect.onExit` tier and why `ScenarioEffect.ts` is untouched by any of
 *     this. The merge happens once per Rule, hoisted out of both the Scenario loop and the emitted
 *     thunks: the result is identical however often it is computed, so nothing can observe the
 *     placement, which is precisely why it is written down.
 *
 *     There is no fourth tier and no Scenario-scoped `HookSet`. ADR-EC-010 scopes hooks to a Rule and
 *     no further, so a Scenario's own extra Layer changes its services without changing which hooks
 *     run around it.
 *
 * The nesting walk re-derives Feature/Rule structure from `feature.scenarios` and `feature.rules`,
 * while `plan.scenarios` was built off the flat `feature.allScenarios`. The `Map` keyed on
 * `scenarioId` is how the two views are joined, and it is built once rather than per lookup. A
 * `ParsedScenario` with no entry in it is unreachable by construction, so the miss is a thrown
 * `Error` naming the id and the two modules that could be wrong — `Registry.ts`'s preferred shape
 * for an impossible state, and the reason there is no `!` anywhere in this file under
 * `noUncheckedIndexedAccess`.
 *
 * The three `any`s in `Layer.Layer<any, any, never>` are erased detail and not a widening of any
 * contract; the value is passed straight through to `buildScenarioEffect`, whose own closing
 * paragraph has the argument verbatim. If one of the declarations is ever narrowed, narrow all of
 * them: they describe the same value.
 *
 * Local imports are `./Plan.ts` and `./TestApi.ts` (both type-only), `./ScenarioEffect.ts`,
 * `./OutlineTitle.ts`, `./Hook.ts` and `./ScenarioKey.ts`. That last one is a LEAF holding the
 * `scenarioLayers` key encoding, and it is a module rather than a private helper here for a reason
 * its own header states: `describeFeature.ts` writes that map and this file reads it, this file
 * cannot import `describeFeature.ts` (that edge closes a cycle and fails `pnpm circular`), and two
 * independently-written copies of the encoding compile, type-check and lint while disagreeing — a
 * disagreement that reads as "no Scenario asked for an extra Layer" on every lookup. This
 * module is INTERNAL and is not re-exported from `packages/vitest/src/index.ts` — a consumer calls
 * `describeFeature`, never a runner, and publishing an emission walk would freeze an internal stage
 * into the package's contract. `Registry.ts`, `collectFeature`, `TestApi.ts`, `Plan.ts` and
 * `ScenarioEffect.ts` all set the same precedent.
 */
import type { ParsedScenario } from "@effect-cucumber/gherkin"
import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import type * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import type * as Scope from "effect/Scope"
import type { UnusedStepDefinitionWarning } from "./Errors.ts"
import { emptyHookSet, type HookSet, mergeHookSets, runHookBatch } from "./Hook.ts"
import { buildScenarioTitles } from "./OutlineTitle.ts"
import type { FeaturePlan, ScenarioPlan } from "./Plan.ts"
import { buildScenarioEffect } from "./ScenarioEffect.ts"
import { scenarioKey } from "./ScenarioKey.ts"
import type { TestApi } from "./TestApi.ts"

/**
 * The title of the synthetic node that reports one unused step definition — note (c).
 *
 * The leading `⚠` is what makes the node findable in a reporter that lists a hundred passing tests,
 * and the keyword plus the site are what keep two registrations of one pattern string distinct.
 */
const warningTitle = (warning: UnusedStepDefinitionWarning): string =>
  `⚠ unused step definition: ${warning.keyword} ${JSON.stringify(warning.pattern)} (${
    Option.getOrElse(warning.definedAt, () => "an unrecorded location")
  })`

/**
 * The title of the synthetic node that runs a Feature's `AfterAllScenarios` hooks — note (e).
 *
 * A CONSTANT string with no interpolation of any Feature, Rule or Scenario name, deliberately:
 * `warningTitle`'s `JSON.stringify` is what defends against a pattern string forging a second node in
 * a reporter's output (T-06-06-01), and a constant simply has no document text available to forge it
 * with (T-07-06-01).
 */
const afterAllScenariosTitle = "⚙ AfterAllScenarios"

/**
 * The `scenarioLayers` key one planned Scenario is looked up under — note (f).
 *
 * `astName` and NEVER `name`, which is note (d)'s trap read from the other direction: `name` is the
 * INTERPOLATED Pickle name, so an Outline's two rows carry `adding 1` and `adding 2` while
 * `describeFeature.ts` recorded the single entry both rows share under the un-interpolated
 * `adding <count>` the author passed to `Scenario(...)`. Keying on `name` misses on every Outline row
 * and hits on every plain Scenario — where the two strings are equal, which is every other fixture in
 * this repo — so the Outline's own extra Layer is silently dropped while nothing goes red.
 *
 * `Option.getOrNull` and not `Option.getOrElse(… "<feature>")`: the `<feature>` head belongs to the
 * ENCODING, which is `ScenarioKey.ts`'s alone. Spelling the sentinel a second time here would be a
 * second place for the two sides of the map to drift apart, which is the whole thing that module
 * exists to prevent.
 *
 * At module scope rather than inside `emitFeature`, because it closes over nothing from the emission
 * walk — `titleFor` and `planFor` below both read per-call state and genuinely cannot be hoisted.
 */
const scenarioKeyFor = (scenarioPlan: ScenarioPlan): string =>
  scenarioKey(Option.getOrNull(scenarioPlan.ruleId), scenarioPlan.astName)

/**
 * Turn `body` into an Effect that runs AT MOST ONCE across every execution, handing the same
 * outcome — success or failure — to every later caller. The mechanism behind
 * `BeforeAllScenarios`'s once-cell — note (e).
 *
 * The plain `started` boolean is sound because the framework runs the tests of one file
 * sequentially, and every node this module emits runs to completion before the next one begins —
 * there is no interleaving for two callers to race inside. `Deferred.await` on the second and later
 * callers, rather than re-running `body`, is what makes a FAILING `BeforeAllScenarios` reach every
 * Scenario individually rather than only the first one to run — D-08's literal requirement.
 *
 * The explicit return annotation is required, not stylistic: `composite: true` demands it, and
 * pinning `Effect<void, unknown, Scope.Scope>` here keeps `any` out of the emitted contract.
 */
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
    // `Deferred.into` completes `deferred` with `body`'s exit and itself never fails (it reports
    // completion as a boolean); the `flatMap` into `Deferred.await` is what turns that completion
    // back into `body`'s own outcome for THIS, the first, caller — not only for later ones.
    return Effect.flatMap(Deferred.into(body, deferred), () => Deferred.await(deferred))
  })
}

/**
 * Declare every test node one planned Feature produces, through the injected seam alone.
 *
 * One `describe` named after the Feature; inside it, the Feature-level Scenarios in document order,
 * then one nested `describe` per `Rule` holding that Rule's own Scenarios, then the unused-definition
 * warnings. The order is the document's and is never sorted or interleaved — `ParsedFeatureCore`
 * lists `scenarios` and `rules` the way the file does.
 *
 * Returns `void`, and every callback it hands to `describe` returns `void` too. An async block
 * callback returns before registering anything, so the Feature would emit zero tests and PASS;
 * `TestApi.describe`'s `define` is typed `() => void` so that cannot be written here at all
 * (`TestApi.ts` note (c)).
 *
 * @param args.api - the test framework surface, injected — note (a)
 * @param args.plan - one Feature, already planned by `planFeature`
 * @param args.layer - the Feature's single merged Layer, passed straight to each Scenario
 * @param args.hooks - the FEATURE-level hooks only (those whose `ruleId` is `null`), grouped by kind.
 *   Merged with an enclosing Rule's own before reaching `buildScenarioEffect` — note (f); this module
 *   does not WEAVE them into the Scenario's Effect either way, `ScenarioEffect.ts` does
 * @param args.ruleHooks - one `HookSet` per `Rule(...)` the Feature declared, keyed by `ParsedRule.id`
 * @param args.ruleLayers - one already-merged Layer per `Rule(...)`, keyed the same way — note (f)
 * @param args.scenarioLayers - one already-merged Layer per THREE-argument `Scenario(...)`, keyed by
 *   `ScenarioKey.ts`'s composite. Sparse: the common two-argument form contributes no entry
 */
export const emitFeature = (
  args: {
    readonly api: TestApi
    readonly plan: FeaturePlan
    readonly layer: Layer.Layer<any, any, never>
    readonly hooks: HookSet
    readonly ruleHooks: ReadonlyMap<string, HookSet>
    readonly ruleLayers: ReadonlyMap<string, Layer.Layer<any, any, never>>
    readonly scenarioLayers: ReadonlyMap<string, Layer.Layer<any, any, never>>
  }
): void => {
  const { api, hooks, layer, plan, ruleHooks, ruleLayers, scenarioLayers } = args

  // Built once, before anything is emitted, and not per lookup: the walk below visits every Scenario
  // exactly once, so a linear search per visit would be quadratic in a Feature's Scenario count for
  // no benefit.
  const planById = new Map<string, ScenarioPlan>()
  for (const scenarioPlan of plan.scenarios) {
    planById.set(scenarioPlan.scenarioId, scenarioPlan)
  }

  // Built once, before anything is emitted, for the same reason and at the same place as `planById`
  // above: one walk over the document's Examples tables serves every Scenario the loops below visit.
  // Keyed by `ScenarioPlan.scenarioId` (== `ParsedScenario.id` == `Pickle.id`) — note (d).
  const titles = buildScenarioTitles(plan.feature)

  /**
   * The emitted title of one planned Scenario — note (d).
   *
   * The `??` is defensive only: `buildScenarioTitles` is total over `feature.allScenarios`, which is
   * the union of the two arrays this walk reads, so the fallback branch is structurally unreachable.
   * It is an explicit fallback rather than a `!`, mirroring `planFor`'s own preference for saying
   * what happens on a miss over asserting one cannot occur under `noUncheckedIndexedAccess`.
   */
  const titleFor = (scenarioPlan: ScenarioPlan): string => titles.get(scenarioPlan.scenarioId) ?? scenarioPlan.name

  const planFor = (scenario: ParsedScenario): ScenarioPlan => {
    const found = planById.get(scenario.id)
    if (found === undefined) {
      // Unreachable by construction — `planFeature` maps `feature.allScenarios`, which is the union
      // of the two arrays this walk reads. Thrown with an explanation rather than silenced with a
      // non-null assertion, so the day it does happen the message names where to look.
      throw new Error(
        `emitFeature: no ScenarioPlan for scenario id ${JSON.stringify(scenario.id)} (${
          JSON.stringify(scenario.name)
        }). Every Scenario reachable from feature.scenarios and feature.rules must appear in the plan, so this is a bug in Plan.ts or in Runner.ts, not in the .feature file.`
      )
    }
    return found
  }

  // Built once per Feature, before anything is emitted — note (e). `null` when the Feature registers
  // no `BeforeAllScenarios` hook, so a hookless Feature's Scenario thunks stay byte-for-byte what
  // plan 07-04 left them as.
  const beforeAllScenariosCell: Effect.Effect<void, unknown, Scope.Scope> | null = hooks.BeforeAllScenarios.length > 0
    ? makeOnce(runHookBatch(hooks.BeforeAllScenarios).pipe(Effect.provide(layer)))
    : null

  api.describe(plan.feature.name, () => {
    // Feature-level Scenarios first, in the order the document has them.
    //
    // This loop reads `hooks` and `layer` — the FEATURE's own — plus `scenarioLayers`, and it must
    // never read `ruleHooks` or `ruleLayers`: a Scenario out here has no enclosing Rule, so consulting
    // either would hand it services and hooks INV-EC-005 makes invisible outside that Rule. Nothing in
    // the types stops it, and every step would still resolve, so the compile-time boundary would hold
    // in the checker and nowhere else (threat T-08-07-03). The two identifiers are deliberately absent
    // from this loop's body.
    for (const scenario of plan.feature.scenarios) {
      const scenarioPlan = planFor(scenario)
      const effectiveLayer = scenarioLayers.get(scenarioKeyFor(scenarioPlan)) ?? layer
      api.effect(
        titleFor(scenarioPlan),
        beforeAllScenariosCell === null
          ? () => buildScenarioEffect({ plan: scenarioPlan, layer: effectiveLayer, hooks })
          : () =>
            Effect.flatMap(
              beforeAllScenariosCell,
              () => buildScenarioEffect({ plan: scenarioPlan, layer: effectiveLayer, hooks })
            )
      )
    }

    // Then the Rules, each opening its own nested block. Written out rather than shared with the
    // loop above, because the two are the same three lines at two different nesting depths and the
    // shared helper hides the one property that matters here: which block the node lands in.
    for (const rule of plan.feature.rules) {
      // ONCE PER RULE, outside the Scenario loop below and outside every emitted thunk — note (f).
      // Hoisting matters: `mergeHookSets` allocates six fresh arrays, so computing it per Scenario
      // would rebuild them N times, and computing it INSIDE the thunk would rebuild them on every
      // execution of every Scenario. Neither is observable in any assertion — the merged value is
      // identical each time — which is exactly why the placement is stated here rather than left to
      // read as incidental.
      //
      // `emptyHookSet` and not `hooks`, on a miss: `mergeHookSets(hooks, hooks)` would run every
      // Feature-level hook TWICE for a Rule that registered none of its own. A miss here means "this
      // Rule declared no hooks", which is `emptyHookSet` exactly.
      const ruleHookSet = mergeHookSets(hooks, ruleHooks.get(rule.id) ?? emptyHookSet)
      // `?? layer` and not a merge: `ruleLayers`' entries arrive from `describeFeature.ts` ALREADY
      // merged onto the Feature's own via `Layer.provideMerge`, so a hit is the whole effective Layer
      // and a miss means the Rule contributed nothing. Re-merging a hit against `layer` type-checks,
      // leaves every service reachable, and quietly builds every ambient `Layer.effect` resource an
      // extra time per Scenario (threat T-08-07-01).
      const ruleLayer = ruleLayers.get(rule.id) ?? layer

      api.describe(rule.name, () => {
        for (const scenario of rule.scenarios) {
          const scenarioPlan = planFor(scenario)
          // The third and innermost tier, and it SUBSTITUTES rather than wraps, for the same reason
          // `ruleLayer` does: `describeFeature.ts` built this entry on top of whichever Layer was
          // ambient where the `Scenario(...)` call was written, which inside a Rule is that Rule's
          // already-merged one. So a hit already contains the Feature's services AND the Rule's.
          const effectiveLayer = scenarioLayers.get(scenarioKeyFor(scenarioPlan)) ?? ruleLayer
          api.effect(
            titleFor(scenarioPlan),
            beforeAllScenariosCell === null
              ? () => buildScenarioEffect({ plan: scenarioPlan, layer: effectiveLayer, hooks: ruleHookSet })
              : () =>
                Effect.flatMap(
                  beforeAllScenariosCell,
                  () => buildScenarioEffect({ plan: scenarioPlan, layer: effectiveLayer, hooks: ruleHookSet })
                )
          )
        }
      })
    }

    // AfterAllScenarios — note (e). ONE extra always-attempted node, a sibling of the Scenario nodes
    // rather than a finalizer wrapped around this block, emitted after every Scenario (Rules
    // included) and before the warnings.
    if (hooks.AfterAllScenarios.length > 0) {
      api.effect(afterAllScenariosTitle, () => {
        const afterAllScenariosEffect: Effect.Effect<void, unknown, Scope.Scope> = runHookBatch(
          hooks.AfterAllScenarios
        ).pipe(Effect.provide(layer))
        return afterAllScenariosEffect
      })
    }

    // Last, and always passing — note (c). Reversing this to put the warnings first pushes the
    // Feature's own Scenarios off the top of the block.
    for (const warning of plan.warnings) {
      api.effect(warningTitle(warning), () => Effect.void)
    }
  })
}

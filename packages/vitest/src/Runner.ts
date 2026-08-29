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
 * Four things about this module are not visible from the code.
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
 * (d) **`ScenarioPlan.name` is the title; `astName` never is.** `name` is the interpolated Pickle
 *     name, so a Scenario Outline's two Examples rows read `adding 1` and `adding 2`; `astName` is
 *     the un-interpolated `adding <count>` that every row of one Outline shares. Titling with
 *     `astName` compiles, type-checks, and works perfectly on every plain Scenario in a suite before
 *     collapsing an Outline's rows into N identically-named tests. `Plan.ts` note (c) records the
 *     mirrored trap on the other side: `astName` is the scope-match key and `name` never is.
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
 * Local imports are `./Plan.ts` and `./TestApi.ts` (both type-only) and `./ScenarioEffect.ts`. This
 * module is INTERNAL and is not re-exported from `packages/vitest/src/index.ts` — a consumer calls
 * `describeFeature`, never a runner, and publishing an emission walk would freeze an internal stage
 * into the package's contract. `Registry.ts`, `collectFeature`, `TestApi.ts`, `Plan.ts` and
 * `ScenarioEffect.ts` all set the same precedent.
 */
import type { ParsedScenario } from "@effect-cucumber/gherkin"
import * as Effect from "effect/Effect"
import type * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import type { UnusedStepDefinitionWarning } from "./Errors.ts"
import type { HookSet } from "./Hook.ts"
import type { FeaturePlan, ScenarioPlan } from "./Plan.ts"
import { buildScenarioEffect } from "./ScenarioEffect.ts"
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
 * @param args.hooks - the Feature's registered hooks, grouped by kind, passed straight to each
 *   `buildScenarioEffect` call inside the emission walk below — this module does not weave them
 *   itself, `ScenarioEffect.ts` does
 */
export const emitFeature = (
  args: {
    readonly api: TestApi
    readonly plan: FeaturePlan
    readonly layer: Layer.Layer<any, any, never>
    readonly hooks: HookSet
  }
): void => {
  const { api, hooks, layer, plan } = args

  // Built once, before anything is emitted, and not per lookup: the walk below visits every Scenario
  // exactly once, so a linear search per visit would be quadratic in a Feature's Scenario count for
  // no benefit.
  const planById = new Map<string, ScenarioPlan>()
  for (const scenarioPlan of plan.scenarios) {
    planById.set(scenarioPlan.scenarioId, scenarioPlan)
  }

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

  api.describe(plan.feature.name, () => {
    // Feature-level Scenarios first, in the order the document has them.
    for (const scenario of plan.feature.scenarios) {
      const scenarioPlan = planFor(scenario)
      api.effect(scenarioPlan.name, () => buildScenarioEffect({ plan: scenarioPlan, layer, hooks }))
    }

    // Then the Rules, each opening its own nested block. Written out rather than shared with the
    // loop above, because the two are the same three lines at two different nesting depths and the
    // shared helper hides the one property that matters here: which block the node lands in.
    for (const rule of plan.feature.rules) {
      api.describe(rule.name, () => {
        for (const scenario of rule.scenarios) {
          const scenarioPlan = planFor(scenario)
          api.effect(scenarioPlan.name, () => buildScenarioEffect({ plan: scenarioPlan, layer, hooks }))
        }
      })
    }

    // Last, and always passing — note (c). Reversing this to put the warnings first pushes the
    // Feature's own Scenarios off the top of the block.
    for (const warning of plan.warnings) {
      api.effect(warningTitle(warning), () => Effect.void)
    }
  })
}

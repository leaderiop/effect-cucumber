/**
 * The public entry point: `describeFeature(feature, layer, define)`.
 *
 * This is the file a test author calls, the only place the ambient Layer's output type is threaded
 * into `FeatureDsl`, and the COMPOSITION ROOT of the whole package. `Registry.ts` supplies the
 * per-call step container, `Step.ts` supplies the auto-wrap, `Dsl.ts` supplies the compile-time
 * surface, `Plan.ts` resolves every step against what was registered, and `Runner.ts` declares the
 * test nodes; this module composes them and decides what the type parameter of that surface is.
 * [ADR-EC-003](../../../spec/decisions/003-describefeature-takes-a-layer.md) is the decision record.
 *
 * ARCHITECTURE.md's Register→Plan→Emit pipeline lands here as ONE flat, ordered sequence in
 * `describeFeature`'s body, each stage a named import from its own module —
 * `packages/gherkin/src/loadFeature.ts` is the same role in the sibling package, and its doc comment
 * calls it "the only file that knows the order they run in". This is that file for this package.
 *
 * Five things about this module are not visible from the code.
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
 *     registering anything, so the Feature collects zero steps and then PASSES with zero tests
 *     rather than failing. The type is the only thing that forbids it (PITFALLS #2, this phase's
 *     Pitfall 6). Nothing in this module returns a thenable either: the define callback is invoked
 *     synchronously, and `collectFeature` returns its result by value.
 *
 * (d) **D-04 falls out of the merge combinator's argument order, and is not special-case code.**
 *     `shared` and `perScenario` MAY name the same service, and `perScenario` wins for a step that
 *     depends on it. `Layer.merge(shared, perScenario)` gives exactly that — verified by running it,
 *     not assumed: the SECOND argument's implementation is the one a step resolves to. Swapping the
 *     two arguments compiles, type-checks, lints, and silently inverts the rule;
 *     `test/describeFeature.test.ts`'s D-04 case is the only thing that catches it.
 *
 * (e) **The concrete `TestApi` is constructed HERE, and this is the ONLY module under
 *     `packages/vitest/src` permitted to import a test framework at all.** `Runner.ts` reaches
 *     `describe` and the Effect test constructor exclusively through the object it is handed, and
 *     imports neither. That is ARCHITECTURE.md's Pattern 3, and its Anti-Pattern 3 is the verified
 *     failure the seam exists to disarm: `layer(sharedLayer)` hands its callback a
 *     `MethodsNonLive<R>` carrying the shared Layer's services, and calling the MODULE-LEVEL test
 *     constructor from inside that callback still compiles and still passes — while silently
 *     rebuilding the "shared" resource once per Scenario. A composition root is exactly where a
 *     concrete dependency belongs, and an acceptance grep enforces that this file stays the only
 *     one holding it.
 *
 *     The seam is a PARAMETER rather than an import because Phase 10 (RUN-03/RUN-04, ADR-EC-018)
 *     will pass a DIFFERENT `TestApi` through it — the `it` object that `layer(shared)(name, (it) =>
 *     …)` hands its callback, which is the one carrying the shared Layer's services. That object
 *     and the module-level pair below are both valid `TestApi`s and neither substitutes for the
 *     other, which is precisely why the choice belongs at a call site and not in an import
 *     statement. `TestApi.ts` note (a) is the other half of the argument.
 *
 * Neither `collectFeature` nor the registry behind it is re-exported from
 * `packages/vitest/src/index.ts` — see `index.ts`'s own header for why.
 */
import type { ParsedFeature } from "@effect-cucumber/gherkin"
import { describe, it } from "@effect/vitest"
import * as Layer from "effect/Layer"
import { captureCallSite } from "./CallSite.ts"
import type { BackgroundDsl, FeatureDsl, HookRegistrar, ScenarioDsl, ScenarioRegistrar, StepRegistrar } from "./Dsl.ts"
import { groupHooks, type HookBody, type HookSet, registerHook } from "./Hook.ts"
import { createHookRegistry, type HookKind } from "./HookRegistry.ts"
// `StepBody` is declared in `Plan.ts` and borrowed here, never the reverse — and the planning stage
// is imported FROM there INTO this module, so an edge pointing back the other way would be an
// `import/no-cycle` violation and a `pnpm circular` failure. See that module's closing paragraph.
import { type FeaturePlan, planFeature, type StepBody } from "./Plan.ts"
import { createRegistry, type StepDefinition, type StepKeyword } from "./Registry.ts"
import { emitFeature } from "./Runner.ts"
import { register } from "./Step.ts"
import type { TestApi } from "./TestApi.ts"

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
  /**
   * The definitions joined against the Feature: every step resolved, plus the unused-pattern
   * findings the join turned up.
   *
   * This is 06-CONTEXT.md D-02's channel 3, and the reason the field is on the COLLECTION rather
   * than kept private to the emission path: `collection.plan.warnings` is a structured list a test
   * or a downstream tool asserts on directly, instead of scraping terminal output or parsing a
   * synthetic test node's title. `Model.ts:193-205` is the field-addition precedent — the producing
   * stage adds its own field at the join seam rather than a later stage recomputing it.
   */
  readonly plan: FeaturePlan
  /**
   * Every registered hook, grouped by kind and in registration order within each kind (D-01).
   *
   * REQUIRED, not optional — same reasoning as `ParsedFeature.parameterTypes` (03-05's recorded
   * decision): an optional field would let a later consumer forget hooks exist. Grouped HERE, in the
   * shared `collect` implementation, for the same reason planning happens here rather than being
   * duplicated in `describeFeature`'s own body: `describeFeature` and `collectFeature` must not
   * drift into two behaviours.
   *
   * Consumed by `emitFeature` (below, `describeFeature`'s own body) — `ScenarioEffect.ts`'s
   * `buildScenarioEffect` is where `Before` gates the step loop and `After` is guaranteed via
   * `Effect.onExit`, plan 07-04's headline change.
   */
  readonly hooks: HookSet
}

/**
 * The concrete `TestApi`, built once at module scope — note (e).
 *
 * `describe` is vitest's own and is re-exported by the package this module imports it from; the
 * Effect-aware test constructor is that package's, and its `self` parameter is
 * `() => Effect<A, E, Scope>`, which is exactly what `TestApi.effect` declares (`TestApi.ts` note
 * (d), verified against the installed build rather than assumed).
 */
const vitestTestApi: TestApi = { describe, effect: it.effect }

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

  // ONE fresh hook registry per invocation, for the identical reason — HookRegistry.ts note (a)'s
  // Pitfall 14 argument applies unchanged. Never hoisted to module scope, never memoised: two
  // `describeFeature` calls in one file sharing a hook store would make the second Feature run the
  // first Feature's `Before` hooks.
  const hookRegistry = createHookRegistry<HookBody>()

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

  // Mirrors `registrar` above, minus `pattern` and minus a call-site capture. The body is normalised
  // through `Hook.ts`'s `registerHook` at REGISTRATION time, exactly as a step body is normalised
  // through `Step.ts`'s `register` — so nothing downstream ever re-wraps it, and a hook already
  // wrapped by the author keeps its single span.
  //
  // No `captureCallSite()` call here, deliberately: `HookRegistry.ts` note (e) gave `HookDefinition`
  // no `definedAt` field, because ADR-EC-005's named span (`Effect.fn(kind)`) is the attribution
  // channel for a hook failure. Capturing a site nothing downstream reads would be the "say only
  // what is true" violation AGENTS.md §4 names.
  // `ruleId: null` — this registrar is the FEATURE-level one, and `null` is `HookRegistry.ts`'s
  // spelling of "registered through the Feature-level dsl", not a placeholder awaiting a value. A
  // Rule's own dsl builds its own registrar with that Rule's id.
  const hookRegistrar = (kind: HookKind): HookRegistrar<any> => (fn) => {
    hookRegistry.register(kind, null, registerHook(kind, fn))
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

  // ONE implementation covering BOTH arities of `Dsl.ts`'s `ScenarioRegistrar<ROut>`, because that is
  // what an overloaded call signature requires: a two-parameter function is not assignable to a type
  // whose second signature takes a Layer in that position, so the arity check has to be real even
  // while one branch is unimplemented.
  //
  // The three-argument form's runtime — merging `extraLayer` onto whichever Layer is ambient at the
  // call site and recording the result on `FeatureCollection.scenarioLayers` — belongs to plan
  // 08-05b's `makeScenarioRegistrar`. Until that lands it throws, for the same reason the `Rule`
  // member below does: pushing the scope and running `define` while dropping `extraLayer` on the
  // floor would let a Scenario that type-checks against the extra service fail at RUNTIME with the
  // "service not found" this package exists to make impossible — a green build, a green suite, and
  // the one guarantee INV-EC-003 sells, gone (AGENTS.md §4).
  const scenarioRegistrar: ScenarioRegistrar<any> = (
    name: string,
    extraLayerOrDefine: Layer.Layer<any, any, any> | ((dsl: ScenarioDsl<any>) => void),
    maybeDefine?: (dsl: ScenarioDsl<any>) => void
  ): void => {
    if (maybeDefine !== undefined) {
      throw new Error(
        `Scenario("${name}", extraLayer, define) is not implemented yet. The DSL type surface for `
          + "Scenario-scoped extra Layers (ADR-EC-010) exists, but the runtime merge does not — see "
          + "plan 08-05b."
      )
    }
    const defineScenario = extraLayerOrDefine as (dsl: ScenarioDsl<any>) => void
    registry.pushScope({ kind: "scenario", name, ruleId: null })
    try {
      defineScenario(scenarioDsl)
    } finally {
      registry.popScope()
    }
  }

  const dsl: FeatureDsl<any> = {
    ...scenarioDsl,
    Background: (defineBackground) => {
      // `name: null` and not the feature's name: a Background genuinely has none (Registry.ts's
      // note on RegistryScope).
      //
      // `ruleId: null` is not a placeholder — it is the truthful value. This file offers no `Rule`
      // container yet (that is 08-05a's job), so every frame it pushes is genuinely NOT nested in a
      // Rule, which is exactly what Registry.ts note (e) reserves `null` for.
      registry.pushScope({ kind: "background", name: null, ruleId: null })
      try {
        defineBackground(backgroundDsl)
      } finally {
        // `finally`, so a define callback that throws cannot leave the stack unbalanced and
        // re-parent every step registered after it onto a scope the document does not have.
        registry.popScope()
      }
    },
    Scenario: scenarioRegistrar,
    // TEMPORARY, and deliberately loud. Plan 08-03 landed `FeatureDsl.Rule`'s TYPE ahead of its
    // runtime wiring, which plan 08-05a owns: a `"rule"` `RegistryScopeKind` to push/pop, the
    // `ruleId`-keyed `Layer.provideMerge(featureLayer)(extraLayer)` map, and Rule-scoped hook
    // registration. Until those exist, a `Rule(...)` call has nowhere to register anything.
    //
    // Throwing is the only honest stand-in, and both alternatives are worse in the same way. A
    // no-op would emit a Feature whose Rule-nested Scenarios silently have zero step definitions;
    // running `defineRule` against `scenarioDsl` would register the Rule's steps at Feature scope,
    // making INV-EC-005's compile-time boundary decorative at runtime. Either one turns a
    // `.feature` file with a `Rule:` block green while enforcing nothing, and neither would fail a
    // single test in this repo — the false-green failure mode AGENTS.md §4 forbids papering over.
    Rule: (name: string) => {
      throw new Error(
        `Rule("${name}") is not implemented yet. The DSL type surface for Rule-scoped extra Layers `
          + "(ADR-EC-010) exists, but Rule-scope registration does not — see plan 08-05a."
      )
    },
    // Siblings of `Background`/`Scenario`, NOT spread into `scenarioDsl` — `scenarioDsl` is the same
    // object handed to every `Scenario(...)` callback and to `backgroundDsl`, and a hook member there
    // would leak into both (Dsl.ts note (f)).
    Before: hookRegistrar("Before"),
    After: hookRegistrar("After"),
    BeforeStep: hookRegistrar("BeforeStep"),
    AfterStep: hookRegistrar("AfterStep"),
    BeforeAllScenarios: hookRegistrar("BeforeAllScenarios"),
    AfterAllScenarios: hookRegistrar("AfterAllScenarios")
  }

  define(dsl)

  const definitions = registry.definitions()

  // PLAN, and it happens in the SHARED implementation rather than in `describeFeature` alone. This
  // function exists precisely so the two public entry points cannot drift into two behaviours, and
  // planning in only one of them would be that drift: `collectFeature` would hand back a collection
  // whose `plan` field was computed by a different code path, or absent. Emission is what the two
  // differ on, and it is the only thing they differ on.
  return {
    feature,
    layer: normalizeLayer(layer),
    definitions,
    plan: planFeature({ feature, definitions }),
    // Grouping happens HERE, in the shared implementation, for the same reason planning does — see
    // the `hooks` field's own doc comment on `FeatureCollection`.
    hooks: groupHooks(hookRegistry.hooks())
  }
}

/**
 * Collect a Feature's step definitions and normalised Layer, and hand them back instead of running
 * anything.
 *
 * This exists so the collection is assertable without a runner: `describeFeature` returns `void` by
 * contract, so there is nothing for a test to look at, and `test/describeFeature.test.ts` asserts
 * against this instead. It runs the identical Register and Plan stages — `collection.plan` is the
 * same value the emission stage walks — and stops there.
 *
 * It emits no test node and writes NOTHING to the terminal. That silence is the point: a test
 * asserting on `collection.plan.warnings` would otherwise spam the reporter with the very warnings
 * it is asserting on, so the terminal channel lives in `describeFeature`'s own body and not in the
 * shared implementation.
 *
 * Internal, and reached by relative import from inside this package. It is deliberately NOT in
 * `index.ts`: publishing it would freeze the collection shape into the package's contract, and no
 * consumer needs it — a test author calls `describeFeature`.
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
 * Emits one running test per Scenario, nested inside a block named after the Feature, with a further
 * nested block per `Rule` (RUN-01, ADR-EC-004). A Background's steps are the leading `yield*`s of the
 * same Effect rather than a separate hook, so they run first and the first failure ends the Scenario
 * (INV-EC-001).
 *
 * A step whose text matched no registered pattern visible to it, or more than one at the same scope
 * level, fails ITS OWN Scenario with a located `StepMatchError` naming the step, the Scenario and
 * either a copy-pasteable suggested definition or every colliding pattern — every other Scenario in
 * the Feature still runs (MATCH-03, MATCH-04, ADR-EC-019).
 *
 * A registered pattern that matched no step anywhere in the Feature is a WARNING and never a failure
 * (MATCH-05, same ADR), reported on all three of 06-CONTEXT.md D-02's channels: written to the
 * terminal at collection time, emitted as an always-passing test node last in the block, and carried
 * structurally on the plan. `collectFeature` reaches that third one —
 * `collection.plan.warnings` — and emits nothing at all.
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
  // REGISTER, then PLAN — both inside `collect`, which `collectFeature` shares verbatim.
  const collection = collect(feature, layer, define)

  // D-02 channel 1, and it lives HERE rather than inside `collect` deliberately: `collectFeature`
  // runs that same implementation and must stay SILENT, or every test asserting on
  // `plan.warnings` would also print the warnings it is asserting on.
  //
  // `warning.message` is passed straight through, never rebuilt and never reformatted. `Plan.ts`
  // already assembled a message naming the pattern, the keyword, the definition site and the
  // Feature; a second rendering here would let the terminal text and the structured list say
  // different things, and it would drop the `JSON.stringify` quoting that stops a pattern containing
  // a control character from rewriting the terminal line (threat T-06-07-01).
  for (const warning of collection.plan.warnings) {
    console.warn(warning.message)
  }

  // EMIT, and last: the loop above runs first so the warnings appear ABOVE the emitted block in
  // collection output rather than interleaved with it.
  emitFeature({ api: vitestTestApi, plan: collection.plan, layer: collection.layer, hooks: collection.hooks })
}

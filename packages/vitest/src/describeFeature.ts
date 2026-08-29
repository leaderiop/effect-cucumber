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
import type {
  BackgroundDsl,
  FeatureDsl,
  HookRegistrar,
  RuleDsl,
  ScenarioDsl,
  ScenarioRegistrar,
  StepRegistrar
} from "./Dsl.ts"
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
   * Every FEATURE-LEVEL hook, grouped by kind and in registration order within each kind (D-01).
   *
   * Feature-level means `ruleId === null`, and the filter that enforces it is not cosmetic: a
   * Rule-scoped `Before` leaking into this field would run for every Scenario in the document,
   * including the ones in other Rules and the ones in no Rule at all — the exact
   * elevation-of-privilege INV-EC-005 forbids, and one that produces no type error and no failing
   * test on its own. A Rule's own hooks are in `ruleHooks`, keyed by that Rule's id.
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
  /**
   * One entry per `Rule(...)` call this Feature's define callback made: that Rule's `extraLayer`
   * already merged onto the Feature's own via `Layer.provideMerge`, keyed by `resolveRuleId`'s
   * output.
   *
   * Deliberately a SEPARATE map rather than merged into `layer`: `layer` is what a Scenario outside
   * every Rule is provided, and folding a Rule's extra services into it would make INV-EC-005's
   * compile-time boundary decorative at runtime — a step that type-checks only inside the Rule would
   * also RUN fine outside it, so the guarantee would hold in the checker and nowhere else.
   *
   * Every key is either a real `ParsedRule.id` or `resolveRuleId`'s sentinel; there is no `null`
   * key, because the Feature's own Layer is the `layer` field.
   *
   * `Runner.ts` is what threads these into emission, and that wiring is plan 08-07's.
   */
  readonly ruleLayers: ReadonlyMap<string, Layer.Layer<any, any, never>>
  /**
   * One entry per `Rule(...)` call, carrying only the hooks registered through THAT Rule's dsl —
   * `Before`/`After`/`BeforeStep`/`AfterStep` only, since `RuleDsl` exposes no other registrar
   * (ADR-EC-010, `Dsl.ts` note (f)). Keyed exactly as `ruleLayers` is.
   *
   * REQUIRED, not optional, for the reason `hooks` is: an optional field would let a later consumer
   * forget Rule-scoped hooks exist and hand `ScenarioEffect.ts` the Feature's set alone, silently
   * dropping every hook a Rule declared.
   *
   * `Hook.ts`'s `mergeHookSets(collection.hooks, collection.ruleHooks.get(ruleId) ?? emptyHookSet)`
   * is what a consumer combines these with, in D-02's order — which is why they arrive separated
   * rather than pre-merged, and why `emptyHookSet` exists for a Scenario in no Rule.
   */
  readonly ruleHooks: ReadonlyMap<string, HookSet>
  /**
   * One entry per THREE-argument `Scenario(name, extraLayer, define)` call, from either nesting
   * level, keyed by `scenarioKey(ruleId, name)`: that Scenario's `extraLayer` already merged onto
   * whichever Layer was AMBIENT where the call was written — the Feature's own `layer` at Feature
   * level, or the enclosing Rule's already-merged `ruleLayers` entry inside a `Rule`.
   *
   * The two-argument form adds NO entry, and that absence is the contract rather than an
   * optimisation: it is how a consumer tells "this Scenario runs against its scope's ambient Layer
   * unchanged" from "this Scenario has its own", without comparing two Layers for an equality Effect
   * gives no way to decide. Storing `Layer.empty` for the common form would erase the distinction.
   *
   * INVARIANT for `Runner.ts` to rely on: an entry, when present, is the FULLY merged effective
   * Layer for every row of that Scenario — an Outline's rows share ONE `Scenario(...)` registration
   * and therefore one entry. Use it AS-IS; re-merging it against the Feature's or the Rule's Layer a
   * second time compiles, type-checks and leaves every service reachable, so nothing goes red while
   * every ambient `Layer.effect` resource is built an extra time per Scenario.
   *
   * Keyed by the composite and never by name alone, for the reason `scenarioKey`'s own comment
   * gives: F22 makes Scenario names unique per SCOPE only, so a Rule's Scenario and a same-named
   * Feature-level one are both legal and must not collide here.
   */
  readonly scenarioLayers: ReadonlyMap<string, Layer.Layer<any, any, never>>
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
 * Turn the Rule NAME a test author wrote into the `ruleId` every scope and hook registered inside
 * that `Rule(...)` call will carry.
 *
 * This is the ONLY place in the package where a Rule name becomes an id. `Registry.ts` note (e) and
 * `Plan.ts` note (e) both say so on their own side of the seam, and both are dependency-free
 * modules that could not do it if they wanted to: neither has access to a `ParsedFeature`.
 *
 * A name that matches no Rule in the parsed Feature resolves to a SENTINEL, never to `null`, and the
 * distinction is the whole reason this function exists rather than an inline `find`. `Plan.ts`
 * compares `ruleId` with plain string equality and reserves `null` for "this scope is not nested
 * inside any `Rule` call at all" — so a `null` here would make an unresolved Rule's registrations
 * visible to every Feature-level Scenario in the document, silently attaching a typo'd `Rule("Discout
 * rules", …)` block's steps to the Feature root. That defect compiles, type-checks, lints, and turns
 * the suite GREEN, because the steps do resolve; they just resolve everywhere instead of nowhere.
 *
 * The sentinel format is what makes the fallback provably inert rather than merely unlikely: a
 * `ParsedRule.id` is generator-produced (`"5"`, `"12"`) and never contains a colon, so
 * `unregistered-rule:${name}` cannot equal any real Rule's id and therefore cannot equal any
 * `ParsedScenario.ruleId` either. No counter and no uniquifier: two unresolved calls sharing one bad
 * name produce the same sentinel, and that is harmless — both are equally, permanently invisible to
 * every Scenario, so colliding with each other changes nothing a Scenario can observe.
 *
 * `Array.find` returns the FIRST match by name. If `Validate.ts` ever permits two Rules to share a
 * name, that is deterministic rather than ambiguous; detecting the upstream case is not attempted
 * here, because nothing in this phase can produce it.
 */
const resolveRuleId = (feature: ParsedFeature, name: string): string => {
  const match = feature.rules.find((rule) => rule.name === name)
  return match === undefined ? `unregistered-rule:${name}` : match.id
}

/**
 * The key a Scenario's merged extra Layer is recorded under: the pair `(ruleId, name)` encoded as
 * one string, because a `Map` keys by identity and a two-field object literal would never hit.
 *
 * Mirrors `packages/gherkin/src/Validate.ts`'s own `uniquenessKey` — the same `ruleId ?? "<feature>"`
 * head, the same NUL separator, on purpose. Keying by NAME alone is the plausible simplification and
 * it is wrong for a reason that file already established: F22 makes a Scenario name unique PER SCOPE
 * and no further, and its `duplicate-scenario-name-across-rules.feature` fixture is the executable
 * proof that two Rules may each legally contain a `Scenario: happy path`. A name-keyed map would let
 * one of them silently overwrite the other's entry, and the loser would then run against a Layer
 * built for a DIFFERENT Scenario — a wrong service, not a missing one, so nothing fails loudly.
 *
 * NUL and not a space, a slash or a dash. A `ParsedRule.id` is generator-produced digits, but
 * `resolveRuleId`'s other output is the `unregistered-rule:${name}` sentinel, which carries an
 * author-written Rule NAME and can therefore contain any printable character. With a printable
 * separator the encoding of the pair stops being unambiguous the moment such a name contains it;
 * with NUL it cannot, because neither half can contain a NUL. Validate.ts's own note makes the
 * identical argument on its side of the seam.
 */
const scenarioKey = (ruleId: string | null, name: string): string => `${ruleId ?? "<feature>"}\u0000${name}`

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

  // Normalised ONCE per `collect` call, here rather than at the return site, because the `Rule`
  // container below needs the same value to merge each Rule's `extraLayer` onto — and a second
  // `normalizeLayer(layer)` call at the bottom would build a second, structurally identical Layer
  // that no Rule's merged Layer was derived from. Nothing would go red: both Layers provide the same
  // services, so every assertion in this repo would still pass while a Feature-level `Layer.effect`
  // resource got built twice per Scenario.
  const featureLayer = normalizeLayer(layer)

  // Every Rule this Feature's define callback actually called `Rule(...)` for, keyed by the id
  // `resolveRuleId` produced — real or sentinel. Declared before the `dsl` literal because the `Rule`
  // member's closure mutates it while `define(dsl)` runs, and read only after that call returns.
  const ruleLayers = new Map<string, Layer.Layer<any, any, never>>()

  // Every THREE-argument `Scenario(...)` call, from either level, keyed by `scenarioKey`. Beside
  // `ruleLayers` because it has the identical lifecycle — mutated by a container closure while
  // `define(dsl)` runs, read only after it returns — and never keyed by name alone, for the reason
  // `scenarioKey`'s own comment gives.
  const scenarioLayers = new Map<string, Layer.Layer<any, any, never>>()

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

  /**
   * ONE `Scenario` container implementation, shared by the Feature level and by every `Rule`, and
   * parameterised by the only two things they differ in: the `ruleId` the pushed scope carries, and
   * the Layer that is AMBIENT where the call was written.
   *
   * A factory rather than two structurally identical closures, because the two call sites need the
   * same behaviour and the earlier duplicated form is exactly how they drift: a fix applied to one
   * (the arity check, the merge combinator, the `finally`) leaves the other silently wrong, and the
   * wrong one is whichever nesting level that day's test happens not to cover.
   *
   * `ambientLayer` is a PARAMETER and not a read of `featureLayer`, and that is the whole D-01
   * nesting rule in one argument. Inside a `Rule` the ambient Layer is that Rule's ALREADY-merged
   * one, so a Scenario's own extra Layer composes ON TOP of the Rule's rather than instead of it;
   * closing over `featureLayer` here instead would compile, type-check and pass every
   * Feature-level test while silently dropping the enclosing Rule's services for exactly those
   * Scenarios that asked for an extra Layer of their own.
   *
   * BOTH arities live in one function body because `ScenarioRegistrar<ROut>` is an overloaded call
   * signature (`Dsl.ts`'s own note on it): a two-parameter function is not assignable to a type
   * whose second signature takes a Layer in that position. The two forms are told apart by whether
   * the THIRD argument is present — the same technique `describeFeature`/`collectFeature`'s own
   * implementation signature uses one level up to accept either `LayerArgument` shape — and never by
   * probing the second argument's shape: `Layer.isLayer`-style duck-typing would make a callable
   * Layer-like value and a function indistinguishable in a way the arity never can be.
   *
   * `Layer.provideMerge(ambientLayer)(extraLayer)` and NOT `Layer.merge(ambientLayer, extraLayer)`,
   * for the reason the `Rule` member below repeats: ADR-EC-010 requires `extraLayer` to be able to
   * DEPEND on ambient services, and only `provideMerge` feeds the ambient Layer's output into
   * `extraLayer`'s own requirements while keeping BOTH sets reachable. Its argument order is also
   * what makes the Scenario's own implementation win a service both name — the collision rule
   * `test/describeFeature.test.ts` proves by RESOLVING the merged Layer, because the two orders have
   * the identical type and the identical shape (note (d) makes the same argument for `Layer.merge`).
   *
   * The merge and the `scenarioLayers.set` happen BEFORE `pushScope`/`try`, mirroring `Rule`'s own
   * ordering: the map entry is then recorded even if the define callback throws, so a Scenario whose
   * registration blew up still resolves against the Layer it asked for rather than against a
   * silently narrower ambient one.
   */
  const makeScenarioRegistrar = (
    ruleId: string | null,
    ambientLayer: Layer.Layer<any, any, never>
  ): ScenarioRegistrar<any> =>
  (
    name: string,
    extraLayerOrDefine: Layer.Layer<any, any, any> | ((dsl: ScenarioDsl<any>) => void),
    maybeDefine?: (dsl: ScenarioDsl<any>) => void
  ): void => {
    // The two-argument form records NOTHING, and that absence is the contract `scenarioLayers`'
    // own field comment states: no entry means "this Scenario runs against its scope's ambient
    // Layer unchanged". Writing `Layer.empty` here instead would be the plausible tidy-up and would
    // erase the distinction, leaving a consumer no way to tell the two forms apart.
    if (maybeDefine !== undefined) {
      const extraLayer = extraLayerOrDefine as Layer.Layer<any, any, any>
      scenarioLayers.set(scenarioKey(ruleId, name), Layer.provideMerge(ambientLayer)(extraLayer))
    }

    const defineScenario = maybeDefine ?? (extraLayerOrDefine as (dsl: ScenarioDsl<any>) => void)
    registry.pushScope({ kind: "scenario", name, ruleId })
    try {
      defineScenario(scenarioDsl)
    } finally {
      // `finally`, so a define callback that throws cannot leave the stack unbalanced and re-parent
      // every step registered after it onto a scope the document does not have.
      registry.popScope()
    }
  }

  const dsl: FeatureDsl<any> = {
    ...scenarioDsl,
    Background: (defineBackground) => {
      // `name: null` and not the feature's name: a Background genuinely has none (Registry.ts's
      // note on RegistryScope).
      //
      // `ruleId: null` is not a placeholder — it is the truthful value. This is the FEATURE's own
      // Background, reached through the dsl `define` itself receives, so it is genuinely NOT nested
      // in a Rule, which is exactly what Registry.ts note (e) reserves `null` for. A Rule's own
      // Background is a different container, built inside the `Rule` member below, and it pushes
      // that Rule's id instead — which is the only thing telling the two apart downstream (D-04).
      registry.pushScope({ kind: "background", name: null, ruleId: null })
      try {
        defineBackground(backgroundDsl)
      } finally {
        // `finally`, so a define callback that throws cannot leave the stack unbalanced and
        // re-parent every step registered after it onto a scope the document does not have.
        registry.popScope()
      }
    },
    // `null` because a Scenario declared through the Feature's own dsl is genuinely not nested in
    // any Rule, and `featureLayer` because that is what is ambient here — the same binding every
    // Rule's merged Layer is derived from, never a second `normalizeLayer(layer)` call.
    Scenario: makeScenarioRegistrar(null, featureLayer),
    // A sibling of `Background`/`Scenario`, and never spread into `scenarioDsl` — the identical
    // "would leak into every `Scenario(...)` callback and into `backgroundDsl`" argument `Dsl.ts`
    // note (f) makes for the hooks applies unchanged to a nested container.
    Rule: (
      ruleName: string,
      extraLayer: Layer.Layer<any, any, any>,
      defineRule: (dsl: RuleDsl<any>) => void
    ): void => {
      // The one place a Rule NAME becomes an id — `resolveRuleId`'s own comment has the sentinel
      // argument, and `Registry.ts` note (e) / `Plan.ts` note (e) are the two consumers that depend
      // on it never being `null`.
      const ruleId = resolveRuleId(feature, ruleName)

      // Merged HERE, where `extraLayer` is captured, and exactly once per `Rule(...)` call — the
      // same "compute the single Layer to hand downstream once, at the point the extra argument is
      // captured" placement `normalizeLayer` has for the Feature's own.
      //
      // `Layer.provideMerge(featureLayer)(extraLayer)` and NOT `Layer.merge(featureLayer,
      // extraLayer)`, which is the plausible tidy-up given the line `normalizeLayer` runs a few
      // dozen lines above. ADR-EC-010 requires `extraLayer` to be able to DEPEND on ambient
      // services, and `provideMerge` is what feeds the ambient Layer's output into `extraLayer`'s
      // own requirements while keeping BOTH sets reachable. `merge` composes them side by side and
      // satisfies nothing, so a Rule Layer built on top of a Feature service — the ADR's own worked
      // example — would not type-check at all.
      const ruleAmbientLayer = Layer.provideMerge(featureLayer)(extraLayer)
      ruleLayers.set(ruleId, ruleAmbientLayer)

      // The Rule-scoped counterpart of the Feature-level `hookRegistrar` closure above, differing in
      // exactly one thing: it passes THIS Rule's id where that one passes `null`. It cannot be
      // hoisted beside it, because `ruleId` is per-`Rule(...)`-call state.
      const ruleHookRegistrar = (kind: HookKind): HookRegistrar<any> => (fn) => {
        hookRegistry.register(kind, ruleId, registerHook(kind, fn))
      }

      const ruleDsl: RuleDsl<any> = {
        // The SAME `scenarioDsl` object the Feature level hands out. Its five registrars read
        // `registry.currentScope()` at CALL time, so they need no per-level parameterization — which
        // is also what makes a `Given` written directly inside this callback, as a sibling of the
        // Rule's own `Background`/`Scenario` calls, register at `"rule"` scope.
        ...scenarioDsl,
        Background: (defineBackground) => {
          // D-04: a Rule has its own Background container. The SAME `backgroundDsl` object
          // (`Given`/`And` only, ADR-EC-017 — the grammar restriction does not change one nesting
          // level down), differing from the Feature's own Background solely in the `ruleId` this
          // pushed scope carries. That one field is what makes `Plan.ts`'s `"background"` arm show
          // these registrations only to a `rule-background` step of THIS Rule.
          registry.pushScope({ kind: "background", name: null, ruleId })
          try {
            defineBackground(backgroundDsl)
          } finally {
            registry.popScope()
          }
        },
        // THIS Rule's id, and THIS Rule's already-merged Layer — the same factory the Feature level
        // calls with `(null, featureLayer)`, and the two arguments are the entire difference between
        // the levels. `ruleAmbientLayer` and not `featureLayer`: a Scenario declared in here that
        // brings its own extra Layer must end up with the Feature's services, this Rule's, AND its
        // own, which is what makes composition NEST rather than replace (D-01).
        Scenario: makeScenarioRegistrar(ruleId, ruleAmbientLayer),
        // Exactly the four hooks ADR-EC-010 scopes to a Rule. `BeforeAllScenarios`/`AfterAllScenarios`
        // are absent by design and `RuleDsl` does not declare them — `Dsl.ts` note (f).
        Before: ruleHookRegistrar("Before"),
        After: ruleHookRegistrar("After"),
        BeforeStep: ruleHookRegistrar("BeforeStep"),
        AfterStep: ruleHookRegistrar("AfterStep")
      }

      // The identical push/try/finally/pop shape `Background`/`Scenario` use, and `finally` for the
      // identical reason: a `defineRule` callback that throws must not leave the `"rule"` frame on
      // the stack and re-parent every later Feature-level step onto a Rule the author never put it
      // in.
      registry.pushScope({ kind: "rule", name: ruleName, ruleId })
      try {
        defineRule(ruleDsl)
      } finally {
        registry.popScope()
      }
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

  // Read ONCE, after `define(dsl)` has returned, and shared by both groupings below. `hooks()` is a
  // snapshot copy (`HookRegistry.ts` note (b)), so calling it once per Rule would allocate one array
  // per Rule for no gain — and, worse, would leave two readers of a mutable store that a future
  // change could interleave a registration between.
  const hookDefinitions = hookRegistry.hooks()

  // PLAN, and it happens in the SHARED implementation rather than in `describeFeature` alone. This
  // function exists precisely so the two public entry points cannot drift into two behaviours, and
  // planning in only one of them would be that drift: `collectFeature` would hand back a collection
  // whose `plan` field was computed by a different code path, or absent. Emission is what the two
  // differ on, and it is the only thing they differ on.
  return {
    feature,
    // The SAME binding every Rule's merged Layer was derived from — normalised once, near the top.
    layer: featureLayer,
    definitions,
    plan: planFeature({ feature, definitions }),
    // Grouping happens HERE, in the shared implementation, for the same reason planning does — see
    // the `hooks` field's own doc comment on `FeatureCollection`.
    //
    // FILTERED to Feature scope. Before Rule-scoped hooks existed, every registration was
    // Feature-level and grouping the whole list was correct; now `hookRegistry.hooks()` is the union
    // of both tiers, and grouping it unfiltered would silently run every Rule's hooks for every
    // Scenario in the document.
    hooks: groupHooks(hookDefinitions.filter((definition) => definition.ruleId === null)),
    ruleLayers,
    // Keyed off `ruleLayers` and not off the hook list, deliberately: the key set is "every Rule this
    // Feature called `Rule(...)` for", so a Rule that registered a Layer and no hooks still gets an
    // entry — an all-empty `HookSet` — instead of a `.get` that returns `undefined` and sends a
    // consumer down a "no such Rule" path it should never reach.
    ruleHooks: new Map(
      [...ruleLayers.keys()].map((ruleId): readonly [string, HookSet] => [
        ruleId,
        groupHooks(hookDefinitions.filter((definition) => definition.ruleId === ruleId))
      ])
    ),
    // Handed back as-is — sparse by design, one entry per three-argument `Scenario(...)` call and
    // nothing for the common two-argument form. Not back-filled with an entry per planned Scenario:
    // that would make every Scenario look like it asked for a Layer of its own.
    scenarioLayers
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

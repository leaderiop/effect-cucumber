/**
 * The Register and Plan stages behind both public entry points (F-22): `collect` builds a
 * `FeatureCollection` from a Feature, its Layer argument and the `define` callback, and emits
 * nothing. `describeFeature.ts` is the composition root that hands the collection to the runner.
 */
import type { ParsedFeature } from "@effect-cucumber/gherkin"
import * as Layer from "effect/Layer"
import { captureCallSite, formatCallSite } from "./CallSite.ts"
import type {
  BackgroundDsl,
  FeatureDsl,
  HookRegistrar,
  RuleDsl,
  ScenarioDsl,
  ScenarioRegistrar,
  StepRegistrar
} from "./Dsl.ts"
import { makeUnknownContainerWarning, type UnknownContainerWarning } from "./Errors.ts"
import { groupHooks, type HookBody, type HookSet, registerHook } from "./Hook.ts"
import { createHookRegistry, type HookKind } from "./HookRegistry.ts"
// `StepBody` is declared in `Plan.ts` and borrowed here, never the reverse — and the planning stage
// is imported FROM there INTO this module, so an edge pointing back the other way would be an
// `import/no-cycle` violation and a `pnpm circular` failure. See that module's closing paragraph.
import { type ErasedExtraLayer, type ErasedLayer, type FeaturePlan, planFeature, type StepBody } from "./Plan.ts"
import { createRegistry, type StepDefinition, type StepKeyword } from "./Registry.ts"
// The composite `scenarioLayers` key, in a LEAF module both this file and `Runner.ts` import rather
// than private to either — `ScenarioKey.ts`'s own header has the argument. `Runner.ts` reads back
// what the `Scenario` container below writes, and it cannot import this file (that edge would close a
// cycle with the `emitFeature` import above), so a shared leaf is the only way both sides can build
// one encoding instead of two that compile while disagreeing.
import { scenarioKey } from "./ScenarioKey.ts"
import { register } from "./Step.ts"

/**
 * The union of what the two overloads accept, as the implementation signature sees it.
 *
 * Only the implementation and the module-scope helpers below refer to this. TypeScript never
 * resolves a call against an implementation signature, so nothing here is part of the public
 * contract.
 *
 * Note (f)'s `shared: Layer<R, never, never>` constraint therefore lives on the OVERLOADS and
 * deliberately not here: narrowing this union would only make the implementation body disagree with
 * itself — the body normalises whatever the overloads already let through — while changing nothing a
 * caller can observe.
 */
export type LayerArgument =
  | ErasedLayer
  | { readonly shared: ErasedLayer; readonly perScenario: ErasedExtraLayer }
/**
 * What `describeFeature` collected, before anything is run.
 *
 * Exported because `collectFeature`'s return annotation names it and `composite: true` demands a
 * nameable type for declaration emit — not because a consumer is meant to construct one.
 */
export type FeatureCollection = {
  readonly feature: ParsedFeature
  /**
   * The PER-SCENARIO tier, and only that tier — never "the whole ambient Layer".
   *
   * For the plain-Layer form it is the Layer the caller passed, and `sharedLayer` is `null`: a plain
   * Layer IS the per-Scenario scope (ADR-EC-006), so the two readings coincide there and only there.
   * For the object form it is `perScenario` ALONE. The two tiers are kept as two separate values and
   * are never combined, so whenever `sharedLayer` is non-null this field is exactly what a Scenario
   * provides inside its own Effect and nothing more — reading it as the Feature's whole ambient
   * Layer would be wrong, and would be wrong silently, because every service it does carry resolves.
   *
   * See note (d) for the collision rule and for the provision order that now delivers it.
   */
  readonly layer: ErasedExtraLayer
  /**
   * The SHARED tier, or `null` — see note (d).
   *
   * `null` for the plain-Layer form and for the plain-Layer form ONLY. `null` rather than
   * `Layer.empty`, because the branch downstream turns on "did this Feature ask for a shared scope
   * at all" and `Layer.empty` cannot express that: an empty Layer is a Layer a caller asked for, so
   * it answers "yes, an empty one" where the plain form means "no".
   *
   * It is NEVER merged into `layer`, which is what makes the two tiers separately providable: this
   * one is built exactly once per Feature and made ambient on the emitted test nodes, that one is
   * provided inside each Scenario's own Effect and rebuilt on every execution (INV-EC-002).
   */
  readonly sharedLayer: ErasedLayer | null
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
   * Every `Rule(...)`/`Scenario(...)` registered under a name the Feature does not contain (F-11).
   * Plain data on the collection for the same reason `plan.warnings` is: `collectFeature` stays
   * silent and `describeFeature` prints them.
   */
  readonly containerWarnings: ReadonlyArray<UnknownContainerWarning>
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
  readonly ruleLayers: ReadonlyMap<string, ErasedExtraLayer>
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
   * Keyed by the composite and never by name alone, for the reason `ScenarioKey.ts` note (a) gives:
   * F22 makes Scenario names unique per SCOPE only, so a Rule's Scenario and a same-named
   * Feature-level one are both legal and must not collide here.
   */
  readonly scenarioLayers: ReadonlyMap<string, ErasedExtraLayer>
}
/**
 * Separate the two accepted layer arguments into the two tiers the emission stage provides
 * independently — the per-Scenario one inside each Scenario's Effect, the shared one around all of
 * them.
 *
 * The object form is discriminated by the presence of `perScenario`, which D-03 makes a REQUIRED key
 * — so its absence means "this is a plain Layer" and never "the caller omitted the key". A Feature
 * with no per-Scenario-fresh state writes `perScenario: Layer.empty`, which is `Layer<never>` and
 * unions away, leaving `FeatureDsl<RShared>` with the shared services still reachable.
 *
 * NOTHING is combined here, and that absence is the point of the function rather than a shortcut it
 * takes: the two tiers travel as two values all the way to the composition root, which is what lets
 * the shared one be built exactly once per Feature while the per-Scenario one is rebuilt for every
 * execution. Note (d) has the collision rule this replaces a merge with.
 *
 * `shared` is `null` for the plain-Layer form and never `Layer.empty` — the `FeatureCollection`
 * field's own comment has the argument.
 */
const splitLayerArgument = (
  argument: LayerArgument
): {
  readonly shared: ErasedLayer | null
  readonly perScenario: ErasedExtraLayer
} =>
  "perScenario" in argument
    ? { shared: argument.shared, perScenario: argument.perScenario }
    : { shared: null, perScenario: argument }
/**
 * Run one container's define callback and refuse a Promise-returning one.
 *
 * Every container — `describeFeature`, `Rule`, `Scenario`, `Background` — snapshots its registry
 * the moment its callback returns. An `async` callback returns a Promise before its first `await`
 * resolves, so every registration after that `await` lands too late and is never seen: the
 * Feature emits fewer tests than the author wrote, and PASSES. The callback types say `void`, and
 * `void` accepts a Promise-returning function, so the type does not catch this (a `=> undefined`
 * type would, but it also rejects a named callback annotated `: void`, which `index.ts` exports the
 * dsl types for). This runtime check is the guard; `test/describeFeature.test.ts` pins it for all
 * four containers.
 *
 * The rejected Promise is observed so the throw below is the only failure the runner reports,
 * rather than also an unhandled rejection from a callback that later fails.
 */
const invokeDefine = <Dsl>(
  container: string,
  name: string | null,
  define: (dsl: Dsl) => void,
  dsl: Dsl
): void => {
  const returned: unknown = define(dsl)
  if (returned instanceof Promise) {
    returned.catch(() => undefined)
    const label = name === null ? container : `${container} "${name}"`
    throw new Error(
      `${label}'s define callback returned a Promise (at ${formatCallSite(captureCallSite())}). `
        + "A define callback must be synchronous: every step, hook and container it registers after "
        + "an `await` is never seen, so the Feature would emit fewer tests than were written and pass."
    )
  }
}
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
const unregisteredRulePrefix = "unregistered-rule:"
const resolveRuleId = (feature: ParsedFeature, name: string): string => {
  const match = feature.rules.find((rule) => rule.name === name)
  return match === undefined ? `${unregisteredRulePrefix}${name}` : match.id
}
/**
 * The one implementation both public entry points delegate to.
 *
 * Not exported, and deliberately so: it exists to keep `describeFeature` and `collectFeature` from
 * drifting into two behaviours, which they would if each carried its own body.
 */
export const collect = (
  feature: ParsedFeature,
  layerArgument: LayerArgument,
  define: (dsl: FeatureDsl<any, any>) => void
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

  // Separated ONCE per `collect` call, here rather than at the return site, because the `Rule`
  // container below needs the same value to merge each Rule's `extraLayer` onto — and a second
  // separation at the bottom would build a second, structurally identical Layer that no Rule's
  // merged Layer was derived from. Nothing would go red: both Layers provide the same services, so
  // every assertion in this repo would still pass while a Feature-level `Layer.effect` resource got
  // built twice per Scenario. That argument is unchanged by the two tiers becoming two values; it is
  // the reason there is exactly ONE call to the helper in this function.
  //
  // `featureLayer` stays bound to the PER-SCENARIO half, so every use site below it — the `Rule`
  // container's merge, `Scenario`'s ambient argument, and the returned `layer` field — keeps both
  // its existing spelling and its existing single-source property. What changed is what the name
  // MEANS on the object form: the per-Scenario tier alone, with the shared tier never folded in.
  const { perScenario: featureLayer, shared: sharedLayer } = splitLayerArgument(layerArgument)

  // Every Rule this Feature's define callback actually called `Rule(...)` for, keyed by the id
  // `resolveRuleId` produced — real or sentinel. Declared before the `dsl` literal because the `Rule`
  // member's closure mutates it while `define(dsl)` runs, and read only after that call returns.
  const ruleLayers = new Map<string, ErasedExtraLayer>()

  // Every THREE-argument `Scenario(...)` call, from either level, keyed by `scenarioKey`. Beside
  // `ruleLayers` because it has the identical lifecycle — mutated by a container closure while
  // `define(dsl)` runs, read only after it returns — and never keyed by name alone, for the reason
  // `ScenarioKey.ts` note (a) gives.
  const scenarioLayers = new Map<string, ErasedExtraLayer>()

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
   * `Layer.provideMerge(ambientLayer)(extraLayer)` and NOT a side-by-side merge of the two, for the
   * reason the `Rule` member below repeats: ADR-EC-010 requires `extraLayer` to be able to DEPEND on
   * ambient services, and only `provideMerge` feeds the ambient Layer's output into `extraLayer`'s
   * own requirements while keeping BOTH sets reachable. Its argument order is also what makes the
   * Scenario's own implementation win a service both name — the collision rule
   * `test/describeFeature.test.ts` proves by RESOLVING the composed Layer, because the two orders
   * have the identical type and the identical shape.
   *
   * ON THE SHARED PATH `ambientLayer` CARRIES THE PER-SCENARIO TIER ONLY, at both nesting levels,
   * and the consequence is invisible from the code the same way the `Rule` member's is: a Scenario
   * `extraLayer` that depends on a SHARED service leaves that service unsatisfied on the composed
   * Layer's `RIn`, where the ambient context `@effect/vitest`'s `layer(...)` establishes around the
   * emitted test node satisfies it at run time. This is measured behaviour (see the `Rule` member
   * below for what was measured), and plan 10-04's regression block is what keeps it true. Nothing
   * about the nesting rule above changes: a Scenario inside a Rule still composes on top of that
   * Rule's already-merged Layer, which is still the per-Scenario tier plus the Rule's own.
   *
   * The merge and the `scenarioLayers.set` happen BEFORE `pushScope`/`try`, mirroring `Rule`'s own
   * ordering: the map entry is then recorded even if the define callback throws, so a Scenario whose
   * registration blew up still resolves against the Layer it asked for rather than against a
   * silently narrower ambient one.
   */
  const containerWarnings: Array<UnknownContainerWarning> = []

  /**
   * F-11: a `Scenario(...)` whose name matches nothing at its level is inert, so say so once. A
   * Scenario is matched by its UN-interpolated title (`astName`, `Plan.ts` note (c)), which is why
   * `known` lists those. Inside an unknown Rule every Scenario is unknown too; the Rule's own
   * warning already covers that, so nothing is added for them.
   */
  const noteUnknownScenario = (ruleId: string | null, name: string): void => {
    if (ruleId !== null && ruleId.startsWith(unregisteredRulePrefix)) return
    const rule = ruleId === null ? null : feature.rules.find((candidate) => candidate.id === ruleId)
    const scenarios = ruleId === null ? feature.scenarios : rule === undefined || rule === null ? [] : rule.scenarios
    const known = [...new Set(scenarios.map((scenario) => scenario.astName))]
    if (known.includes(name)) return
    containerWarnings.push(
      makeUnknownContainerWarning({ uri: feature.uri, kind: "Scenario", name, ruleName: rule?.name ?? null, known })
    )
  }

  const makeScenarioRegistrar = (
    ruleId: string | null,
    ambientLayer: ErasedExtraLayer
  ): ScenarioRegistrar<any> =>
  (
    name: string,
    extraLayerOrDefine: ErasedExtraLayer | ((dsl: ScenarioDsl<any>) => void),
    maybeDefine?: (dsl: ScenarioDsl<any>) => void
  ): void => {
    noteUnknownScenario(ruleId, name)
    // The two-argument form records NOTHING, and that absence is the contract `scenarioLayers`'
    // own field comment states: no entry means "this Scenario runs against its scope's ambient
    // Layer unchanged". Writing `Layer.empty` here instead would be the plausible tidy-up and would
    // erase the distinction, leaving a consumer no way to tell the two forms apart.
    if (maybeDefine !== undefined) {
      const extraLayer = extraLayerOrDefine as ErasedExtraLayer
      scenarioLayers.set(scenarioKey(ruleId, name), Layer.provideMerge(ambientLayer)(extraLayer))
    }

    const defineScenario = maybeDefine ?? (extraLayerOrDefine as (dsl: ScenarioDsl<any>) => void)
    registry.pushScope({ kind: "scenario", name, ruleId })
    try {
      invokeDefine("Scenario", name, defineScenario, scenarioDsl)
    } finally {
      // `finally`, so a define callback that throws cannot leave the stack unbalanced and re-parent
      // every step registered after it onto a scope the document does not have.
      registry.popScope()
    }
  }

  const dsl: FeatureDsl<any, any> = {
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
        invokeDefine("Background", null, defineBackground, backgroundDsl)
      } finally {
        // `finally`, so a define callback that throws cannot leave the stack unbalanced and
        // re-parent every step registered after it onto a scope the document does not have.
        registry.popScope()
      }
    },
    // `null` because a Scenario declared through the Feature's own dsl is genuinely not nested in
    // any Rule, and `featureLayer` because that is what is ambient here — the same binding every
    // Rule's merged Layer is derived from, never a second separation of the layer argument.
    Scenario: makeScenarioRegistrar(null, featureLayer),
    // A sibling of `Background`/`Scenario`, and never spread into `scenarioDsl` — the identical
    // "would leak into every `Scenario(...)` callback and into `backgroundDsl`" argument `Dsl.ts`
    // note (f) makes for the hooks applies unchanged to a nested container.
    Rule: (
      ruleName: string,
      extraLayerOrDefine: ErasedExtraLayer | ((dsl: RuleDsl<any>) => void),
      maybeDefine?: (dsl: RuleDsl<any>) => void
    ): void => {
      // Arity narrowing, the same shape `makeScenarioRegistrar` uses. The two-argument form is a
      // Rule whose Scenarios see the ambient Layer unchanged, so it merges nothing: `null` here
      // makes `ruleAmbientLayer` below the ambient Layer itself rather than a merge onto it.
      const extraLayer: ErasedExtraLayer | null = maybeDefine === undefined
        ? null
        : (extraLayerOrDefine as ErasedExtraLayer)
      const defineRule = maybeDefine ?? (extraLayerOrDefine as (dsl: RuleDsl<any>) => void)

      // The one place a Rule NAME becomes an id — `resolveRuleId`'s own comment has the sentinel
      // argument, and `Registry.ts` note (e) / `Plan.ts` note (e) are the two consumers that depend
      // on it never being `null`.
      const ruleId = resolveRuleId(feature, ruleName)
      if (ruleId.startsWith(unregisteredRulePrefix)) {
        containerWarnings.push(
          makeUnknownContainerWarning({
            uri: feature.uri,
            kind: "Rule",
            name: ruleName,
            ruleName: null,
            known: feature.rules.map((rule) => rule.name)
          })
        )
      }

      // Merged HERE, where `extraLayer` is captured, and exactly once per `Rule(...)` call — the
      // same "compute the single Layer to hand downstream once, at the point the extra argument is
      // captured" placement the Feature's own per-Scenario tier gets a few dozen lines above.
      //
      // `Layer.provideMerge(featureLayer)(extraLayer)` and NOT a side-by-side merge of the two,
      // which is the plausible tidy-up. ADR-EC-010 requires `extraLayer` to be able to DEPEND on
      // ambient services, and `provideMerge` is what feeds the ambient Layer's output into
      // `extraLayer`'s own requirements while keeping BOTH sets reachable. A side-by-side merge
      // composes them and satisfies nothing, so a Rule Layer built on top of a Feature service — the
      // ADR's own worked example — would not type-check at all.
      //
      // ON THE SHARED PATH THIS FEEDS ONLY THE PER-SCENARIO TIER INTO `extraLayer`, and that
      // consequence is invisible from this line. `featureLayer` is the per-Scenario half alone
      // whenever the Feature declared `{ shared, perScenario }`, so the shared tier is deliberately
      // ABSENT from the ambient argument here. A Rule Layer that depends on a SHARED service
      // therefore leaves that service on the composed Layer's `RIn` — unsatisfied at this point —
      // and the ambient context that `@effect/vitest`'s `layer(...)` establishes around the emitted
      // test node satisfies it at run time instead. That was MEASURED during this phase's planning
      // (a Rule Layer computing a discounted price from a shared list price, with the shared Layer
      // built once and the Rule's rebuilt per Scenario), not hoped for. Plan 10-04's
      // Rule-under-`shared` regression block is what keeps it true.
      const ruleAmbientLayer = extraLayer === null ? featureLayer : Layer.provideMerge(featureLayer)(extraLayer)
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
            invokeDefine("Background", ruleName, defineBackground, backgroundDsl)
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
        invokeDefine("Rule", ruleName, defineRule, ruleDsl)
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

  invokeDefine("describeFeature", feature.name, define, dsl)

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
    // The SAME binding every Rule's merged Layer was derived from — separated once, near the top.
    // The PER-SCENARIO tier, on both call forms; the field's own comment says why that is not a
    // synonym for "the Feature's ambient Layer" any more.
    layer: featureLayer,
    // The other half, or `null`, and never folded into the field above. The composition root
    // branches on exactly this: `null` is the plain path, non-null is the shared path.
    sharedLayer,
    definitions,
    plan: planFeature({ feature, definitions }),
    containerWarnings,
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

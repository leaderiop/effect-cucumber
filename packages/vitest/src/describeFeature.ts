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
 *     Because this module is the only one that can SEE the framework, it is also the only one that
 *     can see the framework FAIL — so it owns one more translation than the seam's shape suggests.
 *     `vitest@4.1.11`'s `strictTags` check THROWS on a tag no `vitest.config.ts` declares, and the
 *     throw is caught here and turned into a library-owned, located `UndeclaredTagWarning` plus an
 *     untagged re-emission (D-08; the factory below has the whole argument). That placement is not
 *     convenience: it is what lets `Runner.ts` go on not knowing the failure mode exists at all,
 *     which is the same property the rest of this note is about. A `try`/`catch` one layer up in
 *     `emitFeature` would compile and behave identically today, and would put a framework-specific
 *     recovery path in the module whose entire design premise is that it has never heard of the
 *     framework.
 *
 *     The acceptance grep this note refers to above is real and runnable:
 *     `scripts/verify-testapi-seam.sh` (`pnpm verify:testapi-seam`), added by plan 09-01 for exactly
 *     this phase's pressure — tags end up inside a framework option object, which makes
 *     `import type { TestOptions } from "vitest"` in `TestApi.ts` or `Runner.ts` the plausible,
 *     type-checking, lint-clean way to undo the seam.
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
import { makeExcludedScenariosNotice, makeUndeclaredTagWarning } from "./Errors.ts"
import { groupHooks, type HookBody, type HookSet, registerHook } from "./Hook.ts"
import { createHookRegistry, type HookKind } from "./HookRegistry.ts"
// `StepBody` is declared in `Plan.ts` and borrowed here, never the reverse — and the planning stage
// is imported FROM there INTO this module, so an edge pointing back the other way would be an
// `import/no-cycle` violation and a `pnpm circular` failure. See that module's closing paragraph.
import { type FeaturePlan, planFeature, type StepBody } from "./Plan.ts"
import { createRegistry, type StepDefinition, type StepKeyword } from "./Registry.ts"
import { emitFeature } from "./Runner.ts"
// The composite `scenarioLayers` key, in a LEAF module both this file and `Runner.ts` import rather
// than private to either — `ScenarioKey.ts`'s own header has the argument. `Runner.ts` reads back
// what the `Scenario` container below writes, and it cannot import this file (that edge would close a
// cycle with the `emitFeature` import above), so a shared leaf is the only way both sides can build
// one encoding instead of two that compile while disagreeing.
import { scenarioKey } from "./ScenarioKey.ts"
import { register } from "./Step.ts"
import { makeTagFilter } from "./Tags.ts"
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
 * `describeFeature`'s optional fourth argument: the registration-time tag filter (D-01, D-03).
 *
 * Both fields narrow what `describeFeature` REGISTERS, not what runs among what it registered. A
 * Scenario the filter removes never becomes a test node at all — it is absent from the run's output
 * rather than reported as skipped, which is exactly what makes it different from `@skip`. vitest's
 * own `--tagsFilter` CLI mechanism still applies, independently and afterwards, to whatever survives
 * this; the two compose rather than compete (09-CONTEXT.md's "additive, not a replacement" bullet).
 *
 * Omit the argument entirely and nothing filters, which is the pre-Phase-9 behaviour byte for byte.
 *
 * Plan 09-07 owns the `packages/vitest/src/index.ts` barrel edit that makes this type nameable by a
 * consumer; `describeFeature` itself is already exported there.
 */
export interface DescribeFeatureOptions {
  /**
   * Register a Scenario only if it carries at least one of these tags, `@` prefixes intact.
   *
   * A PLAIN ARRAY OF TAG STRINGS and never a boolean expression (D-02): `["@slow", "@wip"]`, not
   * `"@slow && !@wip"`. That is a decision and not a simplification — an expression form here would
   * be a SECOND grammar beside vitest's own `--tagsFilter`, which this library would then have to
   * parse, document, and keep in sync with someone else's parser forever, while the two silently
   * disagreed on every edge case neither had thought about. Anything the array form cannot express
   * is expressible with `--tagsFilter` at the CLI, against the real grammar.
   *
   * `undefined` and `[]` are the SAME input and both mean NO FILTER — never "match nothing"
   * (`Tags.ts` note (b) has the argument, and `makeTagFilter` is where the two collapse). A consumer
   * computing this from an environment flag or a `.filter()` that happens to come out empty gets
   * their whole suite back, rather than a suite deleted from existence behind a green run: zero
   * tests emitted and zero tests failed look identical in a reporter.
   */
  readonly includeTags?: ReadonlyArray<string>
  /**
   * Do not register a Scenario carrying any of these tags, `@` prefixes intact.
   *
   * A PLAIN ARRAY OF TAG STRINGS, for `includeTags`' D-02 reason above, and with `undefined` and
   * `[]` identically meaning NO FILTER for the same empty-array reason. Where a tag appears in BOTH
   * arrays, EXCLUDE WINS — `Tags.ts`'s `shouldEmit` evaluates the two halves as conjuncts, and the
   * safe reading of an author contradicting themselves is the one that runs fewer tests than
   * expected, which a test count shows, rather than more.
   */
  readonly excludeTags?: ReadonlyArray<string>
}

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
   * Keyed by the composite and never by name alone, for the reason `ScenarioKey.ts` note (a) gives:
   * F22 makes Scenario names unique per SCOPE only, so a Rule's Scenario and a same-named
   * Feature-level one are both legal and must not collide here.
   */
  readonly scenarioLayers: ReadonlyMap<string, Layer.Layer<any, any, never>>
}

/**
 * The concrete `TestApi`, built once PER FEATURE by this factory — note (e).
 *
 * It used to be a module-scope constant and is not one any more, for exactly one reason: `featureUri`.
 * D-08's warning has to name the `.feature` file it came from, a uri is per-Feature data, and module
 * scope is the one place in this file where no Feature exists yet. What did NOT change is the part
 * note (e) is actually about — the concrete framework objects are still constructed HERE and nowhere
 * else, and `pnpm verify:testapi-seam` still enforces that. A factory is not a second seam.
 *
 * `describe` is vitest's own and is re-exported by the package this module imports it from; the
 * Effect-aware test constructor is that package's, and its `self` parameter is
 * `() => Effect<A, E, Scope>`, which is exactly what `TestApi.effect` declares (`TestApi.ts` note
 * (d), verified against the installed build rather than assumed).
 *
 * `effect` is a forwarding function rather than the bare method reference it used to be, for exactly
 * one reason: `EmitOptions.tags` is a `ReadonlyArray<string>` — as it is in `Model.ts`, `Plan.ts` and
 * `TestApi.ts`, all the way from the parse — while vitest's own options type wants a mutable
 * `string[]`. `[...options.tags]` is THE single tag-array widening in this package, and it lives here
 * because this is already the one module permitted to name a test framework at all. Widening
 * `ScenarioPlan.tags` or `EmitOptions.tags` instead would "fix" the same assignment error by letting
 * every stage upstream rewrite a Scenario's tags in place.
 *
 * ## The `try`/`catch`: D-08's catch-and-degrade
 *
 * `vitest@4.1.11`'s `strictTags` defaults to `true`, so emitting a tag no `vitest.config.ts` declares
 * THROWS. Left alone, that throw escapes collection and the ENTIRE `.feature` file reports zero tests
 * collected — one undeclared tag on one Scenario deleting every Scenario in the file, which is the
 * failure mode this block exists to convert into one warning about one Scenario.
 *
 * Four facts here were established by RUNNING it (RESEARCH Finding 3), not by reading the framework
 * or reasoning about it, and each one is load-bearing for the shape below:
 *
 * - the throw is SYNCHRONOUS from the emission call, so an ordinary `try`/`catch` around that one
 *   statement actually catches it — nothing is on a promise or an event loop turn;
 * - nothing is left half-registered by it, so the catch path is not cleaning up after a partial
 *   registration and does not need to;
 * - the tagless re-emission registers CLEANLY from inside the catch block; and
 * - every later sibling in the same file still collects afterwards, which is the whole point —
 *   degradation is local to the Scenario rather than to the file.
 *
 * The consequence a reader needs, and the reason this warns rather than staying silent: the Scenario
 * RUNS, but its tags do not exist as far as the runner is concerned, so a `--tagsFilter` invocation
 * naming any of them cannot select it. The `.feature` file still says the tag is there and the runner
 * disagrees. That is a discrepancy no test failure will ever surface, so the warning names the file,
 * the Scenario, every offending tag, and where to declare them.
 *
 * ## Why the failure is discriminated STRUCTURALLY, and never by message, name or class
 *
 * Not every throw from an emission call is about tags, and swallowing an unrelated one behind an
 * untagged re-emission would be a silent loss of signal (T-09-05-03). The obvious discriminator is
 * the caught value's `message`, its `name`, or an `instanceof` against a framework error type, and
 * all three are refused here. This repo's rule since plan 03-01 is that upstream PROSE never becomes
 * a contract — a wording change in a dependency's patch release would silently turn this branch off,
 * and the framework's own message for this case is additionally known to contain a typo, so matching
 * it would mean encoding somebody else's bug as our condition.
 *
 * The discriminator used instead is an OUTCOME, and it is exact rather than heuristic: the fallback
 * emission carries NO tags at all, so `strictTags` has nothing to reject in it. If the fallback
 * throws too, the failure was categorically not about tags — and in that case the ORIGINAL caught
 * value is re-thrown, unmodified and unwrapped, because it is the one that describes what actually
 * went wrong. Replacing it with the fallback's throw, or with an error of ours, would name the
 * recovery attempt instead of the defect.
 *
 * ## Order inside the catch: re-emit FIRST, then warn
 *
 * The two statements read equally well in either order and only one is correct. `console.warn` is a
 * call into a host object a consumer's setup file is free to have replaced, so it can throw; if it
 * did, and it ran first, the Scenario would be left unregistered — silently absent from the run,
 * which is precisely the file-level disappearance this whole block exists to prevent, narrowed to one
 * Scenario. Registration is the guarantee and the warning is the report, so the guarantee goes first.
 *
 * @param featureUri - the `.feature` file every warning from this adapter is located against
 */
const vitestTestApi = (featureUri: string): TestApi => ({
  describe,
  effect: (name, self, options) => {
    try {
      it.effect(name, self, { tags: [...options.tags], skip: options.skip })
    } catch (cause) {
      try {
        // The SAME name and the SAME thunk, so the Scenario a reader is looking for is still the one
        // that appears — and `skip` preserved, because a `@skip` Scenario whose tags were undeclared
        // is still a skipped Scenario. Only `tags` is dropped, and it is OMITTED rather than passed
        // as an empty array: an empty array is a value `strictTags` would have to validate, and the
        // one thing this call must not do is reach the check that just threw.
        it.effect(name, self, { skip: options.skip })
      } catch {
        // Structural discrimination, and the only branch that reaches it: an emission with no tags
        // cannot fail `strictTags`, so whatever is wrong here was never about tags. `cause` and not
        // the inner throw — the original is the one that describes the defect.
        throw cause
      }
      console.warn(
        makeUndeclaredTagWarning({ uri: featureUri, scenarioName: name, tags: options.tags }).message
      )
    }
  }
})

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
  // `ScenarioKey.ts` note (a) gives.
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
 * The two overloads mirror `describeFeature`'s in the `layer`/`define` POSITIONS and — the part that
 * is load-bearing — in the ORDER note (a) protects, plain-Layer form last.
 *
 * They deliberately do NOT mirror its ARITY. `describeFeature` grew an optional fourth `options`
 * parameter carrying `includeTags`/`excludeTags`, and this function did not, because that option is a
 * REGISTRATION filter (D-03) and this entry point registers nothing: it returns the collection and
 * emits no test node at all. Accepting the parameter here could only mean ignoring it silently, or
 * filtering `collection.plan` — and `Runner.ts` note (g) is the reason the second is worse than the
 * first, since planning and warning deliberately cover the WHOLE Feature and only emission is
 * filtered. The absence is the contract, not an oversight awaiting a follow-up.
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
 * `options.includeTags`/`options.excludeTags` narrow what is REGISTERED (D-01, D-03): a Scenario the
 * filter removes never becomes a test node, so it is absent from the output rather than reported as
 * skipped. Omit the argument and nothing filters. When the filter does remove Scenarios, ONE summary
 * line naming the count and the Feature is written to the terminal (D-10) — a stale `excludeTags`
 * hiding a whole Feature behind a green run is otherwise indistinguishable from a Feature that
 * passed.
 *
 * @param feature - a `ParsedFeature` from `@effect-cucumber/gherkin`'s `loadFeature`/`parseFeature`
 * @param layer - the ambient Layer, or `{ shared, perScenario }`
 * @param define - runs synchronously; registers steps and containers. Note (c)
 * @param options - the registration-time tag filter; absent means no filter, and so does `[]`
 */
export function describeFeature<RShared, RScenario, E1, E2>(
  feature: ParsedFeature,
  layer: {
    readonly shared: Layer.Layer<RShared, E1, never>
    readonly perScenario: Layer.Layer<RScenario, E2, never>
  },
  define: (dsl: FeatureDsl<RShared | RScenario>) => void,
  options?: DescribeFeatureOptions
): void
// The plain-Layer overload is LAST, and must stay last — note (a). This is the one TypeScript
// reports against, and the one `effect(missingLayerContext)` fires from. The `options` parameter
// added to both overloads is TRAILING and OPTIONAL precisely so that this order needs no
// adjustment: a call that omits it still matches both signatures exactly as it did before, so the
// last-overload reporting rule note (a) depends on is untouched. That was RESEARCH assumption A1
// and it is settled empirically by `pnpm verify:tsgo-gate`, not by this comment.
export function describeFeature<ROut, E>(
  feature: ParsedFeature,
  layer: Layer.Layer<ROut, E, never>,
  define: (dsl: FeatureDsl<ROut>) => void,
  options?: DescribeFeatureOptions
): void
export function describeFeature(
  feature: ParsedFeature,
  layer: LayerArgument,
  define: (dsl: FeatureDsl<any>) => void,
  options?: DescribeFeatureOptions
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
  //
  // All NINE fields. The eight REQUIRED ones are not optional extras: `hooks` is the FEATURE-level
  // set alone (the `collect` return above filters it to `ruleId === null`), so an `emitFeature` call
  // passing only the first four would run every Rule-scoped hook nowhere at all and give every
  // Rule-nested Scenario the Feature's bare Layer. Every step would still resolve, every existing
  // assertion in this repo would still pass, and ADR-EC-010's whole guarantee would hold in the
  // type-checker and nowhere at runtime — which is why `emitFeature` declares them required rather
  // than defaulting a missing map to an empty one.
  //
  // The ninth, `onEmitted`, is the one OPTIONAL field, and it is optional because a caller that wants
  // no report is making a real choice rather than forgetting an argument — `Runner.ts` note (h). This
  // call site is the reason it exists, and it passes it.
  //
  // The eighth, `tagFilter`, follows the required rule for a sharper reason: an omitted filter that
  // defaulted to "no filter" and an omitted filter that defaulted to "match nothing" are one
  // keystroke apart and the second deletes a whole suite behind a green run. So `emitFeature`
  // requires an explicit, fully normalised filter, and the collapse from the OPTIONAL public
  // argument to that one required internal value happens exactly once, right here — `normalizeLayer`'s
  // idiom applied to the other over-permissive public argument this function takes. `makeTagFilter`
  // is what turns `undefined` and `[]` into the same thing (`Tags.ts` note (b)), so `options ?? {}`
  // is the whole of the "no options at all" case and there is no second default anywhere.
  const tagFilter = makeTagFilter(options ?? {})

  // The return value is DELIBERATELY DISCARDED, and that is the fix for a defect that shipped. It is
  // correct only for a `TestApi` whose `describe` runs its callback synchronously — which
  // `Runner.test.ts`'s recording fake is and the real framework is NOT: the framework registers a
  // suite collector and runs the callback later, when it collects the file. So every counter
  // `emitFeature` reports through its return value is still at its initial `0` on the line after this
  // call, however many Scenarios the filter removed. Guarding D-10's notice on it meant the notice
  // never printed once in a real run, while all four of `Runner.test.ts`'s outcome assertions stayed
  // green because they drive the synchronous fake. `Runner.ts` note (h) has the whole argument, and
  // plan 09-06's integration tests are what measured it.
  //
  // `onEmitted` fires as the last statement INSIDE the walk, so it observes final counts under either
  // kind of framework. Anything in this file that needs a count uses it.
  emitFeature({
    // ONE adapter per `describeFeature` call, built here rather than at module scope, because
    // D-08's warning has to name the `.feature` file and a uri does not exist until a Feature does.
    // Two Features in one file get two adapters, each located against its own uri.
    api: vitestTestApi(collection.plan.feature.uri),
    plan: collection.plan,
    layer: collection.layer,
    hooks: collection.hooks,
    ruleHooks: collection.ruleHooks,
    ruleLayers: collection.ruleLayers,
    scenarioLayers: collection.scenarioLayers,
    tagFilter,
    // D-10's ONE collection-time summary line, and three things about WHERE it is are worth writing
    // down because none is visible from the code.
    //
    // (1) It lives in `describeFeature`'s own body and NOT inside `collect`, for the identical reason
    //     the unused-definition loop above does: `collectFeature` shares `collect` verbatim and must
    //     stay silent, or every test asserting on a plan would print the very thing it is asserting
    //     on. `emitFeature` is silent for the sibling reason `Runner.ts` records — a terminal write
    //     there would spam `Runner.test.ts`'s dozens of direct calls — which is why it HANDS BACK the
    //     count instead of printing it. Passing a closure that writes to a terminal INTO that silent
    //     module does not break the rule; it is the rule, with the composition root still deciding
    //     what a human sees.
    //
    // (2) It necessarily prints AFTER the emitted block rather than above it like the warnings loop,
    //     which is the one asymmetry in this function's output order. The count does not exist until
    //     the emission walk has run, and the only way to have it earlier would be to walk the Feature
    //     a second time before emitting — a duplicate walk that could disagree with the real one.
    //
    // (3) It is a CALLBACK and not a read of the return value, which is (2) taken seriously rather
    //     than assumed: "after the walk has run" and "after the call that starts the walk returns"
    //     are the same instant only for a synchronous framework. See the comment above this call.
    //
    // `notice.message` is passed straight through, never rebuilt and never reformatted, for the
    // reason the warnings loop states above: a second rendering lets the terminal text and the
    // structured value say different things, and it drops the `JSON.stringify` quoting that stops a
    // tag or a Feature name containing a control character from rewriting the terminal line
    // (T-09-05-01).
    //
    // Guarded on `> 0` rather than printed unconditionally: a Feature nothing was filtered out of has
    // nothing to report, and a "0 Scenario(s) excluded" line on every Feature in a suite is noise
    // that trains a reader to skip the exact line D-10 exists to make them read. The guard lives HERE
    // and not in `emitFeature`, so the module that computes stays free of the question of what is
    // worth telling a human.
    onEmitted: (outcome) => {
      if (outcome.excludedScenarioCount > 0) {
        console.warn(
          makeExcludedScenariosNotice({
            featureName: collection.plan.feature.name,
            uri: collection.plan.feature.uri,
            count: outcome.excludedScenarioCount,
            // The NORMALISED arrays, not `options.includeTags`/`options.excludeTags`: those are
            // optional and the notice's fields are not, and `makeExcludedScenariosNotice` derives its
            // `reason` from exactly these two lengths. Reading the raw options here would let the
            // notice's `reason` be computed from a different pair of values than the filter that
            // produced the count.
            includeTags: tagFilter.include,
            excludeTags: tagFilter.exclude
          }).message
        )
      }
    }
  })
}

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
 * Six things about this module are not visible from the code.
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
 * (c) **A define callback must be synchronous, and `invokeDefine` enforces it.** An async callback
 *     returns before registering anything after its first `await`, so the Feature would collect
 *     fewer steps than were written and PASS. The `void` return type does not forbid a Promise, so
 *     every container's callback is run through `invokeDefine`, which throws at collection time on
 *     a Promise result. Nothing in this module returns a thenable either: `collectFeature` returns
 *     its result by value.
 *
 * (d) **D-04's collision rule is unchanged; the MECHANISM that delivers it is now provision order,
 *     not a merge combinator's argument order.** `shared` and `perScenario` MAY name the same
 *     service, and `perScenario` still wins for a step that depends on it. Nothing in this module
 *     combines the two tiers any more. The shared tier is built ONCE per Feature and is AMBIENT on
 *     the emitted test node; the per-Scenario tier is provided INSIDE the Scenario's own Effect by
 *     `ScenarioEffect.ts`, and the INNER provision is the one a step resolves against. That is the
 *     whole of the rule, and it is now a consequence of where each tier is provided rather than of
 *     an argument position.
 *
 *     Until this phase, both halves were collapsed into one merged Layer whose SECOND argument won,
 *     and `test/describeFeature.test.ts` proved the rule by resolving that single value. It cannot
 *     any more, and this is the part worth writing down: NO collection-level assertion can see
 *     provision order. What that file proves now is that the two tiers are two separate values, each
 *     resolving to its own implementation — `collection.layer` to `perScenario`'s and
 *     `collection.sharedLayer` to `shared`'s. The RUNTIME verdict, which implementation a step
 *     actually reaches, is proven by a real run in `test/emission.test.ts` (plan 10-03). The
 *     collection-level assertions were RE-HOMED rather than deleted precisely so that a revert to a
 *     single collapsed tier still has something to turn red here.
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
 *     The seam is a PARAMETER rather than an import because TWO concrete implementations now go
 *     through it, and the choice between them is per-Feature data. `vitestTestApi` closes over the
 *     MODULE-LEVEL test constructor and is the default path. `sharedLayerTestApi` closes over the
 *     `it` object `layer(shared)` hands its callback — the one carrying the shared Layer's services
 *     — and additionally provides a fresh `testEnv` per emitted node (ADR-EC-018). Both are valid
 *     `TestApi`s and neither substitutes for the other, which is precisely why the choice belongs at
 *     a call site and not in an import statement. `TestApi.ts` note (a) is the other half of the
 *     argument.
 *
 *     `describe` is the SAME module-level function in both, and that is not a leak of the wrong
 *     object into the shared path: `describe` carries no Layer services, so there is nothing for it
 *     to silently rebuild, and it is the only way to nest a Rule block at all — the object
 *     `layer(...)` hands back is a `MethodsNonLive`, which has no `describe` member. Only the test
 *     constructor differs, because only the test constructor carries context.
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
 * (f) **`shared`'s error channel is pinned to `never`, and `perScenario`'s deliberately is not.**
 *     The object form's `shared` field is `Layer.Layer<RShared, never, never>` on BOTH overloads
 *     below, so a `Layer<Db, DbConnectError>` — the realistic case, a testcontainer that fails to
 *     start — does not compile in that position. The reason is upstream and verified by reading it
 *     rather than assumed: the installed `@effect/vitest@4.0.0-rc.112`'s
 *     `dist/internal/internal.js` line 147 builds the Layer with
 *     `Layer.buildWithMemoMap(withTestEnv, memoMap, scope).pipe(Effect.orDie, Effect.cached,
 *     Effect.runSync)`. `Effect.orDie` turns a typed Layer failure into an unrecoverable DEFECT,
 *     and that defect is raised out of a `beforeAll`/`beforeEach` hook — detached from every
 *     Scenario. The report names no Scenario, no step and no `.feature` file, which is a failure
 *     nothing can be attributed to. The constraint does not remove that failure mode; it moves the
 *     choice to where the types can see it, so the caller writes `Layer.catchAll` or `Layer.orDie`
 *     themselves and the collapse is visible in their own source.
 *
 *     `perScenario` keeps its `E2` and is NOT constrained. That asymmetry is the decision (D-04 of
 *     `10-CONTEXT.md`, Pitfall 27), not an oversight: a `perScenario` Layer is provided INSIDE each
 *     Scenario's own Effect, so a typed failure there already surfaces through the Effect test
 *     constructor's `unknown` error channel as that Scenario's own failure, named and located.
 *     A Layer meant to fail one Scenario is a legitimate thing to write, and constraining it would
 *     forbid it for no safety gain.
 *
 *     The claim is carried in all three directions — the rejection, the positive control, and the
 *     `perScenario` asymmetry — by `packages/vitest/test/SharedLayerConstraint.types.ts`, which
 *     `pnpm typecheck:test` compiles on every push. Note (a)'s reporting rule still applies to the
 *     rejection: TypeScript reports it against the LAST overload, so the diagnostic a consumer
 *     reads names a missing-properties mismatch against the plain-Layer form rather than the error
 *     channel. The call is rejected either way, which is what the constraint is for; the exact text
 *     is recorded in `10-01-SUMMARY.md` rather than asserted on.
 *
 * Neither `collectFeature` nor the registry behind it is re-exported from
 * `packages/vitest/src/index.ts` — see `index.ts`'s own header for why.
 */
import type { ParsedFeature } from "@effect-cucumber/gherkin"
import * as Layer from "effect/Layer"
import type { FeatureDsl } from "./Dsl.ts"
import { makeExcludedScenariosNotice } from "./Errors.ts"
// `StepBody` is declared in `Plan.ts` and borrowed here, never the reverse — and the planning stage
// is imported FROM there INTO this module, so an edge pointing back the other way would be an
// `import/no-cycle` violation and a `pnpm circular` failure. See that module's closing paragraph.
import { emitFeature, type EmitOutcome } from "./Runner.ts"
// The composite `scenarioLayers` key, in a LEAF module both this file and `Runner.ts` import rather
// than private to either — `ScenarioKey.ts`'s own header has the argument. `Runner.ts` reads back
// what the `Scenario` container below writes, and it cannot import this file (that edge would close a
// cycle with the `emitFeature` import above), so a shared leaf is the only way both sides can build
// one encoding instead of two that compile while disagreeing.
import { collect, type FeatureCollection, type LayerArgument } from "./Collect.ts"
import { isSkipped, makeTagFilter, shouldEmit } from "./Tags.ts"
import { sharedLayerTestApi, vitestTestApi } from "./VitestTestApi.ts"

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
// `layerArgument` in the IMPLEMENTATION signature alone, for the reason `describeFeature`'s own
// implementation signature states below: the module-level `layer` import would otherwise be shadowed
// for the whole body. Both OVERLOAD signatures above still name the parameter `layer`, and those are
// the only ones a caller ever sees. Renamed here as well as there so the two entry points read the
// same way, not because this body needs the import.
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
 * In the object form, `shared` must be a `Layer<R, never, never>`: its error channel is pinned to
 * `never`, so a Layer that can FAIL is a compile error in that position. Handle the failure where
 * the types can see it — `Layer.catchAll` to substitute a fallback, `Layer.orDie` to say the
 * collapse is intended — and pass the result. `perScenario` is deliberately not constrained; a
 * per-Scenario Layer that fails fails its own Scenario, by name and in place. Note (f) has the
 * upstream reason for the asymmetry.
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
 * @param layer - the ambient Layer, or `{ shared, perScenario }` where `shared` is a
 *   `Layer<R, never, never>` — note (f)
 * @param define - runs synchronously; registers steps and containers. Note (c)
 * @param options - the registration-time tag filter; absent means no filter, and so does `[]`
 */
export function describeFeature<RShared, RScenario, E2>(
  feature: ParsedFeature,
  layer: {
    readonly shared: Layer.Layer<RShared, never, never>
    // `RShared`, not `never`: the per-Scenario tier may be built FROM the shared tier's services
    // (a World over a shared Database), and the runtime already establishes the shared tier around
    // every Scenario's `Effect.provide(perScenario)`. A requirement neither tier provides is still
    // rejected — `test/tsgo-gate/src/per-scenario-missing-rin.ts`.
    readonly perScenario: Layer.Layer<RScenario, E2, RShared>
  },
  define: (dsl: FeatureDsl<RShared | RScenario, RShared>) => void,
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
// `layerArgument` and not `layer` in the IMPLEMENTATION signature alone, for one mechanical reason:
// the shared branch below calls `@effect/vitest`'s own `layer(...)`, and a parameter named `layer`
// shadows that import for the whole body. Both OVERLOAD signatures above still name the parameter
// `layer`, and those are the only ones a caller ever sees or a tooltip ever renders — TypeScript
// never resolves a call against an implementation signature (`LayerArgument`'s own note).
export function describeFeature(
  feature: ParsedFeature,
  layerArgument: LayerArgument,
  define: (dsl: FeatureDsl<any, any>) => void,
  options?: DescribeFeatureOptions
): void {
  // REGISTER, then PLAN — both inside `collect`, which `collectFeature` shares verbatim.
  const collection = collect(feature, layerArgument, define)

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
  for (const warning of collection.containerWarnings) {
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
  // argument to that one required internal value happens exactly once, right here — the same
  // collapse-once idiom `collect` applies to the other over-permissive public argument this function
  // takes, the layer argument, at the top of its own body. `makeTagFilter`
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
  //
  // COMPUTED ONCE, ABOVE THE BRANCH, and referenced from both arms. Two copies of this closure — one
  // per path — is exactly the drift `collect` exists to prevent one layer down: a fix applied to one
  // arm leaves the other silently wrong, and the wrong one is whichever path that day's test happens
  // not to cover. The warnings loop above and the `tagFilter` below are computed once for the same
  // reason and are likewise shared.
  //
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
  const onEmitted = (outcome: EmitOutcome): void => {
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

  // THE ONE BRANCH between the two provision strategies, and it is an EXPLICIT read of an explicit
  // field rather than a re-inspection of the caller's argument shape. `null` means "this Feature never
  // asked for a shared scope" and nothing else can mean it — the `sharedLayer` field's own comment is
  // why it is not `Layer.empty`.
  const sharedTier = collection.sharedLayer

  // The named `layer(...)` form builds the shared tier EAGERLY, in a `beforeAll` on the Feature's
  // block, so the block has to be opened through it only when something inside will run. A Feature
  // whose every Scenario the filter removed or `@skip` retired has nothing that could need the tier —
  // its remaining nodes are the library's own `⚠` warnings, which read nothing — and routing it through
  // the plain adapter is what keeps BEH-EC-007's "ZERO times when it emits none" true. The predicate
  // is the same pair `Runner.ts`'s walk applies per Scenario (`shouldEmit`, then `isSkipped`), and the
  // "stays unbuilt (10-07)" block in `emission.test.ts` is what notices if the two drift apart.
  const anyRunnable = collection.plan.scenarios.some((scenarioPlan) =>
    shouldEmit(tagFilter, scenarioPlan.tags) && !isSkipped(scenarioPlan.tags)
  )

  // ONE adapter per `describeFeature` call, built here rather than at module scope, because D-08's
  // warning has to name the `.feature` file and a uri does not exist until a Feature does. On the
  // shared path the memo map is made HERE and handed in, so the adapter's hooks can reach the very
  // build the framework made.
  const api = sharedTier === null || !anyRunnable
    ? vitestTestApi(collection.plan.feature.uri)
    : sharedLayerTestApi(collection.plan.feature.uri, sharedTier, Layer.makeMemoMapUnsafe())

  // Every other field is the SAME value on both paths, `layer` included — the per-Scenario tier, which
  // is what the Scenario's own Effect provides. The shared tier is NOT among them: on the shared path it
  // is ambient on the `it` the adapter emits through, and passing it here as well would rebuild it once
  // per Scenario, which is the entire defect the shared path exists to remove.
  emitFeature({
    api,
    plan: collection.plan,
    layer: collection.layer,
    hooks: collection.hooks,
    ruleHooks: collection.ruleHooks,
    ruleLayers: collection.ruleLayers,
    scenarioLayers: collection.scenarioLayers,
    tagFilter,
    onEmitted
  })
}

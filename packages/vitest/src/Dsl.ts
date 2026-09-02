/**
 * The compile-time surface `describeFeature` hands to its define callback — the single place
 * INV-EC-003 is mechanically enforced.
 *
 * `describeFeature(feature, layer, define)` calls `define` with a `FeatureDsl<ROut>` whose `ROut` is
 * exactly the ambient Layer's output type. Every step registered through that dsl must be an Effect
 * requiring no more than `ROut`, so a step reaching for a service the Layer does not provide is a
 * type error where the step is written, never a runtime "service not found" discovered when the
 * Scenario runs. That is the project's core value, and this file is where it is spelled.
 * [ADR-EC-003](../../../spec/decisions/003-describefeature-takes-a-layer.md) is the decision record;
 * [ADR-EC-016](../../../spec/decisions/016-effect-tsgo-language-service-plugin.md) is the gate that
 * keeps the enforcement honest.
 *
 * Six things about this module are not visible from the code, and every one of them shares a
 * failure mode: the broken form still compiles, still rejects the negative case, and still leaves
 * every test in this repo green. There is no loud signal for any of them. Each note therefore names
 * the plausible tidy-up that would cause it.
 *
 * (a) **The step-function union lists `Effect.gen.Return` FIRST and the Effect-returning branch
 *     SECOND, and the order is load-bearing.** TypeScript reports the first union member a value
 *     fails against. With the Effect-returning branch first, a step body that requires an unprovided
 *     service is reported as "a Generator is missing the following properties: toJSON,
 *     [NodeInspectSymbol], [TypeId], pipe" — a shape mismatch the `@effect/tsgo` plugin has no
 *     reason to read as a context problem, so `effect(missingEffectContext)` never fires. The step
 *     is STILL rejected, so no test goes red; ADR-EC-016's diagnostic just quietly stops covering
 *     the DSL, which is the exact "gate decays into a no-op while CI stays green" failure this
 *     repo's tooling exists to prevent. Reproduced across four permutations in this phase's
 *     RESEARCH.md, Finding 2, against this repo's own compiler. Do not reorder these two members,
 *     and do not collapse them onto one line in a way that obscures which is first. The behavioral
 *     proof lives in `test/tsgo-gate/` — a reorder must make that fixture's assertion fail.
 *
 *     This rule now has THREE copies in the repo — this file, `Step.ts`'s `register`, and `Hook.ts`'s
 *     `registerHook` — and `HookRegistrar` below is what proves the rule for hooks: plan 07-03's
 *     `test/tsgo-gate/src/hook-missing-service.ts` fixture is the behavioral proof that a hook
 *     reaching for an unprovided service is rejected FOR THE RIGHT REASON, the same way the existing
 *     step fixtures prove it for `StepRegistrar`. If you change one copy, change all three.
 *
 * (b) **`Scope.Scope` appears ONLY in the step function's required-context position, as
 *     `ROut | Scope.Scope`.** It must not appear on `FeatureDsl`, `ScenarioDsl`, `BackgroundDsl`, or
 *     on any Layer type. `ROut` is exactly the ambient Layer's output — the thing the test author
 *     reasons about — and widening it with `Scope` would buy nothing while making every error
 *     message name a service the author never mentioned. This placement is what lets a step using
 *     `Effect.acquireRelease` compile against a plain `Layer<World>`, because the runner provides
 *     the Scope, while a step using an unprovided `Db` is still rejected (RESEARCH.md Finding 8).
 *     Do not "simplify" this by moving `Scope` up onto the dsl types, and do not delete it on the
 *     grounds that no Layer provides it.
 *
 *     It is spelled out on BOTH union members rather than factored into a
 *     `type StepContext<ROut> = ROut | Scope.Scope` alias, and that was measured, not assumed.
 *     The alias keeps `effect(missingEffectContext)` firing, but it degrades the human-readable
 *     `TS2345` chain from `Type 'Db' is not assignable to type 'Scope | World'` to
 *     `Type 'Db' is not assignable to type 'StepContext<World>'` — which names an internal type
 *     instead of the Layer output the test author actually reasons about, and sends them here to
 *     find out what it means. Under `exactOptionalPropertyTypes` that line is already the eighth of
 *     the chain (RESEARCH.md Pitfall 3); making it indirect too is a real cost paid for a cosmetic
 *     gain. Repeat the two words.
 *
 * (c) **`BackgroundDsl` deliberately omits `When`, `Then` and `But`.** Real Gherkin grammar permits
 *     only `Given`/`And` inside a `Background`
 *     ([ADR-EC-017](../../../spec/decisions/017-background-and-scenario-are-step-definition-containers.md)),
 *     so reaching for `When` on a Background dsl is `TS2339`. That is the intended behavior, not a
 *     gap to be filled by "making the two container types consistent."
 *
 * (d) **A step body's parameters are `StepParams<P>`: the pattern's holes typed by `StepArgs`, then an
 *     UNCHECKED tail.** `P` is inferred from the pattern literal before the body is contextually
 *     typed, so `Given("I have {int} apples", function*(count) { … })` receives `count: number` with
 *     no annotation, and `function*(count: string)` on that pattern is a compile error. Two positions
 *     stay `any`, deliberately and for different reasons. A CUSTOM parameter type (`{money}`) is
 *     runtime data whose transform's return type no pattern literal can recover, so its hole is
 *     `any` (`StepArgs`'s `Custom` argument is `Record<string, any>`) and the author's own annotation
 *     is what types it — an `unknown` there would REJECT that annotation under strictFunctionTypes.
 *     The trailing `DataTable`/`DocString` parameter is not part of the text a pattern matches, so
 *     nothing can infer it and the `...ReadonlyArray<any>` tail lets the author annotate it; that
 *     tail is the one remaining gap BEH-EC-016 records, pinned by
 *     `test/tsgo-gate/src/step-table-annotation-unchecked.ts`. The generator branch is NOT
 *     `Generator<any, A, any>`: a vacuous yield type makes a step requiring an unprovided service
 *     compile clean, and INV-EC-003 becomes decorative. Those are the only `any`s permitted in a
 *     step or hook body's declared type; one more is assignable to everything and disables the whole
 *     guarantee. Asserted by `test/StepRegistrar.types.ts`.
 *
 *     The `any` in `Layer.Layer<R2, E2, any>` — the `extraLayer` parameter of `FeatureDsl.Rule` and
 *     of `ScenarioRegistrar`'s three-argument signature — is a DIFFERENT position and is not covered
 *     by that prohibition. It sits in a Layer's `RIn` (what the Layer itself still needs), not in a
 *     body's required context, and it is what lets an extra Layer be built on top of the ambient one
 *     rather than only alongside it — ADR-EC-010 requires exactly that ("`extraLayer` can itself
 *     depend on ambient services"). Narrowing it to `never` would reject the ADR's own worked
 *     example; widening a body's `ROut` to `any` would silently delete INV-EC-003. Do not conflate
 *     the two by "making the `any` policy consistent."
 *
 * (e) **`R` is bound to the enclosing `describeFeature`'s `ROut` through `StepRegistrar<ROut>`; it
 *     is not a free type parameter of the registrar's call signature.** A per-call-site `R` would
 *     infer to whatever the body happens to need and constrain nothing — the vacuous-generic trap.
 *     `Params`, `A` and `E` are per-call-site because they genuinely vary per step; `ROut` is not,
 *     because it is the property being enforced. Do not "make it symmetric" by hoisting `R` into
 *     the call signature's type parameter list. 07-CONTEXT.md's canonical_refs says this reasoning
 *     "applies to hooks too" — `HookRegistrar<ROut>` binds `R` the identical way.
 *
 *     `ScenarioRegistrar`'s three-argument signature and `FeatureDsl.Rule` both introduce a
 *     per-call-site `R2`, and that is NOT the trap this note warns about. `R2` is inferred from an
 *     argument the author writes (`extraLayer`), so it is pinned by a real value the way `Params`
 *     already is, and it UNIONS with `ROut` (`ScenarioDsl<ROut | R2>`) rather than replacing it —
 *     `ROut` stays bound to the enclosing `describeFeature`, so nothing the ambient Layer guarantees
 *     is given up. The vacuous-generic trap is a type parameter inferred from the BODY's own needs,
 *     which is what a per-call-site `R` in the step position would be. Do not "fix" `R2` by hoisting
 *     it onto the interface, and do not read this paragraph as licence to hoist `R`.
 *
 * (f) **No hook member appears on `ScenarioDsl` or `BackgroundDsl`, ever. Four of the six appear on
 *     `RuleDsl` as well as `FeatureDsl`; the other two are Feature-only.** Two separate rules live
 *     here, and only the first is a guard:
 *
 *     The guard: `FeatureDsl extends ScenarioDsl` and `RuleDsl extends ScenarioDsl`, so a hook
 *     member added to `ScenarioDsl` would silently leak into every `Scenario(...)` container
 *     callback and into `BackgroundDsl`'s siblings — a leak the type system does not object to on
 *     its own, arrived at by the plausible tidy-up "make the containers consistent." The behavioral
 *     proof is plan 07-03's `test/tsgo-gate/src/hook-satisfied.ts`, which carries a
 *     `@ts-expect-error` directive on a `Scenario` callback reaching for `Before`: a leak turns that
 *     directive into an unused-directive error, which fails `verify-tsgo-gate.sh`'s gate assertion
 *     10. That argument is unchanged and still fully binding. Hooks are declared as SIBLINGS of the
 *     five step registrars on each container that has them, never spread into `ScenarioDsl`.
 *
 *     The placement, which is NOT a guard: `Before`, `After`, `BeforeStep` and `AfterStep` are on
 *     `RuleDsl` too, deliberately and by design — ADR-EC-010 makes exactly those four Rule-scopeable
 *     (a hook declared inside a `Rule`'s dsl applies only to Scenarios within that Rule), and
 *     08-CONTEXT.md's D-02 fixes their ordering relative to the Feature's own. This is new
 *     capability, not a leak the type system failed to prevent. `BeforeAllScenarios` and
 *     `AfterAllScenarios` remain on `FeatureDsl` ONLY: ADR-EC-010's Rule-scopeable list does not
 *     include them, and "once per Feature" (07-CONTEXT.md's D-08/D-09) does not narrow to "once per
 *     Rule" without its own design pass. Do not add them to `RuleDsl` for symmetry, and do not
 *     delete the four from `RuleDsl` on the strength of this note's older Feature-only wording.
 *
 *     Plan 08-06's tsgo-gate fixture pair is this half's behavioral proof, mirroring exactly how
 *     07-03's pair proved the original six-on-`FeatureDsl`-only claim: a satisfied fixture using a
 *     Rule-scoped `Before`, and a `@ts-expect-error` on a `RuleDsl` callback reaching for
 *     `BeforeAllScenarios`.
 *
 * This module contains types only: no `const`, no function, no runtime value at all. Both imports
 * are `import type`, so the emitted `dist/Dsl.js` carries zero statements. If a runtime statement
 * ever appears in that emit, something was added here that does not belong.
 *
 * No variance annotations (`in`/`out`) appear below, deliberately. Effect v4 declares
 * `Effect<out A, out E, out R>` (R covariant) while `Layer<in ROut, out E, out RIn>` is
 * contravariant in `ROut`; the asymmetry is what makes the check run in the intended direction, the
 * inferred variance here is already correct, and annotating risks pinning it wrong
 * (RESEARCH.md Finding 8, "Variance context").
 */
import type { StepArgs } from "@effect-cucumber/gherkin"
import type * as Effect from "effect/Effect"
import type * as Layer from "effect/Layer"
import type * as Scope from "effect/Scope"

/**
 * One step keyword — `Given`, `When`, `Then`, `And` or `But` — as the test author calls it.
 *
 * A callable interface rather than a type alias for a function, so the call signature can be
 * generic per CALL SITE in `Params`/`A`/`E` while `ROut` stays fixed by the enclosing
 * `describeFeature` — note (e).
 */
/**
 * The parameter list a step body registered against the pattern `P` receives: every `{hole}` of the
 * pattern, typed by `StepArgs` (built-ins exactly, custom parameter types as `any`), followed by an
 * unchecked tail for the trailing `DataTable`/`DocString` argument — note (d).
 */
export type StepParams<P extends string> = [...StepArgs<P, Record<string, any>>, ...ReadonlyArray<any>]

export interface StepRegistrar<ROut> {
  /**
   * Register `fn` as the body of every step whose text matches the cucumber-expression `pattern`.
   *
   * `fn` may be a bare generator function (auto-wrapped with `Effect.fn(pattern)` — ADR-EC-005) or
   * an already-wrapped function returning an Effect. Both branches are accepted; `Step.ts`'s
   * `register` tells them apart at runtime. Its parameters are `StepParams<P>` — note (d).
   *
   * The generator branch MUST stay first — note (a). This is the most dangerous line in the file.
   */
  <P extends string, A, E>(
    pattern: P,
    fn:
      | ((...p: StepParams<P>) => Effect.gen.Return<A, E, ROut | Scope.Scope>)
      | ((...p: StepParams<P>) => Effect.Effect<A, E, ROut | Scope.Scope>)
  ): void
}

/**
 * One hook — `Before`, `After`, `BeforeStep`, `AfterStep`, `BeforeAllScenarios` or
 * `AfterAllScenarios` — as the test author calls it.
 *
 * A callable interface rather than a type alias for a function, for the identical reason
 * `StepRegistrar<ROut>` is one — note (e): the call signature is generic per CALL SITE in `A`/`E`
 * while `ROut` stays fixed by the enclosing `describeFeature`. Unlike `StepRegistrar`, there is no
 * `Params` and no `pattern`: a hook takes no arguments (ADR-EC-005's Negative consequence —
 * `BeforeStep`/`AfterStep` do not receive the step), so this interface contains no `any` at all.
 */
export interface HookRegistrar<ROut> {
  /**
   * Register `fn` as one more hook body of this kind. Two or more registrations of the same kind
   * run in registration order (D-01), never sorted.
   *
   * `fn` may be a bare generator function (auto-wrapped with `Effect.fn(kind)` — ADR-EC-005) or an
   * already-wrapped function returning an Effect. `Hook.ts`'s `registerHook` tells them apart.
   *
   * The generator branch MUST stay first — note (a).
   */
  <A, E>(
    fn:
      | (() => Effect.gen.Return<A, E, ROut | Scope.Scope>)
      | (() => Effect.Effect<A, E, ROut | Scope.Scope>)
  ): void
}

/**
 * The step keywords available inside a `Scenario` — the full Gherkin set.
 *
 * All five are the same `StepRegistrar<ROut>`: the keyword a step is registered under is data the
 * registry records, not a distinction the type system draws. `And` and `But` continue the preceding
 * step's keyword at match time and are typed no differently here.
 */
export interface ScenarioDsl<ROut> {
  /** Register a `Given` step definition. */
  readonly Given: StepRegistrar<ROut>
  /** Register a `When` step definition. */
  readonly When: StepRegistrar<ROut>
  /** Register a `Then` step definition. */
  readonly Then: StepRegistrar<ROut>
  /** Register an `And` step definition — a continuation of whichever keyword precedes it. */
  readonly And: StepRegistrar<ROut>
  /** Register a `But` step definition — a continuation of whichever keyword precedes it. */
  readonly But: StepRegistrar<ROut>
  /**
   * Register every step of a step module (`defineSteps`, ADR-EC-027) into THIS container's scope,
   * as if each had been written here: a module used inside a `Rule` is Rule-scoped, one used at
   * Feature level is Feature-scoped, and the module's own definition sites are what ambiguity
   * ordering reports.
   *
   * The parameter is spelled as an anonymous structural type whose FIRST property is the Effect
   * witness, NOT as `StepModule<ROut>` — note (g). A module whose `R` names a service this
   * container's ambient Layer does not provide is rejected by `effect(missingEffectContext)`,
   * which is the whole point; the named alias form would report a bare TS2345 without the
   * diagnostic (measured; `test/tsgo-gate/src/step-module-missing-service.ts` pins it).
   */
  readonly use: (module: {
    readonly requires: Effect.Effect<void, never, ROut | Scope.Scope>
    readonly steps: ReadonlyArray<ModuleStep>
  }) => void
}

/**
 * One step a `defineSteps` module carries: what `Registry.ts`'s `register` takes, spelled
 * structurally here so this types-only module stays a leaf (no import of `Plan.ts`/`Registry.ts`).
 */
export interface ModuleStep {
  readonly keyword: "Given" | "When" | "Then" | "And" | "But"
  readonly pattern: string
  readonly body: (...params: ReadonlyArray<any>) => Effect.Effect<any, any, any>
  readonly definedAt: { readonly file: string; readonly line: number; readonly column: number } | null
}

/**
 * The step keywords available inside a `Background` — `Given` and `And` ONLY.
 *
 * The omission of `When`, `Then` and `But` is the point, not an oversight — note (c). Reaching for
 * `When` here is `TS2339`, which is what ADR-EC-017 asks for.
 */
export interface BackgroundDsl<ROut> {
  /** Register a `Given` step definition scoped to this `Background`. */
  readonly Given: StepRegistrar<ROut>
  /** Register an `And` step definition scoped to this `Background`. */
  readonly And: StepRegistrar<ROut>
}

/**
 * One `Scenario(...)` container declaration, in either of the two forms ADR-EC-010 documents:
 * `Scenario(name, define)` and `Scenario(name, extraLayer, define)`.
 *
 * TWO CALL SIGNATURES on one object, not a union of two function types on a `readonly` property.
 * The distinction is load-bearing and is the same one `StepRegistrar` is a callable interface for:
 * a union does not give overload resolution across a VARYING ARGUMENT COUNT — the checker picks a
 * member and reports against it, so a correct three-argument call is reported against the
 * two-argument member ("Expected 2 arguments, but got 3") and the author is told the extra Layer
 * form does not exist. Multiple call signatures on one object type is the construct that actually
 * resolves by arity.
 *
 * The two-argument signature is FIRST and is byte-for-byte the shape `FeatureDsl.Scenario` had
 * before this type existed. That is deliberate: it is the overwhelmingly common form, TypeScript
 * resolves overloads top-down, and keeping it first and unchanged is what lets every existing
 * `Scenario("...", (dsl) => {...})` call site in this repo keep compiling with no edit.
 *
 * The extra Layer is genuinely OPTIONAL — two signatures — rather than always-required-but-possibly
 * `Layer.empty`. That is the opposite of the call `describeFeature`'s `{ shared, perScenario }`
 * object makes (05-CONTEXT.md's D-03), and the reason the two differ is that D-03's required key
 * documents something: `shared` and `perScenario` MAY name the same service, and which one wins is a
 * precedence rule the author needs forced in front of them. `Scenario` has no second slot and so no
 * collision to disclose; an always-required `Layer.empty` here would document nothing, buy no
 * compile-time guarantee, and tax every ordinary Scenario with ceremony.
 *
 * `extraLayer` is always per-Scenario scope, built fresh for every Scenario, on the same lifecycle
 * as the Feature's default Layer (ADR-EC-010, ADR-EC-006) — there is no third "shared" tier hiding
 * in the three-argument form. `R2` is per-call-site and unions with `ROut`; see note (e).
 */
export interface ScenarioRegistrar<ROut> {
  /** The two-argument form. Unchanged from before this interface existed — no call site needs an edit. */
  (name: string, define: (dsl: ScenarioDsl<ROut>) => void): void
  /** The three-argument form: `extraLayer` extends the ambient Layer for THIS Scenario only. */
  <R2, E2>(name: string, extraLayer: Layer.Layer<R2, E2, any>, define: (dsl: ScenarioDsl<ROut | R2>) => void): void
}

/**
 * One `Rule(...)` container declaration, in either of the two forms: `Rule(name, define)` and
 * `Rule(name, extraLayer, define)` — BEH-EC-009.
 *
 * The same two-call-signature shape as `ScenarioRegistrar`, for the same reason: overload resolution
 * by arity. A Rule that needs no extra services is the ordinary case, and forcing `Layer.empty` into
 * its second slot would document nothing — there is no second Layer for it to collide with.
 *
 * The callback receives a `RuleDsl<ROut | R2>`, and that union is the point: a step written in
 * here may use both the Feature's ambient services (`ROut`) and the ones `extraLayer` contributes
 * (`R2`), while the identical step written at Feature level or inside a different Rule still only
 * sees `ROut` and fails to compile. That is INV-EC-005 as a type, not a convention.
 *
 * `R2` and `E2` are per-call-site because they genuinely vary per Rule, exactly as `Params`/`A`/`E`
 * do for `StepRegistrar`; `ROut` stays bound to the enclosing `describeFeature` and is unioned
 * with, never replaced by, `R2` — note (e). `extraLayer`'s own `RIn` is `any` so a Rule Layer may
 * build on top of ambient services rather than only alongside them, which ADR-EC-010 requires —
 * note (d) on why that `any` is a different position from a step body's.
 */
export interface RuleRegistrar<ROut> {
  /** The two-argument form: the Rule's Scenarios see the ambient Layer unchanged. */
  (name: string, define: (dsl: RuleDsl<ROut>) => void): void
  /** The three-argument form: `extraLayer` extends the ambient Layer for the Scenarios inside this Rule. */
  <R2, E2>(name: string, extraLayer: Layer.Layer<R2, E2, any>, define: (dsl: RuleDsl<ROut | R2>) => void): void
}

/**
 * The dsl a `Rule(name, extraLayer, define)` callback receives — `ScenarioDsl`'s five registrars for
 * steps declared at Rule level, plus this Rule's own `Background` and `Scenario` containers and the
 * four hooks ADR-EC-010 scopes to a Rule.
 *
 * `extends ScenarioDsl<ROut>` mirrors `FeatureDsl<ROut>` rather than restating the five registrars:
 * a Rule is a step-definition container in the same sense a Feature is, and a `Given` means the same
 * thing at both levels. Nothing about a Rule argues for a fresh interface, so this follows the
 * established extension precedent.
 *
 * The `ROut` here is NOT the Feature's `ROut`. `FeatureDsl.Rule` instantiates it as `ROut | R2` —
 * the Feature's ambient services unioned with what the Rule's `extraLayer` contributes — which is
 * the whole compile-time boundary INV-EC-005 asks for: a step written inside this callback may use
 * the extra service, and the identical step written outside it cannot. The runtime merge
 * (`Layer.provideMerge(ambient)(extraLayer)`, ADR-EC-010) belongs to `describeFeature.ts`; this file
 * only spells the boundary.
 *
 * `Background` reuses `BackgroundDsl<ROut>` verbatim rather than introducing a Rule-flavoured copy
 * (D-04). The `Given`/`And`-only omission note (c) documents is a Gherkin grammar restriction, and
 * the grammar does not change one nesting level down; a second interface with identical members
 * would be a synonym, not a distinction.
 *
 * There is deliberately no `BeforeAllScenarios` and no `AfterAllScenarios` — note (f).
 */
export interface RuleDsl<ROut> extends ScenarioDsl<ROut> {
  // `Background` and `Scenario` are the `FeatureDsl` members' shapes verbatim — a Rule is a
  // step-definition container on identical terms, and D-04 asks for no new type.
  readonly Background: (define: (dsl: BackgroundDsl<ROut>) => void) => void
  readonly Scenario: ScenarioRegistrar<ROut>
  // Exactly the four hooks ADR-EC-010 scopes to a Rule, and no others — note (f). The Feature's own
  // hooks of the same kind still apply to every Scenario in here; these nest inside them (D-02).
  readonly Before: HookRegistrar<ROut>
  readonly After: HookRegistrar<ROut>
  readonly BeforeStep: HookRegistrar<ROut>
  readonly AfterStep: HookRegistrar<ROut>
}

/**
 * The dsl `describeFeature` hands its define callback: `ScenarioDsl`'s five registrars for steps
 * declared at Feature level, plus the containers.
 *
 * `RShared` is the SHARED tier's output — what `describeFeature`'s `{ shared, perScenario }` form
 * declares in `shared`, and `never` on the plain-Layer form. The two once-per-Feature hooks are typed
 * by it and by nothing else (F-10): they run once for the whole Feature, outside every Scenario, so
 * there is no per-Scenario build for them to see. A `BeforeAllScenarios` that seeds a per-Scenario
 * `World` would seed a build no Scenario ever reads; making that a compile error, by name, is what
 * keeps the per-Scenario tier meaning "fresh every Scenario" (INV-EC-002). Everything else on this
 * interface is typed by `ROut`, the union of both tiers.
 *
 * Every container callback must be synchronous: an async one returns before registering anything
 * after its first `await`, and the Feature would emit fewer tests than were written while passing.
 * The `void` return type does NOT forbid a Promise-returning function (and `undefined` would also
 * reject a named callback annotated `: void`), so `describeFeature.ts`'s `invokeDefine` rejects a
 * Promise result at collection time instead.
 */
export interface FeatureDsl<ROut, RShared = never> extends ScenarioDsl<ROut> {
  /**
   * Declare the Feature's `Background` step definitions.
   *
   * Receives a `BackgroundDsl<ROut>` — `Given` and `And` only, note (c). A Background is a
   * step-definition CONTAINER: its steps are matched against the Background's literal Gherkin text
   * like any other step, not run unconditionally (ADR-EC-017).
   */
  readonly Background: (define: (dsl: BackgroundDsl<ROut>) => void) => void
  /**
   * Declare the step definitions for the Scenario named `name`, optionally extending the ambient
   * Layer with an extra Layer visible only inside this one Scenario (ADR-EC-010).
   *
   * The callback receives a full `ScenarioDsl<ROut>` — or `ScenarioDsl<ROut | R2>` in the
   * three-argument form. In the two-argument form the `ROut` is the same one the Feature was given,
   * so a registrar destructured here shadows the outer one without changing what it accepts.
   */
  readonly Scenario: ScenarioRegistrar<ROut>
  /**
   * Declare the step definitions for the Rule named `name`, optionally extending the ambient Layer
   * with an extra Layer for the Scenarios inside it — BEH-EC-009, `RuleRegistrar`.
   *
   * A sibling of `Background`/`Scenario`, never spread into `ScenarioDsl`, for the identical leak
   * reason note (f) gives for the hooks.
   */
  readonly Rule: RuleRegistrar<ROut>
  /** Register a hook that runs before each Scenario, after any `BeforeAllScenarios` hooks. */
  readonly Before: HookRegistrar<ROut>
  /** Register a hook that runs after each Scenario, whether it succeeded or failed. */
  readonly After: HookRegistrar<ROut>
  /** Register a hook that runs before each step, Background steps included. */
  readonly BeforeStep: HookRegistrar<ROut>
  /** Register a hook that runs after each step, even when the step failed. */
  readonly AfterStep: HookRegistrar<ROut>
  /**
   * Register a hook that runs once, before any Scenario in this Feature.
   *
   * Typed by the SHARED tier only — see the interface doc. On the plain-Layer form nothing is in
   * scope but `Scope`; a service the hook needs has to live in `shared`.
   */
  readonly BeforeAllScenarios: HookRegistrar<RShared>
  /**
   * Register a hook that runs once, after every Scenario in this Feature, always — as the Feature
   * block's teardown hook, so a run narrowed to one Scenario still runs it (BEH-EC-017).
   *
   * Typed by the SHARED tier only, like `BeforeAllScenarios`.
   */
  readonly AfterAllScenarios: HookRegistrar<RShared>
}

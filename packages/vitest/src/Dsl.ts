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
 * Five things about this module are not visible from the code, and every one of them shares a
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
 * (d) **`Params extends ReadonlyArray<any>`, not `unknown[]`, and the generator branch is NOT
 *     `Generator<any, A, any>`.** BEH-EC-003's published signature writes both of those, and both
 *     are wrong. `unknown[]` does not accept a generator's inferred parameter tuple cleanly, and a
 *     vacuous `any` yield type makes a step requiring an unprovided service compile clean, exit 0 —
 *     INV-EC-003 becomes decorative under the spec's own text (RESEARCH.md Finding 4, reproduced).
 *     Do not copy BEH-EC-003 as written; plan 05-06 corrects the spec to match this file. The one
 *     `any` below is the ONLY one permitted in this module: one `any` anywhere in a step body's
 *     declared type is assignable to everything and disables the whole guarantee.
 *
 * (e) **`R` is bound to the enclosing `describeFeature`'s `ROut` through `StepRegistrar<ROut>`; it
 *     is not a free type parameter of the registrar's call signature.** A per-call-site `R` would
 *     infer to whatever the body happens to need and constrain nothing — the vacuous-generic trap.
 *     `Params`, `A` and `E` are per-call-site because they genuinely vary per step; `ROut` is not,
 *     because it is the property being enforced. Do not "make it symmetric" by hoisting `R` into
 *     the call signature's type parameter list.
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
import type * as Effect from "effect/Effect"
import type * as Scope from "effect/Scope"

/**
 * One step keyword — `Given`, `When`, `Then`, `And` or `But` — as the test author calls it.
 *
 * A callable interface rather than a type alias for a function, so the call signature can be
 * generic per CALL SITE in `Params`/`A`/`E` while `ROut` stays fixed by the enclosing
 * `describeFeature` — note (e).
 */
export interface StepRegistrar<ROut> {
  /**
   * Register `fn` as the body of every step whose text matches the cucumber-expression `pattern`.
   *
   * `fn` may be a bare generator function (auto-wrapped with `Effect.fn(pattern)` — ADR-EC-005) or
   * an already-wrapped function returning an Effect. Both branches are accepted; `Step.ts`'s
   * `register` tells them apart at runtime.
   *
   * The generator branch MUST stay first — note (a). This is the most dangerous line in the file.
   */
  <Params extends ReadonlyArray<any>, A, E>(
    pattern: string,
    fn:
      | ((...p: Params) => Effect.gen.Return<A, E, ROut | Scope.Scope>)
      | ((...p: Params) => Effect.Effect<A, E, ROut | Scope.Scope>)
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
 * The dsl `describeFeature` hands its define callback: `ScenarioDsl`'s five registrars for steps
 * declared at Feature level, plus the two containers.
 *
 * Both container callbacks return `void`, never `void | Promise<void>`. An async define callback
 * would return before registering anything, and the Feature would emit zero tests while passing —
 * the type is the only thing that forbids it (PITFALLS #2).
 */
export interface FeatureDsl<ROut> extends ScenarioDsl<ROut> {
  /**
   * Declare the Feature's `Background` step definitions.
   *
   * Receives a `BackgroundDsl<ROut>` — `Given` and `And` only, note (c). A Background is a
   * step-definition CONTAINER: its steps are matched against the Background's literal Gherkin text
   * like any other step, not run unconditionally (ADR-EC-017).
   */
  readonly Background: (define: (dsl: BackgroundDsl<ROut>) => void) => void
  /**
   * Declare the step definitions for the Scenario named `name`.
   *
   * Receives a full `ScenarioDsl<ROut>`. The `ROut` is the same one the Feature was given, so a
   * registrar destructured here shadows the outer one without changing what it accepts.
   */
  readonly Scenario: (name: string, define: (dsl: ScenarioDsl<ROut>) => void) => void
}

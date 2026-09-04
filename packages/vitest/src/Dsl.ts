/**
 * The compile-time surface `define` receives: step and hook registrars and the container types.
 * Types only — no runtime value.
 *
 * Invariants a reader must not tidy away:
 * - In `StepRegistrar` and `HookRegistrar` the generator branch is FIRST in the union; with the
 *   Effect branch first the `effect(missingEffectContext)` diagnostic stops firing while the call is
 *   still rejected (`scripts/verify-tsgo-gate.sh` assertion 6).
 * - `Scope.Scope` appears only in a body's required context, never on the dsl or Layer types.
 * - A step body's parameters are `StepParams<P>`: pattern holes typed by `StepArgs`, custom holes
 *   `any`, an unchecked tail for the DataTable/DocString (BEH-EC-003/016,
 *   `test/StepRegistrar.types.ts`) and, for a step inside an Outline row, an `ExamplesRow` appended
 *   after those (BEH-EC-024, `Plan.ts`'s `planStep`) — all three share the one unchecked tail slot,
 *   never inferred from the pattern literal.
 * - `use`'s parameter is an anonymous structural type whose FIRST property is the `requires`
 *   witness; naming `StepModule<ROut>` there loses the diagnostic (tsgo-gate step-module fixtures).
 * - `BackgroundDsl` is `Given`/`And` only (ADR-EC-017); once-per-Feature hooks are typed by the
 *   shared tier (`HookRegistrar<RShared>`, BEH-EC-006).
 * - `Before`/`After`/`BeforeStep`/`AfterStep` are typed `TaggedHookRegistrar<ROut>`, not
 *   `HookRegistrar<ROut>`: a SECOND call signature accepting a leading tag-expression string ahead of
 *   the body (ADR-EC-035, BEH-EC-027). `BeforeAllScenarios`/`AfterAllScenarios` stay `HookRegistrar<
 *   RShared>` — the plain, one-arg-only shape — on PURPOSE: passing a tag expression to either is a
 *   compile error by arity, the same way either is already a compile error on `RuleDsl` itself (no
 *   coherent single-Scenario tag set exists to check against a once-per-Feature hook).
 */
import type { StepArgs } from "@effect-cucumber/gherkin"
import type * as Effect from "effect/Effect"
import type * as Layer from "effect/Layer"
import type * as Scope from "effect/Scope"

/**
 * One step keyword — `Given`, `When`, `Then`, `And` or `But` — as the test author calls it.
 */
export type StepParams<P extends string> = [...StepArgs<P, Record<string, any>>, ...ReadonlyArray<any>]

export interface StepRegistrar<ROut> {
  <P extends string, A, E>(
    pattern: P,
    fn:
      | ((...p: StepParams<P>) => Effect.gen.Return<A, E, ROut | Scope.Scope>)
      | ((...p: StepParams<P>) => Effect.Effect<A, E, ROut | Scope.Scope>)
  ): void
}

/**
 * One hook — `Before`, `After`, `BeforeStep`, `AfterStep`, `BeforeAllScenarios` or
 * `AfterAllScenarios` — as the test author calls it. `BeforeAllScenarios`/`AfterAllScenarios` alone
 * keep this exact one-arg-only shape (see `TaggedHookRegistrar` below).
 */
export interface HookRegistrar<ROut> {
  <A, E>(
    fn:
      | (() => Effect.gen.Return<A, E, ROut | Scope.Scope>)
      | (() => Effect.Effect<A, E, ROut | Scope.Scope>)
  ): void
}

/**
 * `Before`, `After`, `BeforeStep` and `AfterStep` — the four hook kinds ADR-EC-035/BEH-EC-027 make
 * tag-expression-scopable. The first overload is `HookRegistrar`'s own unconditional shape, UNTOUCHED
 * and listed first, per this file's own convention that the existing shape stays the shape a caller
 * meets first; the second is additive — a leading tag-expression string, parsed by vitest's OWN
 * `createTagsFilter` (the exact grammar backing its `--tagsFilter`: `and`/`or`/`not`/parens), matched
 * against the Scenario's own already-flattened, inherited tags at the point this hook would otherwise
 * unconditionally run. `BeforeAllScenarios`/`AfterAllScenarios` are deliberately NOT this type — see
 * this file's header note.
 */
export interface TaggedHookRegistrar<ROut> {
  <A, E>(
    fn:
      | (() => Effect.gen.Return<A, E, ROut | Scope.Scope>)
      | (() => Effect.Effect<A, E, ROut | Scope.Scope>)
  ): void
  <A, E>(
    tagExpr: string,
    fn:
      | (() => Effect.gen.Return<A, E, ROut | Scope.Scope>)
      | (() => Effect.Effect<A, E, ROut | Scope.Scope>)
  ): void
}

/**
 * The step keywords available inside a `Scenario` — the full Gherkin set.
 */
export interface ScenarioDsl<ROut> {
  readonly Given: StepRegistrar<ROut>
  readonly When: StepRegistrar<ROut>
  readonly Then: StepRegistrar<ROut>
  readonly And: StepRegistrar<ROut>
  readonly But: StepRegistrar<ROut>
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
 */
export interface BackgroundDsl<ROut> {
  readonly Given: StepRegistrar<ROut>
  readonly And: StepRegistrar<ROut>
}

/**
 * One `Scenario(...)` container declaration, in either of the two forms ADR-EC-010 documents:
 * `Scenario(name, define)` and `Scenario(name, extraLayer, define)`.
 */
export interface ScenarioRegistrar<ROut> {
  (name: string, define: (dsl: ScenarioDsl<ROut>) => void): void
  <R2, E2>(name: string, extraLayer: Layer.Layer<R2, E2, any>, define: (dsl: ScenarioDsl<ROut | R2>) => void): void
}

/**
 * One `Rule(...)` container declaration, in either of the two forms: `Rule(name, define)` and
 * `Rule(name, extraLayer, define)` — BEH-EC-009.
 */
export interface RuleRegistrar<ROut> {
  (name: string, define: (dsl: RuleDsl<ROut>) => void): void
  <R2, E2>(name: string, extraLayer: Layer.Layer<R2, E2, any>, define: (dsl: RuleDsl<ROut | R2>) => void): void
}

/**
 * The dsl a `Rule(name, extraLayer, define)` callback receives — `ScenarioDsl`'s five registrars
 * for steps declared at Rule level, plus this Rule's own `Background` and `Scenario` containers and
 * the four hooks ADR-EC-010 scopes to a Rule.
 */
export interface RuleDsl<ROut> extends ScenarioDsl<ROut> {
  readonly Background: (define: (dsl: BackgroundDsl<ROut>) => void) => void
  readonly Scenario: ScenarioRegistrar<ROut>
  readonly Before: TaggedHookRegistrar<ROut>
  readonly After: TaggedHookRegistrar<ROut>
  readonly BeforeStep: TaggedHookRegistrar<ROut>
  readonly AfterStep: TaggedHookRegistrar<ROut>
}

/**
 * The dsl `describeFeature` hands its define callback: `ScenarioDsl`'s five registrars for steps
 * declared at Feature level, plus the containers.
 */
export interface FeatureDsl<ROut, RShared = never> extends ScenarioDsl<ROut> {
  readonly Background: (define: (dsl: BackgroundDsl<ROut>) => void) => void
  readonly Scenario: ScenarioRegistrar<ROut>
  readonly Rule: RuleRegistrar<ROut>
  readonly Before: TaggedHookRegistrar<ROut>
  readonly After: TaggedHookRegistrar<ROut>
  readonly BeforeStep: TaggedHookRegistrar<ROut>
  readonly AfterStep: TaggedHookRegistrar<ROut>
  readonly BeforeAllScenarios: HookRegistrar<RShared>
  readonly AfterAllScenarios: HookRegistrar<RShared>
}

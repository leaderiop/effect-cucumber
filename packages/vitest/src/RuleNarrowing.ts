/**
 * The runtime half of `RuleRegistrar<ROut>`'s third overload (ADR-EC-039, BEH-EC-031):
 * `narrowRuleDsl` turns a wide `RuleDsl<Wide>` into a `RuleDsl<Narrow>` for an unrelated `Narrow`,
 * backed by real `Effect.updateContext` calls that retype every registered body's `Effect` — not
 * a cast, and not a compiler-only illusion. A Rule's `narrow` callback (`Collect.ts`'s `Rule(...)`
 * calls it once, before `define` runs) is the ONLY thing that ever calls this; the result flows
 * straight into `define`, so every step it registers reaches `registry.register` already wrapped.
 * A narrowed step's stored body is therefore a real `Effect<A, E, Wide | Scope.Scope |
 * Attachments>` by the time it is stored — indistinguishable, to `Registry.ts`/`Plan.ts`/
 * `Runner.ts`, from an ordinary un-narrowed Rule step. Narrowing is invisible to the rest of the
 * runtime pipeline: no other module changed to wire this in.
 *
 * Invariants a reader must not tidy away:
 * - `WorldProjection<Wide, Narrow>` mirrors `Effect.updateContext`'s own `f` parameter exactly:
 *   given the REAL ambient context a narrowed step will run against at runtime (`Wide |
 *   Scope.Scope | Attachments` — a Rule's actual `Layer.provideMerge(featureLayer)(extraLayer)`
 *   result, plus the two services `StepRegistrar`/`TaggedHookRegistrar` always add to a body's
 *   required context), it builds the narrower context a narrowed step body is typed to require.
 *   Threading `Scope.Scope` and `Attachments` through `project` unchanged is the Rule author's own
 *   responsibility (both fixtures below do it identically) — this helper does not do it on their
 *   behalf, so a `project` that forgets either is a real, loud compile error
 *   (`effect(missingEffectContext)` on the narrowed step), never a silent runtime gap.
 * - Step and hook bodies are normalised through the SAME `Step.ts`/`Hook.ts` helpers the ordinary,
 *   un-narrowed registration path uses (`register`/`registerHook`), so a narrowed step keeps the
 *   identical generator-vs-already-Effect handling and the identical `Effect.fn(pattern)` span
 *   naming an un-narrowed step gets. The wrapped result is handed to the underlying WIDE registrar
 *   as an already-Effect-returning function, which `Step.ts`'s own generator check correctly
 *   leaves untouched (no double `Effect.fn` wrap).
 * - `use` (a step module, ADR-EC-027) is narrowed the same way: each `ModuleStep.body` is wrapped
 *   with `Effect.updateContext` before being handed to the underlying wide `use`. `use`'s real
 *   implementation (`Collect.ts`) never reads `module.requires` at runtime — the witness exists
 *   purely for the tsgo gate to check at the CALL SITE — so this file passes it through unchanged
 *   rather than reconstructing a wide-typed one, mirroring the erased `ModuleStep.body: (...) =>
 *   Effect<any, any, any>` shape `Dsl.ts` already documents.
 * - A `Scenario` nested inside a narrowed Rule inherits the SAME narrowed World for its plain
 *   two-argument form. The three-argument (Scenario-level `extraLayer`) form is NOT supported
 *   inside a narrowed Rule: composing a Scenario's own extra Layer with a Rule's World narrowing
 *   is unexplored, untested surface, and this file fails it loudly at registration time
 *   (ADR-EC-019's precedent) rather than shipping an unverified composition. `RuleDsl<RNarrowed>`
 *   still structurally carries the full `ScenarioRegistrar<RNarrowed>` interface (both overloads)
 *   — TypeScript cannot express "this one overload throws" — so the rejection is a synchronous
 *   `Error` thrown from inside the narrowed `Scenario(...)` call itself, not a compile error.
 */
import type * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import type * as Scope from "effect/Scope"
import type { Attachments } from "./Attachments.ts"
import type {
  BackgroundDsl,
  ModuleStep,
  RuleDsl,
  ScenarioDsl,
  ScenarioRegistrar,
  StepRegistrar,
  TaggedHookRegistrar
} from "./Dsl.ts"
import { registerHook } from "./Hook.ts"
import type { HookKind } from "./HookRegistry.ts"
import { register as normalizeStepBody } from "./Step.ts"

/**
 * A Rule author's own reshaping function: given the REAL ambient context a narrowed step or hook
 * actually runs against, build the narrower context the narrowed dsl's bodies are typed to
 * require. This is the "one real, documented cost" ADR-EC-039 records — `project` is hand-written
 * per Rule, not auto-derived.
 */
export type WorldProjection<Wide, Narrow> = (
  context: Context.Context<Wide | Scope.Scope | Attachments>
) => Context.Context<Narrow | Scope.Scope | Attachments>

const wrapWithProjection = <Wide, Narrow>(
  effect: Effect.Effect<any, any, any>,
  project: WorldProjection<Wide, Narrow>
): Effect.Effect<any, any, any> => Effect.updateContext(effect, project as any)

const narrowStepRegistrar = <Wide, Narrow>(
  wide: StepRegistrar<Wide>,
  project: WorldProjection<Wide, Narrow>
): StepRegistrar<Narrow> =>
  ((pattern: string, fn: (...params: ReadonlyArray<any>) => any) => {
    const normalized = normalizeStepBody(pattern, fn)
    ;(wide as any)(pattern, (...params: ReadonlyArray<any>) => wrapWithProjection(normalized(...params), project))
  }) as unknown as StepRegistrar<Narrow>

const narrowTaggedHookRegistrar = <Wide, Narrow>(
  wide: TaggedHookRegistrar<Wide>,
  project: WorldProjection<Wide, Narrow>,
  kind: HookKind
): TaggedHookRegistrar<Narrow> =>
  ((tagExprOrFn: string | (() => any), maybeFn?: () => any) => {
    const tagExpr = typeof tagExprOrFn === "string" ? tagExprOrFn : null
    const fn = (maybeFn ?? tagExprOrFn) as () => any
    const normalized = registerHook(kind, fn)
    const wrapped = () => wrapWithProjection(normalized(), project)
    if (tagExpr !== null) {
      ;(wide as any)(tagExpr, wrapped)
    } else {
      ;(wide as any)(wrapped)
    }
  }) as unknown as TaggedHookRegistrar<Narrow>

const narrowUse = <Wide, Narrow>(
  wide: ScenarioDsl<Wide>["use"],
  project: WorldProjection<Wide, Narrow>
): ScenarioDsl<Narrow>["use"] =>
  ((module: { readonly requires: Effect.Effect<void, never, any>; readonly steps: ReadonlyArray<ModuleStep> }) => {
    const wrappedSteps: ReadonlyArray<ModuleStep> = module.steps.map((step) => ({
      ...step,
      body: (...params: ReadonlyArray<any>) => wrapWithProjection(step.body(...params), project)
    }))
    ;(wide as any)({ requires: module.requires, steps: wrappedSteps })
  }) as ScenarioDsl<Narrow>["use"]

const narrowScenarioDsl = <Wide, Narrow>(
  dsl: ScenarioDsl<Wide>,
  project: WorldProjection<Wide, Narrow>
): ScenarioDsl<Narrow> => ({
  Given: narrowStepRegistrar(dsl.Given, project),
  When: narrowStepRegistrar(dsl.When, project),
  Then: narrowStepRegistrar(dsl.Then, project),
  And: narrowStepRegistrar(dsl.And, project),
  But: narrowStepRegistrar(dsl.But, project),
  use: narrowUse(dsl.use, project)
})

const unsupportedScenarioExtraLayer = (name: string): never => {
  throw new Error(
    `Scenario "${name}" was declared with its own extra Layer inside a narrowed Rule. `
      + "Composing a Scenario-level extra Layer with a Rule's World narrowing is not supported — "
      + "either promote the service to the Rule's own extraLayer (so it is part of what `narrow` "
      + "reshapes), or declare this Scenario without an extra Layer of its own. See ADR-EC-039."
  )
}

/**
 * Turn a wide `RuleDsl<Wide>` into a `RuleDsl<Narrow>` for an unrelated `Narrow`, backed by real
 * `Effect.updateContext` calls. The Rule author supplies `project` and calls this from inside
 * `narrow`, i.e. `Rule(name, extraLayer, (dsl) => narrowRuleDsl(dsl, project), (dsl) => {...})`.
 */
export const narrowRuleDsl = <Wide, Narrow>(
  dsl: RuleDsl<Wide>,
  project: WorldProjection<Wide, Narrow>
): RuleDsl<Narrow> => {
  const scenarioDsl = narrowScenarioDsl(dsl, project)

  const Scenario = ((name: string, a: any, b?: any) => {
    if (b !== undefined) {
      return unsupportedScenarioExtraLayer(name)
    }
    const define = a as (dsl: ScenarioDsl<Narrow>) => void
    ;(dsl.Scenario as any)(name, (wideScenarioDsl: ScenarioDsl<Wide>) => {
      define(narrowScenarioDsl(wideScenarioDsl, project))
    })
  }) as unknown as ScenarioRegistrar<Narrow>

  return {
    ...scenarioDsl,
    Background: (define: (dsl: BackgroundDsl<Narrow>) => void) => {
      dsl.Background((wideBackground) => {
        define({
          Given: narrowStepRegistrar(wideBackground.Given, project),
          And: narrowStepRegistrar(wideBackground.And, project)
        })
      })
    },
    Scenario,
    Before: narrowTaggedHookRegistrar(dsl.Before, project, "Before"),
    After: narrowTaggedHookRegistrar(dsl.After, project, "After"),
    BeforeStep: narrowTaggedHookRegistrar(dsl.BeforeStep, project, "BeforeStep"),
    AfterStep: narrowTaggedHookRegistrar(dsl.AfterStep, project, "AfterStep")
  }
}

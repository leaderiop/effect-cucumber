// MUST NOT COMPILE.
//
// SPIKE — throwaway, feeds GitHub issue #23. NOT wired into the real Dsl.ts/Collect.ts. See the
// twin fixture spike-rule-narrowing-satisfied.ts for the full write-up header; the type/mechanism
// sections below are duplicated verbatim from it, matching this directory's own
// rule-satisfied.ts/rule-missing-service.ts convention (`files: [one]` per config).
//
// THE DEFECTS this file proves are rejected, BY NAME (`effect(missingEffectContext)`): a step
// inside Rule A's narrowed dsl reaching for (1) Rule B's own narrowed world — a SIBLING leak —
// and (2) the Feature-level ambient service narrowing is supposed to hide — the whole point of
// #23 over the existing `RuleDsl<ROut | R2>` union, which only ever GROWS what a nested scope
// sees. Neither has a `@ts-expect-error` here: this file's only job is to fail, and by name.
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Scope from "effect/Scope"

// ============================================================================================
// 1. THE SKETCHED SIGNATURE — identical to the twin fixture.
// ============================================================================================
export interface StepRegistrar<ROut> {
  <A, E>(name: string, fn: () => Effect.Effect<A, E, ROut | Scope.Scope>): void
}
export interface RuleDsl<ROut> {
  readonly Given: StepRegistrar<ROut>
  readonly When: StepRegistrar<ROut>
  readonly Then: StepRegistrar<ROut>
}
export interface RuleRegistrar<ROut> {
  (name: string, define: (dsl: RuleDsl<ROut>) => void): void
  <R2, E2>(name: string, extraLayer: Layer.Layer<R2, E2, any>, define: (dsl: RuleDsl<ROut | R2>) => void): void
  <R2, E2, RNarrowed>(
    name: string,
    extraLayer: Layer.Layer<R2, E2, any>,
    narrow: (dsl: RuleDsl<ROut | R2>) => RuleDsl<RNarrowed>,
    define: (dsl: RuleDsl<RNarrowed>) => void
  ): void
}

// ============================================================================================
// 2. THE RUNTIME MECHANISM — identical to the twin fixture.
// ============================================================================================
const narrowRuleDsl = <Wide, Narrow>(
  dsl: RuleDsl<Wide>,
  project: (context: Context.Context<Wide | Scope.Scope>) => Context.Context<Narrow | Scope.Scope>
): RuleDsl<Narrow> => {
  const narrowStepRegistrar = (register: StepRegistrar<Wide>): StepRegistrar<Narrow> => (name, fn) =>
    register(name, () => Effect.updateContext(fn(), project))
  return {
    Given: narrowStepRegistrar(dsl.Given),
    When: narrowStepRegistrar(dsl.When),
    Then: narrowStepRegistrar(dsl.Then)
  }
}

interface RegisteredStep {
  readonly name: string
  readonly run: Effect.Effect<unknown, unknown, unknown>
}
interface RuleRecord {
  readonly name: string
  readonly layer: Layer.Layer<any, any, any>
  readonly steps: ReadonlyArray<RegisteredStep>
}
const makeStepRegistrar = <ROut>(steps: Array<RegisteredStep>): StepRegistrar<ROut> => (name, fn) => {
  steps.push({ name, run: fn() as Effect.Effect<unknown, unknown, unknown> })
}
const makeRuleDsl = <ROut>(steps: Array<RegisteredStep>): RuleDsl<ROut> => ({
  Given: makeStepRegistrar(steps),
  When: makeStepRegistrar(steps),
  Then: makeStepRegistrar(steps)
})
const makeRule = <ROut>(featureLayer: Layer.Layer<ROut, any, never>, rules: Array<RuleRecord>): RuleRegistrar<ROut> =>
  ((name: string, a?: any, b?: any, c?: any) => {
    const steps: Array<RegisteredStep> = []
    if (c !== undefined) {
      const extraLayer = a as Layer.Layer<any, any, any>
      const narrow = b as (dsl: RuleDsl<any>) => RuleDsl<any>
      const define = c as (dsl: RuleDsl<any>) => void
      const ruleLayer = Layer.provideMerge(featureLayer)(extraLayer)
      define(narrow(makeRuleDsl<any>(steps)))
      rules.push({ name, layer: ruleLayer, steps })
    } else if (b !== undefined) {
      const extraLayer = a as Layer.Layer<any, any, any>
      const define = b as (dsl: RuleDsl<any>) => void
      const ruleLayer = Layer.provideMerge(featureLayer)(extraLayer)
      define(makeRuleDsl<any>(steps))
      rules.push({ name, layer: ruleLayer, steps })
    } else {
      const define = a as (dsl: RuleDsl<any>) => void
      define(makeRuleDsl<any>(steps))
      rules.push({ name, layer: featureLayer, steps })
    }
  }) as unknown as RuleRegistrar<ROut>

// ============================================================================================
// 3. THE MOTIVATING CASE — identical services/worlds/projections to the twin fixture.
// ============================================================================================
class FeatureService extends Context.Service<FeatureService, { readonly featureId: string }>()(
  "spike/FeatureService"
) {
  static readonly layer: Layer.Layer<FeatureService> = Layer.succeed(
    FeatureService,
    FeatureService.of({ featureId: "AUDIT-42" })
  )
}
class RemediationService extends Context.Service<RemediationService, { readonly remediate: Effect.Effect<string> }>()(
  "spike/RemediationService"
) {
  static readonly layer: Layer.Layer<RemediationService> = Layer.succeed(
    RemediationService,
    RemediationService.of({ remediate: Effect.succeed("remediation-report") })
  )
}
class RemediationWorld extends Context.Service<RemediationWorld, { readonly report: Effect.Effect<string> }>()(
  "spike/RemediationWorld"
) {}
// BomWorld belongs to a sibling Rule that is never even declared in this file (no BomService, no
// second `Rule(...)` call) — that is the point of DEFECT 1 below: it must be unreachable
// regardless of whether the sibling Rule is even in scope in this module.
class BomWorld extends Context.Service<BomWorld, { readonly bom: Effect.Effect<string> }>()(
  "spike/BomWorld"
) {}

const projectRemediation = (
  wide: Context.Context<FeatureService | RemediationService | Scope.Scope>
): Context.Context<RemediationWorld | Scope.Scope> => {
  const remediation = Context.get(wide, RemediationService)
  const scope = Context.get(wide, Scope.Scope)
  return Context.make(RemediationWorld, RemediationWorld.of({ report: remediation.remediate })).pipe(
    Context.add(Scope.Scope, scope)
  )
}

const rules: Array<RuleRecord> = []
const Rule = makeRule(FeatureService.layer, rules)

Rule(
  "Remediation",
  RemediationService.layer,
  (wideDsl) => narrowRuleDsl(wideDsl, projectRemediation),
  (dsl) => {
    // DEFECT 1, SIBLING LEAK: BomWorld belongs to a Rule that was never even declared in this
    // file — narrowing must not let a step reach for an unrelated world just because it happens
    // to exist elsewhere in the module.
    dsl.Given("must not see the other rule's world", () =>
      Effect.gen(function*() {
        const bom = yield* BomWorld
        return yield* bom.bom
      }))

    // DEFECT 2, AMBIENT LEAK: FeatureService is the Feature-level ambient service — the thing
    // narrowing is FOR hiding. If this compiles, narrowing only ever widens `RuleDsl` (same as
    // the existing `RuleDsl<ROut | R2>` union already does) and #23's actual ask is unmet.
    dsl.Given("must not see the Feature-level ambient service", () =>
      Effect.gen(function*() {
        const feature = yield* FeatureService
        return feature.featureId
      }))
  }
)

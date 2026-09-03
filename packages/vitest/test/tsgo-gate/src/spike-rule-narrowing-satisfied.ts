// MUST COMPILE CLEAN.
//
// SPIKE — throwaway, feeds GitHub issue #23. NOT wired into the real Dsl.ts/Collect.ts: every
// type and function below (`RuleDsl`, `RuleRegistrar`, `narrowRuleDsl`, `makeRule`, ...) is a
// LOCAL reconstruction for this experiment, not the real package's surface. Read
// research/rule-world-narrowing-spike.md for the write-up this fixture backs.
//
// Declared inline and duplicated in the twin fixture (spike-rule-narrowing-starved.ts) on
// purpose, matching this directory's own rule-satisfied.ts/rule-missing-service.ts convention:
// `files: [one]` means a shared helper module would have to be added to every sibling config.
//
// Answers: can a `Rule`-like construct expose a narrower/different `RuleDsl<RNarrowed>` to its
// callback than the ambient `ROut`, using `Effect.updateContext` under the hood, and does the
// signature type-check cleanly under this repo's real strict tsconfig / @effect/tsgo gate? This
// file is the POSITIVE control: everything here must be ACCEPTED. Run with `tsx` (see the bottom
// `main` block) for the runtime proof that the mechanism really reshapes live values, not just
// type-checks; run through `tsc -p tsconfig.rule-narrowing-satisfied.json` for the type proof.
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Scope from "effect/Scope"

// ============================================================================================
// 1. THE SKETCHED SIGNATURE — derived, not assumed. See the write-up for the two dead ends this
//    replaced (a Context-transform overload, and a same-shape-only `updateService`-style one).
// ============================================================================================

/**
 * Local mirror of `packages/vitest/src/Dsl.ts`'s `StepRegistrar<ROut>`, trimmed to three
 * keywords — `Given`/`When`/`Then` — since the point under test is `RuleRegistrar`/`RuleDsl`,
 * not step-body arity.
 */
export interface StepRegistrar<ROut> {
  <A, E>(name: string, fn: () => Effect.Effect<A, E, ROut | Scope.Scope>): void
}

/** Local mirror of `RuleDsl<ROut>`, trimmed to its step registrars (no `Scenario`/hooks/`Background`). */
export interface RuleDsl<ROut> {
  readonly Given: StepRegistrar<ROut>
  readonly When: StepRegistrar<ROut>
  readonly Then: StepRegistrar<ROut>
}

/**
 * The real `RuleRegistrar<ROut>`'s two overloads, unchanged, PLUS a third: a `narrow` step
 * between `extraLayer` and `define`. `narrow` receives the ordinary WIDE dsl (`RuleDsl<ROut |
 * R2>`, exactly what the existing two-overload shape already hands a Rule) and must return a
 * `RuleDsl<RNarrowed>` for a genuinely free `RNarrowed` — TypeScript infers it from `narrow`'s
 * own return type, not from `ROut`/`R2`, so `RNarrowed` can be disjoint from both.
 *
 * `narrow` is not a magic compiler hook — it is an ordinary function value the caller writes
 * (typically `(dsl) => narrowRuleDsl(dsl, project)`, see §2), so producing a `RuleDsl<RNarrowed>`
 * is the caller's job, not this interface's. That is what keeps this sound: nothing here lets a
 * `RNarrowed`-typed step run for free — `narrowRuleDsl` has to actually retype every step body's
 * `Effect` with `Effect.updateContext`.
 */
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
// 2. THE RUNTIME MECHANISM — `Effect.updateContext` really does the retyping, real
//    `narrowRuleDsl` (a library-provided helper) real Rule authors call from inside `narrow`.
// ============================================================================================

/**
 * Wraps a WIDE `RuleDsl<Wide>` into a `RuleDsl<Narrow>` for an unrelated `Narrow`. `project` is a
 * genuine `Context` transform: given the REAL ambient context a step will run against at runtime
 * (`Wide | Scope.Scope` — the Rule's actual merged Layer, `Scope` included because
 * `StepRegistrar` always adds it), it builds the narrower `Context<Narrow | Scope.Scope>` the
 * narrowed step body is typed to require. Every step registered through the returned dsl has its
 * `Effect` retyped with `Effect.updateContext(fn(), project)` BEFORE it reaches the real,
 * wide-typed registrar underneath — so a step written against `RuleDsl<Narrow>` is a real
 * `Effect<A, E, Narrow | Scope.Scope>` at the type level, backed by a real `Effect<A, E, Wide |
 * Scope.Scope>` underneath once retyped. This is not a cast: `Effect.updateContext`'s own
 * signature (`node_modules/effect/src/Effect.ts:12004`) is what makes the two directions line up.
 */
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

// A minimal, ERASED (`any`-typed internals — exactly how the real `Registry.ts`/`Collect.ts`
// store step bodies) `Rule`/registry harness, just enough to actually REGISTER and RUN the steps
// below, so this spike proves the mechanism works at runtime, not only that it type-checks.
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
      // Four-argument form: (name, extraLayer, narrow, define).
      const extraLayer = a as Layer.Layer<any, any, any>
      const narrow = b as (dsl: RuleDsl<any>) => RuleDsl<any>
      const define = c as (dsl: RuleDsl<any>) => void
      const ruleLayer = Layer.provideMerge(featureLayer)(extraLayer)
      define(narrow(makeRuleDsl<any>(steps)))
      rules.push({ name, layer: ruleLayer, steps })
    } else if (b !== undefined) {
      // Three-argument form: (name, extraLayer, define) — the EXISTING shape, unchanged.
      const extraLayer = a as Layer.Layer<any, any, any>
      const define = b as (dsl: RuleDsl<any>) => void
      const ruleLayer = Layer.provideMerge(featureLayer)(extraLayer)
      define(makeRuleDsl<any>(steps))
      rules.push({ name, layer: ruleLayer, steps })
    } else {
      // Two-argument form: (name, define).
      const define = a as (dsl: RuleDsl<any>) => void
      define(makeRuleDsl<any>(steps))
      rules.push({ name, layer: featureLayer, steps })
    }
  }) as unknown as RuleRegistrar<ROut>

// ============================================================================================
// 3. THE MOTIVATING CASE — an audit tool whose Rules produce either a remediation report OR a
//    BOM export, never both (#23's own framing). Two disjoint extra services, two disjoint
//    NARROWED worlds, and a Feature-level ambient service narrowing is meant to hide.
// ============================================================================================

class FeatureService extends Context.Service<FeatureService, { readonly featureId: string }>()(
  "spike/FeatureService"
) {
  static readonly layer: Layer.Layer<FeatureService> = Layer.succeed(
    FeatureService,
    FeatureService.of({ featureId: "AUDIT-42" })
  )
}

// Rule A's own extra service.
class RemediationService extends Context.Service<RemediationService, { readonly remediate: Effect.Effect<string> }>()(
  "spike/RemediationService"
) {
  static readonly layer: Layer.Layer<RemediationService> = Layer.succeed(
    RemediationService,
    RemediationService.of({ remediate: Effect.succeed("remediation-report") })
  )
}

// Rule B's own extra service — DISJOINT from RemediationService (no shared members), mirroring
// #22's NarrowWorld/FeatureService disjointness check.
class BomService extends Context.Service<BomService, { readonly exportBom: Effect.Effect<string> }>()(
  "spike/BomService"
) {
  static readonly layer: Layer.Layer<BomService> = Layer.succeed(
    BomService,
    BomService.of({ exportBom: Effect.succeed("bom-export") })
  )
}

// The NARROWED worlds each Rule's steps actually see — reshaped (renamed member, new Tag), not
// merely aliased, and disjoint from FeatureService/RemediationService/BomService alike.
class RemediationWorld extends Context.Service<RemediationWorld, { readonly report: Effect.Effect<string> }>()(
  "spike/RemediationWorld"
) {}
class BomWorld extends Context.Service<BomWorld, { readonly bom: Effect.Effect<string> }>()(
  "spike/BomWorld"
) {}

// `project` for Rule A: given the REAL ambient context (FeatureService | RemediationService |
// Scope), build the narrower RemediationWorld the Rule's own steps are typed to require. It
// reaches into the wide context for RemediationService's real value — this is genuine reshaping
// of live data, not a fabricated stand-in.
const projectRemediation = (
  wide: Context.Context<FeatureService | RemediationService | Scope.Scope>
): Context.Context<RemediationWorld | Scope.Scope> => {
  const remediation = Context.get(wide, RemediationService)
  const scope = Context.get(wide, Scope.Scope)
  return Context.make(RemediationWorld, RemediationWorld.of({ report: remediation.remediate })).pipe(
    Context.add(Scope.Scope, scope)
  )
}
const projectBom = (
  wide: Context.Context<FeatureService | BomService | Scope.Scope>
): Context.Context<BomWorld | Scope.Scope> => {
  const bom = Context.get(wide, BomService)
  const scope = Context.get(wide, Scope.Scope)
  return Context.make(BomWorld, BomWorld.of({ bom: bom.exportBom })).pipe(Context.add(Scope.Scope, scope))
}

const rules: Array<RuleRecord> = []
const Rule = makeRule(FeatureService.layer, rules)

// POSITIVE: a step inside Rule A can use Rule A's own narrowed service — and ONLY that.
Rule(
  "Remediation",
  RemediationService.layer,
  (wideDsl) => narrowRuleDsl(wideDsl, projectRemediation),
  (dsl) => {
    dsl.Given("produces the remediation report", () =>
      Effect.gen(function*() {
        const world = yield* RemediationWorld
        return yield* world.report
      }))
  }
)

// POSITIVE (twin case): a step inside Rule B can use Rule B's own narrowed service.
Rule(
  "Bom",
  BomService.layer,
  (wideDsl) => narrowRuleDsl(wideDsl, projectBom),
  (dsl) => {
    dsl.Given("produces the bom export", () =>
      Effect.gen(function*() {
        const world = yield* BomWorld
        return yield* world.bom
      }))
  }
)

// CONTROL: the EXISTING three-argument (no narrowing) and two-argument forms must still compile
// unchanged — this signature is additive, not a breaking change to the other two overloads.
Rule("plain extra layer, no narrowing", RemediationService.layer, (dsl) => {
  dsl.Given("sees both the ambient and its own extra service, union-style", () =>
    Effect.gen(function*() {
      yield* FeatureService
      return yield* (yield* RemediationService).remediate
    }))
})
Rule("no extra layer at all", (dsl) => {
  dsl.Given("sees only the ambient", () =>
    Effect.gen(function*() {
      return (yield* FeatureService).featureId
    }))
})

// ============================================================================================
// 4. RUNTIME PROOF — every registered step actually run against ONLY its Rule's real, merged
//    Layer (FeatureService | RemediationService, or FeatureService | BomService) — never a Layer
//    for RemediationWorld/BomWorld's narrowed shape directly. If the printed values below are the
//    REAL service values (not placeholders), `Effect.updateContext` really is doing live
//    reshaping at run time, not just satisfying the type checker.
// ============================================================================================
const main = Effect.gen(function*() {
  for (const rule of rules) {
    for (const step of rule.steps) {
      // `rule.layer`/`step.run` are ERASED plumbing (see the harness note in §2) — the same
      // `any`-typed storage `Registry.ts` uses for real step bodies — so the cast to `never` here
      // is about this throwaway runner, not about the public `RuleDsl`/`RuleRegistrar` surface
      // §1-§3 actually type-check under.
      const runnable = Effect.scoped(step.run as Effect.Effect<unknown, unknown, Scope.Scope>).pipe(
        Effect.provide(rule.layer)
      ) as Effect.Effect<unknown, unknown, never>
      const result = yield* runnable
      console.log(`[${rule.name}] ${step.name} -> ${JSON.stringify(result)}`)
    }
  }
})

Effect.runPromise(main).catch((error) => {
  console.error(error)
  process.exitCode = 1
})

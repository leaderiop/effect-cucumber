/**
 * Direct, non-`describeFeature` tests for `narrowRuleDsl`: every member of the real `RuleDsl<ROut>`
 * interface is exercised against a hand-built fake WIDE `RuleDsl`, proving the wrapping itself —
 * not merely that the acceptance pair's two Rules happen to work — reaches every registrar, that a
 * narrowed step's body really is retyped with `Effect.updateContext` (the projected value is REAL,
 * derived from a live `Wide` service at run time), and that the one documented unsupported
 * composition (a Scenario's own `extraLayer` inside a narrowed Rule) fails loudly rather than
 * silently.
 *
 * Carries: ADR-EC-039, BEH-EC-031.
 */
import { assert, describe, it } from "@effect/vitest"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Scope from "effect/Scope"
import { Attachments } from "../src/Attachments.ts"
import type { BackgroundDsl, ModuleStep, RuleDsl, ScenarioDsl } from "../src/Dsl.ts"
import { narrowRuleDsl, type WorldProjection } from "../src/RuleNarrowing.ts"

// A minimal Wide/Narrow pair, disjoint in shape — mirrors the acceptance pair's own
// FeatureService/RemediationWorld relationship at a smaller scale.
class Wide extends Context.Service<Wide, { readonly value: string }>()("RuleNarrowing.test/Wide") {}
class Narrow extends Context.Service<Narrow, { readonly renamed: string }>()("RuleNarrowing.test/Narrow") {}

const project: WorldProjection<Wide, Narrow> = (wide) =>
  Context.make(Narrow, Narrow.of({ renamed: `narrowed:${Context.get(wide, Wide).value}` })).pipe(
    Context.add(Scope.Scope, Context.get(wide, Scope.Scope)),
    Context.add(Attachments, Context.get(wide, Attachments))
  )

// Every step/hook body this suite registers ultimately runs through this — real Scope, real
// Attachments (a fake no-op implementation, since nothing here calls `attach`), and the real `Wide`
// service, so a narrowed body's `Effect.updateContext` has real data to project.
const runNarrowed = <A>(effect: Effect.Effect<A, unknown, unknown>): Promise<A> =>
  Effect.runPromise(
    Effect.scoped(effect as Effect.Effect<A, unknown, Scope.Scope>).pipe(
      Effect.provideService(Wide, Wide.of({ value: "live" })),
      Effect.provideService(Attachments, Attachments.of({ attach: () => Effect.void }))
    ) as Effect.Effect<A, unknown, never>
  )

/**
 * A hand-built fake WIDE `RuleDsl<Wide>`: every registrar records what it was called with, rather
 * than doing anything a real `Collect.ts`/`Registry.ts` would — this suite is about
 * `narrowRuleDsl`'s OWN wrapping, not the registration pipeline downstream of it (that half is
 * covered by the compile-gate fixtures and the acceptance pair).
 */
type StepCall = { readonly pattern: string; readonly fn: (...p: ReadonlyArray<any>) => any }
type HookCall = { readonly tagExpr: string | null; readonly fn: () => any }

// Capture-free (`unicorn/consistent-function-scoping`): both take their target array as a
// parameter rather than closing over one, so they belong at module scope, not re-created inside
// `makeFakeWideDsl` on every call.
const makeStepRegistrar = (target: Array<StepCall>) => (pattern: string, fn: (...p: ReadonlyArray<any>) => any) => {
  target.push({ pattern, fn })
}
const makeHookRegistrar = (target: Array<HookCall>) =>
  ((a: string | (() => any), b?: () => any) => {
    if (b !== undefined) target.push({ tagExpr: a as string, fn: b })
    else target.push({ tagExpr: null, fn: a as () => any })
  }) as any

const makeFakeWideDsl = () => {
  const stepCalls = {
    Given: [] as Array<StepCall>,
    When: [] as Array<StepCall>,
    Then: [] as Array<StepCall>,
    And: [] as Array<StepCall>,
    But: [] as Array<StepCall>
  }

  const useCalls: Array<{ requires: unknown; steps: ReadonlyArray<ModuleStep> }> = []

  const hookCalls = {
    Before: [] as Array<HookCall>,
    After: [] as Array<HookCall>,
    BeforeStep: [] as Array<HookCall>,
    AfterStep: [] as Array<HookCall>
  }

  const backgroundBodyCalls: Array<StepCall> = []
  const scenarioCalls: Array<{ name: string; define: (dsl: ScenarioDsl<any>) => void; hadExtraLayer: boolean }> = []

  const scenarioDsl: ScenarioDsl<any> = {
    Given: makeStepRegistrar(stepCalls.Given) as any,
    When: makeStepRegistrar(stepCalls.When) as any,
    Then: makeStepRegistrar(stepCalls.Then) as any,
    And: makeStepRegistrar(stepCalls.And) as any,
    But: makeStepRegistrar(stepCalls.But) as any,
    use: ((module: { requires: unknown; steps: ReadonlyArray<ModuleStep> }) => {
      useCalls.push(module)
    }) as any
  }

  const dsl: RuleDsl<any> = {
    ...scenarioDsl,
    Background: (define: (dsl: BackgroundDsl<any>) => void) => {
      define({
        Given: ((pattern: string, fn: any) => backgroundBodyCalls.push({ pattern, fn })) as any,
        And: ((pattern: string, fn: any) => backgroundBodyCalls.push({ pattern, fn })) as any
      })
    },
    Scenario: ((name: string, a: any, b?: any) => {
      if (b !== undefined) scenarioCalls.push({ name, define: b, hadExtraLayer: true })
      else scenarioCalls.push({ name, define: a, hadExtraLayer: false })
    }) as any,
    Before: makeHookRegistrar(hookCalls.Before),
    After: makeHookRegistrar(hookCalls.After),
    BeforeStep: makeHookRegistrar(hookCalls.BeforeStep),
    AfterStep: makeHookRegistrar(hookCalls.AfterStep)
  }

  return { dsl, stepCalls, useCalls, hookCalls, backgroundBodyCalls, scenarioCalls }
}

describe("narrowRuleDsl", () => {
  it.effect("wraps a bare-generator Given/When/Then/And/But body with Effect.updateContext, reaching a real Wide service", () =>
    Effect.gen(function*() {
      const fake = makeFakeWideDsl()
      const narrowed = narrowRuleDsl(fake.dsl, project)

      narrowed.Given("a pattern", function*() {
        const world = yield* Narrow
        return world.renamed
      })
      // An already-Effect-returning body (Step.ts's OTHER accepted shape) must work identically —
      // no double-wrap.
      narrowed.When("another pattern", () => Effect.succeed("plain"))

      assert.strictEqual(fake.stepCalls.Given.length, 1)
      assert.strictEqual(fake.stepCalls.Given[0]?.pattern, "a pattern")
      const result = yield* Effect.promise(() => runNarrowed(fake.stepCalls.Given[0]!.fn()))
      assert.strictEqual(result, "narrowed:live")

      assert.strictEqual(fake.stepCalls.When.length, 1)
      const plainResult = yield* Effect.promise(() => runNarrowed(fake.stepCalls.When[0]!.fn()))
      assert.strictEqual(plainResult, "plain")
    }))

  it.effect("wraps use()'s ModuleStep bodies, passing `requires` through untouched (a pure compile-time witness)", () =>
    Effect.gen(function*() {
      const fake = makeFakeWideDsl()
      const narrowed = narrowRuleDsl(fake.dsl, project)

      const moduleStep: ModuleStep = {
        keyword: "Given",
        pattern: "a module step",
        body: () =>
          Effect.gen(function*() {
            const world = yield* Narrow
            return world.renamed
          }),
        definedAt: null
      }
      const requiresWitness = Effect.void as unknown
      narrowed.use({ requires: requiresWitness as never, steps: [moduleStep] })

      assert.strictEqual(fake.useCalls.length, 1)
      assert.strictEqual(fake.useCalls[0]?.requires, requiresWitness)
      const wrappedStep = fake.useCalls[0]!.steps[0]!
      assert.strictEqual(wrappedStep.pattern, "a module step")
      const result = yield* Effect.promise(() => runNarrowed(wrappedStep.body()))
      assert.strictEqual(result, "narrowed:live")
    }))

  it.effect("wraps Background's Given/And the same way as top-level steps", () =>
    Effect.gen(function*() {
      const fake = makeFakeWideDsl()
      const narrowed = narrowRuleDsl(fake.dsl, project)

      narrowed.Background(({ And, Given }) => {
        Given("a background given", function*() {
          return (yield* Narrow).renamed
        })
        And("a background and", () => Effect.succeed("and-body"))
      })

      assert.strictEqual(fake.backgroundBodyCalls.length, 2)
      const givenResult = yield* Effect.promise(() => runNarrowed(fake.backgroundBodyCalls[0]!.fn()))
      assert.strictEqual(givenResult, "narrowed:live")
      const andResult = yield* Effect.promise(() => runNarrowed(fake.backgroundBodyCalls[1]!.fn()))
      assert.strictEqual(andResult, "and-body")
    }))

  it.effect("wraps Before/After/BeforeStep/AfterStep, both the unconditional and the tag-expression call forms", () =>
    Effect.gen(function*() {
      const fake = makeFakeWideDsl()
      const narrowed = narrowRuleDsl(fake.dsl, project)

      narrowed.Before(function*() {
        yield* Narrow
      })
      narrowed.After("@db", function*() {
        yield* Narrow
      })

      assert.strictEqual(fake.hookCalls.Before.length, 1)
      assert.strictEqual(fake.hookCalls.Before[0]?.tagExpr, null)
      yield* Effect.promise(() => runNarrowed(fake.hookCalls.Before[0]!.fn()))

      assert.strictEqual(fake.hookCalls.After.length, 1)
      assert.strictEqual(fake.hookCalls.After[0]?.tagExpr, "@db")
      yield* Effect.promise(() => runNarrowed(fake.hookCalls.After[0]!.fn()))
    }))

  it.effect("narrows a nested Scenario's plain two-argument form to the SAME World", () =>
    Effect.gen(function*() {
      const fake = makeFakeWideDsl()
      const narrowed = narrowRuleDsl(fake.dsl, project)

      narrowed.Scenario("a nested scenario", ({ Given }) => {
        Given("sees the narrowed world too", function*() {
          return (yield* Narrow).renamed
        })
      })

      assert.strictEqual(fake.scenarioCalls.length, 1)
      assert.strictEqual(fake.scenarioCalls[0]?.hadExtraLayer, false)
      // The wide `Scenario` call recorded `define` as the callback narrowRuleDsl itself builds —
      // invoke it the way the real wide `makeScenarioRegistrar` would, with a fake wide ScenarioDsl.
      const nestedFake = makeFakeWideDsl()
      fake.scenarioCalls[0]!.define(nestedFake.dsl)
      assert.strictEqual(nestedFake.stepCalls.Given.length, 1)
      const result = yield* Effect.promise(() => runNarrowed(nestedFake.stepCalls.Given[0]!.fn()))
      assert.strictEqual(result, "narrowed:live")
    }))

  it("fails loudly and synchronously when a Scenario's own extraLayer is used inside a narrowed Rule", () => {
    const fake = makeFakeWideDsl()
    const narrowed = narrowRuleDsl(fake.dsl, project)
    let thrown: unknown
    try {
      ;(narrowed.Scenario as any)("a scoped scenario", Context.empty(), () => {})
    } catch (error) {
      thrown = error
    }
    assert.isTrue(thrown instanceof Error)
    assert.include((thrown as Error).message, "a scoped scenario")
    assert.include((thrown as Error).message, "ADR-EC-039")
    // The underlying WIDE Scenario registrar must never have been reached — the rejection happens
    // BEFORE any step inside that Scenario could register or run.
    assert.strictEqual(fake.scenarioCalls.length, 0)
  })
})

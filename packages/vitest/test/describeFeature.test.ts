/**
 * `describeFeature`'s runtime contract, asserted through `collectFeature`.
 *
 * `describeFeature` returns `void` by contract, so there is nothing for a test to look at, and
 * calling it here for real would emit this repo's own suite a second copy of every Scenario in the
 * fixture. `collectFeature` runs the identical Register and Plan stages with the result handed back
 * instead of emitted, and it is what everything below asserts against.
 *
 * The end-to-end proof that `describeFeature` actually EMITS what it collects lives in
 * `test/emission.test.ts`, which is the only file in this repo that calls it for real. The terminal
 * warning channel is asserted there too, in a file that can isolate the stub — deliberately not
 * here.
 *
 * Four of these assertions are written more strictly than they look like they need to be, because
 * the defects they exist to catch are all silent — the broken implementation compiles, type-checks,
 * lints, and leaves every other test in this repo green:
 *
 * - **Per-call registry freshness** is asserted by reference inequality AND by cross-contamination.
 *   The reference check alone proves almost nothing: a `createRegistry` call hoisted to module scope
 *   still returns a fresh `definitions()` snapshot array on every call, so `not.toBe` passes against
 *   the exact defect it looks like it is guarding. The second test — register into the first call,
 *   observe the second call is empty — is the one that actually discriminates, and is the one the
 *   hoist mutation fails.
 * - **The merge direction (D-04)** is asserted by RESOLVING the colliding service, not by inspecting
 *   the merged Layer's shape. `Layer.merge(shared, perScenario)` and `Layer.merge(perScenario,
 *   shared)` have the identical type and the identical structure; only running them tells the two
 *   apart, and swapping the arguments silently inverts the rule ADR-EC-006 asks for.
 * - **The `finally` pop** is asserted by registering a step AFTER a `Scenario` callback throws, with
 *   the throw caught inside the define callback so collection continues. Without the `finally`, the
 *   scenario frame stays on the stack and that later step is attributed to the scenario — a
 *   misattribution nothing else in the repo can see.
 * - **Synchronous define** is asserted on the line immediately after `collectFeature` returns, with
 *   no await and no tick. An async define callback would leave the flag false there while every
 *   content assertion in this file still passed, because there would simply be no steps to disagree
 *   about (PITFALLS #2).
 * - **The definition site (D-03)** is asserted against a HARD-CODED line number in this file. Every
 *   weaker check — "is not null", "has a numeric line", "names a `.ts` file" — passes against a
 *   registrar that captures its own frame inside `src/describeFeature.ts`, which is the actual
 *   defect and the one nothing else in the repo can see.
 *
 * Mutation-tested (all six performed, then reverted, all six confirmed failing) — see the plan
 * summary for the recorded output:
 * - A. `createRegistry` hoisted to module scope → the cross-contamination test fails.
 * - B. `Layer.merge`'s two arguments swapped → the D-04 test fails.
 * - C. `registrar` passes `null` instead of `captureCallSite()` → the end-to-end `definedAt` test
 *      fails.
 * - D. `describeFeature` calls `collect` but never hands the result to the emission stage → nothing
 *      in THIS file notices, because `collectFeature` is unchanged by that mutation; the end-to-end
 *      test in `test/emission.test.ts` reports zero tests and fails. Recorded here because it is the
 *      defect this file structurally cannot see, and a reader who assumed otherwise would stop
 *      looking.
 * - E. `hookRegistry` hoisted to module scope → the two-collections hook isolation test fails.
 * - F. the six hook members spread into `scenarioDsl` instead of left as `dsl` siblings → the
 *      Scenario-callback-has-no-`Before`-key assertion fails.
 *
 * ## The `ParsedFeature` argument
 *
 * Parsed from an inline source with `@effect-cucumber/gherkin`'s own `parseFeature`, never
 * fabricated with a type assertion. `describeFeature` reads only `.name` today, so a cast would
 * compile and would keep compiling after the argument type changes underneath it — the assertion
 * would go on passing while proving nothing about the contract that actually crosses the package
 * boundary.
 *
 * ## `expect` in the sync tests, `assert` inside every `it.effect`
 *
 * Same reason as `test/Step.test.ts`: oxlint's `vitest/no-standalone-expect` does not recognise
 * `it.effect` as a test block, so an `expect` nested in the `Effect.gen` body it takes fails
 * `pnpm lint`. Do not "make them consistent".
 *
 * ## Imports
 *
 * `../src/describeFeature.ts` directly, never `../src/index.ts`:
 * `effect/no-import-from-barrel-package` runs with `checkRelativeIndexImports: true` and fails
 * `pnpm lint` on a relative value-import whose basename is `index.*`. `collectFeature` is not in
 * that barrel anyway (describeFeature.ts's closing note).
 */
import { ParameterTypeStore, parseFeature } from "@effect-cucumber/gherkin"
import { assert, describe, expect, it } from "@effect/vitest"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { collectFeature, type FeatureCollection } from "../src/describeFeature.ts"
import type { ScenarioDsl } from "../src/Dsl.ts"

/**
 * A service both candidate Layers below provide, carrying a value that says which one built it.
 *
 * An object rather than a bare string, so a passthrough of the wrong Layer cannot masquerade as the
 * right one through structural sameness — the two implementations differ in a field that is read.
 */
class Marker extends Context.Service<Marker, { readonly who: string }>()("Marker") {}

const sharedMarker = Layer.succeed(Marker, Marker.of({ who: "shared" }))
const perScenarioMarker = Layer.succeed(Marker, Marker.of({ who: "perScenario" }))

/**
 * The Feature argument. Only `.name` is read today, but it is a real parsed value — see the header.
 *
 * `parseFeature` requires `ParameterTypeStore` and nothing else (ADR-EC-023), and a
 * `Layer.succeed`-backed service is `runSync`-safe, so this resolves at module scope with no await.
 */
const feature = Effect.runSync(
  parseFeature(
    `Feature: Checkout
  Background:
    Given the cart is empty

  Scenario: checkout
    When I pay
    Then I am charged
`,
    "test/describeFeature.feature"
  ).pipe(Effect.provide(ParameterTypeStore.Default))
)

/** A step body that touches no service, so it registers against any ambient Layer including empty. */
const noop = function*() {
  yield* Effect.void
}

/**
 * Read the ambient `Marker` back out of a collected Layer — the only way to observe D-03/D-04.
 *
 * The error channel is `unknown` rather than `never` because `FeatureCollection.layer` erases the
 * two overloads' `E1`/`E2` (describeFeature.ts's `LayerArgument` note). A Layer that fails to build
 * would surface here as a test failure, which is the right outcome; narrowing it would need a cast.
 */
const whoProvides = (collected: FeatureCollection): Effect.Effect<string, unknown> =>
  Effect.provide(
    Effect.gen(function*() {
      return (yield* Marker).who
    }),
    collected.layer
  )

/** ONE define callback, reused across two calls, so the calls differ in nothing but being two. */
const registerOneStep = (dsl: ScenarioDsl<never>): void => {
  dsl.Given("a step", noop)
}

const scopeOf = (collected: FeatureCollection, pattern: string) =>
  collected.definitions.find((definition) => definition.pattern === pattern)?.scope

const keywordOf = (collected: FeatureCollection, pattern: string) =>
  collected.definitions.find((definition) => definition.pattern === pattern)?.keyword

describe("each describeFeature call collects into its own registry", () => {
  it("hands back two different definitions arrays for two calls with the same define callback", () => {
    const first = collectFeature(feature, Layer.empty, registerOneStep)
    const second = collectFeature(feature, Layer.empty, registerOneStep)

    // Reference inequality, and note how little it proves on its own: `definitions()` returns a
    // fresh snapshot copy every time (Registry.ts note (b)), so a `createRegistry` call hoisted to
    // module scope — the actual defect — passes this line. The next test is the discriminating one.
    expect(first.definitions).not.toBe(second.definitions)
  })

  it("leaves the second call empty when only the first call registers a step", () => {
    const first = collectFeature(feature, Layer.empty, ({ Given }) => {
      Given("a step registered by the first call only", noop)
    })
    const second = collectFeature(feature, Layer.empty, () => {})

    // THE load-bearing freshness assertion, and the one mutation A fails: a module-scope registry
    // carries the first call's step into the second, making this length 1.
    expect(first.definitions).toHaveLength(1)
    expect(second.definitions).toHaveLength(0)
  })
})

describe("a step definition carries the container it was registered inside", () => {
  it("attributes feature-level, Background and Scenario steps to their own scopes", () => {
    const collected = collectFeature(feature, Layer.empty, ({ Background, Given, Scenario }) => {
      Given("a feature-level step", noop)

      Background(({ And, Given: BackgroundGiven }) => {
        BackgroundGiven("a background given", noop)
        And("a background and", noop)
      })

      Scenario("checkout", ({ When }) => {
        When("a scenario step", noop)
      })

      // Registered AFTER the Scenario block closes. If either container forgot to pop, this one is
      // attributed to the scenario instead of the feature root, and the last assertion below fails.
      Given("a step back at the feature root", noop)
    })

    expect(scopeOf(collected, "a feature-level step")).toEqual({ kind: "feature", name: "Checkout" })
    // A Background has no name of its own — `null`, not the feature's name and not undefined.
    expect(scopeOf(collected, "a background given")).toEqual({ kind: "background", name: null })
    expect(scopeOf(collected, "a background and")).toEqual({ kind: "background", name: null })
    expect(scopeOf(collected, "a scenario step")).toEqual({ kind: "scenario", name: "checkout" })
    expect(scopeOf(collected, "a step back at the feature root")).toEqual({ kind: "feature", name: "Checkout" })
  })

  it("records the keyword the author wrote rather than the one it continues", () => {
    const collected = collectFeature(feature, Layer.empty, ({ Background }) => {
      Background(({ And, Given }) => {
        Given("a background given", noop)
        And("a background and", noop)
      })
    })

    // An `And` continues the preceding `Given` at MATCH time; rewriting it to "Given" here would
    // erase what the author wrote and make the two definitions indistinguishable.
    expect(keywordOf(collected, "a background given")).toBe("Given")
    expect(keywordOf(collected, "a background and")).toBe("And")
  })

  it("returns to the feature root after a Scenario callback throws", () => {
    const collected = collectFeature(feature, Layer.empty, ({ Given, Scenario }) => {
      try {
        Scenario("explodes", () => {
          throw new Error("the define callback for this scenario threw")
        })
      } catch {
        // Swallowed HERE, inside the define callback, so collection continues and the next
        // registration can be observed. The point is not that the throw is survivable — it is that
        // the scope stack is balanced when it happens.
      }

      Given("a step after the throw", noop)
    })

    // Without the `finally` around popScope, the "explodes" frame is still on the stack and this
    // step is attributed to a scenario the author never put it in.
    expect(scopeOf(collected, "a step after the throw")).toEqual({ kind: "feature", name: "Checkout" })
  })

  it("returns to the feature root after a Background callback throws", () => {
    const collected = collectFeature(feature, Layer.empty, ({ Background, Given }) => {
      try {
        Background(() => {
          throw new Error("the define callback for this background threw")
        })
      } catch {
        // Swallowed HERE, inside the define callback, mirroring the Scenario case above — the
        // point is that Background's identical pushScope/try/finally/popScope structure keeps
        // the scope stack balanced when the callback throws.
      }

      Given("a step after the background throw", noop)
    })

    expect(scopeOf(collected, "a step after the background throw")).toEqual({
      kind: "feature",
      name: "Checkout"
    })
  })
})

describe("a step definition records where its author wrote it", () => {
  it("names this test file and the exact line of the Given call, not a line inside the package", () => {
    // POSITION-SENSITIVE: the literal below is the real line number of the `Given(...)` call two
    // lines further down. Editing anything above this point in the file moves it, and this
    // assertion fails until the literal is updated. That is deliberate — it is exactly what a
    // hoisted, removed or off-by-one capture changes, and nothing weaker can see the difference.
    const givenLine = 262
    const collected = collectFeature(feature, Layer.empty, ({ Given }) => {
      Given("a located step", noop)
    })

    const definedAt = collected.definitions[0]?.definedAt

    // The file half rules out `src/describeFeature.ts` and `src/CallSite.ts`; the line half rules
    // out any other call site in this file. Mutation C fails both.
    expect(definedAt?.file.endsWith("describeFeature.test.ts")).toBe(true)
    expect(definedAt?.line).toBe(givenLine)
  })
})

describe("the define callback runs synchronously", () => {
  it("has already registered its steps by the line after collectFeature returns", () => {
    let ran = false

    const collected = collectFeature(feature, Layer.empty, ({ Given }) => {
      Given("a step", noop)
      ran = true
    })

    // No await, no tick. An async define callback leaves both of these false/empty while nothing
    // else in this file notices, because there would be no steps to disagree about (PITFALLS #2).
    expect(ran).toBe(true)
    expect(collected.definitions).toHaveLength(1)
  })
})

describe("the layer argument normalises to a single Layer", () => {
  it.effect("resolves a service named by both shared and perScenario to perScenario's implementation", () =>
    Effect.gen(function*() {
      const collected = collectFeature(
        feature,
        { shared: sharedMarker, perScenario: perScenarioMarker },
        () => {}
      )

      // D-04, and the assertion mutation B fails. Resolved by RUNNING the Layer: the two merge
      // argument orders produce the same type and the same shape, so nothing short of building the
      // context can tell them apart.
      assert.strictEqual(yield* whoProvides(collected), "perScenario")
    }))

  it.effect("keeps shared's services reachable when perScenario is Layer.empty", () =>
    Effect.gen(function*() {
      // D-03: `perScenario` is REQUIRED even for a Feature with no per-Scenario-fresh state.
      // `Layer.empty` is `Layer<never>`, so the union collapses and `shared` stays reachable.
      const collected = collectFeature(feature, { shared: sharedMarker, perScenario: Layer.empty }, () => {})

      assert.strictEqual(yield* whoProvides(collected), "shared")
    }))

  it.effect("passes a plain Layer through unchanged", () =>
    Effect.gen(function*() {
      const collected = collectFeature(feature, sharedMarker, () => {})

      assert.strictEqual(yield* whoProvides(collected), "shared")
    }))
})

/**
 * The `_tag` of each planned step, in order.
 *
 * Destructured rather than read as `planned._tag`, because oxlint's `no-underscore-dangle` rejects
 * member access on a leading-underscore property while permitting object destructuring —
 * `test/Plan.test.ts` and `src/ScenarioEffect.ts` carry the same workaround for the same rule.
 *
 * Declared HERE, below every other test in this file, rather than beside `scopeOf`/`keywordOf` up
 * top: the `definedAt` assertion above hard-codes its own line number, so anything inserted before
 * it silently invalidates that literal. Position is load-bearing in this file.
 */
const tagsOf = (steps: ReadonlyArray<{ readonly _tag: string }>): ReadonlyArray<string> => steps.map(({ _tag }) => _tag)

describe("the collection carries the plan the definitions were joined into", () => {
  it("resolves every step of the fixture Scenario when all three patterns are registered", () => {
    const collected = collectFeature(feature, Layer.empty, ({ Given, Then, When }) => {
      Given("the cart is empty", noop)
      When("I pay", noop)
      Then("I am charged", noop)
    })

    // One `ScenarioPlan` per Pickle, and the Background step is ALREADY the leading entry of the
    // Scenario's own step list — `Correlate.ts` stacked it there, so a plan with two steps here
    // would mean the Background was dropped somewhere between parse and plan.
    expect(collected.plan.scenarios).toHaveLength(1)
    expect(collected.plan.scenarios[0]?.name).toBe("checkout")
    expect(tagsOf(collected.plan.scenarios[0]?.steps ?? [])).toEqual(["Resolved", "Resolved", "Resolved"])

    // Every pattern matched something, so channel 3 is empty. Asserted as well as the positive case:
    // a plan that resolved every step while ALSO reporting all three patterns unused would be
    // internally contradictory, and only this line can see it.
    expect(collected.plan.warnings).toHaveLength(0)
  })

  it("names an unused pattern in plan.warnings, with its keyword and its definition site", () => {
    const collected = collectFeature(feature, Layer.empty, ({ Given, Then, When }) => {
      Given("the cart is empty", noop)
      When("I pay", noop)
      Then("I am charged", noop)
      // Matches no step in the fixture Feature. MATCH-05, D-02 channel 3.
      Given("a pattern nothing in this Feature says", noop)
    })

    expect(collected.plan.warnings).toHaveLength(1)

    const warning = collected.plan.warnings[0]
    expect(warning?.pattern).toBe("a pattern nothing in this Feature says")
    expect(warning?.keyword).toBe("Given")
    expect(warning?.featureName).toBe("Checkout")

    // The MESSAGE, not just the fields: it is the string `describeFeature` hands the terminal
    // channel verbatim, so what a developer reads and what a tool inspects are one value. A
    // rebuilt message on the terminal side would let the two drift, which is the mutation
    // `test/emission.test.ts` records as B.
    expect(warning?.message).toContain("a pattern nothing in this Feature says")
    expect(warning?.message).toContain("describeFeature.test.ts")

    // The three USED patterns are absent from the warnings, which is what separates "reports the
    // unused one" from "reports every registration".
    expect(collected.plan.warnings.map((each) => each.pattern)).toEqual([
      "a pattern nothing in this Feature says"
    ])
  })

  it("hands collectFeature and describeFeature the same plan, because collect computes it once", () => {
    // `collect` is the shared implementation, and the plan is built inside it rather than in
    // `describeFeature` alone — so two calls with the identical define callback produce structurally
    // identical plans. A plan computed on the emission side only would leave this field missing or
    // stale on everything `collectFeature` returns.
    const first = collectFeature(feature, Layer.empty, registerOneStep)
    const second = collectFeature(feature, Layer.empty, registerOneStep)

    expect(first.plan.warnings.map((each) => each.pattern)).toEqual(["a step"])
    expect(second.plan.warnings.map((each) => each.pattern)).toEqual(["a step"])
    expect(tagsOf(first.plan.scenarios[0]?.steps ?? [])).toEqual(
      tagsOf(second.plan.scenarios[0]?.steps ?? [])
    )
  })
})

describe("the collection carries every registered hook, grouped by kind", () => {
  it("registers all six kinds and lands each one under its own kind", () => {
    const collected = collectFeature(
      feature,
      Layer.empty,
      ({ After, AfterAllScenarios, AfterStep, Before, BeforeAllScenarios, BeforeStep }) => {
        Before(noop)
        After(noop)
        BeforeStep(noop)
        AfterStep(noop)
        BeforeAllScenarios(noop)
        AfterAllScenarios(noop)
      }
    )

    expect(collected.hooks.Before).toHaveLength(1)
    expect(collected.hooks.After).toHaveLength(1)
    expect(collected.hooks.BeforeStep).toHaveLength(1)
    expect(collected.hooks.AfterStep).toHaveLength(1)
    expect(collected.hooks.BeforeAllScenarios).toHaveLength(1)
    expect(collected.hooks.AfterAllScenarios).toHaveLength(1)
  })

  it("keeps two Before hooks in registration order (D-01), by reference identity", () => {
    // Already-wrapped bodies, not bare generators: `registerHook` returns an already-wrapped body
    // BY IDENTITY (it delegates to `Step.ts`'s `register`), so each of these two survives
    // registration as the exact same reference — which is what lets this assertion discriminate on
    // ORDER rather than merely on length. Two bare generators would each be wrapped into a NEW
    // function, and reference identity would prove nothing.
    const first = Effect.fn("first Before")(function*() {
      yield* Effect.void
    })
    const second = Effect.fn("second Before")(function*() {
      yield* Effect.void
    })

    const collected = collectFeature(feature, Layer.empty, ({ Before }) => {
      Before(first)
      Before(second)
    })

    // THE load-bearing order assertion — reference identity in position, not just a length-2 check.
    expect(collected.hooks.Before[0]).toBe(first)
    expect(collected.hooks.Before[1]).toBe(second)
  })

  it("reports an empty array, not an absent key, for a kind nobody registered", () => {
    const collected = collectFeature(feature, Layer.empty, () => {})

    // All six keys present even though nothing was registered — HookSet's own contract.
    expect(collected.hooks).toHaveProperty("Before")
    expect(collected.hooks).toHaveProperty("After")
    expect(collected.hooks).toHaveProperty("BeforeStep")
    expect(collected.hooks).toHaveProperty("AfterStep")
    expect(collected.hooks).toHaveProperty("BeforeAllScenarios")
    expect(collected.hooks).toHaveProperty("AfterAllScenarios")
    expect(collected.hooks.Before).toHaveLength(0)
    expect(collected.hooks.After).toHaveLength(0)
    expect(collected.hooks.BeforeStep).toHaveLength(0)
    expect(collected.hooks.AfterStep).toHaveLength(0)
    expect(collected.hooks.BeforeAllScenarios).toHaveLength(0)
    expect(collected.hooks.AfterAllScenarios).toHaveLength(0)
  })

  it("shares no hook state between two collectFeature calls in one test", () => {
    const first = collectFeature(feature, Layer.empty, ({ Before }) => {
      Before(noop)
    })
    const second = collectFeature(feature, Layer.empty, () => {})

    // THE load-bearing isolation assertion — mutation E fails it. Reference inequality between the
    // two `hooks` objects proves nothing on its own (see the analogous step-registry note above);
    // the second call's Before array being non-empty is the only thing a hoisted hookRegistry
    // cannot hide from.
    expect(first.hooks.Before).toHaveLength(1)
    expect(second.hooks.Before).toHaveLength(0)
  })

  it("reaches collection.hooks by reference identity for an already-Effect.fn-wrapped hook", () => {
    const alreadyWrapped = Effect.fn("my own Before span")(function*() {
      yield* Effect.void
    })

    const collected = collectFeature(feature, Layer.empty, ({ Before }) => {
      Before(alreadyWrapped)
    })

    // The registration path normalises once and does not re-wrap: `registerHook` delegates to
    // `Step.ts`'s `register`, which returns an already-wrapped function BY IDENTITY.
    expect(collected.hooks.Before[0]).toBe(alreadyWrapped)
  })

  it("gives a Scenario callback's dsl no Before key at runtime", () => {
    let scenarioDslKeys: ReadonlyArray<string> = []

    collectFeature(feature, Layer.empty, ({ Scenario }) => {
      Scenario("checkout", (dsl) => {
        scenarioDslKeys = Object.keys(dsl)
      })
    })

    // The type-level half of this claim is covered by Task 1 (HookRegistrar only on FeatureDsl) and
    // by plan 07-03's `@ts-expect-error` fixture. This is the runtime half: mutation F (spreading
    // the six hook members into `scenarioDsl`) makes this assertion fail.
    expect(scenarioDslKeys).not.toContain("Before")
    expect(scenarioDslKeys).not.toContain("After")
    expect(scenarioDslKeys).not.toContain("BeforeStep")
    expect(scenarioDslKeys).not.toContain("AfterStep")
    expect(scenarioDslKeys).not.toContain("BeforeAllScenarios")
    expect(scenarioDslKeys).not.toContain("AfterAllScenarios")
  })
})

/**
 * `describeFeature`'s runtime contract, asserted through `collectFeature`.
 *
 * `describeFeature` returns `void` by contract and emits zero vitest tests in this phase, so there is
 * nothing for a test to look at. `collectFeature` is the same collection with the result handed back
 * instead of discarded, and it is what everything below asserts against.
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
 *
 * Mutation-tested (both performed, then reverted, both confirmed failing) — see the plan summary for
 * the recorded output:
 * - A. `createRegistry` hoisted to module scope → the cross-contamination test fails.
 * - B. `Layer.merge`'s two arguments swapped → the D-04 test fails.
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

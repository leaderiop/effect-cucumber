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
 * - **The two-tier separation (D-04)** is asserted by RESOLVING the colliding service out of EACH
 *   tier, not by inspecting either Layer's shape — a Layer that provides `Marker` and a Layer that
 *   provides `Marker` are indistinguishable statically, so only running them tells them apart. The
 *   pair is what discriminates: the shared tier must resolve to `shared` AND the per-Scenario tier
 *   to `perScenario`, and a collapse of the two into one merged Layer fails the second. What this
 *   file CANNOT see is which implementation a step actually reaches at run time — since nothing
 *   merges the tiers any more, that is a provision-order property of emission, proven by a real run
 *   in `test/emission.test.ts` rather than here (`src/describeFeature.ts` note (d)).
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
 * - B. the layer-argument split reverted to the old collapsing behaviour — `{ shared: null,
 *      perScenario: Layer.merge(layer.shared, layer.perScenario) }` — → both two-tier tests fail.
 *      This REPLACES the pre-Phase-10 mutation ("`Layer.merge`'s two arguments swapped"), which no
 *      longer exists as a possible mutation because no code line merges the tiers at all. It carries
 *      the same claim from the other side: the old mutation asked "does the merge run in the right
 *      order", this one asks "is there a merge at all", and the answer must be no.
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
import * as Exit from "effect/Exit"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
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
 * Read the ambient `Marker` back out of a collection's PER-SCENARIO tier — `FeatureCollection.layer`.
 *
 * That field is the per-Scenario tier alone on both call forms, so this observes exactly one of the
 * two halves D-03/D-04 are about; `whoProvidesShared`, below the tests that need it, is the other.
 *
 * The error channel is `unknown` rather than `never` because `FeatureCollection.layer` erases the
 * two overloads' error channels (describeFeature.ts's `LayerArgument` note). A Layer that fails to build
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

    // `ruleId: null` on every frame: this file's DSL has no `Rule` container yet, so nothing here is
    // nested in one — which is the only thing Registry.ts note (e) lets `null` mean.
    expect(scopeOf(collected, "a feature-level step")).toEqual({
      kind: "feature",
      name: "Checkout",
      ruleId: null
    })
    // A Background has no name of its own — `null`, not the feature's name and not undefined.
    expect(scopeOf(collected, "a background given")).toEqual({ kind: "background", name: null, ruleId: null })
    expect(scopeOf(collected, "a background and")).toEqual({ kind: "background", name: null, ruleId: null })
    expect(scopeOf(collected, "a scenario step")).toEqual({ kind: "scenario", name: "checkout", ruleId: null })
    expect(scopeOf(collected, "a step back at the feature root")).toEqual({
      kind: "feature",
      name: "Checkout",
      ruleId: null
    })
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
    expect(scopeOf(collected, "a step after the throw")).toEqual({
      kind: "feature",
      name: "Checkout",
      ruleId: null
    })
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
      name: "Checkout",
      ruleId: null
    })
  })
})

describe("a step definition records where its author wrote it", () => {
  it("names this test file and the exact line of the Given call, not a line inside the package", () => {
    // POSITION-SENSITIVE: the literal below is the real line number of the `Given(...)` call two
    // lines further down. Editing anything above this point in the file moves it, and this
    // assertion fails until the literal is updated. That is deliberate — it is exactly what a
    // hoisted, removed or off-by-one capture changes, and nothing weaker can see the difference.
    const givenLine = 291
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

  // The `void` return type accepts an `async` callback, so the runtime is what refuses it. Each
  // container is exercised: a guard on `describeFeature` alone would leave a `Scenario` callback
  // that awaits before its `Given` free to drop that step in silence.
  it("throws at collection time when the describeFeature callback returns a Promise", () => {
    // No cast: `void` accepts an async function, which is exactly why the runtime has to refuse it.
    expect(() =>
      collectFeature(feature, Layer.empty, async ({ Given }) => {
        Given("registered too late", noop)
      })
    ).toThrow(
      /describeFeature "[^"]+"'s define callback returned a Promise \(at .*describeFeature\.test\.ts:\d+:\d+\)/
    )
  })

  it("throws at collection time when a Scenario callback returns a Promise", () => {
    expect(() =>
      collectFeature(feature, Layer.empty, ({ Scenario }) => {
        Scenario("a scenario", async () => {})
      })
    ).toThrow(/Scenario "a scenario"'s define callback returned a Promise/)
  })

  it("throws at collection time when a Rule or a Background callback returns a Promise", () => {
    expect(() =>
      collectFeature(ruleFeature, Layer.empty, ({ Rule }) => {
        Rule("members get a discount", async () => {})
      })
    ).toThrow(/Rule "members get a discount"'s define callback returned a Promise/)
    expect(() =>
      collectFeature(feature, Layer.empty, ({ Background }) => {
        Background(async () => {})
      })
    ).toThrow(/Background's define callback returned a Promise/)
  })
})

/**
 * Read the ambient `Marker` back out of a collection's SHARED tier — `whoProvides`'s sibling.
 *
 * It THROWS when there is no shared tier, in the shape `ruleLayerOf` below already uses for the
 * same situation, and the fallback it refuses is the tempting one: `collected.sharedLayer ??
 * collected.layer` would make this function total and would make every assertion using it pass
 * against the PER-SCENARIO tier while claiming something about the shared one.
 */
const whoProvidesShared = (collected: FeatureCollection): Effect.Effect<string, unknown> => {
  const shared = collected.sharedLayer
  if (shared === null) {
    throw new Error("the collection has no sharedLayer: the plain-Layer form was used")
  }
  return Effect.provide(
    Effect.gen(function*() {
      return (yield* Marker).who
    }),
    shared
  )
}

describe("the layer argument separates into two independently provided tiers", () => {
  it.effect("keeps each tier resolving to its own implementation when both name the same service", () =>
    Effect.gen(function*() {
      const collected = collectFeature(
        feature,
        { shared: sharedMarker, perScenario: perScenarioMarker },
        () => {}
      )

      // D-04's collision rule, re-homed rather than deleted. Nothing merges the two tiers any more,
      // so there is no single Layer left to resolve and no argument order left to swap — what the
      // collection can still show is that the two tiers are two SEPARATE values, each carrying its
      // own implementation of the colliding service. Mutation B (below, in the header) collapses
      // them back into one and fails the second of these two assertions.
      //
      // The RUNTIME verdict — which implementation a step actually reaches — is now a PROVISION
      // ORDER property (`src/describeFeature.ts` note (d)): the shared tier is ambient on the
      // emitted test node and the per-Scenario tier is provided inside the Scenario's own Effect, so
      // the inner provision wins. No collection-level assertion can see that, because provision
      // happens at emission and this file emits nothing. `test/emission.test.ts` proves it with a
      // real run (plan 10-03), and that is the only place it can be proven.
      assert.strictEqual(yield* whoProvides(collected), "perScenario")
      assert.strictEqual(yield* whoProvidesShared(collected), "shared")
    }))

  it.effect("keeps shared's services on the shared tier alone when perScenario is Layer.empty", () =>
    Effect.gen(function*() {
      // D-03: `perScenario` is REQUIRED even for a Feature with no per-Scenario-fresh state.
      // `Layer.empty` is `Layer<never>`, and it stays exactly that — the shared half is not folded
      // into it.
      const collected = collectFeature(feature, { shared: sharedMarker, perScenario: Layer.empty }, () => {})

      assert.strictEqual(yield* whoProvidesShared(collected), "shared")

      // The other half of the same claim, and the half that makes it discriminating: the
      // per-Scenario tier provides NO `Marker` at all. A collection that merged the two would
      // satisfy the assertion above and this one would go red — which is precisely the pair that
      // proves the two tiers are genuinely separate values rather than one merged one handed back
      // twice.
      const fromPerScenario = yield* Effect.exit(whoProvides(collected))
      assert.isTrue(Exit.isFailure(fromPerScenario))
    }))

  it.effect("passes a plain Layer through as the per-Scenario tier, unchanged", () =>
    Effect.gen(function*() {
      const collected = collectFeature(feature, sharedMarker, () => {})

      assert.strictEqual(yield* whoProvides(collected), "shared")
    }))

  it("carries a sharedLayer for the object form and null for the plain-Layer form", () => {
    // The field's OWN discriminating claim, and nothing else in this file asserts it. `null` is what
    // the composition root branches on, so a `Layer.empty` in this position — the plausible tidy-up,
    // since it would make the field non-nullable and delete a branch — would silently send every
    // plain-Layer Feature down the shared path.
    const plain = collectFeature(feature, sharedMarker, () => {})
    const object = collectFeature(feature, { shared: sharedMarker, perScenario: perScenarioMarker }, () => {})

    expect(plain.sharedLayer).toBeNull()
    expect(object.sharedLayer).not.toBeNull()
  })
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

/**
 * ## The `Rule` container (08-05a)
 *
 * Everything below is appended at the END of this file on purpose, and must stay there. The
 * `definedAt` test above hard-codes its own line number, so anything inserted ABOVE it silently
 * invalidates that literal — the same reason `tagsOf` is declared where it is.
 *
 * A SECOND parsed Feature, not an edit to the module-scope `feature` constant: every test above
 * depends on that fixture's exact shape (one Scenario, one Background step, no Rules), and adding a
 * `Rule:` block to it would change plan lengths and warning counts in half a dozen unrelated
 * assertions.
 *
 * These assertions are written against `collection.plan` — the plan `collect` itself computed — and
 * never against a hand-built `Plan.ts` fixture. That is the point of them: `Registry.ts`,
 * `HookRegistry.ts` and `Plan.ts` were each given Rule awareness by an earlier plan and each has its
 * own unit tests, but until this one nothing REGISTERED through any of it. A hand-built fixture would
 * re-prove `Plan.ts`'s own tests while leaving the registration path — the only thing 08-05a adds —
 * completely unexercised.
 */
const ruleFeature = Effect.runSync(
  parseFeature(
    `Feature: Discounts
  Rule: members get a discount
    Background:
      Given the member is signed in

    Scenario: member checkout
      When the member pays
      Then the member is charged less

  Rule: guests pay full price
    Scenario: guest checkout
      When the guest pays
      Then the guest is charged full price
`,
    "test/describeFeature-rules.feature"
  ).pipe(Effect.provide(ParameterTypeStore.Default))
)

/**
 * The id the fixture's parser assigned a Rule, looked up by name — the value `resolveRuleId` is
 * expected to have produced for the same name.
 *
 * Throws rather than returning `undefined`: a typo in a Rule name here would otherwise make every
 * `ruleHooks.get(...)` below return `undefined`, and `expect(undefined?.Before).toBeUndefined()`
 * would pass while proving nothing at all.
 */
const ruleIdOf = (name: string): string => {
  const found = ruleFeature.rules.find((rule) => rule.name === name)
  if (found === undefined) {
    throw new Error(`the Rule fixture Feature has no Rule named "${name}"`)
  }
  return found.id
}

const ruleAId = ruleIdOf("members get a discount")
const ruleBId = ruleIdOf("guests pay full price")

/**
 * A service NO Feature-level Layer in this file provides — only a Rule's own `extraLayer` does.
 *
 * A distinct tag from `Marker` rather than a second `Marker` implementation, because the claim under
 * test is REACHABILITY ("the Rule's Layer provides this and the Feature's does not"), not precedence.
 * Precedence between an ambient and an extra Layer is 08-05b's Scenario-form test.
 */
class RuleMarker extends Context.Service<RuleMarker, { readonly who: string }>()("RuleMarker") {}

const ruleAMarker = Layer.succeed(RuleMarker, RuleMarker.of({ who: "rule A" }))

/**
 * The same service, built ON TOP of the Feature's ambient one — `Layer<RuleMarker, never, Marker>`,
 * with a non-`never` `RIn`.
 *
 * This is the only shape that tells `Layer.provideMerge(featureLayer)(extraLayer)` apart from
 * `Layer.merge(featureLayer, extraLayer)`, which is the plausible tidy-up given `normalizeLayer` sits
 * a few dozen lines above the `Rule` container and already uses `merge`. Both combinators make BOTH
 * services reachable when the extra Layer needs nothing, so every assertion using `ruleAMarker`
 * passes under either one; only feeding the ambient Layer's output into the extra Layer's
 * REQUIREMENTS — which is what `provideMerge` does and `merge` does not — makes this one build at
 * all. ADR-EC-010's "`extraLayer` can itself depend on ambient services" is exactly this case.
 */
const ruleAMarkerBuiltOnAmbient = Layer.effect(
  RuleMarker,
  Effect.gen(function*() {
    return RuleMarker.of({ who: `rule A on ${(yield* Marker).who}` })
  })
)

/** Read `Marker` back out of an arbitrary collected Layer — `whoProvides`, without the collection. */
const markerFrom = (layer: Layer.Layer<any, any, never>): Effect.Effect<string, unknown> =>
  Effect.provide(
    Effect.gen(function*() {
      return (yield* Marker).who
    }),
    layer
  )

/** The same, for the Rule-only service. */
const ruleMarkerFrom = (layer: Layer.Layer<any, any, never>): Effect.Effect<string, unknown> =>
  Effect.provide(
    Effect.gen(function*() {
      return (yield* RuleMarker).who
    }),
    layer
  )

/**
 * The `ruleLayers` entry for `ruleId`, or a thrown error naming what was missing.
 *
 * `?? collected.layer` would be the tempting fallback and is exactly wrong: a missing entry would
 * then resolve against the FEATURE's Layer, and the "the Rule's Layer provides the extra service"
 * assertion would report a `Marker` mismatch instead of the absent entry that actually caused it.
 */
const ruleLayerOf = (collected: FeatureCollection, ruleId: string): Layer.Layer<any, any, never> => {
  const found = collected.ruleLayers.get(ruleId)
  if (found === undefined) {
    throw new Error(`the collection has no ruleLayers entry for "${ruleId}"`)
  }
  return found
}

const planFor = (collected: FeatureCollection, name: string) =>
  collected.plan.scenarios.find((scenario) => scenario.name === name)

describe("the Rule container registers against the Rule it names", () => {
  it("gives the two fixture Rules two different ids", () => {
    // The premise every isolation assertion below rests on. `Validate.ts`'s
    // `duplicate-scenario-name-across-rules.feature` makes Rule NAMES a non-key, so if these two ever
    // collided, three-way isolation would be untestable rather than merely broken.
    expect(ruleAId).not.toBe(ruleBId)
  })

  it("keeps a Rule-scoped Before out of the Feature's hooks and out of the other Rule's", () => {
    // Already-wrapped, so it survives registration BY IDENTITY (`registerHook` delegates to
    // `Step.ts`'s `register`) and the assertion can discriminate on WHICH hook landed where rather
    // than merely on how many did.
    const ruleABefore = Effect.fn("rule A Before")(function*() {
      yield* Effect.void
    })

    const collected = collectFeature(ruleFeature, Layer.empty, ({ Rule }) => {
      Rule("members get a discount", Layer.empty, ({ Before }) => {
        Before(ruleABefore)
      })
      Rule("guests pay full price", Layer.empty, () => {})
    })

    // THE three-way isolation proof, and all three arms are load-bearing. A `ruleId` dropped on the
    // registration path leaves the hook Feature-level, where it would run for every Scenario in the
    // document including rule B's; a `ruleId` resolved by name-equality rather than by id would put
    // it in both Rules at once. Neither defect produces a type error.
    expect(collected.ruleHooks.get(ruleAId)?.Before).toHaveLength(1)
    expect(collected.ruleHooks.get(ruleAId)?.Before[0]).toBe(ruleABefore)
    expect(collected.hooks.Before).toHaveLength(0)
    expect(collected.ruleHooks.get(ruleBId)?.Before).toHaveLength(0)
  })

  it("gives a Rule that registered no hook an all-empty HookSet rather than no entry", () => {
    const collected = collectFeature(ruleFeature, Layer.empty, ({ Rule }) => {
      Rule("guests pay full price", Layer.empty, () => {})
    })

    // Keyed off `ruleLayers`, so every Rule the author actually called gets an entry — a consumer
    // never has to tell "this Rule registered no hooks" apart from "there is no such Rule".
    expect(collected.ruleHooks.has(ruleBId)).toBe(true)
    expect(collected.ruleHooks.get(ruleBId)?.Before).toHaveLength(0)
    expect(collected.ruleHooks.get(ruleBId)?.After).toHaveLength(0)
    // Never called, so never keyed.
    expect(collected.ruleHooks.has(ruleAId)).toBe(false)
  })

  it("keeps a Feature-level Before out of every Rule's hooks", () => {
    const collected = collectFeature(ruleFeature, Layer.empty, ({ Before, Rule }) => {
      Before(noop)
      Rule("members get a discount", Layer.empty, () => {})
    })

    // The other direction of the same filter: `hooks` keeps what `ruleHooks` must not take, and a
    // filter written as `!== ruleId` on both sides would put this one in both places.
    expect(collected.hooks.Before).toHaveLength(1)
    expect(collected.ruleHooks.get(ruleAId)?.Before).toHaveLength(0)
  })
})

describe("a Rule's extra Layer merges onto the Feature's without joining it", () => {
  it.effect("the two-argument form keeps the Feature's ambient Layer as the Rule's own", () =>
    Effect.gen(function*() {
      const collected = collectFeature(ruleFeature, sharedMarker, ({ Rule }) => {
        Rule("members get a discount", ({ Before }) => {
          Before(noop)
        })
      })

      // Registered like any Rule — keyed, hooks attached — and its Layer is the ambient one itself,
      // not a merge of nothing onto it: same reference, same service.
      assert.strictEqual(collected.ruleLayers.get(ruleAId), collected.layer)
      assert.strictEqual(collected.ruleHooks.get(ruleAId)?.Before.length, 1)
      assert.strictEqual(yield* markerFrom(ruleLayerOf(collected, ruleAId)), "shared")
    }))

  it.effect("provides both the Feature's ambient service and the Rule's own from the Rule's Layer", () =>
    Effect.gen(function*() {
      const collected = collectFeature(ruleFeature, sharedMarker, ({ Rule }) => {
        Rule("members get a discount", ruleAMarker, () => {})
      })

      const ruleLayer = ruleLayerOf(collected, ruleAId)

      // BOTH, from one Layer — `Layer.provideMerge` keeps the dependency's services reachable, which
      // is the half `Layer.provide` would drop and the reason ADR-EC-010 names this combinator.
      assert.strictEqual(yield* markerFrom(ruleLayer), "shared")
      assert.strictEqual(yield* ruleMarkerFrom(ruleLayer), "rule A")
    }))

  it.effect("leaves the Feature's own Layer unable to provide the Rule's extra service", () =>
    Effect.gen(function*() {
      const collected = collectFeature(ruleFeature, sharedMarker, ({ Rule }) => {
        Rule("members get a discount", ruleAMarker, () => {})
      })

      // The isolation half, and the one that makes INV-EC-005 more than a compile-time convention:
      // folding every Rule's extra Layer into `collection.layer` would make this resolve, and a step
      // that only type-checks inside the Rule would also RUN fine outside it.
      const outside = yield* Effect.exit(ruleMarkerFrom(collected.layer))
      assert.isTrue(Exit.isFailure(outside))

      // …while the Feature's own service is still reachable from it, so the assertion above is about
      // the extra service and not about a Layer that provides nothing at all.
      assert.strictEqual(yield* markerFrom(collected.layer), "shared")
    }))

  it.effect("builds a Rule Layer whose own requirements the Feature's ambient Layer satisfies", () =>
    Effect.gen(function*() {
      const collected = collectFeature(ruleFeature, sharedMarker, ({ Rule }) => {
        Rule("members get a discount", ruleAMarkerBuiltOnAmbient, () => {})
      })

      // THE combinator assertion. `Layer.merge(featureLayer, extraLayer)` composes the two side by
      // side and satisfies nothing, so this Layer's `Marker` requirement stays unmet and the build
      // dies — while every other Layer assertion in this file goes on passing, because their extra
      // Layers need nothing. Resolved by RUNNING it, for the same reason the D-04 merge-direction
      // test above is: the two combinators produce indistinguishable static shapes here.
      assert.strictEqual(yield* ruleMarkerFrom(ruleLayerOf(collected, ruleAId)), "rule A on shared")
    }))

  it("keys ruleLayers by the same id ruleHooks uses", () => {
    const collected = collectFeature(ruleFeature, Layer.empty, ({ Rule }) => {
      Rule("members get a discount", Layer.empty, ({ Before }) => {
        Before(noop)
      })
    })

    // 08-05b and 08-07 both look a Rule up in both maps with one id — two key schemes would make
    // every Scenario in a Rule get either its Layer or its hooks, never both.
    expect([...collected.ruleLayers.keys()]).toEqual([ruleAId])
    expect([...collected.ruleHooks.keys()]).toEqual([ruleAId])
  })
})

describe("a step registered inside a Rule resolves for that Rule's Scenarios only", () => {
  it("resolves every step of the Rule's Scenario from rule-scope registrations", () => {
    const collected = collectFeature(ruleFeature, Layer.empty, ({ Rule }) => {
      Rule("members get a discount", Layer.empty, ({ Given, Then, When }) => {
        // Siblings of this Rule's own containers, reaching the spread `...scenarioDsl` registrars —
        // which read `registry.currentScope()` at call time and so land at `"rule"` scope.
        Given("the member is signed in", noop)
        When("the member pays", noop)
        Then("the member is charged less", noop)
      })
    })

    // End to end through `collect`'s own `planFeature` call: this is what proves 08-01's `isVisibleTo`
    // `"rule"` arm against a REAL registration rather than a hand-built `StepDefinition`.
    expect(tagsOf(planFor(collected, "member checkout")?.steps ?? [])).toEqual([
      "Resolved",
      "Resolved",
      "Resolved"
    ])
  })

  it("resolves nothing in a different Rule's Scenario from the same registrations", () => {
    const collected = collectFeature(ruleFeature, Layer.empty, ({ Rule }) => {
      Rule("members get a discount", Layer.empty, ({ Then, When }) => {
        // Deliberately worded to match rule B's steps too, so only the `ruleId` can keep them apart.
        When("the guest pays", noop)
        Then("the guest is charged full price", noop)
      })
    })

    // Rule A's registrations match rule B's step TEXT exactly and are still invisible to it. A
    // `ruleId` compared by Rule NAME, or left `null`, makes both of these "Resolved".
    expect(tagsOf(planFor(collected, "guest checkout")?.steps ?? [])).toEqual([
      "Unresolved",
      "Unresolved"
    ])
  })

  it("resolves a rule-background step from that Rule's own Background (D-04)", () => {
    const collected = collectFeature(ruleFeature, Layer.empty, ({ Rule }) => {
      Rule("members get a discount", Layer.empty, ({ Background, Then, When }) => {
        Background(({ Given }) => {
          Given("the member is signed in", noop)
        })
        When("the member pays", noop)
        Then("the member is charged less", noop)
      })
    })

    // The Rule's Background step is already the LEADING entry of its Scenario's step list
    // (`Correlate.ts` stacked it there), and it carries `origin: "rule-background"` — which only a
    // `background`-scope definition carrying THIS Rule's id is visible to.
    expect(tagsOf(planFor(collected, "member checkout")?.steps ?? [])).toEqual([
      "Resolved",
      "Resolved",
      "Resolved"
    ])
  })

  it("leaves a rule-background step unresolved when the same pattern sits in the Feature's Background", () => {
    const collected = collectFeature(ruleFeature, Layer.empty, ({ Background, Rule }) => {
      // The FEATURE's Background container — `ruleId: null` — registering the exact pattern the
      // Rule's own Background step says.
      Background(({ Given }) => {
        Given("the member is signed in", noop)
      })
      Rule("members get a discount", Layer.empty, ({ Then, When }) => {
        When("the member pays", noop)
        Then("the member is charged less", noop)
      })
    })

    // The other half of D-04, and the reason `Plan.ts`'s `"background"` arm checks the two origins
    // separately: a Feature-level Background definition blanketing every Rule's Background steps is
    // the same cross-Rule leak the `"rule"` arm exists to prevent.
    expect(tagsOf(planFor(collected, "member checkout")?.steps ?? [])).toEqual([
      "Unresolved",
      "Resolved",
      "Resolved"
    ])
  })

  it("returns to the feature root after a Rule callback throws", () => {
    const collected = collectFeature(ruleFeature, Layer.empty, ({ Given, Rule }) => {
      try {
        Rule("members get a discount", Layer.empty, () => {
          throw new Error("the define callback for this rule threw")
        })
      } catch {
        // Swallowed HERE, inside the define callback, exactly as the Scenario and Background cases
        // above do — the point is that the `"rule"` frame is off the stack when it happens.
      }

      Given("a step after the rule throw", noop)
    })

    const scope = collected.definitions.find((definition) => definition.pattern === "a step after the rule throw")
      ?.scope
    expect(scope).toEqual({ kind: "feature", name: "Discounts", ruleId: null })
  })
})

describe("a Rule naming no Rule in the parsed Feature registers nothing that can ever match", () => {
  it("resolves to zero Scenarios and reports its pattern unused", () => {
    const collected = collectFeature(ruleFeature, Layer.empty, ({ Rule }) => {
      Rule("a name no Rule: block in this Feature uses", Layer.empty, ({ Given, When }) => {
        // Every one of these matches a real step's TEXT somewhere in the fixture — one from each of
        // the three origins a Rule's registrations could otherwise leak into. Only the sentinel
        // `ruleId` keeps them from resolving.
        Given("the member is signed in", noop)
        When("the member pays", noop)
        When("the guest pays", noop)
      })
    })

    // MATCH-05 counts a pattern USED when it was VISIBLE to a step AND matched it (`Plan.ts` note
    // (g)). All three are reported unused, which is the strongest available statement that they were
    // visible to NOTHING — a sentinel that collided with a real Rule's id would leave at least one
    // of them used and this list short.
    expect(collected.plan.warnings.map((each) => each.pattern).toSorted()).toEqual([
      "the guest pays",
      "the member is signed in",
      "the member pays"
    ])

    // And no Scenario anywhere resolved a step from them.
    expect(tagsOf(planFor(collected, "member checkout")?.steps ?? [])).toEqual([
      "Unresolved",
      "Unresolved",
      "Unresolved"
    ])
    expect(tagsOf(planFor(collected, "guest checkout")?.steps ?? [])).toEqual([
      "Unresolved",
      "Unresolved"
    ])
  })

  it("keys the unresolved Rule under a sentinel no real Rule id can equal", () => {
    const collected = collectFeature(ruleFeature, Layer.empty, ({ Rule }) => {
      Rule("a name no Rule: block in this Feature uses", Layer.empty, () => {})
    })

    const keys = [...collected.ruleLayers.keys()]

    // The registration is REAL — it has a Layer and a hook slot like any other — and it is keyed
    // where nothing can reach it. A generator-produced `ParsedRule.id` never contains a colon, which
    // is what makes the sentinel format provably disjoint rather than merely unlikely.
    expect(keys).toEqual(["unregistered-rule:a name no Rule: block in this Feature uses"])
    expect(ruleFeature.rules.map((rule) => rule.id)).not.toContain(keys[0])
    expect(ruleFeature.allScenarios.map((scenario) => Option.getOrNull(scenario.ruleId))).not.toContain(keys[0])
  })
})

/**
 * ## The Scenario-scoped extra Layer (08-05b, D-01's Scenario form)
 *
 * Still appended at the END, for the reason the 08-05a block above states: the `definedAt` test
 * hard-codes its own line number, so nothing may be inserted above it.
 *
 * Both nesting levels now share ONE `makeScenarioRegistrar` factory, so every assertion here is
 * simultaneously a statement about `dsl.Scenario` and about `RuleDsl.Scenario` — that is the point
 * of extracting it. What still differs per call site is the two arguments the factory is handed, and
 * the three-tier test below is the only thing that checks the Rule level got the right ones.
 *
 * Every Layer claim is settled by RESOLVING the merged Layer, never by inspecting its type or its
 * shape — the same reasoning this file's header already records for the D-04 `Layer.merge` case, and
 * it applies with full force to `Layer.provideMerge`'s two argument positions.
 */

/** A service NOTHING in this file provides except a Scenario's own `extraLayer`. */
class ScenarioMarker extends Context.Service<ScenarioMarker, { readonly who: string }>()("ScenarioMarker") {}

const scenarioMarker = Layer.succeed(ScenarioMarker, ScenarioMarker.of({ who: "scenario" }))

/**
 * The Scenario's own service built ON TOP of the enclosing RULE's — `Layer<ScenarioMarker, never,
 * RuleMarker>`, a non-`never` `RIn` naming a service only the Rule provides.
 *
 * THE discriminator for which ambient Layer `makeScenarioRegistrar` was handed inside a `Rule`.
 * `makeScenarioRegistrar(ruleId, featureLayer)` — the plausible defect, since `featureLayer` is in
 * scope at that line too — leaves this Layer's `RuleMarker` requirement unmet and the build dies.
 * Every assertion using the plain `scenarioMarker` above passes under that defect, because a Layer
 * that needs nothing composes onto either ambient.
 */
const scenarioMarkerBuiltOnRule = Layer.effect(
  ScenarioMarker,
  Effect.gen(function*() {
    return ScenarioMarker.of({ who: `scenario on ${(yield* RuleMarker).who}` })
  })
)

/**
 * A SECOND implementation of the ambient `Marker`, for the collision case.
 *
 * Same tag, distinguishable value — the `sharedMarker`/`perScenarioMarker` shape the D-04 test uses,
 * for the identical reason: only a field that is READ can tell two Layers of one service apart.
 */
const scenarioOwnMarker = Layer.succeed(Marker, Marker.of({ who: "scenario's own" }))

/** Read the Scenario-only service back out of a collected Layer. */
const scenarioMarkerFrom = (layer: Layer.Layer<any, any, never>): Effect.Effect<string, unknown> =>
  Effect.provide(
    Effect.gen(function*() {
      return (yield* ScenarioMarker).who
    }),
    layer
  )

/**
 * The composite key `scenarioLayers` is keyed by, REBUILT here rather than imported from the source.
 *
 * `scenarioKey` is module-private in `src/describeFeature.ts`, and reconstructing it is deliberate
 * rather than a workaround: the map is only usable by a consumer that can build the key, so the
 * encoding IS the contract 08-07 gets written against, and a test that asked the implementation for
 * its own key could not notice that encoding changing underneath it. NUL separator and `<feature>`
 * for a Scenario in no Rule, mirroring `packages/gherkin/src/Validate.ts`'s `uniquenessKey`.
 */
const scenarioKeyIn = (ruleId: string | null, name: string): string => `${ruleId ?? "<feature>"}\u0000${name}`

/**
 * The `scenarioLayers` entry, or a thrown error naming the key that was missing.
 *
 * Throws rather than falling back to `collected.layer`, for the reason `ruleLayerOf` above does: a
 * missing entry would otherwise be reported as whatever service assertion ran next, hiding the
 * absent registration that actually caused it.
 */
const scenarioLayerOf = (
  collected: FeatureCollection,
  ruleId: string | null,
  name: string
): Layer.Layer<any, any, never> => {
  const key = scenarioKeyIn(ruleId, name)
  const found = collected.scenarioLayers.get(key)
  if (found === undefined) {
    throw new Error(`the collection has no scenarioLayers entry for ${JSON.stringify(key)}`)
  }
  return found
}

describe("a Scenario's extra Layer merges onto whatever was ambient where it was written", () => {
  it.effect("provides the Feature's ambient service and the Scenario's own, from the Scenario's entry", () =>
    Effect.gen(function*() {
      const collected = collectFeature(feature, sharedMarker, ({ Scenario }) => {
        Scenario("checkout", scenarioMarker, ({ When }) => {
          When("I pay", noop)
        })
      })

      const scenarioLayer = scenarioLayerOf(collected, null, "checkout")

      // BOTH, from one Layer — `provideMerge` keeps the ambient side reachable, which is the half
      // `Layer.provide` would drop and the reason ADR-EC-010 names this combinator.
      assert.strictEqual(yield* markerFrom(scenarioLayer), "shared")
      assert.strictEqual(yield* scenarioMarkerFrom(scenarioLayer), "scenario")
    }))

  it.effect("leaves the Feature's own Layer unable to provide the Scenario's extra service", () =>
    Effect.gen(function*() {
      const collected = collectFeature(feature, sharedMarker, ({ Scenario }) => {
        Scenario("checkout", scenarioMarker, () => {})
      })

      // The isolation half, and the same argument INV-EC-005 makes one level up: folding a
      // Scenario's extra Layer into `collection.layer` would let every OTHER Scenario in the Feature
      // resolve a service only this one asked for.
      const outside = yield* Effect.exit(scenarioMarkerFrom(collected.layer))
      assert.isTrue(Exit.isFailure(outside))

      // …while the Feature's own service is still reachable from it, so the failure above is about
      // the extra service and not about a Layer that provides nothing at all.
      assert.strictEqual(yield* markerFrom(collected.layer), "shared")
    }))

  it("records no entry for the two-argument form, in the same collection that records one", () => {
    const collected = collectFeature(feature, sharedMarker, ({ Scenario }) => {
      Scenario("checkout", scenarioMarker, ({ When }) => {
        When("I pay", noop)
      })
      // The overwhelmingly common form, in the SAME collection, so the two are told apart by the
      // arity check alone rather than by being two different runs. The name is not one the fixture
      // Feature declares, which is itself true to the mechanism: the map is populated at
      // REGISTRATION time and never consults the parsed Feature — unlike `resolveRuleId`, which does.
      Scenario("checkout without a Layer of its own", ({ Then }) => {
        Then("I am charged", noop)
      })
    })

    // Exactly one key, and it is the three-argument call's. An arity check inverted or dropped puts
    // a second key here — the "the common case silently starts carrying a Layer" defect that no
    // Layer assertion in this file could otherwise see.
    expect([...collected.scenarioLayers.keys()]).toEqual([scenarioKeyIn(null, "checkout")])

    // …and the two-argument form still ran its define callback under its OWN scenario scope, so the
    // arity branch did not swallow the callback while suppressing the entry.
    expect(scopeOf(collected, "I am charged")).toEqual({
      kind: "scenario",
      name: "checkout without a Layer of its own",
      ruleId: null
    })
    expect(scopeOf(collected, "I pay")).toEqual({ kind: "scenario", name: "checkout", ruleId: null })
  })

  it.effect("reaches the Feature's, the Rule's and the Scenario's own service from one merged Layer", () =>
    Effect.gen(function*() {
      const collected = collectFeature(ruleFeature, sharedMarker, ({ Rule }) => {
        Rule("members get a discount", ruleAMarker, ({ Scenario }) => {
          Scenario("member checkout", scenarioMarkerBuiltOnRule, ({ When }) => {
            When("the member pays", noop)
          })
        })
      })

      const scenarioLayer = scenarioLayerOf(collected, ruleAId, "member checkout")

      // All three tiers, from ONE Layer: composition NESTS rather than replaces.
      assert.strictEqual(yield* markerFrom(scenarioLayer), "shared")
      assert.strictEqual(yield* ruleMarkerFrom(scenarioLayer), "rule A")

      // "scenario on rule A" and not merely "scenario": this Layer was BUILT from the Rule's own
      // service, so it only builds at all if the ambient Layer handed to the factory inside `Rule`
      // was that Rule's already-merged one. `makeScenarioRegistrar(ruleId, featureLayer)` dies here.
      assert.strictEqual(yield* scenarioMarkerFrom(scenarioLayer), "scenario on rule A")

      // Keyed under the RULE's id, never under `<feature>`: a `ruleId` dropped from the key would
      // make a Rule's Scenario collide with a same-named Feature-level one, which F22 explicitly
      // permits to coexist.
      assert.isFalse(collected.scenarioLayers.has(scenarioKeyIn(null, "member checkout")))
      assert.deepStrictEqual([...collected.scenarioLayers.keys()], [scenarioKeyIn(ruleAId, "member checkout")])
    }))

  it.effect("resolves a service both the Scenario's extra Layer and its ambient name to the Scenario's own", () =>
    Effect.gen(function*() {
      const collected = collectFeature(feature, sharedMarker, ({ Scenario }) => {
        Scenario("checkout", scenarioOwnMarker, () => {})
      })

      // The precedence assertion, and the one a swapped `Layer.provideMerge` argument order fails.
      // Resolved by RUNNING the merged Layer: both orders produce the identical type and the
      // identical shape here, exactly as the D-04 `Layer.merge` case above does, so nothing short of
      // building the context can tell them apart. `sharedMarker` is the ambient one and would
      // resolve to "shared".
      assert.strictEqual(yield* markerFrom(scenarioLayerOf(collected, null, "checkout")), "scenario's own")
    }))

  it("records the entry even when the Scenario's define callback throws, and still pops its scope", () => {
    const collected = collectFeature(feature, sharedMarker, ({ Given, Scenario }) => {
      try {
        Scenario("checkout", scenarioMarker, () => {
          throw new Error("the define callback for this scenario threw")
        })
      } catch {
        // Swallowed HERE, inside the define callback, exactly as the two-argument throw case above
        // does — the point is what survived the throw, not that the throw is survivable.
      }

      Given("a step after the scenario-with-a-Layer threw", noop)
    })

    // The merge and the `set` run BEFORE `pushScope`/`try`, mirroring `Rule`'s own ordering. Moved
    // after the `define` call — the reading order a tidy-up would prefer — this entry is missing,
    // and the Scenario would silently run against a narrower ambient Layer than it asked for.
    expect(collected.scenarioLayers.has(scenarioKeyIn(null, "checkout"))).toBe(true)

    // And the `finally` still pops, so the later step is not re-parented onto the scenario — the
    // same guarantee the two-argument form has had since before this factory existed.
    expect(scopeOf(collected, "a step after the scenario-with-a-Layer threw")).toEqual({
      kind: "feature",
      name: "Checkout",
      ruleId: null
    })
  })
})

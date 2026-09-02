/**
 * `describeFeature`'s runtime contract, asserted through `collectFeature`.
 *
 * Carries: ADR-EC-010, ADR-EC-023, BEH-EC-007, INV-EC-005.
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

// A service both candidate Layers below provide, carrying a value that says which one built it.
class Marker extends Context.Service<Marker, { readonly who: string }>()("Marker") {}

const sharedMarker = Layer.succeed(Marker, Marker.of({ who: "shared" }))
const perScenarioMarker = Layer.succeed(Marker, Marker.of({ who: "perScenario" }))

// The Feature argument.
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

// A step body that touches no service, so it registers against any ambient Layer including empty.
const noop = function*() {
  yield* Effect.void
}

// Read the ambient `Marker` back out of a collection's PER-SCENARIO tier — `FeatureCollection.layer`.
const whoProvides = (collected: FeatureCollection): Effect.Effect<string, unknown, any> =>
  Effect.provide(
    Effect.gen(function*() {
      return (yield* Marker).who
    }),
    collected.layer
  )

// ONE define callback, reused across two calls, so the calls differ in nothing but being two.
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

    expect(first.definitions).not.toBe(second.definitions)
  })

  it("leaves the second call empty when only the first call registers a step", () => {
    const first = collectFeature(feature, Layer.empty, ({ Given }) => {
      Given("a step registered by the first call only", noop)
    })
    const second = collectFeature(feature, Layer.empty, () => {})

    // THE load-bearing freshness assertion, and the one mutation A fails: a module-scope registry carries the first
    // call's step into the second, making this length 1.
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

      // Registered AFTER the Scenario block closes.
      Given("a step back at the feature root", noop)
    })

    // `ruleId: null` on every frame: this file's DSL has no `Rule` container yet, so nothing here is nested in one —
    // which is the only thing Registry.ts note (e) lets `null` mean.
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

    // An `And` continues the preceding `Given` at MATCH time; rewriting it to "Given" here would erase what the
    // author wrote and make the two definitions indistinguishable.
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
        // Swallowed HERE, inside the define callback, so collection continues and the next registration can be
        // observed.
      }

      Given("a step after the throw", noop)
    })

    // Without the `finally` around popScope, the "explodes" frame is still on the stack and this step is attributed
    // to a scenario the author never put it in.
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
    // POSITION-SENSITIVE: the literal below is the real line number of the `Given(...)` call two lines further down.
    const givenLine = 181
    const collected = collectFeature(feature, Layer.empty, ({ Given }) => {
      Given("a located step", noop)
    })

    const definedAt = collected.definitions[0]?.definedAt

    // The file half rules out `src/describeFeature.ts` and `src/CallSite.ts`; the line half rules out any other call
    // site in this file.
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

    // No await, no tick.
    expect(ran).toBe(true)
    expect(collected.definitions).toHaveLength(1)
  })

  // The `void` return type accepts an `async` callback, so the runtime is what refuses it.
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

// Read the ambient `Marker` back out of a collection's SHARED tier — `whoProvides`'s sibling.
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

      assert.strictEqual(yield* whoProvides(collected), "perScenario")
      assert.strictEqual(yield* whoProvidesShared(collected), "shared")
    }))

  it.effect("keeps shared's services on the shared tier alone when perScenario is Layer.empty", () =>
    Effect.gen(function*() {
      const collected = collectFeature(feature, { shared: sharedMarker, perScenario: Layer.empty }, () => {})

      assert.strictEqual(yield* whoProvidesShared(collected), "shared")

      // The other half of the same claim, and the half that makes it discriminating: the per-Scenario tier provides
      // NO `Marker` at all.
      const fromPerScenario = yield* Effect.exit(whoProvides(collected))
      assert.isTrue(Exit.isFailure(fromPerScenario))
    }))

  it.effect("passes a plain Layer through as the per-Scenario tier, unchanged", () =>
    Effect.gen(function*() {
      const collected = collectFeature(feature, sharedMarker, () => {})

      assert.strictEqual(yield* whoProvides(collected), "shared")
    }))

  it("carries a sharedLayer for the object form and null for the plain-Layer form", () => {
    // The field's OWN discriminating claim, and nothing else in this file asserts it.
    const plain = collectFeature(feature, sharedMarker, () => {})
    const object = collectFeature(feature, { shared: sharedMarker, perScenario: perScenarioMarker }, () => {})

    expect(plain.sharedLayer).toBeNull()
    expect(object.sharedLayer).not.toBeNull()
  })
})

// The `_tag` of each planned step, in order.
const tagsOf = (steps: ReadonlyArray<{ readonly _tag: string }>): ReadonlyArray<string> => steps.map(({ _tag }) => _tag)

describe("the collection carries the plan the definitions were joined into", () => {
  it("resolves every step of the fixture Scenario when all three patterns are registered", () => {
    const collected = collectFeature(feature, Layer.empty, ({ Given, Then, When }) => {
      Given("the cart is empty", noop)
      When("I pay", noop)
      Then("I am charged", noop)
    })

    expect(collected.plan.scenarios).toHaveLength(1)
    expect(collected.plan.scenarios[0]?.name).toBe("checkout")
    expect(tagsOf(collected.plan.scenarios[0]?.steps ?? [])).toEqual(["Resolved", "Resolved", "Resolved"])

    // Every pattern matched something, so channel 3 is empty.
    expect(collected.plan.warnings).toHaveLength(0)
  })

  it("names an unused pattern in plan.warnings, with its keyword and its definition site", () => {
    const collected = collectFeature(feature, Layer.empty, ({ Given, Then, When }) => {
      Given("the cart is empty", noop)
      When("I pay", noop)
      Then("I am charged", noop)
      // Matches no step in the fixture Feature.
      Given("a pattern nothing in this Feature says", noop)
    })

    expect(collected.plan.warnings).toHaveLength(1)

    const warning = collected.plan.warnings[0]
    expect(warning?.pattern).toBe("a pattern nothing in this Feature says")
    expect(warning?.keyword).toBe("Given")
    expect(warning?.featureName).toBe("Checkout")

    // The MESSAGE, not just the fields: it is the string `describeFeature` hands the terminal channel verbatim, so
    // what a developer reads and what a tool inspects are one value.
    expect(warning?.message).toContain("a pattern nothing in this Feature says")
    expect(warning?.message).toContain("describeFeature.test.ts")

    // The three USED patterns are absent from the warnings, which is what separates "reports the unused one" from
    // "reports every registration".
    expect(collected.plan.warnings.map((each) => each.pattern)).toEqual([
      "a pattern nothing in this Feature says"
    ])
  })

  it("hands collectFeature and describeFeature the same plan, because collect computes it once", () => {
    // `collect` is the shared implementation, and the plan is built inside it rather than in `describeFeature` alone
    // — so two calls with the identical define callback produce structurally identical plans.
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

  it("keeps two Before hooks in registration order, by reference identity", () => {
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

    // THE load-bearing isolation assertion — mutation E fails it.
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

    // The registration path normalises once and does not re-wrap: `registerHook` delegates to `Step.ts`'s `register`,
    // which returns an already-wrapped function BY IDENTITY.
    expect(collected.hooks.Before[0]).toBe(alreadyWrapped)
  })

  it("gives a Scenario callback's dsl no Before key at runtime", () => {
    let scenarioDslKeys: ReadonlyArray<string> = []

    collectFeature(feature, Layer.empty, ({ Scenario }) => {
      Scenario("checkout", (dsl) => {
        scenarioDslKeys = Object.keys(dsl)
      })
    })

    // by 's `@ts-expect-error` fixture. This is the runtime half: mutation F (spreading
    expect(scenarioDslKeys).not.toContain("Before")
    expect(scenarioDslKeys).not.toContain("After")
    expect(scenarioDslKeys).not.toContain("BeforeStep")
    expect(scenarioDslKeys).not.toContain("AfterStep")
    expect(scenarioDslKeys).not.toContain("BeforeAllScenarios")
    expect(scenarioDslKeys).not.toContain("AfterAllScenarios")
  })
})

// ## The `Rule` container (08-05a) Everything below is appended at the END of this file on purpose, and must stay
// there.
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

// The id the fixture's parser assigned a Rule, looked up by name — the value `resolveRuleId` is expected to have
// produced for the same name.
const ruleIdOf = (name: string): string => {
  const found = ruleFeature.rules.find((rule) => rule.name === name)
  if (found === undefined) {
    throw new Error(`the Rule fixture Feature has no Rule named "${name}"`)
  }
  return found.id
}

const ruleAId = ruleIdOf("members get a discount")
const ruleBId = ruleIdOf("guests pay full price")

// A service NO Feature-level Layer in this file provides — only a Rule's own `extraLayer` does.
class RuleMarker extends Context.Service<RuleMarker, { readonly who: string }>()("RuleMarker") {}

const ruleAMarker = Layer.succeed(RuleMarker, RuleMarker.of({ who: "rule A" }))

// The same service, built ON TOP of the Feature's ambient one — `Layer<RuleMarker, never, Marker>`, with a
// non-`never` `RIn`.
const ruleAMarkerBuiltOnAmbient = Layer.effect(
  RuleMarker,
  Effect.gen(function*() {
    return RuleMarker.of({ who: `rule A on ${(yield* Marker).who}` })
  })
)

// Read `Marker` back out of an arbitrary collected Layer — `whoProvides`, without the collection.
const markerFrom = (layer: Layer.Layer<any, any, any>): Effect.Effect<string, unknown, any> =>
  Effect.provide(
    Effect.gen(function*() {
      return (yield* Marker).who
    }),
    layer
  )

// The same, for the Rule-only service.
const ruleMarkerFrom = (layer: Layer.Layer<any, any, any>): Effect.Effect<string, unknown, any> =>
  Effect.provide(
    Effect.gen(function*() {
      return (yield* RuleMarker).who
    }),
    layer
  )

// The `ruleLayers` entry for `ruleId`, or a thrown error naming what was missing.
const ruleLayerOf = (collected: FeatureCollection, ruleId: string): Layer.Layer<any, any, any> => {
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
    // The premise every isolation assertion below rests on.
    expect(ruleAId).not.toBe(ruleBId)
  })

  it("keeps a Rule-scoped Before out of the Feature's hooks and out of the other Rule's", () => {
    // Already-wrapped, so it survives registration BY IDENTITY (`registerHook` delegates to `Step.ts`'s `register`)
    // and the assertion can discriminate on WHICH hook landed where rather than merely on how many did.
    const ruleABefore = Effect.fn("rule A Before")(function*() {
      yield* Effect.void
    })

    const collected = collectFeature(ruleFeature, Layer.empty, ({ Rule }) => {
      Rule("members get a discount", Layer.empty, ({ Before }) => {
        Before(ruleABefore)
      })
      Rule("guests pay full price", Layer.empty, () => {})
    })

    // THE three-way isolation proof, and all three arms are load-bearing.
    expect(collected.ruleHooks.get(ruleAId)?.Before).toHaveLength(1)
    expect(collected.ruleHooks.get(ruleAId)?.Before[0]).toBe(ruleABefore)
    expect(collected.hooks.Before).toHaveLength(0)
    expect(collected.ruleHooks.get(ruleBId)?.Before).toHaveLength(0)
  })

  it("gives a Rule that registered no hook an all-empty HookSet rather than no entry", () => {
    const collected = collectFeature(ruleFeature, Layer.empty, ({ Rule }) => {
      Rule("guests pay full price", Layer.empty, () => {})
    })

    // Keyed off `ruleLayers`, so every Rule the author actually called gets an entry — a consumer never has to tell
    // "this Rule registered no hooks" apart from "there is no such Rule".
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

    // The other direction of the same filter: `hooks` keeps what `ruleHooks` must not take, and a filter written as
    // `!== ruleId` on both sides would put this one in both places.
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

      // Registered like any Rule — keyed, hooks attached — and its Layer is the ambient one itself, not a merge of
      // nothing onto it: same reference, same service.
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

      // BOTH, from one Layer — `Layer.provideMerge` keeps the dependency's services reachable, which is the half
      // `Layer.provide` would drop and the reason ADR-EC-010 names this combinator.
      assert.strictEqual(yield* markerFrom(ruleLayer), "shared")
      assert.strictEqual(yield* ruleMarkerFrom(ruleLayer), "rule A")
    }))

  it.effect("leaves the Feature's own Layer unable to provide the Rule's extra service", () =>
    Effect.gen(function*() {
      const collected = collectFeature(ruleFeature, sharedMarker, ({ Rule }) => {
        Rule("members get a discount", ruleAMarker, () => {})
      })

      const outside = yield* Effect.exit(ruleMarkerFrom(collected.layer))
      assert.isTrue(Exit.isFailure(outside))

      // …while the Feature's own service is still reachable from it, so the assertion above is about the extra
      // service and not about a Layer that provides nothing at all.
      assert.strictEqual(yield* markerFrom(collected.layer), "shared")
    }))

  it.effect("builds a Rule Layer whose own requirements the Feature's ambient Layer satisfies", () =>
    Effect.gen(function*() {
      const collected = collectFeature(ruleFeature, sharedMarker, ({ Rule }) => {
        Rule("members get a discount", ruleAMarkerBuiltOnAmbient, () => {})
      })

      // THE combinator assertion.
      assert.strictEqual(yield* ruleMarkerFrom(ruleLayerOf(collected, ruleAId)), "rule A on shared")
    }))

  it("keys ruleLayers by the same id ruleHooks uses", () => {
    const collected = collectFeature(ruleFeature, Layer.empty, ({ Rule }) => {
      Rule("members get a discount", Layer.empty, ({ Before }) => {
        Before(noop)
      })
    })

    // 08-05b and 08-07 both look a Rule up in both maps with one id — two key schemes would make every Scenario in a
    // Rule get either its Layer or its hooks, never both.
    expect([...collected.ruleLayers.keys()]).toEqual([ruleAId])
    expect([...collected.ruleHooks.keys()]).toEqual([ruleAId])
  })
})

describe("a step registered inside a Rule resolves for that Rule's Scenarios only", () => {
  it("resolves every step of the Rule's Scenario from rule-scope registrations", () => {
    const collected = collectFeature(ruleFeature, Layer.empty, ({ Rule }) => {
      Rule("members get a discount", Layer.empty, ({ Given, Then, When }) => {
        // Siblings of this Rule's own containers, reaching the spread `...scenarioDsl` registrars — which read
        // `registry.currentScope()` at call time and so land at `"rule"` scope.
        Given("the member is signed in", noop)
        When("the member pays", noop)
        Then("the member is charged less", noop)
      })
    })

    // End to end through `collect`'s own `planFeature` call: this is what proves 08-01's `isVisibleTo` `"rule"` arm
    // against a REAL registration rather than a hand-built `StepDefinition`.
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

    // Rule A's registrations match rule B's step TEXT exactly and are still invisible to it.
    expect(tagsOf(planFor(collected, "guest checkout")?.steps ?? [])).toEqual([
      "Unresolved",
      "Unresolved"
    ])
  })

  it("resolves a rule-background step from that Rule's own Background", () => {
    const collected = collectFeature(ruleFeature, Layer.empty, ({ Rule }) => {
      Rule("members get a discount", Layer.empty, ({ Background, Then, When }) => {
        Background(({ Given }) => {
          Given("the member is signed in", noop)
        })
        When("the member pays", noop)
        Then("the member is charged less", noop)
      })
    })

    expect(tagsOf(planFor(collected, "member checkout")?.steps ?? [])).toEqual([
      "Resolved",
      "Resolved",
      "Resolved"
    ])
  })

  it("leaves a rule-background step unresolved when the same pattern sits in the Feature's Background", () => {
    const collected = collectFeature(ruleFeature, Layer.empty, ({ Background, Rule }) => {
      // The FEATURE's Background container — `ruleId: null` — registering the exact pattern the Rule's own Background
      // step says.
      Background(({ Given }) => {
        Given("the member is signed in", noop)
      })
      Rule("members get a discount", Layer.empty, ({ Then, When }) => {
        When("the member pays", noop)
        Then("the member is charged less", noop)
      })
    })

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
        // Swallowed HERE, inside the define callback, exactly as the Scenario and Background cases above do — the
        // point is that the `"rule"` frame is off the stack when it happens.
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
        // Every one of these matches a real step's TEXT somewhere in the fixture — one from each of the three origins
        // a Rule's registrations could otherwise leak into.
        Given("the member is signed in", noop)
        When("the member pays", noop)
        When("the guest pays", noop)
      })
    })

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

    // The registration is REAL — it has a Layer and a hook slot like any other — and it is keyed where nothing can
    // reach it.
    expect(keys).toEqual(["unregistered-rule:a name no Rule: block in this Feature uses"])
    expect(ruleFeature.rules.map((rule) => rule.id)).not.toContain(keys[0])
    expect(ruleFeature.allScenarios.map((scenario) => Option.getOrNull(scenario.ruleId))).not.toContain(keys[0])
  })
})

// A service NOTHING in this file provides except a Scenario's own `extraLayer`.
class ScenarioMarker extends Context.Service<ScenarioMarker, { readonly who: string }>()("ScenarioMarker") {}

const scenarioMarker = Layer.succeed(ScenarioMarker, ScenarioMarker.of({ who: "scenario" }))

// The Scenario's own service built ON TOP of the enclosing RULE's — `Layer<ScenarioMarker, never, RuleMarker>`, a
// non-`never` `RIn` naming a service only the Rule provides.
const scenarioMarkerBuiltOnRule = Layer.effect(
  ScenarioMarker,
  Effect.gen(function*() {
    return ScenarioMarker.of({ who: `scenario on ${(yield* RuleMarker).who}` })
  })
)

// A SECOND implementation of the ambient `Marker`, for the collision case.
const scenarioOwnMarker = Layer.succeed(Marker, Marker.of({ who: "scenario's own" }))

// Read the Scenario-only service back out of a collected Layer.
const scenarioMarkerFrom = (layer: Layer.Layer<any, any, any>): Effect.Effect<string, unknown, any> =>
  Effect.provide(
    Effect.gen(function*() {
      return (yield* ScenarioMarker).who
    }),
    layer
  )

// The composite key `scenarioLayers` is keyed by, REBUILT here rather than imported from the source.
const scenarioKeyIn = (ruleId: string | null, name: string): string => `${ruleId ?? "<feature>"}\u0000${name}`

// The `scenarioLayers` entry, or a thrown error naming the key that was missing.
const scenarioLayerOf = (
  collected: FeatureCollection,
  ruleId: string | null,
  name: string
): Layer.Layer<any, any, any> => {
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

      // BOTH, from one Layer — `provideMerge` keeps the ambient side reachable, which is the half `Layer.provide`
      // would drop and the reason ADR-EC-010 names this combinator.
      assert.strictEqual(yield* markerFrom(scenarioLayer), "shared")
      assert.strictEqual(yield* scenarioMarkerFrom(scenarioLayer), "scenario")
    }))

  it.effect("leaves the Feature's own Layer unable to provide the Scenario's extra service", () =>
    Effect.gen(function*() {
      const collected = collectFeature(feature, sharedMarker, ({ Scenario }) => {
        Scenario("checkout", scenarioMarker, () => {})
      })

      const outside = yield* Effect.exit(scenarioMarkerFrom(collected.layer))
      assert.isTrue(Exit.isFailure(outside))

      // …while the Feature's own service is still reachable from it, so the failure above is about the extra service
      // and not about a Layer that provides nothing at all.
      assert.strictEqual(yield* markerFrom(collected.layer), "shared")
    }))

  it("records no entry for the two-argument form, in the same collection that records one", () => {
    const collected = collectFeature(feature, sharedMarker, ({ Scenario }) => {
      Scenario("checkout", scenarioMarker, ({ When }) => {
        When("I pay", noop)
      })
      // The overwhelmingly common form, in the SAME collection, so the two are told apart by the arity check alone
      // rather than by being two different runs.
      Scenario("checkout without a Layer of its own", ({ Then }) => {
        Then("I am charged", noop)
      })
    })

    // Exactly one key, and it is the three-argument call's.
    expect([...collected.scenarioLayers.keys()]).toEqual([scenarioKeyIn(null, "checkout")])

    // …and the two-argument form still ran its define callback under its OWN scenario scope, so the arity branch did
    // not swallow the callback while suppressing the entry.
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

      // "scenario on rule A" and not merely "scenario": this Layer was BUILT from the Rule's own service, so it only
      // builds at all if the ambient Layer handed to the factory inside `Rule` was that Rule's already-merged one.
      assert.strictEqual(yield* scenarioMarkerFrom(scenarioLayer), "scenario on rule A")

      // Keyed under the RULE's id, never under `<feature>`: a `ruleId` dropped from the key would make a Rule's
      // Scenario collide with a same-named Feature-level one, which F22 explicitly permits to coexist.
      assert.isFalse(collected.scenarioLayers.has(scenarioKeyIn(null, "member checkout")))
      assert.deepStrictEqual([...collected.scenarioLayers.keys()], [scenarioKeyIn(ruleAId, "member checkout")])
    }))

  it.effect("resolves a service both the Scenario's extra Layer and its ambient name to the Scenario's own", () =>
    Effect.gen(function*() {
      const collected = collectFeature(feature, sharedMarker, ({ Scenario }) => {
        Scenario("checkout", scenarioOwnMarker, () => {})
      })

      // The precedence assertion, and the one a swapped `Layer.provideMerge` argument order fails.
      assert.strictEqual(yield* markerFrom(scenarioLayerOf(collected, null, "checkout")), "scenario's own")
    }))

  it("records the entry even when the Scenario's define callback throws, and still pops its scope", () => {
    const collected = collectFeature(feature, sharedMarker, ({ Given, Scenario }) => {
      try {
        Scenario("checkout", scenarioMarker, () => {
          throw new Error("the define callback for this scenario threw")
        })
      } catch {
        // Swallowed HERE, inside the define callback, exactly as the two-argument throw case above does — the point
        // is what survived the throw, not that the throw is survivable.
      }

      Given("a step after the scenario-with-a-Layer threw", noop)
    })

    // The merge and the `set` run BEFORE `pushScope`/`try`, mirroring `Rule`'s own ordering.
    expect(collected.scenarioLayers.has(scenarioKeyIn(null, "checkout"))).toBe(true)

    // And the `finally` still pops, so the later step is not re-parented onto the scenario — the same guarantee the
    // two-argument form has had since before this factory existed.
    expect(scopeOf(collected, "a step after the scenario-with-a-Layer threw")).toEqual({
      kind: "feature",
      name: "Checkout",
      ruleId: null
    })
  })
})

describe("a Rule or Scenario name the Feature does not contain is warned about", () => {
  const containerFeature = Effect.runSync(
    parseFeature(
      `Feature: container names
  Scenario: Creating a user
    Given a step
  Scenario Outline: adding <count>
    Given a step
    Examples:
      | count |
      | 1     |
  Rule: Limits
    Scenario: Over the limit
      Given a step
`,
      "test/container-names.feature"
    ).pipe(Effect.provide(ParameterTypeStore.Default))
  )
  it("is silent when every container name exists, matching an Outline by its un-interpolated title", () => {
    const collected = collectFeature(containerFeature, Layer.empty, ({ Rule, Scenario }) => {
      Scenario("Creating a user", ({ Given }) => Given("a step", noop))
      Scenario("adding <count>", ({ Given }) => Given("a step", noop))
      Rule("Limits", ({ Scenario: ruleScenario }) => {
        ruleScenario("Over the limit", ({ Given }) => Given("a step", noop))
      })
    })
    expect(collected.containerWarnings).toEqual([])
  })

  it("names a misspelled Feature-level Scenario, the file, and the names that do exist", () => {
    const collected = collectFeature(containerFeature, Layer.empty, ({ Scenario }) => {
      Scenario("Creating a usr", ({ Given }) => Given("a step", noop))
    })
    expect(collected.containerWarnings).toHaveLength(1)
    const warning = collected.containerWarnings[0]
    expect(warning?.kind).toBe("Scenario")
    expect(warning?.name).toBe("Creating a usr")
    expect(warning?.ruleName).toBeNull()
    expect(warning?.known).toEqual(["Creating a user", "adding <count>"])
    expect(warning?.message).toContain(
      "\"test/container-names.feature\": UnknownContainer: no Scenario named \"Creating a usr\""
    )
  })

  it("names a misspelled Rule and lists the Rules that exist, and does not also warn for its Scenarios", () => {
    const collected = collectFeature(containerFeature, Layer.empty, ({ Rule }) => {
      Rule("Limts", ({ Scenario: ruleScenario }) => {
        ruleScenario("Over the limit", ({ Given }) => Given("a step", noop))
      })
    })
    expect(collected.containerWarnings.map((warning) => [warning.kind, warning.name])).toEqual([["Rule", "Limts"]])
    expect(collected.containerWarnings[0]?.known).toEqual(["Limits"])
  })

  it("scopes a Scenario's known names to its Rule", () => {
    const collected = collectFeature(containerFeature, Layer.empty, ({ Rule }) => {
      Rule("Limits", ({ Scenario: ruleScenario }) => {
        // A real Feature-level Scenario, registered inside the wrong Rule.
        ruleScenario("Creating a user", ({ Given }) => Given("a step", noop))
      })
    })
    expect(collected.containerWarnings).toHaveLength(1)
    expect(collected.containerWarnings[0]?.ruleName).toBe("Limits")
    expect(collected.containerWarnings[0]?.known).toEqual(["Over the limit"])
  })
})

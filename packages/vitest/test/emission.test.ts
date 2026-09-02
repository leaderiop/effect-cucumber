/**
 * The end-to-end proof: a real `.feature` source, a real `describeFeature` call, and real vitest tests that this
 * suite runs and reports.
 *
 * Carries: ADR-EC-006, ADR-EC-009, ADR-EC-010, ADR-EC-018, ADR-EC-019, ADR-EC-023, BEH-EC-007, BEH-EC-012, INV-EC-001, INV-EC-002, INV-EC-005.
 */
import { ParameterTypeStore, parseFeature } from "@effect-cucumber/gherkin"
import { assert, beforeAll, describe, expect, it } from "@effect/vitest"
import * as Clock from "effect/Clock"
import * as Console from "effect/Console"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Ref from "effect/Ref"
import * as TestClock from "effect/testing/TestClock"
import * as TestConsole from "effect/testing/TestConsole"
import { collectFeature, describeFeature } from "../src/describeFeature.ts"
import type { ScenarioDsl } from "../src/Dsl.ts"

// Captured BEFORE anything below installs a stub, so the restore assertion can compare by REFERENCE.
const originalConsoleWarn = globalThis.console.warn

// The ambient service the emitted Scenarios read and write.
class Log extends Context.Service<Log, { readonly entries: Ref.Ref<ReadonlyArray<string>> }>()("Log") {}

// Plain `Layer` form, which is the PER-SCENARIO scope — rebuilt fresh for every Scenario.
const logLayer = Layer.effect(
  Log,
  Effect.gen(function*() {
    const entries = yield* Ref.make<ReadonlyArray<string>>([])
    return Log.of({ entries })
  })
)

// Append one entry to the ambient log.
const append = (entry: string) =>
  Effect.gen(function*() {
    const { entries } = yield* Log
    yield* Ref.update(entries, (current) => [...current, entry])
  })

// The full ancestor path of the currently running test, as vitest reports it.
const currentTestName = (): string => expect.getState().currentTestName ?? ""

// A name-less, UNSHUFFLED block (F-24).
const unshuffledSuite: typeof describe = describe
const orderedBlock = (block: () => void): void => {
  unshuffledSuite("", { shuffle: false }, block)
}

// How vitest joins a test's ancestor names into `currentTestName`.
const nameSeparator = " > "

// The full name of every emitted Scenario that ran to completion, in the order they finished.
const completedScenarios: Array<string> = []

// Real source, parsed by the real parser.
const emissionFeature = Effect.runSync(
  parseFeature(
    `Feature: Emission
  Background:
    Given the log is opened

  Scenario: the first scenario records its own entry
    When I record "first"
    Then the log reads "opened,first"

  Scenario: the second scenario records a different entry
    When I record "second"
    Then the log reads "opened,second"
`,
    "test/emission.feature"
  ).pipe(Effect.provide(ParameterTypeStore.Default))
)

// THE CALL UNDER TEST.

// A second, smaller Feature for the drift block, so the happy-path Feature above stays free of a pattern that matches
// nothing.
const driftFeature = Effect.runSync(
  parseFeature(
    `Feature: Drift
  Scenario: one matched step
    Given a step this Feature really has
`,
    "test/drift.feature"
  ).pipe(Effect.provide(ParameterTypeStore.Default))
)

// The pattern nothing in `driftFeature` uses.
const unusedPattern = "a step no Scenario in this Feature ever writes"

// ONE define callback, so the two calls below differ in nothing but which entry point they are.
const defineWithOneUnusedPattern = (dsl: ScenarioDsl<never>): void => {
  dsl.Given("a step this Feature really has", function*() {
    yield* Effect.void
  })
  dsl.Given(unusedPattern, function*() {
    yield* Effect.void
  })
}

// Every argument list `console.warn` was called with while the recorder was installed, across BOTH calls below, in
// order.
const warnCalls: Array<ReadonlyArray<unknown>> = []

// Run `emit` with `console.warn` recording into `warnCalls`, and hand back the count afterwards.
const recordWarnings = (emit: () => void): number => {
  const original = globalThis.console.warn
  globalThis.console.warn = (...args: Array<unknown>) => {
    warnCalls.push(args)
  }
  try {
    emit()
  } finally {
    globalThis.console.warn = original
  }
  return warnCalls.length
}

// Both at module scope, and in this order: `describeFeature` registers test nodes, and vitest rejects a registration
// made from inside a running test.
const countAfterDescribeFeature = recordWarnings(() => {
  describeFeature(driftFeature, Layer.empty, defineWithOneUnusedPattern)
})

const countAfterCollectFeature = recordWarnings(() => {
  collectFeature(driftFeature, Layer.empty, defineWithOneUnusedPattern)
})

describe("an unused step definition reaches the terminal exactly once", () => {
  it("prints one warning naming the pattern, the keyword and the Feature", () => {
    // Exactly one, not "at least one": a warn per definition rather than per UNUSED definition would print two here,
    // and both messages would still contain the right words.
    expect(countAfterDescribeFeature).toBe(1)

    // One ARGUMENT, and it is the message `Plan.ts` built.
    expect(warnCalls[0]).toHaveLength(1)

    const printed = String(warnCalls[0]?.[0])
    expect(printed).toContain(unusedPattern)
    expect(printed).toContain("Given")
    expect(printed).toContain("Drift")

    // The definition SITE, which is the fact a developer reaches for first and the one a rebuilt message loses.
    expect(printed).toContain("emission.test.ts")
  })

  it("stays silent for collectFeature, which shares the same collect implementation", () => {
    // ZERO further calls — not "one call total", which the previous test already established.
    expect(countAfterCollectFeature).toBe(countAfterDescribeFeature)
  })

  it("restored the original console.warn, by reference", () => {
    // The `finally`'s standing proof, and asserted by IDENTITY — see `originalConsoleWarn`.
    expect(globalThis.console.warn).toBe(originalConsoleWarn)
  })
})

// DECLARED LAST ON PURPOSE.
orderedBlock(() => {
  describeFeature(emissionFeature, logLayer, ({ Background, Then, When }) => {
    Background(({ Given }) => {
      Given("the log is opened", function*() {
        yield* append("opened")
      })
    })

    When("I record {string}", function*(entry: string) {
      yield* append(entry)
    })

    Then("the log reads {string}", function*(expected: string) {
      const { entries } = yield* Log
      const actual = (yield* Ref.get(entries)).join(",")

      // The WHOLE log, joined — see the header.
      assert.strictEqual(actual, expected)

      // Nesting, against the real framework: the Feature's name must be an ANCESTOR of this test.
      assert.isTrue(
        currentTestName().startsWith(emissionFeature.name),
        `expected the running test to be nested inside ${JSON.stringify(emissionFeature.name)}, `
          + `but its full name is ${JSON.stringify(currentTestName())}`
      )

      // LAST line of the last step of each Scenario, so reaching it means every step before it succeeded.
      completedScenarios.push(currentTestName())
    })
  })

  describe("describeFeature emitted tests that actually ran", () => {
    it("completed one test per Scenario, in document order, each nested under the Feature", () => {
      // ONE positional comparison over the WHOLE array, never a `.length` check and never a `.some(...)` search.
      expect(completedScenarios).toEqual([
        `Emission${nameSeparator}the first scenario records its own entry`,
        `Emission${nameSeparator}the second scenario records a different entry`
      ])
    })
  })
})

// Task 2: all six hooks, through a REAL `describeFeature` call — the second real call in this file, against its own
// fixture, so the happy-path Feature above and its assertions stay completely untouched.
const hookLog: Array<string> = []

// A bare generator that brackets `${name}:start`/`${name}:end` around a real suspension in `hookLog`.
const bracketed = (name: string) =>
  function*() {
    hookLog.push(`${name}:start`)
    yield* Effect.yieldNow
    hookLog.push(`${name}:end`)
  }

// A second, smaller Feature — its own fixture, per the header, so the happy-path Feature's assertions above never
// have to change.
const hooksFeature = Effect.runSync(
  parseFeature(
    `Feature: Hooks
  Scenario: the first hook scenario sees BeforeAllScenarios and its own Before
    When I run the first hook scenario's own step
    Then the first hook scenario's log matches its own legitimate prefix

  Scenario: the second hook scenario sees no second BeforeAllScenarios
    When I run the second hook scenario's own step
    Then the second hook scenario's log matches its own legitimate prefix
`,
    "test/hooks.feature"
  ).pipe(Effect.provide(ParameterTypeStore.Default))
)

// THE second real `describeFeature` call in this file.

const outlineRowValues: Array<string> = []

// A three-row Outline whose every row states its own expected value in a second column.
const outlineFeature = Effect.runSync(
  parseFeature(
    `Feature: Outline rows are independent

  Scenario Outline: row carrying <value>
    When I record the row value <value>
    Then the row I ran was <expected>

    Examples:
      | value | expected |
      | alpha | alpha    |
      | beta  | beta     |
      | gamma | gamma    |
`,
    "test/outline-rows.feature"
  ).pipe(Effect.provide(ParameterTypeStore.Default))
)

// THE THIRD real `describeFeature` call in this file.

// DECLARED LAST ON PURPOSE, after every other `describe` block in this file — the identical "vitest runs a file's
// suites in declaration order" reasoning `completedScenarios`'s own last block uses.
orderedBlock(() => {
  describeFeature(
    hooksFeature,
    Layer.empty,
    ({ After, AfterAllScenarios, AfterStep, Before, BeforeAllScenarios, BeforeStep, Then, When }) => {
      Before(bracketed("before1"))
      Before(bracketed("before2"))
      After(bracketed("after1"))
      After(bracketed("after2"))
      // One BeforeStep and one AfterStep — wraps EVERY resolved step, the `When` and the `Then` alike.
      BeforeStep(bracketed("beforeStep"))
      AfterStep(bracketed("afterStep"))
      // One BeforeAllScenarios and one AfterAllScenarios — the once-cell and the block's teardown hook.
      BeforeAllScenarios(bracketed("beforeAllScenarios"))
      AfterAllScenarios(bracketed("afterAllScenarios"))

      When("I run the first hook scenario's own step", bracketed("scenario1-step"))
      Then("the first hook scenario's log matches its own legitimate prefix", function*() {
        // A bare assertion body has no Effect to `yield*` on its own — `Effect.void` satisfies oxlint's
        // `require-yield` (a generator with no `yield` at all is rejected) without asserting anything itself.
        yield* Effect.void
        assert.deepStrictEqual(hookLog, [
          "beforeAllScenarios:start",
          "beforeAllScenarios:end",
          "before1:start",
          "before1:end",
          "before2:start",
          "before2:end",
          "beforeStep:start",
          "beforeStep:end",
          "scenario1-step:start",
          "scenario1-step:end",
          "afterStep:start",
          "afterStep:end",
          "beforeStep:start",
          "beforeStep:end"
        ])
      })

      When("I run the second hook scenario's own step", bracketed("scenario2-step"))
      Then("the second hook scenario's log matches its own legitimate prefix", function*() {
        // Same `require-yield` satisfaction as the first `Then` body above.
        yield* Effect.void
        assert.deepStrictEqual(hookLog, [
          "beforeAllScenarios:start",
          "beforeAllScenarios:end",
          "before1:start",
          "before1:end",
          "before2:start",
          "before2:end",
          "beforeStep:start",
          "beforeStep:end",
          "scenario1-step:start",
          "scenario1-step:end",
          "afterStep:start",
          "afterStep:end",
          "beforeStep:start",
          "beforeStep:end",
          "afterStep:start",
          "afterStep:end",
          "after1:start",
          "after1:end",
          "after2:start",
          "after2:end",
          "before1:start",
          "before1:end",
          "before2:start",
          "before2:end",
          "beforeStep:start",
          "beforeStep:end",
          "scenario2-step:start",
          "scenario2-step:end",
          "afterStep:start",
          "afterStep:end",
          "beforeStep:start",
          "beforeStep:end"
        ])
        assert.strictEqual(hookLog.filter((entry) => entry === "beforeAllScenarios:start").length, 1)
      })
    }
  )

  describe("the hook Feature's real-run AfterAllScenarios proof", () => {
    it("ran the AfterAllScenarios teardown last, and its own hook exactly once", () => {
      // Mutation D's target: an `AfterAllScenarios` teardown that was never registered leaves the log ending with
      // Scenario 2's own `after2:start`/`:end` instead.
      expect(hookLog.slice(-2)).toEqual(["afterAllScenarios:start", "afterAllScenarios:end"])
      // Exactly once — not "at least once", which the position check above already implies but does not by itself
      // rule out a stray extra pair earlier in the log.
      expect(hookLog.filter((entry) => entry === "afterAllScenarios:start")).toHaveLength(1)
    })
  })
})

orderedBlock(() => {
  describeFeature(outlineFeature, logLayer, ({ Then, When }) => {
    When("I record the row value {word}", function*(value: string) {
      // Into the ambient `Log`, which is rebuilt per Scenario — so the `Then` below can only read a value its OWN
      // row's `When` put there.
      yield* append(value)
    })

    Then("the row I ran was {word}", function*(expected: string) {
      const { entries } = yield* Log
      const observed = yield* Ref.get(entries)

      // Exactly ONE entry: a shared `Ref` across rows would accumulate three, and a `.at(-1)` check would not notice.
      assert.deepStrictEqual(observed, [expected])

      // The row's own title, recorded for the outer block.
      outlineRowValues.push(currentTestName())
    })
  })

  describe("three Outline rows ran as three independent tests", () => {
    it("emitted one test per row, each titled with its own row's values", () => {
      // ONE positional comparison over the WHOLE array.
      expect(outlineRowValues).toEqual([
        `Outline rows are independent${nameSeparator}row carrying alpha (value=alpha, expected=alpha)`,
        `Outline rows are independent${nameSeparator}row carrying beta (value=beta, expected=beta)`,
        `Outline rows are independent${nameSeparator}row carrying gamma (value=gamma, expected=gamma)`
      ])
    })
  })
})

// The FEATURE tier: the ambient Layer's own service.
class Catalog extends Context.Service<Catalog, { readonly listPrice: number }>()("Catalog") {}

// The RULE tier, DERIVED from the Feature's — see the block header.
class Discount extends Context.Service<Discount, { readonly netPrice: number }>()("Discount") {}

class Currency extends Context.Service<Currency, { readonly symbol: string }>()("Currency") {}

// The shared hook log, reached through a service in the AMBIENT Layer rather than a bare closure.
class HookRef extends Context.Service<HookRef, { readonly entries: Ref.Ref<ReadonlyArray<string>> }>()("HookRef") {}

// The one `Ref` every hook below writes to, created ONCE outside every Layer — see the block header.
const ruleHookEntries = Ref.makeUnsafe<ReadonlyArray<string>>([])

// The Feature's ambient Layer: the Feature tier plus the hook log.
const ruleFeatureLayer = Layer.merge(
  Layer.succeed(Catalog, Catalog.of({ listPrice: 100 })),
  Layer.succeed(HookRef, HookRef.of({ entries: ruleHookEntries }))
)

// The Rule's extra Layer.
const discountLayer = Layer.effect(
  Discount,
  Effect.gen(function*() {
    const catalog = yield* Catalog
    return Discount.of({ netPrice: catalog.listPrice - 10 })
  })
)

// One Scenario's own extra Layer.
const currencyLayer = Layer.succeed(Currency, Currency.of({ symbol: "€" }))

// A bare generator that brackets `${name}:start`/`${name}:end` around a real suspension, written into the `Ref` the
// AMBIENT Layer provides.
const recordRuleHook = (name: string) =>
  function*() {
    const { entries } = yield* HookRef
    yield* Ref.update(entries, (seen) => [...seen, `${name}:start`])
    yield* Effect.yieldNow
    yield* Ref.update(entries, (seen) => [...seen, `${name}:end`])
  }

// The full name of each Rule-nested Scenario that ran to completion — `completedScenarios`'s role.
const ruleScenarioNames: Array<string> = []

// Two Scenarios inside ONE Rule: the second brings an extra Layer of its own, the first does not.
const ruleFeature = Effect.runSync(
  parseFeature(
    `Feature: Rule composition

  Rule: discounted checkout

    Scenario: a Rule Scenario reaches the Feature and Rule tiers
      When the rule scenario reads both tiers
      Then the rule scenario's hook log is Feature-then-Rule

    Scenario: a Scenario Layer adds a third tier
      When the three-tier scenario reads all three tiers
      Then the three-tier scenario is done
`,
    "test/rule-composition.feature"
  ).pipe(Effect.provide(ParameterTypeStore.Default))
)

// THE FOURTH real `describeFeature` call in this file, and the last of the pre-Phase-9 ones.

// DECLARED LAST, after the block that registered the Rule — the identical "vitest runs a file's suites in declaration
// order" reasoning every other reader in this file uses.
orderedBlock(() => {
  describeFeature(ruleFeature, ruleFeatureLayer, ({ After, Before, Rule }) => {
    Before(recordRuleHook("featureBefore"))
    After(recordRuleHook("featureAfter"))

    Rule(
      "discounted checkout",
      discountLayer,
      ({ After: RuleAfter, Before: RuleBefore, Scenario, Then, When }) => {
        RuleBefore(recordRuleHook("ruleBefore"))
        RuleAfter(recordRuleHook("ruleAfter"))

        // Registered at RULE level, so both Scenarios in this Rule can see them — and nothing outside it can.
        When("the rule scenario reads both tiers", function*() {
          const catalog = yield* Catalog
          const discount = yield* Discount
          // 100 is the Feature tier's constant; 90 is derivable ONLY from both tiers, because `discountLayer` read
          // `Catalog` while building.
          assert.strictEqual(catalog.listPrice, 100)
          assert.strictEqual(discount.netPrice, 90)
        })

        Then("the rule scenario's hook log is Feature-then-Rule", function*() {
          const { entries } = yield* HookRef
          assert.deepStrictEqual(yield* Ref.get(entries), [
            "featureBefore:start",
            "featureBefore:end",
            "ruleBefore:start",
            "ruleBefore:end"
          ])
          ruleScenarioNames.push(currentTestName())
        })

        Scenario("a Scenario Layer adds a third tier", currencyLayer, ({ Then: ScenarioThen, When: ScenarioWhen }) => {
          ScenarioWhen("the three-tier scenario reads all three tiers", function*() {
            const catalog = yield* Catalog
            const discount = yield* Discount
            const currency = yield* Currency
            assert.strictEqual(`${currency.symbol}${discount.netPrice}`, "€90")
            assert.strictEqual(catalog.listPrice, 100)
          })

          ScenarioThen("the three-tier scenario is done", function*() {
            // Same `require-yield` satisfaction as the other assertion-only bodies in this file.
            yield* Effect.void
            ruleScenarioNames.push(currentTestName())
          })
        })
      }
    )
  })

  describe("a Rule's Layer and hooks compose with the Feature's at runtime", () => {
    it("ran Feature Before then Rule Before, and Rule After then Feature After, for BOTH Rule Scenarios", () => {
      // ONE positional comparison over the WHOLE log.
      expect(Effect.runSync(Ref.get(ruleHookEntries))).toEqual([
        "featureBefore:start",
        "featureBefore:end",
        "ruleBefore:start",
        "ruleBefore:end",
        "ruleAfter:start",
        "ruleAfter:end",
        "featureAfter:start",
        "featureAfter:end",

        "featureBefore:start",
        "featureBefore:end",
        "ruleBefore:start",
        "ruleBefore:end",
        "ruleAfter:start",
        "ruleAfter:end",
        "featureAfter:start",
        "featureAfter:end"
      ])
    })

    it("emitted one test per Rule Scenario, each nested under the Feature AND under the Rule", () => {
      // `completedScenarios`'s argument, one nesting level deeper: an implementation that emitted nothing for the
      // Rule passes every in-body assertion above vacuously, because nothing runs to assert.
      expect(ruleScenarioNames).toEqual([
        `Rule composition${nameSeparator}discounted checkout${nameSeparator}a Rule Scenario reaches the Feature and Rule tiers`,
        `Rule composition${nameSeparator}discounted checkout${nameSeparator}a Scenario Layer adds a third tier`
      ])
    })
  })
})

// Every `console.warn` line printed while vitest COLLECTED this file, in order.
const collectionWarnings: Array<string> = []

// Installed at module scope, removed in the `beforeAll` below.
globalThis.console.warn = (...args: Array<unknown>) => {
  collectionWarnings.push(args.map((arg) => String(arg)).join(" "))
}

beforeAll(() => {
  // BY REFERENCE, to the value captured at the very top of this file before any stub existed.
  globalThis.console.warn = originalConsoleWarn
})

// The collection-phase warning lines that name `uri`, which is how each block reads only its own.
const warningsFor = (uri: string): ReadonlyArray<string> => collectionWarnings.filter((line) => line.includes(uri))

const fourLevelStepRuns: Array<string> = []

// A bare generator that records one label into `fourLevelStepRuns`.
const recordFourLevel = (label: string) =>
  function*() {
    fourLevelStepRuns.push(label)
    yield* Effect.void
  }

const fourLevelFeature = Effect.runSync(
  parseFeature(
    `@featuretag
Feature: Four-level tagging

  Scenario: an untagged Scenario still inherits the Feature's own tag
    When the untagged four-level scenario runs

  @slow
  Scenario: a slow-tagged Scenario is a plain pass-through and runs like any other
    When the slow four-level scenario runs

  @only
  Scenario: an only-tagged Scenario emits a plain tag and no modifier
    When the only-tagged four-level scenario runs

  @ruletag
  Rule: a tagged rule

    @scenariotag
    Scenario Outline: a four-level-tagged row carrying <value>
      When the four-level outline scenario runs with <value>

      @exampletag
      Examples:
        | value |
        | alpha |
`,
    "test/four-level-tags.feature"
  ).pipe(Effect.provide(ParameterTypeStore.Default))
)

// THE FIFTH real `describeFeature` call in this file.

// DECLARED AFTER the block that registered the Feature, for the declaration-order reason every other reader in this
// file uses.
orderedBlock(() => {
  describeFeature(fourLevelFeature, Layer.empty, ({ AfterAllScenarios, Rule, When }) => {
    // The marker `scripts/verify-tags-filter.sh` greps for on a run narrowed with `--tagsFilter` to the `@only`
    // Scenario alone: the teardown ran even though every other test in this block was narrowed to skip (F-06).
    AfterAllScenarios(function*() {
      yield* Effect.void
      process.stdout.write("AFTER_ALL_SCENARIOS_RAN\n")
    })
    When("the untagged four-level scenario runs", recordFourLevel("untagged"))
    When("the slow four-level scenario runs", recordFourLevel("slow"))
    When("the only-tagged four-level scenario runs", recordFourLevel("only-tagged"))

    Rule("a tagged rule", Layer.empty, ({ When: RuleWhen }) => {
      // RENAMED for the reason 08-07's Rule block above records: oxlint's `no-shadow` rejects reusing the enclosing
      // name, and the rename also says at the call site which container the registration lands in.
      RuleWhen("the four-level outline scenario runs with {word}", function*(value: string) {
        fourLevelStepRuns.push(`outline:${value}`)
        yield* Effect.void
      })
    })
  })

  describe("a Feature tagged at all four levels collects and runs through the real describeFeature", () => {
    it("ran every Scenario's step, in document order, tagged and untagged alike", () => {
      // ONE positional comparison over the WHOLE array rather than four membership checks.
      expect(fourLevelStepRuns).toEqual(["untagged", "slow", "only-tagged", "outline:alpha"])
    })

    it("emitted all six tags with the framework accepting every one — nothing was degraded", () => {
      expect(warningsFor("test/four-level-tags.feature")).toEqual([])
    })
  })
})

const skipHookCounts = {
  before: 0,
  after: 0,
  beforeStep: 0,
  afterStep: 0,
  skippedBodies: 0,
  runnableBodies: 0
}

// A bare generator that increments one `skipHookCounts` key.
const countSkipHook = (key: keyof typeof skipHookCounts) =>
  function*() {
    skipHookCounts[key] += 1
    yield* Effect.void
  }

// Two `@skip` Scenarios and one runnable one, in ONE Feature so they share the same hook registrations — which is the
// whole point: the hooks are declared once and must fire for exactly one of the three Scenarios.
const skipFeature = Effect.runSync(
  parseFeature(
    `Feature: Skip runs nothing

  @skip
  Scenario: a skipped Scenario runs none of its own step bodies
    When the skipped scenario's first step body runs
    Then the skipped scenario's second step body runs

  @skip
  Scenario: a skipped Scenario whose step matches no definition is still just skipped
    When no registered definition anywhere in this file matches this step

  Scenario: the one runnable Scenario in the skip Feature
    When the skip Feature's runnable first step runs
    Then the skip Feature's runnable second step runs
`,
    "test/skip-runs-nothing.feature"
  ).pipe(Effect.provide(ParameterTypeStore.Default))
)

// THE SIXTH real `describeFeature` call in this file.

// The second Feature: EVERY Scenario is `@skip`, so nothing runnable is emitted at all.
const allSkippedCounts = { beforeAllScenarios: 0, afterAllScenarios: 0, body: 0 }

const allSkippedFeature = Effect.runSync(
  parseFeature(
    `Feature: Every Scenario in this Feature is skipped

  @skip
  Scenario: the only Scenario here, and it is skipped
    When the all-skipped Feature's step body runs
`,
    "test/all-skipped.feature"
  ).pipe(Effect.provide(ParameterTypeStore.Default))
)

// THE SEVENTH real `describeFeature` call in this file.

// DECLARED AFTER both blocks that registered these Features, for the declaration-order reason every other reader in
// this file uses.
orderedBlock(() => {
  describeFeature(skipFeature, Layer.empty, ({ After, AfterStep, Before, BeforeStep, Then, When }) => {
    Before(countSkipHook("before"))
    After(countSkipHook("after"))
    BeforeStep(countSkipHook("beforeStep"))
    AfterStep(countSkipHook("afterStep"))

    When("the skipped scenario's first step body runs", countSkipHook("skippedBodies"))
    Then("the skipped scenario's second step body runs", countSkipHook("skippedBodies"))

    When("the skip Feature's runnable first step runs", countSkipHook("runnableBodies"))
    Then("the skip Feature's runnable second step runs", countSkipHook("runnableBodies"))
  })

  describeFeature(allSkippedFeature, Layer.empty, ({ AfterAllScenarios, BeforeAllScenarios, When }) => {
    BeforeAllScenarios(function*() {
      allSkippedCounts.beforeAllScenarios += 1
      yield* Effect.void
    })
    AfterAllScenarios(function*() {
      allSkippedCounts.afterAllScenarios += 1
      yield* Effect.void
    })
    When("the all-skipped Feature's step body runs", function*() {
      allSkippedCounts.body += 1
      yield* Effect.void
    })
  })

  describe("a @skip Scenario runs no step and no hook", () => {
    it("ran every hook exactly the number of times the ONE runnable Scenario accounts for", () => {
      expect(skipHookCounts).toEqual({
        before: 1,
        after: 1,
        beforeStep: 2,
        afterStep: 2,
        skippedBodies: 0,
        runnableBodies: 2
      })
    })

    it("emitted no teardown for a Feature in which every Scenario is skipped", () => {
      // `body` at 0 is the ordinary skip claim.
      expect(allSkippedCounts).toEqual({ beforeAllScenarios: 0, afterAllScenarios: 0, body: 0 })
    })
  })
})

const undeclaredTagRuns: Array<string> = []

const undeclaredTagFeature = Effect.runSync(
  parseFeature(
    `Feature: An undeclared tag degrades instead of destroying the file

  @undeclared-on-purpose
  Scenario: a Scenario carrying an undeclared tag still runs
    When the undeclared-tag scenario's step body runs

  Scenario: a sibling Scenario in the same Feature still collects and runs
    When the undeclared-tag sibling's step body runs
`,
    "test/undeclared-tag.feature"
  ).pipe(Effect.provide(ParameterTypeStore.Default))
)

// THE EIGHTH real `describeFeature` call in this file, and the only one in the repo that deliberately emits a tag the
// config does not declare.

const excludeTagsRan: Array<string> = []

const excludeTagsFeature = Effect.runSync(
  parseFeature(
    `Feature: excludeTags removes Scenarios from registration

  @wip
  Scenario: the first wip Scenario, which excludeTags removes
    When the first excluded wip step runs

  @wip
  Scenario: the second wip Scenario, which excludeTags removes
    When the second excluded wip step runs

  Scenario: the Scenario that survives excludeTags
    When the surviving excludeTags step runs
`,
    "test/exclude-tags.feature"
  ).pipe(Effect.provide(ParameterTypeStore.Default))
)

// THE NINTH real `describeFeature` call in this file, and the first anywhere in this repo to pass the fourth
// `options` argument to the real entry point.

// DECLARED LAST in this file, after every block that registered any of the three Features above, for the
// declaration-order reason every other reader here uses.
const emptyFilterRan: Array<string> = []

const emptyFilterFeature = Effect.runSync(
  parseFeature(
    `Feature: An empty excludeTags array filters nothing

  @wip
  Scenario: a wip Scenario an empty excludeTags array must not remove
    When the empty-filter wip step runs

  Scenario: an untagged Scenario beside it
    When the empty-filter untagged step runs
`,
    "test/empty-filter.feature"
  ).pipe(Effect.provide(ParameterTypeStore.Default))
)

orderedBlock(() => {
  describeFeature(undeclaredTagFeature, Layer.empty, ({ When }) => {
    When("the undeclared-tag scenario's step body runs", function*() {
      undeclaredTagRuns.push("undeclared")
      yield* Effect.void
    })
    When("the undeclared-tag sibling's step body runs", function*() {
      undeclaredTagRuns.push("sibling")
      yield* Effect.void
    })
  })

  describeFeature(excludeTagsFeature, Layer.empty, ({ When }) => {
    When("the first excluded wip step runs", function*() {
      excludeTagsRan.push(currentTestName())
      yield* Effect.void
    })
    When("the second excluded wip step runs", function*() {
      excludeTagsRan.push(currentTestName())
      yield* Effect.void
    })
    When("the surviving excludeTags step runs", function*() {
      excludeTagsRan.push(currentTestName())
      yield* Effect.void
    })
  }, { excludeTags: ["@wip"] })

  // THE TENTH real `describeFeature` call in this file.
  describeFeature(emptyFilterFeature, Layer.empty, ({ When }) => {
    When("the empty-filter wip step runs", function*() {
      emptyFilterRan.push("wip")
      yield* Effect.void
    })
    When("the empty-filter untagged step runs", function*() {
      emptyFilterRan.push("untagged")
      yield* Effect.void
    })
  }, { excludeTags: [] })

  describe("an undeclared tag warns and keeps running; a filter excludes without a trace", () => {
    it("ran the undeclared-tag Scenario AND its sibling — the file did not collapse", () => {
      // The degradation's headline: the Scenario RAN.
      expect(undeclaredTagRuns).toEqual(["undeclared", "sibling"])
    })

    it("printed exactly one warning, naming the file, the Scenario and the tag in QUOTED form", () => {
      const printed = warningsFor("test/undeclared-tag.feature")
      // Exactly one, not "at least one": a warning per TAG rather than per catch would still name the right tag and
      // still read correctly, and only a count separates the two.
      expect(printed).toHaveLength(1)

      const line = printed[0] ?? ""
      // The three facts a reader needs in order to act, each matched in its `JSON.stringify`'d form.
      expect(line).toContain(JSON.stringify("@undeclared-on-purpose"))
      expect(line).toContain(JSON.stringify("test/undeclared-tag.feature"))
      expect(line).toContain(JSON.stringify("a Scenario carrying an undeclared tag still runs"))

      // The fact that stops the obvious misreading.
      expect(line).toContain("still ran")
      expect(line).toContain("UNTAGGED")
    })

    it("excluded both @wip Scenarios ENTIRELY — no test node, no step, not even a skip", () => {
      // ONE whole-array comparison, and the two properties it pins have different failure modes.
      expect(excludeTagsRan).toEqual([
        `excludeTags removes Scenarios from registration${nameSeparator}the Scenario that survives excludeTags`
      ])
    })

    it("printed exactly one excluded-Scenarios notice, naming the count, the option and the quoted tag", () => {
      const printed = warningsFor("test/exclude-tags.feature")
      // Exactly ONE, per Feature and never per excluded Scenario.
      expect(printed).toHaveLength(1)

      const line = printed[0] ?? ""
      // The COUNT, which is the fact a reader acts on and the one a stale filter makes alarming.
      expect(line).toContain("2 Scenario(s)")
      // The OPTION that did it, so the reader knows which of the two to go and look at.
      expect(line).toContain("excludeTags")
      expect(line).toContain(JSON.stringify("@wip"))
      expect(line).toContain(JSON.stringify("excludeTags removes Scenarios from registration"))
      // The sentence that stops "excluded" being read as "skipped".
      expect(line).toContain("never registered")
    })

    it("emitted every Scenario under excludeTags: [], and printed nothing about it", () => {
      // The empty-array rule at the public boundary: `[]` means NO FILTER, never "match nothing".
      expect(emptyFilterRan).toEqual(["wip", "untagged"])
      // And no notice: nothing was excluded, so there is nothing to report.
      expect(warningsFor("test/empty-filter.feature")).toEqual([])
    })
  })
})

// The per-Scenario probe.
class PerScenarioProbe extends Context.Service<PerScenarioProbe, {
  readonly buildOrdinal: number
  readonly entries: Ref.Ref<ReadonlyArray<string>>
}>()("PerScenarioProbe") {}

// How many times the per-Scenario Layer below has been BUILT.
let perScenarioBuilds = 0

// The plain-`Layer` argument form, which IS the default per-Scenario scope.
const perScenarioProbeLayer = Layer.effect(
  PerScenarioProbe,
  Effect.gen(function*() {
    perScenarioBuilds += 1
    const entries = yield* Ref.make<ReadonlyArray<string>>([])
    return PerScenarioProbe.of({ buildOrdinal: perScenarioBuilds, entries })
  })
)

// The build each Scenario REACHED, pushed from inside the running step.
const perScenarioBuildOrdinals: Array<number> = []

// The full name of each per-Scenario Scenario that ran to completion — `completedScenarios`'s role.
const perScenarioScenarioNames: Array<string> = []

// Three Scenarios, one per build.
const perScenarioBuildFeature = Effect.runSync(
  parseFeature(
    `Feature: Per-Scenario build count

  Scenario: the first per-scenario scenario records its own build
    When the first per-scenario step runs
    Then the per-scenario scenario is done

  Scenario: the second per-scenario scenario sees a fresh build
    When the second per-scenario step runs
    Then the per-scenario scenario is done

  Scenario: the third per-scenario scenario sees a third build
    When the third per-scenario step runs
    Then the per-scenario scenario is done
`,
    "test/per-scenario-build-count.feature"
  ).pipe(Effect.provide(ParameterTypeStore.Default))
)

// DECLARED AFTER the block that registered the Feature, for the declaration-order reason every other reader in this
// file uses.
orderedBlock(() => {
  describeFeature(perScenarioBuildFeature, perScenarioProbeLayer, ({ Then, When }) => {
    When("the first per-scenario step runs", function*() {
      const probe = yield* PerScenarioProbe
      perScenarioBuildOrdinals.push(probe.buildOrdinal)
      yield* Ref.update(probe.entries, (seen) => [...seen, "first"])
    })

    When("the second per-scenario step runs", function*() {
      const probe = yield* PerScenarioProbe
      // SC #1's second half, and a DIFFERENT claim from the build count beside it: Scenario one wrote `"first"` into
      // the `Ref` it got from its own build.
      assert.deepStrictEqual(yield* Ref.get(probe.entries), [])
      perScenarioBuildOrdinals.push(probe.buildOrdinal)
      yield* Ref.update(probe.entries, (seen) => [...seen, "second"])
    })

    When("the third per-scenario step runs", function*() {
      const probe = yield* PerScenarioProbe
      perScenarioBuildOrdinals.push(probe.buildOrdinal)
      yield* Ref.update(probe.entries, (seen) => [...seen, "third"])
    })

    // ONE definition, matched by all three Scenarios.
    Then("the per-scenario scenario is done", function*() {
      // Same `require-yield` satisfaction as the other assertion-only bodies in this file.
      yield* Effect.void
      perScenarioScenarioNames.push(currentTestName())
    })
  })

  describe("the default per-Scenario Layer scope builds once per Scenario", () => {
    it("built the Layer three times for three Scenarios, in Scenario order", () => {
      // THE assertion that carries N-builds, and the only one in this repo that does.
      expect(perScenarioBuildOrdinals).toEqual([1, 2, 3])
    })

    it("emitted and ran all three Scenarios, each nested under the Feature", () => {
      expect(perScenarioScenarioNames).toEqual([
        `Per-Scenario build count${nameSeparator}the first per-scenario scenario records its own build`,
        `Per-Scenario build count${nameSeparator}the second per-scenario scenario sees a fresh build`,
        `Per-Scenario build count${nameSeparator}the third per-scenario scenario sees a third build`
      ])
    })
  })
})

// The SHARED tier's probe: one build for the whole Feature, so every Scenario reads ordinal 1.
class SharedProbe extends Context.Service<SharedProbe, { readonly buildOrdinal: number }>()("SharedProbe") {}

// The PER-SCENARIO tier's probe, in the SAME Feature — the `[1, 2, 3]` half of the pair.
class ScopedProbe extends Context.Service<ScopedProbe, { readonly buildOrdinal: number }>()("ScopedProbe") {}

// The service BOTH tiers name, with different values.
class CollisionMarker extends Context.Service<CollisionMarker, { readonly who: string }>()("CollisionMarker") {}

// How many times the SHARED tier has been built.
let sharedBuilds = 0

// How many times the PER-SCENARIO tier has been built, in the same Feature.
let scopedBuilds = 0

// The shared tier.
const sharedProbeLayer = Layer.mergeAll(
  Layer.effect(
    SharedProbe,
    Effect.gen(function*() {
      // Same `require-yield` satisfaction as the assertion-only step bodies in this file.
      yield* Effect.void
      sharedBuilds += 1
      return SharedProbe.of({ buildOrdinal: sharedBuilds })
    })
  ),
  Layer.succeed(CollisionMarker, CollisionMarker.of({ who: "shared" }))
)

// The per-Scenario tier of the SAME Feature, which must stay fresh per Scenario (INV-EC-002).
const scopedProbeLayer = Layer.mergeAll(
  Layer.effect(
    ScopedProbe,
    Effect.gen(function*() {
      // `require-yield`, as above.
      yield* Effect.void
      scopedBuilds += 1
      return ScopedProbe.of({ buildOrdinal: scopedBuilds })
    })
  ),
  Layer.succeed(CollisionMarker, CollisionMarker.of({ who: "perScenario" }))
)

// The shared build each Scenario REACHED — all three must be the same build.
const sharedBuildOrdinals: Array<number> = []

// The per-Scenario build each Scenario reached, in the same run — all three must differ.
const scopedBuildOrdinals: Array<number> = []

// Which tier's `CollisionMarker` each Scenario actually resolved.
const collisionWinners: Array<string> = []

// The full name of each shared-path Scenario that ran to completion.
const sharedScenarioNames: Array<string> = []

// What the shared-path teardown observed of the shared tier — the build ordinal it read.
const sharedTeardownObservations: Array<number> = []

// Three Scenarios, ONE shared build.
const sharedBuildFeature = Effect.runSync(
  parseFeature(
    `Feature: Shared build count

  Scenario: the first shared scenario observes the single shared build
    When the shared scenario reads both tiers
    Then the shared scenario is done

  Scenario: the second shared scenario observes the same shared build
    When the shared scenario reads both tiers
    Then the shared scenario is done

  Scenario: the third shared scenario observes the same shared build
    When the shared scenario reads both tiers
    Then the shared scenario is done
`,
    "test/shared-build-count.feature"
  ).pipe(Effect.provide(ParameterTypeStore.Default))
)

// THE TWELFTH real `describeFeature` call in this file, and the first in the repo to pass the OBJECT form.

// DECLARED LAST IN THIS FILE, after the block that registered the Feature, for the declaration-order reason every
// other reader here uses.
orderedBlock(() => {
  describeFeature(
    sharedBuildFeature,
    { shared: sharedProbeLayer, perScenario: scopedProbeLayer },
    ({ AfterAllScenarios, Then, When }) => {
      AfterAllScenarios(function*() {
        const shared = yield* SharedProbe
        sharedTeardownObservations.push(shared.buildOrdinal)
        process.stdout.write("SHARED_AFTER_ALL_SCENARIOS_RAN\n")
      })

      // ONE definition, matched by all three Scenarios, so the three bodies cannot drift apart into asserting three
      // different things about one claim.
      When("the shared scenario reads both tiers", function*() {
        assert.strictEqual(sharedBuilds, 1)

        const shared = yield* SharedProbe
        sharedBuildOrdinals.push(shared.buildOrdinal)

        const scoped = yield* ScopedProbe
        scopedBuildOrdinals.push(scoped.buildOrdinal)

        const marker = yield* CollisionMarker
        collisionWinners.push(marker.who)
      })

      Then("the shared scenario is done", function*() {
        // Same `require-yield` satisfaction as the other assertion-only bodies in this file.
        yield* Effect.void
        sharedScenarioNames.push(currentTestName())
      })
    }
  )

  describe("the opt-in shared Layer scope builds exactly once per Feature", () => {
    it("ran the AfterAllScenarios teardown once against that same build, not a rebuild", () => {
      expect(sharedTeardownObservations).toEqual([1])
      expect(sharedBuilds).toBe(1)
    })

    it("gave all three Scenarios the SAME single shared build", () => {
      expect(sharedBuildOrdinals).toEqual([1, 1, 1])
    })

    it("kept the per-Scenario tier of the SAME Feature fresh for every Scenario", () => {
      expect(scopedBuildOrdinals).toEqual([1, 2, 3])
    })

    it("resolved a service named by BOTH tiers to the perScenario implementation", () => {
      expect(collisionWinners).toEqual(["perScenario", "perScenario", "perScenario"])
    })

    it("emitted and ran all three Scenarios, each nested under the Feature", () => {
      expect(sharedScenarioNames).toEqual([
        `Shared build count${nameSeparator}the first shared scenario observes the single shared build`,
        `Shared build count${nameSeparator}the second shared scenario observes the same shared build`,
        `Shared build count${nameSeparator}the third shared scenario observes the same shared build`
      ])
    })
  })
})

// The SHARED tier's probe for this block.
class ClockProbe extends Context.Service<ClockProbe, { readonly buildOrdinal: number }>()("ClockProbe") {}

// How many times this block's shared Layer has been BUILT.
let clockSharedBuilds = 0

// What Scenario one logs, and what Scenario four must NOT be able to see.
const clockConsoleMarker = "first-shared-clock-scenario-marker"

// What Scenario four logs into its OWN console, to prove the accessor is live rather than empty.
const fourthConsoleMarker = "fourth-shared-clock-scenario-marker"

// The shared tier.
const clockLayer = Layer.effect(
  ClockProbe,
  Effect.gen(function*() {
    // Same `require-yield` satisfaction as every other assertion-only generator body in this file.
    yield* Effect.void
    clockSharedBuilds += 1
    return ClockProbe.of({ buildOrdinal: clockSharedBuilds })
  })
)

// The clock reading each Scenario took at its own START.
const clockReadings: Array<number> = []

// The full name of each shared-clock Scenario that ran to completion.
const clockScenarioNames: Array<string> = []

// Four Scenarios, exactly ONE of which advances the clock.
const sharedClockFeature = Effect.runSync(
  parseFeature(
    `Feature: Shared clock isolation

  Scenario: the first shared clock scenario advances the test clock by one hour
    When the first shared clock step advances the clock
    Then the shared clock scenario is done

  Scenario: the second shared clock scenario still starts at time zero
    When the second shared clock step reads the clock
    Then the shared clock scenario is done

  Scenario: the third shared clock scenario still starts at time zero and shares one build
    When the third shared clock step reads the clock and the shared build count
    Then the shared clock scenario is done

  Scenario: the fourth shared clock scenario gets its own test console
    When the fourth shared clock step reads the clock and its own console
    Then the shared clock scenario is done
`,
    "test/shared-clock-isolation.feature"
  ).pipe(Effect.provide(ParameterTypeStore.Default))
)

// THE THIRTEENTH real `describeFeature` call in this file, and the SECOND to pass the object form.

// DECLARED AFTER the block that registered the Feature, for the declaration-order reason every other reader in this
// file uses.
orderedBlock(() => {
  describeFeature(sharedClockFeature, { shared: clockLayer, perScenario: Layer.empty }, ({ Then, When }) => {
    When("the first shared clock step advances the clock", function*() {
      // This Scenario reads 0 like every other one — it is not exempt from the claim, it is the Scenario that goes on
      // to break the clock for everyone after it.
      const before = yield* Clock.currentTimeMillis
      assert.strictEqual(before, 0)
      clockReadings.push(before)

      // Logged HERE so Scenario four has something to fail to see.
      yield* Console.log(clockConsoleMarker)

      // THE one clock mutation in this entire file, and the acceptance criteria pin it at exactly one.
      yield* TestClock.adjust("1 hour")

      // The other half of BEH-EC-012's requirement, and the reason this is not merely an isolation test: a step MUST
      // be able to advance the simulated clock deterministically.
      const after = yield* Clock.currentTimeMillis
      assert.strictEqual(after, 3_600_000)
    })

    When("the second shared clock step reads the clock", function*() {
      // ADR-EC-018, as one line.
      const millis = yield* Clock.currentTimeMillis
      assert.strictEqual(millis, 0)
      clockReadings.push(millis)
    })

    When("the third shared clock step reads the clock and the shared build count", function*() {
      const millis = yield* Clock.currentTimeMillis
      assert.strictEqual(millis, 0)
      clockReadings.push(millis)

      const probe = yield* ClockProbe
      assert.strictEqual(probe.buildOrdinal, 1)
      assert.strictEqual(clockSharedBuilds, 1)
    })

    When("the fourth shared clock step reads the clock and its own console", function*() {
      const millis = yield* Clock.currentTimeMillis
      assert.strictEqual(millis, 0)
      clockReadings.push(millis)

      assert.deepStrictEqual(yield* TestConsole.logLines, [])

      // The non-vacuity control, and it is not optional: an accessor that always returned `[]` would satisfy the line
      // above forever.
      yield* Console.log(fourthConsoleMarker)
      assert.deepStrictEqual(yield* TestConsole.logLines, [fourthConsoleMarker])
    })

    // ONE definition matched by all four Scenarios — `currentTestName()` differs per running test, so one body
    // records four distinct names.
    Then("the shared clock scenario is done", function*() {
      // Same `require-yield` satisfaction as the other assertion-only bodies in this file.
      yield* Effect.void
      clockScenarioNames.push(currentTestName())
    })
  })

  describe("a shared Layer keeps every Scenario its own TestClock and TestConsole", () => {
    it("started all four Scenarios at time zero, including the three that ran after the one-hour advance", () => {
      // Four zeros, ORDERED.
      expect(clockReadings).toEqual([0, 0, 0, 0])
    })

    it("emitted and ran all four Scenarios, each nested under the Feature", () => {
      expect(clockScenarioNames).toEqual([
        `Shared clock isolation${nameSeparator}the first shared clock scenario advances the test clock by one hour`,
        `Shared clock isolation${nameSeparator}the second shared clock scenario still starts at time zero`,
        `Shared clock isolation${nameSeparator}the third shared clock scenario still starts at time zero and shares one build`,
        `Shared clock isolation${nameSeparator}the fourth shared clock scenario gets its own test console`
      ])
    })
  })
})

// The FEATURE's `shared` tier: built ONCE for the whole run, and read by the Rule's Layer.
class SharedCatalog extends Context.Service<SharedCatalog, {
  readonly listPrice: number
  readonly buildOrdinal: number
}>()("SharedCatalog") {}

// The RULE's own tier, DERIVED from the shared one.
class RuleDiscount extends Context.Service<RuleDiscount, {
  readonly netPrice: number
  readonly buildOrdinal: number
}>()("RuleDiscount") {}

// How many times the Feature's `shared` Layer has been built.
let sharedCatalogBuilds = 0

// How many times the Rule's `extraLayer` has been built.
let ruleDiscountBuilds = 0

// The Feature's `shared` tier.
const sharedCatalogLayer = Layer.effect(
  SharedCatalog,
  Effect.gen(function*() {
    // Same `require-yield` satisfaction as the other build bodies in this file — the counter IS the observation, so
    // there is nothing to await, and `Layer.succeed` would delete the measurement.
    yield* Effect.void
    sharedCatalogBuilds += 1
    return SharedCatalog.of({ listPrice: 100, buildOrdinal: sharedCatalogBuilds })
  })
)

// The Rule's `extraLayer`, and the whole point of this block.
const ruleDiscountLayer = Layer.effect(
  RuleDiscount,
  Effect.gen(function*() {
    ruleDiscountBuilds += 1
    const catalog = yield* SharedCatalog
    return RuleDiscount.of({ netPrice: catalog.listPrice - 10, buildOrdinal: ruleDiscountBuilds })
  })
)

// The SHARED build each Rule Scenario reached.
const ruleSharedOrdinals: Array<number> = []

// The RULE build each Rule Scenario reached, in the same run.
const ruleExtraOrdinals: Array<number> = []

// The derived price each Rule Scenario read — 90, which this file never writes down.
const ruleNetPrices: Array<number> = []

// The full name of each Rule Scenario under the shared Feature that ran to completion.
const sharedRuleScenarioNames: Array<string> = []

// ONE `Rule:` containing two Scenarios, under a Feature declared with `{ shared, perScenario }`.
const sharedRuleFeature = Effect.runSync(
  parseFeature(
    `Feature: Shared rule composition

  Rule: discounted checkout under a shared catalog

    Scenario: the first rule scenario under a shared feature reads both tiers
      When the first shared rule scenario reads both tiers
      Then the shared rule scenario is done

    Scenario: the second rule scenario under a shared feature rebuilds only the rule tier
      When the second shared rule scenario reads both tiers and the shared build count
      Then the shared rule scenario is done
`,
    "test/shared-rule-composition.feature"
  ).pipe(Effect.provide(ParameterTypeStore.Default))
)

// THE FOURTEENTH real `describeFeature` call in this file, and the THIRD to pass the object form.

// DECLARED LAST IN THIS FILE, after the block that registered the Feature, for the declaration-order reason every
// other reader here uses.
orderedBlock(() => {
  describeFeature(sharedRuleFeature, { shared: sharedCatalogLayer, perScenario: Layer.empty }, ({ Rule }) => {
    Rule("discounted checkout under a shared catalog", ruleDiscountLayer, ({ Then, When }) => {
      When("the first shared rule scenario reads both tiers", function*() {
        const catalog = yield* SharedCatalog
        const discount = yield* RuleDiscount

        // 100 is the shared tier's own constant; 90 is reachable ONLY if the Rule's Layer built with `SharedCatalog`
        // resolved from the ambient context — see the block header.
        assert.strictEqual(catalog.listPrice, 100)
        assert.strictEqual(discount.netPrice, 90)

        ruleSharedOrdinals.push(catalog.buildOrdinal)
        ruleExtraOrdinals.push(discount.buildOrdinal)
        ruleNetPrices.push(discount.netPrice)
      })

      When("the second shared rule scenario reads both tiers and the shared build count", function*() {
        assert.strictEqual(sharedCatalogBuilds, 1)

        const catalog = yield* SharedCatalog
        const discount = yield* RuleDiscount

        assert.strictEqual(catalog.listPrice, 100)
        assert.strictEqual(discount.netPrice, 90)

        ruleSharedOrdinals.push(catalog.buildOrdinal)
        ruleExtraOrdinals.push(discount.buildOrdinal)
        ruleNetPrices.push(discount.netPrice)
      })

      // ONE definition matched by both Scenarios — `currentTestName()` differs per running test.
      Then("the shared rule scenario is done", function*() {
        // Same `require-yield` satisfaction as the other assertion-only bodies in this file.
        yield* Effect.void
        sharedRuleScenarioNames.push(currentTestName())
      })
    })
  })

  describe("a Rule's own extraLayer under a shared Feature rebuilds only the Rule tier", () => {
    it("gave both Rule Scenarios the SAME single shared build", () => {
      expect(ruleSharedOrdinals).toEqual([1, 1])
    })

    it("rebuilt the Rule's own extraLayer once per Scenario in the Rule", () => {
      expect(ruleExtraOrdinals).toEqual([1, 2])
    })

    it("computed the Rule tier's price from the SHARED tier's, in both Scenarios", () => {
      expect(ruleNetPrices).toEqual([90, 90])
    })

    it("emitted both Scenarios under the Feature AND under the Rule", () => {
      // The Rule's name must sit BETWEEN the Feature's and the Scenario's.
      expect(sharedRuleScenarioNames).toEqual([
        `Shared rule composition${nameSeparator}discounted checkout under a shared catalog${nameSeparator}the first rule scenario under a shared feature reads both tiers`,
        `Shared rule composition${nameSeparator}discounted checkout under a shared catalog${nameSeparator}the second rule scenario under a shared feature rebuilds only the rule tier`
      ])
    })
  })
})

// How many times this block's shared tier has been built.
let excludedEverythingSharedBuilds = 0

// The shared tier's probe service, mirroring `SharedProbe`'s shape one section above.
class ExcludedEverythingProbe
  extends Context.Service<ExcludedEverythingProbe, { readonly buildOrdinal: number }>()("ExcludedEverythingProbe")
{}

// The shared tier.
const excludedEverythingSharedLayer = Layer.effect(
  ExcludedEverythingProbe,
  Effect.gen(function*() {
    // Same `require-yield` satisfaction as `sharedProbeLayer`'s body.
    yield* Effect.void
    excludedEverythingSharedBuilds += 1
    return ExcludedEverythingProbe.of({ buildOrdinal: excludedEverythingSharedBuilds })
  })
)

// The full name of every Scenario in this block that actually ran.
const excludedEverythingRan: Array<string> = []

// How many times this block's `AfterAllScenarios` ran.
let excludedEverythingTeardowns = 0

// ONE Scenario, tagged so `excludeTags` removes it — the whole Feature has nothing runnable.
const excludedEverythingFeature = Effect.runSync(
  parseFeature(
    `Feature: Excluded everything still reports its unused step definition

  @excluded-everything
  Scenario: the only scenario, entirely excluded by the tag filter
    When the excluded-everything step runs
`,
    "test/excluded-everything.feature"
  ).pipe(Effect.provide(ParameterTypeStore.Default))
)

// THE FIFTEENTH real `describeFeature` call in this file, and the first to combine the object form with an
// `excludeTags` filter that removes every Scenario.

// DECLARED LAST IN THIS FILE, after the block that registered the Feature, for the declaration-order reason every
// other reader here uses.
orderedBlock(() => {
  describeFeature(
    excludedEverythingFeature,
    { shared: excludedEverythingSharedLayer, perScenario: Layer.empty },
    ({ AfterAllScenarios, When }) => {
      // Registered, and a no-op: with nothing attempted the teardown must not run (F-06), which is also the only way
      // it could not force the shared tier's build it would otherwise need.
      AfterAllScenarios(function*() {
        yield* Effect.void
        excludedEverythingTeardowns += 1
      })
      // The ONE definition the Feature's only Scenario's step matches — never reached, because the Scenario is
      // excluded before anything is emitted (note (g)).
      When("the excluded-everything step runs", function*() {
        excludedEverythingRan.push(currentTestName())
        yield* Effect.void
      })
      // The UNUSED definition — the entire reason this block exists.
      When("the excluded-everything step that no Scenario in this Feature calls", function*() {
        yield* Effect.void
      })
    },
    { excludeTags: ["@excluded-everything"] }
  )

  describe("a shared Layer with every Scenario excluded stays unbuilt, even with an unused step definition", () => {
    it("never built the shared tier — build discipline for the zero-runnable-Scenario case", () => {
      // The assertion this whole plan exists to make true.
      expect(excludedEverythingSharedBuilds).toBe(0)
    })

    it("ran no Scenario at all — separating build discipline from registration failing for an unrelated reason", () => {
      expect(excludedEverythingRan).toEqual([])
    })

    it("ran no AfterAllScenarios teardown either — nothing was attempted, so there is nothing to tear down", () => {
      expect(excludedEverythingTeardowns).toBe(0)
    })

    it("still reported the unused step definition — the load-bearing non-vacuity control", () => {
      const unusedDefinitionLines = warningsFor(excludedEverythingFeature.uri).filter((line) =>
        line.includes("UnusedStepDefinition")
      )
      expect(unusedDefinitionLines).toHaveLength(1)
      expect(unusedDefinitionLines[0]).toContain(
        JSON.stringify("the excluded-everything step that no Scenario in this Feature calls")
      )
    })
  })
})

// --------------------------------------------------------------------------------------------- F-18 / BEH-EC-007:
// the per-Scenario tier may be built FROM the shared tier.

class DependentCatalog extends Context.Service<DependentCatalog, { readonly buildOrdinal: number }>()(
  "emission/DependentCatalog"
) {}

let dependentCatalogBuilds = 0

const dependentCatalogLayer: Layer.Layer<DependentCatalog, never, never> = Layer.effect(
  DependentCatalog,
  Effect.sync(() => {
    dependentCatalogBuilds += 1
    return DependentCatalog.of({ buildOrdinal: dependentCatalogBuilds })
  })
)

class DependentWorld extends Context.Service<DependentWorld, {
  readonly catalogOrdinal: number
  readonly worldOrdinal: number
}>()("emission/DependentWorld") {}

let dependentWorldBuilds = 0

// Built FROM the shared tier: `Layer<DependentWorld, never, DependentCatalog>`, the F-18 shape.
const dependentWorldLayer: Layer.Layer<DependentWorld, never, DependentCatalog> = Layer.effect(
  DependentWorld,
  Effect.gen(function*() {
    const catalog = yield* DependentCatalog
    dependentWorldBuilds += 1
    return DependentWorld.of({ catalogOrdinal: catalog.buildOrdinal, worldOrdinal: dependentWorldBuilds })
  })
)

const seenDependentWorldOrdinals = new Set<number>()

const dependentTierFeature = Effect.runSync(
  parseFeature(
    `Feature: perScenario built from shared
  Scenario: the first dependent scenario
    When the dependent world is read
  Scenario: the second dependent scenario
    When the dependent world is read
  Scenario: the third dependent scenario
    When the dependent world is read
`,
    "test/per-scenario-from-shared.feature"
  ).pipe(Effect.provide(ParameterTypeStore.Default))
)

describeFeature(
  dependentTierFeature,
  { shared: dependentCatalogLayer, perScenario: dependentWorldLayer },
  ({ When }) => {
    When("the dependent world is read", function*() {
      const world = yield* DependentWorld
      // The shared tier was built exactly once, and the per-Scenario tier read THAT build.
      assert.strictEqual(world.catalogOrdinal, 1)
      assert.strictEqual(dependentCatalogBuilds, 1)
      // The per-Scenario tier is still fresh per Scenario: no ordinal is seen twice.
      assert.isFalse(seenDependentWorldOrdinals.has(world.worldOrdinal))
      seenDependentWorldOrdinals.add(world.worldOrdinal)
    })
  }
)

// F-09 — a `shared` Layer's lifetime is the FEATURE's block, not the file's.
const sharedLifecycleLog: Array<string> = []

class LifecycleA extends Context.Service<LifecycleA, { readonly name: string }>()("LifecycleA") {}
class LifecycleB extends Context.Service<LifecycleB, { readonly name: string }>()("LifecycleB") {}

const lifecycleLayerA = Layer.effect(
  LifecycleA,
  Effect.acquireRelease(
    Effect.sync(() => {
      sharedLifecycleLog.push("acquired-A")
      return LifecycleA.of({ name: "A" })
    }),
    () => Effect.sync(() => void sharedLifecycleLog.push("released-A"))
  )
)

const lifecycleLayerB = Layer.effect(
  LifecycleB,
  Effect.acquireRelease(
    Effect.sync(() => {
      sharedLifecycleLog.push("acquired-B")
      return LifecycleB.of({ name: "B" })
    }),
    () => Effect.sync(() => void sharedLifecycleLog.push("released-B"))
  )
)

const lifecycleFeatureA = Effect.runSync(
  parseFeature(
    `Feature: Shared lifecycle A

  Scenario: the first lifecycle feature reads its own shared tier
    When the lifecycle A step reads its shared service
`,
    "test/shared-lifecycle-a.feature"
  ).pipe(Effect.provide(ParameterTypeStore.Default))
)

const lifecycleFeatureB = Effect.runSync(
  parseFeature(
    `Feature: Shared lifecycle B

  Scenario: the second lifecycle feature starts after the first one released
    When the lifecycle B step reads its shared service and the log so far
`,
    "test/shared-lifecycle-b.feature"
  ).pipe(Effect.provide(ParameterTypeStore.Default))
)

orderedBlock(() => {
  describeFeature(lifecycleFeatureA, { shared: lifecycleLayerA, perScenario: Layer.empty }, ({ When }) => {
    When("the lifecycle A step reads its shared service", function*() {
      const a = yield* LifecycleA
      sharedLifecycleLog.push(`scenario-${a.name}`)
    })
  })

  describeFeature(lifecycleFeatureB, { shared: lifecycleLayerB, perScenario: Layer.empty }, ({ When }) => {
    When("the lifecycle B step reads its shared service and the log so far", function*() {
      const b = yield* LifecycleB
      // THE claim: A was released before B was acquired — i.e.
      assert.deepStrictEqual(sharedLifecycleLog, ["acquired-A", "scenario-A", "released-A", "acquired-B"])
      sharedLifecycleLog.push(`scenario-${b.name}`)
    })
  })

  describe("a shared Layer is released when its Feature's block ends, not when the file does", () => {
    it("closed each Feature's shared tier before the next Feature's opened, and B's at its own end", () => {
      expect(sharedLifecycleLog).toEqual([
        "acquired-A",
        "scenario-A",
        "released-A",
        "acquired-B",
        "scenario-B",
        "released-B"
      ])
    })
  })
})

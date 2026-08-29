/**
 * The end-to-end proof: a real `.feature` source, a real `describeFeature` call, and real vitest
 * tests that this suite runs and reports.
 *
 * **This is the ONLY file in this repo that calls `describeFeature` for real.** Everything else
 * asserts against a value — `Plan.test.ts` against a `FeaturePlan`, `ScenarioEffect.test.ts` against
 * an Effect, `Runner.test.ts` against a recording fake, `describeFeature.test.ts` against a
 * `FeatureCollection`. Each of those is sharper than this file at the one thing it tests, and not
 * one of them can see the defect this file exists for: `describeFeature` collecting and planning
 * perfectly and then emitting NOTHING. Every assertion in the repo stays green under that mutation,
 * because a suite that registers no tests has no failing test in it. That is `describeFeature.test.ts`
 * mutation D and this file's own mutation C, and the LAST block in this file is where it goes red —
 * see that block, and see the mutation record below for why it is a separate block rather than
 * something the emitted tests could assert about themselves.
 *
 * ## The Feature is deliberately, entirely happy-path
 *
 * Every step matches exactly one definition and every step succeeds. An undefined or ambiguous step
 * here would emit a genuinely FAILING test into this repo's own suite, and a red build is not a
 * legible way to assert that drift detection works. Those cases are covered against values instead —
 * `Plan.test.ts` for the resolution outcome and the message text, `ScenarioEffect.test.ts` for the
 * failure landing in the Scenario's error channel at the position the step occupies.
 *
 * The one deviation from happy-path is the unused pattern in the drift block below, and it is safe
 * for the same reason: ADR-EC-019 makes an unused pattern a WARNING, so its emitted node PASSES.
 *
 * ## What the emitted tests assert, and why they are written this way
 *
 * The Scenario bodies read a `Ref` out of the ambient Layer and compare the whole accumulated log,
 * not just the last entry. Three separate properties fall out of that one comparison, and each has a
 * silent failure mode:
 *
 * - **The Background ran, and ran FIRST.** The log must open with `opened`. A runner that dropped the
 *   Background, or appended it after the Scenario's own steps, still produces a passing-looking
 *   two-step test — only the ORDER of the joined string separates the three arrangements.
 * - **The steps ran in document order.** `When` before `Then`, which is the `for`-loop-of-`yield*`
 *   INV-EC-001 depends on.
 * - **Each Scenario got its OWN Layer build** (INV-EC-002). The two Scenarios append different
 *   entries, so a Layer built once and shared would leave the second Scenario reading
 *   `opened,first,opened,second` and fail. A per-Scenario-fresh Layer is the default and the only
 *   behaviour this phase implements; ADR-EC-018's shared path is Phase 10's.
 *
 * The `Then` body additionally asserts on vitest's own `currentTestName`, which is the full
 * ancestor path of the running test. It must START with the Feature's name — that is what separates
 * `describe(feature.name) → test` from a test emitted as a sibling of the block, an arrangement with
 * the identical test names and the identical pass count. `Runner.test.ts` proves the same property
 * structurally against a recording fake by recording a nesting DEPTH; this proves it against the
 * real framework, which is the half a fake cannot.
 *
 * ## Why the terminal-channel block stubs at MODULE scope and asserts inside an `it`
 *
 * `describeFeature` REGISTERS test nodes, and vitest rejects a registration made while a test is
 * running. So the stub-call-restore sequence cannot live inside the `it` that asserts on it: it runs
 * at collection time, records into a module-scope array, and the `it` reads that array afterwards.
 * The original `console.warn` is restored in a `finally`, so a throw from `describeFeature` cannot
 * leak the stub into the rest of the run (threat T-06-07-06) — a leaked stub would silence every
 * later warning in the process and make two consecutive `pnpm test` runs disagree.
 *
 * ## Mutation-tested (all three performed, then reverted)
 *
 * - A. `describeFeature` warns from inside `collect` instead of from its own body → the
 *      `collectFeature`-stays-silent assertion fails, and only that one: the recorder gains a
 *      second call.
 * - B. `describeFeature`'s warn call is passed a string rebuilt at the call site instead of
 *      `warning.message` → the assertion that the printed text contains the definition site fails,
 *      and only that one. The rebuilt message still contained the pattern, the keyword and the
 *      Feature name, so the three assertions above it all passed — the SITE is the fact a rebuild
 *      loses, which is why it is asserted separately rather than folded into a single match.
 * - C. `describeFeature` calls `collect` and never emits → the `completedScenarios` assertion in the
 *      last block fails.
 *
 * **Mutation C SURVIVED the first version of this file, and that is why the last block exists.**
 * The first draft asserted only on what the emitted tests did while running. With nothing emitted,
 * nothing ran, nothing asserted, and vitest reported `7 passed → 3 passed` — a green suite, a
 * smaller number, and no failure anywhere. The repo-wide count went 522 → 518 just as quietly. A
 * test suite cannot notice a test that was never registered by looking at the tests that were; it
 * has to count them from the inside, which is what `completedScenarios` does.
 *
 * ## Imports
 *
 * `../src/describeFeature.ts` directly, never `../src/index.ts`:
 * `effect/no-import-from-barrel-package` runs with `checkRelativeIndexImports: true` and fails
 * `pnpm lint` on a relative value-import whose basename is `index.*`. `collectFeature` is not in
 * that barrel anyway.
 *
 * `expect` appears only in the synchronous `it` bodies and in the `currentTestName` reader; every
 * assertion inside an emitted step body uses `assert`, because oxlint's
 * `vitest/no-standalone-expect` does not recognise an Effect-bodied test as a test block. Same rule,
 * same workaround, as `test/Step.test.ts` and `test/describeFeature.test.ts`.
 */
import { ParameterTypeStore, parseFeature } from "@effect-cucumber/gherkin"
import { assert, describe, expect, it } from "@effect/vitest"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Ref from "effect/Ref"
import { collectFeature, describeFeature } from "../src/describeFeature.ts"
import type { ScenarioDsl } from "../src/Dsl.ts"

/**
 * Captured BEFORE anything below installs a stub, so the restore assertion can compare by
 * REFERENCE.
 *
 * The weaker checks all pass against a leaked stub: it is still a function, it is still callable,
 * and it still has arity 0. Only identity separates "restored" from "replaced by something that
 * looks like it" — and calling the thing to see whether it records would print to this suite's own
 * stderr, which is noise a test should not manufacture.
 */
const originalConsoleWarn = globalThis.console.warn

/**
 * The ambient service the emitted Scenarios read and write.
 *
 * A `Ref` inside a service rather than a module-scope array, which is RUN-06's convention and is
 * also the only shape that can observe per-Scenario Layer freshness: a module-scope array is one
 * array however many times the Layer was built, so it cannot tell one build from two.
 */
class Log extends Context.Service<Log, { readonly entries: Ref.Ref<ReadonlyArray<string>> }>()("Log") {}

/** Plain `Layer` form, which is the PER-SCENARIO scope — rebuilt fresh for every Scenario. */
const logLayer = Layer.effect(
  Log,
  Effect.gen(function*() {
    const entries = yield* Ref.make<ReadonlyArray<string>>([])
    return Log.of({ entries })
  })
)

/** Append one entry to the ambient log. */
const append = (entry: string) =>
  Effect.gen(function*() {
    const { entries } = yield* Log
    yield* Ref.update(entries, (current) => [...current, entry])
  })

/**
 * The full ancestor path of the currently running test, as vitest reports it.
 *
 * Read through `expect.getState()` rather than hard-coding vitest's `" > "` separator, and asserted
 * with `startsWith` for the same reason: the property under test is that the Feature's name is an
 * ANCESTOR of the test, not what character joins the two.
 */
const currentTestName = (): string => expect.getState().currentTestName ?? ""

/**
 * How vitest joins a test's ancestor names into `currentTestName`.
 *
 * Pinned as a constant rather than inlined below, so a vitest upgrade that changes the separator is
 * one obvious edit here instead of two mysterious string mismatches in an assertion about nesting.
 */
const nameSeparator = " > "

/**
 * The full name of every emitted Scenario that ran to completion, in the order they finished.
 *
 * This array is what makes "emitted zero tests" a FAILURE rather than a smaller pass count, and it
 * was added because the mutation was run and SURVIVED without it: `describeFeature` calling `collect`
 * and never emitting took this file from 7 passing tests to 3 and the repo from 522 to 518, with
 * nothing red anywhere. That is threat T-06-07-05 exactly — a Feature that silently emits nothing —
 * and a suite cannot notice a test that was never registered by looking at the tests that were. It
 * has to count them from the inside.
 *
 * Read by the LAST `describe` block in this file. Vitest runs a file's suites in declaration order,
 * so both Scenarios above have finished by the time that block's assertion executes.
 */
const completedScenarios: Array<string> = []

/**
 * Real source, parsed by the real parser. Never a fabricated `ParsedFeature` and never a type
 * assertion — the whole point of this file is that the value crossing the package boundary is the
 * one a user's `.feature` file produces.
 *
 * `parseFeature` needs only `ParameterTypeStore` (ADR-EC-023) and `ParameterTypeStore.Default` is
 * `Layer.succeed`-backed, so this resolves at module scope with `runSync` and no await — which it
 * must, because `describeFeature` below is called at module scope too.
 */
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

// THE CALL UNDER TEST. At module scope, exactly as a test author writes it, with nothing wrapping
// it and nothing intercepting it. Everything below this line in this block is asserted by vitest
// RUNNING what this registered.
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

    // The WHOLE log, joined — see the header. Comparing only the last entry passes against a
    // runner that dropped the Background or ran the steps out of order.
    assert.strictEqual(actual, expected)

    // Nesting, against the real framework: the Feature's name must be an ANCESTOR of this test.
    // Emitted as siblings of the block instead, every name and every result here is identical and
    // this is the only line that changes.
    assert.isTrue(
      currentTestName().startsWith(emissionFeature.name),
      `expected the running test to be nested inside ${JSON.stringify(emissionFeature.name)}, `
        + `but its full name is ${JSON.stringify(currentTestName())}`
    )

    // LAST line of the last step of each Scenario, so reaching it means every step before it
    // succeeded. Read by the final block in this file — see `completedScenarios`.
    completedScenarios.push(currentTestName())
  })
})

/**
 * A second, smaller Feature for the drift block, so the happy-path Feature above stays free of a
 * pattern that matches nothing.
 */
const driftFeature = Effect.runSync(
  parseFeature(
    `Feature: Drift
  Scenario: one matched step
    Given a step this Feature really has
`,
    "test/drift.feature"
  ).pipe(Effect.provide(ParameterTypeStore.Default))
)

/** The pattern nothing in `driftFeature` uses. MATCH-05's whole subject. */
const unusedPattern = "a step no Scenario in this Feature ever writes"

/** ONE define callback, so the two calls below differ in nothing but which entry point they are. */
const defineWithOneUnusedPattern = (dsl: ScenarioDsl<never>): void => {
  dsl.Given("a step this Feature really has", function*() {
    yield* Effect.void
  })
  dsl.Given(unusedPattern, function*() {
    yield* Effect.void
  })
}

/**
 * Every argument list `console.warn` was called with while the recorder was installed, across BOTH
 * calls below, in order.
 */
const warnCalls: Array<ReadonlyArray<unknown>> = []

/**
 * Run `emit` with `console.warn` recording into `warnCalls`, and hand back the count afterwards.
 *
 * The restore is in a `finally` so a throw from `emit` cannot leave the stub installed for the rest
 * of the process (T-06-07-06). The original is captured per call rather than once at module scope,
 * so this composes with any other stub a future test installs instead of clobbering it.
 */
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

// Both at module scope, and in this order: `describeFeature` registers test nodes, and vitest
// rejects a registration made from inside a running test.
const countAfterDescribeFeature = recordWarnings(() => {
  describeFeature(driftFeature, Layer.empty, defineWithOneUnusedPattern)
})

const countAfterCollectFeature = recordWarnings(() => {
  collectFeature(driftFeature, Layer.empty, defineWithOneUnusedPattern)
})

describe("an unused step definition reaches the terminal exactly once", () => {
  it("prints one warning naming the pattern, the keyword and the Feature", () => {
    // Exactly one, not "at least one": a warn per definition rather than per UNUSED definition
    // would print two here, and both messages would still contain the right words.
    expect(countAfterDescribeFeature).toBe(1)

    // One ARGUMENT, and it is the message `Plan.ts` built. Passing the whole warning object, or a
    // format string plus substitutions, would render differently in every consumer's terminal.
    expect(warnCalls[0]).toHaveLength(1)

    const printed = String(warnCalls[0]?.[0])
    expect(printed).toContain(unusedPattern)
    expect(printed).toContain("Given")
    expect(printed).toContain("Drift")

    // The definition SITE, which is the fact a developer reaches for first and the one a rebuilt
    // message loses. Mutation B is exactly that rebuild, and this is the line it fails.
    expect(printed).toContain("emission.test.ts")
  })

  it("stays silent for collectFeature, which shares the same collect implementation", () => {
    // ZERO further calls — not "one call total", which the previous test already established. This
    // is the assertion mutation A fails: warning from inside `collect` makes this 2, while every
    // other assertion in this file goes on passing.
    expect(countAfterCollectFeature).toBe(countAfterDescribeFeature)
  })

  it("restored the original console.warn, by reference", () => {
    // The `finally`'s standing proof, and asserted by IDENTITY — see `originalConsoleWarn`. A
    // leaked stub silences every later warning in the process and makes two consecutive `pnpm test`
    // runs disagree, a failure that would otherwise surface in some unrelated file days later.
    expect(globalThis.console.warn).toBe(originalConsoleWarn)
  })
})

/**
 * DECLARED LAST ON PURPOSE. Vitest runs a file's suites in declaration order, so the two emitted
 * Scenarios have already run and recorded themselves by the time this executes.
 */
describe("describeFeature emitted tests that actually ran", () => {
  it("completed one test per Scenario, in document order, each nested under the Feature", () => {
    // ONE positional comparison over the WHOLE array, never a `.length` check and never a
    // `.some(...)` search. It pins four separate properties at once, and each has its own silent
    // failure mode: that tests were emitted AT ALL (T-06-07-05, and the mutation that survived
    // before this assertion existed), that there is exactly one per Scenario rather than one per
    // step or one per Feature, that they ran in the order the document lists them, and that the
    // Feature's name is their parent rather than their sibling.
    expect(completedScenarios).toEqual([
      `Emission${nameSeparator}the first scenario records its own entry`,
      `Emission${nameSeparator}the second scenario records a different entry`
    ])
  })
})

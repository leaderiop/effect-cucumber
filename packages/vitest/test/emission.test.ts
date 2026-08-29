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
 * - D. `Runner.ts`'s `AfterAllScenarios` node is never emitted (its `if (hooks.AfterAllScenarios.length
 *      > 0)` guard forced to skip) → every emitted hook test still PASSES (nothing downstream of the
 *      node depends on it), and only the new final block's "exactly once and last" assertion fails,
 *      because `hookLog`'s last two entries are Scenario 2's own `after2:start`/`:end` instead of
 *      `afterAllScenarios:start`/`:end`.
 * - E. `BeforeAllScenarios` composed inside `ScenarioEffect.ts`'s `buildScenarioEffect` (run once per
 *      Scenario execution) instead of through `Runner.ts`'s once-cell → the second hook Scenario's own
 *      `Then` body assertion fails: its log prefix gains a SECOND `beforeAllScenarios:start`/`:end`
 *      pair ahead of its own `Before`, so both the exact-array comparison and the
 *      exactly-one-`beforeAllScenarios:start` count assertion fail.
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

/**
 * Task 2: all six hooks, through a REAL `describeFeature` call — the second (and last) real call in
 * this file, against its own fixture, so the happy-path Feature above and its assertions stay
 * completely untouched.
 *
 * `hookLog` is a plain module-scope array, not a `Recorder`-style `Context.Service` — deliberately.
 * The happy-path Feature above already proves per-Scenario Layer freshness (INV-EC-002); this block
 * proves hook ORDERING across a real run, for which a closed-over array is adequate, and it lets every
 * hook and step body below stay a plain `Effect.sync`-free generator that requires no service at all
 * (the ambient Layer is `Layer.empty`), mirroring `completedScenarios`'s own "read the module-scope
 * array directly" convention.
 *
 * Every hook and every step body brackets a real suspension with `${name}:start`/`Effect.yieldNow`/
 * `${name}:end` — `test/Runner.test.ts`'s `recordingHook`/`bracketedStep` convention, copied here for
 * the identical reason: without the suspension, this ordering assertion cannot tell sequential
 * execution from concurrent execution that happens to finish in the same tick.
 */
const hookLog: Array<string> = []

/** A bare generator that brackets `${name}:start`/`${name}:end` around a real suspension in `hookLog`. */
const bracketed = (name: string) =>
  function*() {
    hookLog.push(`${name}:start`)
    yield* Effect.yieldNow
    hookLog.push(`${name}:end`)
  }

/**
 * A second, smaller Feature — its own fixture, per the header, so the happy-path Feature's assertions
 * above never have to change. Two Scenarios, each with a `When` (records its own position) and a
 * `Then` (asserts the whole log's prefix it can legitimately see at that point, THEN returns without
 * itself appending anything — the assertion must run before its own `AfterStep`/`After` entries land,
 * or it could not tell "what I can see so far" from "what I will see once I'm done").
 */
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

// THE second and LAST real `describeFeature` call in this file. Registers only succeeding hooks and
// steps — the header's founding constraint — and asserts entirely from inside the emitted bodies and
// the final sync block below, never by re-deriving the plan's expectations here.
describeFeature(
  hooksFeature,
  Layer.empty,
  ({ After, AfterAllScenarios, AfterStep, Before, BeforeAllScenarios, BeforeStep, Then, When }) => {
    // Two Before hooks and two After hooks — registration order (D-01) is observable in a real run,
    // not only against `test/Runner.test.ts`'s recording fake.
    Before(bracketed("before1"))
    Before(bracketed("before2"))
    After(bracketed("after1"))
    After(bracketed("after2"))
    // One BeforeStep and one AfterStep — wraps EVERY resolved step, the `When` and the `Then` alike.
    BeforeStep(bracketed("beforeStep"))
    AfterStep(bracketed("afterStep"))
    // One BeforeAllScenarios and one AfterAllScenarios — the once-cell and the trailing node.
    BeforeAllScenarios(bracketed("beforeAllScenarios"))
    AfterAllScenarios(bracketed("afterAllScenarios"))

    When("I run the first hook scenario's own step", bracketed("scenario1-step"))
    Then("the first hook scenario's log matches its own legitimate prefix", function*() {
      // A bare assertion body has no Effect to `yield*` on its own — `Effect.void` satisfies
      // oxlint's `require-yield` (a generator with no `yield` at all is rejected) without asserting
      // anything itself.
      yield* Effect.void
      // What Scenario 1 can legitimately see at this point: ONE BeforeAllScenarios pair (this Scenario
      // is the first to run, so the once-cell's body runs here), its own two Before hooks, its own
      // first step's BeforeStep/step/AfterStep unit, and its own second step's BeforeStep — but NOT
      // that second step's own AfterStep, and NOT its Scenario-level After hooks: both run only AFTER
      // this assertion returns.
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
      // Scenario 2's own legitimate prefix: everything Scenario 1 saw AND did (its own AfterStep and
      // After hooks now present too, since Scenario 1 fully completed first), followed by Scenario 2's
      // own Before hooks, first step's unit, and second step's BeforeStep — mutation E's target: were
      // BeforeAllScenarios composed per Scenario instead of through the once-cell, a SECOND
      // `beforeAllScenarios:start`/`:end` pair would appear right before this Scenario's own `Before`.
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
      // The other half of mutation E's target, stated as a count rather than a position: no matter
      // where a stray second pair would land, there must be exactly ONE `beforeAllScenarios:start` in
      // the whole prefix Scenario 2 can see.
      assert.strictEqual(hookLog.filter((entry) => entry === "beforeAllScenarios:start").length, 1)
    })
  }
)

/**
 * DECLARED LAST ON PURPOSE, after every other `describe` block in this file — the identical
 * "vitest runs a file's suites in declaration order" reasoning `completedScenarios`'s own last block
 * uses. Both hook Scenarios above, and the `⚙ AfterAllScenarios` node emitted after them, have already
 * run by the time this executes.
 *
 * This is the real-run half of roadmap success criterion 3/D-09: `test/Runner.test.ts`'s recording
 * fake can prove the `AfterAllScenarios` node was EMITTED at the right position, but only a real vitest
 * run — this file — can prove it was actually EXECUTED, since a recording fake never runs anything on
 * its own.
 */
describe("the hook Feature's real-run AfterAllScenarios proof", () => {
  it("ran the AfterAllScenarios node last, and its own hook exactly once", () => {
    // Mutation D's target: an `AfterAllScenarios` node that was never emitted leaves the log ending
    // with Scenario 2's own `after2:start`/`:end` instead.
    expect(hookLog.slice(-2)).toEqual(["afterAllScenarios:start", "afterAllScenarios:end"])
    // Exactly once — not "at least once", which the position check above already implies but does not
    // by itself rule out a stray extra pair earlier in the log.
    expect(hookLog.filter((entry) => entry === "afterAllScenarios:start")).toHaveLength(1)
  })
})

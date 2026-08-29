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
 * There are exactly TWO deviations from happy-path, and each is safe for a reason that has to be
 * stated rather than assumed, because "a step that resolves to nothing" is otherwise the one thing
 * this file forbids.
 *
 * - The unused pattern in the drift block below. ADR-EC-019 makes an unused pattern a WARNING, so its
 *   emitted node PASSES.
 * - The unmatched STEP inside a `@skip`-tagged Scenario in Phase 9's skip block. `planFeature` stores
 *   an unresolved step rather than throwing, and its `StepMatchError` is only reached at `yield*` time
 *   inside the Scenario's Effect — which a skipped test never builds, because its handler is never
 *   invoked. So the node reports SKIPPED, never undefined and never failed. That block's own comment
 *   has the full chain; this bullet exists so the rule above is not read as having been broken.
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
 * ## Phase 9's tag blocks are appended AFTER every block above, and that placement is load-bearing
 *
 * Every reader block in this file reads a module-scope array and depends on vitest running a file's
 * suites in declaration order. Appending the tag blocks at the END is therefore the only placement
 * that leaves all of them meaning exactly what they meant: nothing a tag block registers can run
 * before a pre-Phase-9 reader has already made its assertion. Each tag block brings its OWN counters,
 * for the reason the hook Feature brought its own fixture — a shared counter would make one block's
 * assertion depend on another block's arrangement.
 *
 * The tag blocks are also the only ones in this file whose COLLECTION can fail for a reason that has
 * nothing to do with what they assert. `vitest.config.ts` declares a closed tag list and vitest's
 * `strictTags` defaults to `true`, so emitting a tag that file does not declare THROWS at collection
 * time — and, left alone, would take the WHOLE file to zero tests, every block in it, not just the
 * offending Scenario. `describeFeature.ts`'s adapter catches that throw and re-emits the Scenario
 * untagged with one located warning (D-08), which is the only reason a stray tag in any block below
 * costs a Scenario its tags instead of costing this file all of its tests. Both halves were run:
 * with the degradation intact an undeclared tag here leaves the file green and prints one warning;
 * with the degradation bypassed the same tag produces `Tests no tests`. That is why one of these
 * blocks deliberately emits `@undeclared-on-purpose`, and why `vitest.config.ts` note (d) reserves
 * that tag and forbids declaring it.
 *
 * ## The Scenario Outline block is here rather than in a value-asserting file
 *
 * Pitfall 34 — every generated Outline test observing the LAST row's data — is a RUNTIME property,
 * and `test/Runner.test.ts`'s recording fake cannot see it: the fake records the thunks and never
 * executes them, so an implementation that hands all three thunks one shared, still-mutating
 * structure records three perfectly correct-looking entries. Only a real run can tell three
 * independent tests from three tests that happen to have three different titles. That is the same
 * fake-cannot-run-anything argument the `AfterAllScenarios` block below already makes, applied to
 * per-row data instead of to hook execution. See `outlineRowValues`.
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
 * ## Mutation-tested (every one performed, run, then reverted)
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
 * - F, G, H. Plan 08-07's three, recorded on the Rule-composition block at the bottom of this file
 *      rather than here, beside the arrangement they mutate.
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
import { assert, beforeAll, describe, expect, it } from "@effect/vitest"
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
 * Task 2: all six hooks, through a REAL `describeFeature` call — the second real call in this file,
 * against its own fixture, so the happy-path Feature above and its assertions stay completely
 * untouched. (The third is the Pitfall 34 Outline below, the fourth 08-07's Rule composition; Phase
 * 9's tag blocks at the end of this file add six more.)
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

// THE second real `describeFeature` call in this file. Registers only succeeding hooks and
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
 * Pitfall 34, proved against a real run: three Outline rows, three independent tests, each observing
 * only its OWN row's value.
 *
 * The bug this exists for is not the naive `for (const row of rows)` capture — `const` in a
 * `for...of` is per-iteration in modern JS and that form is safe. The live shape for this project is
 * the one PITFALLS.md calls a direct cousin of ADR-EC-009: a single mutable structure that
 * registration keeps appending to, read at EXECUTION time by every emitted test, so all N tests see
 * whatever the last registration pass left behind. `@amiceli/vitest-cucumber` shipped exactly that
 * ([PR #32](https://github.com/amiceli/vitest-cucumber/pull/32)) and its Outline `context` object is
 * still constructed once and shared across rows.
 *
 * PITFALLS.md's recommended regression test is verbatim what this block is: "a 3-row Outline where
 * each row's step asserts on its own value. If all three tests see row 3's data, this is the bug."
 * Three rows and not two, because two rows cannot distinguish "every test sees the LAST row" from
 * "every test sees ITS OWN row" whenever the shared value happens to be row 2's — with three, the
 * shared-structure implementation fails on at least two of the three.
 *
 * Each row's expected value is written into the `.feature` file TWICE, in two different columns
 * (`value` and `expected`), and the step compares them. That is what makes the assertion self-
 * contained: it needs no module-scope table of what row N should see, so it cannot be satisfied by a
 * runner that hands every test the same pair as long as the pair is internally consistent — the two
 * columns come from the same ROW, so a runner that leaked row 3's `value` into row 1's test leaks
 * row 1's `expected` alongside it only if it also got the row right.
 *
 * `outlineRowValues` is the outer half, and it is here for `completedScenarios`'s reason: an
 * implementation that emitted ZERO tests for the Outline passes every in-body assertion vacuously,
 * because nothing runs to assert. The final block below counts the rows from the inside.
 *
 * The ambient Layer is `logLayer` again — the plain, per-Scenario-fresh form — so each row also gets
 * its own `Log` build, and a row reading another row's `Ref` would show up here too.
 */
const outlineRowValues: Array<string> = []

/** A three-row Outline whose every row states its own expected value in a second column. */
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

// THE THIRD real `describeFeature` call in this file. Its three emitted tests are RUN by
// this suite; the block below reads what they recorded.
describeFeature(outlineFeature, logLayer, ({ Then, When }) => {
  When("I record the row value {word}", function*(value: string) {
    // Into the ambient `Log`, which is rebuilt per Scenario — so the `Then` below can only read a
    // value its OWN row's `When` put there.
    yield* append(value)
  })

  Then("the row I ran was {word}", function*(expected: string) {
    const { entries } = yield* Log
    const observed = yield* Ref.get(entries)

    // Exactly ONE entry: a shared `Ref` across rows would accumulate three, and a `.at(-1)` check
    // would not notice.
    assert.deepStrictEqual(observed, [expected])

    // The row's own title, recorded for the outer block. 08-04's D-03 suffix is what makes these
    // three names distinguishable at all — the Outline's title text does reference `<value>` here,
    // so the base names differ too, but the suffix names both columns explicitly.
    outlineRowValues.push(currentTestName())
  })
})

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

/**
 * The outer half of the Pitfall 34 proof — see `outlineRowValues`. Declared after the block that
 * registered the Outline, for the same declaration-order reason as every other reader in this file.
 */
describe("three Outline rows ran as three independent tests", () => {
  it("emitted one test per row, each titled with its own row's values", () => {
    // ONE positional comparison over the WHOLE array. Three separate properties, three silent
    // failure modes: that the Outline emitted three tests rather than one (Pitfall 9's
    // `Map<astNodeIds[0], Pickle>` collapse), that they ran in Examples-row order, and that each
    // carries 08-04's D-03 suffix naming BOTH of its own row's columns. The in-body assertions above
    // already proved each row observed only its own value; this proves there were three of them to
    // observe anything at all.
    expect(outlineRowValues).toEqual([
      `Outline rows are independent${nameSeparator}row carrying alpha (value=alpha, expected=alpha)`,
      `Outline rows are independent${nameSeparator}row carrying beta (value=beta, expected=beta)`,
      `Outline rows are independent${nameSeparator}row carrying gamma (value=gamma, expected=gamma)`
    ])
  })
})

/**
 * Plan 08-07's end-to-end proof, and the FOURTH real `describeFeature` call in this file — the last
 * of the pre-Phase-9 ones, with the tag blocks below adding six more:
 * one `.feature` with a `Rule:` block, a Rule-scoped extra Layer, Rule-scoped hooks, and a
 * Scenario-scoped extra Layer, all composed and all observed from inside REAL running steps.
 *
 * ## Why this cannot be `test/Runner.test.ts`'s job, or `test/describeFeature.test.ts`'s
 *
 * Each of those files sees exactly one half. `describeFeature.test.ts` resolves the collected
 * `ruleLayers`/`scenarioLayers` entries directly and proves they were BUILT with the right services —
 * and cannot see which emitted test node any of them was wired to. `Runner.test.ts` proves the wiring
 * against a recording fake — and its "Layers" are marker services chosen so the fake can tell them
 * apart, never Layers a real `describeFeature` call produced. The defect neither can catch is the
 * seam between them: `describeFeature` collecting three perfectly correct maps and handing
 * `emitFeature` only the first four fields. Every assertion in both of those files stays green under
 * exactly that mutation, because neither of them runs `describeFeature`.
 *
 * ## The three tiers are told apart by a DERIVED value, not by three independent constants
 *
 * `Discount` is `Layer.effect`-built and reads `Catalog` while building, so `netPrice` (90) exists
 * only if the Rule's extra Layer was composed with `Layer.provideMerge` onto the Feature's rather than
 * merged beside it — ADR-EC-010's literal "`extraLayer` can itself depend on ambient services", and
 * the half a `Layer.succeed` constant could not express: a constant is reachable whichever combinator
 * composed it. `Currency` then formats that number, so the third tier's assertion (`€90`) is only
 * satisfiable by a Scenario whose effective Layer carries all three.
 *
 * ## The hook log lives in a service, and the `Ref` behind it is built ONCE
 *
 * `Layer.succeed` over a module-scope `Ref`, deliberately, and not `Layer.effect` — `Runner.test.ts`'s
 * `makeRecorderLayer` records the same choice for the same reason. The claim here spans TWO Scenarios,
 * and the ambient Layer is the per-Scenario-fresh form, so a `Ref` created INSIDE the Layer would be a
 * different `Ref` per Scenario and could not express a cross-Scenario ordering at all. Freshness is
 * already proven by the happy-path Feature at the top of this file; this block gives it up on purpose.
 *
 * ## Mutation-tested (all three performed, run, then reverted)
 *
 * - F. `describeFeature`'s `emitFeature` call reverted to its pre-08-07 four fields (the three new
 *      maps replaced with empty `Map`s) → 4 of this file's 20 fail, all of them this block's, and
 *      NOTHING outside it: both emitted Rule Scenarios throw `Service not found: Discount` (the
 *      Rule's Layer never reached the emitted node, so the service is absent at RUNTIME even though
 *      the step type-checked against it), and both reader blocks then fail — the hook log is 8
 *      entries instead of 16, and `ruleScenarioNames` is empty because neither Scenario reached its
 *      recording line. This is the exact seam neither `Runner.test.ts` nor `describeFeature.test.ts`
 *      can see; both stay fully green under it.
 * - G. `Hook.ts`'s `mergeHookSets` given `[...rule.After, ...feature.After]` reversed to
 *      `[...feature.After, ...rule.After]` → 4 fail across three files, of which ONE is this block's:
 *      the hook-order reader, on the unwind half alone. Every entry is still present and the `Before`
 *      half is still right, so only an ordered whole-log comparison sees it. (The other three are
 *      `Hook.test.ts`'s two direct `mergeHookSets` tests and `Runner.test.ts`'s recording-fake
 *      ordering test — the same property asserted at three levels.)
 * - H. `Runner.ts`'s per-Scenario `scenarioLayers.get(...) ?? ruleLayer` reduced to `ruleLayer` → 2
 *      fail, both this block's: the three-tier Scenario on `Service not found: Currency`, and the
 *      emitted-and-ran reader that was waiting for its name. The Rule Scenario beside it, which asked
 *      for no Layer of its own, is untouched — which is what makes the failure name the tier that
 *      broke rather than the whole block.
 */

/** The FEATURE tier: the ambient Layer's own service. */
class Catalog extends Context.Service<Catalog, { readonly listPrice: number }>()("Catalog") {}

/**
 * The RULE tier, DERIVED from the Feature's — see the block header.
 *
 * `netPrice` is not a constant this file could have written down: it is computed from `Catalog` while
 * the Layer builds, so its presence at 90 is evidence about how the two Layers were composed and not
 * merely that both are reachable.
 */
class Discount extends Context.Service<Discount, { readonly netPrice: number }>()("Discount") {}

/** The SCENARIO tier: one Scenario's own extra Layer, D-01's Scenario form. */
class Currency extends Context.Service<Currency, { readonly symbol: string }>()("Currency") {}

/** The shared hook log, reached through a service in the AMBIENT Layer rather than a bare closure. */
class HookRef extends Context.Service<HookRef, { readonly entries: Ref.Ref<ReadonlyArray<string>> }>()("HookRef") {}

/**
 * The one `Ref` every hook below writes to, created ONCE outside every Layer — see the block header.
 */
const ruleHookEntries = Ref.makeUnsafe<ReadonlyArray<string>>([])

/** The Feature's ambient Layer: the Feature tier plus the hook log. */
const ruleFeatureLayer = Layer.merge(
  Layer.succeed(Catalog, Catalog.of({ listPrice: 100 })),
  Layer.succeed(HookRef, HookRef.of({ entries: ruleHookEntries }))
)

/**
 * The Rule's extra Layer. `Layer.effect` and not `Layer.succeed`, so its `RIn` is `Catalog` and the
 * composition combinator `describeFeature.ts` uses is load-bearing rather than incidental.
 */
const discountLayer = Layer.effect(
  Discount,
  Effect.gen(function*() {
    const catalog = yield* Catalog
    return Discount.of({ netPrice: catalog.listPrice - 10 })
  })
)

/** One Scenario's own extra Layer. */
const currencyLayer = Layer.succeed(Currency, Currency.of({ symbol: "€" }))

/**
 * A bare generator that brackets `${name}:start`/`${name}:end` around a real suspension, written into
 * the `Ref` the AMBIENT Layer provides.
 *
 * `bracketed` above cannot be reused: it writes to a module-scope array, and the whole point here is
 * that both tiers' hooks reach ONE `Ref` through the ambient Layer — which is also what makes the
 * Rule-scoped hooks' own context requirement (`HookRef`, from the Feature's Layer) part of what
 * type-checks.
 */
const recordRuleHook = (name: string) =>
  function*() {
    const { entries } = yield* HookRef
    yield* Ref.update(entries, (seen) => [...seen, `${name}:start`])
    yield* Effect.yieldNow
    yield* Ref.update(entries, (seen) => [...seen, `${name}:end`])
  }

/** The full name of each Rule-nested Scenario that ran to completion — `completedScenarios`'s role. */
const ruleScenarioNames: Array<string> = []

/** Two Scenarios inside ONE Rule: the second brings an extra Layer of its own, the first does not. */
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

// THE FOURTH real `describeFeature` call in this file, and the last of the pre-Phase-9 ones. Its two
// emitted tests are RUN by this suite; the two blocks below read what they recorded.
describeFeature(ruleFeature, ruleFeatureLayer, ({ After, Before, Rule }) => {
  Before(recordRuleHook("featureBefore"))
  After(recordRuleHook("featureAfter"))

  Rule(
    "discounted checkout",
    discountLayer,
    // The four Rule-scoped hook registrars are RENAMED rather than shadowing the Feature's own two
    // above: shadowed, the pair that matters most to this block — which tier a hook was registered
    // through — would be told apart by nothing but which callback the line happens to sit in.
    ({ After: RuleAfter, Before: RuleBefore, Scenario, Then, When }) => {
      RuleBefore(recordRuleHook("ruleBefore"))
      RuleAfter(recordRuleHook("ruleAfter"))

      // Registered at RULE level, so both Scenarios in this Rule can see them — and nothing outside
      // it can. The Feature declares no Scenario of its own, so that half is INV-EC-005's own
      // tsgo-gate fixture's job (08-06), not something a runtime test can observe.
      When("the rule scenario reads both tiers", function*() {
        const catalog = yield* Catalog
        const discount = yield* Discount
        // 100 is the Feature tier's constant; 90 is derivable ONLY from both tiers, because
        // `discountLayer` read `Catalog` while building. A Rule Layer merged BESIDE the Feature's
        // rather than provided from it would not have built at all.
        assert.strictEqual(catalog.listPrice, 100)
        assert.strictEqual(discount.netPrice, 90)
      })

      Then("the rule scenario's hook log is Feature-then-Rule", function*() {
        const { entries } = yield* HookRef
        // What this Scenario can legitimately see at this point: the Feature's `Before` and then the
        // Rule's, and NOTHING else — its own `After` hooks and the Rule's run only once this body
        // returns, which is why the unwind half is asserted in the sync block below instead.
        assert.deepStrictEqual(yield* Ref.get(entries), [
          "featureBefore:start",
          "featureBefore:end",
          "ruleBefore:start",
          "ruleBefore:end"
        ])
        ruleScenarioNames.push(currentTestName())
      })

      // D-01's Scenario form, on a Scenario INSIDE the Rule — so its effective Layer must carry the
      // Feature's services, the Rule's, AND its own. The two-argument form beside it (the Scenario
      // above) is what proves the three-argument one is not simply applied to everything.
      // The five step registrars are RENAMED here for the same reason the Rule's hooks were: oxlint's
      // `no-shadow` rejects reusing the enclosing Rule's names, and the rename also says at each call
      // site which container the registration lands in — the property `Plan.ts`'s scope chain turns on.
      Scenario("a Scenario Layer adds a third tier", currencyLayer, ({ Then: ScenarioThen, When: ScenarioWhen }) => {
        ScenarioWhen("the three-tier scenario reads all three tiers", function*() {
          const catalog = yield* Catalog
          const discount = yield* Discount
          const currency = yield* Currency
          // All three tiers in ONE expression, and the middle one is derived: `€90` is unreachable
          // unless the Feature's Layer fed the Rule's, and the Rule's effective Layer was then what
          // this Scenario's own extra Layer was composed onto.
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

/**
 * DECLARED LAST, after the block that registered the Rule — the identical "vitest runs a file's
 * suites in declaration order" reasoning every other reader in this file uses. Both Rule Scenarios,
 * and therefore both of their `After` unwinds, have finished by the time this executes.
 */
describe("a Rule's Layer and hooks compose with the Feature's at runtime (08-07)", () => {
  it("ran Feature Before then Rule Before, and Rule After then Feature After, for BOTH Rule Scenarios", () => {
    // ONE positional comparison over the WHOLE log. The `Before` half is already asserted from inside
    // Scenario 1's own body; what only this block can see is the UNWIND — `After` hooks run after the
    // last step, so no step can observe them — and that the pattern repeats identically for the
    // second Scenario rather than the Rule's hooks attaching once per Rule.
    //
    // `Ref.get` on a plain `Ref` requires nothing, so `runSync` is safe here and needs no Layer.
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
    // `completedScenarios`'s argument, one nesting level deeper: an implementation that emitted
    // nothing for the Rule passes every in-body assertion above vacuously, because nothing runs to
    // assert. The names also pin the nesting — the Rule's own name must sit BETWEEN the Feature's and
    // the Scenario's, which is what separates `describe(feature) → describe(rule) → test` from a Rule
    // block emitted as a sibling of the Feature's.
    expect(ruleScenarioNames).toEqual([
      `Rule composition${nameSeparator}discounted checkout${nameSeparator}a Rule Scenario reaches the Feature and Rule tiers`,
      `Rule composition${nameSeparator}discounted checkout${nameSeparator}a Scenario Layer adds a third tier`
    ])
  })
})

/**
 * Plan 09-06, Task 1 — a Feature tagged at ALL FOUR inheritance levels, collected and run through the
 * real `describeFeature`. The FIFTH real call in this file.
 *
 * ## Why the claim is carried by a SILENT warning channel and not by the test count
 *
 * `vitest.config.ts` declares a closed tag list and leaves `strictTags` at its default `true`, so
 * emitting a tag that file does not declare THROWS at collection time. The obvious reading is that a
 * non-zero, all-green test count for this file is therefore itself proof that the validator accepted
 * these tags. **That reading is wrong, and it was wrong when this block was first written.** D-08's
 * catch-and-degrade (plan 09-05) sits between the two: an undeclared tag is caught, the Scenario is
 * re-emitted UNTAGGED, and the file stays green with one warning printed. Run and confirmed — swapping
 * `@slow` below for an undeclared tag leaves this file at its full green count. So the test count
 * cannot distinguish "every tag was accepted" from "some tag was rejected and silently dropped", and
 * an assertion resting on it would be vacuous.
 *
 * What DOES distinguish them is the warning channel, so that is what this block asserts: no
 * collection-phase warning may name this Feature's uri. One warning would mean at least one of the six
 * tags this Feature emits failed validation and its Scenario is running untagged — the exact silent
 * state D-08 converts a collection failure into, and one that no test count and no passing Scenario
 * can see. See `collectionWarnings` for why the capture spans collection rather than wrapping the
 * call: vitest defers a `describe` factory, so the emission — and therefore the warning — happens
 * after `describeFeature` has returned.
 *
 * The pairing with Task 3 is what makes the empty capture evidence rather than absence of evidence: a
 * library that dropped every tag before reaching the framework would also print nothing here. Task 3
 * emits `@undeclared-on-purpose` and asserts exactly one warning naming that tag, which is only
 * reachable if the tag array genuinely crossed into the validator. Neither block proves the tag path
 * is live by itself; together they do.
 *
 * ## What is asserted here, and what deliberately is not
 *
 * Asserted: every Scenario's step body RAN, in document order, including the `@slow` one, the `@only`
 * one and the untagged one; and no tag warning was printed while registering them. Both are
 * in-process facts a module-scope array can see.
 *
 * NOT asserted: that the tag landed on the framework's own task object. A Scenario body cannot reach
 * one — `TestApi.effect`'s self thunk takes no arguments by design (`TestApi.ts` note (d)), so there is
 * no test context inside a step to read a task from. The definitive "the tag reached the real task"
 * assertion is plan 09-08's CLI gate, which runs this file under `--tagsFilter` and checks the
 * selection. This paragraph exists so a reader looking for that assertion here finds out why it is
 * elsewhere rather than concluding it was forgotten.
 *
 * ## The `@only` Scenario IS roadmap criterion 3
 *
 * D-06 makes `@only` a plain pass-through tag that is NEVER routed to the framework's only-mode.
 * RESEARCH Finding 15 records why that makes the criterion structural rather than arranged: the
 * framework's `allowOnly` check is reachable only from branches guarded by some task already being in
 * only-mode, so a library that emits no such task makes the check unreachable. `vitest.config.ts` pins
 * `allowOnly: false` for every run, local and CI alike, so THIS SUITE PASSING is the assertion — an
 * `@only` Scenario emitted as an only-modifier would fail its own task with "[Vitest] Unexpected .only
 * modifier". No modifier is written anywhere in this file, and an acceptance grep enforces that.
 */

/**
 * Every `console.warn` line printed while vitest COLLECTED this file, in order.
 *
 * ## Why this is a collection-phase capture and not `recordWarnings`' wrap-one-call shape
 *
 * `recordWarnings` above wraps a single `describeFeature` call and reads what that call printed. It
 * works for the drift block because an unused-definition warning is printed from `describeFeature`'s
 * OWN BODY, synchronously, before it returns.
 *
 * A tag warning is not printed there and cannot be caught that way. **vitest DEFERS a `describe`
 * factory** — `describe(name, define)` registers a suite collector and runs `define` later, when the
 * runner collects the file, not at the point the call is written. Every `it.effect` emission
 * `Runner.ts` makes therefore happens AFTER `describeFeature` has already returned, which puts D-08's
 * catch-and-degrade `console.warn` outside any wrapper around the call. Verified by running it: a
 * wrap-the-call capture around the four-level block below records ZERO lines while
 * `--disableConsoleIntercept` shows the warning was printed. A wrapped capture here would not fail —
 * it would be permanently, silently empty, and every assertion reading it would pass for the wrong
 * reason. That is the single most plausible way to write this block wrong, which is why the mechanism
 * is written down rather than left to read as a style choice.
 *
 * So the stub is installed ONCE, at module scope, and left installed for the whole collection phase;
 * the `beforeAll` below removes it before the first test runs. Two consequences fall out and both are
 * relied on:
 *
 * - It is restored to `originalConsoleWarn` BY REFERENCE, and the drift block's
 *   "restored the original console.warn, by reference" assertion is what proves the removal happened.
 *   That test runs in the test phase, after `beforeAll`, so a stub still installed there fails it —
 *   this capture cannot leak into the rest of the run without something going red (T-06-07-06).
 * - `recordWarnings`' two module-scope calls run EARLIER in this file than the install below, so they
 *   still capture and restore `originalConsoleWarn` exactly as they did before, and `warnCalls`,
 *   `countAfterDescribeFeature` and `countAfterCollectFeature` all keep meaning precisely what they
 *   meant. Nothing above this line changed.
 *
 * Note for anyone debugging one of these blocks: vitest intercepts `console` output by default, so a
 * warning that IS printed appears nowhere in the reporter unless the run passes
 * `--disableConsoleIntercept`. Every assertion below reads this array rather than anyone's eyes on
 * terminal output.
 */
const collectionWarnings: Array<string> = []

// Installed at module scope, removed in the `beforeAll` below. STRINGS rather than argument lists,
// because every assertion here is about the rendered line: `Errors.ts`'s factories build one message
// and `describeFeature.ts` passes `.message` straight through, so a second argument arriving here
// would itself be the defect.
globalThis.console.warn = (...args: Array<unknown>) => {
  collectionWarnings.push(args.map((arg) => String(arg)).join(" "))
}

beforeAll(() => {
  // BY REFERENCE, to the value captured at the very top of this file before any stub existed.
  globalThis.console.warn = originalConsoleWarn
})

/**
 * The collection-phase warning lines that name `uri`, which is how each block reads only its own.
 *
 * Filtering by uri rather than slicing by position, because the tag blocks below are collected in an
 * order this file should not have to encode, and because the framework itself is free to warn about
 * something unrelated during collection. Every message `Errors.ts` builds opens with the quoted uri
 * (`makeUndeclaredTagWarning`) or carries it (`makeExcludedScenariosNotice`), so a per-Feature filter
 * is exact rather than approximate.
 */
const warningsFor = (uri: string): ReadonlyArray<string> => collectionWarnings.filter((line) => line.includes(uri))

const fourLevelStepRuns: Array<string> = []

/** A bare generator that records one label into `fourLevelStepRuns`. */
const recordFourLevel = (label: string) =>
  function*() {
    fourLevelStepRuns.push(label)
    yield* Effect.void
  }

/**
 * Tags at every level Gherkin has: the Feature, a Rule, a Scenario Outline, and its Examples block —
 * the same four-level arrangement `packages/gherkin/test/Correlate.test.ts`'s inheritance fixture uses,
 * brought here so the flattened chain is proved to survive the whole pipeline rather than only the
 * parse.
 *
 * Every tag is drawn from `vitest.config.ts`'s declared list. Adding an undeclared one here does NOT
 * fail this block and does not fail anything else either: D-08's catch-and-degrade re-emits that
 * Scenario untagged and prints one warning, so the observable cost is a silently untagged Scenario
 * rather than a red test. Both halves of that were run and are recorded in this plan's summary — the
 * same tag with the degradation bypassed takes the entire FILE to `Tests no tests`.
 */
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

// THE FIFTH real `describeFeature` call in this file. `Layer.empty` is the ambient Layer: every body
// below is a counter increment requiring no service, and this block's subject is tags rather than
// composition, which the four blocks above already cover. Nothing wraps the call — the warnings it can
// produce are printed later, during collection, into `collectionWarnings`.
describeFeature(fourLevelFeature, Layer.empty, ({ Rule, When }) => {
  When("the untagged four-level scenario runs", recordFourLevel("untagged"))
  When("the slow four-level scenario runs", recordFourLevel("slow"))
  When("the only-tagged four-level scenario runs", recordFourLevel("only-tagged"))

  Rule("a tagged rule", Layer.empty, ({ When: RuleWhen }) => {
    // RENAMED for the reason 08-07's Rule block above records: oxlint's `no-shadow` rejects reusing
    // the enclosing name, and the rename also says at the call site which container the registration
    // lands in.
    RuleWhen("the four-level outline scenario runs with {word}", function*(value: string) {
      fourLevelStepRuns.push(`outline:${value}`)
      yield* Effect.void
    })
  })
})

/**
 * DECLARED AFTER the block that registered the Feature, for the declaration-order reason every other
 * reader in this file uses.
 */
describe("a Feature tagged at all four levels collects and runs through the real describeFeature", () => {
  it("ran every Scenario's step, in document order, tagged and untagged alike", () => {
    // ONE positional comparison over the WHOLE array rather than four membership checks. It pins that
    // each Scenario ran exactly once, that the Feature-level Scenarios ran before the Rule's, and —
    // the property this block exists for — that a tag on a Scenario changes nothing about whether it
    // runs. `@slow` and `@only` are pass-through tags (D-07, D-06); a library that special-cased
    // either would drop its entry here.
    expect(fourLevelStepRuns).toEqual(["untagged", "slow", "only-tagged", "outline:alpha"])
  })

  it("emitted all six tags with the framework accepting every one — nothing was degraded", () => {
    // The block's real claim, and the ONE observable that separates "the validator accepted these six
    // tags" from "the validator rejected one and D-08 silently re-emitted its Scenario untagged". The
    // test count cannot tell those apart — the degraded Scenario still runs and still passes — so an
    // EMPTY set of warnings for this Feature's uri is the assertion, not a green count. `toEqual([])`
    // rather than a length check, so a failure prints the offending warning instead of `1 !== 0`.
    expect(warningsFor("test/four-level-tags.feature")).toEqual([])
  })
})

/**
 * Plan 09-06, Task 2 — `@skip` runs NOTHING: no step body, no hook, and no failure from a step no
 * definition matches. The SIXTH and SEVENTH real `describeFeature` calls in this file.
 *
 * ## Why this is a runtime block and not a `Runner.test.ts` one
 *
 * `Runner.test.ts` already proves, against a recording fake, that a `@skip` Scenario is emitted with
 * `skip: true`. That is the whole of what a fake can see: it records the thunks and never invokes
 * them, so an implementation that ran every hook regardless of the skip flag would record exactly the
 * same thing. "The hooks did not run" is a claim about EXECUTION, and only a real run has any.
 *
 * ## The chain that makes this structural rather than arranged (RESEARCH Finding 5)
 *
 * Every hook in this package is woven INSIDE the Scenario's Effect by `ScenarioEffect.ts` —
 * `runHookBatch(hooks.Before)` at the head, `Effect.onExit(... hooks.After)` around the whole thing —
 * and there is no vitest `beforeEach`/`afterEach` anywhere under `packages/vitest/src`. `Runner.ts`
 * note (b) additionally guarantees `buildScenarioEffect` is called only INSIDE the thunk handed to
 * `TestApi.effect`, never eagerly during the walk. A skipped test's handler is never invoked, so the
 * thunk is never called, so `buildScenarioEffect` is never reached, so no hook Effect is ever
 * CONSTRUCTED — let alone run. The counters below cannot move for a skipped Scenario without one of
 * those three links breaking, which is why they are the assertion.
 *
 * That is also why the arrangement is worth protecting from the obvious tidy-up: moving hooks to
 * vitest's own `beforeEach`/`afterEach` would compile, would keep every ordering assertion in this
 * file green, and would run a skipped Scenario's `Before` and `After` anyway — because those hooks
 * belong to the SUITE, not to the skipped task.
 *
 * ## The unmatched step is deliberate, and it is Pitfall 15
 *
 * The second Scenario contains a step text NO registered definition matches, which the file header
 * otherwise forbids. It is safe, and the reason is the same chain: `Plan.ts` stores an unresolved
 * step rather than throwing at plan time, and the `StepMatchError` it carries is only reached at
 * `yield*` time inside the composed Effect. A skipped test never builds that Effect, so the error is
 * never reached and the node reports SKIPPED — not undefined, not failed. Written down because the
 * safety is entirely non-obvious: read at registration time, this looks exactly like the broken-suite
 * arrangement the header rules out.
 *
 * It also means the `@skip` is what carries the property, not the absence of a definition. Making
 * `isSkipped` always return `false` turns this Scenario RED — the mutation is recorded in this plan's
 * summary.
 *
 * ## The untagged Scenario beside them is what makes the counters non-vacuous
 *
 * Hook counters that must be zero prove nothing on their own: they are also zero for a Feature whose
 * hooks were never registered, for one whose Scenarios never ran, and for one this file forgot to
 * emit at all. One RUNNABLE Scenario in the same Feature, with a known step count, turns each counter
 * into an exact number — greater than zero, and no larger than that Scenario's own contribution.
 */
const skipHookCounts = {
  before: 0,
  after: 0,
  beforeStep: 0,
  afterStep: 0,
  skippedBodies: 0,
  runnableBodies: 0
}

/** A bare generator that increments one `skipHookCounts` key. */
const countSkipHook = (key: keyof typeof skipHookCounts) =>
  function*() {
    skipHookCounts[key] += 1
    yield* Effect.void
  }

/**
 * Two `@skip` Scenarios and one runnable one, in ONE Feature so they share the same hook
 * registrations — which is the whole point: the hooks are declared once and must fire for exactly one
 * of the three Scenarios.
 *
 * The runnable Scenario has TWO steps, deliberately. `BeforeStep`/`AfterStep` wrap every resolved step
 * rather than every Scenario, so a per-Scenario count of 2 and a per-step count of 2 would be
 * indistinguishable with one step, and the two hook kinds would stop being told apart.
 */
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

// THE SIXTH real `describeFeature` call in this file. Note there is NO registration for
// "no registered definition anywhere in this file matches this step" — that omission is the Pitfall 15
// arrangement and is the one thing in this block that must not be "fixed".
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

/**
 * The second Feature: EVERY Scenario is `@skip`, so nothing runnable is emitted at all.
 *
 * This is the runtime half of plan 09-04's `AfterAllScenarios` suppression, and `Runner.ts` note (e)
 * has the argument it makes true. `BeforeAllScenarios` is a once-cell reachable ONLY from inside a
 * Scenario thunk, and a skipped test never invokes its thunk — so in this state the setup hook
 * structurally CANNOT have run. An unconditional teardown node would therefore tear down resources
 * that were never set up, which is why the emission condition carries a runnable-count conjunct
 * alongside the "are there any AfterAllScenarios hooks" one.
 *
 * Both counters are asserted, not just the teardown's. `beforeAllScenarios` staying at zero is what
 * makes `afterAllScenarios` staying at zero mean "teardown was correctly suppressed" rather than
 * "teardown happened to be skipped along with everything else" — the pairing is the claim.
 */
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

/**
 * DECLARED AFTER both blocks that registered these Features, for the declaration-order reason every
 * other reader in this file uses. Every Scenario above — the skipped ones included, since a skipped
 * node still resolves before the next suite runs — has been reported by the time these execute.
 */
describe("a @skip Scenario runs no step and no hook (09-06)", () => {
  it("ran every hook exactly the number of times the ONE runnable Scenario accounts for", () => {
    // ONE comparison over the WHOLE record rather than six separate expectations, so a failure prints
    // every counter at once and the shape of the deviation is readable — a hook that fired for all
    // three Scenarios reads 3/3/6/6, and one that fired for none reads 0/0/0/0. Those are different
    // defects and a per-key assertion would report whichever happened to be checked first.
    //
    // The numbers: ONE runnable Scenario with TWO steps. `Before`/`After` are per Scenario, so 1 each;
    // `BeforeStep`/`AfterStep` wrap every resolved step, so 2 each. `skippedBodies` covers BOTH steps
    // of the first `@skip` Scenario and must be 0 — that is the headline. `runnableBodies` at 2 is
    // what proves the whole Feature was not simply skipped wholesale, which would zero every counter
    // here and pass a naive "the skipped bodies did not run" check.
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
    // `body` at 0 is the ordinary skip claim. The other two are 09-04's suppression conjunct: the
    // once-cell was never reached because no thunk was ever invoked, so a teardown node would run
    // against resources nothing set up. Dropping the runnable-count conjunct from `Runner.ts` makes
    // `afterAllScenarios` 1 while leaving `beforeAllScenarios` at 0 — the asymmetry IS the bug, and
    // asserting the pair together is what shows it.
    expect(allSkippedCounts).toEqual({ beforeAllScenarios: 0, afterAllScenarios: 0, body: 0 })
  })
})

/**
 * Plan 09-06, Task 3a — D-08's catch-and-degrade, observed end to end. The EIGHTH real
 * `describeFeature` call in this file.
 *
 * ## This block is the positive control for Task 1, and Task 1 is the negative control for it
 *
 * Task 1 asserts that a Feature emitting only DECLARED tags produces no warning. On its own that is
 * satisfied by a library which drops every tag before the framework ever sees one — the tags would be
 * absent, nothing would be validated, and nothing would be warned about. This block is what rules
 * that out: `@undeclared-on-purpose` is not in `vitest.config.ts`, so a warning naming it can only
 * exist if the tag array genuinely crossed into the framework's validator and was rejected there.
 * One block proves the path is quiet when it should be; the other proves the path exists at all.
 *
 * ## `@undeclared-on-purpose` is RESERVED — declaring it deletes this test while leaving it green
 *
 * `vitest.config.ts` note (d) reserves the tag and forbids adding it to `test.tags`. If it were
 * declared, the emission below would simply succeed, no warning would be printed, and the assertion
 * that the warning names it would fail — loudly, which is the good case. The dangerous edit is the
 * other direction: someone "tidying up" by deleting this Scenario, or by renaming the tag to a
 * declared one, removes the only evidence in this repo that tags reach the framework at all, and
 * every remaining test stays green.
 *
 * ## The Scenario carries exactly ONE tag, and that is deliberate
 *
 * `describeFeature.ts`'s adapter passes the Scenario's WHOLE tag array to `makeUndeclaredTagWarning`,
 * not the subset the framework actually rejected — it cannot know which those are without reading the
 * framework's message, which 09-05 forbids on purpose. So a Scenario carrying a declared tag ALONGSIDE
 * an undeclared one produces a message naming both as undeclared, which is false about the declared
 * one. That is a real reporting defect and it is recorded in this plan's summary rather than worked
 * around here; giving this Scenario a single tag keeps this block's assertions about the mechanism
 * rather than about the defect, and this paragraph is why the Feature deliberately carries no
 * Feature-level tag of its own.
 *
 * ## The quoting assertion is a SECURITY control, not a formatting preference
 *
 * A tag is author-controlled text that reaches a terminal. `Errors.ts` note (f) `JSON.stringify`s
 * every author-controlled component precisely so a tag containing a quote, a newline or an ANSI escape
 * cannot forge what reads as a second line of this library's own output. The assertion below therefore
 * matches the QUOTED form specifically — `"@undeclared-on-purpose"` with the quote characters — and
 * fails against a message that interpolated the tag bare, which a `toContain(tag)` check would not.
 */
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

// THE EIGHTH real `describeFeature` call in this file, and the only one in the repo that deliberately
// emits a tag the config does not declare.
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

/**
 * Plan 09-06, Task 3b — D-03's registration filter and D-10's empty-array rule. The NINTH and TENTH
 * real `describeFeature` calls in this file.
 *
 * ## Absence is asserted by TITLE, never by a count
 *
 * D-03's whole point is that an excluded Scenario never becomes a test node — absent from the run
 * rather than reported as skipped. A total test count cannot tell those two apart, and neither can a
 * counter that only says "fewer ran". So each step body records its own `currentTestName()`, and the
 * assertion is a whole-array comparison against the ONE title that should exist. An implementation
 * that emitted the excluded Scenarios as skipped would leave the array unchanged — a skipped test
 * runs no body — so the array is paired with the surviving Scenario's presence, which is what makes
 * the empty entries mean "never registered" rather than "registered and skipped".
 *
 * ## The empty-array case is the one that catches a suite deleted behind a green run
 *
 * `excludeTags: []` and `excludeTags: undefined` are the SAME input and both mean NO FILTER
 * (`Tags.ts` note (b)). The failure this guards is a consumer computing the array from an environment
 * flag or a `.filter()` that happens to come out empty: read as "match nothing", their whole suite
 * would vanish while the reporter showed zero failures. Zero tests emitted and zero tests failed look
 * identical, which is why this needs its own Feature rather than a variation on the one above.
 *
 * ## D-10's exclusion NOTICE is not asserted here, because it is not currently printed
 *
 * This block asserts the exclusion itself and deliberately makes NO claim about the one-line summary
 * D-10 requires when a filter removed Scenarios. That line does not reach the terminal through the
 * real entry point, and the cause is the deferral fact `collectionWarnings` above records:
 * `emitFeature` increments `excludedScenarioCount` INSIDE the `describe` factory, `describeFeature`
 * reads the returned `EmitOutcome` on the line after `emitFeature` returns, and vitest has not run
 * that factory yet — so the count is always 0 there and the `> 0` guard never opens.
 *
 * `Runner.test.ts` cannot see this: its recording fake invokes `define` synchronously, so all four of
 * its `excludedScenarioCount` assertions are correct about the fake and silent about the framework.
 * This is exactly the class of defect this file exists for, and it was measured rather than reasoned
 * about — with the two `@wip` Scenarios provably excluded (the assertion below), the captured warning
 * list for this Feature's uri is empty.
 *
 * Asserting the notice needs a source fix that changes how `emitFeature` reports its outcome, which is
 * a contract this plan does not own. The gap is written down rather than left as a missing assertion
 * so that nobody reads this block as having covered D-10.
 */
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

// THE NINTH real `describeFeature` call in this file, and the first anywhere in this repo to pass the
// fourth `options` argument to the real entry point.
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

// THE TENTH real `describeFeature` call in this file. The SAME `@wip` tag the block above excludes,
// with an EMPTY array — so the two blocks differ in exactly the one thing under test.
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

/**
 * DECLARED LAST in this file, after every block that registered any of the three Features above, for
 * the declaration-order reason every other reader here uses.
 */
describe("an undeclared tag warns and keeps running; a filter excludes without a trace (09-06)", () => {
  it("ran the undeclared-tag Scenario AND its sibling — the file did not collapse", () => {
    // The degradation's headline: the Scenario RAN. D-08 converts a whole-file collection failure into
    // one warning about one Scenario, so the sibling's presence is half the claim — it proves the
    // damage was contained to the Scenario rather than to the Feature.
    expect(undeclaredTagRuns).toEqual(["undeclared", "sibling"])
  })

  it("printed exactly one warning, naming the file, the Scenario and the tag in QUOTED form", () => {
    const printed = warningsFor("test/undeclared-tag.feature")
    // Exactly one, not "at least one": a warning per TAG rather than per catch would still name the
    // right tag and still read correctly, and only a count separates the two.
    expect(printed).toHaveLength(1)

    const line = printed[0] ?? ""
    // The three facts a reader needs in order to act, each matched in its `JSON.stringify`'d form.
    // Quoting is `Errors.ts` note (f)'s security control against a tag forging a second output line
    // (T-09-06-01), so matching the quotes is matching the control — a message that interpolated any
    // of these bare would pass a `toContain(value)` check and fail these.
    expect(line).toContain(JSON.stringify("@undeclared-on-purpose"))
    expect(line).toContain(JSON.stringify("test/undeclared-tag.feature"))
    expect(line).toContain(JSON.stringify("a Scenario carrying an undeclared tag still runs"))

    // The fact that stops the obvious misreading. Without it the natural conclusion from this warning
    // is "my Scenario was skipped", which is the one thing that did not happen.
    expect(line).toContain("still ran")
    expect(line).toContain("UNTAGGED")
  })

  it("excluded both @wip Scenarios ENTIRELY — no test node, no step, not even a skip", () => {
    // ONE whole-array comparison, and the two properties it pins have different failure modes. That
    // the survivor RAN rules out "the filter removed everything"; that neither excluded title appears
    // rules out "they were emitted as skipped" — a skipped test runs no body, so a count could not
    // separate those two, and D-03's entire distinction is exactly that separation.
    expect(excludeTagsRan).toEqual([
      `excludeTags removes Scenarios from registration${nameSeparator}the Scenario that survives excludeTags`
    ])
  })

  it("emitted every Scenario under excludeTags: [], and printed nothing about it", () => {
    // The empty-array rule at the public boundary: `[]` means NO FILTER, never "match nothing". The
    // `@wip` entry is the load-bearing one — it is the tag the block above excludes, so its presence
    // here is what proves the array's EMPTINESS did the deciding rather than the tag's identity.
    expect(emptyFilterRan).toEqual(["wip", "untagged"])
    // And no notice: nothing was excluded, so there is nothing to report. A "0 Scenario(s) excluded"
    // line on every unfiltered Feature is the noise D-10's `> 0` guard exists to prevent.
    expect(warningsFor("test/empty-filter.feature")).toEqual([])
  })
})

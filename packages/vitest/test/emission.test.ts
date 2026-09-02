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
 * - D. `Runner.ts`'s `AfterAllScenarios` teardown is never registered (its `if
 *      (hooks.AfterAllScenarios.length > 0)` guard forced to skip) → every emitted hook test still
 *      PASSES (nothing downstream of the teardown depends on it), and only the "exactly once and last"
 *      assertion fails, because `hookLog`'s last two entries are Scenario 2's own `after2:start`/`:end`
 *      instead of `afterAllScenarios:start`/`:end`.
 * - E. `BeforeAllScenarios` composed inside `ScenarioEffect.ts`'s `buildScenarioEffect` (run once per
 *      Scenario execution) instead of through `Runner.ts`'s once-cell → the second hook Scenario's own
 *      `Then` body assertion fails: its log prefix gains a SECOND `beforeAllScenarios:start`/`:end`
 *      pair ahead of its own `Before`, so both the exact-array comparison and the
 *      exactly-one-`beforeAllScenarios:start` count assertion fail.
 * - F, G, H. Plan 08-07's three, recorded on the Rule-composition block at the bottom of this file
 *      rather than here, beside the arrangement they mutate.
 * - I. Plan 10-03's per-Scenario build-count block: `perScenarioProbeLayer` replaced by a
 *      `Layer.succeed` built ONCE at module scope → 2 fail, both that block's. The ordinals assertion
 *      reads `[1, 1, 1]` instead of `[1, 2, 3]`, and Scenario two's own body fails on a `Ref` that
 *      already contains `"first"`. Nothing outside the block moves, which is the point: three
 *      Scenarios sharing one Layer build resolve every step and pass every other assertion here.
 *
 * Plan 10-03's second block records its own three mutations (i, ii and iii) in its own header, beside
 * the arrangement they mutate — 08-07's precedent, and the same reason. Plan 10-04's two blocks at
 * the very bottom of this file do the same with mutations iv and v (the shared-clock/console block)
 * and vi, vi-b and vii (the Rule-under-`shared` block). Mutation iv is the one to read if you are
 * only going to read one: it is the reason the `TestConsole` half of that block cannot be deleted as
 * redundant beside the clock half, because the two are guarded by DIFFERENT halves of ADR-EC-018's
 * fix and only the console half notices when `excludeTestServices: true` goes missing.
 *
 * Plan 10-07's excluded-everything block, appended at the END of this file, records its own FOUR
 * mutations (1 through 4) in its own header, beside the arrangement they mutate — the same precedent.
 * Mutations 1 and 2 reproduce the gap `10-VERIFICATION.md` found (the `shared` Layer still building
 * for a Feature with every Scenario excluded, forced open by an always-passing warning node) from the
 * two ends of the fix — `describeFeature.ts`'s routing and `Runner.ts`'s classification. Mutation 3 is
 * the mirror-image mistake — routing the Feature's teardown away from the shared tier — and is caught
 * by `Runner.test.ts`'s structural routing projection (Task 2), not by this file, which is the
 * asymmetry that assertion exists to record. Mutation 4 exercises the block's own non-vacuity control.
 *
 * Mutations iv and vi both turned up the SAME underlying mechanism from opposite directions —
 * `Effect.provide` forks the `CurrentMemoMap` that `@effect/vitest`'s `layer(...)` leaves in the
 * ambient context, so a Layer that is the same OBJECT as one already built there is a memo hit no
 * matter how it is composed. Anyone reasoning about build counts on the shared path in a future
 * phase should read both records before predicting what a change will do.
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
    // One BeforeAllScenarios and one AfterAllScenarios — the once-cell and the block's teardown hook.
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
 * uses. Both hook Scenarios above, and the `AfterAllScenarios` teardown the Feature's block runs after
 * them, have already run by the time this executes — a block's `afterAll` runs before the next sibling
 * suite starts.
 *
 * This is the real-run half of roadmap success criterion 3/D-09: `test/Runner.test.ts`'s recording
 * fake can prove the `AfterAllScenarios` teardown was REGISTERED at the right position, but only a
 * real vitest run — this file — can prove it was actually EXECUTED, since a recording fake never runs
 * anything on its own.
 */
describe("the hook Feature's real-run AfterAllScenarios proof", () => {
  it("ran the AfterAllScenarios teardown last, and its own hook exactly once", () => {
    // Mutation D's target: an `AfterAllScenarios` teardown that was never registered leaves the log
    // ending with Scenario 2's own `after2:start`/`:end` instead.
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
describeFeature(fourLevelFeature, Layer.empty, ({ AfterAllScenarios, Rule, When }) => {
  // The marker `scripts/verify-tags-filter.sh` greps for on a run narrowed with `--tagsFilter` to the
  // `@only` Scenario alone: the teardown ran even though every other test in this block was narrowed
  // to skip (F-06). `process.stdout.write`, not `Console.log` — the plain adapter runs this hook
  // against a TestConsole, which would swallow the line.
  AfterAllScenarios(function*() {
    yield* Effect.void
    process.stdout.write("AFTER_ALL_SCENARIOS_RAN\n")
  })
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
 * structurally CANNOT have run. An unconditional teardown would therefore tear down resources that
 * were never set up, which is why the teardown hook's body is gated on a Scenario having been
 * attempted at all (`Runner.ts` note (e)).
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
    // `body` at 0 is the ordinary skip claim. The other two are the teardown's run-time gate: the
    // once-cell was never reached because no thunk was ever invoked, so a teardown would run against
    // resources nothing set up. Dropping the `attempted` gate from `Runner.ts` makes
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
 * framework's message, which 09-05 forbids on purpose. Plan 09-06 recorded that as a reporting defect,
 * because the message then claimed every listed tag was undeclared; plan 09-09 fixed it in the WORDING
 * rather than in the data, which is the only honest place it could be fixed — the message now says the
 * Scenario carries N tags, AT LEAST ONE of which is undeclared, and `Errors.test.ts` pins that claim.
 * Giving this Scenario a single tag is still deliberate: it keeps this block's assertions about the
 * mechanism, and with one tag the "at least one" wording and the offending subset coincide, so the
 * quoting assertion below is unambiguous. It is also why the Feature deliberately carries no
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
 * ## D-10's exclusion NOTICE, and the defect this block found
 *
 * The notice is asserted below, and it did not print at all until this plan changed the source. The
 * cause is the deferral fact `collectionWarnings` above records: `emitFeature` increments
 * `excludedScenarioCount` INSIDE the `describe` factory, and `describeFeature` used to read the
 * returned `EmitOutcome` on the line after `emitFeature` returns — which vitest has not run the
 * factory by. The count was therefore always `0` there and the `> 0` guard never opened, so a stale
 * `excludeTags` hiding a whole Feature sat behind a green run exactly as D-10 exists to prevent.
 *
 * `Runner.test.ts` could not see it: its recording fake invokes `define` synchronously, so all four of
 * its `excludedScenarioCount` assertions are correct about the fake and silent about the framework.
 * That is this file's founding argument — a value-asserting test and a fake are each sharper than a
 * real run at the thing they test, and neither can see the emission that never happened.
 *
 * The fix is `Runner.ts`'s `onEmitted` callback, invoked as the last statement inside the walk, which
 * `describeFeature.ts` now passes; `Runner.ts` note (h) has the argument and records why the return
 * value is kept anyway. THIS ASSERTION is the only thing in the repo that fails if the notice
 * regresses to reading that return value — so it is not a formality.
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

  it("printed exactly one D-10 notice, naming the count, the option and the quoted tag", () => {
    const printed = warningsFor("test/exclude-tags.feature")
    // Exactly ONE, per Feature and never per excluded Scenario. D-03 removed the per-Scenario output
    // on purpose, and a line each would rebuild it in `console.warn`; the count is what makes the
    // aggregate honest without doing that. This is also the assertion that fails if the notice ever
    // goes back to reading `emitFeature`'s synchronous return value, which is `0` under vitest.
    expect(printed).toHaveLength(1)

    const line = printed[0] ?? ""
    // The COUNT, which is the fact a reader acts on and the one a stale filter makes alarming.
    expect(line).toContain("2 Scenario(s)")
    // The OPTION that did it, so the reader knows which of the two to go and look at. The notice
    // derives this from the normalised arrays rather than accepting it, so a wrong one here would mean
    // the reason and the fields beside it disagreed.
    expect(line).toContain("excludeTags")
    // QUOTED, for the D-08 assertion's reason: author-controlled text reaching a terminal is escaped
    // by `Errors.ts` note (f), and matching the quote characters is what tests the control rather than
    // merely the content.
    expect(line).toContain(JSON.stringify("@wip"))
    expect(line).toContain(JSON.stringify("excludeTags removes Scenarios from registration"))
    // The sentence that stops "excluded" being read as "skipped". A skipped test at least appears in
    // the reporter; these Scenarios appear nowhere at all, and the notice is the only trace of them.
    expect(line).toContain("never registered")
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

/**
 * Plan 10-03, Task 1 — the DEFAULT (per-Scenario) Layer scope, counted. The ELEVENTH real
 * `describeFeature` call in this file.
 *
 * ## Appended at the END, after Phase 9's tag blocks, for this file's own declaration-order reason
 *
 * Every reader block here reads a module-scope array and depends on vitest running a file's suites in
 * declaration order. Appending is the only placement that leaves all of them meaning exactly what they
 * meant — nothing this block registers can run before a pre-Phase-10 reader has already asserted. This
 * block also brings its OWN counters and its OWN service class, the rule the tag blocks above already
 * follow: a counter shared with another block would make this block's assertion depend on that block's
 * arrangement (T-10-03-05).
 *
 * ## What only a real run can see here, and why the existing blocks above cannot see it
 *
 * `logLayer` at the top of this file is already a per-Scenario `Layer.effect`, and the first block's
 * whole-log comparison already fails if two Scenarios share one build. That is a claim about STATE.
 * It is NOT a claim about the BUILD COUNT, and the two come apart: a runner that built the Layer once
 * and then somehow handed each Scenario a fresh `Ref` would satisfy every assertion above this line
 * while violating INV-EC-002's mechanism. Nothing in this repo counted builds until this block. A
 * counter is also the only assertion that can tell the default scope from the `shared` scope at all —
 * every step resolves identically either way, which is ARCHITECTURE.md Anti-Pattern 3's entire danger.
 *
 * So this block asserts BOTH halves, deliberately, because they are different claims:
 *
 * - `perScenarioBuildOrdinals` is `[1, 2, 3]` — N Scenarios, N builds, in Scenario order. The ordinal
 *   is read back out of the SERVICE VALUE, not off the module counter, so a Layer that built three
 *   times and was then handed to nobody could not produce it (T-10-03-01).
 * - Scenario two finds its own `entries` `Ref` EMPTY before it writes. The `Ref` is created INSIDE the
 *   Layer's build effect, so this is per-Scenario STATE isolation rather than the counter restated.
 *
 * `perScenarioScenarioNames` is `completedScenarios`'s argument applied here: an implementation that
 * emitted nothing passes both in-body assertions vacuously, because nothing runs to assert
 * (T-10-03-03).
 *
 * ## Mutation-tested (performed, run, then reverted) — see mutation I in this file's header.
 */

/**
 * The per-Scenario probe. TWO readonly fields, and both are load-bearing.
 *
 * `buildOrdinal` is captured at BUILD time, so the value a step reads names the build it reached.
 * `entries` is a `Ref` created inside the same build effect, so it is per-BUILD state and not a
 * module-scope array — the distinction the `Log` service at the top of this file already makes.
 */
class PerScenarioProbe extends Context.Service<PerScenarioProbe, {
  readonly buildOrdinal: number
  readonly entries: Ref.Ref<ReadonlyArray<string>>
}>()("PerScenarioProbe") {}

/** How many times the per-Scenario Layer below has been BUILT. Read only through `buildOrdinal`. */
let perScenarioBuilds = 0

/**
 * The plain-`Layer` argument form, which IS the default per-Scenario scope.
 *
 * `Layer.effect` and not `Layer.succeed`: only the effectful constructor has a build-time body to
 * count in. A `Layer.succeed` built once at module scope carries a value, not a build, and would make
 * every ordinal below read `1` — which is mutation I.
 */
const perScenarioProbeLayer = Layer.effect(
  PerScenarioProbe,
  Effect.gen(function*() {
    perScenarioBuilds += 1
    const entries = yield* Ref.make<ReadonlyArray<string>>([])
    return PerScenarioProbe.of({ buildOrdinal: perScenarioBuilds, entries })
  })
)

/** The build each Scenario REACHED, pushed from inside the running step. */
const perScenarioBuildOrdinals: Array<number> = []

/** The full name of each per-Scenario Scenario that ran to completion — `completedScenarios`'s role. */
const perScenarioScenarioNames: Array<string> = []

/**
 * Three Scenarios, one per build.
 *
 * The three Scenario TITLES are fixed: plan 10-05's real-CLI gate asserts on them by exact suffix
 * match, so renaming one here without renaming it there turns that gate's assertion vacuously true.
 */
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

// THE ELEVENTH real `describeFeature` call in this file, and the PLAIN-Layer form deliberately — that
// argument shape is what selects the default per-Scenario scope, and the block below it is the same
// Feature under `{ shared, perScenario }`.
describeFeature(perScenarioBuildFeature, perScenarioProbeLayer, ({ Then, When }) => {
  When("the first per-scenario step runs", function*() {
    const probe = yield* PerScenarioProbe
    perScenarioBuildOrdinals.push(probe.buildOrdinal)
    yield* Ref.update(probe.entries, (seen) => [...seen, "first"])
  })

  When("the second per-scenario step runs", function*() {
    const probe = yield* PerScenarioProbe
    // SC #1's second half, and a DIFFERENT claim from the build count beside it: Scenario one wrote
    // `"first"` into the `Ref` it got from its own build. If any of that state reached this Scenario,
    // this array is non-empty. The ordinal assertion in the reader below cannot see this — a runner
    // could rebuild the Layer three times and still hand all three builds one shared `Ref`.
    assert.deepStrictEqual(yield* Ref.get(probe.entries), [])
    perScenarioBuildOrdinals.push(probe.buildOrdinal)
    yield* Ref.update(probe.entries, (seen) => [...seen, "second"])
  })

  When("the third per-scenario step runs", function*() {
    const probe = yield* PerScenarioProbe
    perScenarioBuildOrdinals.push(probe.buildOrdinal)
    yield* Ref.update(probe.entries, (seen) => [...seen, "third"])
  })

  // ONE definition, matched by all three Scenarios. `currentTestName()` differs per running test, so
  // one body records three distinct names — which is the whole of what this recorder needs.
  Then("the per-scenario scenario is done", function*() {
    // Same `require-yield` satisfaction as the other assertion-only bodies in this file.
    yield* Effect.void
    perScenarioScenarioNames.push(currentTestName())
  })
})

/**
 * DECLARED AFTER the block that registered the Feature, for the declaration-order reason every other
 * reader in this file uses.
 */
describe("the default per-Scenario Layer scope builds once per Scenario (10-03)", () => {
  it("built the Layer three times for three Scenarios, in Scenario order", () => {
    // THE assertion that carries N-builds, and the only one in this repo that does. A memoized or
    // hoisted Layer produces `[1, 1, 1]` — and every step still resolves, every other assertion in
    // this file still passes, and nothing anywhere goes red. That is exactly why it is written as an
    // exact ordinal array rather than as `perScenarioBuilds === 3`: the ordinals also prove each
    // Scenario REACHED a distinct build, which a bare counter cannot (T-10-03-01).
    expect(perScenarioBuildOrdinals).toEqual([1, 2, 3])
  })

  it("emitted and ran all three Scenarios, each nested under the Feature", () => {
    // `completedScenarios`'s argument, applied to this block: with nothing emitted, nothing runs, the
    // two in-body assertions above assert nothing, and only this array notices (T-10-03-03).
    expect(perScenarioScenarioNames).toEqual([
      `Per-Scenario build count${nameSeparator}the first per-scenario scenario records its own build`,
      `Per-Scenario build count${nameSeparator}the second per-scenario scenario sees a fresh build`,
      `Per-Scenario build count${nameSeparator}the third per-scenario scenario sees a third build`
    ])
  })
})

/**
 * Plan 10-03, Task 2 — the OPT-IN `shared` scope, counted. The TWELFTH real `describeFeature` call in
 * this file, and the FIRST anywhere in this repo to pass the `{ shared, perScenario }` argument form
 * to the real entry point.
 *
 * Appended after Task 1's block for this file's declaration-order rule, with its OWN counters and its
 * OWN service classes (T-10-03-05). Same Scenario count as the block above, so the two blocks differ
 * in exactly the one thing under test: which argument FORM `describeFeature` was called with.
 *
 * ## The pair of assertions, and why neither one alone is the claim
 *
 * `sharedBuildOrdinals` is `[1, 1, 1]`: every Scenario reached the SAME single build, which is
 * RUN-03 SC #2 and the whole reason Phase 10 exists. On its own it is satisfied by a fix that
 * memoised BOTH tiers — and that fix would break INV-EC-002 for every Feature that opted into a
 * shared scope, silently, because every step would still resolve. So it is paired with
 * `scopedBuildOrdinals` being `[1, 2, 3]` in the SAME Feature and the SAME run (T-10-03-02). One
 * assertion says the shared half stopped rebuilding; the other says the per-Scenario half did not
 * start being memoised with it. Only the pair distinguishes the fix from the over-fix.
 *
 * ## Each Scenario asserts the count from INSIDE, and that is deliberate
 *
 * The first statement in the step body is `assert.strictEqual(sharedBuilds, 1)` — the module-scope
 * counter, read at the moment that Scenario runs. That makes the build-count claim observable from
 * OUTSIDE this process as that test node's own pass/fail status, which is the signal plan 10-05's
 * real-CLI gate reads: a reporter has a field for a test's status and no field for a counter. It is
 * the FIRST thing that can fail in the body for the same reason.
 *
 * ## `collisionWinners` is D-04's runtime home
 *
 * `CollisionMarker` is named by BOTH tiers with different values, and every Scenario must reach
 * `perScenario`'s. The RULE is unchanged from ADR-EC-006; its MECHANISM changed in plan 10-02. It
 * used to be `Layer.merge(shared, perScenario)`'s argument order — second argument wins. Nothing
 * merges the tiers any more: the shared tier is ambient on the emitted test node and the per-Scenario
 * tier is provided INSIDE the Scenario's own Effect, so the inner, nearer provision wins by
 * construction. `describeFeature.test.ts` re-homed its own D-04 case to a two-tiers-two-values claim
 * precisely because no collection-level assertion can see provision order, and `describeFeature.ts`
 * note (d) names this block as where the runtime verdict moved to. This is that block.
 *
 * ## Mutation-tested (each performed, run, then reverted)
 *
 * - i.   `describeFeature.ts`'s shared branch made to pass `vitestTestApi(...)` instead of
 *        `sharedLayerTestApi(...)` — the module-level `it` inside `layer(...)`'s callback, which is
 *        ARCHITECTURE.md Anti-Pattern 3 exactly. 7 fail, ALL of them this block's and nothing else in
 *        the repo: all three Scenario bodies on `expected +0 to equal 1`, plus all four readers on
 *        empty arrays.
 *
 *        The observed number is `0`, not the 2/3/4 a first reading of Anti-Pattern 3 predicts, and
 *        the difference is worth keeping: emitting through the module-level `it` does not merely
 *        REBUILD the shared Layer per Scenario here, it never reaches a built one at all. Nothing was
 *        registered through `sharedIt`, so at step time `sharedBuilds` is still 0 — and had the count
 *        assertion not been first, the next line would have failed on `Service not found:
 *        SharedProbe` instead. Either way the block goes red, which is the property being tested; the
 *        `0` records that `sharedLayerTestApi` is what carries the shared services to a step, not
 *        merely what causes the build to be counted once.
 * - ii.  `splitLayerArgument` reverted to the pre-10-02 `Layer.merge(shared, perScenario)` collapse.
 *        9 fail: SIX of this block's — Scenarios two and three on `expected 2 to equal 1` and
 *        `expected 3 to equal 1`, and all four readers, each holding exactly ONE entry — PLUS all
 *        three of `describeFeature.test.ts`'s `the layer argument separates into two independently
 *        provided tiers` cases.
 *
 *        Scenario ONE passes under this mutation, and that is the signature of the defect rather than
 *        a gap: a merged Layer built per Scenario IS on its first build when Scenario one runs. Only
 *        Scenarios two and three can tell `1, 1, 1` from `1, 2, 3`, which is why three Scenarios are
 *        the minimum this block could have used. `collisionWinners` records `["perScenario"]` — the
 *        merged Layer resolves the collision the same way, so this mutation does NOT turn the D-04
 *        assertion red on its merits, and that is precisely why 10-02 re-homed the collection-level
 *        D-04 case rather than trusting it to notice a mechanism change.
 * - iii. The two `Layer.succeed(CollisionMarker, ...)` values swapped between the tiers. Exactly 1
 *        fails — `collisionWinners`, on `["shared", "shared", "shared"] to deeply equal
 *        ["perScenario", ...]` — and nothing else in the repo, this block included. That is what
 *        proves the assertion is a real collision test and not a tautology satisfied by either
 *        arrangement (T-10-03-04).
 */

/** The SHARED tier's probe: one build for the whole Feature, so every Scenario reads ordinal 1. */
class SharedProbe extends Context.Service<SharedProbe, { readonly buildOrdinal: number }>()("SharedProbe") {}

/** The PER-SCENARIO tier's probe, in the SAME Feature — the `[1, 2, 3]` half of the pair. */
class ScopedProbe extends Context.Service<ScopedProbe, { readonly buildOrdinal: number }>()("ScopedProbe") {}

/**
 * The service BOTH tiers name, with different values. D-04's runtime subject.
 *
 * An object carrying a `who` rather than a bare string, `describeFeature.test.ts`'s `Marker` idiom
 * and for its reason: two implementations that differ in a field that is READ cannot masquerade as
 * one another through structural sameness.
 */
class CollisionMarker extends Context.Service<CollisionMarker, { readonly who: string }>()("CollisionMarker") {}

/** How many times the SHARED tier has been built. Asserted from inside every step body. */
let sharedBuilds = 0

/** How many times the PER-SCENARIO tier has been built, in the same Feature. */
let scopedBuilds = 0

/**
 * The shared tier. `never` in the error channel is not incidental — plan 10-01's overload constrains
 * `shared` to `Layer<R, never, never>`, so a failable Layer here is a COMPILE error, and this block
 * must not be the thing that discovers that. `SharedLayerConstraint.types.ts` owns that claim.
 */
const sharedProbeLayer = Layer.mergeAll(
  Layer.effect(
    SharedProbe,
    Effect.gen(function*() {
      // Same `require-yield` satisfaction as the assertion-only step bodies in this file. The build
      // has nothing to await — the counter IS the observation — but `Layer.effect` is still the
      // constructor this needs: it has a build-time body at all, which `Layer.succeed` does not.
      yield* Effect.void
      sharedBuilds += 1
      return SharedProbe.of({ buildOrdinal: sharedBuilds })
    })
  ),
  Layer.succeed(CollisionMarker, CollisionMarker.of({ who: "shared" }))
)

/** The per-Scenario tier of the SAME Feature, which must stay fresh per Scenario (INV-EC-002). */
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

/** The shared build each Scenario REACHED — all three must be the same build. */
const sharedBuildOrdinals: Array<number> = []

/** The per-Scenario build each Scenario reached, in the same run — all three must differ. */
const scopedBuildOrdinals: Array<number> = []

/** Which tier's `CollisionMarker` each Scenario actually resolved. D-04, at run time. */
const collisionWinners: Array<string> = []

/** The full name of each shared-path Scenario that ran to completion. */
const sharedScenarioNames: Array<string> = []

/**
 * What the shared-path teardown observed of the shared tier — the build ordinal it read. `[1]` means
 * the `afterAll` reached the SAME memoised build the three Scenarios read (a memo hit through the
 * memo map the composition root handed the adapter), not a fourth one (F-06).
 */
const sharedTeardownObservations: Array<number> = []

/**
 * Three Scenarios, ONE shared build.
 *
 * The three Scenario TITLES are fixed: plan 10-05's real-CLI gate asserts on them by exact suffix
 * match, so renaming one here without renaming it there turns that gate's assertion vacuously true.
 */
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

// THE TWELFTH real `describeFeature` call in this file, and the first in the repo to pass the OBJECT
// form. The argument shape is the entire difference from the block above it.
describeFeature(
  sharedBuildFeature,
  { shared: sharedProbeLayer, perScenario: scopedProbeLayer },
  ({ AfterAllScenarios, Then, When }) => {
    // The shared-path teardown: reads the shared tier through the block's own memo map, and writes the
    // marker `scripts/verify-shared-layer-once.sh` greps for on the run narrowed with `-t` to one of
    // this Feature's Scenarios (F-06).
    AfterAllScenarios(function*() {
      const shared = yield* SharedProbe
      sharedTeardownObservations.push(shared.buildOrdinal)
      process.stdout.write("SHARED_AFTER_ALL_SCENARIOS_RAN\n")
    })

    // ONE definition, matched by all three Scenarios, so the three bodies cannot drift apart into
    // asserting three different things about one claim.
    When("the shared scenario reads both tiers", function*() {
      // FIRST, and deliberately so: this is the assertion plan 10-05's CLI gate observes from outside
      // the process, as this test node's pass/fail status. Under Anti-Pattern 3 it reads 2, then 3,
      // then 4 — one extra build per Scenario — and the node fails before it records anything.
      assert.strictEqual(sharedBuilds, 1)

      const shared = yield* SharedProbe
      sharedBuildOrdinals.push(shared.buildOrdinal)

      const scoped = yield* ScopedProbe
      scopedBuildOrdinals.push(scoped.buildOrdinal)

      // D-04, resolved by PROVISION order rather than merge order — see this block's header.
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

/**
 * DECLARED LAST IN THIS FILE, after the block that registered the Feature, for the declaration-order
 * reason every other reader here uses.
 */
describe("the opt-in shared Layer scope builds exactly once per Feature (10-03)", () => {
  it("ran the AfterAllScenarios teardown once against that same build, not a rebuild (F-06)", () => {
    expect(sharedTeardownObservations).toEqual([1])
    expect(sharedBuilds).toBe(1)
  })

  it("gave all three Scenarios the SAME single shared build", () => {
    // RUN-03 SC #2, and the assertion this whole phase exists to make true. Under the pre-Phase-10
    // implementation — and under Anti-Pattern 3's module-level `it` — this reads one build per
    // Scenario while every step still resolves and nothing else in the repo goes red.
    expect(sharedBuildOrdinals).toEqual([1, 1, 1])
  })

  it("kept the per-Scenario tier of the SAME Feature fresh for every Scenario", () => {
    // The half that catches the OVER-fix (T-10-03-02). A change that memoised both tiers satisfies
    // the assertion above and breaks INV-EC-002 for every Feature that asked for a shared scope;
    // this is the only assertion in the repo that sees it.
    expect(scopedBuildOrdinals).toEqual([1, 2, 3])
  })

  it("resolved a service named by BOTH tiers to the perScenario implementation (D-04)", () => {
    // Asserted for all three Scenarios rather than once: the winner is now a property of how each
    // Scenario's Effect was composed, so it is a per-Scenario fact and a single sample would not
    // notice one Scenario resolving differently from its siblings.
    expect(collisionWinners).toEqual(["perScenario", "perScenario", "perScenario"])
  })

  it("emitted and ran all three Scenarios, each nested under the Feature", () => {
    // `completedScenarios`'s argument again, and it is not a formality on this path: `layer(...)`
    // registers through a callback, so a shared branch that never invoked it emits nothing at all —
    // and all three assertions above would then pass against three empty arrays if they were written
    // as anything looser than exact-array comparisons (T-10-03-03).
    expect(sharedScenarioNames).toEqual([
      `Shared build count${nameSeparator}the first shared scenario observes the single shared build`,
      `Shared build count${nameSeparator}the second shared scenario observes the same shared build`,
      `Shared build count${nameSeparator}the third shared scenario observes the same shared build`
    ])
  })
})

/**
 * Plan 10-04, Task 1 — a `shared` Layer never costs a Scenario its own `TestClock` or its own
 * `TestConsole`. The THIRTEENTH real `describeFeature` call in this file.
 *
 * This is BEH-EC-012's shared-path half — "This MUST hold identically whether the Feature uses the
 * default per-Scenario Layer or an opt-in `shared` Layer (ADR-EC-006) — one Scenario's
 * `adjust` MUST NOT be observable by any other Scenario in either case" — and it is ADR-EC-018's
 * executable proof. Until this block that clause was a sentence in `spec/` plus a throwaway probe
 * that plan 10-02 ran and then deleted, so nothing re-proved it on any push.
 *
 * Appended after plan 10-03's two blocks, with its OWN counters and its OWN service class, for this
 * file's declaration-order rule and T-10-03-05's own-counters rule.
 *
 * ## The Scenario ORDER is load-bearing here in a way it is nowhere else in this file
 *
 * Every other block here would assert the same thing under any permutation of its Scenarios. This
 * one would not. The whole claim is about what a LATER Scenario observes after an EARLIER one
 * mutated the clock, so Scenario one must run FIRST and the three after it must run AFTER. A
 * reordering does not make this block fail — it makes it stop testing anything, which is why the
 * titles are declared FIXED below and why the reader block compares an ORDERED array of names
 * rather than a set.
 *
 * ## Why plan 10-05's CLI gate still exists given this block
 *
 * ADR-EC-018 names the failure mode precisely: "a suite that passes run as a whole can fail under
 * `-t` filtering (which changes which Scenario runs 'first' against the shared clock), or vice
 * versa". An in-process run cannot compare its own whole-run result against a `-t`-filtered one —
 * it IS the whole-run result, and it has no way to be the other one at the same time. Only a real
 * CLI invocation can run this file twice under two different filters and compare, which is plan
 * 10-05's job. This block is the half that fails fast on every push; that one is the half that
 * closes the hole the ADR itself names.
 *
 * ## `perScenario: Layer.empty` is deliberate and is doing work
 *
 * The object form requires both keys (D-03's required-key rule from Phase 5). Passing `Layer.empty`
 * rather than a second probe Layer additionally REMOVES the per-Scenario tier as a possible
 * explanation for what is observed here: with nothing at all in that tier, `excludeTestServices:
 * true` at the `layer(...)` call plus `sharedLayerTestApi`'s per-emission `Effect.provide(testEnv)`
 * are the only mechanisms left that can produce a clock reading 0 in Scenario two.
 *
 * ## The clock is read from `effect/Clock`, and that is not a style choice
 *
 * `currentTimeMillis` is imported from `effect/Clock` and NOT from `effect/testing/TestClock`, whose
 * same-named export is not an Effect in the installed `effect@4.0.0-rc.112`: yielding it produces
 * `Fiber.runLoop: Not a valid effect: undefined` at RUN time rather than a compile error. That was
 * hit and corrected during this phase's planning, which is why an acceptance criterion greps for the
 * import rather than trusting the reader to remember.
 *
 * ## The `TestConsole` half of RUN-04 is ASSERTED, not argued
 *
 * `effect@4.0.0-rc.112`'s `effect/testing/TestConsole` exports `make`, `testConsoleWith`, `layer`,
 * `logLines` and `errorLines`. `logLines` is a per-instance accessor — it reads the entry array
 * closed over by the `TestConsole` the ambient context currently carries — so a Scenario CAN observe
 * whether it received its own console or an earlier Scenario's. Scenario four does exactly that, and
 * it makes TWO assertions rather than one: the capture is empty despite Scenario one having logged
 * `clockConsoleMarker`, AND it becomes non-empty when this Scenario logs its own marker. The second
 * assertion is the non-vacuity control — an accessor that always returned `[]`, or a console that
 * captured nothing at all, would satisfy the isolation assertion perfectly while proving nothing.
 *
 * ## Mutation-tested (each performed, run, then reverted) — and the results are NOT symmetric
 *
 * - iv. `excludeTestServices: true` REMOVED from `describeFeature.ts`'s `layer(...)` call, so the
 *       framework composes its own `TestEnv` into the memoised shared Layer. 2 fail, both this
 *       block's and nothing else in the repo — but NOT the two the plan predicted:
 *
 *       ```
 *       FAIL  Shared clock isolation > the fourth shared clock scenario gets its own test console
 *             AssertionError: expected [ Array(1) ] to deeply equal []
 *             + [ "first-shared-clock-scenario-marker" ]
 *       FAIL  ... > emitted and ran all four Scenarios, each nested under the Feature
 *             AssertionError: expected [ …(3) ] to deeply equal [ …(4) ]
 *       ```
 *
 *       **The CONSOLE leaks and the CLOCK does not.** Scenarios two and three still read 0. The
 *       asymmetry is real, it is not a quirk of this fixture, and it was traced to its source rather
 *       than guessed at: `@effect/vitest@4.0.0-rc.112`'s `dist/internal/internal.js` line 34 defines
 *       `TestEnv` as `Layer.mergeAll(TestConsole.layer, TestClock.layer())`, and `Layer.buildWithMemoMap`
 *       ADDS its `MemoMap` to the context it returns (`effect`'s `Layer.ts` line 762). The framework
 *       then runs each test as `effect.pipe(Effect.scoped, Effect.provide(context))`, so the
 *       per-emission `Effect.provide(testEnv)` inside it resolves `CurrentMemoMap.forkOrCreate` to a
 *       FORK of that map — which still holds every entry already built. Layers are memoised by object
 *       IDENTITY, and `TestConsole.layer` is a module-level constant, so it is the SAME object the
 *       framework's `TestEnv` used: a memo HIT, returning the already-built console. `TestClock.layer`
 *       is a FUNCTION, so `TestClock.layer()` here and `TestClock.layer()` there are two distinct
 *       objects: a memo MISS, and a genuinely fresh clock.
 *
 *       Confirmed directly, with the mutation still in place: wrapping the console half in
 *       `Layer.fresh(TestConsole.layer)` returned the suite to 762 passed. Reverted.
 *
 *       So `excludeTestServices: true` is load-bearing for the CONSOLE half of ADR-EC-018, and the
 *       clock half survives its removal only by the accident that `TestClock.layer` is a function
 *       rather than a constant. If a future `effect` release makes it a constant — the obvious
 *       tidy-up, since `TestConsole.layer` already is one — removing this option would silently
 *       reintroduce the exact clock leak ADR-EC-018 exists to prevent. Scenario four is what stands
 *       between that change and a green suite, which is why the console half is asserted here rather
 *       than argued from the two Layers sharing a `Layer.mergeAll` call.
 * - v.  The per-emission `Effect.provide(testEnv)` hoisted out of `sharedLayerTestApi`'s `effect`
 *       member and merged into the shared tier instead (`layer(Layer.merge(sharedTier, testEnv), …)`),
 *       so ONE built `TestEnv` serves every emission. 5 fail, all this block's:
 *
 *       ```
 *       FAIL  Shared clock isolation > the second shared clock scenario still starts at time zero
 *       FAIL  Shared clock isolation > the third shared clock scenario still starts at time zero and shares one build
 *       FAIL  Shared clock isolation > the fourth shared clock scenario gets its own test console
 *             AssertionError: expected 3600000 to equal +0   (all three)
 *       FAIL  ... > started all four Scenarios at time zero, …
 *             AssertionError: expected [ +0 ] to deeply equal [ +0, +0, +0, +0 ]
 *       FAIL  ... > emitted and ran all four Scenarios, each nested under the Feature
 *             AssertionError: expected [ Array(1) ] to deeply equal [ …(4) ]
 *       ```
 *
 *       `3600000` is the leak ADR-EC-018 describes, reproduced exactly. Read with mutation iv, the
 *       pair says something neither says alone: the PER-EMISSION PROVIDE is what delivers the clock
 *       isolation, and `excludeTestServices: true` is what keeps the console out of the shared memo
 *       map. Both halves of the ADR's fix are necessary, and they are necessary for DIFFERENT
 *       services. The readings arrays hold one entry each because Scenarios two, three and four abort
 *       at their first assertion before pushing.
 */

/** The SHARED tier's probe for this block. One build for the whole Feature, so `buildOrdinal` is 1. */
class ClockProbe extends Context.Service<ClockProbe, { readonly buildOrdinal: number }>()("ClockProbe") {}

/** How many times this block's shared Layer has been BUILT. Asserted from inside Scenario three. */
let clockSharedBuilds = 0

/** What Scenario one logs, and what Scenario four must NOT be able to see. */
const clockConsoleMarker = "first-shared-clock-scenario-marker"

/** What Scenario four logs into its OWN console, to prove the accessor is live rather than empty. */
const fourthConsoleMarker = "fourth-shared-clock-scenario-marker"

/**
 * The shared tier. `Layer.effect` and not `Layer.succeed` for plan 10-03's reason, restated because
 * it reads as removable: only the effectful constructor has a build-time body to count in.
 */
const clockLayer = Layer.effect(
  ClockProbe,
  Effect.gen(function*() {
    // Same `require-yield` satisfaction as every other assertion-only generator body in this file.
    yield* Effect.void
    clockSharedBuilds += 1
    return ClockProbe.of({ buildOrdinal: clockSharedBuilds })
  })
)

/** The clock reading each Scenario took at its own START. Every entry must be 0. */
const clockReadings: Array<number> = []

/** The full name of each shared-clock Scenario that ran to completion. */
const clockScenarioNames: Array<string> = []

/**
 * Four Scenarios, exactly ONE of which advances the clock.
 *
 * The four Scenario TITLES are fixed: plan 10-05's real-CLI gate asserts on them by exact suffix
 * match, so renaming one here without renaming it there turns that gate's assertion vacuously true.
 */
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
// `Layer.empty` in the `perScenario` position is the block header's fourth section, at the call site.
describeFeature(sharedClockFeature, { shared: clockLayer, perScenario: Layer.empty }, ({ Then, When }) => {
  // FOUR distinct `When` definitions and not one shared body, unlike plan 10-03's shared block: the
  // four Scenarios genuinely differ here, and each one's own assertion is what makes that Scenario's
  // pass/fail status the external signal plan 10-05 reads.
  When("the first shared clock step advances the clock", function*() {
    // This Scenario reads 0 like every other one — it is not exempt from the claim, it is the
    // Scenario that goes on to break the clock for everyone after it.
    const before = yield* Clock.currentTimeMillis
    assert.strictEqual(before, 0)
    clockReadings.push(before)

    // Logged HERE so Scenario four has something to fail to see. A marker written by a Scenario that
    // does not itself assert on it is the only shape that can prove console isolation: a Scenario
    // asserting on its own log proves the console works, not that it is fresh.
    yield* Console.log(clockConsoleMarker)

    // THE one clock mutation in this entire file, and the acceptance criteria pin it at exactly one.
    // A second one anywhere would make "still starts at time zero" ambiguous about which mutation the
    // later Scenarios survived.
    yield* TestClock.adjust("1 hour")

    // The other half of BEH-EC-012's requirement, and the reason this is not merely an isolation
    // test: a step MUST be able to advance the simulated clock deterministically. A `TestClock` that
    // silently ignored the adjustment would leave every OTHER assertion in this block green.
    const after = yield* Clock.currentTimeMillis
    assert.strictEqual(after, 3_600_000)
  })

  When("the second shared clock step reads the clock", function*() {
    // ADR-EC-018, as one line. Under the pre-Phase-10 implementation — and under any change that
    // lets the framework compose `TestEnv` into the memoised shared Layer — this reads 3600000.
    const millis = yield* Clock.currentTimeMillis
    assert.strictEqual(millis, 0)
    clockReadings.push(millis)
  })

  When("the third shared clock step reads the clock and the shared build count", function*() {
    const millis = yield* Clock.currentTimeMillis
    assert.strictEqual(millis, 0)
    clockReadings.push(millis)

    // The anti-over-fix half, and the reason this block is not simply plan 10-03's block with a
    // clock in it: isolation bought by giving up the shared build would satisfy every assertion
    // above while destroying the only reason to write `shared` at all. The ordinal is read back out
    // of the resolved SERVICE, so a Layer built once and handed to nobody could not produce it.
    const probe = yield* ClockProbe
    assert.strictEqual(probe.buildOrdinal, 1)
    assert.strictEqual(clockSharedBuilds, 1)
  })

  When("the fourth shared clock step reads the clock and its own console", function*() {
    const millis = yield* Clock.currentTimeMillis
    assert.strictEqual(millis, 0)
    clockReadings.push(millis)

    // RUN-04's `TestConsole` half. Scenario one logged `clockConsoleMarker` into ITS console; if this
    // Scenario received that same built console rather than its own, the marker is here.
    assert.deepStrictEqual(yield* TestConsole.logLines, [])

    // The non-vacuity control, and it is not optional: an accessor that always returned `[]` would
    // satisfy the line above forever. This proves the capture is live in THIS Scenario, which is what
    // makes the emptiness above a statement about isolation rather than about instrumentation.
    yield* Console.log(fourthConsoleMarker)
    assert.deepStrictEqual(yield* TestConsole.logLines, [fourthConsoleMarker])
  })

  // ONE definition matched by all four Scenarios — `currentTestName()` differs per running test, so
  // one body records four distinct names.
  Then("the shared clock scenario is done", function*() {
    // Same `require-yield` satisfaction as the other assertion-only bodies in this file.
    yield* Effect.void
    clockScenarioNames.push(currentTestName())
  })
})

/**
 * DECLARED AFTER the block that registered the Feature, for the declaration-order reason every other
 * reader in this file uses.
 */
describe("a shared Layer keeps every Scenario its own TestClock and TestConsole (10-04)", () => {
  it("started all four Scenarios at time zero, including the three that ran after the one-hour advance", () => {
    // Four zeros, ORDERED. The three after the first are the claim; the first is in the array so that
    // a block which somehow ran only Scenario one cannot pass this by holding `[0]` — that is what
    // an exact-array comparison buys over `every((ms) => ms === 0)`.
    expect(clockReadings).toEqual([0, 0, 0, 0])
  })

  it("emitted and ran all four Scenarios, each nested under the Feature", () => {
    // `completedScenarios`'s argument, and it is load-bearing on this path specifically: `layer(...)`
    // registers through a callback, so a shared branch that never invoked it emits nothing at all and
    // every in-body assertion above would assert nothing (T-10-03-03).
    expect(clockScenarioNames).toEqual([
      `Shared clock isolation${nameSeparator}the first shared clock scenario advances the test clock by one hour`,
      `Shared clock isolation${nameSeparator}the second shared clock scenario still starts at time zero`,
      `Shared clock isolation${nameSeparator}the third shared clock scenario still starts at time zero and shares one build`,
      `Shared clock isolation${nameSeparator}the fourth shared clock scenario gets its own test console`
    ])
  })
})

/**
 * Plan 10-04, Task 2 — a `Rule`'s own `extraLayer` under a `shared` Feature. The FOURTEENTH real
 * `describeFeature` call in this file, and the LAST block in it.
 *
 * This closes `10-CONTEXT.md`'s D-03: the combination of ADR-EC-006's `shared` scope with
 * ADR-EC-010's Rule-scoped `extraLayer`. Both ADRs describe that combination only in PROSE. Neither
 * ADR-EC-010's own Rule-isolation tests (the `Rule composition` block halfway up this file) nor plan
 * 10-03's shared-Layer block exercises it, and the composition it depends on CHANGED in plan 10-02 —
 * a Rule's `extraLayer` is now composed onto the per-Scenario tier alone, with any shared service it
 * needs left on the composed Layer's `RIn` for the ambient `layer(...)` context to satisfy. That
 * property was measured during planning and is asserted here; this block is what keeps it true.
 *
 * ## The two claims, and why one array cannot carry both
 *
 * - `ruleExtraOrdinals` is `[1, 2]` — the Rule's Layer is per-Scenario scoped (ADR-EC-010), so two
 *   Scenarios in the Rule mean two builds.
 * - `ruleSharedOrdinals` is `[1, 1]` — the Feature's `shared` Layer is built ONCE for the whole run,
 *   and being READ by a Rule's Layer must not cause it to be REBUILT.
 *
 * Those are two different properties across one trust boundary, and the pair distinguishes three
 * arrangements a single array cannot: "both memoised" (`[1, 1]` / `[1, 1]`), "both fresh" (`[1, 2]` /
 * `[1, 2]`), and the one correct arrangement. Scenario two additionally asserts `sharedCatalogBuilds`
 * is exactly 1 from INSIDE its own body, which is plan 10-03's pattern and for its reason: that makes
 * the claim observable from outside the process as a test node's pass/fail status, which a reporter
 * has a field for and a module counter does not.
 *
 * ## `netPrice` is DERIVED, and the derivation is the evidence
 *
 * `ruleDiscountLayer` reads `SharedCatalog` while it builds and returns `listPrice - 10`. 90 is a
 * number this file never writes down, so its presence is evidence about HOW the two Layers composed
 * rather than merely that both are reachable — the `Rule composition` block's own argument, applied
 * one tier up. It is also the only assertion here that would fail if plan 10-02's `RIn` claim were
 * wrong, because a Rule Layer whose shared dependency went unsatisfied does not build at all.
 *
 * Derivation is NOT sufficient on its own, and mutation vii below is the proof: a hardcoded
 * `Layer.succeed` still satisfies `ruleNetPrices`. That is exactly why the build-ordinal assertion is
 * kept BESIDE the derived-value one rather than folded into it (T-10-04-04).
 *
 * ## The name assertion is restated here rather than inherited from the `Rule composition` block
 *
 * That block already proves a Rule's name sits BETWEEN the Feature's and the Scenario's — on the
 * DEFAULT path. The shared path reaches `describe` through a different `TestApi` object, and could
 * nest differently with every other assertion in this block still green (T-10-04-05). So
 * `sharedRuleScenarioNames` is compared in full.
 *
 * ## Mutation-tested (each performed, run, then reverted)
 *
 * - vi.  `describeFeature.ts`'s `Rule` container changed to compose `extraLayer` onto BOTH tiers,
 *        `Layer.provideMerge(Layer.merge(featureLayer, sharedLayer))(extraLayer)` — the plausible
 *        "the Rule should see the whole ambient Layer" tidy-up, and the exact change the comment at
 *        that line warns against.
 *
 *        **NOTHING went red. 768 passed, the same as unmutated.** The plan predicted
 *        `ruleSharedOrdinals` would become `[1, 2]`, and the reason it does not is the same
 *        memo-map mechanism mutation iv turned up one block above: `Effect.provide` forks the
 *        `CurrentMemoMap` that `layer(...)`'s `buildWithMemoMap` left in the ambient context, and
 *        `sharedLayer` here is the SAME OBJECT `layer(...)` already built. Merging it into the
 *        Rule's provide is therefore a memo HIT, not a rebuild. Recorded rather than smoothed over,
 *        because it is a real limit on what this assertion can see: the composition change plan
 *        10-02 made is guarded by `verify:testapi-seam` and by the `RIn` claim below, NOT by the
 *        shared build count, and anyone reading `[1, 1]` as proof that the tiers stayed separate
 *        would be reading more into it than it says.
 * - vi-b. The same change with the memoisation defeated — `Layer.merge(featureLayer,
 *        Layer.fresh(sharedLayer))` — which is what a composition that genuinely rebuilds the shared
 *        tier per Rule Scenario looks like. Run because mutation vi left `ruleSharedOrdinals`
 *        unproven, and an assertion no mutation can turn red is not yet known to assert anything.
 *        5 fail, all this block's and nothing else in the repo:
 *
 *        ```
 *        FAIL  Shared rule composition > … > the second rule scenario under a shared feature rebuilds only the rule tier
 *              AssertionError: expected 3 to equal 1
 *        FAIL  … > gave both Rule Scenarios the SAME single shared build
 *              AssertionError: expected [ 2 ] to deeply equal [ 1, 1 ]
 *        FAIL  … > rebuilt the Rule's own extraLayer once per Scenario in the Rule
 *              AssertionError: expected [ 1 ] to deeply equal [ 1, 2 ]
 *        FAIL  … > computed the Rule tier's price from the SHARED tier's, in both Scenarios
 *              AssertionError: expected [ 90 ] to deeply equal [ 90, 90 ]
 *        FAIL  … > emitted both Scenarios under the Feature AND under the Rule
 *              AssertionError: expected [ Array(1) ] to deeply equal [ …(2) ]
 *        ```
 *
 *        Scenario ONE already reads shared ordinal `2` under this mutation, because the Rule's
 *        provide rebuilds the catalog before that Scenario's first step runs. So `ruleSharedOrdinals`
 *        IS a real build-count assertion; what mutation vi establishes is only that Layer identity,
 *        not composition shape, is what the count actually tracks.
 * - vii. `ruleDiscountLayer` changed from a `Layer.effect` reading `SharedCatalog` to a
 *        `Layer.succeed` with a hardcoded `netPrice: 90`. **Exactly 1 fails**, and it is the ordinal
 *        assertion:
 *
 *        ```
 *        FAIL  … > rebuilt the Rule's own extraLayer once per Scenario in the Rule
 *              AssertionError: expected [ 1, 1 ] to deeply equal [ 1, 2 ]
 *        ```
 *
 *        `ruleNetPrices` stays `[90, 90]` and passes, exactly as predicted. That is the whole
 *        argument for keeping the build-ordinal assertion BESIDE the derived-value one instead of
 *        folding the two together: a derived value proves the tiers composed, and says nothing at all
 *        about how often either of them built (T-10-04-04).
 */

/** The FEATURE's `shared` tier: built ONCE for the whole run, and read by the Rule's Layer. */
class SharedCatalog extends Context.Service<SharedCatalog, {
  readonly listPrice: number
  readonly buildOrdinal: number
}>()("SharedCatalog") {}

/**
 * The RULE's own tier, DERIVED from the shared one.
 *
 * `netPrice` is computed from `SharedCatalog` while this Layer builds — see the block header on why
 * that is evidence and why `buildOrdinal` beside it is still not redundant.
 */
class RuleDiscount extends Context.Service<RuleDiscount, {
  readonly netPrice: number
  readonly buildOrdinal: number
}>()("RuleDiscount") {}

/** How many times the Feature's `shared` Layer has been built. Must be 1 for the whole run. */
let sharedCatalogBuilds = 0

/** How many times the Rule's `extraLayer` has been built. Must be one per Scenario in the Rule. */
let ruleDiscountBuilds = 0

/** The Feature's `shared` tier. `Layer.effect` for plan 10-03's reason: only it has a build body. */
const sharedCatalogLayer = Layer.effect(
  SharedCatalog,
  Effect.gen(function*() {
    // Same `require-yield` satisfaction as the other build bodies in this file — the counter IS the
    // observation, so there is nothing to await, and `Layer.succeed` would delete the measurement.
    yield* Effect.void
    sharedCatalogBuilds += 1
    return SharedCatalog.of({ listPrice: 100, buildOrdinal: sharedCatalogBuilds })
  })
)

/**
 * The Rule's `extraLayer`, and the whole point of this block.
 *
 * It DEPENDS on `SharedCatalog`, which plan 10-02 left on this composed Layer's `RIn` rather than
 * satisfying it here: `Layer.provideMerge(featureLayer)(extraLayer)` feeds only the PER-SCENARIO tier
 * in, and the ambient context `layer(...)` establishes around the emitted node is what resolves the
 * shared half at run time. Nothing in the repo asserted that until this block; `describeFeature.ts`
 * line ~843 names this block by number as the thing that keeps it true.
 */
const ruleDiscountLayer = Layer.effect(
  RuleDiscount,
  Effect.gen(function*() {
    ruleDiscountBuilds += 1
    const catalog = yield* SharedCatalog
    return RuleDiscount.of({ netPrice: catalog.listPrice - 10, buildOrdinal: ruleDiscountBuilds })
  })
)

/** The SHARED build each Rule Scenario reached. Both entries must name the same single build. */
const ruleSharedOrdinals: Array<number> = []

/** The RULE build each Rule Scenario reached, in the same run. The two entries must differ. */
const ruleExtraOrdinals: Array<number> = []

/** The derived price each Rule Scenario read — 90, which this file never writes down. */
const ruleNetPrices: Array<number> = []

/** The full name of each Rule Scenario under the shared Feature that ran to completion. */
const sharedRuleScenarioNames: Array<string> = []

/**
 * ONE `Rule:` containing two Scenarios, under a Feature declared with `{ shared, perScenario }`.
 *
 * Two and not three: unlike plan 10-03's build-count blocks, the defect this block guards against
 * shows up on the SECOND Scenario (a shared Layer rebuilt for the Rule reads ordinal 2 there, and a
 * Rule Layer that stopped rebuilding reads ordinal 1). A third Scenario would add a third sample of
 * a claim two already separate.
 *
 * The Rule name and both Scenario TITLES are fixed: plan 10-05's real-CLI gate asserts on them by
 * exact suffix match, so renaming one here without renaming it there turns that gate vacuously true.
 */
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
// `perScenario: Layer.empty` again, for the same reason as the block above: with nothing in that
// tier, the Rule's Layer reaching `SharedCatalog` at all can only have happened through the ambient
// `layer(...)` context, which is precisely plan 10-02's `RIn` claim.
describeFeature(sharedRuleFeature, { shared: sharedCatalogLayer, perScenario: Layer.empty }, ({ Rule }) => {
  Rule("discounted checkout under a shared catalog", ruleDiscountLayer, ({ Then, When }) => {
    When("the first shared rule scenario reads both tiers", function*() {
      const catalog = yield* SharedCatalog
      const discount = yield* RuleDiscount

      // 100 is the shared tier's own constant; 90 is reachable ONLY if the Rule's Layer built with
      // `SharedCatalog` resolved from the ambient context — see the block header.
      assert.strictEqual(catalog.listPrice, 100)
      assert.strictEqual(discount.netPrice, 90)

      ruleSharedOrdinals.push(catalog.buildOrdinal)
      ruleExtraOrdinals.push(discount.buildOrdinal)
      ruleNetPrices.push(discount.netPrice)
    })

    When("the second shared rule scenario reads both tiers and the shared build count", function*() {
      // FIRST, and deliberately so: this is the assertion plan 10-05's CLI gate can observe from
      // outside the process as this node's pass/fail status. It fails the moment the shared tier is
      // rebuilt for the Rule, which is the defect this whole block exists to catch.
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

/**
 * DECLARED LAST IN THIS FILE, after the block that registered the Feature, for the declaration-order
 * reason every other reader here uses.
 */
describe("a Rule's own extraLayer under a shared Feature rebuilds only the Rule tier (10-04)", () => {
  it("gave both Rule Scenarios the SAME single shared build", () => {
    // D-03's first half, and roadmap SC #2 one nesting level deeper: a `Rule` inside a `shared`
    // Feature must not cost that Feature its build-once guarantee.
    expect(ruleSharedOrdinals).toEqual([1, 1])
  })

  it("rebuilt the Rule's own extraLayer once per Scenario in the Rule", () => {
    // D-03's second half, and ADR-EC-010's per-Scenario scope. Paired with the assertion above for
    // the reason the block header gives: neither array alone can tell the correct arrangement from
    // "both memoised" or "both fresh" (T-10-04-03).
    expect(ruleExtraOrdinals).toEqual([1, 2])
  })

  it("computed the Rule tier's price from the SHARED tier's, in both Scenarios", () => {
    // Plan 10-02's `RIn` claim, asserted rather than trusted: a Rule Layer whose shared dependency
    // went unsatisfied would not build at all, so 90 twice is the composition working. Mutation vii
    // is why this does not replace the ordinal assertion above.
    expect(ruleNetPrices).toEqual([90, 90])
  })

  it("emitted both Scenarios under the Feature AND under the Rule", () => {
    // The Rule's name must sit BETWEEN the Feature's and the Scenario's. Restated on the shared path
    // rather than inherited from the `Rule composition` block, because this path reaches `describe`
    // through a different `TestApi` object (T-10-04-05) — and, as ever, an implementation that
    // emitted nothing would leave all three assertions above comparing empty arrays.
    expect(sharedRuleScenarioNames).toEqual([
      `Shared rule composition${nameSeparator}discounted checkout under a shared catalog${nameSeparator}the first rule scenario under a shared feature reads both tiers`,
      `Shared rule composition${nameSeparator}discounted checkout under a shared catalog${nameSeparator}the second rule scenario under a shared feature rebuilds only the rule tier`
    ])
  })
})

/**
 * Plan 10-07 — closing the one gap `10-VERIFICATION.md` found: a `shared` Layer with EVERY Scenario
 * in the Feature excluded by the tag filter, and at least one unused step definition, must never be
 * built. Appended at the END of this file, after every block above, per this file's own documented
 * declaration-order rule; the reader `describe` goes last, after the `describeFeature` call it reads.
 *
 * `CR-02`/gap[0]'s mechanism, reproduced here: on the shared path every emission used to go through
 * `sharedIt.effect`, and the installed `@effect/vitest@4.0.0-rc.112`'s own implementation of that
 * constructor flatMaps the memoised shared-Layer build before running ANY body — including the `⚠`
 * unused-step-definition node's, whose whole body is `Effect.void`. A Feature with `{ shared,
 * perScenario }`, an `excludeTags` filter removing every Scenario, and one unused step definition
 * therefore still built the (potentially expensive) `shared` Layer for zero runnable Scenarios.
 * `Runner.ts`'s `EmitOptions.contextFree` plus `describeFeature.ts`'s `sharedLayerTestApi` routing fix
 * this by sending a `contextFree` node through the module-level, Layer-free constructor even on the
 * shared path — this block is the in-process regression proof that the fix holds.
 *
 * ## Why this Feature carries a SECOND, unused step definition at all
 *
 * The whole point of this block is the combination `10-VERIFICATION.md` named: excluded Scenarios
 * ALONE never built the shared tier before this plan either — nothing forces a build for a Feature
 * with zero Scenarios and zero warnings. It is specifically the always-passing `⚠` node, forced by an
 * unused pattern, that travels the route the fix closes. Without the second definition below, this
 * block would pass for the wrong reason (nothing was ever emitted at all) rather than the right one
 * (something WAS emitted, and it did not force a build) — which is exactly what the third `it` below
 * guards against.
 *
 * ## Why the excluded tag never reaches `vitest.config.ts`
 *
 * `Runner.ts` note (g): an excluded Scenario never becomes a test node at all, so its tag is never
 * handed to the framework at all — `strictTags` has nothing to validate. No `vitest.config.ts`
 * declaration is needed for `@excluded-everything`, unlike the tag blocks above this one in the file.
 *
 * ## Mutation-tested (every one performed against real source, run, then reverted — plan 10-07 Task 3)
 *
 * - 1. **The defect, restored.** `describeFeature.ts`'s `sharedLayerTestApi` route selection deleted,
 *      sending every emission through the shared route unconditionally → the "counter is 0" test below
 *      goes RED, reading `1`. Reproduces the gap in this working tree from the composition-root side.
 * - 2. **The flag, inverted.** `Runner.ts`'s `warningEmitOptions` constant's `contextFree` flipped to
 *      `false`, `describeFeature.ts` left untouched → the same test goes RED the same way, `1`.
 *      Separates the two halves of the fix: the routing branch alone does nothing if the emitter never
 *      classifies the node as context-free.
 * - 3. **The mirror-image mistake.** `Runner.ts`'s `afterAllScenariosEmitOptions` constant's
 *      `contextFree` flipped to `true` → `Runner.test.ts`'s routing projection (Task 2) goes RED,
 *      while every assertion in THIS file, including this block's three, stays GREEN. That asymmetry
 *      is exactly why Task 2's structural assertion exists: nothing in this file exercises a hook
 *      under a shared Feature, so nothing here would ever notice a Feature's teardown silently routed
 *      off the shared tier.
 * - 4. **The non-vacuity control, exercised.** The unused step definition deleted from this block's
 *      `define` callback, everything else including the fix left in place → the "still reported"
 *      assertion below goes RED (the array of `UnusedStepDefinition` lines becomes empty) while the
 *      counter assertion stays GREEN at `0`. Proves the control is load-bearing: without it, this
 *      block would stay green under a future change that silently stopped emitting `⚠` nodes under a
 *      total exclusion, which would be `Runner.ts` note (g)'s own violation.
 *
 * See the plan 10-07 SUMMARY for the full mutation table (file/line, expected, observed).
 */

/** How many times this block's shared tier has been built. Must stay `0` — the whole claim. */
let excludedEverythingSharedBuilds = 0

/** The shared tier's probe service, mirroring `SharedProbe`'s shape one section above. */
class ExcludedEverythingProbe
  extends Context.Service<ExcludedEverythingProbe, { readonly buildOrdinal: number }>()("ExcludedEverythingProbe")
{}

/**
 * The shared tier. `Layer.effect`, not `Layer.succeed`, copying `sharedProbeLayer`'s shape exactly —
 * see that block's own comment for why the build needs a body at all despite having nothing to await.
 */
const excludedEverythingSharedLayer = Layer.effect(
  ExcludedEverythingProbe,
  Effect.gen(function*() {
    // Same `require-yield` satisfaction as `sharedProbeLayer`'s body.
    yield* Effect.void
    excludedEverythingSharedBuilds += 1
    return ExcludedEverythingProbe.of({ buildOrdinal: excludedEverythingSharedBuilds })
  })
)

/**
 * The full name of every Scenario in this block that actually ran. Must stay EMPTY — the second half
 * of the claim, separating "the counter is 0 because the fix works" from "the counter is 0 because
 * the Feature never registered anything for an unrelated reason".
 */
const excludedEverythingRan: Array<string> = []

/** How many times this block's `AfterAllScenarios` ran. Must stay `0`: nothing was attempted. */
let excludedEverythingTeardowns = 0

/**
 * ONE Scenario, tagged so `excludeTags` removes it — the whole Feature has nothing runnable. A new,
 * unique uri: `warningsFor` filters by uri, so a reused one would read another block's lines.
 */
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

// THE FIFTEENTH real `describeFeature` call in this file, and the first to combine the object form
// with an `excludeTags` filter that removes every Scenario. `perScenario: Layer.empty`, for
// `sharedBuildFeature`'s own reason above: it removes the per-Scenario tier as a possible explanation
// for what is (or is not) observed here.
describeFeature(
  excludedEverythingFeature,
  { shared: excludedEverythingSharedLayer, perScenario: Layer.empty },
  ({ AfterAllScenarios, When }) => {
    // Registered, and a no-op: with nothing attempted the teardown must not run (F-06), which is also
    // the only way it could not force the shared tier's build it would otherwise need.
    AfterAllScenarios(function*() {
      yield* Effect.void
      excludedEverythingTeardowns += 1
    })
    // The ONE definition the Feature's only Scenario's step matches — never reached, because the
    // Scenario is excluded before anything is emitted (note (g)).
    When("the excluded-everything step runs", function*() {
      excludedEverythingRan.push(currentTestName())
      yield* Effect.void
    })
    // The UNUSED definition — the entire reason this block exists. Its pattern matches no step in
    // this Feature at all, so `planFeature` reports it as an `UnusedStepDefinitionWarning`, and
    // `Runner.ts` emits its `⚠` node UNCONDITIONALLY (note (g)) — through the context-free route this
    // plan's fix sends it down.
    When("the excluded-everything step that no Scenario in this Feature calls", function*() {
      yield* Effect.void
    })
  },
  { excludeTags: ["@excluded-everything"] }
)

/**
 * DECLARED LAST IN THIS FILE, after the block that registered the Feature, for the declaration-order
 * reason every other reader here uses.
 */
describe("a shared Layer with every Scenario excluded stays unbuilt, even with an unused step definition (10-07)", () => {
  it("never built the shared tier — RUN-03's build discipline for the zero-runnable-Scenario case", () => {
    // The assertion this whole plan exists to make true. Under Anti-Pattern 3 / the pre-fix
    // `sharedLayerTestApi`, this reads `1`: the `⚠` node's `Effect.void` body forced the build anyway.
    expect(excludedEverythingSharedBuilds).toBe(0)
  })

  it("ran no Scenario at all — separating build discipline from registration failing for an unrelated reason", () => {
    expect(excludedEverythingRan).toEqual([])
  })

  it("ran no AfterAllScenarios teardown either — nothing was attempted, so there is nothing to tear down", () => {
    expect(excludedEverythingTeardowns).toBe(0)
  })

  it("still reported the unused step definition — the load-bearing non-vacuity control", () => {
    // Filtered rather than a whole-array `toHaveLength`: this Feature's single Scenario being
    // entirely excluded ALSO fires D-10's "N Scenario(s) excluded" notice on the same uri, so the
    // array legitimately carries two lines. Only the `UnusedStepDefinition` one is this control's
    // claim.
    //
    // Without this assertion, the counter test above would pass VACUOUSLY the moment the warning
    // stops being produced — a definition that accidentally matched a step, or a future change that
    // suppressed warnings under a total exclusion, would both leave this block green while measuring
    // nothing (mutation 4). NOT a proxy for the ⚠ NODE's emission: the console line comes from
    // describeFeature.ts's own body loop (~:1154) and the node from Runner.ts's emission loop
    // (~:680) — two independent code paths over one shared `plan.warnings` array. Suppressing the
    // node alone would leave this assertion green. What pins the node under a total exclusion is
    // `Runner.test.ts`'s "emits identical ⚠ nodes with no filter and with a filter that excludes
    // every Scenario"; what THIS control rules out is a Feature that produced no warning at all,
    // which is the other way the build-0 assertion above could go vacuous.
    const unusedDefinitionLines = warningsFor(excludedEverythingFeature.uri).filter((line) =>
      line.includes("UnusedStepDefinition")
    )
    expect(unusedDefinitionLines).toHaveLength(1)
    expect(unusedDefinitionLines[0]).toContain(
      JSON.stringify("the excluded-everything step that no Scenario in this Feature calls")
    )
  })
})

// ---------------------------------------------------------------------------------------------
// F-18 / BEH-EC-007: the per-Scenario tier may be built FROM the shared tier. `DependentWorld`
// requires `DependentCatalog`, which only the shared tier provides. Every assertion is made INSIDE
// the emitted Scenarios, so nothing here depends on suite declaration order.
// mutation: pin the object form's `perScenario` back to `Layer<_, _, never>` and this file stops
// compiling; hoist `dependentCatalogLayer` into `perScenario` and `catalogOrdinal` reads 1, 2, 3.
// ---------------------------------------------------------------------------------------------

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

/** Built FROM the shared tier: `Layer<DependentWorld, never, DependentCatalog>`, the F-18 shape. */
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

/**
 * F-09 — a `shared` Layer's lifetime is the FEATURE's block, not the file's.
 *
 * Two Features in one file, each with its own `shared` tier built from `Effect.acquireRelease`, and a
 * module-scope log both tiers and both Scenarios append to. Feature B's Scenario asserts the WHOLE
 * log so far, which can only read `released-A` before `acquired-B` if Feature A's tier was closed
 * when Feature A's block ended — the named `layer(...)` form's `afterAll`, on the Feature's own
 * `describe`. Under the one-argument form this file used before, the close ran at the FILE's teardown
 * and this assertion read `["acquired-A", "scenario-A", "acquired-B"]` instead.
 *
 * mutation: routing the shared path back through the one-argument `layer(tier, opts)(callback)` form
 * turns Feature B's Scenario red on the log's third entry.
 */
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

describeFeature(lifecycleFeatureA, { shared: lifecycleLayerA, perScenario: Layer.empty }, ({ When }) => {
  When("the lifecycle A step reads its shared service", function*() {
    const a = yield* LifecycleA
    sharedLifecycleLog.push(`scenario-${a.name}`)
  })
})

describeFeature(lifecycleFeatureB, { shared: lifecycleLayerB, perScenario: Layer.empty }, ({ When }) => {
  When("the lifecycle B step reads its shared service and the log so far", function*() {
    const b = yield* LifecycleB
    // THE claim: A was released before B was acquired — i.e. at Feature A's block end.
    assert.deepStrictEqual(sharedLifecycleLog, ["acquired-A", "scenario-A", "released-A", "acquired-B"])
    sharedLifecycleLog.push(`scenario-${b.name}`)
  })
})

describe("a shared Layer is released when its Feature's block ends, not when the file does (F-09)", () => {
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

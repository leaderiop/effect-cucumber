/**
 * The fifth acceptance pair, and the only one whose subject is the RUNNER's own bracketing rather
 * than something a step computes: all six hook kinds registered from a real Feature's `define`
 * callback, and their full ordering across a two-Scenario Feature asserted from inside a running
 * step.
 *
 * ## What this dogfoods
 *
 * `spec/behaviors/07-hook-ordering-and-guarantees.md` (BEH-EC-017), whose headline requirement is a
 * SEQUENCE:
 *
 * ```
 * BeforeAllScenarios (once per Feature)
 *   -> per Scenario: Before -> per step (BeforeStep -> step body -> AfterStep) -> After
 *   -> AfterAllScenarios (once per Feature)
 * ```
 *
 * `@REQ-EC-016` (DSL-07) sits on the FIRST Scenario and on no other. The second Scenario carries no
 * tag because it is evidence for the same claim — the cross-SCENARIO half of it — rather than a
 * requirement of its own, and D-01 puts each tag on exactly one Scenario.
 *
 * ## The assertion is the WHOLE log, and that is not a stylistic preference
 *
 * Both Scenarios compare the recorded log to a full expected array with `assert.deepStrictEqual`,
 * never to a suffix and never with a membership or `.some(...)` check. An arrangement that gets every
 * PAIRWISE ordering right but the overall INTERLEAVING wrong — both Scenarios' `Before` hooks running
 * ahead of either Scenario's steps, or `BeforeAllScenarios` composed per Scenario instead of once per
 * Feature — satisfies every narrower projection while breaking the requirement outright.
 * `packages/vitest/test/Runner.test.ts`'s own six-hook test states the identical reason at the seam;
 * this is that claim made from inside a real `.feature` run, and the expected sequence lives in the
 * Gherkin file rather than in this module so a change to it turns these Scenarios red without this
 * file being touched.
 *
 * The exactly-once claim is asserted separately and in BOTH Scenarios, because "runs once per
 * Feature" and "runs once per Scenario" produce IDENTICAL logs when only one Scenario has run. It is
 * the second Scenario's copy that carries the claim; the first Scenario's is the control that makes
 * the second one's `1` a measurement rather than a coincidence.
 *
 * ## Why `HookLog` is in the SHARED tier, and why that is not dogfooding the shared tier
 *
 * This is the one acceptance module whose Layer choice is made for a reason other than exercising the
 * thing being chosen, so the reason is written down rather than left to be inferred.
 *
 * A per-Scenario Layer is REBUILT for every Scenario (INV-EC-002), so a per-Scenario `Ref` starts
 * empty in the second Scenario and the second half of the ordering claim — that the first Scenario's
 * `After` ran, that the second Scenario got its own `Before`, and that `BeforeAllScenarios` did NOT
 * run a second time — becomes unstateable. One log has to survive both Scenarios for the claim to
 * exist at all. Hence `{ shared: HookLog.layer, perScenario: Layer.empty }`: the object form's
 * `perScenario` is REQUIRED even when a Feature has no per-Scenario-fresh state (D-03), and
 * `Layer.empty` is what says this Feature has none.
 *
 * The other three pairs in this directory that assert per-Scenario freshness do so with a
 * per-Scenario recorder that must be EMPTY on entry. This file asserts the opposite shape on purpose,
 * and the two are not in tension: `worked-example-02-accounts` is where the shared tier's own
 * build-once behavior is the subject.
 *
 * ## What this pair does NOT state, named rather than implied
 *
 * BEH-EC-017 is five requirements joined into one document, and a pair of GREEN Scenarios can carry
 * only the ordering one. Each of the rest is carried elsewhere, and the `REQ-EC-016` row in
 * `spec/traceability.md` §5 names them:
 *
 * - **`After` runs when the Scenario FAILED.** A Scenario demonstrating it directly would be a red
 *   test, which is what plan 11-06's starved-fixture-plus-wrapper arrangement exists for.
 *   `packages/vitest/test/ScenarioEffect.test.ts` carries it today, in process — `After` on success,
 *   `After` on step failure, and `After` after a `Before` failure.
 * - **A failing guaranteed hook does not MASK the failure it guarded.** Same file: both causes reach
 *   the reported failure, combined. Nothing green can state a claim about what a FAILURE reports.
 * - **The independent-batch combined-cause semantics** — that a failing hook does not stop the rest
 *   of its own batch and that every failure in the batch is combined into one. Carried by
 *   `packages/vitest/test/Hook.test.ts`, which is where the batch composition itself is tested; this
 *   Feature registers exactly one hook per kind, so it cannot distinguish a batch from a singleton.
 * - **`AfterAllScenarios`'s POSITION in the sequence.** Structurally unobservable from inside a step:
 *   the node is emitted AFTER every Scenario, so no step body can be running when it fires, and
 *   neither expected array below can contain its label. What this pair does show is that it ran at
 *   all — registering the hook makes the runner emit a THIRD node, `⚙ AfterAllScenarios`, and that
 *   node passing is its body having succeeded. Measured, not assumed: this file reports 3 passing
 *   tests, not 2. Its POSITION is pinned by `packages/vitest/test/Runner.test.ts`'s full-sequence
 *   assertion, and `emission.test.ts` carries both the executed-for-real proof and the all-skipped
 *   suppression carve-out.
 *
 * ## The directory's two standing deviations apply here unchanged
 *
 * Both are stated in full in `packages/vitest/test/acceptance/README.md` and restated per file so a
 * reader comparing this to `spec/behaviors/07`'s worked example does not read the difference as
 * drift.
 *
 * 1. **`loadFeature` comes from `@effect-cucumber/gherkin`, not from `@effect-cucumber/vitest`.**
 *    ADR-EC-024's `ManagedRuntime`-backed wrapper is not exported, so this file reaches the gherkin
 *    package's `Effect`-returning `loadFeature` and provides `NodeFileSystem.layer` plus
 *    `ParameterTypeStore.Default` itself. The load uses a genuine top-level `await` and never
 *    `Effect.runSync`: `NodeFileSystem.readFileString` suspends internally, so `runSync` over a
 *    path-based load throws `AsyncFiberError`.
 * 2. **`describeFeature` is imported by relative path from `../../src/describeFeature.ts`.** oxlint's
 *    `effect/no-import-from-barrel-package` runs with `checkRelativeIndexImports: true`. The module
 *    object reached is the one the barrel re-exports.
 *
 * A third deviation is specific to this file: `spec/behaviors/07`'s worked example registers its
 * hooks against a plain `Log.layer`, i.e. the per-Scenario tier. That example asserts nothing across
 * a Scenario boundary, so the choice never bites there; here it would, for the reason the shared-tier
 * section above gives.
 *
 * ## Mutation-tested (every one performed, run, then reverted)
 *
 * The directory README's standing rule: a passing acceptance test proves nothing on its own, so each
 * entry names what went RED and — the part that is easiest to omit — what stayed GREEN. This pair
 * emits THREE tests — the two Scenarios plus the `⚙ AfterAllScenarios` node. B, C and E attack the
 * two gate scripts this plan also builds and are recorded in the METHOD NOTE of the script each one
 * attacks, beside the code they mutate; A and D are recorded here, because this file is what they
 * mutate.
 *
 * - **A. A mutable binding at an acceptance step module's own module scope.** `let
 *      mutationProbeCount = 0` added beside this module's `record` helper and incremented from a step
 *      body — the exact defect INV-EC-006 forbids and the exact shape a step would close over →
 *      `pnpm verify:acceptance-ref-state` RED, naming
 *      `packages/vitest/test/acceptance/hooks.steps.test.ts:183`, while **`pnpm test` (37 files, 796
 *      passed, 4 skipped), `pnpm lint`, `pnpm build` and `pnpm typecheck:test` ALL stayed GREEN**.
 *      Those four are the entry. Before that gate existed this repository had NOTHING that could see
 *      this, and `pnpm lint` staying green is the sharpest part of it: no oxlint rule enabled here
 *      objects to a module-scope `let`, so the linter never was the missing enforcement.
 * - **D. The escape-hatch type in a step body's parameter annotation.** The `expected` parameter of
 *      `the hook log reads {string} with {string} logged {int} time` re-annotated from `string` to the
 *      escape-hatch type → `pnpm verify:acceptance-no-any` RED, naming this file at line 242, while
 *      **`pnpm build`, `pnpm typecheck:test`, `pnpm test` and `pnpm lint` ALL stayed GREEN**. That is
 *      INV-EC-003's boundary condition made observable rather than merely stated: the whole failure
 *      mode is the ABSENCE of a diagnostic, so there is nothing for a compiler or a runner to report
 *      — inside the suite whose entire job is to prove INV-EC-003 by running it.
 *
 * - **F. The expected sequence really comes from the `.feature` file.** `AfterStep` and `BeforeStep`
 *      transposed in the SECOND Scenario's expected string in `hooks.feature`, this module untouched →
 *      **exactly 1 of 3 red**, `expected [ 'BeforeAllScenarios', …(13) ] to deeply equal
 *      [ 'BeforeAllScenarios', …(13) ]` with the arrays first differing at index 4. The first Scenario
 *      and the `⚙ AfterAllScenarios` node stayed GREEN, and that narrow blast radius is the point:
 *      each Scenario asserts its OWN file-supplied sequence rather than a constant this module holds,
 *      so a change to one expectation cannot turn the other red by accident.
 * - **G. `BeforeAllScenarios` composed per Scenario rather than once.** Its registration deleted and
 *      its label appended from the `Before` hook body instead, so it lands once per Scenario →
 *      **exactly 1 of 3 red, and it is the SECOND Scenario**, `expected [ 'BeforeAllScenarios', …(14) ]
 *      to deeply equal [ 'BeforeAllScenarios', …(13) ]`. The FIRST Scenario stayed GREEN and correctly
 *      so — with one Scenario run, once-per-Feature and once-per-Scenario produce the identical log.
 *      That is the whole reason the second Scenario exists, and no assertion available to the first
 *      one could have replaced it.
 *
 *      **G2**, the sharpened form, because falsifying an assertion is not the same measurement as
 *      showing it is load-bearing (this repo's 11-04 E1/E2 lesson): mutation G re-run with the
 *      `deepStrictEqual` line REMOVED and only the count assertion left → still red, now
 *      `expected 2 to equal 1`. So the exactly-once assertion catches this defect ALONE and is not
 *      decorative beside the array comparison. Under unmutated G the array assertion reports first
 *      simply because it is written first; G2 is what says the count line would have caught it anyway.
 */
import { loadFeature, ParameterTypeStore } from "@effect-cucumber/gherkin"
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem"
import { assert } from "@effect/vitest"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Ref from "effect/Ref"
import { fileURLToPath } from "node:url"
import { describeFeature } from "../../src/describeFeature.ts"

/** The `.feature` file beside this one, resolved relative to this module rather than `process.cwd()`. */
const featurePath = fileURLToPath(new URL("./hooks.feature", import.meta.url))

/**
 * Real bytes off disk, through the real parser, at module top level.
 *
 * `ParameterTypeStore.Default` and not a file-private store: this Feature's patterns use `{string}`
 * and `{int}` only, so it declares no custom parameter type and has nothing to keep private.
 */
const feature = await Effect.runPromise(
  loadFeature(featurePath).pipe(
    Effect.provide(Layer.mergeAll(NodeFileSystem.layer, ParameterTypeStore.Default))
  )
)

/**
 * The one ordered log every hook body and every step body in this Feature appends to.
 *
 * Provided through the SHARED tier — see the header's shared-tier section for why the cross-Scenario
 * half of BEH-EC-017's ordering claim cannot be stated against a per-Scenario `Ref`.
 */
class HookLog extends Context.Service<HookLog, { readonly entries: Ref.Ref<ReadonlyArray<string>> }>()("HookLog") {
  static readonly layer = Layer.effect(
    this,
    Effect.gen(function*() {
      return HookLog.of({ entries: yield* Ref.make<ReadonlyArray<string>>([]) })
    })
  )
}

/**
 * Append one label to the log.
 *
 * A plain function returning an `Effect` that REQUIRES `HookLog`, matching `emission.test.ts`'s own
 * `append` helper and this directory's four other pairs. It holds no state of its own — the log lives
 * in the Layer-provided `Ref`, which is what keeps this a helper rather than the module-scope mutable
 * holder PROH-11-03 forbids and `scripts/verify-acceptance-ref-state.sh` now rejects.
 */
const record = (label: string) =>
  Effect.gen(function*() {
    const { entries } = yield* HookLog
    yield* Ref.update(entries, (held) => [...held, label])
  })

// THE CALL UNDER TEST. Module scope, nothing wrapping it, nothing intercepting it. The object Layer
// form, with the log in the SHARED tier and `perScenario: Layer.empty` beside it because D-03 requires
// the key even when a Feature has no per-Scenario-fresh state — which this one genuinely does not.
describeFeature(feature, { shared: HookLog.layer, perScenario: Layer.empty }, (dsl) => {
  // ── The six hook kinds ────────────────────────────────────────────────────────────────────────
  // All six registered from THIS `define` callback and nowhere else (DSL-04 applies to hooks
  // identically), each as a BARE generator function taking NO arguments — BEH-EC-017's last
  // requirement, and ADR-EC-005's Negative consequence: `BeforeStep`/`AfterStep` do not receive the
  // step they bracket. Each is wrapped by the library, never by this file.
  //
  // Registered in the order they RUN, so the source reads as the sequence the Scenarios assert.

  dsl.BeforeAllScenarios(function*() {
    yield* record("BeforeAllScenarios")
  })

  dsl.Before(function*() {
    yield* record("Before")
  })

  dsl.BeforeStep(function*() {
    yield* record("BeforeStep")
  })

  dsl.AfterStep(function*() {
    yield* record("AfterStep")
  })

  dsl.After(function*() {
    yield* record("After")
  })

  // Registered and real, and this pair asserts NOTHING about it — the node is emitted after every
  // Scenario, so no step body can be running when it fires. The header names the two files that do
  // state it. Registering it here anyway is the point of "all six kinds from one `define` callback":
  // a Feature that omitted it would not be exercising `FeatureDsl`'s sixth member at all.
  dsl.AfterAllScenarios(function*() {
    yield* record("AfterAllScenarios")
  })

  // ── The two step definitions ──────────────────────────────────────────────────────────────────
  // Both registered at FEATURE level, so one registration serves both Scenarios. `dsl.When(...)`
  // rather than a destructured `When`, for the reason `parsing-and-matching.steps.test.ts` states:
  // a bare binding here shadows the one a `Scenario(...)` callback receives, which oxlint's
  // `eslint(no-shadow)` rejects.

  // The label comes from the Gherkin file, not from this body, so the two Scenarios are told apart in
  // the log by data the `.feature` supplied.
  dsl.When("the scenario records {string}", function*(label: string) {
    yield* record(`step:${label}`)
  })

  dsl.Then(
    "the hook log reads {string} with {string} logged {int} time",
    function*(expected: string, kind: string, times: number) {
      const held = yield* Ref.get((yield* HookLog).entries)

      // THE ordering assertion: the WHOLE log against the WHOLE expected array, compared with
      // `deepStrictEqual`. Read BEFORE this step appends its own label, so what is compared is the
      // sequence as of the moment this body started — which is why the expected arrays in
      // `hooks.feature` end at the `BeforeStep` that bracketed this very step and carry no trailing
      // `AfterStep`/`After`: those have not happened yet, and writing them in would be asserting a
      // future.
      assert.deepStrictEqual([...held], expected.split(","))

      // The once-per-Feature claim, separately, because the array above cannot make it: with one
      // Scenario run, "once per Feature" and "once per Scenario" produce the identical log. The count
      // is supplied by the Gherkin file for the same reason the sequence is.
      assert.strictEqual(held.filter((entry) => entry === kind).length, times)

      yield* record("step:read")
    }
  )
})

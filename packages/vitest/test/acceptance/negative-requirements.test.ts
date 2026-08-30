/**
 * The wrapper that drives every starved fixture under `./negative/` and asserts the specific named
 * error or guarantee each one produces.
 *
 * Five requirements — PARSE-03, MATCH-03, MATCH-04, MATCH-05 and RUN-02 — are all "fails loudly"
 * behaviors, so a Scenario demonstrating one directly would be a RED test rather than a green one.
 * 11-CONTEXT.md **D-02**'s answer, extended from `scripts/verify-tsgo-gate.sh`'s committed
 * satisfied/starved flip pair (lines 139-201) one level up, from compile time to run time: the
 * deliberately-failing `.feature` file is the artifact that carries the `@REQ-EC-NNN` tag, and this
 * file drives it and asserts the named failure. **This wrapper is what passes.**
 *
 * It is a committed PAIR rather than a script that edits a file and re-runs, and that shape is the
 * whole argument. There is no mutable working tree, no cleanup path that can leave the repository
 * dirty, and the flip is re-proven on every CI run instead of once at authoring time.
 *
 * ## The two-check rule
 *
 * Every assertion below checks TWO things: that the failure happened, AND that it was the named one.
 * A fixture that fails for an entirely unrelated reason — a Gherkin typo, a moved file, a `.feature`
 * that no longer parses — satisfies the weaker check in every case and reports nothing. So each
 * block narrows on the error CLASS and on its `reason` tag, never on message prose. Mutation A below
 * is the measurement, not the argument.
 *
 * ## Why this file is NOT a `.steps.test.ts`
 *
 * The suffix is load-bearing in this directory. A `*.steps.test.ts` is one half of an acceptance
 * PAIR: a `.feature` handed to `describeFeature`, plus the module registering its steps. This file
 * is neither. It registers no acceptance Scenario, hands nothing to `describeFeature`, and emits no
 * Scenario as a test node — it drives `loadFeature`, `collectFeature` and `buildScenarioEffect`
 * directly and reads back values.
 *
 * **BOTH STRUCTURAL GATES NOW SCAN THIS FILE**, and that is a correction rather than a note. The two
 * gates plan 11-05 built — `scripts/verify-acceptance-ref-state.sh` and
 * `scripts/verify-acceptance-no-any.sh` — originally scanned `*.steps.test.ts` (and, for the second,
 * `*.feature`), so this file and `./pitfalls-checklist.test.ts` sat outside them: roughly half the
 * directory's TypeScript, governed by convention, inside the phase whose Success Criterion 2 is
 * AUTOMATED enforcement. Both gates now scan every `.ts` under this directory. Their rules are
 * unchanged and were already honoured here by hand — no mutable binding at module scope, no
 * occurrence of the escape-hatch type (PROH-11-02, PROH-11-03) — so widening them turned nothing red;
 * the point is that "honoured by hand" is no longer the mechanism. The `negative/` fixtures were
 * always scanned by the no-escape-hatch gate, because its `find` is recursive — verified, and
 * recorded in `./negative/README.md`.
 *
 * It still lives in the acceptance directory because the tagged artifacts it drives do. Moving it out
 * would separate the five `@REQ-EC-NNN` tags from the only file that redeems them.
 *
 * ## Where the failures ACTUALLY happen — a divergence from 11-06-PLAN.md, followed rather than fought
 *
 * The plan described MATCH-03 and MATCH-04 as `collectFeature` "producing" a `StepMatchError`, which
 * reads as a failed Effect. It is not: `collectFeature` returns a `FeatureCollection` synchronously
 * and **never fails**. An unmatched or ambiguous step becomes an `Unresolved` entry in
 * `collection.plan.scenarios[i].steps`, carrying the `StepMatchError` as a plain value, and the error
 * only enters an error channel one stage later, when `buildScenarioEffect` reaches that step and
 * fails ITS OWN Scenario with it (`ScenarioEffect.ts` note (c)). That is ADR-EC-019's whole design —
 * a broken step fails one Scenario and leaves the rest of the Feature runnable — so the assertions
 * below read the plan, which is where the fact lives. The library was not reshaped to match the
 * plan's description of it.
 *
 * Two smaller divergences, for the same reason:
 *
 * - MATCH-04's `matchedPatterns` is ordered by DEFINITION SITE (`file:line`), per 06-CONTEXT.md D-03,
 *   so that the list points a reader at where to go and fix it. Since swapping two registrations also
 *   swaps their line numbers, that order is not literally independent of registration order. What IS
 *   independent, and what the requirement is actually about, is the CONTENT: the defect MATCH-04
 *   guards against is an ambiguity silently resolved by whichever pattern was registered first, and
 *   the assertion below collects the fixture twice with the two registrations swapped and shows both
 *   patterns named, in full, both ways. The honest claim is asserted; the plan's stronger wording is
 *   not.
 * - Every import is by RELATIVE PATH to the concrete module, never through a barrel — `../../src/
 *   Errors.ts` rather than `../../src/index.ts`. The plan asked for the barrel, but oxlint's
 *   `effect/no-import-from-barrel-package` runs with `checkRelativeIndexImports: true` and rejects a
 *   relative import whose basename is `index.*`. The class object reached is the identical one the
 *   barrel re-exports (`index.ts:218` is `export { StepMatchError } from "./Errors.ts"`), so the
 *   "match on the class, not on message text" requirement is met exactly. This is the same standing
 *   deviation `../README.md` records for `describeFeature`.
 *
 * ## No module-scope state
 *
 * Every recorded value crosses through a `Ref` obtained from a Layer-provided service (PROH-11-03),
 * and the `Ref` is built INSIDE the test body and handed to `Layer.succeed`, so this module holds no
 * mutable binding at all — not even the factory-local array `ScenarioEffect.test.ts` uses to capture
 * each Layer build. It does not need one: `collectFeature`, unlike `describeFeature`, has no
 * module-scope requirement, so the whole arrangement fits inside one `it.effect` body.
 *
 * ## Mutation-tested (every one performed, run, then reverted)
 *
 * Recorded per `../README.md`'s standing rule: each entry names the mutation, what went RED, and —
 * the part that is easiest to omit — what stayed GREEN.
 *
 * - **A. THE two-check rule's own justification.** Two edits, measured in two runs. First the fixture
 *   was made to fail for a DIFFERENT reason: `unmatched-step.feature`'s step text changed to `the
 *   parcel is collected from the depot`, which the block's registered pattern DOES match, with a
 *   second pattern `the parcel is {word} from the depot` registered beside it so the step still fails
 *   — now as an AMBIGUITY. Against that state the SHARP form went **RED**, `expected 'AmbiguousStep'
 *   to equal 'UndefinedStep'`. Then, with the fixture left mutated, the assertion was weakened to "a
 *   failure occurred" — everything but `soleUnresolvedStep`'s `assert.strictEqual(_tag,
 *   "Unresolved")` deleted, the class check and the `reason` narrowing included — and the file went
 *   back to **6 passed, 0 failed**.
 *
 *   So the weakened form is GREEN against an `AmbiguousStep`: a failure with nothing whatever to do
 *   with MATCH-03, inside the block whose entire job is to carry MATCH-03, reporting nothing. Both
 *   runs are needed and neither alone says it — the red run shows the sharp assertion can fail, and
 *   only the green run shows what the blunt one lets through. This is the whole reason the two-check
 *   rule exists, and the reason the sharp form must never be "simplified" back into the blunt one.
 * - **B. A duplicated requirement id.** `@REQ-EC-009` added beside `@REQ-EC-011` on a Scenario in
 *   `../worked-example-01-apples.feature`, so two Scenarios in two files claim one requirement →
 *   **`verify-traceability.sh` check 5 RED**, `duplicated (D-01 allows one Scenario per id):
 *   REQ-EC-009`, while **check 4 stayed PASS** and **`pnpm test` stayed GREEN** at 802 passed. Check 4
 *   asks only whether every tag USED is DEFINED, and a tag used twice is still defined. It cannot see
 *   that a requirement now looks covered twice while the total still reads right to anyone not
 *   counting.
 * - **C. A missing requirement id.** `@REQ-EC-018` deleted outright from
 *   `./negative/after-on-failure.feature` → **check 5 RED**, `missing, so coverage is 21/22:
 *   REQ-EC-018`, while **check 4 stayed PASS** and **`pnpm test` stayed GREEN** at 802 passed. Check 4
 *   iterates the tags that EXIST, so a deleted tag is one fewer thing to check rather than a failure:
 *   completeness is the claim it structurally cannot make. B and C together are the whole argument
 *   for check 5 being a separate check rather than a stronger check 4, and both name check 4's
 *   staying green because that is the part that is easy to leave out.
 *
 *   A third data point arrived for free, before the §5 rows landed: with the five fixtures tagged and
 *   `spec/traceability.md` still only MENTIONING their ids in its not-yet-carried sentence, check 4
 *   was PASS and check 5 was **RED** — `tagged but with no §5 TABLE ROW (a prose mention is not a
 *   row)`, naming all five. That is the fourth recorded instance of check 4's prose-mention weakness
 *   (11-03, 11-04, 11-05, here) and the first time anything in the repository catches it.
 * - **D. The `After` hook made a no-op.** The `@REQ-EC-018` block's `After` registration replaced with
 *   an empty body that records nothing → **the After-ran assertion RED** (`expected [ 'step1',
 *   'step2' ] to deeply equal [ 'step1', 'step2', 'After' ]`), while **the exit-is-a-failure
 *   assertion and the error-identity assertion both stayed GREEN**. The Scenario still fails, because
 *   the step still fails; nothing about the exit can tell you the guarantee was dropped. That is why
 *   the three assertions in that block are written separately instead of being combined into one, and
 *   why `Exit.isFailure` alone would be worthless there.
 */
import { loadFeature, LoadFeatureError, ParameterTypeStore } from "@effect-cucumber/gherkin"
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem"
import { assert, describe, it } from "@effect/vitest"
import * as Cause from "effect/Cause"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Ref from "effect/Ref"
import { fileURLToPath } from "node:url"
import { collectFeature } from "../../src/describeFeature.ts"
import { StepMatchError } from "../../src/Errors.ts"
import type { FeaturePlan, PlannedStep, UnresolvedPlannedStep } from "../../src/Plan.ts"
import { buildScenarioEffect } from "../../src/ScenarioEffect.ts"

/** A starved fixture's absolute path, resolved relative to this module rather than `process.cwd()`. */
const fixture = (name: string): string => fileURLToPath(new URL(`./negative/${name}`, import.meta.url))

/**
 * What `loadFeature` needs. `ParameterTypeStore.Default` and not a file-private store: no fixture
 * here declares a custom parameter type, so there is nothing to keep private.
 */
const platform = Layer.mergeAll(NodeFileSystem.layer, ParameterTypeStore.Default)

/**
 * The one `Unresolved` planned step of a single-Scenario fixture, or a failure naming what was found
 * instead.
 *
 * `_tag` is destructured rather than read as `planned._tag`, because oxlint's `no-underscore-dangle`
 * rejects reading a leading-underscore property through member access while permitting object
 * destructuring — the workaround `describeFeature.test.ts` and `Errors.test.ts` already carry.
 *
 * It asserts the step count as well as the tag, so a fixture that quietly grew a second step cannot
 * leave this helper reading the wrong one.
 */
const soleUnresolvedStep = (plan: FeaturePlan): UnresolvedPlannedStep => {
  assert.strictEqual(plan.scenarios.length, 1)
  const steps = plan.scenarios[0]!.steps
  assert.strictEqual(steps.length, 1)
  const planned = steps[0]!
  const { _tag } = planned
  assert.strictEqual(_tag, "Unresolved")
  return planned as UnresolvedPlannedStep
}

/** Every planned step's `_tag`, for the assertion that a Feature produced no unresolved step at all. */
const tagsOf = (steps: ReadonlyArray<PlannedStep>): ReadonlyArray<string> => steps.map(({ _tag }) => _tag)

/**
 * Every original error value inside a cause, walked STRUCTURALLY via `cause.reasons` — never
 * `Cause.squash`, which does not return an original by identity out of a combined cause. Copied from
 * `../ScenarioEffect.test.ts`, which states the full reasoning at its own definition.
 */
const failedErrors = (cause: Cause.Cause<unknown>): ReadonlyArray<unknown> =>
  cause.reasons.filter(Cause.isFailReason).map((reason) => reason.error)

/** The recorder the `@REQ-EC-018` fixture's steps and its `After` hook append to. */
class Trace extends Context.Service<Trace, { readonly log: Ref.Ref<ReadonlyArray<string>> }>()("Trace") {}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// REQ-EC-003 / PARSE-03 — ./negative/background-placeholder.feature
// Expects: LoadFeatureError, reason "UninterpolatedPlaceholder", citing the fixture and a line.
// This is the one case that fails at LOAD time; the other four survive the parser.
// ──────────────────────────────────────────────────────────────────────────────────────────────
describe("REQ-EC-003 (PARSE-03): an un-interpolated Background placeholder fails the load, by name", () => {
  it.effect("fails with LoadFeatureError UninterpolatedPlaceholder, citing the fixture path and line", () =>
    Effect.gen(function*() {
      const path = fixture("background-placeholder.feature")

      // Captured as a VALUE. Never a thrown error caught by a bare assertion: `loadFeature` returns
      // an Effect whose error channel carries this, and `Effect.exit` is what keeps it in the typed
      // channel where its `reason` can be read.
      const exit = yield* Effect.exit(loadFeature(path).pipe(Effect.provide(platform)))

      assert.isTrue(Exit.isFailure(exit))
      const errors = Exit.isFailure(exit) ? failedErrors(exit.cause) : []
      assert.strictEqual(errors.length, 1)

      const error = errors[0]
      // Check one of two: the CLASS. `instanceof` on the exported class, never a `_tag` string
      // comparison, so a look-alike carrying the same tag does not satisfy it.
      assert.instanceOf(error, LoadFeatureError)
      // Check two of two: the named REASON, out of `LoadFeatureErrorReason`'s ten members. Without
      // this line a MissingFile, a ParseFailed or any of the other eight would pass the block.
      assert.strictEqual(error.reason, "UninterpolatedPlaceholder")

      // It cites the file and the line — asserted as VALUES, not as message prose. Line 4 is the
      // Background's `Given a <name>`, which is the step whose placeholder `compile()` left
      // un-substituted, and not the Scenario Outline that supplied the Examples column.
      assert.strictEqual(error.uri, path)
      assert.deepStrictEqual(error.line, Option.some(4))
      // The rendered message carries both, in this repository's standing `uri:line: reason:` prefix
      // form. This is a claim about the PREFIX being built from the two fields above, not a match on
      // the sentence after it — no assertion here depends on the wording of the explanation.
      assert.isTrue(error.message.startsWith(`${path}:4: UninterpolatedPlaceholder:`))
    }))
})

// ──────────────────────────────────────────────────────────────────────────────────────────────
// REQ-EC-007 / MATCH-03 — ./negative/unmatched-step.feature
// Expects: an Unresolved planned step carrying StepMatchError, reason "UndefinedStep".
// ──────────────────────────────────────────────────────────────────────────────────────────────
describe("REQ-EC-007 (MATCH-03): a step matching zero registered patterns is located and named", () => {
  it.effect("carries a StepMatchError UndefinedStep naming the step text and its source location", () =>
    Effect.gen(function*() {
      const path = fixture("unmatched-step.feature")
      const feature = yield* loadFeature(path).pipe(Effect.provide(platform))

      // ONE pattern registered, and it deliberately matches nothing in the fixture. Registering
      // nothing at all would work too, and would be weaker: it could not tell "the matcher found no
      // candidate" from "the registry was never populated".
      const collected = collectFeature(feature, Layer.empty, (dsl) => {
        dsl.When("the parcel is collected from the depot", function*() {})
      })

      const planned = soleUnresolvedStep(collected.plan)
      const { error } = planned

      // The two checks. Class first, then the named reason — `StepMatchErrorReason` has exactly two
      // members, and without the second line an AmbiguousStep satisfies this block. Mutation A is
      // that state, measured.
      assert.instanceOf(error, StepMatchError)
      assert.strictEqual(error.reason, "UndefinedStep")

      // It names the step text and its location, both read as values.
      assert.strictEqual(error.stepText, "the parcel is delivered to nobody")
      assert.strictEqual(error.scenarioName, "the step no pattern claims")
      assert.strictEqual(error.uri, path)
      assert.deepStrictEqual(error.line, Option.some(5))
      // Zero matches is a zero-length LIST, never an absent one — `Errors.ts`'s own note on the
      // field. And a copy-pasteable suggestion is present, which is the half that distinguishes
      // UndefinedStep from AmbiguousStep structurally rather than by its tag.
      assert.deepStrictEqual([...error.matchedPatterns], [])
      assert.isTrue(Option.isSome(error.suggestion))
    }))
})

// ──────────────────────────────────────────────────────────────────────────────────────────────
// REQ-EC-008 / MATCH-04 — ./negative/ambiguous-step.feature
// Expects: an Unresolved planned step carrying StepMatchError, reason "AmbiguousStep", naming BOTH
// patterns and both definition sites — never one silently chosen by registration order.
// ──────────────────────────────────────────────────────────────────────────────────────────────
describe("REQ-EC-008 (MATCH-04): a step matching two registered patterns names every one of them", () => {
  const literal = "the parcel is delivered"
  const parameterised = "the {word} is delivered"

  it.effect("carries a StepMatchError AmbiguousStep naming both matching patterns and both sites", () =>
    Effect.gen(function*() {
      const path = fixture("ambiguous-step.feature")
      const feature = yield* loadFeature(path).pipe(Effect.provide(platform))

      const collected = collectFeature(feature, Layer.empty, (dsl) => {
        dsl.When(literal, function*() {})
        dsl.When(parameterised, function*(_word: string) {})
      })

      const { error } = soleUnresolvedStep(collected.plan)

      assert.instanceOf(error, StepMatchError)
      assert.strictEqual(error.reason, "AmbiguousStep")

      // BOTH patterns named. This is the assertion the requirement is about: an implementation that
      // resolved the ambiguity by registration order would report one pattern, or none, and would
      // otherwise look identical from here.
      assert.deepStrictEqual([...error.matchedPatterns].toSorted(), [literal, parameterised].toSorted())

      // And both DEFINITION SITES. The sites are rendered into the message rather than carried as a
      // field, so this counts occurrences of this module's own path instead of matching prose: two
      // registrations, two sites, one per matching pattern.
      const here = fileURLToPath(import.meta.url)
      assert.strictEqual(error.message.split(here).length - 1, 2)

      // No suggestion, and that is a structural claim rather than a detail: the patterns already
      // exist, so a suggested NEW one would be actively wrong.
      assert.isTrue(Option.isNone(error.suggestion))
      assert.strictEqual(error.stepText, literal)
      assert.strictEqual(error.uri, path)
    }))

  it.effect("names both patterns whichever order they were registered in", () =>
    Effect.gen(function*() {
      const feature = yield* loadFeature(fixture("ambiguous-step.feature")).pipe(Effect.provide(platform))

      // The SAME fixture collected twice, with the two registrations transposed and nothing else
      // changed.
      const forwards = collectFeature(feature, Layer.empty, (dsl) => {
        dsl.When(literal, function*() {})
        dsl.When(parameterised, function*(_word: string) {})
      })
      const backwards = collectFeature(feature, Layer.empty, (dsl) => {
        dsl.When(parameterised, function*(_word: string) {})
        dsl.When(literal, function*() {})
      })

      const first = soleUnresolvedStep(forwards.plan).error
      const second = soleUnresolvedStep(backwards.plan).error

      // The CONTENT is what is order-independent, and the content is the claim. The SEQUENCE is
      // definition-site order per 06-CONTEXT.md D-03, and transposing two registrations transposes
      // their line numbers too, so sorting is what removes the one thing that legitimately moves.
      // See this module's divergence note: the plan asked for a stronger claim than the library
      // makes, and the honest one is asserted instead.
      assert.deepStrictEqual([...first.matchedPatterns].toSorted(), [...second.matchedPatterns].toSorted())
      assert.strictEqual(first.matchedPatterns.length, 2)
      assert.strictEqual(second.matchedPatterns.length, 2)
      assert.strictEqual(second.reason, "AmbiguousStep")
    }))
})

// ──────────────────────────────────────────────────────────────────────────────────────────────
// REQ-EC-009 / MATCH-05 — ./negative/unused-pattern.feature
// Expects: exactly one UnusedStepDefinitionWarning on the plan, and NO error. The Feature is sound;
// the dead pattern is dead code, not a broken Scenario (ADR-EC-019).
// ──────────────────────────────────────────────────────────────────────────────────────────────
describe("REQ-EC-009 (MATCH-05): a pattern matching no step is a Feature-level warning, never a failure", () => {
  it.effect("carries exactly one UnusedStepDefinitionWarning and produces no error at all", () =>
    Effect.gen(function*() {
      const path = fixture("unused-pattern.feature")
      const feature = yield* loadFeature(path).pipe(Effect.provide(platform))

      const dead = "the parcel is repainted in a colour no step mentions"
      const collected = collectFeature(feature, Layer.empty, (dsl) => {
        // The fixture's only step, matched — so the Feature itself is sound and the warning below
        // cannot be confused with a broken Scenario.
        dsl.When("the parcel is weighed", function*() {})
        // The dead one.
        dsl.When(dead, function*() {})
      })

      // EXACTLY one. Not "at least one": two patterns are registered and one of them is used, so a
      // warning per registration would also be a non-empty list.
      assert.strictEqual(collected.plan.warnings.length, 1)
      const warning = collected.plan.warnings[0]!
      // Destructured rather than read as `warning._tag`, for the reason `soleUnresolvedStep` states.
      const { _tag } = warning
      assert.strictEqual(_tag, "UnusedStepDefinitionWarning")
      assert.strictEqual(warning.reason, "UnusedStepDefinition")
      assert.strictEqual(warning.pattern, dead)
      assert.strictEqual(warning.keyword, "When")
      assert.strictEqual(warning.uri, path)
      assert.isTrue(Option.isSome(warning.definedAt))

      // And NO error — the other half of the requirement, and the half a warning-count assertion
      // cannot make. Every planned step resolved, so nothing here would fail a Scenario.
      assert.deepStrictEqual([...tagsOf(collected.plan.scenarios[0]!.steps)], ["Resolved"])
      assert.strictEqual(collected.plan.scenarios.length, 1)
    }))
})

// ──────────────────────────────────────────────────────────────────────────────────────────────
// REQ-EC-018 / RUN-02 — ./negative/after-on-failure.feature
// Expects: the Scenario's second step fails; the After hook still runs; the third step does not; and
// the step's OWN error value survives to the reported cause, unmasked.
// ──────────────────────────────────────────────────────────────────────────────────────────────
describe("REQ-EC-018 (RUN-02): After runs when a step FAILED, and does not mask the step's own error", () => {
  it.effect("runs After, stops before the third step, and reports the second step's own error value", () =>
    Effect.gen(function*() {
      const feature = yield* loadFeature(fixture("after-on-failure.feature")).pipe(Effect.provide(platform))

      // The recorder is built HERE and handed to `Layer.succeed`, so this module holds no mutable
      // binding of its own (PROH-11-03) and the `Ref` is still reached by every body through the
      // Layer-provided service rather than by closing over it as a plain value.
      const log = yield* Ref.make<ReadonlyArray<string>>([])
      const record = (label: string) =>
        Effect.gen(function*() {
          yield* Ref.update((yield* Trace).log, (held) => [...held, label])
        })

      // A distinguishable error VALUE, so the assertion below can be a reference-identity check
      // rather than a shape comparison that a re-wrapped copy would also satisfy.
      const stepBoom = { why: "the second step's own error" }

      // Annotated, and hoisted out of the call. Inlined into `collectFeature`'s second argument the
      // contextual type of `define` collapses to `FeatureDsl<unknown>` and the overload does not
      // resolve; naming the Layer's output type is what keeps the DSL's type parameter equal to it,
      // which is ADR-EC-003's whole point and not a formatting preference.
      const traceLayer: Layer.Layer<Trace> = Layer.succeed(Trace, Trace.of({ log }))

      const collected = collectFeature(feature, traceLayer, (dsl) => {
        dsl.Given("the parcel is accepted", function*() {
          yield* record("step1")
        })
        // The deliberately failing one. It records BEFORE failing, so the log proves it ran.
        dsl.When("the parcel is dropped", function*() {
          yield* record("step2")
          return yield* Effect.fail(stepBoom)
        })
        dsl.Then("the parcel is signed for", function*() {
          yield* record("step3")
        })
        dsl.After(function*() {
          yield* record("After")
        })
      })

      // A precondition, not an assertion about the requirement: all three steps must have RESOLVED,
      // or this test would be measuring MATCH-03 by accident.
      assert.deepStrictEqual([...tagsOf(collected.plan.scenarios[0]!.steps)], [
        "Resolved",
        "Resolved",
        "Resolved"
      ])
      assert.strictEqual(collected.hooks.After.length, 1)

      const exit = yield* Effect.exit(
        buildScenarioEffect({
          plan: collected.plan.scenarios[0]!,
          layer: collected.layer,
          hooks: collected.hooks
        })
      )

      // ── Assertion 1: the exit is a FAILURE. ──────────────────────────────────────────────────
      // Deliberately separate from the two below. On its own it is nearly worthless — mutation D
      // makes the After hook a no-op and this line stays green — and that is exactly why it is not
      // combined with them.
      assert.isTrue(Exit.isFailure(exit))

      // ── Assertion 2: the SECOND step's own error survives, by identity. ──────────────────────
      // `stepBoom` itself, not a value that looks like it. A finalizer that REPLACED the cause
      // instead of merging it is the masking BEH-EC-017 forbids, and only reference identity can
      // tell a preserved error from a faithfully reconstructed one.
      const errors = Exit.isFailure(exit) ? failedErrors(exit.cause) : []
      assert.strictEqual(errors.length, 1)
      assert.strictEqual(errors[0], stepBoom)

      // ── Assertion 3: After RAN, and the third step did NOT. ──────────────────────────────────
      // The whole log against the whole expected array, so this states both halves at once: the
      // After label is present after a FAILED step, and `step3` is absent because the Scenario
      // stopped. A membership check on "After" would pass against an implementation that ran the
      // third step anyway.
      assert.deepStrictEqual([...(yield* Ref.get(log))], ["step1", "step2", "After"])
    }))
})

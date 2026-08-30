/**
 * The IN-PROCESS half of `spec/process/looks-done-but-isnt-checklist.md` — thirteen of its
 * twenty-four items, each EXECUTED here rather than cited to a test somewhere else. The other eleven
 * are CLI-shaped and belong to `scripts/verify-pitfalls-checklist.sh` and
 * `scripts/verify-watch-rerun.sh` (both planned, plan 11-08).
 *
 * ## Every test here is written FRESH, and the duplication is the design
 *
 * 11-CONTEXT.md **D-03** chose the most feature-rich reading of "the checklist runs in full and
 * passes": a re-runnable SUITE rather than a citation list, **even where an equivalent assertion
 * already exists elsewhere in this repository**. A list of pointers cannot be run, and an item whose
 * cited test was later deleted or narrowed reads exactly like an item whose cited test still covers
 * it.
 *
 * So the duplication below is deliberate, and it is enumerated rather than left to be discovered by
 * somebody tidying up. Per item, the pre-existing assertion it duplicates:
 *
 * - **P-01** — `packages/gherkin/test/Validate.test.ts` (the `EmptyExamples` reason tag) and
 *   `packages/gherkin/test/Correlate.test.ts` (correlation over the sound fixtures).
 * - **P-02** — `packages/gherkin/test/Correlate.test.ts` (the identical-row-names fixture's three
 *   entries) and `packages/vitest/test/OutlineTitle.test.ts` (the emitted-title format itself).
 * - **P-03** — `packages/gherkin/test/Validate.test.ts` (the `ZeroStepScenario` reason tag).
 * - **P-04** — `packages/gherkin/test/Correlate.test.ts` (the origin field across every nesting
 *   level) and `./parsing-and-matching.steps.test.ts` (one origin, read from inside a running step).
 * - **P-05** — `packages/gherkin/test/Correlate.test.ts` (the id-collision pair, at its own L389-410).
 * - **P-06** — `packages/vitest/test/Plan.test.ts` (both reason tags against synthetic values) and
 *   `./negative-requirements.test.ts` (both against starved fixtures). **Nothing here imports that
 *   wrapper**; the fixtures, the registrations and the assertions below are this file's own.
 * - **P-07** — `packages/gherkin/test/ParameterTypeLifecycle.test.ts` (one custom type across two
 *   loads) and `./parsing-and-matching.steps.test.ts` (the same, from inside a running Scenario).
 * - **P-10** — `packages/vitest/test/ScenarioEffect.test.ts` ("builds the Layer once around the whole
 *   Scenario", and its per-execution freshness arm).
 * - **P-11** — `packages/vitest/test/Runner.test.ts` (emission shape against a recording fake) and
 *   `packages/vitest/test/emission.test.ts` (real emitted tests, counted by name).
 * - **P-12** — `packages/vitest/test/emission.test.ts`'s four-Scenario shared-clock block, and
 *   `scripts/verify-shared-layer-once.sh` for the whole-run-versus-filtered half.
 * - **P-19** — nothing, and that is the honest entry. Every other file in this repository depends on
 *   this resolution implicitly, by importing a gherkin module that imports the package; no test
 *   states it, which is exactly Pitfall 16's shape — an undeclared dependency that works until the
 *   hoisting accident carrying it stops.
 * - **P-20** — `packages/gherkin/test/StepArguments.test.ts` (the source-order rule on synthetic
 *   values) and `packages/gherkin/test/upstream-pin.test.ts` (the `argumentIndex` pins it reads).
 *
 * **Do not "de-duplicate" this suite out of existence.** Every one of those thirteen entries is a
 * reason somebody will eventually give for deleting a test here.
 *
 * ## Every test title begins with its `P-NN` id, and that is load-bearing
 *
 * `scripts/verify-pitfalls-checklist.sh` (plan 11-08) cross-checks the checklist document against
 * this file by grepping for those ids. A renamed or deleted test is then a coverage GAP with a name,
 * rather than a smaller pass count nobody is watching. **That grep must anchor on the TITLE**, not on
 * the file — mutation A below is the measurement, and a whole-file grep is satisfied by the header
 * paragraph that documents the id.
 *
 * ## Fixtures: reused by path, never copied
 *
 * Six items need a `.feature` file with a specific defect or a specific shape, and every one of them
 * already exists in `packages/gherkin/test/fixtures/` — the parser corpus. They are referenced BY
 * PATH rather than copied into this directory, for two reasons. A near-duplicate fixture drifts from
 * its original silently; and this directory's `.feature` files are the tagged acceptance artifacts
 * `spec/traceability.md` §5 enumerates and `vitest.config.ts` derives its tag universe from, so
 * adding untagged shape fixtures here would blur both. The remaining items use inline sources through
 * `parseFeature`, the shape `packages/vitest/test/emission.test.ts` established, so they add no file
 * at all.
 *
 * ## Why this file is NOT a `.steps.test.ts`, and what that costs
 *
 * The same reason `./negative-requirements.test.ts` gives: a `*.steps.test.ts` is one half of an
 * acceptance PAIR, and this file is not. Twelve of its thirteen items drive `loadFeature`,
 * `collectFeature`, `buildScenarioEffect` and `emitFeature` directly and read values back; only P-12
 * hands a Feature to `describeFeature`, and it does so because its claim is observable from nowhere
 * else.
 *
 * The cost, stated plainly rather than left to be discovered: `scripts/verify-acceptance-ref-state.sh`
 * scans `*.steps.test.ts`, and `scripts/verify-acceptance-no-any.sh` scans `*.steps.test.ts` and
 * `*.feature`. **Neither scans this file** — confirmed by reading both scripts' `find` invocations,
 * not assumed, and the same category `./negative-requirements.test.ts` already sits in. Both rules
 * are nonetheless honoured here by hand: no `let` and no `var` at any scope, no mutable binding at
 * module scope at all, and no standalone occurrence of the escape-hatch type (PROH-11-02,
 * PROH-11-03). Both were CHECKED after the fact against the two gates' own regexes, comment lines
 * stripped first exactly as those gates strip them — which matters here because this comment block
 * names the gate script, and its filename contains the forbidden token: counting raw text would make
 * the claim self-invalidating, the shape this repository has now recorded five times. Two test
 * bodies build a function-local `const` array and push emission records into it —
 * `packages/vitest/test/Runner.test.ts`'s recording-fake shape, rewritten rather than imported — and
 * that array holds emission records, never cross-step Scenario state.
 *
 * ## Thirteen items, fourteen test nodes — a deliberate divergence from 11-07-PLAN.md
 *
 * The plan's acceptance criterion says this file reports exactly THIRTEEN passing tests. It reports
 * fourteen, and the extra node is P-12's rather than a fourteenth item. P-12's claim is "**Scenario
 * 2** sees a clean `TestClock` after **Scenario 1** advances it" — a claim about the second of two
 * Scenarios in one Feature, under a shared Layer, on the emission path where `Effect.provide(testEnv)`
 * is applied per node (`describeFeature.ts`'s `sharedLayerTestApi`). Two Scenarios are two emitted
 * test nodes, and there is no arrangement of one node that states it. Both are titled `P-12 — …`, so
 * the id set is still exactly thirteen and plan 11-08's cross-check is unaffected. The count was not
 * reconciled by weakening the item.
 *
 * ## Mutation record (every one performed, run, then reverted)
 *
 * Recorded per `./README.md`'s standing rule: each entry names the mutation, what went RED, and — the
 * part that is easiest to omit — what stayed GREEN. The baseline every entry is measured against is
 * **14 passed in this file, 816 passed across 39 files**.
 *
 * - **A. A `P-NN` id deleted from a test title, the test itself untouched.** `P-04 — ` stripped from
 *   its title string, the assertions byte-identical. Result: `pnpm test` **GREEN at the SAME COUNT**
 *   — 14 in this file, 816 in the run. Nothing went red and no number shrank, because no number
 *   changed: the test still runs, it is simply no longer FINDABLE as P-04's executor. That is
 *   precisely what `scripts/verify-pitfalls-checklist.sh` (plan 11-08) exists to catch, and it is why
 *   the ids live in the TITLES rather than only in the checklist document.
 *
 *   A second measurement came out of the same run and it is a WARNING TO PLAN 11-08, not a detail.
 *   With the title mutated, a whole-file `grep -c 'P-04'` on this file still returned **2** — the
 *   per-item line in the header above, and this block's own section comment. A cross-check that
 *   greps the FILE for each id would therefore have stayed green against mutation A, satisfied by the
 *   prose that DOCUMENTS the id. `grep -c '"P-04 — '`, anchored on the title's opening quote,
 *   returned **1** before and **0** after. This repository has now hit the count-your-own-prose shape
 *   five times (STATE.md 03-04, 10-01, 10-02, and plan 11-06's check 4); 11-08 must anchor on the
 *   title, not on the file.
 * - **B. `P-11`'s equality made blunt, in two runs, against a genuinely starved emission.** One run
 *   cannot state this, for 11-06 mutation A's reason: showing the sharp assertion can fail is a
 *   different measurement from showing what the blunt one lets through.
 *
 *   **B1** — `emitAll`'s `tagFilter` swapped from `noTagFilter` to
 *   `makeTagFilter({ includeTags: ["@absent"], excludeTags: [] })`, so the registration filter removes
 *   every Scenario and the Feature emits ZERO test nodes while the parse still compiles four pickles.
 *   That is Pitfall 2's literal shape. Against it the DERIVED form went **RED**,
 *   `expected +0 to equal 4`. (P-23 went red too, at `expected 1 to equal 2`: it shares `emitAll`, and
 *   its own emission count is derived as well.)
 *
 *   **B2** — with that starved emission left in place, `P-11`'s assertion rewritten to compare a
 *   hard-coded `4` against `feature.pickles.length`, so the emitted count is never read. Result:
 *   **`P-11` GREEN**, against a Feature emitting nothing at all. The only thing still red in the file
 *   was P-23, a different item. So the hard-coded form passes in exactly the state the item exists to
 *   detect, and both sides must stay derived from one `ParsedFeature`.
 *
 *   One thing B could NOT be arranged as, and it is worth recording because it is the obvious first
 *   attempt: emptying `collected.plan.scenarios` does not produce a silent under-emission at all.
 *   `Runner.ts`'s `planFor` dies with
 *   `emitFeature: no ScenarioPlan for scenario id "…"`. A plan that has LOST a Scenario is already
 *   loud; the reachable quiet state is the one the filter produces.
 * - **C. A Background step's `origin` read from the wrong field.** `P-04`'s first assertion changed
 *   from `steps[0]!.origin` to `steps[0]!.keyword` — the cheapest simulation of a library that
 *   stopped setting the field, and one needing no source edit. Result: **`P-04` RED**,
 *   `expected 'Given' to equal 'feature-background'`, and **13 passed, 1 failed**: every other test in
 *   this file stayed GREEN. That is the measure of how much this suite separates. The thirteen items
 *   share fixtures and helpers, and a defect in the one field P-04 is about reddens exactly one of
 *   them; a suite where C reddened three would be a suite whose items overlap rather than partition.
 * - **D. The per-Scenario Layer built OUTSIDE the twice-executed Effect for `P-10`.** Arranged with no
 *   library-source change: `Layer.build(collected.layer)` run once in the test body, the Scenario
 *   built with `Layer.empty` instead, and the already-built `Context` handed to both executions via
 *   `Effect.provideContext`. Result: **`P-10` RED**, `expected 1 to equal 2` — the builder count the
 *   item asks for, reported as 1 — with **13 passed, 1 failed** and everything else GREEN.
 *
 *   The mutation is available without a source edit precisely because `buildScenarioEffect` takes the
 *   Layer as an ARGUMENT rather than closing over one, which is the property INV-EC-002 rests on. A
 *   version that composed the Layer internally could not be mutated this way, and could not be tested
 *   this way either.
 */
import {
  createParameterTypeStore,
  loadFeature,
  LoadFeatureError,
  ParameterTypeStore,
  parseFeature
} from "@effect-cucumber/gherkin"
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem"
import { assert, describe, it } from "@effect/vitest"
import * as Cause from "effect/Cause"
import * as Clock from "effect/Clock"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Ref from "effect/Ref"
import type * as Scope from "effect/Scope"
import * as TestClock from "effect/testing/TestClock"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { fileURLToPath, pathToFileURL } from "node:url"
import { collectFeature, describeFeature, type FeatureCollection } from "../../src/describeFeature.ts"
import { StepMatchError } from "../../src/Errors.ts"
import { buildScenarioTitles } from "../../src/OutlineTitle.ts"
import type { PlannedStep, ResolvedPlannedStep, UnresolvedPlannedStep } from "../../src/Plan.ts"
import { emitFeature } from "../../src/Runner.ts"
import { buildScenarioEffect } from "../../src/ScenarioEffect.ts"
import { noTagFilter } from "../../src/Tags.ts"
import type { EmitOptions, TestApi } from "../../src/TestApi.ts"

// ──────────────────────────────────────────────────────────────────────────────────────────────
// Services. Declared before every use, because a class is not hoisted as a VALUE and the shared
// Layer at the bottom of this file is built at module-evaluation time.
// ──────────────────────────────────────────────────────────────────────────────────────────────

/** The service P-10's per-Scenario Layer provides, so its builder has something to build. */
class Probe extends Context.Service<Probe, { readonly read: string }>()("PitfallsProbe") {}

/** The shared service P-12's Feature resolves, so "the tier built" is observable from a step. */
class ClockProbe extends Context.Service<ClockProbe, { readonly built: boolean }>()("PitfallsClockProbe") {}

/**
 * The shape of `@cucumber/messages`' namespace that P-19 reads back, declared rather than inferred:
 * a dynamic `import()` of a computed specifier has no static type, and naming the two members this
 * test calls is what keeps the escape-hatch type out of the assertion.
 */
interface MessagesModule {
  readonly IdGenerator: {
    readonly incrementing: () => () => string
    readonly uuid: () => () => string
  }
}

/** The subset of a `GherkinDocument` P-01's AST walk reads — structural, so it cannot drift. */
interface AstDocument {
  readonly feature?: {
    readonly children?: ReadonlyArray<{
      readonly scenario?: { readonly id: string } | undefined
      readonly rule?:
        | { readonly children?: ReadonlyArray<{ readonly scenario?: { readonly id: string } | undefined }> }
        | undefined
    }>
  } | undefined
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// Shared helpers. Every one is a pure function or a factory; this module holds no mutable binding.
// ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * A parser-corpus fixture's absolute path, resolved relative to THIS module and never
 * `process.cwd()`.
 *
 * The corpus lives one package over. Referencing it by path rather than copying the file is the
 * header's fixture rule.
 */
const corpusFixture = (name: string): string =>
  fileURLToPath(new URL(`../../../gherkin/test/fixtures/${name}`, import.meta.url))

/** What `loadFeature` needs. No fixture reached by path here declares a custom parameter type. */
const platform = Layer.mergeAll(NodeFileSystem.layer, ParameterTypeStore.Default)

/** An inline `.feature` source through the real parser, against the built-ins-only store. */
const parseInline = (source: string, uri: string) =>
  parseFeature(source, uri).pipe(Effect.provide(ParameterTypeStore.Default))

/**
 * Every original error value inside a cause, walked STRUCTURALLY via `cause.reasons` — never
 * `Cause.squash`, which does not return an original by identity out of a combined cause. The same
 * helper `./negative-requirements.test.ts` and `../ScenarioEffect.test.ts` carry, for the reason
 * stated at the latter's own definition.
 */
const failedErrors = (cause: Cause.Cause<unknown>): ReadonlyArray<unknown> =>
  cause.reasons.filter(Cause.isFailReason).map((reason) => reason.error)

/**
 * The sole `LoadFeatureError` a failed load produced, or a failure naming what was found instead.
 *
 * It asserts the failure COUNT as well as the class, so a load that failed twice cannot leave a
 * caller reading whichever one happened to come first.
 */
const soleLoadError = (exit: Exit.Exit<unknown, unknown>): LoadFeatureError => {
  assert.isTrue(Exit.isFailure(exit))
  const errors = Exit.isFailure(exit) ? failedErrors(exit.cause) : []
  assert.strictEqual(errors.length, 1)
  const error = errors[0]
  assert.instanceOf(error, LoadFeatureError)
  return error
}

/**
 * The one `Unresolved` planned step of a single-step Scenario.
 *
 * `_tag` is destructured rather than read through member access, the workaround this repository
 * already carries for oxlint's leading-underscore rule.
 */
const soleUnresolvedStep = (steps: ReadonlyArray<PlannedStep>): UnresolvedPlannedStep => {
  assert.strictEqual(steps.length, 1)
  const planned = steps[0]!
  const { _tag } = planned
  assert.strictEqual(_tag, "Unresolved")
  return planned as UnresolvedPlannedStep
}

/** The one `Resolved` planned step of a single-step Scenario — `soleUnresolvedStep`'s mirror. */
const soleResolvedStep = (steps: ReadonlyArray<PlannedStep>): ResolvedPlannedStep => {
  assert.strictEqual(steps.length, 1)
  const planned = steps[0]!
  const { _tag } = planned
  assert.strictEqual(_tag, "Resolved")
  return planned as ResolvedPlannedStep
}

/** Every planned step's `_tag`, for a claim about which steps resolved and which did not. */
const tagsOf = (steps: ReadonlyArray<PlannedStep>): ReadonlyArray<string> => steps.map(({ _tag }) => _tag)

/** One call a recording `TestApi` received. No `depth`: no assertion below is about nesting. */
interface EmissionRecord {
  readonly kind: "describe" | "effect"
  readonly name: string
  readonly self: (() => Effect.Effect<void, unknown, Scope.Scope>) | null
  readonly options: EmitOptions | null
}

/**
 * A `TestApi` that records what it was asked to emit instead of emitting it —
 * `../Runner.test.ts`'s `makeRecordingApi`, rewritten here rather than imported (D-03) and reduced
 * to the fields the two items using it actually read.
 *
 * A FACTORY, so each caller gets its own array, the tests stay order-independent, and this module's
 * scope holds no mutable binding of its own.
 */
const makeRecordingApi = (): {
  readonly api: TestApi
  readonly records: ReadonlyArray<EmissionRecord>
} => {
  const records: Array<EmissionRecord> = []
  const api: TestApi = {
    describe: (name, define) => {
      records.push({ kind: "describe", name, self: null, options: null })
      define()
    },
    effect: (name, self, options) => {
      records.push({ kind: "effect", name, self, options })
    }
  }
  return { api, records }
}

/**
 * Emit one whole collection through `api`, with every field `emitFeature` requires taken from the
 * collection itself and the filter set to the "filters nothing" sentinel.
 *
 * Every field is threaded rather than defaulted: `emitFeature`'s own doc comment makes them REQUIRED
 * so a caller cannot silently emit a Feature with its Rule tiers dropped, and a helper substituting
 * empty maps would reintroduce exactly that.
 */
const emitAll = (collected: FeatureCollection, api: TestApi): void => {
  emitFeature({
    api,
    plan: collected.plan,
    layer: collected.layer,
    hooks: collected.hooks,
    ruleHooks: collected.ruleHooks,
    ruleLayers: collected.ruleLayers,
    scenarioLayers: collected.scenarioLayers,
    tagFilter: noTagFilter
  })
}

/**
 * The AST `Scenario` node ids of a parsed document, feature-level and Rule-nested alike.
 *
 * Written as two `filter`-then-`map` passes rather than one `flatMap` with a spread, because
 * oxlint's `oxc(no-map-spread)` rejects the latter — and the rejection is right here rather than
 * merely stylistic: the spread form allocates a throwaway array per child.
 */
const astScenarioIds = (document: AstDocument): ReadonlyArray<string> => {
  const children = document.feature?.children ?? []
  const ownIds = children
    .map((child) => child.scenario)
    .filter((scenario) => scenario !== undefined)
    .map((scenario) => scenario.id)
  const ruleIds = children
    .flatMap((child) => child.rule?.children ?? [])
    .map((nested) => nested.scenario)
    .filter((scenario) => scenario !== undefined)
    .map((scenario) => scenario.id)
  return [...ownIds, ...ruleIds]
}

/** Every id the correlated model exposes for one Feature — pickle, AST Scenario, and each step. */
const allNodeIds = (feature: {
  readonly allScenarios: ReadonlyArray<
    { readonly id: string; readonly astId: string; readonly steps: ReadonlyArray<{ readonly id: string }> }
  >
}): ReadonlyArray<string> =>
  feature.allScenarios.flatMap(({ astId, id, steps }) => [id, astId, ...steps.map((step) => step.id)])

/** P-07's Feature source, one per load, differing only in the name so the two are distinguishable. */
const crateSource = (label: string): string =>
  `Feature: P-07 custom parameter type, load ${label}
  Scenario: one custom-typed step
    When a pallet is weighed
`

/** P-07's collection: the same registration made twice, against two independently parsed Features. */
const collectCrate = (feature: Parameters<typeof buildScenarioTitles>[0]): FeatureCollection =>
  collectFeature(feature, Layer.empty, (dsl) => {
    dsl.When("a {crate} is weighed", function*(_crate: unknown) {})
  })

describe("the in-process half of the \"Looks Done But Isn't\" checklist", () => {
  // ────────────────────────────────────────────────────────────────────────────────────────────
  // P-01 (Pitfall 7)
  // ────────────────────────────────────────────────────────────────────────────────────────────
  it.effect(
    "P-01 — loadFeature: every AST Scenario node has at least one correlated Pickle, verified with an empty-Examples: fixture",
    () =>
      Effect.gen(function*() {
        // The POSITIVE arm first, and it is not decoration: without it the negative arm below is a
        // statement about one broken file and says nothing about the rule it is an instance of.
        const sound = yield* parseInline(
          `Feature: P-01 every AST scenario node correlates
  Scenario: a plain scenario
    Given a plain step

  Scenario Outline: an outline for <n>
    Given a step for <n>

    Examples:
      | n |
      | 1 |
      | 2 |
`,
          "test/p-01-sound.feature"
        )

        const astIds = astScenarioIds(sound.document)
        // Non-vacuity: a walker that returned nothing would satisfy the loop below forever.
        assert.strictEqual(astIds.length, 2)
        for (const astId of astIds) {
          const correlated = sound.pickles.filter(({ astNodeIds }) => astNodeIds.includes(astId))
          assert.isAtLeast(correlated.length, 1)
        }

        // The NEGATIVE arm. `compile()` yields ZERO pickles for a header-only `Examples:`, so the
        // Outline's AST node correlates to nothing and the Scenario vanishes silently — Pitfall 7's
        // exact shape. The library refuses to hand that back as data.
        const path = corpusFixture("empty-examples-header-only.feature")
        const error = soleLoadError(yield* Effect.exit(loadFeature(path).pipe(Effect.provide(platform))))
        // Two checks, never one: the CLASS (inside `soleLoadError`), then the named reason out of
        // BEH-EC-014's ten closed tags. Without the second, a MissingFile or a ParseFailed passes.
        assert.strictEqual(error.reason, "EmptyExamples")
        assert.strictEqual(error.uri, path)
      })
  )

  // ────────────────────────────────────────────────────────────────────────────────────────────
  // P-02 (Pitfalls 9, 23)
  // ────────────────────────────────────────────────────────────────────────────────────────────
  it.effect(
    "P-02 — loadFeature: an Outline with 3 Examples rows yields exactly 3 scenario entries with distinct names",
    () =>
      Effect.gen(function*() {
        // The HARD fixture on purpose: all three rows share one un-interpolated title, so the
        // distinctness below cannot come from the Gherkin text. `outline-distinct-row-names.feature`
        // would have made this assertion true for the wrong reason.
        const feature = yield* loadFeature(corpusFixture("outline-identical-row-names.feature")).pipe(
          Effect.provide(platform)
        )

        assert.strictEqual(feature.allScenarios.length, 3)
        // One AST name across all three — the precondition that makes the rest a real claim.
        assert.strictEqual(new Set(feature.allScenarios.map(({ astName }) => astName)).size, 1)

        // The EMITTED titles, computed from the same parsed value rather than written out here.
        const titles = buildScenarioTitles(feature)
        const emitted = feature.allScenarios.map(({ id }) => titles.get(id))
        assert.strictEqual(emitted.length, 3)
        // Nothing absent: a `get` miss is `undefined`, and a set of three `undefined`s has size 1,
        // so this line is what stops the distinctness check reading a hole as a collision.
        assert.isTrue(emitted.every((title) => title !== undefined))
        assert.strictEqual(new Set(emitted).size, 3)
      })
  )

  // ────────────────────────────────────────────────────────────────────────────────────────────
  // P-03 (Pitfall 8)
  // ────────────────────────────────────────────────────────────────────────────────────────────
  it.effect("P-03 — loadFeature: a zero-step Scenario does not emit a passing test", () =>
    Effect.gen(function*() {
      const path = corpusFixture("zero-step-scenario.feature")
      const error = soleLoadError(yield* Effect.exit(loadFeature(path).pipe(Effect.provide(platform))))

      assert.strictEqual(error.reason, "ZeroStepScenario")
      assert.strictEqual(error.uri, path)

      // "Does not emit a PASSING test" is a claim about ABSENCE, asserted here at the COLLECTION
      // stage rather than by watching a run — which is the only way to state it without writing a
      // red test. The load FAILED, so no `ParsedFeature` value exists, so `collectFeature` has
      // nothing to be called with and `emitFeature` has no plan to walk. The fixture's SECOND
      // Scenario is sound and is not emitted either: one zero-step Scenario costs the whole file,
      // which is the loud half of Pitfall 8.
      assert.isTrue(Option.isSome(error.line))
      assert.isTrue(error.message.startsWith(`${path}:`))
    }))

  // ────────────────────────────────────────────────────────────────────────────────────────────
  // P-04 (Pitfall 12)
  // ────────────────────────────────────────────────────────────────────────────────────────────
  it.effect(
    "P-04 — loadFeature: each step carries origin, one of feature-background, rule-background or scenario",
    () =>
      Effect.gen(function*() {
        // The one corpus fixture carrying BOTH a Feature Background and a Rule Background, which is
        // what makes all three members of the union reachable from a single parse.
        const feature = yield* loadFeature(corpusFixture("correlation-full.feature")).pipe(Effect.provide(platform))

        assert.strictEqual(feature.allScenarios.length, 1)
        const steps = feature.allScenarios[0]!.steps

        // One assertion per DISTINCT origin, as three separate lines. Folded into the array
        // comparison alone, a defect in one arm and a compensating defect in another could still
        // produce a matching array; separately, each line names which origin was wrong.
        assert.strictEqual(steps[0]!.origin, "feature-background")
        assert.strictEqual(steps[1]!.origin, "rule-background")
        assert.strictEqual(steps[2]!.origin, "scenario")

        // And the whole sequence, which is the ORDER claim the three lines above cannot make.
        assert.deepStrictEqual(steps.map(({ origin }) => origin), [
          "feature-background",
          "rule-background",
          "scenario",
          "scenario"
        ])

        // All three members really occurred. Without this, a fixture that quietly lost its `Rule:`
        // would still satisfy an assertion written as "every origin is one of the three".
        assert.strictEqual(new Set(steps.map(({ origin }) => origin)).size, 3)
      })
  )

  // ────────────────────────────────────────────────────────────────────────────────────────────
  // P-05 (Pitfall 10)
  // ────────────────────────────────────────────────────────────────────────────────────────────
  it.effect("P-05 — loadFeature: two Features loaded in one process have no colliding node ids", () =>
    Effect.gen(function*() {
      const first = yield* loadFeature(corpusFixture("id-collision-a.feature")).pipe(Effect.provide(platform))
      const second = yield* loadFeature(corpusFixture("id-collision-b.feature")).pipe(Effect.provide(platform))

      // Every id the correlated model exposes, not only the Pickle ids: the AST Scenario id and each
      // step id are what a reporter and a `-t` filter key on, and an incrementing generator restarted
      // per parse collides on all three at once.
      const firstIds = allNodeIds(first)
      const secondIds = allNodeIds(second)
      // Non-vacuity, both sides: two empty id lists are trivially disjoint.
      assert.isAtLeast(firstIds.length, 3)
      assert.isAtLeast(secondIds.length, 3)

      const held = new Set(firstIds)
      assert.deepStrictEqual(secondIds.filter((id) => held.has(id)), [])
    }))

  // ────────────────────────────────────────────────────────────────────────────────────────────
  // P-06 (Pitfall 15)
  // ────────────────────────────────────────────────────────────────────────────────────────────
  it.effect(
    "P-06 — Step matching: an unmatched step fails, two matching patterns fail, and neither is silently resolved",
    () =>
      Effect.gen(function*() {
        // ── The UNMATCHED half. ─────────────────────────────────────────────────────────────────
        const unmatchedFeature = yield* parseInline(
          `Feature: P-06 a step no pattern claims
  Scenario: one unmatched step
    When the crate is jettisoned
`,
          "test/p-06-unmatched.feature"
        )
        // ONE pattern registered, deliberately matching nothing. Registering nothing at all would be
        // weaker: it could not tell "the matcher found no candidate" from "the registry was empty".
        const unmatched = collectFeature(unmatchedFeature, Layer.empty, (dsl) => {
          dsl.When("the crate is stowed", function*() {})
        })
        const unmatchedStep = soleUnresolvedStep(unmatched.plan.scenarios[0]!.steps)
        assert.instanceOf(unmatchedStep.error, StepMatchError)
        assert.strictEqual(unmatchedStep.error.reason, "UndefinedStep")
        assert.strictEqual(unmatchedStep.error.stepText, "the crate is jettisoned")
        assert.deepStrictEqual([...unmatchedStep.error.matchedPatterns], [])

        // "FAILS" is the item's own word, and an `Unresolved` planned step is not yet a failure — it
        // becomes one a stage later (ADR-EC-019). So run it: the Scenario Effect fails, carrying that
        // exact error by IDENTITY rather than a reconstruction of it.
        const unmatchedExit = yield* Effect.exit(
          buildScenarioEffect({
            plan: unmatched.plan.scenarios[0]!,
            layer: unmatched.layer,
            hooks: unmatched.hooks
          })
        )
        assert.isTrue(Exit.isFailure(unmatchedExit))
        assert.deepStrictEqual(
          Exit.isFailure(unmatchedExit) ? failedErrors(unmatchedExit.cause) : [],
          [unmatchedStep.error]
        )

        // ── The AMBIGUOUS half. ─────────────────────────────────────────────────────────────────
        const ambiguousFeature = yield* parseInline(
          `Feature: P-06 a step two patterns both claim
  Scenario: one ambiguous step
    When the crate is sealed
`,
          "test/p-06-ambiguous.feature"
        )
        const literal = "the crate is sealed"
        const parameterised = "the {word} is sealed"
        const ambiguous = collectFeature(ambiguousFeature, Layer.empty, (dsl) => {
          dsl.When(literal, function*() {})
          dsl.When(parameterised, function*(_word: string) {})
        })
        const ambiguousStep = soleUnresolvedStep(ambiguous.plan.scenarios[0]!.steps)
        assert.instanceOf(ambiguousStep.error, StepMatchError)
        assert.strictEqual(ambiguousStep.error.reason, "AmbiguousStep")
        // BOTH named. A resolver that picked one by registration order reports one, and would
        // satisfy every other line in this half.
        assert.deepStrictEqual(
          [...ambiguousStep.error.matchedPatterns].toSorted(),
          [literal, parameterised].toSorted()
        )

        const ambiguousExit = yield* Effect.exit(
          buildScenarioEffect({
            plan: ambiguous.plan.scenarios[0]!,
            layer: ambiguous.layer,
            hooks: ambiguous.hooks
          })
        )
        assert.isTrue(Exit.isFailure(ambiguousExit))
        assert.deepStrictEqual(
          Exit.isFailure(ambiguousExit) ? failedErrors(ambiguousExit.cause) : [],
          [ambiguousStep.error]
        )
      })
  )

  // ────────────────────────────────────────────────────────────────────────────────────────────
  // P-07 (Pitfall 14)
  // ────────────────────────────────────────────────────────────────────────────────────────────
  it.effect(
    "P-07 — Parameter types: two collection calls in one module both see the same custom type, with no duplicate-name throw",
    () =>
      Effect.gen(function*() {
        // Declared ONCE, as plain DATA, in a store private to this test — ADR-EC-023's whole point,
        // and the reason the process-wide default store is left alone: a definition appended to it
        // would be visible to every file that loads a feature afterwards, in whatever order vitest
        // happened to run them.
        const store = createParameterTypeStore()
        store.define<{ readonly kind: string }>({
          name: "crate",
          regexp: ["pallet", "carton"],
          transform: (matched: string) => ({ kind: matched }),
          definedAt: Option.some("packages/vitest/test/acceptance/pitfalls-checklist.test.ts"),
          useForSnippets: Option.none(),
          preferForRegexpMatch: Option.none()
        })
        const withStore = ParameterTypeStore.layerOf(store)

        // TWO parses in one module, against ONE store. Under a module-level singleton registry —
        // Pitfall 14's shape, reproduced three separate times in `cypress-cucumber-preprocessor` —
        // the second call either throws on the first call's registrations or silently loses them.
        const first = yield* parseFeature(crateSource("one"), "test/p-07-one.feature").pipe(Effect.provide(withStore))
        const second = yield* parseFeature(crateSource("two"), "test/p-07-two.feature").pipe(Effect.provide(withStore))

        // A FRESH registry per call (BEH-EC-015), which is what makes the two loads independent
        // rather than merely sequential.
        assert.notStrictEqual(first.parameterTypes, second.parameterTypes)

        // TWO collection calls in this one module, and both must resolve the type.
        for (const collected of [collectCrate(first), collectCrate(second)]) {
          const resolved = soleResolvedStep(collected.plan.scenarios[0]!.steps)
          // The TRANSFORM's structured output reached the argument list, not the matched text —
          // which is what separates a resolved pattern from a resolved-and-transformed one.
          assert.deepStrictEqual([...resolved.step.args], [{ kind: "pallet" }])
          // And no warning. A duplicate-name rejection at replay time fails the parse above, but a
          // registry that silently DROPPED the second registration leaves the pattern unused here.
          assert.deepStrictEqual([...collected.plan.warnings], [])
        }
      })
  )

  // ────────────────────────────────────────────────────────────────────────────────────────────
  // P-10 (Pitfall 26)
  // ────────────────────────────────────────────────────────────────────────────────────────────
  it.effect(
    "P-10 — Runner: a retried Scenario rebuilds its per-Scenario Layer, asserted as the Layer builder count",
    () =>
      Effect.gen(function*() {
        // THE REDUCED FORM, and the checklist document's P-10 Note says so in full. Scenario-level
        // retry is RETRY-01, deferred to v2 and not built, so there is no retry to observe. What IS
        // observable — and what a retry would rely on entirely — is that the per-Scenario Layer
        // builder runs afresh on every EXECUTION of one Scenario Effect. RETRY-01 is what would
        // complete this item; the reduced form is a subset of the original claim, not a substitute.
        const builds = yield* Ref.make(0)
        const probeLayer: Layer.Layer<Probe> = Layer.effect(
          Probe,
          Effect.gen(function*() {
            yield* Ref.update(builds, (n) => n + 1)
            return Probe.of({ read: "probe" })
          })
        )

        const feature = yield* parseInline(
          `Feature: P-10 per-scenario layer freshness
  Scenario: one scenario reading the probe
    When the probe is read
`,
          "test/p-10.feature"
        )
        const collected = collectFeature(feature, probeLayer, (dsl) => {
          dsl.When("the probe is read", function*() {
            yield* Probe
          })
        })
        assert.deepStrictEqual([...tagsOf(collected.plan.scenarios[0]!.steps)], ["Resolved"])

        // ONE Effect VALUE, executed TWICE. Not two Effects each built once — that would prove
        // nothing about reuse, and reuse is exactly what a retry does.
        const scenarioEffect = buildScenarioEffect({
          plan: collected.plan.scenarios[0]!,
          layer: collected.layer,
          hooks: collected.hooks
        })
        yield* scenarioEffect
        assert.strictEqual(yield* Ref.get(builds), 1)
        yield* scenarioEffect
        assert.strictEqual(yield* Ref.get(builds), 2)
      })
  )

  // ────────────────────────────────────────────────────────────────────────────────────────────
  // P-11 (Pitfall 2)
  // ────────────────────────────────────────────────────────────────────────────────────────────
  it.effect("P-11 — Runner: emitted test count equals compiled Pickle count for a fixture Feature", () =>
    Effect.gen(function*() {
      const feature = yield* parseInline(
        `Feature: P-11 emitted count equals pickle count
  Scenario: a plain scenario
    Given a plain step

  Scenario Outline: an outline row for <n>
    Given a step for <n>

    Examples:
      | n |
      | 1 |
      | 2 |
      | 3 |
`,
        "test/p-11.feature"
      )

      const collected = collectFeature(feature, Layer.empty, (dsl) => {
        dsl.Given("a plain step", function*() {})
        dsl.Given("a step for {int}", function*(_n: number) {})
      })
      // A precondition, not the claim: an unused step definition emits its own always-passing `⚠`
      // node, which would make the count below larger for a reason unrelated to Pitfall 2.
      assert.deepStrictEqual([...collected.plan.warnings], [])

      const { api, records } = makeRecordingApi()
      emitAll(collected, api)

      const emitted = records.filter(({ kind }) => kind === "effect").length
      // BOTH SIDES derived from one `ParsedFeature`. Hard-coding either is mutation B, and it stays
      // green for exactly as long as nobody edits the source above.
      assert.strictEqual(emitted, feature.pickles.length)
      // Non-vacuity: a Feature that emitted nothing and compiled nothing satisfies the line above.
      assert.isAtLeast(feature.pickles.length, 4)
    }))

  // ────────────────────────────────────────────────────────────────────────────────────────────
  // P-19 (Pitfall 16)
  // ────────────────────────────────────────────────────────────────────────────────────────────
  it.effect(
    "P-19 — Resolution: the IdGenerator import from the cucumber messages package resolves from inside packages/gherkin",
    () =>
      Effect.gen(function*() {
        // Anchored at a real module inside `packages/gherkin` that performs this exact VALUE import
        // (`loadFeature.ts`), so the resolution below is the one that module depends on rather than
        // one this test arranged for itself. Resolving from `packages/vitest` would prove nothing:
        // Pitfall 16 is an UNDECLARED dependency that resolves anyway through a hoisting accident,
        // and the accident is package-local.
        const anchor = new URL("../../../gherkin/src/loadFeature.ts", import.meta.url)
        const resolved = createRequire(anchor).resolve("@cucumber/messages")
        assert.isTrue(resolved.includes("@cucumber/messages"))

        // DECLARED, not merely reachable. This is the half a successful resolution cannot state: a
        // hoisted transitive copy resolves identically and vanishes the day the hoist changes.
        const manifestPath = fileURLToPath(new URL("../../../gherkin/package.json", import.meta.url))
        const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
          readonly dependencies?: Readonly<Record<string, string>>
        }
        assert.isTrue(manifest.dependencies?.["@cucumber/messages"] !== undefined)

        // And the SYMBOL is callable, which is the import's whole point. `incrementing()` returns a
        // generator function, and two calls to it must produce two DIFFERENT ids — the line that
        // separates an id generator from a constant.
        const messages = yield* Effect.promise(() =>
          import(/* @vite-ignore */ pathToFileURL(resolved).href) as Promise<MessagesModule>
        )
        assert.strictEqual(typeof messages.IdGenerator.incrementing, "function")
        const nextId = messages.IdGenerator.incrementing()
        assert.notStrictEqual(nextId(), nextId())
      })
  )

  // ────────────────────────────────────────────────────────────────────────────────────────────
  // P-20 (Pitfall 33)
  // ────────────────────────────────────────────────────────────────────────────────────────────
  it.effect("P-20 — Step arguments: a step with both a DocString and a DataTable delivers both, in source order", () =>
    Effect.gen(function*() {
      const argumentTagsOf = (uri: string) =>
        Effect.gen(function*() {
          const feature = yield* loadFeature(corpusFixture(uri)).pipe(Effect.provide(platform))
          const step = feature.allScenarios[0]!.steps[0]!
          // BOTH present, first — the presence half, which is the half that is easy to stop at.
          assert.strictEqual(step.stepArguments.length, 2)
          return step.stepArguments.map(({ _tag }) => _tag)
        })

      // The two fixtures are byte-mirrors of each other: the same step, the same two arguments,
      // written in the two possible source orders.
      const docStringFirst = yield* argumentTagsOf("docstring-and-datatable.feature")
      const dataTableFirst = yield* argumentTagsOf("datatable-before-docstring.feature")

      // The ORDER, asserted as a sequence and in BOTH directions. One direction alone is
      // indistinguishable from a fixed DocString-then-DataTable convention that ignores the source
      // entirely — which is close to the "one argument per step" reading Pitfall 33 records.
      assert.deepStrictEqual([...docStringFirst], ["DocString", "DataTable"])
      assert.deepStrictEqual([...dataTableFirst], ["DataTable", "DocString"])
      // And they really DIFFER — the line that makes the two above an ORDER claim rather than two
      // presence claims that happen to be written as arrays.
      assert.notDeepEqual([...docStringFirst], [...dataTableFirst])
    }))

  // ────────────────────────────────────────────────────────────────────────────────────────────
  // P-23 (Pitfall 15)
  // ────────────────────────────────────────────────────────────────────────────────────────────
  it.effect("P-23 — Skip ordering: a @skip Scenario containing an unmatched step reports skipped, not undefined", () =>
    Effect.gen(function*() {
      const feature = yield* parseInline(
        `Feature: P-23 skip is decided before matching
  @skip
  Scenario: a skipped scenario whose step no pattern claims
    When the hold is flooded
`,
        "test/p-23.feature"
      )
      const collected = collectFeature(feature, Layer.empty, (dsl) => {
        dsl.When("the hold is drained", function*() {})
      })

      // The step really IS undefined — the precondition without which this whole test is about a
      // skipped Scenario that had nothing wrong with it.
      const planned = soleUnresolvedStep(collected.plan.scenarios[0]!.steps)
      assert.strictEqual(planned.error.reason, "UndefinedStep")

      const { api, records } = makeRecordingApi()
      emitAll(collected, api)

      const emissions = records.filter(({ kind }) => kind === "effect")
      // Two nodes: the Scenario, and the always-passing `⚠` node for the pattern that matched
      // nothing. Asserted as a COUNT, so a third node cannot appear unnoticed.
      assert.strictEqual(emissions.length, 2)

      const scenarioNode = emissions[0]!
      assert.strictEqual(scenarioNode.name, "a skipped scenario whose step no pattern claims")
      // REPORTED SKIPPED. Not omitted, not quietly passed, and not failed as an undefined step.
      assert.strictEqual(scenarioNode.options?.skip, true)
      // Its tags survive the skip, so a reporter still says WHY it was skipped.
      assert.deepStrictEqual([...(scenarioNode.options?.tags ?? [])], ["@skip"])

      // The other half, and it is what makes "skipped, NOT undefined" a real distinction rather than
      // a restatement: the undefined-step failure is present and merely UNREACHED. A skipped node's
      // thunk is never invoked, so `buildScenarioEffect` is never called and the `StepMatchError`
      // never enters an error channel. Invoked by hand here, it fails — with that same error.
      const thunk = scenarioNode.self
      assert.isTrue(thunk !== null)
      const exit = yield* Effect.exit(thunk === null ? Effect.void : thunk())
      assert.isTrue(Exit.isFailure(exit))
      assert.deepStrictEqual(Exit.isFailure(exit) ? failedErrors(exit.cause) : [], [planned.error])
    }))
})

// ──────────────────────────────────────────────────────────────────────────────────────────────
// P-12 (Pitfall 1) — the one item whose claim only a REAL run can state.
//
// `describeFeature` at module scope, with a SHARED tier, because the isolation this item is about is
// applied at the emission boundary and nowhere else: `describeFeature.ts`'s `sharedLayerTestApi`
// wraps every shared-route node in `Effect.provide(testEnv)`, and `excludeTestServices: true` at the
// `layer(...)` call site is the other half. Neither is reachable from inside a test body, and
// re-creating the wrapper here would assert this file's own arrangement rather than the library's.
//
// TWO Scenarios, therefore TWO emitted nodes, and both are titled `P-12 — …`; the header's
// "thirteen items, fourteen nodes" section is the record of that. Each node carries its own
// assertions inline, so nothing is recorded across them and this block adds no module-scope state.
//
// `perScenario: Layer.empty` for `emission.test.ts`'s reason: with nothing in that tier, the shared
// tier is the only thing under test.
// ──────────────────────────────────────────────────────────────────────────────────────────────

/** The shared tier. `Layer.effect` and not `Layer.succeed`: only the effectful form has a build. */
const clockSharedLayer: Layer.Layer<ClockProbe> = Layer.effect(
  ClockProbe,
  Effect.gen(function*() {
    yield* Effect.void
    return ClockProbe.of({ built: true })
  })
)

const sharedClockFeature = Effect.runSync(
  parseFeature(
    `Feature: P-12 shared Layer clock isolation
  Scenario: P-12 — Shared Layer: Scenario 1 advances the TestClock by one hour
    When the first shared-clock step advances the clock

  Scenario: P-12 — Shared Layer: Scenario 2 sees a clean TestClock after Scenario 1 advances it
    When the second shared-clock step reads the clock
`,
    "test/pitfalls-checklist-p-12.feature"
  ).pipe(Effect.provide(ParameterTypeStore.Default))
)

describeFeature(sharedClockFeature, { shared: clockSharedLayer, perScenario: Layer.empty }, ({ When }) => {
  When("the first shared-clock step advances the clock", function*() {
    // This Scenario is not exempt from the claim — it reads 0 too. It is simply the one that goes on
    // to break the clock for everything after it.
    assert.strictEqual(yield* Clock.currentTimeMillis, 0)
    // The shared tier really resolved, so a Feature whose shared Layer silently failed to build
    // cannot pass this block by having no Layer to leak from.
    assert.strictEqual((yield* ClockProbe).built, true)

    yield* TestClock.adjust("1 hour")

    // The other half of the item's premise: the advance must actually take. A simulated clock that
    // ignored the adjustment would leave the next Scenario's assertion green for the wrong reason.
    assert.strictEqual(yield* Clock.currentTimeMillis, 3_600_000)
  })

  When("the second shared-clock step reads the clock", function*() {
    // The item, as one line. Under any implementation that lets the framework compose its test
    // services into the MEMOISED shared Layer, this reads 3600000.
    assert.strictEqual(yield* Clock.currentTimeMillis, 0)
    assert.strictEqual((yield* ClockProbe).built, true)
  })
})

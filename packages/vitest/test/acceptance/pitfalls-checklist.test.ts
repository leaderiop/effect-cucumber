/**
 * The IN-PROCESS half of `spec/process/looks-done-but-isnt-checklist.md` — thirteen of its twenty-four items, each
 * EXECUTED here rather than cited to a test somewhere else.
 *
 * Carries: ADR-EC-019, ADR-EC-023, BEH-EC-014, BEH-EC-015, INV-EC-002.
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

// ────────────────────────────────────────────────────────────────────────────────────────────── Services.

// The service P-10's per-Scenario Layer provides, so its builder has something to build.
class Probe extends Context.Service<Probe, { readonly read: string }>()("PitfallsProbe") {}

// The shared service P-12's Feature resolves, so "the tier built" is observable from a step.
class ClockProbe extends Context.Service<ClockProbe, { readonly built: boolean }>()("PitfallsClockProbe") {}

interface MessagesModule {
  readonly IdGenerator: {
    readonly incrementing: () => () => string
    readonly uuid: () => () => string
  }
}

// The subset of a `GherkinDocument` P-01's AST walk reads — structural, so it cannot drift.
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

// ────────────────────────────────────────────────────────────────────────────────────────────── Shared helpers.

// A parser-corpus fixture's absolute path, resolved relative to THIS module and never `process.cwd()`.
const corpusFixture = (name: string): string =>
  fileURLToPath(new URL(`../../../gherkin/test/fixtures/${name}`, import.meta.url))

// What `loadFeature` needs.
const platform = Layer.mergeAll(NodeFileSystem.layer, ParameterTypeStore.Default)

// An inline `.feature` source through the real parser, against the built-ins-only store.
const parseInline = (source: string, uri: string) =>
  parseFeature(source, uri).pipe(Effect.provide(ParameterTypeStore.Default))

// Every original error value inside a cause, walked STRUCTURALLY via `cause.reasons` — never `Cause.squash`, which
// does not return an original by identity out of a combined cause.
const failedErrors = (cause: Cause.Cause<unknown>): ReadonlyArray<unknown> =>
  cause.reasons.filter(Cause.isFailReason).map((reason) => reason.error)

// The sole `LoadFeatureError` a failed load produced, or a failure naming what was found instead.
const soleLoadError = (exit: Exit.Exit<unknown, unknown>): LoadFeatureError => {
  assert.isTrue(Exit.isFailure(exit))
  const errors = Exit.isFailure(exit) ? failedErrors(exit.cause) : []
  assert.strictEqual(errors.length, 1)
  const error = errors[0]
  assert.instanceOf(error, LoadFeatureError)
  return error
}

// The one `Unresolved` planned step of a single-step Scenario.
const soleUnresolvedStep = (steps: ReadonlyArray<PlannedStep>): UnresolvedPlannedStep => {
  assert.strictEqual(steps.length, 1)
  const planned = steps[0]!
  const { _tag } = planned
  assert.strictEqual(_tag, "Unresolved")
  return planned as UnresolvedPlannedStep
}

// The one `Resolved` planned step of a single-step Scenario — `soleUnresolvedStep`'s mirror.
const soleResolvedStep = (steps: ReadonlyArray<PlannedStep>): ResolvedPlannedStep => {
  assert.strictEqual(steps.length, 1)
  const planned = steps[0]!
  const { _tag } = planned
  assert.strictEqual(_tag, "Resolved")
  return planned as ResolvedPlannedStep
}

// Every planned step's `_tag`, for a claim about which steps resolved and which did not.
const tagsOf = (steps: ReadonlyArray<PlannedStep>): ReadonlyArray<string> => steps.map(({ _tag }) => _tag)

// One call a recording `TestApi` received.
interface EmissionRecord {
  readonly kind: "describe" | "effect" | "beforeAll" | "afterAll"
  readonly name: string
  readonly self: (() => Effect.Effect<void, unknown, Scope.Scope>) | null
  readonly options: EmitOptions | null
}

const makeRecordingApi = (): {
  readonly api: TestApi
  readonly records: ReadonlyArray<EmissionRecord>
} => {
  const records: Array<EmissionRecord> = []
  const api: TestApi = {
    describe: (name, define) => {
      records.push({ kind: "describe", name, self: null, options: null }) // GATE-ALLOW-MUTATION: function-local array, created fresh per makeRecordingApi() call and never shared across steps or Scenarios — the opposite of the module-scope holder INV-EC-006 forbids.
      define()
    },
    effect: (name, self, options) => {
      records.push({ kind: "effect", name, self, options }) // GATE-ALLOW-MUTATION: same function-local array as above; a TestApi callback is synchronous and cannot yield a Ref update.
    },
    // No fixture in this suite registers BeforeAllScenarios, so this recorder is never exercised —
    // present only so this fake keeps satisfying the real `TestApi` interface (ADR-EC-040).
    beforeAll: (name, self) => {
      records.push({ kind: "beforeAll", name, self, options: null }) // GATE-ALLOW-MUTATION: same function-local array as above.
    },
    afterAll: (name, self) => {
      records.push({ kind: "afterAll", name, self, options: null }) // GATE-ALLOW-MUTATION: same function-local array as above.
    }
  }
  return { api, records }
}

// Emit one whole collection through `api`, with every field `emitFeature` requires taken from the collection itself
// and the filter set to the "filters nothing" sentinel.
const emitAll = (collected: FeatureCollection, api: TestApi): void => {
  emitFeature({
    api,
    plan: collected.plan,
    layer: collected.layer,
    hooks: collected.hooks,
    ruleHooks: collected.ruleHooks,
    ruleLayers: collected.ruleLayers,
    scenarioLayers: collected.scenarioLayers,
    tagFilter: noTagFilter,
    rerunFilter: null,
    rerunKeys: new Map<string, string>()
  })
}

// The AST `Scenario` node ids of a parsed document, feature-level and Rule-nested alike.
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

// Every id the correlated model exposes for one Feature — pickle, AST Scenario, and each step.
const allNodeIds = (feature: {
  readonly allScenarios: ReadonlyArray<
    { readonly id: string; readonly astId: string; readonly steps: ReadonlyArray<{ readonly id: string }> }
  >
}): ReadonlyArray<string> =>
  feature.allScenarios.flatMap(({ astId, id, steps }) => [id, astId, ...steps.map((step) => step.id)])

// P-07's Feature source, one per load, differing only in the name so the two are distinguishable.
const crateSource = (label: string): string =>
  `Feature: P-07 custom parameter type, load ${label}
  Scenario: one custom-typed step
    When a pallet is weighed
`

// P-07's collection: the same registration made twice, against two independently parsed Features.
const collectCrate = (feature: Parameters<typeof buildScenarioTitles>[0]): FeatureCollection =>
  collectFeature(feature, Layer.empty, (dsl) => {
    dsl.When("a {crate} is weighed", function*(_crate: unknown) {})
  })

describe("the in-process half of the \"Looks Done But Isn't\" checklist", () => {
  it.effect(
    "P-01 — loadFeature: every AST Scenario node has at least one correlated Pickle, verified with an empty-Examples: fixture",
    () =>
      Effect.gen(function*() {
        // The POSITIVE arm first, and it is not decoration: without it the negative arm below is a statement about
        // one broken file and says nothing about the rule it is an instance of.
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

        // The NEGATIVE arm.
        const path = corpusFixture("empty-examples-header-only.feature")
        const error = soleLoadError(yield* Effect.exit(loadFeature(path).pipe(Effect.provide(platform))))
        // Two checks, never one: the CLASS (inside `soleLoadError`), then the named reason out of BEH-EC-014's ten
        // closed tags.
        assert.strictEqual(error.reason, "EmptyExamples")
        assert.strictEqual(error.uri, path)
      })
  )

  // ──────────────────────────────────────────────────────────────────────────────────────────── P-02 (Pitfalls 9,
  // 23) ────────────────────────────────────────────────────────────────────────────────────────────
  it.effect(
    "P-02 — loadFeature: an Outline with 3 Examples rows yields exactly 3 scenario entries with distinct names",
    () =>
      Effect.gen(function*() {
        // The HARD fixture on purpose: all three rows share one un-interpolated title, so the distinctness below
        // cannot come from the Gherkin text.
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
        // Nothing absent: a `get` miss is `undefined`, and a set of three `undefined`s has size 1, so this line is
        // what stops the distinctness check reading a hole as a collision.
        assert.isTrue(emitted.every((title) => title !== undefined))
        assert.strictEqual(new Set(emitted).size, 3)
      })
  )

  it.effect("P-03 — loadFeature: a zero-step Scenario does not emit a passing test", () =>
    Effect.gen(function*() {
      const path = corpusFixture("zero-step-scenario.feature")
      const error = soleLoadError(yield* Effect.exit(loadFeature(path).pipe(Effect.provide(platform))))

      assert.strictEqual(error.reason, "ZeroStepScenario")
      assert.strictEqual(error.uri, path)

      // "Does not emit a PASSING test" is a claim about ABSENCE, asserted here at the COLLECTION stage rather than by
      // watching a run — which is the only way to state it without writing a red test.
      assert.isTrue(Option.isSome(error.line))
      assert.isTrue(error.message.startsWith(`${path}:`))
    }))

  it.effect(
    "P-04 — loadFeature: each step carries origin, one of feature-background, rule-background or scenario",
    () =>
      Effect.gen(function*() {
        // The one corpus fixture carrying BOTH a Feature Background and a Rule Background, which is what makes all
        // three members of the union reachable from a single parse.
        const feature = yield* loadFeature(corpusFixture("correlation-full.feature")).pipe(Effect.provide(platform))

        assert.strictEqual(feature.allScenarios.length, 1)
        const steps = feature.allScenarios[0]!.steps

        // One assertion per DISTINCT origin, as three separate lines.
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

        // All three members really occurred.
        assert.strictEqual(new Set(steps.map(({ origin }) => origin)).size, 3)
      })
  )

  it.effect("P-05 — loadFeature: two Features loaded in one process have no colliding node ids", () =>
    Effect.gen(function*() {
      const first = yield* loadFeature(corpusFixture("id-collision-a.feature")).pipe(Effect.provide(platform))
      const second = yield* loadFeature(corpusFixture("id-collision-b.feature")).pipe(Effect.provide(platform))

      const firstIds = allNodeIds(first)
      const secondIds = allNodeIds(second)
      // Non-vacuity, both sides: two empty id lists are trivially disjoint.
      assert.isAtLeast(firstIds.length, 3)
      assert.isAtLeast(secondIds.length, 3)

      const held = new Set(firstIds)
      assert.deepStrictEqual(secondIds.filter((id) => held.has(id)), [])
    }))

  it.effect(
    "P-06 — Step matching: an unmatched step fails, two matching patterns fail, and neither is silently resolved",
    () =>
      Effect.gen(function*() {
        // ── The UNMATCHED half.
        const unmatchedFeature = yield* parseInline(
          `Feature: P-06 a step no pattern claims
  Scenario: one unmatched step
    When the crate is jettisoned
`,
          "test/p-06-unmatched.feature"
        )
        // ONE pattern registered, deliberately matching nothing.
        const unmatched = collectFeature(unmatchedFeature, Layer.empty, (dsl) => {
          dsl.When("the crate is stowed", function*() {})
        })
        const unmatchedStep = soleUnresolvedStep(unmatched.plan.scenarios[0]!.steps)
        assert.instanceOf(unmatchedStep.error, StepMatchError)
        assert.strictEqual(unmatchedStep.error.reason, "UndefinedStep")
        assert.strictEqual(unmatchedStep.error.stepText, "the crate is jettisoned")
        assert.deepStrictEqual([...unmatchedStep.error.matchedPatterns], [])

        // "FAILS" is the item's own word, and an `Unresolved` planned step is not yet a failure — it becomes one a
        // stage later (ADR-EC-019).
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

        // ── The AMBIGUOUS half.
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
        // BOTH named.
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

  it.effect(
    "P-07 — Parameter types: two collection calls in one module both see the same custom type, with no duplicate-name throw",
    () =>
      Effect.gen(function*() {
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

        // TWO parses in one module, against ONE store.
        const first = yield* parseFeature(crateSource("one"), "test/p-07-one.feature").pipe(Effect.provide(withStore))
        const second = yield* parseFeature(crateSource("two"), "test/p-07-two.feature").pipe(Effect.provide(withStore))

        // A FRESH registry per call (BEH-EC-015), which is what makes the two loads independent rather than merely
        // sequential.
        assert.notStrictEqual(first.parameterTypes, second.parameterTypes)

        // TWO collection calls in this one module, and both must resolve the type.
        for (const collected of [collectCrate(first), collectCrate(second)]) {
          const resolved = soleResolvedStep(collected.plan.scenarios[0]!.steps)
          // The TRANSFORM's structured output reached the argument list, not the matched text — which is what
          // separates a resolved pattern from a resolved-and-transformed one.
          assert.deepStrictEqual([...resolved.step.args], [{ kind: "pallet" }])
          // And no warning.
          assert.deepStrictEqual([...collected.plan.warnings], [])
        }
      })
  )

  it.effect(
    "P-10 — Runner: a retried Scenario rebuilds its per-Scenario Layer, asserted as the Layer builder count",
    () =>
      Effect.gen(function*() {
        // THE REDUCED FORM, and the checklist document's P-10 Note says so in full.
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

        // ONE Effect VALUE, executed TWICE.
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
      assert.deepStrictEqual([...collected.plan.warnings], [])

      const { api, records } = makeRecordingApi()
      emitAll(collected, api)

      const emitted = records.filter(({ kind }) => kind === "effect").length
      // BOTH SIDES derived from one `ParsedFeature`.
      assert.strictEqual(emitted, feature.pickles.length)
      // Non-vacuity: a Feature that emitted nothing and compiled nothing satisfies the line above.
      assert.isAtLeast(feature.pickles.length, 4)
    }))

  it.effect(
    "P-19 — Resolution: the IdGenerator import from the cucumber messages package resolves from inside packages/gherkin",
    () =>
      Effect.gen(function*() {
        const anchor = new URL("../../../gherkin/src/loadFeature.ts", import.meta.url)
        const resolved = createRequire(anchor).resolve("@cucumber/messages")
        assert.isTrue(resolved.includes("@cucumber/messages"))

        // DECLARED, not merely reachable.
        const manifestPath = fileURLToPath(new URL("../../../gherkin/package.json", import.meta.url))
        const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
          readonly dependencies?: Readonly<Record<string, string>>
        }
        assert.isTrue(manifest.dependencies?.["@cucumber/messages"] !== undefined)

        // And the SYMBOL is callable, which is the import's whole point.
        const messages = yield* Effect.promise(() =>
          import(/* @vite-ignore */ pathToFileURL(resolved).href) as Promise<MessagesModule>
        )
        assert.strictEqual(typeof messages.IdGenerator.incrementing, "function")
        const nextId = messages.IdGenerator.incrementing()
        assert.notStrictEqual(nextId(), nextId())
      })
  )

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

      // The two fixtures are byte-mirrors of each other: the same step, the same two arguments, written in the two
      // possible source orders.
      const docStringFirst = yield* argumentTagsOf("docstring-and-datatable.feature")
      const dataTableFirst = yield* argumentTagsOf("datatable-before-docstring.feature")

      // The ORDER, asserted as a sequence and in BOTH directions.
      assert.deepStrictEqual([...docStringFirst], ["DocString", "DataTable"])
      assert.deepStrictEqual([...dataTableFirst], ["DataTable", "DocString"])
      // And they really DIFFER — the line that makes the two above an ORDER claim rather than two presence claims
      // that happen to be written as arrays.
      assert.notDeepEqual([...docStringFirst], [...dataTableFirst])
    }))

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

      // The step really IS undefined — the precondition without which this whole test is about a skipped Scenario
      // that had nothing wrong with it.
      const planned = soleUnresolvedStep(collected.plan.scenarios[0]!.steps)
      assert.strictEqual(planned.error.reason, "UndefinedStep")

      const { api, records } = makeRecordingApi()
      emitAll(collected, api)

      const emissions = records.filter(({ kind }) => kind === "effect")
      // Two nodes: the Scenario, and the always-passing `⚠` node for the pattern that matched nothing.
      assert.strictEqual(emissions.length, 2)

      const scenarioNode = emissions[0]!
      assert.strictEqual(scenarioNode.name, "a skipped scenario whose step no pattern claims")
      // REPORTED SKIPPED.
      assert.strictEqual(scenarioNode.options?.skip, true)
      // Its tags survive the skip, so a reporter still says WHY it was skipped.
      assert.deepStrictEqual([...(scenarioNode.options?.tags ?? [])], ["@skip"])

      // The other half, and it is what makes "skipped, NOT undefined" a real distinction rather than a restatement:
      // the undefined-step failure is present and merely UNREACHED.
      const thunk = scenarioNode.self
      assert.isTrue(thunk !== null)
      const exit = yield* Effect.exit(thunk === null ? Effect.void : thunk())
      assert.isTrue(Exit.isFailure(exit))
      assert.deepStrictEqual(Exit.isFailure(exit) ? failedErrors(exit.cause) : [], [planned.error])
    }))
})

// The shared tier.
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
    // This Scenario is not exempt from the claim — it reads 0 too.
    assert.strictEqual(yield* Clock.currentTimeMillis, 0)
    // The shared tier really resolved, so a Feature whose shared Layer silently failed to build cannot pass this
    // block by having no Layer to leak from.
    assert.strictEqual((yield* ClockProbe).built, true)

    yield* TestClock.adjust("1 hour")

    // The other half of the item's premise: the advance must actually take.
    assert.strictEqual(yield* Clock.currentTimeMillis, 3_600_000)
  })

  When("the second shared-clock step reads the clock", function*() {
    // The item, as one line.
    assert.strictEqual(yield* Clock.currentTimeMillis, 0)
    assert.strictEqual((yield* ClockProbe).built, true)
  })
})

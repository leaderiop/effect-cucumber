/**
 * The wrapper that drives every starved fixture under `./negative/` and asserts the specific named error or guarantee
 * each one produces.
 *
 * Carries: ADR-EC-003, ADR-EC-019, BEH-EC-017, REQ-EC-003, REQ-EC-007, REQ-EC-008, REQ-EC-009, REQ-EC-011, REQ-EC-018.
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

// A starved fixture's absolute path, resolved relative to this module rather than `process.cwd()`.
const fixture = (name: string): string => fileURLToPath(new URL(`./negative/${name}`, import.meta.url))

// What `loadFeature` needs.
const platform = Layer.mergeAll(NodeFileSystem.layer, ParameterTypeStore.Default)

// The one `Unresolved` planned step of a single-Scenario fixture, or a failure naming what was found instead.
const soleUnresolvedStep = (plan: FeaturePlan): UnresolvedPlannedStep => {
  assert.strictEqual(plan.scenarios.length, 1)
  const steps = plan.scenarios[0]!.steps
  assert.strictEqual(steps.length, 1)
  const planned = steps[0]!
  const { _tag } = planned
  assert.strictEqual(_tag, "Unresolved")
  return planned as UnresolvedPlannedStep
}

// Every planned step's `_tag`, for the assertion that a Feature produced no unresolved step at all.
const tagsOf = (steps: ReadonlyArray<PlannedStep>): ReadonlyArray<string> => steps.map(({ _tag }) => _tag)

// Every original error value inside a cause, walked STRUCTURALLY via `cause.reasons` — never `Cause.squash`, which
// does not return an original by identity out of a combined cause.
const failedErrors = (cause: Cause.Cause<unknown>): ReadonlyArray<unknown> =>
  cause.reasons.filter(Cause.isFailReason).map((reason) => reason.error)

// The recorder the `@REQ-EC-018` fixture's steps and its `After` hook append to.
class Trace extends Context.Service<Trace, { readonly log: Ref.Ref<ReadonlyArray<string>> }>()("Trace") {}

describe("REQ-EC-003: an un-interpolated Background placeholder fails the load, by name", () => {
  it.effect("fails with LoadFeatureError UninterpolatedPlaceholder, citing the fixture path and line", () =>
    Effect.gen(function*() {
      const path = fixture("background-placeholder.feature")

      // Captured as a VALUE.
      const exit = yield* Effect.exit(loadFeature(path).pipe(Effect.provide(platform)))

      assert.isTrue(Exit.isFailure(exit))
      const errors = Exit.isFailure(exit) ? failedErrors(exit.cause) : []
      assert.strictEqual(errors.length, 1)

      const error = errors[0]
      // Check one of two: the CLASS.
      assert.instanceOf(error, LoadFeatureError)
      // Check two of two: the named REASON, out of `LoadFeatureErrorReason`'s ten members.
      assert.strictEqual(error.reason, "UninterpolatedPlaceholder")

      // It cites the file and the line — asserted as VALUES, not as message prose.
      assert.strictEqual(error.uri, path)
      assert.deepStrictEqual(error.line, Option.some(4))
      // The rendered message carries both, in this repository's standing `uri:line: reason:` prefix form.
      assert.isTrue(error.message.startsWith(`${path}:4: UninterpolatedPlaceholder:`))
    }))
})

describe("REQ-EC-007: a step matching zero registered patterns is located and named", () => {
  it.effect("carries a StepMatchError UndefinedStep naming the step text and its source location", () =>
    Effect.gen(function*() {
      const path = fixture("unmatched-step.feature")
      const feature = yield* loadFeature(path).pipe(Effect.provide(platform))

      // ONE pattern registered, and it deliberately matches nothing in the fixture.
      const collected = collectFeature(feature, Layer.empty, (dsl) => {
        dsl.When("the parcel is collected from the depot", function*() {})
      })

      const planned = soleUnresolvedStep(collected.plan)
      const { error } = planned

      // The two checks.
      assert.instanceOf(error, StepMatchError)
      assert.strictEqual(error.reason, "UndefinedStep")

      // It names the step text and its location, both read as values.
      assert.strictEqual(error.stepText, "the parcel is delivered to nobody")
      assert.strictEqual(error.scenarioName, "the step no pattern claims")
      assert.strictEqual(error.uri, path)
      assert.deepStrictEqual(error.line, Option.some(5))
      // Zero matches is a zero-length LIST, never an absent one — `Errors.ts`'s own note on the field.
      assert.deepStrictEqual([...error.matchedPatterns], [])
      assert.isTrue(Option.isSome(error.suggestion))
    }))
})

describe("REQ-EC-008: a step matching two registered patterns names every one of them", () => {
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

      // BOTH patterns named.
      assert.deepStrictEqual([...error.matchedPatterns].toSorted(), [literal, parameterised].toSorted())

      // And both DEFINITION SITES.
      const here = fileURLToPath(import.meta.url)
      assert.strictEqual(error.message.split(here).length - 1, 2)

      // No suggestion, and that is a structural claim rather than a detail: the patterns already exist, so a
      // suggested NEW one would be actively wrong.
      assert.isTrue(Option.isNone(error.suggestion))
      assert.strictEqual(error.stepText, literal)
      assert.strictEqual(error.uri, path)
    }))

  it.effect("names both patterns whichever order they were registered in", () =>
    Effect.gen(function*() {
      const feature = yield* loadFeature(fixture("ambiguous-step.feature")).pipe(Effect.provide(platform))

      // The SAME fixture collected twice, with the two registrations transposed and nothing else changed.
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

      // The CONTENT is what is order-independent, and the content is the claim.
      assert.deepStrictEqual([...first.matchedPatterns].toSorted(), [...second.matchedPatterns].toSorted())
      assert.strictEqual(first.matchedPatterns.length, 2)
      assert.strictEqual(second.matchedPatterns.length, 2)
      assert.strictEqual(second.reason, "AmbiguousStep")
    }))
})

describe("REQ-EC-009: a pattern matching no step is a Feature-level warning, never a failure", () => {
  it.effect("carries exactly one UnusedStepDefinitionWarning and produces no error at all", () =>
    Effect.gen(function*() {
      const path = fixture("unused-pattern.feature")
      const feature = yield* loadFeature(path).pipe(Effect.provide(platform))

      const dead = "the parcel is repainted in a colour no step mentions"
      const collected = collectFeature(feature, Layer.empty, (dsl) => {
        // The fixture's only step, matched — so the Feature itself is sound and the warning below cannot be confused
        // with a broken Scenario.
        dsl.When("the parcel is weighed", function*() {})
        // The dead one.
        dsl.When(dead, function*() {})
      })

      // EXACTLY one.
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

      // And NO error — the other half of the requirement, and the half a warning-count assertion cannot make.
      assert.deepStrictEqual([...tagsOf(collected.plan.scenarios[0]!.steps)], ["Resolved"])
      assert.strictEqual(collected.plan.scenarios.length, 1)
    }))
})

describe("REQ-EC-018: After runs when a step FAILED, and does not mask the step's own error", () => {
  it.effect("runs After, stops before the third step, and reports the second step's own error value", () =>
    Effect.gen(function*() {
      const feature = yield* loadFeature(fixture("after-on-failure.feature")).pipe(Effect.provide(platform))

      const log = yield* Ref.make<ReadonlyArray<string>>([])
      const record = (label: string) =>
        Effect.gen(function*() {
          yield* Ref.update((yield* Trace).log, (held) => [...held, label])
        })

      // A distinguishable error VALUE, so the assertion below can be a reference-identity check rather than a shape
      // comparison that a re-wrapped copy would also satisfy.
      const stepBoom = { why: "the second step's own error" }

      // Annotated, and hoisted out of the call.
      const traceLayer: Layer.Layer<Trace> = Layer.succeed(Trace, Trace.of({ log }))

      const collected = collectFeature(feature, traceLayer, (dsl) => {
        dsl.Given("the parcel is accepted", function*() {
          yield* record("step1")
        })
        // The deliberately failing one.
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

      // ── Assertion 1: the exit is a FAILURE.
      assert.isTrue(Exit.isFailure(exit))

      // ── Assertion 2: the SECOND step's own error survives, by identity.
      const errors = Exit.isFailure(exit) ? failedErrors(exit.cause) : []
      assert.strictEqual(errors.length, 1)
      assert.strictEqual(errors[0], stepBoom)

      // ── Assertion 3: After RAN, and the third step did NOT.
      assert.deepStrictEqual([...(yield* Ref.get(log))], ["step1", "step2", "After"])
    }))
})

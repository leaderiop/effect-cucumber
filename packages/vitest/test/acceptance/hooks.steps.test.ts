/**
 * The fifth acceptance pair, and the only one whose subject is the RUNNER's own bracketing rather than something a
 * step computes: all six hook kinds registered from a real Feature's `define` callback, and their full ordering
 * across a two-Scenario Feature asserted from inside a running step.
 *
 * Carries: ADR-EC-005, ADR-EC-024, BEH-EC-017, INV-EC-002, INV-EC-003, INV-EC-006, REQ-EC-016.
 */
import { assert } from "@effect/vitest"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Ref from "effect/Ref"
import { fileURLToPath } from "node:url"
import { describeFeature } from "../../src/describeFeature.ts"
import { loadFeature } from "../../src/loadFeature.ts"

// The `.feature` file beside this one, resolved relative to this module rather than `process.cwd()`.
const featurePath = fileURLToPath(new URL("./hooks.feature", import.meta.url))

// Real bytes off disk, through the real parser, at module top level.
const feature = await loadFeature(featurePath)

// The one ordered log every hook body and every step body in this Feature appends to.
class HookLog extends Context.Service<HookLog, { readonly entries: Ref.Ref<ReadonlyArray<string>> }>()("HookLog") {
  static readonly layer = Layer.effect(
    this,
    Effect.gen(function*() {
      return HookLog.of({ entries: yield* Ref.make<ReadonlyArray<string>>([]) })
    })
  )
}

// Append one label to the log.
const record = (label: string) =>
  Effect.gen(function*() {
    const { entries } = yield* HookLog
    yield* Ref.update(entries, (held) => [...held, label])
  })

// THE CALL UNDER TEST.
describeFeature(feature, { shared: HookLog.layer, perScenario: Layer.empty }, (dsl) => {
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

  // Registered and real, and this pair asserts NOTHING about it — it runs as the block's teardown after every
  // Scenario, so no step body can be running when it fires.
  dsl.AfterAllScenarios(function*() {
    yield* record("AfterAllScenarios")
  })

  // ── The two step definitions ────────────────────────────────────────────────────────────────── Both registered at
  // FEATURE level, so one registration serves both Scenarios.

  // The label comes from the Gherkin file, not from this body, so the two Scenarios are told apart in the log by data
  // the `.feature` supplied.
  dsl.When("the scenario records {string}", function*(label: string) {
    yield* record(`step:${label}`)
  })

  dsl.Then(
    "the hook log reads {string} with {string} logged {int} time",
    function*(expected: string, kind: string, times: number) {
      const held = yield* Ref.get((yield* HookLog).entries)

      // THE ordering assertion: the WHOLE log against the WHOLE expected array, compared with `deepStrictEqual`.
      assert.deepStrictEqual([...held], expected.split(","))

      // The once-per-Feature claim, separately, because the array above cannot make it: with one Scenario run, "once
      // per Feature" and "once per Scenario" produce the identical log.
      assert.strictEqual(held.filter((entry) => entry === kind).length, times)

      yield* record("step:read")
    }
  )
})

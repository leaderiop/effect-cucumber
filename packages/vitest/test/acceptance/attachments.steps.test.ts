/**
 * Acceptance pair for ADR-EC-036 / BEH-EC-028: `attachments.feature` run through the real
 * `describeFeature`, proving from INSIDE running steps and hooks that `attach` (a step or a
 * per-Scenario hook's `World.attach()` equivalent) reaches the SAME `Attachments` implementation from
 * every per-Scenario body kind — `Before`, `BeforeStep`, a step itself, `AfterStep`, `After` — in the
 * real order `Hook.ts`/`ScenarioEffect.ts` invoke them, mirroring `hooks.steps.test.ts`'s own
 * two-Scenario "the second scenario's setup observes the first scenario's teardown" technique
 * (BEH-EC-017) to make `After`'s own contribution observable at all — `After` runs through
 * `Effect.onExit` AFTER the whole Scenario, its own `Then` step included, so no step in the SAME
 * Scenario can read what its own `After` attached.
 *
 * Carries: ADR-EC-002, ADR-EC-009, ADR-EC-036, BEH-EC-017, BEH-EC-028, REQ-EC-028.
 *
 * This pair cannot reach a real `vitest.TestContext` (`VitestTestApi.ts`'s live `Attachments`, built
 * from `ctx.annotate`, only exists once the real test framework's `it.effect` callback is running —
 * exactly the boundary an in-process acceptance pair sits on the near side of). Two other, independent
 * proofs cover what this pair cannot:
 *
 * 1. `scripts/verify-attachments-panel.sh` (`packages/vitest/test/attachments-fixture/`) proves the
 *    LIVE wiring end to end against a REAL `vitest run`'s actual printed failure panel — the same
 *    "real stdout, not simulated" shape `scripts/verify-failure-panel.sh` already established for
 *    ADR-EC-033.
 * 2. `packages/vitest/test/Attachments.types.ts` proves, at compile time, that `attach` is reachable
 *    from every per-Scenario body kind and REJECTED from `BeforeAllScenarios`/`AfterAllScenarios`.
 *
 * What THIS pair proves instead, real and in-process: `attach`'s own resolution mechanism — an
 * ordinary `Effect.flatMap(Attachments, ...)` accessor — genuinely reaches whatever `Attachments`
 * implementation is nearest in scope, from a step body and from all four per-Scenario hook kinds. It
 * does this with a TEST DOUBLE for `Attachments`, provided through `describeFeature`'s own
 * `perScenario` tier — a real, useful consequence of how `Effect.provide` composes that ADR-EC-036
 * records: `VitestTestApi.ts`'s live implementation is provided AROUND the ALREADY-composed Scenario
 * Effect (`ScenarioEffect.ts`'s own `Effect.provide(effectiveLayer)` for the `perScenario` tier is
 * innermost by construction, both on the plain path and — because the shared tier's own provide sits
 * OUTSIDE `attachmentsLive`, not inside it, on the `{ shared, perScenario }` path this pair uses too),
 * and Effect's context resolution favors the INNERMOST provide of a given service — confirmed by
 * direct experiment, not assumed. A `perScenario` Layer that itself provides `Attachments` is
 * therefore what a step or hook resolves on EITHER `describeFeature` form, shadowing the live one for
 * this test run exactly the way any other test double would; a `shared`-tier double was tried first
 * and does NOT win on the `{ shared, perScenario }` path (`@effect/vitest`'s own `layer(...)` provides
 * the shared tier OUTSIDE `attachmentsLive`, not inside it) — recorded here because it is exactly the
 * kind of thing worth being wrong about once, on purpose, rather than asserting from the architecture
 * description alone.
 *
 * The LOG itself (`AttachmentLog`) still needs to be `shared`, not `perScenario`, to survive across
 * the two Scenarios below and let the second Scenario's own `Before` observe the first Scenario's
 * `After` — the identical reason `hooks.steps.test.ts`'s own `HookLog` is `shared` (BEH-EC-017). The
 * `perScenario` `Attachments` double DEPENDS on the `shared` `AttachmentLog`, the same "`perScenario`
 * MAY require what `shared` provides" shape BEH-EC-007 already documents — rebuilt fresh every
 * Scenario (INV-EC-002), writing into the one `Ref` the `shared` tier holds for the whole Feature.
 */
import { assert } from "@effect/vitest"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Ref from "effect/Ref"
import { fileURLToPath } from "node:url"
import { attach, Attachments } from "../../src/Attachments.ts"
import { describeFeature } from "../../src/describeFeature.ts"
import { loadFeature } from "../../src/loadFeature.ts"

// The `.feature` file beside this one, resolved relative to this module rather than `process.cwd()`.
const featurePath = fileURLToPath(new URL("./attachments.feature", import.meta.url))

// Real bytes off disk, through the real parser, at module top level.
const feature = await loadFeature(featurePath)

// Every `data` half of an attached `(contentType, data)` pair, in call order, across BOTH Scenarios.
class AttachmentLog extends Context.Service<AttachmentLog, {
  readonly entries: Ref.Ref<ReadonlyArray<readonly [string, string]>>
}>()("AttachmentLog") {
  static readonly layer = Layer.effect(
    this,
    Effect.gen(function*() {
      return AttachmentLog.of({ entries: yield* Ref.make<ReadonlyArray<readonly [string, string]>>([]) })
    })
  )
}

// The test double for `Attachments` this pair's own header explains: recording every `attach` call
// into `AttachmentLog` instead of a real vitest `TestContext`. Rebuilt fresh every Scenario
// (`perScenario`, INV-EC-002) — its own `attach` closes over the ONE `Ref` the `shared` tier holds
// for the whole Feature, so the recordings themselves still survive across Scenarios even though this
// Layer's own build does not.
const attachmentsDouble: Layer.Layer<Attachments, never, AttachmentLog> = Layer.effect(
  Attachments,
  Effect.gen(function*() {
    const log = yield* AttachmentLog
    return Attachments.of({
      attach: (contentType, data) => Ref.update(log.entries, (held) => [...held, [contentType, data] as const])
    })
  })
)

const attachLabel = (label: string) => attach("text/plain", label)

// THE CALL UNDER TEST.
describeFeature(
  feature,
  { shared: AttachmentLog.layer, perScenario: attachmentsDouble },
  ({ After, Before, AfterStep, BeforeStep, When, Then }) => {
    Before(function*() {
      yield* attachLabel("Before")
    })

    BeforeStep(function*() {
      yield* attachLabel("BeforeStep")
    })

    AfterStep(function*() {
      yield* attachLabel("AfterStep")
    })

    After(function*() {
      yield* attachLabel("After")
    })

    When("the scenario attaches {string}", function*(label: string) {
      yield* attachLabel(`attach:${label}`)
    })

    Then(
      "the attachment log so far reads {string} with {string} logged {int} time",
      function*(expected: string, kind: string, times: number) {
        const held = yield* Ref.get((yield* AttachmentLog).entries)

        // THE ordering assertion: every hook kind and the step itself reached the SAME `Attachments`
        // this Feature's own shared Layer provided, in the real order the runner invokes them.
        assert.deepStrictEqual(held.map(([, data]) => data), expected.split(","))

        // Every attachment carried the `contentType` its own `attach` call passed — proving the
        // accessor forwards BOTH arguments, not just `data`.
        assert.ok(held.every(([contentType]) => contentType === "text/plain"))

        // The exact-count claim `expected`'s own comma-split cannot make on its own for `After` in
        // Scenario 1 (whose absence there is exactly what this counts): 0 the first time, 1 the second.
        assert.strictEqual(held.filter(([, data]) => data === kind).length, times)

        yield* attachLabel("read")
      }
    )
  }
)

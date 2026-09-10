/**
 * ADR-EC-060's real-output proof: `scripts/verify-junit-reporter.sh` runs THIS file through a real
 * `vitest run --config` invocation with `GherkinJUnitReporter` registered, then reads the ACTUAL
 * written `junit-report.xml` off disk and asserts on its structure — a passing, tagged, attaching
 * Scenario and a deliberately failing one, so the gate proves `<properties>` (tags), `<system-out>`
 * (attachments) and `<failure>` (a real error) all land in the real emitted file, not simulated.
 *
 * Excluded from every normal `vitest run` by the root and per-package `vitest.config.ts` files (see
 * their own `exclude` arrays) — one Scenario here fails ON PURPOSE, so the ONLY place this file is
 * ever collected is this directory's own standalone `vitest.config.ts`, reached via `--config`.
 */
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Ref from "effect/Ref"
import { fileURLToPath } from "node:url"
import { attach } from "../../src/Attachments.ts"
import { describeFeature } from "../../src/describeFeature.ts"
import { assert } from "../../src/EffectVitest.ts"
import { loadFeature } from "../../src/loadFeature.ts"

const featurePath = fileURLToPath(new URL("./junit.feature", import.meta.url))
const feature = await loadFeature(featurePath)

class World extends Context.Service<World, { readonly total: Ref.Ref<number> }>()("World") {
  static readonly layer = Layer.effect(
    this,
    Effect.gen(function*() {
      return World.of({ total: yield* Ref.make(0) })
    })
  )
}

// The literal marker `scripts/verify-junit-reporter.sh` greps the written report for.
export const ATTACHMENT_MARKER = "JUNIT-REPORTER-GATE-MARKER: order total was 42 cents"

describeFeature(feature, World.layer, ({ Given, Then, When }) => {
  Given("I attach the order total as evidence", function*() {
    yield* attach("text/plain", ATTACHMENT_MARKER)
  })

  When("the order total is computed", function*() {
    yield* Ref.set((yield* World).total, 42)
  })

  Then("I should have a total of {int}", function*(expected: number) {
    assert.strictEqual(yield* Ref.get((yield* World).total), expected)
  })
})

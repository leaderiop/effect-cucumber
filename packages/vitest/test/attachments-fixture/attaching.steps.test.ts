/**
 * ADR-EC-036/BEH-EC-028's real-output proof: a Scenario that attaches evidence from inside a step
 * and then fails, run through the real `describeFeature`, so `scripts/verify-attachments-panel.sh`
 * can invoke a real `vitest run` against this file and grep the ACTUAL printed failure panel for the
 * attached content — the same "real vitest output, not simulated" proof
 * `scripts/verify-failure-panel.sh`/ADR-EC-033/BEH-EC-025 already established for a failing step's
 * own pattern and location, applied here to an attachment instead. The in-process half of this proof
 * (the live `Attachments` Layer is genuinely reachable from a step and calls `ctx.annotate`) lives in
 * `packages/vitest/test/VitestTestApi.test.ts`.
 *
 * Excluded from every normal `vitest run` by the root and per-package `vitest.config.ts` files (see
 * their own `exclude` arrays) — this file fails ON PURPOSE, so the ONLY place it is ever collected is
 * this directory's own standalone `vitest.config.ts`, reached explicitly via `--config`, never by
 * directory discovery.
 */
import { assert } from "@effect/vitest"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Ref from "effect/Ref"
import { fileURLToPath } from "node:url"
import { attach } from "../../src/Attachments.ts"
import { describeFeature } from "../../src/describeFeature.ts"
import { loadFeature } from "../../src/loadFeature.ts"

const featurePath = fileURLToPath(new URL("./attaching.feature", import.meta.url))
const feature = await loadFeature(featurePath)

class World extends Context.Service<World, { readonly total: Ref.Ref<number> }>()("World") {
  static readonly layer = Layer.effect(
    this,
    Effect.gen(function*() {
      return World.of({ total: yield* Ref.make(0) })
    })
  )
}

// The literal marker `scripts/verify-attachments-panel.sh` greps the printed output for — distinct
// enough that it cannot appear in vitest's own scaffolding output by accident.
export const ATTACHMENT_MARKER = "ATTACHMENTS-PANEL-GATE-MARKER: order total was 42 cents"

describeFeature(feature, World.layer, ({ Given, Then, When }) => {
  Given("I attach the order total as evidence", function*() {
    // THE CALL UNDER TEST: attaching from inside a real running step, before the Scenario fails.
    yield* attach("text/plain", ATTACHMENT_MARKER)
  })

  When("the order total is computed", function*() {
    yield* Ref.set((yield* World).total, 42)
  })

  // Deliberately wrong on purpose: the computed total is 42, the `.feature` file says 999. A real
  // `assert.strictEqual` THROWS here, so the attachment above has a real failure panel to show up in.
  Then("I should have a total of {int}", function*(expected: number) {
    assert.strictEqual(yield* Ref.get((yield* World).total), expected)
  })
})

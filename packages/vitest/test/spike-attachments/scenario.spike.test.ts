/**
 * SPIKE — not shipped. The one thing this repo cannot fake: ACTUALLY running vitest and reading
 * its REAL output. This file deliberately fails one "Scenario" so `pnpm exec vitest run
 * packages/vitest/test/spike-attachments/scenario.spike.test.ts` prints a real failure panel, and
 * the attachment made via `Attachments.attach` (through this directory's `VitestTestApi.ts`'s live
 * wiring to `context.annotate`) should appear in it. See `research/attachments-spike.md` for the
 * captured output and verdict.
 *
 * The shape below is a deliberately small stand-in for what `Runner.ts`/`ScenarioEffect.ts` would
 * actually emit (no Background, no hooks, one step) — enough to exercise the seam-crossing plumbing
 * end to end without reimplementing the whole Plan/Collect pipeline.
 */
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import { attach } from "./Attachments.ts"
import { vitestTestApi } from "./VitestTestApi.ts"

/** A tagged stand-in for a real assertion failure — this repo's own convention (`Errors.ts`). */
class SpikeAssertionFailure extends Schema.TaggedError<SpikeAssertionFailure>()("SpikeAssertionFailure", {
  message: Schema.String
}) {}

const testApi = vitestTestApi("spike/attachments/scenario.spike.feature")

testApi.describe("Feature: Attachments spike", () => {
  testApi.effect(
    "Scenario: a step attaches evidence, then the Scenario fails",
    () =>
      Effect.gen(function*() {
        // The step body a real Scenario would run — `yield*`ing the new service exactly like the
        // task's proposed signature.
        yield* attach("text/plain", "SPIKE-ATTACHMENT-MARKER: order total was computed as 42")
        // Deliberate failure, so the attachment above has a failure panel to show up inside.
        return yield* new SpikeAssertionFailure({
          message: "intentional spike failure — the attachment above should be visible in vitest's output"
        })
      }),
    { tags: [], skip: false, contextFree: false }
  )
})

/**
 * SPIKE (issue #37, following #36's research) — REPRODUCTION, "after" half.
 *
 * The identical scenario `spike-repro-before-fix.test.ts` reproduces the bug with (same 400ms
 * setup, same 100ms/2000ms Scenario testTimeouts, same `describe.concurrent`), but wired through the
 * FIX this spike proposes and actually implements in `packages/vitest/src/Runner.ts` /
 * `VitestTestApi.ts` on this branch: BeforeAllScenarios runs via a real `beforeAll` (its OWN timeout
 * budget, vitest's default `hookTimeout`, never a Scenario's `testTimeout`), and every Scenario reads
 * a CAPTURED `Exit` rather than racing the batch itself inside its own body.
 *
 * Not wired through the public `describeFeature` DSL for the same reason as the "before" half: no
 * per-Scenario `testTimeout` knob exists there to reproduce heterogeneous timeouts with. This wires
 * the exact mechanism `Runner.ts` now uses (`api.beforeAll` capturing an `Exit`, every Scenario
 * `flatMap`ing that Exit) directly with `@effect/vitest`'s own `beforeAll`/`it.effect`.
 */
import { beforeAll, describe, effect as itEffect } from "@effect/vitest"
import * as Effect from "effect/Effect"
import type * as Exit from "effect/Exit"

// A REAL 400ms delay — identical to the "before" repro's `realDelay`.
const realDelay = (ms: number): Effect.Effect<void> =>
  Effect.promise(() => new Promise<void>((resolve) => setTimeout(resolve, ms)))

let buildCount = 0

describe.concurrent("REPRO (after fix): BeforeAllScenarios as a real beforeAll, captured Exit", () => {
  // The exact mechanism `Runner.ts` now uses: `beforeAllScenariosExit` is `null` until the real
  // `beforeAll` below sets it, then every Scenario `flatMap`s the captured Exit.
  let beforeAllScenariosExit: Exit.Exit<void, unknown> | null = null

  // `Effect.runPromise` is load-bearing here: `beforeAll` imported from `@effect/vitest` is
  // vitest's own RAW hook (`@effect/vitest`'s `index.ts` does `export * from "vitest"`), not
  // Effect-aware — an Effect handed to it directly is a lazy, never-run value, exactly the mistake
  // `VitestTestApi.ts`'s real `beforeAll`/`afterAll` implementations avoid by always wrapping in
  // `Effect.runPromise` before returning to the framework.
  beforeAll(() =>
    Effect.runPromise(
      Effect.map(
        Effect.exit(Effect.gen(function*() {
          buildCount += 1
          yield* realDelay(400)
        })),
        (exit) => {
          beforeAllScenariosExit = exit
        }
      )
    )
  )

  const scenarioBody = (): Effect.Effect<void, unknown> =>
    Effect.suspend(() =>
      beforeAllScenariosExit === null ? Effect.void : Effect.flatMap(beforeAllScenariosExit, () => Effect.void)
    )

  // SAME short budget as the "before" repro.
  itEffect("short-testTimeout scenario", scenarioBody, 100)
  // SAME long budget as the "before" repro.
  itEffect("long-testTimeout scenario", scenarioBody, 2000)
})

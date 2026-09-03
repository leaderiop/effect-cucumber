/**
 * SPIKE (issue #37/#36) — verifies the fix preserves BEH-EC-017's failure-reporting guarantee: "If
 * BeforeAllScenarios fails, that SAME failure is reported by EVERY Scenario in the Feature
 * individually, not by a single Feature-level failure with zero Scenario results."
 *
 * A REAL vitest `beforeAll` that throws directly does NOT have this shape — verified separately
 * (see the spike writeup): it produces ONE suite-level "Failed Suites" failure with every sibling
 * test reported as SKIPPED. This file proves the mechanism `Runner.ts` actually uses (capture the
 * Exit inside the `beforeAll`, so it never itself throws; every Scenario reads and re-raises that
 * Exit) avoids that regression and keeps two INDIVIDUALLY FAILING tests, each carrying the hook's
 * own error.
 *
 * Uses `.fails` so `pnpm test` stays green on this branch — both tests DO fail, each independently,
 * each with `"BeforeAllScenarios blew up"` — the raw transcript is captured verbatim in
 * `research/concurrent-execution-spike.md` from an actual `.fails`-free run.
 */
import { beforeAll, describe, effect as itEffect } from "@effect/vitest"
import * as Effect from "effect/Effect"
import type * as Exit from "effect/Exit"

describe("REPRO: BeforeAllScenarios failure still reports on EVERY Scenario individually", () => {
  let beforeAllScenariosExit: Exit.Exit<void, unknown> | null = null

  // `Effect.runPromise` is load-bearing here — see `spike-repro-after-fix.test.ts`'s comment: raw
  // vitest `beforeAll` is not Effect-aware, so the Effect must be executed explicitly.
  beforeAll(() =>
    Effect.runPromise(
      Effect.map(
        Effect.exit(Effect.fail("BeforeAllScenarios blew up")),
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

  // `.fails`: both are EXPECTED to fail, each individually, each with the SAME error — that IS the
  // guarantee this file proves survived the fix.
  itEffect.fails("scenario A", scenarioBody)
  itEffect.fails("scenario B", scenarioBody)
})

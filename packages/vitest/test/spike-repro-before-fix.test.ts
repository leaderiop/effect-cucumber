/**
 * SPIKE (issue #37, following #36's research) — REPRODUCTION, "before" half.
 *
 * Reproduces the real bug `research/parallel-scenario-execution-feasibility.md` § 2 found:
 * `BeforeAllScenarios` piggybacking on whichever Scenario's own body attempts it first means, under
 * concurrent scheduling, a SHORT-`testTimeout` sibling's interrupt cascades through the shared
 * once-cell and kills an unrelated LONG-`testTimeout` sibling too — even though that sibling's own
 * budget was never in danger.
 *
 * `makeOnce` below is copied VERBATIM from `packages/vitest/src/Runner.ts` as it stood on `main`
 * before this spike's fix (`git show origin/main:packages/vitest/src/Runner.ts`) — the exact
 * once-cell shape this repro exercises, not a reimplementation. Not wired through the public
 * `describeFeature` DSL, because the DSL has no per-Scenario `testTimeout` knob to reproduce
 * heterogeneous timeouts with — this drives the real mechanism directly with `@effect/vitest`'s own
 * `it.effect(name, fn, timeoutMs)`, the same primitive `VitestTestApi.ts` builds on.
 *
 * Uses `.fails` (vitest/`@effect/vitest`'s "expected to fail" tester) so `pnpm test` stays green on
 * this branch — the RAW failing transcript (both tests failing, the long-timeout one with
 * `InterruptError`) is captured verbatim in `research/concurrent-execution-spike.md` § the bug,
 * reproduced, from an actual `.fails`-free run.
 */
import { describe, effect as itEffect } from "@effect/vitest"
import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import type * as Scope from "effect/Scope"

// Copied verbatim from `packages/vitest/src/Runner.ts` @ `main` (pre-fix).
const makeOnce = (
  body: Effect.Effect<void, unknown, Scope.Scope>
): Effect.Effect<void, unknown, Scope.Scope> => {
  const deferred = Deferred.makeUnsafe<void, unknown>()
  let started = false
  return Effect.suspend((): Effect.Effect<void, unknown, Scope.Scope> => {
    if (started) {
      return Deferred.await(deferred)
    }
    started = true
    return Effect.flatMap(Deferred.into(body, deferred), () => Deferred.await(deferred))
  })
}

// A REAL 400ms delay (not `Effect.sleep` / `TestClock`, which is per-test simulated and would never
// advance on its own here) — the "slow setup" (e.g. a testcontainer boot) the research doc used.
const realDelay = (ms: number): Effect.Effect<void> =>
  Effect.promise(() => new Promise<void>((resolve) => setTimeout(resolve, ms)))

let buildCount = 0

describe.concurrent("REPRO (before fix): BeforeAllScenarios once-cell under sequence.concurrent", () => {
  const cell = makeOnce(
    Effect.gen(function*() {
      buildCount += 1
      yield* realDelay(400)
    })
  )

  // Short budget: comfortably enough for its own (trivial) work, but shorter than the 400ms setup.
  // `.fails`: this test is EXPECTED to fail (times out) — that IS the bug.
  itEffect.fails("short-testTimeout scenario", () => Effect.flatMap(cell, () => Effect.void), 100)
  // Long budget: would EASILY tolerate the 400ms setup on its own — but the once-cell's interrupt
  // cascades from the short-timeout sibling, so THIS ALSO fails. `.fails`: expected, that IS the bug.
  itEffect.fails("long-testTimeout scenario", () => Effect.flatMap(cell, () => Effect.void), 2000)
})

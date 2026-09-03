/**
 * SPIKE (issue #37 / #36): `beforeAll` is a prototype addition to the seam, added to move
 * `BeforeAllScenarios` off the once-cell in `Runner.ts` and onto a real framework `beforeAll` with
 * its own timeout budget. See `research/concurrent-execution-spike.md`.
 *
 * The injected seam between `Runner.ts` and the test framework: `describe`, `effect`, `beforeAll`,
 * `afterAll`. Types only, and it must never import a framework (`scripts/verify-testapi-seam.sh`).
 * `EmitOptions.contextFree` routes a node off the shared tier; `afterAll` runs whether or not a
 * filter selected the block's tests (BEH-EC-017).
 */
import type * as Effect from "effect/Effect"
import type * as Scope from "effect/Scope"

/**
 * How ONE emitted test node differs from a bare, untagged, running one — the library's own plain
 * data, carried across the seam and translated into whatever the real test framework wants by the
 * adapters in `VitestTestApi.ts`.
 */
export interface EmitOptions {
  readonly tags: ReadonlyArray<string>
  readonly skip: boolean
  readonly contextFree: boolean
}

/**
 * The subset of a test framework's surface `Runner.ts` uses.
 */
export interface TestApi {
  readonly describe: (name: string, define: () => void) => void
  readonly effect: (
    name: string,
    self: () => Effect.Effect<void, unknown, Scope.Scope>,
    options: EmitOptions
  ) => void
  /**
   * SPIKE addition: the Feature block's own setup hook, registered through the framework's real
   * `beforeAll` — its own timeout budget, independent of any Scenario's `testTimeout`. `timeout`,
   * when given, is milliseconds, mirroring `@effect/vitest`'s `hookTimeout` mechanism.
   */
  readonly beforeAll: (
    name: string,
    self: () => Effect.Effect<void, unknown, Scope.Scope>,
    timeout?: number
  ) => void
  readonly afterAll: (name: string, self: () => Effect.Effect<void, unknown, Scope.Scope>) => void
}

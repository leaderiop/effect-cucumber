/**
 * The injected seam between `Runner.ts` and the test framework: `describe`, `effect`, `afterAll`.
 * Types only, and it must never import a framework (`scripts/verify-testapi-seam.sh`).
 * `EmitOptions.contextFree` routes a node off the shared tier; `afterAll` runs whether or not a
 * filter selected the block's tests (BEH-EC-017).
 */
import type * as Effect from "effect/Effect"
import type * as Scope from "effect/Scope"

/**
 * How ONE emitted test node differs from a bare, untagged, running one — the library's own plain
 * data, carried across the seam and translated into whatever the real test framework wants by the
 * adapters in `VitestTestApi.ts`. `retry` (ADR-EC-034, BEH-EC-026) is data, not a call: `Runner.ts`
 * computes it from the `@retry` tag the same way it computes `skip` from `@skip`, and only
 * `VitestTestApi.ts` — the one module allowed to import `@effect/vitest` — turns it into a real
 * `flakyTest` wrap, because this module and `Runner.ts` may never import a test framework
 * (`scripts/verify-testapi-seam.sh`).
 */
export interface EmitOptions {
  readonly tags: ReadonlyArray<string>
  readonly skip: boolean
  readonly retry: boolean
  readonly contextFree: boolean
}

/**
 * The subset of a test framework's surface `Runner.ts` uses — three members, and no more.
 */
export interface TestApi {
  readonly describe: (name: string, define: () => void) => void
  readonly effect: (
    name: string,
    self: () => Effect.Effect<void, unknown, Scope.Scope>,
    options: EmitOptions
  ) => void
  readonly afterAll: (name: string, self: () => Effect.Effect<void, unknown, Scope.Scope>) => void
}

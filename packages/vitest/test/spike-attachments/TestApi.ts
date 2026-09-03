/**
 * SPIKE — not shipped. This copy is byte-identical to the real `packages/vitest/src/TestApi.ts`
 * EXCEPT for the one change this spike concluded is actually required — see the `Attachments`
 * import and the widened `Scope.Scope | Attachments` below, and the writeup's "the naive design
 * doesn't type-check" finding for why.
 *
 * The injected seam between `Runner.ts` and the test framework: `describe`, `effect`, `afterAll`.
 * Types only, and it must never import a framework (`scripts/verify-testapi-seam.sh`).
 * `EmitOptions.contextFree` routes a node off the shared tier; `afterAll` runs whether or not a
 * filter selected the block's tests (BEH-EC-017).
 */
import type * as Effect from "effect/Effect"
import type * as Scope from "effect/Scope"
// LIBRARY-owned, framework-free (verified by the seam script below) — same footing as `effect/Scope`
// on the line above. `Attachments` is exactly as much "the library's own vocabulary" as `Scope` is.
import type { Attachments } from "./Attachments.ts"

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
 * The subset of a test framework's surface `Runner.ts` uses — three members, and no more.
 *
 * `Scope.Scope | Attachments` (not just `Scope.Scope`, as on `main`): `Attachments`' LIVE
 * implementation cannot be discharged inside the framework-agnostic core (`ScenarioEffect.ts`)
 * because it needs a per-test `vitest.TestContext`, which only exists on the OTHER side of this
 * seam. So the Effect `Runner.ts` hands across still requires `Attachments` when it arrives here —
 * same reason `Scope.Scope` itself is still required here rather than discharged earlier.
 */
export interface TestApi {
  readonly describe: (name: string, define: () => void) => void
  readonly effect: (
    name: string,
    self: () => Effect.Effect<void, unknown, Scope.Scope | Attachments>,
    options: EmitOptions
  ) => void
  readonly afterAll: (name: string, self: () => Effect.Effect<void, unknown, Scope.Scope | Attachments>) => void
}

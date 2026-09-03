/**
 * The two concrete `TestApi` adapters over `@effect/vitest`: `vitestTestApi` (plain path) and
 * `sharedLayerTestApi` (shared path). This module and `describeFeature.ts` are the only ones that
 * may name a test framework (`scripts/verify-testapi-seam.sh`).
 *
 * Invariants a reader must not tidy away:
 * - `TestClock.layer()` is CALLED: without the parens it is the constructor, and the per-Scenario
 *   clock isolation ADR-EC-018 exists for silently disappears (`test/emission.test.ts` clock block).
 * - Every emitted block is `shuffle: false`, so Scenarios run in document order under
 *   `--sequence.shuffle` (BEH-EC-002, `pnpm test:shuffle`).
 * - The shared path holds one memo-map reference across the Feature block: the framework's
 *   one-argument `layer(...)` closes its scope from the last test's `onTestFinished`, before any
 *   `afterAll`, so without the hold the teardown would rebuild the tier (`emission.test.ts`
 *   "not a rebuild"; `scripts/verify-shared-layer-once.sh`). Relies on `sequence.hooks: "stack"`.
 * - `makeDegradingEffect` re-emits untagged BEFORE warning (BEH-EC-008).
 */
import { afterAll, beforeAll, describe, it, layer, type Vitest } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Layer from "effect/Layer"
import * as Scope from "effect/Scope"
import * as TestClock from "effect/testing/TestClock"
import * as TestConsole from "effect/testing/TestConsole"
import { makeUndeclaredTagWarning } from "./Errors.ts"
// `StepBody` is declared in `Plan.ts` and imported here, never the reverse (`pnpm circular`).
import type { ErasedLayer } from "./Plan.ts"
// The composite `scenarioLayers` key, in a LEAF module both this file and `Runner.ts` import rather
// than private to either — `ScenarioKey.ts`'s own header has the argument.
import type { TestApi } from "./TestApi.ts"

/**
 * The per-Scenario simulated clock and console, rebuilt here from the two PUBLIC `effect` modules.
 */
export const testEnv = Layer.mergeAll(TestConsole.layer, TestClock.layer())
const makeDegradingEffect = (
  featureUri: string,
  emit: (
    name: string,
    self: Parameters<TestApi["effect"]>[1],
    options: { readonly tags?: Array<string>; readonly skip: boolean }
  ) => void
): TestApi["effect"] =>
(name, self, options) => {
  try {
    emit(name, self, { tags: [...options.tags], skip: options.skip })
  } catch (cause) {
    try {
      // The same name and the same thunk, with `skip` preserved: only the tags are dropped.
      emit(name, self, { skip: options.skip })
    } catch {
      // Structural discrimination, and the only branch that reaches it: an emission with no tags
      // cannot fail `strictTags`, so whatever is wrong here was never about tags.
      throw cause
    }
    console.warn(
      makeUndeclaredTagWarning({ uri: featureUri, scenarioName: name, tags: options.tags }).message
    )
  }
}
const block: typeof describe = describe

export const vitestTestApi = (featureUri: string): TestApi => ({
  // `shuffle: false`: a Feature's Scenarios run in DOCUMENT order even under `--sequence.shuffle`
  // (BEH-EC-002).
  describe: (name, define) => {
    block(name, { shuffle: false }, define)
  },
  effect: makeDegradingEffect(featureUri, (name, self, emitOptions) => {
    it.effect(name, self, emitOptions)
  }),
  // SPIKE (issue #37/#36): the framework's own block-level SETUP hook, run to a Promise the same
  // way `afterAll` below runs the teardown — scoped, against a fresh simulated clock and console,
  // and with its OWN timeout (vitest's hook-timeout default, or `timeout` if given), never a
  // Scenario's `testTimeout`.
  beforeAll: (_name, self, timeout) => {
    beforeAll(() => Effect.runPromise(self().pipe(Effect.scoped, Effect.provide(testEnv))), timeout)
  },
  // The framework's own block-level teardown hook, run to a Promise the way its Effect-aware test
  // constructor would run a body: scoped, against a fresh simulated clock and console.
  afterAll: (_name, self) => {
    afterAll(() => Effect.runPromise(self().pipe(Effect.scoped, Effect.provide(testEnv))))
  }
})
/**
 * @param featureUri - the `.feature` file every warning from this adapter is located against
 * @param sharedTier - the Feature's shared Layer, built once for the Feature's block
 * @param memoMap - the memo map the framework builds `sharedTier` through
 */
export const sharedLayerTestApi = (featureUri: string, sharedTier: ErasedLayer, memoMap: Layer.MemoMap): TestApi => {
  const contextFreeEffect = vitestTestApi(featureUri).effect
  // Set by the FIRST `describe` — the Feature block — and read by every emission inside it.
  let sharedIt: Vitest.MethodsNonLive<any> | null = null
  const requireSharedIt = (member: string): Vitest.MethodsNonLive<any> => {
    if (sharedIt === null) {
      throw new Error(
        `describeFeature: the shared-path TestApi's ${member} was called before its first describe — Runner.ts must open the Feature block before emitting anything into it.`
      )
    }
    return sharedIt
  }
  const sharedRouteEffect = makeDegradingEffect(featureUri, (name, self, emitOptions) => {
    requireSharedIt("effect").effect(name, () => self().pipe(Effect.provide(testEnv)), emitOptions)
  })
  // The module-level `describe`, under a name oxlint's vitest rules do not recognise as a test-file
  // call: this is a library adapter forwarding a block, not a test declaring one.
  return {
    describe: (name, define) => {
      if (sharedIt !== null) {
        block(name, { shuffle: false }, define)
        return
      }
      // The Feature block is our `describe` (so it carries `shuffle: false`); the framework's
      // one-argument `layer(...)` is called inside its factory so its hooks land on this block.
      block(name, { shuffle: false }, () => {
        // HOLD one memo-map reference to the shared build for the whole block.
        const hold = Scope.makeUnsafe()
        beforeAll(() => Effect.runPromise(Effect.asVoid(Layer.buildWithMemoMap(sharedTier, memoMap, hold))))
        afterAll(() => Effect.runPromise(Scope.close(hold, Exit.void)))
        layer(sharedTier, { excludeTestServices: true, memoMap })((methods) => {
          sharedIt = methods
          define()
        })
      })
    },
    effect: (name, self, emitOptions) =>
      emitOptions.contextFree
        // Nothing here can force the shared Layer to build.
        ? contextFreeEffect(name, self, emitOptions)
        : sharedRouteEffect(name, self, emitOptions),
    // SPIKE (issue #37/#36): registered inside the Feature block, AFTER the framework's own
    // `beforeAll(build hold)` (registered by the `describe` factory above, earlier in this same
    // block) — `beforeAll`s run in REGISTRATION order, so `hold`'s build has already run by the
    // time this fires, and re-running `Layer.buildWithMemoMap` against the SAME `memoMap` here
    // reuses that memoized build rather than re-building (the same technique `afterAll` below
    // already uses for AfterAllScenarios). Mirrors `afterAll`'s own shape exactly, just on setup.
    beforeAll: (_name, self, timeout) => {
      requireSharedIt("beforeAll")
      beforeAll(() =>
        Effect.runPromise(
          Effect.scoped(
            Effect.gen(function*() {
              const scope = yield* Effect.scope
              const services = yield* Layer.buildWithMemoMap(sharedTier, memoMap, scope)
              yield* self().pipe(Effect.provide(testEnv), Effect.provide(services))
            })
          )
        ), timeout)
    },
    // Registered inside the Feature block after the framework's scope-closing `afterAll`, so under
    // `sequence.hooks: "stack"` it runs before that close.
    afterAll: (_name, self) => {
      requireSharedIt("afterAll")
      afterAll(() =>
        Effect.runPromise(
          Effect.scoped(
            Effect.gen(function*() {
              const scope = yield* Effect.scope
              const services = yield* Layer.buildWithMemoMap(sharedTier, memoMap, scope)
              yield* self().pipe(Effect.provide(testEnv), Effect.provide(services))
            })
          )
        )
      )
    }
  }
}

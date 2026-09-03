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
 * - `withRetry` (ADR-EC-034, BEH-EC-026) wraps a `@retry` Scenario's thunk as `() =>
 *   flakyTest(self())`, never `flakyTest(self())` hoisted out of a thunk: `self()` must be CALLED
 *   first, so `buildScenarioEffect`'s own `Effect.provide(layer)` is already composed inside the
 *   value `flakyTest`'s `Effect.retry` then wraps — the same "call first, wrap the result" shape
 *   `buildSeededScenarioEffect` already relies on in `Runner.ts`. Applied BEFORE `makeDegradingEffect`
 *   ever sees `self`, so it wraps once and is reused unchanged across a possible tags-degradation
 *   retry of the EMISSION itself (a different kind of retry, decided at registration time, not to be
 *   confused with the runtime one this adds).
 */
import { afterAll, beforeAll, describe, flakyTest, it, layer, type Vitest } from "@effect/vitest"
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

/**
 * When `retry` is true (the Scenario carried `@retry`), hand back a NEW thunk that calls the
 * original `self` first — so `buildScenarioEffect`'s `Effect.provide(layer)` is already the
 * innermost step of the value it returns (INV-EC-002) — and only THEN wraps that whole value in
 * `flakyTest`, putting `Effect.retry` OUTSIDE the Layer build so it rebuilds fresh on every attempt,
 * not merely on the first (ADR-EC-034). `flakyTest(self())`, never a hoisted `flakyTest(self())`
 * shared across calls: the thunk itself must stay lazy, since `self` runs at TEST time, not at
 * registration time.
 */
const withRetry = (
  retry: boolean,
  self: Parameters<TestApi["effect"]>[1]
): Parameters<TestApi["effect"]>[1] => retry ? () => flakyTest(self()) : self

const makeDegradingEffect = (
  featureUri: string,
  emit: (
    name: string,
    self: Parameters<TestApi["effect"]>[1],
    options: { readonly tags?: Array<string>; readonly skip: boolean }
  ) => void
): TestApi["effect"] =>
(name, self, options) => {
  // Computed once, before either registration attempt below, so a possible tags-degradation retry
  // of the EMISSION reuses the identical retry-aware thunk rather than re-deriving it.
  const retryAwareSelf = withRetry(options.retry, self)
  try {
    emit(name, retryAwareSelf, { tags: [...options.tags], skip: options.skip })
  } catch (cause) {
    try {
      // The same name and the same thunk, with `skip` preserved: only the tags are dropped.
      emit(name, retryAwareSelf, { skip: options.skip })
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

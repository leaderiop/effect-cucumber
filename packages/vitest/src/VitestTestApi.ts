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
 * - `attachmentsLive` (ADR-EC-036, BEH-EC-028) is threaded into BOTH `it.effect`-shaped call sites
 *   below — the plain path's own `effect` field and the shared path's `sharedRouteEffect` — never
 *   into `afterAll`: `AfterAllScenarios` is rejected at the `Dsl.ts` type level before its thunk could
 *   ever reach here (`HookRegistrar<RShared>` excludes `Attachments`), so there is nothing for
 *   `afterAll`'s wiring to provide and no fallback/no-op Layer is needed. `attachmentsLive(ctx)` is
 *   built ONCE per `it.effect` invocation and provided OUTSIDE `withRetry`'s `flakyTest` wrap (i.e.
 *   around whatever `self` already is, retry-aware or not) — so a `@retry` Scenario's every attempt
 *   shares the SAME live `Attachments`, bound to the SAME `ctx`: an attachment made on a failed
 *   attempt is never cleared before the next attempt runs, and every attempt's attachments remain
 *   visible in the final report. Deliberate, not an oversight — see ADR-EC-036.
 * - `withMetrics` (ADR-EC-037, BEH-EC-029, INV-EC-008) wraps `Effect.Metric` recording OUTSIDE
 *   `withRetry`'s `flakyTest`, exactly the way `attachmentsLive` already wraps outside it — applied
 *   to `retryAwareSelf`, so `withScenarioMetrics`'s own `Effect.exit` only ever observes a `@retry`
 *   Scenario's FINAL, already-retried outcome, never an intermediate attempt's. Applied ONLY when
 *   `EmitOptions.scenario` is `true`: `makeDegradingEffect` is the one function `Runner.ts`'s trailing
 *   unused-step-definition warning nodes ALSO flow through (the only other caller of `api.effect`), and
 *   a warning's own `() => Effect.void` is not a Scenario — wrapping it too would record a spurious
 *   `outcome: "pass"`/near-zero-duration sample per unused step definition, polluting a metric named
 *   `scenario.result`. Where it sits relative to `attachmentsLive` does not matter functionally
 *   (`Metric`'s `MetricRegistry` is ambient, not something `Attachments` or `Metric` read from each
 *   other), so it composes at the SAME point `withRetry` already does — inside `makeDegradingEffect`,
 *   before either registration attempt — and `attachmentsLive` keeps wrapping OUTSIDE the whole
 *   resulting `self` unchanged, with no reordering needed at its own call sites.
 * - `emitOptions.rerunKey` (ADR-EC-038, BEH-EC-030) is stamped onto `ctx.task.meta.rerunKey` INSIDE
 *   both `it.effect` callbacks below, BEFORE `self()` runs — this is the same `ctx: TestContext`
 *   `attachmentsLive(ctx)` already reads, no new seam beyond what ADR-EC-036 already opened. Setting
 *   it before `self()` runs (rather than after, or only on success) is what makes it survive a
 *   FAILING Scenario: `task.meta` is a plain property on the task object, unrelated to how the test
 *   body later exits, so a rerun-manifest write-side script reading `--reporter=json`'s own output
 *   sees it on a failed assertion result too. `rerunKey` is passed to `it.effect`'s own options
 *   argument NOT as a field of that argument — vitest's `it.effect` knows nothing about it — but
 *   read out of `emitOptions` in the surrounding closure instead, so only `{ tags, skip }` (fields
 *   vitest's own `it.effect` actually interprets) cross into its options argument.
 * - `beforeAll` (ADR-EC-040, BEH-EC-032) is `BeforeAllScenarios`'s new real home, replacing the
 *   once-cell that used to live inside `Runner.ts`. `vitestTestApi`'s implementation mirrors its own
 *   `afterAll` below exactly (scoped, against a fresh simulated clock and console, run to a Promise).
 *   `sharedLayerTestApi`'s implementation mirrors ITS OWN `afterAll` below just as exactly: it
 *   re-runs `Layer.buildWithMemoMap` against the SAME `memoMap` the block's own `beforeAll(build
 *   hold)` (registered by the `describe` factory, earlier in this same block — `beforeAll`s run in
 *   REGISTRATION order) already populated, REUSING that memoized build rather than rebuilding it —
 *   necessary because `BeforeAllScenarios` now runs OUTSIDE `@effect/vitest`'s own `layer(...)`
 *   machinery (which only auto-provides the shared tier to `methods.effect`/`methods.it`-registered
 *   bodies, never to a bare framework `beforeAll`), so without this explicit re-provision
 *   `BeforeAllScenarios`'s real `RShared` requirement on the shared path would have nothing supplying
 *   it at runtime. `EmitOptions.timeout` (ADR-EC-040, BEH-EC-032) reaches `it.effect`'s real
 *   `TestOptions.timeout` the same way `rerunKey` reaches `task.meta`: carried, unapplied, through
 *   `makeDegradingEffect`'s reduced options object, converting the library's `number | null` to the
 *   `number | undefined` `TestOptions.timeout` itself accepts.
 */
import { afterAll, beforeAll, describe, flakyTest, it, layer, type TestContext, type Vitest } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Layer from "effect/Layer"
import * as Scope from "effect/Scope"
import * as TestClock from "effect/testing/TestClock"
import * as TestConsole from "effect/testing/TestConsole"
import { Attachments } from "./Attachments.ts"
import { makeUndeclaredTagWarning } from "./Errors.ts"
// `StepBody` is declared in `Plan.ts` and imported here, never the reverse (`pnpm circular`).
import type { ErasedLayer } from "./Plan.ts"
// The composite `scenarioLayers` key, in a LEAF module both this file and `Runner.ts` import rather
// than private to either — `ScenarioKey.ts`'s own header has the argument.
import { withScenarioMetrics } from "./ScenarioMetrics.ts"
import type { TestApi } from "./TestApi.ts"

/**
 * `TaskMeta` (`@vitest/runner`, re-exported by `vitest`) is declared as an empty interface
 * specifically so a caller can extend it via declaration merging — vitest's own documented
 * mechanism, not a workaround. This is the one place that merge happens; every other module reaches
 * a rerun key only as the `EmitOptions.rerunKey`/`string | null` plain data `TestApi.ts` already
 * declares.
 */
declare module "vitest" {
  interface TaskMeta {
    rerunKey?: string
  }
}

/**
 * The per-Scenario simulated clock and console, rebuilt here from the two PUBLIC `effect` modules.
 */
export const testEnv = Layer.mergeAll(TestConsole.layer, TestClock.layer())

/**
 * `Attachments`' LIVE implementation, built PER TEST from the `vitest.TestContext` `@effect/vitest`'s
 * `it.effect` hands its callback (ADR-EC-036, BEH-EC-028) — unlike `testEnv` above, this cannot be a
 * module-level constant, because `TestClock`/`TestConsole` need no per-test value from the framework
 * but `Attachments` needs `ctx.annotate` specifically bound to the test currently running.
 *
 * `data` becomes the annotation's `message`; `contentType` becomes its `type` — the two-argument
 * overload of `context.annotate(message, type?)`, rendered by vitest's DEFAULT reporter's failure
 * panel with no custom `Reporter` involved.
 */
const attachmentsLive = (ctx: TestContext): Layer.Layer<Attachments> =>
  Layer.succeed(
    Attachments,
    Attachments.of({
      attach: (contentType, data) => Effect.promise(() => ctx.annotate(data, contentType)).pipe(Effect.asVoid)
    })
  )

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

/**
 * `self` is CALLED first — the identical "call first, wrap the result" shape `withRetry` above and
 * `Runner.ts`'s own `buildSeededScenarioEffect` already use — so whatever `self()` already is
 * (`flakyTest`-wrapped or not) is fully resolved before `withScenarioMetrics` wraps its RESULT.
 * Applied only when `scenario` (`EmitOptions.scenario`) is `true` (see the module doc comment's
 * `withMetrics` note): a Scenario is measured, a warning node is not.
 */
const withMetrics = (
  scenario: boolean,
  self: Parameters<TestApi["effect"]>[1]
): Parameters<TestApi["effect"]>[1] => scenario ? () => withScenarioMetrics(self()) : self

const makeDegradingEffect = (
  featureUri: string,
  emit: (
    name: string,
    self: Parameters<TestApi["effect"]>[1],
    options: {
      readonly tags?: Array<string>
      readonly skip: boolean
      readonly rerunKey: string | null
      readonly timeout?: number
    }
  ) => void
): TestApi["effect"] =>
(name, self, options) => {
  // Computed once, before either registration attempt below, so a possible tags-degradation retry
  // of the EMISSION reuses the identical retry-and-metrics-aware thunk rather than re-deriving it.
  // `withMetrics` wraps OUTSIDE `withRetry`'s result, never the reverse (ADR-EC-037).
  const observedSelf = withMetrics(options.scenario, withRetry(options.retry, self))
  // `EmitOptions.timeout` is `number | null` (ADR-EC-038's `rerunKey` convention: a required field,
  // explicit `null` for "no override"). `it.effect`'s real `TestOptions.timeout?: number` is an
  // OPTIONAL key under this repo's `exactOptionalPropertyTypes` — an explicit `timeout: undefined`
  // is rejected there just as `null` would be, so a `null` override becomes an OMITTED key, via
  // spread, rather than a present-but-undefined one — the same reason `tags` below is built with a
  // fresh array rather than passed by reference only when it needs constructing.
  const timeout = options.timeout === null ? {} : { timeout: options.timeout }
  try {
    emit(name, observedSelf, { tags: [...options.tags], skip: options.skip, rerunKey: options.rerunKey, ...timeout })
  } catch (cause) {
    try {
      // The same name and the same thunk, with `skip`/`rerunKey`/`timeout` preserved: only the tags
      // are dropped.
      emit(name, observedSelf, { skip: options.skip, rerunKey: options.rerunKey, ...timeout })
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
    // `emitOptions` is passed to `it.effect` BY REFERENCE, unchanged from before this module carried
    // a `rerunKey` field: `it.effect`'s own `TestOptions` only interprets `tags`/`skip` and ignores
    // the rest, and passing the whole reduced-options object rather than a freshly-built
    // `{ tags, skip }` literal is what keeps `tags`' optionality intact under
    // `exactOptionalPropertyTypes` (a fresh literal would widen `tags?: Array<string>` to a
    // mandatory `Array<string> | undefined`, which `TestOptions.tags` rejects).
    it.effect(name, (ctx) => {
      // Stamped BEFORE `self()` runs, so it is recorded on `ctx.task.meta` whether the Scenario
      // passes or fails — `--reporter=json`'s own `JsonReporter` serialises `task.meta` verbatim
      // per assertion result (ADR-EC-038), which is what the write-side script reads back.
      if (emitOptions.rerunKey !== null) {
        ctx.task.meta.rerunKey = emitOptions.rerunKey
      }
      return self().pipe(Effect.provide(attachmentsLive(ctx)))
    }, emitOptions)
  }),
  // `BeforeAllScenarios`'s new real home (ADR-EC-040, BEH-EC-032) — the framework's own block-level
  // SETUP hook, run to a Promise the same way `afterAll` below runs the teardown: scoped, against a
  // fresh simulated clock and console, on its OWN timeout budget (vitest's default hook timeout),
  // never a Scenario's `testTimeout`.
  beforeAll: (_name, self) => {
    beforeAll(() => Effect.runPromise(self().pipe(Effect.scoped, Effect.provide(testEnv))))
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
    requireSharedIt("effect").effect(
      name,
      (ctx) => {
        // Same stamp-before-run shape as the plain path's own `effect` field above.
        if (emitOptions.rerunKey !== null) {
          ctx.task.meta.rerunKey = emitOptions.rerunKey
        }
        return self().pipe(Effect.provide(Layer.mergeAll(testEnv, attachmentsLive(ctx))))
      },
      // `emitOptions` by reference, same reason as the plain path's own `effect` field above.
      emitOptions
    )
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
    // `BeforeAllScenarios`'s new real home on the shared path (ADR-EC-040, BEH-EC-032) — registered
    // inside the Feature block, AFTER the framework's own `beforeAll(build hold)` (registered by the
    // `describe` factory above, earlier in this same block — `beforeAll`s run in REGISTRATION order,
    // so `hold`'s build has already run by the time this fires). Re-running `Layer.buildWithMemoMap`
    // against the SAME `memoMap` here REUSES that memoized build rather than rebuilding it — the
    // identical technique `afterAll` below already uses for teardown, needed here because
    // `BeforeAllScenarios` now runs OUTSIDE `@effect/vitest`'s own `layer(...)` machinery (which only
    // auto-provides the shared tier to `methods.effect`/`methods.it`-registered bodies, never to a
    // bare framework `beforeAll`) — without this, the hook's real `RShared` requirement would have
    // nothing supplying it at runtime.
    beforeAll: (_name, self) => {
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
        )
      )
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

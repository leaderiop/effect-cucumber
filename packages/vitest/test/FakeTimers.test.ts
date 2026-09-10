/**
 * `vi.useFakeTimers()`/`vi.setSystemTime()` against Effect's own clocks (`effect/testing/TestClock`
 * and the live `Clock`), inside a real `describeFeature` Scenario whose `Before`/`After` hooks and
 * steps compose the two mechanisms together — a gap this repository had NO coverage of at all:
 * nothing in `packages/vitest/test/**` ever called `vi.useFakeTimers`/`vi.setSystemTime` before this
 * file, even though every other time-based test here (`Testing.test.ts`, `emission.test.ts`'s
 * "Shared clock isolation" block) drives time through `TestClock.adjust` alone.
 *
 * REAL FOOTGUN FOUND WHILE CLOSING THIS GAP — read before reaching for `vi.useFakeTimers()`
 * anywhere near a `describeFeature` Scenario:
 *
 * `TestClock.adjust`/`setTime` THEMSELVES HANG once `vi.useFakeTimers()` is installed and vi's own
 * fake clock is never advanced — verified against a real, reproducible timeout, not inferred. The
 * naive expectation is that `effect/testing/TestClock` is immune to `vi`'s fake timers, because its
 * `sleep` (`effect@4.0.0-rc.112`'s `testing/TestClock.ts`) parks a fiber on a `Latch` and never
 * calls a JS timer function at all. That half is true. But `TestClock`'s `run` function — the
 * implementation `adjust` and `setTime` both call — opens with
 * `yield* Fiber.await(yield* Effect.forkChild(Effect.yieldNow))`: an explicit scheduler yield,
 * BEFORE it ever touches its own `sleeps` queue. Effect's default `Scheduler` (`Scheduler.ts`'s
 * `MixedScheduler`, `executionMode: "async"` — nothing in this framework or in `EffectVitestInternal.ts`
 * overrides it) dispatches that yield through `globalThis.setImmediate`
 * (`MixedSchedulerDispatcher.scheduleTask` → `this.setImmediate(...)`). `vi.useFakeTimers()`
 * replaces `globalThis.setImmediate` BY DEFAULT — its `toFake` list excludes only `"nextTick"` and
 * `"queueMicrotask"` — so `TestClock.adjust`'s very first line never gets past its own internal
 * yield while a fake, unadvanced clock is installed. `Effect.yieldNow` used directly (as
 * `emission.test.ts`'s own `bracketed` hook helper does, for one example already living in this
 * repository) hangs the identical way, confirmed independently before this file settled on
 * `TestClock.adjust` as its subject.
 *
 * The only thing that unblocks it is flushing vi's OWN fake clock — and specifically
 * `vi.runAllTimersAsync()`, not `vi.advanceTimersByTimeAsync` with any finite duration:
 * `setImmediate`'s fake callback did not reliably fall inside an N-millisecond `advanceTimersByTimeAsync`
 * window during this file's own exploration, while `runAllTimersAsync` (which repeatedly drains
 * every pending timer, immediates included, until none remain) released it every time. This is
 * demonstrated, not merely asserted, by the first Scenario below.
 *
 * By contrast, the LIVE (non-Test) `Clock`'s own `sleep` (`effect/internal/effect.ts`'s
 * `ClockImpl.sleepMillis`) is a bare `setTimeout` call with no hidden `Effect.yieldNow` detour, so
 * it composes with `vi.useFakeTimers()` the "obvious" way: `vi.advanceTimersByTimeAsync(ms)` alone
 * releases it, demonstrated in the standalone `it.live` block at the bottom of this file. Which of
 * vi's flush APIs is required — or whether one is needed at all — therefore depends entirely on
 * which Clock implementation is ambient, and nothing here warns a consumer of that before they hit
 * it in their own suite.
 *
 * A second, independent divergence: `vi.setSystemTime()` moves the real, global `Date` — but
 * `TestClock` seeds its own `currentTimestamp` at `new Date(0).getTime()` once and moves it ONLY via
 * `adjust`/`setTime`, never by reading `Date.now()`. So under `it.effect`'s ambient
 * `TestClock.layer()`, `Date.now()` and `Clock.currentTimeMillis` silently DISAGREE the moment
 * `vi.setSystemTime()` is called — the second Scenario below.
 */
import { ParameterTypeStore, parseFeature } from "@effect-cucumber/gherkin"
import * as Clock from "effect/Clock"
import * as Effect from "effect/Effect"
import * as Fiber from "effect/Fiber"
import * as Layer from "effect/Layer"
import * as TestClock from "effect/testing/TestClock"
import { describeFeature } from "../src/describeFeature.ts"
import { assert, describe, it, vi } from "../src/EffectVitest.ts"

// Real source, parsed by the real parser — this file's own inline-Feature convention, the same one
// `emission.test.ts` and `describeFeature.test.ts` use for a non-acceptance, throwaway-fixture
// `describeFeature` call.
const feature = Effect.runSync(
  parseFeature(
    `Feature: vi's fake timers against Effect's own clocks

  Scenario: vi.useFakeTimers, installed in a Before hook, stalls TestClock.adjust until vi's own fake clock is flushed
    When a step forks a TestClock-backed sleep and then forks TestClock.adjust past it
    Then the adjust fork stays pending until vi.runAllTimersAsync flushes vi's fake clock, and only then does the sleep settle

  Scenario: vi.setSystemTime moves Date.now but never the ambient TestClock's own currentTimeMillis
    When a step points vi's fake system clock at a fixed date far from the TestClock's epoch
    Then Date.now reads vi's fake date while Clock.currentTimeMillis still reads the TestClock's own zero
`,
    "test/fake-timers.feature"
  ).pipe(Effect.provide(ParameterTypeStore.Default))
)

// Scenario 1's recorded outcomes — read by its own `Then`, written by its own `When`; the same
// "record in When, assert in Then" split `emission.test.ts` uses throughout.
let adjustPendingBeforeFlush: boolean | undefined
let adjustSettledAfterFlush: boolean | undefined
let sleepSettledOnceAdjustJoined: boolean | undefined

// Scenario 2's recorded outcomes.
let systemTimeAfterFakeDate: number | undefined
let clockMillisAfterFakeDate: number | undefined

// THE CALL UNDER TEST.
describeFeature(feature, Layer.empty, ({ After, Before, Then, When }) => {
  // Installed as a Before HOOK rather than inline in a step body — the realistic shape of a suite
  // that reaches for fake timers (usually in a `beforeEach`), and exactly the shape this repository
  // had zero coverage of before this file: fake timers from a HOOK, real Effect.sleep/TestClock
  // work from a STEP, composing inside one running Scenario.
  Before(function*() {
    vi.useFakeTimers()
    yield* Effect.void
  })

  // Restored in an After hook so a fake clock installed by one Scenario can never leak into its
  // sibling Scenario below, or into another test file sharing this worker.
  After(function*() {
    vi.useRealTimers()
    yield* Effect.void
  })

  When(
    "a step forks a TestClock-backed sleep and then forks TestClock.adjust past it",
    function*() {
      const sleepFiber = yield* Effect.forkChild(Effect.sleep("1 second"), { startImmediately: true })
      // Unsurprising on its own: nothing has advanced the TestClock yet.
      assert.isUndefined(sleepFiber.pollUnsafe())

      // Forked rather than `yield*`'d directly, so a stuck `adjust` cannot hang THIS test — polled
      // non-blockingly instead, the identical technique `Testing.ts`'s own `settleThroughClock`
      // uses via `fiber.pollUnsafe()` (this `effect` rc line ships no Effect-returning,
      // non-blocking poll).
      const adjustFiber = yield* Effect.forkChild(TestClock.adjust("1 second"), { startImmediately: true })

      // THE surprising assertion, and the reason this file exists: `TestClock.adjust("1 second")`
      // looks like a small, synchronous-shaped state mutation with nothing left to await — and yet
      // it is STILL PENDING here, purely because vi's fake timers are installed and unadvanced. See
      // this file's own header comment for exactly which internal `Effect.yieldNow` this trips.
      adjustPendingBeforeFlush = adjustFiber.pollUnsafe() === undefined

      // The fix is NOT another `TestClock.adjust` (that is the very call that is stuck) and NOT
      // `vi.advanceTimersByTimeAsync` with a finite duration (tried while writing this file; it did
      // not reliably reach the pending `setImmediate` callback) — only flushing vi's OWN fake clock
      // unblocks Effect's scheduler dispatch underneath `TestClock.adjust`.
      yield* Effect.promise(() => vi.runAllTimersAsync())

      adjustSettledAfterFlush = adjustFiber.pollUnsafe() !== undefined
      yield* Fiber.join(adjustFiber)

      // NOW the sleep it was meant to release settles too — the adjust it was stuck behind has
      // finally run its course.
      yield* Fiber.join(sleepFiber)
      sleepSettledOnceAdjustJoined = sleepFiber.pollUnsafe() !== undefined
    }
  )

  Then(
    "the adjust fork stays pending until vi.runAllTimersAsync flushes vi's fake clock, and only then does the sleep settle",
    function*() {
      yield* Effect.void
      assert.isTrue(adjustPendingBeforeFlush, "TestClock.adjust should still have been pending before the flush")
      assert.isTrue(adjustSettledAfterFlush, "TestClock.adjust should have settled once vi's fake clock was flushed")
      assert.isTrue(sleepSettledOnceAdjustJoined, "the sleep TestClock.adjust was meant to release should be done too")
    }
  )

  When(
    "a step points vi's fake system clock at a fixed date far from the TestClock's epoch",
    function*() {
      // A date nowhere near the TestClock's own epoch-0 start, so a coincidental match could never
      // hide the divergence this Scenario exists to prove.
      vi.setSystemTime(new Date("2030-01-01T00:00:00.000Z"))
      systemTimeAfterFakeDate = Date.now()
      clockMillisAfterFakeDate = yield* Clock.currentTimeMillis
    }
  )

  Then(
    "Date.now reads vi's fake date while Clock.currentTimeMillis still reads the TestClock's own zero",
    function*() {
      yield* Effect.void
      // `vi.setSystemTime` reached the real global `Date` ...
      assert.strictEqual(systemTimeAfterFakeDate, Date.parse("2030-01-01T00:00:00.000Z"))
      // ... but the ambient TestClock (`it.effect`'s own `TestClock.layer()`) never reads `Date` to
      // seed or advance itself, so it is still sitting at its own epoch-0 start.
      assert.strictEqual(clockMillisAfterFakeDate, 0)
      assert.notStrictEqual(systemTimeAfterFakeDate, clockMillisAfterFakeDate)
    }
  )
})

// For CONTRAST with the Scenario above: outside any TestClock, vi's fake timers drive Effect.sleep
// the "obvious" way, with none of the hidden `Effect.yieldNow` detour `TestClock.adjust` has.
describe("outside a TestClock (it.live's real Clock), vi's fake timers drive Effect.sleep directly", () => {
  it.live(
    "a plain Effect.sleep under it.live is released by advanceTimersByTimeAsync alone, no runAllTimersAsync needed",
    () =>
      Effect.gen(function*() {
        vi.useFakeTimers()
        try {
          const fiber = yield* Effect.forkChild(Effect.sleep("1 second"), { startImmediately: true })
          assert.isUndefined(fiber.pollUnsafe())

          // `it.live` keeps the REAL `Clock` (`EffectVitestInternal.ts`'s
          // `live: makeTester<Scope.Scope>(Effect.scoped, it)` — no `TestClock.layer()` anywhere in
          // its pipeline), and the real `Clock`'s own `sleep` (`effect/internal/effect.ts`'s
          // `ClockImpl.sleepMillis`) is a bare `setTimeout` call. Advancing vi's fake clock by the
          // sleep's own duration is enough on its own — unlike `TestClock.adjust` above, there is no
          // separate internal `Effect.yieldNow` standing in front of it.
          yield* Effect.promise(() => vi.advanceTimersByTimeAsync(1_000))

          yield* Fiber.join(fiber)
          assert.isDefined(fiber.pollUnsafe())
        } finally {
          // A plain `it.live` test has no framework `After` hook to restore this — the try/finally
          // here is what stands in for it.
          vi.useRealTimers()
        }
      })
  )
})

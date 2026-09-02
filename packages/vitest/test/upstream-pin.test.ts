/**
 * Pins the `@effect/vitest` and vitest behaviours the runtime relies on (F-23), the way
 * `packages/gherkin/test/upstream-pin.test.ts` pins `@cucumber/*`.
 */
import { afterAll, assert, beforeAll, describe, it, layer, type Vitest } from "@effect/vitest"
import * as Cause from "effect/Cause"
import * as Clock from "effect/Clock"
import * as Context from "effect/Context"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Layer from "effect/Layer"
import * as Scope from "effect/Scope"
import * as TestClock from "effect/testing/TestClock"
import * as TestConsole from "effect/testing/TestConsole"
import { testEnv } from "../src/VitestTestApi.ts"

class Probe extends Context.Service<Probe, {
  readonly buildOrdinal: number
  readonly builtAtMillis: number
}>()("upstream-pin/Probe") {}

let probeBuilds = 0
const probeLayer: Layer.Layer<Probe, never, never> = Layer.effect(
  Probe,
  Effect.gen(function*() {
    probeBuilds += 1
    return Probe.of({ buildOrdinal: probeBuilds, builtAtMillis: yield* Clock.currentTimeMillis })
  })
)

// Live-clock reads are far past 2001-09-09 (1e12 ms); a TestClock starts at 0.
const looksLikeWallClock = (millis: number): boolean => millis > 1_000_000_000_000

describe("@effect/vitest facts VitestTestApi.ts relies on", { shuffle: false }, () => {
  describe("the named layer(...) form", () => {
    let handed: Vitest.MethodsNonLive<Probe> | null = null
    let observedInsideCallback: Record<string, boolean> = {}

    layer(probeLayer, { excludeTestServices: true })("opens a block named after its argument", (methods) => {
      handed = methods
      observedInsideCallback = {
        effect: typeof methods.effect === "function",
        live: "live" in methods
      }
      methods.effect(
        "builds the shared tier ONCE and on the LIVE clock (excludeTestServices)",
        () =>
          Effect.gen(function*() {
            const probe = yield* Probe
            assert.strictEqual(probe.buildOrdinal, 1)
            assert.strictEqual(looksLikeWallClock(probe.builtAtMillis), true)
          })
      )
      methods.effect(
        "gives the test BODY the live clock too — testEnv is the library's to provide",
        () =>
          Effect.gen(function*() {
            assert.strictEqual(looksLikeWallClock(yield* Clock.currentTimeMillis), true)
          })
      )
      methods.effect("hands back a MethodsNonLive: `effect` yes, `live` no", () =>
        Effect.sync(() => {
          assert.deepStrictEqual(observedInsideCallback, { effect: true, live: false })
          assert.isNotNull(handed)
        }))
    })
  })

  it("the layer callback ran synchronously during collection, before any test body", () => {
    assert.isAtMost(probeBuilds, 1)
  })
})

describe("sequence-hooks", { shuffle: false }, () => {
  const order: Array<string> = []
  describe("inner", () => {
    afterAll(() => {
      order.push("a")
    })
    afterAll(() => {
      order.push("b")
    })
    it("runs", () => {
      assert.deepStrictEqual(order, [])
    })
  })
  describe("outer observer, declared after inner and unshuffled by the parent", () => {
    it("saw inner's afterAll hooks run in REVERSE registration order", () => {
      assert.deepStrictEqual(order, ["b", "a"])
    })
  })
})

describe("testEnv (VitestTestApi.ts) provides what it.effect provides", () => {
  it.effect("it.effect supplies a TestClock and a TestConsole", () =>
    Effect.gen(function*() {
      yield* TestClock.adjust("1 second")
      assert.strictEqual(yield* Clock.currentTimeMillis, 1000)
      yield* Effect.log("hello")
      const lines = yield* TestConsole.logLines
      assert.isAbove(lines.length, 0)
    }))

  it("Effect.provide(testEnv) supplies a fresh TestClock and TestConsole to a bare Effect", async () => {
    const millis = await Effect.runPromise(
      Effect.gen(function*() {
        yield* TestClock.adjust("2 seconds")
        yield* Effect.log("captured")
        const lines = yield* TestConsole.logLines
        assert.isAbove(lines.length, 0)
        assert.include(JSON.stringify(lines), "captured")
        return yield* Clock.currentTimeMillis
      }).pipe(Effect.provide(testEnv), Effect.scoped)
    )
    assert.strictEqual(millis, 2000)
  })
})

describe("a shared Layer that FAILS is a defect, not a typed failure (describeFeature.ts note (f))", () => {
  class Boom extends Data.TaggedError("Boom")<{ readonly message: string }> {}
  class Failing extends Context.Service<Failing, { readonly ok: boolean }>()("upstream-pin/Failing") {}
  const failing: Layer.Layer<Failing, Boom, never> = Layer.effect(
    Failing,
    Effect.fail(new Boom({ message: "shared tier refused to build" }))
  )
  let scope: Scope.Closeable | null = null
  let outcome: "defect" | "failure" | "success" = "success"

  beforeAll(async () => {
    // Build the way the framework builds a shared tier: memoised, then `Effect.orDie`.
    scope = Scope.makeUnsafe()
    const exit = await Effect.runPromiseExit(
      Layer.buildWithMemoMap(failing, Layer.makeMemoMapUnsafe(), scope).pipe(Effect.orDie)
    )
    outcome = Exit.isSuccess(exit) ? "success" : Cause.hasDies(exit.cause) ? "defect" : "failure"
  })
  afterAll(async () => {
    if (scope !== null) await Effect.runPromise(Scope.close(scope, Effect.runSync(Effect.exit(Effect.void))))
  })
  it("Effect.orDie turns the typed Layer failure into a Die", () => {
    assert.strictEqual(outcome, "defect")
  })
})

describe("the module-level `effect` accepts a Scope-only body (TestApi.ts note)", () => {
  it.effect("a self typed () => Effect<void, never, Scope.Scope> is accepted", () =>
    Effect.gen(function*() {
      yield* Effect.addFinalizer(() => Effect.void)
      assert.strictEqual(true, true)
    }))
})

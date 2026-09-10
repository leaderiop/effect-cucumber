/**
 * `EffectVitestInternal.ts`'s `layer(...)` (vendored, ADR-EC-059) is exercised elsewhere only
 * through its simplest shape — a single bare `layer(Layer)(it => {...})` block with one test and no
 * options. This file targets the branches that shape never reaches: the named/`describe`-wrapped
 * form, `concurrent`/`excludeTestServices`/`timeout` options, a nested `it.layer(...)` call, a
 * numeric third `timeout` argument on `it.effect`, and `makeItProxy`'s fallthrough for a vitest
 * method this package never overrides.
 */
import * as Context from "effect/Context"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { assert, describe, it, layer } from "../src/EffectVitest.ts"

class Greeting extends Context.Service<Greeting, string>()("Greeting") {
  static readonly layer = Layer.succeed(Greeting, "hello")
}

class Volume extends Context.Service<Volume, number>()("Volume") {
  static readonly layer = Layer.succeed(Volume, 11)
}

describe("layer(...) — bare form, alongside a sibling bare layer() block", () => {
  // Two adjacent bare-form `layer()` calls in the same suite: each attaches its own module-scoped
  // `beforeEach`, so when vitest fires the OTHER block's hook for THIS block's task, the
  // `!blockTaskSet.has(ctx.task)` guard must actually skip it rather than double-provision context.
  layer(Greeting.layer)((scopedIt) => {
    scopedIt.effect("resolves its own layer's service", () =>
      Effect.gen(function*() {
        const greeting = yield* Greeting
        assert.strictEqual(greeting, "hello")
      }))
  })

  layer(Volume.layer)((scopedIt) => {
    scopedIt.effect(
      "resolves its OWN layer's service, unaffected by the sibling block above",
      () =>
        Effect.gen(function*() {
          const volume = yield* Volume
          assert.strictEqual(volume, 11)
        })
    )
  })
})

layer(Greeting.layer, { concurrent: true })("layer(...) — named form, concurrent option", (scopedIt) => {
  scopedIt.effect("resolves the service exactly as the bare form does", () =>
    Effect.gen(function*() {
      const greeting = yield* Greeting
      assert.strictEqual(greeting, "hello")
    }))

  scopedIt.layer(Volume.layer)("nested it.layer(...)", (nestedIt) => {
    nestedIt.effect("resolves BOTH the outer and the nested layer's service", () =>
      Effect.gen(function*() {
        const greeting = yield* Greeting
        const volume = yield* Volume
        assert.strictEqual(greeting, "hello")
        assert.strictEqual(volume, 11)
      }))
  })
})

layer(Greeting.layer, { excludeTestServices: true, timeout: Duration.seconds(5) })(
  "layer(...) — excludeTestServices and an explicit hook timeout",
  (scopedIt) => {
    scopedIt.effect("still resolves its own layer's service", () =>
      Effect.gen(function*() {
        const greeting = yield* Greeting
        assert.strictEqual(greeting, "hello")
      }))
  }
)

describe("it.effect(...) — a numeric third argument is a millisecond timeout, not an options object", () => {
  it.effect("succeeds well within a generous numeric timeout", () => Effect.succeed(undefined), 5000)
})

describe("the base `it` export — a vitest method this package never overrides falls through the proxy", () => {
  // `it.skip`/`it.todo`/etc. are NOT among `makeItProxy`'s overrides ({ effect, live, flakyTest,
  // layer }) — accessing one proves the proxy's `get` trap actually reaches its `Reflect.get`
  // fallthrough, not just its `Object.hasOwn` override path every other test in this suite exercises.
  it.skip("never runs — exists only to exercise makeItProxy's non-overridden fallthrough", () => {})
})

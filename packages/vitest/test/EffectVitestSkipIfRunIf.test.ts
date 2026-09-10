/**
 * Coverage for `Tester.skipIf`/`Tester.runIf` (`internal.skipIf`/`internal.runIf` in
 * `EffectVitestInternal.ts`) -- implemented since day one but never invoked by any test before
 * this file:
 *
 *   const skipIf: Vitest.Tester<R>["skipIf"] = (condition) => (name, self, timeout) =>
 *     it.skipIf(condition)(name, testOptions(timeout), (ctx) => run(ctx, [ctx], self))
 *
 *   const runIf: Vitest.Tester<R>["runIf"] = (condition) => (name, self, timeout) =>
 *     it.runIf(condition)(name, testOptions(timeout), (ctx) => run(ctx, [ctx], self))
 *
 * Both are one-line forwards onto vitest's own `it.skipIf`/`it.runIf`, but a wrapper this thin is
 * exactly where an inverted condition (`!condition`), a swapped implementation (`skipIf` built on
 * `it.runIf` or vice versa), or an always-skip/always-run regression would slip in silently --
 * every such mistake still type-checks, since `condition` is `unknown` and the wrapped Effect body
 * is never inspected by the compiler either way.
 *
 * Exercised via `it.effect.skipIf`/`it.effect.runIf`, the public barrel's Effect-aware Tester
 * surface (`EffectVitest.ts`'s `it.effect`), with each of the four condition/method combinations
 * recording into a shared `seen` array. The final `it(...)` below runs LAST in declaration order
 * (`{ shuffle: false }`, the same guard `EffectVitestEach.test.ts` relies on) and asserts exactly
 * which bodies actually ran -- real vitest's own skip/run decision, not a simulated one. This is
 * the only way to catch a plumbing regression that would still report every test as "passed" or
 * "skipped" without saying which one, or where.
 */
import * as Effect from "effect/Effect"
import { assert, describe, it } from "../src/EffectVitest.ts"

const seen: Array<string> = []

describe("it.effect.skipIf/.runIf actually skip or run their body", { shuffle: false }, () => {
  it.effect.skipIf(true)("skipIf(true) -- must NOT run", () =>
    Effect.sync(() => {
      seen.push("skipIf(true)")
    }))

  it.effect.skipIf(false)("skipIf(false) -- must run", () =>
    Effect.sync(() => {
      seen.push("skipIf(false)")
    }))

  it.effect.runIf(true)("runIf(true) -- must run", () =>
    Effect.sync(() => {
      seen.push("runIf(true)")
    }))

  it.effect.runIf(false)("runIf(false) -- must NOT run", () =>
    Effect.sync(() => {
      seen.push("runIf(false)")
    }))

  it("ran exactly the scenarios skipIf/runIf should let through, in declaration order", () => {
    assert.deepStrictEqual(seen, ["skipIf(false)", "runIf(true)"])
  })
})

/**
 * Coverage for `Tester.each` (`internal.each` in `EffectVitestInternal.ts`) — the one method on
 * the vendored `Vitest.Tester` that no test anywhere in this repository called before this file.
 * It is built directly on vitest's own `it.for`:
 *
 *   const each: Vitest.Tester<R>["each"] = (cases) => (name, self, timeout) =>
 *     it.for(cases)(name, testOptions(timeout), (args, ctx) => run(ctx, [args], self) as any)
 *
 * so a regression in either half — this wrapper wrapping `self`'s per-case arg in `[args]` before
 * spreading it back out inside `run`, or vitest's own `it.for(cases)` calling its callback with
 * `(arg, ctx)` where `arg` is the WHOLE per-case value (never spread, per
 * `@vitest/runner`'s `TestForFunctionReturn`) — would go undetected.
 *
 * Exercised via `it.effect.each`, the public barrel's Effect-aware Tester (`EffectVitest.ts`'s
 * `it.effect`, which is `internal.makeTester` closed over `flow(Effect.scoped,
 * Effect.provide(TestEnv))`), so the same run also proves `.each` threads each case's Effect body
 * through that same `mapEffect` — a fresh `TestClock`/`TestConsole` per case — rather than bypassing
 * it with a bare vitest callback.
 */
import * as Clock from "effect/Clock"
import * as Effect from "effect/Effect"
import * as TestClock from "effect/testing/TestClock"
import { assert, describe, it } from "../src/EffectVitest.ts"

interface Case {
  readonly label: string
  readonly adjustSeconds: number
  readonly expectedMillis: number
}

// Three cases with DISTINCT `adjustSeconds`/`expectedMillis` pairs: a wrapper that dropped the
// per-case arg (e.g. always forwarding `cases[0]`, or the whole `cases` array, to every run) would
// make at least two of these disagree with the `TestClock` reading taken inside their own case.
const cases: ReadonlyArray<Case> = [
  { label: "one second", adjustSeconds: 1, expectedMillis: 1000 },
  { label: "three seconds", adjustSeconds: 3, expectedMillis: 3000 },
  { label: "zero seconds", adjustSeconds: 0, expectedMillis: 0 }
]

const seen: Array<Case> = []

describe("it.effect.each runs every case with its own arg and its own Effect context", { shuffle: false }, () => {
  it.effect.each(cases)("$label", (...args) =>
    Effect.gen(function*() {
      // THE load-bearing shape assertion: exactly one positional arg (the case object itself),
      // never the tuple-spread `it.each` would have produced and never `[args]`'s outer array
      // leaking through unwrapped.
      assert.strictEqual(args.length, 1)
      // `@effect/vitest`'s own `each` types the callback's rest args as `Array<T>`, not a `[T]`
      // tuple, so TypeScript can't narrow `args[0]` past `T | undefined` on its own — the
      // `assert.strictEqual(args.length, 1)` above is the real runtime proof of exactly one arg.
      const item = args[0]!
      assert.include(cases, item)
      seen.push(item)

      // The Effect context: a case-fresh `TestClock`, provided the same way plain `it.effect` does
      // (ADR-EC-059) — starts at 0 regardless of which case ran before it, so this also proves no
      // case's clock state leaks into the next case's.
      assert.strictEqual(yield* Clock.currentTimeMillis, 0)
      yield* TestClock.adjust(`${item.adjustSeconds} seconds`)
      assert.strictEqual(yield* Clock.currentTimeMillis, item.expectedMillis)
    }))

  it("ran every case exactly once, in declaration order", () => {
    assert.deepStrictEqual(seen, cases)
  })
})

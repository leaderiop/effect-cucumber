/**
 * `it.effect` for this package's own test suite, plus a `export * from "vitest"` passthrough so
 * every test file imports `assert`/`describe`/`expect`/`it`/`vi`/etc. from this ONE module —
 * `@effect-cucumber/gherkin`'s tests cannot depend on `@effect-cucumber/vitest` for this (that
 * package depends on `@effect-cucumber/gherkin`, not the reverse), so this is a SECOND,
 * independently-trimmed vendor of the same upstream source `packages/vitest/src/
 * EffectVitestInternal.ts` vendors — see that file's own header for the full attribution,
 * commit SHA, and license (MIT, Effect-TS/effect). ADR-EC-059 records why both copies exist.
 *
 * The single-module-source requirement is not style: oxlint's `vitest/no-standalone-expect`
 * cannot see through a call to a locally-wrapped `it` re-exported from a DIFFERENT module than
 * `expect` came from, and flags every `expect(...)` in the file as unnested even when it plainly
 * sits inside `it(...)` — importing everything from here, one specifier, keeps the rule able to
 * trace the nesting (verified against this exact failure while vendoring).
 *
 * TRIMMED relative to `EffectVitestInternal.ts`: this package's test suite only ever calls bare
 * `it(...)` (plain vitest) and `it.effect(...)` — never `.live`, `.layer(...)`, `.flakyTest`, or
 * `.prop` (verified: `grep` across `packages/gherkin/test` at vendoring time). Only the `.effect`
 * tester and the `makeItProxy` wrapper that lets the SAME `it` still work as plain vitest `it` are
 * kept. If a future gherkin test needs `.live`/`.layer`/`.flakyTest`, re-derive it from
 * `EffectVitestInternal.ts` rather than hand-rolling a third variant.
 *
 * RE-SYNCING: see `EffectVitestInternal.ts`'s own header — the same guidance applies here.
 */
import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import { flow, pipe } from "effect/Function"
import * as Layer from "effect/Layer"
import type * as Scope from "effect/Scope"
import * as TestClock from "effect/testing/TestClock"
import * as TestConsole from "effect/testing/TestConsole"
import * as V from "vitest"

const TestEnv = Layer.mergeAll(TestConsole.layer, TestClock.layer())

const runPromise: <E, A>(
  _: Effect.Effect<A, E, never>,
  ctx?: V.TestContext | undefined
) => Promise<A> = Effect.fnUntraced(function*<E, A>(effect: Effect.Effect<A, E>, _ctx?: V.TestContext) {
  const exit = yield* Effect.exit(effect)
  if (Exit.isFailure(exit)) {
    const errors = Cause.prettyErrors(exit.cause)
    for (let i = 0; i < errors.length; i++) {
      yield* Effect.logError(errors[i])
    }
  }
  return yield* exit
}, (effect, _, ctx) => Effect.runPromise(effect, { signal: ctx?.signal }))

const runTest = (ctx?: V.TestContext) => <E, A>(effect: Effect.Effect<A, E>) => runPromise(effect, ctx)

const testOptions = (timeout?: number | V.TestOptions) => typeof timeout === "number" ? { timeout } : timeout ?? {}

interface EffectTestFunction<A, E, R> {
  (ctx: V.TestContext): Effect.Effect<A, E, R>
}

interface EffectTest<R> {
  <A, E>(name: string, self: EffectTestFunction<A, E, R>, timeout?: number | V.TestOptions): void
}

interface EffectTester<R> extends EffectTest<R> {
  skip: EffectTest<R>
  skipIf: (condition: unknown) => EffectTest<R>
  runIf: (condition: unknown) => EffectTest<R>
  only: EffectTest<R>
  fails: EffectTest<R>
}

const makeTester = <R>(
  mapEffect: <A, E>(self: Effect.Effect<A, E, R>) => Effect.Effect<A, E, never>
): EffectTester<R> => {
  const run = <A, E>(ctx: V.TestContext, self: EffectTestFunction<A, E, R>) =>
    pipe(Effect.suspend(() => self(ctx)), mapEffect, runTest(ctx))

  const f: EffectTest<R> = (name, self, timeout) => V.it(name, testOptions(timeout), (ctx) => run(ctx, self))
  const skip: EffectTester<R>["only"] = (name, self, timeout) =>
    V.it.skip(name, testOptions(timeout), (ctx) => run(ctx, self))
  const skipIf: EffectTester<R>["skipIf"] = (condition) => (name, self, timeout) =>
    V.it.skipIf(condition)(name, testOptions(timeout), (ctx) => run(ctx, self))
  const runIf: EffectTester<R>["runIf"] = (condition) => (name, self, timeout) =>
    V.it.runIf(condition)(name, testOptions(timeout), (ctx) => run(ctx, self))
  const only: EffectTester<R>["only"] = (name, self, timeout) =>
    V.it.only(name, testOptions(timeout), (ctx) => run(ctx, self))
  const fails: EffectTester<R>["fails"] = (name, self, timeout) =>
    V.it.fails(name, testOptions(timeout), (ctx) => run(ctx, self))

  return Object.assign(f, { skip, skipIf, runIf, only, fails })
}

const makeItProxy = <Methods extends object>(
  it: V.TestAPI,
  overrides: Methods
): Methods & V.TestAPI =>
  new Proxy(it as Methods & V.TestAPI, {
    apply(target, thisArg, argArray) {
      return Reflect.apply(target, thisArg, argArray)
    },
    get(target, property, receiver) {
      if (Object.hasOwn(overrides, property)) {
        return Reflect.get(overrides, property)
      }
      // do not bind: binding would strip vitest's static helpers (e.g. `describe.each`)
      return Reflect.get(target, property, receiver)
    }
  })

/**
 * Every other vitest export (`assert`, `describe`, `expect`, `vi`, …) this package's test suite
 * needs — re-exported so a test file imports everything from this one module (see the module doc
 * comment's oxlint note). Shadowed below by this file's own `it`.
 */
export * from "vitest"

/**
 * The `it` this package's test suite imports in place of `@effect/vitest`'s: bare `it(...)`
 * behaves exactly like vitest's own (skip/only/each/… all pass straight through the Proxy);
 * `it.effect(...)` additionally provides a fresh, per-test `TestClock`/`TestConsole` and runs the
 * returned Effect to a Promise.
 */
export const it: V.TestAPI & { readonly effect: EffectTester<Scope.Scope> } = makeItProxy(V.it, {
  effect: makeTester<Scope.Scope>(flow(Effect.scoped, Effect.provide(TestEnv)))
})

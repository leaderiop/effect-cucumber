/**
 * Vendored from `@effect-ts/effect`'s own `@effect/vitest` package
 * (https://github.com/Effect-TS/effect/blob/5a802043984727b0c5a291af39d1b9bbfa8d7b8b/packages/vitest/src/internal/internal.ts),
 * commit `5a802043984727b0c5a291af39d1b9bbfa8d7b8b` — MIT License, Copyright (c) 2023-present
 * Effectful Technologies Inc. See `EffectVitest.ts`'s own header for WHY this is vendored rather
 * than depended on.
 *
 * TRIMMED relative to upstream: the `prop` property-based-testing feature (and every helper that
 * exists only to support it — `makeArbitrary`, `compileArbitraryInput`, `normalizeProperty`,
 * `runCheck`, `checkOptions`, `propertyTestOptions`, and the `PropertyTimeout`/`ArbitraryInput`/
 * `Arbitraries` types) is REMOVED, not merely unexported. `@effect-cucumber/vitest` never surfaced
 * `prop`, and upstream's own implementation imports `effect/unstable/arbitrary/Arbitrary` — a
 * subpath this repo's pinned `effect@4.0.0-rc.112` (ADR-EC-012) does not export at all (verified:
 * absent from that exact version's `dist/unstable/`). Keeping `prop` would have made this module
 * fail to resolve, for a feature nothing here ever called. Everything else below is unchanged from
 * upstream, including the `layer(...)` `concurrent` option upstream added for its own vitest 5
 * migration (`e9915d5d7a13c2abab99eea4603bfb945d6090b7`, "Upgrade Vitest integrations to version
 * 5") — except the nested `layer<R2, E2>(nestedLayer, options)` method's own `options` parameter,
 * renamed to `nestedOptions`: upstream's identical name shadows the outer `layer` function's own
 * `options`, which this repo's `eslint(no-shadow)` (via oxlint) rejects. Cosmetic only — same
 * behavior, same spread into the recursive `layer(...)` call below it. Upstream's own exported
 * `TestContext` type alias (`TestConsole.TestConsole | TestClock.TestClock`) is dropped too —
 * `knip` confirmed it has zero consumers anywhere in this file or `EffectVitest.ts`, and upstream's
 * own `index.ts` never imports it either: every `TestContext` reference in this file is the vitest
 * TEST-RUNTIME object (`V.TestContext`, from the `V` import below), an unrelated type that only
 * happens to share the name.
 *
 * Also split from upstream's own two-file layout (`index.ts` + `internal/internal.ts`) into
 * THREE: the `Vitest` namespace this file types its exports against now lives in
 * `EffectVitestTypes.ts`, imported from here AND from `EffectVitest.ts` — neither of those two
 * imports the other, only `EffectVitestTypes.ts`, keeping every package's `src` tree acyclic. See
 * `EffectVitestTypes.ts`'s own header for why upstream's single-file mutual reference had to be
 * broken up at all.
 */

import * as Cause from "effect/Cause"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import { flow, pipe } from "effect/Function"
import * as Layer from "effect/Layer"
import * as Schedule from "effect/Schedule"
import * as Scope from "effect/Scope"
import * as TestClock from "effect/testing/TestClock"
import * as TestConsole from "effect/testing/TestConsole"
import * as V from "vitest"
import type { Vitest } from "./EffectVitestTypes.ts"

const getCurrentSuite = V.TestRunner.getCurrentSuite

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

/** @internal */
const runTest = (ctx?: V.TestContext) => <E, A>(effect: Effect.Effect<A, E>) => runPromise(effect, ctx)

const TestEnv = Layer.mergeAll(TestConsole.layer, TestClock.layer())

/** @internal */
export const addEqualityTesters = () => {
  V.expect.addEqualityTesters([])
}

/** @internal */
const testOptions = (timeout?: number | V.TestOptions) => typeof timeout === "number" ? { timeout } : timeout ?? {}

const hookTimeout = (timeout?: Duration.Input) =>
  timeout === undefined ? undefined : Duration.toMillis(Duration.fromInputUnsafe(timeout))

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

type CollectedTask = {
  readonly type: string
  readonly mode?: string
  readonly tasks?: ReadonlyArray<CollectedTask>
}

const collectTasks = (tasks: ReadonlyArray<CollectedTask>, acc: Array<V.TestContext["task"]> = []) => {
  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i]!
    if (task.type === "test" && task.mode !== "skip" && task.mode !== "todo") {
      acc.push(task as V.TestContext["task"])
    } else if (task.tasks !== undefined) {
      collectTasks(task.tasks, acc)
    }
  }
  return acc
}

/** @internal */
const makeTester = <R>(
  mapEffect: <A, E>(self: Effect.Effect<A, E, R>) => Effect.Effect<A, E, never>,
  it: V.TestAPI = V.it
): Vitest.Tester<R> => {
  const run = <A, E, TestArgs extends Array<unknown>>(
    ctx: V.TestContext & object,
    args: TestArgs,
    self: Vitest.TestFunction<A, E, R, TestArgs>
  ) => pipe(Effect.suspend(() => self(...args)), mapEffect, runTest(ctx))

  const f: Vitest.Test<R> = (name, self, timeout) => it(name, testOptions(timeout), (ctx) => run(ctx, [ctx], self))

  const skip: Vitest.Tester<R>["only"] = (name, self, timeout) =>
    it.skip(name, testOptions(timeout), (ctx) => run(ctx, [ctx], self))

  const skipIf: Vitest.Tester<R>["skipIf"] = (condition) => (name, self, timeout) =>
    it.skipIf(condition)(name, testOptions(timeout), (ctx) => run(ctx, [ctx], self))

  const runIf: Vitest.Tester<R>["runIf"] = (condition) => (name, self, timeout) =>
    it.runIf(condition)(name, testOptions(timeout), (ctx) => run(ctx, [ctx], self))

  const only: Vitest.Tester<R>["only"] = (name, self, timeout) =>
    it.only(name, testOptions(timeout), (ctx) => run(ctx, [ctx], self))

  const each: Vitest.Tester<R>["each"] = (cases) => (name, self, timeout) =>
    it.for(cases)(
      name,
      testOptions(timeout),
      (args, ctx) => run(ctx, [args], self) as any
    )

  const fails: Vitest.Tester<R>["fails"] = (name, self, timeout) =>
    V.it.fails(name, testOptions(timeout), (ctx) => run(ctx, [ctx], self))

  return Object.assign(f, { skip, skipIf, runIf, only, each, fails })
}

/** @internal */
export const layer = <R, E>(
  layer_: Layer.Layer<R, E>,
  options?: {
    readonly concurrent?: boolean
    readonly memoMap?: Layer.MemoMap
    readonly timeout?: Duration.Input
    readonly excludeTestServices?: boolean
  }
): {
  (f: (it: Vitest.MethodsNonLive<R>) => void): void
  (
    name: string,
    f: (it: Vitest.MethodsNonLive<R>) => void
  ): void
} =>
(
  ...args: [
    name: string,
    f: (
      it: Vitest.MethodsNonLive<R>
    ) => void
  ] | [
    f: (it: Vitest.MethodsNonLive<R>) => void
  ]
) => {
  const excludeTestServices = options?.excludeTestServices ?? false
  const withTestEnv = excludeTestServices
    ? layer_ as Layer.Layer<R, E>
    : Layer.provideMerge(layer_, TestEnv)
  const memoMap = options?.memoMap ?? Effect.runSync(Layer.makeMemoMap)
  const scope = Effect.runSync(Scope.make())
  const contextEffect = Layer.buildWithMemoMap(withTestEnv, memoMap, scope).pipe(
    Effect.orDie,
    Effect.cached,
    Effect.runSync
  )
  let closed = false
  const closeScope = (ctx?: V.TestContext) => {
    if (closed) {
      return Promise.resolve()
    }
    closed = true
    return runPromise(Scope.close(scope, Exit.void), ctx)
  }

  const makeIt = (it: V.TestAPI): Vitest.MethodsNonLive<R> =>
    makeItProxy(it, {
      effect: makeTester<R | Scope.Scope>(
        (effect) =>
          Effect.flatMap(contextEffect, (context) =>
            effect.pipe(
              Effect.scoped,
              Effect.provide(context)
            )),
        it
      ),
      flakyTest,
      layer<R2, E2>(nestedLayer: Layer.Layer<R2, E2, R>, nestedOptions?: {
        readonly concurrent?: boolean
        readonly timeout?: Duration.Input
      }) {
        return layer(Layer.provideMerge(nestedLayer, withTestEnv), {
          ...nestedOptions,
          memoMap: Layer.forkMemoMapUnsafe(memoMap),
          excludeTestServices
        })
      }
    })

  if (args.length === 1) {
    const currentSuite = getCurrentSuite()
    const previousTasks = new Set(currentSuite.tasks)

    args[0](makeIt(V.it))

    const blockTasks = collectTasks(
      currentSuite.tasks.filter((task) => !previousTasks.has(task)) as ReadonlyArray<CollectedTask>
    )
    if (blockTasks.length === 0) {
      V.afterAll(() => closeScope(), hookTimeout(options?.timeout))
      return
    }

    const blockTaskSet = new Set(blockTasks)
    let remaining = blockTasks.length

    V.beforeEach(
      (ctx) => {
        if (!blockTaskSet.has(ctx.task)) {
          return
        }
        ctx.onTestFinished(() => {
          remaining--
          if (remaining === 0) {
            return closeScope(ctx)
          }
        })
        return runPromise(Effect.asVoid(contextEffect), ctx)
      },
      hookTimeout(options?.timeout)
    )
    V.afterAll(() => closeScope(), hookTimeout(options?.timeout))
    return
  }

  const suiteOptions = options?.concurrent === undefined ? {} : { concurrent: options.concurrent }
  return V.describe(args[0], suiteOptions, () => {
    V.beforeAll(
      () => runPromise(Effect.asVoid(contextEffect)),
      hookTimeout(options?.timeout)
    )
    V.afterAll(
      () => closeScope(),
      hookTimeout(options?.timeout)
    )
    return args[1](makeIt(V.it))
  })
}

/** @internal */
export const flakyTest = <A, E, R>(
  self: Effect.Effect<A, E, R | Scope.Scope>,
  timeout: Duration.Input = Duration.seconds(30)
) =>
  pipe(
    self,
    Effect.scoped,
    Effect.sandbox,
    Effect.retry(
      pipe(
        Schedule.recurs(10),
        Schedule.while((_) =>
          Effect.succeed(Duration.isLessThanOrEqualTo(
            Duration.fromInputUnsafe(_.elapsed),
            Duration.fromInputUnsafe(timeout)
          ))
        )
      )
    ),
    Effect.orDie
  )

/** @internal */
export const makeMethods = (it: V.TestAPI): Vitest.Methods =>
  makeItProxy(it, {
    effect: makeTester<Scope.Scope>(flow(Effect.scoped, Effect.provide(TestEnv)), it),
    live: makeTester<Scope.Scope>(Effect.scoped, it),
    flakyTest,
    layer
  })

/** @internal */
export const {
  /** @internal */
  effect,
  /** @internal */
  live
} = makeMethods(V.it)

/** @internal */
export const describeWrapped = (name: string, f: (it: Vitest.Methods) => void): V.SuiteCollector =>
  V.describe(name, (it) => f(makeMethods(it)))

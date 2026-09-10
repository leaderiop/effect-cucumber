/**
 * The `Vitest` namespace's type declarations, split out of `EffectVitest.ts` into their own module
 * SOLELY to keep every package's `src` tree acyclic: `EffectVitest.ts` needs `EffectVitestInternal.ts`'s
 * VALUES (`internal.effect`, `internal.layer`, …), and `EffectVitestInternal.ts` needs these
 * TYPES to annotate them — the same mutual reference upstream's single `index.ts` has with its own
 * `internal/internal.ts`, just as a real (type-only) cycle rather than upstream's one-file
 * shortcut. This repo's `no-circular` dependency-cruiser rule (ADR-EC-050) does not carve out
 * type-only edges, so the cycle has to be broken structurally instead: both `EffectVitest.ts` and
 * `EffectVitestInternal.ts` import FROM here, neither imports the other for types, and only
 * `EffectVitest.ts` still imports `EffectVitestInternal.ts` — for its values, one direction only.
 *
 * Vendored from
 * https://github.com/Effect-TS/effect/blob/5a802043984727b0c5a291af39d1b9bbfa8d7b8b/packages/vitest/src/index.ts,
 * commit `5a802043984727b0c5a291af39d1b9bbfa8d7b8b` — MIT License, Copyright (c) 2023-present
 * Effectful Technologies Inc. See `EffectVitest.ts`'s own header for the full WHY-vendored
 * rationale (ADR-EC-059) and the `prop`-trimming note, which applies here too (the removed
 * `Vitest.Arbitraries`/`ArbitraryValue` types lived in this namespace upstream).
 */
import type * as Duration from "effect/Duration"
import type * as Effect from "effect/Effect"
import type * as Layer from "effect/Layer"
import type * as Scope from "effect/Scope"
import type * as V from "vitest"

/**
 * @since 4.0.0
 */
export type API = V.TestAPI<{}>

/**
 * @since 4.0.0
 */
export namespace Vitest {
  /**
   * @since 4.0.0
   */
  export interface TestFunction<A, E, R, TestArgs extends Array<any>> {
    (...args: TestArgs): Effect.Effect<A, E, R>
  }

  /**
   * @since 4.0.0
   */
  export interface Test<R> {
    <A, E>(
      name: string,
      self: TestFunction<A, E, R, [V.TestContext]>,
      timeout?: number | V.TestOptions
    ): void
  }

  /**
   * @since 4.0.0
   */
  export interface Tester<R> extends Vitest.Test<R> {
    skip: Vitest.Test<R>
    skipIf: (condition: unknown) => Vitest.Test<R>
    runIf: (condition: unknown) => Vitest.Test<R>
    only: Vitest.Test<R>
    each: <T>(
      cases: ReadonlyArray<T>
    ) => <A, E>(name: string, self: TestFunction<A, E, R, [T]>, timeout?: number | V.TestOptions) => void
    fails: Vitest.Test<R>
  }

  /**
   * @since 4.0.0
   */
  export interface MethodsNonLive<R = never> extends API {
    readonly effect: Vitest.Tester<R | Scope.Scope>
    readonly flakyTest: <A, E, R2>(
      self: Effect.Effect<A, E, R2 | Scope.Scope>,
      timeout?: Duration.Input
    ) => Effect.Effect<A, never, R2>
    readonly layer: <R2, E>(layer: Layer.Layer<R2, E, R>, options?: {
      readonly concurrent?: boolean
      readonly timeout?: Duration.Input
    }) => {
      (f: (it: Vitest.MethodsNonLive<R | R2>) => void): void
      (
        name: string,
        f: (it: Vitest.MethodsNonLive<R | R2>) => void
      ): void
    }
  }

  /**
   * @since 4.0.0
   */
  export interface Methods<R = never> extends MethodsNonLive<R> {
    readonly live: Vitest.Tester<Scope.Scope | R>
    readonly layer: <R2, E>(layer: Layer.Layer<R2, E, R>, options?: {
      readonly concurrent?: boolean
      readonly memoMap?: Layer.MemoMap
      readonly timeout?: Duration.Input
      readonly excludeTestServices?: boolean
    }) => {
      (f: (it: Vitest.MethodsNonLive<R | R2>) => void): void
      (
        name: string,
        f: (it: Vitest.MethodsNonLive<R | R2>) => void
      ): void
    }
  }
}

/**
 * A vendored, maintained-in-tree replacement for the `@effect/vitest` npm package — re-exported
 * from this package's own public barrel (`index.ts`) so `@effect-cucumber/vitest` consumers no
 * longer install or import `@effect/vitest` themselves, and internally imported by
 * `VitestTestApi.ts`/`Testing.ts` in place of the npm package.
 *
 * WHY THIS EXISTS: this repo tracks vitest 5 (`pnpm-workspace.yaml`'s catalog), but the real
 * `@effect/vitest` package's last published release, `4.0.0-rc.112`, hard-caps its own peer range
 * at `vitest: ">=4.1.0 <5.0.0"`. Upstream (`Effect-TS/effect`) HAS already migrated its `vitest`
 * package's source to vitest 5 on `main` (commit `e9915d5d7a13c2abab99eea4603bfb945d6090b7`,
 * "Upgrade Vitest integrations to version 5") — the diff is tiny, an added optional `concurrent`
 * option on `layer(...)` and a `package.json` peer-range bump — but has not cut a release
 * containing it (verified against the npm registry; the `rc` dist-tag is still `4.0.0-rc.112`,
 * unchanged since 2026-08-25). Rather than block this repo's own vitest 5 upgrade on an upstream
 * release with no committed date, this module, `EffectVitestInternal.ts` and `EffectVitestTypes.ts`
 * vendor that already-migrated source directly (split into three files, not upstream's two, to keep
 * every package's `src` tree acyclic — see `EffectVitestTypes.ts`'s own header). See
 * `spec/decisions/056-vendor-effect-vitest-and-vitest-runner-tag-filter-for-vitest-5.md`.
 *
 * Vendored from
 * https://github.com/Effect-TS/effect/blob/5a802043984727b0c5a291af39d1b9bbfa8d7b8b/packages/vitest/src/index.ts,
 * commit `5a802043984727b0c5a291af39d1b9bbfa8d7b8b` — MIT License, Copyright (c) 2023-present
 * Effectful Technologies Inc.
 *
 * TRIMMED relative to upstream: `prop` (Effect-aware property-based testing over `Schema`/
 * `Arbitrary` inputs) is removed, along with the `Vitest.Arbitraries`/`ArbitraryValue` types that
 * exist only to describe it. `@effect-cucumber/vitest` never surfaced `prop`, and upstream's
 * implementation imports `effect/unstable/arbitrary/Arbitrary` — a subpath this repo's pinned
 * `effect@4.0.0-rc.112` (ADR-EC-012) does not export (verified absent from that exact version's
 * `dist/unstable/`). If this repo's own `effect` pin ever moves to a version that exports it AND a
 * consumer asks for `prop`, re-vendor it from upstream at that point — do not hand-roll it here.
 *
 * RE-SYNCING: when `@effect/vitest` eventually publishes a real vitest-5-compatible release,
 * re-diff this file, `EffectVitestInternal.ts` and `EffectVitestTypes.ts` against upstream's
 * `packages/vitest/src/{index,internal/internal}.ts` at that release's tag, reapply anything that changed since
 * `5a802043984727b0c5a291af39d1b9bbfa8d7b8b`, and consider dropping this vendor copy in favor of
 * the real dependency again (re-adding it as a peer/dev dependency, restoring the consumer-facing
 * install instructions this file's own vendoring replaced).
 */
import type * as Duration from "effect/Duration"
import type * as Effect from "effect/Effect"
import type * as Layer from "effect/Layer"
import type * as Scope from "effect/Scope"
import * as V from "vitest"
import * as internal from "./EffectVitestInternal.ts"
import type { API, Vitest } from "./EffectVitestTypes.ts"

/**
 * @since 4.0.0
 */
export * from "vitest"

/**
 * The `Vitest` namespace and `API` type live in `EffectVitestTypes.ts` (acyclic-imports note in
 * that file's own header) — re-exported here, their one real public home, so nothing outside this
 * module needs to know that split exists.
 *
 * @since 4.0.0
 */
export type { API, Vitest }

/**
 * @since 4.0.0
 */
export const addEqualityTesters: () => void = internal.addEqualityTesters

/**
 * @since 4.0.0
 */
export const effect: Vitest.Tester<Scope.Scope> = internal.effect

/**
 * @since 4.0.0
 */
export const live: Vitest.Tester<Scope.Scope> = internal.live

/**
 * Share a `Layer` between multiple tests, optionally wrapping
 * the tests in a `describe` block if a name is provided.
 *
 * Named layers accept `concurrent` to override inherited suite concurrency.
 * Anonymous layers always inherit the enclosing suite's concurrency.
 * Use `ctx.expect` in concurrent tests for test-local snapshots and assertion counts.
 *
 * @since 4.0.0
 *
 * ```ts
 * import { assert, layer } from "@effect-cucumber/vitest"
 * import { Effect, Layer, Context } from "effect"
 *
 * class Foo extends Context.Service<Foo, "foo">()("Foo") {
 *   static layer = Layer.succeed(Foo, "foo")
 * }
 *
 * class Bar extends Context.Service<Bar, "bar">()("Bar") {
 *   static layer = Layer.effect(
 *     Bar,
 *     Effect.map(Foo, () => "bar" as const)
 *   )
 * }
 *
 * layer(Foo.layer)("layer", (it) => {
 *   it.effect("adds context", () =>
 *     Effect.gen(function*() {
 *       const foo = yield* Foo
 *       assert.strictEqual(foo, "foo")
 *     }))
 *
 *   it.layer(Bar.layer)("nested", (it) => {
 *     it.effect("adds context", () =>
 *       Effect.gen(function*() {
 *         const foo = yield* Foo
 *         const bar = yield* Bar
 *         assert.strictEqual(foo, "foo")
 *         assert.strictEqual(bar, "bar")
 *       }))
 *   })
 * })
 * ```
 */
export const layer: <R, E>(
  layer_: Layer.Layer<R, E>,
  options?: {
    readonly concurrent?: boolean
    readonly memoMap?: Layer.MemoMap
    readonly timeout?: Duration.Input
    readonly excludeTestServices?: boolean
  }
) => {
  (f: (it: Vitest.MethodsNonLive<R>) => void): void
  (name: string, f: (it: Vitest.MethodsNonLive<R>) => void): void
} = internal.layer

/**
 * @since 4.0.0
 */
export const flakyTest: <A, E, R>(
  self: Effect.Effect<A, E, R | Scope.Scope>,
  timeout?: Duration.Input
) => Effect.Effect<A, never, R> = internal.flakyTest

/**
 * @since 4.0.0
 */
export const it: Vitest.Methods = internal.makeMethods(V.it)

/**
 * @since 4.0.0
 */
export const makeMethods: (it: V.TestAPI) => Vitest.Methods = internal.makeMethods

/**
 * @since 4.0.0
 */
export const describeWrapped: (name: string, f: (it: Vitest.Methods) => void) => V.SuiteCollector =
  internal.describeWrapped

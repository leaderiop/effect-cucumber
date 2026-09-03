/**
 * SPIKE — not shipped. A trimmed copy of `packages/vitest/src/VitestTestApi.ts`'s PLAIN path
 * (`vitestTestApi`; the shared-layer path is out of scope for this spike — see the writeup's
 * "shared path" note) with exactly one addition: `Attachments`' LIVE implementation is threaded
 * into the Effect that runs inside `it.effect`, built from the `vitest.TestContext` that
 * `@effect/vitest`'s `it.effect` callback receives as its argument.
 *
 * This is the file allowed to name a framework — same as the real `VitestTestApi.ts` — and it is
 * the ONLY spike file that imports `vitest`/`@effect/vitest`. `TestApi.ts` (copied byte-identical
 * alongside this file) and `Attachments.ts` import neither.
 *
 * The one shape difference from the real file's `effect:` field, side by side:
 *
 *   REAL:  it.effect(name, self, emitOptions)
 *   SPIKE: it.effect(name, (ctx) => self().pipe(Effect.provide(attachmentsLive(ctx))), emitOptions)
 *
 * `self`'s own signature is STILL `() => Effect.Effect<void, unknown, Scope.Scope | Attachments>` —
 * declared only in `TestApi.ts`, never here — and it still names no framework. `Attachments` had to
 * be ADDED to that union (see `TestApi.ts`'s own header for why the naive "leave self at just
 * `Scope.Scope`" version doesn't type-check). The `ctx` capture and the `Effect.provide` that
 * DISCHARGES `Attachments` happen entirely on this side of the seam, the same way `testEnv`
 * (`TestClock`/`TestConsole`) is threaded in below.
 */
import { afterAll, describe, effect as vitestEffect, type TestContext } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as TestClock from "effect/testing/TestClock"
import * as TestConsole from "effect/testing/TestConsole"
import { Attachments } from "./Attachments.ts"
import type { TestApi } from "./TestApi.ts"

/** Identical in shape to the real file's `testEnv` — untouched by this spike. */
export const testEnv = Layer.mergeAll(TestConsole.layer, TestClock.layer())

/**
 * `Attachments`' LIVE implementation, built PER TEST from the `TestContext` vitest hands
 * `it.effect`'s callback — this is the part `testEnv` (a Layer built ONCE, module-level) cannot do,
 * because `TestClock`/`TestConsole` need no per-test value from the framework but `Attachments`
 * needs `ctx.annotate` specifically bound to the test currently running.
 *
 * `data` becomes the annotation's `message`; `contentType` becomes its `type` — the two-argument
 * overload of `context.annotate(message, type?)`, confirmed real and rendered by the DEFAULT
 * reporter's failure panel in `research/vitest-failure-reporter-surface.md` §1b.
 */
const attachmentsLive = (ctx: TestContext): Layer.Layer<Attachments> =>
  Layer.succeed(
    Attachments,
    Attachments.of({
      attach: (contentType, data) => Effect.promise(() => ctx.annotate(data, contentType)).pipe(Effect.asVoid)
    })
  )

const block: typeof describe = describe

export const vitestTestApi = (_featureUri: string): TestApi => ({
  describe: (name, define) => {
    block(name, { shuffle: false }, define)
  },
  // The one line that differs from the real file: `ctx` is captured here, and used to build a
  // per-test `Attachments` Layer that `self()`'s Effect is provided BEFORE it runs. `self` itself
  // never sees `ctx` — it stays the seam's zero-argument thunk.
  effect: (name, self, options) => {
    vitestEffect(
      name,
      (ctx) => self().pipe(Effect.provide(attachmentsLive(ctx))),
      { tags: [...options.tags], skip: options.skip }
    )
  },
  // Feature-level `afterAll` — like the real file, this runs OUTSIDE any one test, so there is no
  // `TestContext` to build a live `Attachments` from. `Attachments.noop` is provided instead: an
  // `attach` call from code that only runs here is accepted but silently dropped. See the
  // writeup's "Known gap" section — this is a real, disclosed limitation, not swept under the rug.
  afterAll: (_name, self) => {
    afterAll(() =>
      Effect.runPromise(
        self().pipe(Effect.scoped, Effect.provide(Layer.mergeAll(testEnv, Attachments.noop)))
      )
    )
  }
})

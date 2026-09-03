/**
 * SPIKE — not shipped. Answers: "what does an `attach`-capable service look like that a step body
 * can `yield*`, without `TestApi.ts` (or this file) ever naming a test framework?"
 *
 * Modelled on ADR-EC-002's `World`-as-`Context.Service` shape (verified against the real v4-rc
 * API by `research/effect-vitest-v4-api.md` item 5) — a two-stage `Context.Service<Self, Shape>()(id)`
 * class, a `Shape` interface, and a `.of(...)`-built implementation supplied by a Layer.
 *
 * This module imports ONLY `effect/*`. Nothing here knows vitest exists — the live wiring to
 * `context.annotate` lives entirely in `VitestTestApi.ts` (the file the real seam already singles
 * out as allowed to name a framework), exactly the way `TestClock`/`TestConsole` cross that same
 * boundary in `testEnv`. See `research/attachments-spike.md` for the full design writeup.
 */
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

/**
 * The service shape: one method, `attach`, mirroring cucumber-js's `World.attach(data, mediaType)`
 * (issue #24's finding) but Effect-shaped — a bare `Effect<void>` a step body `yield*`s.
 */
export interface AttachmentsShape {
  readonly attach: (contentType: string, data: string) => Effect.Effect<void>
}

export class Attachments extends Context.Service<Attachments, AttachmentsShape>()(
  "effect-cucumber/spike/Attachments"
) {
  /**
   * The fallback implementation: attaching still runs — and its data is simply dropped — when no
   * live implementation has been provided. This is what a Scenario-level `After`/`AfterStep` hook
   * gets today, because vitest's block-level `afterAll` (unlike `it.effect`) never hands out a
   * `TestContext` to annotate against — see the writeup's "Known gap" section.
   */
  static readonly noop: Layer.Layer<Attachments> = Layer.succeed(
    this,
    Attachments.of({ attach: () => Effect.void })
  )
}

/**
 * The step-body-facing helper — what a step actually `yield*`s. Kept as a free function (rather
 * than making every step body say `yield* Attachments.attach(...)` via `Effect.flatMap`) purely for
 * ergonomics; it resolves the service from context exactly like any other Effect service accessor.
 */
export const attach = (contentType: string, data: string): Effect.Effect<void, never, Attachments> =>
  Effect.flatMap(Attachments, (svc) => svc.attach(contentType, data))

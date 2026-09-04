/**
 * `Attachments` — a `World.attach()` equivalent (ADR-EC-036, BEH-EC-028): a `World`-shaped
 * `Context.Service`, framework-free, that a step or a per-Scenario hook (`Before`/`After`/
 * `BeforeStep`/`AfterStep`) `yield*`s to attach evidence — free text, JSON, anything
 * serializable as a string — to the Scenario currently running. `VitestTestApi.ts` (the one
 * module `scripts/verify-testapi-seam.sh` permits to name vitest, alongside `describeFeature.ts`)
 * provides its LIVE implementation per test, built from vitest's own `context.annotate`, so an
 * attachment made from inside a failing step is rendered directly under that Scenario's own
 * failure panel by vitest's DEFAULT reporter — no custom `Reporter` involved (BEH-EC-028).
 *
 * This module imports only `effect/*`. Nothing here can name a test framework — there is nothing
 * framework-shaped to name.
 *
 * Deliberately UNAVAILABLE from `BeforeAllScenarios`/`AfterAllScenarios`: those hooks run outside
 * any one Scenario's `it.effect` callback, so there is no live vitest `TestContext` to bind an
 * attachment to. `Dsl.ts`'s `HookRegistrar<RShared>` — the type those two hooks alone use — simply
 * never lists `Attachments` in its body's required-context union, the same mechanism that already
 * keeps a per-Scenario-only `World` service out of a once-per-Feature hook
 * (`spec/decisions/018-shared-layer-testclock-isolation.md`, note F-10). Calling `attach` from
 * inside one of those two hooks is therefore a COMPILE ERROR, not a silent runtime no-op — see
 * `packages/vitest/test/Attachments.types.ts`.
 */
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"

/**
 * One method: `attach`, mirroring cucumber-js's `World.attach(data, mediaType)` — Effect-shaped, a
 * bare `Effect<void>` a step or per-Scenario hook body `yield*`s.
 */
export interface AttachmentsShape {
  readonly attach: (contentType: string, data: string) => Effect.Effect<void>
}

/**
 * The two-stage `Context.Service<Self, Shape>()(id)` class form — the identical shape
 * `spec/decisions/002-world-is-a-context-service.md` already uses for `World`. `Attachments` is
 * architecturally just another `World`-style service; nothing about "attachment" needs a new kind
 * of primitive. No fallback/no-op Layer is exported: unlike the spike this ADR corrects
 * (`research/attachments-spike.md`), the compile-time rejection at `BeforeAllScenarios`/
 * `AfterAllScenarios` means a live `Attachments` is ALWAYS in scope everywhere `attach` can be
 * called at all, so there is nothing for a fallback to cover.
 */
export class Attachments extends Context.Service<Attachments, AttachmentsShape>()(
  "effect-cucumber/vitest/Attachments"
) {}

/**
 * The step/hook-body-facing helper — what a body actually `yield*`s. A free function (rather than
 * `yield* Attachments.attach(...)` via `Effect.flatMap` written out at every call site) purely for
 * ergonomics; it resolves the service from context exactly like any other Effect service accessor.
 *
 * @param contentType - a MIME-ish label for `data` (e.g. `"text/plain"`, `"application/json"`),
 * rendered by vitest's default reporter as the annotation's own heading
 * @param data - the evidence itself, already a string — this library does no serialization; a
 * caller attaching structured data calls `JSON.stringify` (or `Schema.encode`/`encodeSync`) first
 */
export const attach = (contentType: string, data: string): Effect.Effect<void, never, Attachments> =>
  Effect.flatMap(Attachments, (svc) => svc.attach(contentType, data))

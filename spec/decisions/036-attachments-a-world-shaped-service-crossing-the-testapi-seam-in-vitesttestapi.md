# ADR-EC-036: `Attachments`, a `World`-shaped `Context.Service`, crosses the `TestApi` seam entirely inside `VitestTestApi.ts` — `TestApi.ts` needed no widening

> **Status:** Accepted
> **Date:** 2026-09-04
> **Context:** resolves [GitHub issue #33](https://github.com/leaderiop/effect-cucumber/issues/33), part of
> [effect-cucumber gap decisions #11](https://github.com/leaderiop/effect-cucumber/issues/11); `spec/roadmap.md` §
> Planned locked the direction before this ADR, after a real, working spike on branch `spike/attachments`
> (`research/attachments-spike.md`) answered the plumbing question against the `main` of the time

## Context

cucumber-js's `World.attach(data, mediaType)` lets a step attach free-form evidence — a screenshot path, a
computed value, a request/response body — to the Scenario currently running, and cucumber-js's own reporters
render it beside that Scenario's result. This library had no equivalent. `research/vitest-failure-reporter-surface.md`
(issue #17) had already proven, by reading source, that vitest's own `context.annotate(message, type?)` is rendered
directly under the DEFAULT reporter's failure panel with no custom `Reporter` — the same mechanism ADR-EC-033
(`StepFailureLocation`) already leans on for a failing step's own pattern and `.feature` location — but also flagged
that `packages/vitest/src/TestApi.ts`'s `effect` seam hands `Runner.ts`'s Effect across as a zero-argument thunk,
erasing the `vitest.TestContext` `context.annotate` needs before a step body could ever reach it.

`research/attachments-spike.md` (branch `spike/attachments`) built a real, working prototype outside `main` and
established the plumbing question's answer: `Attachments`, a `World`-shaped `Context.Service`; `VitestTestApi.ts`
(already the one file `scripts/verify-testapi-seam.sh` permits to name vitest, alongside `describeFeature.ts`)
captures the per-test `vitest.TestContext` `@effect/vitest`'s `it.effect` hands its callback and provides a live
`Attachments` Layer built from it; verified end to end against a real `vitest run`, unmodified default reporter.
The spike's one concrete, surprising finding: its simplified test harness — a step's effect handed DIRECTLY to
`TestApi.effect`, bypassing this library's own Plan/Collect/Runner pipeline — did not type-check against `main`'s
real `TestApi.ts` (`self`'s `R` pinned to exactly `Scope.Scope`), and the spike's fix was to widen `TestApi.ts`'s
`effect`/`afterAll` to `Scope.Scope | Attachments`.

**Implementing this for real, through the actual production pipeline, found that widening unnecessary — the spike's
own simplification is what forced it, not anything about `TestApi.ts` itself.** `INV-EC-003`'s own "Boundary
condition" paragraph already states the mechanism this ADR leans on: `packages/vitest/src/Plan.ts`'s `StepBody`
(`(...) => Effect.Effect<any, any, any>`) is "the ONE place the runtime core erases type parameters, after the dsl
has checked every body." A real step or hook, written against `Dsl.ts`'s registrar types, is type-checked ONCE, at
the point a test author calls `Given`/`Before`/etc. — the exact point this ADR needs a compile-time gate at. Once
registered, its body is stored as `StepBody`/`HookBody` (both `Effect<any, any, any>`), and `ScenarioEffect.ts`'s
`buildScenarioEffect` composes every step and hook into one `Effect.gen`, then EXPLICITLY re-annotates the whole
composed value's return type as `Effect.Effect<void, unknown, Scope.Scope>` — a manual erasure boundary, not an
inferred one, that already existed before this feature and needed no change for it. Whatever a step's own,
already-checked body actually requires at runtime (a `World` service from `ROut`, or now `Attachments`) reaches it
because `Effect.provide` composes services into the ambient `Context` a running Effect resolves against,
independent of what a `.ts` file's own explicit type annotation claims upstream of that point — the identical
mechanism that already lets a step reach a `ROut` service its own Layer provides, without `TestApi.ts` ever naming
`ROut` either. Verified, not assumed: `pnpm build` (`tsc -b`, whole repo) passes with `packages/vitest/src/TestApi.ts`
byte-identical to `main`, and `scripts/verify-attachments-panel.sh` (below) proves the live wiring works end to end
through the REAL `describeFeature`/`Plan.ts`/`ScenarioEffect.ts`/`Runner.ts` pipeline, not a simplified stand-in.

## Decision

### 1. `Attachments`, a `World`-shaped `Context.Service` — `packages/vitest/src/Attachments.ts`

Framework-free, importing only `effect/*`, mirroring ADR-EC-002's exact `World` shape:

```ts
export interface AttachmentsShape {
  readonly attach: (contentType: string, data: string) => Effect.Effect<void>
}

export class Attachments extends Context.Service<Attachments, AttachmentsShape>()(
  "effect-cucumber/vitest/Attachments"
) {}

export const attach = (contentType: string, data: string): Effect.Effect<void, never, Attachments> =>
  Effect.flatMap(Attachments, (svc) => svc.attach(contentType, data))
```

No `.noop`/fallback Layer, unlike the spike's own `Attachments.noop`. The spike needed one because ITS design let
`attach` type-check anywhere and papered over `AfterAllScenarios` with a silent no-op at runtime. This ADR's design
(§3, below) makes calling `attach` from `AfterAllScenarios`/`BeforeAllScenarios` a COMPILE error instead, so a live
`Attachments` is always in scope everywhere `attach` can be called at all — there is nothing left for a fallback to
cover.

### 2. The live implementation crosses the seam entirely inside `VitestTestApi.ts` — `TestApi.ts` is UNTOUCHED

`packages/vitest/src/TestApi.ts` — the injected `describe`/`effect`/`afterAll` seam `Runner.ts` composes against —
is not modified by this feature at all, per §"Context" above. `packages/vitest/src/VitestTestApi.ts` gains one new
per-test Layer constructor:

```ts
const attachmentsLive = (ctx: TestContext): Layer.Layer<Attachments> =>
  Layer.succeed(
    Attachments,
    Attachments.of({
      attach: (contentType, data) => Effect.promise(() => ctx.annotate(data, contentType)).pipe(Effect.asVoid)
    })
  )
```

— built PER TEST from the `vitest.TestContext` `@effect/vitest`'s `it.effect` hands its callback, exactly like the
spike proved, and threaded into BOTH `it.effect`-shaped call sites `VitestTestApi.ts` has:

```ts
// vitestTestApi's plain path
effect: makeDegradingEffect(featureUri, (name, self, emitOptions) => {
  it.effect(name, (ctx) => self().pipe(Effect.provide(attachmentsLive(ctx))), emitOptions)
}),
```

```ts
// sharedLayerTestApi's shared path — merged into ONE Effect.provide, not chained, to avoid
// @effect/tsgo's own effect(multipleEffectProvide) advisory (found by actually building it)
requireSharedIt("effect").effect(
  name,
  (ctx) => self().pipe(Effect.provide(Layer.mergeAll(testEnv, attachmentsLive(ctx)))),
  emitOptions
)
```

`contextFreeEffect` (the shared adapter's routing for a Scenario that needs nothing from the shared tier) delegates
to `vitestTestApi(featureUri).effect`, so it is covered automatically. Neither `afterAll` wiring is touched — see §3.

`ctx.annotate(data, contentType)` is the two-argument overload `research/vitest-failure-reporter-surface.md`
already traced through `BaseReporter.printAnnotations`: `data` becomes the annotation's message, `contentType`
becomes its heading. Proven again here against the REAL production pipeline (not the spike's simplified harness) by
`scripts/verify-attachments-panel.sh` (§5).

### 3. `AfterAllScenarios`/`BeforeAllScenarios` reject `attach` at COMPILE time — mirroring ADR-EC-018 F-10's exact mechanism, not inventing a new one

`spec/roadmap.md`'s locked decision: `AfterAllScenarios` never receives a live `TestContext` (it is a block-level
`afterAll`, not a per-test callback), so `Attachments` there must be a compile-time-rejected capability, not a
silent runtime no-op — consistent with how a per-Scenario-only service is already rejected by name at that hook.
ADR-EC-018's F-10 already built exactly that shape for `World` services: `BeforeAllScenarios`/`AfterAllScenarios`
are typed `HookRegistrar<RShared>`, not the per-Scenario `ROut`, so a once-per-Feature hook reaching for a
per-Scenario `World` service is rejected because that service is simply absent from the union its body is checked
against — no runtime branch, a member's TYPE is what restricts it.

This ADR reuses the IDENTICAL mechanism for a second, ambient (non-`World`) service. `Dsl.ts`'s `StepRegistrar<ROut>`
and `TaggedHookRegistrar<ROut>` (steps, and `Before`/`After`/`BeforeStep`/`AfterStep` — every body kind that runs
INSIDE one Scenario's `it.effect`) both add `Attachments` to their body's required-context union:

```ts
export interface StepRegistrar<ROut> {
  <P extends string, A, E>(
    pattern: P,
    fn:
      | ((...p: StepParams<P>) => Effect.gen.Return<A, E, ROut | Scope.Scope | Attachments>)
      | ((...p: StepParams<P>) => Effect.Effect<A, E, ROut | Scope.Scope | Attachments>)
  ): void
}
```

`HookRegistrar<ROut>` — the ONLY type `BeforeAllScenarios`/`AfterAllScenarios` use — is left UNCHANGED, still
`ROut | Scope.Scope`. The omission of `Attachments` from this one union member is the entire mechanism: a
`BeforeAllScenarios`/`AfterAllScenarios` body calling `attach` requires `Attachments`, which is not a member of
`HookRegistrar`'s union, so it is rejected the same way a `RuleDsl` callback reaching for
`BeforeAllScenarios`/`AfterAllScenarios` at all is already rejected (the member is simply absent) — see `Dsl.ts`'s
own header notes, extended with one more bullet recording this.

**Verified by NAME, not merely "it fails to compile."** F-10's own verification split the same way: an ordinary
`@ts-expect-error` fixture (`packages/vitest/test/HookRegistrar.types.ts`'s ADR-EC-035 tag-expression-arity case)
works for a plain structural TS error, but F-10's own "reaching for a service the union lacks" case needed the
heavier `scripts/verify-tsgo-gate.sh` route — asserting the exit code AND grepping the diagnostic by name
(`effect(missingEffectContext)`, `@effect/tsgo`'s plugin-injected diagnostic, ADR-EC-016). This ADR discovered,
by actually building it, that `Attachments`'s exclusion is the SAME kind of case as F-10's, not ADR-EC-035's:
`@ts-expect-error` placed over `dsl.AfterAllScenarios(function*() { yield* attach(...) })` did NOT suppress the
`effect(missingEffectContext)` diagnostic (still reported at that line, exit 1) — `@effect/tsgo`'s plugin-injected
diagnostics do not interact with `@ts-expect-error`'s suppression the way a plain TS structural error does, which is
also, on inspection, exactly why `hook-once-per-scenario-service.ts` was never asserted with `@ts-expect-error`
either. So this ADR mirrors F-10's OWN verification shape, not just its type-level mechanism:
`packages/vitest/test/tsgo-gate/src/hook-once-attachments.ts` (a whole "MUST NOT COMPILE" fixture, an
`AfterAllScenarios` hook calling `attach`) plus `tsconfig.hook-once-attachments.json`, wired into
`scripts/verify-tsgo-gate.sh` as assertion 14, checking BOTH the non-zero exit and the `effect(missingEffectContext)`
diagnostic by name — literally beside assertion 11b, the sibling case it mirrors.
`packages/vitest/test/Attachments.types.ts` carries the POSITIVE half instead (ordinary `@ts-expect-error`-free
code, since "compiles" needs no diagnostic-suppression mechanism): `attach` reachable from a step and from all four
per-Scenario hook kinds, on both `Rule` and `Feature` dsls, plus the ADR-EC-035 tag-expression overload.

### 4. Behavior across a `@retry`'d Scenario's attempts: attachments ACCUMULATE across every attempt — deliberate, not an oversight

`ADR-EC-034`'s `withRetry` wraps a `@retry` Scenario's thunk as `() => flakyTest(self())`, applied inside
`makeDegradingEffect` BEFORE `VitestTestApi.ts`'s `effect` field ever wires in `attachmentsLive`. Concretely:
`it.effect(name, (ctx) => retryAwareSelf().pipe(Effect.provide(attachmentsLive(ctx))), emitOptions)` — `ctx` is
handed by `@effect/vitest`'s `it.effect` ONCE, for the whole test invocation, and `attachmentsLive(ctx)` is built
ONCE from it, wrapping OUTSIDE `flakyTest`'s own `Effect.retry`. Every attempt `flakyTest` runs — the WHOLE
composed Scenario Effect, hooks included, re-interpreted from scratch (ADR-EC-034 design question 3) — resolves
`Attachments` to the SAME `attachmentsLive(ctx)` instance, bound to the SAME `ctx.annotate`. An attachment made on a
failed first attempt is never cleared before a passing second attempt runs; both attempts' attachments remain in
the final report.

**This is the deliberate choice, not the only one considered.** The alternative — reset/discard a failed attempt's
attachments before the next one runs — would need `attachmentsLive` to close over a per-ATTEMPT buffer that
`flakyTest`'s own `Effect.retry` could clear between iterations, which nothing in `@effect/vitest`'s `flakyTest`
exposes a hook for (it retries the Effect value wholesale; there is no "between attempts" callback to clear
anything from). Building one would mean this library re-implementing a chunk of `flakyTest`'s own retry loop rather
than reusing it wholesale, which ADR-EC-034 already rejected as a design direction for the identical reason (the
same ADR's own "no code-level option" stance). Accumulation is also the MORE USEFUL default for what attachments
are FOR: evidence of what happened, and a `@retry` Scenario's interesting case is usually exactly "why did the
first attempt fail" — discarding that evidence when the final attempt happens to pass would delete the one thing a
flaky-test investigation most wants to see. The ambient `TestClock`/`TestConsole` already behave the identical way
under `@retry` (ADR-EC-034's "fourth finding": not reset between attempts either) — this ADR's choice keeps
`Attachments` consistent with that existing precedent rather than introducing a THIRD, different retry-reset
policy among the three ambient per-Scenario services.

## Consequences

**Positive**:

- `TestApi.ts` and `Runner.ts` stay framework-agnostic with ZERO changes — `scripts/verify-testapi-seam.sh` passes
  unmodified, and no exception needed carving out, because this feature never needed one: `INV-EC-003`'s own
  erasure boundary already carries whatever a step's checked body actually requires across `ScenarioEffect.ts`'s
  explicit type annotation, the same way it already carries a `ROut` service.
- The compile-time rejection at `BeforeAllScenarios`/`AfterAllScenarios` reuses an EXISTING mechanism
  (`HookRegistrar<RShared>` vs. `TaggedHookRegistrar<ROut>`) rather than inventing a new one, keeping `Dsl.ts`'s
  "a member's type, or its presence, is what restricts it" convention intact.
- A useful, discovered-by-testing side effect: because `attachmentsLive(ctx)` is provided OUTSIDE the per-Scenario
  Layer tier (innermost by construction on both the plain and `{ shared, perScenario }` paths — confirmed by direct
  experiment, §"the second finding" below), a consumer's own `perScenario` Layer can test-double `Attachments` by
  providing it itself; `packages/vitest/test/acceptance/attachments.steps.test.ts` uses exactly this to prove
  `attach`'s resolution mechanism in-process, without a real `vitest.TestContext`.

**Negative**:

- Attachments accumulating across `@retry` attempts means a Scenario that retries several times before passing can
  attach the "same kind" of evidence multiple times in the final report — a reader has to notice which attempt an
  attachment came from by its own content, since nothing in this design timestamps or numbers attempts. Stated as a
  cost, not hidden; a future enhancement could number attachments by attempt if this proves confusing in practice,
  but nothing in `@effect/vitest`'s `flakyTest` exposes an attempt index to build that from today.
- `Attachments`' live implementation being overridable by a consumer's own Layer (the positive discovery above) is
  also, structurally, a footgun: a consumer whose own Layer happens to provide the exact `Attachments` Tag (only
  possible by deliberately importing it from `@effect-cucumber/vitest`, so not an accidental collision in practice)
  would silently shadow the live, real-report-bound implementation. Not guarded against — the same "a consumer who
  deliberately reaches for an internal Tag owns the consequences" posture this library already takes toward every
  other exported `Context.Service`.

**A second finding, beyond the two design questions above: `Effect.provide`'s "innermost provide wins" is
confirmed by direct experiment, not assumed.** `eff.pipe(Effect.provide(inner), Effect.provide(outer))`, both
providing the identical `Context.Tag`, resolves to `inner`'s value — run against the installed `effect@4.0.0-rc.112`
directly, not read from documentation. This is what makes §2's wiring correct (the per-Scenario Layer, provided
first/innermost inside `ScenarioEffect.ts`, would shadow `attachmentsLive` if a consumer's Layer ever provided
`Attachments` too) and what the acceptance pair's own test double relies on, discovered along the way that a
`shared`-tier double does NOT win on the `{ shared, perScenario }` path (`@effect/vitest`'s own `layer(...)`
provides the shared tier OUTSIDE `attachmentsLive`, not inside it) — only a `perScenario` double does, on both
`describeFeature` forms, because `ScenarioEffect.ts`'s own `Effect.provide(effectiveLayer)` is unconditionally the
innermost provide in the whole pipeline.

**Trade-off accepted**: reusing `HookRegistrar`/`TaggedHookRegistrar`'s existing split, rather than adding a THIRD
DSL type (e.g. an `AttachableHookRegistrar`) that would let a future capability be added/removed independently of
the `RShared`/`ROut` split — rejected as unnecessary complexity for a library with exactly one ambient,
ROut-independent capability today (`Scope.Scope` is the only other one, and it is not something a step author ever
opts in or out of by DSL surface). If a second such capability arrives, this decision should be revisited rather
than assumed to generalize automatically.

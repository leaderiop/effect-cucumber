# Spike: an `attach`-capable service that crosses the `TestApi` seam

> Resolves GitHub issue [#33](https://github.com/leaderiop/effect-cucumber/issues/33)
> (part of the wayfinder map, issue #11 — untouched by this spike).
> Branch: `spike/attachments`. Throwaway — nothing here is proposed to merge as-is.

## Method

This is a SPIKE, not research-by-reading: a working prototype, built and
actually run, to answer the plumbing question #33 leaves open. Prior research
already closed the two questions either side of it:

- Issue #24 (`research/cucumber-ecosystem-feature-survey.md`) found cucumber-js's
  `World.attach(data, mediaType)` has no equivalent here, and confirmed by
  reading source that vitest's `TestContext` isn't threaded into step/hook
  bodies at all today.
- Issue #17 (`research/vitest-failure-reporter-surface.md`) proved
  `context.annotate(message, type?)` is auto-rendered by vitest's DEFAULT
  reporter's failure panel — no custom `Reporter` needed — but flagged that
  `packages/vitest/src/TestApi.ts`'s `effect` seam hands `Runner.ts`'s Effect
  across as a zero-argument thunk, so the `TestContext` `annotate` needs is
  erased before a step body could ever reach it.

Read `packages/vitest/src/TestApi.ts`, `packages/vitest/src/VitestTestApi.ts`,
`packages/vitest/src/ScenarioEffect.ts`, `packages/vitest/src/Step.ts`, and
`scripts/verify-testapi-seam.sh` first. Then built a prototype under
`packages/vitest/test/spike-attachments/` (chosen over a repo-root `spike/`
directory after the first attempt there failed: `effect`/`@effect/vitest` are
declared dependencies of `packages/vitest`'s own `package.json`, not the
workspace root's, so pnpm's strict `node_modules` layout can't resolve
`effect/Effect` from outside a package directory — see "What didn't work"
below):

- `packages/vitest/test/spike-attachments/TestApi.ts` — a copy of the real
  `TestApi.ts`, diffed byte-identical against `main` before one deliberate
  change (see Finding 2).
- `packages/vitest/test/spike-attachments/Attachments.ts` — the new service,
  framework-free.
- `packages/vitest/test/spike-attachments/VitestTestApi.ts` — a trimmed copy
  of the real `VitestTestApi.ts`'s plain path (`vitestTestApi`; the
  shared-layer path, `sharedLayerTestApi`, was left out of scope — the
  question this spike answers doesn't depend on it, and doubling the surface
  wouldn't have changed the answer).
- `packages/vitest/test/spike-attachments/scenario.spike.test.ts` — a real
  test file, actually run with `pnpm exec vitest run
  packages/vitest/test/spike-attachments/scenario.spike.test.ts`, that
  attaches evidence from inside a step body and then fails on purpose.

None of `main`'s real `packages/vitest/src/TestApi.ts` or
`packages/vitest/src/VitestTestApi.ts` were touched — `git status --short`
confirms only the new `test/spike-attachments/` directory is untracked/added.

Verified, not asserted: `tsc --noEmit -p packages/vitest/tsconfig.test.json`
(exit 0, whole package including the spike files), `oxlint` (exit 0, zero
findings), `dprint check` (exit 0), `pnpm test` (the full existing suite:
898 passed, 4 skipped, same as baseline — plus the one spike test, which
fails ON PURPOSE), and `bash scripts/verify-testapi-seam.sh` against the
real, unmodified `src/` files.

---

## 1. The service design: `Attachments`, a `World`-shaped `Context.Service`

`packages/vitest/test/spike-attachments/Attachments.ts`, in full:

```ts
export interface AttachmentsShape {
  readonly attach: (contentType: string, data: string) => Effect.Effect<void>
}

export class Attachments extends Context.Service<Attachments, AttachmentsShape>()(
  "effect-cucumber/spike/Attachments"
) {
  static readonly noop: Layer.Layer<Attachments> = Layer.succeed(
    this,
    Attachments.of({ attach: () => Effect.void })
  )
}

export const attach = (contentType: string, data: string): Effect.Effect<void, never, Attachments> =>
  Effect.flatMap(Attachments, (svc) => svc.attach(contentType, data))
```

A step body calls it exactly as the task proposed:

```ts
yield* attach("text/plain", "SPIKE-ATTACHMENT-MARKER: order total was computed as 42")
```

Two design choices worth calling out:

- **Two-stage `Context.Service<Self, Shape>()(id)` class form** — the same
  shape ADR-EC-002 uses for `World`, confirmed real against the installed
  v4-rc types by `research/effect-vitest-v4-api.md` item 5. `Attachments` is
  architecturally just another `World`-style service; nothing about
  "attachment" needed a new kind of primitive.
- **`Attachments.noop`, a static fallback Layer** — turned out to be load-bearing,
  not decorative (see Finding 3's "Known gap").

This file imports only `effect/*`. Nothing in it can name a test framework —
there's nothing framework-shaped to name.

---

## 2. Where the live implementation is provided — and the one place the naive version breaks

The task's hypothesis was: does `VitestTestApi.ts` provide `Attachments`' live
implementation as part of `testEnv`, "the same way `TestClock`/`TestConsole`
already cross that exact boundary"? **Partly yes, partly no — and the "no"
part is the actual finding.**

### What's the same as `testEnv`

`VitestTestApi.ts` is still the only spike file that imports
`vitest`/`@effect/vitest`, and it's still the file that builds the live
implementation and provides it via `Effect.provide`, matching `testEnv`'s
existing shape and location:

```ts
const attachmentsLive = (ctx: TestContext): Layer.Layer<Attachments> =>
  Layer.succeed(
    Attachments,
    Attachments.of({
      attach: (contentType, data) => Effect.promise(() => ctx.annotate(data, contentType)).pipe(Effect.asVoid)
    })
  )
```

### What's different — and why `testEnv` itself couldn't be reused

`testEnv = Layer.mergeAll(TestConsole.layer, TestClock.layer())` is built
ONCE, at module scope, because `TestClock`/`TestConsole` need no per-test
value from the framework. `Attachments`' live implementation needs
`ctx.annotate` — a real `vitest.TestContext`, which only exists INSIDE the
callback `@effect/vitest`'s `it.effect` invokes per test
(`self: TestFunction<A, E, R, [V.TestContext]>`, confirmed in
`research/effect-vitest-v4-api.md` item 1). So `attachmentsLive` is a
function of `ctx`, built fresh per test, and threaded in at the ONE place
`VitestTestApi.ts` actually has a `ctx` to hand it:

```ts
// REAL vitestTestApi's effect field:
//   it.effect(name, self, emitOptions)
// SPIKE's effect field:
effect: (name, self, options) => {
  vitestEffect(
    name,
    (ctx) => self().pipe(Effect.provide(attachmentsLive(ctx))),
    { tags: [...options.tags], skip: options.skip }
  )
}
```

`self` itself is still called with zero arguments — the seam's own contract
is untouched at that call site.

### The naive version doesn't type-check, and that's the real finding

The first version of this spike left `TestApi.ts` byte-identical to `main`
and just wrote a step body that calls `attach(...)`. It ran fine at runtime
(JavaScript doesn't check the `R` type parameter), but
`tsc --noEmit -p packages/vitest/tsconfig.test.json` rejected it:

```
error TS2375: Type 'Effect<never, Error, Attachments>' is not assignable to
type 'Effect<void, unknown, Scope>' with 'exactOptionalPropertyTypes: true'.
error TS377004: This Effect requires a service that is missing from the
expected Effect context: `Attachments`.
```

The reason is structural, not a typo: `TestApi.ts`'s real `effect` field
types `self` as `() => Effect.Effect<void, unknown, Scope.Scope>` — `R` fixed
to EXACTLY `Scope.Scope`. In the real pipeline, everything else in `R`
(a Scenario's per-Scenario Layer — `World`-style services, etc.) is already
discharged INSIDE `ScenarioEffect.ts`'s `buildScenarioEffect`, via
`.pipe(Effect.provide(args.layer))`, before the Effect is ever handed to
`Runner.ts`/`TestApi.ts`. `Scope.Scope` survives that provide on purpose — it's
the one requirement the framework-agnostic core deliberately leaves open, for
the test framework's own scope to close.

`Attachments` can't be discharged that early, because its live
implementation needs `ctx`, which doesn't exist until the OTHER side of the
seam. So by the time the Scenario's Effect is handed to `effect()`, its `R`
genuinely still contains `Attachments` — same reason `Scope.Scope` is still
there. The fix, applied to the spike's `TestApi.ts` copy (the ONE deliberate
diff from `main`'s real file):

```ts
// main today:
readonly effect: (name, self: () => Effect.Effect<void, unknown, Scope.Scope>, options: EmitOptions) => void

// this spike's TestApi.ts:
import type { Attachments } from "./Attachments.ts"   // library-owned, framework-free — same footing as effect/Scope
readonly effect: (name, self: () => Effect.Effect<void, unknown, Scope.Scope | Attachments>, options: EmitOptions) => void
```

This is the actual shape of the design decision #33 asks for: **`TestApi.ts`'s
`effect`/`afterAll` signatures need to widen their `R` union to include
`Attachments`, exactly the way they already carry `Scope.Scope`.** That's a
real, small, seam-compliant change to `TestApi.ts` — it adds a type import of
a library-owned module, not a framework — but it IS a change, not something
that falls out of `VitestTestApi.ts` alone. `main`'s `TestApi.ts` was left
untouched per the task's instructions; this is flagged as the concrete diff a
real implementation would need.

---

## 3. Actually running it

`packages/vitest/test/spike-attachments/scenario.spike.test.ts`:

```ts
testApi.effect(
  "Scenario: a step attaches evidence, then the Scenario fails",
  () =>
    Effect.gen(function*() {
      yield* attach("text/plain", "SPIKE-ATTACHMENT-MARKER: order total was computed as 42")
      return yield* new SpikeAssertionFailure({
        message: "intentional spike failure — the attachment above should be visible in vitest's output"
      })
    }),
  { tags: [], skip: false, contextFree: false }
)
```

Real output from `pnpm exec vitest run
packages/vitest/test/spike-attachments/scenario.spike.test.ts` (vitest
4.1.11, unmodified default reporter, `vitest.config.ts` untouched):

```
 FAIL  packages/vitest/test/spike-attachments/scenario.spike.test.ts > Feature: Attachments spike > Scenario: a step attaches evidence, then the Scenario fails
SpikeAssertionFailure: intentional spike failure — the attachment above should be visible in vitest's output
 ❯ Array.<anonymous> packages/vitest/test/spike-attachments/scenario.spike.test.ts:34:23
     32|         yield* attach("text/plain", "SPIKE-ATTACHMENT-MARKER: order to…
     33|         // Deliberate failure, so the attachment above has a failure p…
     34|         return yield* new SpikeAssertionFailure({
       |                       ^
     35|           message: "intentional spike failure — the attachment above s…
     36|         })
 ❯ Object.~effect/Effect/successCont node_modules/.../effect/src/internal/effect.ts:1365:25
 ...

 ❯ text/plain
   ↳ SPIKE-ATTACHMENT-MARKER: order total was computed as 42

 Test Files  1 failed (1)
      Tests  1 failed (1)
```

`❯ text/plain` / `↳ SPIKE-ATTACHMENT-MARKER: order total was computed as 42`
is `BaseReporter.printAnnotations` — the exact mechanism
`research/vitest-failure-reporter-surface.md` §1b traced through source,
grouping by `contentType` (there, `type`) and printing `data` (there,
`message`) underneath. This is the DEFAULT reporter's real output, from a
real `vitest run`, with no custom `Reporter` and no mock in the loop.

Running the FULL existing suite (`pnpm test`) alongside the spike file: 43 of
44 test files passed, 898 of 903 tests passed (4 pre-existing skips) — the
one failure is `scenario.spike.test.ts` itself, failing on purpose. Nothing
else regressed. (The spike test's deliberate failure is exactly why it must
never ship on `main` unexcluded — flagged in "What this is not," below.)

---

## 4. Seam compliance

`bash scripts/verify-testapi-seam.sh`, run against the real, untouched
`packages/vitest/src/Runner.ts` and `packages/vitest/src/TestApi.ts`:

```
✓ positive control: both packages/vitest/src/Runner.ts and packages/vitest/src/TestApi.ts import "effect/Scope"
✓ packages/vitest/src/Runner.ts imports no test framework, in any import form
✓ packages/vitest/src/TestApi.ts imports no test framework, in any import form

TestApi/Runner framework-independence seam: ENFORCED
```

Unaffected — `main` wasn't touched. The script itself only scans two
hardcoded paths (`packages/vitest/src/Runner.ts`,
`packages/vitest/src/TestApi.ts`), so it doesn't reach the spike files by
design; verified the spike's file placement against the SAME rule by hand:

| File | Imports a framework? | Consistent with the rule? |
|---|---|---|
| `test/spike-attachments/TestApi.ts` | No (`grep -nE "vitest\|@effect/vitest"` → zero hits) | Yes — same file the rule already protects, unchanged in kind |
| `test/spike-attachments/Attachments.ts` | No (only prose mentions of "vitest" in comments; zero import hits) | Yes — new library-owned module, same footing as `Errors.ts`/`Registry.ts` |
| `test/spike-attachments/VitestTestApi.ts` | Yes — `import { afterAll, describe, effect as vitestEffect, type TestContext } from "@effect/vitest"` | Yes — this is the ONE file the rule's own comment names as allowed to (`VitestTestApi.ts` and `describeFeature.ts`), and this spike file plays exactly that role |
| `test/spike-attachments/scenario.spike.test.ts` | Yes — imports `@effect/vitest` indirectly via `Attachments`/`VitestTestApi`, and is itself a vitest test file | Not scanned by the rule (test files were never in scope — only the library's own `Runner.ts`/`TestApi.ts`) |

If this design shipped for real, the ONE additional cross-cutting fact to
carry forward: `TestApi.ts` itself would need to import `type { Attachments }`
(Finding 2) — still zero framework names, so `scripts/verify-testapi-seam.sh`
would still pass unmodified against it; verified by hand since the rule's
`FORBIDDEN_RE` only matches `vitest`/`@effect/vitest` specifiers, and
`./Attachments.ts` matches neither.

---

## What didn't work (kept for honesty, not swept away)

- **Repo-root `spike/` directory.** First attempt placed the four files at
  `spike/attachments/*.ts`. `pnpm exec vitest run` failed immediately:
  `Error: Cannot find package 'effect/Effect'`. `effect`/`@effect/vitest` are
  dependencies of `packages/vitest`'s own `package.json`, not the workspace
  root's — pnpm's strict, non-hoisting `node_modules` layout means a file
  outside any package directory can't resolve them. Moved into
  `packages/vitest/test/spike-attachments/`, which resolves through that
  package's own linked `node_modules` the same way every real test file
  already does.
- **`self: () => Effect<void, unknown, Scope.Scope>` left unwidened.** Ran
  fine at runtime, failed `tsc --noEmit`. Covered in Finding 2.
- **Two chained `Effect.provide` calls in the spike's `afterAll`.** Type-checked,
  but the repo's own `effect-tsgo` lint plugin flagged it
  (`TS377033 multipleEffectProvide` — chaining `Effect.provide` can break
  service-lifecycle behavior vs. one combined `provide`). Fixed by merging
  into `Effect.provide(Layer.mergeAll(testEnv, Attachments.noop))` — a real
  lint rule this repo already enforces, worth keeping in the writeup since a
  real implementation would hit the same rule.
- **A plain `new Error(...)` failure in the spike test.** Same plugin flagged
  `TS377023 globalErrorInEffectFailure`. Replaced with a
  `Schema.TaggedError`, this repo's own convention (`Errors.ts`). Neither of
  these two lint findings changed the runtime behavior or the vitest output
  shown in Finding 3 — both were re-verified after the fix.

## Known gap, disclosed rather than hidden

Scenario-level `Before`/`After`/`BeforeStep`/`AfterStep` hooks run INSIDE the
Scenario's own Effect (`ScenarioEffect.ts`'s `runHookBatch`, itself inside the
Effect handed to `it.effect`), so they get the same live, `ctx`-bound
`Attachments` a step body does — attaching from a hook works exactly like
attaching from a step. But vitest's block-level `afterAll` (used for
Feature-level teardown in both the plain and shared-layer `TestApi` paths) is
NOT a per-test callback and never receives a `TestContext` at all — there is
no `ctx.annotate` to bind to there, structurally, not as an oversight. The
spike's `VitestTestApi.ts` provides `Attachments.noop` in that one path, so an
`attach` call reachable from Feature-level teardown code is accepted but
silently drops its data rather than throwing. A real implementation should
decide explicitly whether that's acceptable (most likely: yes, since
attachments are conceptually per-Scenario evidence, and Feature-level teardown
isn't scoped to one Scenario's report entry anyway) or whether it should
instead be a hard error to attach from that path.

---

## Recommendation

The plumbing this spike set out to prove is real and works end to end,
observed via an actual `vitest run`, not a mock: a step body `yield*`s
`Attachments.attach(contentType, data)`; `VitestTestApi.ts` — already the one
file allowed to name vitest — captures the per-test `vitest.TestContext` that
`@effect/vitest`'s `it.effect` hands it and provides a live `Attachments`
Layer built from `ctx.annotate` before running the Scenario's Effect; the
attached data shows up, unmodified default reporter, real failure panel.

The one thing #18/#24's earlier research didn't and couldn't surface without
building this: `TestApi.ts`'s `effect`/`afterAll` signatures need a small,
concrete, seam-compliant widening — `Scope.Scope` becomes
`Scope.Scope | Attachments` — because `Attachments`' live implementation
structurally can't be discharged earlier than the vitest boundary, the same
way `Scope.Scope` itself already can't. That's a one-type-union change, still
zero framework names in `TestApi.ts`, and `scripts/verify-testapi-seam.sh`
passes against it unmodified (verified by hand above).

Recommend: proceed with this design for a real implementation of #33 —
`Attachments` as a `World`-shaped `Context.Service`, `VitestTestApi.ts`
providing its live Layer per-test from `ctx.annotate`, and `TestApi.ts`
widened to `Scope.Scope | Attachments` — with the Known Gap above (hooks vs.
Feature-level `afterAll`) called out as an explicit open decision for that
implementation, not a blocker for this one.

## Summary

| # | Question | Finding |
|---|---|---|
| 1 | What does the `Attachments` service look like? | A `Context.Service`-based `World` analog, one `attach(contentType, data): Effect<void>` method, plus a `.noop` fallback Layer. Framework-free. |
| 2 | Does `VitestTestApi.ts` provide it via `testEnv`, like `TestClock`/`TestConsole`? | Same FILE, same MECHANISM (`Effect.provide` inside the one file allowed to name vitest) — but NOT the same static `testEnv` Layer, because the live implementation needs a per-test `TestContext` that only exists inside `it.effect`'s callback. Also requires widening `TestApi.ts`'s `effect`/`afterAll` to `Scope.Scope \| Attachments` — a real, disclosed, seam-compliant diff, not something `VitestTestApi.ts` alone can absorb. |
| 3 | Does it actually work when run for real? | Yes — verified with a real `vitest run`, unmodified default reporter: the attached text appears under `❯ text/plain` in the failure panel, exactly matching `research/vitest-failure-reporter-surface.md`'s traced mechanism. |
| 4 | Seam-compliant? | Yes — `scripts/verify-testapi-seam.sh` passes unmodified against the real, untouched `src/` files; the spike's own file placement was verified by hand against the same rule (table in Finding 4) and would still pass if the `TestApi.ts` widening from Finding 2 were applied for real. |

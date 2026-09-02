# Research: `@effect/vitest`'s Scenario-level retry surface, and Layer-rebuild timing

> Resolves GitHub issue #12 (feeds the design ticket #13, currently blocked on
> this one).

## Method

Installed this repo's own pinned dependencies in place (`pnpm install
--frozen-lockfile` at the repo root — the workspace's `pnpm-workspace.yaml`
catalog pins `@effect/vitest: 4.0.0-rc.112`, `effect: 4.0.0-rc.112`,
`vitest: ^4.1.0`) and read the installed packages' actual `.ts` source (not
`.d.ts` alone, and not any doc site) directly out of `node_modules`:

- `@effect/vitest@4.0.0-rc.112` resolved to
  `node_modules/.pnpm/@effect+vitest@4.0.0-rc.112_effect@4.0.0-rc.112_vitest@4.1.11/node_modules/@effect/vitest`
  (`pnpm why @effect/vitest` prints nothing useful because it's a
  catalog-pinned devDependency of `packages/vitest`, not a direct root
  dependency — the pnpm store path above was found by
  `find . -path "*/node_modules/@effect/vitest" -type d`). This package ships
  its own `src/**/*.ts` alongside `dist/**/*.js`, per its `package.json`'s
  `files` field, so the real TypeScript source — not just declaration files —
  was available to read directly.
- `vitest@4.1.11` resolved to two hoisted copies under
  `node_modules/.pnpm/vitest@4.1.11_...`; its `retry` execution loop lives in
  the `@vitest/runner` package it depends on
  (`node_modules/.pnpm/@vitest+runner@4.1.11/node_modules/@vitest/runner`).

Then read this repo's own emission code (`packages/vitest/src/Runner.ts`,
`packages/vitest/src/VitestTestApi.ts`, `packages/vitest/src/ScenarioEffect.ts`,
`packages/vitest/src/TestApi.ts`) and its own prior research
(`spec/decisions/009-cross-step-state-lives-in-a-ref.md`, the "Retries" item
in `spec/roadmap.md`'s `## Planned` section) to check the composition-order
claim against the actual runner plumbing that would carry it.

---

## 1. What retry mechanism does `@effect/vitest@4.0.0-rc.112` actually expose?

**Both** exist, and they are different things:

### 1a. `it.flakyTest` / top-level `flakyTest` — an Effect-level combinator

**Found:** `node_modules/@effect/vitest/src/index.ts` exports it two ways:

```ts
export const flakyTest: <A, E, R>(
  self: Effect.Effect<A, E, R | Scope.Scope>,
  timeout?: Duration.Input
) => Effect.Effect<A, never, R> = internal.flakyTest
```

and on `Vitest.MethodsNonLive<R>` (the interface `it` itself, and every `it`
handed into a `layer(...)`/`it.layer(...)` callback, implements):

```ts
export interface MethodsNonLive<R = never> extends API {
  readonly effect: Vitest.Tester<R | Scope.Scope>
  readonly flakyTest: <A, E, R2>(
    self: Effect.Effect<A, E, R2 | Scope.Scope>,
    timeout?: Duration.Input
  ) => Effect.Effect<A, never, R2>
  ...
```

`node_modules/@effect/vitest/src/internal/internal.ts:354-361` (`makeMethods`)
assigns `it.flakyTest` and the module-level `flakyTest` const to the **same
function reference** — `it.flakyTest === flakyTest`, not a wrapper:

```ts
export const makeMethods = (it: V.TestAPI): Vitest.Vitest.Methods =>
  makeItProxy(it, {
    effect: makeTester<Scope.Scope>(flow(Effect.scoped, Effect.provide(TestEnv)), it),
    live: makeTester<Scope.Scope>(Effect.scoped, it),
    flakyTest,
    layer,
    prop
  })
```

Critically: **`flakyTest` is not a test-registration API.** It takes an
already-built `Effect.Effect<A, E, R | Scope.Scope>` *value* and returns a new
Effect value with retry-until-timeout baked in — it doesn't call `it(...)`
itself. To use it for a Scenario, the caller wraps a Scenario's Effect with it
*inside* the thunk passed to `it.effect(...)` — e.g.
`it.effect('name', () => it.flakyTest(scenarioEffect))`. This distinction (a
combinator over a *value*, not a thunk-taking test declarator) is exactly why
the composition-order question in §2 below is meaningful for `flakyTest` and
not really meaningful in the same way for vitest's native per-test retry
(§1b), which always re-invokes a *function*.

Its actual implementation, `node_modules/@effect/vitest/src/internal/internal.ts:330-351`:

```ts
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
```

So: up to 10 attempts (`Schedule.recurs(10)`), bounded by a wall-clock timeout
(`30` seconds by default, `Schedule.while` cuts the schedule off once
`_.elapsed` exceeds it), with each attempt run inside its own `Effect.scoped`
and the whole thing `Effect.sandbox`ed then `Effect.orDie`d (so `flakyTest`
itself can't fail with a typed error — only defects escape). There is no
`retry` field anywhere else in this package (`grep -rn retry
node_modules/@effect/vitest/{src,dist}` finds only this one definition and
its one call site through `it.flakyTest`).

### 1b. Vitest's own native per-test `retry` — via `it.effect`'s `TestOptions` passthrough

**Found:** `it.effect`'s type signature
(`node_modules/@effect/vitest/src/index.ts`, `Vitest.Test<R>`):

```ts
export interface Test<R> {
  <A, E>(
    name: string,
    self: TestFunction<A, E, R, [V.TestContext]>,
    timeout?: number | V.TestOptions
  ): void
}
```

There is no `@effect/vitest`-specific `retry` field here — but the third
argument's type is `number | V.TestOptions`, and vitest's real `TestOptions`
(`node_modules/.pnpm/@vitest+runner@4.1.11/node_modules/@vitest/runner/dist/tasks.d-DEYaIMIu.d.ts:776-830`)
**does** carry one:

```ts
interface TestOptions {
  timeout?: number
  /**
   * Retry configuration for the test.
   * - If a number, specifies how many times to retry
   * - If an object, allows fine-grained retry control
   * @default 0
   */
  retry?: Retry  // Retry = number | { count?: number; delay?: number; condition?: RegExp }
  repeats?: number
  ...
}
```

And `@effect/vitest`'s tester implementation forwards this argument verbatim.
`node_modules/@effect/vitest/src/internal/internal.ts`:

```ts
const testOptions = (timeout?: number | V.TestOptions) => typeof timeout === "number" ? { timeout } : timeout ?? {}
...
const f: Vitest.Vitest.Test<R> = (name, self, timeout) =>
  it(name, testOptions(timeout), (ctx) => run(ctx, [ctx], self))
```

`testOptions(timeout)` is the identity function whenever `timeout` isn't a
bare number — so `it.effect(name, self, { retry: 3 })` type-checks today
against the real installed types and passes `{ retry: 3 }` straight through
to vitest's native `it(name, options, fn)`, unmodified. **This is a real,
already-available mechanism** — not a hypothetical — even though
`@effect/vitest` never names or documents `retry` itself; it's an emergent
consequence of `Vitest.Test<R>`'s third parameter being typed as the full
`V.TestOptions` rather than a narrower options type.

Confirmed how vitest's runner actually executes this option:
`node_modules/.pnpm/@vitest+runner@4.1.11/node_modules/@vitest/runner/dist/chunk-artifact.js:2934-2960`
(`runTest`'s retry loop):

```js
const retry = getRetryCount(test.retry);
for (let retryCount = 0; retryCount <= retry; retryCount++) {
  await callAroundEachHooks(suite, test, async (fixtureCheckpoint) => {
    try {
      ...
      const fn = getFn(test);
      ...
      await $("test.callback", () => limitMaxConcurrency(() => fn()));
      ...
```

`fn` here is exactly the callback `@effect/vitest` registered —
`(ctx) => run(ctx, [ctx], self)` — and `getFn(test)` / `fn()` are called fresh
on **every** iteration of this `for` loop, i.e. once per retry attempt. Since
`run` is `(ctx, args, self) => pipe(Effect.suspend(() => self(...args)),
mapEffect, runTest(ctx))` (internal.ts:97-101), each retry attempt calls the
user's `self(...args)` — the test's Effect-returning function — completely
fresh, and re-runs `Effect.runPromise` on the freshly-constructed Effect. So
native vitest retry always re-invokes the *function* the caller passed to
`it.effect`, not a pre-built Effect value.

**Answer to the literal question:** `@effect/vitest` exposes **both** — a
named `it.flakyTest`/`flakyTest` combinator for Effect-level bounded retry
with a timeout, and (unnamed, but real and type-checked) pass-through of
vitest's own `retry` `TestOptions` field through `it.effect`'s third
parameter. Neither one is a dedicated, first-class "retry a Scenario" API —
`flakyTest` is a generic Effect combinator with no test-registration
awareness, and the `TestOptions.retry` passthrough is vitest's own unrelated
mechanism that `@effect/vitest` happens not to filter out.

---

## 2. Does a retried attempt rebuild the per-Scenario Layer fresh? Composition-order trace

This repo's own prior research
(`spec/decisions/009-cross-step-state-lives-in-a-ref.md`,
`spec/roadmap.md`'s "Retries / `it.flakyTest`" item) claims: a retried
Scenario **does** rebuild its per-Scenario Layer fresh per attempt, but
**only when `Effect.provide(...)` is composed INSIDE the retried Effect** —
not wrapped around the whole thing including the retry. Traced directly
against `flakyTest`'s actual implementation (§1a above), this holds, and here
is exactly why, mechanically:

`flakyTest`'s pipe chain is `self → Effect.scoped → Effect.sandbox →
Effect.retry(schedule) → Effect.orDie`. `Effect.retry` sits **outside**
`self` in this chain — it is the *last* combinator applied before `orDie`,
meaning the effect it retries is `Effect.sandbox(Effect.scoped(self))`, in
its entirety, as one lazily-described unit. `Effect.retry` works by
re-*interpreting* that whole description from scratch on each Schedule
iteration — it has no notion of "the parts that already ran" to skip; every
sub-effect described inside `self` is literally re-executed verbatim on every
attempt, within the same overall `Effect.runPromise`/`Effect.runSync` call
that's running `flakyTest(...)`'s result.

This means:

- **`Effect.provide(layer)` composed INSIDE `self`** — i.e. the caller does
  `flakyTest(Effect.provide(scenarioBody, MyLayer))` — puts the Layer's build
  effect inside the region `Effect.retry` re-executes. `Layer.build` is
  itself an ordinary effect (with its own resource acquisition, run inside a
  `Scope`); when `Effect.retry` re-runs the description tree on attempt N+1,
  it re-runs that `Layer.build` too, producing a fresh service instance —
  **the Layer rebuilds every attempt**. `Effect.scoped` is *also* inside the
  retried region here (since it wraps `self`, and `self` is what embeds the
  provide), so each attempt additionally gets a fresh `Scope` — any
  Layer-owned finalizer from the previous failed attempt has already run
  before the next attempt's Layer build starts.

- **`Effect.provide(layer)` composed OUTSIDE the whole `flakyTest(...)`
  call** — i.e. the caller does `Effect.provide(flakyTest(scenarioBody),
  MyLayer)` — puts the Layer's build effect *outside* the region
  `Effect.retry` re-executes. `Effect.provide` builds the Layer exactly once,
  as part of running the *outer* `Effect.provide(...)` effect one single
  time; the resulting `Context` is what gets handed down into
  `flakyTest(scenarioBody)`, and `flakyTest`'s internal `Effect.retry` only
  ever re-executes `scenarioBody` (already holding a reference to that one
  fixed `Context`) — **the Layer is built once and reused across every
  retry attempt.**

So the composition-order claim is confirmed exactly as stated: whether the
Layer rebuilds per attempt is determined purely by whether `Effect.provide`
sits inside or outside `Effect.retry` in the pipe chain — and for
`flakyTest` specifically, that boundary is the `Effect.retry(...)` call at
`internal.ts:339` (the line directly below the closing paren of
`Effect.sandbox`, in the `flakyTest` definition at
`internal.ts:330-351` quoted in full in §1a).

**A caveat worth recording for the design ticket:** this "inside vs. outside"
distinction is specific to `flakyTest`'s *own* internal `Effect.retry` — a
single `Effect.runPromise` call in which the Schedule drives multiple
in-process re-executions of the same description tree. It does **not**
describe vitest's *native* `TestOptions.retry` (§1b): that mechanism calls
the *user's function* (`self(...args)`) fresh once per attempt from
*outside* Effect entirely (vitest's own `for` loop, a brand-new
`Effect.runPromise` call each time — see §1b's `chunk-artifact.js` trace).
Under native vitest retry there is no "inside vs. outside the retry" question
in the same sense: whatever Effect `self()` returns each time is built from
scratch by ordinary JS function re-invocation, so any `Effect.provide(layer)`
appearing anywhere inside that returned Effect's description is
unconditionally rebuilt every attempt — there is no way to "hoist provide
outside" a native vitest retry short of moving the Layer build into a
`beforeAll`/shared value with its own explicit memoization (e.g. `Effect.cached`,
or the `Layer.MemoMap`-based sharing `it.layer(...)`/`layer(...)` already use
— see §3).

---

## 3. How this repo's own runner emits each Scenario's `it.effect` call today

Traced `packages/vitest/src/Runner.ts` → `packages/vitest/src/VitestTestApi.ts`
→ `packages/vitest/src/ScenarioEffect.ts` to establish exactly what plumbing
exists today, for the design ticket to build on.

**`packages/vitest/src/ScenarioEffect.ts`** (`buildScenarioEffect`) composes
one Scenario's Before/steps/After into a single Effect, and — this is the
load-bearing line for the composition-order question — provides the
per-Scenario Layer **last**, i.e. as the outermost `pipe` step, meaning it's
composed *inside* whatever the returned Effect value later gets wrapped with:

```ts
  }).pipe(
    // The finalizer ignores its `exit` on purpose: After hooks receive no exit (ADR-EC-005).
    Effect.onExit(() => runHookBatch(args.hooks.After)),
    Effect.provide(args.layer)
  )
```

The module's own header comment already states the invariant this line
enforces: *"The per-Scenario Layer is provided fresh on every execution and
never memoised (INV-EC-002)."*

**`packages/vitest/src/Runner.ts`** (`emitFeature`) calls
`api.effect(title, thunk, { tags, skip, contextFree: false })` once per
Scenario, where `thunk` is a **function**, not a pre-built Effect value:

```ts
api.effect(
  titleFor(scenarioPlan),
  beforeAllScenariosCell === null
    ? () => {
      attempted = true
      return buildScenarioEffect({ plan: scenarioPlan, layer: effectiveLayer, hooks })
    }
    : ...,
  { tags: scenarioPlan.tags, skip, contextFree: false }
)
```

`buildScenarioEffect(...)` is only called **when the thunk runs** — every
invocation of that thunk constructs a brand-new Effect value, with
`Effect.provide(effectiveLayer)` freshly composed inside it each time.

**`packages/vitest/src/VitestTestApi.ts`** (`TestApi["effect"]`, the seam
`Runner.ts` calls through) has two concrete adapters, both of which route
that thunk straight into `it.effect` unmodified:

- `vitestTestApi` (plain path): `it.effect(name, self, emitOptions)` —
  `self` is the Runner's thunk, called by `it.effect`'s own tester
  (`internal.ts`'s `run`) exactly the way §1b traced.
- `sharedLayerTestApi` (shared-tier path): routes through
  `requireSharedIt("effect").effect(name, () => self().pipe(Effect.provide(testEnv)), emitOptions)`
  — `self` (the same Runner thunk, still carrying `Effect.provide(effectiveLayer)`
  internally) is still called *inside* a new thunk here, so the per-Scenario
  Layer is still rebuilt on every invocation; only the Feature-wide
  `sharedTier` is memoized (via `@effect/vitest`'s `layer(...)`, whose
  `contextEffect` is built once and shared through `Effect.cached`
  — see `research/effect-vitest-v4-api.md`'s item 2 for that mechanism).

**`packages/vitest/src/TestApi.ts`** — the `EmitOptions` interface the seam
carries has exactly three fields today, none of them retry-related:

```ts
export interface EmitOptions {
  readonly tags: ReadonlyArray<string>
  readonly skip: boolean
  readonly contextFree: boolean
}
```

**What this means for the design ticket (#13):** no `flakyTest` and no
`TestOptions.retry` passthrough exist anywhere in this runner today (`grep
-rn "flakyTest\|retry" packages/vitest/src` finds nothing besides an
unrelated comment in `StepMatcher.ts`). But the existing composition already
happens to have `Effect.provide(effectiveLayer)` positioned as the
*innermost* step of the Effect value `buildScenarioEffect` returns, and that
value is only ever produced by re-invoking a thunk — which is exactly the
"safe" composition order per §2's finding. Concretely, wiring `it.flakyTest`
in by wrapping the Runner's thunk —
`() => flakyTest(buildScenarioEffect({ plan, layer: effectiveLayer, hooks }))` —
would preserve `Effect.provide` *inside* `flakyTest`'s `Effect.retry`,
because `buildScenarioEffect(...)` is called first (producing a value with
`provide` already innermost) and *then* handed to `flakyTest`, which wraps
`Effect.retry` around that whole value. Getting this backwards — building
`flakyTest`'s argument once outside the thunk and providing the layer to the
result — would silently reintroduce the cross-attempt state leak
[ADR-EC-009](../spec/decisions/009-cross-step-state-lives-in-a-ref.md) exists
to prevent. `EmitOptions`, `TestApi["effect"]`, and both adapters in
`VitestTestApi.ts` would all need a `retry`-shaped field threaded through to
support this from the Gherkin/tag layer down to the emission call — none of
that plumbing exists yet.

---

## Summary

| Question | Finding | Source |
|---|---|---|
| Does `@effect/vitest@4.0.0-rc.112` expose `it.flakyTest`? | Yes — `flakyTest`/`it.flakyTest` (same function reference), an Effect-value combinator, not a test declarator | `node_modules/@effect/vitest/src/internal/internal.ts:330-351,354-361`; `src/index.ts` |
| Does it expose a `retry` option on `it.effect`? | Not a named `@effect/vitest` feature, but real and type-checked: `it.effect`'s third arg is typed `number \| V.TestOptions`, and vitest's own `TestOptions.retry` passes straight through untouched | `node_modules/@effect/vitest/src/index.ts` (`Vitest.Test<R>`); `internal.ts`'s `testOptions`/`const f: Vitest.Vitest.Test<R>` |
| Does vitest's native retry re-invoke the test function per attempt? | Yes — `runTest`'s `for (retryCount ...)` loop calls `getFn(test)()` fresh every iteration | `@vitest/runner/dist/chunk-artifact.js:2934-2960` |
| Does a `flakyTest`-retried attempt rebuild the Layer fresh per attempt? | Only when `Effect.provide(layer)` is composed *inside* the Effect value passed to `flakyTest` (i.e. below/before `Effect.retry` in the pipe chain) — composing `Effect.provide` around the *outside* of `flakyTest(...)` builds the Layer once and shares it across all retries | `internal.ts:330-351` (`flakyTest`'s `pipe(self, Effect.scoped, Effect.sandbox, Effect.retry(...), Effect.orDie)`) |
| Does this repo's runner rebuild the per-Scenario Layer fresh per emission today? | Yes, unconditionally (independent of retries, since none are wired up) — `Effect.provide(args.layer)` is the outermost `pipe` step in `buildScenarioEffect`, and the Runner only ever hands `it.effect` a thunk that calls `buildScenarioEffect` fresh | `packages/vitest/src/ScenarioEffect.ts` (`.pipe(Effect.onExit(...), Effect.provide(args.layer))`); `packages/vitest/src/Runner.ts` (`api.effect(title, () => { ...; return buildScenarioEffect(...) }, ...)`) |
| Does anything in this repo currently use `flakyTest` or `TestOptions.retry`? | No — `EmitOptions` has no retry field, and neither adapter in `VitestTestApi.ts` references `flakyTest` or `retry` | `packages/vitest/src/TestApi.ts`; `grep -rn "flakyTest\|retry" packages/vitest/src` (only hit is an unrelated comment in `StepMatcher.ts`) |

Both halves of `spec/roadmap.md`'s "Retries / `it.flakyTest`" note and
`spec/decisions/009-cross-step-state-lives-in-a-ref.md`'s framing check out
against the actual installed `@effect/vitest@4.0.0-rc.112` source: the
combinator is real, it is a bounded (`Schedule.recurs(10)`, 30s-default
wall-clock cutoff) sandbox-and-retry over an already-built Effect value (not
a test declarator), and the composition-order requirement is exactly as
strict as previously recorded — verified line-for-line against
`Effect.retry`'s placement in `flakyTest`'s own pipe chain, not inferred from
documentation.

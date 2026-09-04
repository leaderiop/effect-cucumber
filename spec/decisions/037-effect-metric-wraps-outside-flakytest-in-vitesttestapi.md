# ADR-EC-037: `Effect.Metric` at the Scenario emission boundary wraps OUTSIDE `flakyTest`, entirely inside `VitestTestApi.ts` — never `Runner.ts`'s emission call sites

> **Status:** Accepted
> **Date:** 2026-09-04
> **Context:** resolves [GitHub issue #26](https://github.com/leaderiop/effect-cucumber/issues/26) (closed when the
> design was locked — this ADR does not reopen it), part of
> [effect-cucumber gap decisions #11](https://github.com/leaderiop/effect-cucumber/issues/11); `spec/roadmap.md` §
> Planned locked the corrected direction before this ADR, after a real, working spike on branch
> `spike/metric-wiring` (`research/metric-wiring-spike.md`) proved the real `effect@4.0.0-rc.112` `Metric` API
> against installed source

## Context

`research/effect-testing-ecosystem-survey.md` §4 first recommended wiring `Metric.timer`/`Metric.counter` at the
Scenario emission boundary. `research/metric-wiring-spike.md` (branch `spike/metric-wiring`, built off `main` at
`3f6a8dd` — BEFORE `@retry` (ADR-EC-034) existed) built a real, working prototype and proved the actual v4-rc API
shape against installed source: no `Metric.tagged`/`Metric.increment`/`Metric.trackDuration` in this rc — the real
primitives are `Metric.timer`/`Metric.counter` (construction), `Metric.update` (the one write op for every metric
type), `Metric.value` (read back a `State`), and `Metric.withAttributes` (a 4.0.0-only rename of "tagging," applied
at record time rather than folded into the constructor call). The spike wired a new `ScenarioMetrics.ts` into
`Runner.ts`'s two `buildScenarioEffect({...})` call sites and measured real recorded output
(`scenario.result: {pass:1, fail:1}`, a `scenario.duration` histogram with real bucket counts) against the real
running framework, with the full 899-test suite staying green.

**That placement is now wrong, and ADR-EC-034 already said so in its own Consequences section, written before this
ADR:** `@retry` shipped between the spike and this ADR, and `scripts/verify-testapi-seam.sh` forbids `Runner.ts`
from importing `@effect/vitest` in any form — not a value import, not `import type`, not a dynamic `import()` —
so `flakyTest` could never live there. It moved one module over, to `VitestTestApi.ts`. A metrics wrapper placed
at the spike's literal `Runner.ts` call site would therefore sit INSIDE `flakyTest`'s retried region: a Scenario
that fails twice then passes on attempt three would wrongly record two `outcome: "fail"` increments and one
`outcome: "pass"` increment — three terminal-looking samples for one Scenario — instead of the one a dashboard
reader expects. `effect/Metric` is not a forbidden import for `VitestTestApi.ts` (only a TEST FRAMEWORK is, and
`Metric` ships in `effect` itself, already a dependency of every module here), so the correct call site is the
SAME seam point `withRetry` wraps `flakyTest` at, composing OUTSIDE it — exactly what ADR-EC-034 predicted and
this ADR now implements and proves.

Re-verified against CURRENT `main`, not assumed from the spike's own snapshot: `packages/vitest/src/VitestTestApi.ts`
now also carries `attachmentsLive` (ADR-EC-036), threaded into both `it.effect`-shaped call sites, provided OUTSIDE
whatever `self()` — retry-aware or not — already is. `Metric.timer`/`Metric.counter`/`Metric.update`/
`Metric.value`/`Metric.withAttributes`'s signatures were re-read from the currently installed
`effect@4.0.0-rc.112` source (`node_modules/.pnpm/effect@4.0.0-rc.112/node_modules/effect/src/Metric.ts`) and are
unchanged from what the spike found.

## Decision

### 1. Composition point: `VitestTestApi.ts`'s `makeDegradingEffect`, wrapping OUTSIDE `withRetry`'s result

`packages/vitest/src/ScenarioMetrics.ts` is a new, framework-free module (`effect/*` only — it may be imported from
`Runner.ts` without tripping `scripts/verify-testapi-seam.sh`, though it must not be APPLIED there, for the reason
above). It exports the two metrics and one combinator, essentially unchanged from the spike's own prototype:

```ts
export const scenarioDuration = Metric.timer("effect_cucumber.scenario.duration", { description: "..." })
export const scenarioResult = Metric.counter("effect_cucumber.scenario.result", { description: "..." })

export const withScenarioMetrics = (
  scenarioEffect: Effect.Effect<void, unknown, Scope.Scope>
): Effect.Effect<void, unknown, Scope.Scope> =>
  Effect.gen(function*() {
    const [duration, exit] = yield* Effect.timed(Effect.exit(scenarioEffect))
    yield* Metric.update(scenarioDuration, duration)
    yield* Metric.update(Metric.withAttributes(scenarioResult, { outcome: Exit.isSuccess(exit) ? "pass" : "fail" }), 1)
    return yield* exit
  })
```

`VitestTestApi.ts`'s `makeDegradingEffect` — the ONE function both the plain and shared-Layer adapters route every
`api.effect` call through — gains a sibling to `withRetry`, applied in the identical "call first, wrap the result"
shape:

```ts
const withMetrics = (
  scenario: boolean,
  self: Parameters<TestApi["effect"]>[1]
): Parameters<TestApi["effect"]>[1] => scenario ? () => withScenarioMetrics(self()) : self
```

```ts
// makeDegradingEffect, both registration attempts now reuse ONE precomputed thunk:
const observedSelf = withMetrics(options.scenario, withRetry(options.retry, self))
```

`self()` is called first inside `withRetry` (unchanged from ADR-EC-034), producing `flakyTest(self())` when
`@retry` applies; `withMetrics` then calls THAT thunk and wraps ITS result. The composition order, outside-in, is
therefore: `attachmentsLive`/`testEnv` (outermost, at the `it.effect`-shaped call sites, unchanged) → `withMetrics`
→ `withRetry`'s `flakyTest` (if `@retry`) → `buildScenarioEffect`'s own `Effect.provide(effectiveLayer)`
(innermost). `Effect.exit` inside `withScenarioMetrics` therefore always observes whatever `flakyTest`'s own
`Effect.retry` produces AFTER it settles — the fully-retried, terminal `Exit` — never an intermediate attempt's,
because intermediate attempts are resolved and discarded entirely INSIDE `flakyTest`, below where this wrapper
runs.

### 2. `EmitOptions` gains one more boolean, `scenario` — the wrinkle neither ADR-EC-034 nor ADR-EC-036 had to solve

`makeDegradingEffect` is not exclusively a Scenario's own seam: `Runner.ts`'s trailing unused-step-definition
warning loop (`api.effect(warningTitle(warning), () => Effect.void, warningEmitOptions)`) is the ONE other caller
of `api.effect` in the whole codebase, and it flows through the identical `vitestTestApi`/`sharedLayerTestApi`
adapters. Neither `withRetry` (gated on `options.retry`, always `false` for a warning) nor `attachmentsLive`
(unconditional, and harmless either way — a warning's `() => Effect.void` never reaches for `Attachments`) needed
a discriminator for this before. A metrics wrapper does: applying it unconditionally would record a spurious
`outcome: "pass"` increment and a near-zero `scenario.duration` sample for EVERY unused step definition a Feature
reports — polluting a metric literally named `scenario.result` with entries that are not Scenarios at all.

`TestApi.ts`'s `EmitOptions` therefore gains a fourth boolean, carried across the seam as plain data exactly like
`skip`/`retry`/`contextFree` already are — never a call, never something `TestApi.ts` itself interprets:

```ts
export interface EmitOptions {
  readonly tags: ReadonlyArray<string>
  readonly skip: boolean
  readonly retry: boolean
  readonly contextFree: boolean
  readonly scenario: boolean
}
```

`Runner.ts` sets it the same way it already sets `skip`/`retry` — `true` for both per-Scenario loops (Feature-level
and Rule-level), `false` for `warningEmitOptions`. `contextFree` was considered and rejected as a substitute
discriminator: in this codebase's actual usage it happens to correlate perfectly with "is this a warning" today
(every real Scenario emission hardcodes `contextFree: false`; only `warningEmitOptions` sets `true`), but that
correlation is coincidental to what `contextFree` is FOR — routing a node off the shared tier — not a contract
either module documents or `scripts/verify-testapi-seam.sh` enforces. Relying on it would leave a latent bug for
whoever next adds a second `contextFree: true` node that IS a real Scenario (nothing rules that out structurally):
it would silently stop being measured, with no test failing to say so. A dedicated field says what it means and is
asserted by name (`packages/vitest/test/Runner.test.ts`'s "EmitOptions.scenario marks a real Scenario, not a
warning node" block), the same way `retry` and `contextFree` each got their own field for their own reasons rather
than being inferred from something else already in scope.

### 3. Relative to `attachmentsLive`: it does not matter, and nothing about its own call sites changes

Design question in the original brief: where does `withMetrics` compose relative to `attachmentsLive`? It does not
matter functionally, and this ADR does not reorder `attachmentsLive`'s existing call sites at all.
`Metric.MetricRegistry` is a process-wide `Context.Reference` (ambient, per `effect/Metric`'s own doc comment) —
`withScenarioMetrics`'s `Metric.update` calls need nothing from `Attachments`, and `Attachments`' live
implementation needs nothing from `Metric`. `attachmentsLive(ctx)` already wraps OUTSIDE whatever `self()` is, at
both `it.effect`-shaped call sites (`vitestTestApi`'s `effect` field and `sharedLayerTestApi`'s
`sharedRouteEffect`) — since `self` there is now `observedSelf` (metrics-and-retry-aware), `attachmentsLive`
automatically stays the outermost provide with zero code change to either call site. The only edits `VitestTestApi.ts`
needed were the new `withMetrics` helper and `makeDegradingEffect`'s one-line `observedSelf` computation.

### 4. Always-on, no opt-out

Fixed, the same way `Effect.fn(stepText)` tracing spans are already always-on (ADR-EC-005): no Gherkin tag, no
`describeFeature` option, no environment variable turns this off. `effect/Metric`'s own `MetricRegistry` costs
nothing when nothing reads it (no exporter Layer provided means the recorded state simply sits in the in-memory
default `Map`, exactly as unread `Effect.fn` spans cost nothing when no `Tracer` exporter is wired), so there is no
meaningful "off" state to design a knob for — consistent with `@skip`/`@only`/`@retry` each carrying no code-level
parameter either (ADR-EC-034's identical reasoning, restated here for a different feature).

### 5. Metric naming and tagging: `effect_cucumber.scenario.duration` / `effect_cucumber.scenario.result`, tagged `outcome` only — confirmed, not changed

The spike's dotted, namespace-scoped convention (matching this package's own OTel-semantic-convention-flavored
naming, since this instrumentation is explicitly meant to flow into the `NodeSdk.layer`'s `metricReader` the
README's Observability recipe already documents) remains the right choice — re-confirmed by
`grep -rn "effect_cucumber\." packages/vitest/src packages/vitest/README.md spec/`, still zero hits before this
ADR. Tagging stays deliberately COARSE — `outcome: "pass" | "fail"` only, never a per-Scenario or per-Feature tag —
for a reason the spike did not have occasion to consider (it exercised exactly two Scenarios): a `scenario`- or
`feature`-valued attribute on `Metric.withAttributes` creates a SEPARATE metric series per distinct value
(`Metric.withAttributes`'s own doc comment), which for a Feature-and-Scenario-shaped test suite worth thousands of
Scenarios would mean thousands of independent series on a metric meant to answer "what fraction of Scenarios are
passing right now" — a cardinality explosion for no benefit, since per-Scenario detail already has a home: the
`Effect.fn(stepText)` trace span every step and hook already produces (ADR-EC-005), which the Observability
recipe's `NodeSdk.layer` exports today with zero change from this feature. `scenario.result`/`scenario.duration`
answer the AGGREGATE question a metrics backend is for; the trace spans answer the per-instance one a tracing
backend is for. Composes with the existing recipe unchanged — `NodeSdk.layer`'s `Configuration` already accepts a
`metricReader`, built only when supplied, so a consumer who wants these exported provides one exactly the way the
recipe already shows for spans.

### 6. The `TestClock` caveat, restated and extended for `@retry`

Unchanged from the spike's own finding: every Scenario runs under the ambient SIMULATED `TestClock` (ADR-EC-018),
and `Effect.timed` (which `withScenarioMetrics` uses) reads `Clock.monotonicTimeNanosUnsafe()`, which `TestClock`
overrides — so `scenario.duration` reads ~0ms unless a step itself calls `TestClock.adjust(...)`. Extended by one
more finding this ADR adds, following directly from ADR-EC-034's own "fourth finding" (the simulated clock is not
reset between a `@retry` Scenario's own attempts): a retried Scenario's ONE recorded duration sample reflects
whatever cumulative simulated time its attempts collectively advanced by the time the LAST one settles, not "how
long the successful attempt alone took." Neither is a defect in this wrapper — both are consequences of running
under a simulated clock this package already documents, restated here because `Effect.Metric` is the first feature
to make that clock's reading externally visible as a NUMBER a consumer might chart.

## Retry-interaction proof — the crux of this ADR's correction

Two levels, mirroring how ADR-EC-034 itself was proven (`Runner.test.ts`'s in-process `flakyTest` composition
alongside a real acceptance pair):

**Unit level**, `packages/vitest/test/ScenarioMetrics.test.ts`: drives `withScenarioMetrics` directly against a
synthetic Effect that fails once then passes, wrapped `withScenarioMetrics(flakyTest(flaky))` — the REAL
composition order — under an isolated `Metric.MetricRegistry` (`Effect.provideService(effect,
Metric.MetricRegistry, new Map())`, the spike's own isolation technique, straight from `Metric.ts`'s doc comment).
Measured: exactly one `outcome: "pass"` increment, zero `outcome: "fail"` increments, one duration sample, for a
step that ran twice. A second test in the same file demonstrates the WRONG order — `flakyTest(withScenarioMetrics(flaky))`,
never performed in `VitestTestApi.ts` — and measures that it genuinely DOES double-count: one `outcome: "fail"`,
one `outcome: "pass"`, two duration samples, for the identical underlying step. This is not a hypothetical the ADR
merely asserts; it is a real, run, passing test proving the ordering is load-bearing rather than incidental.

**A real finding beyond what the spike needed**, surfaced by actually running the unit-level suite across MULTIPLE
tests rather than one: the spike's own standalone test provided a fresh `Metric.MetricRegistry` per run
(`Effect.provideService(effect, Metric.MetricRegistry, new Map())`) and never touched a single UNTAGGED metric
object (`scenarioDuration`, used with no `Metric.withAttributes`) across more than one such run.
`ScenarioMetrics.test.ts` does, and doing so for real showed that registry override is silently ignored for an
UNTAGGED metric after its first use: reading the installed `Metric.ts` source (`Metric$#hook`), an untagged
metric's `Metric.Hooks` are cached on the metric OBJECT itself (`this.#metadata`) on first touch and never
re-consult `MetricRegistry` from context again — only a TAGGED metric (`Metric.withAttributes`, which
`scenarioResult` always uses) re-resolves the registry on every call whose attributes object misses its own
attribute-keyed cache. `ScenarioMetrics.test.ts`'s `scenarioDuration` assertions therefore use a BEFORE/AFTER
delta rather than an absolute count — correct regardless of this caching behavior, and needing no isolation
technique to be trustworthy — while `scenarioResult`'s counter assertions keep the spike's own isolated-registry
technique, which genuinely works for a tagged metric. Recorded here because it is a real property of the installed
rc a future reader touching this file would otherwise have to rediscover the hard way.

**Acceptance level**, `packages/vitest/test/acceptance/metrics.feature` + `.steps.test.ts` (`REQ-EC-029`): the ONLY
proof of the two that exercises the REAL seam — real `describeFeature`, real `Runner.ts`, real `VitestTestApi.ts`,
real `it.effect`. A Feature with one plain-passing Scenario and one `@retry`'d Scenario that fails once then
passes; an observer `it.effect`, declared in the SAME unshuffled block as the `describeFeature` call
(`AGENTS.md` §5's convention, mirroring `emission.test.ts`'s `orderedBlock`), reads `Metric.value` after both
Scenarios have run and asserts: exactly TWO `outcome: "pass"` increments (the plain Scenario plus the retried
Scenario's one terminal outcome), ZERO `outcome: "fail"` increments (the retried Scenario's failed first attempt
contributed nothing), and exactly TWO duration samples. A real failing Scenario cannot appear in this suite (its
own README: "producing real passing `it.effect` tests"), so the "a failing Scenario records one fail" third of the
brief's three-part proof lives at the unit level instead, in `ScenarioMetrics.test.ts` — a deliberate, disclosed
split, not an omission.

## New invariant: INV-EC-008

Stated formally in `spec/invariants.md` because it is a property that must hold for every execution, not merely an
implementation detail of one module: **a Scenario's terminal-outcome metric is recorded exactly once, reflecting
only its final attempt.** See that entry for the full statement and enforcement mapping.

## Consequences

**Positive**:

- `Runner.ts` and `TestApi.ts` stay framework-agnostic (`scripts/verify-testapi-seam.sh` passes unmodified in
  spirit — `TestApi.ts`'s one change is a plain boolean field, not an import); `ScenarioMetrics.ts` itself imports
  only `effect/*` and could be imported from `Runner.ts` without tripping the gate, but this ADR deliberately does
  not apply it there, for the reason in "Context" above.
- The composition point generalizes cleanly to a future third retry-like combinator, should one ever be added at
  this seam: `withMetrics` only needs to be the outermost wrap around whatever `self` already is by the time it
  runs, and nothing about its own implementation assumes `withRetry` is the only thing that might precede it.
- The `scenario: boolean` field is a narrow, well-precedented seam widening (the fourth boolean on `EmitOptions`,
  after `skip`/`retry`/`contextFree`), asserted by name rather than inferred from an unrelated field's incidental
  correlation — closing a latent-bug shape (a future `contextFree: true` real Scenario silently escaping
  measurement) before it could ever occur.

**Negative**:

- `EmitOptions` now carries one more field every future `TestApi` implementer (there is exactly one today,
  `VitestTestApi.ts`) must populate correctly — `Runner.test.ts`'s two hand-written manual `EmitOptions` literals
  needed updating alongside the two real per-Scenario emission sites, a small but real ripple ADR-EC-034/036
  did not have (a `flakyTest`/`Attachments` composition change needed no new EmitOptions field).
- The `TestClock` non-reset-across-attempts caveat (ADR-EC-034's "fourth finding") now has an externally
  observable NUMBER attached to it for the first time — a consumer charting `scenario.duration` for a `@retry`'d
  Scenario sees cumulative simulated time across every attempt, not the successful attempt's own elapsed time,
  which could read as surprising without this ADR's documentation.
- Metrics recorded to the process-wide default `MetricRegistry` with no exporter Layer provided are simply
  discarded at process exit — genuinely free, but also genuinely invisible without deliberately wiring the
  Observability recipe's `metricReader`, which this ADR does not change and does not need to.

**Trade-off accepted**: coarse `outcome`-only tagging over per-Scenario/per-Feature cardinality, in favor of
keeping `scenario.result`/`scenario.duration` answering the aggregate question a metrics backend is for, leaving
per-instance detail to the trace spans this package already ships — the same "aggregate metric, detailed trace"
split most OTel-instrumented systems make, not a limitation specific to this implementation.

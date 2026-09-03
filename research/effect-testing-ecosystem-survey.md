# Research: Effect's testing/observability ecosystem — capabilities this library doesn't expose

> Resolves GitHub issue [#25](https://github.com/leaderiop/effect-cucumber/issues/25)
> (child of the wayfinder map, issue #11).

## Method

Read this repo's own state first, so nothing already built gets re-surfaced
as a gap: `spec/overview.md`, every file under `spec/behaviors/`, every file
under `spec/decisions/`, and `packages/vitest/src/VitestTestApi.ts`. Confirmed
already built and out of scope for this survey: `TestClock`/`TestConsole`
per-Scenario isolation via `excludeTestServices` (ADR-EC-018), `Effect.fn(stepText)`
tracing spans on every step and hook (ADR-EC-005), Schema-decoded
DataTable/DocString (ADR-EC-008/ADR-EC-025). Also read this repo's own prior
research for format and to avoid duplicating already-answered questions:
`research/effect-vitest-v4-api.md` (branch `research/effect-vitest-v4-api`),
`research/vitest-retry-and-layer-rebuild.md` (branch
`research/vitest-retry-and-layer-rebuild`), and
`research/vitest-failure-reporter-surface.md` (branch
`research/vitest-failure-reporter-surface`, cited below for the `TestApi`
seam constraint).

Then read the actual installed packages this repo pins, out of the repo
root's `node_modules` (the worktree this survey was written from has no
`node_modules` of its own — the parent checkout does):

- `effect@4.0.0-rc.112` —
  `node_modules/.pnpm/effect@4.0.0-rc.112/node_modules/effect/src/**`
  (source, not just `.d.ts` — this package ships real `.ts` under `src/`).
- `@effect/vitest@4.0.0-rc.112` —
  `node_modules/.pnpm/@effect+vitest@4.0.0-rc.112_effect@4.0.0-rc.112_vitest@4.1.11.../node_modules/@effect/vitest/src/**`.

`@effect/opentelemetry` is **not** an installed dependency anywhere in this
repo's workspace (`grep -rn opentelemetry package.json pnpm-workspace.yaml
packages/*/package.json` — no hits), so §3 below is grounded in the package's
real source on its GitHub repository (`Effect-TS/effect`, `packages/opentelemetry`,
`main` branch, fetched directly via `gh api`/raw source, not a doc site) rather
than an installed copy, and that distinction is called out inline. Its
`package.json` pins `"version": "4.0.0-rc.112"` — the exact same rc as this
repo's `effect` pin — so it is a real, compatible, install-ready dependency,
just not currently one.

---

## 1. `effect/testing`'s full module list

**Assumption to check:** is there a `TestRandom`, `TestAnnotations`, or
anything beyond `TestClock`/`TestConsole` this library could expose
per-Scenario?

**Found:** `node_modules/.pnpm/effect@4.0.0-rc.112/node_modules/effect/src/testing/index.ts`
is a 4-module barrel, in full:

```ts
export * as FastCheck from "./FastCheck.ts"
export * as TestClock from "./TestClock.ts"
export * as TestConsole from "./TestConsole.ts"
export * as TestSchema from "./TestSchema.ts"
```

That is the **entire** `effect/testing` surface in this rc. No `TestRandom`,
no `TestAnnotations` module exists anywhere in the installed package
(`grep -rl "TestRandom\|TestAnnotation" node_modules/.pnpm/effect@4.0.0-rc.112/.../effect/src`
— zero hits). This is a real difference from Effect v3, where `TestRandom`
existed as its own service/layer; v4 does not carry it forward as a service.

### 1a. `TestRandom` doesn't exist — but `Random.withSeed` replaces it, and is a real, exposable gap

**Found:** `effect/Random.ts` (not under `testing/`, but the mechanism v3's
`TestRandom` collapsed into):

```ts
export const withSeed: {
  (seed: string | number): <A, E, R>(self: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>
  <A, E, R>(self: Effect.Effect<A, E, R>, seed: string | number): Effect.Effect<A, E, R>
}
```

implemented as `Effect.provideService(self, Random, ISAAC_CSPRNG(seed))` — a
deterministic PRNG service swapped in for the ambient `Random`, scoped to
whatever Effect it wraps, with **the same seed producing the same sequence**
(the module's own doc comment demonstrates this with two identical calls
producing identical output). No Layer form is exported — it's a combinator
over an Effect value, not a service to `Effect.provide` directly, though
`Effect.provideService(self, Random, ISAAC_CSPRNG(seed))` is trivially
reproducible by hand if a Layer form were wanted.

**Verdict — real gap, worth adopting.** This library already gives every
Scenario a fresh, isolated `TestClock`/`TestConsole` (ADR-EC-018) but nothing
analogous for randomness. A Scenario or Scenario Outline Example that uses
`Random` today runs non-deterministically — the same flakiness risk
`TestClock` isolation exists to prevent for time. The natural per-Scenario
seed is the Scenario's own title/tags (or the Example row's own values for
an Outline), which would make a Scenario Outline's row deterministic *and*
distinct from its siblings — e.g. `Random.withSeed(scenarioTitle)(scenarioEffect)`
composed at the same emission boundary `ScenarioEffect.ts` already composes
`Effect.provide(args.layer)`. This is additive, not a `TestApi`-seam crossing
(§6's constraint) — `Random.withSeed` is a pure `Effect<A,E,R> => Effect<A,E,R>`
combinator, exactly the shape `buildScenarioEffect`'s existing `.pipe(...)`
chain already composes other cross-cutting concerns through.

### 1b. `TestConsole.logLines`/`errorLines` — already ambient, unused as a DSL primitive

**Found:** `effect/testing/TestConsole.ts`:

```ts
export const logLines: Effect.Effect<ReadonlyArray<unknown>, never, never>
export const errorLines: Effect.Effect<ReadonlyArray<unknown>, never, never>
```

Since `TestConsole.layer` is already part of the ambient `testEnv` every
Scenario gets (`VitestTestApi.ts`'s `export const testEnv = Layer.mergeAll(TestConsole.layer, TestClock.layer())`),
a step body can call `yield* TestConsole.logLines` **today**, with zero
library changes, to assert on captured console output from earlier steps —
e.g. `Then("the following was logged:", function*(doc: DocString) { const lines = yield* TestConsole.logLines; ... })`.

**Verdict — not a gap in capability, a gap in documentation.** The mechanism
already works because of ADR-EC-018's existing wiring; nothing needs to be
built. Worth a one-paragraph mention in `packages/vitest/README.md` next to
the existing per-Scenario-clock paragraph, but it is not a design decision or
new code — it's already reachable.

### 1c. `TestClock.withLive` — the sanctioned fix for ADR-EC-018 note 10's footgun, not merely a new capability

**Found:** `effect/testing/TestClock.ts`:

```ts
export const withLive = <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
  testClockWith((testClock) => testClock.withLive(effect))
```

Runs one Effect against the **real** system clock, scoped to just that
Effect, while leaving the ambient `TestClock` in place for everything else
around it — confirmed against the module's own worked example (`Clock.currentTimeMillis`
reads `0` normally, but `TestClock.withLive(Clock.currentTimeMillis)` reads
the real system time inline).

**Verdict — directly relevant to an existing documented hazard, not a new
feature.** ADR-EC-018 note 10 records a real, unresolved field report: a
step ported from `cucumber-js` re-provided `Effect.provide(TestClock.layer())`
nested on top of the ambient one, and under a real concurrent-dispatch +
`Effect.timeout` + retry-with-backoff Scenario, the nested clock "measurably
lost" and the Scenario hung on wall-clock time. The note's fix was "delete
the redundant provide, read the ambient clock" — but it didn't have a
positive recommendation for a step that **genuinely needs real time**
temporarily (e.g. asserting a real HTTP call's actual latency, or interacting
with a system that itself is not on the simulated clock). `TestClock.withLive`
is exactly that: the officially-shipped, scoped escape hatch, and it sidesteps
the whole footgun class because it never re-provides a second `TestClock`
service at all — it borrows the real `Clock` for one Effect and hands control
back. Worth adding as the recommended alternative in the same README
paragraph note 10 already touches, not as new runner code — a consumer can
use it today, unassisted by this library.

### 1d. `TestSchema` — a real module, but a test-authoring tool for *this library's own* test suite, not a consumer-facing capability

**Found:** `effect/testing/TestSchema.ts` exports `Asserts`/`Decoding`/`Encoding`
classes — `new TestSchema.Asserts(schema).decoding().succeed(input, expected)`,
`.encoding()`, `.arbitrary().verifyGeneration()`, `.verifyLosslessTransformation()`
(a FastCheck-driven round-trip check: generate arbitrary values via `Schema.toArbitrary`,
encode then decode, assert equality). These are `assert`-style helpers meant
to be called directly inside a test file that is *testing a Schema itself*.

**Verdict — poor fit, not a consumer-facing gap.** This library already
decodes DataTables/DocStrings through `Schema` (ADR-EC-008/025) — `TestSchema`
would be relevant to *this repo's own* internal test suite for `DataTable.ts`'s
schema-decoding logic (worth a look for `packages/gherkin/test/`, out of scope
here), not something `describeFeature`'s DSL should surface to a consumer
writing Gherkin steps. A step author decodes a table with `decodeHashes(Schema)`
and gets a typed value or a typed `DataTableError` — there's no "assert this
schema round-trips" moment in a BDD scenario's steps.

---

## 2. `@effect/vitest`'s full export surface

**Assumption to check:** anything beyond `it`/`it.effect`/`layer`/`flakyTest`
(confirmed already used, per `VitestTestApi.ts`'s imports and
`research/vitest-retry-and-layer-rebuild.md`'s finding that neither
`flakyTest` nor `TestOptions.retry` are wired into this runner today).

**Found:** `node_modules/.pnpm/@effect+vitest@4.0.0-rc.112.../node_modules/@effect/vitest/src/index.ts`,
full export list: `effect`, `live`, `layer`, `flakyTest`, `prop`, `it`,
`addEqualityTesters`, `makeMethods`, `describeWrapped`, plus `export * from "vitest"`
(the entire underlying vitest API re-exported). On `Vitest.Methods<R>` (the
shape of `it` and of every `it` a `layer(...)`/`it.layer(...)` callback
receives): `.effect`, `.effect.skip/.only/.skipIf/.runIf/.each/.fails`,
`.live`, `.layer`, `.flakyTest`, `.prop`.

### 2a. `it.live` — a genuine unused sibling to `it.effect`, and a real gap for one BDD use case

**Found:** `export const live: Vitest.Tester<Scope.Scope> = internal.live` —
same `Tester<R>` shape as `it.effect` (`.skip`/`.only`/etc. included), but
per `internal.ts`'s `makeMethods`, `live: makeTester<Scope.Scope>(Effect.scoped, it)`
— i.e. it runs the Scenario's Effect scoped, but **without** providing
`TestEnv` (`TestClock`/`TestConsole`) at all. The real system clock and real
console are ambient.

**Verdict — real, narrow gap.** This library's whole architecture assumes
every Scenario gets the simulated `TestClock`/`TestConsole` (ADR-EC-018 is
built entirely around preserving that per-Scenario, on both Layer scopes).
There's no tag or mechanism today for a Scenario that genuinely wants the
*real* clock and console throughout — e.g. a Scenario deliberately testing
real timing behavior end-to-end, where `TestClock.withLive` (§1c) wrapping
individual steps is more ceremony than just running the whole Scenario live.
A `@live` tag routing a Scenario's emission through `api.live` instead of
`api.effect` in `VitestTestApi.ts` would be a small, additive extension of
the existing tag-routing mechanism (BEH-EC-008) — but it is a design decision
(a new tag, a new `TestApi` method) this survey flags rather than resolves.

### 2b. `it.prop` — real fast-check integration; see §5 for the Gherkin-fit verdict

Covered fully in §5 below, since the interesting question here is fit with
Gherkin's model, not just existence.

### 2c. `it.each` — a real, already-generic-purpose vitest feature this library's own architecture supersedes

**Found:** `.each: <T>(cases: ReadonlyArray<T>) => (name, self, timeout?) => void` on
`Tester<R>` — runs the same test body once per case in `cases`, titled per
case.

**Verdict — not a gap; Scenario Outline already **is** this, done better for
Gherkin's purposes.** BEH-EC-010 (Scenario Outline Examples are typed for
free, one `it.effect` per Examples row, titled per row) is a Gherkin-native,
type-safe version of exactly what `it.each` does generically. Surfacing
`it.each` itself to a consumer would be redundant with — and weaker than —
what `Scenario`+`Examples:` already gives them (no Gherkin row-title
convention, no Schema-typed row shape). No action item.

### 2d. `addEqualityTesters` — real, tiny, orthogonal to this library

**Found:** `export const addEqualityTesters = () => { V.expect.addEqualityTesters([]) }`
— registers vitest's `expect`-level custom equality testers (for e.g.
`Equal.equals`-aware deep equality in assertions) globally. `internal.ts`'s
implementation currently passes an empty array, so as shipped this call is a
no-op hook point, not immediately consequential.

**Verdict — not a gap.** This is a global `expect` configuration a consumer
would call once in their own vitest setup file, same as any other vitest
project-level config — it has nothing to do with `describeFeature` or the
Gherkin DSL and isn't this library's concern to surface.

### 2e. `describeWrapped`/`makeMethods` — internal-facing, not consumer surface

**Found:** `describeWrapped(name, f)` wraps `V.describe` so `f` receives a
`Vitest.Methods` built via `makeMethods(it)` inside that block, rather than
requiring the top-level `it` export. `makeMethods` is the underlying factory
`export const it = internal.makeMethods(V.it)` and `describeWrapped` both use.

**Verdict — not a consumer-facing gap.** These exist so a library author can
build their own `describe`/`it`-shaped wrapper around `@effect/vitest` — which
is structurally close to what `Runner.ts`/`VitestTestApi.ts` already do by
hand via the framework-agnostic `TestApi` seam (§6). Not something to expose
through the Gherkin DSL itself.

---

## 3. OpenTelemetry integration depth

**Assumption to check:** does Effect's OTel integration offer configurable
exporters, span attributes, or trace-context propagation worth documenting as
a recipe.

### 3a. Span attributes/annotations — already reachable today, inside a step body, no library change needed

**Found:** `effect/Effect.ts` (installed, confirmed): `Effect.annotateCurrentSpan(key, value)` /
`Effect.annotateCurrentSpan({ ... })`, `Effect.currentSpan: Effect<Span, NoSuchElementError>`,
`Effect.linkSpans(...)`. `effect/Tracer.ts`'s `Span` interface carries
`attributes: ReadonlyMap<string, unknown>`, `event(name, startTime, attributes?)`,
and `SpanOptions`/`SpanOptionsNoTrace` (used by `Effect.withSpan`, and by
extension `Effect.fn(name, options?)` since `Effect.fn`'s second argument is
typed `SpanOptionsNoTrace`) carry `attributes?: Record<string, unknown>`.

**Verdict — real capability, already reachable, doc-only gap.** Because
ADR-EC-005 already wraps every step/hook body in `Effect.fn(stepText)`, a
step body can call `yield* Effect.annotateCurrentSpan("user.id", userId)` (or
any Gherkin-parameter-derived value) **right now** — the span it annotates is
already the one `Effect.fn` created for that step, since it's the innermost
current span at that point. No `TestApi` seam crossing, no new code: this is
purely a documentation opportunity (a recipe, as the task frames it) —
"attach Gherkin parameter values as span attributes for OTel-backed tracing"
belongs next to ADR-EC-005 or in the README, not in the runner.

### 3b. Configurable exporters — real, and a natural fit, but lives in a package this repo doesn't currently depend on

**Found (via `Effect-TS/effect`'s GitHub source, `main` branch,
`packages/opentelemetry` — not an installed copy in this repo, called out per
the Method section above):** `@effect/opentelemetry@4.0.0-rc.112`
(`packages/opentelemetry/package.json`, pinned to the exact same rc as this
repo's `effect`) exports `NodeSdk.layer` (and a browser-targeted `WebSdk.layer`),
taking a `Configuration` with:

```ts
resource?: { serviceName: string; serviceVersion?: string; attributes?: Otel.Attributes }
spanProcessor?: SpanProcessor | ReadonlyArray<SpanProcessor>
metricReader?: MetricReader | ReadonlyArray<MetricReader>
logRecordProcessor?: LogRecordProcessor | ReadonlyArray<LogRecordProcessor>
```

— each signal (traces/metrics/logs) built only when its processor/reader is
supplied, plus a `shutdownTimeout`. There are also per-signal modules
(`OtelTracer.ts`, `OtelMetrics.ts`, `OtelLogger.ts`, `Resource.ts`, confirmed
via `gh api repos/Effect-TS/effect/contents/packages/opentelemetry/src`) for a
consumer who only wants one signal wired rather than the whole Node SDK.
`spanProcessor`/`metricReader` accept any standard OTel-JS SDK processor/reader
— i.e. real OTLP exporters (`@opentelemetry/exporter-trace-otlp-http`,
a Prometheus `PrometheusExporter` as a `MetricReader`, etc.) plug in exactly
as they would in a hand-rolled OTel-JS setup.

**Verdict — real, valuable, correctly scoped as a documented recipe, not
new code.** This is not something `describeFeature` should build — it's an
ordinary Layer a consumer provides in their own suite setup
(`Effect.provide(NodeSdk.layer(...))`, composed the same way any other
ambient Layer already is), and it composes with zero friction against
`Effect.fn`'s existing spans since `NodeSdk.layer`'s job is exactly to make
`effect`'s own `Tracer`/`Metric` services (built-in, always present — see
§4) flow to a real backend. Worth a "Observability recipe" section in
`packages/vitest/README.md`: install `@effect/opentelemetry` (+ whichever
`@opentelemetry/exporter-*` package), provide `NodeSdk.layer(...)` alongside
the consumer's own Layer, get every Scenario's `Effect.fn(stepText)` span
(and, if §4 below is adopted, every Scenario's `Metric`s) exported for real.
Not a false positive — genuinely absent from this library's docs today
(`grep -rn opentelemetry packages/vitest/README.md spec/` — no hits) despite
being a one-Layer integration away.

### 3c. Trace-context propagation — exists, but is an application-level concern, not this library's

**Found:** `effect/Tracer.ts`'s `externalSpan`/`ExternalSpan` let an Effect
program continue a trace whose span was created outside Effect (e.g. an
inbound HTTP request's W3C `traceparent` header). `effect/FiberRef`-based
`DisablePropagation`/`CurrentTraceLevel` control what propagates.

**Verdict — out of scope for this library, correctly.** Trace-context
propagation matters when a Scenario's steps call into a real service that
itself participates in the same trace (e.g. an integration-test Scenario
hitting a real HTTP API). That's a property of what the *step's own Effect*
does with `externalSpan`, entirely inside a step body's own logic — nothing
about `describeFeature`'s DSL constrains or needs to know about it. No
recipe needed beyond pointing at `Tracer.externalSpan` in passing, if at all.

---

## 4. `Effect.Metric`

**Assumption to check:** could Scenario pass/fail/duration/flakiness be
tracked as a `Metric` a consumer's backend picks up, wired at the `it.effect`
emission boundary in `Runner.ts`/`VitestTestApi.ts`.

**Found:** `effect/Metric.ts` (installed), full metric-type surface:
`counter`, `gauge`, `frequency`, `histogram`, `summary`, and — directly
relevant here — `timer`:

```ts
export const timer = (name: string, options?: {
  readonly description?: string
  readonly attributes?: Metric.Attributes
  readonly boundaries?: ReadonlyArray<number>
}): Histogram<Duration.Duration>
```

a pre-built `Histogram<Duration.Duration>` (default exponential boundaries,
`0.5ms` start, factor 2, 35 buckets) meant exactly for "how long did this
thing take" measurements — the doc-comment example is an HTTP handler timing
itself. `Metric.update(metric, value)`/`Metric.value(metric)` read/write any
metric; `Metric.value` on a `Histogram` returns `HistogramState` (`count`,
`min`, `max`, `sum`, `buckets`) — everything needed to derive p50/p90/etc.
locally, or to let an exporter do it. `Metric.MetricRegistry` is process-local
(a `Context.Reference<Map<string, Metric.Metadata>>`) — reading it out to an
external backend (Prometheus, etc.) is exactly what `@effect/opentelemetry`'s
`NodeSdk.layer`'s `metricReader` option (§3b) is for: `effect`'s `Metric`
module and OTel's metrics pipeline are already designed to compose, not two
separate stories.

**Concrete, realistic wiring at this repo's own emission boundary:**
`packages/vitest/src/ScenarioEffect.ts`'s `buildScenarioEffect` already
composes cross-cutting concerns as the outermost `.pipe(...)` steps around a
Scenario's Before/steps/After
(`Effect.onExit(() => runHookBatch(args.hooks.After))`, then
`Effect.provide(args.layer)`, per `research/vitest-retry-and-layer-rebuild.md`'s
trace of this exact file). A `Metric.timer("effect_cucumber.scenario.duration")`
wrapped around the Scenario body via `Metric.trackDuration`-shaped composition
(or manual `Effect.timed` + `Metric.update`), plus a `Metric.counter("effect_cucumber.scenario.result", { attributes: { result: "pass"|"fail" } })`
bumped from the same `Effect.onExit`/`Effect.tapErrorCause` this file already
has a hook for, would sit at exactly the same seam ADR-EC-018's `TestEnv`
provide and ADR-EC-005's `Effect.fn` span already use — **inside** the
Effect value, never crossing the `TestApi` seam (§6's constraint), since
`Metric.update` is a plain `Effect<void>` composable with `Effect.pipe` like
any other. This is the one item in this survey that is both a real gap *and*
directly actionable as new runner code, not just a documentation recipe.

**Verdict — real gap, worth adopting, and correctly scoped as new code (not
just docs) because "automatically tag every Scenario's Metric with its own
title/tags" is exactly the kind of default a consumer can't get by wiring
`Metric` themselves inside a step body** (a step body has no way to know
"this is the last step of the Scenario" or "the Scenario failed" without
duplicating what `ScenarioEffect.ts` already knows from `Effect.onExit`).
Flakiness (a Scenario retried under `it.flakyTest`/`TestOptions.retry`, per
`research/vitest-retry-and-layer-rebuild.md`) is trackable the same way once
retries are wired in (`spec/roadmap.md`'s "Retries" item, still open) — a
`Metric.counter("...scenario.attempt", { attributes: { outcome } })` bumped
once per attempt, not once per Scenario, would make flakiness visible as
`attempts > 1` in the same backend. That composition is future work
contingent on the Retries roadmap item landing first, not something to build
in isolation.

---

## 5. Property-based testing / fast-check integration

**Assumption to check:** does `@effect/vitest` integrate with `fast-check`,
and would it meaningfully complement Gherkin's `Examples:` table model — or
is this a poor fit for Gherkin's example-based philosophy.

**Found — yes, real and deep, not a loose re-export.** Two layers:

1. **`effect/testing/FastCheck.ts`** — `export * from "fast-check"`, i.e.
   `fast-check` itself is re-exported wholesale from `effect/testing`, so it's
   a real, first-class dependency of `effect` (not merely something
   `@effect/vitest` happens to also depend on) — confirmed no separate
   `fast-check` entry in `@effect/vitest`'s own `package.json` dependencies
   (it has none — only `peerDependencies` on `vitest`/`effect`), meaning
   `@effect/vitest`'s `it.prop` gets `fast-check` transitively through
   `effect/testing/FastCheck`, imported directly in `internal/internal.ts`:
   `import * as fc from "effect/testing/FastCheck"`.

2. **`it.prop(name, arbitraries, self, timeout?)`** — `@effect/vitest/src/index.ts`'s
   `Vitest.Tester<R>.prop` and the standalone `prop` export. Takes either an
   array or record of `Schema.Schema<any> | FC.Arbitrary<any>`, generates
   inputs via `fc.assert(fc.property(...))` (or `fc.record(...)` for the
   record form), and hands generated values into the test body — confirmed at
   `internal/internal.ts:177` (`export const prop`). One caveat found in the
   same source: **`Schema` arbitraries are not actually wired yet** —
   `if (Schema.isSchema(arbitrary)) { throw new Error("Schemas are not supported yet") }`
   appears in both the array and record branches of `prop`'s implementation —
   so despite the type signature accepting `Schema.Schema<any>`, only raw
   `FC.Arbitrary<any>` values work at runtime in this rc. This is a real,
   currently-broken half of `@effect/vitest`'s own advertised API, not
   something this library's own choices caused.

### Fit with Gherkin's model

**Verdict — poor fit for this library's core Scenario/Examples model,
correctly not something to wire into the DSL; a narrow, opt-in fit exists
outside it.**

Gherkin's `Examples:` table is inherently enumerative: a human wrote down
specific rows because those rows are meaningful business examples (a
boundary condition, a named customer scenario) — the whole point of BDD is
that a domain expert can read the table and recognize each row as a concrete
case they care about. `it.prop`'s model is the opposite: fast-check *invents*
inputs the author never wrote down, specifically to find inputs a human
wouldn't think to write. Wiring `it.prop`-style generation into `Scenario
Outline`'s `Examples:` handling — e.g. a hypothetical `Examples: <generated>`
using an `Arbitrary` in place of a literal table — would break the property
that makes a `.feature` file readable as living documentation: a reviewer
could no longer read the Examples table and know what's actually being
tested, and a failure would report a machine-generated counterexample instead
of a named row a domain expert wrote. It would also cross the `TestApi` seam
in a much more structural way than `Metric`/OTel do: `it.prop` isn't a
combinator over an Effect value like `flakyTest`, it's a whole different test
*declarator* shape (arbitraries in, generated args out), which is a poor
match for `TestApi.effect`'s existing `(name, self, options) => void`
contract that both adapters in `VitestTestApi.ts` implement identically for
every Scenario today.

**Where it could still be a legitimate opt-in, outside the Scenario/Examples
model entirely:** a step body that itself wants to fuzz-test some pure
function as part of asserting a business rule (e.g. a Then step asserting "the
pricing function is always non-negative for any input" as a property, inside
one ordinary Gherkin step) could call `fc.assert(fc.property(...))` directly
inside its `Effect.gen`/`Effect.fn` body today, with zero library involvement
— `effect/testing/FastCheck` is already a transitive dependency via `effect`
itself. That's a step *author's* choice inside one step's implementation, not
a DSL-level feature, and doesn't need this library to do anything.

---

## 6. Anything else notable

### 6a. `TestClock.Options.warningDelay` — minor, not worth wiring

`TestClock.layer(options?: TestClock.Options)` accepts `{ warningDelay?:
Duration.Input }` — how long the live clock waits before warning that a test
is using time without advancing it. `VitestTestApi.ts`'s `testEnv` calls
`TestClock.layer()` with no options (the 1-second default). Not worth
exposing as DSL surface — a consumer hitting spurious warnings has no
`describeFeature`-level lever to reach for today, but this is a narrow enough
edge case (and easily worked around by just calling `TestClock.adjust`
promptly, which is the warning's own advice) that it doesn't rise to the
level of the other findings here.

### 6b. The `TestApi` seam is the one architectural constraint every finding above had to be checked against

`packages/vitest/src/TestApi.ts` (confirmed via
`research/vitest-failure-reporter-surface.md`'s trace, re-verified against
this repo's own source) intentionally erases the vitest-specific
`TestContext`:

```ts
export interface TestApi {
  readonly describe: (name: string, define: () => void) => void
  readonly effect: (
    name: string,
    self: () => Effect.Effect<void, unknown, Scope.Scope>,
    options: EmitOptions
  ) => void
  readonly afterAll: (name: string, self: () => Effect.Effect<void, unknown, Scope.Scope>) => void
}
```

`self` is a zero-argument thunk by design (`packages/vitest/src/VitestTestApi.ts`'s
own header: "the only [modules] that may name a test framework"), enforced by
`scripts/verify-testapi-seam.sh`. Every finding in this survey that stays
**inside** an Effect value composed by `ScenarioEffect.ts`/`Step.ts` (Random
seeding §1a, span attributes §3a, `Metric` emission §4) is additive and
doesn't touch this seam at all — they're just more `.pipe(...)` steps or
in-body `yield*`s, the same shape ADR-EC-005's `Effect.fn` wrap and
ADR-EC-018's `TestEnv` provide already are. Findings that would need a
vitest-specific **capability** to cross into step/Scenario code — `it.prop`'s
declarator shape (§5), or (hypothetically, had it existed) a `TestContext`-shaped
annotation API — hit this seam directly and would need a deliberate decision
about whether/how to thread a new type through it, the same tension
`research/vitest-failure-reporter-surface.md` already surfaced for issue #18.
Nothing in this survey found a capability that requires reopening that
seam's zero-argument-thunk contract to be worth adopting.

---

## Summary

| # | Question | Finding | Verdict |
|---|----------|---------|---------|
| 1a | `TestRandom` equivalent? | Doesn't exist in v4; `Random.withSeed(seed)` replaces it — a pure combinator, not a service/Layer | **Real gap, worth adopting** — per-Scenario/Example deterministic seeding, same seam as existing `TestEnv` provide |
| 1b | `TestConsole.logLines`/`errorLines` | Already ambient via existing `testEnv`, usable in a step body today | **Not a gap — docs-only** |
| 1c | `TestClock.withLive` | The real fix for ADR-EC-018 note 10's nested-`TestClock` footgun | **Real, docs-only, but high-value** — belongs next to note 10 |
| 1d | `TestSchema` | Schema round-trip/assertion helpers for testing a Schema itself | **Poor fit** — relevant to this repo's own test suite, not the consumer DSL |
| 2a | `it.live` | Runs a test with the real clock/console, no `TestEnv` | **Real, narrow gap** — a `@live` tag would need new `TestApi` routing (design decision, not resolved here) |
| 2b | `it.prop` | Fast-check-backed property test declarator | See §5 — **poor fit for Scenario/Examples**, narrow step-level opt-in only |
| 2c | `it.each` | Generic per-case test repetition | **Not a gap** — Scenario Outline already supersedes it for Gherkin's purposes |
| 2d | `addEqualityTesters` | Global `expect` equality config | **Not a gap** — consumer's own vitest setup, unrelated to the DSL |
| 2e | `describeWrapped`/`makeMethods` | Internal building blocks for wrapping `it` | **Not a gap** — not consumer-facing |
| 3a | Span attributes/`annotateCurrentSpan` | Already reachable inside any step body today, given ADR-EC-005's `Effect.fn` wrap | **Real, docs-only** |
| 3b | Configurable OTel exporters | `@effect/opentelemetry`'s `NodeSdk.layer`/`WebSdk.layer`, same rc as this repo's `effect` pin, not currently installed | **Real, valuable, docs-only recipe** |
| 3c | Trace-context propagation | `Tracer.externalSpan` — real, but application-level | **Out of scope**, not this library's concern |
| 4 | `Metric` (Counter/Histogram/Gauge) | `Metric.timer`/`Metric.counter` fit Scenario duration/pass-fail exactly; composes with OTel's `metricReader` | **Real gap, worth adopting as new runner code** — the one finding needing actual `ScenarioEffect.ts` changes, not just docs |
| 5 | fast-check / `Examples:` overlap | Real, deep integration (`it.prop`), but Schema arbitraries are broken in this rc (`"Schemas are not supported yet"`) | **Poor fit at the DSL level** — Gherkin's `Examples:` is enumerative by design; a step-level opt-in (unassisted) is the right scope, if any |
| 6a | `TestClock.Options.warningDelay` | Configurable warning delay, unused | **Too narrow to wire** |
| 6b | `TestApi` seam | Zero-argument-thunk contract (`scripts/verify-testapi-seam.sh`) | **The dividing line** — every adoptable finding above stays inside it; `it.prop`/any future annotation-API finding would not |

**Ranked by value, for the consumer-facing summary:**

1. **`Metric` wiring at the Scenario emission boundary** (§4) — the only
   finding that's both a real gap *and* new runner code, and it directly
   extends the observability story ADR-EC-005 already started.
2. **`TestClock.withLive` as the documented fix for ADR-EC-018 note 10**
   (§1c) — closes a known, real, currently-unenforced hazard with an
   existing primitive; docs-only but high-value.
3. **`@effect/opentelemetry` exporter recipe** (§3b) — makes the existing
   `Effect.fn` spans (and, if #1 lands, the new `Metric`s) actually reach a
   real backend; docs-only, zero new runner code.
4. **`Random.withSeed` per-Scenario determinism** (§1a) — closes the same
   class of flakiness risk `TestClock`/`TestConsole` isolation already closes
   for time and output, just for randomness.
5. **`TestConsole.logLines` as a documented assertion primitive** (§1b) —
   small, docs-only, already works.
6. **`it.live` / a `@live` tag** (§2a) — real but narrow; a design decision,
   not resolved here.

**False positives / poor fits, explicitly ruled out:** `it.prop`/fast-check
at the DSL level (§5 — fights Gherkin's enumerative `Examples:` philosophy
and the `TestApi` seam's declarator shape), `TestSchema` (§1d — a test-suite
tool, not a consumer capability), `it.each` (§2c — Scenario Outline already
does this better for Gherkin), `addEqualityTesters`/`describeWrapped`/`makeMethods`
(§2d/§2e — orthogonal to the DSL), trace-context propagation (§3c —
application-level, not this library's concern).

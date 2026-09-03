# Spike: wiring `Metric.timer`/`Metric.counter` at the Scenario emission boundary

> Resolves GitHub issue #26 (does not close it — feeds a still-open human
> decision). Built on branch `spike/metric-wiring`, off `main` at `3f6a8dd`.
> Recommended by `research/effect-testing-ecosystem-survey.md` §4 (issue #25,
> closed), composes with the OpenTelemetry exporter recipe already shipped in
> `packages/vitest/README.md`'s "Observability recipe" section (issue #28).

## Method

This is a SPIKE, not production code: a cheap, working prototype to raise the
fidelity of a design discussion. Built on `spike/metric-wiring` (off `main`),
using this repo's own pinned dependencies (`pnpm install --frozen-lockfile`,
`effect@4.0.0-rc.112`), reading the real installed `effect/src/Metric.ts` and
`effect/src/Effect.ts` source (not `.d.ts` alone, not a doc site) for the
actual v4-rc API shapes, then writing real code against this repo's own real
`ScenarioEffect.ts`/`Runner.ts`/`VitestTestApi.ts` and running it for real
under `vitest run` — not simulated, not hand-traced.

`packages/vitest/src/ScenarioEffect.ts` is **untouched**. The prototype is
one new file (`packages/vitest/src/ScenarioMetrics.ts`) plus a small wiring
diff to `packages/vitest/src/Runner.ts`'s two `buildScenarioEffect({...})`
call sites — both on this throwaway branch, neither on `main`.

---

## 1. The real `effect@4.0.0-rc.112` `Metric` API — and where it differs from what the v3-shaped research doc assumed

`research/effect-testing-ecosystem-survey.md` §4 (written against a mix of
assumption and general Effect familiarity, not a fresh read of this exact
rc's source) sketched the wiring as `Metric.trackDuration`-shaped composition
and a `Metric.counter(..., { attributes: { result: "pass"|"fail" } })`
constructed fresh per outcome. Reading the actual installed
`node_modules/effect/src/Metric.ts` turned up real differences:

- **No `Metric.tagged`, no `Metric.increment`, no `Metric.trackDuration`** at
  the top level of this rc (`grep -n "^export const " Metric.ts` — 24 hits,
  none of those three names). Those are v3 names. What v4 actually has:
  - `Metric.counter(name, options?)` → `Counter<number>` (or `Counter<bigint>`
    with `bigint: true`), options: `{ description?, attributes?, bigint?,
    incremental? }`.
  - `Metric.timer(name, options?)` → `Histogram<Duration.Duration>`, options:
    `{ description?, attributes?, boundaries? }`. Auto-adds a
    `time_unit: "milliseconds"` attribute; default boundaries are
    `Metric.exponentialBoundaries({ start: 0.5, factor: 2, count: 35 })`.
  - `Metric.update(metric, input)` — the one write primitive for every metric
    type (counters ADD the input, histograms record it into a bucket).
  - `Metric.value(metric)` — reads current `State` (a `CounterState` /
    `HistogramState` / etc.), via `Effect<State>` (no `E`, no `R` beyond
    ambient context).
  - **Tagging is `Metric.withAttributes(metric, attrs)`** — a `4.0.0`-only
    export (`@since 4.0.0` in its own doc comment) that returns a NEW metric
    view sharing the same underlying series, applied at however many call
    sites want a particular tag combination. Not "tags," "attributes" — v4
    renamed the concept.
- **`Metric.MetricRegistry` is a `Context.Reference<Map<string,
  Metric.Metadata>>` with a process-wide DEFAULT `Map`** — read straight out
  of the doc comment: "the default `Map` is shared by contexts that do not
  provide an override." This matters for both production wiring (no Layer
  needed — metrics work with zero setup, which is exactly the "always-on
  ambient instrumentation" issue #25 recommended) and for THIS spike's own
  test isolation (§3 below).
- **`Effect.timed`** (`effect/Effect.ts`) is the real primitive for "how long
  did this take": `Effect<A,E,R> → Effect<[Duration.Duration, A], E, R>`.
  Internally (`effect/internal/effect.ts:3753`) it reads
  `clock.monotonicTimeNanosUnsafe()` via the ambient `Clock` service — which
  means it is NOT independent of `TestClock` (§4 below is the direct
  consequence of this).

**Verdict:** the research doc's *placement* recommendation (Scenario
emission boundary, `Metric.timer` + `Metric.counter` tagged by outcome) was
right; its exact API surface (`tagged`/`trackDuration`/an `{attributes:
{result}}` literal folded into the `counter(...)` call itself) was not
callable against the real installed package and needed correcting to
`Metric.withAttributes` applied at record time.

---

## 2. The actual prototype code

`packages/vitest/src/ScenarioMetrics.ts` (full file, 90 lines including a
long doc comment — the executable part is ~25 lines):

```ts
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Metric from "effect/Metric"
import type * as Scope from "effect/Scope"

export const scenarioDuration = Metric.timer("effect_cucumber.scenario.duration", {
  description:
    "SPIKE (issue #26): wall-clock duration of one Scenario's composed Effect (Before hooks through After hooks)."
})

export const scenarioResult = Metric.counter("effect_cucumber.scenario.result", {
  description: "SPIKE (issue #26): one increment per Scenario's terminal outcome, tagged by outcome (pass/fail)."
})

export const withScenarioMetrics = (
  scenarioEffect: Effect.Effect<void, unknown, Scope.Scope>
): Effect.Effect<void, unknown, Scope.Scope> =>
  Effect.gen(function*() {
    const [duration, exit] = yield* Effect.timed(Effect.exit(scenarioEffect))
    yield* Metric.update(scenarioDuration, duration)
    yield* Metric.update(
      Metric.withAttributes(scenarioResult, { outcome: Exit.isSuccess(exit) ? "pass" : "fail" }),
      1
    )
    return yield* exit
  })
```

Naming: no existing metric-naming precedent was found anywhere in this repo
(`grep -rn "effect_cucumber\." packages/vitest/src packages/vitest/README.md
spec/` — zero hits before this spike). Followed the dotted,
namespace-scoped OTel-semantic-convention style the research doc itself used
(`effect_cucumber.scenario.duration` / `effect_cucumber.scenario.result`),
since this instrumentation is explicitly meant to flow into an OTel
`metricReader` per the already-shipped Observability recipe.

`Runner.ts`'s two emission call sites (`api.effect(titleFor(...), () => {
... buildScenarioEffect({...}) })`, once for Feature-level Scenarios, once
for Rule-level ones) each became:

```diff
- return buildScenarioEffect({ plan: scenarioPlan, layer: effectiveLayer, hooks })
+ return withScenarioMetrics(buildScenarioEffect({ plan: scenarioPlan, layer: effectiveLayer, hooks }))
```

— and the same one-line change at the `beforeAllScenariosCell`-gated branch
and at both Rule-level equivalents. Nothing else in `Runner.ts` changed.
`packages/vitest/src/TestApi.ts` needed **zero** changes: `withScenarioMetrics`
takes and returns exactly `Effect.Effect<void, unknown, Scope.Scope>`, the
same shape `TestApi["effect"]`'s `self` parameter already expects, so the
wrap is invisible at that seam.

---

## 3. Composition-order finding, relative to retries (issue #12/#13)

The instruction to verify this against `research/vitest-retry-and-layer-rebuild.md`
was the most substantive part of this spike, and it resolves cleanly:

**`withScenarioMetrics` wraps the OUTPUT of `buildScenarioEffect`, not
its inside** — i.e. it sits OUTSIDE `Effect.provide(args.layer)` and outside
`ScenarioEffect.ts`'s own `Effect.onExit(() =>
runHookBatch(args.hooks.After))`. Two independent reasons land on the same
placement:

1. **`Metric` is ambient.** `Metric.MetricRegistry`'s default is a
   process-wide `Context.Reference`, so recording a metric needs nothing
   from the per-Scenario Layer. Wrapping outside `Effect.provide(args.layer)`
   keeps the wrapper's own requirement type (`Scope.Scope`, nothing more)
   independent of whatever a Scenario's own World/services are — verified by
   `tsc --noEmit -p packages/vitest/tsconfig.test.json` passing with zero
   errors once wired into `Runner.ts`.

2. **Retries.** `research/vitest-retry-and-layer-rebuild.md` (issue #12,
   closed) found `@effect/vitest@4.0.0-rc.112` exposes two DIFFERENT retry
   mechanisms, and they interact with a metrics wrapper differently:
   - **`flakyTest`-style** — `Effect.retry` wrapping an already-built Effect
     VALUE, called from inside the thunk `Runner.ts` hands to `TestApi.effect`
     (e.g. `() => Effect.flakyTest(buildScenarioEffect({...}))`). For this
     shape, the metrics wrapper **must** sit OUTSIDE the retry combinator —
     `withScenarioMetrics(Effect.flakyTest(buildScenarioEffect({...})))`,
     never the reverse. Reversed, a Scenario that fails twice then passes on
     attempt 3 would bump `scenario.result` THREE times (two `outcome:
     "fail"`, one `outcome: "pass"`) and record three partial-attempt
     durations, instead of the ONE terminal outcome a dashboard reader
     expects. Wrapping around `buildScenarioEffect`'s own output — which is
     exactly where a `flakyTest` wrap would ALSO go, one layer further in —
     naturally composes correctly here: whatever `Effect.exit` inside
     `withScenarioMetrics` observes is already the fully-retried, terminal
     outcome, as long as `withScenarioMetrics` is the outermost of the two.
   - **vitest's own native `TestOptions.retry`** — re-invokes the WHOLE
     THUNK passed to `it.effect` on each attempt, independently of anything
     inside it. No Effect-level wrapper (this one included) can tell "attempt
     1 of 3" from "the final attempt" from INSIDE the thunk, because the
     thunk itself restarts from scratch each time. A single terminal count
     under this mechanism needs a closure-scoped attempt counter living at
     the `Runner.ts`/`VitestTestApi.ts` emission call site itself (state that
     survives across the framework's repeated calls to the same registered
     test) — not something expressible inside `buildScenarioEffect`'s return
     value at all, and NOT something this spike solves. Recorded here as an
     honest limit, not a hidden gap.

   A future `scenario.attempt` counter (per the original research doc's
   closing paragraph on flakiness) is a SEPARATE metric belonging INSIDE
   whichever retry loop #13 eventually picks — not a change to
   `withScenarioMetrics` itself.

This finding is written into `ScenarioMetrics.ts`'s own doc comment in the
prototype, not just this write-up, so a future reader hits it at the point
where getting the order wrong would actually break something.

---

## 4. Running it for real

`packages/vitest/test/scenario-metrics.spike.test.ts` drives the REAL,
unmodified `buildScenarioEffect` from `ScenarioEffect.ts`, wrapped with
`withScenarioMetrics`, against one passing Scenario (one step that succeeds)
and one failing Scenario (one step that fails), both under `it.effect` — the
same `@effect/vitest` entry point `VitestTestApi.ts` uses, so this exercises
the real ambient `TestClock`/`TestConsole` environment, not a bespoke one.

One real finding surfaced immediately from doing this for real rather than
reasoning about it: **`it.effect` provides `TestClock.layer()`** (ADR-EC-018,
the same ambient clock `docs/testclock-nested-layer-footgun` already warns
about re-providing) — a SIMULATED clock that never advances on its own.
`Effect.timed` reads `Clock.monotonicTimeNanosUnsafe()`, which `TestClock`
overrides, so:

- A step that does nothing but succeed/fail synchronously records a
  **0ms** duration — accurate for what actually happened, but not
  informative.
- A step that calls `Effect.sleep(...)` **hangs indefinitely** under the
  simulated clock, since nothing advances it. (Caught this by first writing
  the test with `Effect.sleep("5 millis")` — it never returned.)

Fixed by having each step call `TestClock.adjust("5 millis")` directly
(synchronous, no real wait) — which is itself the correct finding to report:
**a Scenario's real, human-meaningful `scenario.duration` reading depends on
whether/how its steps advance the ambient TestClock, not on real wall-clock
elapsed time**, because every Scenario already runs under a simulated clock
by this package's own design (ADR-EC-018). A consumer piping this metric to
a real backend under `it.effect`'s normal usage (steps that don't themselves
call `TestClock.adjust`) would see every Scenario report ~0ms regardless of
how long it actually took to run — which is a genuine, non-obvious caveat
for whoever eventually designs this for real.

Provided the test its own fresh `Metric.MetricRegistry` (`Effect.provideService(
effect, Metric.MetricRegistry, new Map())`) rather than relying on the
shared process-wide default — exactly the isolation `Metric.ts`'s own doc
comment recommends — so the counts below are this test's alone, not
contaminated by anything else in the same vitest worker.

**Actual observed output**, from `npx vitest run
packages/vitest/test/scenario-metrics.spike.test.ts --reporter=verbose`:

```
[spike/metric-wiring] recorded scenario.result: {
  passCount: { count: 1, incremental: false },
  failCount: { count: 1, incremental: false }
}
[spike/metric-wiring] recorded scenario.duration: {
  buckets: [ [0.5,0], [1,0], [2,0], [4,0], [8,2], [16,2], ... [Infinity,2] ],
  count: 2,
  min: 5,
  max: 5,
  sum: 10
}

 ✓ scenario-metrics.spike.test.ts (1 test) 5ms
 Test Files  1 passed (1)
      Tests  1 passed (1)
```

One counter increment tagged `outcome: "pass"`, one tagged `outcome:
"fail"` — correctly split, not cross-tagged, not double-counted. The
histogram recorded exactly 2 samples (one per Scenario, pass and fail alike
— the timer sits around `Effect.exit`, which itself never fails), each
landing in the `[4ms, 8ms)` bucket (both steps advanced the clock by exactly
5ms), `min = max = 5`, `sum = 10`. Not simulated, not hand-traced — this is
the real `Metric.value` read-back after really running the real
`buildScenarioEffect` twice.

**Regression check:** wired into `Runner.ts` for real (not just the
standalone test above) and ran the FULL existing suite:

```
$ npx vitest run
 Test Files  44 passed (44)
      Tests  899 passed | 4 skipped (903)
```

— every existing test, including the full acceptance suite
(`packages/vitest/test/acceptance/`) and `Runner.test.ts`'s own
emission-order assertions, still passes with the metrics wrapper live at
both real emission call sites. `tsc --noEmit -p
packages/vitest/tsconfig.test.json` and `oxlint -f unix` (scoped to
`packages/vitest`) both report zero issues on the changed files.

---

## 5. What it actually cost

- **New code:** one new file, `ScenarioMetrics.ts`, 90 lines total — but the
  actual EXECUTABLE surface (the two `Metric` declarations plus
  `withScenarioMetrics`) is ~25 lines; the rest is the composition-order doc
  comment recorded in §3, which earns its length by being the one thing a
  future implementer would otherwise have to re-derive.
- **Seam changes:** `Runner.ts` — one import line plus four one-line wraps
  (`buildScenarioEffect({...})` → `withScenarioMetrics(buildScenarioEffect({...}))`)
  at its two existing `api.effect(...)` call sites (each site has a
  `beforeAllScenariosCell === null` branch and a gated branch, hence four,
  not two). Net diff: +16/−4 lines in `Runner.ts`, all of it either the wrap
  itself or a one-line comment pointing at the finding in §3.
- **`TestApi.ts`: zero changes.** The wrapper's type signature
  (`Effect.Effect<void, unknown, Scope.Scope> → Effect.Effect<void, unknown,
  Scope.Scope>`) is exactly `TestApi["effect"]`'s `self` shape, so it's
  invisible at the injected seam — confirmed by the seam guard script's
  intent (`scripts/verify-testapi-seam.sh` still passes, since `TestApi.ts`
  itself is byte-for-byte unchanged) and by `tsc --noEmit` passing clean.
- **`ScenarioEffect.ts`: zero changes**, as required — the wrap happens
  entirely outside it, at the two call sites that already invoke it.
- **Opt-out cost — currently UNCONDITIONAL, and this is the one real gap.**
  As wired in this spike, every Scenario execution pays for `Effect.timed` +
  two `Metric.update` calls regardless of whether any consumer ever reads
  `Metric.value` or wires an OTel `metricReader`. That cost is small (three
  cheap Effect operations reading an ambient `Context.Reference`, no I/O, no
  allocation beyond a `Map` entry per distinct attribute combination) and
  consistent with how this repo already treats `Effect.fn`'s tracing spans —
  ADR-EC-005 makes those always-on too, and the issue #25 research explicitly
  asked for metrics to follow that SAME precedent ("always-on ambient
  instrumentation, consistent with... ADR-EC-005"). So the always-on design
  is not an oversight, it's the deliberately-requested behavior — but it does
  mean there is currently no lever for a consumer who wants literally zero
  `Metric` overhead, the same way there is none for the tracing spans today.
  Not designed in this spike, since the brief didn't ask for one.

---

## Summary

| Question | Finding |
|---|---|
| Real `Metric.timer`/`Metric.counter` signatures | Confirmed against `effect@4.0.0-rc.112` source; `Metric.withAttributes` (not `tagged`) is the v4 tagging primitive |
| Composes with the existing `ScenarioEffect.ts` pipe chain | Yes — wraps `buildScenarioEffect`'s OUTPUT, needs nothing from `Effect.provide(args.layer)`, zero changes to `ScenarioEffect.ts` or `TestApi.ts` |
| Composition-order relative to retries (#12/#13) | Must wrap OUTSIDE a future `flakyTest`-style retry combinator to avoid double-counting attempts as separate terminal outcomes; vitest's native per-test `retry` needs a DIFFERENT mechanism (a closure-scoped counter at the `Runner.ts` emission site) this spike does not solve |
| Actually ran, real numbers | Yes — `passCount.count = 1`, `failCount.count = 1`, `durationState = { count: 2, min: 5, max: 5, sum: 10 }`, full 899-test suite still green with it wired into the real `Runner.ts` |
| Cost | ~25 executable lines + a load-bearing doc comment; `Runner.ts` +16/−4; zero `TestApi.ts`/`ScenarioEffect.ts` changes; currently unconditional (no opt-out lever), matching this repo's existing always-on-tracing precedent rather than deviating from it |

**Recommendation: the PLACEMENT and API shape are ready to lock — wrap
`buildScenarioEffect`'s output at `Runner.ts`'s two emission call sites,
using `Metric.timer`/`Metric.counter`/`Metric.withAttributes` exactly as
prototyped in `ScenarioMetrics.ts`.** That part cost little, needed no seam
changes, and is proven correct by a real, passing 899-test run with it wired
in for real.

**What still needs a human decision before this becomes real shipped code —
not because it's broken, but because these are product calls this spike
correctly stayed out of:**

1. **The retry-composition ordering in §3 is a REQUIREMENT on whatever #13
   ships, not something #13 can retrofit around freely** — #13's design
   should pick an ordering (metrics outside `flakyTest`-style retry; a
   separate per-attempt counter for vitest's native retry) with this finding
   in hand, rather than discovering it after the fact.
2. **Whether `scenario.duration` under the ambient `TestClock` is worth
   shipping as-is.** §4's finding — that the reading depends on whether
   Scenario steps themselves advance the TestClock, and reads ~0ms
   otherwise — is a real caveat a docs section would need to state plainly,
   not a blocker, but worth a decision on how (or whether) to document it
   rather than let a consumer discover it by exporting a flat-zero histogram
   to their real backend.
3. **The unconditional-cost point in §5** — acceptable if this repo commits
   to treating `Metric` the same as `Effect.fn` spans (both always-on,
   ADR-EC-005 precedent), which is what issue #25's research explicitly
   asked for; worth one explicit sentence of sign-off given it's a standing
   per-Scenario cost with no opt-out, even if a small one.

None of the three above are implementation problems this spike left
unsolved by omission — they're exactly the kind of design-discussion
fodder issue #26 asked a spike to surface.

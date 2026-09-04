# 16 — `Effect.Metric` at the Scenario emission boundary

Two ALWAYS-ON metrics — a duration histogram and a pass/fail counter — recorded once per Scenario, for
its TERMINAL outcome only, no opt-out.

> **See:** [ADR-EC-037](../decisions/037-effect-metric-wraps-outside-flakytest-in-vitesttestapi.md)

See [`spec/roadmap.md`](../roadmap.md) for what is built versus what is only specified — this
document describes the contract, not the build status.

---

## BEH-EC-029: Every Scenario contributes exactly one terminal `scenario.result` increment and one `scenario.duration` sample, tagged `outcome: "pass" | "fail"`, no opt-out

```
REQUIREMENT: Every emitted Scenario MUST, on completion, record exactly ONE
             increment to a counter metric named effect_cucumber.scenario.result,
             tagged outcome: "pass" if the Scenario's composed Effect (Before
             hooks through After hooks, @retry's flakyTest wrap already
             resolved if the Scenario carries that tag) succeeded, or
             outcome: "fail" otherwise — and exactly ONE sample to a duration
             histogram named effect_cucumber.scenario.duration, measuring
             that same composed Effect's elapsed time under the ambient
             (possibly simulated) Clock. Neither metric MAY be disabled: no
             Gherkin tag, describeFeature option, or environment variable
             turns this off, consistent with Effect.fn tracing spans already
             being always-on (ADR-EC-005).
```

```
REQUIREMENT: A Scenario tagged @retry that fails on one or more attempts and
             eventually passes (or exhausts flakyTest's own retry schedule
             and fails) MUST contribute exactly the ONE terminal increment
             above — never one increment per attempt. An intermediate
             attempt's own failure MUST NOT be separately counted as an
             outcome: "fail" increment, and MUST NOT contribute its own
             duration sample. This is INV-EC-008, and it is the entire
             reason the recording wrapper composes OUTSIDE @retry's
             flakyTest wrap (ADR-EC-034) rather than inside it, or inside
             Runner.ts's own emission call sites.
```

```
REQUIREMENT: A node emitted through the SAME seam that is NOT a Scenario —
             concretely, Runner.ts's trailing unused-step-definition warning
             nodes, the one other caller of the TestApi seam's `effect`
             method — MUST NOT be measured by either metric. `EmitOptions`
             carries a `scenario: boolean` field for exactly this
             discrimination, `true` for a real per-Scenario emission and
             `false` for a warning node.
```

### Why `VitestTestApi.ts`, not `Runner.ts`

An earlier spike (`research/metric-wiring-spike.md`, branch `spike/metric-wiring`) wired this into
`Runner.ts`'s own `buildScenarioEffect` call sites, before `@retry` existed. `Runner.ts` cannot import
`@effect/vitest` at all (`scripts/verify-testapi-seam.sh`), and `@retry`'s `flakyTest` wrap therefore
lives one module over, in `VitestTestApi.ts` — a metrics wrapper at the spike's original call site
would sit INSIDE that retried region, double- or triple-counting a retried Scenario's intermediate
attempts. `effect/Metric` is not a forbidden import for `VitestTestApi.ts` (only a TEST FRAMEWORK is),
so the corrected call site is the SAME seam point `@retry`'s own `withRetry` wraps at, composing
OUTSIDE it. See [ADR-EC-037](../decisions/037-effect-metric-wraps-outside-flakytest-in-vitesttestapi.md)
for the full reasoning, including why `EmitOptions` needed a new field this correction alone required.

### The `TestClock` caveat

Every Scenario runs under the ambient SIMULATED `TestClock` (ADR-EC-018). `scenario.duration` reads
the elapsed time the ambient `Clock` service reports, which `TestClock` overrides — so a Scenario whose
steps never call `TestClock.adjust(...)` records ~0ms regardless of how long it actually took to run.
This is a real, documented limitation of running under a simulated clock, not a defect in this
feature. Per ADR-EC-034's own "fourth finding," the simulated clock is not reset between a `@retry`
Scenario's own attempts either, so a retried Scenario's one recorded duration sample reflects whatever
cumulative simulated time its attempts collectively advanced by the time the final one settles.

### Metric naming and tagging

`effect_cucumber.scenario.duration` (a `Metric.timer` / `Histogram<Duration.Duration>`) and
`effect_cucumber.scenario.result` (a `Metric.counter`, tagged `outcome: "pass" | "fail"` via
`Metric.withAttributes` at record time — this rc's replacement for a `tagged` counter constructor, see
ADR-EC-037's Context section). Tagging is deliberately coarse: `outcome` only, never a per-Scenario or
per-Feature attribute, to avoid a cardinality explosion on a metric meant to answer an AGGREGATE
question ("what fraction of Scenarios are passing"). Per-instance detail already has a home: the
`Effect.fn(stepText)` trace span every step and hook already produces (ADR-EC-005), exported by the
identical `NodeSdk.layer` recipe `packages/vitest/README.md`'s Observability section already
documents — this feature's `metricReader` composes into that SAME recipe with no library-side change.

### Where this is proven

Two levels, matching this repository's own convention for a claim about the real running framework
versus a claim provable in process:

| Level                                                                                                   | Artifact                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Real output — a plain Scenario and a `@retry`'d fail-then-pass Scenario, run through the real framework | `packages/vitest/test/acceptance/metrics.feature` + `.steps.test.ts` (`@REQ-EC-029`, `spec/traceability.md` §5) — an observer `it.effect` reads `Metric.value` after both Scenarios run, and asserts exactly two `outcome: "pass"` increments, zero `outcome: "fail"`, and two duration samples.                                           |
| In-process — the composition order itself, both correct and (as a demonstration) incorrect              | `packages/vitest/test/ScenarioMetrics.test.ts` — `withScenarioMetrics` driven directly against synthetic pass/fail/retry Effects under an isolated `Metric.MetricRegistry`; one test proves the correct `withScenarioMetrics(flakyTest(...))` order records one terminal outcome, a second proves the WRONG order genuinely double-counts. |

A real FAILING Scenario cannot appear in the acceptance suite (its own README: "producing real passing
`it.effect` tests"), so "a failing Scenario records one fail" is proven at the in-process level instead
— `ScenarioMetrics.test.ts`'s own plain-fail test, which captures the `Exit` as a value rather than
letting vitest report it as a real test failure.

### Signatures

```ts
// packages/vitest/src/ScenarioMetrics.ts
export const scenarioDuration: Metric.Histogram<Duration.Duration>
export const scenarioResult: Metric.Counter<number>
export const withScenarioMetrics: (
  scenarioEffect: Effect.Effect<void, unknown, Scope.Scope>
) => Effect.Effect<void, unknown, Scope.Scope>

// packages/vitest/src/TestApi.ts
export interface EmitOptions {
  readonly tags: ReadonlyArray<string>
  readonly skip: boolean
  readonly retry: boolean
  readonly contextFree: boolean
  readonly scenario: boolean
}
```

### Worked example

No opt-in step exists — `describeFeature` is called exactly the way every other worked example in this
directory already calls it, and both metrics are recorded regardless:

```typescript
import { describeFeature, loadFeature } from "@effect-cucumber/vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { fileURLToPath } from "node:url"

const feature = await loadFeature(fileURLToPath(new URL("./checkout.feature", import.meta.url)))

describeFeature(feature, Layer.empty, ({ Scenario }) => {
  Scenario("Checking out", ({ Then, When }) => {
    When("I check out", function*() {
      yield* Effect.void
    })
    Then("the order is placed", function*() {
      yield* Effect.void
    })
  })
})
```

`effect_cucumber.scenario.result` records one `outcome: "pass"` increment and
`effect_cucumber.scenario.duration` records one sample for this Scenario the moment it completes —
nothing above opts into that. Making them visible to a real metrics backend is a `Layer`, not new code
from this package: `packages/vitest/README.md`'s Observability recipe already shows `NodeSdk.layer`
wired for `Effect.fn`'s trace spans; that same `Configuration` accepts a `metricReader`, built only when
supplied, so a consumer who wants these two metrics exported adds one line to the identical Layer the
recipe already provides — see that section rather than duplicating its full example here.

---

_Previous: [15 — Attachments: a World.attach() equivalent](./15-attachments.md)_

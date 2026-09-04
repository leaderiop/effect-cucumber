---
"@effect-cucumber/vitest": minor
---

Every Scenario now records two `Effect.Metric`s the moment it completes — `effect_cucumber.scenario.duration`
(a duration histogram) and `effect_cucumber.scenario.result` (a counter, tagged `outcome: "pass" | "fail"`).
Always-on, no opt-out, no Gherkin tag and no `describeFeature` argument — consistent with `Effect.fn` tracing
spans already being always-on.

A Scenario tagged `@retry` contributes exactly ONE increment and ONE duration sample, for its final attempt
only — never one per attempt. An intermediate attempt that fails before a later one passes is never separately
counted as `outcome: "fail"`.

Getting both metrics to a real backend is one line added to the `NodeSdk.layer` the README's Observability
recipe already shows for trace spans — its `Configuration` already accepts a `metricReader`:

```ts
import { NodeSdk } from "@effect/opentelemetry"
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http"
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics"

const TelemetryLive = NodeSdk.layer({
  resource: { serviceName: "my-suite" },
  metricReader: new PeriodicExportingMetricReader({ exporter: new OTLPMetricExporter() })
})
```

One caveat: every Scenario runs under the ambient SIMULATED `TestClock`, so `scenario.duration` reads ~0ms
unless a step itself calls `TestClock.adjust(...)` — a real limitation of running under a simulated clock, not
a bug. The simulated clock is also not reset between a `@retry` Scenario's own attempts, so a retried Scenario's
one recorded sample reflects cumulative simulated time across every attempt.

See [ADR-EC-037](../spec/decisions/037-effect-metric-wraps-outside-flakytest-in-vitesttestapi.md) and
[BEH-EC-029](../spec/behaviors/16-scenario-metrics.md).

---
"@effect-cucumber/vitest": minor
---

`describeFeature` gains an opt-in `strict?: boolean` option, and a new suite-wide
`assertNoUnusedStepDefinitions` function is exported, both promoting an unused-step-definition
warning ([ADR-EC-019](../spec/decisions/019-fail-loudly-on-unmatched-or-ambiguous-steps.md)) to a
real failure — the default (`strict` absent/`false`, `assertNoUnusedStepDefinitions` never called)
is byte-for-byte unchanged from ADR-EC-019's own non-fatal-by-default behavior.

```ts
// Per-Feature: fail THIS Feature's own ⚠ warning node immediately.
describeFeature(feature, layer, define, { strict: true })

// Suite-wide: gate every collected Feature at once, e.g. in a dedicated verification test.
import { assertNoUnusedStepDefinitions, collectFeature } from "@effect-cucumber/vitest"

assertNoUnusedStepDefinitions([collectFeature(featureA, layerA, defineA), collectFeature(featureB, layerB, defineB)])
```

The two mechanisms are independent, not layered: a Feature may use either, both, or neither.
`collectFeature`/`FeatureCollection` — previously reachable only inside this package's own test
suite — are promoted to the public barrel, since `assertNoUnusedStepDefinitions`'s whole design
assumes a consumer calls `collectFeature()` themselves. See
[ADR-EC-053](../spec/decisions/053-strict-mode-and-suite-wide-assertion-promote-unused-step-warnings.md).

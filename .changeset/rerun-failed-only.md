---
"@effect-cucumber/vitest": minor
---

Add `rerunFailedOnly`/`rerunManifestPath` to `describeFeature`'s optional fourth argument — filter
Scenario registration to only the Scenarios a prior run's manifest names as failed:

```ts
describeFeature(feature, Layer.empty, ({ Given, Then, When }) => {
  // ...steps...
}, {
  rerunFailedOnly: true,
  rerunManifestPath: ".effect-cucumber/rerun-manifest.json" // the default; usually omitted
})
```

Each Scenario's rerun key is a `(uri, ruleName, title)` triple, stable ACROSS separate
`loadFeature()` calls — unlike this library's own internal `ScenarioKey.ts` key, whose `ruleId`
comes from a fresh `IdGenerator.uuid()` on every parse. The write side — converting a
`vitest run --reporter=json` report into a manifest — ships as a copy-paste template,
`scripts/templates/write-rerun-manifest.mjs`, that you wire into your own CI.

A manifest key that matches no Scenario in the current `.feature` file (renamed, removed, or from a
different revision) warns once and is ignored; a Feature or Rule the filter leaves with zero
Scenarios gets one synthetic skipped node in place of the empty block, instead of tripping vitest's
own "No test found in suite" crash.

See [ADR-EC-038](../spec/decisions/038-rerun-failed-only-uri-scoped-key-stamped-via-task-meta-not-a-reporter.md)
and [BEH-EC-030](../spec/behaviors/17-rerun-failed-only.md), and `packages/vitest/README.md`'s
"Rerun failed Scenarios only" section.

---
"@effect-cucumber/vitest": minor
---

`describeFeature` gains a `retry?: Schedule.Schedule<any, any, never>` registration option,
customizing the `Schedule` a `@retry`-tagged Scenario retries with — Feature-wide, replacing
`flakyTest`'s own fixed `Schedule.recurs(10)`/30s-cap default:

```ts
describeFeature(feature, MainLayer, ({ Scenario }) => { ... }, {
  retry: Schedule.recurs(2)
})
```

Setting this option does not itself make an untagged Scenario retry — it customizes the POLICY a
`@retry`-tagged Scenario already uses, never the decision to retry at all. Absent/`undefined` (the
default) keeps `flakyTest`'s exact existing behavior, byte-for-byte unchanged.

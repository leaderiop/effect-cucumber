---
"@effect-cucumber/vitest": minor
"@effect-cucumber/gherkin": minor
---

Five registration-time validation failures that previously threw plain, unexported `Error`
instances are now named `Data.TaggedError` classes exported from `@effect-cucumber/vitest`, so a
consumer can `catch` and discriminate them by `_tag` or `instanceof` instead of only reading a
message string:

- `MutuallyExclusiveTagFilterError` — `describeFeature`'s `tagExpression` combined with
  `includeTags`/`excludeTags`
- `InvalidGherkinTagsPatternError` — `gherkinTags`'s pattern option
- `InvalidGherkinWatchTriggersPatternError` — `gherkinWatchTriggers`'s pattern option
- `UnsupportedScenarioExtraLayerError` — `narrowRuleDsl`'s extra-layer narrowing
- `UnusedStepDefinitionsError` — `assertNoUnusedStepDefinitions`

No behavior changes: the same conditions still throw at the same call sites with the same
messages. `@effect-cucumber/gherkin` carries the matching version bump only because the two
packages are released together; its own exports are unchanged.

# @effect-cucumber/gherkin

## 0.7.0

No changes in this release.

## 0.6.0

No changes in this release.

## 0.5.0

### Minor Changes

- 1d32668: Five registration-time validation failures that previously threw plain, unexported `Error`
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

## 0.4.0

### Minor Changes

- 53aeb6b: A step's `DocString` argument can now be decoded through `effect/Schema` on demand, mirroring
  `decodeHashes` (DataTable) and `decodeExamplesRow` (ExamplesRow) one level shallower — a DocString
  decodes a single string, so there is no row/column to locate, only the DocString's own `uri`/`line`
  (both new fields on `DocString` itself, populated from the step's own location).
  
  ```ts
  import { decodeDocString } from "@effect-cucumber/vitest"
  import { Schema } from "effect"
  
  const Payload = Schema.Struct({ sku: Schema.String, qty: Schema.Number })
  
  Then("the request body is:", function*(docString) {
    const payload = yield* decodeDocString(Schema.fromJsonString(Payload))(docString)
    // ...
  })
  ```
  
  A decode failure raises a `DocStringError` (reason `DecodeFailed`) naming the DocString's `uri` and
  `line`, quoting the full, untruncated content. See ADR-EC-046.

## 0.3.1

### Patch Changes

- 120dcc5: `ParameterTypeStore.Default` now shares one process-wide, built-ins-only `ParameterTypeRegistry`
  across every build that never declares a custom parameter type, instead of constructing a fresh
  one per `loadFeature`/`parseFeature` call. This lets `StepMatcher`'s registry-keyed compiled-
  expression cache actually share hits across Feature files that use no custom parameter types —
  measured 2.86x faster (50.4ms → 17.6ms) on `StepMatcher`'s compile path across a 24-Feature suite
  sharing one step vocabulary with no customization.
  
  `ParameterTypeStore.layer(definitions)` and `createParameterTypeStore()` are unaffected: both
  still build a fresh, isolated registry on every call, exactly as before. A store obtained from
  `ParameterTypeStore.Default` that has `define()` called on it directly also still gets a fresh,
  unshared registry. No public API changed. See [ADR-EC-045](../spec/decisions/045-parametertypestoredefault-shares-one-registry-across-zero-customization-builds.md).

## 0.2.0

### Minor Changes

- 96cbf93: Add `ExamplesRow`/`decodeExamplesRow`/`ExamplesRowError` (`@effect-cucumber/gherkin`, re-exported
  from `@effect-cucumber/vitest`): a Scenario Outline column no step's cucumber-expression pattern
  references now still reaches a step body, typed through `Schema`.
  
  `ParsedScenario.exampleRow` (`Option.none()` for a plain Scenario, `Option.some(ExamplesRow)` for an
  Outline row) carries the row's raw `header`/`values`/`raw` record. `StepParams<P>`'s existing
  trailing tail (already used for DataTable/DocString) now also carries this Scenario's `ExamplesRow`
  for every step of an Outline row:
  
  ```ts
  import { decodeExamplesRow, type ExamplesRow } from "@effect-cucumber/vitest"
  import * as Schema from "effect/Schema"
  
  // `priority` is never mentioned in any step's text — only in the Examples header.
  const ShipmentRow = Schema.Struct({ sku: Schema.String, priority: Schema.NumberFromString })
  
  When("the shipment is decoded", function*(row: ExamplesRow) {
    const { priority, sku } = yield* decodeExamplesRow(ShipmentRow)(row)
    // ...
  })
  ```
  
  `decodeExamplesRow(rowSchema)(row)` decodes `row.raw` through a caller-supplied `Schema`, the same
  mechanism `decodeHashes` already gives a DataTable (ADR-EC-008) — no `Schema` is declared anywhere
  ahead of a step body that wants one, not on `describeFeature`, not on `loadFeature`. A step that does
  not annotate a trailing parameter is unaffected: the tail was already unchecked.
  
  `OutlineTitle.ts` was rewritten in the same change to read `exampleRow` instead of independently
  re-walking the `GherkinDocument` a second time for its own `(col=value, ...)` title suffix — an
  internal simplification, no observable change to emitted titles.
  
  See [ADR-EC-032](../spec/decisions/032-outline-examplesrow-carries-the-raw-row-decoded-on-demand-not-a-per-feature-schema.md).

## 0.1.0

### Minor Changes

- 878220b: First pre-release of both packages (0.1.0). Effect v4 release-candidate line only: `.feature` parsing,
  step matching and DataTable/DocString wrapping in `@effect-cucumber/gherkin`; `describeFeature`, the
  Given/When/Then DSL, Rules, Scenario Outlines, all six hooks, tag routing, both Layer scopes and the
  Promise-returning `loadFeature` in `@effect-cucumber/vitest`.

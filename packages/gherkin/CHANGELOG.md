# @effect-cucumber/gherkin

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

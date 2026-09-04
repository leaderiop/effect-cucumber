/**
 * ADR-EC-038 §6's THIRD cross-run fixture: a Feature with one trivially always-passing Scenario, run
 * ALONE (never alongside `calculator-a`/`calculator-b`) against a HAND-CRAFTED manifest naming a key
 * with this file's own `uri` prefix but a title that matches no real Scenario here — simulating a
 * Scenario renamed or removed since the manifest was written. Proves the Feature-level synthetic
 * skip node AND the `StaleRerunManifestKeyWarning` fire together for a manifest entry that is
 * genuinely stale, distinct from `calculator-b`'s "passed last run, so correctly absent" case.
 */
import { assert } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { fileURLToPath } from "node:url"
import { describeFeature } from "../../src/describeFeature.ts"
import { loadFeature } from "../../src/loadFeature.ts"
import { rerunOptionsFromEnv } from "./rerunOptions.ts"

const featurePath = fileURLToPath(new URL("./stale-manifest.feature", import.meta.url))
const feature = await loadFeature(featurePath)

describeFeature(feature, Layer.empty, ({ Given, Then }) => {
  Given("a step that always succeeds", function*() {
    yield* Effect.void
  })
  Then("it passes", function*() {
    yield* Effect.void
    assert.ok(true)
  })
}, rerunOptionsFromEnv())

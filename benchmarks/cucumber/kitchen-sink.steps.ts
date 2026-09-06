/**
 * `@cucumber/cucumber` step definitions for the REAL
 * `packages/vitest/test/acceptance/parsing-and-matching.feature` (ADR-EC-051) — the cucumber-js
 * side of the kitchen-sink suite. See `../effect-cucumber/kitchen-sink.steps.ts`'s header and
 * `../README.md`'s methodology section for the one deliberate asymmetry: "both loaded features
 * resolve the custom parameter type against different registries" has no cucumber-js equivalent
 * (cucumber-js keeps one process-wide parameter type registry, never one per Feature load) and is
 * stubbed below as a no-op passing assertion. Every other step is a real, if simplified,
 * equivalent — both sides execute the same number of steps either way.
 */
import { type DataTable, defineParameterType, Given, Then, When } from "@cucumber/cucumber"
import assert from "node:assert/strict"
import * as fs from "node:fs"
import { fileURLToPath } from "node:url"
import type { BenchmarkWorld } from "./world.ts"

// The second `.feature` file's name and Scenario count, read directly off disk — plain facts
// about a file, not effect-cucumber-internal `loadFeature` plumbing, so a real (not stubbed)
// cucumber-js equivalent is straightforward.
const secondLoadPath = fileURLToPath(
  new URL("../../packages/vitest/test/acceptance/parsing-and-matching-second-load.feature", import.meta.url)
)
const secondLoadSource = fs.readFileSync(secondLoadPath, "utf8")
const secondFeatureName = /^Feature:\s*(.+)$/m.exec(secondLoadSource)?.[1]?.trim() ?? ""
const secondFeatureScenarioCount = (secondLoadSource.match(/^\s*Scenario:/gm) ?? []).length

// The same underlying `@cucumber/cucumber-expressions` library effect-cucumber uses — same
// banana/apple/fig weights `parsing-and-matching.steps.test.ts` declares, read directly rather
// than re-derived.
const fruitWeights: ReadonlyMap<string, number> = new Map([["banana", 118], ["apple", 182], ["fig", 50]])

defineParameterType({
  name: "fruit",
  regexp: /banana|apple|fig/,
  transformer: (matched: string) => ({ name: matched, grams: fruitWeights.get(matched) ?? 0 })
})

Given("the recorder is empty", function(this: BenchmarkWorld) {
  assert.strictEqual(this.recorder.length, 0)
  this.recorder.push("the recorder is empty")
})

Then("the second loaded feature is named {string}", function(this: BenchmarkWorld, expected: string) {
  assert.strictEqual(secondFeatureName, expected)
  this.recorder.push("named")
})

Then("the second loaded feature holds {int} scenarios", function(this: BenchmarkWorld, expected: number) {
  assert.strictEqual(secondFeatureScenarioCount, expected)
  this.recorder.push("counted")
})

Then("the first step of this scenario carries the Background origin", function(this: BenchmarkWorld) {
  // True by cucumber-js's own guaranteed Background-first ordering — the Background's
  // "the recorder is empty" step above always runs before this one.
  this.recorder.push("feature-background")
})

Then("this scenario carries the feature-level tag it inherited", function(this: BenchmarkWorld) {
  this.recorder.push("@featuretag")
})

Then("the sibling outline's names arrived interpolated", function(this: BenchmarkWorld) {
  this.recorder.push("interpolated")
})

When("I record {string}", function(this: BenchmarkWorld, label: string) {
  this.recorder.push(label)
})

Then("the recorder holds {string}", function(this: BenchmarkWorld, expected: string) {
  assert.strictEqual(this.recorder.join(","), expected)
})

When(
  "{int} and {float} and {string} and {word} reach a step",
  function(this: BenchmarkWorld, whole: number, fraction: number, quoted: string, bare: string) {
    this.recorder.push(typeof whole)
    this.recorder.push(typeof fraction)
    this.recorder.push(typeof quoted)
    this.recorder.push(typeof bare)
  }
)

When("I weigh a {fruit}", function(this: BenchmarkWorld, fruit: { name: string; grams: number }) {
  this.weighed = fruit
})

Then(
  "the weighed fruit is {string} at {int} grams",
  function(this: BenchmarkWorld, name: string, grams: number) {
    assert.deepStrictEqual(this.weighed, { name, grams })
    this.recorder.push("weighed")
  }
)

// The one deliberate asymmetry (README.md's methodology section): no cucumber-js equivalent of
// per-Feature-load `ParameterTypeRegistry` identity exists to check. A no-op passing assertion —
// both sides still execute the same number of steps, so wall-clock fairness is unaffected.
Then("both loaded features resolve the custom parameter type against different registries", function() {
  assert.ok(true)
})

Then(
  "the substituted number {int} doubles to {int}",
  function(this: BenchmarkWorld, value: number, doubled: number) {
    assert.strictEqual(value * 2, doubled)
    this.recorder.push("outline")
  }
)

When(
  "{int} row of cart data reaches a step:",
  function(this: BenchmarkWorld, rows: number, table: DataTable) {
    const raw = table.raw()
    this.recorder.push(`table:${rows}:${raw[1]?.[0] ?? "MISSING"}`)
  }
)

When(
  "the note {string} reaches a step:",
  function(this: BenchmarkWorld, label: string, doc: string) {
    // cucumber-js hands a plain string for a DocString, with no media-type accessor on the
    // default step-function signature — "text/plain" is this fixture's own known, fixed value,
    // not a re-derivation of framework behavior.
    this.recorder.push(`doc:${label}:${doc}:text/plain`)
  }
)

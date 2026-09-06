/**
 * `@cucumber/cucumber` step definitions for `../fixtures/counter.feature` (ADR-EC-051) — the
 * cucumber-js side of the counter suite, mirroring `../effect-cucumber/counter.steps.ts`'s domain
 * rules exactly so both sides execute the same number of steps with the same pass/fail outcome.
 */
import { Given, Then, When } from "@cucumber/cucumber"
import assert from "node:assert/strict"
import type { BenchmarkWorld, CounterState } from "./world.ts"

Given(
  "a new counter bounded between {int} and {int}",
  function(this: BenchmarkWorld, min: number, max: number) {
    this.counter = { value: 0, min, max }
    this.lastError = undefined
  }
)

When(
  "I create another counter bounded between {int} and {int}",
  function(this: BenchmarkWorld, min: number, max: number) {
    if (this.counter !== undefined) {
      this.lastError = "counter already exists"
    } else {
      this.counter = { value: 0, min, max }
    }
  }
)

When("I increment the counter by {int}", function(this: BenchmarkWorld, amount: number) {
  const state = this.counter as CounterState
  const next = state.value + amount
  if (next > state.max) {
    this.lastError = "counter would exceed its max bound"
  } else {
    this.counter = { ...state, value: next }
    this.lastError = undefined
  }
})

When("I decrement the counter by {int}", function(this: BenchmarkWorld, amount: number) {
  const state = this.counter as CounterState
  const next = state.value - amount
  if (next < state.min) {
    this.lastError = "counter would go below its min bound"
  } else {
    this.counter = { ...state, value: next }
    this.lastError = undefined
  }
})

Then("the counter value is {int}", function(this: BenchmarkWorld, expected: number) {
  assert.strictEqual(this.counter?.value, expected)
})

Then("the second creation is rejected with {string}", function(this: BenchmarkWorld, expected: string) {
  assert.strictEqual(this.lastError, expected)
})

Then("the increment is rejected with {string}", function(this: BenchmarkWorld, expected: string) {
  assert.strictEqual(this.lastError, expected)
})

Then("the decrement is rejected with {string}", function(this: BenchmarkWorld, expected: string) {
  assert.strictEqual(this.lastError, expected)
})

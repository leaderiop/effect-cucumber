/**
 * describeFeature-based step definitions for `../fixtures/counter.feature` (ADR-EC-051).
 *
 * Named `.steps.ts`, NOT `.steps.test.ts` on purpose: vitest's default include glob only matches
 * `*.{test,spec}.*` (`packages/vitest/test/acceptance/README.md`), so this file is invisible to a
 * plain `pnpm test` sweep. It only runs when the harness's own `vitest run <this file>` (see
 * `../src/runners.ts` and `../vitest.config.ts`, which broadens the include for this one
 * directory) passes its path explicitly.
 *
 * `EFFECT_CUCUMBER_BENCH_FEATURE_PATH`, if set, overrides the `.feature` file loaded — this is
 * what lets `../src/compare.ts`'s generated "pressure" suite (`../src/generatedSuites.ts`) reuse
 * this exact step vocabulary against a scaled-up feature file, with no new step definitions.
 */
import { describeFeature, loadFeature } from "@effect-cucumber/vitest"
import { assert } from "@effect/vitest"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Ref from "effect/Ref"
import { fileURLToPath } from "node:url"

const featurePath = process.env.EFFECT_CUCUMBER_BENCH_FEATURE_PATH
  ?? fileURLToPath(new URL("../fixtures/counter.feature", import.meta.url))
const feature = await loadFeature(featurePath)

interface CounterState {
  readonly value: number
  readonly min: number
  readonly max: number
}

class World extends Context.Service<World, {
  readonly counter: Ref.Ref<Option.Option<CounterState>>
  readonly lastError: Ref.Ref<Option.Option<string>>
}>()("World") {
  static readonly layer = Layer.effect(
    this,
    Effect.gen(function*() {
      return World.of({
        counter: yield* Ref.make<Option.Option<CounterState>>(Option.none()),
        lastError: yield* Ref.make<Option.Option<string>>(Option.none())
      })
    })
  )
}

describeFeature(feature, World.layer, (dsl) => {
  dsl.Given("a new counter bounded between {int} and {int}", function*(min: number, max: number) {
    const { counter, lastError } = yield* World
    yield* Ref.set(counter, Option.some({ value: 0, min, max }))
    yield* Ref.set(lastError, Option.none())
  })

  dsl.When("I create another counter bounded between {int} and {int}", function*(min: number, max: number) {
    const { counter, lastError } = yield* World
    const existing = yield* Ref.get(counter)
    if (Option.isSome(existing)) {
      yield* Ref.set(lastError, Option.some("counter already exists"))
    } else {
      yield* Ref.set(counter, Option.some({ value: 0, min, max }))
    }
  })

  dsl.When("I increment the counter by {int}", function*(amount: number) {
    const { counter, lastError } = yield* World
    const state = Option.getOrThrow(yield* Ref.get(counter))
    const next = state.value + amount
    if (next > state.max) {
      yield* Ref.set(lastError, Option.some("counter would exceed its max bound"))
    } else {
      yield* Ref.set(counter, Option.some({ ...state, value: next }))
      yield* Ref.set(lastError, Option.none())
    }
  })

  dsl.When("I decrement the counter by {int}", function*(amount: number) {
    const { counter, lastError } = yield* World
    const state = Option.getOrThrow(yield* Ref.get(counter))
    const next = state.value - amount
    if (next < state.min) {
      yield* Ref.set(lastError, Option.some("counter would go below its min bound"))
    } else {
      yield* Ref.set(counter, Option.some({ ...state, value: next }))
      yield* Ref.set(lastError, Option.none())
    }
  })

  dsl.Then("the counter value is {int}", function*(expected: number) {
    const { counter } = yield* World
    const state = Option.getOrThrow(yield* Ref.get(counter))
    assert.strictEqual(state.value, expected)
  })

  dsl.Then("the second creation is rejected with {string}", function*(expected: string) {
    const { lastError } = yield* World
    assert.strictEqual(Option.getOrUndefined(yield* Ref.get(lastError)), expected)
  })

  dsl.Then("the increment is rejected with {string}", function*(expected: string) {
    const { lastError } = yield* World
    assert.strictEqual(Option.getOrUndefined(yield* Ref.get(lastError)), expected)
  })

  dsl.Then("the decrement is rejected with {string}", function*(expected: string) {
    const { lastError } = yield* World
    assert.strictEqual(Option.getOrUndefined(yield* Ref.get(lastError)), expected)
  })
})

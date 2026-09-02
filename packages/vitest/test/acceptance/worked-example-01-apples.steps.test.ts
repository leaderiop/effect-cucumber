/**
 * The library running its own spec: a real `.feature` FILE on disk, loaded from disk, driving real passing tests
 * through the real `describeFeature`.
 *
 * Carries: ADR-EC-009, ADR-EC-021, ADR-EC-024, BEH-EC-001, BEH-EC-002, BEH-EC-003, BEH-EC-004, INV-EC-006, REQ-EC-022.
 */
import { assert } from "@effect/vitest"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Ref from "effect/Ref"
import { fileURLToPath } from "node:url"
import { describeFeature } from "../../src/describeFeature.ts"
import { loadFeature } from "../../src/loadFeature.ts"

// The `.feature` file beside this one, resolved relative to this module rather than to `process.cwd()`, so the pair
// keeps working whichever directory the runner was invoked from.
const featurePath = fileURLToPath(new URL("./worked-example-01-apples.feature", import.meta.url))

// The load-bearing line: real bytes off disk, through the real parser, at module top level.
const feature = await loadFeature(featurePath)

// The test author's own `World`, shape for shape from `spec/behaviors/01-steps-and-world.md` lines 291-298, plus one
// field.
class World extends Context.Service<World, {
  readonly apples: Ref.Ref<number>
  readonly basket: Ref.Ref<ReadonlyArray<string>>
}>()("World") {
  static readonly layer = Layer.effect(
    this,
    Effect.gen(function*() {
      return World.of({ apples: yield* Ref.make(0), basket: yield* Ref.make<ReadonlyArray<string>>([]) })
    })
  )
}

// THE CALL UNDER TEST.
describeFeature(feature, World.layer, ({ Scenario }) => {
  Scenario("Eating apples", ({ Given, Then, When }) => {
    Given("I have {int} apples", function*(n: number) {
      const { apples } = yield* World
      yield* Ref.set(apples, n)
    })

    When("I eat {int} apples", function*(n: number) {
      const { apples } = yield* World
      yield* Ref.update(apples, (remaining) => remaining - n)
    })

    Then("I have {int} apples left", function*(expected: number) {
      const { apples } = yield* World
      // Read back through the SAME `Ref` the two steps above wrote.
      const actual = yield* Ref.get(apples)
      assert.strictEqual(actual, expected)
    })
  })

  Scenario("A bare generator step body is registered and run", ({ Then, When }) => {
    When("I double {int} apples", function*(n: number) {
      const { apples } = yield* World
      yield* Ref.set(apples, n * 2)
    })

    Then("the doubled count is {int}", function*(expected: number) {
      const { apples } = yield* World
      assert.strictEqual(yield* Ref.get(apples), expected)
    })
  })

  Scenario("A World field is typed and reachable", ({ Given, Then }) => {
    Given("I put {string} and {string} in the basket", function*(first: string, second: string) {
      const { basket } = yield* World
      yield* Ref.update(basket, (held) => [...held, first, second])
    })

    Then("the basket holds {string}", function*(expected: string) {
      const { basket } = yield* World
      assert.strictEqual((yield* Ref.get(basket)).join(","), expected)
    })
  })

  Scenario("A step reaches a service the ambient Layer provides", ({ Given, Then }) => {
    Given("a step resolves the ambient World service", function*() {
      const { apples, basket } = yield* World
      const reading = `${yield* Ref.get(apples)} apples, ${(yield* Ref.get(basket)).length} in the basket`
      yield* Ref.update(basket, (held) => [...held, reading])
    })

    Then("the resolved World reported {string}", function*(expected: string) {
      const { basket } = yield* World
      assert.deepStrictEqual(yield* Ref.get(basket), [expected])
    })
  })
})

/**
 * Closes an audit gap: `vi.mock`/`vi.hoisted`/`vi.doMock`/`vi.unmock` are otherwise unused
 * anywhere in this package, leaving no evidence that the wrapper's `describeFeature`/`Scenario`/
 * `Step` registration machinery — or a plain `it.effect` test — survives vitest 5's stricter
 * top-level-placement enforcement for hoisted mock calls.
 *
 * Both `vi.hoisted` and `vi.mock` below are written at this file's true top level — never inside a
 * function, a condition, or a callback, which is exactly the placement vitest 5 checks — ABOVE both
 * consumers. `mockGreet` is the SAME `vi.fn` instance the mock factory closes over and the
 * assertions below inspect, not a copy captured after the fact, because `vi.hoisted` runs before
 * every import in this file including the `vi.mock` factory itself.
 *
 * `vi` is imported directly `from "vitest"` here, NOT re-exported through
 * `../src/EffectVitest.ts` (which every other import below still is, per this package's own
 * convention) — a real, load-bearing finding of this file's own investigation. Vitest's hoisting
 * transform locates `vi.mock`/`vi.hoisted` calls by statically matching an import specifier of the
 * literal string `"vitest"`; `EffectVitest.ts`'s `export * from "vitest"` re-export does not satisfy
 * that check, and importing `vi` through it fails every test in the file at collection time with
 * "There are some problems in resolving the mocks API." `describe`/`it`/`assert` carry no such
 * constraint and keep coming from the wrapper as usual.
 */
import { ParameterTypeStore, parseFeature } from "@effect-cucumber/gherkin"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { vi } from "vitest"
import { describeFeature } from "../src/describeFeature.ts"
import { assert, describe, it } from "../src/EffectVitest.ts"

const mockGreet = vi.hoisted(() => vi.fn<(name: string) => string>((name) => `mocked:${name}`))

// The real `vi.mock` call under test. Vitest hoists this ABOVE the `./ViMockHoistingGreeting.ts`
// import below regardless of source order — the whole mechanism this file exists to pin.
vi.mock("./ViMockHoistingGreeting.ts", () => ({
  greet: mockGreet
}))

import { greet } from "./ViMockHoistingGreeting.ts"

describe("a hoisted vi.mock resolves for a plain it.effect test", () => {
  it.effect("observes the mocked implementation, never the real module", () =>
    Effect.gen(function*() {
      // No suspension of its own — `require-yield`'s satisfaction, same as this repo's other
      // assertion-only generator bodies.
      yield* Effect.void

      const callsBefore = mockGreet.mock.calls.length
      const result = greet("Ada")

      // `mocked:Ada`, never `real:Ada` — proves the mock, not `ViMockHoistingGreeting.ts` itself,
      // is what this import binding resolved to.
      assert.strictEqual(result, "mocked:Ada")
      assert.strictEqual(mockGreet.mock.calls.length, callsBefore + 1)
      assert.deepStrictEqual(mockGreet.mock.calls.at(-1), ["Ada"])
    }))
})

// A one-Scenario Feature whose step calls the SAME mocked import — proves the hoisted mock also
// resolves when reached through `describeFeature`'s own registration path, not only a bare `it`.
const feature = Effect.runSync(
  parseFeature(
    `Feature: vi.mock reaches a describeFeature step
  Scenario: the step calls the mocked module
    When I greet "Grace"
    Then the greeting was mocked
`,
    "test/ViMockHoisting.feature"
  ).pipe(Effect.provide(ParameterTypeStore.Default))
)

// The value the `When` step below observed, read back by the `Then` step in the SAME Scenario run
// — no cross-Scenario ordering concern, since one Scenario's steps run strictly in sequence.
let observed = ""

// THE CALL UNDER TEST.
describeFeature(feature, Layer.empty, ({ Then, When }) => {
  When("I greet {string}", function*(name: string) {
    yield* Effect.void
    observed = greet(name)
  })

  Then("the greeting was mocked", function*() {
    // `require-yield` satisfaction, as above.
    yield* Effect.void

    assert.strictEqual(observed, "mocked:Grace")
    assert.deepStrictEqual(mockGreet.mock.calls.at(-1), ["Grace"])
  })
})

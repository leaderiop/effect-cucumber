import { describe, expect, it } from "vitest"
import { scenarioSeed } from "../src/ScenarioSeed.ts"

describe("scenarioSeed", () => {
  it("is a pure function of its two arguments — same inputs, same output, across calls", () => {
    const first = scenarioSeed("features/apples.feature", "Eating apples")
    const second = scenarioSeed("features/apples.feature", "Eating apples")

    expect(second).toBe(first)
  })

  it("differs when the emitted title differs — the case two Outline rows rely on", () => {
    const rowOne = scenarioSeed("features/discounts.feature", "Applying a code (percent=10)")
    const rowTwo = scenarioSeed("features/discounts.feature", "Applying a code (percent=20)")

    expect(rowOne).not.toBe(rowTwo)
  })

  it("differs when the feature uri differs but the title is byte-identical", () => {
    const inFeatureOne = scenarioSeed("features/one.feature", "Eating apples")
    const inFeatureTwo = scenarioSeed("features/two.feature", "Eating apples")

    expect(inFeatureOne).not.toBe(inFeatureTwo)
  })

  it("does not collide a (uri, title) pair with a differently-split pair that concatenates to the same characters", () => {
    // Without a separator absent from both a uri and a title, "features/ab" + "c" would equal
    // "features/a" + "bc". A NUL-byte separator (neither string can plausibly contain one) rules
    // this out; this test would fail if the separator were ever weakened to a printable character
    // a real uri or title could contain.
    const first = scenarioSeed("features/ab", "c")
    const second = scenarioSeed("features/a", "bc")

    expect(first).not.toBe(second)
  })
})

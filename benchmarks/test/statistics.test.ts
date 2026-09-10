/**
 * RED phase (ADR-EC-051): the benchmark harness's own correctness — statistics only, no process
 * spawning, no vitest/cucumber-js involved. Written and run to fail (module not found) before
 * `../src/statistics.ts` exists.
 */
import { assert, describe, it } from "@effect-cucumber/vitest"
import { durationStats, measurementStability, percentDelta } from "../src/statistics.ts"

describe("durationStats", () => {
  it("summarizes a sample of wall-clock durations", () => {
    assert.deepStrictEqual(durationStats([40, 10, 30, 20]), {
      medianMillis: 25,
      meanMillis: 25,
      minMillis: 10,
      maxMillis: 40,
      p95Millis: 40,
      standardDeviationMillis: Math.sqrt(125),
      coefficientOfVariation: Math.sqrt(125) / 25
    })
  })

  it("throws on an empty duration sample", () => {
    assert.throws(() => durationStats([]), /empty duration sample/)
  })
})

describe("measurementStability", () => {
  // Ten values clustered tightly around 100 — a genuinely stable, low-coefficient-of-variation sample.
  const stableLowCv = [100, 101, 99, 100, 102, 98, 100, 101, 99, 100]

  // Twelve wildly scattered values — a genuinely noisy, high-coefficient-of-variation sample, at a run
  // count that would otherwise qualify as "high".
  const noisyHighCv = [10, 200, 5, 300, 8, 250, 12, 400, 6, 320, 15, 280]

  it("is low when fewer than 5 runs were measured, even on a stable sample", () => {
    assert.strictEqual(measurementStability(stableLowCv.slice(0, 3)), "low")
  })

  it("is medium for a stable low-CV sample measured fewer than 10 times", () => {
    assert.strictEqual(measurementStability(stableLowCv.slice(0, 7)), "medium")
  })

  it("is high for a stable low-CV sample measured 10 or more times", () => {
    assert.strictEqual(measurementStability(stableLowCv), "high")
  })

  it("is always low for a high-CV noisy sample, regardless of run count", () => {
    assert.strictEqual(measurementStability(noisyHighCv), "low")
  })
})

describe("percentDelta", () => {
  it("is negative when the candidate is faster (smaller) than the baseline", () => {
    assert.strictEqual(percentDelta(200, 150), -25)
  })

  it("is positive when the candidate is slower (larger) than the baseline", () => {
    assert.strictEqual(percentDelta(200, 250), 25)
  })
})

/**
 * RED phase (ADR-EC-051): pure rendering-function correctness — `renderMarkdown`/`renderHtml`
 * over a hand-built `BenchmarkResult`, no process spawning. Written and run to fail (module not
 * found) before `../src/report.ts` exists.
 */
import { assert, describe, it } from "@effect/vitest"
import { renderHtml, renderMarkdown } from "../src/report.ts"
import type { BenchmarkResult, DurationStats, RunnerStats } from "../src/types.ts"

const wall = (medianMillis: number): DurationStats => ({
  medianMillis,
  meanMillis: medianMillis,
  minMillis: medianMillis - 10,
  maxMillis: medianMillis + 10,
  p95Millis: medianMillis + 8,
  standardDeviationMillis: 5,
  coefficientOfVariation: 5 / medianMillis
})

const runnerStats = (
  runner: RunnerStats["runner"],
  medianMillis: number,
  stability: RunnerStats["stability"]
): RunnerStats => ({
  runner,
  runs: 10,
  wall: wall(medianMillis),
  stability,
  scenariosPerSecond: 1000 / medianMillis,
  totalScenarios: 6
})

const resultOf = (
  effectCucumber: RunnerStats,
  cucumberJs: RunnerStats
): BenchmarkResult => ({
  generatedAt: "2026-09-06T00:00:00.000Z",
  config: { iterations: 10, warmups: 1, suiteIds: ["counter"], pressureScenarios: 200 },
  suites: [{
    suiteId: "counter",
    label: "Counter",
    runners: [effectCucumber, cucumberJs]
  }]
})

describe("renderMarkdown", () => {
  it("names both runners and shows a formatted wall-median value", () => {
    const result = resultOf(
      runnerStats("effect-cucumber", 850, "high"),
      runnerStats("cucumber-js", 1200, "high")
    )
    const markdown = renderMarkdown(result)
    assert.match(markdown, /effect-cucumber/)
    assert.match(markdown, /cucumber-js/)
    assert.match(markdown, /850ms/)
    assert.match(markdown, /1200ms/)
  })

  it("computes and shows the percent delta with a faster/slower direction word", () => {
    const result = resultOf(
      runnerStats("effect-cucumber", 850, "high"),
      runnerStats("cucumber-js", 1200, "high")
    )
    const markdown = renderMarkdown(result)
    assert.match(markdown, /faster|slower/)
    // effect-cucumber's median (850) is below cucumber-js's (1200): it is the faster side.
    assert.match(markdown, /faster/)
  })

  it("omits the percent-delta line and shows the no-speed-claim guard when a runner's stability is low", () => {
    const result = resultOf(
      runnerStats("effect-cucumber", 850, "low"),
      runnerStats("cucumber-js", 1200, "high")
    )
    const markdown = renderMarkdown(result)
    assert.match(markdown, /do not publish a speed claim/i)
    assert.isFalse(/faster|slower/.test(markdown))
  })
})

describe("renderHtml", () => {
  it("contains both runner names inside a table", () => {
    const result = resultOf(
      runnerStats("effect-cucumber", 850, "high"),
      runnerStats("cucumber-js", 1200, "high")
    )
    const html = renderHtml(result)
    const tableMatch = /<table[\s\S]*<\/table>/i.exec(html)
    assert.isTrue(tableMatch !== null)
    const table = tableMatch?.[0] ?? ""
    assert.match(table, /effect-cucumber/)
    assert.match(table, /cucumber-js/)
  })
})

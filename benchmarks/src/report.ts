/**
 * Renders a `BenchmarkResult` as Markdown and HTML (ADR-EC-051). `renderMarkdown`/`renderHtml` are
 * pure functions — `test/report.test.ts` calls them directly with a hand-built fixture, no file
 * I/O. The CLI entry at the bottom (reads `results/latest.json`, writes `results/latest.{md,html}`)
 * is guarded by `isMainModule` so importing this module for its pure functions has no side effect.
 */
import * as fs from "node:fs"
import * as path from "node:path"
import { resultsRoot } from "./paths.ts"
import { percentDelta, round } from "./statistics.ts"
import type { BenchmarkResult, RunnerId, RunnerStats, SuiteResult } from "./types.ts"

/**
 * Deliberately conservative: a candidate that trails the ADR's own methodology section admits a
 * headline percentage claim from this run is not warranted when either side's sample was noisy or
 * too short (ADR-EC-051's "knip is gating, the benchmark's TIMING is not" split applies here too —
 * this is the harness declining to assert something it cannot stand behind).
 */
const NO_SPEED_CLAIM_GUARD =
  "Do not publish a speed claim from this run — measurement stability is low for at least one runner."

const findRunner = (suite: SuiteResult, runner: RunnerId): RunnerStats | undefined =>
  suite.runners.find((candidate) => candidate.runner === runner)

const hasLowStability = (suite: SuiteResult): boolean => suite.runners.some((runner) => runner.stability === "low")

const deltaSentence = (suite: SuiteResult): string | undefined => {
  const candidate = findRunner(suite, "effect-cucumber")
  const baseline = findRunner(suite, "cucumber-js")
  if (candidate === undefined || baseline === undefined) {
    return undefined
  }
  const delta = percentDelta(baseline.wall.medianMillis, candidate.wall.medianMillis)
  const direction = delta <= 0 ? "faster" : "slower"
  return `effect-cucumber is ${Math.abs(delta)}% ${direction} than cucumber-js (median wall time).`
}

const durationCell = (millis: number): string => `${round(millis, 0)}ms`

export const renderMarkdown = (result: BenchmarkResult): string => {
  const lines: Array<string> = [
    "# effect-cucumber vs. cucumber-js — benchmark results",
    "",
    `Generated: ${result.generatedAt}`,
    `Config: ${result.config.iterations} iteration(s), ${result.config.warmups} warmup(s), suites: ${
      result.config.suiteIds.join(", ")
    }`,
    ""
  ]

  for (const suite of result.suites) {
    lines.push(`## ${suite.label}`, "")
    lines.push("| Runner | Stability | Wall median | Wall p95 | Wall CV | Scenarios/sec | Runs |")
    lines.push("| --- | --- | --- | --- | --- | --- | --- |")
    for (const runner of suite.runners) {
      lines.push(
        `| ${runner.runner} | ${runner.stability} | ${durationCell(runner.wall.medianMillis)} | ${
          durationCell(runner.wall.p95Millis)
        } | ${round(runner.wall.coefficientOfVariation, 3)} | ${round(runner.scenariosPerSecond, 2)} | ${runner.runs} |`
      )
    }
    lines.push("")

    if (hasLowStability(suite)) {
      lines.push(`> **${NO_SPEED_CLAIM_GUARD}**`, "")
    } else {
      const sentence = deltaSentence(suite)
      if (sentence !== undefined) {
        lines.push(sentence, "")
      }
    }
  }

  return lines.join("\n")
}

export const renderHtml = (result: BenchmarkResult): string => {
  const suiteSections = result.suites.map((suite) => {
    const rows = suite.runners.map((runner) =>
      `<tr><td>${runner.runner}</td><td>${runner.stability}</td><td>${durationCell(runner.wall.medianMillis)}</td><td>${
        durationCell(runner.wall.p95Millis)
      }</td><td>${round(runner.wall.coefficientOfVariation, 3)}</td><td>${
        round(runner.scenariosPerSecond, 2)
      }</td><td>${runner.runs}</td></tr>`
    ).join("")

    const footer = hasLowStability(suite)
      ? `<p class="guard"><strong>${NO_SPEED_CLAIM_GUARD}</strong></p>`
      : (() => {
        const sentence = deltaSentence(suite)
        return sentence === undefined ? "" : `<p>${sentence}</p>`
      })()

    return `<section>
  <h2>${suite.label}</h2>
  <table>
    <thead>
      <tr><th>Runner</th><th>Stability</th><th>Wall median</th><th>Wall p95</th><th>Wall CV</th><th>Scenarios/sec</th><th>Runs</th></tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  ${footer}
</section>`
  }).join("\n")

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>effect-cucumber vs. cucumber-js benchmark</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 2rem; }
  table { border-collapse: collapse; }
  th, td { border: 1px solid #ccc; padding: 0.35rem 0.6rem; text-align: left; }
  .guard { color: #a33; }
</style>
</head>
<body>
<h1>effect-cucumber vs. cucumber-js — benchmark results</h1>
<p>Generated: ${result.generatedAt}</p>
${suiteSections}
</body>
</html>
`
}

/** Whether this module was invoked directly (`tsx src/report.ts`), not merely imported. */
const isMainModule = (): boolean => {
  const invoked = process.argv[1]
  return invoked !== undefined && import.meta.url === new URL(`file://${invoked}`).href
}

if (isMainModule()) {
  const inputPath = path.join(resultsRoot, "latest.json")
  const raw = fs.readFileSync(inputPath, "utf8")
  const result = JSON.parse(raw) as BenchmarkResult

  const markdownPath = path.join(resultsRoot, "latest.md")
  const htmlPath = path.join(resultsRoot, "latest.html")
  fs.writeFileSync(markdownPath, renderMarkdown(result))
  fs.writeFileSync(htmlPath, renderHtml(result))
  console.log(`Wrote ${markdownPath} and ${htmlPath}`)
}

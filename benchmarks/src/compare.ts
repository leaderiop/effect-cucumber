/**
 * The benchmark orchestrator (ADR-EC-051): selected suites x both runners x (discard warmups,
 * keep iterations) -> `runners.ts` -> `statistics.summarizeRunner` -> `results/latest.json`.
 *
 * `--iterations n` (default 5), `--warmups n` (default 1), `--suite id` (repeatable — defaults to
 * every suite, "counter" + "kitchen-sink" + the generated "pressure" suite), `--pressure-scenarios
 * n` (default 200, only consulted when the "pressure" suite is selected).
 */
import * as fs from "node:fs"
import * as path from "node:path"
import { parseArgs } from "node:util"
import { generateScaledCounterFeature } from "./generatedSuites.ts"
import { displayPath, fromBenchmarkRoot, repoRoot, resultsRoot } from "./paths.ts"
import { runCucumberJs, runEffectCucumber } from "./runners.ts"
import { summarizeRunner } from "./statistics.ts"
import { suites as staticSuites } from "./suites.ts"
import type {
  BenchmarkConfig,
  BenchmarkResult,
  BenchmarkRun,
  RunnerId,
  RunnerStats,
  RunSummary,
  SuiteDefinition,
  SuiteResult
} from "./types.ts"

interface CliOptions {
  readonly iterations: number
  readonly warmups: number
  readonly suiteIds: ReadonlyArray<string>
  readonly pressureScenarios: number
}

const parseCliArgs = (argv: ReadonlyArray<string>): CliOptions => {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      iterations: { type: "string", default: "5" },
      warmups: { type: "string", default: "1" },
      suite: { type: "string", multiple: true, default: [] },
      "pressure-scenarios": { type: "string", default: "200" }
    }
  })

  return {
    iterations: Number(values.iterations),
    warmups: Number(values.warmups),
    suiteIds: values.suite as ReadonlyArray<string>,
    pressureScenarios: Number(values["pressure-scenarios"])
  }
}

/** The generated "pressure" suite, reusing `counter.steps.ts`'s vocabulary on both sides. */
const pressureSuite = (pressureScenarios: number): SuiteDefinition => ({
  id: "pressure",
  label: `Pressure (${pressureScenarios}x counter)`,
  featurePath: generateScaledCounterFeature(pressureScenarios),
  effectCucumberStepsPath: fromBenchmarkRoot("effect-cucumber", "counter.steps.ts"),
  cucumberJsStepsPath: fromBenchmarkRoot("cucumber", "counter.steps.ts"),
  scenarioCount: pressureScenarios
})

const runnerFns: Record<RunnerId, (suite: SuiteDefinition, iteration: number) => Promise<RunSummary>> = {
  "effect-cucumber": runEffectCucumber,
  "cucumber-js": runCucumberJs
}

/** Run one runner across `warmups + iterations` invocations of one suite; discard the warmups. */
const measureRunner = async (
  runner: RunnerId,
  suite: SuiteDefinition,
  warmups: number,
  iterations: number
): Promise<RunnerStats> => {
  const run = runnerFns[runner]
  const keptRuns: Array<BenchmarkRun> = []

  for (let iteration = 0; iteration < warmups + iterations; iteration++) {
    // Deliberately sequential: two child processes spawned concurrently would contend for CPU/IO
    // and corrupt the wall-clock measurement this whole harness exists to take (ADR-EC-051).
    // oxlint-disable-next-line no-await-in-loop
    const summary = await run(suite, iteration)
    if (summary.failed > 0) {
      throw new Error(
        `${runner}'s "${suite.label}" run ${iteration} had ${summary.failed} failing scenario(s) out of ${summary.total}`
      )
    }
    if (iteration >= warmups) {
      keptRuns.push({ runner, suiteId: suite.id, iteration, summary })
    }
  }

  return summarizeRunner(runner, keptRuns.map((keptRun) => keptRun.summary.wallMillis), suite.scenarioCount)
}

const runSuite = async (suite: SuiteDefinition, warmups: number, iterations: number): Promise<SuiteResult> => {
  const effectCucumber = await measureRunner("effect-cucumber", suite, warmups, iterations)
  const cucumberJs = await measureRunner("cucumber-js", suite, warmups, iterations)
  return { suiteId: suite.id, label: suite.label, runners: [effectCucumber, cucumberJs] }
}

export const runBenchmark = async (options: CliOptions): Promise<BenchmarkResult> => {
  const allSuites = [...staticSuites, pressureSuite(options.pressureScenarios)]
  const selected = options.suiteIds.length === 0
    ? allSuites
    : allSuites.filter((suite) => options.suiteIds.includes(suite.id))

  if (selected.length === 0) {
    throw new Error(
      `No suite matched --suite ${options.suiteIds.join(", ")}. Known suites: ${
        allSuites.map((suite) => suite.id).join(", ")
      }`
    )
  }

  console.log(`Repository: ${repoRoot}`)

  const suiteResults: Array<SuiteResult> = []
  for (const suite of selected) {
    console.log(
      `Running suite "${suite.label}" (feature: ${
        displayPath(suite.featurePath)
      }; ${options.warmups} warmup + ${options.iterations} iterations)...`
    )
    // Deliberately sequential, same reason as above: one suite's runs must finish before the next
    // suite's begin, or their timings would contend.
    // oxlint-disable-next-line no-await-in-loop
    suiteResults.push(await runSuite(suite, options.warmups, options.iterations))
  }

  const config: BenchmarkConfig = {
    iterations: options.iterations,
    warmups: options.warmups,
    suiteIds: selected.map((suite) => suite.id),
    pressureScenarios: options.pressureScenarios
  }

  return { generatedAt: new Date().toISOString(), config, suites: suiteResults }
}

const isMainModule = (): boolean => {
  const invoked = process.argv[1]
  return invoked !== undefined && import.meta.url === new URL(`file://${invoked}`).href
}

if (isMainModule()) {
  const options = parseCliArgs(process.argv.slice(2))
  const result = await runBenchmark(options)
  fs.mkdirSync(resultsRoot, { recursive: true })
  const outputPath = path.join(resultsRoot, "latest.json")
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2))
  console.log(`Wrote ${outputPath}`)
}

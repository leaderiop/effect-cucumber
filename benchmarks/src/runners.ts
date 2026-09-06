/**
 * The two runners this harness compares, both invoked as real, whole child processes and timed
 * externally by `process.ts`'s `runCommand` (ADR-EC-051) — never sub-process-internal
 * instrumentation. Each parses its OWN JSON output for pass/fail counts only; the wall-clock time
 * that matters is `CommandResult.wallMillis`, not anything either tool self-reports.
 */
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { benchmarkRoot, fromBenchmarkRoot } from "./paths.ts"
import { assertSuccessful, runCommand } from "./process.ts"
import type { RunSummary, SuiteDefinition } from "./types.ts"

const tmpOutputPath = (prefix: string): string =>
  path.join(fs.mkdtempSync(path.join(os.tmpdir(), `effect-cucumber-bench-${prefix}-`)), "result.json")

/**
 * Vitest's own `--reporter=json` shape (confirmed by running it manually against a real fixture,
 * per ADR-EC-051's Verified section — not guessed): a top-level `numTotalTests`/`numPassedTests`/
 * `numFailedTests`, one entry per collected `it.effect` (one per Scenario, ADR-EC-004).
 */
interface VitestJsonReport {
  readonly numTotalTests: number
  readonly numPassedTests: number
  readonly numFailedTests: number
}

/**
 * `@cucumber/cucumber`'s own `--format json:<file>` shape (confirmed the same way): an array of
 * Feature objects, each with an `elements` array of Scenario objects, each with a `steps` array
 * carrying `result.status`.
 */
interface CucumberJsonFeature {
  readonly elements: ReadonlyArray<{
    readonly type: string
    readonly steps: ReadonlyArray<{ readonly result?: { readonly status: string } }>
  }>
}

const vitestBinPath = fromBenchmarkRoot("node_modules", "vitest", "vitest.mjs")
const vitestConfigPath = fromBenchmarkRoot("vitest.config.ts")
const cucumberBinPath = fromBenchmarkRoot("node_modules", "@cucumber", "cucumber", "bin", "cucumber.js")
const cucumberWorldPath = fromBenchmarkRoot("cucumber", "world.ts")

/** Run `effect-cucumber`'s side of one suite once: `vitest run <fixture>` as a real child process. */
export const runEffectCucumber = async (suite: SuiteDefinition, iteration: number): Promise<RunSummary> => {
  const outputFile = tmpOutputPath(`effect-cucumber-${suite.id}-${iteration}`)
  const result = assertSuccessful(
    await runCommand(
      "node",
      [
        vitestBinPath,
        "run",
        suite.effectCucumberStepsPath,
        "--config",
        vitestConfigPath,
        "--reporter=json",
        `--outputFile=${outputFile}`
      ],
      {
        cwd: benchmarkRoot,
        // Redirects `effect-cucumber/counter.steps.ts`'s `loadFeature` call to `suite.featurePath`
        // — a no-op for "counter"/"kitchen-sink" (already their own default path), and how the
        // generated "pressure" suite reuses that same step module against a scaled-up feature.
        env: { EFFECT_CUCUMBER_BENCH_FEATURE_PATH: suite.featurePath }
      }
    )
  )

  const report = JSON.parse(fs.readFileSync(outputFile, "utf8")) as VitestJsonReport
  return {
    passed: report.numPassedTests,
    failed: report.numFailedTests,
    total: report.numTotalTests,
    wallMillis: result.wallMillis
  }
}

/** Run cucumber-js's side of one suite once: `node cucumber.js <feature>` as a real child process. */
export const runCucumberJs = async (suite: SuiteDefinition, iteration: number): Promise<RunSummary> => {
  const outputFile = tmpOutputPath(`cucumber-js-${suite.id}-${iteration}`)
  const result = assertSuccessful(
    await runCommand(
      "node",
      [
        "--import",
        "tsx",
        cucumberBinPath,
        "--import",
        cucumberWorldPath,
        "--import",
        suite.cucumberJsStepsPath,
        "--format",
        `json:${outputFile}`,
        suite.featurePath
      ],
      { cwd: benchmarkRoot }
    )
  )

  const features = JSON.parse(fs.readFileSync(outputFile, "utf8")) as ReadonlyArray<CucumberJsonFeature>
  let passed = 0
  let failed = 0
  for (const feature of features) {
    for (const element of feature.elements) {
      if (element.type !== "scenario") continue
      const failedStep = element.steps.some((step) => step.result?.status === "failed")
      if (failedStep) {
        failed += 1
      } else {
        passed += 1
      }
    }
  }

  return { passed, failed, total: passed + failed, wallMillis: result.wallMillis }
}

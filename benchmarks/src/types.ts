/**
 * Shared shapes for the benchmark harness (ADR-EC-051). No `effect` import here on purpose — the
 * harness itself does no Effect-y work in-process; it only shells out to two CLIs and parses their
 * output. Only `cucumber/**` and `effect-cucumber/**` step modules import `effect`.
 */

/** The two things this harness ever times. */
export type RunnerId = "effect-cucumber" | "cucumber-js"

/** One benchmarkable scenario set, run through both runners. */
export interface SuiteDefinition {
  readonly id: string
  readonly label: string
  /** Absolute path to the `.feature` file both runners execute. */
  readonly featurePath: string
  /** Absolute path to the `describeFeature`-based step module (a `.steps.ts` file, never `.steps.test.ts`). */
  readonly effectCucumberStepsPath: string
  /** Absolute path to the `@cucumber/cucumber` step definitions module. */
  readonly cucumberJsStepsPath: string
  /** How many Scenarios the `.feature` file emits — used for a scenarios/sec figure. */
  readonly scenarioCount: number
}

/** The raw result of spawning one child process, timed externally. */
export interface CommandResult {
  readonly command: string
  readonly args: ReadonlyArray<string>
  readonly exitCode: number
  readonly stdout: string
  readonly stderr: string
  readonly wallMillis: number
}

/** What one runner reported for one run, parsed out of its own JSON output. */
export interface RunSummary {
  readonly passed: number
  readonly failed: number
  readonly total: number
  /** The wall-clock time of the whole child process, from `CommandResult`, not a value the child self-reported. */
  readonly wallMillis: number
}

/** One measured iteration (after warmups are discarded). */
export interface BenchmarkRun {
  readonly runner: RunnerId
  readonly suiteId: string
  readonly iteration: number
  readonly summary: RunSummary
}

/** A statistical summary of one sample of millisecond durations. */
export interface DurationStats {
  readonly medianMillis: number
  readonly meanMillis: number
  readonly minMillis: number
  readonly maxMillis: number
  readonly p95Millis: number
  readonly standardDeviationMillis: number
  readonly coefficientOfVariation: number
}

/**
 * How much a measured sample should be trusted, from its run count and coefficient of variation
 * (ADR-EC-051): never a substitute for reading the raw numbers, but a guard against publishing a
 * speed claim off a noisy or too-short sample.
 */
export type Stability = "low" | "medium" | "high"

/** One runner's summarized wall-clock behavior across every kept (non-warmup) iteration of one suite. */
export interface RunnerStats {
  readonly runner: RunnerId
  readonly runs: number
  readonly wall: DurationStats
  readonly stability: Stability
  readonly scenariosPerSecond: number
  readonly totalScenarios: number
}

/** Both runners' summarized results for one suite. */
export interface SuiteResult {
  readonly suiteId: string
  readonly label: string
  readonly runners: ReadonlyArray<RunnerStats>
}

/** The knobs `src/compare.ts`'s CLI accepts, echoed into the written result for reproducibility. */
export interface BenchmarkConfig {
  readonly iterations: number
  readonly warmups: number
  readonly suiteIds: ReadonlyArray<string>
  readonly pressureScenarios: number
}

/** The whole of `results/latest.json`. */
export interface BenchmarkResult {
  readonly generatedAt: string
  readonly config: BenchmarkConfig
  readonly suites: ReadonlyArray<SuiteResult>
}

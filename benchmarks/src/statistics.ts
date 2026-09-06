/**
 * Pure statistics over millisecond-duration samples (ADR-EC-051). No process spawning, no I/O —
 * this module is what `test/statistics.test.ts` exercises directly, RED before GREEN.
 */
import type { DurationStats, RunnerId, RunnerStats, Stability } from "./types.ts"

const sum = (values: ReadonlyArray<number>): number => values.reduce((total, value) => total + value, 0)

const mean = (values: ReadonlyArray<number>): number => sum(values) / values.length

const ascending = (values: ReadonlyArray<number>): ReadonlyArray<number> => [...values].toSorted((a, b) => a - b)

const median = (sorted: ReadonlyArray<number>): number => {
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1]! + sorted[middle]!) / 2
  }
  return sorted[middle]!
}

/** Nearest-rank percentile over an already-ascending sample. `p` is a fraction in `[0, 1]`. */
const percentile = (sorted: ReadonlyArray<number>, p: number): number => {
  const rank = Math.ceil(p * sorted.length)
  const index = Math.min(Math.max(rank, 1), sorted.length) - 1
  return sorted[index]!
}

/** Population standard deviation (divides by `n`, not `n - 1`) — this is a full sample, not an estimate of one. */
const standardDeviation = (values: ReadonlyArray<number>, average: number): number => {
  const variance = sum(values.map((value) => (value - average) ** 2)) / values.length
  return Math.sqrt(variance)
}

/** Round to `decimals` places (default 2) for display — never used inside `durationStats` itself. */
export const round = (value: number, decimals = 2): number => {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

/** `((candidate - baseline) / baseline) * 100`, rounded to 2 decimals. Negative means the candidate is faster. */
export const percentDelta = (baseline: number, candidate: number): number =>
  round(((candidate - baseline) / baseline) * 100)

/** Summarize a sample of wall-clock millisecond durations. Throws on an empty sample — there is nothing to summarize. */
export const durationStats = (samples: ReadonlyArray<number>): DurationStats => {
  if (samples.length === 0) {
    throw new Error("Cannot summarize an empty duration sample")
  }
  const sorted = ascending(samples)
  const average = mean(samples)
  const stdDev = standardDeviation(samples, average)
  return {
    medianMillis: median(sorted),
    meanMillis: average,
    minMillis: sorted[0]!,
    maxMillis: sorted[sorted.length - 1]!,
    p95Millis: percentile(sorted, 0.95),
    standardDeviationMillis: stdDev,
    coefficientOfVariation: stdDev / average
  }
}

/**
 * How much a sample should be trusted: `runs < 5` or a coefficient of variation over `0.2` is
 * "low" regardless of run count; `runs < 10` or a CV over `0.1` is "medium"; anything else is
 * "high".
 */
export const measurementStability = (samples: ReadonlyArray<number>): Stability => {
  const runs = samples.length
  if (runs === 0) {
    return "low"
  }
  const { coefficientOfVariation } = durationStats(samples)
  if (runs < 5 || coefficientOfVariation > 0.2) {
    return "low"
  }
  if (runs < 10 || coefficientOfVariation > 0.1) {
    return "medium"
  }
  return "high"
}

/** Fold a runner's kept (non-warmup) iterations into its `RunnerStats`. */
export const summarizeRunner = (
  runner: RunnerId,
  wallMillisSamples: ReadonlyArray<number>,
  totalScenarios: number
): RunnerStats => {
  const wall = durationStats(wallMillisSamples)
  return {
    runner,
    runs: wallMillisSamples.length,
    wall,
    stability: measurementStability(wallMillisSamples),
    scenariosPerSecond: totalScenarios / (wall.medianMillis / 1000),
    totalScenarios
  }
}

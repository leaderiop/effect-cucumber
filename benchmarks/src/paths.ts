/**
 * Path helpers, all derived from `import.meta.url` — no hardcoded absolute paths, so the harness
 * works from any checkout location (ADR-EC-051).
 */
import * as path from "node:path"
import { fileURLToPath } from "node:url"

/** This file lives at `benchmarks/src/paths.ts`, so its own directory's parent is `benchmarks/`. */
export const benchmarkRoot: string = fileURLToPath(new URL("..", import.meta.url))

/** `benchmarks/`'s own parent is the repository root. */
export const repoRoot: string = fileURLToPath(new URL("../..", import.meta.url))

/** Where `src/compare.ts` writes `latest.json` and `src/report.ts` writes `latest.{md,html}`. */
export const resultsRoot: string = path.join(benchmarkRoot, "results")

/** Where `src/generatedSuites.ts` writes generated `.feature` fixtures. */
export const generatedRoot: string = path.join(benchmarkRoot, "generated")

/** Resolve one or more segments against the repository root. */
export const fromRepoRoot = (...segments: ReadonlyArray<string>): string => path.join(repoRoot, ...segments)

/** Resolve one or more segments against `benchmarks/`. */
export const fromBenchmarkRoot = (...segments: ReadonlyArray<string>): string => path.join(benchmarkRoot, ...segments)

/** A path relative to the repository root, for friendly display in reports and console output. */
export const displayPath = (absolutePath: string): string => path.relative(repoRoot, absolutePath)

/**
 * The static suite definitions (ADR-EC-051): "counter" (a fresh, minimal fixture) and
 * "kitchen-sink" (the real `packages/vitest/test/acceptance/parsing-and-matching.feature`, reused
 * by path — see `../README.md`'s methodology section).
 */
import { fromBenchmarkRoot, fromRepoRoot } from "./paths.ts"
import type { SuiteDefinition } from "./types.ts"

export const suites: ReadonlyArray<SuiteDefinition> = [
  {
    id: "counter",
    label: "Counter",
    featurePath: fromBenchmarkRoot("fixtures", "counter.feature"),
    effectCucumberStepsPath: fromBenchmarkRoot("effect-cucumber", "counter.steps.ts"),
    cucumberJsStepsPath: fromBenchmarkRoot("cucumber", "counter.steps.ts"),
    scenarioCount: 6
  },
  {
    id: "kitchen-sink",
    label: "Kitchen sink",
    featurePath: fromRepoRoot("packages", "vitest", "test", "acceptance", "parsing-and-matching.feature"),
    effectCucumberStepsPath: fromBenchmarkRoot("effect-cucumber", "kitchen-sink.steps.ts"),
    cucumberJsStepsPath: fromBenchmarkRoot("cucumber", "kitchen-sink.steps.ts"),
    scenarioCount: 8
  }
]

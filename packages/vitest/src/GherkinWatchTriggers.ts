/**
 * `gherkinWatchTriggers`: a Vite plugin appending `.feature`-file watch triggers to Vitest's own
 * `test.watchTriggerPatterns` root config option, so editing a `.feature` file loaded through
 * `loadFeature(path)` — a plain `fs` read, invisible to Vite's module graph — reruns the suite under
 * a watching runner. Mirrors `gherkinTags` (`GherkinTags.ts`): same glob-or-array-of-globs argument,
 * same `{ cwd }` option, same "no default, never scans a tree you did not name" stance. See
 * ADR-EC-030 and BEH-EC-022.
 */
import * as path from "node:path"
import { globSync } from "tinyglobby"
import type { Plugin } from "vitest/config"

/**
 * Options for `gherkinWatchTriggers`.
 */
export interface GherkinWatchTriggersOptions {
  readonly cwd?: string
}

// Vitest's own documented default include glob (quoted verbatim in
// `packages/vitest/test/acceptance/README.md`) — used only when the consumer's OWN `test.include`
// is not visible on the config object this plugin's `config()` hook receives (ADR-EC-030's
// "conservative, not precise" tradeoff).
const defaultTestInclude = ["**/*.{test,spec}.?(c|m)[jt]s?(x)"]

const toPosix = (value: string): string => value.split(path.sep).join("/")

/**
 * Append `pattern` (the same glob already handed to `gherkinTags`) to `test.watchTriggerPatterns`.
 * `mergeConfig` concatenates arrays, so this composes additively with any `watchTriggerPatterns`
 * the consumer's own config or another plugin already declares. Must be added to the consumer's
 * ROOT `vitest.config.ts` — `watchTriggerPatterns` is not a per-workspace-project option, the same
 * cost `gherkinTags` already asks for.
 *
 * @param pattern - a glob pattern, or an array of them, resolved against `options.cwd` — the SAME
 * argument already given to `gherkinTags` for the same `.feature` files.
 * @param options - `{ cwd }` to pin the directory the patterns resolve against.
 * @throws Error when the pattern is empty.
 */
export const gherkinWatchTriggers = (
  pattern: string | ReadonlyArray<string>,
  options: GherkinWatchTriggersOptions = {}
): Plugin => {
  const patterns = typeof pattern === "string" ? [pattern] : pattern

  if (patterns.length === 0 || patterns.some((entry) => entry.trim() === "")) {
    throw new Error(
      `gherkinWatchTriggers: a glob pattern is required and must not be empty (received ${
        JSON.stringify(pattern)
      }). Pass the same pattern given to gherkinTags, for example gherkinWatchTriggers("features/**/*.feature").`
    )
  }

  const cwd = options.cwd ?? process.cwd()

  // Re-globbed on every triggering change rather than snapshotted once here, so a `.feature` file
  // added or removed after the watcher starts is picked up without a restart — the glob only runs
  // when a changed file's id already ends in `.feature`, never on the hot path of an ordinary edit.
  const trackedFeatureFiles = (): ReadonlySet<string> =>
    new Set(
      globSync(patterns, { cwd, dot: false, onlyFiles: true }).map((file) => toPosix(path.resolve(cwd, file)))
    )

  // Captured from the config object this plugin's own `config()` hook receives — whatever the
  // consumer (or an earlier plugin) has already set `test.include` to at that point. Read once
  // there rather than per-trigger, since `test.include` does not change after Vite resolves config.
  let testInclude: ReadonlyArray<string> = defaultTestInclude

  return {
    name: "@effect-cucumber/vitest:watch-trigger-patterns",
    config(config) {
      const configuredInclude = config.test?.include
      if (configuredInclude !== undefined && configuredInclude.length > 0) {
        testInclude = configuredInclude
      }
      return {
        test: {
          watchTriggerPatterns: [
            {
              // A broad, cheap first-pass filter — real membership is decided below against the
              // actual glob expansion, the same `globSync` call `gherkinTags` itself uses, so the
              // two helpers agree by construction with no glob-to-regex conversion in between.
              pattern: /\.feature$/,
              testsToRun: (id: string) => {
                if (!trackedFeatureFiles().has(toPosix(id))) return

                // No static mapping from a `.feature` file to the specific `.steps.test.ts` (or
                // equivalent) that consumes it exists in general — `loadFeature(path)` can be
                // called from any test module under any name, and `defineSteps` reuse means the
                // relationship is not even necessarily 1:1 (ADR-EC-030). The conservative, always-
                // correct choice: rerun every test file matching the consumer's own `test.include`.
                return globSync(testInclude, { cwd, dot: false, onlyFiles: true }).map((file) =>
                  path.resolve(cwd, file)
                )
              }
            }
          ]
        }
      }
    }
  }
}

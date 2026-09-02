/**
 * The one claim `gherkinTags` makes that no runtime test can check: its result spreads directly into a runner
 * config's own `test.tags` array.
 */
import type { TestTagDefinition } from "vitest/config"
import { gherkinTags } from "../src/GherkinTags.ts"

// The intended consumer call, verbatim, in a `vitest.config.ts`'s `test.tags` position.
export const declaredTags: Array<TestTagDefinition> = [
  ...gherkinTags("features/**/*.feature"),
  { name: "@skip" },
  { name: "@only" }
]

// The options form a config file uses: `cwd` pins the base directory the patterns resolve against.
export const declaredFromConfigDirectory: Array<TestTagDefinition> = [
  ...gherkinTags("features/**/*.feature", { cwd: "/absolute/path/to/the/config/directory" })
]

// `cwd` is a directory path and nothing else.
// @ts-expect-error — a number is not a directory
export const rejectedCwd: ReadonlyArray<TestTagDefinition> = gherkinTags("features/**/*.feature", { cwd: 1 })

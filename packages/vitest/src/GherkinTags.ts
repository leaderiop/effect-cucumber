/**
 * `gherkinTags`: derive a vitest config's tag declarations from `.feature` files, synchronously at
 * config load. DocString fences are tracked so a `@word` inside one is not a tag
 * (`test/GherkinTags.test.ts`).
 */
import * as fs from "node:fs"
import * as path from "node:path"
import { globSync } from "tinyglobby"

/**
 * One entry in a runner config's tag list.
 */
export interface GherkinTagDefinition {
  readonly name: string
}

/**
 * Options for `gherkinTags`.
 */
export interface GherkinTagsOptions {
  readonly cwd?: string
}

type DocStringFence = "\"\"\"" | "```" | null

const openingFence = (trimmed: string): Exclude<DocStringFence, null> | null =>
  trimmed.startsWith("\"\"\"") ? "\"\"\"" : trimmed.startsWith("```") ? "```" : null

/**
 * Expand `pattern`, scan every matched file for Gherkin tags, and return them de-duplicated and
 * sorted ascending so a config's declared list is stable across runs and across filesystem
 * ordering.
 *
 * @param pattern - a glob pattern, or an array of them, resolved against `options.cwd`, which
 * @param options - `{ cwd }` to pin the directory the patterns resolve against.
 * @throws Error when the pattern is empty.
 */
export const gherkinTags = (
  pattern: string | ReadonlyArray<string>,
  options: GherkinTagsOptions = {}
): ReadonlyArray<GherkinTagDefinition> => {
  const patterns = typeof pattern === "string" ? [pattern] : pattern
  const cwd = options.cwd ?? process.cwd()

  if (patterns.length === 0 || patterns.some((entry) => entry.trim() === "")) {
    throw new Error(
      `gherkinTags: a glob pattern is required and must not be empty (received ${
        JSON.stringify(pattern)
      }). Pass the pattern that matches your .feature files, for example gherkinTags("features/**/*.feature"). There is deliberately no default: a helper that scanned the whole working directory would declare tags nobody asked it to look for, and a helper that returned an empty list here would leave every tag in the suite undeclared without saying so.`
    )
  }

  const names = new Set<string>()

  for (const file of globSync(patterns, { cwd, dot: false, onlyFiles: true })) {
    let fence: DocStringFence = null

    for (const line of fs.readFileSync(path.resolve(cwd, file), "utf8").split(/\r?\n/)) {
      const trimmed = line.trim()

      if (fence === null) {
        const opened = openingFence(trimmed)
        if (opened !== null) {
          fence = opened
          continue
        }
      } else if (trimmed.startsWith(fence)) {
        fence = null
        continue
      }

      if (fence !== null || !trimmed.startsWith("@")) continue

      for (const token of trimmed.split(/\s+/)) {
        if (token.startsWith("@")) names.add(token)
      }
    }
  }

  return [...names].toSorted().map((name) => ({ name }))
}

import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { gherkinWatchTriggers } from "../src/GherkinWatchTriggers.ts"

// The pattern prefix every test below builds on, matching GherkinTags.test.ts's own derivation.
const fixtures = path.relative(process.cwd(), fileURLToPath(new URL("./fixtures", import.meta.url)))
  .split(path.sep)
  .join("/")

const fixturesDir = fileURLToPath(new URL("./fixtures", import.meta.url))

// A real changed `.feature` file id, absolute and slash-normalized — the shape Vitest's own
// watcher hands `testsToRun` (ADR-EC-030).
const trackedFeatureId = path.resolve(fixturesDir, "tag-scan-a.feature")

// `plugin.config` is a plain function in this implementation (an object-literal method, never the
// `{ handler, order }` object form), so every test below calls it directly rather than going
// through a live Vite instance — exactly the shape BEH-EC-022's worked example documents.
const callConfig = (
  plugin: ReturnType<typeof gherkinWatchTriggers>,
  config: { readonly test?: { include?: Array<string> } } = {}
) => {
  const hook = plugin.config
  if (typeof hook !== "function") {
    throw new Error("gherkinWatchTriggers's plugin.config is not a plain function — test assumption broken")
  }
  // The real hook signature takes a second `env` argument; every caller here passes the minimal
  // shape needed to exercise `testsToRun`, matching how Vite itself would call it in "serve" mode.
  // Vite supplies its own plugin-context `this`, which this hook's body never reads.
  return hook.call(null as never, config, { command: "serve", mode: "development" }) as
    | {
      readonly test?: {
        readonly watchTriggerPatterns?: ReadonlyArray<{
          readonly pattern: RegExp
          readonly testsToRun: (id: string) => ReadonlyArray<string> | string | undefined
        }>
      }
    }
    | undefined
}

const onlyTrigger = (
  plugin: ReturnType<typeof gherkinWatchTriggers>,
  config: { readonly test?: { include?: Array<string> } } = {}
) => {
  const contributed = callConfig(plugin, config)
  const triggers = contributed?.test?.watchTriggerPatterns ?? []
  expect(triggers).toHaveLength(1)
  const trigger = triggers[0]
  if (trigger === undefined) {
    throw new Error("unreachable: length asserted as 1 above")
  }
  return trigger
}

describe("gherkinWatchTriggers", () => {
  it("throws, naming gherkinWatchTriggers, on an empty string", () => {
    expect(() => gherkinWatchTriggers("")).toThrow(/gherkinWatchTriggers/)
  })

  it("throws, naming gherkinWatchTriggers, on an empty array", () => {
    expect(() => gherkinWatchTriggers([])).toThrow(/gherkinWatchTriggers/)
  })

  it("returns a Plugin naming this package, with a config() hook", () => {
    const plugin = gherkinWatchTriggers(`${fixtures}/**/*.feature`)

    expect(plugin.name).toBe("@effect-cucumber/vitest:watch-trigger-patterns")
    expect(typeof plugin.config).toBe("function")
  })

  it("contributes exactly one watchTriggerPatterns entry, whose pattern matches any .feature id", () => {
    const plugin = gherkinWatchTriggers(`${fixtures}/**/*.feature`, { cwd: process.cwd() })
    const trigger = onlyTrigger(plugin)

    expect(trigger.pattern.test("/some/absolute/path/whatever.feature")).toBe(true)
    expect(trigger.pattern.test("/some/absolute/path/whatever.ts")).toBe(false)
  })

  it("testsToRun returns undefined for a .feature file OUTSIDE the caller's own glob", () => {
    const plugin = gherkinWatchTriggers(`${fixtures}/tag-scan-nested/**/*.feature`, { cwd: process.cwd() })
    const trigger = onlyTrigger(plugin)

    // tag-scan-a.feature is a real file, but not one this narrower pattern matches.
    expect(trigger.testsToRun(trackedFeatureId)).toBeUndefined()
  })

  it("testsToRun returns the consumer's own test.include set, resolved to absolute paths, for a TRACKED .feature file", () => {
    const plugin = gherkinWatchTriggers(`${fixtures}/**/*.feature`, { cwd: process.cwd() })
    const trigger = onlyTrigger(plugin, { test: { include: [`${fixtures}/../GherkinTags.test.ts`] } })

    const result = trigger.testsToRun(trackedFeatureId)

    expect(Array.isArray(result)).toBe(true)
    expect(result).toEqual([path.resolve(process.cwd(), "packages/vitest/test/GherkinTags.test.ts")])
  })

  it("falls back to vitest's own documented default include glob when test.include is absent from the config object", () => {
    const plugin = gherkinWatchTriggers("**/*.feature", { cwd: fixturesDir })
    // No `test` key at all — the shape config() sees before a consumer's own test.include is set.
    const trigger = onlyTrigger(plugin, {})

    // The fallback default ("**/*.{test,spec}.?(c|m)[jt]s?(x)") matches nothing under the fixtures
    // directory (it holds only .feature files) — proving the fallback pattern actually ran, as
    // opposed to throwing or silently returning the tracked .feature files themselves.
    expect(trigger.testsToRun(trackedFeatureId)).toEqual([])
  })

  it("re-globs on every call, so a .feature file added after the plugin was built is tracked with no restart", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gherkin-watch-triggers-"))
    try {
      // Constructed BEFORE the file below exists — proving tracked membership is decided fresh on
      // every testsToRun call (a live globSync), not off a Set snapshotted once at construction.
      const plugin = gherkinWatchTriggers("*.feature", { cwd: tmpDir })
      const trigger = onlyTrigger(plugin, { test: { include: [] } })

      const addedLater = path.join(tmpDir, "added-after-construction.feature")
      fs.writeFileSync(addedLater, "Feature: added later\n")

      expect(trigger.testsToRun(addedLater)).toEqual([])
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })
})

# 10 — Watch-mode `.feature` rerun triggers

One helper, exported from the package barrel like `gherkinTags` beside it: a Vite plugin that makes
editing a `.feature` file loaded through `loadFeature(path)` trigger a rerun under a watching runner.
See [ADR-EC-030](../decisions/030-gherkinwatchtriggers-plugin-reruns-the-whole-test-include-set.md) for
the evidence and the rejected alternatives.

See [`spec/roadmap.md`](../roadmap.md) for what is built versus what is only specified — this document
describes the contract, not the build status.

Not exercised by this library's OWN acceptance suite (`packages/vitest/test/acceptance/`): the claim
here is about Vitest's OWN watcher deciding to rerun a file on disk changing, which is CLI-process-level
behavior no `describeFeature`-driven Scenario running in-process can observe — the same category
`GherkinTags.ts`'s `gherkinTags` (BEH-EC-008) already sits in, config-time and barrel-exported with plain
unit tests and no acceptance pair. `packages/vitest/test/GherkinWatchTriggers.test.ts` is this behavior's
test file; no `@REQ-EC-NNN` tag applies (`AGENTS.md` §5 reserves that tag for `.feature` files under
`test/acceptance/`). `scripts/verify-watch-rerun.sh` already proves, against a real `vitest --watch` CLI
process, that Vitest's watcher DOES rerun on a matched trigger in general — that script predates this
plugin and exercises the underlying mechanism via a `?raw` import rather than this plugin, so extending
it to also cover `gherkinWatchTriggers` end to end was considered and deferred: the plugin's own logic
(which files it names to Vitest, under which conditions) is fully exercised by calling its `config()`
hook and the `testsToRun` function it returns directly, in-process, with no live watcher required —
see the worked example below for exactly that shape.

---

## BEH-EC-022: `gherkinWatchTriggers` reruns the matched `test.include` set whenever a tracked `.feature` file changes

> **See:** [ADR-EC-030](../decisions/030-gherkinwatchtriggers-plugin-reruns-the-whole-test-include-set.md)

```ts
export interface GherkinWatchTriggersOptions {
  readonly cwd?: string
}

export const gherkinWatchTriggers: (
  pattern: string | ReadonlyArray<string>,
  options?: GherkinWatchTriggersOptions
) => Plugin // from "vitest/config"
```

```
REQUIREMENT: gherkinWatchTriggers MUST throw when `pattern` is "", [], or an
             array containing an empty/whitespace-only string — the same
             "no default, never scans a tree you did not name" contract
             gherkinTags already carries, stated on the identical argument
             shape.

REQUIREMENT: The returned Plugin's config() hook MUST contribute exactly one
             entry to test.watchTriggerPatterns, whose `pattern` matches any
             changed file id ending ".feature".

REQUIREMENT: That entry's testsToRun(id), given an `id` that is NOT one of
             the files `pattern` (expanded against `options.cwd`, defaulting
             to process.cwd()) actually matches, MUST return undefined —
             letting Vitest's own module-graph fallback decide, rather than
             claiming a trigger for a `.feature` file outside the caller's
             own glob.

REQUIREMENT: That entry's testsToRun(id), given an `id` that IS one of the
             files `pattern` matches, MUST return the full set of files
             matched by the consumer's own `test.include` (read from the
             config object the plugin's own config() hook received),
             resolved as absolute paths — falling back to Vitest's
             documented default include glob
             ("**/*.{test,spec}.?(c|m)[jt]s?(x)") when `test.include` is not
             present on that config object.
```

### Worked example

```typescript
import { gherkinWatchTriggers } from "@effect-cucumber/vitest"
import { mergeConfig } from "vitest/config"

// A consumer's root vitest.config.ts — the plugin composes additively with an existing
// watchTriggerPatterns entry via mergeConfig, exactly the claim ADR-EC-030 makes.
const consumerOwnConfig = {
  test: {
    include: ["src/**/*.test.ts"],
    watchTriggerPatterns: [{ pattern: /\.env$/, testsToRun: () => "src/env.test.ts" }]
  }
}

const plugin = gherkinWatchTriggers("features/**/*.feature", { cwd: process.cwd() })

// Vite calls config() itself once it resolves the consumer's own config; this line reproduces
// that call directly so the plugin's own logic is asserted with no live watcher involved. Vite
// invokes the hook with its own plugin-context `this`, which this hook's body never reads.
const configHook = plugin.config
const contributed = typeof configHook === "function"
  ? configHook.call(null as never, consumerOwnConfig, { command: "serve", mode: "development" })
  : undefined

const merged = mergeConfig(consumerOwnConfig, contributed ?? {})

// Both entries survive — the consumer's own trigger and this plugin's — because mergeConfig
// concatenates array-valued config fields rather than replacing one with the other.
console.log(merged.test?.watchTriggerPatterns?.length) // => 2
```

The REQUIREMENT above is asserted for real, calling `config()` and the returned `testsToRun` directly,
by `packages/vitest/test/GherkinWatchTriggers.test.ts`.

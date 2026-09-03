---
"@effect-cucumber/vitest": minor
---

Add `gherkinWatchTriggers(pattern, options?)`, a Vite plugin exported beside `gherkinTags`.

Editing a `.feature` file loaded through `loadFeature(path)` (a plain `fs` read, invisible to Vite's
module graph) currently triggers no rerun at all under `vitest --watch`. `gherkinWatchTriggers`
appends a `.feature`-file trigger to Vitest's own `test.watchTriggerPatterns` config option, so the
edit is picked up:

```ts
import { gherkinTags, gherkinWatchTriggers } from "@effect-cucumber/vitest"
import { defineConfig } from "vitest/config"

const featureGlob = "features/**/*.feature"

export default defineConfig({
  test: { tags: gherkinTags(featureGlob) },
  plugins: [gherkinWatchTriggers(featureGlob)]
})
```

Must go in the consumer's ROOT `vitest.config.ts` — `watchTriggerPatterns` is not a
per-workspace-project option, the same cost `gherkinTags`'s `test.tags` already asks for. No static
`.feature`-to-test-file mapping exists in general (a `.feature` can be loaded from any test module
under any name, and step definitions can be reused across Features via `defineSteps`), so editing any
tracked `.feature` file reruns the consumer's whole `test.include` set rather than a single file —
conservative rather than surgical, and stated as a deliberate trade-off.

See [ADR-EC-030](../spec/decisions/030-gherkinwatchtriggers-plugin-reruns-the-whole-test-include-set.md).

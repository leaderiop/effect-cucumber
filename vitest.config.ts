// Root vitest config. Three things here are deliberate:
//   - `include` is untouched and `exclude` only EXTENDS vitest's defaults (plus the agent
//     worktrees git parks under `.claude/`): replacing either is the likeliest way to silently
//     stop running some package's tests.
//   - `strictTags` is absent on purpose. An undeclared tag is caught by the library's own
//     adapter, which re-emits the test untagged and warns; `emission.test.ts` asserts that path,
//     and `@undeclared-on-purpose` is the tag it uses — never add it to the universe.
//   - The tag universe comes from `vitest.tags.ts`, passing this file's directory as `cwd`, so
//     the same list is declared whichever directory the runner was invoked from.
import { fileURLToPath } from "node:url"
import { configDefaults, defineConfig } from "vitest/config"
import { declaredTags } from "./vitest.tags.ts"

export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, "**/.claude/**"],
    // The universe is computed from THIS file's directory, so `pnpm test` from the root and
    // `pnpm -r test` from a package directory declare the same list. `./vitest.tags.ts` holds the
    // one hand-written half and the one derivation; `packages/vitest/vitest.config.ts` reuses both.
    tags: declaredTags(fileURLToPath(new URL(".", import.meta.url))),
    allowOnly: false
  }
})

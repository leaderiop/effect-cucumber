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
    // `failure-panel-fixture` fails ON PURPOSE (ADR-EC-033's real-vitest-output proof) — excluded
    // here for the same reason `.claude` is, and reached only by its own standalone
    // `vitest.config.ts` via `scripts/verify-failure-panel.sh`. `attachments-fixture` is the
    // identical shape for ADR-EC-036's real-vitest-output proof, reached only via
    // `scripts/verify-attachments-panel.sh`.
    exclude: [
      ...configDefaults.exclude,
      "**/.claude/**",
      "**/test/failure-panel-fixture/**",
      "**/test/attachments-fixture/**"
    ],
    // The universe is computed from THIS file's directory, so `pnpm test` from the root and
    // `pnpm -r test` from a package directory declare the same list. `./vitest.tags.ts` holds the
    // one hand-written half and the one derivation; `packages/vitest/vitest.config.ts` reuses both.
    tags: declaredTags(fileURLToPath(new URL(".", import.meta.url))),
    allowOnly: false,
    // spec/traceability.md §6's 90%/90% target, per package rather than blended — a change that
    // hollows out one package's tests while padding the other's must not average out clean.
    // `pnpm coverage` runs this from the root, covering both packages in the one process that
    // `pnpm test` already does; `packages/*/vitest.config.ts` carry the same target for a
    // per-package `-- --coverage` run.
    coverage: {
      provider: "v8",
      include: ["packages/*/src/**/*.ts"],
      thresholds: {
        "packages/gherkin/src/**": { statements: 90, branches: 90 },
        "packages/vitest/src/**": { statements: 90, branches: 90 }
      }
    }
  }
})

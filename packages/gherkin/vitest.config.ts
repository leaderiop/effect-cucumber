/**
 * Per-package config so `pnpm -F @effect-cucumber/gherkin test` runs the same way as the root run.
 * This package emits no tags, so only the worktree exclusion and the CI-like `allowOnly` are carried.
 */
import { configDefaults, defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, "**/.claude/**"],
    allowOnly: false,
    // spec/traceability.md §6's 90%/90% target for this package, checked by `pnpm -F
    // @effect-cucumber/gherkin test -- --coverage` and by the root `pnpm coverage`, which composes
    // the same target under its own per-package glob (see vitest.config.ts at the repo root).
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      thresholds: { statements: 90, branches: 90 }
    }
  }
})

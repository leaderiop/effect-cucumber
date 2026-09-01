/**
 * Per-package config so `pnpm -F @effect-cucumber/gherkin test` runs the same way as the root run.
 * This package emits no tags, so only the worktree exclusion and the CI-like `allowOnly` are carried.
 */
import { configDefaults, defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, "**/.claude/**"],
    allowOnly: false
  }
})

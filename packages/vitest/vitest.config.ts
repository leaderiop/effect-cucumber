/**
 * Per-package config so `pnpm -F @effect-cucumber/vitest test` (and `pnpm -r test`) runs with the
 * SAME tag universe as the root run. Without it a package-directory run declared no tags, every
 * tagged acceptance Scenario degraded to untagged behind a warning, and `--tagsFilter` could select
 * nothing. The universe is derived once, in the repository root's `vitest.tags.ts`, from a root
 * computed off this file's location rather than `process.cwd()`.
 */
import { fileURLToPath } from "node:url"
import { configDefaults, defineConfig } from "vitest/config"
import { declaredTags } from "../../vitest.tags.ts"

export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, "**/.claude/**"],
    tags: declaredTags(fileURLToPath(new URL("../../", import.meta.url))),
    allowOnly: false
  }
})

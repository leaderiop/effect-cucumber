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
    // `failure-panel-fixture` fails ON PURPOSE (ADR-EC-033's real-vitest-output proof) — excluded
    // here for the same reason `.claude` is, and reached only by its own standalone
    // `vitest.config.ts` via `scripts/verify-failure-panel.sh`.
    exclude: [...configDefaults.exclude, "**/.claude/**", "**/test/failure-panel-fixture/**"],
    tags: declaredTags(fileURLToPath(new URL("../../", import.meta.url))),
    allowOnly: false,
    // spec/traceability.md §6's 90%/90% target for this package, checked by `pnpm -F
    // @effect-cucumber/vitest test -- --coverage` and by the root `pnpm coverage`, which composes
    // the same target under its own per-package glob (see vitest.config.ts at the repo root).
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      thresholds: { statements: 90, branches: 90 }
    }
  }
})

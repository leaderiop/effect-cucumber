/**
 * A STANDALONE config, used ONLY by `scripts/verify-failure-panel.sh` via `--config`. Both the root
 * `vitest.config.ts` and `packages/vitest/vitest.config.ts` deliberately EXCLUDE this whole
 * directory from the normal run — `failing.steps.test.ts` fails on purpose, and neither of those
 * configs' `test.include`/`test.exclude` may be widened to run it (their own headers already forbid
 * that). This file is the one place `failing.steps.test.ts` IS collected, deliberately reached only
 * by an explicit `--config` flag, never by directory discovery.
 */
import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    root: fileURLToPath(new URL(".", import.meta.url)),
    include: ["*.steps.test.ts"]
  }
})

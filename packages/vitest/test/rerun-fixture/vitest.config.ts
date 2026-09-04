/**
 * A STANDALONE config, used ONLY by `scripts/verify-rerun-failed-only.sh` via `--config`. Both the
 * root `vitest.config.ts` and `packages/vitest/vitest.config.ts` deliberately EXCLUDE this whole
 * directory from the normal run — `calculator-a.steps.test.ts` fails on purpose, and neither of
 * those configs' `test.include`/`test.exclude` may be widened to run it (their own headers already
 * forbid that). This file is the one place these fixtures ARE collected, deliberately reached only
 * by an explicit `--config` flag, never by directory discovery, so that a real two-`vitest run` cycle
 * (ADR-EC-038 §6) can be driven against them with different `RERUN_FAILED_ONLY`/`RERUN_MANIFEST_PATH`
 * environment variables per invocation.
 */
import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    root: fileURLToPath(new URL(".", import.meta.url)),
    include: ["*.steps.test.ts"]
  }
})

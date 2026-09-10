/**
 * A STANDALONE config, used ONLY by `scripts/verify-junit-reporter.sh` via `--config`. Both the
 * root `vitest.config.ts` and `packages/vitest/vitest.config.ts` deliberately EXCLUDE this whole
 * directory from the normal run — `junit.steps.test.ts` fails on purpose, and neither of those
 * configs' `test.include`/`test.exclude` may be widened to run it (their own headers already forbid
 * that, for the identical reason `failure-panel-fixture`/`attachments-fixture` are excluded). This
 * file is the one place `junit.steps.test.ts` IS collected, and the one place
 * `GherkinJUnitReporter` is registered against it.
 */
import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"
import { GherkinJUnitReporter } from "../../src/JUnitReporter.ts"

const root = fileURLToPath(new URL(".", import.meta.url))

export default defineConfig({
  test: {
    root,
    include: ["*.steps.test.ts"],
    // Declared so `@smoke` (the tag `junit.feature`'s passing Scenario carries) reaches
    // `TestCase.tags` instead of being silently degraded to untagged as an undeclared tag
    // (ADR-EC-019) — this gate's whole point is proving a real tag reaches `<properties>`.
    tags: [{ name: "@smoke" }],
    // An absolute path: `outputFile` resolves against `process.cwd()`, not `root`, so a relative
    // path here would land wherever this config happened to be invoked FROM rather than beside it.
    reporters: ["default", new GherkinJUnitReporter({ outputFile: `${root}junit-report.xml` })]
  }
})

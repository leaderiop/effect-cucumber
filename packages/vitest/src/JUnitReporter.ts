/**
 * An optional, richer JUnit-XML reporter — Allure, ReportPortal, Jenkins, GitLab, and most CI
 * dashboards already ingest this format natively, so this closes the "no external reporting
 * ecosystem integration" gap without inventing a new interchange format.
 *
 * NOT a replacement for vitest's own built-in `--reporter=junit` (`vitest/reporters`, real and
 * already usable today with zero code from this package: `describeFeature` already registers a
 * real `describe(Feature.name)` → `it(Scenario.title)` hierarchy, so vitest's built-in JUnit
 * reporter already emits a `<testcase name="Feature name > Scenario title">` per Scenario, and
 * `.feature:line` failure detail (`StepFailureLocation`/`HookFailureLocation`, ADR-EC-033/052)
 * already flows into its `<failure>` message verbatim — verified directly against real
 * `vitest run --reporter=junit` output, not assumed). This reporter exists only for the TWO things
 * the built-in one has no configuration hook for at all (`JUnitOptions` has no properties/metadata
 * injection point, only name-template strings):
 *
 * 1. **Tags as structured `<properties>`**, not just prose in a test name — `TestCase.tags` (a
 *    Scenario's fully-flattened Feature/Rule/Scenario/Examples tags, ADR-EC-026) is vitest's own
 *    PUBLIC reporter-API field, populated because `Runner.ts` already passes `tags` through
 *    `it.effect(name, fn, { tags })` — nothing new to plumb here.
 * 2. **Attachments** (`attach()`, ADR-EC-036) as visible `<system-out>` content — `TestCase.
 *    annotations()` is `attach()`'s own live implementation (`ctx.annotate`, `VitestTestApi.ts`),
 *    read back through vitest's public Reporter API, not a new seam.
 *
 * Both come from vitest's OWN public `Reporter`/`TestCase` API (`vitest/node`) — no `EmitOptions`/
 * `TestApi.ts` change was needed, and none was made, because neither Scenario tags nor attachments
 * needed a new seam to reach a reporter; they already cross vitest's own public reporter surface.
 *
 * Usage — added ALONGSIDE, not instead of, the default reporter, in a consumer's OWN
 * `vitest.config.ts`:
 *
 * ```ts
 * import { GherkinJUnitReporter } from "@effect-cucumber/vitest"
 * import { defineConfig } from "vitest/config"
 *
 * export default defineConfig({
 *   test: { reporters: ["default", new GherkinJUnitReporter({ outputFile: "junit.xml" })] }
 * })
 * ```
 *
 * See ADR-EC-060.
 */
import { mkdir, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import type { Reporter, TestCase, TestModule } from "vitest/node"

export interface GherkinJUnitReporterOptions {
  /**
   * Where to write the report — resolved against `process.cwd()` when relative, matching vitest's
   * own built-in reporters' `outputFile` convention (NOT the vitest config's `root`, which is a
   * module-resolution root, not a working directory). Pass an absolute path to pin the location
   * regardless of where the run is invoked from.
   *
   * @default "junit.xml"
   */
  readonly outputFile?: string
}

const xmlEscape = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")

/** `TestResult["state"]` mapped to the one JUnit distinguishes beyond pass/fail: `skipped`. */
const isSkipped = (testCase: TestCase): boolean => testCase.result().state === "skipped"

const serializeError = (error: { readonly message?: string; readonly name?: string; readonly stack?: string }) => {
  const message = xmlEscape(error.message ?? "")
  const type = xmlEscape(error.name ?? "Error")
  const body = xmlEscape(error.stack ?? error.message ?? "")
  return `<failure message="${message}" type="${type}">${body}</failure>`
}

const serializeAnnotations = (testCase: TestCase): string => {
  const annotations = testCase.annotations()
  if (annotations.length === 0) return ""
  const body = annotations.map((annotation) => `[${annotation.type}] ${annotation.message}`).join("\n")
  return `<system-out>${xmlEscape(body)}</system-out>`
}

const serializeProperties = (testCase: TestCase): string => {
  if (testCase.tags.length === 0) return ""
  const properties = testCase.tags.map((tag) => `<property name="tag" value="${xmlEscape(tag)}"/>`).join("")
  return `<properties>${properties}</properties>`
}

const serializeTestCase = (testCase: TestCase): string => {
  const result = testCase.result()
  const diagnostic = testCase.diagnostic()
  const time = diagnostic === undefined ? "0" : (diagnostic.duration / 1000).toFixed(6)
  const attrs = `classname="${xmlEscape(testCase.module.relativeModuleId)}" name="${
    xmlEscape(testCase.fullName)
  }" time="${time}"`
  const body = [
    serializeProperties(testCase),
    result.state === "failed" ? result.errors.map(serializeError).join("") : "",
    isSkipped(testCase) ? "<skipped/>" : "",
    serializeAnnotations(testCase)
  ].join("")
  return `<testcase ${attrs}>${body}</testcase>`
}

const serializeModule = (testModule: TestModule): string => {
  const testCases = [...testModule.children.allTests()]
  const failures = testCases.filter((testCase) => testCase.result().state === "failed").length
  const skipped = testCases.filter(isSkipped).length
  const diagnostic = testModule.diagnostic()
  const time = (diagnostic.duration / 1000).toFixed(6)
  const attrs = `name="${xmlEscape(testModule.relativeModuleId)}" tests="${testCases.length}" failures="${failures}" `
    + `errors="0" skipped="${skipped}" time="${time}"`
  return `<testsuite ${attrs}>${testCases.map(serializeTestCase).join("")}</testsuite>`
}

/**
 * A vitest `Reporter` that walks the same public `TestModule`/`TestSuite`/`TestCase` API any
 * third-party reporter would, adding `<properties>` (Scenario tags) and `<system-out>`
 * (`attach()`'s own annotations) to a real, standard JUnit-XML `<testsuites>` document — the two
 * things vitest's own built-in `--reporter=junit` has no configuration hook to add.
 */
export class GherkinJUnitReporter implements Reporter {
  readonly #outputFile: string

  constructor(options: GherkinJUnitReporterOptions = {}) {
    this.#outputFile = options.outputFile ?? "junit.xml"
  }

  async onTestRunEnd(testModules: ReadonlyArray<TestModule>): Promise<void> {
    const allTests = testModules.flatMap((testModule) => [...testModule.children.allTests()])
    const failures = allTests.filter((testCase) => testCase.result().state === "failed").length
    const totalTime = testModules.reduce((sum, testModule) => sum + testModule.diagnostic().duration, 0) / 1000
    const attrs = `name="effect-cucumber" tests="${allTests.length}" failures="${failures}" errors="0" time="${
      totalTime.toFixed(6)
    }"`
    const xml = `<?xml version="1.0" encoding="UTF-8" ?>\n<testsuites ${attrs}>${
      testModules.map(serializeModule).join("")
    }</testsuites>\n`
    await mkdir(dirname(this.#outputFile), { recursive: true }).catch(() => {})
    await writeFile(this.#outputFile, xml, "utf8")
  }
}

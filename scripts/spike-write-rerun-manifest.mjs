#!/usr/bin/env node
/**
 * SPIKE (issue #34): the WRITE side of the rerun-manifest mechanism. Reads a vitest
 * `--reporter=json --outputFile=<report>` file after a real run and writes a rerun manifest
 * (`RerunManifest.ts`'s shape) containing exactly the failed Scenarios' keys, REPLACING whatever
 * manifest was there before — this run's failures are the new truth.
 *
 * Deliberately a separate, out-of-process script rather than a custom vitest Reporter class: the
 * JSON reporter already gives every failed test's `ancestorTitles` (the Feature/Rule describe
 * nesting) and `title` (the emitted Scenario title from `OutlineTitle.ts`) — exactly the three
 * pieces `RerunKey.ts`'s `rerunKey(featureName, ruleName, title)` needs — with no dependency on
 * vitest's Reporter API surface, which differs across major versions.
 *
 * Usage: node scripts/spike-write-rerun-manifest.mjs <json-report-path> <manifest-path>
 */
import * as fs from "node:fs"
import * as path from "node:path"

const [, , reportPath, manifestPath] = process.argv
if (reportPath === undefined || manifestPath === undefined) {
  console.error("usage: spike-write-rerun-manifest.mjs <json-report-path> <manifest-path>")
  process.exit(1)
}

const report = JSON.parse(fs.readFileSync(reportPath, "utf8"))

const rerunKey = (featureName, ruleName, title) => `${featureName}::${ruleName ?? ""}::${title}`

const failedKeys = new Set()
for (const testFile of report.testResults ?? []) {
  for (const assertion of testFile.assertionResults ?? []) {
    if (assertion.status !== "failed") continue
    // `ancestorTitles`: `[featureName]` for a Feature-level Scenario, `[featureName, ruleName]` for
    // one nested in a `Rule(...)` — matches exactly how `Runner.ts`'s `emitFeature` nests
    // `api.describe` calls.
    const [featureName, ruleName] = assertion.ancestorTitles
    failedKeys.add(rerunKey(featureName, ruleName ?? null, assertion.title))
  }
}

fs.mkdirSync(path.dirname(manifestPath), { recursive: true })
fs.writeFileSync(manifestPath, `${JSON.stringify({ failed: [...failedKeys].toSorted() }, null, 2)}\n`, "utf8")

console.log(`wrote ${failedKeys.size} failed key(s) to ${manifestPath}:`)
for (const key of failedKeys) console.log(`  ${key}`)

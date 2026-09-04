#!/usr/bin/env node
/**
 * A COPYABLE template, not a script this package runs against your tree automatically — see
 * `packages/vitest/README.md`'s "Rerun failed Scenarios only" section, and ADR-EC-038 §6. Copy this
 * file into YOUR repository (e.g. `scripts/write-rerun-manifest.mjs`) and wire it into YOUR CI after
 * a `vitest run --reporter=json --outputFile=<path>` step.
 *
 * Reads a vitest `--reporter=json` report and writes `{ "failed": string[] }` — a manifest
 * `rerunFailedOnly`/`rerunManifestPath` consumes on the NEXT run. Every key is read directly off
 * `assertionResults[].meta.rerunKey`, the exact string `@effect-cucumber/vitest`'s own `RerunKey.ts`
 * computed once and `VitestTestApi.ts` stamped onto `ctx.task.meta` BEFORE the Scenario's own Effect
 * ran — so it is present whether that Scenario passed or failed, and this script never reconstructs
 * the key itself (no `ancestorTitles`/`title` join logic to keep in sync with the library's own).
 *
 * Every run of this script REPLACES the manifest's contents — it does not accumulate history across
 * runs — the only sane semantics for a file meant to answer "what failed LAST time."
 *
 * Usage: `node write-rerun-manifest.mjs [reportPath] [manifestPath]`
 *   reportPath   defaults to ".vitest-report.json" (relative to process.cwd())
 *   manifestPath defaults to ".effect-cucumber/rerun-manifest.json" — the SAME default
 *                `RerunManifest.ts`'s `defaultRerunManifestPath` uses, so a consumer who does not
 *                override `rerunManifestPath` needs no argument here either.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"

const reportPath = process.argv[2] ?? ".vitest-report.json"
const manifestPath = process.argv[3] ?? ".effect-cucumber/rerun-manifest.json"

const report = JSON.parse(readFileSync(reportPath, "utf8"))

const failed = new Set()
for (const testResult of report.testResults ?? []) {
  for (const assertion of testResult.assertionResults ?? []) {
    if (assertion.status !== "failed") continue
    const key = assertion.meta?.rerunKey
    if (typeof key === "string") failed.add(key)
  }
}

mkdirSync(dirname(manifestPath), { recursive: true })
writeFileSync(manifestPath, JSON.stringify({ failed: [...failed] }, null, 2) + "\n", "utf8")

console.log(`wrote ${failed.size} failed Scenario key(s) to ${manifestPath}`)

#!/usr/bin/env node
//
// Drift detection for this repo's one remaining vendored file (ADR-EC-059): `packages/vitest/src/
// VitestTagsFilter.ts` (from `@vitest/runner`). `@vitest/runner` is not a dependency anywhere
// reachable from a published package, so `pnpm update` never surfaces when it has moved upstream —
// this script is that missing signal, run only from the scheduled `canary.yml` workflow (never a
// PR/release gate, matching `scripts/canary-bump-effect-rc.mjs`'s own philosophy: a red run here
// means a re-sync needs real work, found before it lands as a surprise).
//
// `@effect/vitest` was un-vendored back into a real dependency at `4.0.0-rc.113` (ADR-EC-059's
// second Correction) — it is a normal catalog entry now, tracked by `pnpm outdated` like any other
// dependency, so it is no longer checked here.
//
// This checks for VERSION MOVEMENT only, against `scripts/vendor-provenance.json` (kept in sync by
// hand with the vendored file's own header prose) — it cannot verify that no new drift exists in the
// vendored grammar/logic itself; a human still reads the failure and re-diffs against upstream per
// ADR-EC-059's own RE-SYNCING notes.
//
// Usage: node scripts/verify-vendor-drift.mjs
import { readFile } from "node:fs/promises"

const provenance = JSON.parse(await readFile(new URL("./vendor-provenance.json", import.meta.url), "utf8"))

const fetchJson = async (url) => {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`registry lookup for ${url} failed: HTTP ${response.status}`)
  }
  return response.json()
}

let driftFound = false

// --- VitestTagsFilter.ts, vendored from @vitest/runner ---------------------------------------
{
  const vendored = provenance.vitestTagsFilter
  const registry = await fetchJson(`https://registry.npmjs.org/${encodeURIComponent(vendored.package)}`)
  const currentLatest = registry["dist-tags"]?.latest
  if (currentLatest !== vendored.latestKnownStable) {
    driftFound = true
    console.log(
      `⚠ ${vendored.package}'s "latest" dist-tag moved from ${vendored.latestKnownStable} `
        + `(vendored against) to ${currentLatest}. If this is now a stable vitest-5 release, `
        + `re-check whether vitest re-exports the tag-expression grammar publicly yet, and `
        + `re-diff ${vendored.file} against it. See ${vendored.reSyncNotes}.`
    )
  } else {
    console.log(
      `✓ ${vendored.package}: still at ${currentLatest}, matching what ${vendored.file} was vendored against.`
    )
  }
}

if (driftFound) {
  console.log("\nvendor-drift gate: DRIFT DETECTED (see above) — informational, not a hard failure of this repo's own code.")
  process.exit(1)
} else {
  console.log("\nvendor-drift gate: no drift — the vendored file still matches what it was checked against.")
}

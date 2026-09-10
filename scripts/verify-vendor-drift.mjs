#!/usr/bin/env node
//
// Drift detection for this repo's two vendored files (ADR-EC-059): `packages/vitest/src/
// VitestTagsFilter.ts` (from `@vitest/runner`) and `EffectVitestInternal.ts` (from `@effect/vitest`).
// Neither package is a dependency anywhere reachable from a published package, so `pnpm update`
// never surfaces when either has moved upstream — this script is that missing signal, run only
// from the scheduled `canary.yml` workflow (never a PR/release gate, matching
// `scripts/canary-bump-effect-rc.mjs`'s own philosophy: a red run here means a re-sync needs real
// work, found before it lands as a surprise).
//
// This checks for VERSION MOVEMENT only, against `scripts/vendor-provenance.json` (kept in sync by
// hand with each vendored file's own header prose) — it cannot verify that a newer version actually
// fixes what blocked us, or that no new drift exists in the vendored grammar/logic itself; a human
// still reads the failure and re-diffs against upstream per ADR-EC-059's own RE-SYNCING notes. A
// green run means "nothing to re-check," never "safe to un-vendor."
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

// --- EffectVitestInternal.ts, vendored from @effect/vitest ------------------------------------
{
  const vendored = provenance.effectVitestInternal
  const registry = await fetchJson(`https://registry.npmjs.org/${encodeURIComponent(vendored.package)}`)
  const currentVersion = registry["dist-tags"]?.[vendored.distTag]
  if (currentVersion !== vendored.vendoredAtVersion) {
    driftFound = true
    console.log(
      `⚠ ${vendored.package}'s "${vendored.distTag}" dist-tag moved from ${vendored.vendoredAtVersion} `
        + `(vendored against) to ${currentVersion}. Re-check its peerDependencies.vitest range for `
        + `that version (\`npm view ${vendored.package}@${currentVersion} peerDependencies\`) — and, `
        + `separately, re-verify whether the module-duplication interop bug this repo hit when it `
        + `last tried depending on ${vendored.package} directly (a real dependency's own \`vitest\` `
        + `peer resolving to a DIFFERENT physical module instance than the one driving collection, `
        + `surfacing as "Cannot read properties of undefined (reading 'config')" inside vitest's own `
        + `suite collector) has since been fixed upstream or in this workspace's pnpm/Vite setup. `
        + `See ${vendored.reSyncNotes}.`
    )
  } else {
    console.log(
      `✓ ${vendored.package}@${vendored.distTag}: still at ${currentVersion}, matching what ${vendored.file} was vendored against.`
    )
  }
}

if (driftFound) {
  console.log("\nvendor-drift gate: DRIFT DETECTED (see above) — informational, not a hard failure of this repo's own code.")
  process.exit(1)
} else {
  console.log("\nvendor-drift gate: no drift — both vendored files still match what they were checked against.")
}

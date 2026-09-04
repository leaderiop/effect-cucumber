#!/usr/bin/env node
//
// Rewrites pnpm-workspace.yaml's exact-pin `catalog:` entries and range `catalogs: peer:` entries
// for effect, @effect/vitest and @effect/platform-node to whatever each package's own npm `rc`
// dist-tag resolves to RIGHT NOW, then exits. Run only inside the scheduled canary workflow
// (.github/workflows/canary.yml) — never committed back, never run against a PR or a real release:
// the whole point is a throwaway install this repo's own rc pin never sees. See the "Under
// consideration" -> canary entry this closes in spec/roadmap.md.
//
// Usage: node scripts/canary-bump-effect-rc.mjs
import { readFile, writeFile } from "node:fs/promises"

const WORKSPACE_FILE = new URL("../pnpm-workspace.yaml", import.meta.url)

const PACKAGES = ["effect", "@effect/vitest", "@effect/platform-node"]

const fetchRcVersion = async (name) => {
  const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}`)
  if (!response.ok) {
    throw new Error(`registry lookup for ${name} failed: HTTP ${response.status}`)
  }
  const body = await response.json()
  const version = body["dist-tags"]?.rc
  if (typeof version !== "string" || version.length === 0) {
    throw new Error(`${name} has no "rc" dist-tag on the npm registry — nothing to canary against`)
  }
  return version
}

const versions = Object.fromEntries(
  await Promise.all(PACKAGES.map(async (name) => [name, await fetchRcVersion(name)]))
)

let workspace = await readFile(WORKSPACE_FILE, "utf8")
const changes = []

for (const name of PACKAGES) {
  const version = versions[name]
  const key = name.includes("/") ? `"${name}"` : name

  // Exact pin, under `catalog:` — e.g. `  effect: 4.0.0-rc.112`
  const exactPattern = new RegExp(`(^ {2}${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}: )\\S+`, "m")
  if (!exactPattern.test(workspace)) {
    throw new Error(`could not find the exact-pin catalog entry for ${name} in pnpm-workspace.yaml`)
  }
  workspace = workspace.replace(exactPattern, `$1${version}`)

  // Range pin, under `catalogs: peer:` — e.g. `    effect: ^4.0.0-rc.112`
  const rangePattern = new RegExp(`(^ {4}${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}: \\^)\\S+`, "m")
  if (!rangePattern.test(workspace)) {
    throw new Error(`could not find the peer-range catalog entry for ${name} in pnpm-workspace.yaml`)
  }
  workspace = workspace.replace(rangePattern, `$1${version}`)

  changes.push(`${name} -> ${version}`)
}

await writeFile(WORKSPACE_FILE, workspace)

console.log("pnpm-workspace.yaml pinned to today's effect rc line:")
for (const change of changes) console.log(`  ${change}`)

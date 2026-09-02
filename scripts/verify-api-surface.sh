#!/usr/bin/env bash
#
# Asserts that `spec/overview.md` § "Public API surface" and the real public surface of
# `@effect-cucumber/vitest` agree, in BOTH directions:
#
#   1. every name exported by `packages/vitest/src/index.ts` (values and types) has a row in
#      the "Exports" table, and every row names a real export;
#   2. every member the dsl hands `define` (the `readonly X:` members of the container
#      interfaces in `packages/vitest/src/Dsl.ts`) has a row in the "DSL members" table, and
#      every row names a real member.
#
# METHOD NOTE: `pnpm build` and `pnpm test` exiting 0 prove nothing about the spec's table —
# an export added to the barrel and never written down leaves both green. Only a structural
# comparison can catch that, and the positive controls below make sure the comparison is
# scanning something: an emptied barrel or a renamed heading would otherwise pass by
# comparing nothing with nothing.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BARREL="$ROOT_DIR/packages/vitest/src/index.ts"
DSL="$ROOT_DIR/packages/vitest/src/Dsl.ts"
OVERVIEW="$ROOT_DIR/spec/overview.md"

fail() { echo "✗ $*" >&2; exit 1; }

for f in "$BARREL" "$DSL" "$OVERVIEW"; do
  [ -f "$f" ] || fail "missing file: $f"
done

node - "$BARREL" "$DSL" "$OVERVIEW" <<'NODE'
const fs = require("node:fs")
const [barrelPath, dslPath, overviewPath] = process.argv.slice(2)
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

// 1. Barrel exports: `export { a, type b as c } from ...` and `export type { ... } from ...`.
const barrel = stripComments(fs.readFileSync(barrelPath, "utf8"))
const exported = new Set()
for (const m of barrel.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}/g)) {
  for (const raw of m[1].split(",")) {
    const name = raw.trim().replace(/^type\s+/, "").split(/\s+as\s+/).pop()
    if (name) exported.add(name.trim())
  }
}
for (const m of barrel.matchAll(/export\s+(?:const|function|class|type|interface)\s+([A-Za-z_$][\w$]*)/g)) exported.add(m[1])

// 2. DSL members: every top-level (two-space-indented) `readonly Name:` member of an exported
//    container interface; a `readonly` nested inside a member's parameter type is not a member.
const dsl = stripComments(fs.readFileSync(dslPath, "utf8"))
const members = new Set()
for (const iface of dsl.matchAll(/export interface (\w+Dsl)<[^>]*>[^{]*\{([\s\S]*?)\n\}/g)) {
  for (const m of iface[2].matchAll(/^ {2}readonly\s+([A-Za-z_$][\w$]*)\s*[:<(]/gm)) members.add(m[1])
}

// 3. The two tables in the overview, located by their markers.
const overview = fs.readFileSync(overviewPath, "utf8")
const tableAfter = (marker) => {
  const start = overview.indexOf(marker)
  if (start < 0) throw new Error(`marker not found in spec/overview.md: ${marker}`)
  const rest = overview.slice(start + marker.length)
  const names = new Set()
  for (const line of rest.split("\n")) {
    if (!line.startsWith("|")) { if (names.size > 0) break; else continue }
    if (/^\|\s*-+/.test(line) || /^\|\s*(Export|Member)\s*\|/.test(line)) continue
    const first = line.split("|")[1] ?? ""
    for (const m of first.matchAll(/`([^`]+)`/g)) names.add(m[1])
  }
  return names
}
const tableExports = tableAfter("<!-- api-surface:exports -->")
const tableMembers = tableAfter("<!-- api-surface:dsl-members -->")

const diff = (label, actual, documented) => {
  const missing = [...actual].filter((n) => !documented.has(n)).sort()
  const stale = [...documented].filter((n) => !actual.has(n)).sort()
  if (missing.length > 0) console.error(`✗ ${label}: real but not in spec/overview.md: ${missing.join(", ")}`)
  if (stale.length > 0) console.error(`✗ ${label}: in spec/overview.md but not real: ${stale.join(", ")}`)
  return missing.length === 0 && stale.length === 0
}

// Positive controls: the scan must have found the anchors everyone knows exist.
if (!exported.has("describeFeature")) { console.error("✗ positive control: describeFeature not found among barrel exports — the barrel scan is broken"); process.exit(1) }
if (!members.has("Given")) { console.error("✗ positive control: Given not found among Dsl.ts members — the dsl scan is broken"); process.exit(1) }
if (tableExports.size === 0 || tableMembers.size === 0) { console.error("✗ positive control: an overview table is empty"); process.exit(1) }
console.log(`✓ positive controls: ${exported.size} barrel export(s), ${members.size} dsl member(s), ${tableExports.size} + ${tableMembers.size} documented row name(s)`)

const ok1 = diff("exports", exported, tableExports)
const ok2 = diff("dsl members", members, tableMembers)
if (!(ok1 && ok2)) process.exit(1)
console.log("✓ spec/overview.md § Public API surface matches packages/vitest/src/index.ts and Dsl.ts in both directions")
console.log("")
console.log("public API surface: ENFORCED")
NODE

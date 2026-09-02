#!/usr/bin/env bash
#
# Asserts that `@effect-cucumber/gherkin` cannot reach a test runner or a concrete
# platform runtime — in its source tree or in any consumer-installed manifest field.
# It may reach `effect` as a PEER dependency only (ADR-EC-021). `pnpm test` cannot
# catch it: a green suite is equally consistent with src/ having grown a vitest
# import. Positive control: the scan finds the real `@cucumber/gherkin` imports.
#
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# Spelled out in full rather than composed, so these paths stay greppable.
SRC_DIR="packages/gherkin/src"
MANIFEST="packages/gherkin/package.json"

FORBIDDEN_RE='(vitest|@effect/vitest|@effect/platform-node|@effect/platform-bun|@effect/platform-deno)'

IMPORT_RE="(^|[^A-Za-z0-9_\$])(from|import|require)[[:space:]]*\(?[[:space:]]*[\"'\`]${FORBIDDEN_RE}(/[^\"'\`]*)?[\"'\`]"

# The positive control's specifier: the parser this package is built on.
CONTROL_RE="(^|[^A-Za-z0-9_\$])(from|import|require)[[:space:]]*\(?[[:space:]]*[\"'\`]@cucumber/gherkin[\"'\`]"

# A comment line, once `grep -n ''` has prefixed it with `NN:`. Leading
# whitespace, then a double slash, a bare asterisk, or a slash-star.
COMMENT_RE='^[0-9]+:[[:space:]]*(//|\*|/\*)'

fail() {
  echo ""
  echo "✗ @effect-cucumber/gherkin runner/runtime independence: NOT ENFORCED"
  echo ""
  echo "  $1"
  echo ""
  exit 1
}

# Precondition, so a deleted or moved target never reads as a pass.
[[ -d "$SRC_DIR" ]] || fail "missing directory $SRC_DIR — the tree this gate scans is absent, so nothing was verified."
[[ -f "$MANIFEST" ]] || fail "missing file $MANIFEST — the manifest this gate asserts over is absent, so nothing was verified."

SRC_FILES="$(find "$SRC_DIR" -type f -name '*.ts' | sort)"
[[ -n "$SRC_FILES" ]] || fail "no .ts files found under $SRC_DIR — the scan would be vacuous."

# Prefix every line with its number, drop comment lines, then match. The
# filtering happens BEFORE any count, so a doc comment that merely NAMES
# `effect` cannot register as a hit.
scan() {
  local file="$1" pattern="$2"
  grep -n '' "$file" | grep -vE "$COMMENT_RE" | grep -E "$pattern" || true
}

# ---------------------------------------------------------------------------
# Assertion 1: positive control. At least one file under src/ must import
# ---------------------------------------------------------------------------
CONTROL_HITS=0
while IFS= read -r file; do
  [[ -n "$file" ]] || continue
  if [[ -n "$(scan "$file" "$CONTROL_RE")" ]]; then
    CONTROL_HITS=$((CONTROL_HITS + 1))
  fi
done <<<"$SRC_FILES"

if [[ "$CONTROL_HITS" -eq 0 ]]; then
  fail "positive control found ZERO imports of \"@cucumber/gherkin\" under $SRC_DIR — the scan is not reaching real import lines, so its silence proves nothing. Check whether the source tree moved or the comment filter is over-broad."
fi
echo "✓ positive control: $CONTROL_HITS file(s) under $SRC_DIR import \"@cucumber/gherkin\" — the scan reaches real imports"

# ---------------------------------------------------------------------------
# Assertion 2: THE GATE, source side. No file under src/ may import vitest,
# ---------------------------------------------------------------------------
VIOLATIONS=""
while IFS= read -r file; do
  [[ -n "$file" ]] || continue
  hits="$(scan "$file" "$IMPORT_RE")"
  if [[ -n "$hits" ]]; then
    while IFS= read -r hit; do
      [[ -n "$hit" ]] || continue
      VIOLATIONS+="    $file:$hit"$'\n'
    done <<<"$hits"
  fi
done <<<"$SRC_FILES"

if [[ -n "$VIOLATIONS" ]]; then
  echo ""
  echo "  forbidden import specifiers found:"
  printf '%s' "$VIOLATIONS"
  fail "a file under $SRC_DIR imports a test runner or a concrete platform implementation (listed above). @effect-cucumber/gherkin must not be able to reach vitest, @effect/vitest, or @effect/platform-{node,bun,deno} — only the runner-agnostic effect/@effect/platform service interfaces. See ADR-EC-021."
fi
echo "✓ no file under $SRC_DIR imports vitest, @effect/vitest, or a concrete @effect/platform-* implementation"

# ---------------------------------------------------------------------------
# Assertion 3: THE GATE, manifest side.
# ---------------------------------------------------------------------------
MANIFEST_OUTPUT="$(
  MANIFEST="$MANIFEST" node -e '
    const fs = require("node:fs")
    const manifestPath = process.env.MANIFEST
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"))
    const neverAllowed = ["vitest", "@effect/vitest", "@effect/platform-node", "@effect/platform-bun", "@effect/platform-deno"]
    const peerOnly = ["effect", "@effect/platform"]
    const hits = []

    const dependencies = manifest.dependencies || {}
    for (const name of [...neverAllowed, ...peerOnly]) {
      if (Object.prototype.hasOwnProperty.call(dependencies, name)) {
        hits.push("dependencies." + name + " = " + JSON.stringify(dependencies[name]))
      }
    }

    const optionalDependencies = manifest.optionalDependencies || {}
    for (const name of [...neverAllowed, ...peerOnly]) {
      if (Object.prototype.hasOwnProperty.call(optionalDependencies, name)) {
        hits.push("optionalDependencies." + name + " = " + JSON.stringify(optionalDependencies[name]))
      }
    }

    const bundled = manifest.bundledDependencies || manifest.bundleDependencies || []
    if (Array.isArray(bundled)) {
      for (const name of [...neverAllowed, ...peerOnly]) {
        if (bundled.includes(name)) {
          hits.push("bundledDependencies includes " + JSON.stringify(name))
        }
      }
    }

    const peerDependencies = manifest.peerDependencies || {}
    for (const name of neverAllowed) {
      if (Object.prototype.hasOwnProperty.call(peerDependencies, name)) {
        hits.push("peerDependencies." + name + " = " + JSON.stringify(peerDependencies[name]))
      }
    }

    if (hits.length > 0) {
      console.log("HITS " + hits.join(", "))
    } else {
      console.log("CLEAN dependencies, optionalDependencies, bundledDependencies, peerDependencies")
    }
  '
)"

if [[ "$MANIFEST_OUTPUT" == HITS* ]]; then
  fail "$MANIFEST declares a forbidden package in a consumer-facing dependency field: ${MANIFEST_OUTPUT#HITS }. effect/@effect/platform may ONLY appear in peerDependencies (ADR-EC-021); vitest, @effect/vitest, and any concrete @effect/platform-* implementation may not appear in any of dependencies, optionalDependencies, bundledDependencies or peerDependencies."
fi
echo "✓ $MANIFEST: no forbidden package in dependencies/optionalDependencies/bundledDependencies; peerDependencies carries only effect/@effect/platform, never a runner or a concrete platform implementation"

echo ""
echo "@effect-cucumber/gherkin runner/runtime independence: ENFORCED"

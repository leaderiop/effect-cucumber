#!/usr/bin/env bash
#
# Asserts that `@effect-cucumber/gherkin` CANNOT REACH a test runner or Effect —
# neither through its source tree nor through its runtime/peer manifest fields.
#
# This is PARSE-01 (BEH-EC-001) proved BY CONSTRUCTION: a `loadFeature` that
# cannot reach a test runner cannot register a test. It simultaneously guards
# ADR-EC-015, which forbids this package from declaring `effect` in any manifest
# field a consumer is forced to install.
#
# METHOD NOTE (do not weaken this):
#   `pnpm test` exiting 0 does NOT prove any of this. The behavioral form of the
#   PARSE-01 check — a module-top-level `loadFeature` call plus exactly one `it`,
#   asserting the reported test count did not grow — is necessary but weak: it
#   OBSERVES that `loadFeature` contributed no tests on one particular run. A
#   suite stays perfectly green while `packages/gherkin/src/` quietly grows a
#   `vitest` import, or while `dependencies` quietly grows `effect`. Observation
#   cannot distinguish "has no capability" from "has the capability and did not
#   use it today". Only a structural scan can, and that is what this script is.
#
#   The manifest assertion is scoped to `dependencies` and `peerDependencies`
#   ONLY, and this scoping is DELIBERATE — do not "fix" it by widening to all
#   three dependency fields. `packages/gherkin/package.json` legitimately carries
#   `vitest` in `devDependencies` (added in plan 02-01, it is how the package's
#   own tests run); `devDependencies` are never installed by a consumer, so they
#   grant the SHIPPED package no capability. Widening the scope would make this
#   gate permanently red for a state that is correct.
#
#   The manifest assertion parses JSON with `node -e` and `JSON.parse`, never
#   with grep, because a grep over the manifest cannot tell WHICH dependency
#   field a key sits in — which is the entire distinction the assertion turns on.
#
#   Comment lines are stripped before any occurrence is counted. Several modules
#   under src/ name `effect` and `@effect-cucumber/*` in their doc comments (see
#   Errors.ts, which cites ADR-EC-015 by name). Counting raw text would make the
#   gate self-invalidating: documenting the rule would violate it.
#
#   Assertion 1 is a positive control. Without it, a moved or renamed source
#   tree makes assertions 2 and 3 pass by scanning nothing. STATE.md 01-02
#   records a grep-based gate in this repo that passed, and was then proven
#   vacuous by mutation testing. That is why every assertion here has a control
#   and why this script is mutation-tested.
#
# Usage: bash scripts/verify-no-runner-dep.sh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# Spelled out in full rather than composed, so these paths stay greppable.
SRC_DIR="packages/gherkin/src"
MANIFEST="packages/gherkin/package.json"

# The specifiers that would grant the package a runtime capability it must not
# have. Matched exactly, or as a submodule path (`effect/Effect`, `vitest/node`).
FORBIDDEN_RE='(vitest|@effect/vitest|effect)'

# A real import specifier: the quoted module string in a `from "..."`,
# `import "..."`, `import("...")` or `require("...")` position. Anything else —
# a doc comment, a string literal, an identifier — is not an import.
IMPORT_RE="(^|[^A-Za-z0-9_\$])(from|import|require)[[:space:]]*\(?[[:space:]]*[\"']${FORBIDDEN_RE}(/[^\"']*)?[\"']"

# The positive control's specifier: the parser this package is built on.
CONTROL_RE="(^|[^A-Za-z0-9_\$])(from|import|require)[[:space:]]*\(?[[:space:]]*[\"']@cucumber/gherkin[\"']"

# A comment line, once `grep -n ''` has prefixed it with `NN:`. Leading
# whitespace, then a double slash, a bare asterisk, or a slash-star.
COMMENT_RE='^[0-9]+:[[:space:]]*(//|\*|/\*)'

fail() {
  echo ""
  echo "✗ @effect-cucumber/gherkin runner independence: NOT ENFORCED"
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
# `@cucumber/gherkin`. Proves the scan mechanism reaches real import lines
# before assertion 2 is asked to trust its silence. If the tree moved, was
# renamed, or the comment filter became over-broad, this trips first.
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
# @effect/vitest, or effect. A single such import would give `loadFeature` the
# ability to register a test, which is precisely what PARSE-01 forbids.
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
  fail "a file under $SRC_DIR imports a test runner or Effect (listed above). @effect-cucumber/gherkin is parsing-only: it must not be able to reach vitest, @effect/vitest, or effect. See PARSE-01 / BEH-EC-001 and ADR-EC-015."
fi
echo "✓ no file under $SRC_DIR imports vitest, @effect/vitest, or effect"

# ---------------------------------------------------------------------------
# Assertion 3: THE GATE, manifest side. Neither `dependencies` nor
# `peerDependencies` may name vitest, @effect/vitest, or effect — those are the
# two fields a consumer is forced to install. `devDependencies` is deliberately
# NOT inspected; see the METHOD NOTE.
# ---------------------------------------------------------------------------
MANIFEST_OUTPUT="$(
  MANIFEST="$MANIFEST" node -e '
    const fs = require("node:fs")
    const manifestPath = process.env.MANIFEST
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"))
    const forbidden = ["vitest", "@effect/vitest", "effect"]
    // dependencies and peerDependencies ONLY. devDependencies is excluded by
    // design: vitest legitimately lives there and is never installed by a
    // consumer of the published package.
    const fields = ["dependencies", "peerDependencies"]
    const hits = []
    for (const field of fields) {
      const block = manifest[field]
      if (!block || typeof block !== "object") continue
      for (const name of forbidden) {
        if (Object.prototype.hasOwnProperty.call(block, name)) {
          hits.push(field + "." + name + " = " + JSON.stringify(block[name]))
        }
      }
    }
    if (hits.length > 0) {
      console.log("HITS " + hits.join(", "))
    } else {
      console.log("CLEAN " + fields.join(", "))
    }
  '
)"

if [[ "$MANIFEST_OUTPUT" == HITS* ]]; then
  fail "$MANIFEST declares a forbidden package in a consumer-facing dependency field: ${MANIFEST_OUTPUT#HITS }. ADR-EC-015 forbids @effect-cucumber/gherkin from declaring effect (or a test runner) in dependencies or peerDependencies — those are installed by every consumer."
fi
echo "✓ $MANIFEST declares none of vitest, @effect/vitest, effect in ${MANIFEST_OUTPUT#CLEAN }"

echo ""
echo "@effect-cucumber/gherkin runner independence: ENFORCED"

#!/usr/bin/env bash
#
# Asserts that `@effect-cucumber/gherkin` CANNOT REACH a test runner or a
# concrete platform runtime — neither through its source tree nor through its
# runtime/peer manifest fields. It MAY reach `effect`/`@effect/platform`
# (the service interfaces) as a peer dependency only, per ADR-EC-021.
#
# ADR-EC-021 supersedes ADR-EC-015: `@effect-cucumber/gherkin` is no longer
# effect-free (see spec/decisions/021-effect-and-platform-are-peer-dependencies-of-gherkin.md),
# but it must still never depend on a test runner, and it must never bundle
# or hard-depend on `effect`/`@effect/platform`, or on any concrete platform
# implementation (`@effect/platform-node`, `-bun`, `-deno`) — those stay the
# concern of whichever runner package (`@effect-cucumber/vitest`, a future
# `@effect-cucumber/bun-test`, ...) builds the actual `ManagedRuntime`.
#
# METHOD NOTE (do not weaken this):
#   `pnpm test` exiting 0 does NOT prove any of this. Observation cannot
#   distinguish "has no capability" from "has the capability and did not use
#   it today". Only a structural scan can, and that is what this script is.
#
#   The manifest assertion is scoped to `dependencies` and `peerDependencies`
#   ONLY, and this scoping is DELIBERATE — do not "fix" it by widening to all
#   three dependency fields. `packages/gherkin/package.json` legitimately
#   carries `vitest`, `effect`, and `@effect/platform` in `devDependencies`
#   (the package's own tests run against them); `devDependencies` are never
#   installed by a consumer, so they grant the SHIPPED package no capability.
#   Widening the scope would make this gate permanently red for a state that
#   is correct.
#
#   The manifest assertion parses JSON with `node -e` and `JSON.parse`, never
#   with grep, because a grep over the manifest cannot tell WHICH dependency
#   field a key sits in — which is the entire distinction the assertion turns
#   on, and now matters even more: `effect`/`@effect/platform` are ALLOWED in
#   `peerDependencies` but FORBIDDEN in `dependencies`.
#
#   Comment lines are stripped before any occurrence is counted. Several
#   modules under src/ name `effect` and `ADR-EC-021` in their doc comments.
#   Counting raw text would make the gate self-invalidating: documenting the
#   rule would violate it.
#
#   Assertion 1 is a positive control. Without it, a moved or renamed source
#   tree makes assertions 2 and 3 pass by scanning nothing. STATE.md 01-02
#   records a grep-based gate in this repo that passed, and was then proven
#   vacuous by mutation testing. That is why every assertion here has a
#   control and why this script is mutation-tested.
#
# Usage: bash scripts/verify-no-runner-dep.sh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# Spelled out in full rather than composed, so these paths stay greppable.
SRC_DIR="packages/gherkin/src"
MANIFEST="packages/gherkin/package.json"

# The specifiers that must NEVER appear anywhere under src/, full stop — a
# test runner, or a concrete platform implementation. Unlike the manifest
# check below, there is no "allowed as a peer" carve-out here: `effect` and
# `@effect/platform` themselves ARE allowed as source imports (that's the
# entire point of ADR-EC-021), so they are deliberately absent from this
# list. Matched exactly, or as a submodule path (`vitest/node`).
FORBIDDEN_RE='(vitest|@effect/vitest|@effect/platform-node|@effect/platform-bun|@effect/platform-deno)'

# A real import specifier: the quoted module string in a `from "..."`,
# `import "..."`, `import("...")` or `require("...")` position. Anything else
# — a doc comment, a string literal, an identifier — is not an import.
#
# The quote class includes a backtick, not only `"`/`'`: a dynamic `import()`
# accepts any expression, including a plain template literal with no
# interpolation (`import(\`vitest\`)`), which is valid TypeScript and would
# otherwise silently bypass this scan. Verified by reproduction: the
# double/single-quote-only class matched zero times against exactly that
# line before this fix.
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
# @effect/vitest, or a concrete platform implementation
# (@effect/platform-node/-bun/-deno). `effect` and `@effect/platform`
# themselves are permitted — see FORBIDDEN_RE's comment above.
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
#   - `dependencies` and `optionalDependencies` may name none of: vitest,
#     @effect/vitest, effect, @effect/platform, @effect/platform-{node,bun,deno}.
#     Nothing on this list may be bundled OR installed-by-default — a hard or
#     optional dependency both risk a duplicate `effect` install breaking
#     Context.Service identity for a consumer, the exact failure mode
#     ADR-EC-015 (and now ADR-EC-021) both exist to avoid. `optionalDependencies`
#     installs for a consumer by default, exactly like `dependencies` — unlike
#     `devDependencies`, it is not a deliberate exclusion, and was previously
#     unchecked here, a real gap: a forbidden package placed there passed this
#     gate silently.
#   - `bundledDependencies`/`bundleDependencies` (an array of names, not a
#     name->version map) may name none of the same packages — bundling one
#     ships it inside the published tarball regardless of which other field,
#     if any, also names it.
#   - `peerDependencies` may name `effect` and `@effect/platform` (that is
#     the entire point of ADR-EC-021), but still may not name vitest,
#     @effect/vitest, or any concrete platform implementation — those stay
#     the concern of whichever runner package consumes gherkin.
# `devDependencies` is deliberately NOT inspected; see the METHOD NOTE.
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

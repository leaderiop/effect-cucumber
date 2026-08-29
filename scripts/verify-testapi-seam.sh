#!/usr/bin/env bash
#
# Asserts that the runner package's emission module (`Runner.ts`) and the
# injected test-api seam it emits through (`TestApi.ts`) CANNOT REACH a test
# framework — not through a value import, not through an `import type`, and not
# through a dynamic `import()` written with a template literal.
#
# Both target files state this rule in their own note (a): the emission module
# computes library-owned plain data and hands it to an injected seam, and only
# the composition root (`describeFeature.ts`) is permitted to name a framework.
# That seam is what makes the recording fake in `Runner.test.ts` writable at
# all. Phase 9 is the first phase that gives somebody a concrete reason to
# reach for a framework's own options type in `TestApi.ts` ("we are modelling
# its options anyway" — 09-RESEARCH.md Finding 16, D-11). Such an import would
# type-check, lint clean, pass every test, and quietly dissolve the seam.
#
# METHOD NOTE (do not weaken this):
#   `pnpm test` exiting 0 does NOT prove any of this. Observation cannot
#   distinguish "has no capability" from "has the capability and did not use
#   it today". Only a structural scan can, and that is what this script is.
#   Proven by mutation, not asserted: with a type-only framework import added
#   to `TestApi.ts`, `pnpm build` and `pnpm test` both still exit 0 while this
#   script exits 1 naming that file. That asymmetry is the whole reason the
#   script exists.
#
#   Comment lines are stripped before any occurrence is counted. Both target
#   files name, in prose, the very rule they are subject to. Counting raw text
#   would make the gate self-invalidating: documenting the rule would violate
#   it. For the same reason the forbidden specifiers are spelled in exactly ONE
#   place in this file — the FORBIDDEN_RE assignment below — and never in this
#   prose, exactly as `Runner.ts` note (a) itself refuses to. A citation must
#   not be able to false-positive its own gate.
#
#   Assertion 1 is a positive control. Without it, a moved, renamed or emptied
#   target makes assertions 2 and 3 pass by scanning nothing, and a scan of
#   nothing is indistinguishable from a clean scan. STATE.md 01-02 records a
#   grep-based gate in this repo that passed and was then proven vacuous by
#   mutation testing. That is why the control exists, and why this script is
#   itself mutation-tested rather than trusted.
#
# Usage: bash scripts/verify-testapi-seam.sh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# Spelled out in full rather than composed, so these paths stay greppable.
RUNNER_FILE="packages/vitest/src/Runner.ts"
TESTAPI_FILE="packages/vitest/src/TestApi.ts"

# The specifiers neither target file may import, in any import form. This
# assignment is the ONLY place in this script where they are written; see the
# METHOD NOTE. Matched exactly, or as a submodule path.
FORBIDDEN_RE='(vitest|@effect/vitest)'

# A real import specifier: the quoted module string in a `from "..."`,
# `import "..."`, `import("...")` or `require("...")` position. Anything else —
# a doc comment, a string literal, an identifier — is not an import.
#
# The quote class includes a backtick, not only `"`/`'`: a dynamic `import()`
# accepts any expression, including a plain template literal with no
# interpolation, which is valid TypeScript and would otherwise silently bypass
# this scan. The analog script `scripts/verify-no-runner-dep.sh` records that
# it verified this by reproduction — the double/single-quote-only class matched
# zero times against exactly that line.
IMPORT_RE="(^|[^A-Za-z0-9_\$])(from|import|require)[[:space:]]*\(?[[:space:]]*[\"'\`]${FORBIDDEN_RE}(/[^\"'\`]*)?[\"'\`]"

# The positive CONTROL's specifier: a type-only import that is really present
# in BOTH target files (`Runner.ts` and `TestApi.ts` each import it for the
# scope parameter of the effect they hand across the seam).
CONTROL_RE="(^|[^A-Za-z0-9_\$])(from|import|require)[[:space:]]*\(?[[:space:]]*[\"'\`]effect/Scope[\"'\`]"

# A comment line, once `grep -n ''` has prefixed it with `NN:`. Leading
# whitespace, then a double slash, a bare asterisk, or a slash-star.
COMMENT_RE='^[0-9]+:[[:space:]]*(//|\*|/\*)'

fail() {
  echo ""
  echo "✗ TestApi/Runner framework-independence seam: NOT ENFORCED"
  echo ""
  echo "  $1"
  echo ""
  exit 1
}

# Preconditions, so a deleted, moved or renamed target never reads as a pass.
[[ -f "$RUNNER_FILE" ]] || fail "missing file $RUNNER_FILE — a target this gate scans is absent, so the scan would be vacuous and nothing was verified. Did the file move or get renamed?"
[[ -f "$TESTAPI_FILE" ]] || fail "missing file $TESTAPI_FILE — a target this gate scans is absent, so the scan would be vacuous and nothing was verified. Did the file move or get renamed?"

# Prefix every line with its number, drop comment lines, then match. The
# filtering happens BEFORE any count, so a doc comment that merely NAMES a
# framework cannot register as a hit.
scan() {
  local file="$1" pattern="$2"
  grep -n '' "$file" | grep -vE "$COMMENT_RE" | grep -E "$pattern" || true
}

# ---------------------------------------------------------------------------
# Assertion 1: positive CONTROL. Each target file must import `effect/Scope`
# at least once. Proves the scan mechanism reaches real import lines in EACH
# file before assertions 2 and 3 are asked to trust its silence. If a tree
# moved, a file was emptied, or the comment filter became over-broad, this
# trips first.
# ---------------------------------------------------------------------------
for file in "$RUNNER_FILE" "$TESTAPI_FILE"; do
  if [[ -z "$(scan "$file" "$CONTROL_RE")" ]]; then
    fail "positive control found ZERO imports of \"effect/Scope\" in $file — the scan is not reaching real import lines in that file, so its silence proves nothing. Check whether the file moved, whether its imports changed, or whether the comment filter is over-broad."
  fi
done
echo "✓ positive control: both $RUNNER_FILE and $TESTAPI_FILE import \"effect/Scope\" — the scan reaches real imports in each"

# ---------------------------------------------------------------------------
# Assertion 2: THE GATE, emission-module side. `Runner.ts` computes plain,
# library-owned option data and hands it to the injected seam; it must not be
# able to name a framework at all, not even in a type position.
# ---------------------------------------------------------------------------
RUNNER_HITS="$(scan "$RUNNER_FILE" "$IMPORT_RE")"
if [[ -n "$RUNNER_HITS" ]]; then
  echo ""
  echo "  forbidden import specifiers found:"
  while IFS= read -r hit; do
    [[ -n "$hit" ]] || continue
    echo "    $RUNNER_FILE:$hit"
  done <<<"$RUNNER_HITS"
  fail "$RUNNER_FILE imports a test framework (listed above). The emission walk must compute library-owned plain data only — see its own note (a). An \`import type\` counts: it puts a framework back into this module's type graph, which is exactly what the seam exists to prevent."
fi
echo "✓ $RUNNER_FILE imports no test framework, in any import form"

# ---------------------------------------------------------------------------
# Assertion 3: THE GATE, seam side. `TestApi.ts` declares the library's OWN
# option shape. Modelling a framework's options is not a licence to import its
# types — doing so is the failure mode 09-RESEARCH.md Finding 16 predicted for
# this phase specifically.
# ---------------------------------------------------------------------------
TESTAPI_HITS="$(scan "$TESTAPI_FILE" "$IMPORT_RE")"
if [[ -n "$TESTAPI_HITS" ]]; then
  echo ""
  echo "  forbidden import specifiers found:"
  while IFS= read -r hit; do
    [[ -n "$hit" ]] || continue
    echo "    $TESTAPI_FILE:$hit"
  done <<<"$TESTAPI_HITS"
  fail "$TESTAPI_FILE imports a test framework (listed above). This module declares the library's own option shape precisely so that no such import is needed — see its note (a). The composition root is the only module permitted to name a framework."
fi
echo "✓ $TESTAPI_FILE imports no test framework, in any import form"

echo ""
echo "TestApi/Runner framework-independence seam: ENFORCED"

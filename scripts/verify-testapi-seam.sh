#!/usr/bin/env bash
#
# Asserts that `Runner.ts` and `TestApi.ts` cannot reach a test framework — not by
# value import, `import type`, or dynamic `import()` — so the injected TestApi seam
# stays real; only `VitestTestApi.ts` and `describeFeature.ts` may name one.
# `pnpm test` cannot catch it: a type-only import type-checks, lints and passes.
# Comment lines are stripped before counting, and the forbidden specifiers are
# spelled in exactly ONE place (FORBIDDEN_RE) so prose cannot trip the gate.
# Positive control: both files import "effect/Scope", proving the scan reads them.
#
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
# ---------------------------------------------------------------------------
for file in "$RUNNER_FILE" "$TESTAPI_FILE"; do
  if [[ -z "$(scan "$file" "$CONTROL_RE")" ]]; then
    fail "positive control found ZERO imports of \"effect/Scope\" in $file — the scan is not reaching real import lines in that file, so its silence proves nothing. Check whether the file moved, whether its imports changed, or whether the comment filter is over-broad."
  fi
done
echo "✓ positive control: both $RUNNER_FILE and $TESTAPI_FILE import \"effect/Scope\" — the scan reaches real imports in each"

# ---------------------------------------------------------------------------
# Assertion 2: THE GATE, emission-module side. `Runner.ts` computes plain,
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

#!/usr/bin/env bash
#
# Asserts the TypeScript escape-hatch type appears nowhere in the acceptance suite —
# step bodies, World types, Layers, `.feature` text: INV-EC-003's boundary condition,
# enforced rather than stated. `pnpm build` and `pnpm typecheck:test` cannot catch it,
# because one occurrence is assignable to everything and the failure mode is the
# ABSENCE of a diagnostic. Controls: a minimum population of step modules, and the
# regex proven against a source file that legitimately carries the token.
#
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# Spelled out in full rather than composed, so these paths stay greppable.
ACCEPTANCE_DIR="packages/vitest/test/acceptance"

CONTROL_FILE="packages/vitest/src/Dsl.ts"

# The minimum number of acceptance step modules. Kept in step with
# scripts/verify-acceptance-ref-state.sh's constant of the same name and for the
MIN_STEP_MODULES=5

TOKEN='any'
TOKEN_RE="(^|[^A-Za-z0-9_\$])${TOKEN}([^A-Za-z0-9_\$]|\$)"

TS_COMMENT_RE='^[0-9]+:[[:space:]]*(//|\*|/\*)'
FEATURE_COMMENT_RE='^[0-9]+:[[:space:]]*#'

fail() {
  {
    echo ""
    echo "✗ acceptance suite free of the escape-hatch type: NOT ENFORCED"
    echo ""
    echo "  $1"
    echo ""
  } >&2
  exit 1
}

# Precondition, so a deleted or moved target never reads as a pass.
[[ -d "$ACCEPTANCE_DIR" ]] || fail "missing directory $ACCEPTANCE_DIR — the tree this gate scans is absent, so nothing was verified. If the acceptance suite moved, update ACCEPTANCE_DIR in this script."
[[ -f "$CONTROL_FILE" ]] || fail "missing file $CONTROL_FILE — the regex control's target is absent, so assertion 2 cannot run. Pick another file containing a real occurrence and name it here."

STEP_MODULES="$(find "$ACCEPTANCE_DIR" -type f -name '*.steps.test.ts' | sort)"
SCANNED_FILES="$(find "$ACCEPTANCE_DIR" -type f \( -name '*.ts' -o -name '*.feature' \) | sort)"

scan() {
  local file="$1" pattern="$2" comment
  case "$file" in
    *.feature) comment="$FEATURE_COMMENT_RE" ;;
    *) comment="$TS_COMMENT_RE" ;;
  esac
  grep -n '' "$file" | grep -vE "$comment" | grep -E "$pattern" || true
}

# ---------------------------------------------------------------------------
# Assertion 1: positive control on POPULATION. Without it, a renamed, moved or
# ---------------------------------------------------------------------------
MODULE_COUNT=0
if [[ -n "$STEP_MODULES" ]]; then
  MODULE_COUNT="$(printf '%s\n' "$STEP_MODULES" | wc -l | tr -d '[:space:]')"
fi

if [[ "$MODULE_COUNT" -lt "$MIN_STEP_MODULES" ]]; then
  fail "population control found $MODULE_COUNT file(s) matching *.steps.test.ts under $ACCEPTANCE_DIR, expected at least $MIN_STEP_MODULES. The directory was probably renamed or moved, or a pair's suffix is wrong. Assertion 3 would otherwise have passed by scanning nothing."
fi
echo "✓ population control: $MODULE_COUNT acceptance step module(s) under $ACCEPTANCE_DIR (minimum $MIN_STEP_MODULES)"

# ---------------------------------------------------------------------------
# Assertion 2: positive control on the REGEX. The same standalone-token pattern
# ---------------------------------------------------------------------------
CONTROL_HITS="$(scan "$CONTROL_FILE" "$TOKEN_RE" | wc -l | tr -d '[:space:]')"

if [[ "$CONTROL_HITS" -eq 0 ]]; then
  fail "regex control found ZERO occurrences in $CONTROL_FILE — the pattern has stopped matching, or that file's one documented occurrence was removed. Either way the silence of assertion 3 proves nothing. Fix TOKEN_RE, or point CONTROL_FILE at another source file that genuinely contains one."
fi
echo "✓ regex control: $CONTROL_HITS occurrence(s) found in $CONTROL_FILE — the scan reaches real occurrences"

# ---------------------------------------------------------------------------
# Assertion 3: THE GATE. Zero standalone occurrences across EVERY TypeScript
# ---------------------------------------------------------------------------
VIOLATIONS=""
while IFS= read -r file; do
  [[ -n "$file" ]] || continue
  hits="$(scan "$file" "$TOKEN_RE")"
  if [[ -n "$hits" ]]; then
    while IFS= read -r hit; do
      [[ -n "$hit" ]] || continue
      VIOLATIONS+="    $file:$hit"$'\n'
    done <<<"$hits"
  fi
done <<<"$SCANNED_FILES"

if [[ -n "$VIOLATIONS" ]]; then
  echo ""
  echo "  forbidden occurrences found:" >&2
  printf '%s' "$VIOLATIONS" >&2
  fail "the escape-hatch type occurs in the acceptance suite (listed above). It is assignable to everything, so one occurrence in a step body makes that body compile against every ambient Layer and disables INV-EC-003 for it — inside the suite whose whole job is to prove INV-EC-003. Never introduce one to make something compile: annotate the real type, or fix the Layer. See spec/invariants.md INV-EC-003, D-04b, and the 'Zero' section of $ACCEPTANCE_DIR/README.md. If the hit is in a .feature file or a string literal, reword it — this gate counts a standalone token wherever it appears in that directory, and the README says so."
fi
SCANNED_COUNT="$(printf '%s\n' "$SCANNED_FILES" | wc -l | tr -d '[:space:]')"
echo "✓ no .ts module or .feature file under $ACCEPTANCE_DIR contains the escape-hatch type as a standalone token ($SCANNED_COUNT file(s) scanned)"

echo ""
echo "acceptance suite free of the escape-hatch type: ENFORCED"

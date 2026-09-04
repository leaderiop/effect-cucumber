#!/usr/bin/env bash
#
# Asserts that no acceptance step module mutates a value in place or closes over a
# mutable binding — INV-EC-006 / ADR-EC-009: cross-step Scenario data survives only
# through a Layer-provided Ref. `pnpm test` cannot catch it: a Scenario threading a
# value through a closure PASSES on a clean run and leaks only across retries and
# `-t`-narrowed selections. Positive control: the scan is proven against a fixture
# that does mutate.
#
# Scans every .ts file in the acceptance directory EXCEPT the two named in
# EXCLUDED_FILES below — see ADR-EC-043. Both are already classified "Not a pair"
# in spec/traceability.md's §4 Test file map: they drive Runner.ts's internals
# (loadFeature/collectFeature/emitFeature) directly to test the FRAMEWORK's own
# registration/emission plumbing, not real Gherkin step bodies, so INV-EC-006 —
# which is about a value one STEP hands a later STEP in the same Scenario — does
# not describe what they do. A genuine step-definition module that doesn't carry
# the .steps.test.ts suffix (e.g. step-modules.module.ts, a defineSteps-based
# shared module) stays fully in scope; this is a named exclude list, not a
# narrowed *.steps.test.ts allowlist, specifically so it can't silently drop that
# kind of file from coverage too.
#
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# Spelled out in full rather than composed, so these paths stay greppable.
ACCEPTANCE_DIR="packages/vitest/test/acceptance"

CONTROL_FILE="packages/vitest/src/Runner.ts"

MIN_STEP_MODULES=5

# Framework-level meta-tests, not step modules — see the header comment above and
# ADR-EC-043. Named explicitly (not matched by a glob) so a rename or a new
# meta-test file can't silently widen or narrow this list; each is checked to
# exist below, so a rename makes this gate fail loudly rather than quietly
# start scanning (or quietly stop excluding) the wrong thing.
EXCLUDED_FILES=(
  "$ACCEPTANCE_DIR/pitfalls-checklist.test.ts"
  "$ACCEPTANCE_DIR/negative-requirements.test.ts"
)

DECLARATION_RE='(^|[^A-Za-z0-9_$])(let|var)[[:space:]]+([A-Za-z_$]|\{|\[)'

MUTATOR_RE='\.(push|pop|shift|unshift|splice|sort|reverse|fill)\('

# A comment line, once `grep -n ''` has prefixed it with `NN:`. Leading
# whitespace, then a double slash, a bare asterisk, or a slash-star.
COMMENT_RE='^[0-9]+:[[:space:]]*(//|\*|/\*)'

ALLOW_MARKER_RE='//[[:space:]]*GATE-ALLOW-MUTATION:[[:space:]]*[^[:space:]]'

ALLOWED_MUTATIONS=0

fail() {
  {
    echo ""
    echo "✗ acceptance suite cross-step state via Ref only: NOT ENFORCED"
    echo ""
    echo "  $1"
    echo ""
  } >&2
  exit 1
}

# Precondition, so a deleted or moved target never reads as a pass.
[[ -d "$ACCEPTANCE_DIR" ]] || fail "missing directory $ACCEPTANCE_DIR — the tree this gate scans is absent, so nothing was verified. If the acceptance suite moved, update ACCEPTANCE_DIR in this script."
[[ -f "$CONTROL_FILE" ]] || fail "missing file $CONTROL_FILE — the regex control's target is absent, so assertion 2 cannot run. Pick another file containing a real mutable binding and name it here."
for excluded in "${EXCLUDED_FILES[@]}"; do
  [[ -f "$excluded" ]] || fail "missing file $excluded — EXCLUDED_FILES names a file that no longer exists. If it was renamed, update EXCLUDED_FILES to match; if it was deleted, remove it from the list."
done

STEP_MODULES="$(find "$ACCEPTANCE_DIR" -type f -name '*.steps.test.ts' | sort)"
SCANNED_TS="$(find "$ACCEPTANCE_DIR" -type f -name '*.ts' | sort)"
for excluded in "${EXCLUDED_FILES[@]}"; do
  SCANNED_TS="$(printf '%s\n' "$SCANNED_TS" | grep -vFx "$excluded" || true)"
done

# Prefix every line with its number, drop comment lines, then match. The
# filtering happens BEFORE any count, so a doc comment that merely NAMES the
# forbidden keyword cannot register as a hit.
scan() {
  local file="$1" pattern="$2"
  grep -n '' "$file" | grep -vE "$COMMENT_RE" | grep -E "$pattern" || true
}

# ---------------------------------------------------------------------------
# Assertion 1: positive control on POPULATION. The acceptance directory must
# ---------------------------------------------------------------------------
MODULE_COUNT=0
if [[ -n "$STEP_MODULES" ]]; then
  MODULE_COUNT="$(printf '%s\n' "$STEP_MODULES" | wc -l | tr -d '[:space:]')"
fi

if [[ "$MODULE_COUNT" -lt "$MIN_STEP_MODULES" ]]; then
  fail "population control found $MODULE_COUNT file(s) matching *.steps.test.ts under $ACCEPTANCE_DIR, expected at least $MIN_STEP_MODULES. The directory was probably renamed or moved, or a pair's suffix is wrong (a *.steps.ts is collected by nothing — see that directory's README). Assertions 3 and 4 would otherwise have passed by scanning nothing."
fi
echo "✓ population control: $MODULE_COUNT acceptance step module(s) under $ACCEPTANCE_DIR (minimum $MIN_STEP_MODULES)"

# ---------------------------------------------------------------------------
# Assertion 2: positive control on the REGEX. The same declaration-matching
# ---------------------------------------------------------------------------
CONTROL_HITS="$(scan "$CONTROL_FILE" "$DECLARATION_RE" | wc -l | tr -d '[:space:]')"

if [[ "$CONTROL_HITS" -eq 0 ]]; then
  fail "regex control found ZERO mutable-binding declarations in $CONTROL_FILE — the pattern has stopped matching real declarations, or that file was cleaned up. Either way the silence of assertion 3 proves nothing. Fix DECLARATION_RE, or point CONTROL_FILE at another source file that genuinely declares one."
fi
echo "✓ regex control: $CONTROL_HITS mutable-binding declaration(s) found in $CONTROL_FILE — the scan reaches real declarations"

# ---------------------------------------------------------------------------
# Assertion 3: THE GATE. No TypeScript module in the acceptance directory may
# ---------------------------------------------------------------------------
VIOLATIONS=""
while IFS= read -r file; do
  [[ -n "$file" ]] || continue
  hits="$(scan "$file" "$DECLARATION_RE")"
  if [[ -n "$hits" ]]; then
    while IFS= read -r hit; do
      [[ -n "$hit" ]] || continue
      VIOLATIONS+="    $file:$hit"$'\n'
    done <<<"$hits"
  fi
done <<<"$SCANNED_TS"

if [[ -n "$VIOLATIONS" ]]; then
  echo ""
  echo "  mutable binding declarations found:" >&2
  printf '%s' "$VIOLATIONS" >&2
  fail "a TypeScript module under $ACCEPTANCE_DIR declares a mutable binding (listed above). Cross-step Scenario state must live in a Ref obtained from a Layer-provided service, never in a closure variable — INV-EC-006, ADR-EC-009, and the 'Every cross-step value lives in a Ref obtained from a Layer-provided service' section of $ACCEPTANCE_DIR/README.md. A closure variable passes on a clean run and leaks across retries, re-runs and -t-narrowed selections."
fi
SCANNED_TS_COUNT="$(printf '%s\n' "$SCANNED_TS" | wc -l | tr -d '[:space:]')"
echo "✓ no .ts module under $ACCEPTANCE_DIR declares a mutable binding ($SCANNED_TS_COUNT file(s) scanned)"

MUTATORS=""
ALLOWED=""
ALLOWED_COUNT=0
while IFS= read -r file; do
  [[ -n "$file" ]] || continue
  hits="$(scan "$file" "$MUTATOR_RE")"
  if [[ -n "$hits" ]]; then
    while IFS= read -r hit; do
      [[ -n "$hit" ]] || continue
      # The carve-out, applied per LINE. A hit carrying the marker plus a reason
      # is recorded as allowed and printed below; everything else is a violation.
      if printf '%s' "$hit" | grep -qE "$ALLOW_MARKER_RE"; then
        ALLOWED+="    $file:$hit"$'\n'
        ALLOWED_COUNT=$((ALLOWED_COUNT + 1))
      else
        MUTATORS+="    $file:$hit"$'\n'
      fi
    done <<<"$hits"
  fi
done <<<"$SCANNED_TS"

if [[ -n "$MUTATORS" ]]; then
  echo ""
  echo "  in-place mutator calls found:" >&2
  printf '%s' "$MUTATORS" >&2
 fail "a TypeScript module under $ACCEPTANCE_DIR mutates a value in place (listed above). a module-scope array, object or counter a step writes to satisfies the letter of the no-let rule while defeating INV-EC-006's intent, and unlike a Ref it cannot observe per-Scenario Layer freshness — one array is one array however many times the Layer was built. Build a new value with spread and put it in a Ref instead. If the value is genuinely FUNCTION-LOCAL — created fresh inside a factory and never shared across steps — mark that one line \`// GATE-ALLOW-MUTATION: <reason>\` and raise ALLOWED_MUTATIONS in this script in the same commit."
fi

if [[ "$ALLOWED_COUNT" -ne "$ALLOWED_MUTATIONS" ]]; then
  if [[ -n "$ALLOWED" ]]; then
    echo ""
    echo "  carve-outs found:"
    printf '%s' "$ALLOWED" >&2
  fi
  fail "found $ALLOWED_COUNT GATE-ALLOW-MUTATION carve-out(s), expected exactly $ALLOWED_MUTATIONS. A marker was added or removed without ALLOWED_MUTATIONS following it in the same commit. If the change is intended, edit that constant; do not widen the marker to cover more lines."
fi

if [[ -n "$ALLOWED" ]]; then
  echo ""
  echo "  $ALLOWED_COUNT documented carve-out(s), printed so none of them is silent:"
  printf '%s' "$ALLOWED"
  echo ""
fi
echo "✓ no .ts module under $ACCEPTANCE_DIR mutates a value in place, outside $ALLOWED_MUTATIONS documented carve-out(s)"

echo ""
echo "acceptance suite cross-step state via Ref only: ENFORCED"

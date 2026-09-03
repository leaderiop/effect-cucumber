#!/usr/bin/env bash
#
# LINT-01 — a COPYABLE template, not a gate this repository runs on itself. This is a generalized
# copy of scripts/verify-acceptance-ref-state.sh (which enforces INV-EC-006 over THIS repository's
# own acceptance suite — read it first if you have not) with the two repo-specific pieces the
# roadmap identified turned into arguments instead of constants: the directory/file-name pattern
# selecting your own step modules, and the number of GATE-ALLOW-MUTATION carve-outs your tree
# currently has. Everything else — the two regexes, the comment-stripping, the carve-out marker
# protocol — is directory-agnostic and travels verbatim (spec/roadmap.md § LINT-01).
#
# Copy this file into YOUR repository (e.g. scripts/verify-ref-state.sh) and wire it into YOUR CI;
# nothing in @effect-cucumber/vitest runs it against your tree automatically. See
# packages/vitest/README.md's "Recommended lint and compiler configuration" section for the
# rationale (INV-EC-006: cross-step Scenario data must survive only through a Ref obtained from a
# Layer-provided service, never a closure variable — a rule `pnpm test` cannot catch, because a
# Scenario threading a value through a closure passes on a clean run and leaks only across retries
# and a narrowed `-t` selection).
#
# One improvement over the original beyond parameterization: the original's "regex control" (the
# positive control proving DECLARATION_RE still matches a real declaration) points at a specific
# file in THIS repository (packages/vitest/src/Runner.ts) — a path that means nothing in yours.
# This copy generates a synthetic one-line fixture on the fly instead, so the whole script needs
# nothing about your repository's internal module layout to run.
#
# Usage (positional args win; an omitted one falls back to its env var; MIN_FILES defaults to 1):
#   verify-consumer-ref-state.sh <step-modules-dir> <name-pattern> <allowed-mutations> [min-files]
#   STEP_MODULES_DIR=... NAME_PATTERN=... ALLOWED_MUTATIONS=... MIN_FILES=... verify-consumer-ref-state.sh
#
# Example — a consumer whose step modules live under features/ as *.steps.test.ts, with zero
# carve-outs yet:
#   scripts/verify-ref-state.sh features '*.steps.test.ts' 0
#
set -euo pipefail

STEP_MODULES_DIR="${1:-${STEP_MODULES_DIR:-}}"
NAME_PATTERN="${2:-${NAME_PATTERN:-}}"
ALLOWED_MUTATIONS="${3:-${ALLOWED_MUTATIONS:-}}"
MIN_FILES="${4:-${MIN_FILES:-1}}"

DECLARATION_RE='(^|[^A-Za-z0-9_$])(let|var)[[:space:]]+([A-Za-z_$]|\{|\[)'

MUTATOR_RE='\.(push|pop|shift|unshift|splice|sort|reverse|fill)\('

# A comment line, once `grep -n ''` has prefixed it with `NN:`. Leading
# whitespace, then a double slash, a bare asterisk, or a slash-star.
COMMENT_RE='^[0-9]+:[[:space:]]*(//|\*|/\*)'

ALLOW_MARKER_RE='//[[:space:]]*GATE-ALLOW-MUTATION:[[:space:]]*[^[:space:]]'

fail() {
  {
    echo ""
    echo "✗ consumer cross-step state via Ref only: NOT ENFORCED"
    echo ""
    echo "  $1"
    echo ""
  } >&2
  exit 1
}

usage() {
  fail "usage: verify-consumer-ref-state.sh <step-modules-dir> <name-pattern> <allowed-mutations> [min-files] (or set STEP_MODULES_DIR / NAME_PATTERN / ALLOWED_MUTATIONS / MIN_FILES). $1"
}

[[ -n "$STEP_MODULES_DIR" ]] || usage "missing step-modules-dir — the directory this script scans, e.g. 'features' or 'test/acceptance'."
[[ -n "$NAME_PATTERN" ]] || usage "missing name-pattern — the filename glob identifying a step module, e.g. '*.steps.test.ts'."
[[ -n "$ALLOWED_MUTATIONS" ]] || usage "missing allowed-mutations — how many GATE-ALLOW-MUTATION carve-outs your tree currently has (0 if none)."
[[ "$ALLOWED_MUTATIONS" =~ ^[0-9]+$ ]] || usage "allowed-mutations must be a non-negative integer, got '$ALLOWED_MUTATIONS'."
[[ "$MIN_FILES" =~ ^[0-9]+$ ]] || usage "min-files must be a non-negative integer, got '$MIN_FILES'."

[[ -d "$STEP_MODULES_DIR" ]] || fail "missing directory $STEP_MODULES_DIR — the tree this gate scans is absent, so nothing was verified. Pass the directory your own step modules live under."

# Prefix every line with its number, drop comment lines, then match. The
# filtering happens BEFORE any count, so a doc comment that merely NAMES the
# forbidden keyword cannot register as a hit.
scan() {
  local file="$1" pattern="$2"
  grep -n '' "$file" | grep -vE "$COMMENT_RE" | grep -E "$pattern" || true
}

STEP_MODULES="$(find "$STEP_MODULES_DIR" -type f -name "$NAME_PATTERN" | sort)"
SCANNED_TS="$(find "$STEP_MODULES_DIR" -type f -name '*.ts' | sort)"

# ---------------------------------------------------------------------------
# Assertion 1: positive control on POPULATION. The step-modules pattern must
# actually find something, or assertions 3 and 4 below would pass by scanning
# nothing.
# ---------------------------------------------------------------------------
MODULE_COUNT=0
if [[ -n "$STEP_MODULES" ]]; then
  MODULE_COUNT="$(printf '%s\n' "$STEP_MODULES" | wc -l | tr -d '[:space:]')"
fi

if [[ "$MODULE_COUNT" -lt "$MIN_FILES" ]]; then
  fail "population control found $MODULE_COUNT file(s) matching '$NAME_PATTERN' under $STEP_MODULES_DIR, expected at least $MIN_FILES. Check the directory and pattern arguments — a typo here means assertions 3 and 4 would otherwise have passed by scanning nothing."
fi
echo "✓ population control: $MODULE_COUNT step module(s) matching '$NAME_PATTERN' under $STEP_MODULES_DIR (minimum $MIN_FILES)"

# ---------------------------------------------------------------------------
# Assertion 2: positive control on the REGEX. A synthetic one-line fixture,
# generated here rather than pointed at a real file, so this script needs
# nothing about your repository's own module layout to prove DECLARATION_RE
# still matches a genuine mutable-binding declaration.
# ---------------------------------------------------------------------------
CONTROL_TMP="$(mktemp)"
trap 'rm -f "$CONTROL_TMP"' EXIT
cat >"$CONTROL_TMP" <<'SYNTHETIC_FIXTURE'
// Synthetic positive control generated by verify-consumer-ref-state.sh.
let syntheticMutableBinding = 0
SYNTHETIC_FIXTURE

CONTROL_HITS="$(scan "$CONTROL_TMP" "$DECLARATION_RE" | wc -l | tr -d '[:space:]')"

if [[ "$CONTROL_HITS" -eq 0 ]]; then
  fail "regex control found ZERO mutable-binding declarations in a synthetic fixture this script generated itself ('let syntheticMutableBinding = 0') — DECLARATION_RE has stopped matching even a textbook declaration, so the silence of assertion 3 below would prove nothing. This is a bug in this script, not in your source; fix DECLARATION_RE before trusting the rest of this run."
fi
echo "✓ regex control: $CONTROL_HITS mutable-binding declaration(s) found in a synthetic fixture — the scan reaches real declarations"

# ---------------------------------------------------------------------------
# Assertion 3: THE GATE. No TypeScript module under STEP_MODULES_DIR may
# declare a `let` or `var` at any scope.
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
  fail "a TypeScript module under $STEP_MODULES_DIR declares a mutable binding (listed above). Cross-step Scenario state must live in a Ref obtained from a Layer-provided service, never in a closure variable. A closure variable passes on a clean run and leaks across retries, re-runs and narrowed selections."
fi
SCANNED_TS_COUNT="$(printf '%s\n' "$SCANNED_TS" | wc -l | tr -d '[:space:]')"
echo "✓ no .ts module under $STEP_MODULES_DIR declares a mutable binding ($SCANNED_TS_COUNT file(s) scanned)"

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
  fail "a TypeScript module under $STEP_MODULES_DIR mutates a value in place (listed above). A module-scope array, object or counter a step writes to satisfies the letter of the no-let rule while defeating its intent, and unlike a Ref it cannot observe per-Scenario Layer freshness — one array is one array however many times the Layer was built. Build a new value with spread and put it in a Ref instead. If the value is genuinely FUNCTION-LOCAL — created fresh inside a factory and never shared across steps — mark that one line \`// GATE-ALLOW-MUTATION: <reason>\` and raise the allowed-mutations argument in the same commit."
fi

if [[ "$ALLOWED_COUNT" -ne "$ALLOWED_MUTATIONS" ]]; then
  if [[ -n "$ALLOWED" ]]; then
    echo ""
    echo "  carve-outs found:"
    printf '%s' "$ALLOWED" >&2
  fi
  fail "found $ALLOWED_COUNT GATE-ALLOW-MUTATION carve-out(s), expected exactly $ALLOWED_MUTATIONS. A marker was added or removed without updating the allowed-mutations argument in the same commit. If the change is intended, update that argument; do not widen the marker to cover more lines."
fi

if [[ -n "$ALLOWED" ]]; then
  echo ""
  echo "  $ALLOWED_COUNT documented carve-out(s), printed so none of them is silent:"
  printf '%s' "$ALLOWED"
  echo ""
fi
echo "✓ no .ts module under $STEP_MODULES_DIR mutates a value in place, outside $ALLOWED_MUTATIONS documented carve-out(s)"

echo ""
echo "consumer cross-step state via Ref only: ENFORCED"

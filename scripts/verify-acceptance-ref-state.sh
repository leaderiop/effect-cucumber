#!/usr/bin/env bash
#
# Asserts that NO acceptance step module declares a mutable binding a step could
# close over — INV-EC-006 and ADR-EC-009's "cross-step Scenario data survives
# only via a Layer-provided Ref", and roadmap Phase 11 Success Criterion 2.
#
# This is INV-EC-006's FIRST automated enforcement anywhere in the repository.
# Before it, `spec/traceability.md` §2's row for that invariant read
# "Convention (ADR-EC-009) — no automated enforcement yet" in its Enforced by
# column and "None yet — candidate lint rule" in its Test column, and it was the
# only invariant of the six in that state.
#
# METHOD NOTE (do not weaken this):
#   `pnpm test` exiting 0 does NOT prove this, and neither does `pnpm lint`,
#   `pnpm build` or `pnpm typecheck:test`. A Scenario whose steps close over a
#   mutable binding PASSES today: one Scenario is one Effect, its steps run in
#   order, and a closure variable threads a value between them perfectly well on
#   a clean single run. What it cannot survive is a re-run, a retry, or a
#   `-t`-narrowed selection, because the binding is per MODULE and the Scenario
#   is not. Observation therefore cannot distinguish "has no mutable cross-step
#   state" from "has it and did not trip on it today". Only a structural scan
#   can, and that is what this script is.
#
#   MEASURED, not argued — mutation A, recorded in full in
#   packages/vitest/test/acceptance/hooks.steps.test.ts's module doc comment. One
#   mutable binding added at an acceptance step module's own module scope, then
#   FIVE commands run against that state:
#
#     pnpm verify:acceptance-ref-state   RED   hooks.steps.test.ts:183
#     pnpm test                          GREEN 37 files, 796 passed, 4 skipped
#     pnpm lint                          GREEN oxlint + dprint check, exit 0
#     pnpm build                         GREEN tsc -b, exit 0
#     pnpm typecheck:test                GREEN both projects, exit 0
#
#   The four green lines are the reason this script exists, and they are the
#   part of the record that is easiest to leave out. `pnpm lint` in particular:
#   oxlint has no rule enabled here that objects to a module-scope `let`, so the
#   linter is not a substitute for this gate and must not be treated as one.
#
#   Comment lines are stripped before any occurrence is counted, and the reason
#   is not cosmetic: every acceptance step module explains this rule in its own
#   doc comment, and this directory's README states it twice. Counting raw text
#   would make the gate self-invalidating — documenting the rule would violate
#   it. That is STATE.md's 03-04 lesson, hit again in 10-01 and 10-02.
#
#   Assertion 1 is a positive control on POPULATION and assertion 2 is a
#   positive control on the REGEX. Neither is optional and neither substitutes
#   for the other. Without assertion 1, a renamed or moved acceptance directory
#   makes assertion 3 pass by scanning nothing; without assertion 2, a regex
#   that has stopped matching anything at all makes assertion 3 pass while
#   scanning everything. STATE.md's 01-02 entry records a grep-based gate in
#   this repo that passed and was then proven vacuous by mutation testing, and
#   mutations B and C below re-prove both halves for this one.
#
#   WHAT THIS GATE DOES NOT CATCH, stated plainly rather than left to be
#   discovered. PROH-11-03 forbids a module-scope mutable ARRAY, OBJECT or
#   COUNTER that a step writes to — `const log = []` plus `log.push(...)`
#   satisfies the letter of the no-`let` rule while defeating its entire intent,
#   and a declaration-shaped regex cannot see it, because the declaration is a
#   `const`. Assertion 4 catches the common form of the write (an in-place array
#   mutator call) and nothing beyond it; the general case stays a review rule
#   stated in packages/vitest/test/acceptance/README.md. Do not read a green run
#   here as "no module-scope holder exists".
#
#   MUTATIONS PERFORMED AGAINST THIS SCRIPT (each run, then reverted):
#
#     B. ACCEPTANCE_DIR pointed away from the real directory. Measured TWICE,
#        because the two arms are caught by DIFFERENT things and only the second
#        one exercises the population control:
#
#        B1, pointed at `packages/vitest/test/acceptance-renamed`, which does
#            not exist -> the `[[ -d ... ]]` PRECONDITION failed, naming the
#            missing directory. Assertion 1 never ran.
#        B2, pointed at `packages/vitest/test/fixtures`, which DOES exist and
#            contains no `*.steps.test.ts` -> assertion 1 failed by name,
#            "population control found 0 file(s) ... expected at least 5".
#
#        B2 is the arm that matters and B1 is why it had to be measured
#        separately: a moved directory trips the precondition, but a directory
#        that still exists while its contents are renamed, or whose pairs
#        acquired the wrong suffix, reaches assertion 3 with an EMPTY file list
#        and would pass vacuously without the population control. That is
#        ASSUMPTION-11-B in 11-01-PLAN.md, and B2 is its mitigation measured
#        rather than asserted.
#
#     C. DECLARATION_RE broken to a pattern that can never match
#        (`zzzz-never-matches-anything`). Measured in two states:
#
#        C1, with assertion 2 still in place -> the gate FAILED by name on the
#            regex control, "found ZERO mutable-binding declarations in
#            packages/vitest/src/Runner.ts".
#        C2, with assertion 2 DELETED and the regex still dead -> the gate
#            PASSED and printed its ENFORCED line, against a pattern incapable
#            of finding a violation.
#
#        C2 is what the control exists to prevent, and C1 is what it does
#        instead. DO NOT "simplify" assertion 2 away as redundant with assertion
#        1: assertion 1 printed its green line throughout BOTH arms, because
#        every file was exactly where it should be — it was the pattern that was
#        dead, and a population control cannot see that.
#
# Usage: bash scripts/verify-acceptance-ref-state.sh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# Spelled out in full rather than composed, so these paths stay greppable.
ACCEPTANCE_DIR="packages/vitest/test/acceptance"

# The regex control's file. Chosen because it holds a real, load-bearing mutable
# binding in production source — `Runner.ts`'s one-shot `started` cell and its
# two filtered/runnable Scenario counters — so the control is anchored to code
# that has a reason to exist rather than to a specimen someone might tidy away.
# If it ever stops matching, assertion 2 says so by name and this comment is
# where to pick a replacement.
CONTROL_FILE="packages/vitest/src/Runner.ts"

# The minimum number of acceptance step modules. Five as of plan 11-05:
# worked-example-01-apples, worked-example-02-accounts, worked-example-03-discounts,
# parsing-and-matching and hooks. Raise this when a pair is added; a pair being
# REMOVED should be a deliberate, visible edit here rather than a silent
# shrinking of what this gate covers.
MIN_STEP_MODULES=5

# A mutable binding DECLARATION: `let` or `var` followed by an identifier, with
# a non-identifier character (or start of line) in front so `outlet x` and
# `varsity` are not matched. `const` is deliberately absent — a `const` binding
# cannot be reassigned, and this gate is about the binding, not about what a
# value it points at might allow (see the METHOD NOTE's carve-out).
DECLARATION_RE='(^|[^A-Za-z0-9_$])(let|var)[[:space:]]+[A-Za-z_$]'

# The common form of writing to a module-scope holder: an in-place array
# mutator. Narrow on purpose — see the METHOD NOTE. Every acceptance step module
# builds new arrays with spread instead, so this matching zero times is the
# state being preserved rather than a coincidence.
MUTATOR_RE='\.(push|pop|shift|unshift|splice|sort|reverse|fill)\('

# A comment line, once `grep -n ''` has prefixed it with `NN:`. Leading
# whitespace, then a double slash, a bare asterisk, or a slash-star.
COMMENT_RE='^[0-9]+:[[:space:]]*(//|\*|/\*)'

fail() {
  echo ""
  echo "✗ acceptance suite cross-step state via Ref only: NOT ENFORCED"
  echo ""
  echo "  $1"
  echo ""
  exit 1
}

# Precondition, so a deleted or moved target never reads as a pass.
[[ -d "$ACCEPTANCE_DIR" ]] || fail "missing directory $ACCEPTANCE_DIR — the tree this gate scans is absent, so nothing was verified. If the acceptance suite moved, update ACCEPTANCE_DIR in this script."
[[ -f "$CONTROL_FILE" ]] || fail "missing file $CONTROL_FILE — the regex control's target is absent, so assertion 2 cannot run. Pick another file containing a real mutable binding and name it here."

STEP_MODULES="$(find "$ACCEPTANCE_DIR" -type f -name '*.steps.test.ts' | sort)"

# Prefix every line with its number, drop comment lines, then match. The
# filtering happens BEFORE any count, so a doc comment that merely NAMES the
# forbidden keyword cannot register as a hit.
scan() {
  local file="$1" pattern="$2"
  grep -n '' "$file" | grep -vE "$COMMENT_RE" | grep -E "$pattern" || true
}

# ---------------------------------------------------------------------------
# Assertion 1: positive control on POPULATION. The acceptance directory must
# hold at least MIN_STEP_MODULES files matching *.steps.test.ts. Without this,
# a renamed, moved or emptied directory makes assertions 3 and 4 pass by
# scanning nothing at all.
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
# pattern, run against a named file that really does contain a mutable binding.
# Proves the scan reaches real declaration lines before assertion 3 is asked to
# trust its silence. Mutation C measured what happens without this.
# ---------------------------------------------------------------------------
CONTROL_HITS="$(scan "$CONTROL_FILE" "$DECLARATION_RE" | wc -l | tr -d '[:space:]')"

if [[ "$CONTROL_HITS" -eq 0 ]]; then
  fail "regex control found ZERO mutable-binding declarations in $CONTROL_FILE — the pattern has stopped matching real declarations, or that file was cleaned up. Either way the silence of assertion 3 proves nothing. Fix DECLARATION_RE, or point CONTROL_FILE at another source file that genuinely declares one."
fi
echo "✓ regex control: $CONTROL_HITS mutable-binding declaration(s) found in $CONTROL_FILE — the scan reaches real declarations"

# ---------------------------------------------------------------------------
# Assertion 3: THE GATE. No acceptance step module may DECLARE a mutable
# binding, at any scope. Every value one step writes for a later step goes
# through a Ref on a Layer-provided service (INV-EC-006, ADR-EC-009).
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
done <<<"$STEP_MODULES"

if [[ -n "$VIOLATIONS" ]]; then
  echo ""
  echo "  mutable binding declarations found:"
  printf '%s' "$VIOLATIONS"
  fail "an acceptance step module declares a mutable binding (listed above). Cross-step Scenario state must live in a Ref obtained from a Layer-provided service, never in a closure variable — INV-EC-006, ADR-EC-009, and the 'Every cross-step value lives in a Ref obtained from a Layer-provided service' section of $ACCEPTANCE_DIR/README.md. A closure variable passes on a clean run and leaks across retries, re-runs and -t-narrowed selections."
fi
echo "✓ no acceptance step module declares a mutable binding"

# ---------------------------------------------------------------------------
# Assertion 4: the narrow half of PROH-11-03. An in-place array mutator call is
# how a module-scope `const` holder is written to in practice. This does NOT
# cover the general case — see the METHOD NOTE — and must not be described as
# if it did.
# ---------------------------------------------------------------------------
MUTATORS=""
while IFS= read -r file; do
  [[ -n "$file" ]] || continue
  hits="$(scan "$file" "$MUTATOR_RE")"
  if [[ -n "$hits" ]]; then
    while IFS= read -r hit; do
      [[ -n "$hit" ]] || continue
      MUTATORS+="    $file:$hit"$'\n'
    done <<<"$hits"
  fi
done <<<"$STEP_MODULES"

if [[ -n "$MUTATORS" ]]; then
  echo ""
  echo "  in-place mutator calls found:"
  printf '%s' "$MUTATORS"
  fail "an acceptance step module mutates a value in place (listed above). PROH-11-03: a module-scope array, object or counter a step writes to satisfies the letter of the no-let rule while defeating INV-EC-006's intent, and unlike a Ref it cannot observe per-Scenario Layer freshness — one array is one array however many times the Layer was built. Build a new value with spread and put it in a Ref instead."
fi
echo "✓ no acceptance step module mutates a value in place"

echo ""
echo "acceptance suite cross-step state via Ref only: ENFORCED"

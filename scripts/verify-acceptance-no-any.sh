#!/usr/bin/env bash
#
# Asserts that the TypeScript escape-hatch type appears nowhere in the
# acceptance suite — not in a step body, not in a World service type, not in an
# acceptance Layer, and not in a `.feature` file's Gherkin text. This is
# INV-EC-003's BOUNDARY CONDITION, D-04b, enforced rather than merely stated.
#
# `spec/invariants.md`'s INV-EC-003 says the guarantee holds for step bodies
# free of that type, and `scripts/verify-tsgo-gate.sh` enforces the invariant
# itself over the tsgo-gate fixtures. Nothing enforced the boundary condition
# over the ACCEPTANCE suite, which is the suite whose entire job is to prove
# INV-EC-003 by running it.
#
# METHOD NOTE (do not weaken this):
#   `pnpm build`, `pnpm typecheck:test` and `pnpm test` all exiting 0 do NOT
#   prove this. One occurrence of the escape-hatch type is assignable to
#   everything, so a step body carrying one compiles against EVERY ambient
#   Layer — including one that provides none of the services the body reaches
#   for. The compiler is silent by design, the suite is green, and INV-EC-003 is
#   erased for that step while the file still looks like evidence for it. There
#   is nothing to observe, because the whole failure mode is the absence of a
#   diagnostic. Only a structural scan can state it.
#
#   MEASURED, not argued — mutation D, recorded in full in
#   packages/vitest/test/acceptance/hooks.steps.test.ts's module doc comment. The
#   escape-hatch type substituted for `string` in one acceptance step body's
#   first parameter annotation, then five commands run against that state:
#
#     pnpm verify:acceptance-no-any      RED   hooks.steps.test.ts:242
#     pnpm build                         GREEN tsc -b, exit 0
#     pnpm typecheck:test                GREEN both projects, exit 0
#     pnpm test                          GREEN 37 files, 796 passed, 4 skipped
#     pnpm lint                          GREEN oxlint + dprint check, exit 0
#
#   `pnpm lint` staying green is worth its own sentence: no oxlint rule enabled
#   in this repository objects to the escape-hatch type, so the linter is not a
#   substitute for this gate and must not be treated as one.
#
#   Comment lines are stripped before any occurrence is counted, for the same
#   reason as in scripts/verify-acceptance-ref-state.sh and with more force
#   here: this rule cannot be explained without writing the token. Every
#   acceptance step module's doc comment and the directory's README both name it
#   repeatedly. Counting raw text would make the gate forbid its own
#   documentation — STATE.md's 03-04 lesson, hit again in 10-01 and 10-02.
#   Mutation E below is the standing measurement that comment stripping works.
#
#   The pattern is a STANDALONE TOKEN match, with non-identifier boundaries on
#   both sides. Without them, ordinary English words containing the same three
#   letters — "company", "many", "anywhere" — would each register as a hit in a
#   string literal or a step's Gherkin text, and the gate would be red for a
#   state that is correct.
#
#   `.feature` FILES ARE SCANNED DELIBERATELY, and this is not scope creep. A
#   step's Gherkin text becomes the step pattern a body is registered under, so
#   the same three letters standing alone in a Feature file are indistinguishable
#   to this gate from the type. That is a real constraint on how acceptance
#   Scenarios are worded, it is stated for authors in
#   packages/vitest/test/acceptance/README.md's "Zero" section, and it is the
#   same self-invalidation problem from the other direction: a criterion that
#   forbids a literal also forbids the prose that would explain it.
#
#   Assertion 1 is a positive control on POPULATION and assertion 2 a positive
#   control on the REGEX; the METHOD NOTE of scripts/verify-acceptance-ref-state.sh
#   has the argument for why neither substitutes for the other, and mutations B
#   and C there are the measurement. Both apply here unchanged.
#
#   MUTATIONS PERFORMED AGAINST THIS SCRIPT (each run, then reverted):
#
#     E. A comment line containing the forbidden token as PROSE added to an
#        acceptance step module (`// ... names the forbidden token, <token>, as
#        prose.`, immediately above the `describeFeature` call)
#        -> the gate STILL PASSED and printed its ENFORCED line. That is the
#           intended behaviour and the reason the comment filter runs before any
#           count. A gate that failed here would be one that forbids explaining
#           itself, which is the defect STATE.md 03-04 records this repository
#           shipping once already.
#
#     E2. The same thing done to a `.feature` file, in ONE run with two halves
#        that go opposite ways: a Gherkin `#` comment line naming the token as
#        prose, AND the token added to a Scenario TITLE on the very next line
#        -> the comment line was NOT reported and the Scenario title WAS,
#           `hooks.feature:9`. That single run states both halves at once — the
#           `#` arm (now FEATURE_COMMENT_RE) strips Gherkin comments, and the `.feature`
#           half of the scan is live rather than nominally present. E on its own
#           could not say the second thing: a scan that reached no `.feature`
#           file at all would also have stayed green.
#
#     E3. THE ONE THAT FOUND A HOLE, and the reason the comment pattern is now
#        chosen per language. A `*`-KEYWORD Gherkin step carrying the forbidden
#        token — `    * a step mentioning <token> thing` — added to
#        `hooks.feature` between two ordinary steps. `*` is a legal step keyword
#        anywhere `Given`/`When`/`Then` is; this is not an exotic form.
#
#        BEFORE, with one union `COMMENT_RE` carrying a `\*` alternative for
#              JSDoc: NO HIT. The gate printed its ENFORCED line against a live
#              violation, because the JSDoc alternative had stripped the STEP.
#        AFTER, with TS_COMMENT_RE and FEATURE_COMMENT_RE split: RED, naming
#              `hooks.feature:6`.
#
#        E and E2 were both re-measured against the split and are unchanged — a
#        `#` Gherkin comment naming the token is still not reported, and neither
#        is a TypeScript JSDoc continuation line naming it. The split removes the
#        hole without weakening either carve-out, which is the whole reason it is
#        a split rather than a deletion of the `\*` alternative.
#
# Usage: bash scripts/verify-acceptance-no-any.sh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# Spelled out in full rather than composed, so these paths stay greppable.
ACCEPTANCE_DIR="packages/vitest/test/acceptance"

# The regex control's file. `Dsl.ts` carries the repository's one deliberate,
# documented occurrence of the escape-hatch type in production source —
# `StepRegistrar`'s `Params extends ReadonlyArray<...>` constraint, which its own
# note (e) explains cannot be written any other way and which `HookRegistrar`
# directly beneath it points out it does NOT need. It is therefore the natural
# control: a standing occurrence with a reason to keep existing. If it ever
# moves, assertion 2 fails by name and this comment is where to pick a
# replacement.
CONTROL_FILE="packages/vitest/src/Dsl.ts"

# The minimum number of acceptance step modules. Kept in step with
# scripts/verify-acceptance-ref-state.sh's constant of the same name and for the
# same reason; five as of plan 11-05.
MIN_STEP_MODULES=5

# The forbidden token, matched STANDALONE: a non-identifier character (or start
# of line) before, a non-identifier character (or end of line) after. Held in
# its own constant so the pattern has exactly one definition, and so a reader
# looking for what this gate forbids finds it here rather than inside an
# assembled regex.
#
# This script is NOT among the files it scans, and that is deliberate rather
# than an oversight: the METHOD NOTE above cannot make its argument without
# using the word in ordinary English, and a gate that scanned itself would be
# the self-invalidation problem it exists to avoid.
TOKEN='any'
TOKEN_RE="(^|[^A-Za-z0-9_\$])${TOKEN}([^A-Za-z0-9_\$]|\$)"

# A comment line, once `grep -n ''` has prefixed it with `NN:`. TWO patterns,
# selected by the file's language, NEVER one union of both.
#
# THE UNION WAS A HOLE, AND IT WAS IN THE `*` ALTERNATIVE. A bare `*` opens a
# JSDoc continuation line in TypeScript, so the TS pattern needs it — but `*` is
# also a LEGAL GHERKIN STEP KEYWORD, valid anywhere `Given`/`When`/`Then` is, a
# fact `packages/vitest/src/Plan.ts`'s keyword handling documents explicitly and
# `test/Plan.test.ts`'s `starKeyword` fixture exercises. Applied to a `.feature`
# file the union therefore stripped every `*`-keyword STEP before the scan saw
# it, so a step carrying the forbidden token passed this gate in silence — the
# exact state assertion 3's silence is asked to certify against. Measured as
# mutation E3 below.
#
# Gherkin's only comment form is `#`, and TypeScript has no `#`-comment, so
# neither pattern needs the other's alternatives. Splitting them costs one `case`
# and removes the whole class.
TS_COMMENT_RE='^[0-9]+:[[:space:]]*(//|\*|/\*)'
FEATURE_COMMENT_RE='^[0-9]+:[[:space:]]*#'

fail() {
  echo ""
  echo "✗ acceptance suite free of the escape-hatch type: NOT ENFORCED"
  echo ""
  echo "  $1"
  echo ""
  exit 1
}

# Precondition, so a deleted or moved target never reads as a pass.
[[ -d "$ACCEPTANCE_DIR" ]] || fail "missing directory $ACCEPTANCE_DIR — the tree this gate scans is absent, so nothing was verified. If the acceptance suite moved, update ACCEPTANCE_DIR in this script."
[[ -f "$CONTROL_FILE" ]] || fail "missing file $CONTROL_FILE — the regex control's target is absent, so assertion 2 cannot run. Pick another file containing a real occurrence and name it here."

# TWO LISTS, AND THEY ARE DELIBERATELY DIFFERENT.
#
# STEP_MODULES drives the POPULATION control only. It has to stay `*.steps.test.ts`
# because that suffix is what the control is a control ON: it is how a renamed
# directory, a moved pair or a mis-suffixed `*.steps.ts` is detected.
#
# SCANNED_FILES drives THE GATE, and it is EVERY `.ts` in the directory plus
# every `.feature`. It used to be `*.steps.test.ts` plus `*.feature`, which left
# `negative-requirements.test.ts` (463 lines) and `pitfalls-checklist.test.ts`
# (936 lines) — the two LARGEST TypeScript modules here, roughly half the
# directory's TypeScript — outside the scan entirely. Both files said so in their
# own headers and stated that the rule was "honoured here by hand", which is a
# convention, and this phase's Success Criterion 2 is AUTOMATED enforcement. The
# closing line below claims something about "the acceptance suite"; scanning five
# of its seven TypeScript modules did not entitle it to.
STEP_MODULES="$(find "$ACCEPTANCE_DIR" -type f -name '*.steps.test.ts' | sort)"
SCANNED_FILES="$(find "$ACCEPTANCE_DIR" -type f \( -name '*.ts' -o -name '*.feature' \) | sort)"

# Prefix every line with its number, drop comment lines, then match. The
# filtering happens BEFORE any count, so a doc comment that merely NAMES the
# forbidden token cannot register as a hit — mutation E.
#
# The comment pattern is chosen PER LANGUAGE, on the extension: see the two
# constants above for why one union of both was a hole rather than a shorthand.
# Anything that is not a `.feature` file is treated as TypeScript, which is the
# safe direction — the TS pattern strips strictly fewer Gherkin lines.
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
# emptied acceptance directory makes assertion 3 pass by scanning nothing.
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
# run against a named file that really does contain the escape-hatch type.
# Proves the scan reaches real occurrences before assertion 3 is asked to trust
# its silence.
# ---------------------------------------------------------------------------
CONTROL_HITS="$(scan "$CONTROL_FILE" "$TOKEN_RE" | wc -l | tr -d '[:space:]')"

if [[ "$CONTROL_HITS" -eq 0 ]]; then
  fail "regex control found ZERO occurrences in $CONTROL_FILE — the pattern has stopped matching, or that file's one documented occurrence was removed. Either way the silence of assertion 3 proves nothing. Fix TOKEN_RE, or point CONTROL_FILE at another source file that genuinely contains one."
fi
echo "✓ regex control: $CONTROL_HITS occurrence(s) found in $CONTROL_FILE — the scan reaches real occurrences"

# ---------------------------------------------------------------------------
# Assertion 3: THE GATE. Zero standalone occurrences across EVERY TypeScript
# module in the acceptance directory AND every acceptance .feature file, comment
# lines stripped. Not just the `*.steps.test.ts` pairs — see SCANNED_FILES.
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
  echo "  forbidden occurrences found:"
  printf '%s' "$VIOLATIONS"
  fail "the escape-hatch type occurs in the acceptance suite (listed above). It is assignable to everything, so one occurrence in a step body makes that body compile against every ambient Layer and disables INV-EC-003 for it — inside the suite whose whole job is to prove INV-EC-003. Never introduce one to make something compile: annotate the real type, or fix the Layer. See spec/invariants.md INV-EC-003, D-04b, and the 'Zero' section of $ACCEPTANCE_DIR/README.md. If the hit is in a .feature file or a string literal, reword it — this gate counts a standalone token wherever it appears in that directory, and the README says so."
fi
SCANNED_COUNT="$(printf '%s\n' "$SCANNED_FILES" | wc -l | tr -d '[:space:]')"
echo "✓ no .ts module or .feature file under $ACCEPTANCE_DIR contains the escape-hatch type as a standalone token ($SCANNED_COUNT file(s) scanned)"

echo ""
echo "acceptance suite free of the escape-hatch type: ENFORCED"

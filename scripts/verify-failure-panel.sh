#!/usr/bin/env bash
#
# ADR-EC-033/BEH-EC-025's real-output proof: asserts, against a REAL `vitest run` and its
# ACTUAL printed stdout — not a synthetic value, not an in-process `Exit` inspection — that a failing
# step's own cucumber-expression pattern and its `.feature` file:line now reach the failure panel, via
# `.cause` printed recursively as "Caused by:" by vitest's own DEFAULT reporter. No custom Reporter is
# involved anywhere in this gate; that is exactly the claim.
#
# `packages/vitest/test/failure-panel-fixture/failing.steps.test.ts` is a real acceptance-shaped pair
# whose one Scenario fails ON PURPOSE (3 + 2 apples asserted to equal 6). It is excluded from every
# normal `vitest run` (root and per-package `vitest.config.ts`) and is collected ONLY through this
# directory's own standalone `vitest.config.ts`, invoked here via `--config`.
#
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

VITEST="node_modules/.bin/vitest"
FIXTURE_CONFIG="packages/vitest/test/failure-panel-fixture/vitest.config.ts"
FIXTURE_FEATURE="packages/vitest/test/failure-panel-fixture/failing.feature"

# The failing step's own cucumber-expression PATTERN (registered in failing.steps.test.ts, never
# literal Gherkin text — the .feature file itself says "I should have 6 apples", the interpolated
# number, not "{int}") and its LINE inside $FIXTURE_FEATURE — both hardcoded here, from the fixture's
# own committed text, not derived: a gate that computed these from the same source it is checking
# could not catch a regression in the SOURCE of that computation.
STEP_PATTERN="I should have {int} apples"
STEP_LINE=6
# The literal Gherkin TEXT that line actually carries — what the precondition check below can grep
# the .feature file for, since the pattern above never appears in it verbatim.
STEP_TEXT_PREFIX="Then I should have"

fail() {
  {
    echo ""
    echo "✗ failure panel gate: NOT ENFORCED"
    echo ""
    echo "  $1"
    echo ""
  } >&2
  exit 1
}

[[ -x "$VITEST" ]] || fail "missing runner $VITEST — run \`pnpm install\` first. Without it this gate cannot invoke anything, so nothing was verified."
[[ -f "$FIXTURE_CONFIG" ]] || fail "missing file $FIXTURE_CONFIG — the standalone config this gate invokes is absent, so nothing was verified."
[[ -f "$FIXTURE_FEATURE" ]] || fail "missing file $FIXTURE_FEATURE — the fixture this gate's step-line/pattern constants describe is absent."

ACTUAL_LINE="$(grep -n -F "$STEP_TEXT_PREFIX" "$FIXTURE_FEATURE" | head -1 | cut -d: -f1)"
[[ "$ACTUAL_LINE" == "$STEP_LINE" ]] ||
  fail "the constant STEP_LINE=$STEP_LINE does not match the line \"$STEP_TEXT_PREFIX...\" actually sits on in $FIXTURE_FEATURE (found: ${ACTUAL_LINE:-none}). Update the constants at the top of this script to match — a stale pair would make the assertions below check the wrong location without saying so."
echo "✓ precondition: STEP_LINE=$STEP_LINE matches $FIXTURE_FEATURE's own committed text"

TMP_LOG="$(mktemp)"
trap 'rm -f "$TMP_LOG"' EXIT

# NO_COLOR strips ANSI escapes from the captured output, so the greps below match plain text rather
# than text interleaved with color codes. `|| true`: this run is SUPPOSED to fail — a non-zero exit
# here is the expected, correct outcome, not a gate failure.
NO_COLOR=1 "$VITEST" run --config "$FIXTURE_CONFIG" >"$TMP_LOG" 2>&1 || true

# ---------------------------------------------------------------------------
# Vacuity control: the run must actually have collected and run the one Scenario, and it must have
# FAILED — a config that silently collected 0 tests (a typo'd --config path, an include glob that
# stopped matching) would make every assertion below pass by finding nothing to contradict them.
# ---------------------------------------------------------------------------
grep -qF -- "1 failed" <(grep -F "Tests" "$TMP_LOG") ||
  {
    cat "$TMP_LOG"
    fail "the fixture run did not report exactly 1 failed test (output above). Either the fixture stopped failing (check failing.steps.test.ts's deliberate 3+2=6 assertion) or the standalone config collected the wrong file/count entirely."
  }
echo "✓ vacuity control: the fixture run collected and reported exactly 1 failed test"

# ---------------------------------------------------------------------------
# THE GATE, part 1: the failing step's own cucumber-expression PATTERN appears in the printed
# output — from StepFailureLocation's own .message, which ScenarioEffect.ts's withStepFailureLocation
# attaches as .cause before the failure can reach the reporter (ADR-EC-033).
# ---------------------------------------------------------------------------
grep -qF -- "$STEP_PATTERN" "$TMP_LOG" ||
  {
    cat "$TMP_LOG"
    fail "the failing step's own pattern (\"$STEP_PATTERN\") does not appear anywhere in the printed failure output (above). This fix's whole claim is that it now does — check ScenarioEffect.ts's withStepFailureLocation and Errors.ts's StepFailureLocation."
  }
echo "✓ the failing step's own pattern (\"$STEP_PATTERN\") appears in the printed failure output"

# ---------------------------------------------------------------------------
# THE GATE, part 2: the .feature file's path and the step's own LINE appear together, the way
# StepFailureLocation's message renders them (`<file>:<line>: step "<pattern>"`).
# ---------------------------------------------------------------------------
LOCATED="$(grep -F "$FIXTURE_FEATURE:$STEP_LINE" "$TMP_LOG" || true)"
if [[ -z "$LOCATED" ]]; then
  cat "$TMP_LOG"
  fail "no line in the printed output contains \"$FIXTURE_FEATURE:$STEP_LINE\" — the .feature file:line the roadmap's own design names. StepFailureLocation's message is built as \`\${file}:\${line}: step \${JSON.stringify(step)}\`; check that format hasn't drifted from what this gate greps for."
fi
echo "✓ the .feature file:line (\"$FIXTURE_FEATURE:$STEP_LINE\") appears in the printed failure output"

# ---------------------------------------------------------------------------
# THE MECHANISM CLAIM: vitest's own DEFAULT reporter recursed into .cause and rendered it as a
# nested "Caused by:" block — no custom Reporter anywhere in this repo's own config made this happen.
# ---------------------------------------------------------------------------
grep -qF -- "Caused by:" "$TMP_LOG" ||
  {
    cat "$TMP_LOG"
    fail "no \"Caused by:\" block appears in the printed output. The roadmap's locked mechanism is vitest's own default reporter recursing into a failure's .cause when that .cause carries a .name — StepFailureLocation is a real Error subclass and sets .name explicitly, so this line's absence means the .cause was never attached, or vitest's own reporter behavior has changed."
  }
grep -qF -- "Caused by: StepFailureLocation" "$TMP_LOG" ||
  {
    cat "$TMP_LOG"
    fail "a \"Caused by:\" block is present, but not one naming StepFailureLocation specifically — something else is now the printed cause, or StepFailureLocation.name has drifted from the literal string \"StepFailureLocation\"."
  }
echo "✓ vitest's own DEFAULT reporter rendered \"Caused by: StepFailureLocation\" — no custom Reporter involved"

echo ""
echo "failure panel gate: ENFORCED"

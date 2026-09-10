#!/usr/bin/env bash
#
# ADR-EC-060's real-output proof: asserts, against a REAL `vitest run` and the ACTUAL file
# `GherkinJUnitReporter` writes to disk — not a synthetic value, not an in-process call to its
# serializer functions — that a Scenario's tags land as `<properties>`, `attach()`'s output lands as
# `<system-out>`, and a real failure lands as `<failure>` with its message intact. Modeled directly on
# `scripts/verify-attachments-panel.sh` (ADR-EC-036/BEH-EC-028), the sibling gate for the DEFAULT
# reporter's own failure panel — this is the identical proof shape for a CUSTOM reporter instead.
#
# `packages/vitest/test/junit-reporter-fixture/junit.steps.test.ts` is a real acceptance-shaped pair
# with two Scenarios: one passing and `@smoke`-tagged, attaching evidence; one failing on purpose. It
# is excluded from every normal `vitest run` (root and per-package `vitest.config.ts`) and is
# collected ONLY through this directory's own standalone `vitest.config.ts`, invoked here via
# `--config`, which is also the one place `GherkinJUnitReporter` is registered against it.
#
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

VITEST="node_modules/.bin/vitest"
FIXTURE_CONFIG="packages/vitest/test/junit-reporter-fixture/vitest.config.ts"
FIXTURE_STEPS="packages/vitest/test/junit-reporter-fixture/junit.steps.test.ts"
REPORT_FILE="packages/vitest/test/junit-reporter-fixture/junit-report.xml"

# The literal marker string the fixture attaches, hardcoded here from the fixture's own committed
# text, not derived: a gate that computed this from the same source it is checking could not catch a
# regression in the SOURCE of that computation.
ATTACHMENT_MARKER="JUNIT-REPORTER-GATE-MARKER: order total was 42 cents"

fail() {
  {
    echo ""
    echo "✗ junit reporter gate: NOT ENFORCED"
    echo ""
    echo "  $1"
    echo ""
  } >&2
  exit 1
}

[[ -x "$VITEST" ]] || fail "missing runner $VITEST — run \`pnpm install\` first. Without it this gate cannot invoke anything, so nothing was verified."
[[ -f "$FIXTURE_CONFIG" ]] || fail "missing file $FIXTURE_CONFIG — the standalone config this gate invokes is absent, so nothing was verified."

grep -qF -- "$ATTACHMENT_MARKER" "$FIXTURE_STEPS" ||
  fail "the constant ATTACHMENT_MARKER does not appear in $FIXTURE_STEPS's own committed text. Update the constant at the top of this script to match — a stale value would make the assertions below check for a string the fixture never attaches."
echo "✓ precondition: ATTACHMENT_MARKER matches $FIXTURE_STEPS's own committed text"

rm -f "$REPORT_FILE"
trap 'rm -f "$REPORT_FILE"' EXIT

TMP_LOG="$(mktemp)"
trap 'rm -f "$TMP_LOG" "$REPORT_FILE"' EXIT

# NO_COLOR strips ANSI escapes so a later grep of the LOG (not the XML) matches plain text.
# `|| true`: one of this fixture's two Scenarios is SUPPOSED to fail — a non-zero exit here is the
# expected, correct outcome, not a gate failure.
NO_COLOR=1 "$VITEST" run --config "$FIXTURE_CONFIG" >"$TMP_LOG" 2>&1 || true

[[ -f "$REPORT_FILE" ]] || {
  cat "$TMP_LOG"
  fail "$REPORT_FILE was not written — GherkinJUnitReporter's onTestRunEnd either did not run or did not write a file (log above)."
}
echo "✓ $REPORT_FILE exists"

REPORT="$(cat "$REPORT_FILE")"

[[ "$REPORT" == *'<testsuites name="effect-cucumber" tests="2" failures="1" errors="0"'* ]] ||
  fail "the <testsuites> root does not report 2 tests / 1 failure as this fixture's two Scenarios (one passing, one failing) should produce. Got: $REPORT_FILE"
echo "✓ <testsuites> reports 2 tests, 1 failure"

[[ "$REPORT" == *'<property name="tag" value="@smoke"/>'* ]] ||
  fail "no <property name=\"tag\" value=\"\@smoke\"/> found — the passing Scenario's own @smoke tag (junit.feature) did not reach <properties>. Got: $REPORT_FILE"
echo "✓ the passing Scenario's @smoke tag reached <properties>"

[[ "$(echo "$REPORT" | grep -c "$ATTACHMENT_MARKER")" -ge 2 ]] ||
  fail "expected the attachment marker to appear at least twice (once per Scenario, both of which attach before their assertion) — it did not. Got: $REPORT_FILE"
echo "✓ attach()'s own marker reached <system-out> for both Scenarios"

[[ "$REPORT" == *'<failure message="expected 42 to equal 999" type="AssertionError">'* ]] ||
  fail "the failing Scenario's real assertion message did not reach <failure>. Got: $REPORT_FILE"
echo "✓ the failing Scenario's real error reached <failure> with its message intact"

echo ""
echo "junit reporter gate: ENFORCED"

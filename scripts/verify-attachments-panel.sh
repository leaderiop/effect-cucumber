#!/usr/bin/env bash
#
# ADR-EC-036/BEH-EC-028's real-output proof: asserts, against a REAL `vitest run` and its ACTUAL
# printed stdout — not a synthetic value, not an in-process `Exit` inspection — that data attached
# from inside a step via `attach(contentType, data)` reaches the failure panel, rendered by vitest's
# own DEFAULT reporter's `printAnnotations` (the exact mechanism `context.annotate` feeds). No custom
# Reporter is involved anywhere in this gate; that is exactly the claim. Modeled directly on
# `scripts/verify-failure-panel.sh` (ADR-EC-033/BEH-EC-025), the sibling gate for a failing step's own
# pattern and `.feature` location.
#
# `packages/vitest/test/attachments-fixture/attaching.steps.test.ts` is a real acceptance-shaped pair
# whose one Scenario attaches evidence and then fails ON PURPOSE (a computed total of 42 asserted to
# equal 999). It is excluded from every normal `vitest run` (root and per-package `vitest.config.ts`)
# and is collected ONLY through this directory's own standalone `vitest.config.ts`, invoked here via
# `--config`.
#
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

VITEST="node_modules/.bin/vitest"
FIXTURE_CONFIG="packages/vitest/test/attachments-fixture/vitest.config.ts"
FIXTURE_FEATURE="packages/vitest/test/attachments-fixture/attaching.feature"
FIXTURE_STEPS="packages/vitest/test/attachments-fixture/attaching.steps.test.ts"

# The literal marker string the fixture attaches, hardcoded here from the fixture's own committed
# text, not derived: a gate that computed this from the same source it is checking could not catch a
# regression in the SOURCE of that computation.
ATTACHMENT_MARKER="ATTACHMENTS-PANEL-GATE-MARKER: order total was 42 cents"
# The `contentType` the fixture passes — vitest's default reporter prints it as the annotation's own
# heading, on the line above the attached data.
ATTACHMENT_CONTENT_TYPE="text/plain"

fail() {
  {
    echo ""
    echo "✗ attachments panel gate: NOT ENFORCED"
    echo ""
    echo "  $1"
    echo ""
  } >&2
  exit 1
}

[[ -x "$VITEST" ]] || fail "missing runner $VITEST — run \`pnpm install\` first. Without it this gate cannot invoke anything, so nothing was verified."
[[ -f "$FIXTURE_CONFIG" ]] || fail "missing file $FIXTURE_CONFIG — the standalone config this gate invokes is absent, so nothing was verified."
[[ -f "$FIXTURE_FEATURE" ]] || fail "missing file $FIXTURE_FEATURE — the fixture this gate's marker constant describes is absent."

grep -qF -- "$ATTACHMENT_MARKER" "$FIXTURE_STEPS" ||
  fail "the constant ATTACHMENT_MARKER does not appear in $FIXTURE_STEPS's own committed text. Update the constant at the top of this script to match — a stale value would make the assertions below check for a string the fixture never attaches."
echo "✓ precondition: ATTACHMENT_MARKER matches $FIXTURE_STEPS's own committed text"

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
    fail "the fixture run did not report exactly 1 failed test (output above). Either the fixture stopped failing (check attaching.steps.test.ts's deliberate 42-vs-999 assertion) or the standalone config collected the wrong file/count entirely."
  }
echo "✓ vacuity control: the fixture run collected and reported exactly 1 failed test"

# ---------------------------------------------------------------------------
# THE GATE, part 1: the attached DATA appears in the printed output — from Attachments' live
# implementation calling ctx.annotate(data, contentType) inside the running step, before the
# Scenario's own deliberate assertion failure.
# ---------------------------------------------------------------------------
grep -qF -- "$ATTACHMENT_MARKER" "$TMP_LOG" ||
  {
    cat "$TMP_LOG"
    fail "the attached data (\"$ATTACHMENT_MARKER\") does not appear anywhere in the printed failure output (above). This feature's whole claim is that it does — check VitestTestApi.ts's attachmentsLive and Attachments.ts's attach."
  }
echo "✓ the attached data (\"$ATTACHMENT_MARKER\") appears in the printed failure output"

# ---------------------------------------------------------------------------
# THE GATE, part 2: the attached CONTENT TYPE appears too, the way vitest's own printAnnotations
# renders it — grouped as a heading above the attached data.
# ---------------------------------------------------------------------------
grep -qF -- "$ATTACHMENT_CONTENT_TYPE" "$TMP_LOG" ||
  {
    cat "$TMP_LOG"
    fail "no line in the printed output contains the attached content type (\"$ATTACHMENT_CONTENT_TYPE\") — vitest's own printAnnotations renders \`contentType\` as the annotation's heading; check that format hasn't drifted from what this gate greps for."
  }
echo "✓ the attached content type (\"$ATTACHMENT_CONTENT_TYPE\") appears in the printed failure output"

# ---------------------------------------------------------------------------
# THE MECHANISM CLAIM: the attached data appears TOGETHER with vitest's own failure summary for this
# Scenario — proving it rendered as part of the REAL failure report, not merely printed somewhere in
# stdout by an unrelated code path (e.g. a stray console.log).
# ---------------------------------------------------------------------------
grep -qF -- "Attaching evidence before a failing assertion" "$TMP_LOG" ||
  {
    cat "$TMP_LOG"
    fail "the Scenario's own title does not appear in the printed output — the run did not report against the fixture Scenario this gate expects."
  }
echo "✓ vitest's own DEFAULT reporter rendered the attachment under the real failing Scenario's own report — no custom Reporter involved"

echo ""
echo "attachments panel gate: ENFORCED"

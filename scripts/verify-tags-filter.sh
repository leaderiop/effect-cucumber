#!/usr/bin/env bash
#
# Asserts, from OUTSIDE the test process, that a tag this library emits reached the
# real runner task: `--tagsFilter` selects exactly the tagged Scenario, `@skip` is
# reported skipped, an excludeTags Scenario is ABSENT rather than skipped, `@only`
# never forbids the run, and the AfterAllScenarios teardown runs under a filter.
# Read from the JSON reporter. An in-process test cannot observe its own run.
#
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# Spelled out in full rather than composed, so these paths stay greppable.
TEST_FILE="packages/vitest/test/emission.test.ts"
VITEST_CONFIG="vitest.tags.ts"

# Use the repo-local runner, never a global `vitest`.
VITEST="node_modules/.bin/vitest"

FILTER_TAG="@only"

# Carries criteria 3 and 4: tagged `@only`, and the target of the CLI filter in
# run B. `@only` is emitted as a PLAIN TAG and is never routed to an
TITLE_ONLY="an only-tagged Scenario emits a plain tag and no modifier"

# Carries criterion 2's reporter half: tagged `@skip`, must be REPORTED skipped.
TITLE_SKIP="a skipped Scenario runs none of its own step bodies"

# Carries criterion 4's other half: carries no Scenario-level tag, so the CLI
# filter in run B must narrow it to SKIPPED while leaving it PRESENT.
TITLE_UNTAGGED="an untagged Scenario still inherits the Feature's own tag"

# from the report entirely — not skipped, absent.
TITLE_EXCLUDED="the first wip Scenario, which excludeTags removes"

fail() {
  echo ""
  echo "✗ tag filter gate: NOT ENFORCED"
  echo ""
  echo "  $1"
  echo ""
  exit 1
}

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

REPORT_A="$TMP_DIR/run-a.json"
REPORT_B="$TMP_DIR/run-b.json"
LOG_A="$TMP_DIR/run-a.log"
LOG_B="$TMP_DIR/run-b.log"

run_vitest() {
  local report="$1" log="$2"
  shift 2
  "$VITEST" run "$TEST_FILE" \
    --allowOnly=false \
    --reporter=json \
    --outputFile="$report" \
    "$@" >"$log" 2>&1 || true
}

report_query() {
  local report="$1" mode="$2" title="${3-}"
  REPORT="$report" QUERY_MODE="$mode" QUERY_TITLE="$title" node -e '
    const fs = require("node:fs")
    const report = JSON.parse(fs.readFileSync(process.env.REPORT, "utf8"))
    const results = (report.testResults || []).flatMap((file) => file.assertionResults || [])
    const mode = process.env.QUERY_MODE

    if (mode === "total") {
      console.log(String(results.length))
    } else if (mode === "passed" || mode === "failed") {
      console.log(String(results.filter((result) => result.status === mode).length))
    } else if (mode === "status") {
      const matches = results.filter((result) => result.title === process.env.QUERY_TITLE)
      if (matches.length === 0) console.log("ABSENT")
      else if (matches.length > 1) console.log("AMBIGUOUS")
      else console.log(matches[0].status)
    } else {
      throw new Error("unknown query mode: " + mode)
    }
  '
}

[[ -f "$TEST_FILE" ]] || fail "missing file $TEST_FILE — the file this gate runs is absent, so nothing was verified."
[[ -x "$VITEST" ]] || fail "missing runner $VITEST — run \`pnpm install\` first. Without it this gate cannot invoke anything, so nothing was verified."
[[ -f "$VITEST_CONFIG" ]] || fail "missing file $VITEST_CONFIG — the tag universe this gate's filter is validated against is absent, so run B would error rather than filter."

grep -qF -- "$FILTER_TAG" "$VITEST_CONFIG" || fail "$VITEST_CONFIG does not declare $FILTER_TAG. --tagsFilter validates its pattern against test.tags regardless of the strict-tags setting, so run B would error out instead of selecting anything."

title_is_declared() {
  local title="$1" line
  while IFS= read -r line; do
    line="${line%$'\r'}"
    while [[ "$line" == *[[:space:]] ]]; do line="${line%?}"; done
    [[ "$line" == *"Scenario: $title" ]] && return 0
  done < <(grep -F -- "Scenario: $title" "$TEST_FILE" || true)
  return 1
}

for title in "$TITLE_ONLY" "$TITLE_SKIP" "$TITLE_UNTAGGED" "$TITLE_EXCLUDED"; do
  title_is_declared "$title" ||
    fail "no Scenario in $TEST_FILE is titled exactly: \"$title\". This gate asserts on REPORTED titles, so a rename would otherwise make an assertion vacuous rather than false — an absent title is indistinguishable from a correctly-excluded one, and assertion 4 asserts absence on purpose. Update the title constant at the top of this script to match, and read which criterion its comment says it carries before changing anything else."
done
echo "✓ preconditions: $TEST_FILE, $VITEST_CONFIG (declares $FILTER_TAG), and all four Scenario titles present verbatim"

# ---------------------------------------------------------------------------
# RUN A — unfiltered, $TEST_FILE only.
# ---------------------------------------------------------------------------
run_vitest "$REPORT_A" "$LOG_A"
[[ -f "$REPORT_A" ]] || {
  cat "$LOG_A"
  fail "the unfiltered run wrote no report to $REPORT_A — the runner did not get far enough to report anything (output above)."
}

# ---------------------------------------------------------------------------
# Assertion 1: VACUITY CONTROL for run A. A non-zero number of results.
# ---------------------------------------------------------------------------
TOTAL_A="$(report_query "$REPORT_A" total)"
if [[ "$TOTAL_A" -eq 0 ]]; then
  cat "$LOG_A"
  fail "the unfiltered run reported ZERO test results — $TEST_FILE did not collect, so every assertion below would be vacuously true. The usual cause is a tag emitted that $VITEST_CONFIG does not declare, which fails the WHOLE file to 0 tests. Output above."
fi
echo "✓ run A vacuity control: $TOTAL_A test result(s) reported — the file collected"

# ---------------------------------------------------------------------------
# Assertion 2: criterion 3, observed from OUTSIDE the process. The `@only`-tagged
# ---------------------------------------------------------------------------
STATUS_ONLY_A="$(report_query "$REPORT_A" status "$TITLE_ONLY")"
if [[ "$STATUS_ONLY_A" != "passed" ]]; then
  cat "$LOG_A"
  fail "the @only-tagged Scenario is \"$STATUS_ONLY_A\" in the unfiltered run, expected \"passed\". Title: \"$TITLE_ONLY\"."
fi
echo "✓ run A: the @only-tagged Scenario passed under --allowOnly=false — @only is a plain tag, not a modifier"

# ---------------------------------------------------------------------------
# Assertion 3: criterion 2's reporter half. The `@skip`-tagged Scenario is
# ---------------------------------------------------------------------------
STATUS_SKIP_A="$(report_query "$REPORT_A" status "$TITLE_SKIP")"
if [[ "$STATUS_SKIP_A" != "skipped" ]]; then
  cat "$LOG_A"
  fail "the @skip-tagged Scenario is \"$STATUS_SKIP_A\" in the unfiltered run, expected \"skipped\". Title: \"$TITLE_SKIP\". A \"passed\" status means the skip never reached the real task — check Tags.ts's isSkipped and the skip flag Runner.ts passes to api.effect."
fi
echo "✓ run A: the @skip-tagged Scenario is REPORTED skipped — the skip reached the real task"

STATUS_EXCLUDED_A="$(report_query "$REPORT_A" status "$TITLE_EXCLUDED")"
if [[ "$STATUS_EXCLUDED_A" != "ABSENT" ]]; then
  cat "$LOG_A"
 fail "the excludeTags-removed Scenario appears in the report with status \"$STATUS_EXCLUDED_A\", expected it to be ABSENT. Title: \"$TITLE_EXCLUDED\". excludeTags is a REGISTRATION filter — the Scenario is never handed to the runner, so it must leave no node at all, not even a skipped one. A \"skipped\" status here means the filter degraded into a skip, which is the one thing it must never become."
fi
echo "✓ run A: the excludeTags-removed Scenario is ABSENT from the report — a registration filter, not a skip"

# ---------------------------------------------------------------------------
# RUN B — the same file, narrowed by the runner's own CLI tag filter.
# ---------------------------------------------------------------------------
run_vitest "$REPORT_B" "$LOG_B" --tagsFilter="$FILTER_TAG"
[[ -f "$REPORT_B" ]] || {
  cat "$LOG_B"
  fail "the filtered run wrote no report to $REPORT_B — the runner did not get far enough to report anything. If the output above names an unknown tag, $FILTER_TAG is no longer declared in $VITEST_CONFIG."
}

# ---------------------------------------------------------------------------
# Assertion 5: VACUITY CONTROL for run B. At least one test PASSED. A filter
# ---------------------------------------------------------------------------
PASSED_B="$(report_query "$REPORT_B" passed)"
if [[ "$PASSED_B" -eq 0 ]]; then
  cat "$LOG_B"
  fail "the run filtered on $FILTER_TAG reported ZERO passed tests — the filter selected nothing, so assertion 6 would be vacuous. This is precisely what a library that emitted no tags produces: the filter has nothing to match, every test is narrowed to skip, and the process still exits 0."
fi
echo "✓ run B vacuity control: $PASSED_B test(s) passed under --tagsFilter=$FILTER_TAG — the filter selected something"

# ---------------------------------------------------------------------------
# Assertion 6: THE GATE. The `@only`-tagged Scenario PASSED under a filter on
# ---------------------------------------------------------------------------
STATUS_ONLY_B="$(report_query "$REPORT_B" status "$TITLE_ONLY")"
if [[ "$STATUS_ONLY_B" != "passed" ]]; then
  cat "$LOG_B"
  fail "the @only-tagged Scenario is \"$STATUS_ONLY_B\" under --tagsFilter=$FILTER_TAG, expected \"passed\". Title: \"$TITLE_ONLY\". The filter did not select it, which means the tag string $FILTER_TAG never reached the real task — check the tags Runner.ts passes to api.effect and the mapping in Tags.ts. Note that NOTHING ELSE IN THIS REPO GOES RED for this: every in-process assertion in $TEST_FILE passes with all tags dropped."
fi
echo "✓ run B: --tagsFilter=$FILTER_TAG SELECTED the @only-tagged Scenario — the tag is on the real task"

# ---------------------------------------------------------------------------
# Assertion 7: the other half of the matched pair. A Scenario the filter did NOT
# ---------------------------------------------------------------------------
STATUS_UNTAGGED_B="$(report_query "$REPORT_B" status "$TITLE_UNTAGGED")"
if [[ "$STATUS_UNTAGGED_B" == "ABSENT" ]]; then
  cat "$LOG_B"
  fail "a Scenario the $FILTER_TAG filter did not select is ABSENT from the filtered report, expected \"skipped\" and PRESENT. Title: \"$TITLE_UNTAGGED\". A CLI filter narrows non-matching tests to skip and never removes them ; absence is what a REGISTRATION filter produces. If both mechanisms now produce absence, assertion 4 no longer distinguishes anything."
fi
if [[ "$STATUS_UNTAGGED_B" != "skipped" ]]; then
  cat "$LOG_B"
  fail "a Scenario the $FILTER_TAG filter did not select is \"$STATUS_UNTAGGED_B\" in the filtered report, expected \"skipped\". Title: \"$TITLE_UNTAGGED\". A \"passed\" status means the filter is not narrowing at all, so assertion 6's selection proves nothing."
fi
echo "✓ run B: an unselected Scenario is PRESENT and skipped — a CLI filter narrows, it does not remove"
# F-06: the Feature's AfterAllScenarios teardown must run under a narrowed run. The four-level Feature
# in $TEST_FILE registers one that writes a marker to stdout; run B narrowed everything but its
# @only Scenario to skip, and the teardown — a block hook, not a test node — still has to fire.
MARKER_AFTER_ALL="AFTER_ALL_SCENARIOS_RAN"
grep -q -- "$MARKER_AFTER_ALL" "$LOG_A" ||
  fail "the unfiltered run printed no $MARKER_AFTER_ALL marker — the four-level Feature's AfterAllScenarios teardown did not run at all, so the filtered assertion below would be vacuous. Check that the Feature still registers the marker hook and that Runner.ts still registers the teardown through TestApi.afterAll."
grep -q -- "$MARKER_AFTER_ALL" "$LOG_B" ||
  fail "the run filtered on $FILTER_TAG printed no $MARKER_AFTER_ALL marker — the AfterAllScenarios teardown was SKIPPED by test selection. BEH-EC-017 requires it to run once after a Feature's tests whether the run was whole or narrowed; a teardown emitted as a test node is exactly what a filter skips (F-06)."
echo "✓ run B: the AfterAllScenarios teardown ran under --tagsFilter=$FILTER_TAG — a block hook, not a filterable node"

# ---------------------------------------------------------------------------
# Assertion 8: run A reported no FAILED test. This is assertion 2's other half —
# ---------------------------------------------------------------------------
FAILED_A="$(report_query "$REPORT_A" failed)"
if [[ "$FAILED_A" -ne 0 ]]; then
  cat "$LOG_A"
 fail "the unfiltered run reported $FAILED_A failed test(s) under --allowOnly=false. Every tag-specific assertion above passed, so this is an ordinary in-process failure in $TEST_FILE — read the output above, and note that \`pnpm test\` covers it too. If instead the output names an only-modifier, has been broken: @only must be emitted as a PLAIN TAG and never routed to it.effect.only."
fi
echo "✓ run A: 0 failed tests under --allowOnly=false — no only-modifier was rejected at collection"

echo ""
echo "tag filter gate: ENFORCED"

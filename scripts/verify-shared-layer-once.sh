#!/usr/bin/env bash
#
# Asserts, from OUTSIDE the test process, that a Feature with a `shared` Layer
# reports the same Scenario status run whole and run narrowed with `-t`, that the
# shared build happens once on both runs, and that the AfterAllScenarios teardown
# runs under both and not when nothing was selected. Read from the JSON reporter,
# never from terminal text. No in-process assertion can re-invoke the runner.
#
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# Spelled out in full rather than composed, so these paths stay greppable.
TEST_FILE="packages/vitest/test/emission.test.ts"

# Use the repo-local runner, never a global `vitest`.
VITEST="node_modules/.bin/vitest"

TITLE_SHARED_BUILD="the second shared scenario observes the same shared build"

TITLE_CLOCK_FIRST="the first shared clock scenario advances the test clock by one hour"

TITLE_CLOCK_SECOND="the second shared clock scenario still starts at time zero"

TITLE_RULE_SECOND="the second rule scenario under a shared feature rebuilds only the rule tier"

fail() {
  echo ""
  echo "✗ shared-Layer whole-vs-filtered gate: NOT ENFORCED"
  echo ""
  echo "  $1"
  echo ""
  exit 1
}

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

REPORT_A="$TMP_DIR/run-a.json"
REPORT_B="$TMP_DIR/run-b.json"
REPORT_C="$TMP_DIR/run-c.json"
LOG_A="$TMP_DIR/run-a.log"
LOG_B="$TMP_DIR/run-b.log"
LOG_C="$TMP_DIR/run-c.log"

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

title_is_declared() {
  local title="$1" line
  while IFS= read -r line; do
    line="${line%$'\r'}"
    while [[ "$line" == *[[:space:]] ]]; do line="${line%?}"; done
    [[ "$line" == *"Scenario: $title" ]] && return 0
  done < <(grep -F -- "Scenario: $title" "$TEST_FILE" || true)
  return 1
}

for title in "$TITLE_SHARED_BUILD" "$TITLE_CLOCK_FIRST" "$TITLE_CLOCK_SECOND" "$TITLE_RULE_SECOND"; do
  title_is_declared "$title" ||
    fail "no Scenario in $TEST_FILE is titled exactly: \"$title\". This gate asserts on REPORTED titles and COMPARES one across two runs, so a rename would otherwise make an assertion vacuous rather than false — two ABSENT statuses are equal to each other. Update the title constant at the top of this script to match, and read which criterion its comment says it carries before changing anything else. Plans 10-03 and 10-04 record these titles verbatim in their summaries and mark them FIXED at the fixture."
done
echo "✓ preconditions: $TEST_FILE, $VITEST, and all four Scenario titles present verbatim"

# ---------------------------------------------------------------------------
# RUN A — unfiltered, $TEST_FILE only. The whole-Feature half of SC #3.
# ---------------------------------------------------------------------------
run_vitest "$REPORT_A" "$LOG_A"
[[ -f "$REPORT_A" ]] || {
  cat "$LOG_A"
  fail "the unfiltered run wrote no report to $REPORT_A — the runner did not get far enough to report anything (output above)."
}

TOTAL_A="$(report_query "$REPORT_A" total)"
if [[ "$TOTAL_A" -eq 0 ]]; then
  cat "$LOG_A"
  fail "the unfiltered run reported ZERO test results — $TEST_FILE did not collect, so every assertion below would be vacuously true. Output above."
fi
echo "✓ A1 run A vacuity control: $TOTAL_A test result(s) reported — the file collected"

STATUS_SHARED_A="$(report_query "$REPORT_A" status "$TITLE_SHARED_BUILD")"
if [[ "$STATUS_SHARED_A" != "passed" ]]; then
  cat "$LOG_A"
  fail "the shared-build Scenario is \"$STATUS_SHARED_A\" in the whole-file run, expected \"passed\". Title: \"$TITLE_SHARED_BUILD\". Its body asserts the shared build counter is exactly 1; a \"failed\" status means the shared Layer was rebuilt per Scenario — check that describeFeature.ts's shared branch still emits through sharedLayerTestApi and that splitLayerArgument still keeps the two tiers apart."
fi
echo "✓ A2 run A: the shared-build Scenario passed — the shared Layer built exactly once for the whole Feature"

STATUS_CLOCK_A="$(report_query "$REPORT_A" status "$TITLE_CLOCK_SECOND")"
if [[ "$STATUS_CLOCK_A" != "passed" ]]; then
  cat "$LOG_A"
  fail "the clock-isolation Scenario is \"$STATUS_CLOCK_A\" in the whole-file run, expected \"passed\". Title: \"$TITLE_CLOCK_SECOND\". Its body asserts the simulated clock reads 0, and \"$TITLE_CLOCK_FIRST\" ran before it and advanced that clock by an hour. A \"failed\" status here is ADR-EC-018's leak reproduced: the shared Layer is carrying ONE memoized TestEnv for the whole Feature. Both halves of the fix matter and they guard different services — \`excludeTestServices: true\` at the layer(...) call site, and the per-emission \`Effect.provide(testEnv)\` in sharedLayerTestApi."
fi
echo "✓ A3 run A: the clock-isolation Scenario passed after a preceding Scenario advanced the clock — status recorded for the filtered comparison"

STATUS_RULE_A="$(report_query "$REPORT_A" status "$TITLE_RULE_SECOND")"
if [[ "$STATUS_RULE_A" != "passed" ]]; then
  cat "$LOG_A"
 fail "the Rule-under-shared Scenario is \"$STATUS_RULE_A\" in the whole-file run, expected \"passed\". Title: \"$TITLE_RULE_SECOND\". It asserts the Feature's shared Layer stayed at ONE build while the Rule's own extraLayer rebuilt for this Scenario — the archived planning record's , the combination neither ADR-EC-006's nor ADR-EC-010's own tests exercise."
fi
echo "✓ A4 run A: the Rule-under-shared Scenario passed — a Rule's own tier rebuilds while the Feature's shared tier does not"

run_vitest "$REPORT_B" "$LOG_B" -t "$TITLE_CLOCK_SECOND"
[[ -f "$REPORT_B" ]] || {
  cat "$LOG_B"
  fail "the -t filtered run wrote no report to $REPORT_B — the runner did not get far enough to report anything (output above)."
}

PASSED_B="$(report_query "$REPORT_B" passed)"
if [[ "$PASSED_B" -eq 0 ]]; then
  cat "$LOG_B"
  fail "the run narrowed with -t reported ZERO passed tests — the filter selected nothing, so assertion B2 would be vacuous. The pattern is matched as a REGEX against the full ancestor path; check that \"$TITLE_CLOCK_SECOND\" is still the reported title and still free of regex metacharacters."
fi
echo "✓ B1 run B vacuity control: $PASSED_B test(s) passed under -t — the filter selected something"

STATUS_CLOCK_B="$(report_query "$REPORT_B" status "$TITLE_CLOCK_SECOND")"
if [[ "$STATUS_CLOCK_B" != "$STATUS_CLOCK_A" ]]; then
  cat "$LOG_B"
  fail "the clock-isolation Scenario reports DIFFERENT statuses whole and filtered: \"$STATUS_CLOCK_A\" in the whole run, \"$STATUS_CLOCK_B\" under -t. Title: \"$TITLE_CLOCK_SECOND\". This is ADR-EC-018's defect exactly — \"a suite that passes run as a whole can fail under -t filtering, or vice versa\" — and it means the shared Layer is carrying a MEMOIZED TestEnv, so Scenario execution order became semantically load-bearing. Look for a shared TestClock/TestConsole: \`excludeTestServices: true\` missing from describeFeature.ts's layer(...) call, or the per-emission \`Effect.provide(testEnv)\` in sharedLayerTestApi hoisted out of the emission boundary. NOTHING in \`pnpm test\` compares these two runs; it cannot."
fi
if [[ "$STATUS_CLOCK_B" != "passed" ]]; then
  cat "$LOG_B"
  fail "the clock-isolation Scenario is \"$STATUS_CLOCK_B\" in BOTH the whole run and the -t run, expected \"passed\" in both. Title: \"$TITLE_CLOCK_SECOND\". Equality alone is not the claim: two identically failing runs also yield identical results. A memoized TestEnv is still the thing to look for."
fi
echo "✓ B2 THE GATE: the clock-isolation Scenario is \"$STATUS_CLOCK_B\" whole AND \"$STATUS_CLOCK_B\" under -t — identical results, both passing"

run_vitest "$REPORT_C" "$LOG_C" -t "$TITLE_SHARED_BUILD"
[[ -f "$REPORT_C" ]] || {
  cat "$LOG_C"
  fail "the -t filtered run wrote no report to $REPORT_C — the runner did not get far enough to report anything (output above)."
}

# ---------------------------------------------------------------------------
# C1: VACUITY CONTROL for run C, for B1's reason.
# ---------------------------------------------------------------------------
PASSED_C="$(report_query "$REPORT_C" passed)"
if [[ "$PASSED_C" -eq 0 ]]; then
  cat "$LOG_C"
  fail "the run narrowed to the shared-build Scenario reported ZERO passed tests — the filter selected nothing, so assertion C2 would be vacuous. The pattern is matched as a REGEX against the full ancestor path; check that \"$TITLE_SHARED_BUILD\" is still the reported title."
fi
echo "✓ C1 run C vacuity control: $PASSED_C test(s) passed under -t — the filter selected something"

STATUS_SHARED_C="$(report_query "$REPORT_C" status "$TITLE_SHARED_BUILD")"
if [[ "$STATUS_SHARED_C" != "passed" ]]; then
  cat "$LOG_C"
  fail "the shared-build Scenario is \"$STATUS_SHARED_C\" when it is the ONLY selected test, expected \"passed\" — it passed in the whole-file run (assertion A2). Title: \"$TITLE_SHARED_BUILD\". The shared Layer's build-once claim must not depend on which siblings the filter happened to leave behind."
fi
echo "✓ C2 run C: the shared-build Scenario passed as the ONLY selected test — build-once does not depend on its siblings"
# F-06: the shared-build Feature's AfterAllScenarios teardown reads the shared tier and writes a marker.
# It must run in the whole run and in run C (narrowed to one of its Scenarios), and must NOT run in run
# B (narrowed to a Scenario of a DIFFERENT Feature — nothing in the shared-build Feature was attempted).
MARKER_SHARED_AFTER_ALL="SHARED_AFTER_ALL_SCENARIOS_RAN"
grep -q -- "$MARKER_SHARED_AFTER_ALL" "$LOG_A" ||
  fail "the whole-file run printed no $MARKER_SHARED_AFTER_ALL marker — the shared-build Feature's AfterAllScenarios teardown did not run, or could not reach the shared tier (its body reads SharedProbe through the block's memo map). Check describeFeature.ts's shared adapter afterAll."
grep -q -- "$MARKER_SHARED_AFTER_ALL" "$LOG_C" ||
  fail "the run narrowed with -t to the shared-build Scenario printed no $MARKER_SHARED_AFTER_ALL marker — the teardown was skipped by test selection on the SHARED path (F-06)."
if grep -q -- "$MARKER_SHARED_AFTER_ALL" "$LOG_B"; then
  cat "$LOG_B"
  fail "the run narrowed with -t to the clock-isolation Scenario printed the $MARKER_SHARED_AFTER_ALL marker — the shared-build Feature's teardown ran although NONE of that Feature's Scenarios was attempted. The attempted gate in Runner.ts is not holding under a real -t run."
fi
echo "✓ C3 the shared-path AfterAllScenarios teardown ran whole and under -t, against the memoised build, and stayed a no-op for a Feature -t left untouched"

FAILED_A="$(report_query "$REPORT_A" failed)"
if [[ "$FAILED_A" -ne 0 ]]; then
  cat "$LOG_A"
  fail "the unfiltered run reported $FAILED_A failed test(s). Every shared-Layer-specific assertion above passed, so this is an ordinary in-process failure in $TEST_FILE — read the output above, and note that \`pnpm test\` covers it too."
fi
echo "✓ A5 run A: 0 failed tests — no unrelated in-process regression in $TEST_FILE"

echo ""
echo "shared-Layer whole-vs-filtered gate: ENFORCED"

#!/usr/bin/env bash
#
# Asserts, FROM OUTSIDE THE TEST PROCESS, that a tag this library emits actually
# landed on the real runner task — observable only through the runner's own CLI
# tag filter and its own reporter.
#
# Three claims, none of which any in-process assertion can make:
#   1. A CLI tag filter SELECTS exactly the Scenario carrying that tag.
#   2. A `@skip` Scenario is REPORTED skipped, not merely un-executed.
#   3. A Scenario removed by `excludeTags` is ABSENT from the report, while one
#      narrowed out by a CLI filter is PRESENT and reported skipped.
#
# METHOD NOTE (do not weaken this):
#   `pnpm test` exiting 0 does NOT prove that a tag reached the real runner task,
#   and the gap is narrower — and therefore more dangerous — than "the suite
#   cannot see tags at all". Two in-process gates DO watch tags, and both stop
#   short of the framework:
#
#     - `test/Runner.test.ts` asserts what `Runner.ts` hands to `TestApi.effect`.
#       That is the SEAM, and a recording fake is all it can ever observe.
#     - `test/emission.test.ts` asserts that an UNDECLARED tag produces one
#       located warning (D-08), which requires only that some tag reached the
#       framework's validator.
#
#   Neither observes what the framework then DID with the tag. Everything between
#   `TestApi.effect` and the real task — `describeFeature.ts`'s `vitestTestApi`
#   adapter, the one place in this package that touches the framework's own
#   option object — is unwatched from inside the process, and a test cannot
#   observe what its own run registered.
#
#   Measured, and recorded as mutation proof 1c in this plan's summary: with that
#   adapter dropping ONE tag (`@only`) on its way into the framework, the entire
#   suite stays green — 32 files, 741 passed, 3 skipped, exit 0, including both
#   gates above — and this script is the only thing in the repo that goes red.
#   Only an invocation that FILTERS on the tag can tell "the tag is on the task"
#   from "the tag was accepted, validated, and then discarded".
#
#   The blunter mutation is NOT the one to cite, and mutation proof 1a records
#   why: emptying the tag array in `Runner.ts` fails 5 tests across 2 files,
#   because it also breaks the seam assertions and the D-08 warning. It proves
#   the gate fires; it does NOT demonstrate the asymmetry, because `pnpm test`
#   does not stay green. Do not "simplify" 1c back into 1a when re-verifying.
#
#   Assertions 4 and 7 are a MATCHED PAIR and neither is redundant. `excludeTags`
#   (D-03) is a REGISTRATION filter: the Scenario is never handed to the runner,
#   so it is ABSENT from the report — no node, not even a skipped one. A CLI
#   `--tagsFilter` is a MODE narrowing: RESEARCH Finding 7 verified against
#   vitest 4.1.11 that it sets non-matching tests to skip and NEVER removes them,
#   and that it runs LAST inside the runner's mode interpretation so it can only
#   ever narrow to skip (it can never un-skip a `@skip` test). Absent versus
#   present-and-skipped is therefore a real, observable difference, and asserting
#   both is what proves neither mechanism is masquerading as the other. Drop
#   assertion 4 and a registration filter that had degraded into a skip would
#   pass; drop assertion 7 and a CLI filter that had started deleting tests would
#   pass.
#
#   The report is parsed as STRUCTURED DATA with `node -e`, never by grepping the
#   reporter's terminal output for glyphs. Glyph output varies with TTY detection,
#   colour support and reporter choice; a gate keyed to it breaks silently in CI
#   or, worse, matches nothing and passes. There is deliberately no glyph matching
#   anywhere in this file.
#
#   Every title this gate depends on is asserted to exist in the test file, spelled
#   EXACTLY, before any run happens. A rename must fail this gate BY NAME rather
#   than turning a later status assertion silently vacuous — an absent title
#   otherwise reads as "not present in the report", which is exactly what
#   assertion 4 asserts on purpose. This is the same positive-control role
#   assertion 1 plays in `verify-no-runner-dep.sh`, and it exists because
#   STATE.md's 01-02 entry records a grep-based gate in this repo that passed and
#   was then proven vacuous by mutation testing. The exactness is load-bearing and
#   was itself mutation-proven: see `title_is_declared` below. Each run
#   additionally carries its own non-zero vacuity control, because a file that
#   fails to COLLECT (what an undeclared tag does) produces zero results, against
#   which every status assertion is trivially true.
#
# Usage: bash scripts/verify-tags-filter.sh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# Spelled out in full rather than composed, so these paths stay greppable.
TEST_FILE="packages/vitest/test/emission.test.ts"
VITEST_CONFIG="vitest.config.ts"

# Use the repo-local runner, never a global `vitest`.
VITEST="node_modules/.bin/vitest"

# The tag this gate filters on. It MUST be declared in $VITEST_CONFIG: RESEARCH
# Finding 2 verified that `--tagsFilter` validates its pattern against
# `test.tags` REGARDLESS of the strict-tags setting, so an undeclared pattern
# errors rather than matching nothing.
FILTER_TAG="@only"

# ---------------------------------------------------------------------------
# The four Scenario titles this gate depends on, each carrying one criterion.
# These are emitted by real `describeFeature` calls in $TEST_FILE (plan 09-06);
# `Runner.ts` note (d) is why the reported title is the Pickle `name`.
# ---------------------------------------------------------------------------

# Carries criteria 3 and 4: tagged `@only`, and the target of the CLI filter in
# run B. `@only` is emitted as a PLAIN TAG and is never routed to an
# only-modifier (D-06) — assertion 2 is what observes that from outside.
TITLE_ONLY="an only-tagged Scenario emits a plain tag and no modifier"

# Carries criterion 2's reporter half: tagged `@skip`, must be REPORTED skipped.
TITLE_SKIP="a skipped Scenario runs none of its own step bodies"

# Carries criterion 4's other half: carries no Scenario-level tag, so the CLI
# filter in run B must narrow it to SKIPPED while leaving it PRESENT.
TITLE_UNTAGGED="an untagged Scenario still inherits the Feature's own tag"

# Carries D-03: removed by `excludeTags` at registration, so it must be ABSENT
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

# One invocation, scoped to $TEST_FILE alone — this gate never runs the whole
# suite. `--allowOnly=false` is passed EXPLICITLY rather than left to
# $VITEST_CONFIG: assertion 2's claim is "a real only-modifier would fail this
# run", and stating the policy on the command line makes that claim true of this
# invocation regardless of what the config happens to say. (Whether the config
# also pins it is plan 09-01's gate, not this one's.)
#
# The exit code is deliberately swallowed. Every claim here is about the
# STRUCTURED RESULTS, and a run with a failing test still writes a report worth
# asserting over; conflating "the process exited non-zero" with "the assertion
# failed" would report the wrong thing. The log is kept and printed on failure.
run_vitest() {
  local report="$1" log="$2"
  shift 2
  "$VITEST" run "$TEST_FILE" \
    --allowOnly=false \
    --reporter=json \
    --outputFile="$report" \
    "$@" >"$log" 2>&1 || true
}

# Query one report as structured data. Modes:
#   total        -> number of test results in the report
#   passed       -> number of results with status "passed"
#   failed       -> number of results with status "failed"
#   status TITLE -> that test's status, or ABSENT, or AMBIGUOUS
#
# AMBIGUOUS is its own answer rather than a silent first-match: two tests sharing
# a title would make a status assertion mean something other than what it reads.
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

# ---------------------------------------------------------------------------
# Preconditions. A missing target, a missing runner, or a renamed Scenario must
# fail HERE, by name — never by turning a later status assertion vacuous.
# ---------------------------------------------------------------------------
[[ -f "$TEST_FILE" ]] || fail "missing file $TEST_FILE — the file this gate runs is absent, so nothing was verified."
[[ -x "$VITEST" ]] || fail "missing runner $VITEST — run \`pnpm install\` first. Without it this gate cannot invoke anything, so nothing was verified."
[[ -f "$VITEST_CONFIG" ]] || fail "missing file $VITEST_CONFIG — the tag universe this gate's filter is validated against is absent, so run B would error rather than filter."

grep -qF -- "$FILTER_TAG" "$VITEST_CONFIG" || fail "$VITEST_CONFIG does not declare $FILTER_TAG. RESEARCH Finding 2: --tagsFilter validates its pattern against test.tags regardless of the strict-tags setting, so run B would error out instead of selecting anything."

# A title counts as declared only if some line of $TEST_FILE ENDS with
# `Scenario: <title>` — the whole Gherkin title, not a prefix of one.
#
# A plain `grep -F "$title"` is NOT sufficient, and the difference is the whole
# point of this precondition. Measured: renaming a Scenario by APPENDING to its
# title leaves the old title as a substring, so a containment grep still matches
# and the precondition passes. For three of the four titles the status assertion
# would then fail loudly anyway (ABSENT is not "passed" or "skipped") — but for
# $TITLE_EXCLUDED, ABSENT is the value assertion 4 EXPECTS. A suffix rename there
# would sail through a containment grep and make assertion 4 pass while observing
# nothing at all, which is precisely the vacuity this precondition exists to stop.
#
# Anchoring on both sides catches both directions: prepending to the title breaks
# the `Scenario: ` adjacency, appending breaks the end-of-line match.
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
# Zero is what a file that fails to COLLECT produces — the exact outcome an
# undeclared tag causes — and every assertion below would then be trivially true.
# ---------------------------------------------------------------------------
TOTAL_A="$(report_query "$REPORT_A" total)"
if [[ "$TOTAL_A" -eq 0 ]]; then
  cat "$LOG_A"
  fail "the unfiltered run reported ZERO test results — $TEST_FILE did not collect, so every assertion below would be vacuously true. The usual cause is a tag emitted that $VITEST_CONFIG does not declare, which fails the WHOLE file to 0 tests. Output above."
fi
echo "✓ run A vacuity control: $TOTAL_A test result(s) reported — the file collected"

# ---------------------------------------------------------------------------
# Assertion 2: criterion 3, observed from OUTSIDE the process. The `@only`-tagged
# Scenario PASSED, in a run that forbids only-modifiers. `@only` is a plain
# pass-through tag (D-06); had the library routed it to `it.effect.only`, this
# run would have rejected it rather than reporting this test passed.
#
# The companion "run A reported zero failures" check is deliberately DEFERRED to
# assertion 8, at the very end — see the comment there for why.
# ---------------------------------------------------------------------------
STATUS_ONLY_A="$(report_query "$REPORT_A" status "$TITLE_ONLY")"
if [[ "$STATUS_ONLY_A" != "passed" ]]; then
  cat "$LOG_A"
  fail "the @only-tagged Scenario is \"$STATUS_ONLY_A\" in the unfiltered run, expected \"passed\". Title: \"$TITLE_ONLY\"."
fi
echo "✓ run A: the @only-tagged Scenario passed under --allowOnly=false — @only is a plain tag, not a modifier"

# ---------------------------------------------------------------------------
# Assertion 3: criterion 2's reporter half. The `@skip`-tagged Scenario is
# REPORTED skipped. No in-process assertion can make this claim: a test that
# never ran and a test the reporter recorded as skipped are indistinguishable
# from inside the process — "its step bodies did not run" is equally consistent
# with the whole file never having been collected.
# ---------------------------------------------------------------------------
STATUS_SKIP_A="$(report_query "$REPORT_A" status "$TITLE_SKIP")"
if [[ "$STATUS_SKIP_A" != "skipped" ]]; then
  cat "$LOG_A"
  fail "the @skip-tagged Scenario is \"$STATUS_SKIP_A\" in the unfiltered run, expected \"skipped\". Title: \"$TITLE_SKIP\". A \"passed\" status means the skip never reached the real task — check Tags.ts's isSkipped and the skip flag Runner.ts passes to api.effect."
fi
echo "✓ run A: the @skip-tagged Scenario is REPORTED skipped — the skip reached the real task"

# ---------------------------------------------------------------------------
# Assertion 4: D-03. The `excludeTags`-removed Scenario is ABSENT from the
# results — not skipped, ABSENT. This is the assertion that distinguishes a
# REGISTRATION filter from every other mechanism: a skip, a mode narrowing and a
# CLI filter all leave a node behind. Its matched pair is assertion 7.
# ---------------------------------------------------------------------------
STATUS_EXCLUDED_A="$(report_query "$REPORT_A" status "$TITLE_EXCLUDED")"
if [[ "$STATUS_EXCLUDED_A" != "ABSENT" ]]; then
  cat "$LOG_A"
  fail "the excludeTags-removed Scenario appears in the report with status \"$STATUS_EXCLUDED_A\", expected it to be ABSENT. Title: \"$TITLE_EXCLUDED\". D-03's excludeTags is a REGISTRATION filter — the Scenario is never handed to the runner, so it must leave no node at all, not even a skipped one. A \"skipped\" status here means the filter degraded into a skip, which is the one thing it must never become."
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
# that matched NOTHING skips everything, and assertion 6 would then be asserting
# over a report in which nothing ran at all.
# ---------------------------------------------------------------------------
PASSED_B="$(report_query "$REPORT_B" passed)"
if [[ "$PASSED_B" -eq 0 ]]; then
  cat "$LOG_B"
  fail "the run filtered on $FILTER_TAG reported ZERO passed tests — the filter selected nothing, so assertion 6 would be vacuous. This is precisely what a library that emitted no tags produces: the filter has nothing to match, every test is narrowed to skip, and the process still exits 0."
fi
echo "✓ run B vacuity control: $PASSED_B test(s) passed under --tagsFilter=$FILTER_TAG — the filter selected something"

# ---------------------------------------------------------------------------
# Assertion 6: THE GATE. The `@only`-tagged Scenario PASSED under a filter on
# that exact tag. This is only possible if the library put that exact tag string
# on the REAL task object — no in-process observation can substitute for it, and
# it is the assertion mutation proof 1 turns red while `pnpm test` stays green.
# ---------------------------------------------------------------------------
STATUS_ONLY_B="$(report_query "$REPORT_B" status "$TITLE_ONLY")"
if [[ "$STATUS_ONLY_B" != "passed" ]]; then
  cat "$LOG_B"
  fail "the @only-tagged Scenario is \"$STATUS_ONLY_B\" under --tagsFilter=$FILTER_TAG, expected \"passed\". Title: \"$TITLE_ONLY\". The filter did not select it, which means the tag string $FILTER_TAG never reached the real task — check the tags Runner.ts passes to api.effect and the mapping in Tags.ts. Note that NOTHING ELSE IN THIS REPO GOES RED for this: every in-process assertion in $TEST_FILE passes with all tags dropped."
fi
echo "✓ run B: --tagsFilter=$FILTER_TAG SELECTED the @only-tagged Scenario — the tag is on the real task"

# ---------------------------------------------------------------------------
# Assertion 7: the other half of the matched pair. A Scenario the filter did NOT
# select is SKIPPED and still PRESENT. RESEARCH Finding 7: a CLI filter narrows
# to skip and never removes. Together with assertion 4 — absent versus
# present-and-skipped — this is what proves the two mechanisms are
# distinguishable in the report, and that neither is masquerading as the other.
# ---------------------------------------------------------------------------
STATUS_UNTAGGED_B="$(report_query "$REPORT_B" status "$TITLE_UNTAGGED")"
if [[ "$STATUS_UNTAGGED_B" == "ABSENT" ]]; then
  cat "$LOG_B"
  fail "a Scenario the $FILTER_TAG filter did not select is ABSENT from the filtered report, expected \"skipped\" and PRESENT. Title: \"$TITLE_UNTAGGED\". A CLI filter narrows non-matching tests to skip and never removes them (RESEARCH Finding 7); absence is what a REGISTRATION filter produces. If both mechanisms now produce absence, assertion 4 no longer distinguishes anything."
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
# a "passed" status on one test says nothing about whether the run as a whole was
# rejected, and an only-modifier under `--allowOnly=false` is rejected at
# collection, not by failing the tagged test.
#
# It is LAST on purpose, and the ordering is load-bearing. This is the one
# assertion in the file that can be tripped by something OTHER than a tag: any
# in-process regression in $TEST_FILE fails it. Placed earlier, it would preempt
# the six narrow, tag-specific assertions above and report "a test failed" when
# the real, more useful answer is "the tag never reached the task". Measured:
# with `Runner.ts` emitting an empty tag array, this check fires (09-06's D-08
# warning assertion depends on a tag being emitted at all) — but assertion 5 is
# the one worth reading, and now gets to speak first. See the summary's mutation
# proofs 1a and 1b.
# ---------------------------------------------------------------------------
FAILED_A="$(report_query "$REPORT_A" failed)"
if [[ "$FAILED_A" -ne 0 ]]; then
  cat "$LOG_A"
  fail "the unfiltered run reported $FAILED_A failed test(s) under --allowOnly=false. Every tag-specific assertion above passed, so this is an ordinary in-process failure in $TEST_FILE — read the output above, and note that \`pnpm test\` covers it too. If instead the output names an only-modifier, D-06 has been broken: @only must be emitted as a PLAIN TAG and never routed to it.effect.only."
fi
echo "✓ run A: 0 failed tests under --allowOnly=false — no only-modifier was rejected at collection"

echo ""
echo "tag filter gate: ENFORCED"

#!/usr/bin/env bash
#
# Asserts, FROM OUTSIDE THE TEST PROCESS, that a Feature declared with a `shared`
# Layer yields the SAME result run whole as it does run narrowed to one Scenario
# with the runner's own `-t` filter — roadmap Phase 10 Success Criterion 3's
# literal clause, and the one claim in this phase no in-process assertion can make.
#
# Three claims:
#   1. A shared-Layer Scenario whose body asserts the shared build count is
#      exactly 1 PASSES in a whole-file run.
#   2. It passes IDENTICALLY when the run is narrowed with `-t` to that Scenario
#      alone — so "the shared Layer was built once" does not depend on which
#      siblings happened to run alongside it.
#   3. The clock-isolation Scenario reports the SAME status in both runs.
#
# METHOD NOTE (do not weaken this):
#   Be precise about what `pnpm test` already proves here, because it is a lot.
#   Plans 10-03 and 10-04 assert build counts and clock readings from INSIDE the
#   process, as the first statement of a step body, so each claim surfaces as a
#   test node's pass/fail status. Those assertions are not decorative and they do
#   go red for the obvious mutations: 10-03's mutation (i) turns 7 tests red,
#   10-04's mutation v turns 5 red on `expected 3600000 to equal +0`. Anyone
#   reading this header as "the suite cannot see shared Layer builds" is reading
#   it wrong.
#
#   The one thing an in-process test structurally CANNOT do is compare its own
#   whole-run status against a `-t`-filtered run's status, because a test cannot
#   re-invoke the CLI. ADR-EC-018 names exactly that divergence as the symptom of
#   the defect it exists to prevent:
#
#     "a suite that passes run as a whole can fail under `-t` filtering (which
#      changes which Scenario runs 'first' against the shared clock), or vice
#      versa."
#
#   Both directions of that sentence are invisible from inside a single run. Under
#   a memoized `TestEnv`, `the second shared clock scenario still starts at time
#   zero` FAILS in a whole-file run (the first Scenario advanced the clock an hour)
#   and PASSES in a `-t` run that selects it alone. A gate that only asserted
#   "passed under `-t`" would be satisfied by precisely that defect; a gate that
#   only asserted equality would be satisfied by two failing runs. Assertion B2
#   asserts BOTH halves for that reason, and neither half is redundant.
#
#   WHAT THIS GATE ADDS OVER `pnpm test`, MEASURED. Three mutations, each applied
#   to `describeFeature.ts`, run against BOTH `pnpm test` and this gate, then
#   reverted (10-05-SUMMARY.md has the full output):
#
#     m1  drop `excludeTestServices: true`     pnpm test RED (2)   gate RED at A5
#     m2  hoist the per-emission provide       pnpm test RED (5)   gate RED at A3
#     m3  shared branch via `vitestTestApi`    pnpm test RED (15)  gate RED at A2
#
#   NO mutation among the three turns this gate red while `pnpm test` stays green,
#   and that is stated plainly rather than papered over. This gate is NOT
#   justified by an asymmetry it does not have. `verify-tags-filter.sh` can cite
#   its sharp mutation 1c over its blunt 1a because 1c demonstrates a real one;
#   the honest analog here is to report that no such mutation was found. If you
#   are re-verifying and you find one, cite it here and delete this paragraph.
#
#   What the gate contributes instead, and it is not nothing: it is the ONLY thing
#   in the repo that asserts roadmap SC#3's whole-versus-filtered EQUIVALENCE — a
#   claim `pnpm test` never makes in either direction — and the only place the
#   `-t` half is exercised at all. That the claim is worth asserting was itself
#   measured, under m2: the clock Scenario FAILED in the whole-file run and PASSED
#   under `-t` narrowed to it alone, with the filtered process exiting 0. So a
#   developer debugging that failure by narrowing to the Scenario gets a green run
#   and concludes the suite is flaky. ADR-EC-018's sentence is not hypothetical
#   here; it is reproducible in this repo in one edit, and B2's equality half is
#   what names it as a defect rather than as flake.
#
#   Two things the measurement also settles about the assertion ORDER:
#     - m1 leaks the CONSOLE and not the clock (10-04's mutation iv finding), so
#       every shared-Layer-specific assertion here — A2, A3, A4, B2, C2 — passes
#       under it and only A5, the generic failed-count catch-all, fires. That is
#       A5 earning its place, and its message correctly sends the reader to
#       `pnpm test` rather than claiming a filtering defect.
#     - m2 and m3 fire at A3 and A2 respectively, each with a message naming the
#       right half of the mechanism. The narrow assertions get to speak before
#       A5's blunt one, which is exactly why A5 is last.
#
#   Every title this gate depends on is asserted to exist in the test file,
#   spelled EXACTLY, before any run happens. `title_is_declared` matches a line
#   that ENDS with `Scenario: <title>`; a containment `grep -F` is NOT sufficient,
#   and `verify-tags-filter.sh`'s own comment records the measurement — renaming a
#   Scenario by APPENDING to its title leaves the old title as a substring, so a
#   containment grep still matches and the precondition passes while the run
#   observes nothing. A rename must fail this gate BY NAME, before any status
#   assertion can go vacuous. STATE.md's 01-02 entry records a grep-based gate in
#   this repo that passed and was then proven vacuous by mutation testing; that is
#   why the precondition exists and why it is exact.
#
#   Each run additionally carries its own vacuity control. A file that fails to
#   COLLECT produces zero results, against which every status assertion is
#   trivially true, and a `-t` pattern that matches nothing narrows every test to
#   skip while the process still exits 0.
#
#   The report is parsed as STRUCTURED DATA with `node -e`, never by grepping the
#   reporter's terminal output for glyphs. Glyph output varies with TTY detection,
#   colour support and reporter choice; a gate keyed to it breaks silently in CI
#   or, worse, matches nothing and passes. There is deliberately no glyph matching
#   anywhere in this file.
#
# Usage: bash scripts/verify-shared-layer-once.sh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# Spelled out in full rather than composed, so these paths stay greppable.
TEST_FILE="packages/vitest/test/emission.test.ts"

# Use the repo-local runner, never a global `vitest`.
VITEST="node_modules/.bin/vitest"

# ---------------------------------------------------------------------------
# The four Scenario titles this gate depends on, each carrying one criterion.
# They are emitted by real `describeFeature` calls in $TEST_FILE (plans 10-03 and
# 10-04), are marked FIXED in a comment at each fixture naming this script as the
# reason, and are copied from those plans' summaries rather than re-derived.
#
# Every one is plain prose with no regex metacharacter, which is why they were
# written that way: vitest's `-t` / `--testNamePattern` is a REGEX matched against
# the full ancestor path, so a title containing `(`, `.` or `*` would filter to
# something other than what it reads as.
# ---------------------------------------------------------------------------

# Carries claims 1 and 2 (roadmap SC #2, RUN-03). Its step body asserts the
# module-scope shared build counter is exactly 1 as its FIRST statement, so the
# build-once claim IS this node's pass/fail status — a JSON reporter has a field
# for a test's status and none for a counter. Run C narrows to it alone.
TITLE_SHARED_BUILD="the second shared scenario observes the same shared build"

# The Scenario that ADVANCES the simulated clock by one hour (RUN-04, BEH-EC-012's
# second clause). It is what makes run A's ordering load-bearing and run B's
# comparison meaningful: without a Scenario that mutates the shared clock, every
# later reading of 0 would be trivially 0.
TITLE_CLOCK_FIRST="the first shared clock scenario advances the test clock by one hour"

# THE GATE's subject (ADR-EC-018, roadmap SC #3). Its body asserts the simulated
# clock reads 0. Under a memoized `TestEnv` it FAILS whole and PASSES filtered —
# the exact divergence the ADR names — so its status is compared across runs A
# and B rather than merely asserted in one.
TITLE_CLOCK_SECOND="the second shared clock scenario still starts at time zero"

# Carries 10-CONTEXT.md's D-03 (a Rule's own `extraLayer` under a `shared`
# Feature). Its body asserts the Feature's shared catalog build counter is 1 while
# the Rule's own tier has rebuilt, so a fix that memoised BOTH tiers, or neither,
# is visible from outside the process here.
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

# One invocation, scoped to $TEST_FILE alone — this gate never runs the whole
# suite. `--allowOnly=false` is passed EXPLICITLY rather than left to the config
# for `verify-tags-filter.sh`'s stated reason: every claim below should be true of
# THIS invocation regardless of what `vitest.config.ts` happens to say.
#
# The exit code is deliberately swallowed. Every claim here is about the
# STRUCTURED RESULTS, and a run with a failing test still writes a report worth
# asserting over — indeed assertion B2's whole job is to read a status that may be
# "failed" and say so precisely. Conflating "the process exited non-zero" with
# "the assertion failed" would report the wrong thing. The log is kept and printed
# on failure.
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

# A title counts as declared only if some line of $TEST_FILE ENDS with
# `Scenario: <title>` — the whole Gherkin title, not a prefix of one.
#
# A plain `grep -F "$title"` is NOT sufficient. Renaming a Scenario by APPENDING
# to its title leaves the old title as a substring, so a containment grep still
# matches and the precondition passes — measured for THIS file, not inherited as
# a rule: with the fixture's Scenario renamed to `... still starts at time zero on
# a fresh clock`, `grep -cF "Scenario: <old title>"` still returns 1.
#
# What that buys here was ALSO measured, and it is not what the plan predicted.
# With the precondition weakened to that containment grep and the fixture renamed,
# the gate does NOT go vacuous: it fails at A3, because A3 expects "passed" and a
# renamed Scenario reports ABSENT. What it loses is the DIAGNOSIS. A3's failure
# message points the reader at ADR-EC-018's memoized-`TestEnv` defect — the wrong
# defect entirely — when the actual cause is a rename in the fixture. The exact
# precondition is therefore worth keeping for a reason one step off from the usual
# one: it converts a confidently misleading failure into a correct one.
#
# There IS a real vacuity underneath, and A3 only shields it incidentally. B2's
# equality half compares two statuses, and a renamed title makes BOTH runs report
# ABSENT — ABSENT equals ABSENT, so that half would hold while observing nothing.
# It is B2's SECOND half (`is it "passed"`) that would catch it. Do not read A3 as
# the guard for this; A3 is a claim about the whole run and would stop shielding
# B2 the moment it were narrowed or reordered.
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

# ---------------------------------------------------------------------------
# A1: VACUITY CONTROL for run A. A non-zero number of results. Zero is what a file
# that fails to COLLECT produces, against which every assertion below would be
# trivially true.
# ---------------------------------------------------------------------------
TOTAL_A="$(report_query "$REPORT_A" total)"
if [[ "$TOTAL_A" -eq 0 ]]; then
  cat "$LOG_A"
  fail "the unfiltered run reported ZERO test results — $TEST_FILE did not collect, so every assertion below would be vacuously true. Output above."
fi
echo "✓ A1 run A vacuity control: $TOTAL_A test result(s) reported — the file collected"

# ---------------------------------------------------------------------------
# A2: claim 1. The shared-build Scenario PASSED in the whole-file run. Its body
# asserts the shared build counter is exactly 1, so a shared Layer rebuilt per
# Scenario reports this node as "failed" rather than as a number nobody outside
# the process can read.
# ---------------------------------------------------------------------------
STATUS_SHARED_A="$(report_query "$REPORT_A" status "$TITLE_SHARED_BUILD")"
if [[ "$STATUS_SHARED_A" != "passed" ]]; then
  cat "$LOG_A"
  fail "the shared-build Scenario is \"$STATUS_SHARED_A\" in the whole-file run, expected \"passed\". Title: \"$TITLE_SHARED_BUILD\". Its body asserts the shared build counter is exactly 1; a \"failed\" status means the shared Layer was rebuilt per Scenario — check that describeFeature.ts's shared branch still emits through sharedLayerTestApi and that splitLayerArgument still keeps the two tiers apart."
fi
echo "✓ A2 run A: the shared-build Scenario passed — the shared Layer built exactly once for the whole Feature"

# ---------------------------------------------------------------------------
# A3: claim 3, first half. The clock-isolation Scenario's status in the WHOLE run.
# Recorded in a variable, because assertion B2 compares it — this is the reading
# that a filtered run is not allowed to disagree with.
# ---------------------------------------------------------------------------
STATUS_CLOCK_A="$(report_query "$REPORT_A" status "$TITLE_CLOCK_SECOND")"
if [[ "$STATUS_CLOCK_A" != "passed" ]]; then
  cat "$LOG_A"
  fail "the clock-isolation Scenario is \"$STATUS_CLOCK_A\" in the whole-file run, expected \"passed\". Title: \"$TITLE_CLOCK_SECOND\". Its body asserts the simulated clock reads 0, and \"$TITLE_CLOCK_FIRST\" ran before it and advanced that clock by an hour. A \"failed\" status here is ADR-EC-018's leak reproduced: the shared Layer is carrying ONE memoized TestEnv for the whole Feature. Both halves of the fix matter and they guard different services — \`excludeTestServices: true\` at the layer(...) call site, and the per-emission \`Effect.provide(testEnv)\` in sharedLayerTestApi."
fi
echo "✓ A3 run A: the clock-isolation Scenario passed after a preceding Scenario advanced the clock — status recorded for the filtered comparison"

# ---------------------------------------------------------------------------
# A4: D-03. The Rule-under-`shared` Scenario PASSED. Its body asserts the
# Feature's shared build counter is 1 while the Rule's own tier has rebuilt, so
# this node separates the fix from the over-fix that memoises both tiers.
# ---------------------------------------------------------------------------
STATUS_RULE_A="$(report_query "$REPORT_A" status "$TITLE_RULE_SECOND")"
if [[ "$STATUS_RULE_A" != "passed" ]]; then
  cat "$LOG_A"
  fail "the Rule-under-shared Scenario is \"$STATUS_RULE_A\" in the whole-file run, expected \"passed\". Title: \"$TITLE_RULE_SECOND\". It asserts the Feature's shared Layer stayed at ONE build while the Rule's own extraLayer rebuilt for this Scenario — 10-CONTEXT.md's D-03, the combination neither ADR-EC-006's nor ADR-EC-010's own tests exercise."
fi
echo "✓ A4 run A: the Rule-under-shared Scenario passed — a Rule's own tier rebuilds while the Feature's shared tier does not"

# ---------------------------------------------------------------------------
# RUN B — the same file, narrowed by the runner's own `-t` filter to the
# clock-isolation Scenario ALONE. This is the invocation the whole script exists
# for, and the one no in-process assertion can perform: a test cannot re-invoke
# the CLI with a narrower selection and compare its own status across the two.
# ---------------------------------------------------------------------------
run_vitest "$REPORT_B" "$LOG_B" -t "$TITLE_CLOCK_SECOND"
[[ -f "$REPORT_B" ]] || {
  cat "$LOG_B"
  fail "the -t filtered run wrote no report to $REPORT_B — the runner did not get far enough to report anything (output above)."
}

# ---------------------------------------------------------------------------
# B1: VACUITY CONTROL for run B. At least one test PASSED. A `-t` pattern matching
# NOTHING narrows every test to skip and still exits 0, and B2 would then be
# comparing a status against a report in which nothing ran.
# ---------------------------------------------------------------------------
PASSED_B="$(report_query "$REPORT_B" passed)"
if [[ "$PASSED_B" -eq 0 ]]; then
  cat "$LOG_B"
  fail "the run narrowed with -t reported ZERO passed tests — the filter selected nothing, so assertion B2 would be vacuous. The pattern is matched as a REGEX against the full ancestor path; check that \"$TITLE_CLOCK_SECOND\" is still the reported title and still free of regex metacharacters."
fi
echo "✓ B1 run B vacuity control: $PASSED_B test(s) passed under -t — the filter selected something"

# ---------------------------------------------------------------------------
# B2: THE GATE. The clock-isolation Scenario's status under `-t` EQUALS its status
# in the whole run, AND is "passed".
#
# Both halves are required and neither is redundant. Equality alone is satisfied
# by two FAILING runs — a Feature broken identically in both directions still
# "yields identical results". "passed" alone is satisfied by the exact divergence
# ADR-EC-018 names, where the Scenario fails whole (a sibling advanced the shared
# clock first) and passes filtered (no sibling ran). Only the conjunction is
# roadmap SC #3's clause.
# ---------------------------------------------------------------------------
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

# ---------------------------------------------------------------------------
# RUN C — the same file, narrowed to the shared-BUILD Scenario alone. Claim 2:
# the build-once property does not depend on which siblings happen to run.
# ---------------------------------------------------------------------------
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

# ---------------------------------------------------------------------------
# C2: claim 2. The shared Layer is built exactly once even when its Scenario is
# the ONLY selected test in the file. In run A two sibling Scenarios in the same
# Feature ran before it; here none did, and the in-body `sharedBuilds === 1`
# assertion must still hold. A build count that depended on how many siblings the
# filter left behind would be a count of executions, not of builds.
# ---------------------------------------------------------------------------
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

# ---------------------------------------------------------------------------
# A5: run A reported no FAILED test. LAST on purpose, and the ordering is
# load-bearing for `verify-tags-filter.sh`'s stated reason: this is the one
# assertion in the file that any unrelated in-process regression in $TEST_FILE can
# trip. Placed earlier it would preempt the narrow, shared-Layer-specific
# assertions above and report "a test failed" when the more useful answer is "the
# shared Layer's status changed under filtering".
# ---------------------------------------------------------------------------
FAILED_A="$(report_query "$REPORT_A" failed)"
if [[ "$FAILED_A" -ne 0 ]]; then
  cat "$LOG_A"
  fail "the unfiltered run reported $FAILED_A failed test(s). Every shared-Layer-specific assertion above passed, so this is an ordinary in-process failure in $TEST_FILE — read the output above, and note that \`pnpm test\` covers it too."
fi
echo "✓ A5 run A: 0 failed tests — no unrelated in-process regression in $TEST_FILE"

echo ""
echo "shared-Layer whole-vs-filtered gate: ENFORCED"

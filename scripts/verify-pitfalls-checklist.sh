#!/usr/bin/env bash
#
# Executes the ten CLI-only items of spec/process/looks-done-but-isnt-checklist.md
# — P-08, P-09, P-13, P-15, P-16, P-17, P-18, P-21, P-22, P-24 — and then
# CROSS-CHECKS that all twenty-four items still have an executor that carries
# them.
#
# Every assertion echoes its own `P-NN` id, so this script's output IS the
# evidence that an item ran. That is not cosmetic: the cross-check at the bottom
# reads those echo lines back out of this file.
#
# METHOD NOTE (do not weaken this):
#   A green `pnpm test` proves nothing about any of the ten items above, and the
#   reasons differ per item rather than sharing one:
#
#     - a PACKED tarball's manifest (P-15, P-16) does not exist during a test
#       run. packages/vitest/package.json reads `catalog:peer` whether the
#       catalog behind it holds a range or an exact pin — the source manifest is
#       byte-identical either way, and STATE.md's Phase 01-04 entry records that
#       a source-manifest assertion reads the same in the passing and the
#       failing case. Only `pnpm pack` expands it.
#     - a README's install line (P-17) is not code and nothing compiles it.
#     - a compile gate's behaviour when a directive becomes UNUSED (P-08) is the
#       ABSENCE of a diagnostic, which no test can observe from inside a process
#       that already compiled.
#     - a SHUFFLED run (P-21) and a TAG-FILTERED run (P-22) are properties of an
#       invocation. A test cannot re-invoke the CLI with a different sequencing
#       or a different selection and compare.
#     - what a reader sees in the failure panel (P-24) requires a run that
#       FAILED, which a suite that must stay green cannot contain.
#
#   AND THE COMPLETENESS CLAIM. Roadmap success criterion 4 says the checklist
#   "runs in full and passes". Without the cross-check that is a reader's
#   assertion, and it decays in two directions that both leave every gate green:
#   a test can lose its `P-NN` id while keeping its assertions, and a row's
#   **Executed by** can be pointed at an artifact that does not carry it. Both
#   are measured below as mutations D and E.
#
#   THE CROSS-CHECK ANCHORS ON THE EXECUTING FORM, NEVER ON THE BARE ID, and
#   that is the single most load-bearing decision in this file. Plan 11-07
#   stripped `P-04` out of a test title and measured that a whole-file
#   `grep -c 'P-04'` STILL returned 2, satisfied by the header prose documenting
#   the id; re-measured while writing this file, after that header grew, it
#   returns TEN — and NINE with the title's id stripped. So the obvious
#   cross-check would have been green against
#   exactly the loss it exists to catch, and increasingly green over time. This
#   is the fifth time this repository has hit the count-your-own-prose shape
#   (STATE.md 03-04, 10-01, 10-02, plan 11-06's check 4, plan 11-07's mutation
#   A′). The anchored forms are:
#
#     - a gate script -> `echo`, a quote, the check glyph, the id, a space, an
#       em dash and a space, at the START of a line: an assertion's own success
#       line, which only an executing assertion emits.
#     - the in-process test file -> the id preceded by a string literal's
#       opening quote OR by a Gherkin `Scenario: ` (P-12's two nodes are
#       Scenario titles inside an inline Feature source), AND followed by an
#       ASCII LETTER.
#
#   THE TRAILING LETTER IS LOAD-BEARING AND WAS ALSO MEASURED. The tighter
#   `"P-04 — ` still returns 2 in that file today, because its header quotes
#   that very anchor while explaining this hazard. Prose about a title is
#   followed by punctuation — an apostrophe there, an ellipsis in the two `P-12`
#   quotations — and a real title is followed by a word.
#
#   Both forms are things an EXECUTING artifact emits; neither is satisfiable by
#   describing an item in a comment. This file's own METHOD NOTE names all ten
#   of its ids in prose above and satisfies the anchor for none of them.
#
#   DELIBERATE DUPLICATION (PROH-11-04, 11-CONTEXT.md D-03). Several assertions
#   here restate something another gate already checks — P-16 overlaps
#   scripts/verify-pack.sh, P-13 and P-22 overlap scripts/verify-tags-filter.sh,
#   P-08 and P-09 overlap scripts/verify-tsgo-gate.sh. That is the point. A
#   checklist whose items are marked covered by pointing at other people's tests
#   is a citation list: you cannot run it, and an item whose cited test was
#   narrowed reads exactly like an item whose cited test still covers it. Do not
#   "de-duplicate" any assertion in this file into a call to another script.
#
#   Every run is read from the runner's JSON report through `node -e`, never by
#   grepping reporter glyphs. There is deliberately no glyph matching in this
#   file. Every run also carries its own non-zero vacuity control, because a
#   file that fails to COLLECT produces zero results, against which every status
#   assertion is trivially true.
#
#   NOTHING HERE MUTATES A COMMITTED FILE. Three items need a fixture that does
#   not exist in the repository — an `@only`-tagged acceptance Scenario (P-13),
#   a three-row Outline (P-21), and a step that FAILS (P-24). Each is written
#   into a temporary pair inside the acceptance directory and removed by a trap
#   installed before the first write. `git status --porcelain` is empty on the
#   success path and on every failure path.
#
#   AND `git status` IS NO LONGER THE EVIDENCE FOR THAT, so do not read it as
#   such. All six paths are now in `.gitignore` — the trap covers EXIT, INT and
#   TERM but not SIGKILL, an OOM kill or a CI timeout, and one of the files it
#   writes is a test that FAILS ON PURPOSE that vitest's default include glob
#   collects. Being ignored, they are now absent from `git status` whether the
#   trap fired or not. The live detector is the `[[ -e "$tracked" ]]`
#   precondition below, which fails the NEXT run by name if a hard kill left one
#   behind; the `git ls-files --error-unmatch` precondition beside it is what
#   keeps the ignore entries from becoming permission to commit one.
#
# MUTATION RECORD (performed, observed, reverted — plan 11-08 Task 3):
#
#   D. The `P-04` id was stripped from its test title in
#      packages/vitest/test/acceptance/pitfalls-checklist.test.ts, assertions
#      untouched. `pnpm test` STAYED GREEN at the identical counts — 39 files,
#      816 passed, 4 skipped — and `pnpm verify:pitfalls` went RED naming the id:
#        "P-04 is in the checklist, but its executor does not CARRY it".
#      Nine bare occurrences of the string P-04 remained in that file after the
#      strip, so a bare-id grep would have counted nine and stayed green. This
#      is the exact mutation plan 11-07 recorded as uncatchable at the time it
#      measured it. It is caught now.
#
#   E. P-09's **Executed by** cell was repointed from this script to
#      scripts/verify-watch-rerun.sh, which does not carry that id. Nothing else
#      was touched — a row that lies about who runs it is a ONE-CELL edit — and
#      the cross-check went RED naming P-09 and the artifact it had been pointed
#      at.
#
#   F. The leading pipe was removed from four rows, so the parse yielded 20 rows.
#      The ROW-COUNT CONTROL fired FIRST, naming both numbers and naming the
#      constant. Then, measured rather than assumed: with the control's early
#      return disabled and the same breakage in place, the CONTIGUITY check
#      caught it anyway, printing four "P-0N is missing from the table" lines.
#
#      So the honest reading is narrower than "without this control the checks
#      pass vacuously" — for a SHRINKING parse they do not, because the
#      contiguity loop runs P-01 upwards independently of what parsed. What the
#      control adds is (i) one message naming both numbers instead of N messages
#      that read as though the document lost N rows, and (ii) the one case the
#      contiguity loop structurally cannot see: a parse that yields MORE rows
#      than expected. That loop iterates 1..EXPECTED_CHECKLIST_ROWS, so a 25th
#      item is outside it. Keep the control; the reason is the growth direction,
#      not the shrink one.
#
#   G. THE MOST USEFUL ENTRY HERE. P-22's two unselected-Scenario checks were
#      disabled, leaving the blunt form — "the filtered run reported at least
#      one pass, and the tagged Scenario passed" — and the `--tagsFilter` flag
#      was then removed from the invocation ENTIRELY. The gate STAYED GREEN,
#      exit 0, and went on printing
#        "P-22 — --tagsFilter=@slow selected exactly the tagged Scenario".
#      A run with NO FILTER AT ALL satisfies the blunt form, because every
#      Scenario passing includes the tagged one passing. The blunt form is
#      therefore not a weaker assertion about filtering; it is not an assertion
#      about filtering. Only "an unselected Scenario is PRESENT and SKIPPED"
#      makes the item about a filter. Do not simplify it back.
#
# Usage: bash scripts/verify-pitfalls-checklist.sh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# Spelled out in full rather than composed, so these paths stay greppable.
CHECKLIST_DOC="spec/process/looks-done-but-isnt-checklist.md"
RC_BUMP_DOC="spec/process/rc-bump-checklist.md"
INPROCESS_EXECUTOR="packages/vitest/test/acceptance/pitfalls-checklist.test.ts"
ROOT_README="README.md"
VITEST_README="packages/vitest/README.md"
GHERKIN_README="packages/gherkin/README.md"
ACCOUNTS_STEPS="packages/vitest/test/acceptance/worked-example-02-accounts.steps.test.ts"
STEP_EXPECT_ERROR_FIXTURE="packages/vitest/test/tsgo-gate/src/step-expect-error.ts"
STEP_EXPECT_ERROR_CONFIG="packages/vitest/test/tsgo-gate/tsconfig.step-expect-error.json"
STEP_OK_FIXTURE="packages/vitest/test/tsgo-gate/src/step-satisfied.ts"
STEP_OK_CONFIG="packages/vitest/test/tsgo-gate/tsconfig.step-ok.json"

# Temporary artifacts, all inside the repository so the runner's DEFAULT include
# glob and the type-checker's own project reach them (vitest.config.ts note (c)
# forbids touching that glob, and nothing here does). All are removed by the trap.
PROBE_FEATURE="packages/vitest/test/acceptance/pitfalls-gate-probe.feature"
PROBE_STEPS="packages/vitest/test/acceptance/pitfalls-gate-probe.gate.test.ts"
FAILING_FEATURE="packages/vitest/test/acceptance/pitfalls-gate-failing.feature"
FAILING_STEPS="packages/vitest/test/acceptance/pitfalls-gate-failing.gate.test.ts"
P08_PROBE_FIXTURE="packages/vitest/test/tsgo-gate/src/pitfalls-gate-p08-probe.ts"
P08_PROBE_CONFIG="packages/vitest/test/tsgo-gate/tsconfig.pitfalls-gate-p08-probe.json"

# Use the repo-local runner and the repo-local, effect-tsgo-patched compiler,
# never a global `vitest` or `tsc`.
VITEST="node_modules/.bin/vitest"
TSC="node node_modules/typescript/bin/tsc"

# The number of rows the checklist table must yield. WRITTEN EXACTLY ONCE in
# this file, and it is ASSUMPTION-11-B's whole mitigation: without it, a table
# whose format changed parses to a SMALLER set — or to none at all — and every
# per-id assertion below passes over whatever survived. Mutation F is the
# measurement. Adding or withdrawing an item means changing this number in the
# same commit as the row, which is the point.
EXPECTED_CHECKLIST_ROWS=24

# The two titles P-22's tag filter is asserted against, spelled exactly as the
# Gherkin declares them. `@slow` is carried by exactly ONE Scenario in the
# acceptance suite; the untagged one is the other half of the claim.
TITLE_SLOW="Every tag on this Scenario reaches the runner"
TITLE_NOT_SLOW="Creating a user"

# The tag P-22 filters on. It must be declared in vitest.config.ts: RESEARCH
# Finding 2 verified that `--tagsFilter` validates its pattern against
# `test.tags` regardless of the strict-tags setting, so an undeclared pattern
# errors rather than matching nothing.
FILTER_TAG="@slow"

# The banner goes to STDERR, and that is load-bearing rather than stylistic.
# `fail` is reachable from inside a command substitution (packed_manifest used to
# be called that way), and a `$( )` captures STDOUT — so a stdout banner is
# swallowed into a variable nobody prints while the `exit 1` kills only the
# subshell, leaving errexit to end the run with an EMPTY log. stderr is not
# captured by `$( )`, so the diagnostic survives regardless of the call shape.
fail() {
  {
    echo ""
    echo "✗ pitfalls checklist: NOT ENFORCED"
    echo ""
    echo "  $1"
    echo ""
  } >&2
  exit 1
}

# ---------------------------------------------------------------------------
# The cleanup contract, installed BEFORE the first byte is written anywhere.
# PROH-11-05: a gate script must never leave the working tree dirty, and a trap
# registered after the first write cannot clean up a failure during it.
# ---------------------------------------------------------------------------
TMP_DIR=""

cleanup() {
  rm -f "$PROBE_FEATURE" "$PROBE_STEPS" "$FAILING_FEATURE" "$FAILING_STEPS" \
    "$P08_PROBE_FIXTURE" "$P08_PROBE_CONFIG"
  if [[ -n "$TMP_DIR" ]]; then
    rm -rf "$TMP_DIR"
  fi
}
trap cleanup EXIT INT TERM

TMP_DIR="$(mktemp -d)"

# ---------------------------------------------------------------------------
# Shared helpers.
# ---------------------------------------------------------------------------

# Query one JSON report as structured data. Modes:
#   total        -> number of test results in the report
#   passed       -> number of results with status "passed"
#   failed       -> number of results with status "failed"
#   titles       -> every result title, one per line
#   status TITLE -> that test's status, or ABSENT, or AMBIGUOUS
#   messages     -> every failureMessage in the report, concatenated
#
# AMBIGUOUS is its own answer rather than a silent first-match: two tests sharing
# a title would make a status assertion mean something other than what it reads.
#
# AN UNREADABLE REPORT IS A NAMED FAILURE, NOT A NODE STACK TRACE. Without the
# guard below, an absent, truncated or malformed report made `JSON.parse` throw;
# under `set -e` the enclosing `P13_TOTAL="$(report_query …)"` then killed the
# script with a raw stack trace, NO `✗ pitfalls checklist: NOT ENFORCED` banner,
# no `cat "$LOG"`, and nothing saying which item was running. That is the same
# silent-exit shape as the `packed_manifest` bug fixed above, and
# scripts/verify-watch-rerun.sh has carried the mitigation for its own copy of
# this helper all along — the sibling was the one that had to survive a WATCHING
# runner rewriting the file mid-poll, so it learned this first.
#
# THE CHECK LIVES IN THE BASH WRAPPER, NOT AT THE TWELVE CALL SITES. A sentinel
# every caller must remember to test is a sentinel a thirteenth caller forgets;
# `fail` here covers all of them and cannot be omitted by a future one. `fail`
# writes to STDERR, so the banner survives being called from inside `$( )` —
# which is exactly how all twelve call sites invoke this.
#
# The one shape that stays lossy is process substitution (`done < <(report_query
# …)`), where errexit does not propagate to the parent: the banner still prints,
# but the loop simply iterates nothing. Reading the banner is the recovery.
REPORT_UNREADABLE_SENTINEL="__REPORT_UNREADABLE__"

report_query() {
  local report="$1" mode="$2" title="${3-}" answer
  answer="$(
    REPORT="$report" QUERY_MODE="$mode" QUERY_TITLE="$title" \
      SENTINEL="$REPORT_UNREADABLE_SENTINEL" node -e '
      const fs = require("node:fs")
      let report
      try {
        report = JSON.parse(fs.readFileSync(process.env.REPORT, "utf8"))
      } catch {
        console.log(process.env.SENTINEL)
        process.exit(0)
      }
      const results = (report.testResults || []).flatMap((file) => file.assertionResults || [])
      const mode = process.env.QUERY_MODE

      if (mode === "total") {
        console.log(String(results.length))
      } else if (mode === "passed" || mode === "failed") {
        console.log(String(results.filter((result) => result.status === mode).length))
      } else if (mode === "titles") {
        for (const result of results) console.log(result.title)
      } else if (mode === "messages") {
        for (const result of results) for (const message of result.failureMessages || []) console.log(message)
      } else if (mode === "status") {
        const matches = results.filter((result) => result.title === process.env.QUERY_TITLE)
        if (matches.length === 0) console.log("ABSENT")
        else if (matches.length > 1) console.log("AMBIGUOUS")
        else console.log(matches[0].status)
      } else {
        throw new Error("unknown query mode: " + mode)
      }
    '
  )"

  if [[ "$answer" == "$REPORT_UNREADABLE_SENTINEL" ]]; then
    fail "the JSON report $report is absent or unparseable, queried with mode \"$mode\". Nothing was asserted about that run. The runner writes this file with --outputFile; an absent one usually means the vitest invocation died before reporting (check the .log beside it in \$TMP_DIR), and a truncated one means it was read while still being written."
  fi

  printf '%s\n' "$answer"
}

# One scoped invocation of the repo-local runner. The exit code is deliberately
# swallowed: every claim here is about the STRUCTURED RESULTS, and a run
# containing a failing test still writes a report worth asserting over. The log
# is kept and printed on failure.
run_vitest() {
  local target="$1" report="$2" log="$3"
  shift 3
  "$VITEST" run "$target" \
    --reporter=json \
    --outputFile="$report" \
    "$@" >"$log" 2>&1 || true
}

# Pack one workspace package and set PACKED_MANIFEST to the path of the UNPACKED
# manifest. The packing itself is not re-implemented here — this is `pnpm pack`,
# the same command scripts/verify-pack.sh drives, and the assertions below are
# this file's own.
#
# THE RESULT IS RETURNED VIA A GLOBAL, NOT VIA STDOUT, AND THAT IS DELIBERATE.
# This function contains three `fail` calls. Called as
# `M="$(packed_manifest …)"` the `exit 1` inside `fail` terminates only the
# SUBSHELL, so the top-level script dies by errexit on the assignment instead —
# and every `fail` diagnostic that had gone to stdout was captured into `M` and
# discarded, producing exit 1 with no output at all. Writing to a global keeps
# the `exit 1` in the top-level shell where it prints and stops the run; `fail`
# writing to stderr is the belt to this braces.
PACKED_MANIFEST=""
packed_manifest() {
  local name="$1" slug="$2"
  local dest="$TMP_DIR/pack-$slug"
  mkdir -p "$dest"
  pnpm --filter "$name" pack --pack-destination "$dest" >"$dest/pack.log" 2>&1 ||
    fail "pnpm pack failed for $name (log at $dest/pack.log). A broken catalog: reference surfaces here and nowhere else — pnpm install exits 0 on an invalid named-catalog entry behind a peerDependency."
  local tgz
  tgz="$(find "$dest" -maxdepth 1 -name "*.tgz" -print -quit)"
  [[ -n "$tgz" ]] || fail "pnpm pack produced no tarball for $name in $dest."
  tar -xzf "$tgz" -C "$dest"
  [[ -f "$dest/package/package.json" ]] || fail "the $name tarball contains no package/package.json."
  PACKED_MANIFEST="$dest/package/package.json"
}

# A title counts as declared only if some line of the file ENDS with
# `Scenario: <title>` — the whole Gherkin title, not a prefix of one. A plain
# containment grep is NOT sufficient: renaming a Scenario by APPENDING leaves
# the old title as a substring, and for an assertion that expects ABSENCE or
# SKIPPED that would sail through while observing nothing. This is
# scripts/verify-tags-filter.sh's `title_is_declared`, which that file's own
# comment records as mutation-proven.
title_is_declared() {
  local file="$1" title="$2" line
  while IFS= read -r line; do
    line="${line%$'\r'}"
    while [[ "$line" == *[[:space:]] ]]; do line="${line%?}"; done
    [[ "$line" == *"Scenario: $title" ]] && return 0
  done < <(grep -F -- "Scenario: $title" "$file" || true)
  return 1
}

# ---------------------------------------------------------------------------
# Preconditions. A missing target must fail HERE, by name, never by turning a
# later assertion vacuous.
# ---------------------------------------------------------------------------
[[ -x "$VITEST" ]] || fail "missing runner $VITEST — run \`pnpm install\` first. Without it this gate cannot invoke anything, so nothing was verified."
for f in "$CHECKLIST_DOC" "$INPROCESS_EXECUTOR" "$ROOT_README" "$VITEST_README" "$GHERKIN_README" \
  "$ACCOUNTS_STEPS" "$STEP_EXPECT_ERROR_FIXTURE" "$STEP_EXPECT_ERROR_CONFIG" "$STEP_OK_FIXTURE" \
  "$STEP_OK_CONFIG"; do
  [[ -f "$f" ]] || fail "missing file $f — an artifact this gate asserts over is absent, so nothing was verified."
done

for tracked in "$PROBE_FEATURE" "$PROBE_STEPS" "$FAILING_FEATURE" "$FAILING_STEPS" \
  "$P08_PROBE_FIXTURE" "$P08_PROBE_CONFIG"; do
  if git ls-files --error-unmatch "$tracked" >/dev/null 2>&1; then
    fail "$tracked is TRACKED BY GIT. This gate writes and then deletes that path, so running it would delete a committed file. Rename the constant at the top of this script; do not delete the committed file to make the gate run."
  fi
  [[ -e "$tracked" ]] && fail "$tracked already exists on disk. A previous run did not clean up, or something else owns that path. Remove it and re-run; if it keeps reappearing, the trap in this script is not firing."
done

grep -qF -- "$FILTER_TAG" vitest.config.ts ||
  fail "vitest.config.ts does not declare $FILTER_TAG. RESEARCH Finding 2: --tagsFilter validates its pattern against test.tags regardless of the strict-tags setting, so P-22's filtered run would error out instead of selecting anything."

for title in "$TITLE_SLOW" "$TITLE_NOT_SLOW"; do
  title_is_declared "packages/vitest/test/acceptance/worked-example-02-accounts.feature" "$title" ||
    fail "no Scenario in packages/vitest/test/acceptance/worked-example-02-accounts.feature is titled exactly: \"$title\". P-22 asserts on REPORTED titles, so a rename would make its assertion vacuous rather than false — an absent title is indistinguishable from a correctly-unselected one. Update the title constant at the top of this script."
done

echo "✓ preconditions: runner present, ten target artifacts present, $FILTER_TAG declared, both P-22 titles verbatim"
echo ""

# ===========================================================================
# P-08 — the @ts-expect-error negative type-test file compiles clean, AND fails
# if the directive becomes unused. TWO CHECKS, never one: an exit-0 alone is
# equally consistent with a file that has no directives left in it.
# ===========================================================================
P08_OK_OUTPUT="$($TSC -p "$STEP_EXPECT_ERROR_CONFIG" 2>&1)" && P08_OK_EXIT=0 || P08_OK_EXIT=$?
if [[ "$P08_OK_EXIT" -ne 0 ]]; then
  echo "$P08_OK_OUTPUT"
  fail "P-08: $STEP_EXPECT_ERROR_FIXTURE no longer compiles clean (exit $P08_OK_EXIT, output above). Either the DSL type was loosened so no error occurs on the marked line (TS2578 / TS377000 — DSL-01's guarantee is gone), or the two directive comment lines were reordered. That fixture's own header says which is which."
fi

# The second check. The fixture's directives are necessary ONLY because its
# ambient Layer does not provide `Db`. Provide it in a COPY and both directives
# become dead — which must be an ERROR, not a shrug. Without this half, a
# fixture that had quietly lost its defect would still exit 0 and P-08 would be
# asserting that a file with nothing in it compiles.
sed 's/describeFeature(feature, World.layer,/describeFeature(feature, Layer.merge(World.layer, Db.layer),/' \
  "$STEP_EXPECT_ERROR_FIXTURE" >"$P08_PROBE_FIXTURE"
grep -q "Layer.merge(World.layer, Db.layer)" "$P08_PROBE_FIXTURE" ||
  fail "P-08: the sed that provides Db in the probe copy matched nothing, so the copy is byte-identical to the original and the second check below would assert the same thing as the first. $STEP_EXPECT_ERROR_FIXTURE's describeFeature call has been reshaped — update the substitution in this script."

cat >"$P08_PROBE_CONFIG" <<'P08_CONFIG'
{
  "extends": "./tsconfig.json",
  "include": [],
  "files": ["src/pitfalls-gate-p08-probe.ts"]
}
P08_CONFIG

P08_DEAD_OUTPUT="$($TSC -p "$P08_PROBE_CONFIG" 2>&1)" && P08_DEAD_EXIT=0 || P08_DEAD_EXIT=$?
if [[ "$P08_DEAD_EXIT" -eq 0 ]]; then
  echo "$P08_DEAD_OUTPUT"
  fail "P-08: with Db provided, the copy of $STEP_EXPECT_ERROR_FIXTURE STILL compiles clean — so the @ts-expect-error directive there is suppressing nothing and its file could lose its defect without anything going red. An expected error that stopped happening must become a build failure; that is the entire mechanism of a directive-based negative type test."
fi
if ! grep -qE "TS2578|TS377000" <<<"$P08_DEAD_OUTPUT"; then
  echo "$P08_DEAD_OUTPUT"
  fail "P-08: the copy with Db provided was rejected, but NOT by an unused-directive diagnostic (expected TS2578 or TS377000). The exit code above proves only that SOMETHING was wrong with the file — most likely the substitution introduced an unrelated defect rather than removing the intended one."
fi
echo "✓ P-08 — the @ts-expect-error negative type-test compiles clean, and FAILS on an unused directive once its defect is removed"

# ===========================================================================
# P-09 — a step using Effect.acquireRelease compiles. The positive control is
# the whole risk: a config that compiled an EMPTY file set also exits 0.
# ===========================================================================
grep -q "Effect.acquireRelease" "$STEP_OK_FIXTURE" ||
  fail "P-09: $STEP_OK_FIXTURE no longer contains Effect.acquireRelease, so compiling it says nothing about a SCOPED step. Dsl.ts note (b) is the claim under assertion — Scope must not leak into the step's required context — and this fixture is where it is exercised."

P09_LISTED="$($TSC -p "$STEP_OK_CONFIG" --listFiles 2>&1 || true)"
grep -qF -- "$STEP_OK_FIXTURE" <<<"$P09_LISTED" ||
  fail "P-09: $STEP_OK_CONFIG did not include $STEP_OK_FIXTURE in its compiled file set. A config that compiles NOTHING exits 0, so without this control the assertion below would be vacuously true."

P09_OUTPUT="$($TSC -p "$STEP_OK_CONFIG" 2>&1)" && P09_EXIT=0 || P09_EXIT=$?
if [[ "$P09_EXIT" -ne 0 ]]; then
  echo "$P09_OUTPUT"
  fail "P-09: a step using Effect.acquireRelease no longer compiles (exit $P09_EXIT, output above). Most likely Scope.Scope has leaked into the step type in packages/vitest/src/Dsl.ts — a step using acquireRelease must still compile against a PLAIN Layer, because the runner provides the Scope. Do not add \`any\` to the fixture to make this pass."
fi
echo "✓ P-09 — a step using Effect.acquireRelease compiles, against a config proven to have compiled that file"

# ---------------------------------------------------------------------------
# The temporary acceptance pair P-13 and P-21 run against.
#
# It is generated rather than committed because neither fixture exists in the
# repository: no acceptance Feature carries an `@only`-tagged Scenario, and none
# carries a three-row Outline whose rows assert different values. Adding two
# committed pairs for two items' benefit would enlarge the suite whose size is
# itself asserted elsewhere; generating them keeps the cost inside this gate.
# ---------------------------------------------------------------------------
cat >"$PROBE_FEATURE" <<'PROBE_FEATURE_BODY'
Feature: Pitfalls gate probe

  @only
  Scenario: An only-tagged Scenario in a file that must run whole
    Given the probe counter starts at 5
    Then the probe counter is 5

  Scenario: An untagged sibling that must still run
    Given the probe counter starts at 1
    Then the probe counter is 1

  Scenario Outline: Each Outline row asserts its own value for <start>
    Given the probe counter starts at <start>
    Then the probe counter is <start>

    Examples:
      | start |
      | 11    |
      | 22    |
      | 33    |
PROBE_FEATURE_BODY

cat >"$PROBE_STEPS" <<'PROBE_STEPS_BODY'
// GENERATED AND DELETED BY scripts/verify-pitfalls-checklist.sh. Never commit this file.
//
// The counter lives in a `Ref` on a per-Scenario Layer, never in a module-scope
// binding — INV-EC-006, and the property that makes P-21's shuffled run able to
// expose shared mutable state at all. A module-scope counter is one counter
// however many times the Layer was built, and every row would agree with it.
import { ParameterTypeStore, parseFeature } from "@effect-cucumber/gherkin"
import { assert } from "@effect/vitest"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Ref from "effect/Ref"
import { describeFeature } from "../../src/describeFeature.ts"
// @ts-expect-error packages/vitest declares no ambient module for `*.feature?raw`
import source from "./pitfalls-gate-probe.feature?raw"

class Counter extends Context.Service<Counter, { readonly value: Ref.Ref<number> }>()("PitfallsGateCounter") {
  static readonly layer: Layer.Layer<Counter> = Layer.effect(
    Counter,
    Effect.gen(function*() {
      return Counter.of({ value: yield* Ref.make(-1) })
    })
  )
}

const feature = Effect.runSync(
  parseFeature(source as string, "packages/vitest/test/acceptance/pitfalls-gate-probe.feature").pipe(
    Effect.provide(ParameterTypeStore.Default)
  )
)

describeFeature(feature, Counter.layer, ({ Given, Then }) => {
  Given("the probe counter starts at {int}", function*(value: number) {
    yield* Ref.set((yield* Counter).value, value)
  })
  Then("the probe counter is {int}", function*(value: number) {
    assert.strictEqual(yield* Ref.get((yield* Counter).value), value)
  })
})
PROBE_STEPS_BODY

# ===========================================================================
# P-13 — @only produces no only-marking, and the run passes.
#
# ADR-EC-026 superseded ADR-EC-020: `@only` is emitted as a PLAIN TAG and is
# never routed to the framework's only-mode, so the error the item's original
# wording names no longer exists to produce. The executable form is the STRONGER
# claim the current design makes, and the UNTAGGED SIBLING is what carries it —
# had `@only` reached `it.effect.only`, that sibling would report skipped.
# `--allowOnly=false` is passed explicitly so the claim is true of THIS
# invocation regardless of what vitest.config.ts happens to say.
# ===========================================================================
P13_REPORT="$TMP_DIR/p13.json"
P13_LOG="$TMP_DIR/p13.log"
run_vitest "$PROBE_STEPS" "$P13_REPORT" "$P13_LOG" --allowOnly=false
[[ -f "$P13_REPORT" ]] || {
  cat "$P13_LOG"
  fail "P-13: the run wrote no report — the runner did not get far enough to report anything (output above)."
}

P13_TOTAL="$(report_query "$P13_REPORT" total)"
if [[ "$P13_TOTAL" -eq 0 ]]; then
  cat "$P13_LOG"
  fail "P-13: the run reported ZERO test results — the probe file did not collect, so every assertion below would be vacuously true. The usual cause is a tag emitted that vitest.config.ts does not declare, which fails the WHOLE file to 0 tests."
fi

P13_STATUS_ONLY="$(report_query "$P13_REPORT" status "An only-tagged Scenario in a file that must run whole")"
if [[ "$P13_STATUS_ONLY" != "passed" ]]; then
  cat "$P13_LOG"
  fail "P-13: the @only-tagged Scenario is \"$P13_STATUS_ONLY\" under --allowOnly=false, expected \"passed\". Had @only been routed to an only-MODIFIER, this run would have been rejected at collection instead. See ADR-EC-026."
fi

P13_STATUS_SIBLING="$(report_query "$P13_REPORT" status "An untagged sibling that must still run")"
if [[ "$P13_STATUS_SIBLING" != "passed" ]]; then
  cat "$P13_LOG"
  fail "P-13: the UNTAGGED sibling of the @only-tagged Scenario is \"$P13_STATUS_SIBLING\", expected \"passed\". A \"skipped\" status here means only-marking WAS emitted and narrowed the file to the tagged Scenario — which is exactly what ADR-EC-026 says must never happen, and which the tagged Scenario's own \"passed\" status cannot distinguish."
fi

P13_FAILED="$(report_query "$P13_REPORT" failed)"
if [[ "$P13_FAILED" -ne 0 ]]; then
  cat "$P13_LOG"
  fail "P-13: the run reported $P13_FAILED failed test(s) under --allowOnly=false (output above)."
fi
echo "✓ P-13 — an @only-tagged Scenario passes under --allowOnly=false and its untagged siblings still run: no only-marking was emitted (ADR-EC-026)"

# ===========================================================================
# P-21 — a three-row Outline, each row asserting its own value, under shuffled
# sequencing. Pitfall 34's regression class: shuffling is the ordering that
# exposes state shared between rows.
#
# Its own invocation, not a mode added to P-13's run (ASSUMPTION-11-A). The two
# items assert different things about the same file and a shared run would make
# one item's failure look like the other's.
# ===========================================================================
P21_REPORT="$TMP_DIR/p21.json"
P21_LOG="$TMP_DIR/p21.log"
run_vitest "$PROBE_STEPS" "$P21_REPORT" "$P21_LOG" --sequence.shuffle
[[ -f "$P21_REPORT" ]] || {
  cat "$P21_LOG"
  fail "P-21: the shuffled run wrote no report (output above)."
}

# The emitted titles are NOT the Outline's own text: D-03 appends the row's
# Examples columns, so a row reads `… for 11 (start=11)`. They are therefore
# collected from the report by PREFIX and asserted on as a set, rather than
# reconstructed here — a gate that hard-codes D-03's suffix format would go red
# on a title-format change that has nothing to do with this item.
P21_TITLES=()
while IFS= read -r title; do
  P21_TITLES+=("$title")
done < <(report_query "$P21_REPORT" titles | grep -F -- "Each Outline row asserts its own value for " || true)

if [[ "${#P21_TITLES[@]}" -ne 3 ]]; then
  cat "$P21_LOG"
  report_query "$P21_REPORT" titles
  fail "P-21: the shuffled run emitted ${#P21_TITLES[@]} Outline row test(s), expected 3 (every reported title is above). A 3-row Examples table must yield exactly 3 scenario entries; anything else means the rows did not all emit."
fi

# DISTINCTNESS, which is half of what a 3-row Outline claims. Three rows that
# collapsed to one title would still be three results, and a status lookup on a
# duplicated title answers AMBIGUOUS rather than silently taking the first.
P21_DISTINCT="$(printf '%s\n' "${P21_TITLES[@]}" | sort -u | wc -l | tr -d ' ')"
if [[ "$P21_DISTINCT" -ne 3 ]]; then
  printf '%s\n' "${P21_TITLES[@]}"
  fail "P-21: the three Outline rows produced $P21_DISTINCT DISTINCT title(s), expected 3 (titles above). Rows that share a title are rows a reader cannot tell apart in a report, and Pitfall 9's failure mode — every row handed the same Examples values — looks exactly like this."
fi

# Each row's own value appears in exactly one title. This is the "each row
# asserts its OWN value" half: three rows all reading row 1's value would pass
# every status check while proving nothing about per-row substitution.
for start in 11 22 33; do
  MATCHES="$(printf '%s\n' "${P21_TITLES[@]}" | grep -cF -- "$start" || true)"
  if [[ "$MATCHES" -ne 1 ]]; then
    printf '%s\n' "${P21_TITLES[@]}"
    fail "P-21: the Examples value \"$start\" appears in $MATCHES emitted title(s), expected exactly 1 (titles above). Pitfall 9: keying an Outline row on the SHARED first astNodeId hands every row the same row's values, which does not throw and does not fail to type-check."
  fi
done

for title in "${P21_TITLES[@]}"; do
  P21_STATUS="$(report_query "$P21_REPORT" status "$title")"
  if [[ "$P21_STATUS" != "passed" ]]; then
    cat "$P21_LOG"
    fail "P-21: Outline row \"$title\" is \"$P21_STATUS\" under --sequence.shuffle, expected \"passed\". Under shuffled ordering a row reading a value another row wrote sees the wrong one — that is Pitfall 34, and it is invisible in source order."
  fi
done
echo "✓ P-21 — three distinct Outline rows, each carrying its own Examples value, all pass under --sequence.shuffle (Pitfall 34)"

# ===========================================================================
# P-22 — a tag filter selects EXACTLY the tagged Scenarios.
#
# TWO HALVES, and mutation G is why the second is not optional: "the filtered
# run passed" is equally true of a filter that selected everything. The
# unselected Scenario must be PRESENT and SKIPPED — a CLI filter narrows to skip
# and never removes (RESEARCH Finding 7), so absence would mean something else
# entirely happened.
# ===========================================================================
P22_REPORT="$TMP_DIR/p22.json"
P22_LOG="$TMP_DIR/p22.log"
run_vitest "$ACCOUNTS_STEPS" "$P22_REPORT" "$P22_LOG" --tagsFilter="$FILTER_TAG"
[[ -f "$P22_REPORT" ]] || {
  cat "$P22_LOG"
  fail "P-22: the filtered run wrote no report. If the output above names an unknown tag, $FILTER_TAG is no longer declared in vitest.config.ts."
}

P22_PASSED="$(report_query "$P22_REPORT" passed)"
if [[ "$P22_PASSED" -eq 0 ]]; then
  cat "$P22_LOG"
  fail "P-22: the run filtered on $FILTER_TAG reported ZERO passed tests — the filter selected nothing, so the assertions below would be vacuous. This is precisely what a library emitting no tags produces: the filter has nothing to match, everything is narrowed to skip, and the process still exits 0."
fi

P22_STATUS_SLOW="$(report_query "$P22_REPORT" status "$TITLE_SLOW")"
if [[ "$P22_STATUS_SLOW" != "passed" ]]; then
  cat "$P22_LOG"
  fail "P-22: the $FILTER_TAG-tagged Scenario is \"$P22_STATUS_SLOW\" under --tagsFilter=$FILTER_TAG, expected \"passed\". Title: \"$TITLE_SLOW\". The filter did not select it, which means the tag string never reached the real task."
fi

P22_STATUS_OTHER="$(report_query "$P22_REPORT" status "$TITLE_NOT_SLOW")"
if [[ "$P22_STATUS_OTHER" == "ABSENT" ]]; then
  cat "$P22_LOG"
  fail "P-22: an unselected Scenario is ABSENT from the filtered report, expected PRESENT and \"skipped\". Title: \"$TITLE_NOT_SLOW\". A CLI filter narrows non-matching tests to skip and never removes them (RESEARCH Finding 7); absence is what a REGISTRATION filter produces, and the two must stay distinguishable."
fi
if [[ "$P22_STATUS_OTHER" != "skipped" ]]; then
  cat "$P22_LOG"
  fail "P-22: an unselected Scenario is \"$P22_STATUS_OTHER\" under --tagsFilter=$FILTER_TAG, expected \"skipped\". Title: \"$TITLE_NOT_SLOW\". A \"passed\" status means the filter selected it too — so the filter is selecting EVERYTHING, and the tagged Scenario's own pass proves nothing about selection. This is mutation G, which stayed green with only the first half asserted."
fi
echo "✓ P-22 — --tagsFilter=$FILTER_TAG selected exactly the tagged Scenario; an untagged one is present and SKIPPED, not passed"

# ===========================================================================
# P-24 — the failure output.
#
# THE ITEM'S FULL CLAIM IS CURRENTLY FALSE AND THE CHECKLIST ROW SAYS SO. Read
# both surfaces from a deliberately failing step: vitest's `Failed Tests` panel
# carries the Scenario title, the assertion message and seven frames of effect
# fiber internals — no step text, no `.feature`, no line number. ADR-EC-005's
# `Effect.fn(pattern)` span DOES name the step, in the stdout block, which is
# exactly the shape Pitfall 31 described and exactly the half Pitfall 31 calls
# insufficient.
#
# So the executed form is the reduced one: the attributed step frame reaches the
# reader at all. That is a real regression guard — the day ADR-EC-005's span
# stops being applied, the step name disappears from every failure in the
# project and nothing else in this repository notices. What it is NOT is the
# item's full claim, and the row's Note says what would complete it.
#
# The failing step comes from a TEMP pair. A committed failing fixture would
# make `pnpm test` red for ever.
# ===========================================================================
cat >"$FAILING_FEATURE" <<'FAILING_FEATURE_BODY'
Feature: Pitfalls gate failure output

  Scenario: A deliberately failing step
    Given the failing probe counter starts at 3
    Then the failing probe counter is 99
FAILING_FEATURE_BODY

cat >"$FAILING_STEPS" <<'FAILING_STEPS_BODY'
// GENERATED AND DELETED BY scripts/verify-pitfalls-checklist.sh. Never commit this file.
// It contains a step that FAILS on purpose; committing it would make `pnpm test` red.
import { ParameterTypeStore, parseFeature } from "@effect-cucumber/gherkin"
import { assert } from "@effect/vitest"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Ref from "effect/Ref"
import { describeFeature } from "../../src/describeFeature.ts"
// @ts-expect-error packages/vitest declares no ambient module for `*.feature?raw`
import source from "./pitfalls-gate-failing.feature?raw"

class Counter extends Context.Service<Counter, { readonly value: Ref.Ref<number> }>()("PitfallsGateFailingCounter") {
  static readonly layer: Layer.Layer<Counter> = Layer.effect(
    Counter,
    Effect.gen(function*() {
      return Counter.of({ value: yield* Ref.make(-1) })
    })
  )
}

const feature = Effect.runSync(
  parseFeature(source as string, "packages/vitest/test/acceptance/pitfalls-gate-failing.feature").pipe(
    Effect.provide(ParameterTypeStore.Default)
  )
)

describeFeature(feature, Counter.layer, ({ Given, Then }) => {
  Given("the failing probe counter starts at {int}", function*(value: number) {
    yield* Ref.set((yield* Counter).value, value)
  })
  Then("the failing probe counter is {int}", function*(value: number) {
    assert.strictEqual(yield* Ref.get((yield* Counter).value), value)
  })
})
FAILING_STEPS_BODY

P24_REPORT="$TMP_DIR/p24.json"
P24_LOG="$TMP_DIR/p24.log"
run_vitest "$FAILING_STEPS" "$P24_REPORT" "$P24_LOG"
[[ -f "$P24_REPORT" ]] || {
  cat "$P24_LOG"
  fail "P-24: the failing run wrote no report (output above)."
}

# Positive control. Everything below reads a FAILURE, and a run that did not
# fail has none to read — the assertions would then be asserting over nothing.
P24_FAILED="$(report_query "$P24_REPORT" failed)"
if [[ "$P24_FAILED" -ne 1 ]]; then
  cat "$P24_LOG"
  fail "P-24: the deliberately failing probe reported $P24_FAILED failed test(s), expected exactly 1. The probe did not fail, so there is no failure output to read and every assertion below would be vacuous."
fi

P24_STATUS="$(report_query "$P24_REPORT" status "A deliberately failing step")"
if [[ "$P24_STATUS" != "failed" ]]; then
  cat "$P24_LOG"
  fail "P-24: the failing Scenario reports \"$P24_STATUS\", expected \"failed\". The Scenario TITLE is what vitest's panel leads with, so a Scenario that cannot be found by title in the report is one a reader cannot find in the panel either."
fi

# The reduced claim, read from the runner's own default-reporter output rather
# than from the JSON report, because the stdout block is where the attributed
# frame lands and the JSON report's failureMessages do not carry it.
P24_HUMAN_LOG="$TMP_DIR/p24-human.log"
"$VITEST" run "$FAILING_STEPS" >"$P24_HUMAN_LOG" 2>&1 || true
if ! grep -qF -- "the failing probe counter is {int}" "$P24_HUMAN_LOG"; then
  cat "$P24_HUMAN_LOG"
  fail "P-24: the failure output does not name the failing step AT ALL — the frame \`at the failing probe counter is {int} (…)\` is absent (output above). ADR-EC-005's \`Effect.fn(pattern)\` span is the ONLY thing in this project that puts a step name anywhere near a failure; without it a reader gets a Scenario title, an assertion message and seven frames of effect internals. Check Step.ts's \`Effect.fn(pattern)\` wrap and ScenarioEffect.ts's per-step span."
fi
if ! grep -qF -- "A deliberately failing step" "$P24_HUMAN_LOG"; then
  cat "$P24_HUMAN_LOG"
  fail "P-24: the failure output does not name the Scenario \"A deliberately failing step\" (output above)."
fi
echo "✓ P-24 — a deliberately failing step names its Gherkin step pattern and its Scenario in the failure output (REDUCED form: see the P-24 row's Note for the half that is still owed)"

# ===========================================================================
# P-15 and P-16 — the PACKED manifests.
#
# Read out of a tarball, never out of packages/*/package.json. The source
# manifest reads `catalog:peer` whether the catalog behind it holds a range or
# an exact pin, so it is byte-identical in the passing and the failing case —
# STATE.md's Phase 01-04 entry records that finding, and PITFALLS Pitfall 20 is
# the mechanism: a `catalog:` specifier expands VERBATIM at pack time.
# ===========================================================================
# NOT `$( )` — see packed_manifest's comment: a command substitution swallows
# its three `fail` diagnostics and reduces the run to a silent exit 1.
packed_manifest "@effect-cucumber/vitest" "vitest"
VITEST_MANIFEST="$PACKED_MANIFEST"
packed_manifest "@effect-cucumber/gherkin" "gherkin"
GHERKIN_MANIFEST="$PACKED_MANIFEST"

P15_RESULT="$(
  MANIFEST_A="$VITEST_MANIFEST" MANIFEST_B="$GHERKIN_MANIFEST" node -e '
    const fs = require("node:fs")
    const fails = []
    for (const [label, path] of [["@effect-cucumber/vitest", process.env.MANIFEST_A], ["@effect-cucumber/gherkin", process.env.MANIFEST_B]]) {
      const m = JSON.parse(fs.readFileSync(path, "utf8"))
      const field = (f) => (m[f] === undefined ? {} : m[f])
      for (const dep of ["effect", "vitest"]) {
        for (const f of ["dependencies", "optionalDependencies"]) {
          if (Object.prototype.hasOwnProperty.call(field(f), dep)) {
            fails.push(label + ": " + f + "." + dep + " = " + JSON.stringify(field(f)[dep]) + " — a consumer would get a SECOND copy installed for them, and Context.Service identity is per-copy.")
          }
        }
      }
      if (!Object.prototype.hasOwnProperty.call(field("peerDependencies"), "effect")) {
        fails.push(label + ": peerDependencies.effect is MISSING — a consumer gets no version constraint at all on the copy of effect this package resolves against.")
      }
      for (const f of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
        for (const [k, v] of Object.entries(field(f))) {
          if (typeof v === "string" && (v.includes("catalog:") || v.includes("workspace:"))) {
            fails.push(label + ": " + f + "." + k + " = " + v + " — an unexpanded protocol npm cannot resolve; this tarball is unpublishable.")
          }
        }
      }
    }
    // `vitest` under peerDependencies is CORRECT for the runner package and
    // FORBIDDEN for gherkin, which must stay runner-agnostic (ADR-EC-021).
    const gherkin = JSON.parse(fs.readFileSync(process.env.MANIFEST_B, "utf8"))
    const gherkinPeers = gherkin.peerDependencies === undefined ? {} : gherkin.peerDependencies
    if (Object.prototype.hasOwnProperty.call(gherkinPeers, "vitest")) {
      fails.push("@effect-cucumber/gherkin: peerDependencies.vitest is declared — gherkin must stay runner-agnostic.")
    }
    const runner = JSON.parse(fs.readFileSync(process.env.MANIFEST_A, "utf8"))
    const runnerPeers = runner.peerDependencies === undefined ? {} : runner.peerDependencies
    if (!Object.prototype.hasOwnProperty.call(runnerPeers, "vitest")) {
      fails.push("@effect-cucumber/vitest: peerDependencies.vitest is MISSING — the runner package must constrain the vitest a consumer resolves.")
    }
    console.log(fails.length === 0 ? "OK" : fails.join("\n"))
  '
)"
if [[ "$P15_RESULT" != "OK" ]]; then
  echo "$P15_RESULT"
  fail "P-15: the packed manifests do not carry the structural precondition for a single-copy resolution (reasons above). Fix pnpm-workspace.yaml's catalogs, never a packages/*/package.json — every version in this repository lives in that one file (ADR-EC-012)."
fi
echo "✓ P-15 — neither packed manifest installs effect or vitest for a consumer, both declare effect as a peer, and no catalog:/workspace: protocol survived packing"
echo "  P-15 note: the LIVE two-package-manager install is a release-time step, performed as step 6 of $RC_BUMP_DOC — it needs a real registry and is deliberately not a per-push gate."

# P-16 duplicates verify-pack.sh's peer-range assertion ON PURPOSE (PROH-11-04).
# The item names it, so this checklist runs it; delegating to another script
# would make P-16 a citation, and a citation cannot be run.
P16_RESULT="$(
  MANIFEST="$VITEST_MANIFEST" node -e '
    const fs = require("node:fs")
    const m = JSON.parse(fs.readFileSync(process.env.MANIFEST, "utf8"))
    const peers = m.peerDependencies === undefined ? {} : m.peerDependencies
    const value = peers.effect
    if (value === undefined) console.log("MISSING")
    else if (value.includes("catalog:")) console.log("UNEXPANDED:" + value)
    else if (/^[0-9]/.test(value)) console.log("PINNED:" + value)
    else console.log("RANGE:" + value)
  '
)"
case "$P16_RESULT" in
  RANGE:*) ;;
  MISSING)
    fail "P-16: the packed @effect-cucumber/vitest manifest declares no peerDependencies.effect at all."
    ;;
  UNEXPANDED:*)
    fail "P-16: peerDependencies.effect in the PACKED manifest is ${P16_RESULT#UNEXPANDED:} — an unexpanded catalog reference survived packing, so npm cannot resolve it and the tarball is unpublishable."
    ;;
  PINNED:*)
    fail "P-16: peerDependencies.effect in the PACKED manifest is an EXACT PIN (${P16_RESULT#PINNED:}). Pitfall 20: a catalog: specifier expands verbatim at pack time, so a pin in the \`peer\` catalog publishes a pinned peer range and strands every consumer sitting on a different rc. Fix the \`peer\` catalog in pnpm-workspace.yaml, not packages/vitest/package.json."
    ;;
  *)
    fail "P-16: unexpected reader result \"$P16_RESULT\"."
    ;;
esac
echo "✓ P-16 — the PACKED manifest's peerDependencies.effect is ${P16_RESULT#RANGE:}: a range, not a pin and not an unexpanded catalog reference (Pitfall 20)"

# ===========================================================================
# P-17 — the README install lines.
#
# Three assertions, and the third is the one that is easy to leave out: the
# gherkin README must name NEITHER dependency. Without it, a well-meaning edit
# that "made the install docs consistent" would add an `effect@rc` line to a
# package that declares no such dependency, and the two positive assertions
# would happily go on passing.
# ===========================================================================
p17_install_line() {
  grep -nE '^(pnpm add|npm install|npm i|yarn add) ' "$1" || true
}

for readme in "$ROOT_README" "$VITEST_README"; do
  LINES="$(p17_install_line "$readme")"
  [[ -n "$LINES" ]] ||
    fail "P-17: $readme contains no install line matching \`pnpm add …\` / \`npm install …\`. The assertions below would have nothing to read, so a README that silently lost its Install section would pass."
  grep -qF -- "effect@rc" <<<"$LINES" ||
    fail "P-17: $readme's install line does not carry \`effect@rc\`:${LINES}. npm's \`latest\` tag for effect still points at the v3 line, so an install without @rc gets a consumer Effect v3 and a wall of type errors against a v4-only library."
  grep -qF -- "@effect/vitest@rc" <<<"$LINES" ||
    fail "P-17: $readme's install line does not carry \`@effect/vitest@rc\`:${LINES}. Its \`latest\` is on the v3 line too, and the failure is the same one."
done

GHERKIN_LINES="$(p17_install_line "$GHERKIN_README")"
[[ -n "$GHERKIN_LINES" ]] ||
  fail "P-17: $GHERKIN_README contains no install line at all, so the negative assertion below reads nothing."
if grep -qE '(^| )effect@|@effect/vitest' <<<"$GHERKIN_LINES"; then
  fail "P-17: $GHERKIN_README's install line names effect or @effect/vitest:${GHERKIN_LINES}. It must name NEITHER — that package declares neither as something a consumer installs alongside it, and an install line that says otherwise is documentation of a dependency that does not exist."
fi
echo "✓ P-17 — both consumer-facing READMEs carry @rc on effect and @effect/vitest, and the gherkin README names neither"

# ===========================================================================
# P-18 — the rc-bump checklist exists and names the acceptance suite as the gate.
#
# Read as normalised prose rather than line by line: a sentence that happens to
# wrap across two lines is the same sentence, and a line-anchored grep would
# fail on a reflow, which is the kind of false red that gets a gate deleted.
# ===========================================================================
[[ -f "$RC_BUMP_DOC" ]] ||
  fail "P-18: $RC_BUMP_DOC does not exist. PITFALLS Pitfall 18: an rc changelog's \`### Patch Changes\` heading does not narrow what broke — every entry lands there in pre-mode regardless of severity — so the bump procedure has to be written down."

P18_RESULT="$(
  DOC="$RC_BUMP_DOC" node -e '
    const fs = require("node:fs")
    const prose = fs.readFileSync(process.env.DOC, "utf8").replace(/\s+/g, " ")
    const sentences = prose.split(/(?<=\.)\s/)
    const hit = sentences.find((s) =>
      s.includes("packages/vitest/test/acceptance/") && /\bgate\b/i.test(s)
    )
    console.log(hit === undefined ? "NONE" : "FOUND")
  '
)"
if [[ "$P18_RESULT" != "FOUND" ]]; then
  fail "P-18: no sentence in $RC_BUMP_DOC names \`packages/vitest/test/acceptance/\` and calls it the gate. That is the ONE claim this item is about: Pitfall 18's warning sign is that a green \`tsc -b\` after an rc bump is not sufficient, so the document must say the acceptance suite is what gates a bump."
fi
grep -qF -- "$CHECKLIST_DOC" "$RC_BUMP_DOC" ||
  grep -qF -- "looks-done-but-isnt-checklist.md" "$RC_BUMP_DOC" ||
  fail "P-18: $RC_BUMP_DOC does not reference $CHECKLIST_DOC. The two documents point at each other on purpose — this row IS that document's existence, and its step 6 is P-15's full form."
echo "✓ P-18 — $RC_BUMP_DOC exists, names packages/vitest/test/acceptance/ as the gate for a bump, and references the checklist back"

# ===========================================================================
# THE COVERAGE CROSS-CHECK.
#
# Roadmap success criterion 4 says the checklist "runs in full". Everything
# above executes ten items; this is what makes "in full" a counted claim rather
# than a reader's.
# ===========================================================================
echo ""
echo "── coverage cross-check ────────────────────────────────────────────────"

# The program is written to a temporary FILE rather than passed with `node -e`
# inside a command substitution. That is not a style choice: a command
# substitution re-interprets both apostrophes and backticks, and this program
# has to talk about titles, ids and markdown table cells — all three of which
# want one or the other. Two rounds of quote-dodging produced a program that
# parsed and a comment that no longer said what it meant; a file says exactly
# what it says.
CROSS_CHECK_PROGRAM="$TMP_DIR/cross-check.cjs"
cat >"$CROSS_CHECK_PROGRAM" <<'CROSS_CHECK_JS'
const fs = require("node:fs")

const doc = fs.readFileSync(process.env.DOC, "utf8")
const expectedRows = Number(process.env.EXPECTED_ROWS)

// Parse the table. A row is a pipe-delimited line whose FIRST cell is a bare
// `P-NN` id; the fourth cell is the **Executed by** column. Backticks are
// stripped so the cell yields a plain path.
//
// ESCAPED PIPES ARE MASKED BEFORE THE SPLIT, and that is not defensive padding:
// P-04's item text is `origin: feature-background \| rule-background \|
// scenario`, so a naive split on every pipe hands that row SEVEN cells and
// reads "scenario" as its executor. Caught by this check on its first run —
// which is the row-count control and the per-row existence check doing exactly
// what they are for, on a defect in the parser rather than in the document.
const PIPE = String.fromCharCode(0)
const rows = []
for (const raw of doc.split("\n")) {
  if (!raw.startsWith("|")) continue
  const cells = raw
    .replace(/\\\|/g, PIPE)
    .split("|")
    .slice(1, -1)
    .map((cell) => cell.split(PIPE).join("|").trim())
  if (cells.length < 4) continue
  if (!/^P-[0-9]{2}$/.test(cells[0])) continue
  rows.push({ id: cells[0], executor: cells[3].replace(/`/g, "").trim() })
}

const fails = []

// ---------------------------------------------------------------------------
// 1. THE ROW-COUNT CONTROL — ASSUMPTION-11-B's whole mitigation.
//
// A parse that yields fewer rows than expected, or none, makes every check
// below vacuous: they iterate `rows`, so an empty parse asserts nothing and
// still reaches the completeness line. Mutation F is the measurement.
// ---------------------------------------------------------------------------
if (rows.length !== expectedRows) {
  fails.push(
    "the table parsed to " + rows.length + " row(s), expected " + expectedRows + ". " +
      "Either the table format changed and the parse is now reading a SUBSET — against which every " +
      "per-id check below is vacuously true — or an item was added or withdrawn without updating " +
      "EXPECTED_CHECKLIST_ROWS in scripts/verify-pitfalls-checklist.sh in the same commit. " +
      "The constant is written exactly once, on purpose: changing the table means changing it."
  )
  console.log("FAIL\n" + fails.join("\n"))
  process.exit(0)
}

// ---------------------------------------------------------------------------
// 2. The ids are exactly P-01 upwards, contiguous, each occurring once.
// AGENTS.md section 6: allocated contiguously, never renumbered, never reused;
// a withdrawn item is marked Withdrawn IN PLACE and keeps its row.
// ---------------------------------------------------------------------------
const seen = new Map()
for (const row of rows) seen.set(row.id, (seen.get(row.id) || 0) + 1)
for (const [id, count] of seen) {
  if (count !== 1) {
    fails.push(id + " appears " + count + " times in the table. Ids are never reused.")
  }
}
for (let n = 1; n <= expectedRows; n++) {
  const id = "P-" + String(n).padStart(2, "0")
  if (!seen.has(id)) {
    fails.push(
      id + " is missing from the table. Ids are allocated contiguously and a withdrawn item keeps " +
        "its row, so a gap means a row was DELETED — which the checklist's own closing rule forbids."
    )
  }
}

// ---------------------------------------------------------------------------
// 3. Every row's named executor really CARRIES that id, in the ANCHORED form.
//
// Never a bare-substring grep. Plan 11-07 stripped `P-04 — ` out of a test
// title and measured that `grep -c 'P-04'` over that file STILL returned 2,
// satisfied by the file's own header prose documenting the id — so the obvious
// cross-check would have been green against exactly the loss it exists to
// catch. Even the tighter `"P-04 — ` returns 2 there today, because the header
// quotes that very anchor while explaining the hazard.
//
// So the anchored forms are:
//
//   * a script  -> `echo "✓ P-NN — ` at the start of a line: the assertion's
//     own success line, which only an executing assertion emits.
//   * the in-process test file -> the id preceded by a string literal's opening
//     quote OR by a Gherkin `Scenario: ` (P-12's two nodes are Scenario titles
//     inside an inline Feature source, not arguments to a test call), AND
//     followed by an ASCII LETTER. The trailing letter is what separates a
//     title from prose about a title: the header's quotations are followed by
//     an apostrophe and by an ellipsis respectively, and neither matches.
// ---------------------------------------------------------------------------
const CHECK = "✓"
const EM_DASH = "—"
const lines = []

for (const row of rows) {
  if (!fs.existsSync(row.executor)) {
    fails.push(row.id + " names executor " + row.executor + ", which does not exist on disk.")
    continue
  }
  const body = fs.readFileSync(row.executor, "utf8")
  const isScript = row.executor.endsWith(".sh")
  const anchored = isScript
    ? new RegExp("^\\s*echo \"" + CHECK + " " + row.id + " " + EM_DASH + " ", "m")
    : new RegExp("(\"|Scenario: )" + row.id + " " + EM_DASH + " [A-Za-z]")
  const kind = isScript ? "an assertion success line" : "a test title"

  if (anchored.test(body)) {
    lines.push("  " + row.id + " -> " + row.executor)
  } else {
    fails.push(
      row.id + " is in the checklist, but its executor does not CARRY it: " + row.executor +
        " carries no " + kind + " anchored on " + row.id + ". A bare mention in a comment or a doc " +
        "block does NOT count, and that is the whole point of the anchored form — plan 11-07 " +
        "measured a bare-id grep green against a test that had lost its id. Either the executor " +
        "lost the id, or this row was pointed at an artifact that never ran the item."
    )
  }
}

if (fails.length > 0) {
  console.log("FAIL\n" + fails.join("\n"))
} else {
  const byExecutor = new Map()
  for (const row of rows) byExecutor.set(row.executor, (byExecutor.get(row.executor) || 0) + 1)
  const breakdown = [...byExecutor]
    .map(([executor, count]) => "    " + String(count).padStart(2, " ") + " x " + executor)
    .join("\n")
  console.log("OK\n" + lines.join("\n") + "\n" + breakdown)
}
CROSS_CHECK_JS

CROSS_CHECK_RESULT="$(
  DOC="$CHECKLIST_DOC" EXPECTED_ROWS="$EXPECTED_CHECKLIST_ROWS" node "$CROSS_CHECK_PROGRAM"
)"

if [[ "${CROSS_CHECK_RESULT%%$'\n'*}" != "OK" ]]; then
  echo "${CROSS_CHECK_RESULT#FAIL$'\n'}"
  fail "the coverage cross-check FAILED (reasons above). Roadmap success criterion 4 says the 24-item checklist runs IN FULL; it does not, and the reasons name which ids. An item may move executor and may gain a Note — it may never quietly stop being executed."
fi

echo "${CROSS_CHECK_RESULT#OK$'\n'}"
echo ""
echo "  all $EXPECTED_CHECKLIST_ROWS items of $CHECKLIST_DOC have an executor that carries them:"
echo "  the checklist RUNS IN FULL (roadmap success criterion 4)"

echo ""
echo "pitfalls checklist: ENFORCED"

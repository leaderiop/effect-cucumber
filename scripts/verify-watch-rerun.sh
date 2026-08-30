#!/usr/bin/env bash
#
# Executes checklist item P-14 of spec/process/looks-done-but-isnt-checklist.md:
# editing a `.feature` file under a WATCHING runner triggers a rerun that picks
# up a newly added Scenario.
#
# METHOD NOTE (do not weaken this):
#   A green `pnpm test` cannot make this claim in either direction. `pnpm test`
#   is `vitest run` — one shot, one collection, one report. It cannot observe
#   whether the runner watches `.feature` files at all, because it never watches
#   anything. The place a non-watched fixture is discovered is a CONSUMER'S dev
#   loop: they add a Scenario, see the old results, and conclude the library is
#   broken. That is PITFALLS Pitfall 3, and until this script existed the repo's
#   only defence against it was a sentence in a research file.
#
#   THE CONSTRAINT THAT SHAPES THIS WHOLE SCRIPT. This is the ONLY gate in this
#   repository that mutates a file. scripts/verify-tsgo-gate.sh lines 139-158
#   states the rule it is departing from, and states it as a positive
#   preference: a committed satisfied/starved PAIR is preferred precisely
#   because there is "no mutable working tree, no cleanup path that can leave
#   the repo dirty", and "a pair cannot silently decay into a no-op the way a
#   self-mutating script can". A committed pair cannot express this item — the
#   claim IS an edit, made while a process is running. So the rule is honoured
#   rather than broken: the edit is applied to a COPY, the copy is created after
#   the cleanup trap is already installed, and nothing under version control is
#   written at any point. `git status --porcelain` is empty on the success path
#   and on every failure path, and mutation C in the record below is the
#   measurement of what happens without the trap.
#
#   MUTATION C IS ALSO WHY BOTH COPY PATHS ARE NOW IN `.gitignore`, and why
#   `git status` is no longer the evidence for the sentence above. The trap
#   covers EXIT, INT and TERM; it does not cover SIGKILL, an OOM kill or a CI
#   runner timeout, and mutation C is what a survivor looks like — an untagged
#   `.feature` in the one directory `vitest.config.ts` derives its tag universe
#   from. Being ignored, the copies are now absent from `git status` whether the
#   trap fired or not; the live detector is the `[[ -e ... ]]` precondition,
#   which fails the NEXT run by name.
#
#   WHY THE COPY USES THE `?raw` IMPORT FORM, AND WHY THAT IS THE HONEST FORM.
#   Measured here, both directions, against this repository at plan 11-08:
#
#     - copy loading its Gherkin through `import source from "./x.feature?raw"`
#       and `parseFeature`: the edit produced a rerun carrying the new Scenario
#       in 622 ms.
#     - byte-identical copy loading the SAME file through the path-based
#       `loadFeature` + `NodeFileSystem.layer` — which is what every committed
#       acceptance pair in packages/vitest/test/acceptance/ actually does — no
#       rerun at all inside a 60-SECOND poll. Not a slow rerun: no rerun. The
#       report file's mtime never changed.
#
#   Both numbers are the measurement Pitfall 3 predicted and neither was assumed:
#   `fs` reads are invisible to Vite's module graph, and vitest invalidates by
#   module graph. So the gate drives the `?raw` form, which is the form Pitfall 3
#   names as the fix and the form a consumer must be told to use. What it does
#   NOT do is pretend the committed acceptance pairs rerun — they do not, and
#   that gap is recorded in plan 11-08's summary as a real finding rather than
#   hidden behind a green gate here.
#
#   The two alternatives are worse and were not attempted blind. `forceRerunTriggers`
#   is unusable in this checkout specifically: picomatch runs with `dot: false`
#   against absolute paths, and this repository's own parallel-execution
#   worktrees live under a dot-prefixed segment, so the option would silently do
#   nothing exactly where a gate most needs to be trustworthy (vitest #10835,
#   #11054). `watchTriggerPatterns` is root-config-only and would mean editing
#   the committed vitest.config.ts to make a gate pass, which is the reverse of
#   what a gate is for.
#
#   OBSERVED LATENCY AND THE TIMEOUT (ASSUMPTION-11-C). Observed rerun latency
#   is ~620 ms; RERUN_TIMEOUT_SECONDS below is 60. The timeout is a BOUND, not a
#   measurement of correctness — it exists so that "the runner never reran"
#   fails by name instead of hanging a CI job. Do not read a passing run as
#   evidence that reruns take less than 60 seconds; read it as evidence that one
#   happened.
#
#   The report is parsed as STRUCTURED DATA with `node -e`, never by grepping the
#   reporter's terminal output for glyphs — the same rule, for the same reason,
#   as scripts/verify-tags-filter.sh. There is deliberately no glyph matching
#   anywhere in this file.
#
# MUTATION RECORD (performed, observed, reverted — plan 11-08 Task 3):
#
#   A. The appended Scenario's last step was changed to a pattern that is NOT
#      registered ("Then the moon is made of 4 apples"), so it would FAIL if it
#      ran. The gate went RED, exit 1, on assertion 3's STATUS half:
#        the rerun picked "…" up but reported it "failed", expected "passed".
#      The PRESENCE half passed — the rerun really did happen and really did
#      carry the new Scenario. That is exactly why the record is worth keeping:
#      a presence-only assertion would have been GREEN here, on a rerun that
#      picked up a Scenario the runner could not run. Presence alone is the
#      weaker form of this item. Do not simplify assertion 3 down to it.
#
#   B. The `.feature` edit was skipped entirely (the `cat >>` replaced by a
#      no-op consuming the same heredoc) and the poll ran to its bound, which
#      was shortened to 6 s for the measurement. The gate FAILED at the bound
#      with "the runner did not rerun within 6s of …", printed the runner log,
#      and exited 1 — not a hang, and not a silent pass. Assertion 4 was never
#      reached, and `git status --porcelain` was clean afterwards. Confirms the
#      timeout is a failure path with a message on it rather than a way out.
#
#   C. The `trap cleanup EXIT INT TERM` line was commented out and a failure was
#      forced immediately after the copied `.feature` was written. Observed:
#      `packages/vitest/test/acceptance/watch-rerun-gate.feature` SURVIVED into
#      the working tree, and the `mktemp -d` directory survived too — the
#      `.gate.test.ts` did not, only because the forced failure fired before it
#      was written, which is itself the point. That is PROH-11-05's failure in
#      full: an untracked `.feature` left behind in the ONE directory whose
#      contents vitest.config.ts derives its tag universe from. It is also why
#      the trap is installed BEFORE the first write rather than after the copy —
#      a trap registered after the write cannot clean up a failure during it,
#      and this mutation failed at precisely that moment.
#
#   D. THE EXTRACTION ITSELF, which until now was never mutated — every entry
#      above tests what happens AROUND the copy, none tested whether the copy is
#      the right one. Two arms, both against the real fixture, both reverted:
#
#      D1, a Scenario titled `Eating apples in bulk` appended to
#          worked-example-01-apples.feature. The old `index($0, title)` rule is a
#          SUBSTRING test, so it matched that title too: the extraction produced
#          SIX step lines instead of three, silently copying a second Scenario.
#          TOTAL_1 rises with it and assertion 4's `TOTAL_2 > TOTAL_1` gets
#          weaker with nothing reporting it, and the old `-lt 3` control could
#          not see a LARGER extraction at all. With the anchored `$0 ~ "^[[:space:]]*Scenario: " title "$"`
#          rule: THREE lines, gate green, the extra Scenario correctly ignored.
#      D2, a SECOND Scenario titled exactly `Eating apples` appended. The old
#          `grep -q` precondition asked "at least one" and passed. The uniqueness
#          count fails by name: "has 2 Scenario(s) titled exactly ...; expected
#          exactly 1".
#
#      The two arms are separate because they are different failures and the
#      anchor only fixes one of them: an anchored match still matches both halves
#      of an exact duplicate. Existence checks and uniqueness checks are not
#      interchangeable, and this file needed both.
#
# Usage: bash scripts/verify-watch-rerun.sh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# Spelled out in full rather than composed, so these paths stay greppable.
SOURCE_FEATURE="packages/vitest/test/acceptance/worked-example-01-apples.feature"
WORK_FEATURE="packages/vitest/test/acceptance/watch-rerun-gate.feature"
WORK_STEPS="packages/vitest/test/acceptance/watch-rerun-gate.gate.test.ts"

# Use the repo-local runner, never a global `vitest`.
VITEST="node_modules/.bin/vitest"

# The Scenario copied out of $SOURCE_FEATURE — the smallest committed acceptance
# Scenario in the repository, and the subject of run 1.
EXISTING_TITLE="Eating apples"

# The Scenario APPENDED to the copy while the runner is watching. It reuses step
# patterns run 1 already registered, so ONLY the `.feature` file is edited. That
# separation is the sharper form of the item: it isolates "the runner watches
# `.feature` files" from "the runner watches TypeScript files", which it
# certainly does and which nobody doubts.
NEW_TITLE="A Scenario added while the runner was watching"

# A BOUND, not a measurement — see the METHOD NOTE. Observed latency ~620 ms.
RERUN_TIMEOUT_SECONDS=60

fail() {
  echo ""
  echo "✗ watch rerun gate: NOT ENFORCED"
  echo ""
  echo "  $1"
  echo ""
  exit 1
}

# ---------------------------------------------------------------------------
# The cleanup contract, installed BEFORE the first byte is written anywhere.
# Mutation C is the measurement of what a later registration costs.
#
# It has three jobs and each has its own failure mode:
#   1. stop the watching runner — otherwise a failed gate leaves a process
#      holding the terminal or the CI job open (threat T-11-08-02);
#   2. delete the two copies from the acceptance directory — otherwise the
#      working tree is dirty and, worse, a stale `.feature` sits in the one
#      directory whose contents vitest.config.ts derives its tag universe from;
#   3. delete the temp directory holding the reports and the runner log.
# ---------------------------------------------------------------------------
TMP_DIR=""
RUNNER_PID=""

cleanup() {
  if [[ -n "$RUNNER_PID" ]]; then
    kill "$RUNNER_PID" 2>/dev/null || true
    wait "$RUNNER_PID" 2>/dev/null || true
  fi
  rm -f "$WORK_FEATURE" "$WORK_STEPS"
  if [[ -n "$TMP_DIR" ]]; then
    rm -rf "$TMP_DIR"
  fi
}
trap cleanup EXIT INT TERM

TMP_DIR="$(mktemp -d)"
REPORT="$TMP_DIR/watch-report.json"
LOG="$TMP_DIR/watch.log"

# Query the report as structured data. Modes:
#   total        -> number of test results
#   status TITLE -> that test's status, or ABSENT, or AMBIGUOUS
#
# A parse failure answers UNREADABLE rather than throwing: the watching runner
# rewrites this file in place, so a poll can catch it mid-write, and a poll that
# died on a half-written file would report "the runner never reran".
#
# AMBIGUOUS is its own answer rather than a silent first-match: two tests sharing
# a title would make a status assertion mean something other than what it reads.
report_query() {
  local report="$1" mode="$2" title="${3-}"
  REPORT="$report" QUERY_MODE="$mode" QUERY_TITLE="$title" node -e '
    const fs = require("node:fs")
    let report
    try {
      report = JSON.parse(fs.readFileSync(process.env.REPORT, "utf8"))
    } catch {
      console.log("UNREADABLE")
      process.exit(0)
    }
    const results = (report.testResults || []).flatMap((file) => file.assertionResults || [])
    const mode = process.env.QUERY_MODE

    if (mode === "total") {
      console.log(String(results.length))
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

# Milliseconds, or 0 when the file is not there yet.
report_mtime() {
  REPORT="$1" node -e '
    const fs = require("node:fs")
    try {
      console.log(String(fs.statSync(process.env.REPORT).mtimeMs))
    } catch {
      console.log("0")
    }
  '
}

# ---------------------------------------------------------------------------
# Preconditions. A missing runner, a missing source fixture, or a work path that
# turns out to be COMMITTED must fail here, by name.
# ---------------------------------------------------------------------------
[[ -x "$VITEST" ]] || fail "missing runner $VITEST — run \`pnpm install\` first. Without it this gate cannot invoke anything, so nothing was verified."
[[ -f "$SOURCE_FEATURE" ]] || fail "missing file $SOURCE_FEATURE — the Gherkin this gate copies is absent, so nothing was verified."

# The one precondition that protects the repository rather than the assertion.
# If either work path is ever committed, the cleanup trap would DELETE a tracked
# file and this gate would become the thing it exists to avoid being.
for tracked in "$WORK_FEATURE" "$WORK_STEPS"; do
  if git ls-files --error-unmatch "$tracked" >/dev/null 2>&1; then
    fail "$tracked is TRACKED BY GIT. This gate writes and then deletes that path, so running it would delete a committed file. Rename the constant at the top of this script; do not delete the committed file to make the gate run."
  fi
  [[ -e "$tracked" ]] && fail "$tracked already exists on disk. A previous run of this gate did not clean up, or something else owns that path. Remove it and re-run; if it keeps reappearing, the trap in this script is not firing."
done

# UNIQUENESS, not existence, and the difference is the whole of this
# precondition. `grep -q` answered "at least one", which is the wrong question:
# the awk extraction below copies out EVERY block whose title matches, so a
# second Scenario with the same title — legal Gherkin under a `Rule:`, since
# Validate.ts's uniqueness key is `${ruleId}\0${name}` — silently doubles the
# copy. TOTAL_1 then rises and assertion 4's `TOTAL_2 > TOTAL_1` gets weaker with
# nothing reporting it. Counting is one character more than testing.
TITLE_OCCURRENCES="$(grep -cE "^[[:space:]]*Scenario: ${EXISTING_TITLE}\$" "$SOURCE_FEATURE" || true)"
if [[ "$TITLE_OCCURRENCES" -ne 1 ]]; then
  fail "$SOURCE_FEATURE has $TITLE_OCCURRENCES Scenario(s) titled exactly \"$EXISTING_TITLE\"; expected exactly 1. At 0, this gate copies that Scenario out by title and a rename produces an EMPTY copy, against which run 1 reports zero tests and every assertion below is vacuous. Above 1, the copy silently gains extra Scenarios and assertion 4's comparison weakens without saying so. Update EXISTING_TITLE at the top of this script, or disambiguate the fixture."
fi

grep -qF -- "$NEW_TITLE" "$SOURCE_FEATURE" &&
  fail "$SOURCE_FEATURE already contains the title \"$NEW_TITLE\". Assertion 2 asserts that title is ABSENT before the edit; if the source carries it, the assertion is false before the gate does anything. Change NEW_TITLE at the top of this script."

echo "✓ preconditions: $VITEST present, $SOURCE_FEATURE carries \"Scenario: $EXISTING_TITLE\", neither work path is tracked or extant"

# ---------------------------------------------------------------------------
# Build the copy. The Gherkin is EXTRACTED from the committed fixture rather
# than invented here, so the gate runs Gherkin this repository already ships.
# The `@REQ-EC-NNN` tag above the Scenario is deliberately left behind, and it
# STAYS left behind even though the hazard it guarded against is now closed at
# the other end. spec/scripts/verify-traceability.sh used to walk the FILESYSTEM
# for `.feature` files, so a temp file carrying a tag could make a concurrent
# `pnpm verify:spec` assert over a file that no longer existed by the time anyone
# read the failure. That scan is now `git grep --untracked`, which honours
# .gitignore, and `$WORK_FEATURE` is gitignored — so the copy is invisible to it
# either way. Two independent reasons to be safe is the correct number here: a
# copy that needed no tag never had a reason to carry one, and stripping it keeps
# this gate's correctness from depending on another script's scan mechanism.
# ---------------------------------------------------------------------------
# ANCHORED, not `index()`. `index($0, title)` is a SUBSTRING test, so a future
# Scenario titled `Eating apples in bulk` matches `Eating apples` and its block
# is copied too. The uniqueness precondition above catches the exact-duplicate
# case; only the anchor catches the prefix case, and the two are different
# failures. `title` is interpolated into a regex here, so it must stay a literal
# title — no metacharacters — which is what the precondition's identical anchor
# also asserts.
awk -v title="$EXISTING_TITLE" '
  /^Feature:/ { print; print ""; next }
  $0 ~ "^[[:space:]]*Scenario: " title "$" { inblock = 1; print; next }
  inblock && /^[[:space:]]*$/ { inblock = 0; next }
  inblock { print }
' "$SOURCE_FEATURE" >"$WORK_FEATURE"

# Positive control on the extraction itself, and it is EXACT rather than a lower
# bound. `-lt 3` only noticed a SMALLER extraction; a larger one — the prefix
# match the anchor above now prevents, or a step added to the source Scenario —
# went unreported, and a copy that grew is exactly what makes assertion 4's
# `TOTAL_2 > TOTAL_1` weaker while staying green. An exact count fails in both
# directions and names both numbers.
EXPECTED_EXTRACTED_STEPS=3
EXTRACTED_STEPS="$(grep -cE '^[[:space:]]+(Given|When|Then) ' "$WORK_FEATURE" || true)"
if [[ "$EXTRACTED_STEPS" -ne "$EXPECTED_EXTRACTED_STEPS" ]]; then
  cat "$WORK_FEATURE"
  fail "extracting \"$EXISTING_TITLE\" out of $SOURCE_FEATURE produced $EXTRACTED_STEPS step line(s), expected exactly $EXPECTED_EXTRACTED_STEPS (content above). FEWER means the awk extraction no longer matches that fixture's layout — most likely the Scenario's steps are no longer indented, or a blank line was introduced inside the Scenario body. MORE means the extraction picked up something it should not have, or the source Scenario gained a step; if the latter is intended, change EXPECTED_EXTRACTED_STEPS in this script in the same commit."
fi
echo "✓ copied \"Scenario: $EXISTING_TITLE\" ($EXTRACTED_STEPS steps) out of $SOURCE_FEATURE into $WORK_FEATURE"

cat >"$WORK_STEPS" <<'STEPS_MODULE'
// GENERATED AND DELETED BY scripts/verify-watch-rerun.sh. Never commit this file.
//
// The `?raw` import is the whole point: it puts the `.feature` file into Vite's
// module graph, which is what makes an edit to it invalidate this module and
// trigger a rerun (PITFALLS Pitfall 3). The committed acceptance pairs load
// their Gherkin through NodeFileSystem instead, and measurably do NOT rerun.
import { ParameterTypeStore, parseFeature } from "@effect-cucumber/gherkin"
import { assert } from "@effect/vitest"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Ref from "effect/Ref"
import { describeFeature } from "../../src/describeFeature.ts"
// @ts-expect-error packages/vitest declares no ambient module for `*.feature?raw`
import source from "./watch-rerun-gate.feature?raw"

class World extends Context.Service<World, { readonly apples: Ref.Ref<number> }>()("WatchRerunGateWorld") {
  static readonly layer: Layer.Layer<World> = Layer.effect(
    World,
    Effect.gen(function*() {
      return World.of({ apples: yield* Ref.make(0) })
    })
  )
}

const feature = Effect.runSync(
  parseFeature(source as string, "packages/vitest/test/acceptance/watch-rerun-gate.feature").pipe(
    Effect.provide(ParameterTypeStore.Default)
  )
)

describeFeature(feature, World.layer, ({ Given, Then, When }) => {
  Given("I have {int} apples", function*(count: number) {
    yield* Ref.set((yield* World).apples, count)
  })
  When("I eat {int} apples", function*(count: number) {
    yield* Ref.update((yield* World).apples, (apples) => apples - count)
  })
  Then("I have {int} apples left", function*(count: number) {
    assert.strictEqual(yield* Ref.get((yield* World).apples), count)
  })
})
STEPS_MODULE

# ---------------------------------------------------------------------------
# RUN 1 — start the WATCHING runner, scoped to the copy alone. The copy is
# discoverable because it sits inside the repository at a path vitest's DEFAULT
# include glob already reaches; vitest.config.ts note (c) forbids touching that
# glob and nothing here does. It is passed as a positional filter as well, so
# this gate never runs the whole suite.
# ---------------------------------------------------------------------------
"$VITEST" --watch "$WORK_STEPS" \
  --reporter=json \
  --outputFile="$REPORT" >"$LOG" 2>&1 &
RUNNER_PID=$!

for _ in $(seq 1 $((RERUN_TIMEOUT_SECONDS * 2))); do
  [[ -f "$REPORT" ]] && [[ "$(report_query "$REPORT" total)" != "UNREADABLE" ]] && break
  sleep 0.5
done

if [[ ! -f "$REPORT" ]]; then
  cat "$LOG"
  fail "the watching runner wrote no report to $REPORT within ${RERUN_TIMEOUT_SECONDS}s — it never got far enough to report anything (output above)."
fi

# ---------------------------------------------------------------------------
# Assertion 1: VACUITY CONTROL. Run 1 reported a non-zero total.
#
# Zero is what a file that fails to COLLECT produces, and it is reachable here
# for two reasons that have nothing to do with watching: the copied Gherkin came
# out empty, or the `?raw` import failed to resolve. Against a zero-total first
# run every assertion below is trivially true — including assertion 4, since
# 1 > 0.
# ---------------------------------------------------------------------------
TOTAL_1="$(report_query "$REPORT" total)"
if [[ "$TOTAL_1" == "UNREADABLE" ]] || [[ "$TOTAL_1" -eq 0 ]]; then
  cat "$LOG"
  cat "$WORK_FEATURE"
  fail "run 1 reported \"$TOTAL_1\" test results — the copy did not collect, so every assertion below would be vacuously true. Runner output and the copied Gherkin are above."
fi
echo "✓ run 1 vacuity control: $TOTAL_1 test result(s) — the copy collected"

# ---------------------------------------------------------------------------
# Assertion 2: THE PRECONDITION. The Scenario about to be added is ABSENT from
# run 1's results, matched on the EXACT reported title rather than a containment
# grep. Without it, assertion 3 could be satisfied by a Scenario that was there
# all along and no rerun would be needed to pass this gate.
# ---------------------------------------------------------------------------
STATUS_NEW_1="$(report_query "$REPORT" status "$NEW_TITLE")"
if [[ "$STATUS_NEW_1" != "ABSENT" ]]; then
  cat "$LOG"
  fail "the Scenario \"$NEW_TITLE\" is already \"$STATUS_NEW_1\" in run 1, expected ABSENT. It is supposed to arrive only with the edit below, so assertion 3 would pass without any rerun happening at all."
fi
echo "✓ run 1: \"$NEW_TITLE\" is ABSENT — the rerun has something to pick up"

# ---------------------------------------------------------------------------
# THE EDIT. One append, to the COPY of the `.feature` file, reusing step
# patterns run 1 already registered. No TypeScript file is touched.
# ---------------------------------------------------------------------------
MTIME_1="$(report_mtime "$REPORT")"
EDIT_STARTED_AT="$(date +%s)"

cat >>"$WORK_FEATURE" <<EDIT

  Scenario: $NEW_TITLE
    Given I have 9 apples
    When I eat 4 apples
    Then I have 5 apples left
EDIT

# ---------------------------------------------------------------------------
# Assertion 3: THE CLAIM. Within the bound, a SECOND report appears in which the
# new Scenario is PRESENT and PASSING.
#
# Presence and status, never presence alone — mutation A is the measurement. The
# poll is on the report file's mtime rather than a fixed sleep, so a fast rerun
# is not paid for and a slow one is not missed.
# ---------------------------------------------------------------------------
RERAN=0
for _ in $(seq 1 $((RERUN_TIMEOUT_SECONDS * 2))); do
  if [[ "$(report_mtime "$REPORT")" != "$MTIME_1" ]]; then
    STATUS_NEW_2="$(report_query "$REPORT" status "$NEW_TITLE")"
    if [[ "$STATUS_NEW_2" != "UNREADABLE" ]] && [[ "$STATUS_NEW_2" != "ABSENT" ]]; then
      RERAN=1
      break
    fi
  fi
  sleep 0.5
done
RERUN_SECONDS=$(($(date +%s) - EDIT_STARTED_AT))

if [[ "$RERAN" -eq 0 ]]; then
  cat "$LOG"
  fail "the runner did not rerun within ${RERUN_TIMEOUT_SECONDS}s of \"$WORK_FEATURE\" being edited — \"$NEW_TITLE\" never appeared in a fresh report. That is Pitfall 3 in full: a \`.feature\` file read outside Vite's module graph is invisible to the watcher, so a consumer editing Gherkin sees stale results. Runner output above; the report is $REPORT."
fi

if [[ "$STATUS_NEW_2" != "passed" ]]; then
  cat "$LOG"
  fail "the rerun picked \"$NEW_TITLE\" up but reported it \"$STATUS_NEW_2\", expected \"passed\". The rerun happened; the newly added Scenario did not run correctly. Presence alone is NOT what this item claims — see mutation A."
fi
# The `✓ P-14 — ` prefix is the ANCHORED FORM the coverage cross-check in
# scripts/verify-pitfalls-checklist.sh reads back out of this file. It is not
# decoration: a bare `P-14` in a comment does not count, because plan 11-07
# measured that a bare-id grep is satisfied by prose documenting the id. If this
# line's shape changes, `pnpm verify:pitfalls` goes red naming P-14 — which is
# the intended behaviour, not a bug in the cross-check.
echo "✓ P-14 — rerun after ~${RERUN_SECONDS}s: \"$NEW_TITLE\" is PRESENT and passed — the edit reached the watching runner"

# ---------------------------------------------------------------------------
# Assertion 4: assertion 3's ANTI-VACUITY PARTNER. Run 2's total is STRICTLY
# GREATER than run 1's. A rerun reporting the same number of results has not
# picked up a new Scenario, whatever a title lookup says; the two assertions
# together are what distinguish "added" from "renamed".
# ---------------------------------------------------------------------------
TOTAL_2="$(report_query "$REPORT" total)"
if [[ "$TOTAL_2" == "UNREADABLE" ]] || [[ "$TOTAL_2" -le "$TOTAL_1" ]]; then
  cat "$LOG"
  fail "run 2 reported \"$TOTAL_2\" test results against run 1's $TOTAL_1, expected strictly more. A rerun that reports the same set proves nothing about picking up a NEW Scenario — it is equally consistent with a Scenario having been renamed."
fi
echo "✓ run 2 total $TOTAL_2 > run 1 total $TOTAL_1 — a Scenario was ADDED, not renamed"

echo ""
echo "watch rerun gate: ENFORCED"

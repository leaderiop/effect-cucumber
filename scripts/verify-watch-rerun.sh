#!/usr/bin/env bash
#
# Executes checklist item P-14: editing a `.feature` file under a WATCHING runner
# triggers a rerun that picks up a newly added Scenario. `pnpm test` cannot make the
# claim in either direction; only a real `vitest --watch` can. The file is copied to
# a temp location first and the JSON report is polled with a deadline.
#
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

NEW_TITLE="A Scenario added while the runner was watching"

# A BOUND, not a measurement — see the METHOD NOTE. Observed latency ~620 ms.
RERUN_TIMEOUT_SECONDS=60

fail() {
  {
    echo ""
    echo "✗ watch rerun gate: NOT ENFORCED"
    echo ""
    echo "  $1"
    echo ""
  } >&2
  exit 1
}

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

[[ -x "$VITEST" ]] || fail "missing runner $VITEST — run \`pnpm install\` first. Without it this gate cannot invoke anything, so nothing was verified."
[[ -f "$SOURCE_FEATURE" ]] || fail "missing file $SOURCE_FEATURE — the Gherkin this gate copies is absent, so nothing was verified."

# The one precondition that protects the repository rather than the assertion.
# If either work path is ever committed, the cleanup trap would DELETE a tracked
# file and this gate would become the thing it exists to avoid being.
for tracked in "$WORK_FEATURE" "$WORK_STEPS"; do
  if git ls-files --error-unmatch "$tracked" >/dev/null 2>&1; then
    fail "$tracked is TRACKED BY GIT. This gate writes and then deletes that path, so running it would delete a committed file. Rename the constant at the top of this script; do not delete the committed file to make the gate run."
  fi
  if [[ -e "$tracked" ]]; then
    fail "$tracked already exists on disk. A previous run of this gate did not clean up, or something else owns that path. Remove it and re-run; if it keeps reappearing, the trap in this script is not firing."
  fi
done

TITLE_OCCURRENCES="$(grep -cE "^[[:space:]]*Scenario: ${EXISTING_TITLE}\$" "$SOURCE_FEATURE" || true)"
if [[ "$TITLE_OCCURRENCES" -ne 1 ]]; then
  fail "$SOURCE_FEATURE has $TITLE_OCCURRENCES Scenario(s) titled exactly \"$EXISTING_TITLE\"; expected exactly 1. At 0, this gate copies that Scenario out by title and a rename produces an EMPTY copy, against which run 1 reports zero tests and every assertion below is vacuous. Above 1, the copy silently gains extra Scenarios and assertion 4's comparison weakens without saying so. Update EXISTING_TITLE at the top of this script, or disambiguate the fixture."
fi

grep -qF -- "$NEW_TITLE" "$SOURCE_FEATURE" &&
  fail "$SOURCE_FEATURE already contains the title \"$NEW_TITLE\". Assertion 2 asserts that title is ABSENT before the edit; if the source carries it, the assertion is false before the gate does anything. Change NEW_TITLE at the top of this script."

echo "✓ preconditions: $VITEST present, $SOURCE_FEATURE carries \"Scenario: $EXISTING_TITLE\", neither work path is tracked or extant"

awk -v title="$EXISTING_TITLE" '
  /^Feature:/ { print; print ""; next }
  $0 ~ "^[[:space:]]*Scenario: " title "$" { inblock = 1; print; next }
  inblock && /^[[:space:]]*$/ { inblock = 0; next }
  inblock { print }
' "$SOURCE_FEATURE" >"$WORK_FEATURE"

# Positive control on the extraction itself, and it is EXACT rather than a lower
EXPECTED_EXTRACTED_STEPS=3
EXTRACTED_STEPS="$(grep -cE '^[[:space:]]+(Given|When|Then) ' "$WORK_FEATURE" || true)"
if [[ "$EXTRACTED_STEPS" -ne "$EXPECTED_EXTRACTED_STEPS" ]]; then
  cat "$WORK_FEATURE" >&2
  fail "extracting \"$EXISTING_TITLE\" out of $SOURCE_FEATURE produced $EXTRACTED_STEPS step line(s), expected exactly $EXPECTED_EXTRACTED_STEPS (content above). FEWER means the awk extraction no longer matches that fixture's layout — most likely the Scenario's steps are no longer indented, or a blank line was introduced inside the Scenario body. MORE means the extraction picked up something it should not have, or the source Scenario gained a step; if the latter is intended, change EXPECTED_EXTRACTED_STEPS in this script in the same commit."
fi
echo "✓ copied \"Scenario: $EXISTING_TITLE\" ($EXTRACTED_STEPS steps) out of $SOURCE_FEATURE into $WORK_FEATURE"

cat >"$WORK_STEPS" <<'STEPS_MODULE'
// GENERATED AND DELETED BY scripts/verify-watch-rerun.sh. Never commit this file.
//
// The `?raw` import is the whole point: it puts the `.feature` file into Vite's
// module graph, which is what makes an edit to it invalidate this module and
// trigger a rerun. The committed acceptance pairs load
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

"$VITEST" --watch "$WORK_STEPS" \
  --reporter=json \
  --outputFile="$REPORT" >"$LOG" 2>&1 &
RUNNER_PID=$!

for _ in $(seq 1 $((RERUN_TIMEOUT_SECONDS * 2))); do
  [[ -f "$REPORT" ]] && [[ "$(report_query "$REPORT" total)" != "UNREADABLE" ]] && break
  sleep 0.5
done

if [[ ! -f "$REPORT" ]]; then
  cat "$LOG" >&2
  fail "the watching runner wrote no report to $REPORT within ${RERUN_TIMEOUT_SECONDS}s — it never got far enough to report anything (output above)."
fi

# ---------------------------------------------------------------------------
# Assertion 1: VACUITY CONTROL. Run 1 reported a non-zero total.
# ---------------------------------------------------------------------------
TOTAL_1="$(report_query "$REPORT" total)"
if [[ "$TOTAL_1" == "UNREADABLE" ]] || [[ "$TOTAL_1" -eq 0 ]]; then
  cat "$LOG" >&2
  cat "$WORK_FEATURE" >&2
  fail "run 1 reported \"$TOTAL_1\" test results — the copy did not collect, so every assertion below would be vacuously true. Runner output and the copied Gherkin are above."
fi
echo "✓ run 1 vacuity control: $TOTAL_1 test result(s) — the copy collected"

# ---------------------------------------------------------------------------
# Assertion 2: THE PRECONDITION. The Scenario about to be added is ABSENT from
# ---------------------------------------------------------------------------
STATUS_NEW_1="$(report_query "$REPORT" status "$NEW_TITLE")"
if [[ "$STATUS_NEW_1" != "ABSENT" ]]; then
  cat "$LOG" >&2
  fail "the Scenario \"$NEW_TITLE\" is already \"$STATUS_NEW_1\" in run 1, expected ABSENT. It is supposed to arrive only with the edit below, so assertion 3 would pass without any rerun happening at all."
fi
echo "✓ run 1: \"$NEW_TITLE\" is ABSENT — the rerun has something to pick up"

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
  cat "$LOG" >&2
  fail "the runner did not rerun within ${RERUN_TIMEOUT_SECONDS}s of \"$WORK_FEATURE\" being edited — \"$NEW_TITLE\" never appeared in a fresh report. That is Pitfall 3 in full: a \`.feature\` file read outside Vite's module graph is invisible to the watcher, so a consumer editing Gherkin sees stale results. Runner output above; the report is $REPORT."
fi

if [[ "$STATUS_NEW_2" != "passed" ]]; then
  cat "$LOG" >&2
  fail "the rerun picked \"$NEW_TITLE\" up but reported it \"$STATUS_NEW_2\", expected \"passed\". The rerun happened; the newly added Scenario did not run correctly. Presence alone is NOT what this item claims — see mutation A."
fi
echo "✓ P-14 — rerun after ~${RERUN_SECONDS}s: \"$NEW_TITLE\" is PRESENT and passed — the edit reached the watching runner"

# ---------------------------------------------------------------------------
# Assertion 4: assertion 3's ANTI-VACUITY PARTNER. Run 2's total is STRICTLY
# ---------------------------------------------------------------------------
TOTAL_2="$(report_query "$REPORT" total)"
if [[ "$TOTAL_2" == "UNREADABLE" ]] || [[ "$TOTAL_2" -le "$TOTAL_1" ]]; then
  cat "$LOG" >&2
  fail "run 2 reported \"$TOTAL_2\" test results against run 1's $TOTAL_1, expected strictly more. A rerun that reports the same set proves nothing about picking up a NEW Scenario — it is equally consistent with a Scenario having been renamed."
fi
echo "✓ run 2 total $TOTAL_2 > run 1 total $TOTAL_1 — a Scenario was ADDED, not renamed"

echo ""
echo "watch rerun gate: ENFORCED"

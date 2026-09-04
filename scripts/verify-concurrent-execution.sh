#!/usr/bin/env bash
#
# ADR-EC-040's real, cross-run proof — two genuine `vitest run` invocations, never an in-process
# simulation, against `packages/vitest/test/concurrent-fixture/` (excluded from every normal
# `vitest run` by the root and per-package `vitest.config.ts`, collected only through this fixture's
# own standalone `vitest.config.ts` — the ONE place in the repository that opts into
# `sequence.concurrent: true`, invoked here via `--config`):
#
#   1. `timeout-cascade.steps.test.ts` — the FIX proof. The exact bug shape a working spike
#      (`research/concurrent-execution-spike.md`) and this ADR's own independently-reproduced
#      transcript both captured against the OLD mechanism (BeforeAllScenarios as a hand-rolled
#      once-cell reached from inside whichever Scenario's own body got there first): a 400ms
#      `BeforeAllScenarios` shared by a `@timeout-100` Scenario and a `@timeout-2000` Scenario,
#      under real concurrent scheduling. Asserts BOTH pass, and — the structural half a terminal
#      transcript alone cannot prove — that each Scenario's own REPORTED duration is small (nowhere
#      near the 400ms setup cost), i.e. the setup never landed inside either Scenario's own
#      `testTimeout` window at all.
#   2. `failing-beforeall.steps.test.ts` — the BEH-EC-017 preservation proof, under the SAME real
#      concurrent scheduling. Asserts BOTH Scenarios appear as two INDIVIDUALLY failed assertion
#      results (never vitest's own "one suite failure, every sibling skipped" shape — the naive
#      "just let beforeAll throw" fix this ADR rejected), each carrying the identical failure
#      message.
#
# The ORIGINAL bug itself (run 1's fixture, against the OLD once-cell mechanism) is not re-proven by
# this script — that mechanism no longer exists in this repository's source to run against without
# reintroducing dead code. It is proven once, directly, in ADR-EC-040 itself (a real `vitest run`
# transcript against the OLD `makeOnce`/`Deferred` code, copied verbatim from `main` and run
# standalone, independently of this fix).
#
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

VITEST="node_modules/.bin/vitest"
FIXTURE_CONFIG="packages/vitest/test/concurrent-fixture/vitest.config.ts"

fail() {
  {
    echo ""
    echo "✗ concurrent-execution gate: NOT ENFORCED"
    echo ""
    echo "  $1"
    echo ""
  } >&2
  exit 1
}

[[ -x "$VITEST" ]] || fail "missing runner $VITEST — run \`pnpm install\` first. Without it this gate cannot invoke anything, so nothing was verified."
[[ -f "$FIXTURE_CONFIG" ]] || fail "missing file $FIXTURE_CONFIG — the standalone config this gate invokes is absent, so nothing was verified."

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

REPORT1="$TMP_DIR/report1.json"
LOG1="$TMP_DIR/log1.txt"
REPORT2="$TMP_DIR/report2.json"
LOG2="$TMP_DIR/log2.txt"

# ---------------------------------------------------------------------------
# RUN 1: timeout-cascade — the fix proof.
# ---------------------------------------------------------------------------
NO_COLOR=1 "$VITEST" run --config "$FIXTURE_CONFIG" --reporter=verbose --reporter=json --outputFile="$REPORT1" \
  timeout-cascade >"$LOG1" 2>&1 || true

grep -qF -- "2 passed" <(grep -F "Tests" "$LOG1") || {
  cat "$LOG1"
  fail "run 1 (timeout-cascade) did not report exactly 2 passed tests (log above) — the short-@timeout and long-@timeout Scenarios sharing a slow BeforeAllScenarios must both pass under real concurrent execution."
}
echo "✓ run 1: both the short-@timeout and long-@timeout Scenarios passed under real concurrent execution"

node -e '
const fs = require("node:fs")
const report = JSON.parse(fs.readFileSync(process.argv[1], "utf8"))
const results = report.testResults.flatMap((tr) => tr.assertionResults)
if (results.length !== 2) {
  console.error("expected exactly 2 assertion results, got", results.length, JSON.stringify(results))
  process.exit(1)
}
for (const result of results) {
  if (result.status !== "passed") {
    console.error(result.title, "did not pass:", result.status, JSON.stringify(result.failureMessages))
    process.exit(1)
  }
  // The structural half: the 400ms shared setup must never land inside either Scenario'\''s OWN
  // measured duration. A generous 300ms ceiling — comfortably above real-machine jitter for a
  // Scenario whose own step body does nothing, comfortably below the 400ms setup cost were it to
  // leak in (the exact shape the OLD once-cell mechanism exhibited).
  if (typeof result.duration !== "number" || result.duration >= 300) {
    console.error(result.title, "reported duration", result.duration, "ms — expected well under 300ms; the shared 400ms setup may have leaked into this Scenario'\''s own budget")
    process.exit(1)
  }
}
' "$REPORT1" || {
  cat "$LOG1"
  fail "run 1's own JSON report failed the structural per-Scenario duration check above (log above for context)."
}
echo "✓ run 1: neither Scenario's own reported duration shows the 400ms shared setup — it ran outside both budgets entirely"

# ---------------------------------------------------------------------------
# RUN 2: failing-beforeall — the BEH-EC-017 preservation proof.
# ---------------------------------------------------------------------------
RUN2_EXIT=0
NO_COLOR=1 "$VITEST" run --config "$FIXTURE_CONFIG" --reporter=verbose --reporter=json --outputFile="$REPORT2" \
  failing-beforeall >"$LOG2" 2>&1 || RUN2_EXIT=$?

[[ "$RUN2_EXIT" != "0" ]] || {
  cat "$LOG2"
  fail "run 2 (failing-beforeall) exited 0 — a deliberately failing BeforeAllScenarios must fail the run. Log above."
}
echo "✓ run 2 exited non-zero, as a deliberately failing BeforeAllScenarios must"

grep -qF -- "2 failed" <(grep -F "Tests" "$LOG2") || {
  cat "$LOG2"
  fail "run 2 (failing-beforeall) did not report exactly 2 failed tests (log above) — a failing BeforeAllScenarios must fail BOTH Scenarios individually, not one suite-level failure with siblings skipped."
}
echo "✓ run 2: both Scenarios individually reported failed (never skipped)"

node -e '
const fs = require("node:fs")
const report = JSON.parse(fs.readFileSync(process.argv[1], "utf8"))
const results = report.testResults.flatMap((tr) => tr.assertionResults)
if (results.length !== 2) {
  console.error("expected exactly 2 assertion results (the naive \"beforeAll throws directly\" fix produces ZERO real Scenario results, every sibling marked skipped instead), got", results.length, JSON.stringify(results))
  process.exit(1)
}
const messages = new Set()
for (const result of results) {
  if (result.status !== "failed") {
    console.error(result.title, "was not reported failed:", result.status)
    process.exit(1)
  }
  const failure = (result.failureMessages ?? [])[0]
  if (typeof failure !== "string" || !failure.includes("BeforeAllScenarios blew up")) {
    console.error(result.title, "does not carry the expected failure message:", JSON.stringify(result.failureMessages))
    process.exit(1)
  }
  messages.add(failure)
}
if (messages.size !== 1) {
  console.error("the two Scenarios did not carry the IDENTICAL failure message:", JSON.stringify([...messages]))
  process.exit(1)
}
' "$REPORT2" || {
  cat "$LOG2"
  fail "run 2's own JSON report failed the structural per-Scenario failure-identity check above (log above for context)."
}
echo "✓ run 2: both Scenarios carry the IDENTICAL BeforeAllScenarios failure message — BEH-EC-017 holds under real concurrent execution"

echo ""
echo "concurrent-execution gate: ENFORCED"

#!/usr/bin/env bash
#
# ADR-EC-038's real, cross-run proof — three genuine `vitest run` invocations, never an in-process
# simulation, against `packages/vitest/test/rerun-fixture/` (excluded from every normal `vitest run`
# by the root and per-package `vitest.config.ts`, collected only through this fixture's own
# standalone `vitest.config.ts`, invoked here via `--config`):
#
#   1. A full run of `calculator-a`/`calculator-b` — two DIFFERENT `.feature` files sharing the
#      literal Feature name "Calculator" and the literal Scenario title "Adds two numbers", one
#      deliberately wrong (fails), one correct (passes). Vacuity control: exactly 1 failed, 1 passed.
#   2. The REAL, shipped `scripts/templates/write-rerun-manifest.mjs`, run UNMODIFIED over that run's
#      `--reporter=json` output — asserts the resulting manifest contains exactly ONE key, naming
#      `calculator-a.feature`'s own uri and never `calculator-b.feature`'s. This is rough edge 2's
#      fix, proven for real: two same-named Features in different files did not collide.
#   3. A SECOND real run, `RERUN_FAILED_ONLY=1` against that generated manifest, over the SAME two
#      files — `calculator-a` reruns its one real Scenario (failing again, unfixed);
#      `calculator-b`'s file shows ZERO real Scenario results and exactly one entry matching the
#      Feature-level synthetic skip node (rough edge 1's fix) instead — proven not to crash the run,
#      and proven not to fail it either (a skip-only file must not turn the run red on its own).
#   4. A THIRD real run, `RERUN_FAILED_ONLY=1` against `stale-manifest.feature` ALONE, fed a
#      HAND-CRAFTED manifest (not generated) naming a key under that file's own uri prefix but a
#      title matching no real Scenario in it — proves the Feature-level synthetic node AND
#      `StaleRerunManifestKeyWarning` fire together for a manifest entry that is genuinely stale
#      (a Scenario renamed/removed), distinct from case 3's "passed last run, so correctly absent."
#
# `--reporter=verbose` is combined with `--reporter=json --outputFile=...` on every invocation: the
# JSON report is what the structural (per-Scenario, per-key) assertions below parse, and the verbose
# reporter's own printed stdout/stderr is what the plain-text greps (the synthetic node's title, the
# stale-key warning, vitest's own crash phrasing) check — vitest supports multiple reporters in one
# invocation, and both are real output from the one real run, never a second, separate invocation.
#
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

VITEST="node_modules/.bin/vitest"
FIXTURE_CONFIG="packages/vitest/test/rerun-fixture/vitest.config.ts"
FIXTURE_DIR="packages/vitest/test/rerun-fixture"
WRITE_MANIFEST_SCRIPT="scripts/templates/write-rerun-manifest.mjs"

fail() {
  {
    echo ""
    echo "✗ rerun-failed-only gate: NOT ENFORCED"
    echo ""
    echo "  $1"
    echo ""
  } >&2
  exit 1
}

[[ -x "$VITEST" ]] || fail "missing runner $VITEST — run \`pnpm install\` first. Without it this gate cannot invoke anything, so nothing was verified."
[[ -f "$FIXTURE_CONFIG" ]] || fail "missing file $FIXTURE_CONFIG — the standalone config this gate invokes is absent, so nothing was verified."
[[ -f "$WRITE_MANIFEST_SCRIPT" ]] || fail "missing file $WRITE_MANIFEST_SCRIPT — the real, shipped write-side template this gate proves is absent."

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

REPORT1="$TMP_DIR/report1.json"
LOG1="$TMP_DIR/log1.txt"
MANIFEST="$TMP_DIR/manifest.json"
REPORT2="$TMP_DIR/report2.json"
LOG2="$TMP_DIR/log2.txt"
STALE_MANIFEST="$TMP_DIR/stale-manifest.json"
REPORT3="$TMP_DIR/report3.json"
LOG3="$TMP_DIR/log3.txt"

# The literal absolute path calculator-a/b/stale-manifest's own `.steps.test.ts` files hand to
# `loadFeature` (`fileURLToPath(new URL("./<name>.feature", import.meta.url))`) — this is what
# becomes `ParsedFeature.uri`, and therefore the first component of every rerun key below.
CALC_A_URI="$(cd "$FIXTURE_DIR" && pwd)/calculator-a.feature"
CALC_B_URI="$(cd "$FIXTURE_DIR" && pwd)/calculator-b.feature"
STALE_URI="$(cd "$FIXTURE_DIR" && pwd)/stale-manifest.feature"

# ---------------------------------------------------------------------------
# RUN 1: full run, RERUN_FAILED_ONLY unset — the vacuity control.
# ---------------------------------------------------------------------------
NO_COLOR=1 "$VITEST" run --config "$FIXTURE_CONFIG" --reporter=verbose --reporter=json --outputFile="$REPORT1" \
  calculator-a calculator-b >"$LOG1" 2>&1 || true

grep -qF -- "1 failed" <(grep -F "Tests" "$LOG1") || {
  cat "$LOG1"
  fail "run 1 (full run) did not report exactly 1 failed test (log above). Either the fixtures stopped failing/passing as designed, or the standalone config collected the wrong files entirely."
}
grep -qF -- "1 passed" <(grep -F "Tests" "$LOG1") || {
  cat "$LOG1"
  fail "run 1 (full run) did not report exactly 1 passed test (log above)."
}
echo "✓ run 1 vacuity control: calculator-a failed, calculator-b passed (1 failed, 1 passed)"

# ---------------------------------------------------------------------------
# STEP 2: the REAL, shipped write-side script, run unmodified over run 1's own JSON report.
# ---------------------------------------------------------------------------
node "$WRITE_MANIFEST_SCRIPT" "$REPORT1" "$MANIFEST" >/dev/null || {
  cat "$LOG1"
  fail "the real write-rerun-manifest.mjs script exited non-zero over run 1's own report."
}

[[ -f "$MANIFEST" ]] || fail "write-rerun-manifest.mjs did not write $MANIFEST."

MANIFEST_KEY_COUNT="$(node -e '
const fs = require("node:fs")
const manifest = JSON.parse(fs.readFileSync(process.argv[1], "utf8"))
process.stdout.write(String(manifest.failed.length))
' "$MANIFEST")"
[[ "$MANIFEST_KEY_COUNT" == "1" ]] || {
  cat "$MANIFEST"
  fail "the generated manifest names $MANIFEST_KEY_COUNT key(s), expected exactly 1 (calculator-a's own failing Scenario). Manifest contents above."
}
echo "✓ the generated manifest names exactly ONE key"

grep -qF -- "calculator-a.feature" "$MANIFEST" || {
  cat "$MANIFEST"
  fail "the generated manifest's one key does not name calculator-a.feature's own uri (manifest above)."
}
grep -qF -- "calculator-b.feature" "$MANIFEST" && {
  cat "$MANIFEST"
  fail "the generated manifest names calculator-b.feature — the PASSING Feature's key must never enter the manifest. Rough edge 2's fix is not proven (manifest above)."
}
echo "✓ rough edge 2: the manifest names calculator-a.feature's own key and never calculator-b.feature's"

# ---------------------------------------------------------------------------
# RUN 2: RERUN_FAILED_ONLY=1 against the GENERATED manifest, same two files.
# ---------------------------------------------------------------------------
RERUN_FAILED_ONLY=1 RERUN_MANIFEST_PATH="$MANIFEST" NO_COLOR=1 \
  "$VITEST" run --config "$FIXTURE_CONFIG" --reporter=verbose --reporter=json --outputFile="$REPORT2" \
  calculator-a calculator-b >"$LOG2" 2>&1 || true

grep -qF -- "No test found in suite" "$LOG2" && {
  cat "$LOG2"
  fail "run 2's own output contains vitest's own \"No test found in suite\" crash phrasing — rough edge 1 (an emptied describe block) is NOT fixed. Log above."
}
echo "✓ run 2 did not trip vitest's own \"No test found in suite\" crash"

grep -qF -- "↻ rerunFailedOnly:" "$LOG2" || {
  cat "$LOG2"
  fail "run 2's own output does not contain the Feature-level synthetic skip node's title (\"↻ rerunFailedOnly:\" prefix) for calculator-b, whose one Scenario the manifest correctly excludes. Log above."
}
echo "✓ calculator-b's emptied Feature block emitted the synthetic skip node"

grep -qF -- "1 failed" <(grep -F "Tests" "$LOG2") || {
  cat "$LOG2"
  fail "run 2 does not still report calculator-a's own Scenario failing again (still unfixed). Log above."
}
echo "✓ calculator-a's own Scenario re-ran and failed again, as expected (still unfixed)"

# THE STRUCTURAL CHECK, off run 2's own JSON report: calculator-a's file still names its one real
# Scenario assertion result; calculator-b's file names ZERO real Scenario results and exactly one
# entry whose title matches the synthetic node, with a status that does NOT fail the overall file
# (a skip-only file must not turn the run red on its own — "exit code handling is sane").
node -e '
const fs = require("node:fs")
const report = JSON.parse(fs.readFileSync(process.argv[1], "utf8"))
const byFile = new Map(report.testResults.map((tr) => [tr.name, tr]))

const a = [...byFile.entries()].find(([name]) => name.endsWith("calculator-a.steps.test.ts"))
const b = [...byFile.entries()].find(([name]) => name.endsWith("calculator-b.steps.test.ts"))
if (a === undefined || b === undefined) {
  console.error("run 2 report is missing one of the two expected test files")
  process.exit(1)
}

const [, aResult] = a
const [, bResult] = b

const aScenarios = aResult.assertionResults.filter((x) => x.title === "Adds two numbers")
if (aScenarios.length !== 1 || aScenarios[0].status !== "failed") {
  console.error("calculator-a.steps.test.ts did not show its one real Scenario, failing again:", JSON.stringify(aResult.assertionResults))
  process.exit(1)
}

const bRealScenarios = bResult.assertionResults.filter((x) => x.title === "Adds two numbers")
if (bRealScenarios.length !== 0) {
  console.error("calculator-b.steps.test.ts still shows its real Scenario — it should have been excluded at registration:", JSON.stringify(bResult.assertionResults))
  process.exit(1)
}

const bSynthetic = bResult.assertionResults.filter((x) => x.title.startsWith("↻ rerunFailedOnly:"))
if (bSynthetic.length !== 1) {
  console.error("calculator-b.steps.test.ts does not show exactly one synthetic skip node:", JSON.stringify(bResult.assertionResults))
  process.exit(1)
}

// A skip-only file must not fail the run on its own.
if (bResult.status === "failed") {
  console.error("calculator-b.steps.test.ts, containing only a skipped synthetic node, reported FAILED — a skip-only file must not fail the run")
  process.exit(1)
}
' "$REPORT2" || {
  cat "$LOG2"
  fail "run 2's own JSON report failed the structural per-file assertions above (log above for context)."
}
echo "✓ run 2's JSON report: calculator-a re-ran its one real Scenario, calculator-b shows zero real Scenarios and one non-failing synthetic node"

# ---------------------------------------------------------------------------
# RUN 3: RERUN_FAILED_ONLY=1 against stale-manifest ALONE, fed a HAND-CRAFTED (not generated)
# manifest naming a key under its own uri prefix but a title matching no real Scenario.
# ---------------------------------------------------------------------------
cat >"$STALE_MANIFEST" <<EOF
{ "failed": ["${STALE_URI}::::A Scenario That Was Renamed Or Removed"] }
EOF

RUN3_EXIT=0
RERUN_FAILED_ONLY=1 RERUN_MANIFEST_PATH="$STALE_MANIFEST" NO_COLOR=1 \
  "$VITEST" run --config "$FIXTURE_CONFIG" --reporter=verbose --reporter=json --outputFile="$REPORT3" \
  stale-manifest >"$LOG3" 2>&1 || RUN3_EXIT=$?

[[ "$RUN3_EXIT" == "0" ]] || {
  cat "$LOG3"
  fail "run 3 (stale-manifest alone) exited $RUN3_EXIT, expected 0 — a stale manifest key must degrade to a warning and a skip, never fail the run. Log above."
}
echo "✓ run 3 exited 0 — a stale manifest key did not fail the run"

grep -qF -- "No test found in suite" "$LOG3" && {
  cat "$LOG3"
  fail "run 3's own output contains vitest's own \"No test found in suite\" crash phrasing — rough edge 1 is NOT fixed for a stale (never-matching) manifest key. Log above."
}
echo "✓ run 3 did not trip vitest's own \"No test found in suite\" crash"

grep -qF -- "↻ rerunFailedOnly:" "$LOG3" || {
  cat "$LOG3"
  fail "run 3's own output does not contain the Feature-level synthetic skip node's title. Log above."
}
echo "✓ stale-manifest's emptied Feature block emitted the synthetic skip node"

grep -qF -- "StaleRerunManifestKey" "$LOG3" || {
  cat "$LOG3"
  fail "run 3's own output does not contain StaleRerunManifestKeyWarning's message (\"StaleRerunManifestKey\" substring) — a manifest key that matches no real Scenario must be reported, not silently ignored. Log above."
}
echo "✓ StaleRerunManifestKeyWarning fired for the genuinely stale key"

echo ""
echo "rerun-failed-only gate: ENFORCED"

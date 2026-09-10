#!/usr/bin/env bash
#
# Closes an audit gap: several scripts/verify-*.sh scripts already spawn a real CHILD `vitest`
# process (verify-watch-rerun.sh, verify-concurrent-execution.sh, verify-rerun-failed-only.sh,
# verify-sharding.sh, ...), but none of them ever turn `--coverage` on for that child. Whether
# vitest 5's v8 coverage provider — and this repository's per-file `thresholds` glob shape (see
# `packages/gherkin/vitest.config.ts`) — behave correctly for a vitest process invoked as a CHILD
# of another process (rather than as the top-level `pnpm coverage`) was unverified. This gate is
# the minimal, scoped proof:
#
#   1. A real child `vitest run --coverage` (never a global `vitest`) against the smallest package
#      (`packages/gherkin`, via `--root`) produces a coverage-summary.json that is non-empty and
#      CORRECTLY ATTRIBUTED — its per-file keys are real `packages/gherkin/src/*.ts` paths with a
#      non-zero, non-"Unknown" statements percentage, never a silently empty or all-zero report.
#   2. THE THRESHOLD CONTROL: the same child process, with an unattainable 100% `perFile`
#      threshold layered on top via CLI flags, exits non-zero and names a specific offending file
#      — proving per-file thresholds are actually enforced for a spawned child process, not
#      silently ignored the way an empty/misattributed report would make them.
#
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# Use the repo-local runner, never a global `vitest`.
VITEST="node_modules/.bin/vitest"
PACKAGE_ROOT="packages/gherkin"

fail() {
  {
    echo ""
    echo "✗ coverage-subprocess gate: NOT ENFORCED"
    echo ""
    echo "  $1"
    echo ""
  } >&2
  exit 1
}

[[ -x "$VITEST" ]] || fail "missing runner $VITEST — run \`pnpm install\` first. Without it this gate cannot invoke anything, so nothing was verified."
[[ -f "$PACKAGE_ROOT/vitest.config.ts" ]] || fail "missing file $PACKAGE_ROOT/vitest.config.ts — the config this gate's child process resolves is absent, so nothing was verified."

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

COVERAGE_DIR_1="$TMP_DIR/coverage-1"
LOG1="$TMP_DIR/run1.log"
COVERAGE_DIR_2="$TMP_DIR/coverage-2"
LOG2="$TMP_DIR/run2.log"

# ---------------------------------------------------------------------------
# RUN 1: a real child `vitest run --coverage`, scoped to packages/gherkin via `--root` so it picks
# up that package's own `vitest.config.ts` (provider, `include`, and default 90%/90% thresholds)
# exactly as `pnpm -F @effect-cucumber/gherkin test -- --coverage` would.
# ---------------------------------------------------------------------------
NO_COLOR=1 "$VITEST" run --root "$PACKAGE_ROOT" --coverage \
  --coverage.reportsDirectory="$COVERAGE_DIR_1" --coverage.reporter=json-summary \
  >"$LOG1" 2>&1 || {
  cat "$LOG1"
  fail "run 1 (child \`vitest run --coverage\` against $PACKAGE_ROOT) exited non-zero — a plain coverage run against passing tests and this package's own thresholds must succeed (log above)."
}
echo "✓ run 1: child \`vitest run --coverage\` against $PACKAGE_ROOT exited 0"

SUMMARY_1="$COVERAGE_DIR_1/coverage-summary.json"
[[ -s "$SUMMARY_1" ]] || {
  cat "$LOG1"
  fail "run 1 wrote no (or an empty) $SUMMARY_1 — the child process's coverage report is silently missing (log above)."
}
echo "✓ run 1: $SUMMARY_1 exists and is non-empty"

node -e '
const fs = require("node:fs")
const path = require("node:path")
const summary = JSON.parse(fs.readFileSync(process.argv[1], "utf8"))
const expectedDir = path.resolve(process.argv[2])
const fileKeys = Object.keys(summary).filter((key) => key !== "total")

if (fileKeys.length === 0) {
  console.error("coverage-summary.json carries zero per-file entries besides \"total\" — an empty report, not one covering real source")
  process.exit(1)
}

const misattributed = fileKeys.filter((key) => !key.startsWith(expectedDir + path.sep))
if (misattributed.length > 0) {
  console.error("entries not attributed under", expectedDir, ":", JSON.stringify(misattributed))
  process.exit(1)
}

const total = summary.total
if (typeof total.statements.pct !== "number" || total.statements.pct <= 0) {
  console.error("total.statements.pct is", JSON.stringify(total.statements.pct), "— expected a positive number, not zero/\"Unknown\"/missing")
  process.exit(1)
}
if (total.statements.covered <= 0 || total.lines.covered <= 0) {
  console.error("total statements/lines covered counts are non-positive:", JSON.stringify(total))
  process.exit(1)
}
' "$SUMMARY_1" "$ROOT_DIR/$PACKAGE_ROOT/src" || {
  fail "run 1's own coverage-summary.json failed the structural attribution check above."
}
echo "✓ run 1: coverage-summary.json is correctly attributed to $PACKAGE_ROOT/src with a positive statements pct"

# ---------------------------------------------------------------------------
# RUN 2: THE THRESHOLD CONTROL. Same child process, same package, with an unattainable 100%
# `perFile` threshold layered on via CLI flags. Must fail — and must fail BY NAME.
# ---------------------------------------------------------------------------
RUN2_EXIT=0
NO_COLOR=1 "$VITEST" run --root "$PACKAGE_ROOT" --coverage \
  --coverage.reportsDirectory="$COVERAGE_DIR_2" --coverage.reporter=json-summary \
  --coverage.thresholds.perFile \
  --coverage.thresholds.statements=100 --coverage.thresholds.branches=100 \
  --coverage.thresholds.lines=100 --coverage.thresholds.functions=100 \
  >"$LOG2" 2>&1 || RUN2_EXIT=$?

[[ "$RUN2_EXIT" != "0" ]] || {
  cat "$LOG2"
  fail "run 2 (unattainable 100% per-file threshold) exited 0 — per-file thresholds are not being enforced for a spawned child \`vitest\` process at all (log above)."
}
echo "✓ run 2 exited non-zero — the unattainable per-file threshold was enforced"

grep -qE 'does not meet global threshold \(100%\) for .*src/.+\.ts' "$LOG2" || {
  cat "$LOG2"
  fail "run 2 exited non-zero but its output names no specific offending src/*.ts file (log above) — thresholds must fail BY FILE, not vacuously."
}
echo "✓ run 2: failure output names specific offending file(s) under $PACKAGE_ROOT/src"

echo ""
echo "coverage-subprocess gate: ENFORCED"

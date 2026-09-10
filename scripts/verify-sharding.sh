#!/usr/bin/env bash
#
# Closes the sharding gap: no CI job or script previously ran the suite with `--shard` plus
# `--merge-reports`, so shard-safety of the wrapper's per-file describe/beforeAll structure — the
# module-scoped `ManagedRuntime` for collection-time `loadFeature` calls (ADR-EC-024) and
# `BeforeAllScenarios`'s real vitest `beforeAll` (ADR-EC-040) — was unverified. Both are built fresh
# inside whichever worker process collects a given test file; sharding is the one execution mode
# that guarantees DIFFERENT files land in DIFFERENT, wholly separate `vitest run` invocations (never
# just different workers of one invocation), so it is the strongest available proof that neither
# structure leaks state across files or depends on every file being collected by the same process.
#
# Three genuine `vitest run` invocations against `@effect-cucumber/vitest`'s own real suite (the
# package's own `vitest.config.ts`, its normal excludes — the fixture directories intact):
#
#   1. `--shard=1/2 --reporter=blob` — this shard's own tests, written as a blob report.
#   2. `--shard=2/2 --reporter=blob` — the complementary shard, written as a second blob report.
#   3. `--mergeReports=<blobs dir>` — vitest's own merge of the two blob reports into one, taken as
#      `--reporter=json`.
#
# Compared against a FOURTH, plain unsharded `vitest run --reporter=json` of the same suite: the
# merged report's total/passed/failed/pending test counts and file count must match the unsharded
# run's exactly. A vacuity control on top: the unsharded run's own total must be non-zero, and each
# shard's own count must be non-zero — otherwise an empty or all-in-one-shard split would make the
# main comparison pass without proving anything.
#
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

VITEST="node_modules/.bin/vitest"
PACKAGE_CONFIG="packages/vitest/vitest.config.ts"

fail() {
  {
    echo ""
    echo "✗ sharding gate: NOT ENFORCED"
    echo ""
    echo "  $1"
    echo ""
  } >&2
  exit 1
}

[[ -x "$VITEST" ]] || fail "missing runner $VITEST — run \`pnpm install\` first. Without it this gate cannot invoke anything, so nothing was verified."
[[ -f "$PACKAGE_CONFIG" ]] || fail "missing file $PACKAGE_CONFIG — the config this gate invokes is absent, so nothing was verified."

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

BLOB_DIR="$TMP_DIR/blobs"
mkdir -p "$BLOB_DIR"

SUMMARY_1="$TMP_DIR/summary-1.json"
LOG_1="$TMP_DIR/log-1.txt"
SUMMARY_2="$TMP_DIR/summary-2.json"
LOG_2="$TMP_DIR/log-2.txt"
MERGED="$TMP_DIR/merged.json"
LOG_MERGE="$TMP_DIR/log-merge.txt"
UNSHARDED="$TMP_DIR/unsharded.json"
LOG_UNSHARDED="$TMP_DIR/log-unsharded.txt"

count_field() {
  node -e '
    const fs = require("node:fs")
    const report = JSON.parse(fs.readFileSync(process.argv[1], "utf8"))
    const field = process.argv[2]
    const value = field === "numTestFiles" ? report.testResults.length : report[field]
    if (typeof value !== "number") {
      console.error(field, "is not a number in", process.argv[1], ":", JSON.stringify(value))
      process.exit(1)
    }
    console.log(String(value))
  ' "$1" "$2"
}

# ---------------------------------------------------------------------------
# SHARD 1/2 — a real, standalone `vitest run` invocation.
# ---------------------------------------------------------------------------
NO_COLOR=1 "$VITEST" run --config "$PACKAGE_CONFIG" --shard=1/2 \
  --reporter=blob --reporter=json \
  --outputFile.blob="$BLOB_DIR/shard-1.blob.json" --outputFile.json="$SUMMARY_1" \
  >"$LOG_1" 2>&1 || true

[[ -f "$SUMMARY_1" ]] || {
  cat "$LOG_1"
  fail "shard 1/2 did not write its own JSON summary to $SUMMARY_1 (log above) — the invocation did not get far enough to report anything."
}
SHARD_1_TOTAL="$(count_field "$SUMMARY_1" numTotalTests)"
[[ "$SHARD_1_TOTAL" -gt 0 ]] || {
  cat "$LOG_1"
  fail "shard 1/2 reported 0 tests (log above) — an empty shard makes the comparison below vacuous; the split put nothing on this shard."
}
echo "✓ shard 1/2 ran $SHARD_1_TOTAL test(s) as its own, standalone \`vitest run\`"

# ---------------------------------------------------------------------------
# SHARD 2/2 — the complementary, equally standalone invocation.
# ---------------------------------------------------------------------------
NO_COLOR=1 "$VITEST" run --config "$PACKAGE_CONFIG" --shard=2/2 \
  --reporter=blob --reporter=json \
  --outputFile.blob="$BLOB_DIR/shard-2.blob.json" --outputFile.json="$SUMMARY_2" \
  >"$LOG_2" 2>&1 || true

[[ -f "$SUMMARY_2" ]] || {
  cat "$LOG_2"
  fail "shard 2/2 did not write its own JSON summary to $SUMMARY_2 (log above) — the invocation did not get far enough to report anything."
}
SHARD_2_TOTAL="$(count_field "$SUMMARY_2" numTotalTests)"
[[ "$SHARD_2_TOTAL" -gt 0 ]] || {
  cat "$LOG_2"
  fail "shard 2/2 reported 0 tests (log above) — an empty shard makes the comparison below vacuous; the split put everything on shard 1/2 instead."
}
echo "✓ shard 2/2 ran $SHARD_2_TOTAL test(s) as its own, standalone \`vitest run\`"

# ---------------------------------------------------------------------------
# MERGE — vitest's own `--mergeReports`, over the two real blob reports above.
# ---------------------------------------------------------------------------
NO_COLOR=1 "$VITEST" run --config "$PACKAGE_CONFIG" --mergeReports="$BLOB_DIR" \
  --reporter=json --outputFile="$MERGED" \
  >"$LOG_MERGE" 2>&1 || true

[[ -f "$MERGED" ]] || {
  cat "$LOG_MERGE"
  fail "\`vitest --mergeReports\` did not write a merged JSON report to $MERGED (log above)."
}
echo "✓ the two shards' blob reports merged into one report via \`vitest --mergeReports\`"

# ---------------------------------------------------------------------------
# CONTROL — the same suite, one plain unsharded `vitest run`.
# ---------------------------------------------------------------------------
NO_COLOR=1 "$VITEST" run --config "$PACKAGE_CONFIG" \
  --reporter=json --outputFile="$UNSHARDED" \
  >"$LOG_UNSHARDED" 2>&1 || true

[[ -f "$UNSHARDED" ]] || {
  cat "$LOG_UNSHARDED"
  fail "the unsharded control run did not write a JSON report to $UNSHARDED (log above)."
}

UNSHARDED_TOTAL="$(count_field "$UNSHARDED" numTotalTests)"
[[ "$UNSHARDED_TOTAL" -gt 0 ]] || {
  cat "$LOG_UNSHARDED"
  fail "the unsharded control run reported 0 tests (log above) — with nothing to compare against, a matching merged count would be vacuous. Check $PACKAGE_CONFIG's include/exclude."
}
echo "✓ unsharded control ran $UNSHARDED_TOTAL test(s)"

# ---------------------------------------------------------------------------
# THE CLAIM — merged counts equal the unsharded control's, field by field.
# ---------------------------------------------------------------------------
for FIELD in numTotalTests numPassedTests numFailedTests numPendingTests numTestFiles; do
  MERGED_VALUE="$(count_field "$MERGED" "$FIELD")"
  UNSHARDED_VALUE="$(count_field "$UNSHARDED" "$FIELD")"
  [[ "$MERGED_VALUE" == "$UNSHARDED_VALUE" ]] || {
    cat "$LOG_MERGE"
    fail "merged $FIELD ($MERGED_VALUE) != unsharded $FIELD ($UNSHARDED_VALUE) — sharding the suite changed what ran or how it was reported. merge log above."
  }
  echo "✓ merged $FIELD ($MERGED_VALUE) matches the unsharded control"
done

echo ""
echo "sharding gate: ENFORCED"

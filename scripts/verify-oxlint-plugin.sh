#!/usr/bin/env bash
#
# Asserts the vendored Effect oxlint rules are LOADED and build-breaking, so
# AGENTS.md §3 (submodule namespace imports) is a mechanical gate. `pnpm lint`
# exiting 0 cannot prove it: an unresolvable jsPlugins specifier produces the same
# silent, clean run. Positive control: a compliant import lints clean; the negative:
# a barrel import fails naming effect(no-import-from-barrel-package).
#
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# Spelled out in full rather than composed, so these paths stay greppable.
PLUGIN_ENTRY="tools/oxlint/effect/index.ts"
PROBE_DIR=".oxlint-probe"
BAD_PROBE="$PROBE_DIR/barrel-import.ts"
OK_PROBE="$PROBE_DIR/submodule-import.ts"

# The rule ID must match upstream's, which depends on the plugin `name` staying
# "effect" in .oxlintrc.json. A rename silently changes this ID.
RULE_ID="effect(no-import-from-barrel-package)"

OXLINT="pnpm exec oxlint --no-ignore -f unix"

cleanup() { rm -rf "$ROOT_DIR/$PROBE_DIR"; }
trap cleanup EXIT

fail() {
  echo ""
  echo "✗ oxlint effect plugin: NOT ENFORCED"
  echo ""
  echo "  $1"
  echo ""
  exit 1
}

[[ -f "$PLUGIN_ENTRY" ]] || fail "missing $PLUGIN_ENTRY — the vendored plugin is absent (is tools/ committed?), so nothing was verified."

mkdir -p "$PROBE_DIR"

# ---------------------------------------------------------------------------
# Assertion 1: positive control. A submodule namespace import — the style
# ---------------------------------------------------------------------------
cat > "$OK_PROBE" <<'EOF'
import * as Effect from "effect/Effect"
export const ok = Effect
EOF

OK_OUTPUT="$($OXLINT "$OK_PROBE" 2>&1)" && OK_EXIT=0 || OK_EXIT=$?

if [[ "$OK_EXIT" -ne 0 ]]; then
  echo "$OK_OUTPUT"
  fail "the mandated import style (import * as Effect from \"effect/Effect\") was itself rejected — the rule is misconfigured, not the code."
fi
echo "✓ positive control: submodule namespace import lints clean"

# ---------------------------------------------------------------------------
# Assertion 2: THE GATE. A barrel import fails the lint, by name.
# ---------------------------------------------------------------------------
cat > "$BAD_PROBE" <<'EOF'
import { Effect } from "effect"
export const bad = Effect
EOF

BAD_OUTPUT="$($OXLINT "$BAD_PROBE" 2>&1)" && BAD_EXIT=0 || BAD_EXIT=$?

if [[ "$BAD_EXIT" -eq 0 ]]; then
  echo "$BAD_OUTPUT"
  fail "a barrel import from \"effect\" was NOT flagged — the vendored plugin did not load. Check the jsPlugins specifier in .oxlintrc.json, that tools/oxlint/effect/ exists, and that @oxlint/plugins is installed at a version matching oxlint."
fi

if ! grep -qF "$RULE_ID" <<<"$BAD_OUTPUT"; then
  echo "$BAD_OUTPUT"
  fail "the lint failed, but not as $RULE_ID — check whether the plugin \`name\` in .oxlintrc.json still reads \"effect\", or whether the rule was renamed upstream."
fi
echo "✓ a barrel import from \"effect\" fails the lint (exit $BAD_EXIT) as $RULE_ID"

echo ""
echo "oxlint effect plugin: ENFORCED"

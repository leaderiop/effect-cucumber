#!/usr/bin/env bash
#
# Proves scripts/templates/oxlint-ref-state/ actually catches what it claims to, against REAL
# oxlint output — not just its own vitest unit tests (scripts/templates/oxlint-ref-state/test/),
# which exercise the rule's visitor functions directly and never prove the plugin actually LOADS
# under oxlint's jsPlugins loader. This is the template's own analog of
# scripts/verify-oxlint-plugin.sh (which proves the vendored tools/oxlint/effect/ plugin the same
# way). This repository ALSO loads scripts/templates/oxlint-ref-state/ against its own acceptance
# suite now (.oxlintrc.json's overrides, scoped to packages/vitest/test/acceptance/**, alongside
# scripts/verify-acceptance-ref-state.sh — see ADR-EC-042's Correction), but that dogfooding alone
# would only prove the rule against whatever this repo's own suite happens to contain. This script
# stays: a standalone probe with a deliberately minimal config proves the template is genuinely
# self-contained and portable — exactly what a consumer experiences copying it fresh — independent
# of anything this repo's own .oxlintrc.json happens to configure.
#
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# Spelled out in full rather than composed, so these paths stay greppable.
PLUGIN_ENTRY="scripts/templates/oxlint-ref-state/index.ts"
PROBE_DIR=".oxlint-ref-state-probe"
PROBE_CONFIG="$PROBE_DIR/.oxlintrc.json"
DECLARATION_PROBE="$PROBE_DIR/mutable-declaration.ts"
MUTATION_PROBE="$PROBE_DIR/in-place-mutation.ts"
OK_PROBE="$PROBE_DIR/ref-shaped.ts"

RULE_ID="effect-cucumber(ref-state-only)"

OXLINT="pnpm exec oxlint --no-ignore -f unix -c $PROBE_CONFIG"

cleanup() { rm -rf "$ROOT_DIR/$PROBE_DIR"; }
trap cleanup EXIT

fail() {
  echo ""
  echo "✗ ref-state-only oxlint template: NOT ENFORCED"
  echo ""
  echo "  $1"
  echo ""
  exit 1
}

[[ -f "$PLUGIN_ENTRY" ]] || fail "missing $PLUGIN_ENTRY — the template plugin is absent, so nothing was verified."

mkdir -p "$PROBE_DIR"

# A standalone config, not this repo's own .oxlintrc.json — deliberately: this proves the template
# is self-contained and portable, the same experience a consumer gets copying it fresh, rather than
# only proving it works within this repo's own particular configuration (which .oxlintrc.json's own
# overrides block, scoped to packages/vitest/test/acceptance/**, separately dogfoods).
cat > "$PROBE_CONFIG" <<EOF
{
  "jsPlugins": [
    { "name": "effect-cucumber", "specifier": "$ROOT_DIR/$PLUGIN_ENTRY" }
  ],
  "rules": {
    "effect-cucumber/ref-state-only": "error"
  }
}
EOF

# ---------------------------------------------------------------------------
# Assertion 1: positive control. Ref-shaped state — no let/var, no in-place mutation — lints clean.
# ---------------------------------------------------------------------------
cat > "$OK_PROBE" <<'EOF'
export const record = (items: ReadonlyArray<string>, next: string): ReadonlyArray<string> => [...items, next]
EOF

OK_OUTPUT="$($OXLINT "$OK_PROBE" 2>&1)" && OK_EXIT=0 || OK_EXIT=$?

if [[ "$OK_EXIT" -ne 0 ]]; then
  echo "$OK_OUTPUT"
  fail "Ref-shaped, spread-only state was itself rejected — the rule is misconfigured, not the code."
fi
echo "✓ positive control: Ref-shaped state (const + spread, no in-place mutation) lints clean"

# ---------------------------------------------------------------------------
# Assertion 2: a let/var declaration fails the lint, by name.
# ---------------------------------------------------------------------------
cat > "$DECLARATION_PROBE" <<'EOF'
let count = 0
export const bump = () => {
  count = count + 1
  return count
}
EOF

DECL_OUTPUT="$($OXLINT "$DECLARATION_PROBE" 2>&1)" && DECL_EXIT=0 || DECL_EXIT=$?

if [[ "$DECL_EXIT" -eq 0 ]]; then
  echo "$DECL_OUTPUT"
  fail "a top-level \"let\" was NOT flagged — the template plugin did not load. Check the jsPlugins specifier and that @oxlint/plugins is installed at a version matching oxlint."
fi
if ! grep -qF "$RULE_ID" <<<"$DECL_OUTPUT"; then
  echo "$DECL_OUTPUT"
  fail "the lint failed, but not as $RULE_ID — check whether the plugin \`name\` in the probe config still reads \"effect-cucumber\", or whether the rule was renamed."
fi
echo "✓ a top-level \"let\" fails the lint (exit $DECL_EXIT) as $RULE_ID"

# ---------------------------------------------------------------------------
# Assertion 3: an in-place mutator call fails the lint, by name.
# ---------------------------------------------------------------------------
cat > "$MUTATION_PROBE" <<'EOF'
export const items: Array<string> = []
export const record = (next: string) => {
  items.push(next)
}
EOF

MUT_OUTPUT="$($OXLINT "$MUTATION_PROBE" 2>&1)" && MUT_EXIT=0 || MUT_EXIT=$?

if [[ "$MUT_EXIT" -eq 0 ]]; then
  echo "$MUT_OUTPUT"
  fail "items.push(...) was NOT flagged — the mutator-call check did not fire."
fi
if ! grep -qF "$RULE_ID" <<<"$MUT_OUTPUT"; then
  echo "$MUT_OUTPUT"
  fail "the lint failed, but not as $RULE_ID."
fi
echo "✓ an in-place .push(...) call fails the lint (exit $MUT_EXIT) as $RULE_ID"

echo ""
echo "ref-state-only oxlint template: ENFORCED"

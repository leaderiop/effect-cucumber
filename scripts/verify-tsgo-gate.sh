#!/usr/bin/env bash
#
# Asserts that ADR-EC-016's @effect/tsgo diagnostics are a BUILD GATE, not advice.
#
# The core value of this project is that a step needing a service the ambient
# Layer does not provide is a type error at authoring time. That claim rests
# entirely on Effect diagnostics failing `tsc`. Nothing enforces it unless
# something does — this script is that something.
#
# METHOD NOTE (do not weaken this):
#   Grepping compiler output for `effect(...)` does NOT prove the gate. With
#   `ignoreEffectErrorsInTscExitCode: true`, tsc still PRINTS every Effect
#   diagnostic verbatim and exits 0. Output is byte-identical either way. The
#   only signal that distinguishes an enforced gate from advisory commentary
#   is the EXIT CODE of a file whose sole defect is an Effect diagnostic.
#   That is what assertion 3 does, and it is the load-bearing assertion here.
#
# Usage: bash scripts/verify-tsgo-gate.sh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

FIXTURE="packages/vitest/test/tsgo-gate"
NEG_CONFIG="$FIXTURE/tsconfig.json"
OK_CONFIG="$FIXTURE/tsconfig.ok.json"
FLOATING_CONFIG="$FIXTURE/tsconfig.floating.json"

# Use the repo-local, effect-tsgo-patched compiler, never a global `tsc`.
TSC="node node_modules/typescript/bin/tsc"

fail() {
  echo ""
  echo "✗ tsgo gate: NOT ENFORCED"
  echo ""
  echo "  $1"
  echo ""
  exit 1
}

for f in "$NEG_CONFIG" "$OK_CONFIG" "$FLOATING_CONFIG"; do
  [[ -f "$f" ]] || fail "missing fixture config $f — the gate fixture is absent, so nothing was verified."
done

# ---------------------------------------------------------------------------
# Assertion 1: the positive control compiles clean.
# Discriminates a working gate from one that simply always fails.
# ---------------------------------------------------------------------------
OK_OUTPUT="$($TSC -p "$OK_CONFIG" 2>&1)" && OK_EXIT=0 || OK_EXIT=$?

if [[ "$OK_EXIT" -ne 0 ]]; then
  echo "$OK_OUTPUT"
  fail "positive control failed to compile — the gate fixture is broken, not the gate."
fi
echo "✓ positive control (satisfied.ts) compiles clean"

# ---------------------------------------------------------------------------
# Assertion 2: floating-effect.ts is valid TypeScript.
# Establishes the premise assertion 3 depends on: every diagnostic on this file
# must be in the TS377xxx Effect range. If plain TypeScript ever starts
# rejecting it, its non-zero exit would no longer isolate the Effect layer.
# ---------------------------------------------------------------------------
FLOATING_OUTPUT="$($TSC -p "$FLOATING_CONFIG" 2>&1)" && FLOATING_EXIT=0 || FLOATING_EXIT=$?

FLOATING_CODES="$(grep -oE "error TS[0-9]+" <<<"$FLOATING_OUTPUT" | grep -oE "TS[0-9]+" || true)"

if [[ -z "$FLOATING_CODES" ]]; then
  echo "$FLOATING_OUTPUT"
  fail "no diagnostics at all on floating-effect.ts — the Effect-aware probe did not fire. Note the fixture must live under a directory named 'src': @effect/tsgo enables floatingEffect at error severity only for paths matching src/**/*.ts."
fi

NON_EFFECT_CODES="$(grep -v -E "^TS377[0-9]+$" <<<"$FLOATING_CODES" || true)"

if [[ -n "$NON_EFFECT_CODES" ]]; then
  echo "$FLOATING_OUTPUT"
  fail "floating-effect.ts emitted non-Effect diagnostics ($(tr '\n' ' ' <<<"$NON_EFFECT_CODES" | sed 's/ $//')) — it is no longer valid TypeScript, so its exit code would no longer isolate the Effect layer."
fi

if ! grep -q "effect(floatingEffect)" <<<"$FLOATING_OUTPUT"; then
  echo "$FLOATING_OUTPUT"
  fail "effect(floatingEffect) not reported — check whether the diagnostic was renamed or downgraded."
fi
echo "✓ floating-effect.ts is valid TypeScript, flagged only by effect(floatingEffect)"

# ---------------------------------------------------------------------------
# Assertion 3: THE GATE. An Effect diagnostic, on its own, fails the build.
#
# floating-effect.ts carries no TypeScript error (assertion 2). So a non-zero
# exit here can only originate from @effect/tsgo counting its own diagnostic
# toward the exit code — i.e. ignoreEffectErrorsInTscExitCode is false, as
# ADR-EC-016 requires. Flip that flag and this assertion is the one that trips;
# every grep-based check still passes, because the output does not change.
# ---------------------------------------------------------------------------
if [[ "$FLOATING_EXIT" -eq 0 ]]; then
  fail "Effect diagnostics are reported but do NOT fail the build — ADR-EC-016's gate is not enforced. tsc printed effect(floatingEffect) and still exited 0; check ignoreEffectErrorsInTscExitCode / ignoreEffectWarningsInTscExitCode in tsconfig.base.json."
fi
echo "✓ an Effect diagnostic alone fails the build (exit $FLOATING_EXIT) — gate is load-bearing"

# ---------------------------------------------------------------------------
# Assertion 4: the Layer-context guarantee specifically.
# This is the diagnostic the whole project depends on: a Layer with an
# unhandled requirement must be rejected at authoring time.
# ---------------------------------------------------------------------------
NEG_OUTPUT="$($TSC -p "$NEG_CONFIG" 2>&1)" && NEG_EXIT=0 || NEG_EXIT=$?

if [[ "$NEG_EXIT" -eq 0 ]]; then
  echo "$NEG_OUTPUT"
  fail "the negative fixture compiled successfully — a Layer with an unprovided requirement was accepted."
fi

if ! grep -q "effect(missingLayerContext)" <<<"$NEG_OUTPUT"; then
  echo "$NEG_OUTPUT"
  fail "build failed, but not for the Layer-context reason — check whether the diagnostic was renamed or downgraded."
fi
echo "✓ an unprovided Layer requirement is rejected by name: effect(missingLayerContext)"

echo ""
echo "tsgo gate: ENFORCED"

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
#   The converse holds too, and assertions 4 and 6 are why the rule is
#   "exit code AND a specific diagnostic name", never output text alone and
#   never an exit code alone. An exit code proves only that SOMETHING was
#   rejected; a step can keep failing to compile for a plain shape reason
#   long after the Effect diagnostic has stopped covering it. Every negative
#   assertion below therefore checks the exit code first and then greps for
#   the diagnostic it is actually about, by name.
#
# Usage: bash scripts/verify-tsgo-gate.sh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# Spelled out in full rather than composed from a $FIXTURE variable, so these
# paths are greppable for traceability checks.
NEG_CONFIG="packages/vitest/test/tsgo-gate/tsconfig.json"
OK_CONFIG="packages/vitest/test/tsgo-gate/tsconfig.ok.json"
FLOATING_CONFIG="packages/vitest/test/tsgo-gate/tsconfig.floating.json"
STEP_OK_CONFIG="packages/vitest/test/tsgo-gate/tsconfig.step-ok.json"
STEP_NEG_CONFIG="packages/vitest/test/tsgo-gate/tsconfig.step-missing.json"
WORLD_FIELD_CONFIG="packages/vitest/test/tsgo-gate/tsconfig.world-field.json"
LAYER_RIN_CONFIG="packages/vitest/test/tsgo-gate/tsconfig.layer-rin.json"
STEP_EXPECT_ERROR_CONFIG="packages/vitest/test/tsgo-gate/tsconfig.step-expect-error.json"
STEP_TABLE_ANNOTATION_CONFIG="packages/vitest/test/tsgo-gate/tsconfig.step-table-annotation.json"
HOOK_OK_CONFIG="packages/vitest/test/tsgo-gate/tsconfig.hook-ok.json"
HOOK_NEG_CONFIG="packages/vitest/test/tsgo-gate/tsconfig.hook-missing.json"
RULE_OK_CONFIG="packages/vitest/test/tsgo-gate/tsconfig.rule-ok.json"
RULE_NEG_CONFIG="packages/vitest/test/tsgo-gate/tsconfig.rule-missing.json"

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

for f in "$NEG_CONFIG" "$OK_CONFIG" "$FLOATING_CONFIG" "$STEP_OK_CONFIG" "$STEP_NEG_CONFIG" \
  "$WORLD_FIELD_CONFIG" "$LAYER_RIN_CONFIG" "$STEP_EXPECT_ERROR_CONFIG" "$HOOK_OK_CONFIG" \
  "$HOOK_NEG_CONFIG" "$RULE_OK_CONFIG" \
  "$RULE_NEG_CONFIG" "$STEP_TABLE_ANNOTATION_CONFIG"; do
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

# ---------------------------------------------------------------------------
# Assertions 5 and 6: THE SATISFIED/STARVED FLIP PAIR.
#
# Assertions 1-4 cover the Layer type in isolation. These two cover the thing a
# test author actually writes: a step registered through `describeFeature`'s dsl.
#
# step-satisfied.ts and step-missing-service.ts are deliberate near-twins. The
# satisfied one registers `yield* (yield* Db).clear` against
# `{ shared: Db.layer, perScenario: World.layer }`; the starved one registers the
# same body against a plain `World.layer`. Whether the ambient Layer provides the
# service the step needs is the ONLY substantive difference between them.
#
# So asserting both in the same run is what proves roadmap success criterion 1 —
# that removing a service from an ambient Layer flips a previously-passing case to
# failing. It is deliberately a committed PAIR rather than a script that edits a
# file and recompiles: there is no mutable working tree, no cleanup path that can
# leave the repo dirty, and the flip is re-proven on every CI run instead of once
# at authoring time. A pair cannot silently decay into a no-op the way a
# self-mutating script can.
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Assertion 5: the DSL positive control compiles clean.
# Discriminates a working guarantee from a dsl that simply rejects everything —
# the same role assertion 1 plays for the Layer fixtures.
# ---------------------------------------------------------------------------
STEP_OK_OUTPUT="$($TSC -p "$STEP_OK_CONFIG" 2>&1)" && STEP_OK_EXIT=0 || STEP_OK_EXIT=$?

if [[ "$STEP_OK_EXIT" -ne 0 ]]; then
  echo "$STEP_OK_OUTPUT"
  fail "the DSL positive control failed to compile — a scoped step (Effect.acquireRelease) or an already-Effect.fn-wrapped step was wrongly rejected. Either the fixture is broken, or Scope.Scope left the step type in Dsl.ts (note (b)): a step using acquireRelease must still compile against a PLAIN Layer, because the runner provides the Scope. Do not add \`any\` to the fixture to make this pass — one \`any\` in a step body is assignable to everything and disables the whole guarantee."
fi
echo "✓ DSL positive control compiles clean (scoped + wrapped steps, both containers, both Layer forms)"

# ---------------------------------------------------------------------------
# Assertion 6: THE DSL-01 GUARANTEE — the project's core value, by name.
#
# A step whose Effect requires a service the ambient Layer does not provide must
# be a type error where the step is written. Two checks, never one: the exit code
# proves it was rejected, the diagnostic name proves it was rejected FOR THE RIGHT
# REASON. Dropping the second check leaves an assertion that keeps passing while
# covering nothing, which is the exact decay this whole script exists to prevent.
# ---------------------------------------------------------------------------
STEP_NEG_OUTPUT="$($TSC -p "$STEP_NEG_CONFIG" 2>&1)" && STEP_NEG_EXIT=0 || STEP_NEG_EXIT=$?

if [[ "$STEP_NEG_EXIT" -eq 0 ]]; then
  echo "$STEP_NEG_OUTPUT"
  fail "a step requiring an unprovided service COMPILED — INV-EC-003 is decorative and this project's core value is not enforced. Most likely cause: the step-parameter generic in Dsl.ts degraded to a vacuous \`any\` (PITFALLS Pitfall 4) — e.g. the generator branch written as Generator<any, A, any>, which accepts a body requiring anything."
fi

# NOTE: missingEffectContext, NOT missingLayerContext. These are different
# diagnostics on different fixtures and must not be "harmonized" with assertion
# 4's grep above. Assertion 4 is about the LAYER ARGUMENT's unhandled RIn;
# this one is about a STEP's required context. Copying assertion 4's name here
# produces an assertion that fails for the wrong reason, which then invites
# someone to weaken the grep until it passes. RESEARCH.md Finding 1 reproduced
# both, and the negative fixture's output contains TS377004 and no
# missingLayerContext at all.
if ! grep -q "effect(missingEffectContext)" <<<"$STEP_NEG_OUTPUT"; then
  echo "$STEP_NEG_OUTPUT"
  fail "the step was rejected, but NOT by effect(missingEffectContext) — the tsgo diagnostic has stopped covering the DSL. CI stays green on a rejection that no longer proves anything about context. Most likely cause: the StepRegistrar step-function union in packages/vitest/src/Dsl.ts was reordered so the Effect-returning branch is listed FIRST. TypeScript then reports the generator against that member as a plain shape mismatch ('missing the following properties: toJSON, ...'), which the plugin has no reason to read as a context problem. See Dsl.ts note (a) and RESEARCH.md Finding 2."
fi
echo "✓ a step requiring an unprovided service is rejected by name: effect(missingEffectContext)"

# ---------------------------------------------------------------------------
# Assertion 7: DSL-03 — a World field absent from the declared type.
#
# The only assertion in this script whose fixture fails on PLAIN TypeScript.
# Reading a property that is not in a Context.Service's declared shape is a
# TS2339 and nothing else; @effect/tsgo has no diagnostic for it, because there
# is no context problem — World is provided, the Layer is correct, and the sole
# defect is one property read (RESEARCH.md Finding 10).
# ---------------------------------------------------------------------------
WORLD_FIELD_OUTPUT="$($TSC -p "$WORLD_FIELD_CONFIG" 2>&1)" && WORLD_FIELD_EXIT=0 || WORLD_FIELD_EXIT=$?

if [[ "$WORLD_FIELD_EXIT" -eq 0 ]]; then
  echo "$WORLD_FIELD_OUTPUT"
  fail "a World field absent from the declared type was REACHABLE from a step — ADR-EC-002's typed-context guarantee is decorative and World is an untyped bag with extra ceremony. BEH-EC-004 requires that there be no way to read a field that \"doesn't exist yet\". Most likely cause: the fixture was edited to read a field that IS declared, or a widening assertion was added to the step body (PITFALLS Pitfall 6)."
fi

# NOTE: TS2339, and deliberately NOT an `effect(` grep. Do not "harmonize" this
# with assertions 4, 6 or 8. This fixture produces a plain TypeScript error and
# no TS377xxx code at all (RESEARCH.md Finding 10), so an `effect(` grep here
# could only ever fail — which would then invite weakening or deleting the check
# rather than reading this note. If an Effect diagnostic DOES start appearing in
# this fixture's output, the fixture has acquired a second defect: narrow the
# fixture until TS2339 is its only error, do not relax the assertion.
if ! grep -q "TS2339" <<<"$WORLD_FIELD_OUTPUT"; then
  echo "$WORLD_FIELD_OUTPUT"
  fail "the World-field fixture was rejected, but not by TS2339 — so it is no longer failing because an undeclared field is unreachable. The exit code above proves only that SOMETHING was wrong with the file; DSL-03 is no longer under assertion. Check whether an unrelated defect (a bad import, a broken Layer) is now failing the file first."
fi
echo "✓ a World field absent from the declared type is unreachable: TS2339"

# ---------------------------------------------------------------------------
# Assertion 8: the LAYER ARGUMENT's own unsatisfied RIn — and, by construction,
# describeFeature's overload ORDER.
#
# Assertion 4 greps this same diagnostic on a different fixture, and the two are
# NOT redundant. Assertion 4 compiles a bare `Layer.merge` misannotation: it
# guards the compiler plugin itself — that missingLayerContext exists, fires, and
# counts toward the exit code. Assertion 8 compiles a Layer passed as an ARGUMENT
# to this project's own DSL: it guards describeFeature's overload order. Delete
# either and the other still passes while covering half of what it did.
# ---------------------------------------------------------------------------
LAYER_RIN_OUTPUT="$($TSC -p "$LAYER_RIN_CONFIG" 2>&1)" && LAYER_RIN_EXIT=0 || LAYER_RIN_EXIT=$?

if [[ "$LAYER_RIN_EXIT" -eq 0 ]]; then
  echo "$LAYER_RIN_OUTPUT"
  fail "an INCOMPLETE Layer was accepted as describeFeature's layer argument — a Layer<World, never, Db> whose own RIn names an unprovided Db compiled. Every Scenario using it would fail at run time with a service-not-found, which is precisely the failure ADR-EC-003 moves to authoring time. Most likely cause: the layer parameter's third type argument stopped being pinned to \`never\` in packages/vitest/src/describeFeature.ts."
fi

if ! grep -q "effect(missingLayerContext)" <<<"$LAYER_RIN_OUTPUT"; then
  echo "$LAYER_RIN_OUTPUT"
  fail "the Layer argument was rejected, but NOT by name — effect(missingLayerContext) did not fire, so ADR-EC-016's gate has stopped covering describeFeature's layer argument while CI stays green. Most likely cause: the two overloads in packages/vitest/src/describeFeature.ts were reordered so the plain-Layer form is no longer LAST. TypeScript reports a failed overloaded call against the last overload, so with the object form last the message becomes \"Type 'Layer<World, never, Db>' is missing the following properties from type '{ shared; perScenario }'\" — which names the wrong problem entirely and produces no Effect diagnostic. The call is still rejected, which is why nothing else in this repo goes red. See describeFeature.ts note (a) and RESEARCH.md Finding 6."
fi
echo "✓ an unsatisfied Layer argument is rejected by name: effect(missingLayerContext) — overload order intact"

# ---------------------------------------------------------------------------
# Assertion 9: the supplementary stacked-directive fixture.
#
# DELIBERATELY WEAKER THAN ASSERTION 6, and not a substitute for it. This one
# exists to honor the roadmap's literal "@ts-expect-error-based negative
# type-test file" wording. An exit-0-because-suppressed fixture proves that AN
# error occurred on the marked line; it cannot prove WHICH. A regression that
# downgraded effect(missingEffectContext) to a plain shape mismatch would pass
# here with no output change at all — that is what assertion 6 is for. Both, per
# RESEARCH.md Open Question 1. Do not delete assertion 6 believing this covers it.
#
# Exit code only: the fixture prints nothing when it is healthy, and the two
# codes it can fail with (TS377000 for a dead plugin directive, TS2578 for a dead
# @ts-expect-error) both mean the same thing, so pinning to either one would make
# the assertion silent for the other.
# ---------------------------------------------------------------------------
STEP_EXPECT_ERROR_OUTPUT="$($TSC -p "$STEP_EXPECT_ERROR_CONFIG" 2>&1)" && STEP_EXPECT_ERROR_EXIT=0 ||
  STEP_EXPECT_ERROR_EXIT=$?

if [[ "$STEP_EXPECT_ERROR_EXIT" -ne 0 ]]; then
  echo "$STEP_EXPECT_ERROR_OUTPUT"
  fail "the suppressed-directive fixture stopped compiling clean. Two causes, and the output above says which. (1) 'TS2578: Unused @ts-expect-error directive' or 'TS377000: @effect-diagnostics directive has no effect' means NO error occurs on the marked line any more — the DSL type was loosened, or the fixture's ambient Layer now provides Db, and DSL-01's guarantee is gone. (2) An unsuppressed TS377004 alongside TS377000 means the two directive comment lines were REORDERED: '@effect-diagnostics-next-line' must be the line IMMEDIATELY above the code, with '@ts-expect-error' above it. TypeScript skips intervening comment lines when resolving \"next line\"; the plugin does not. See the fixture's own header and RESEARCH.md Finding 3(A)."
fi
echo "✓ the supplementary suppressed-directive fixture compiles clean (exit 0)"

# ---------------------------------------------------------------------------
# THE CHARACTERIZATION ASSERTION. The only one in this file that pins a GAP
# rather than a guarantee, and the only one whose failure is GOOD NEWS.
#
# BEH-EC-016 requires the author to annotate a step body's trailing
# `stepArguments` parameter, and states that the annotation is UNVERIFIED —
# `StepRegistrar` infers `Params` from the BODY, never checks it against
# `StepArgs<pattern>`, and Dsl.ts note (d) records why it cannot without breaking
# generator inference. A spec sentence claiming a hole exists is exactly as
# capable of going stale as one claiming a guarantee does (AGENTS.md §4 cuts both
# ways), and this is the only thing in the repository that measures it.
#
# The fixture declares four wrong forms — a mis-annotated DataTable parameter, a
# mis-annotated DocString one, a body that omits the parameter entirely, and a
# body that declares one for a step carrying no argument — and MUST compile
# clean. A non-zero exit means the compiler started catching one of them.
# ---------------------------------------------------------------------------
STEP_TABLE_ANNOTATION_OUTPUT="$($TSC -p "$STEP_TABLE_ANNOTATION_CONFIG" 2>&1)" &&
  STEP_TABLE_ANNOTATION_EXIT=0 || STEP_TABLE_ANNOTATION_EXIT=$?

if [[ "$STEP_TABLE_ANNOTATION_EXIT" -ne 0 ]]; then
  echo "$STEP_TABLE_ANNOTATION_OUTPUT"
  fail "the step-argument annotation characterization fixture stopped compiling clean (output above). This is very likely an IMPROVEMENT, not a break: something now type-checks a step body's TRAILING stepArguments parameter (the ...ReadonlyArray<any> tail of StepParams<P>), which BEH-EC-016 records as impossible. Do NOT loosen anything to make this pass. Delete whichever wrong-annotation case is now caught, and remove the matching sentence from BEH-EC-016's step-body-signature REQUIREMENT and from Dsl.ts note (d), in the same commit."
fi
echo "✓ characterization: a step body's TRAILING stepArguments annotation is still UNCHECKED in both directions — the pattern holes themselves are typed by StepParams<P> (BEH-EC-016 records the tail as the remaining gap)"

# ---------------------------------------------------------------------------
# Assertions 10 and 11: THE HOOK SATISFIED/STARVED FLIP PAIR.
#
# Assertions 5 and 6 cover StepRegistrar. Dsl.ts note (a) is explicit that this rule now has three
# copies in the repo — this file, Step.ts's register, and Hook.ts's registerHook — and that
# HookRegistrar needs the identical behavioral proof: a reordered union or a leaked hook member still
# rejects the bad case, so no existing test goes red; effect(missingEffectContext) just quietly stops
# covering the new surface. These two assertions are that proof for hooks.
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Assertion 10: the hook DSL positive control compiles clean.
# Discriminates a working guarantee from a dsl that simply rejects everything — the same role
# assertion 5 plays for StepRegistrar.
# ---------------------------------------------------------------------------
HOOK_OK_OUTPUT="$($TSC -p "$HOOK_OK_CONFIG" 2>&1)" && HOOK_OK_EXIT=0 || HOOK_OK_EXIT=$?

if [[ "$HOOK_OK_EXIT" -ne 0 ]]; then
  echo "$HOOK_OK_OUTPUT"
  fail "the hook DSL positive control failed to compile — three known causes, and the output above says which. (i) a hook body using Effect.acquireRelease was wrongly rejected, meaning Scope.Scope left HookRegistrar in Dsl.ts note (b). (ii) TS2578 'Unused @ts-expect-error directive', meaning a hook member LEAKED onto ScenarioDsl and is now reachable from every Scenario callback (Dsl.ts note (f)). (iii) an already-Effect.fn-wrapped hook was rejected, meaning the HookRegistrar union's second member is wrong. Do not add \`any\` to the fixture to make this pass — one \`any\` in a hook body is assignable to everything and disables the whole guarantee."
fi
echo "✓ hook DSL positive control compiles clean (all six kinds, scoped + wrapped hooks, both Layer forms, Scenario-callback @ts-expect-error)"

# ---------------------------------------------------------------------------
# Assertion 11: a hook requiring an unprovided service is rejected BY NAME.
#
# NOTE: missingEffectContext, and NOT missingLayerContext. These are different diagnostics on
# different fixtures and must not be "harmonized" with assertion 4's or assertion 8's grep above.
# Assertion 4 is about the LAYER ARGUMENT's unhandled RIn; assertion 8 is about describeFeature's own
# layer-argument overload order; this one is about a HOOK's required context. Copying either name here
# produces an assertion that fails for the wrong reason, which then invites someone to weaken the grep
# until it passes.
#
# Two checks, never one — the exit code proves it was rejected, the diagnostic name proves it was
# rejected FOR THE RIGHT REASON.
# ---------------------------------------------------------------------------
HOOK_NEG_OUTPUT="$($TSC -p "$HOOK_NEG_CONFIG" 2>&1)" && HOOK_NEG_EXIT=0 || HOOK_NEG_EXIT=$?

if [[ "$HOOK_NEG_EXIT" -eq 0 ]]; then
  echo "$HOOK_NEG_OUTPUT"
  fail "a hook requiring an unprovided service COMPILED — DSL-07's half of INV-EC-003 is decorative and this project's core value is not enforced for hooks."
fi

if ! grep -q "effect(missingEffectContext)" <<<"$HOOK_NEG_OUTPUT"; then
  echo "$HOOK_NEG_OUTPUT"
  fail "the hook was rejected, but NOT by effect(missingEffectContext) — the tsgo diagnostic has stopped covering the hook DSL. CI stays green on a rejection that no longer proves anything about context. Most likely cause: the HookRegistrar step-function union in packages/vitest/src/Dsl.ts was reordered so the Effect-returning branch is listed FIRST, after which TypeScript reports the generator as a plain shape mismatch that the plugin has no reason to read as a context problem. See Dsl.ts note (a)."
fi
echo "✓ a hook requiring an unprovided service is rejected by name: effect(missingEffectContext)"

# ---------------------------------------------------------------------------
# Assertions 12 and 13: THE RULE SATISFIED/STARVED FLIP PAIR.
#
# Assertions 5/6 cover a step against the Feature's ambient Layer; 10/11 cover a hook against it.
# These two cover ADR-EC-010's extra Layers — the one place in the DSL where `ROut` is not the same
# everywhere in a Feature. `FeatureDsl.Rule` hands its callback a `RuleDsl<ROut | R2>` and
# `ScenarioRegistrar`'s three-argument form hands its callback a `ScenarioDsl<ROut | R2>`; DSL-05 and
# INV-EC-005 are the claim that the union holds INSIDE that callback and nowhere else.
#
# Narrow either union back to `ROut` and every existing assertion above still passes: the Feature
# level is untouched, nothing else in this repo registers a Rule-scoped step, and the boundary just
# quietly stops existing. That is why the pair is committed rather than derived — assertion 12 is the
# only thing in this script that goes red when the union is narrowed.
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Assertion 12: the Rule/Scenario extra-Layer positive control compiles clean.
# Discriminates a working boundary from a dsl that simply rejects everything — the same role
# assertion 5 plays for StepRegistrar and assertion 10 for HookRegistrar. This fixture also carries
# three load-bearing `@ts-expect-error` directives, so it fails in BOTH directions: too strict, and
# too loose.
# ---------------------------------------------------------------------------
RULE_OK_OUTPUT="$($TSC -p "$RULE_OK_CONFIG" 2>&1)" && RULE_OK_EXIT=0 || RULE_OK_EXIT=$?

if [[ "$RULE_OK_EXIT" -ne 0 ]]; then
  echo "$RULE_OK_OUTPUT"
  fail "the Rule/Scenario extra-Layer positive control failed to compile — three known causes, and the output above says which. (i) TS2345/TS377004 naming RuleService or ScenarioService INSIDE a Rule's or a Scenario's own callback: the extra service was wrongly REJECTED where it is supposed to be visible, meaning FeatureDsl.Rule's or ScenarioRegistrar's generic union (\`RuleDsl<ROut | R2>\` / \`ScenarioDsl<ROut | R2>\`) was narrowed back to \`ROut\` alone in packages/vitest/src/Dsl.ts. (ii) TS2578 'Unused @ts-expect-error directive' on the \`void ruleDsl.BeforeAllScenarios\` line: BeforeAllScenarios or AfterAllScenarios LEAKED onto RuleDsl, which ADR-EC-010 does not scope to a Rule (Dsl.ts note (f)). (iii) TS377000 '@effect-diagnostics directive has no effect', or TS2578, on either INVISIBILITY line — the Rule's (\"outside the rule\") or the Scenario's (\"outside the scoped Scenario\"): that form's extra Layer leaked into the ambient ROut OUTSIDE its own scope, so INV-EC-005's boundary is gone and roadmap success criterion 1 is decorative. Do not add \`any\` to the fixture to make this pass — one \`any\` in a step body is assignable to everything and disables the whole guarantee."
fi
echo "✓ Rule/Scenario extra-Layer positive control compiles clean (Rule-scoped steps + four Rule hooks + Rule Background + Scenario extra Layer, with both invisibility guards satisfied)"

# ---------------------------------------------------------------------------
# Assertion 13: DSL-05 — a Rule-scoped service used OUTSIDE its Rule is rejected BY NAME.
#
# This is roadmap success criterion 1 in its most literal form: rule-missing-service.ts is
# rule-satisfied.ts's Rule-scoped step body, byte-for-byte, registered at Feature level with no Rule
# in the file. The pair isolates exactly one variable — whether the step is inside the Rule that
# contributed the service.
#
# NOTE: missingEffectContext, and NOT missingLayerContext. These are different diagnostics on
# different fixtures and must not be "harmonized" with assertion 4's or assertion 8's grep above.
# Assertion 4 is about a Layer ARGUMENT's own unhandled RIn; assertion 8 is about describeFeature's
# layer-argument overload order; this one is about a STEP's required context. Copying either name
# here produces an assertion that fails for the wrong reason, which then invites someone to weaken
# the grep until it passes. The negative fixture's output contains TS377004 and no
# missingLayerContext at all — its ambient Layer (World.layer) is complete.
#
# Two checks, never one — the exit code proves it was rejected, the diagnostic name proves it was
# rejected FOR THE RIGHT REASON.
# ---------------------------------------------------------------------------
RULE_NEG_OUTPUT="$($TSC -p "$RULE_NEG_CONFIG" 2>&1)" && RULE_NEG_EXIT=0 || RULE_NEG_EXIT=$?

if [[ "$RULE_NEG_EXIT" -eq 0 ]]; then
  echo "$RULE_NEG_OUTPUT"
  fail "a Rule-scoped service COMPILED in a step written OUTSIDE its Rule — DSL-05's compile-time boundary (INV-EC-005, roadmap success criterion 1) is decorative, and ADR-EC-010's extra Layer is a runtime convention with no type behind it. Most likely cause: FeatureDsl.Rule's callback parameter in packages/vitest/src/Dsl.ts was widened past \`RuleDsl<ROut | R2>\` — e.g. to \`RuleDsl<any>\` — or the Rule's extraLayer was merged into the Feature's ambient ROut instead of only into the Rule's."
fi

if ! grep -q "effect(missingEffectContext)" <<<"$RULE_NEG_OUTPUT"; then
  echo "$RULE_NEG_OUTPUT"
  fail "the out-of-Rule step was rejected, but NOT by effect(missingEffectContext) — the tsgo diagnostic has stopped covering the Rule surface. CI stays green on a rejection that no longer proves anything about context. Two likely causes: FeatureDsl.Rule's \`R2\` generic parameter was dropped, so the fixture now fails for an arity or shape reason instead; or the step-function union in packages/vitest/src/Dsl.ts was reordered so the Effect-returning branch is listed FIRST, after which TypeScript reports the generator as a plain shape mismatch that the plugin has no reason to read as a context problem. See Dsl.ts note (a)."
fi
echo "✓ a Rule-scoped service used outside its Rule is rejected by name: effect(missingEffectContext)"

echo ""
echo "tsgo gate: ENFORCED"

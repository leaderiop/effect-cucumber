#!/usr/bin/env bash
#
# Asserts that @effect/tsgo's diagnostics are a BUILD GATE (ADR-EC-016): a step or
# hook needing a service the ambient Layer lacks, an unsatisfied Layer argument, a
# Rule-scoped service used outside its Rule, and a step module used where its
# services are missing are each rejected BY NAME, while the positive fixtures
# compile clean. Every negative pairs an exit code with a diagnostic name, so a
# diagnostic that stops firing fails here instead of passing quietly.
#
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
STEP_MODULE_OK_CONFIG="packages/vitest/test/tsgo-gate/tsconfig.step-module-ok.json"
STEP_MODULE_NEG_CONFIG="packages/vitest/test/tsgo-gate/tsconfig.step-module-missing.json"
WORLD_FIELD_CONFIG="packages/vitest/test/tsgo-gate/tsconfig.world-field.json"
LAYER_RIN_CONFIG="packages/vitest/test/tsgo-gate/tsconfig.layer-rin.json"
PER_SCENARIO_RIN_CONFIG="packages/vitest/test/tsgo-gate/tsconfig.per-scenario-rin.json"
STEP_EXPECT_ERROR_CONFIG="packages/vitest/test/tsgo-gate/tsconfig.step-expect-error.json"
STEP_TABLE_ANNOTATION_CONFIG="packages/vitest/test/tsgo-gate/tsconfig.step-table-annotation.json"
HOOK_OK_CONFIG="packages/vitest/test/tsgo-gate/tsconfig.hook-ok.json"
HOOK_NEG_CONFIG="packages/vitest/test/tsgo-gate/tsconfig.hook-missing.json"
HOOK_ONCE_CONFIG="packages/vitest/test/tsgo-gate/tsconfig.hook-once.json"
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
  "$STEP_MODULE_OK_CONFIG" "$STEP_MODULE_NEG_CONFIG" \
  "$WORLD_FIELD_CONFIG" "$LAYER_RIN_CONFIG" "$PER_SCENARIO_RIN_CONFIG" "$STEP_EXPECT_ERROR_CONFIG" "$HOOK_OK_CONFIG" \
  "$HOOK_NEG_CONFIG" "$RULE_OK_CONFIG" \
  "$RULE_NEG_CONFIG" "$STEP_TABLE_ANNOTATION_CONFIG"; do
  [[ -f "$f" ]] || fail "missing fixture config $f — the gate fixture is absent, so nothing was verified."
done

# ---------------------------------------------------------------------------
# Assertion 1: the positive control compiles clean.
# ---------------------------------------------------------------------------
OK_OUTPUT="$($TSC -p "$OK_CONFIG" 2>&1)" && OK_EXIT=0 || OK_EXIT=$?

if [[ "$OK_EXIT" -ne 0 ]]; then
  echo "$OK_OUTPUT"
  fail "positive control failed to compile — the gate fixture is broken, not the gate."
fi
echo "✓ positive control (satisfied.ts) compiles clean"

# ---------------------------------------------------------------------------
# Assertion 2: floating-effect.ts is valid TypeScript.
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
# ---------------------------------------------------------------------------
if [[ "$FLOATING_EXIT" -eq 0 ]]; then
  fail "Effect diagnostics are reported but do NOT fail the build — ADR-EC-016's gate is not enforced. tsc printed effect(floatingEffect) and still exited 0; check ignoreEffectErrorsInTscExitCode / ignoreEffectWarningsInTscExitCode in tsconfig.base.json."
fi
echo "✓ an Effect diagnostic alone fails the build (exit $FLOATING_EXIT) — gate is load-bearing"

# ---------------------------------------------------------------------------
# Assertion 4: the Layer-context guarantee specifically.
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
# Assertions 1-4 cover the Layer type in isolation. These two cover the thing a
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Assertion 5: the DSL positive control compiles clean.
# ---------------------------------------------------------------------------
STEP_OK_OUTPUT="$($TSC -p "$STEP_OK_CONFIG" 2>&1)" && STEP_OK_EXIT=0 || STEP_OK_EXIT=$?

if [[ "$STEP_OK_EXIT" -ne 0 ]]; then
  echo "$STEP_OK_OUTPUT"
  fail "the DSL positive control failed to compile — a scoped step (Effect.acquireRelease) or an already-Effect.fn-wrapped step was wrongly rejected. Either the fixture is broken, or Scope.Scope left the step type in Dsl.ts (note (b)): a step using acquireRelease must still compile against a PLAIN Layer, because the runner provides the Scope. Do not add \`any\` to the fixture to make this pass — one \`any\` in a step body is assignable to everything and disables the whole guarantee."
fi
echo "✓ DSL positive control compiles clean (scoped + wrapped steps, both containers, both Layer forms)"

STEP_NEG_OUTPUT="$($TSC -p "$STEP_NEG_CONFIG" 2>&1)" && STEP_NEG_EXIT=0 || STEP_NEG_EXIT=$?

if [[ "$STEP_NEG_EXIT" -eq 0 ]]; then
  echo "$STEP_NEG_OUTPUT"
 fail "a step requiring an unprovided service COMPILED — INV-EC-003 is decorative and this project's core value is not enforced. Most likely cause: the step-parameter generic in Dsl.ts degraded to a vacuous \`any\` — e.g. the generator branch written as Generator<any, A, any>, which accepts a body requiring anything."
fi

if ! grep -q "effect(missingEffectContext)" <<<"$STEP_NEG_OUTPUT"; then
  echo "$STEP_NEG_OUTPUT"
 fail "the step was rejected, but NOT by effect(missingEffectContext) — the tsgo diagnostic has stopped covering the DSL. CI stays green on a rejection that no longer proves anything about context. Most likely cause: the StepRegistrar step-function union in packages/vitest/src/Dsl.ts was reordered so the Effect-returning branch is listed FIRST. TypeScript then reports the generator against that member as a plain shape mismatch ('missing the following properties: toJSON, ...'), which the plugin has no reason to read as a context problem. See Dsl.ts note (a) and the research."
fi
echo "✓ a step requiring an unprovided service is rejected by name: effect(missingEffectContext)"

# ---------------------------------------------------------------------------
# Assertions 6b and 6c: step modules (ADR-EC-027, BEH-EC-019). A module's `R`
# ---------------------------------------------------------------------------
STEP_MODULE_OK_OUTPUT="$($TSC -p "$STEP_MODULE_OK_CONFIG" 2>&1)" && STEP_MODULE_OK_EXIT=0 || STEP_MODULE_OK_EXIT=$?

if [[ "$STEP_MODULE_OK_EXIT" -ne 0 ]]; then
  echo "$STEP_MODULE_OK_OUTPUT"
  fail "the step-module positive control failed to compile — a module declaring R = World was rejected in a Feature whose Layer provides World (or more), or a module declaring nothing was rejected somewhere. Either the fixture is broken or \`use\`'s parameter type in Dsl.ts stopped accepting a module whose R is a subset of ROut."
fi
echo "✓ step-module positive control compiles clean (Feature level, inside a Rule, wider Layer, R = never)"

STEP_MODULE_NEG_OUTPUT="$($TSC -p "$STEP_MODULE_NEG_CONFIG" 2>&1)" && STEP_MODULE_NEG_EXIT=0 || STEP_MODULE_NEG_EXIT=$?

if [[ "$STEP_MODULE_NEG_EXIT" -eq 0 ]]; then
  echo "$STEP_MODULE_NEG_OUTPUT"
  fail "a step module requiring an unprovided service was ACCEPTED by use() — a module declaring R = Db compiled in a Feature whose Layer provides only World. Most likely cause: the requires witness on StepModule/use in packages/vitest/src/{StepModule,Dsl}.ts degraded to Effect<void, never, never> or any."
fi

if ! grep -q "effect(missingEffectContext)" <<<"$STEP_MODULE_NEG_OUTPUT"; then
  echo "$STEP_MODULE_NEG_OUTPUT"
  fail "the step module was rejected, but NOT by effect(missingEffectContext). Most likely cause: use()'s parameter in packages/vitest/src/Dsl.ts was rewritten as the named StepModule<ROut> alias (or the requires witness is no longer its FIRST property) — TypeScript then reports a bare TS2345 and the tsgo diagnostic never fires. See Dsl.ts note (g) and ADR-EC-027."
fi
echo "✓ a step module requiring an unprovided service is rejected by name at use(): effect(missingEffectContext)"

WORLD_FIELD_OUTPUT="$($TSC -p "$WORLD_FIELD_CONFIG" 2>&1)" && WORLD_FIELD_EXIT=0 || WORLD_FIELD_EXIT=$?

if [[ "$WORLD_FIELD_EXIT" -eq 0 ]]; then
  echo "$WORLD_FIELD_OUTPUT"
 fail "a World field absent from the declared type was REACHABLE from a step — ADR-EC-002's typed-context guarantee is decorative and World is an untyped bag with extra ceremony. BEH-EC-004 requires that there be no way to read a field that \"doesn't exist yet\". Most likely cause: the fixture was edited to read a field that IS declared, or a widening assertion was added to the step body."
fi

if ! grep -q "TS2339" <<<"$WORLD_FIELD_OUTPUT"; then
  echo "$WORLD_FIELD_OUTPUT"
 fail "the World-field fixture was rejected, but not by TS2339 — so it is no longer failing because an undeclared field is unreachable. The exit code above proves only that SOMETHING was wrong with the file; is no longer under assertion. Check whether an unrelated defect (a bad import, a broken Layer) is now failing the file first."
fi
echo "✓ a World field absent from the declared type is unreachable: TS2339"

# ---------------------------------------------------------------------------
# Assertion 8: the LAYER ARGUMENT's own unsatisfied RIn — and, by construction,
# Assertion 4 greps this same diagnostic on a different fixture, and the two are
# ---------------------------------------------------------------------------
LAYER_RIN_OUTPUT="$($TSC -p "$LAYER_RIN_CONFIG" 2>&1)" && LAYER_RIN_EXIT=0 || LAYER_RIN_EXIT=$?

if [[ "$LAYER_RIN_EXIT" -eq 0 ]]; then
  echo "$LAYER_RIN_OUTPUT"
  fail "an INCOMPLETE Layer was accepted as describeFeature's layer argument — a Layer<World, never, Db> whose own RIn names an unprovided Db compiled. Every Scenario using it would fail at run time with a service-not-found, which is precisely the failure ADR-EC-003 moves to authoring time. Most likely cause: the layer parameter's third type argument stopped being pinned to \`never\` in packages/vitest/src/describeFeature.ts."
fi

if ! grep -q "effect(missingLayerContext)" <<<"$LAYER_RIN_OUTPUT"; then
  echo "$LAYER_RIN_OUTPUT"
 fail "the Layer argument was rejected, but NOT by name — effect(missingLayerContext) did not fire, so ADR-EC-016's gate has stopped covering describeFeature's layer argument while CI stays green. Most likely cause: the two overloads in packages/vitest/src/describeFeature.ts were reordered so the plain-Layer form is no longer LAST. TypeScript reports a failed overloaded call against the last overload, so with the object form last the message becomes \"Type 'Layer<World, never, Db>' is missing the following properties from type '{ shared; perScenario }'\" — which names the wrong problem entirely and produces no Effect diagnostic. The call is still rejected, which is why nothing else in this repo goes red. See describeFeature.ts note (a) and the research."
fi
echo "✓ an unsatisfied Layer argument is rejected by name: effect(missingLayerContext) — overload order intact"

# ---------------------------------------------------------------------------
# Assertion 8b: the object form's per-Scenario tier may require what the shared
# ---------------------------------------------------------------------------
PER_SCENARIO_RIN_OUTPUT="$($TSC -p "$PER_SCENARIO_RIN_CONFIG" 2>&1)" && PER_SCENARIO_RIN_EXIT=0 || PER_SCENARIO_RIN_EXIT=$?

if [[ "$PER_SCENARIO_RIN_EXIT" -eq 0 ]]; then
  echo "$PER_SCENARIO_RIN_OUTPUT"
  fail "a perScenario tier whose input names a service NEITHER tier provides was accepted — { shared: Layer<Catalog>, perScenario: Layer<World, never, Db> } compiled. Every Scenario would fail at run time with a service-not-found. Most likely cause: the object-form overload's perScenario third type argument in packages/vitest/src/describeFeature.ts stopped being pinned to RShared."
fi

if ! grep -q "No overload matches this call" <<<"$PER_SCENARIO_RIN_OUTPUT"; then
  echo "$PER_SCENARIO_RIN_OUTPUT"
  fail "the perScenario tier was rejected, but not by overload resolution as BEH-EC-007 records — the diagnostic shape changed. If it now fires effect(missingLayerContext), that is an IMPROVEMENT: assert the name here and update BEH-EC-007's sentence in the same commit."
fi
echo "✓ a perScenario tier needing a service neither tier provides is rejected (overload resolution; BEH-EC-007 records the by-name half as the plain form's only)"

# ---------------------------------------------------------------------------
# Assertion 9: the supplementary stacked-directive fixture.
# ---------------------------------------------------------------------------
STEP_EXPECT_ERROR_OUTPUT="$($TSC -p "$STEP_EXPECT_ERROR_CONFIG" 2>&1)" && STEP_EXPECT_ERROR_EXIT=0 ||
  STEP_EXPECT_ERROR_EXIT=$?

if [[ "$STEP_EXPECT_ERROR_EXIT" -ne 0 ]]; then
  echo "$STEP_EXPECT_ERROR_OUTPUT"
 fail "the suppressed-directive fixture stopped compiling clean. Two causes, and the output above says which. (1) 'TS2578: Unused @ts-expect-error directive' or 'TS377000: @effect-diagnostics directive has no effect' means NO error occurs on the marked line any more — the DSL type was loosened, or the fixture's ambient Layer now provides Db, and the guarantee is gone. (2) An unsuppressed TS377004 alongside TS377000 means the two directive comment lines were REORDERED: '@effect-diagnostics-next-line' must be the line IMMEDIATELY above the code, with '@ts-expect-error' above it. TypeScript skips intervening comment lines when resolving \"next line\"; the plugin does not. See the fixture's own header and the research(A)."
fi
echo "✓ the supplementary suppressed-directive fixture compiles clean (exit 0)"

STEP_TABLE_ANNOTATION_OUTPUT="$($TSC -p "$STEP_TABLE_ANNOTATION_CONFIG" 2>&1)" &&
  STEP_TABLE_ANNOTATION_EXIT=0 || STEP_TABLE_ANNOTATION_EXIT=$?

if [[ "$STEP_TABLE_ANNOTATION_EXIT" -ne 0 ]]; then
  echo "$STEP_TABLE_ANNOTATION_OUTPUT"
  fail "the step-argument annotation characterization fixture stopped compiling clean (output above). This is very likely an IMPROVEMENT, not a break: something now type-checks a step body's TRAILING stepArguments parameter (the ...ReadonlyArray<any> tail of StepParams<P>), which BEH-EC-016 records as impossible. Do NOT loosen anything to make this pass. Delete whichever wrong-annotation case is now caught, and remove the matching sentence from BEH-EC-016's step-body-signature REQUIREMENT and from Dsl.ts note (d), in the same commit."
fi
echo "✓ characterization: a step body's TRAILING stepArguments annotation is still UNCHECKED in both directions — the pattern holes themselves are typed by StepParams<P> (BEH-EC-016 records the tail as the remaining gap)"

# ---------------------------------------------------------------------------
# Assertions 10 and 11: THE HOOK SATISFIED/STARVED FLIP PAIR.
# Assertions 5 and 6 cover StepRegistrar. Dsl.ts note (a) is explicit that this rule now has three
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Assertion 10: the hook DSL positive control compiles clean.
# ---------------------------------------------------------------------------
HOOK_OK_OUTPUT="$($TSC -p "$HOOK_OK_CONFIG" 2>&1)" && HOOK_OK_EXIT=0 || HOOK_OK_EXIT=$?

if [[ "$HOOK_OK_EXIT" -ne 0 ]]; then
  echo "$HOOK_OK_OUTPUT"
  fail "the hook DSL positive control failed to compile — three known causes, and the output above says which. (i) a hook body using Effect.acquireRelease was wrongly rejected, meaning Scope.Scope left HookRegistrar in Dsl.ts note (b). (ii) TS2578 'Unused @ts-expect-error directive', meaning a hook member LEAKED onto ScenarioDsl and is now reachable from every Scenario callback (Dsl.ts note (f)). (iii) an already-Effect.fn-wrapped hook was rejected, meaning the HookRegistrar union's second member is wrong. Do not add \`any\` to the fixture to make this pass — one \`any\` in a hook body is assignable to everything and disables the whole guarantee."
fi
echo "✓ hook DSL positive control compiles clean (all six kinds, scoped + wrapped hooks, both Layer forms, Scenario-callback @ts-expect-error)"

# ---------------------------------------------------------------------------
# Assertion 11: a hook requiring an unprovided service is rejected BY NAME.
# Assertion 4 is about the LAYER ARGUMENT's unhandled RIn; assertion 8 is about describeFeature's own
# ---------------------------------------------------------------------------
HOOK_NEG_OUTPUT="$($TSC -p "$HOOK_NEG_CONFIG" 2>&1)" && HOOK_NEG_EXIT=0 || HOOK_NEG_EXIT=$?

if [[ "$HOOK_NEG_EXIT" -eq 0 ]]; then
  echo "$HOOK_NEG_OUTPUT"
 fail "a hook requiring an unprovided service COMPILED — INV-EC-003 is decorative and this project's core value is not enforced for hooks."
fi

if ! grep -q "effect(missingEffectContext)" <<<"$HOOK_NEG_OUTPUT"; then
  echo "$HOOK_NEG_OUTPUT"
  fail "the hook was rejected, but NOT by effect(missingEffectContext) — the tsgo diagnostic has stopped covering the hook DSL. CI stays green on a rejection that no longer proves anything about context. Most likely cause: the HookRegistrar step-function union in packages/vitest/src/Dsl.ts was reordered so the Effect-returning branch is listed FIRST, after which TypeScript reports the generator as a plain shape mismatch that the plugin has no reason to read as a context problem. See Dsl.ts note (a)."
fi
echo "✓ a hook requiring an unprovided service is rejected by name: effect(missingEffectContext)"

# ---------------------------------------------------------------------------
# Assertion 11b: a ONCE-PER-FEATURE hook reaching for a PER-SCENARIO service is rejected BY NAME.
# ---------------------------------------------------------------------------
HOOK_ONCE_OUTPUT="$($TSC -p "$HOOK_ONCE_CONFIG" 2>&1)" && HOOK_ONCE_EXIT=0 || HOOK_ONCE_EXIT=$?

if [[ "$HOOK_ONCE_EXIT" -eq 0 ]]; then
  echo "$HOOK_ONCE_OUTPUT"
  fail "a BeforeAllScenarios hook reaching for a per-Scenario service COMPILED — the once-per-Feature hooks are no longer typed by the shared tier alone (F-10). A hook that seeds a per-Scenario World would seed a build no Scenario ever reads, and nothing at run time would say so."
fi

if ! grep -q "effect(missingEffectContext)" <<<"$HOOK_ONCE_OUTPUT"; then
  echo "$HOOK_ONCE_OUTPUT"
  fail "the once-per-Feature hook was rejected, but NOT by effect(missingEffectContext) — the rejection no longer proves anything about the hook's required context. Check that FeatureDsl's BeforeAllScenarios/AfterAllScenarios are HookRegistrar<RShared> and that the fixture still reaches for the per-Scenario service."
fi
echo "✓ a once-per-Feature hook reaching for a per-Scenario service is rejected by name: effect(missingEffectContext)"

# ---------------------------------------------------------------------------
# Assertions 12 and 13: THE RULE SATISFIED/STARVED FLIP PAIR.
# Assertions 5/6 cover a step against the Feature's ambient Layer; 10/11 cover a hook against it.
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Assertion 12: the Rule/Scenario extra-Layer positive control compiles clean.
# ---------------------------------------------------------------------------
RULE_OK_OUTPUT="$($TSC -p "$RULE_OK_CONFIG" 2>&1)" && RULE_OK_EXIT=0 || RULE_OK_EXIT=$?

if [[ "$RULE_OK_EXIT" -ne 0 ]]; then
  echo "$RULE_OK_OUTPUT"
  fail "the Rule/Scenario extra-Layer positive control failed to compile — three known causes, and the output above says which. (i) TS2345/TS377004 naming RuleService or ScenarioService INSIDE a Rule's or a Scenario's own callback: the extra service was wrongly REJECTED where it is supposed to be visible, meaning FeatureDsl.Rule's or ScenarioRegistrar's generic union (\`RuleDsl<ROut | R2>\` / \`ScenarioDsl<ROut | R2>\`) was narrowed back to \`ROut\` alone in packages/vitest/src/Dsl.ts. (ii) TS2578 'Unused @ts-expect-error directive' on the \`void ruleDsl.BeforeAllScenarios\` line: BeforeAllScenarios or AfterAllScenarios LEAKED onto RuleDsl, which ADR-EC-010 does not scope to a Rule (Dsl.ts note (f)). (iii) TS377000 '@effect-diagnostics directive has no effect', or TS2578, on either INVISIBILITY line — the Rule's (\"outside the rule\") or the Scenario's (\"outside the scoped Scenario\"): that form's extra Layer leaked into the ambient ROut OUTSIDE its own scope, so INV-EC-005's boundary is gone and roadmap success criterion 1 is decorative. Do not add \`any\` to the fixture to make this pass — one \`any\` in a step body is assignable to everything and disables the whole guarantee."
fi
echo "✓ Rule/Scenario extra-Layer positive control compiles clean (Rule-scoped steps + four Rule hooks + Rule Background + Scenario extra Layer, with both invisibility guards satisfied)"

# ---------------------------------------------------------------------------
# Assertion 4 is about a Layer ARGUMENT's own unhandled RIn; assertion 8 is about describeFeature's
# ---------------------------------------------------------------------------
RULE_NEG_OUTPUT="$($TSC -p "$RULE_NEG_CONFIG" 2>&1)" && RULE_NEG_EXIT=0 || RULE_NEG_EXIT=$?

if [[ "$RULE_NEG_EXIT" -eq 0 ]]; then
  echo "$RULE_NEG_OUTPUT"
 fail "a Rule-scoped service COMPILED in a step written OUTSIDE its Rule — the compile-time boundary (INV-EC-005, roadmap success criterion 1) is decorative, and ADR-EC-010's extra Layer is a runtime convention with no type behind it. Most likely cause: FeatureDsl.Rule's callback parameter in packages/vitest/src/Dsl.ts was widened past \`RuleDsl<ROut | R2>\` — e.g. to \`RuleDsl<any>\` — or the Rule's extraLayer was merged into the Feature's ambient ROut instead of only into the Rule's."
fi

if ! grep -q "effect(missingEffectContext)" <<<"$RULE_NEG_OUTPUT"; then
  echo "$RULE_NEG_OUTPUT"
  fail "the out-of-Rule step was rejected, but NOT by effect(missingEffectContext) — the tsgo diagnostic has stopped covering the Rule surface. CI stays green on a rejection that no longer proves anything about context. Two likely causes: FeatureDsl.Rule's \`R2\` generic parameter was dropped, so the fixture now fails for an arity or shape reason instead; or the step-function union in packages/vitest/src/Dsl.ts was reordered so the Effect-returning branch is listed FIRST, after which TypeScript reports the generator as a plain shape mismatch that the plugin has no reason to read as a context problem. See Dsl.ts note (a)."
fi
echo "✓ a Rule-scoped service used outside its Rule is rejected by name: effect(missingEffectContext)"

echo ""
echo "tsgo gate: ENFORCED"

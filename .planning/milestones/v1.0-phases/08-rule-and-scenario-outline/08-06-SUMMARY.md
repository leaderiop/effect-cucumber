---
phase: 08-rule-and-scenario-outline
plan: 06
subsystem: testing
tags: [typescript, effect, tsgo, tsc, build-gate, type-tests, adr-ec-016, adr-ec-010]

# Dependency graph
requires:
  - phase: 08-rule-and-scenario-outline (plan 03)
    provides: "`RuleDsl<ROut>`, `ScenarioRegistrar<ROut>`'s three-argument signature, and `FeatureDsl.Rule`'s `<R2, E2>` generic in packages/vitest/src/Dsl.ts — the type surface these fixtures compile against"
  - phase: 07-hooks (plan 03)
    provides: "the hook satisfied/starved tsgo-gate fixture pair and gate assertions 10/11, copied verbatim as the structural template"
  - phase: 05-describefeature-type-surface
    provides: "scripts/verify-tsgo-gate.sh, packages/vitest/test/tsgo-gate/tsconfig.json, and the one-fixture-one-config convention"
provides:
  - "packages/vitest/test/tsgo-gate/src/rule-satisfied.ts — the Rule AND Scenario extra-Layer positive control (gate assertion 12)"
  - "packages/vitest/test/tsgo-gate/src/rule-missing-service.ts — the Rule-service-used-outside-the-Rule starved twin (gate assertion 13)"
  - "gate assertions 12 and 13 in scripts/verify-tsgo-gate.sh, both checking exit code AND diagnostic name"
  - "an inline, satisfied @ts-expect-error proving RuleDsl exposes neither BeforeAllScenarios nor AfterAllScenarios"
  - "inline invisibility proofs for BOTH extra-Layer forms (a Rule's and a Scenario's own), in the same must-compile-clean file"
affects: [08-05a runtime Rule wiring, any future change to Dsl.ts's RuleDsl/ScenarioRegistrar/FeatureDsl.Rule, phase 9 tags and layer scopes]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "satisfied/starved committed fixture PAIR, asserted in one script run (no self-mutating script, no dirty working tree)"
    - "stacked `@ts-expect-error` + `@effect-diagnostics-next-line missingEffectContext:off` inside a must-compile-clean fixture, as a POSITIVE assertion that a boundary still rejects"
    - "one fixture, one defect — a second defect would let a diagnostic grep be satisfied on behalf of a file the assertion was never about"

key-files:
  created:
    - packages/vitest/test/tsgo-gate/src/rule-satisfied.ts
    - packages/vitest/test/tsgo-gate/src/rule-missing-service.ts
    - packages/vitest/test/tsgo-gate/tsconfig.rule-ok.json
    - packages/vitest/test/tsgo-gate/tsconfig.rule-missing.json
  modified:
    - scripts/verify-tsgo-gate.sh

key-decisions:
  - "The two invisibility proofs use the STACKED directive form (`@ts-expect-error` above `@effect-diagnostics-next-line missingEffectContext:off`, the plugin directive immediately over the code), not a bare `@ts-expect-error` — a TypeScript suppression does not silence an @effect/tsgo diagnostic, so a bare directive would have left TS377004 unsuppressed and broken the must-compile-clean fixture."
  - "D-01's Scenario form is covered by an inline positive use plus an inline invisibility directive in rule-satisfied.ts, NOT by a dedicated whole-file negative fixture — one fixture, one defect, and no roadmap success criterion asks for a separate Scenario-form negative."
  - "The `RuleDsl`-omits-BeforeAllScenarios guard is a plain `void ruleDsl.BeforeAllScenarios` property access under a lone `@ts-expect-error` (TS2339, no Effect diagnostic involved), copying hook-satisfied.ts's `void dsl.Before` technique exactly."
  - "REQUIREMENTS.md was deliberately NOT edited: DSL-05 is shared with 08-03/08-05a in this same wave, and this plan proves only the compile-time half. The orchestrator owns that write after the wave merges."

patterns-established:
  - "Assertion pair per DSL surface: every new registrar/container that introduces its own `ROut` gets a satisfied control and a starved twin, both named in the config-variable block and the existence loop."
  - "A must-compile-clean fixture can carry assertions in BOTH directions — too strict fails it with TS2345/TS377004, too loose fails it with TS377000/TS2578."

requirements-completed: [DSL-05]

# Metrics
duration: 21min
completed: 2026-08-29
---

# Phase 8 Plan 06: tsgo Gate for the Rule/Scenario Extra-Layer Boundary Summary

**A committed satisfied/starved fixture pair plus gate assertions 12 and 13 that make DSL-05's compile-time boundary fail loudly: a step inside a `Rule` compiles against that Rule's own extra Layer, and the byte-identical step body at Feature level is rejected by name with `effect(missingEffectContext)`.**

## Performance

- **Duration:** ~21 min
- **Started:** 2026-08-29
- **Completed:** 2026-08-29
- **Tasks:** 2
- **Files modified:** 5 (4 created, 1 modified)

## Accomplishments

- `rule-satisfied.ts` exercises everything ADR-EC-010's two extra-Layer containers are required to accept in one must-compile-clean file: a Rule-nested `Scenario` step using both the ambient `World` and the Rule's `RuleService`; a step registered directly on `ruleDsl` (the five registrars `RuleDsl extends ScenarioDsl` inherits); all four Rule-scopeable hooks (`Before`/`After`/`BeforeStep`/`AfterStep`) each yielding the Rule's own service, proving `HookRegistrar<ROut | R2>`'s union covers it; a Rule-level `Background`; and D-01's Scenario form (`Scenario("scoped", ScenarioService.layer, ...)`) with a step using both services.
- Three load-bearing `@ts-expect-error` directives make the same file fail when the DSL gets too LOOSE: `void ruleDsl.BeforeAllScenarios` (TS2339 — `RuleDsl` must not expose it, Dsl.ts note (f)), a Feature-level step reaching for `RuleService` (INV-EC-005 for the Rule form), and a sibling two-argument `Scenario` reaching for `ScenarioService` (INV-EC-005 for the Scenario form).
- `rule-missing-service.ts` is the twin: the Rule-scoped step body copied verbatim to Feature level against `World.layer` alone, with no `Rule` in the file. Its only defect. Rejected with `TS377004 ... effect(missingEffectContext)` and no `missingLayerContext` anywhere in the output.
- `scripts/verify-tsgo-gate.sh` now runs thirteen assertions and exits 0. Assertion 12's `fail` message enumerates all three ways the positive control can break and how to tell them apart; assertion 13 checks exit code AND diagnostic name, with a NOTE block forbidding harmonization with assertions 4/8's `missingLayerContext`.
- Both mutation proofs recorded below make the gate fail by name, then were reverted.

## Task Commits

1. **Task 1: the satisfied/starved Rule fixture pair and their tsconfigs** — `1b6a9e3` (test)
2. **Task 2: gate assertions 12 and 13** — `c7b7fe9` (test)

## Files Created/Modified

- `packages/vitest/test/tsgo-gate/src/rule-satisfied.ts` (created) — the Rule AND Scenario extra-Layer positive control; must compile clean; carries three assertion directives.
- `packages/vitest/test/tsgo-gate/src/rule-missing-service.ts` (created) — the starved twin; must NOT compile; one defect only.
- `packages/vitest/test/tsgo-gate/tsconfig.rule-ok.json` (created) — `extends ./tsconfig.json`, `include: []`, `files: ["src/rule-satisfied.ts"]`.
- `packages/vitest/test/tsgo-gate/tsconfig.rule-missing.json` (created) — same shape, `files: ["src/rule-missing-service.ts"]`.
- `scripts/verify-tsgo-gate.sh` (modified) — `RULE_OK_CONFIG`/`RULE_NEG_CONFIG` added to the config block and the existence loop; assertions 12 and 13 appended before the closing "tsgo gate: ENFORCED" line.

## Verification Evidence

```
$ node node_modules/typescript/bin/tsc -p packages/vitest/test/tsgo-gate/tsconfig.rule-ok.json
EXIT=0            (no output)

$ node node_modules/typescript/bin/tsc -p packages/vitest/test/tsgo-gate/tsconfig.rule-missing.json
packages/vitest/test/tsgo-gate/src/rule-missing-service.ts(56,63): error TS2345: ...
                  Type 'RuleService' is not assignable to type 'Scope | World'.
packages/vitest/test/tsgo-gate/src/rule-missing-service.ts(56,63): error TS377004: This Effect
  requires a service that is missing from the expected Effect context: `RuleService`.
  effect(missingEffectContext)
EXIT=1            (no `missingLayerContext` in the output)

$ bash scripts/verify-tsgo-gate.sh         -> exit 0, 13 checkmark lines, "tsgo gate: ENFORCED"
$ pnpm verify:tsgo-gate                    -> exit 0
$ pnpm lint                                -> exit 0
$ pnpm build                               -> exit 0
$ git status --short                       -> clean (both mutations reverted)
```

Acceptance greps on `rule-satisfied.ts`: `@ts-expect-error` = 4 (>=3), the four Rule hooks = 4 (>=4), `.Background(` = 1 (>=1), `ScenarioService` = 12 (>=2). On `verify-tsgo-gate.sh`: `RULE_OK_CONFIG|RULE_NEG_CONFIG` = 6 lines (>=6), `tsconfig.rule-ok.json` = 1, `tsconfig.rule-missing.json` = 1.

### Mutation proof 1 — narrow `FeatureDsl.Rule`'s callback union

Changed `define: (dsl: RuleDsl<ROut | R2>) => void` to `define: (dsl: RuleDsl<ROut>) => void` in `packages/vitest/src/Dsl.ts`. `bash scripts/verify-tsgo-gate.sh` failed on **assertion 12** — the Rule's own service was rejected in four places INSIDE the Rule (the Rule-nested Scenario step, the `ruleDsl.Given` step, and the hook bodies), each reported as:

```
packages/vitest/test/tsgo-gate/src/rule-satisfied.ts(124,19): error TS377004: This Effect requires
  a service that is missing from the expected Effect context: `RuleService`.
  effect(missingEffectContext)
...
X tsgo gate: NOT ENFORCED
  the Rule/Scenario extra-Layer positive control failed to compile — ... (i) ... the extra service
  was wrongly REJECTED where it is supposed to be visible ...
```

Reverted; `git status --short` clean afterwards.

### Mutation proof 2 — leak `BeforeAllScenarios` onto `RuleDsl`

Added `readonly BeforeAllScenarios: HookRegistrar<ROut>` to `RuleDsl` in `packages/vitest/src/Dsl.ts`. Assertions 1-11 all still passed (nothing else in the repo covers that member's absence); `bash scripts/verify-tsgo-gate.sh` failed on **assertion 12** with exactly the predicted code:

```
packages/vitest/test/tsgo-gate/src/rule-satisfied.ts(148,5): error TS2578: Unused '@ts-expect-error' directive.

X tsgo gate: NOT ENFORCED
  ... (ii) TS2578 'Unused @ts-expect-error directive' on the `void ruleDsl.BeforeAllScenarios`
  line: BeforeAllScenarios or AfterAllScenarios LEAKED onto RuleDsl ...
```

Reverted; `git status --short` clean afterwards.

## Decisions Made

- **Stacked directives for both invisibility proofs.** The plan's action described `@ts-expect-error` alone. That is insufficient here and would have broken the fixture: `hook-missing-service.ts`'s own header states a TypeScript suppression does not silence an `@effect/tsgo` diagnostic, so a bare `@ts-expect-error` on a step body reaching for an unprovided service leaves `TS377004` unsuppressed and the must-compile-clean file fails. `step-expect-error.ts` already documents the correct construct (`@ts-expect-error` above `@effect-diagnostics-next-line missingEffectContext:off`, the plugin directive immediately over the code, order load-bearing), and both proofs copy it verbatim. This is strictly stronger than the plan asked for: the guard now fails in two ways when the boundary decays — `TS377000` for the dead plugin directive, then `TS2578` for the dead TypeScript one — and assertion 12's `fail` message names both codes.
- **The `RuleDsl`-omits-`BeforeAllScenarios` guard needs no plugin directive.** It is a plain property access (`TS2339`), the same shape as `hook-satisfied.ts`'s `void dsl.Before`. Mutation proof 2 confirms it fires with `TS2578` alone.
- **REQUIREMENTS.md left untouched.** DSL-05 is claimed by 08-03 and 08-05a as well; this plan proves only its compile-time half, and both other plans run in the same wave. Editing a shared planning file from a worktree would have produced a merge conflict for no gain. `requirements-completed: [DSL-05]` is recorded in this summary's frontmatter for the orchestrator to act on.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed workspace dependencies in the worktree**
- **Found during:** Task 1 (first `tsc` invocation)
- **Issue:** The worktree had no `node_modules`, so `node node_modules/typescript/bin/tsc` failed with `MODULE_NOT_FOUND` and no acceptance criterion could be evaluated.
- **Fix:** Ran `pnpm install --frozen-lockfile`, which also re-ran the `effect-tsgo patch` prepare script so the repo-local compiler is the patched one the gate requires.
- **Files modified:** none tracked (`node_modules/` is gitignored; `pnpm-lock.yaml` unchanged — `--frozen-lockfile`)
- **Verification:** `git status --short` shows no lockfile or manifest change; `pnpm build` exits 0.
- **Committed in:** n/a (no tracked files affected)

**2. [Rule 1 - Bug] Split the existence-loop line so the traceability grep counts correctly**
- **Found during:** Task 2 (acceptance criteria check)
- **Issue:** `grep -c "RULE_OK_CONFIG\|RULE_NEG_CONFIG" scripts/verify-tsgo-gate.sh` returned 5, below the required 6. `grep -c` counts matching LINES, not occurrences, and both new variables sat on one continuation line of the `for f in ...` loop.
- **Fix:** Put `"$RULE_NEG_CONFIG"` on its own continuation line. No assertion, message, or check was weakened; the loop still tests both configs.
- **Files modified:** `scripts/verify-tsgo-gate.sh`
- **Verification:** grep now returns 6; `bash scripts/verify-tsgo-gate.sh` still exits 0 with 13 checkmark lines.
- **Committed in:** `c7b7fe9` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Neither changes what is asserted. The stacked-directive choice under "Decisions Made" is a correctness strengthening of the plan's described technique, not a deviation from its intent. No scope creep.

## Issues Encountered

- The plan's `@ts-expect-error`-only description of the two invisibility proofs would have produced a positive control that cannot compile, because the `@effect/tsgo` diagnostic survives a TypeScript suppression. Resolved by adopting the stacked-directive construct `step-expect-error.ts` already documents — see "Decisions Made". Nothing else blocked.

## Known Stubs

None. Both fixtures are complete specimens; no placeholder, empty value, or TODO was introduced. The `describeFeature` runtime still throws on `Rule(...)` (08-03's deliberate loud stub, 08-05a's job), but that is irrelevant to this plan: `tsc` type-checks against `FeatureDsl<ROut>`'s declared shape regardless of the implementation, which is exactly why this plan depended only on 08-03.

## Threat Flags

None. No network endpoint, auth path, file access pattern, or schema change was introduced — the plan adds committed type-test specimens and two shell assertions. `pnpm-lock.yaml` and both package manifests are unchanged (T-08-06-SC: no dependency added).

## Next Phase Readiness

- Assertion 12 is now the only thing in the repo that goes red when `FeatureDsl.Rule`'s or `ScenarioRegistrar`'s `ROut | R2` union is narrowed, or when a once-per-Feature hook leaks onto `RuleDsl`. 08-05a's runtime wiring can proceed against a boundary that is mechanically enforced rather than merely declared.
- `Dsl.ts` note (f)'s forward reference to "plan 08-06's tsgo-gate fixture pair" is now satisfied by files that exist. If a later plan rewrites that note, the fixture names it cites are `test/tsgo-gate/src/rule-satisfied.ts` and `rule-missing-service.ts`.
- Open for the orchestrator: DSL-05 in `.planning/REQUIREMENTS.md` is still `Pending` by design — see "Decisions Made".

## Self-Check: PASSED

All six claimed files exist on disk (`rule-satisfied.ts`, `rule-missing-service.ts`, `tsconfig.rule-ok.json`, `tsconfig.rule-missing.json`, `verify-tsgo-gate.sh`, this summary). All three claimed commits exist in `git log`: `1b6a9e3`, `c7b7fe9`, `d41c0aa`. Working tree clean; no tracked file was deleted by any commit in this plan.

---
*Phase: 08-rule-and-scenario-outline*
*Completed: 2026-08-29*

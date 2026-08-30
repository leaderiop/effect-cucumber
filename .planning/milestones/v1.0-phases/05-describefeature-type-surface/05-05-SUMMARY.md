---
phase: 05-describefeature-type-surface
plan: 05
subsystem: testing
tags: [typescript, effect, tsgo, compile-gate, type-tests, ts-expect-error, ci]

# Dependency graph
requires:
  - phase: 05-describefeature-type-surface (plan 05-04)
    provides: "the step-satisfied / step-missing-service fixture pair, gate assertions 5 and 6, and the one-file-one-case-one-tsconfig fixture template this plan copies"
  - phase: 05-describefeature-type-surface (plans 05-01..05-03)
    provides: "describeFeature's two overloads (object-form first, plain-Layer last) and Dsl.ts's StepRegistrar — the surfaces these fixtures assert against"
  - phase: 01-foundation
    provides: "scripts/verify-tsgo-gate.sh, its exit-code method note, and the tsgo-gate fixture directory"
provides:
  - "world-undeclared-field.ts — DSL-03's negative case, failing as a plain TS2339 with no Effect diagnostic in its output"
  - "layer-missing-rin.ts — an unsatisfied Layer ARGUMENT failing by name as effect(missingLayerContext), which doubles as the behavioral proof of describeFeature's overload order"
  - "step-expect-error.ts — the roadmap's literal @ts-expect-error negative form, working via stacked directives, documented as the weaker supplement to the exit-code fixture"
  - "gate assertions 7, 8 and 9 — every Phase 5 roadmap success criterion now has an automated assertion"
affects: [06-runner, any-phase-touching-describeFeature-overloads, any-tsgo-or-effect-version-bump]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Stacked suppression directives: @ts-expect-error above @effect-diagnostics-next-line, the latter immediately above the code"
    - "Assertion-shape-per-failure-mode: plain-TS fixtures assert a TSxxxx code, Effect fixtures assert a diagnostic NAME, suppressed fixtures assert exit 0 only"
    - "Mutation-proof-per-assertion: every new assertion was demonstrated to go red under a targeted, reverted mutation"

key-files:
  created:
    - packages/vitest/test/tsgo-gate/src/world-undeclared-field.ts
    - packages/vitest/test/tsgo-gate/tsconfig.world-field.json
    - packages/vitest/test/tsgo-gate/src/layer-missing-rin.ts
    - packages/vitest/test/tsgo-gate/tsconfig.layer-rin.json
    - packages/vitest/test/tsgo-gate/src/step-expect-error.ts
    - packages/vitest/test/tsgo-gate/tsconfig.step-expect-error.json
  modified:
    - scripts/verify-tsgo-gate.sh

key-decisions:
  - "Assertion 7 checks exit code plus TS2339 and deliberately does NOT grep effect( — the World-field fixture emits no TS377xxx code at all, so an effect( grep could only ever fail and would invite weakening the check. A NOTE comment in the script records the reason."
  - "Assertion 9 checks the exit code ONLY. The suppressed-directive fixture can fail with either TS2578 (dead @ts-expect-error) or TS377000 (dead plugin directive) depending on which suppression goes stale first; pinning the assertion to one code would make it silent for the other."
  - "Db in layer-missing-rin.ts deliberately has NO static layer. Its absence is structural, so the fixture cannot be quietly satisfied by wiring one line."
  - "Assertion 8 is documented in-script as non-redundant with assertion 4 despite greping the same diagnostic name: 4 guards the compiler plugin on a bare Layer.merge misuse, 8 guards this DSL's overload order on a Layer passed as an argument."

patterns-established:
  - "Prose in a fixture must not contain the literal text an acceptance grep forbids — describe a forbidden directive rather than quoting it, or the file fails its own check"
  - "Never begin a comment line with @ts- (RESEARCH Finding 12), and keep it out of prose that a grep will scan"

requirements-completed: [DSL-01, DSL-03]

# Metrics
duration: 10min
completed: 2026-08-29
---

# Phase 05 Plan 05: Remaining Negative Fixtures and Gate Assertions 7-9 Summary

**Three new compile-gate fixtures — plain-TS `TS2339` on an undeclared World field, `effect(missingLayerContext)` on an unsatisfied Layer argument, and a stacked-directive `@ts-expect-error` file that compiles clean — wired into `verify-tsgo-gate.sh` as assertions 7, 8 and 9, with both required mutation proofs reproduced.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-08-29T00:18:38Z
- **Completed:** 2026-08-29T00:28:19Z
- **Tasks:** 3
- **Files modified:** 7 (6 created, 1 modified)

## Accomplishments

- **DSL-03's negative half now has an assertion.** `world-undeclared-field.ts` reads `oranges` off a World whose declared shape is `{ apples }` and fails with exactly one diagnostic: `TS2339: Property 'oranges' does not exist on type '{ readonly apples: Ref<number>; }'`. No `TS377xxx` code appears anywhere in its output, which is why assertion 7 asserts a TypeScript code and never `effect(`.
- **`describeFeature`'s overload order is now behaviorally guarded.** `layer-missing-rin.ts` passes a `Layer<World, never, Db>` — a Layer whose own `RIn` names a service nothing provides — and is rejected with `TS2769` plus `TS377034 ... effect(missingLayerContext)` naming `Db`. Swapping the two overloads was demonstrated to break assertion 8's second check while every other assertion stayed green.
- **The roadmap's literal `@ts-expect-error` wording is honored without weakening the primary proof.** `step-expect-error.ts` compiles clean (exit 0) only because both errors on the marked line are suppressed, and both its failure modes were reproduced. Its header and assertion 9's banner both state, in plain terms, that it is strictly weaker than assertion 6 and must not be treated as a replacement.
- **Nine assertions run on every push.** `bash scripts/verify-tsgo-gate.sh` prints nine `✓` lines and ends `tsgo gate: ENFORCED`; `pnpm verify:tsgo-gate` is already a required step in `.github/workflows/check.yml`, so no CI change was needed.

## Task Commits

1. **Task 1: The two remaining negative fixtures — World field and Layer RIn** — `04f1b0d` (test)
2. **Task 2: The supplementary @ts-expect-error fixture (stacked directives)** — `4a6f20b` (test)
3. **Task 3: Gate assertions 7, 8 and 9** — `5544632` (test)

## Files Created/Modified

- `packages/vitest/test/tsgo-gate/src/world-undeclared-field.ts` — DSL-03 / BEH-EC-004's negative case. A correct Layer, a fully-satisfied step context, and one property read that is not in the declared shape. The header states outright that the assertion must not grep `effect(`, and that an Effect diagnostic appearing here would mean the fixture acquired a second defect.
- `packages/vitest/test/tsgo-gate/tsconfig.world-field.json` — isolated config, `files: ["src/world-undeclared-field.ts"]`.
- `packages/vitest/test/tsgo-gate/src/layer-missing-rin.ts` — the Layer-argument negative case. `World.layer` is annotated `Layer.Layer<World, never, Db>` and `Db` has no layer at all. The call-site comment names `describeFeature.ts` note (a) as the other half of the overload-order pair.
- `packages/vitest/test/tsgo-gate/tsconfig.layer-rin.json` — isolated config.
- `packages/vitest/test/tsgo-gate/src/step-expect-error.ts` — the stacked-directive fixture, plus a header recording which code each failure mode produces.
- `packages/vitest/test/tsgo-gate/tsconfig.step-expect-error.json` — isolated config.
- `scripts/verify-tsgo-gate.sh` — three config constants, all three added to the existence loop, and assertions 7, 8 and 9 in the file's existing banner/capture/echo/`✓` style.

## Decisions Made

- **Assertion 9 checks exit code only, with no grep.** The plan's acceptance criteria anticipated `TS2578` as the loosening-mutation signal. Measurement showed it depends on which suppression goes stale first (see Mutation Proofs below), so pinning the assertion to a single code would have made it silent for the other failure. The banner comment records both codes and why neither is grepped.
- **`Db` in `layer-missing-rin.ts` has no `static readonly layer`.** The sibling fixtures all declare one. Omitting it here makes "nothing provides `Db`" structural rather than incidental — a future editor cannot make the fixture vacuous without visibly adding a Layer that was never present.
- **`world-undeclared-field.ts` declares only `World`, not `Db`.** The sibling DSL fixtures declare both. `Db` has no role in a fixture whose single defect is a property read, and including it would have added a service with nothing to do — which is the kind of slack that lets a second defect hide.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed workspace dependencies in the worktree**
- **Found during:** Task 1 (baseline verification, before any file was written)
- **Issue:** The parallel-execution worktree had no `node_modules`, so `bash scripts/verify-tsgo-gate.sh` failed with `Cannot find module .../typescript/bin/tsc` and reported `NOT ENFORCED`. Nothing could be verified.
- **Fix:** `pnpm install --frozen-lockfile`. The lockfile was already up to date; zero packages were added, removed, or resolved anew, and no manifest field changed. The root `prepare` script re-ran `effect-tsgo patch` against the worktree's compiler, which is required for the plugin to be active.
- **Files modified:** none tracked (`node_modules/` is gitignored)
- **Verification:** baseline `bash scripts/verify-tsgo-gate.sh` then printed six `✓` lines and `tsgo gate: ENFORCED`, matching the known-green state 05-04 left behind. `git status --short` stayed clean.
- **Committed in:** n/a — no tracked file changed

**2. [Rule 1 - Bug] Reworded fixture prose that its own acceptance grep would have matched**
- **Found during:** Tasks 1 and 2
- **Issue:** Three comment passages tripped the plan's own anti-vacuity greps on substring, not on real code. In `world-undeclared-field.ts`, "diagnostic h**as any**thing to fire on" and a backticked "`context: any`" both matched `:\s*any\b|<any>|as any`, which the acceptance criteria require to return 0. In `step-expect-error.ts`, a passage quoting the forbidden file-level directive matched `grep -c 'effect-diagnostics missingEffectContext'`, which is required to return 0.
- **Fix:** Reworded all three. The `any`-related prose now says "there is nothing for an Effect diagnostic to fire on" and "a runner that threads an untyped `context` object through steps", and picks up an explicit PITFALLS Pitfall 6 reference on why the fixture carries no widening escape hatch. The directive passage now describes the file-level variant ("the same rule name, spelled without the `-next-line` suffix") instead of quoting it, and says so.
- **Files modified:** `packages/vitest/test/tsgo-gate/src/world-undeclared-field.ts`, `packages/vitest/test/tsgo-gate/src/step-expect-error.ts`
- **Verification:** all three greps return 0; both fixtures recompile to their required exit codes (1 and 0 respectively).
- **Committed in:** `04f1b0d`, `4a6f20b` (part of the task commits)

**Note on the second item:** this is not cosmetic. A prose line quoting a file-level `@effect-diagnostics` suppression sits one plugin-parsing rule away from *being* one — RESEARCH Finding 12 documents exactly that hazard for `@ts-` prefixes, and the fixture would then have compiled clean for the wrong reason with nothing to detect it. Describing the directive rather than quoting it removes the hazard and satisfies the grep for the same reason.

**3. [Rule 2 - Missing Critical] Documented the measured loosening-mutation codes in the fixture header**
- **Found during:** Task 2 (loosening mutation)
- **Issue:** The fixture header, as the plan drafted it, asserted that loosening the DSL type makes `TS2578` fire. Measured, that is only true once the plugin directive is out of the way; with both directives present the first failure is `warning TS377000`. Leaving the header as drafted would have made a fixture whose entire job is precision carry a claim that its own compiler run contradicts — and AGENTS.md §4 ("say only what is true") is normative here.
- **Fix:** Replaced the single-code claim with the measured two-code behavior, and stated why assertion 9 therefore greps neither.
- **Files modified:** `packages/vitest/test/tsgo-gate/src/step-expect-error.ts`
- **Verification:** both codes reproduced (recorded below); fixture still exits 0 when restored.
- **Committed in:** `4a6f20b`

---

**Total deviations:** 3 auto-fixed (1 blocking, 1 bug, 1 missing critical)
**Impact on plan:** No scope change. Every task's stated `done` criterion was met as written; the deviations were an environment prerequisite and two corrections that make the fixtures satisfy their own acceptance checks and say only what the compiler actually does.

## Mutation Proofs

Four mutations were performed and reverted. All are recorded here because a gate assertion that has never been observed failing is indistinguishable from one that cannot fail.

### 1. Overload-order swap (assertion 8) — the plan's headline proof

Swapped the two overload declarations in `packages/vitest/src/describeFeature.ts` so the plain-Layer form is declared FIRST. Assertions 1-7 all stayed green. Assertion 8's exit-code check also stayed green — the call is still rejected — and its **second** check, the named-diagnostic grep, went red. Exactly RESEARCH.md Finding 6, reproduced against this repo's compiler:

```
packages/vitest/test/tsgo-gate/src/layer-missing-rin.ts(62,26): error TS2769: No overload matches this call.
  The last overload gave the following error.
    Type 'Layer<World, never, Db>' is missing the following properties from type
    '{ readonly shared: Layer<unknown, unknown, never>; readonly perScenario: Layer<unknown, unknown, never>; }': shared, perScenario

✗ tsgo gate: NOT ENFORCED

  the Layer argument was rejected, but NOT by name — effect(missingLayerContext) did not fire, so
  ADR-EC-016's gate has stopped covering describeFeature's layer argument while CI stays green.
  Most likely cause: the two overloads in packages/vitest/src/describeFeature.ts were reordered so
  the plain-Layer form is no longer LAST. [...] See describeFeature.ts note (a) and RESEARCH.md Finding 6.
```

`effect(missingLayerContext)` and `TS377034` are absent from that output entirely. Reverted with `git checkout -- packages/vitest/src/describeFeature.ts`; nine `✓` lines and `ENFORCED` restored.

**This is the finding in operational form:** the swap is a tidy-up a reasonable reviewer would approve — the plain-Layer form is the common case and reads naturally first — and assertion 8's second check is the only thing in the repository that goes red on it.

### 2. Vacuity mutation (assertion 7)

Changed `void world.oranges` to `void world.apples` — a field that IS declared. The fixture compiled clean and assertion 7's **exit-code** check failed:

```
✗ tsgo gate: NOT ENFORCED

  a World field absent from the declared type was REACHABLE from a step — ADR-EC-002's typed-context
  guarantee is decorative and World is an untyped bag with extra ceremony. [...]
```

Reverted; green restored.

### 3. Directive reversal (assertion 9)

Swapped the two suppression comment lines in `step-expect-error.ts` so `@effect-diagnostics-next-line` sits above `@ts-expect-error` instead of below it:

```
packages/vitest/test/tsgo-gate/src/step-expect-error.ts(62,6): warning TS377000: @effect-diagnostics directive has no effect.
packages/vitest/test/tsgo-gate/src/step-expect-error.ts(64,21): error TS377004: This Effect requires a service that is missing from the expected Effect context: `Db`. effect(missingEffectContext)
exit 1
```

Both symptoms RESEARCH.md Finding 3(A) predicted — the dead-directive warning AND the unsuppressed Effect diagnostic. Restored; exit 0 confirmed.

### 4. Loosening mutation (assertion 9)

Changed the ambient Layer from `World.layer` to `{ shared: Db.layer, perScenario: World.layer }` so `Db` is provided and no error occurs on the marked line.

With both directives still in place, the observed failure was **not** `TS2578`:

```
packages/vitest/test/tsgo-gate/src/step-expect-error.ts(63,6): warning TS377000: @effect-diagnostics directive has no effect.
exit 1
```

The plugin directive goes stale first and reports itself. Removing that directive and repeating the loosening then produced the expected TypeScript signal:

```
packages/vitest/test/tsgo-gate/src/step-expect-error.ts(62,3): error TS2578: Unused '@ts-expect-error' directive.
exit 1
```

Both codes mean the same thing — an expected error stopped happening — which is precisely why assertion 9 checks the exit code and greps for neither. Recorded in the fixture header so the next reader debugging a red assertion 9 knows both are possible. Both mutations reverted; exit 0 confirmed.

## Issues Encountered

- **The worktree had no `node_modules`.** Resolved by `pnpm install --frozen-lockfile` (deviation 1). Worth noting for future parallel-wave executors in this repo: the gate script shells out to `node node_modules/typescript/bin/tsc`, and without the install it fails at assertion 1 with a message ("the gate fixture is broken, not the gate") that points away from the real cause.
- **`TS2578` did not fire under the plan's stated loosening mutation.** Investigated rather than worked around; the cause is directive precedence, not a defect. Documented in Mutation Proof 4 and in the fixture header.

## Verification

Full suite, all green after the final commit:

| Command | Result |
|---|---|
| `pnpm build` | pass |
| `pnpm typecheck:test` | pass (both `packages/gherkin` and `packages/vitest`) |
| `pnpm verify:tsgo-gate` | pass — 9 `✓` lines, `tsgo gate: ENFORCED` |
| `pnpm test` | pass — 20 files, 426 tests |
| `pnpm lint` | pass (`oxlint` + `dprint check`) |

Acceptance greps:

| Check | Required | Actual |
|---|---|---|
| `grep -c 'TS2339' scripts/verify-tsgo-gate.sh` | ≥ 1 | 6 |
| `grep -cE '^\s*//\s*@ts-'` on both task-1 fixtures | 0 | 0, 0 |
| `grep -cE ':\s*any\b\|<any>\|as any'` on both task-1 fixtures | 0 | 0, 0 |
| `grep -cE '^\s*//\s*@ts-' step-expect-error.ts` | exactly 1 | 1 |
| `grep -c 'effect-diagnostics missingEffectContext' step-expect-error.ts` | 0 | 0 |
| directive line numbers in `step-expect-error.ts` | code−1, code−2 | 72 / 71 / 70 |
| all three new `*_CONFIG` constants in the existence loop | yes | yes (script lines 56-57) |
| assertion 7 greps `effect(` | no | no; NOTE comment present |

`layer-missing-rin.ts`'s output contains `effect(missingLayerContext)`, `TS377034` and the name `Db`, and does **not** contain `missing the following properties from type` — confirming the overloads are in the correct order in the committed state.

## Known Stubs

None. Every file created is a compile-gate fixture that is compiled and discarded; there is no runtime code, no placeholder data, and no unwired component in this plan.

## User Setup Required

None — no external service configuration required. No packages were installed and no manifest field changed.

## Next Phase Readiness

- **Every Phase 5 roadmap success criterion now has an automated assertion**, which was this plan's stated purpose. DSL-01 is covered by assertions 5/6 (the step pair) plus 8 (the Layer argument) plus 9 (the literal `@ts-expect-error` form); DSL-03 by assertion 5's positive fixture and assertion 7's negative one; DSL-04 by assertion 5's containers.
- **A guard now exists for the phase's most silent failure mode.** Anyone reordering `describeFeature`'s overloads gets a red build naming the cause. Phase 6 will extend `describeFeature`'s implementation (replacing the discarded `collect` call with `it.effect` emission) without touching the overload declarations; if that changes, assertion 8 is the thing to keep green.
- **No blockers.** The remaining Phase 5 work is outside this plan's scope.
- **One thing to re-run after a dependency bump:** RESEARCH.md dates the diagnostic-name and directive-syntax findings as valid to ~2026-09-05, because `@effect/tsgo` is on a fast release train. `TS377034`, `TS377004`, `TS377000` and the `@effect-diagnostics-next-line` syntax are all now load-bearing in committed assertions and fixtures. Re-run `pnpm verify:tsgo-gate` after any bump of `@effect/tsgo`, `typescript`, or `effect`.

## Self-Check: PASSED

All seven artifacts exist on disk (`world-undeclared-field.ts`, `layer-missing-rin.ts`,
`step-expect-error.ts`, their three `tsconfig.*.json` siblings, and the modified
`scripts/verify-tsgo-gate.sh`). All three task commits plus the two metadata commits are present in
`git log`. `git diff --diff-filter=D` against the plan's base commit reports zero deletions — this
plan is purely additive.

---
*Phase: 05-describefeature-type-surface*
*Completed: 2026-08-29*

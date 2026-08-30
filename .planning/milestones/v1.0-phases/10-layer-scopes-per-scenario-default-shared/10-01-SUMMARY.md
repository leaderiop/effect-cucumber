---
phase: 10-layer-scopes-per-scenario-default-shared
plan: 01
subsystem: testing
tags: [typescript, effect, layer, type-level-constraint, overloads, effect-vitest]

# Dependency graph
requires:
  - phase: 05-describefeature-and-the-step-dsl
    provides: "the two-overload `describeFeature`/`collectFeature` shape, and note (a)'s last-overload reporting rule that this plan had to leave intact"
  - phase: 03-parameter-types-and-step-matching
    provides: "the `.types.ts` compile-time-only test convention (`packages/gherkin/test/StepArgs.types.ts`) and its two-direction non-vacuity argument"
provides:
  - "`shared: Layer.Layer<RShared, never, never>` on the object-form overload of BOTH `describeFeature` and `collectFeature` — a failable shared Layer is now a compile error"
  - "`perScenario` left provably unconstrained, with the asymmetry asserted rather than merely written down"
  - "`packages/vitest/test/SharedLayerConstraint.types.ts` — six cases, three directions, two entry points, mutation-proven non-vacuous"
  - "module doc note (f) on `describeFeature.ts`, citing the verified upstream `Effect.orDie` location"
  - "BEH-EC-002's published signature and REQUIREMENT block brought back in line with the shipped one"
affects: [10-02, 10-03, 10-04, 10-06]

actuals:
  tokens: 7221
  tasks: 2
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "A type-level constraint on an argument POSITION is asserted in three directions, not two: rejection, positive control, and — where the constraint is deliberately asymmetric — an unconstrained-sibling control"
    - "A grep-based acceptance criterion that forbids a literal also forbids the mandatory idiom that contains it; scope the grep past `^import` lines rather than abandoning the check"

key-files:
  created:
    - packages/vitest/test/SharedLayerConstraint.types.ts
  modified:
    - packages/vitest/src/describeFeature.ts
    - spec/behaviors/01-steps-and-world.md
    - spec/traceability.md
    - packages/vitest/test/describeFeature.test.ts
    - .gitignore
    - dprint.json

key-decisions:
  - "`shared` is pinned to `Layer<R, never, never>` on both entry points; `perScenario` keeps its free `E2`. The asymmetry is D-04 and is now asserted by two directive-free asymmetry controls, so narrowing `perScenario` later fails the build by name rather than passing silently."
  - "`LayerArgument` (the implementation signature's union) is deliberately NOT narrowed. TypeScript never resolves a call against an implementation signature, so narrowing it changes nothing a caller can observe while making the body disagree with itself. One sentence in its doc comment says so."
  - "The compiler diagnostic for a rejected failable `shared` Layer is RECORDED, not asserted on. Note (a)'s last-overload rule means the text names a missing-property mismatch against the plain-Layer form rather than the error channel; the call is still rejected, which is the requirement."
  - "RUN-03 is NOT marked complete. This plan shipped the type-level half only; roadmap Success Criteria 1-3 need 10-02's runtime fix. Same call and same precedent as 03-01 through 03-04."
  - "The `' as [A-Z]'`-count-of-0 acceptance criterion is unsatisfiable as literally written — AGENTS.md section 3 MANDATES `import * as Layer from \"effect/Layer\"`, which matches it. The intent-preserving form (`grep -v '^import ' | grep -c ' as [A-Z]'`) returns 0 here and on both existing `.types.ts` precedents."

patterns-established:
  - "Three-direction type-position assertion: an asymmetric constraint needs a control proving the UNCONSTRAINED side is still unconstrained, or nothing distinguishes the decision from an unfinished edit"
  - "Mutation m3 as a named technique: delete the positive control and make the constraint TOTAL — if the negatives-only file stays green, that is the proof the positive control cannot be dropped"

requirements-completed: []

coverage:
  - id: D1
    description: "A `{ shared, perScenario }` call whose `shared` Layer has a non-`never` error channel does not compile, on both `describeFeature` and `collectFeature`"
    requirement: RUN-03
    verification:
      - kind: unit
        ref: "packages/vitest/test/SharedLayerConstraint.types.ts#negative cases (2 expect-error directives) via `pnpm typecheck:test`"
        status: pass
      - kind: other
        ref: "mutation m1 — reverting the narrowing on `describeFeature` alone produced TS2578 Unused directive at line 71"
        status: pass
    human_judgment: false
  - id: D2
    description: "A `{ shared, perScenario }` call whose `shared` Layer has a `never` error channel still compiles"
    requirement: RUN-03
    verification:
      - kind: unit
        ref: "packages/vitest/test/SharedLayerConstraint.types.ts#positive controls (lines 75, 87) via `pnpm typecheck:test`"
        status: pass
      - kind: other
        ref: "mutation m3 — with the controls deleted and `shared` made total, the negatives-only file compiled clean, which is why the controls exist"
        status: pass
    human_judgment: false
  - id: D3
    description: "`perScenario` is provably still unconstrained — a failable per-Scenario Layer compiles beside a `never`-channel `shared`"
    requirement: RUN-03
    verification:
      - kind: unit
        ref: "packages/vitest/test/SharedLayerConstraint.types.ts#asymmetry controls (lines 78, 90) via `pnpm typecheck:test`"
        status: pass
      - kind: other
        ref: "mutation m2 — narrowing `perScenario` too broke both asymmetry controls with TS2769"
        status: pass
    human_judgment: false
  - id: D4
    description: "Narrowing the object-form overload did not change which overload a plain-Layer call resolves against"
    requirement: RUN-03
    verification:
      - kind: integration
        ref: "pnpm verify:tsgo-gate — 13 assertions, including assertion 8 'an unsatisfied Layer argument is rejected by name: effect(missingLayerContext) — overload order intact'"
        status: pass
    human_judgment: false

# Metrics
duration: 12min
completed: 2026-08-30
status: complete
---

# Phase 10 Plan 01: The `shared` Layer error-channel constraint Summary

**`describeFeature`/`collectFeature` now reject a `shared` Layer that can fail, before `@effect/vitest`'s `Effect.orDie` can turn that failure into a defect nobody can attribute — with `perScenario` provably untouched and the whole claim mutation-proven in a compile-time-only test file.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-08-30T02:55:00Z
- **Completed:** 2026-08-30T03:07:00Z
- **Tasks:** 2
- **Files modified:** 7 (1 created, 6 modified)

## Accomplishments

- Both public entry points declare `readonly shared: Layer.Layer<RShared, never, never>`; the `E1` type parameter is gone from the file entirely, not merely unused.
- `perScenario` still declares `Layer.Layer<RScenario, E2, never>` on both, and two directive-free controls now fail the build if anyone narrows it.
- `packages/vitest/test/SharedLayerConstraint.types.ts` carries six cases and is compiled by `pnpm typecheck:test` on every push; `pnpm test`'s collected count is byte-identical before and after.
- Note (f) on `describeFeature.ts` records the upstream mechanism at its verified location, so the next reader finds the reason before deciding the constraint is over-strict.
- `spec/` was updated in the same commits: BEH-EC-002's `ts` fence, its REQUIREMENT block, a dated correction blockquote, and `traceability.md` section 4's row plus preamble.

## Task Commits

1. **Task 1: Narrow the object-form overload's `shared` to a `never` error channel** — `e02f41a` (feat)
2. **Task 2: `SharedLayerConstraint.types.ts` — the claim in all three directions** — `4513a17` (test)

Plus one out-of-band fix committed separately so it did not pollute either task commit:

- **Rule 3 unblock: keep `.gsd/` out of git and dprint** — `79cc407` (chore)

## Files Created/Modified

- `packages/vitest/test/SharedLayerConstraint.types.ts` (created) — the D-04 claim in three directions for two entry points; compile-time only, never collected by vitest.
- `packages/vitest/src/describeFeature.ts` — both object-form overloads narrowed; module doc gains note (f) and the header count goes from "Five things" to "Six"; `LayerArgument`'s doc comment says why the constraint is not there; the `@param layer` line and the "Two accepted layer forms" paragraph state the requirement in prose.
- `spec/behaviors/01-steps-and-world.md` — BEH-EC-002's signature listing updated, REQUIREMENT block gains the `shared`/`perScenario` asymmetry, dated correction blockquote added in the file's own established form.
- `spec/traceability.md` — section 4 preamble now names three non-suite entries, with the new file's row.
- `packages/vitest/test/describeFeature.test.ts` — one stale comment referencing `E1`/`E2` corrected to "the two overloads' error channels".
- `.gitignore`, `dprint.json` — `.gsd/` excluded, matching the existing `.planning/**` dprint exclusion.

## The recorded compiler diagnostic (plan Task 1 requirement)

The plan required the ACTUAL text be written down rather than assumed. A probe file compiled under `packages/vitest/tsconfig.test.json`:

```
describeFeature(feature, { shared: failingShared, perScenario: Layer.empty }, () => {})
```
where `failingShared: Layer.Layer<Db, DbConnectError, never>`, produces:

```
error TS2769: No overload matches this call.
  The last overload gave the following error.
    Object literal may only specify known properties, and 'shared' does not exist in type 'Layer<unknown, unknown, never>'.
```

This is exactly what note (a) predicts and what threat T-10-01-05 accepted: the diagnostic is reported against the LAST (plain-Layer) overload, so it names an unknown-property mismatch and never mentions the error channel at all. The call IS rejected, which is what D-04 requires. A consumer reading this message will not learn from it that their `shared` Layer needs `Layer.orDie`; note (f), the `@param` line and the doc paragraph are where that is written, because upstream compiler prose has never been a contract in this repo.

## Mutation proofs

All three performed against a clean tree, observed, and reverted. Each revert was confirmed with `git diff --quiet` before the next mutation.

### m1 — revert Task 1's narrowing on `describeFeature` alone

Restored `<RShared, RScenario, E1, E2>` and `shared: Layer.Layer<RShared, E1, never>` on `describeFeature` only. `pnpm typecheck:test`:

```
packages/vitest/test/SharedLayerConstraint.types.ts(71,1): error TS2578: Unused '@ts-expect-error' directive.
```

Line 71 is the `describeFeature` negative. The `collectFeature` negative at line 83 stayed green, which is the property that makes two negatives worth having: the entry points cannot drift apart unnoticed. **Reverted, tree clean.**

### m2 — narrow `perScenario` as well

Changed both overloads to `readonly perScenario: Layer.Layer<RScenario, never, never>` and dropped `E2`. `pnpm typecheck:test`:

```
packages/vitest/test/SharedLayerConstraint.types.ts(78,28): error TS2769: No overload matches this call.
  The last overload gave the following error.
    Object literal may only specify known properties, and 'shared' does not exist in type 'Layer<unknown, unknown, never>'.
packages/vitest/test/SharedLayerConstraint.types.ts(92,27): error TS2769: No overload matches this call.
  The last overload gave the following error.
    Object literal may only specify known properties, and 'shared' does not exist in type 'Layer<unknown, unknown, never>'.
```

Both asymmetry controls go red — one per entry point. They are not decorative. **Reverted, tree clean.**

### m3 — delete the positive controls and make `shared` total

Deleted the four directive-free cases and changed `shared` to `Layer.Layer<RShared, never, never> & { readonly __rejectsEverything: true }`, which no real Layer satisfies. `pnpm typecheck:test` reported **zero errors in `SharedLayerConstraint.types.ts`** — both remaining negatives were still "used", so the file that carries the claim was completely green while the object form had become unusable to every caller. That is the failure mode the positive controls exist to catch, and it is why they cannot be dropped.

One honest qualification the plan did not anticipate: the mutation was not silent REPO-wide. `packages/vitest/test/describeFeature.test.ts` also calls the object form, so it reported two TS2769s of its own:

```
packages/vitest/test/describeFeature.test.ts(312,11): error TS2769: No overload matches this call.
packages/vitest/test/describeFeature.test.ts(326,51): error TS2769: No overload matches this call.
```

That is an accidental witness, not a designed one — it exists only because the runtime suite happens to use the object form today, and it would vanish the moment those two calls were rewritten. It does not substitute for the positive controls, and the m3 result stands: the file whose job is to carry the claim said nothing. **Reverted, tree clean.**

## `pnpm test` counts, before and after

Identical, as the `.types.ts` suffix requires:

| | Test Files | Tests |
|---|---|---|
| Before this plan | 32 passed (32) | 743 passed \| 3 skipped (746) |
| After this plan | 32 passed (32) | 743 passed \| 3 skipped (746) |

## Gate results

| Gate | Result |
|---|---|
| `pnpm build` | exit 0 |
| `pnpm typecheck:test` | exit 0 |
| `pnpm test` | exit 0, count unchanged |
| `pnpm verify:tsgo-gate` | exit 0 — all 13 assertions, including assertion 8's "overload order intact" |
| `pnpm lint` | exit 0 (oxlint + `dprint check`) |
| `pnpm verify:spec` | exit 0 — 7 PASS, 0 FAIL, 1 SKIP |

## Acceptance criteria

| Criterion | Result |
|---|---|
| `grep -c 'readonly shared: Layer.Layer<RShared, never, never>' src/describeFeature.ts` | 2 |
| `grep -c 'readonly perScenario: Layer.Layer<RScenario, E2, never>' src/describeFeature.ts` | 2 |
| `grep -c 'E1' src/describeFeature.ts` | 0 |
| plain-Layer overload still LAST (last `layer: Layer.Layer<ROut, E, never>` line 889 > last `readonly shared:` line 875) | yes |
| note (f) names both `Effect.orDie` and `SharedLayerConstraint.types.ts` | yes |
| `grep -c '@ts-expect-error' test/SharedLayerConstraint.types.ts` | 2 |
| `grep -c 'from "../src/index.ts"' test/SharedLayerConstraint.types.ts` | 0 |
| type assertions in `SharedLayerConstraint.types.ts` | 0 (see deviation 3 for the criterion's literal form) |

## Decisions Made

See the `key-decisions` frontmatter. The two worth restating for a reader of 10-02:

- **The runtime path this constraint guards does not exist yet.** `layer()`'s `Effect.orDie` is unreachable from this library today, because `normalizeLayer` still merges both halves into one per-Scenario Layer. 10-02 is what makes it reachable. The type constraint landing first is deliberate and follows the Phase 5 precedent: the negative type test precedes the runtime code it guards.
- **RUN-03 stays Pending.** Marking it here would claim the build-once behaviour, which is 10-02's. 10-06 already owns `.planning/REQUIREMENTS.md` and should mark RUN-03/RUN-04 together once the phase's runtime and verification halves are both in.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `pnpm lint` failed on a GSD harness artifact, not on any planned file**

- **Found during:** Task 1 (running the plan's required `pnpm lint` gate)
- **Issue:** The workflow harness writes `.gsd/dispatch-isolation-sentinel.json`. `dprint`'s `includes` covers `**/*.json` and its `excludes` list had `.planning/**` but not `.gsd/**`, so `dprint check` demanded the machine-written sentinel be reformatted and `pnpm lint` exited 20. Nothing in this plan touched that file, and the failure would recur for every plan in this phase and for the user locally.
- **Fix:** Added `.gsd/**` to `dprint.json`'s `excludes`, directly beside the existing `.planning/**` entry and for the same reason, and `.gsd/` to `.gitignore` beside `.claude/settings.local.json`.
- **Files modified:** `dprint.json`, `.gitignore`
- **Verification:** `pnpm lint` exit 0.
- **Committed in:** `79cc407` — deliberately a SEPARATE `chore` commit, so neither task commit carries unrelated infrastructure.

**2. [Rule 2 - Missing Critical] `spec/` and the stale `E1` reference updated in the same commits**

- **Found during:** Task 1 and Task 2
- **Issue:** AGENTS.md section 1 is explicit: "a code change that isn't reflected in `spec/` in the same commit is incomplete, not merely undocumented." Three places went stale the moment the overload changed: `spec/behaviors/01-steps-and-world.md`'s BEH-EC-002 published the old `<RShared, RScenario, E1, E2>` signature verbatim; `spec/traceability.md` section 4 is enumerated from disk and said "**two** deliberate non-suite entries" while a third now exists; and a comment in `packages/vitest/test/describeFeature.test.ts` named `E1`, an identifier that no longer exists.
- **Fix:** BEH-EC-002's `ts` fence updated, a dated correction blockquote added in that file's own established form (the superseded claim marked in place, following ADR-EC-014's precedent), and the REQUIREMENT block given the `shared`-must-be-`never` / `perScenario`-must-not clause. `traceability.md`'s preamble now names three entries and the table has the new row, inserted in the established position (`.types.ts` rows last within their package group). The test comment now reads "the two overloads' error channels".
- **Files modified:** `spec/behaviors/01-steps-and-world.md`, `spec/traceability.md`, `packages/vitest/test/describeFeature.test.ts`
- **Verification:** `pnpm verify:spec` exit 0 (7 PASS / 0 FAIL / 1 SKIP), `pnpm lint` exit 0 (the markdown is dprint-formatted).
- **Committed in:** `e02f41a` (the behavior doc and the test comment) and `4513a17` (traceability), each inside the task commit whose change made it stale.

**Note on scope:** plan 10-06 lists `spec/traceability.md` and other spec files in its `files_modified`, but not `spec/behaviors/01-steps-and-world.md`. Neither edit here conflicts with 10-06's — this plan corrected only what this plan invalidated, and 10-06's own status-flip work is untouched.

**3. [Rule 3 - Blocking] One acceptance criterion is unsatisfiable as literally written**

- **Found during:** Task 2 (checking acceptance criteria)
- **Issue:** The criterion `grep -c ' as [A-Z]' packages/vitest/test/SharedLayerConstraint.types.ts` returns 0 cannot be met by any file in this repo that imports Effect. AGENTS.md section 3 MANDATES submodule namespace imports — `import * as Layer from "effect/Layer"` — and those two lines match the pattern. The criterion's INTENT is "no type assertion anywhere", and a namespace import is not a type assertion.
- **Fix:** Applied the intent-preserving form, `grep -v '^import ' <file> | grep -c ' as [A-Z]'`, which returns **0**. Cross-checked against both existing precedents (`packages/gherkin/test/StepArgs.types.ts` and `packages/vitest/test/GherkinTags.types.ts`): both also return 2 under the literal form and 0 under the corrected one, confirming the criterion — not the file — is what was wrong. Also confirmed 0 occurrences of `as const`, `satisfies`, and the word `any`.
- **Files modified:** none (a criterion correction, not a code change)
- **Verification:** recorded above under Acceptance criteria.
- **Committed in:** n/a — recorded here.

This is the same class of collision `STATE.md`'s 03-04 entry already documents ("writing a grep-based acceptance criterion that forbids a literal also forbids explaining it in a comment"), and it bit twice in this plan: the same reasoning is why the new file's header describes its negative directives without spelling the token, so that the count-of-2 criterion stays honest.

---

**Total deviations:** 3 auto-fixed (1 missing critical, 2 blocking)
**Impact on plan:** No scope creep. Deviation 1 is infrastructure that was blocking a required gate; deviation 2 is mandated by AGENTS.md section 1 and touches only what this plan invalidated; deviation 3 changed no code at all.

## Issues Encountered

None beyond the deviations above. Both tasks' verification passed on the first run after their edits.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

**Ready for 10-02.** The type-level gate is in place and green, which is the ordering the plan wanted: 10-02 makes `layer()`'s `Effect.orDie` reachable, and by the time it does, a Layer that could reach it does not compile.

Constraints 10-02 must respect:

- **`shared` is now `Layer<R, never, never>` on both entry points, and `perScenario` deliberately is not.** Do not "restore symmetry". Two directive-free asymmetry controls in `SharedLayerConstraint.types.ts` fail the build by name if `perScenario` is narrowed — mutation m2 above is the recorded proof.
- **The plain-Layer overload must stay LAST on both functions.** Unchanged by this plan; `pnpm verify:tsgo-gate` assertion 8 is what catches a swap.
- **`LayerArgument` is deliberately still `Layer.Layer<any, any, never>` on both union members.** 10-02 will restructure how the two halves flow into `emitFeature`; whatever shape it picks, narrowing the implementation-signature union buys nothing and would only make the body disagree with itself. `LayerArgument`'s doc comment now says so.
- **The `.types.ts` file imports `describeFeature` and `collectFeature` by direct relative path.** If 10-02 changes either signature, that file is compiled by `pnpm typecheck:test` and will report it — which is the point.
- **RUN-03 and RUN-04 are still Pending in `.planning/REQUIREMENTS.md`, deliberately.** 10-06 owns that file and should mark both.

## Self-Check: PASSED

All five named files verified present on disk; all three commit hashes verified present in
`git log --all`.

---
*Phase: 10-layer-scopes-per-scenario-default-shared*
*Completed: 2026-08-30*

---
phase: 05-describefeature-type-surface
plan: 03
subsystem: testing
tags: [effect, layer, typescript-overloads, vitest, gherkin, dsl, barrel-exports]

# Dependency graph
requires:
  - phase: 05-01
    provides: "createRegistry — the per-call step container and scope stack"
  - phase: 05-02
    provides: "Dsl.ts (FeatureDsl/ScenarioDsl/BackgroundDsl/StepRegistrar) and Step.ts (register's auto-wrap)"
  - phase: 02
    provides: "@effect-cucumber/gherkin's ParsedFeature and parseFeature"
provides:
  - "describeFeature — the public entry point, two overloads, plain-Layer form declared LAST"
  - "collectFeature — the assertable collection seam and Phase 6's (RUN-01) join point"
  - "FeatureCollection — { feature, layer, definitions }, the shape Phase 6 reads"
  - "The real @effect-cucumber/vitest barrel (describeFeature + the four dsl types)"
  - "Runtime proof of per-call registry freshness, scope threading, D-03 and D-04"
affects: [05-05, 05-06, 06-runner, phase-6-run-01]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "TypeScript overload ordering as a diagnostics contract: the overload you want errors reported against is declared LAST"
    - "A named collection seam (collectFeature) so a phase that emits nothing is still assertable without a runner"
    - "Layer.merge(shared, perScenario) — last argument wins a service collision, no special-case code"

key-files:
  created:
    - packages/vitest/src/describeFeature.ts
    - packages/vitest/test/describeFeature.test.ts
  modified:
    - packages/vitest/src/index.ts
    - packages/gherkin/src/index.ts

key-decisions:
  - "describeFeature and collectFeature are `function` declarations, not arrow consts — an arrow const cannot carry overload signatures. Documented in note (b) so it is not 'fixed' back."
  - "collectFeature carries the same two overloads as describeFeature, and both delegate to one non-exported `collect`, so the seam and the entry point cannot drift into two behaviours."
  - "Layer.merge(shared, perScenario) chosen over Layer.provideMerge — verified by running both: the SECOND argument wins a collision either way, and merge's type (Layer<A|B, E|E2, RIn|RIn2>) is the simpler one for two RIn=never Layers."
  - "The ADR-EC-016 link target is 016-effect-tsgo-language-service-plugin.md — the filename the plan cited does not exist on disk."
  - "DSL-01 and DSL-04 left UNCHECKED in REQUIREMENTS.md — both have halves this plan does not deliver (the tsgo build-gate proof is 05-05; Background-text matching is Phase 6)."

patterns-established:
  - "Opposite reporting rules, both written down: Dsl.ts note (a) says a UNION reports its FIRST member; describeFeature.ts note (a) says OVERLOADS report the LAST. Each note cross-references the other because intuition cannot hold them apart and both failure modes are silent."
  - "Container callbacks push a scope, invoke, and pop in a `finally` — a throwing define callback cannot leave the scope stack unbalanced."
  - "Mutation-record-in-the-header: every test file whose assertions guard a silent defect names the mutations that were run against it and which assertion each one failed."

requirements-completed: []

# Metrics
duration: 12min
completed: 2026-08-29
---

# Phase 5 Plan 03: describeFeature Type Surface Summary

**`describeFeature` composes Registry + Dsl + Step into two overloads with the plain-Layer form declared LAST (so `effect(missingLayerContext)` fires and names the real problem), a `collectFeature` seam that makes a zero-test-emitting phase assertable, and a real package barrel that retires the Phase-1 placeholder contract on both sides.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-08-29T01:53Z
- **Completed:** 2026-08-29T02:05Z
- **Tasks:** 3
- **Files modified:** 4 (2 created, 2 modified)

## Accomplishments

- **`describeFeature` with the diagnostics-correct overload order.** The `{ shared, perScenario }` object form is declared first and the plain `Layer` form last, because TypeScript reports "the LAST overload gave the following error". Reversed — which reads more naturally, and is exactly the tidy-up note (a) exists to stop — a `Layer<World, never, Db>` is reported as "missing the properties shared, perScenario", naming the wrong problem, and `effect(missingLayerContext)` never fires while the call is still rejected and CI stays green.
- **One fresh registry per invocation, proven.** Hoisting `createRegistry` to module scope was performed as a mutation and made the cross-contamination assertion fail; the reference-inequality assertion still passed, confirming in practice the header's claim that it alone proves nothing.
- **D-04 falls out of `Layer.merge`'s argument order, proven by running it.** `Layer.merge(shared, perScenario)` resolves a doubly-named service to `perScenario`. Swapping the two arguments compiles, type-checks and lints — only the runtime assertion catches it, and it did.
- **The Phase-1 placeholder contract retired on both sides.** `packageName` / `gherkinPackageName` / `PackageName` and gherkin's "Internal build-graph exports" doc block are gone; `describeFeature.ts`'s `import type { ParsedFeature } from "@effect-cucumber/gherkin"` now exercises the cross-package project reference for real, verified by a cold-cache `pnpm build`.

## Task Commits

1. **Task 1: describeFeature.ts — two overloads, plain-Layer form last** — `348085c` (feat)
2. **Task 2: describeFeature.test.ts — collection, scope threading, D-03 and D-04** — `596402b` (test)
3. **Task 3: The real barrel, and retiring the placeholder contract** — `ea8a2b0` (feat)

## Files Created/Modified

- `packages/vitest/src/describeFeature.ts` (created) — the two overloads, the `collect` implementation both entry points delegate to, `normalizeLayer`, and the `FeatureCollection` shape. Four module notes: (a) overload order, (b) why `function` and not arrow const, (c) synchronous `define`, (d) the merge direction.
- `packages/vitest/test/describeFeature.test.ts` (created) — 9 tests over per-call freshness, scope threading through `Background`/`Scenario` and back to the feature root, keyword fidelity, the `finally` pop under a throwing callback, synchronous `define`, and D-03/D-04/plain-Layer normalisation.
- `packages/vitest/src/index.ts` (modified) — replaced the Phase-1 placeholder with the real barrel: `describeFeature` plus `BackgroundDsl`/`FeatureDsl`/`ScenarioDsl`/`StepRegistrar` as types, with the export policy and the deliberately-unexported internals stated in the header.
- `packages/gherkin/src/index.ts` (modified) — deleted the `packageName`/`PackageName` exports and their doc block, whose stated purpose no longer holds.

## Decisions Made

- **`Layer.merge` over `Layer.provideMerge`.** D-04's context text suggested `Layer.provideMerge(perScenario, shared)`. Both were probed against the installed `effect@4.0.0-rc.112` before choosing: `merge(shared, perScenario)`, `mergeAll(shared, perScenario)` and `provideMerge(perScenario, shared)` all resolve a collision to `perScenario`. `merge` was chosen because its type (`Layer<A|B, E|E2, RIn|RIn2>`) is the direct one for two `RIn = never` Layers, and because its "second argument wins" reads in the same left-to-right order as the `{ shared, perScenario }` literal it normalises.
- **One non-exported `collect`, two overloaded public faces.** `describeFeature` and `collectFeature` both carry the two overloads and both delegate to `collect`. The alternative — `describeFeature` calling the overloaded `collectFeature` — cannot type-check from an implementation signature whose `layer` is the union, and would have needed casts.
- **`whoProvides`'s error channel is `unknown`, not `never`.** `FeatureCollection.layer` erases the overloads' `E1`/`E2`; annotating `never` produced `TS2375` plus `effect(missingEffectError)`. Widening to `unknown` keeps a build failure visible as a test failure and needs no cast.
- **REQUIREMENTS.md left untouched.** See "Issues Encountered".

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed workspace dependencies in the fresh worktree**
- **Found during:** Setup, before Task 1
- **Issue:** The parallel-execution worktree had no `node_modules`, so `pnpm build`, `pnpm test` and reading `effect/dist/Layer.d.ts` (a Task 1 `read_first` item) were all impossible.
- **Fix:** `pnpm install --frozen-lockfile` — restores the existing lockfile exactly; no package was added, removed or resolved to a new version, so the package-legitimacy exclusion on Rule 3 does not apply.
- **Files modified:** none (`node_modules/` is gitignored)
- **Verification:** Baseline `pnpm build` and `pnpm test` (19 files, 417 tests) green before any change was made.
- **Committed in:** n/a — no tracked file changed.

**2. [Rule 1 - Bug] Corrected the ADR-EC-016 link target**
- **Found during:** Task 1
- **Issue:** The plan asked for a link to `spec/decisions/016-effect-tsgo-diagnostics-are-a-build-gate.md`. No such file exists; the ADR is `016-effect-tsgo-language-service-plugin.md`.
- **Fix:** Linked the real filename, matching what `Dsl.ts` and `Step.ts` already link.
- **Files modified:** `packages/vitest/src/describeFeature.ts`
- **Verification:** `ls spec/decisions/` confirms the filename; the two sibling modules use the same target.
- **Committed in:** `348085c`

**3. [Rule 1 - Bug] The throwing-define assertion was rewritten to be discriminating**
- **Found during:** Task 2
- **Issue:** The plan asked to "assert that after a `Scenario` callback throws (caught by the test), a subsequent registration on a fresh registry still reports the feature root". As written this proves nothing about the `finally`: the throw propagates out of `collectFeature`, the registry is discarded with it, and a *fresh* registry starts at the feature root whether or not the pop happened.
- **Fix:** The throw is caught INSIDE the define callback, so collection continues, and the next step is registered on the SAME registry. Without the `finally`, the "explodes" frame is still on the stack and that step is attributed to the scenario.
- **Files modified:** `packages/vitest/test/describeFeature.test.ts`
- **Verification:** The assertion reads `{ kind: "feature", name: "Checkout" }` for a step registered after the throw; under mutation A it reported `name: "MUTATION"`, showing the assertion is live rather than vacuous.
- **Committed in:** `596402b`

### Acceptance criteria whose literal grep could not be satisfied as written

These are recorded rather than silently passed over. In each case the criterion's *intent* was met and verified by a corrected command; no implementation was bent to fit a grep.

**4. `grep -c 'createRegistry(' describeFeature.ts` returns 1**
- The call site is `createRegistry<StepBody>(feature.name)`. `createRegistry`'s `Fn` type parameter appears only in its return type, so it cannot be inferred and the explicit type argument is required — which puts `<StepBody>` between the identifier and the paren. The alternative spellings (a type assertion, or an intermediate annotated alias) are worse code for a grep's benefit.
- **Verified instead:** `grep -c 'createRegistry<StepBody>(' → 1`. Exactly one construction site, inside `collect`, never hoisted and never memoised. The mutation test is the real proof.

**5. `grep -c 'Registry' packages/vitest/src/index.ts` returns 0**
- Unsatisfiable together with the same task's own action instruction, which requires the header to "state explicitly" that `createRegistry` is not exported. Naming it makes the substring unavoidable.
- **Verified instead:** `grep -c '^export.*\(Registry\|collectFeature\|register\)' → 0`. The file has exactly two export statements: `describeFeature` (value) and the four dsl types.

**6. "vitest reports 17 test files"**
- Stale: the count was written before waves 1 and 2 landed `Registry.test.ts` and `Step.test.ts`. Baseline before this plan was 19 files / 417 tests.
- **Actual:** 20 files / 426 tests, all passing — one new file, nine new tests, no regressions.

---

**Total deviations:** 3 auto-fixed (1 blocking, 2 bugs) + 3 acceptance-criterion corrections
**Impact on plan:** No scope change. Two of the three fixes correct plan text that pointed at a non-existent file or specified a vacuous assertion; the third is worktree setup. The criterion corrections are documentation of unsatisfiable literals, not relaxed verification — each replacement command is strictly as strong as the intent behind the original.

## Issues Encountered

- **REQUIREMENTS.md deliberately not updated.** The plan's frontmatter claims `requirements: [DSL-01, DSL-04]`, but neither is complete at the end of this plan. DSL-01's second half — "backed by `@effect/tsgo`'s `missingLayerContext`/`missingEffectContext` diagnostics failing the build" — is plan 05-05's fixture work. DSL-04's second half — "a Background's literal Gherkin text is matched against a registered pattern exactly like any other step" — is match-time behaviour that Phase 6 owns; this plan delivers only the container shapes and their scope attribution. Marking either complete now would make the traceability matrix assert something untrue (AGENTS.md §4). Flagged for the orchestrator: check them off when 05-05 and Phase 6 land, not here.
- **`spec/` not updated in this plan.** AGENTS.md §1 requires a public-behavior change to update the behavior doc and traceability matrix in the same change. `describeFeature`'s published signature in BEH-EC-002 is wrong (RESEARCH.md Finding 5 — `shared` typed `Layer<any, any, never>`, its output discarded, so ADR-EC-006's own motivating example does not compile). The phase assigns that correction to plan 05-06 rather than here, so the debt is real and tracked, not overlooked.

## Verification

All run from a clean tree at `ea8a2b0`:

- `pnpm build` — green, and green from a cold cache (`rm -rf packages/*/dist packages/*/tsconfig.tsbuildinfo`), confirming the cross-package project reference survives the placeholder deletion
- `pnpm typecheck:test` — green
- `pnpm test` — 20 files, 426 tests, all passing
- `pnpm lint` (oxlint + dprint check) — green
- `pnpm verify:pack` — green; both tarballs pack with `publishConfig.exports` applied, publint clean
- `bash scripts/verify-tsgo-gate.sh` — `tsgo gate: ENFORCED`
- `packages/vitest/dist/describeFeature.d.ts` declares 2 `describeFeature` overloads
- `grep -rn "packageName\|PackageName" --include="*.ts" packages | grep -v node_modules | grep -v "/dist/"` — no matches

### Mutation results (both performed, then reverted; tree confirmed identical to the committed state afterwards)

| Mutation | Expected to fail | Actually failed |
|---|---|---|
| A. `createRegistry` hoisted to module scope | assertion 1 or 2 | **assertion 2** ("leaves the second call empty when only the first call registers a step" — got length 3, expected 1), plus 3 collateral failures. Assertion 1 (reference inequality) **passed**, confirming it cannot stand in for assertion 2. |
| B. `Layer.merge`'s two arguments swapped | assertion 6 | **assertion 6** ("resolves a service named by both shared and perScenario to perScenario's implementation" — got `'shared'`). The D-03 and plain-Layer cases still passed, as expected: they have no collision to invert. |

## Known Stubs

None. `describeFeature` emitting zero vitest tests is not a stub — it is this phase's stated boundary (05-CONTEXT.md `<domain>`: "No runner implementation, no vitest test emission"), the discard is commented at the call site, and `collectFeature` exists precisely so the collection is observable without a runner. Phase 6 / RUN-01 replaces the discard with `it.effect` emission.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- **Ready for 05-05 (the tsgo-gate fixtures).** `describeFeature` is importable from `@effect-cucumber/vitest`, which is what the fixtures in RESEARCH.md Code Examples §2–§5 import. The `layer-missing-rin` fixture is the behavioral proof for note (a): reordering the two overloads must make its `effect(missingLayerContext)` assertion fail.
- **Ready for 05-06 (the spec corrections).** `describeFeature.ts`'s overload pair is the shape BEH-EC-002's signature block must become.
- **Ready for Phase 6 (RUN-01).** `collectFeature` returns `{ feature, layer, definitions }` and is the named join point. The one thing Phase 6 must preserve: `describeFeature` and its define callback stay 100% synchronous, or emission silently registers zero tests.
- **Open debt, both tracked above, neither a blocker:** DSL-01/DSL-04 remain unchecked in REQUIREMENTS.md, and BEH-EC-002/BEH-EC-003's published signatures remain wrong until 05-06.

---
*Phase: 05-describefeature-type-surface*
*Completed: 2026-08-29*

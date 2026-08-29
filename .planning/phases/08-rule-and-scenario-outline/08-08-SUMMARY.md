---
phase: 08-rule-and-scenario-outline
plan: 08
subsystem: specification
tags: [spec, traceability, requirements, documentation, reconciliation, rule, scenario-outline]

# Dependency graph
requires:
  - phase: 08-rule-and-scenario-outline
    provides: "08-01's RegistryScope.ruleId and Plan.ts's ruleId-equality isVisibleTo arms — INV-EC-005's matching half"
  - phase: 08-rule-and-scenario-outline
    provides: "08-02's mergeHookSets/emptyHookSet and the per-hook ruleId — BEH-EC-018's D-02 ordering"
  - phase: 08-rule-and-scenario-outline
    provides: "08-03's RuleDsl/FeatureDsl.Rule/ScenarioRegistrar — INV-EC-005's compile-time half"
  - phase: 08-rule-and-scenario-outline
    provides: "08-04's OutlineTitle.ts and its test suite — BEH-EC-018's D-03 titling requirement"
  - phase: 08-rule-and-scenario-outline
    provides: "08-05a/08-05b's resolveRuleId, Layer.provideMerge and ScenarioKey.ts — INV-EC-005's registration half"
  - phase: 08-rule-and-scenario-outline
    provides: "08-06's tsgo-gate assertions 12/13 — the named compile-time evidence DSL-05 rests on"
  - phase: 08-rule-and-scenario-outline
    provides: "08-07's Runner emission wiring and emission.test.ts's real Rule run — DSL-05's end-to-end evidence"
provides:
  - "BEH-EC-018 — the normative statement of D-01 through D-04 and the D-03 title format"
  - "INV-EC-005 recorded as ENFORCED, naming real modules and real tests on both the runtime and compile-time sides"
  - "ADR-EC-010's implementation note — where each half of the decision landed"
  - "spec/traceability.md §1/§2/§3/§4 rows for Phase 8, including packages/vitest/test/OutlineTitle.test.ts"
  - "DSL-05 and DSL-06 marked Complete with a per-requirement evidence trail"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Reconcile the spec against the MERGED code, not against the plan's own prose — several prior plans in this phase deviated from their plan text deliberately (ScenarioKey.ts's extraction, its NUL separator), and the reconciliation plan's module lists predated those deviations"
    - "When a planned module never gets built because the capability turned out to be a SCOPE rather than a STAGE, retire it into the 'never will exist' category with the reason, rather than leaving it in 'planned' where it reads as still coming"
    - "Split a requirement's evidence by the success criteria that state it: DSL-06 is one requirement but two roadmap criteria (titling and coercion), and the coercion half's proof predates the phase entirely"
    - "A dated correction blockquote for a header whose first clause went stale, keeping the clause that is still true (the worked example really is still an uncompiled reference fence)"

key-files:
  created:
    - .planning/phases/08-rule-and-scenario-outline/08-08-SUMMARY.md
  modified:
    - spec/behaviors/03-rules-outlines-and-testclock.md
    - spec/behaviors/index.yaml
    - spec/invariants.md
    - spec/decisions/010-rule-and-scenario-scoped-extra-layers.md
    - spec/traceability.md
    - spec/roadmap.md
    - README.md
    - packages/vitest/README.md
    - .planning/REQUIREMENTS.md

key-decisions:
  - "BEH-EC-018 went into the EXISTING 03-rules-outlines-and-testclock.md rather than a new file — the content is topically that file's own subject, so no new index.yaml entry was needed, only a widened id_range"
  - "The stale 'Pre-implementation: @effect-cucumber/vitest doesn't exist yet' header was CORRECTED with a dated blockquote, not rewritten — its second clause (the worked example is an uncompiled reference fence) is still true, since the doc-examples gate remains unwired"
  - "spec/traceability.md's §1 preamble retires Rule.ts and ScenarioOutline.ts from 'planned' into Background's 'never will exist' category, with the reason — leaving them in 'planned' would have contradicted the §1 row this plan was rewriting in the same commit"
  - "ScenarioKey.ts is named in every module list, though the plan's own lists omitted it — 08-07 extracted it as a deliberate documented deviation, and the phase's context note directed reconciling against the merged code rather than the plan's prose"
  - "DSL-06's footer entry names its SC#3 coercion evidence by file AND line (Plan.test.ts:466-480, StepArgs.types.ts:48 and :145) — both assertions predate Phase 8, so without naming them the requirement would have been marked Complete on titling evidence alone"

# Metrics
duration: 25min
completed: 2026-08-29
---

# Phase 8 Plan 08: Specification Reconciliation Summary

**Phase 8's registration mechanics are now normative text rather than implementation detail: BEH-EC-018 states D-01 through D-04 and the exact Outline title format, INV-EC-005 stops saying "Source (planned)" and names the modules and tests that enforce it on both the runtime and compile-time sides, and DSL-05/DSL-06 are Complete with a per-requirement evidence trail that names the two pre-existing assertions DSL-06's coercion half has always rested on.**

## Performance

| Metric | Value |
|--------|-------|
| Tasks | 3/3 |
| Duration | ~25 min |
| Files modified | 9 |
| Files created | 1 (this summary) |
| Commits | 3 (+1 metadata) |
| Tests | 645 passing, 30 files — unchanged, as a documentation plan requires |

## What Shipped

### Task 1 — BEH-EC-018, INV-EC-005, ADR-EC-010 (`150b2dc`)

`BEH-EC-018` was added to the existing `spec/behaviors/03-rules-outlines-and-testclock.md`, in that
file's own REQUIREMENT-block form, stating five things that were previously written down nowhere in
`spec/`:

- **D-01** — both `Rule(name, extraLayer, define)` and `Scenario(name, extraLayer, define)` merge
  onto whatever was ambient *at that call site* via `Layer.provideMerge` and never `Layer.merge`
  (only `provideMerge` feeds the ambient output into `extraLayer`'s own requirements, which is what
  ADR-EC-010's "`extraLayer` can itself depend on ambient services" clause needs), both stay
  per-Scenario-fresh, and there is no third "shared within a Rule" scope.
- **D-02** — Before-shaped hooks run Feature-then-Rule, After-shaped hooks run Rule-then-Feature,
  explicitly mirroring the `describe(feature) → describe(rule)` nesting; and composition is ORDER
  ONLY, with every BEH-EC-017 batch guarantee holding over the merged array unchanged and no second
  finalizer around a Rule's `After` hooks.
- **D-04** — `RuleDsl`'s exact member set, `Background` restricted to `Given`/`And`,
  `BeforeAllScenarios`/`AfterAllScenarios` excluded as a compile error, and the non-crossing of
  Rule- and Feature-level registrations with innermost-wins precedence.
- **D-03** — the `name (col=value, ...)` suffix, stated as UNCONDITIONAL, with both concrete forms
  spelled out: `"Applying a valid discount code (code=SAVE10, percent=10, expected=31.50)"` (no
  placeholder in the title, so the suffix is the *only* thing distinguishing the rows) and
  `"adding 1 (count=1)"` (already row-distinct, suffix appended anyway).
- Pitfall 34's row-independence requirement, with the explicit clause that it must be proven by a
  real running test *per row*, not by inspecting emitted titles.

`spec/behaviors/index.yaml`'s `id_range` for this file widened to `"009-012, 018"`.

`INV-EC-005` lost `**Source (planned)**` and now names three halves — registration
(`describeFeature.ts`'s `resolveRuleId` and its `unregistered-rule:` sentinel,
`Layer.provideMerge(featureLayer)(extraLayer)`, `ScenarioKey.ts`'s NUL-separated `(ruleId, name)`
pair, `Runner.ts`'s tier threading), matching (`Registry.ts`'s `RegistryScope.ruleId`, `Plan.ts`'s
`isVisibleTo` arms), and compile time (`Dsl.ts`'s `RuleDsl<ROut | R2>` /
`ScenarioDsl<ROut | R2>`) — followed by every asserting test by name, including
`verify-tsgo-gate.sh` assertions 12/13. Its **Implication** gained the "fresh per Scenario, not once
per Rule" clause.

`ADR-EC-010` gained a dated implementation note in the Phase 7 `ADR-EC-005` form: **48 insertions,
0 deletions**, as the acceptance criterion required.

### Task 2 — traceability §1–§4 and `spec/roadmap.md` (`1ee49c4`)

§1's row 03 now reads `packages/vitest/src/{Registry,Plan,Dsl,HookRegistry,Hook,describeFeature,Runner,OutlineTitle,ScenarioKey}.ts`
with the Range widened to include BEH-EC-018. §2 moved INV-EC-005 from
`Not yet written (type-level test)` to its real mechanisms and tests, and the paragraph above the
table now counts five enforced invariants and calls out that INV-EC-005 is the only one enforced on
both sides at once. §3 filled ADR-EC-010's **Source module**. §4 gained
`packages/vitest/test/OutlineTitle.test.ts` and extended the **Covers** column of `Hook`,
`HookRegistry`, `Plan`, `Registry`, `Runner`, `describeFeature` and `emission`.

`spec/roadmap.md`'s "Current state" moved Rule/Outline out of "still an intended contract only"
into built, leaving the Phase 9 and Phase 10 clauses untouched.

**From-disk §4 cross-check output**, recorded as the plan requires:

```
§4 covers all 27 test files
```

### Task 3 — the two READMEs and the requirement markings (`01a113c`)

`packages/vitest/README.md`'s `## Status` gained three paragraphs (both extra-Layer forms and their
`provideMerge` semantics; a Rule's own `Background` and its four hooks with D-02's ordering and the
`BeforeAllScenarios`/`AfterAllScenarios` exclusion; Outline rows typed for free, with the title
format and the no-shared-state guarantee), and the Rule/Outline clause left "What is not built yet".
`README.md` dropped Rule/Outline from its "still specified rather than built" sentence and named the
containers in the `@effect-cucumber/vitest` package-table row.

`.planning/REQUIREMENTS.md`: DSL-05 and DSL-06 ticked, both Traceability rows set to `Complete`
(`Pending` count 6 → 4, exactly two fewer), and a footer entry naming seven distinct evidence paths.

## Per-requirement evidence

**DSL-05** — a `Rule` can extend the ambient Layer with an extra per-Scenario Layer visible only to
Scenarios inside that Rule:

| Evidence | What fails if DSL-05 stops being true |
|----------|----------------------------------------|
| `packages/vitest/test/Plan.test.ts` — "never lets one Rule's registration serve another Rule's Scenario, even under one pattern text"; "does not let a Scenario-scope pattern cross into a same-named Scenario in a different Rule"; the three-level precedence block | A Rule's registration leaking across the `ruleId` boundary |
| `packages/vitest/test/describeFeature.test.ts` — "provides both the Feature's ambient service and the Rule's own from the Rule's Layer"; "leaves the Feature's own Layer unable to provide the Rule's extra service"; "builds a Rule Layer whose own requirements the Feature's ambient Layer satisfies"; "reaches the Feature's, the Rule's and the Scenario's own service from one merged Layer" | The Layer merge collapsing, or `provideMerge` degrading to `merge` |
| `scripts/verify-tsgo-gate.sh` assertions 12 and 13 | The compile-time boundary — assertion 13's `rule-missing-service.ts` is assertion 12's Rule-scoped step body byte-for-byte, registered at Feature level with no Rule; checked for non-zero exit AND `effect(missingEffectContext)` by name |
| `packages/vitest/test/emission.test.ts`'s real Rule run | The Rule tier is `Layer.effect`-built *derived from* the Feature's, so it resolves at runtime only if `provideMerge` really composed the two — a constant could not express this |

**DSL-06** — Outline Examples typed for free, in two halves, because Roadmap Phase 8 states them as
two separate success criteria:

| Half | Evidence |
|------|----------|
| TITLING (D-03, SC#4) | `packages/vitest/test/OutlineTitle.test.ts`'s exact-format tests (placeholder-free Outline, the standing byte-identical assertion, the already-interpolated Outline, the untouched plain Scenario), `Runner.test.ts`'s `adding 1 (count=1)` / `adding 2 (count=2)` positional assertion, and `emission.test.ts`'s three-row independence proof (Pitfall 34) |
| COERCION (SC#3) — **pre-existing, predates Phase 8** | RUNTIME: `packages/vitest/test/Plan.test.ts` lines 466-480, test `"resolves every Examples row of a Scenario Outline, proving astName is the scope key"`, whose lines 478-479 assert `resolvedOf(plan.scenarios[0]?.steps[0])?.args` equals `[1]` and row 2's equals `[2]` — the Examples *string* `"1"` arriving already coerced to the `number` `1`. TYPE: `packages/gherkin/test/StepArgs.types.ts` line 48 (`intIsNumber`) plus its `@ts-expect-error` negative at line 145 (`intIsNotString`) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The fresh worktree had no `node_modules`**

- **Found during:** Task 1, at the first `pnpm format`
- **Issue:** `sh: dprint: command not found` — the worktree was spawned without an install, so every
  acceptance-criterion command (`pnpm format`, `lint`, `verify:spec`, `test`, `build`) was
  unrunnable.
- **Fix:** `pnpm install --frozen-lockfile`. Lockfile was already up to date; no manifest, no
  lockfile and no dependency changed, so nothing is staged from it. This is explicitly *not* the
  excluded "install a named package" case — no package name was added or substituted.
- **Files modified:** none

**2. [Rule 1 - Bug] The plan's stated enforcement mechanism for the `id_range` widening does not exist**

- **Found during:** Task 1
- **Issue:** The plan asserts `verify-traceability.sh` "check 1 fails in the disk→index direction
  otherwise" if `index.yaml`'s `id_range` is not widened. Reading the script, check 1 does two
  things and neither involves `id_range`: it resolves each `file:` entry against disk, and it flags
  any `.md` on disk not named in the index. `id_range` is never parsed by any check. The widening is
  therefore correct and required for the index to be truthful, but it is **not gated** — a future
  agent trusting the plan's claim would believe an unwritten check has their back.
- **Fix:** Made the widening anyway (`"009-012"` → `"009-012, 018"`) and recorded the real situation
  here rather than propagating the plan's premise into the spec. No spec text claims the gate exists.
- **Files modified:** `spec/behaviors/index.yaml`
- **Commit:** `150b2dc`

**3. [Rule 1 - Bug] The plan's line references for DSL-06's runtime coercion evidence were stale**

- **Found during:** Task 3
- **Issue:** The plan cites "`packages/vitest/test/Plan.test.ts` lines 342-356" for the
  coercion assertion. Lines 342-356 are helper code (`isResolved`/`isUnresolved` narrowing). The
  named test is at lines 466-480, with the two `toEqual([1])`/`toEqual([2])` assertions at 478-479 —
  later plans in this phase inserted the Rule-level describe blocks and shifted everything down.
- **Fix:** Cited the correct lines in `.planning/REQUIREMENTS.md`. The test *name* the plan gave was
  correct and was used to locate it, so the intent was unambiguous.
- **Files modified:** `.planning/REQUIREMENTS.md`
- **Commit:** `01a113c`

**4. [Rule 2 - Missing critical] `spec/traceability.md`'s §1 preamble still promised `Rule.ts` and `ScenarioOutline.ts`**

- **Found during:** Task 2
- **Issue:** The plan asked for §1's *row* to name the real modules, but the preamble directly above
  it said `Rule.ts` and `ScenarioOutline.ts` "remain **planned** and do not exist on disk". Doing
  only what the plan asked would have left the row and the paragraph above it contradicting each
  other in the same commit — and would have left the spec promising two modules that will never be
  written.
- **Fix:** Retired both into the same category `Background` already occupies ("never will exist"),
  with the reason stated: a Rule is a registration SCOPE rather than a pipeline stage, so a
  dedicated module would own nothing; and an Outline is not an author-declared container at all,
  since its rows arrive already interpolated as ordinary Pickles (ADR-EC-014), leaving only the row
  title format, which is `OutlineTitle.ts`.
- **Files modified:** `spec/traceability.md`
- **Commit:** `1ee49c4`

**5. [Rule 2 - Missing critical] Three stale counts in `spec/roadmap.md`, against AGENTS.md §4**

- **Found during:** Task 2
- **Issue:** The gate table claimed `packages/vitest` has "nine" test files (it has twelve), "eight"
  tsgo-gate fixtures (twelve), and that `verify:tsgo-gate` runs "nine checks" (thirteen). Two of the
  three were already stale before this phase. AGENTS.md §4 ("say only what is true") makes these
  wrong, not merely out of date, in a document whose whole job is stating build status.
- **Fix:** Corrected all three against `ls` and the script's own output (`13/13` assertions verified
  by running it), and noted that assertions 12/13 extend the gate past INV-EC-003 to INV-EC-005.
- **Files modified:** `spec/roadmap.md`
- **Commit:** `1ee49c4`

**6. [Rule 2 - Missing critical] `ScenarioKey.ts` was absent from every module list the plan supplied**

- **Found during:** Task 1
- **Issue:** The plan's §1, §3 and INV-EC-005 module lists name eight modules and omit
  `packages/vitest/src/ScenarioKey.ts`. That module is real, was created by 08-07 as a documented
  deviation from its own plan (extracted to a leaf so `describeFeature.ts` and `Runner.ts` cannot
  disagree on the key encoding), and carries a load-bearing detail — the NUL separator — that
  another 08-plan's prose got wrong. Omitting it would have left the one module most likely to be
  "tidied up" untraced.
- **Fix:** Named it in §1, §3, the traceability preamble, and INV-EC-005's Source, with its NUL and
  `(ruleId, name)`-pair rationale stated in INV-EC-005 and in ADR-EC-010's implementation note.
- **Files modified:** `spec/traceability.md`, `spec/invariants.md`,
  `spec/decisions/010-rule-and-scenario-scoped-extra-layers.md`
- **Commits:** `150b2dc`, `1ee49c4`

**7. [Rule 2 - Missing critical] `spec/behaviors/03`'s header claimed the package does not exist**

- **Found during:** Task 1
- **Issue:** The file opens "_Pre-implementation: `@effect-cucumber/vitest` doesn't exist yet_".
  Adding BEH-EC-018 — a section describing shipped behavior — directly beneath that sentence would
  be self-contradicting.
- **Fix:** A dated correction blockquote, not a rewrite (the plan's own rule: never rewrite a
  superseded sentence). The blockquote records that the first clause is false and the second is
  still true — the worked example genuinely *is* an uncompiled reference fence, because the
  doc-examples gate remains unwired per `spec/process/definitions-of-done.md` — and records that
  BEH-EC-009/010 were checked against the implementation and needed no correction.
- **Files modified:** `spec/behaviors/03-rules-outlines-and-testclock.md`
- **Commit:** `150b2dc`

### Architectural changes

None — no Rule 4 decision arose. This plan touched no code, added no dependency, and changed no
manifest (threat T-08-08-SC: n/a, as the threat model states).

## Authentication Gates

None.

## Verification

Every gate in the plan's `<verification>` block, run at Task 3:

| Command | Result |
|---------|--------|
| `pnpm verify:spec` | PASS 7, FAIL 0, SKIP 1 (the SKIP is the standing "no `.feature` tags yet"); 261 relative links resolve |
| `pnpm lint` | exit 0 (oxlint + `dprint check`) |
| `pnpm test` | 645 passing, 30 files |
| `pnpm build` | exit 0 |
| `pnpm verify:tsgo-gate` | 13/13, `tsgo gate: ENFORCED` — including assertion 12 (Rule/Scenario extra-Layer positive control) and assertion 13 (a Rule-scoped service outside its Rule rejected as `effect(missingEffectContext)`) |
| `pnpm verify:pack` | `pack shape: OK`, publint clean for both packages |
| From-disk §4 cross-check | `§4 covers all 27 test files` |

Per-task acceptance criteria:

| Criterion | Result |
|-----------|--------|
| `grep -c "BEH-EC-018" spec/behaviors/03-...md` ≥ 1 | 2 |
| `grep -c "018" spec/behaviors/index.yaml` ≥ 1 | 1 |
| `"Source (planned)"` under INV-EC-005 | 0 — the one remaining occurrence is at line 216, inside INV-EC-006 (which starts at 210 and is legitimately still unenforced); INV-EC-005 spans 151-209 |
| `grep -c "resolveRuleId" spec/invariants.md` ≥ 1 | 1 |
| `git diff --numstat` on ADR-EC-010 | `48  0` — zero deletions |
| `grep -c "BEH-EC-018" spec/traceability.md` ≥ 2 | 9 |
| `grep -c "OutlineTitle.test.ts" spec/traceability.md` ≥ 1 | 1 |
| `grep -c "INV-EC-005" spec/traceability.md` ≥ 1, row no longer "Not yet written" | 8, row rewritten |
| `^- \[x\] \*\*DSL-05\*\*` / `DSL-06` | 1 each |
| `^\| DSL-05 \| Phase 8 \| Complete \|` / `DSL-06` | 1 each |
| `Pending` count exactly two fewer | 6 → 4 |
| Footer names ≥ 4 distinct test/script paths | 7 (`Plan.test.ts`, `describeFeature.test.ts`, `verify-tsgo-gate.sh`, `emission.test.ts`, `OutlineTitle.test.ts`, `Runner.test.ts`, `StepArgs.types.ts`) |
| `grep -c "Plan.test.ts"` ≥ 1 / `"StepArgs.types.ts"` ≥ 1 | 3 / 1 |

## Known Stubs

None. This plan produced no code and no placeholder text; every claim added to a normative document
names a module or an assertion that exists on disk and was verified by running it.

## Threat Flags

None. This plan touched no network endpoint, no auth path, no file-access pattern and no schema —
its only trust boundaries are `specification → future implementer` and `README → public reader`,
both of which the threat model already registers and both of which are mitigated by the acceptance
criteria that were checked above (T-08-08-01 by the zero-deletion constraint on ADR-EC-010 and the
additive-only corrections; T-08-08-02 by the `id_range` widening — with the caveat recorded in
deviation 2 that the gate the plan credited does not actually exist; T-08-08-03 by the seven named
evidence paths; T-08-08-04 by cross-checking both READMEs against that same evidence).

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | `150b2dc` | BEH-EC-018, the `id_range` widening, INV-EC-005's real source, ADR-EC-010's implementation note |
| 2 | `1ee49c4` | traceability §1–§4, the §1 preamble's retired modules, `spec/roadmap.md`'s status and counts |
| 3 | `01a113c` | both READMEs, DSL-05/DSL-06 Complete with the footer evidence trail |
| — | `edc85a3` | this summary |

## Self-Check: PASSED

All 10 files this plan claims to have created or modified are present on disk, and all four commit
hashes resolve in `git log`. No file was deleted by any commit
(`git diff --diff-filter=D HEAD~1 HEAD` empty at each of the three task commits), and the working
tree is clean.

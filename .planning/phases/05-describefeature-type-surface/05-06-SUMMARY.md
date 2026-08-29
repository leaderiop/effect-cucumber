---
phase: 05-describefeature-type-surface
plan: 06
subsystem: spec
tags: [spec, traceability, invariants, requirements, BEH-EC-002, BEH-EC-003, BEH-EC-004, INV-EC-003, AGENTS-4]

# Dependency graph
requires:
  - phase: 05-describefeature-type-surface (plans 05-01..05-03)
    provides: "the shipped signatures this plan publishes — describeFeature's two overloads, Dsl.ts's StepRegistrar<ROut>, Registry.ts, Step.ts, and the real barrel"
  - phase: 05-describefeature-type-surface (plans 05-04, 05-05)
    provides: "verify-tsgo-gate.sh assertions 5-9 and their mutation proofs — the assertions INV-EC-003's Source line and REQUIREMENTS.md's markings now name"
provides:
  - "BEH-EC-002 publishing the shipped overload pair, with the superseded union form marked in place"
  - "BEH-EC-003 publishing StepRegistrar<ROut>, with the vacuous generator branch marked in place"
  - "INV-EC-003 de-planned, with an explicit any-free boundary condition"
  - "spec/traceability.md §1/§2/§4 naming only files that exist, plus one row per packages/vitest test file"
  - "DSL-01..04 Complete, each with a named backing assertion"
affects: [06-runner, any-phase-copying-a-published-signature-from-spec]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dated correction blockquote (ADR-EC-014's precedent): mark a superseded spec claim in place with the reproduction that condemned it, rather than erasing it"
    - "A spec claim names the assertion that backs it, or it says 'planned' — no third option"
    - "Prose describing a forbidden literal must not contain it: an acceptance grep scans prose too"

key-files:
  created: []
  modified:
    - spec/behaviors/01-steps-and-world.md
    - spec/invariants.md
    - spec/traceability.md
    - spec/roadmap.md
    - packages/vitest/README.md
    - .planning/REQUIREMENTS.md

key-decisions:
  - "The superseded `shared: Layer.Layer<any, any, never>` IS quoted verbatim inside BEH-EC-002's correction blockquote (one occurrence, inside the quote); the superseded generator yield type is NOT quoted, because an acceptance grep asserts its absence from the whole file and prose is not exempt from grep. The blockquote says so explicitly so the next reader does not 'restore' it."
  - "spec/invariants.md's file-level preamble ('None of these are enforced by code yet') was corrected too — leaving it would have contradicted the INV-EC-003 de-planning three paragraphs below it."
  - "§2's column headers dropped their '(planned)' suffix, with a sentence above the table carrying the distinction instead. Five of six rows are still planned and still say so in their own Test column."
  - "DSL-04 marked Complete on its structural guarantee, with the split stated explicitly rather than glossed — see the per-requirement evidence table."

requirements-completed: [DSL-01, DSL-02, DSL-03, DSL-04]

# Metrics
duration: ~18min
completed: 2026-08-29
---

# Phase 05 Plan 06: Spec Reconciliation and Requirement Marking Summary

**The two signatures `spec/` published for `describeFeature` and for a step are now the two signatures the package ships — the superseded forms marked in place with the reproductions that condemned them — INV-EC-003 states the boundary it actually holds under and names the assertions that enforce it, and DSL-01 through DSL-04 are Complete with a named backing assertion each.**

## Performance

- **Duration:** ~18 min
- **Tasks:** 3
- **Files modified:** 6 (0 created, 6 modified)

## Why Two of These Were Not Housekeeping

RESEARCH.md transcribed `spec/`'s own published signatures verbatim and compiled them. Both were defective, and both defects were the exact failure mode this phase exists to prevent, sitting in the text an implementer is told to follow:

- **BEH-EC-003 was vacuous.** Its generator branch declared an `any` yield type. A step yielding an unprovided `Db` against a `World`-only Layer **compiled clean, exit 0**. INV-EC-003 — the project's core value — was decorative under the spec's own published signature.
- **BEH-EC-002 erased `shared`.** Its union-argument form typed `shared` as `Layer.Layer<any, any, never>`, discarding the output type and binding `R` to `perScenario` alone, so ADR-EC-006's own motivating example (`shared: Database.layer` with steps that use `Database`) did not compile.

Both are now replaced by the shipped shapes, each with a dated correction blockquote following `spec/decisions/014`'s precedent — the superseded claim marked in place, with the reproduction, rather than quietly erased.

## What Changed

### `spec/behaviors/01-steps-and-world.md`

- **BEH-EC-002's signature** is now the shipped overload pair from `packages/vitest/src/describeFeature.ts`: `{ shared, perScenario }` declared first with `<RShared, RScenario, E1, E2>`, the plain-`Layer` form declared LAST with `<ROut, E>`, `define` typed `(dsl: FeatureDsl<...>) => void` in both. The correction blockquote records why a union cannot be repaired by widening (a union in an inference position gives TypeScript no way to thread two independent output types into `define`), and why the plain-Layer overload is last — TypeScript reports "the last overload gave the following error", which is what makes `effect(missingLayerContext)` fire and name the real problem. Cross-referenced to `describeFeature.ts` note (a) and gate assertion 8.
- **D-03 recorded in BEH-EC-002's REQUIREMENT prose:** `perScenario` is a REQUIRED key even for a Feature with no per-Scenario-fresh state (`perScenario: Layer.empty`), and MUST NOT be optional — its absence is what discriminates a plain Layer argument from the object form. D-04's collision rule is noted alongside it.
- **BEH-EC-003's signature** is now `StepRegistrar<ROut>` from `Dsl.ts`. Its correction blockquote records both defects — the vacuous yield type, and `R` as a free type parameter of `Given` rather than bound to the ambient Layer's `ROut` (PITFALLS Pitfall 3) — plus the union member ORDER rule and why it points the OPPOSITE way from BEH-EC-002's overloads. Cross-referenced to gate assertion 6.
- **BEH-EC-003's REQUIREMENT prose** keeps the bare-generator/already-wrapped contract and now says what "unchanged" means: BY IDENTITY, guarded at runtime by a generator-function check, because the two branches are type-indistinguishable and the only symptom of getting it wrong is a doubled span.
- **BEH-EC-004** no longer reads as planned. `World` is reachable as a typed `Context.Service`; an undeclared field is a plain `TS2339` (assertion 7, deliberately not an Effect diagnostic — there is no context problem). It states plainly that the library ships **no `World` type** and there is no `World.ts` — it ships the constraint, and each author declares their own World.
- **The top banner** no longer says the package does not exist. It says what does (type surface, step registration, the compile gate) and what does not (the runner — no `it.effect` emission until Phase 6), and still cites `spec/roadmap.md` as the single place that says what is built.

### `spec/invariants.md`

- **INV-EC-003 gained an explicit boundary condition:** the invariant holds for step bodies free of `any`. A bare `any` or an `Effect<any, any, any>` is assignable to everything, so a step body containing either compiles against any ambient Layer, and no DSL signature can prevent it — the erasure happens in the author's own body, not at the boundary the invariant guards. Stated as the permanent limit it is, with the practical rule (an `any` in a step body's declared type is a defect, and the gate fixtures are asserted to contain none). This is PITFALLS Pitfall 6's P4 amendment, assigned to this phase.
- **`**Source (planned)**` became `**Source**`** and now names the real mechanism: `StepRegistrar<ROut>` binding a step's required context to the ambient Layer's output, backed by `@effect/tsgo`'s `missingEffectContext` / `missingLayerContext` diagnostics failing the build (ADR-EC-016), enforced on every push by `verify-tsgo-gate.sh` assertions 5, 6 and 8 — described as a set (positive control, starved twin, Layer argument) so the satisfied/starved pairing is legible.
- **The file preamble** was corrected: it claimed none of the invariants are enforced because `@effect-cucumber/vitest` doesn't exist. It now says one is and five are not, and that each of the five says so in its own `Source` label.

### `spec/traceability.md`

- **Preamble** rewritten: names the four real vitest modules (`describeFeature.ts`, `Dsl.ts`, `Step.ts`, `Registry.ts`, plus the `index.ts` barrel) and the seven still-planned ones (`Plan.ts`, `Hooks.ts`, `Rule.ts`, `Tags.ts`, `SharedLayer.ts`, `ScenarioOutline.ts`, `Background.ts`). The chain block's `[gherkin: built; vitest: planned]` annotations updated to match.
- **§1** — the `01 — Steps and World` row's Source module column drops `World.ts`, which does not exist and will not, in favour of `packages/vitest/src/{describeFeature,Dsl,Step,Registry}.ts`. `grep -c 'World.ts'` is now 0.
- **§2** — INV-EC-003's Enforced-by column is `StepRegistrar<ROut>` plus the two `@effect/tsgo` diagnostics; its Test column is `scripts/verify-tsgo-gate.sh` assertions 5/6/8. INV-EC-001, 002, 004, 005 and 006 are untouched in content (the diff shows padding only) and still read "Not yet written" — claiming otherwise would violate AGENTS.md §4.
- **§4** — the "enumerated from disk" note now scopes to both packages, and three rows were added: `Registry.test.ts`, `Step.test.ts`, `describeFeature.test.ts`, each with the behavior IDs it covers. The `StepArgs.types.ts` non-suite row and its explanatory paragraph are kept verbatim. A new paragraph explains why `packages/vitest/test/tsgo-gate/` is absent from the table — compile-gate fixtures, most deliberately non-compiling, excluded from `packages/vitest/tsconfig.test.json` for that reason, asserted by the gate script rather than collected by vitest — so the absence reads as intentional rather than as drift.

### `spec/roadmap.md`

- "Packages exist" no longer calls `@effect-cucumber/vitest` "a placeholder barrel"; it lists both Layer argument forms, the `FeatureDsl`/`ScenarioDsl`/`BackgroundDsl`/`StepRegistrar` surface, per-instance registration and the auto-wrap, and ends with **No runner**.
- "Unit tests" no longer says "None for `packages/vitest`"; it names the three real suites and the eight compile-gate fixtures, and names `scripts/verify-tsgo-gate.sh` as what asserts them.
- The opening paragraph, the `tsc -b` row (it builds both packages now, not just gherkin), the `@effect/tsgo` row (the gate is itself asserted by nine checks), and numbered next-step 3 (register is done; plan and emit are not) all updated.

### `packages/vitest/README.md`

Status rewritten in `packages/gherkin/README.md`'s voice: nothing published to npm; the registration surface ships (both Layer forms, `perScenario` required, the auto-wrap with identity pass-through, `Background` getting `Given`/`And` only); the core value is enforced by name via `pnpm verify:tsgo-gate`; and **there is no runner** — a Feature file written against this package today type-checks and runs nothing. The README shows no usage example, so there was no stale example to correct.

## Requirement Evidence (T-05-20)

Per the threat register, marking a requirement Complete without a proving assertion is the false-green this phase exists to prevent. Each marking below names the assertion that fails if the requirement stops being true.

| ID | Marked in | Backing assertion |
|---|---|---|
| DSL-01 | 05-04 (confirmed here) | `verify-tsgo-gate.sh` assertions 5 (DSL positive control), 6 (`effect(missingEffectContext)` on the starved twin) and 8 (`effect(missingLayerContext)` on the Layer argument). Non-vacuity proven by two recorded mutations: the union-order swap (05-04) kills assertion 6's name check while the step stays rejected; the overload-order swap (05-05) kills assertion 8's name check while the call stays rejected. |
| DSL-02 | **here** | `packages/vitest/test/Step.test.ts` — an already-wrapped step passes through BY IDENTITY (reference equality), a bare generator is wrapped and takes the step text as its span name, and a failure inside a wrapped step keeps that span. Mutation-proven in 05-02: wrapping unconditionally fails 1 test, never wrapping fails 3. The already-wrapped form is additionally compiled in `tsgo-gate/src/step-satisfied.ts` (assertion 5) as the union's second member. |
| DSL-03 | 05-05 (confirmed here) | `verify-tsgo-gate.sh` assertion 7 — `TS2339` on a field absent from the declared World shape, with the World-reading step in `step-satisfied.ts` as the positive control. Vacuity mutation recorded in 05-05: reading a field that IS declared makes the fixture compile and assertion 7's exit-code check fail. |
| DSL-04 | **here** | `packages/vitest/test/Registry.test.ts` (two registries in one process share no state; `definitions()` is a snapshot; the scope stack refuses to underflow) and `describeFeature.test.ts` (Background steps land in the same flat definition list as Scenario steps with `{ kind: "background", name: null }`, the author's keyword recorded verbatim rather than rewritten to the one it continues, and the scope stack popped in a `finally` so a throwing callback cannot re-parent later steps). Both container shapes are additionally compiled in `step-satisfied.ts` (assertion 5), where reaching for `When` on a `BackgroundDsl` is `TS2339`. |

**DSL-04, stated precisely.** Its first clause — the two containers and their dsl shapes — is asserted directly. Its second clause, "a Background's literal Gherkin text is matched against a registered pattern exactly like any other step, not run unconditionally", is guaranteed **structurally** today rather than demonstrated end to end: `@effect-cucumber/gherkin` already stacks Background steps into each Pickle as ordinary steps (PARSE-02, Complete), and `@effect-cucumber/vitest` registers Background definitions into the one flat definition list as ordinary definitions distinguished only by a scope tag. There is no unconditional-run path on either side for a future change to take. The end-to-end demonstration arrives with the runner in Phase 6 (RUN-01), which consumes a `FeatureCollection` and has no other list to read from. This split is recorded here, in `.planning/REQUIREMENTS.md`'s footer, and is the one judgment call in this plan a reviewer should check.

## Reusable Verification Command

The §4 disk-versus-document cross-check, extended from 03-06 to both packages. Run it in any plan that adds a test file:

```bash
node -e 'const fs=require("node:fs"); const dirs=["packages/gherkin/test","packages/vitest/test"]; const files=dirs.flatMap(d=>fs.readdirSync(d).filter(f=>f.endsWith(".test.ts")).map(f=>d+"/"+f)); const doc=fs.readFileSync("spec/traceability.md","utf8"); const missing=files.filter(f=>!doc.includes(f)); if (missing.length) { console.error("test files missing from traceability section 4:", missing); process.exit(1) } console.log("ok", files.length, "test files mapped")'
```

Result: `ok 17 test files mapped`, exit 0.

## Task Commits

1. **Task 1: Correct BEH-EC-002 and BEH-EC-003, de-plan the banner** — `e4aadff` (docs)
2. **Task 2: INV-EC-003's wording, and traceability §1/§2/§4** — `bcae837` (docs)
3. **Task 3: Status documents and requirement marking** — `49db216` (docs)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The worktree had no `node_modules`**
- **Found during:** setup, before any file was written
- **Issue:** No dependency tree, so `pnpm lint`, `pnpm build`, `pnpm test` and the gate script could not run — nothing could be verified.
- **Fix:** `pnpm install --frozen-lockfile`. The lockfile was already current; zero packages added, removed or resolved anew, and no manifest field changed. The root `prepare` script re-ran `effect-tsgo patch` against the worktree's compiler, which the plugin needs to be active. The package-manager exclusion to Rule 3 does not apply — this materializes an existing lockfile rather than installing a new package.
- **Files modified:** none tracked (`node_modules/` is gitignored). `git status --short` stayed clean.
- **Verification:** baseline `pnpm verify:spec` printed PASS 7 / FAIL 0 / SKIP 1, matching the state wave 5 left behind.

**2. [Rule 2 - Say only what is true] `spec/invariants.md`'s file-level preamble**
- **Found during:** Task 2
- **Issue:** The plan scoped Task 2 to INV-EC-003's block. But the file opens with "None of these are enforced by code yet — `@effect-cucumber/vitest` doesn't exist", which the same task makes false three paragraphs later. Leaving it would have produced a document that contradicts itself on the exact question AGENTS.md §4 governs.
- **Fix:** Rewritten to say one invariant is enforced today and five are not, each of the five saying so in its own `Source` label. The `grep -c 'Source (planned)'` acceptance criterion is unaffected — the preamble carries no such label.
- **Files modified:** `spec/invariants.md`
- **Committed in:** `bcae837`

**3. [Rule 2 - Say only what is true] `spec/traceability.md`'s §1 and §2 column headers**
- **Found during:** Task 2
- **Issue:** §2's headers read "Enforced by (planned)" / "Test (planned)" and §1's read "Source module (planned)". With INV-EC-003 de-planned and four real vitest modules named, a blanket "(planned)" header overclaims planned-ness in exactly the direction §4 forbids.
- **Fix:** §2's headers became "Enforced by" / "Test", with a sentence above the table stating that INV-EC-003 is enforced and every other row's Test column ("Not yet written") is what marks it planned. §1's became "Source module (real and planned — see the preamble)". `verify-traceability.sh` parses these sections by ID and link greps, not by header text (script lines 83-84, 105, 174-175), so column order — the stated contract — is untouched and all five checks still pass.
- **Files modified:** `spec/traceability.md`
- **Committed in:** `bcae837`

**4. [Rule 2 - Say only what is true] The worked example's leading comment, and two roadmap gate rows**
- **Found during:** Tasks 1 and 3
- **Issue:** The worked example at the foot of `01-steps-and-world.md` opened with "Pre-implementation reference — not yet compiled against a real API." The API is real now; only the compile check is missing. Separately, `spec/roadmap.md`'s `tsc -b` row said the build covers `packages/gherkin` "for real" (it covers both packages now), and the `@effect/tsgo` row said only "wired, gating the build" without noting that the gate is itself asserted.
- **Fix:** The comment now says the API is real and the fence is uncompiled because the doc-examples check is not wired. The two roadmap rows corrected.
- **Note on acceptance criteria:** Task 1's criterion asked that deletions be "confined to the two signature fences, the BEH-EC-004 status prose and the top banner". The comment edit adds one deletion outside that set. The criterion's purpose — that no behavior heading or ID is removed or renumbered — is fully met (`git diff` shows zero heading or ID lines removed), and AGENTS.md §4 is normative over a plan's phrasing. Flagged here rather than buried.
- **Files modified:** `spec/behaviors/01-steps-and-world.md`, `spec/roadmap.md`
- **Committed in:** `e4aadff`, `49db216`

### Judgment Call: the superseded generator branch is described, not quoted

Task 1's acceptance criteria require `grep -c 'Generator<any, A, any>'` to return 0 for the whole file, while the same task asks the correction blockquote to state that defect. Those pull in opposite directions: a grep scans prose. This is the trap STATE.md records from 03-04 and 05-04 (a fixture comment tripping its own acceptance grep), so it was resolved the same way — the blockquote describes the defect ("the generator branch's yield type was `any`") and says outright that the literal spelling is deliberately withheld because a grep enforces its absence, so the next reader does not "restore" it for completeness.

The `shared: Layer.Layer<any, any, never>` case is the opposite: its criterion explicitly permits one occurrence inside the blockquote, so it IS quoted verbatim. `grep -n` confirms the single occurrence is on a `> `-prefixed line inside the correction.

---

**Total deviations:** 4 auto-fixed (1 blocking, 3 truth corrections) + 1 judgment call
**Impact on plan:** No scope change. Every task's `done` criterion was met as written; the three truth corrections extend the same AGENTS.md §4 rule the plan is built on to adjacent lines in files the plan already opens.

## Verification

| Command | Result |
|---|---|
| `pnpm build` | pass |
| `pnpm typecheck:test` | pass (both packages) |
| `pnpm verify:tsgo-gate` | pass — nine `✓` lines, `tsgo gate: ENFORCED` |
| `pnpm test` | pass — 20 files, 426 tests |
| `pnpm verify:spec` | PASS 7 / FAIL 0 / SKIP 1, 235 links resolve |
| `pnpm lint` | pass (`oxlint` + `dprint check`) |
| `pnpm verify:pack` | pass — `pack shape: OK`, publint clean for both packages |

Acceptance greps:

| Check | Required | Actual |
|---|---|---|
| `grep -c 'Generator<any, A, any>' spec/behaviors/01-steps-and-world.md` | 0 | 0 |
| `grep -c 'shared: Layer.Layer<any, any, never>' spec/behaviors/01-steps-and-world.md` | ≤1, inside the blockquote | 1, on a `> `-prefixed line |
| `grep -c 'StepRegistrar' spec/behaviors/01-steps-and-world.md` | ≥1 | 4 |
| `grep -c 'perScenario' spec/behaviors/01-steps-and-world.md` | ≥2, none optional | 10; `grep -c 'perScenario?'` is 0 |
| BEH-EC-002 object overload above plain-Layer overload | yes | yes (read the fence) |
| `grep -c 'Source (planned)' spec/invariants.md` | before−1 | 6 → 5 |
| `grep -c 'World.ts' spec/traceability.md` | 0 | 0 |
| `grep -c 'verify-tsgo-gate' spec/traceability.md` | ≥1 | 2 |
| `grep -c 'REQ-EC-[0-9]' spec/traceability.md` | 0 | 0 (check 4's SKIP stays honest) |
| `grep -c '{Registry,Step,describeFeature}.test.ts' spec/traceability.md` | ≥1 each | 1, 1, 1 |
| §4 disk cross-check (both packages) | exit 0 | `ok 17 test files mapped` |
| `grep -c 'placeholder barrel' spec/roadmap.md` | 0 | 0 |
| ``grep -c 'None for `packages/vitest`' spec/roadmap.md`` | 0 | 0 |
| `grep -c 'no library code has shipped' packages/vitest/README.md` | 0 | 0 |
| `grep -c 'scaffolding' packages/vitest/README.md` | 0 | 0 |
| `grep -c 'verify:tsgo-gate' packages/vitest/README.md` | ≥1 | 1 |
| `grep -c '\[x\] \*\*DSL-0' .planning/REQUIREMENTS.md` | 4 | 4 |
| `grep -c '\| DSL-0[1-4] \| Phase 5 \| Pending \|' .planning/REQUIREMENTS.md` | 0 | 0 |
| `git diff .planning/REQUIREMENTS.md` touches only DSL rows | yes | yes (DSL-02, DSL-04, and the footer) |

## Threat Model Coverage

| Threat ID | Disposition | How it was mitigated |
|---|---|---|
| T-05-17 | mitigated | Both signature blocks replaced with the shipped shapes; both superseded forms marked in place with dated correction blockquotes carrying the reproduction; `grep -c 'Generator<any, A, any>'` returns 0. |
| T-05-18 | mitigated | INV-EC-003 states the `any`-free boundary in plain words and its `Source` label names assertions 5/6/8 by number; `(planned)` count went 6 → 5 with no other invariant's label touched. |
| T-05-19 | mitigated | 03-06's `node -e` cross-check reused and extended to both packages; run as an acceptance criterion (`ok 17 test files mapped`) and recorded above for reuse. |
| T-05-20 | mitigated | Every DSL-01..04 marking names the assertion backing it in the table above and in REQUIREMENTS.md's footer; DSL-04's structural-vs-end-to-end split is stated rather than glossed; the full gate including nine tsgo assertions was green before the marking commit. |
| T-05-SC | accepted | Zero packages installed. `pnpm install --frozen-lockfile` materialized the existing lockfile; `pnpm-lock.yaml` and every manifest are unchanged. |

## Known Stubs

None. This plan ships documentation only — no runtime code, no configuration affecting execution, no placeholder data, no unwired component.

## Deferred (out of scope)

- **The worked example in `01-steps-and-world.md` imports from the `effect` barrel** (`import { Context, Effect, Layer, Ref } from "effect"`) rather than using submodule namespace imports per AGENTS.md §3, and calls `expect` without importing it. Neither is caught today because the doc-examples check is not wired, and neither is in this plan's scope (the example is valid against the corrected signature, which is what the plan asked). Both must be fixed when the doc-examples check lands — see `spec/roadmap.md`'s "Blocking first release" item 4. Also logged in `deferred-items.md`.

## Next Phase Readiness

- **Nothing left in `spec/` for Phase 5 would produce a wrong implementation if copied.** The two published signatures are the shipped ones, and the two superseded forms are marked with the reproductions that condemned them rather than erased — a later reader who wonders why the overload form looks awkward finds the answer instead of "improving" it back.
- **`spec/` now claims exactly one enforced invariant.** Phase 6 de-plans INV-EC-001 (fail-fast via sequential `yield*`) and INV-EC-004 (`Effect.ensuring`) when the runner makes them real; the pattern to follow is INV-EC-003's amended block — drop `(planned)`, name the mechanism, name the assertion.
- **The §4 disk cross-check is the guard on the next test file.** Phase 6 adds runner suites under `packages/vitest/test/`; the command above fails by name if a row is missing.
- **No blockers.** The phase's requirements (DSL-01..04) are marked, and MATCH-03..05 / RUN-01 remain correctly Pending for Phase 6.

## Self-Check: PASSED

All six modified files present on disk with the expected content; all three task commits (`e4aadff`, `bcae837`, `49db216`) present in `git log`. `git diff --diff-filter=D` reports zero deletions across all three commits. Working tree clean before the metadata commit.

---
*Phase: 05-describefeature-type-surface*
*Completed: 2026-08-29*

---
phase: 06-plan-scenario-effect-runner-emission-and-drift-detection
plan: 08
subsystem: spec-reconciliation
tags: [documentation, traceability, invariants, roadmap, readme, spec-reconciliation, no-code]

# Dependency graph
requires:
  - phase: 06-07
    provides: "The shipped runner whose existence every document edited here had to catch up with, plus the four requirements it marked Complete"
  - phase: 03-06
    provides: "The reusable node -e disk↔§4 cross-check, re-run here widened to both packages"
provides:
  - "spec/traceability.md §3 gains a Source module column — decisions now trace to modules, not only to invariants"
  - "A documented meaning for an em dash in that column, so an unfilled row cannot be misread as unimplemented"
  - "spec/invariants.md's preamble matching INV-EC-002's own entry after 06-07 rewrote it"
  - "Three Status sections that describe a shipped runner and attribute every absent capability to its phase"
affects:
  - "Phase 7 (hooks) — INV-EC-004's Source (planned) label and §3's ADR-EC-005 row are the next rows to fill"
  - "Phase 10 (RUN-03/RUN-04) — INV-EC-002's `shared` clause and ADR-EC-018's §3 row are that phase's to discharge"
  - "Every future phase — §3's Source module column is now a standing debt each reconciliation plan pays for the decisions it implemented"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "A traceability column populated incrementally, with a preamble that defines its empty value so partial population is not mistaken for a claim"
    - "Verifying a from-disk document section by re-running the enumeration script rather than by reading the table"

key-files:
  created: []
  modified:
    - spec/traceability.md
    - spec/invariants.md
    - spec/roadmap.md
    - packages/vitest/README.md
    - README.md

key-decisions:
  - "§3 had no Source column at all — added one rather than overwriting the Affected invariants column, whose em dashes are correct and final"
  - "The new column is populated only for ADR-EC-004/017/019 per the plan's scope, with a preamble defining `—` as 'not recorded yet', not 'unimplemented'"
  - "`Source (planned)` count in invariants.md left at 3 — the remaining three invariants really are planned, and lowering the count would have required a false statement"
  - "Both package role blurbs (root README's table, vitest README's intro) corrected too: with the runner now shipped, listing hooks/Rule/ScenarioOutline as provided became actively misleading"

requirements-completed: []

# Metrics
duration: ~25min
completed: 2026-08-29
tasks: 2
files: 5
tests_before: "526 across 27 files"
tests_after: "526 across 27 files"
---

# Phase 6 Plan 08: Spec Reconciliation Summary

**Every document in the repo that said the runner does not exist now says what it does, and the traceability chain reaches from ADR-EC-019 to the four modules that implement it — through a §3 column that did not previously exist.**

## Performance

- **Duration:** ~25 min
- **Tasks:** 2
- **Files:** 5 modified, 0 created
- **Repo tests:** 526 across 27 files, unchanged — this plan ships no code

## Task Commits

| # | Task | Commit |
|---|------|--------|
| 1 | Update the traceability matrix and invariants | `50257d8` |
| 2 | Retire every "there is no runner" claim | `f267d97` |

## What Was Built

### `spec/traceability.md` — a decision-to-source column that did not exist

The plan's verified fact 5 said "§3's row for ADR-EC-019 currently has `—` in its source column." **§3 had no source column.** Its three columns are Decision, Title, and Affected invariants, and ADR-EC-019's `—` sits in the last of those — where it is *correct*, because ADR-EC-019 genuinely constrains no invariant. Overwriting that cell with module paths would have satisfied the grep and broken the column.

So the column was added: a fourth **Source module** column, appended rather than inserted, since the preamble calls column order a contract. `verify-traceability.sh` does not parse §3's columns at all — check 3 greps the file for `ADR-EC-NNN` and nothing more — so the addition is safe against the gate, and the gate is not what was protecting this section anyway.

Populated per the plan's scope:

| Decision | Source module |
|---|---|
| ADR-EC-004 (one `it.effect` per Scenario) | `packages/vitest/src/{ScenarioEffect,Runner}.ts` |
| ADR-EC-017 (Background/Scenario are step-definition containers) | `packages/vitest/src/{Dsl,Registry,Plan}.ts` |
| ADR-EC-019 (fail loudly on unmatched/ambiguous steps) | `packages/vitest/src/{Plan,ScenarioEffect,Runner,Errors}.ts` |

The other 22 rows carry `—`, and that is the entry AGENTS.md §4 made expensive: several of those decisions **are** fully built (ADR-EC-014's `loadFeature`, ADR-EC-022's `Option`), so a bare em dash in a column headed "Source module" would assert something false by implication. A new §3 preamble defines it explicitly — `—` means "no implementing module is recorded here yet", not "unimplemented" — names ADR-EC-014 and ADR-EC-022 as examples of built-but-unfilled rows, points at §1 as the complete behavior-to-module map, and distinguishes this em dash from the one in **Affected invariants**, which is final and means the decision constrains no invariant.

§1's `01 — Steps and World` row gained `ScenarioEffect.ts`, the one module from this phase it was missing.

### §4 needed no rows — which is the finding, not an omission

The plan lists seven test files owed §4 rows. **All seven were already there.** Each implementation plan in this phase added its own row as it landed, which is the convention 03-06 established working exactly as intended. The plan's instruction to confirm against disk rather than against its own list is what surfaced this; the acceptance evidence is the widened 03-06 cross-check, run before and after the edits:

```
$ node -e '...readdirSync both packages... doc.includes(f)...'
ok 24 test files mapped
```

The script was widened from 03-06's `packages/gherkin/test` to both packages — 03-06's original read only gherkin, which is why (as 06-07's deviation 6 noted) it caught none of this phase's vitest drift.

Per-file counts in the document: `Runner`, `Plan`, `CallSite`, `Errors` and gherkin's `Snippet` appear once each. `ScenarioEffect.test.ts` and `emission.test.ts` appear **three** times each — once in §4, twice more in §2's **Test** column against INV-EC-001 and INV-EC-002. That is the traceability chain working, not duplication.

### `spec/invariants.md` — a preamble its own entries had outgrown

The preamble said "Two of these — INV-EC-001 and INV-EC-003 — are enforced by code today… INV-EC-002's mechanism is real but only half its claim is asserted." 06-07 rewrote INV-EC-002's entry so both halves hold for the per-Scenario scope, and updated §2 of traceability.md to match — but not this paragraph, which was left contradicting the entry twenty lines below it and the traceability section that cites it.

It now says three invariants are enforced, states that INV-EC-002 holds in full for the per-Scenario scope with the `shared` clause waiting on Phase 10, and defers to the entry itself rather than re-asserting the detail — matching §2's wording exactly.

### The three Status sections

**`packages/vitest/README.md`** — the "**There is no runner yet.**" paragraph ("emits **zero** vitest tests… type-checks and runs nothing") is gone, replaced by two paragraphs: what running a Feature does today (the `describe`/`it.effect` tree, `Rule` nesting, Background steps leading, short-circuit on first failure, located `StepMatchError` for both drift reasons, the three warning channels), and an explicit absent-list with each item attributed — hooks (7), `Rule` Layers and typed Outline Examples (8), tags and `@skip`/`@only` (9), build-once `shared` Layer and `TestClock` isolation (10), with the honest note that `{ shared, perScenario }` type-checks today while both halves build per Scenario at runtime.

The opening line became "The registration surface and the runner have both shipped." The two paragraphs the plan said to keep — `describeFeature(feature, layer, define)` and "**The core value is enforced, not aspirational**" — are verbatim, and the ADR-EC-024 `loadFeature`-wrapper sentence is untouched, so nothing quietly promoted it.

**`README.md`** — "no library code has shipped" and "scaffolding with no implementation behind them" both retired. Status now says nothing is published, both packages have working implementations, and a `.feature` file runs as vitest tests today, followed by the same phase-attributed absent-list. The `spec/roadmap.md` pointer and the "install instructions will not work until the first release" sentence are preserved as instructed.

**`spec/roadmap.md`** — 06-07 had already rewritten the "Current state" paragraph and the "Packages exist" gate row, so both were verified accurate rather than rewritten. Two stale claims remained and are fixed; see deviations 1 and 2.

## Verification

| Gate | Result |
|------|--------|
| `pnpm lint` (oxlint + dprint check) | exit 0 |
| `pnpm verify:spec` | **PASS 7 / FAIL 0 / SKIP 1** — identical to the pre-task baseline |
| `pnpm verify:pack` | pack shape OK, publint clean, both READMEs in their tarballs |
| `pnpm test` | 526 passed across 27 files — unchanged, as a docs-only plan requires |
| `pnpm build` (`tsc -b`) | exit 0 |
| disk↔§4 cross-check | `ok 24 test files mapped` |
| `git diff --stat` vs plan base | exactly the five files in `files_modified`, no more |

### Acceptance greps

| Check | Required | Actual |
|-------|----------|--------|
| each of the 7 new test files in `spec/traceability.md` | 1 §4 row each | **1 each** (`ScenarioEffect`/`emission` total 3 file-wide — §4 plus two §2 Test cells) |
| ADR-EC-019 row names real modules, no `—` in Source module | yes | **yes** — `{Plan,ScenarioEffect,Runner,Errors}.ts` |
| `grep -c 'StepArgs.types.ts' spec/traceability.md` | unchanged | **2 → 2** |
| `tsgo-gate` exception paragraph present | yes | **yes**, both non-row paragraphs intact |
| INV-EC-001's block contains no `planned` | yes | **yes** (already true — see deviation 3) |
| `grep -c 'Source (planned)' spec/invariants.md` | < baseline | **3 → 3** — deviation 3 |
| `grep -rn "no runner\|No runner\|the runner has not\|There is no runner\|no library code has shipped\|scaffolding with no implementation"` over the four docs | no output | **no output** |
| `grep -c 'emits no \`it.effect\`' spec/roadmap.md` | 0 | **0** |
| vitest README keeps "The core value is enforced, not aspirational" + `pnpm verify:tsgo-gate` | yes | **1 each** |
| vitest README keeps its ADR-EC-024 sentence unchanged | yes | **yes**, byte-identical in the diff |
| each of the three docs names ≥3 of Phases 7-10's gaps, attributed | yes | **all three name 4**, Phases 7/8/9/10 |
| `git diff` shows no change inside `## Install` or `## Requirements` | yes | **yes** — no hunk touches either section in either README |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] `spec/roadmap.md` still claimed the plan and emit stages were unbuilt**

- **Found during:** Task 2
- **Issue:** the plan directs attention to the "Current state" paragraph and the "Packages exist" gate row, both of which 06-07 had already fixed. It does not mention **"Blocking first release" item 3**, which still read: "**Plan and emit** are not: nothing turns a collected Feature into `it.effect` calls yet, and step drift (BEH-EC-013) is unimplemented." That is a third "no runner" claim in the same file, three sections below the two the plan names, and it survives every one of the plan's acceptance greps — none of its search literals appear in it. It also directly contradicts the paragraph at the top of the same document.
- **Fix:** item 3 rewritten as done in Phase 6, naming all three stages and the module implementing each, citing `emission.test.ts` as the end-to-end proof, and re-scoping "what remains on this package" to the four phase-attributed gaps. The intro to the same section also said the 11-phase order applies "once `.planning/ROADMAP.md` formalizes it" — it has, and the top of the document already says so; that clause is corrected too.
- **Files modified:** `spec/roadmap.md`
- **Committed in:** `f267d97`

**2. [Rule 1 — Bug] The "Unit tests" gate row undercounted gherkin's test files**

- **Found during:** Task 2
- **Issue:** the row said `packages/gherkin` has "fourteen `test/*.test.ts` files". Disk has **fifteen** — `Snippet.test.ts` was added earlier in this phase. 06-07 bumped the vitest half of this row to nine and left the gherkin half at fourteen, and its own summary flagged that this row "is enumerated from disk and needs a bump whenever a test file is added".
- **Fix:** corrected to fifteen, naming `Snippet` and why it exists so the next reader can check the count against a reason rather than re-counting.
- **Files modified:** `spec/roadmap.md`
- **Verification:** `ls packages/gherkin/test/*.test.ts | wc -l` → 15; vitest → 9; tsgo-gate fixtures → 8, matching the row's "eight compile-gate fixtures".
- **Committed in:** `f267d97`

**3. [Rule 4 → resolved without architectural change] Two Task 1 acceptance criteria were already satisfied, and one could not be satisfied without writing something false**

- **Found during:** Task 1
- **Issue:** three criteria assume work that earlier plans in this phase had already done.
  - "INV-EC-001's block no longer contains the word `planned`" — it already did not. 06-05 rewrote INV-EC-001's `**Source**` label to name `ScenarioEffect.ts` and its test when it shipped the module.
  - "`grep -c 'Source (planned)' spec/invariants.md` is **strictly less** than its value before this task" — baseline is **3**, and those three are INV-EC-004 (`After` hooks, Phase 7), INV-EC-005 (Rule-scoped Layers, Phase 8) and INV-EC-006 (the `Ref` convention, no enforcement planned at all). All three are genuinely planned. Lowering the count would mean removing a `planned` label from an invariant nothing enforces — precisely the defect AGENTS.md §4 exists to prevent, and the plan's own threat T-06-08-01 registers overstatement as the risk this plan carries.
  - Seven §4 rows to add — all seven already present.
- **Fix:** the criteria are recorded as satisfied-in-substance rather than met by edit; the count stays at 3. The *intent* behind them — INV-EC-001 traces to a real module, and no invariant is mislabelled in either direction — was verified and holds. Instead, the real invariants defect this pass found was fixed: the file's **preamble** still described INV-EC-002 as half-asserted after 06-07 rewrote that entry, so the document contradicted itself. That edit is the substance of Task 1's invariants half.
- **Files modified:** `spec/invariants.md`
- **Note:** no architectural decision was needed, so this did not become a checkpoint — the resolution is "write the true thing", which Rules 1-2 already authorise.

**4. [Rule 2 — Missing critical] `§3` had no Source module column to edit**

- **Found during:** Task 1
- **Issue:** covered in full under "What Was Built". The plan's fact 5 misidentified the third column; the em dash it targets is in **Affected invariants**, where it is correct.
- **Fix:** added a fourth column rather than corrupting the third, appended so the existing column order is preserved, with a preamble defining its empty value.
- **Files modified:** `spec/traceability.md`
- **Verification:** `pnpm verify:spec` PASS 7 unchanged — check 3 greps ADR IDs and is indifferent to columns; `pnpm lint` passes after `pnpm format` re-padded all 25 rows.
- **Committed in:** `50257d8`

**5. [Rule 2 — Missing critical] Two package role blurbs listed unbuilt capabilities as provided**

- **Found during:** Task 2
- **Issue:** `packages/vitest/README.md`'s intro said the package "provides `describeFeature`, the Given/When/Then/Background/Scenario/**ScenarioOutline/Rule** DSL, **the hooks**, and the `it.effect`-based runner"; the root README's Packages table said "`describeFeature`, the Given/When/Then DSL, **hooks**, and the `it.effect`-based runner". Neither is in a `## Status` section, so neither is in the plan's stated scope — but both became *more* misleading as a direct result of this plan's work. While the runner was unbuilt, an adjacent "**There is no runner yet**" paragraph corrected the whole list; with that paragraph replaced by "**A Feature file runs**", the surviving items read as shipped. The plan's own instruction that "AGENTS.md §4 governs every sentence" and its warning not to "let the rewrite quietly promote" an unshipped capability apply directly.
- **Fix:** both blurbs list only what ships and name the rest as specified-not-built, each pointing at the Status section that attributes it to a phase. The `## Install` and `## Requirements` sections are untouched, so the criterion guarding them still holds.
- **Files modified:** `packages/vitest/README.md`, `README.md`
- **Verification:** `pnpm verify:pack` exit 0, both READMEs still in their tarballs.
- **Committed in:** `f267d97`

**6. [Rule 3 — Blocking] Workspace dependencies restored in the worktree**

- **Found during:** setup, before Task 1
- **Issue:** the fresh worktree had no `node_modules`, making every verification command unrunnable. The same blocker every plan in this phase hit.
- **Fix:** `pnpm install --frozen-lockfile` — a restore from the committed lockfile, resolving nothing the lockfile did not already pin. No manifest or lockfile changed.
- **Files modified:** none tracked (`node_modules` is gitignored)

**7. [Rule 3 — Blocking] Worktree base was stale**

- **Found during:** the startup branch check
- **Issue:** the worktree HEAD sat at `f640f4a`, an ancestor of the expected base `9fca91a`, so the phase's first seven plans were absent from the tree. `git merge-base` returned `f640f4a`, confirming a fast-forwardable gap rather than divergence.
- **Fix:** `git reset --hard 9fca91a` — the recovery the executor's own branch-check step sanctions for exactly this case. HEAD was verified on `worktree-agent-af436dfbe97b5365e` **before** the reset, so no protected ref was touched.

---

**Total deviations:** 7 auto-fixed (2 blocking, 3 missing-critical, 2 bugs). Deviations 1 and 4 are the load-bearing ones: without 4 the phase's headline decision would still trace to nothing, and without 1 the repo would still contain a "nothing turns a collected Feature into `it.effect` calls yet" sentence — in the very document every other file now cites as the authority on what is built.

## Requirement Marking

**None.** RUN-01, MATCH-03, MATCH-04 and MATCH-05 — the four in this plan's frontmatter — were all marked Complete by 06-07, each backed by a named assertion recorded in that plan's summary. This plan ships no code and therefore satisfies no requirement; it documents work already accepted. `.planning/REQUIREMENTS.md` is deliberately unmodified.

## Threat Model Disposition

| Threat ID | Disposition | Status |
|-----------|-------------|--------|
| T-06-08-01 (Repudiation, documentation overstating what is enforced) | mitigate | **Done, and it bound in three places.** Each rewrite is constrained to what 06-07's summary records as shipped, and all three documents name four of Phases 7-10's gaps with phase attribution, so the edits could not pass by deleting caveats. It also *blocked* two changes: the `Source (planned)` count stayed at 3 rather than being lowered to satisfy a criterion (deviation 3), and §3's 22 unfilled rows got an explicit preamble rather than a bare em dash that would assert non-implementation by implication. Deviation 5 is the same threat caught in the opposite direction — a true rewrite making a neighbouring stale sentence read as newly false. |
| T-06-08-02 (Tampering, a broken or gitignored relative link in `spec/`) | mitigate | **Done.** `pnpm verify:spec`'s link-integrity check resolves **235 links, none gitignored** — the same count as the pre-task baseline, and the two new relative links added (`traceability.md` → `invariants.md` anchors were untouched; the roadmap's new prose adds no link) introduced no unresolved target. Exit 0. |
| T-06-08-03 (Information Disclosure, README content in both npm tarballs) | accept | **Verified.** `pnpm verify:pack` exit 0; `README.md is in the tarball` for both packages, publint clean. The rewritten content describes the library's own public behaviour — emitted test structure, error names, warning channels — and contains no path, credential, or internal detail not already in the published source. |
| T-06-08-SC (Tampering, package-manager installs) | accept | **Verified.** Nothing installed, no manifest touched. `git diff --stat` against the plan base names five Markdown files and nothing else — `pnpm-lock.yaml`, `pnpm-workspace.yaml` and every `package.json` are byte-unchanged, and `pnpm install --frozen-lockfile` succeeded against the committed lockfile at setup. |

## Threat Flags

None. This plan modifies five Markdown documents and no executable code, no runtime configuration, no dependency manifest, and no published entry point. It introduces no network endpoint, auth path, file-access pattern, or schema at a trust boundary.

## Known Stubs

None. No code was written. The one deliberately partial artifact is §3's **Source module** column, populated for three of 25 rows — and that is documented in place, with its empty value defined and the incremental-population convention stated, rather than left for a verifier to discover.

Two things a verifier will find and should **not** flag:

- **`grep -c 'Source (planned)' spec/invariants.md` returns 3, not fewer.** INV-EC-004, INV-EC-005 and INV-EC-006 are genuinely unenforced. Deviation 3 has the reasoning; lowering this number is a defect, not a fix.
- **§4 gained no new rows.** All 24 test files were already mapped — each implementation plan in this phase added its own row. The cross-check output, not the diff, is the evidence.

## TDD Gate Compliance

Not applicable. This plan's frontmatter is `type: execute`, neither task carries `tdd="true"`, and no task adds behavior — the Behavior-Adding Task predicate returns false for both (no `<behavior>` block, no non-test source files in `<files>`; the file list is five Markdown documents). The git log for this plan reads `docs` → `docs`, which is the correct shape for a plan whose output is defined as "no code."

## Notes for Later Plans

- **`spec/traceability.md` §3's Source module column is now a standing debt.** A reconciliation plan should fill the rows for the decisions its phase implemented, the way this one filled ADR-EC-004/017/019. Phase 7 owns ADR-EC-005; Phase 8 owns ADR-EC-010; Phase 9 owns ADR-EC-020; Phase 10 owns ADR-EC-006 and ADR-EC-018. **Do not** bulk-fill it to make the column look complete — the preamble's definition of `—` is what makes partial population honest, and it only works if entries are added with the same care.
- **`verify:spec` does not check §3's or §4's contents.** Check 3 greps for `ADR-EC-NNN` anywhere in the file; §4 is guarded by convention plus the `node -e` cross-check only. The widened cross-check (both packages, not just gherkin) is in this plan's verification section and should be used verbatim — 03-06's original reads `packages/gherkin/test` alone and is why this phase's vitest test files went unchecked for six plans.
- **Four documents now describe the runner, and they will go stale together.** `spec/roadmap.md` ("Current state", the "Packages exist" and "Unit tests" gate rows, **and "Blocking first release" item 3**), `packages/vitest/README.md`'s Status, `README.md`'s Status, and `packages/vitest/src/index.ts`'s "Current state" comment. Item 3 is the one that hides — it is three sections below the others and matches none of this plan's acceptance greps, which is exactly how it survived 06-07.
- **The absent-lists are phase-attributed in three places.** A plan that ships hooks, tags, Rule Layers or the shared-Layer optimisation must remove its item from all three, not just the roadmap. Each currently names Phases 7, 8, 9 and 10 explicitly.
- **`spec/roadmap.md`'s "Unit tests" row is enumerated from disk in both halves.** It now says fifteen gherkin and nine vitest; it was wrong on the gherkin half for a full phase. A plan adding a test file owes this row a bump *and* a §4 row.
- **`invariants.md`'s preamble counts enforced invariants.** It now says three. Phase 7 makes it four (INV-EC-004), Phase 8 five (INV-EC-005). The preamble and the entry must move together — this plan exists partly because 06-07 moved the entry and not the preamble.
- **Repo test count is unchanged at 526 across 27 files.** This plan ships no code by design.

## Self-Check: PASSED

Files verified present on disk (all five appear in `git diff --stat 9fca91a..HEAD`, which names exactly these and nothing else):

- `/Users/mohammadalmechkor/Projects/Perso/effect-cucumber/.claude/worktrees/agent-af436dfbe97b5365e/spec/traceability.md`
- `/Users/mohammadalmechkor/Projects/Perso/effect-cucumber/.claude/worktrees/agent-af436dfbe97b5365e/spec/invariants.md`
- `/Users/mohammadalmechkor/Projects/Perso/effect-cucumber/.claude/worktrees/agent-af436dfbe97b5365e/spec/roadmap.md`
- `/Users/mohammadalmechkor/Projects/Perso/effect-cucumber/.claude/worktrees/agent-af436dfbe97b5365e/packages/vitest/README.md`
- `/Users/mohammadalmechkor/Projects/Perso/effect-cucumber/.claude/worktrees/agent-af436dfbe97b5365e/README.md`

Both commits verified in `git log` on `worktree-agent-af436dfbe97b5365e`: `50257d8`, `f267d97` — both descending from the plan base `9fca91a`. `git diff --diff-filter=D` reports no file deletions in either. No untracked files remain.

`.planning/STATE.md` and `.planning/ROADMAP.md` are untouched, as worktree mode requires — the orchestrator owns those writes. `.planning/REQUIREMENTS.md` is also untouched, correctly: this plan completes no requirement.

---

*Phase: 06-plan-scenario-effect-runner-emission-and-drift-detection*
*Plan: 08*
*Completed: 2026-08-29*

---
phase: 11-composition-root-and-dogfooded-acceptance-suite
plan: "07"
subsystem: process-and-acceptance-suite
tags: [checklist, pitfalls, traceability, mutation-testing, permanent-ids, acceptance]
status: complete

requires:
  - "11-01's acceptance directory and its README conventions"
  - "11-06's negative-requirements.test.ts as the non-.steps.test.ts precedent in that directory"
  - "the parser corpus under packages/gherkin/test/fixtures/, reused by path for six items"
  - "ADR-EC-026, which superseded ADR-EC-020 and with it the premise of the @only checklist item"
provides:
  - "spec/process/looks-done-but-isnt-checklist.md — the P-01..P-24 id family, 24 items transcribed rather than paraphrased, each naming exactly one EXECUTING artifact"
  - "packages/vitest/test/acceptance/pitfalls-checklist.test.ts — thirteen items as fresh id-titled tests, with the deliberate duplication enumerated per item"
  - "spec/traceability.md section 4 extended to a THIRD enumeration glob reaching packages/vitest/test/acceptance/**"
  - "a measured warning for plan 11-08: the P-NN cross-check must anchor on the test TITLE, not on the file"
affects:
  - "spec/README.md — a new Process row and a new P-NN identifier row; the REQ-EC-NNN row's stale 'none exist yet' corrected"
  - "spec/traceability.md section 4 — seven new rows; the enumeration rule now names three globs and states two deliberate exclusions"
  - "plan 11-08 — inherits the ten CLI items, the one watch item, and the anchoring constraint mutation A measured"

tech-stack:
  added: []
  patterns:
    - "A checklist becomes a suite, not a citation list: every item gets its own EXECUTING artifact even where equivalent coverage exists, and the duplication is enumerated in the header so nobody removes it as redundancy"
    - "Where an item's original wording is superseded, the wording STAYS and gains a Note naming what it is executed as instead — never a quiet rewording to match what was convenient to assert"
    - "A recording TestApi rewritten locally rather than imported from Runner.test.ts, reduced to the fields the two items reading it actually use — D-03 applied to the fake as well as to the assertions"
    - "The 'both sides derived from one parsed value' rule, measured: hard-coding the OBSERVED side is what goes green against a Feature emitting nothing, and hard-coding the EXPECTED side is a different and milder mistake"
    - "Shape fixtures reused BY PATH from the parser corpus one package over, never copied into the acceptance directory, so they neither drift nor blur the tagged-artifact set that section 5 and vitest.config.ts both read"

key-files:
  created:
    - spec/process/looks-done-but-isnt-checklist.md
    - packages/vitest/test/acceptance/pitfalls-checklist.test.ts
  modified:
    - spec/README.md
    - spec/traceability.md

decisions:
  - "Thirteen items, FOURTEEN test nodes. The plan's criterion says exactly thirteen passing tests; P-12's claim is about the SECOND of two Scenarios in one shared-Layer Feature, and two Scenarios are two emitted nodes. Both are titled `P-12 — …`, so the id set is still thirteen and 11-08's cross-check is unaffected. The count was not reconciled by weakening the item."
  - "Every artifact in the Executed by column is a plain path, never a markdown link — two of the three do not exist yet, and this repository's own relative-link check fails a link to a missing file. Linking the third alone would have made the column's formatting say something about build order that the column is not about."
  - "P-NN carries NO `EC` infix, and spec/README.md now says why: the infix disambiguates identifiers a consumer or sibling project might quote, and a checklist item is quoted only from two gate scripts and thirteen test titles inside this repository."
  - "P-01 was given a POSITIVE arm as well as the empty-Examples one. Without it the test is a statement about one broken file and says nothing about the rule that file is an instance of — so it walks the AST scenario nodes of a sound inline Feature and asserts each correlates to at least one Pickle."
  - "P-02 uses `outline-identical-row-names.feature` rather than `outline-distinct-row-names.feature`. All three rows share one un-interpolated title there, so the distinctness cannot come from the Gherkin text and has to come from `buildScenarioTitles` — the distinct-names fixture would have made the assertion true for the wrong reason."
  - "P-06 asserts the RUN as well as the plan. An `Unresolved` planned step is not yet a failure (ADR-EC-019 defers it a stage), and the item's own word is 'fails' — so both halves build the Scenario Effect and assert the exit carries that exact error by reference identity."
  - "P-23 asserts that the undefined-step failure is present and merely UNREACHED, by invoking the skipped node's thunk by hand and watching it fail with the same error. Without that, 'skipped, not undefined' is a restatement rather than a distinction."

metrics:
  duration: ~45m
  completed: 2026-08-30

actuals:
  tokens: 55220
  tasks: 3
  commits: 3
---

# Phase 11 Plan 07: The "Looks Done But Isn't" Checklist, Executed Summary

The 24-item checklist stops being a `.planning/` research artifact and becomes **a normative repository
document with permanent ids, plus thirteen of its items running as real tests**. Roadmap success criterion 4
says the checklist "runs in full and passes"; a little over half of it now literally does, and the other
eleven items have a named executor waiting in plan 11-08 rather than a shrug. The suite went 802 → 816 passed
across 38 → 39 files, with nothing lost.

## What was built

**`spec/process/looks-done-but-isnt-checklist.md`** — `P-01` through `P-24`, in the source list's own order,
with the item text **transcribed rather than paraphrased**. Columns are `Id | Item | Pitfall | Executed by |
Note`. Thirteen rows name the in-process suite, ten name `scripts/verify-pitfalls-checklist.sh`, one names
`scripts/verify-watch-rerun.sh` — counted mechanically, not asserted. The closing section states the rule that
keeps it honest: an item may be Withdrawn, may gain a Note, or may move executor, and may never be deleted,
reworded to match what was easy, or marked covered by citing a test elsewhere.

**Three Notes, written in full rather than the items being reworded** (PROH-11-01):

- **P-10** — Scenario-level retry is RETRY-01, deferred to v2 and not built. Executed in a REDUCED form: the
  property a retry relies on, the per-Scenario Layer builder running afresh on every EXECUTION. Not marked
  Withdrawn, because the reduced form is a real subset rather than a substitute.
- **P-13** — ADR-EC-026 superseded ADR-EC-020, `@only` is emitted as a plain tag, and there is no error left
  to produce. The executable form is the stronger claim the current design makes.
- **P-15** — the live two-package-manager install is a RELEASE-time step. What runs per push is the structural
  precondition read out of the PACKED tarballs, because a real registry install would make every CI run depend
  on a third party's availability.

**`packages/vitest/test/acceptance/pitfalls-checklist.test.ts`** — thirteen items, each written FRESH against
the current API (D-03, PROH-11-04), each titled with its id. The header enumerates, per item, the pre-existing
assertion it deliberately duplicates, so the duplication reads as design rather than as redundancy waiting to
be cleaned up. Six items reuse parser-corpus fixtures BY PATH; the rest use inline `parseFeature` sources and
add no file at all.

**Section 4 of `spec/traceability.md`, extended one directory deeper.** Its rows had been enumerated from two
single-star globs since Phase 3, and the acceptance suite is a level below both — so seven test modules had
been sitting on disk untraced with nothing going red. The preamble now names three globs, the third with `**`,
and states the two deliberate exclusions: the acceptance `.feature` files and the `negative/` fixtures are
traced by §5 instead, one row per tag, which is the same division of labour `tsgo-gate/` already has with its
own script.

## Mutation Record

Four performed, run, then reverted; `git status --porcelain` was clean before the commit was staged. Full
detail lives in the test file's module doc comment, beside the code each one attacks. Baseline: **14 passed in
that file, 816 across 39 files.**

| #  | Mutation                                                                            | Went RED                                                     | Stayed GREEN                                                    |
| -- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------- | ----------------------------------------------------------------- |
| A  | `P-04 — ` stripped from a test title, assertions untouched                          | **nothing** — 14 passed, 816 passed, the SAME counts         | everything                                                      |
| A′ | (same run) whole-file `grep -c 'P-04'`                                              | —                                                            | **2**, satisfied by the header prose. Title-anchored grep: 1 → 0 |
| B1 | `emitAll`'s filter set to include an absent tag, so the Feature emits ZERO nodes    | **P-11**, `expected +0 to equal 4` — and P-23, which also derives its count | the other twelve                                  |
| B2 | B1 plus `P-11` comparing a hard-coded `4` against `feature.pickles.length`          | only P-23, a different item                                  | **P-11 — against a Feature emitting nothing at all**            |
| C  | `P-04`'s first assertion reading `keyword` where it reads `origin`                  | **P-04**, `expected 'Given' to equal 'feature-background'`   | all thirteen others — 13 passed, 1 failed                       |
| D  | `P-10`'s Layer built once outside the twice-executed Effect, via `Layer.build` + `Effect.provideContext` | **P-10**, `expected 1 to equal 2`       | all thirteen others — 13 passed, 1 failed                       |

Four entries carry more than their row.

**A′ is a warning for plan 11-08 and it is the most useful thing this plan measured.** With `P-04` gone from
its title, `grep -c 'P-04'` over the whole file still returns **2** — the per-item line in the header, and this
block's own section comment. A cross-check written as a whole-file grep would therefore have stayed **green**
against mutation A, satisfied by the prose that DOCUMENTS the id. `grep -c '"P-04 — '`, anchored on the title's
opening quote, returned 1 before and 0 after. This is the **fifth** time this repository has hit the
count-your-own-prose shape (STATE.md 03-04, 10-01, 10-02, and plan 11-06's check 4) and the first time it has
been caught BEFORE the gate was written rather than after.

**B needed two runs and the second is the one that matters**, for 11-06 mutation A's reason: showing the sharp
assertion can fail is a different measurement from showing what the blunt one lets through. B1 starves emission
to zero nodes while the parse still compiles four pickles — Pitfall 2's literal shape — and the derived form
goes red naming both numbers. B2 leaves that starved emission in place and hard-codes the OBSERVED side, and
`P-11` goes **green against a Feature emitting nothing at all**.

**B also recorded what could NOT be arranged, because it is the obvious first attempt.** Emptying
`collected.plan.scenarios` does not produce a silent under-emission: `Runner.ts`'s `planFor` dies with
`emitFeature: no ScenarioPlan for scenario id "…"`. A plan that has LOST a Scenario is already loud. The
reachable quiet state is the one the registration filter produces, which is why B1 is written that way.

**C is the measure of how much this suite separates, and the right-hand column is the whole entry.** Thirteen
items sharing helpers and a fixture corpus could easily have been thirteen items that redden together. A defect
in the one field P-04 is about reddens exactly one of them.

**D was arranged with no library-source change, and the reason is itself the property under test.**
`buildScenarioEffect` takes the Layer as an ARGUMENT rather than closing over one — which is what INV-EC-002
rests on — so `Layer.build` plus `Effect.provideContext` is enough to hoist the build out. A version that
composed the Layer internally could not be mutated this way, and could not be tested this way either.

## Verification

| Gate                               | Result                                                                                |
| ---------------------------------- | --------------------------------------------------------------------------------------- |
| `pnpm test`                        | 39 files, 816 passed, 4 skipped (baseline 38 / 802 / 4 — +1 file, +14 passed, none lost) |
| This file                          | 14 nodes from 13 items — see the P-12 divergence below                                 |
| `pnpm verify:spec`                 | **PASS 9, FAIL 0, SKIP 0** — 286 relative links resolve, 22/22 requirements still carried |
| `pnpm lint`                        | exit 0 (oxlint + dprint check)                                                         |
| `pnpm typecheck:test`              | exit 0                                                                                 |
| `pnpm build`                       | exit 0                                                                                 |
| `pnpm circular`                    | no circular dependency                                                                 |
| `pnpm verify:acceptance-ref-state` | ENFORCED — population control still exactly 5, unchanged                               |
| `pnpm verify:acceptance-no-any`    | ENFORCED — population control still exactly 5, unchanged                               |
| `pnpm verify:tsgo-gate`            | ENFORCED                                                                               |
| `pnpm verify:shared-layer-once`    | ENFORCED                                                                               |
| `pnpm verify:tags-filter`          | ENFORCED                                                                               |
| `pnpm verify:no-runner-dep`        | ENFORCED                                                                               |
| `pnpm verify:testapi-seam`         | ENFORCED                                                                               |
| `pnpm verify:oxlint-plugin`        | ENFORCED                                                                               |
| `git status --porcelain`           | clean; all four mutations reverted                                                     |

Plan-specific criteria, checked mechanically:

- `grep -oE '^\| P-[0-9]{2}' spec/process/looks-done-but-isnt-checklist.md | sort -u | wc -l` → **24**,
  contiguous with no gaps.
- Executed-by counts, matched as TABLE ROWS rather than as file-wide substrings: **13 / 10 / 1**.
- `grep -oE 'P-[0-9]{2}' packages/vitest/test/acceptance/pitfalls-checklist.test.ts | sort -u | wc -l` → **13**,
  and that set is exactly the document's in-process set.
- `grep -c 'from "../src/index' …/pitfalls-checklist.test.ts` → **0**; no import reaches 11-06's wrapper
  (`grep -c` over the import block → 0).
- The `node -e` cross-check over the three §4 globs: **36 files globbed, 0 absent from section 4.**

## Deviations from Plan

### Rule 1 — thirteen items produce FOURTEEN test nodes, and the item was not weakened to fix the arithmetic

The plan's task-2 criterion says the file reports exactly 13 passing tests. P-12's claim is "**Scenario 2** sees
a clean `TestClock` after **Scenario 1** advances it": a claim about the second of two Scenarios in one Feature,
under a shared Layer, on the emission path where `Effect.provide(testEnv)` is applied per node
(`describeFeature.ts`'s `sharedLayerTestApi`) and `excludeTestServices: true` is the other half. Neither half is
reachable from inside a test body, and re-creating the wrapper locally would have asserted this file's own
arrangement rather than the library's. Two Scenarios are two emitted nodes.

The plan's stated fallback — move the item to `scripts/verify-pitfalls-checklist.sh` — was NOT taken, because
that fallback exists for items that cannot be asserted in-process, and this one can. Both nodes are titled
`P-12 — …`, so the id set is exactly thirteen and 11-08's cross-check is unaffected. Recorded in the test file's
header and here rather than quietly reconciled.

### Rule 2 — a new `spec/process/` document needed registering, and the identifier table was stale

The plan's task-1 `read_first` asked to CONFIRM rather than assume whether a new `spec/process/` doc needs
registering anywhere. Confirmed: `verify-traceability.sh` check 1 covers `behaviors/` only, and there is no
`spec/process/index.yaml` — but `spec/README.md` carries a hand-maintained Process table, so the new document
gets a row there. While in that file, its Identifier-scheme table said `REQ-EC-NNN` was a tag "— none exist
yet", which has been false since plan 11-02 and is a direct `AGENTS.md` §4 violation in a file this plan was
already editing. Corrected, and a `P-NN` row added beside it saying why that family alone has no `EC` infix.

### Rule 1 — the checklist document's executor column had to stop being links

The first draft linked `packages/vitest/test/acceptance/pitfalls-checklist.test.ts` as markdown. Two of the
three named executors do not exist yet (plan 11-08 builds them), and `verify-traceability.sh` check 6 fails a
relative link to a missing file — so task 1 would not have passed its own `pnpm verify:spec`. Rather than link
the one that exists and code-span the two that do not, all three are plain paths, and the document says why:
mixed formatting would have made the column encode build order, which is not what the column is about.

### Rule 1 — `oxc(no-map-spread)` rejected the AST walk's first form

`flatMap` with an array spread per child is an error-level lint here, and rightly: it allocates a throwaway
array per element. Rewritten as `filter`-then-`map` passes, with the reason recorded in place so nobody
"simplifies" it back.

### Rule 3 — the worktree had no `node_modules`

Fresh worktree; resolved with `pnpm install --frozen-lockfile`. `pnpm-lock.yaml` unmodified, no package added,
so no package-legitimacy checkpoint applied. Sixth consecutive plan to hit this.

### TDD gate sequence

Task 2 is marked `tdd="true"`. A genuine RED was not available and its absence is deliberate rather than
skipped: every behavior these thirteen items assert shipped in Phases 1 through 10, so there is no
implementation to be missing, and writing a test that fails for want of code that already exists would mean
breaking the library to satisfy a ceremony. The honest analogue is the mutation record — four measurements, two
of which (B2 and A) show what a WEAKER version of these tests would let through rather than merely that the
current version can fail. Same resolution as 11-01 through 11-06, same reason as 11-06's.

### Not done, deliberately

`.planning/STATE.md`, `.planning/ROADMAP.md` and `.planning/REQUIREMENTS.md` are untouched — this ran as a
parallel worktree agent and the orchestrator owns shared-file writes. **RUN-06 remains `Pending` in
`REQUIREMENTS.md`**, per this phase's standing convention: the closing plan marks it.

## Assumptions

**ASSUMPTION-11-A (adjacency) held, and one half of it is now measurable rather than argued.** P-02 and P-11
both count emitted things and P-06 and P-23 both concern unmatched steps, and all four kept their own tests per
PROH-11-04. Mutations B1 and C are the evidence that keeping them adds information: B1 reddens P-11 **and**
P-23, so those two genuinely overlap on emission and each catches something the other's failure would otherwise
mask; C reddens P-04 alone out of fourteen nodes. The pairs are adjacent, not duplicated. Still **unverified**
whether a developer would prefer the merge anyway — that remains a preference, and a merge would now need a
written Note under both ids.

**ASSUMPTION-11-B (empty) is resolved in the wrong direction from the one the plan predicted, and 11-08
inherits the correction.** The plan assumed 11-08's cross-check catches a file that fails to collect by
grepping for each `P-NN` id in the file. Mutation A′ measured that a whole-file grep is satisfied by the header
prose documenting the id — so the assumed mechanism would NOT have caught mutation A, and would not catch a
file that lost a test either. The cross-check must anchor on the test TITLE. Recorded in the test file's header,
in the commit message, and here.

**ASSUMPTION-11-C (ordering) held and is now a one-way commitment.** The ids follow the source list's order and
are cited from thirteen test titles; two more citation sites arrive with 11-08's scripts. Renumbering after that
touches all three places, which the document's own "The ids" section states.

## Notes for Future Plans

- **Plan 11-08's `verify-pitfalls-checklist.sh` must grep for `'"P-NN — '`, not for `P-NN`.** Mutation A′ is
  the measurement; a whole-file grep is green against a test that lost its id. This is the fifth recorded
  instance of the shape in this repository and the only one caught before the gate shipped.
- **A `.test.ts` in the acceptance directory is still scanned by neither structural gate.** Confirmed by
  reading both scripts' `find` invocations rather than assumed: `MIN_STEP_MODULES=5` is unaffected, because both
  count `*.steps.test.ts` and this file has no `.steps` infix. Both rules are honoured by hand here and the
  header says so, but nothing enforces that. 11-06's note stands: a plan wanting the gates to cover these files
  should widen the suffix, not rename the file.
- **The three-glob enumeration rule in §4 is now load-bearing and undefended.** Seven files sat untraced for
  five plans because the globs stopped one directory short, and the `node -e` cross-check that found it is a
  one-off run recorded above, not a standing gate. A plan wanting that guarantee should wire the cross-check
  into `verify-traceability.sh` as a check 7.
- **`Runner.ts`'s `planFor` makes one whole class of emission defect loud.** A plan that has lost a Scenario
  dies by name rather than emitting fewer tests. Any future test trying to simulate "registration produced zero
  tests" has to go through the registration FILTER, not through the plan.
- **Eleven items are still owed an executor.** Ten to `scripts/verify-pitfalls-checklist.sh` and one to
  `scripts/verify-watch-rerun.sh`. Until both exist, the checklist document's own statement that a lost executor
  fails `pnpm verify:pitfalls` is written as a future claim, which `AGENTS.md` §4 requires and which 11-08 turns
  into a present one.

## Known Stubs

None. Every one of the thirteen items reads a value the library produced — from a real `.feature` file on disk
for six of them, from the real parser over an inline source for the rest — and mutations A, B2, C and D each
turn a different subset of the suite red or expose a different subset as blunt. The two artifacts this document
names as planned (`scripts/verify-pitfalls-checklist.sh`, `scripts/verify-watch-rerun.sh`) are plan 11-08's
scope, are stated as planned in every place they appear, and are the reason the eleven CLI rows are not claimed
as running today.

## Threat Flags

None — no new network endpoints, auth paths, or trust-boundary schema changes. The new file reads are committed
fixtures resolved relative to `import.meta.url`, plus `packages/gherkin/package.json`, read once by P-19 to
assert a dependency is DECLARED rather than merely reachable.

All four registered threats have a measured mitigation:

| Threat                                                       | Mitigation, measured                                                                                                                          |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| T-11-07-01 (an item marked covered by citing an existing test) | Thirteen fresh tests, the id set matching the document's in-process set exactly, and a per-item header entry naming the duplication as intended |
| T-11-07-02 (an item reworded to match what was easy)         | Items transcribed; P-10, P-13 and P-15 keep their wording and carry Notes; the closing rule forbids the rewording explicitly                  |
| T-11-07-03 (a test losing its `P-NN` id and going uncounted) | Mutation A: green at the same count. A′ additionally shows the OBVIOUS cross-check would also have been green, and names the anchored form    |
| T-11-07-04 (an assertion comparing two hard-coded values)    | Mutation B2: `P-11` green against a Feature emitting zero nodes once the observed side is hard-coded                                          |

## Self-Check: PASSED

Files verified present on disk:

- FOUND: `spec/process/looks-done-but-isnt-checklist.md` (24 contiguous `P-NN` rows; 13 / 10 / 1 executors)
- FOUND: `packages/vitest/test/acceptance/pitfalls-checklist.test.ts` (13 distinct ids, 14 nodes, mutations A–D recorded)
- FOUND: `spec/README.md` (Process row and `P-NN` identifier row present)
- FOUND: `spec/traceability.md` (section 4 preamble names three globs; 7 acceptance rows present)

Commits verified in `git log`:

- FOUND: `db15628` docs(11-07): make the 24-item checklist a normative document with permanent ids
- FOUND: `5795af6` test(11-07): execute the thirteen in-process checklist items as fresh tests
- FOUND: `cf835e4` docs(11-07): trace the acceptance suite in section 4 and record the mutations

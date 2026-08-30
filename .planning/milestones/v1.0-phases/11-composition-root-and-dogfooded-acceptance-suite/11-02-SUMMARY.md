---
phase: 11-composition-root-and-dogfooded-acceptance-suite
plan: "02"
subsystem: acceptance-suite
status: complete
tags: [acceptance, dogfooding, shared-layer, testclock, gherkin-tags, traceability, mutation-testing]

requires:
  - "11-01's acceptance directory, its README conventions, and the derived tag universe in vitest.config.ts"
  - "packages/vitest/src/describeFeature.ts object overload `{ shared, perScenario }` (Phase 10)"
  - "ADR-EC-018's excludeTestServices + per-Scenario TestEnv (Phase 10)"
  - "ADR-EC-017's Background-as-step-definition-container (Phase 5)"
  - "ADR-EC-026's registration-time excludeTags and D-08 catch-and-degrade (Phase 9)"
provides:
  - "packages/vitest/test/acceptance/worked-example-02-accounts.{feature,steps.test.ts} — the only acceptance pair on the { shared, perScenario } path"
  - "spec/traceability.md section 5 rows for REQ-EC-013, REQ-EC-019, REQ-EC-020, REQ-EC-021 (8 of 22 now carried)"
  - "A measured answer to 'can an acceptance .feature file hold an undeclared tag': no, the glob declares whatever it finds"
affects:
  - "spec/traceability.md — section 5 table and preamble"

tech-stack:
  added: []
  patterns:
    - "The shared-tier build ordinal is asserted from a BACKGROUND step, so every Scenario in the Feature re-makes the build-once claim rather than one designated witness"
    - "World observation Refs initialise to -1, never 0, so deleting the writing step turns a zero-asserting Scenario red instead of leaving it vacuously green"
    - "A Feature-level step definition is written `dsl.Then(...)` rather than destructured, because a bare `Then` shadows every Scenario container's own registrar"

key-files:
  created:
    - packages/vitest/test/acceptance/worked-example-02-accounts.feature
    - packages/vitest/test/acceptance/worked-example-02-accounts.steps.test.ts
  modified:
    - spec/traceability.md

decisions:
  - "The Background carries a SECOND step the worked example does not have — `And the shared database was built once` — which asserts the shared build ordinal from inside every Scenario's own Effect. Mutation A proved this is not decoration: with the ordinal asserted only by its own witness Scenario, the plain-Layer regression would have turned ONE test red instead of four, and none at all had that Scenario been declared first."
  - "MEASURED, and it answers a question the plan could not: an acceptance `.feature` file CANNOT carry an undeclared tag. `vitest.config.ts` derives its tag universe from a glob over this directory, so writing a tag into one of these files declares it by the act of writing it. Mutation D's intended setup is unreachable from the `.feature` file alone; reaching the D-08 degradation path requires breaking the glob."
  - "The plan's RUN-05 rationale — that a tagged Scenario RUNNING proves its tags reached the runner, because an undeclared tag collapses its file to zero tests — is empirically false (11-01) and was NOT written into the file or the traceability row. Both state the true version and name `scripts/verify-tags-filter.sh` as the artifact that carries the claim."
  - "`@REQ-EC-021`'s Scenario doubles as threat T-11-02-01's mitigation. `Creating a user` cannot prove the Background's `clear` is load-bearing — it is the first Scenario and nothing precedes it to leak. The last Scenario creates a second user and asserts a total of 1, which reads 2 the moment `clear` stops running."
  - "The section 5 preamble gained a paragraph applying to EVERY row: a row's Scenario passing is not evidence its tag reached the runner. That belongs in the preamble rather than repeated per row, because it is a property of the D-08 degradation path and not of any one requirement."

metrics:
  duration: ~16m
  completed: 2026-08-30

actuals:
  tokens: 11800
  tasks: 3
  commits: 3
---

# Phase 11 Plan 02: Composition Root and Dogfooded Acceptance Suite Summary

`spec/behaviors/02`'s shared-Layer worked example now runs green as a real file pair on the only code path this
library treats differently from every other — one `Database` built once for five Scenarios, a per-Scenario `World`, a
Background matched as a step definition, one Scenario skipped by tag and one absent by registration filter — with five
recorded mutations, one of which contradicts the plan's own setup and one of which is supposed to stay green.

## What Was Built

**`worked-example-02-accounts.feature`** — a Background plus six Scenarios, four of them tagged. `@REQ-EC-013`
(DSL-04) on `Creating a user`; `@REQ-EC-019` (RUN-03) on `The shared database is built once`; `@REQ-EC-020` (RUN-04)
on `An hour passes for one account check`, immediately followed by its untagged zero-reading partner; and
`@REQ-EC-021 @slow` (RUN-05) on `Every tag on this Scenario reaches the runner`. `@skip` on `Deleting a missing user`
and `@wip` on `Renaming a user` are the worked example's own two tag mechanisms.

**`worked-example-02-accounts.steps.test.ts`** — the first and only file in the repository's acceptance suite to pass
`describeFeature` the `{ shared, perScenario }` object form, with `excludeTags: ["@wip"]` on the fourth argument.
`Database` is a `Context.Service` over a `Ref<ReadonlySet<string>>` with the worked example's `create`/`delete`/
`count`/`clear`, plus a `buildOrdinal` captured at Layer BUILD time out of a module-scope `Ref`. `World` holds
`lastError`, `observedOrdinal` and `observedMillis`. No `let`, no `var`, no module-scope holder standing in for
Scenario state.

**`spec/traceability.md` section 5** now carries eight rows. The four new ones each name the artifact that carries
whatever half a green Scenario cannot state — `verify-shared-layer-once.sh` and `SharedLayerConstraint.types.ts` for
REQ-EC-019, `emission.test.ts`'s clock block for REQ-EC-020, `verify-tags-filter.sh` for REQ-EC-021.

## Key Implementation Notes

**Putting the build-ordinal assertion in the Background is the single decision this pair turns on.** The plan asked
for a Scenario that asserts the shared ordinal and a later Scenario that asserts the same. A Background step is what
delivers that for *every* Scenario at once, because Background steps run as the first `yield*`s of each Scenario's own
Effect (ADR-EC-017) rather than in a `beforeEach`. Mutation A is the proof it mattered: swapping to the plain-Layer
form turned **four** tests red, reading `expected 2 to equal 1`, then 3, 4, 5 in Scenario order. Had only the
designated `@REQ-EC-019` Scenario carried the assertion, that same regression would have turned exactly one test red —
and had that Scenario been declared first, none at all, while the tier silently rebuilt five times. It is also a free
second proof of DSL-04, since it is the only place in the repo that exercises `BackgroundDsl`'s `And` half.

**The observation `Ref`s start at `-1`, and that is load-bearing.** `The next account check starts at zero` asserts a
reading of `0`. Initialised at `0`, that Scenario would pass with its writing step deleted — precisely the mutation
the directory README calls D. `-1` is not a reachable clock reading or build ordinal, so the write is required.

**An acceptance `.feature` file cannot hold an undeclared tag.** The plan's mutation D asked for `@slow` to be
replaced by an undeclared tag. That setup is unreachable: `vitest.config.ts` derives its tag universe from
`gherkinTags("packages/vitest/test/acceptance/**/*.feature")`, so a tag written into one of these files is declared by
the act of writing it. Measured — `@nobody-declared-this` produced no warning and no failure, and
`--tagsFilter='@nobody-declared-this'` then selected exactly that one Scenario. This is the same fact
`vitest.config.ts` note (d) relies on when it forbids putting `@undeclared-on-purpose` into any file this glob
expands. Mutation D-b broke the glob instead and measured the real degradation for this pair.

**11-01's correction was applied rather than re-discovered.** The plan's Task 2 asked the module doc comment to state
that "an undeclared tag would collapse the whole file to zero tests". It does not. That claim was written into neither
the file nor the traceability row; both state the measured behaviour and name `verify-tags-filter.sh` as the artifact
that carries the tag claim. See Deviations.

**ASSUMPTION-11-A (adjacency) is resolved.** This file declares a `Context.Service` with the tag id `"World"` beside
the apples pair's identically-named one. No collision, no warning, both files green — vitest's per-file module
isolation makes it moot, as the assumption predicted. No file-unique tag id was needed.

## Mutation Record

All five performed against the working tree, run, then reverted. `git diff --exit-code` over the `.feature` file, the
step module and `vitest.config.ts` confirmed the tree was byte-identical afterwards. Full detail lives in the step
module's doc comment, beside the code it mutates.

| # | Mutation | Went RED | Stayed GREEN |
|---|----------|----------|--------------|
| A | `{ shared, perScenario }` → plain `Layer.mergeAll(Database.layer, World.layer)` | 4 tests: `expected 2 to equal 1`, then 3, 4, 5 in Scenario order | `Creating a user` (legitimately reaches build 1) and the skip |
| B | `excludeTags: ["@wip"]` deleted | `Renaming a user` APPEARS and fails — `StepMatchError` / `UndefinedStep`, located at `…accounts.feature:24` | the other 5, and the skip |
| C | Clock pair's declaration order swapped in the `.feature`, no TypeScript touched | nothing | all 5 — each Scenario gets its own `TestEnv` regardless of order. **This one is supposed to stay green** |
| D | `@slow` → `@nobody-declared-this` on the `@REQ-EC-021` Scenario | nothing, no warning — the glob declared it. Positive control: `--tagsFilter` then selected exactly that Scenario | all 5 |
| D-b | `gherkinTags` glob pointed at `**/*.nothing`, leaving every `@REQ-EC-NNN` undeclared | nothing under `pnpm test`; `--tagsFilter='@REQ-EC-021'` errored in `createTagsFilter`, `Tests no tests` | all 5, exit 0, behind FOUR located `UndeclaredTag` warnings |

D-b's warning on the two-tag Scenario reads `carries 2 tag(s), at least one of which this project's vitest config does
not declare: "@REQ-EC-021", "@slow"` — naming the whole list and claiming only that at least one is undeclared.
`@slow` IS declared by hand, so that hedge is D-08's contract being precise rather than vague.

## Verification

| Gate | Result |
|------|--------|
| `pnpm test` | 34 files, 782 passed, 4 skipped (baseline 33 / 777 / 3 — +1 file, +5 passed, +1 skipped, none lost) |
| This pair, verbose | 5 passed, 1 skipped, **no** test titled `Renaming a user`, D-10 exclusion notice printed, no `UndeclaredTagWarning` |
| `pnpm verify:spec` | PASS 8, FAIL 0, SKIP 0 (`features -> traceability` was FAIL `undefined: @REQ-EC-019` before the rows landed) |
| `pnpm lint` | exit 0 (oxlint + dprint check) |
| `pnpm typecheck:test` | exit 0 |
| `pnpm build` | exit 0 |
| `pnpm verify:shared-layer-once` | ENFORCED |
| `pnpm verify:tags-filter` | ENFORCED |
| `pnpm verify:tsgo-gate` | ENFORCED |
| `pnpm verify:testapi-seam` | ENFORCED |
| `pnpm verify:no-runner-dep` | ENFORCED |
| `pnpm verify:oxlint-plugin` | ENFORCED |
| `pnpm verify:pack` | pack shape OK, publint clean |
| `pnpm circular` | no circular dependency |

Plan-specific criteria, checked mechanically: the `.feature` file carries exactly 4 `@REQ-EC-` occurrences, one each of
013/019/020/021, each on a different Scenario; `let`/`var` count in the step module after stripping comment lines is 0;
standalone `any` count is 0; `effect/testing/TestClock` import count is 1 and the `effect` barrel import count is 0;
the `@REQ-EC-021` Scenario line also carries `@slow`; the REQ-EC-019 row contains both `verify-shared-layer-once.sh`
and `SharedLayerConstraint.types.ts`; the REQ-EC-021 row contains `verify-tags-filter.sh`; section 5's rows are in
ascending order; `git diff --exit-code` on the `.feature` file is clean.

## Deviations from Plan

### Rule 1 — the plan's RUN-05 rationale is factually wrong and was not written down

Task 2's action asked the module doc comment to state that the `@REQ-EC-021` Scenario's proof is that it RUNS,
"because an undeclared tag would collapse the whole file to zero tests rather than failing this one test". Task 3 asked
the traceability row to say the same. Plan 11-01 measured that claim false, and mutation D-b re-measured it false for
this pair specifically: with every acceptance tag undeclared this file still produced 5 passed and 1 skipped and still
exited 0, behind four located warnings. Writing the plan's sentence would have violated AGENTS.md section 4. Both the
file and the row state the measured behaviour instead, name `scripts/verify-tags-filter.sh` for the half no in-process
test can carry, and explicitly decline to claim that a green tagged Scenario proves its tags reached the runner. The
section 5 preamble gained a paragraph saying this once for all rows.

### Rule 2 — the Background carries a second step

The plan specified a Background with `Given the database is empty`. It has that plus
`And the shared database was built once`, because the plan's own must-have truth requires EVERY Scenario in the Feature
to observe the shared build ordinal from inside its own step body, and a Background step is the only construct that
delivers that. Recorded as deviation 3 in the module doc comment. Mutation A quantifies what it bought.

### Rule 3 — `no-shadow` on the Feature-level step definition

The shared clock `Then` is registered at Feature level so both clock Scenarios match one definition. Destructuring
`Then` from the Feature dsl shadows the `Then` every `Scenario(...)` callback receives, and oxlint's
`eslint(no-shadow)` rejected it at four sites. Fixed by destructuring only `{ Background, Scenario }` and writing the
Feature-level registration as `dsl.Then(...)`, which also makes the scope difference visible at the call site.

### Rule 3 — the worktree had no `node_modules`

A fresh worktree, so `pnpm test` reported `vitest: command not found`. Resolved with
`pnpm install --frozen-lockfile`, which restores the committed lockfile's already-declared dependencies and adds no
package. No new dependency was introduced by this plan and `pnpm-lock.yaml` is unmodified, so no package-legitimacy
checkpoint applied.

### Process — the grep-forbids-explaining edge, hit for the fourth time

The plan's criterion counts the `effect` barrel-import literal in the step module and expects 0. The first draft's
"Imports" paragraph explained the translation by quoting the literal, which made the count 1. The paragraph was
reworded around the import rather than quoting it, and now says so. Same lesson as STATE.md 03-04, 10-01 and 10-02.

### TDD gate sequence

Tasks 1 and 2 are marked `tdd="true"`, and each scopes a single atomic change spanning the `.feature` and
`.steps.test.ts` together, so a separate `test(...)` commit ahead of a `feat(...)` one would have split one working
state in two. The RED was observed and recorded rather than committed: with the pair on disk and the section 5 rows
absent, `pnpm verify:spec` reported `FAIL | features -> traceability | undefined: @REQ-EC-019`; adding the four rows in
Task 3 turned it PASS. Same handling, and same reasoning, as 11-01.

### Not done, deliberately

`.planning/REQUIREMENTS.md`'s RUN-06 row is left `Pending`, per the repo convention 11-01 recorded: the plan that
closes a requirement end to end marks it, and RUN-06's structural proof
(`scripts/verify-acceptance-ref-state.sh`) is plan 11-05's. `.planning/` was not touched beyond this summary in any
case — this ran as a parallel worktree agent and the orchestrator owns shared-file writes. STATE.md and ROADMAP.md are
untouched.

## Notes for Future Plans

- **A tag written into an acceptance `.feature` file is declared by that act.** No `vitest.config.ts` edit is ever
  needed to add one, and no mutation confined to a `.feature` file can produce an undeclared tag. Breaking the glob is
  the only way to reach the D-08 path from this directory.
- **Assert the collected test count.** Re-confirmed for this pair by D-b: exit code 0 and 5 passing tests are both
  consistent with every tag in the file being invisible to the runner.
- **Put a shared-tier assertion in the Background** when a Feature has one. It converts a single-witness claim into a
  per-Scenario one for free, and mutation A shows the difference is a factor of four.
- **Initialise observation `Ref`s to a value the assertion cannot want.** `0` is a legal clock reading; `-1` is not.
- **Section 5's not-yet-carried list now reads `REQ-EC-001`–`REQ-EC-009` and `REQ-EC-014`–`REQ-EC-018`.** Eight of 22
  are carried. Update that sentence when the next plan lands tags.
- **`pnpm format` after touching `spec/traceability.md`** — dprint pads markdown table cells and `pnpm lint` runs
  `dprint check`.

## Known Stubs

None. Every Scenario asserts a value the library computed, and mutations A, B and D-b each turn a different subset of
them red. No hardcoded empty values, placeholder text, or unwired components were introduced.

## Threat Flags

None. No new network endpoints, auth paths, file access patterns, or trust-boundary schema changes. The one new file
read is a committed fixture resolved relative to `import.meta.url`, inside the test tree. All four registered threats
have a measured mitigation: T-11-02-01 by the last Scenario's count assertion (mutation A's siblings), T-11-02-02 by
the clock pair plus mutation C, T-11-02-03 by the collected-count criterion plus mutation D-b, T-11-02-04 by every
tagged Scenario asserting a library-computed value.

## Self-Check: PASSED

Files verified present on disk:

- FOUND: `packages/vitest/test/acceptance/worked-example-02-accounts.feature`
- FOUND: `packages/vitest/test/acceptance/worked-example-02-accounts.steps.test.ts`
- FOUND: `spec/traceability.md`

Commits verified in `git log`:

- FOUND: `152679d` feat(11-02): run the shared-Layer worked example as a real acceptance pair
- FOUND: `bf9450f` feat(11-02): prove per-Scenario TestClock isolation on the shared-Layer path
- FOUND: `1d6e3b3` docs(11-02): trace four more requirements and record the accounts mutations

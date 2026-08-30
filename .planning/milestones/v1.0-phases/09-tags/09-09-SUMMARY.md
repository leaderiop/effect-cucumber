---
phase: 09-tags
plan: 09
subsystem: spec
tags: [spec-reconciliation, adr, supersession, traceability, requirements, roadmap, readme, tags, RUN-05, honesty]

# Dependency graph
requires:
  - phase: 09-tags
    provides: "09-02's Tags.ts/Errors.ts, 09-04's emission seam and the AfterAllScenarios runnable-count conjunct, 09-05's DescribeFeatureOptions and catch-and-degrade adapter, 09-06's runtime acceptance and the D-10 onEmitted fix, 09-07's gherkinTags/tinyglobby and the barrel, 09-08's CLI gate"
  - phase: 08-rules-and-outlines
    provides: "BEH-EC-018's Rule-scoped hook composition, which BEH-EC-017's stale prohibition contradicted"
provides:
  - "spec/decisions/026-registration-time-tag-filtering-and-declared-tag-universe.md — ADR-EC-026, superseding ADR-EC-020"
  - "spec/decisions/020-vitest-native-tags-for-skip-only.md — a status banner naming exactly which parts no longer hold, body untouched"
  - "spec/behaviors/02-shared-layers-and-tags.md — BEH-EC-008 as three REQUIREMENT blocks describing what shipped, plus a compiling-shaped worked example with a gherkinTags config snippet and an excludeTags fourth argument"
  - "spec/behaviors/07-hook-ordering-and-guarantees.md — BEH-EC-017's AfterAllScenarios carve-out, and its Rule-hook prohibition replaced by a pointer to BEH-EC-018"
  - "spec/roadmap.md, packages/vitest/README.md, packages/vitest/src/index.ts — no document in the repo now calls tag routing unbuilt"
  - "packages/vitest/src/Errors.ts — UndeclaredTagWarning's message and its tags field's documented meaning, corrected so a declared tag is no longer reported as undeclared"
  - ".planning/REQUIREMENTS.md — RUN-05 rewritten and marked Complete"
affects:
  - "Phase 10 (shared Layer) — spec/roadmap.md and packages/vitest/README.md now name it as the ONLY remaining unbuilt item on this package"
  - "any future reader of BEH-EC-008 — the MUST-level text now matches the code, so it can be read as normative again"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Superseding an ADR by writing the new one and marking the old in place with a banner that enumerates which clauses died and which survived, so the superseded reasoning stays readable"
    - "Fixing a misleading report in its WORDING rather than its DATA, when the honest data is unobtainable without taking on a dependency the design deliberately refuses"
    - "Pinning a corrected message claim with an assertion that both requires the new phrasing and forbids the old one, so a revert fails by name rather than only by length"

key-files:
  created:
    - spec/decisions/026-registration-time-tag-filtering-and-declared-tag-universe.md
  modified:
    - spec/decisions/020-vitest-native-tags-for-skip-only.md
    - spec/decisions/index.yaml
    - spec/behaviors/02-shared-layers-and-tags.md
    - spec/behaviors/07-hook-ordering-and-guarantees.md
    - spec/traceability.md
    - spec/roadmap.md
    - packages/vitest/README.md
    - packages/vitest/src/index.ts
    - packages/vitest/src/Errors.ts
    - packages/vitest/src/describeFeature.ts
    - packages/vitest/test/Errors.test.ts
    - packages/vitest/test/emission.test.ts
    - .planning/REQUIREMENTS.md

key-decisions:
  - "ADR-EC-020 is SUPERSEDED rather than amended: the CLI-only filtering clause is a different design question from the one this phase answered, and requirement-id-scheme.md reserves an amendment for a narrowing of the same question"
  - "ADR-EC-020's status banner replaces its `Status: Accepted` line — one line changed, zero deletions in the body — because leaving `Accepted` standing on a superseded ADR is itself a stale claim"
  - "BEH-EC-008 became THREE REQUIREMENT blocks rather than one longer one: emission, registration filtering, and the declaration prerequisite are three separately testable contracts"
  - "The AfterAllScenarios change is stated as a CARVE-OUT on the existing guarantee, with all three 'regardless of' clauses left verbatim, because what D-09 guarantees is that a FAILURE cannot stop teardown and that is untouched"
  - "The UndeclaredTagWarning over-report was fixed here rather than flagged onward, because Task 2 was writing a MUST-level sentence about that warning and would otherwise have enshrined the misleading output as the spec"
  - "spec/roadmap.md's Current-state paragraph carries the honest cost of the tag work (a config declaration per consumer, a degradation path, one runtime dependency) since the Planned entry ADR-EC-020 refers to does not exist in this document"

patterns-established:
  - "Reconciling a phase by writing the new normative text FIRST and then letting it dictate which code claims have to become true, rather than the reverse"

# Requirements
requirements-completed: [RUN-05]
requirements-advanced: []

# Metrics
duration: 40min
completed: 2026-08-30
---

# Phase 9 Plan 09: Spec Reconciliation Summary

**`spec/` no longer forbids the registration filter it ships, no longer promises a bare CLI flag, and no longer calls tag routing unbuilt: ADR-EC-026 supersedes ADR-EC-020 without rewriting a line of it, BEH-EC-008 became three MUST-level blocks that match the code, BEH-EC-017 states its one carve-out, RUN-05 is Complete — and the reconciliation turned up two live contradictions the plan had not scoped, one of which was a misleading warning telling developers to declare tags that were already declared.**

## Performance

| Metric | Value |
|---|---|
| Duration | ~40 min (01:12 → 01:52, 2026-08-30) |
| Tasks | 3 of 3, plus one out-of-scope fix carried in a fourth commit |
| Files created | 1 |
| Files modified | 13 |
| Repo test count | 741 passed + 3 skipped → **742 passed + 3 skipped** (+1) |

## Task Commits

1. **Task 1: ADR-EC-026 written, ADR-EC-020 marked superseded** — `ab30c08` (docs)
2. **Task 2: BEH-EC-008 and BEH-EC-017 amended, worked example updated** — `945364f` (docs)
3. **Task 3: status documents and RUN-05** — `211647b` (docs)
4. **`UndeclaredTagWarning` over-report fixed** — `ccbff5b` (fix) — see Deviations

## The full gate set, one by one

Every command in Task 3's verify line, run at `ccbff5b`:

| Gate | Result |
|---|---|
| `pnpm test` | exit 0 — 32 files, **742 passed + 3 skipped (745)** |
| `pnpm lint` (oxlint + dprint check) | exit 0 |
| `pnpm circular` | exit 0 — no circular dependency found (33 files) |
| `pnpm typecheck:test` | exit 0, both projects |
| `pnpm build` | exit 0 |
| `pnpm verify:tsgo-gate` | exit 0 — `tsgo gate: ENFORCED`, 13 assertions |
| `pnpm verify:oxlint-plugin` | exit 0 — `oxlint effect plugin: ENFORCED` |
| `pnpm verify:no-runner-dep` | exit 0 — `ENFORCED` |
| `pnpm verify:testapi-seam` | exit 0 — `ENFORCED`, three `✓` lines |
| `pnpm verify:tags-filter` | exit 0 — `tag filter gate: ENFORCED`, 9 `✓` lines |
| `pnpm verify:pack` | exit 0 — `pack shape: OK`, publint clean, both packages |
| `pnpm verify:spec` | **PASS 7, FAIL 0, SKIP 1** — 26 ADRs traced, 271 links resolve |

## The invariant finding

**No invariant in `spec/invariants.md` needed amending, and that is a finding rather than a silence** — AGENTS.md §1 names the invariant explicitly, so "there is none to change" has to be said out loud.

- **Nothing in `invariants.md` mentions tags at all.** `grep -n 'BEH-EC-008\|tag\|Tag'` over the file returns zero hits. BEH-EC-008 constrains no invariant, which is also why its `> **Invariant:**` line has never existed while BEH-EC-005's and BEH-EC-006's do.
- **INV-EC-004 is about the per-Scenario `After` hook, not `AfterAllScenarios`.** Its text is "A Scenario's `After` hook executes whether every step in that Scenario succeeded or one of them failed", and its Source paragraph names `Effect.onExit` around one composed Scenario Effect. BEH-EC-017's carve-out is about whether a Feature-level teardown NODE is emitted when no Scenario was attempted — a different mechanism at a different level. INV-EC-004's two `BEH-EC-017` references are cross-links to the full ordering, not dependencies on the clause that changed.

## The exact new requirement text

Recorded verbatim so a future reader can diff intent against wording.

### BEH-EC-008 — now three blocks where there was one

```
REQUIREMENT: Every tag on a Scenario (including inherited Feature/Rule/
             Examples tags) MUST be emitted as a native vitest tag on the
             generated it.effect call, keeping the literal @ prefix it
             carries in the .feature file. A Scenario tagged @skip MUST
             additionally compile to it.effect.skip instead of it.effect.
             A Scenario tagged @only MUST NOT compile to it.effect.only
             (vitest fails CI on any committed .only) — @only is emitted as
             a plain tag only; running just that Scenario is a caller-side
             `vitest --tagsFilter '@only'` choice, not something the library
             forces onto every run.
```

```
REQUIREMENT: includeTags and excludeTags, on describeFeature's optional
             fourth argument, MUST act as a registration filter — filtering
             at REGISTRATION time, so a Scenario the filter excludes never
             becomes a test and is ABSENT from the report rather than
             present in it as skipped. Both MUST accept a plain array of tag
             strings, never vitest's boolean tag-expression grammar, and
             undefined and an empty array MUST both mean NO FILTER, so a
             computed-empty array can never silence a suite. Native vitest
             tag filtering (--tagsFilter) MUST continue to work
             independently on whatever was registered, reporting
             non-matching tests as skipped rather than removing them: the
             registration filter and the CLI filter COMPOSE, and neither
             replaces the other.
```

```
REQUIREMENT: Every emitted tag MUST be DECLARED in the runner's config — a
             --tagsFilter pattern is validated against that declaration list
             regardless of the runner's strict-tags setting. A tag that is
             not declared MUST NOT fail the Feature: the library MUST catch
             the runner's rejection, re-emit the test UNTAGGED so the
             Scenario still runs, and print one located warning naming the
             .feature file, the Scenario and every tag that Scenario carried
             — the Scenario's tags then do not exist for the runner, so no
             --tagsFilter can select it. That warning MUST claim only that
             AT LEAST ONE of the listed tags is undeclared, never that all
             of them are: the runner rejects a tag array as a unit and names
             the offenders only in its own message text, which the library
             deliberately does not read. gherkinTags, a config-time helper
             taking a GLOB PATTERN (or an array of patterns) over the
             consumer's own .feature files, is the supported way to generate
             those declarations.
```

The deleted sentence, for the record: *"excludeTags-style filtering MUST be implemented as native vitest tag filtering (--tagsFilter), not a describeFeature-time registration filter."* The `> **See:**` line now names both ADRs, with ADR-EC-020 marked `(superseded)`.

### BEH-EC-017 — the carve-out, inserted inside the existing guarantee block

```
               AfterAllScenarios runs once, after every Scenario in the
               Feature has been ATTEMPTED, regardless of whether
               BeforeAllScenarios succeeded, whether any Scenario's hooks or
               steps failed, or whether any earlier After/AfterStep hook
               failed.

               ONE CARVE-OUT applies to AfterAllScenarios, and only to the
               case where NO Scenario was attempted at all — every Scenario
               in the Feature skipped (@skip) or removed by a registration
               filter (includeTags/excludeTags), or the Feature declaring no
               Scenarios in the first place. In that case the node MUST NOT
               be emitted: BeforeAllScenarios is reachable only from inside
               a Scenario's body, so it structurally CANNOT have run, and an
               AfterAllScenarios node would tear down resources nothing ever
               set up. This carves the VACUOUS case out of the guarantee; it
               does not weaken it. All three "regardless of" clauses above
               are unchanged, because what they are about is a FAILURE being
               unable to stop teardown — and a failing Scenario was still
               attempted, so it still emits the node.
```

All three original "regardless of" clauses survive verbatim; the only edit inside them is `attempted` → `ATTEMPTED`, which the carve-out then leans on.

## The corrected story on T-09-05-02

Plan 09-05's summary marked T-09-05-02 **Done** with the claim *"A stale `excludeTags` hiding a whole Feature can no longer sit behind a green run."* **That claim did not hold when it was written.** 09-06 measured that vitest DEFERS a `describe` factory, so `describeFeature` read `emitFeature`'s returned count before the emission walk had run: the count was always `0`, the `> 0` guard never opened, and the notice **never printed — not late, never**. The claim became true only at 09-06's `fee956c`, which moved the notice onto an `onEmitted` callback fired inside the walk.

Everything this plan wrote about the exclusion notice describes the POST-fix behaviour and cites the mechanism that makes it work, not 09-05's superseded intermediate claim. Specifically:

- BEH-EC-008's second block asserts the ABSENT-versus-skipped distinction and the compose property, both of which `scripts/verify-tags-filter.sh` observes from outside the process — it does not restate the notice as a claim about the return value.
- `spec/roadmap.md` and `packages/vitest/README.md` both describe the summary line as printed "when the filter removed anything", which is what the callback-fired guard actually does.
- ADR-EC-026 does not mention the return value at all. `Runner.ts` note (h) remains the single place that records the retained-but-unsafe `EmitOutcome`, which is where a reader who needs it will look.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] `UndeclaredTagWarning` reported declared tags as undeclared**

- **Found during:** Task 2, writing BEH-EC-008's declaration-prerequisite block
- **Issue:** `Errors.ts` documented `tags` as *"the OFFENDING tags … not the Scenario's whole tag list"*, while `describeFeature.ts`'s adapter passes `options.tags` — the whole list. The rendered message read `carries 2 tag(s) this project's vitest config does not declare: "@featuretag", "@mutation-undeclared-tag"` when `@featuretag` **is** declared. A developer following it would go and declare a tag that was already declared. 09-06 recorded this as a finding for the phase owner and put it out of every prior plan's file set.
- **Why fixed here rather than flagged onward:** Task 2's job was to write a MUST-level sentence about exactly this warning. Wording it around the defect would have made the misleading output normative, which is the failure mode this whole plan exists to remove.
- **Fix:** the WORDING changed, not the data — the data cannot change honestly. The runner rejects a `tags` array as a UNIT and names the offenders only in its own message text, and `describeFeature.ts`'s adapter discriminates the catch STRUCTURALLY, by outcome, precisely so an upstream wording change cannot silently disable the degradation (09-05's decision, `note (e)`). Computing the offending subset would require taking on the exact dependency the design refuses. So the message now reads `carries N tag(s), at least one of which this project's vitest config does not declare: …` and closes with `Declare the missing ones under test.tags`. `Errors.ts`'s field doc and type note now say the field is the whole tag list and why the subset is unobtainable; `describeFeature.ts` and `index.ts` doc comments follow; `emission.test.ts`'s recorded-defect paragraph records the fix and why its probe Scenario still carries exactly one tag; BEH-EC-008 states the "at least one" constraint at MUST level.
- **Files modified:** `packages/vitest/src/Errors.ts`, `packages/vitest/src/describeFeature.ts`, `packages/vitest/src/index.ts`, `packages/vitest/test/Errors.test.ts`, `packages/vitest/test/emission.test.ts`, `spec/behaviors/02-shared-layers-and-tags.md`
- **Verification:** a new `Errors.test.ts` assertion both REQUIRES `"at least one of which"` and FORBIDS the old `"tag(s) this project's vitest config does not declare"` substring, so a revert fails by name and not only on the length constant. The exact-length constant moved `1361 → 1396`. Mutation-proven: restoring the old wording in `Errors.ts` failed exactly two assertions (the new one and the length one) and nothing else; reverted from a byte copy and re-confirmed at 44/44.
- **Commit:** `ccbff5b`

**2. [Rule 1 — Bug] BEH-EC-017 forbade the Rule-scoped hooks Phase 8 shipped**

- **Found during:** Task 2, reading BEH-EC-017's requirement blocks
- **Issue:** BEH-EC-017's last block read *"There is no Rule-scoped hook narrowing in this milestone … there is no mechanism to register a hook visible only inside one Rule."* Phase 8 shipped exactly that mechanism, `mergeHookSets` and all, and **BEH-EC-018 in `spec/behaviors/03` already specifies its composition order**. So two behavior documents contradicted each other at MUST level, and one of them contradicted the code — the same class of defect as this plan's headline, from a different phase.
- **Fix:** the block now says a Feature-dsl hook applies to every Scenario including Rule-nested ones, that a Rule's dsl additionally accepts the four Scenario-scoped kinds, and that `BeforeAllScenarios`/`AfterAllScenarios` stay Feature-only and are a compile error on a Rule's dsl — with the composition ORDER delegated to BEH-EC-018 rather than restated, since two copies of an ordering rule is how two copies start disagreeing.
- **Files modified:** `spec/behaviors/07-hook-ordering-and-guarantees.md`
- **Commit:** `945364f`

**3. [Rule 1 — Bug] `packages/vitest/src/index.ts` still listed Phase 8's work as unbuilt**

- **Found during:** Task 3
- **Issue:** the barrel's "What is NOT built yet" paragraph read *"a `Rule` that extends the ambient Layer …, and typed `Scenario Outline` Examples, are Phase 8 (DSL-05, DSL-06) — … nothing can REGISTER at Rule scope"*. Both are built; `verify:tsgo-gate` assertions 12 and 13 prove the Rule-scoped compile boundary on every push. This is a status claim in the same category as the two the plan does name, so leaving it while removing theirs would have been arbitrary.
- **Fix:** the paragraph now names only Phase 10's `shared` Layer as unbuilt and states what Phase 8 delivered.
- **Files modified:** `packages/vitest/src/index.ts`
- **Commit:** `211647b`

**4. [Rule 2 — Say only what is true] `spec/behaviors/02`'s header claimed the vitest package does not exist**

- **Found during:** Task 2
- **Issue:** the file opened with *"Pre-implementation: `@effect-cucumber/vitest` doesn't exist yet … reference material, not a compiled example."* Task 2's own acceptance criteria require the worked example to be treated as a compiled `typescript` fence per AGENTS.md §2, so the header contradicted the task.
- **Fix:** replaced with the `spec/roadmap.md` pointer that `spec/behaviors/07` already uses, plus one sentence recording what the removed note said and why it is gone.
- **Files modified:** `spec/behaviors/02-shared-layers-and-tags.md`
- **Commit:** `945364f`

**5. [Rule 2 — Say only what is true] `spec/roadmap.md`'s vitest test-file count was stale**

- **Found during:** Task 3
- **Issue:** the "Unit tests" gate row said `packages/vitest` has **twelve** `test/*.test.ts` files and enumerated them. It has **fourteen** — this phase added `Tags.test.ts` (09-02) and `GherkinTags.test.ts` (09-07) — plus a type-check-only `.types.ts` the row did not mention. Directly caused by this phase, so squarely in scope.
- **Fix:** count and enumeration corrected; `GherkinTags.types.ts` named.
- **Files modified:** `spec/roadmap.md`
- **Commit:** `211647b`

### Criterion corrections

**6. `git diff --numstat` on ADR-EC-020 shows 1 deletion, not the criterion's 0**

The criterion asks for zero deletions on the superseded ADR, to assert the body was marked rather than rewritten. The diff is **1 insertion, 1 deletion, on line 3 only** — the `> **Status:** Accepted` line becoming `> **Status:** Superseded by [ADR-EC-026](…) — …`. That is ADR-EC-015's precedent form exactly, and the criterion's literal wording is unreachable with it: an ADR cannot carry two Status lines, and leaving `Accepted` standing on a superseded decision is itself a stale claim under AGENTS.md §4. The criterion's real claim — the Context, Decision and Consequences sections are untouched — holds exactly: `git diff -U0` shows a single hunk at `@@ -3 +3 @@` and nothing else.

**7. `spec/roadmap.md`'s Planned section has no "custom, non-reserved tags" entry to amend**

Task 3 asks to amend that entry, citing ADR-EC-020's claim that the roadmap "already parked" it. `grep -in 'custom' spec/roadmap.md` finds it in three places, none of them a Planned bullet — the four Planned bullets are reusable step definitions, the unreferenced-Examples-column fallback, Scenario-level retries, and the ADR-EC-009 lint rule. The entry ADR-EC-020 refers to is not in this document. No fake bullet was invented to satisfy the instruction. The instruction's SUBSTANCE — restating "at effectively no extra design cost" with the real cost — was delivered in the two places the claim can honestly be corrected: **ADR-EC-026's `Trade-off accepted`**, which names the claim as wrong and prices it at a config-time declaration per consumer, a degradation path and one added runtime dependency; and **`spec/roadmap.md`'s new Current-state paragraph**, which names the same three costs beside the capability. T-09-09-02 is covered.

**8. `spec/traceability.md` §1's behavior-02 row could not take the literal phrasing either**

The criterion asks the parenthetical to become "the first seven are real; `SharedLayer` remains planned (Phase 10)", and the stale `remain planned (Phases 9/10)` string it targets was already removed by plan 09-05. The row's module list also is not ordered so that a "first seven" cut is meaningful. Written instead as **"every one except `SharedLayer` is real"**, with `SharedLayer` moved to the end of the list and `GherkinTags` added, which is the same claim without an index that goes wrong the next time a module is inserted. The criterion's greppable half holds: `grep -c 'remain planned (Phases 9/10)'` is **0**, and the row names both `Tags` and `GherkinTags` among the real modules.

### Blocking-issue fixes

**9. [Rule 3 — Blocking] ADR-EC-026 had to be added to `spec/traceability.md` in Task 1, not Task 3**

`spec/scripts/verify-traceability.sh` check 3 requires every ADR file on disk to have its `ADR-EC-NNN` present in `traceability.md`. Task 1's verify line is `pnpm verify:spec`, so creating the file without the §3 row would have failed Task 1's own gate. The row was added in `ab30c08`, together with the `(**Superseded by ADR-EC-026**)` marker on ADR-EC-020's row, mirroring how ADR-EC-015's row already carries its own. `spec/traceability.md` is in the plan's `files_modified`, so this is a task-boundary correction rather than a scope change.

**10. [Rule 3 — Blocking] `pnpm install` to populate the worktree's missing `node_modules`**

This parallel executor spawned into a fresh worktree with no installed dependencies — the same condition plans 09-04 through 09-08 each record. `pnpm install --frozen-lockfile`: the committed lockfile restored verbatim, **no package added, removed or resolved to a new version**, so Rule 3's package-legitimacy exclusion does not apply. `git status` clean of any manifest or lockfile change at every commit.

**11. [Rule 3 — Blocking] Worktree base was behind the plan's stated base commit**

The worktree spawned with a merge-base of `f640f4a`, an ancestor of the required base `f892111` ("docs(phase-09): update tracking after wave 5") by the whole project history. `git reset --hard f892111`, per the spawn instructions' base-correction step, after the HEAD assertion confirmed the branch was `worktree-agent-ab7bc5c5d0beb28ac` — in the `worktree-agent-*` namespace and not a protected ref. The working tree was clean, so nothing was discarded.

**12. [Rule 3 — Blocking] `dprint` reformatted two markdown files after the Task 3 edits**

`pnpm lint` failed with "Found 2 not formatted files" — `spec/traceability.md` and `spec/roadmap.md`, both from lengthened table cells and a rewrapped paragraph. `pnpm exec dprint fmt`, the repo's own formatter with the repo's own config; no content changed. This is the identical deviation plans 09-05 and 09-07 each recorded, from the identical cause.

## Threat Model Coverage

| Threat ID | Disposition | Status |
|---|---|---|
| T-09-09-01 | mitigate | **Done.** BEH-EC-008's forbidding sentence is gone; `grep -c 'registration filter'` is 2 and both occurrences describe the shipped behaviour (`MUST act as a registration filter`, and `the registration filter and the CLI filter COMPOSE`). `pnpm verify:spec` gates the set at PASS 7 / FAIL 0. A SECOND MUST-level contradiction was found while doing it and fixed — see deviation 2. |
| T-09-09-02 | mitigate | **Done.** `grep -c 'Phase 9' packages/vitest/README.md` is **0**; `grep -in 'not built\|intended contract only'` over `spec/roadmap.md` and the README returns exactly two lines, both naming only the Phase 10 shared Layer. The "no extra design cost" claim is restated with its real cost in ADR-EC-026's `Trade-off accepted` and in the roadmap's Current-state paragraph — see criterion correction 7 for why not in a Planned bullet. A third stale status claim, in `index.ts`, was found and fixed (deviation 3). |
| T-09-09-03 | mitigate | **Done.** ADR-EC-026 is the next free id (`decisions/` ended at 025) and is APPENDED to `index.yaml` after ADR-EC-025, never inserted. ADR-EC-020 keeps its number and its body: `git diff -U0` is one hunk at line 3. `verify:spec` reports 26 index entries resolving and 26 ADRs traced, so index ↔ disk ↔ traceability agree in all three directions. |
| T-09-09-04 | mitigate | **Done.** The worked example is still a `typescript` fence, now with `expect` imported from `vitest` (it was used and never imported before), the `excludeTags: ["@wip"]` fourth argument in place with a matching `@wip` Scenario in the `.feature` source, and a second `typescript` fence carrying the runner config with a literal `gherkinTags("features/**/*.feature")` spread into `test.tags`. The literal string matches `GherkinTags.types.ts`'s own compiled call byte for byte. The `loadFeature` import stays as `spec/behaviors/01`'s reconciliation left it — the barrel does not export ADR-EC-024's wrapper yet, and the fence's leading comment says so rather than implying otherwise. |
| T-09-09-05 | mitigate | **Done.** The invariant finding is recorded explicitly above, with the two greps and the INV-EC-004 reading that make "there is none to change" a conclusion rather than an omission. |
| T-09-09-06 | mitigate | **Done.** `grep -c 'tinyglobby'` on ADR-EC-026 is **2**: Decision bullet 6 names it with `globSync`, the synchronous-config-load reason and both rejected alternatives, and the second Negative consequence names the added runtime dependency as a cost to a consumer's install graph. The `Trade-off accepted` names it a third time as one of the three real costs. |
| T-09-09-SC | accept | **Done.** This plan installed nothing. `pnpm install --frozen-lockfile` only restored the committed lockfile; `git status` shows no `package.json` and no `pnpm-lock.yaml` change at any of the four commits. `pnpm verify:pack` and `pnpm verify:no-runner-dep` both pass unchanged. |

## Threat Flags

None. This plan opens no network endpoint, no auth path, no file-access pattern and no schema at a trust boundary. Deviation 1 touches a message string that reaches a terminal, and it narrows rather than widens: every author-controlled component still goes through `JSON.stringify` (`Errors.ts` note (f)), and `Errors.test.ts`'s forging-tag assertion is unchanged and still green.

## Known Stubs

None. Every claim written into `spec/` in this plan describes code that exists and is asserted by a committed test or gate. The one forward-looking statement — `spec/behaviors/02`'s worked example importing `loadFeature` from the vitest barrel — is explicitly labelled in the fence as ADR-EC-024's planned wrapper that is not yet exported, following the identical treatment `spec/behaviors/01` already carries.

## Requirements

**RUN-05 is COMPLETE**, and this is the plan that could mark it. 09-06 completed the runtime acceptance and 09-08 gated the CLI-observable half, but both summaries deferred the mark for the same stated reason: AGENTS.md §1 makes a code change not reflected in `spec/` incomplete, and `spec/behaviors/02`'s MUST-level text still forbade what shipped. That is now false, so the deferral is discharged.

`.planning/REQUIREMENTS.md`'s RUN-05 entry is ticked and its status row reads Complete. Its text no longer implies a bare CLI flag: it names the declaration prerequisite, the degradation path, `gherkinTags`, and the `includeTags`/`excludeTags` addition, and cites ADR-EC-026 alongside BEH-EC-008.

## Notes for the phase owner

- **`STATE.md` and `ROADMAP.md` were deliberately not touched.** This executor ran in a worktree and the orchestrator owns those writes after the wave. `.planning/REQUIREMENTS.md` WAS touched, because the plan assigns RUN-05's mark to this plan and the spawn instructions name REQUIREMENTS.md as committed by the worktree executor.
- **`spec/roadmap.md`'s "Doc-examples compile check | Not wired" row is still accurate**, and it is now the only thing standing between BEH-EC-008's worked example and being genuinely compiled rather than carefully written. The example was updated to import everything it uses, so wiring that check is a smaller job than it was this morning — but `loadFeature` from the vitest barrel (ADR-EC-024) will fail it until that wrapper ships.
- **ADR-EC-026's Decision bullets are numbered in the plan's order and unnumbered in the file**, as list items. All six are present and each is its own bullet.
- **The one thing this plan changed in shipped output** is the `UndeclaredTagWarning` message. Any consumer-facing changelog for this phase should mention it.

## Self-Check: PASSED

The created file exists on disk:

- `spec/decisions/026-registration-time-tag-filtering-and-declared-tag-universe.md` — FOUND

All thirteen modified files exist on disk:

- `spec/decisions/020-vitest-native-tags-for-skip-only.md` — FOUND
- `spec/decisions/index.yaml` — FOUND
- `spec/behaviors/02-shared-layers-and-tags.md` — FOUND
- `spec/behaviors/07-hook-ordering-and-guarantees.md` — FOUND
- `spec/traceability.md` — FOUND
- `spec/roadmap.md` — FOUND
- `packages/vitest/README.md` — FOUND
- `packages/vitest/src/index.ts` — FOUND
- `packages/vitest/src/Errors.ts` — FOUND
- `packages/vitest/src/describeFeature.ts` — FOUND
- `packages/vitest/test/Errors.test.ts` — FOUND
- `packages/vitest/test/emission.test.ts` — FOUND
- `.planning/REQUIREMENTS.md` — FOUND

All four commits are present in `git log`:

- `ab30c08` — FOUND
- `945364f` — FOUND
- `211647b` — FOUND
- `ccbff5b` — FOUND

No commit in this plan deleted a tracked file (`git diff --diff-filter=D --name-only HEAD~1 HEAD` empty at each). The one mutation performed (deviation 1's message-wording revert) was restored from a byte copy taken before mutating, confirmed by `grep` and by `Errors.test.ts` returning to 44/44, and `git status` was clean before the commit.

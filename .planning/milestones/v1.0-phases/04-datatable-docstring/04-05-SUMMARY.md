---
phase: 04-datatable-docstring
plan: 05
subsystem: spec
tags: [spec-reconciliation, adr, behavior, traceability, verify-pack, adr-ec-021, datatable, docstring]

# Dependency graph
requires:
  - phase: 04-datatable-docstring
    plan: 01
    provides: "The pinned argumentIndex facts (1/2 in source order, key-present/value-undefined for a single argument) and the F32 duplicate-header fixture that ADR-EC-025's Verified-not-assumed section cites"
  - phase: 04-datatable-docstring
    plan: 02
    provides: "DataTable.ts module doc notes (b) and (c) — the source text for ADR-EC-025 decision 1 and ADR-EC-008's correction — plus DataTableError's closed four-member union"
  - phase: 04-datatable-docstring
    plan: 03
    provides: "decodeHashes and the schema-issue-pin test that holds the Pointer-path fact"
  - phase: 04-datatable-docstring
    plan: 04
    provides: "StepArguments.ts module doc note (b), the barrel surface BEH-EC-016's Signatures section lists, and the deferred-items.md entry for the verify-pack gate"
provides:
  - "ADR-EC-025: the accessor-totality, error-class and argument-order decisions, with their rejected alternatives and a Verified-not-assumed section naming each pin test"
  - "BEH-EC-016: the normative DataTable/DocString contract, with a type-checked typescript worked example"
  - "ADR-EC-008's superseded worked example marked in place, zero deletions"
  - "spec/traceability.md §1, §3 and §4 rows joining the new behavior, decision and three test files"
  - "A verify-pack.sh gherkin gate that enforces ADR-EC-021 instead of the superseded ADR-EC-015, mutation-proven on all four assertions"
affects: [05-registration-dsl, 06-step-registration-and-matching]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "A superseded ADR passage is marked in place with a dated correction blockquote, never rewritten — git diff --numstat must show zero deletions"
    - "A forward link lands in the same commit as the file it points at, for the same reason a registry entry does"
    - "A structural gate assertion is mutation-tested before it is trusted, including its positive control"

key-files:
  created:
    - spec/decisions/025-datatable-wrapper-accessor-contract.md
    - spec/behaviors/06-datatable-and-docstring-arguments.md
  modified:
    - spec/decisions/index.yaml
    - spec/decisions/008-data-tables-and-doc-strings-decode-through-schema.md
    - spec/behaviors/index.yaml
    - spec/behaviors/05-step-matching-and-parameter-types.md
    - spec/traceability.md
    - spec/roadmap.md
    - packages/gherkin/README.md
    - .planning/REQUIREMENTS.md
    - scripts/verify-pack.sh
  deleted:
    - .planning/phases/04-datatable-docstring/deferred-items.md

key-decisions:
  - "ADR-EC-025 implements ADR-EC-008 rather than superseding it: the Decision (decode through Schema) is unchanged and now true in code; only its worked example was stale"
  - "The argumentIndex trap is recorded the correct way round in both documents: the key is ALWAYS present and only its value is undefined for a single-argument step, so a key-presence test discriminates nothing"
  - "ADR-EC-025's forward link to BEH-EC-016 was deferred to Task 2's commit, so no intermediate commit carries a broken relative link — check 5 stayed green throughout"
  - "The three Phase 4 test files were RE-POINTED from BEH-EC-014 to BEH-EC-016 rather than added: 04-04 had already parked them against the closest existing behavior because no data-table behavior doc existed yet"
  - "verify-pack.sh's replacement gate carries a POSITIVE assertion (effect must BE a peer) alongside the two negative ones — without it, a manifest that dropped effect entirely would pass by declaring nothing"
  - "The verify-pack rule mirrors verify-no-runner-dep.sh's peerOnly/neverAllowed split exactly, so the source manifest and the packed artifact are held to one rule rather than two that can drift"

patterns-established:
  - "A behavior doc's typescript fence is type-checked against the real barrel before commit, via a throwaway tsconfig in packages/vitest — the planned doc-examples check, run by hand until it is wired"
  - "A from-disk cross-check runs in BOTH directions: a test file missing from §4, and a §4 row naming a file that no longer exists"

requirements-completed: [PARSE-04]

# Metrics
duration: 21min
completed: 2026-08-29
---

# Phase 4 Plan 05: Spec Reconciliation Summary

**`spec/` now describes the DataTable wrapper that actually shipped: ADR-EC-025 records the three design decisions that lived only in source doc comments, BEH-EC-016 states the contract normatively, ADR-EC-008's stale worked example is marked in place with zero deletions, and the `verify:pack` gate stopped enforcing an ADR that was superseded four commits before Phase 4 opened.**

## Performance

- **Duration:** ~21 min
- **Started:** 2026-08-28T23:56Z
- **Completed:** 2026-08-29T00:11Z
- **Tasks:** 3, plus one additional-scope fix
- **Files modified:** 12 (2 created, 9 modified, 1 deleted)

## Task Commits

Base commit for all four: `70f6664`.

1. **Task 1: ADR-EC-025, its index entry, and ADR-EC-008's in-place correction** — `0e4968b` (docs)
2. **Task 2: BEH-EC-016, its index entry, and behavior 05's `_Next:` footer** — `6a530f6` (docs)
3. **Task 3: traceability, roadmap, README status, PARSE-04** — `591bfae` (docs)
4. **Additional scope: `verify-pack.sh` enforces ADR-EC-021, not ADR-EC-015** — `90fc19b` (fix)

## Verification

| Gate | Result |
|------|--------|
| `pnpm verify:spec` | exit 0 — **PASS 7 / FAIL 0 / SKIP 1**, 233 relative links resolve |
| `pnpm lint` | exit 0 (oxlint + dprint) |
| `pnpm test` | exit 0 — 404 passed / 17 files, unchanged from baseline |
| `pnpm build` | exit 0 |
| `pnpm typecheck:test` | exit 0 |
| `pnpm circular` | exit 0 — no circular dependency |
| `pnpm verify:no-runner-dep` | exit 0 — ENFORCED, unaffected by the verify-pack change |
| `pnpm verify:pack` | **exit 0** — red since `f5d84eb`, green for the first time in Phase 4 |

This plan is documentation-plus-one-gate-script only. `pnpm test` and `pnpm build` are byte-for-byte the same verdict as at the base commit (404 passed / 17 files), which is what the plan required of them. Threat T-04-SC: zero dependencies added — `git diff 70f6664 HEAD -- pnpm-lock.yaml` is empty.

## Recorded outputs the plan asked for

### `git diff --numstat` for ADR-EC-008 (threat T-04-12)

```
28	0	spec/decisions/008-data-tables-and-doc-strings-decode-through-schema.md
```

**Zero deletions.** The stale `ts` fence showing `Schema.decodeUnknown(Schema.Array(User))(table.hashes())` is untouched; a dated correction blockquote below it names both staleness (the effect v3 name, and `hashes()` now being an `Effect`) and states that the Decision itself is unchanged and fully implemented — ADR-EC-007's and ADR-EC-014's precedent followed exactly.

### The from-disk §4 cross-check, verbatim

Run against `spec/traceability.md` after Task 3, in both directions:

```
test files on disk: 14
  PRESENT in §4: Contracts.test.ts
  PRESENT in §4: Correlate.test.ts
  PRESENT in §4: DataTable.test.ts
  PRESENT in §4: ParameterTypeLifecycle.test.ts
  PRESENT in §4: ParameterTypes.test.ts
  PRESENT in §4: Parser.test.ts
  PRESENT in §4: StepArguments.test.ts
  PRESENT in §4: StepMatcher.test.ts
  PRESENT in §4: Validate.test.ts
  PRESENT in §4: dialect.test.ts
  PRESENT in §4: expressions-pin.test.ts
  PRESENT in §4: loadFeature.test.ts
  PRESENT in §4: schema-issue-pin.test.ts
  PRESENT in §4: upstream-pin.test.ts

rows naming a *.test.ts file: 14
missing from §4: 0
stale rows (file gone): 0

§4 cross-check: OK
```

The reverse direction (a §4 row naming a file that no longer exists) was added to the 03-06 script shape, because a completeness claim can be broken by a deletion as easily as by an omission.

### File and test counts

- `ls packages/gherkin/test/*.test.ts | wc -l` → **14**. This is the number now written in words in `spec/roadmap.md`, replacing the stale "eleven".
- `pnpm test` → **404 tests across 17 files**. The 17-vs-14 gap is the deliberate discrepancy STATE.md warns must NOT be "fixed": vitest also collects `tools/oxlint/effect/test/`'s three suites, which are not `packages/gherkin` tests and have no place in §4. Confirmed by `vitest list --filesOnly`; the roadmap row says "Yes for `packages/gherkin` — fourteen", which is true of the scope it names.

### Identifier allocation for the next phase

- Next free behavior id: **BEH-EC-017** (BEH-EC-016 is now the highest allocated).
- Next free decision id: **ADR-EC-026** (ADR-EC-025 is now the highest allocated).
- `spec/behaviors/06-datatable-and-docstring-arguments.md` has a `_Previous:_` footer and **no `_Next:_` footer**. Whichever file becomes 07 owns adding it — the same debt 05 carried into this plan.

### The verify-pack mutation proof

The repo's own METHOD NOTE (and STATE.md 01-02's record of a grep gate proven vacuous) requires that a structural gate be shown to be live. All four new assertions were mutation-tested against a temporarily edited `packages/gherkin/package.json`; each produced its own distinct failure, and the manifest was restored byte-identically afterwards (`git diff --stat packages/gherkin/package.json` empty).

| Mutation | Result |
|----------|--------|
| Drop `effect` from `peerDependencies` | `✗ peerDependencies.effect is missing from the packed manifest -- ADR-EC-021 requires effect as a PEER dependency of this package.` |
| Drop `effect` from `devDependencies` | `✗ devDependencies.effect is missing from the packed manifest -- gherkin builds and tests against effect...` |
| Add `effect` to `dependencies` | `✗ effect / @effect/platform must be a PEER dependency only... declares dependencies.effect = "^4.0.0-rc.112". A consumer would get a second copy of effect, breaking Context.Service identity...` |
| Move `@effect/platform-node` to `dependencies` | `✗ ...declares dependencies.@effect/platform-node = "^4.0.0-rc.112" outside devDependencies -- gherkin must stay runtime-agnostic and runner-agnostic (ADR-EC-021).` |

The green run, for the record:

```
@effect-cucumber/gherkin
  ✓ peerDependencies.effect = ^4.0.0-rc.112  (required by ADR-EC-021)
  ✓ devDependencies.effect = 4.0.0-rc.112  (correct under ADR-EC-021)
  ✓ effect / @effect/platform appear in no consumer-installed field  (ADR-EC-021)
  ✓ no test runner and no concrete @effect/platform-* outside devDependencies  (ADR-EC-021)
```

## Decisions Made

- **ADR-EC-025 implements ADR-EC-008; it does not supersede it.** The Decision ("data tables and doc strings decode through `Schema`") was never wrong — only its worked example drifted. Framing this ADR as a supersession would have retired a decision that is now true in code for the first time.
- **The forward link from ADR-EC-025 to BEH-EC-016 was deferred one commit.** Writing it in Task 1 would have made check 5 (relative link integrity) fail on the intermediate commit alongside the check-3 failure the plan predicted. Deferring it to Task 2 — the commit where its target exists — applies the plan's own "a registry entry lands in the same commit as the file it registers" rule to links. The result is that only the single predicted check failed at Task 1, and it was check 3.
- **The three Phase 4 test files were re-pointed, not added.** Plan 04-04 had already added §4 rows for `DataTable.test.ts`, `StepArguments.test.ts` and `schema-issue-pin.test.ts`, parking all three against `BEH-EC-014` because, as its summary says, "`spec/behaviors/` also has no data-table behavior doc yet... 04-05 should revisit if it adds one." This plan added one, so all three now name `BEH-EC-016` and carry the plan's specified descriptions.
- **`verify-pack.sh`'s replacement carries a positive assertion, not only the two negative ones.** A gate built purely from prohibitions passes vacuously on a manifest that declares nothing at all — which for `effect` would ship a package whose imports resolve against whatever copy the consumer happens to have. Assertion 1 (`effect` must BE a peer) is the same positive-control discipline `verify-no-runner-dep.sh` already applies to its source scan.
- **`@effect/platform` is permitted-in-peer, never required.** ADR-EC-021's second Correction records that no v4-compatible `@effect/platform` release exists and that the interface half needed no new peer at all (core `effect` covers `FileSystem`/`Path`). Requiring it would have made the gate red for a state the ADR itself calls correct.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed workspace dependencies in the worktree**

- **Found during:** Setup, before any gate could run.
- **Issue:** the parallel-execution worktree was created without `node_modules`, so no verification command could run at all.
- **Fix:** `pnpm install --frozen-lockfile`. Not a package-manager *add*: no package name was resolved, and neither a manifest nor the lockfile changed, so the package-legitimacy exclusion does not apply.
- **Files modified:** none (`pnpm-lock.yaml` byte-identical against `70f6664`).
- **Verification:** baseline `pnpm test` 404 passed and `pnpm verify:spec` PASS 7 before any edit.
- **Committed in:** n/a — produced no tracked change.

**2. [Rule 2 - Correctness] The README's opening paragraph asserted a capability the package no longer has**

- **Found during:** Task 3.
- **Issue:** `packages/gherkin/README.md`'s first paragraph read "No Effect-specific logic lives here — this is a plain parsing library, and it declares no dependency on the Effect ecosystem in any field." That has been false since ADR-EC-021 made `effect` a real peer dependency; plan 04-04's Next Phase Readiness explicitly handed it to this plan. AGENTS.md §4 makes leaving a known-false sentence in the same file as one you are correcting a defect, and the plan's own Task 3 action says so in as many words about the adjacent stale signature.
- **Fix:** replaced with the true statement — `effect` is a peer dependency, never bundled, `FileSystem`/`Path` reached through core `effect`, no concrete platform implementation and no test runner — linking ADR-EC-021.
- **Files modified:** `packages/gherkin/README.md`
- **Verification:** `pnpm lint` exit 0 after `pnpm format`; `pnpm verify:spec` link check resolves the new relative link.
- **Committed in:** `591bfae`

**3. [Rule 2 - Correctness] Two existing §4 rows understated their BEH-EC-016 coverage**

- **Found during:** Task 3, while writing ADR-EC-025's Verified-not-assumed section.
- **Issue:** that section names `packages/gherkin/test/upstream-pin.test.ts` as the pin holding three BEH-EC-016 facts (the `argumentIndex` values and key-presence shape, `Object.keys(row) === ["cells"]`, and the F32 duplicate-header fixture), while §4 listed that file as covering `BEH-EC-014` only. `Correlate.test.ts` likewise gained seven `stepArguments` tests in 04-04 while its row still said `BEH-EC-001` only. A reader following the chain from BEH-EC-016 to its tests would not have found either — a gap the new ADR itself created.
- **Fix:** both rows now name two behaviors (`BEH-EC-014, BEH-EC-016` and `BEH-EC-001, BEH-EC-016`), with the descriptions extended to say what the second one covers. No row was removed and no existing coverage claim was weakened.
- **Files modified:** `spec/traceability.md`
- **Verification:** `pnpm verify:spec` PASS 7 / FAIL 0; the from-disk cross-check above still reports zero missing and zero stale.
- **Committed in:** `591bfae`

### Items already true at the base commit

Two of Task 3's specified edits had already been made by plan 04-04's own AGENTS.md §4 sweep and needed no change:

- `packages/gherkin/README.md`'s "The `DataTable` wrapper ... does **not** ship yet" sentence was already replaced. `grep -c 'does \*\*not\*\* ship yet'` was `0` before this plan started, and the acceptance criterion passes for that reason rather than because of an edit here. The *other* stale sentence in the same paragraph — the `loadFeature(path, options?)` signature — was still there and was fixed by this plan.
- `.planning/REQUIREMENTS.md` already had PARSE-04 as `- [x]` and `| PARSE-04 | Phase 4 | Complete |`, marked by 04-04. Only the `*Last updated:*` footer was rewritten here, to record that PARSE-04 now has ADR-EC-025 and BEH-EC-016 as its spec backing. `| MATCH-03 | Phase 6 | Pending |` and every other requirement row are untouched.

### Acceptance criteria not met as literally written

**Two footer greps in Task 2 encode a format this repository does not use.** The criteria are `grep -c '_Next:_' spec/behaviors/05-...md` outputs `1` and `grep -c '_Previous:_' spec/behaviors/06-...md` outputs `1`. Every one of the six behavior files uses `_Next: [title](link)_` — italics wrapping the whole line, label and link together — and the plan's own action text says to add the footer "in the same format 04's `_Next:_` uses". Satisfying the literal grep would have required introducing a third footer style in a single file, in a repository whose entire premise is that `spec/` is internally consistent.

Repo convention was followed. The equivalent checks, run against the correct pattern:

```
grep -c '^_Next: '     spec/behaviors/05-step-matching-and-parameter-types.md   -> 1
grep -c '^_Previous: ' spec/behaviors/06-datatable-and-docstring-arguments.md   -> 1
```

and all eight footers across `spec/behaviors/*.md` now share one style, 05 → 06 → (07, unallocated) chained correctly. The criteria's intent — 05 finally has its missing `_Next:` footer, 06 has a `_Previous:` — is met.

**One criterion was met only after a later task, exactly as the plan predicted.** Task 1's `pnpm verify:spec` criterion could not pass at Task 1's commit: check 3 requires the §3 row that Task 3 adds. The plan anticipated this and instructed that the ordering be recorded here rather than the row added early in the wrong file. At `0e4968b` the result was `PASS 6 / FAIL 1 / SKIP 1`, the single failure being `decisions -> traceability | untraced: ADR-EC-025`; at `591bfae` it is `PASS 7 / FAIL 0 / SKIP 1`. Check 5 (relative links) never failed on any intermediate commit — see Decisions Made.

---

**Total deviations:** 3 auto-fixed (1 Rule 3 blocking, 2 Rule 2 correctness). Zero architectural decisions escalated.
**Impact on plan:** none on scope or content. Every artifact, identifier, section and normative rule the plan specified was produced as specified.

## Issues Encountered

- The worktree base was `f640f4a`, behind the required `70f6664`. HEAD was verified as a `worktree-agent-*` branch and the tree was clean, so the mandated setup-time `git reset --hard 70f6664` applied cleanly. No protected ref was involved.
- The `typescript` worked example in BEH-EC-016 is compiled by a doc-examples check that is still "Not wired" per `spec/roadmap.md`, so nothing in CI would have caught a fence that does not compile. It was type-checked by hand instead: the fence was extracted verbatim to a throwaway `packages/vitest/fence-check.ts` with a throwaway `tsconfig.fence.json` (`composite: false`, `noEmit`, `rootDir: "."`), compiled clean against the real barrel under the repo's own `tsconfig.base.json`, and both scratch files were deleted. `git status` was clean afterwards.
- `pnpm pack` retains `devDependencies` in the published manifest with `catalog:` specifiers already expanded. That is what makes the new "devDependencies.effect is required" assertion assertable over the tarball at all, and it was confirmed by inspecting a real extracted tarball before the assertion was written rather than assumed.

## Known Stubs

None. Every identifier allocated is registered, traced, and reachable: ADR-EC-025 and BEH-EC-016 each have an index entry and a traceability row, every relative link in both resolves, and the `verify-pack.sh` assertions are mutation-proven live rather than decorative. No placeholder text, empty value, or unwired reference was introduced.

## Threat Flags

None beyond the plan's own register.

- **T-04-12 (a rewritten ADR losing the record) — mitigated as specified.** `git diff --numstat` on ADR-EC-008 is `28 0`: additions only.
- **T-04-13 (`spec/` and disk drifting apart) — mitigated as specified.** Both new files fail a distinct `verify-traceability.sh` check without their registry entry, and both entries landed in the same commit as their file. The from-disk §4 cross-check runs in both directions and reports zero discrepancies.
- **T-04-14 (documentation content) — accepted, unchanged.** No secrets, credentials or private data; all content describes public API.
- **T-04-SC — not applicable, and now better enforced.** Zero dependencies added, lockfile byte-identical. The `verify-pack.sh` change strengthens rather than relaxes the supply-chain posture: where the old gate forbade `effect` in every field (a rule the shipped manifest could not satisfy, so the gate was simply red and therefore ignorable), the new one forbids `effect` and `@effect/platform` in `dependencies`, `optionalDependencies` and `bundledDependencies`, forbids every runner and concrete platform implementation outside `devDependencies`, and requires the peer range that prevents a duplicate `effect` install.

No new network endpoint, auth path, file-access pattern, or trust-boundary schema.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- **Phase 4 is closed.** PARSE-04 is Complete and now has real spec backing: ADR-EC-025 for the why, BEH-EC-016 for the contract, and traceability rows joining both to the five source modules and the five test files that cover them.
- **Phase 5 inherits a settled question and an explicit non-answer.** BEH-EC-016 owns the argument ORDER and the accessors; it says in as many words that the STEP-BODY SIGNATURE — where `stepArguments` sits relative to the cucumber-expression arguments in a `Given`/`When`/`Then` callback — is DSL-02's, not this file's. Phase 5 should state that in BEH-EC-002's territory and link back, not restate the ordering rule.
- **The doc-examples compile check is still "Not wired"** in `spec/roadmap.md`, and `spec/behaviors/` now carries seven `typescript` fences that nothing checks automatically. Wiring it is roadmap item 4 under "Blocking first release"; BEH-EC-016's fence was hand-checked to the standard that check would apply, and the throwaway-tsconfig recipe is recorded above.
- **`spec/behaviors/06` has no `_Next:_` footer**, deliberately — it is the last behavior file. Whichever file becomes 07 owns adding it.
- No blockers, and `deferred-items.md` is gone: the one item Phase 4 logged is fixed.

## Self-Check: PASSED

Files claimed as created, all present on disk:

```
FOUND: spec/decisions/025-datatable-wrapper-accessor-contract.md
FOUND: spec/behaviors/06-datatable-and-docstring-arguments.md
```

File claimed as deleted, confirmed absent:

```
ABSENT: .planning/phases/04-datatable-docstring/deferred-items.md
```

Commits claimed, all present in `git log 70f6664..HEAD` on branch `worktree-agent-a0106ef6a00d7f616`:

```
FOUND: 0e4968b  docs(04-05): record ADR-EC-025 and mark ADR-EC-008's stale example in place
FOUND: 6a530f6  docs(04-05): add BEH-EC-016 and give behavior 05 its _Next: footer
FOUND: 591bfae  docs(04-05): join the traceability chains and correct the status documents
FOUND: 90fc19b  fix(04-05): verify-pack enforces ADR-EC-021, not the superseded ADR-EC-015
```

No item missing. Working tree clean apart from ignored `node_modules`/build output.

---
*Phase: 04-datatable-docstring*
*Completed: 2026-08-29*

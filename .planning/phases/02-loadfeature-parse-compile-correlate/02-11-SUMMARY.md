---
phase: 02-loadfeature-parse-compile-correlate
plan: 11
subsystem: docs
tags: [spec, traceability, adr, gherkin, behavior-doc, dprint, verify-traceability]

# Dependency graph
requires:
  - phase: 02-loadfeature-parse-compile-correlate
    provides: "plan 02-09's loadFeature/parseFeature, the ParsedFeature contract, Errors.ts and Validate.ts — the shipped surface this plan documents"
provides:
  - "BEH-EC-014 — a normative behavior doc for loadFeature's failure path, covering all ten LoadFeatureError reason tags and all four LoadFeatureWarning reason tags"
  - "a registry entry in spec/behaviors/index.yaml so verify-traceability.sh check 1 passes in both directions"
  - "spec/traceability.md section 1 naming packages/gherkin (not packages/vitest) as loadFeature's home, plus a BEH-EC-014 row"
  - "spec/traceability.md section 4 as a real test-file map covering all seven packages/gherkin/test/*.test.ts files"
  - "an ADR-EC-014 correction that describes the column-aware two-check placeholder scan that actually shipped"
  - "spec/roadmap.md and packages/gherkin/README.md status text that says only what is true after Phase 2"
affects: [03-parameter-types-and-step-matching, 04-datatable-docstring, 06-plan-scenario-effect-runner, 11-composition-root-and-acceptance-suite]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "behavior doc = ## heading with the ID, a > **See:** blockquote linking ADRs by relative path, then a plain (untagged) fenced REQUIREMENT: block"
    - "a normative sentence that an implementation reproduces verbatim is kept on one unbroken markdown line so it stays greppable against the source"
    - "a superseded normative rule is marked superseded in place and replaced by a second dated correction note, never rewritten out of history"

key-files:
  created:
    - spec/behaviors/04-loadfeature-parse-and-validation.md
  modified:
    - spec/behaviors/index.yaml
    - spec/behaviors/03-rules-outlines-and-testclock.md
    - spec/traceability.md
    - spec/decisions/014-loadfeature-consumes-gherkindocument-and-pickles.md
    - spec/roadmap.md
    - packages/gherkin/README.md

key-decisions:
  - "BEH-EC-014 allocated as the next contiguous id (highest previously allocated was BEH-EC-013), per AGENTS.md section 6"
  - "The worked example uses a typescript-tagged fence, not ts — Phase 2 is the first moment a real API exists for the planned doc-examples check to compile against"
  - "ADR-EC-014's original correction blockquote is preserved with its date attribution and marked superseded in place; the accurate two-check description lives in a second dated correction note"
  - "The prescribed Background-limitation error sentence was moved onto one unbroken line inside a nested blockquote so grep can match it against Validate.ts's BACKGROUND_LIMITATION constant"
  - "Traceability section 5 stays empty and REQ-EC-free — the .feature files on disk are parser fixtures, not acceptance scenarios, so verify-traceability check 4 keeps SKIPping cleanly"

patterns-established:
  - "Status truth lives in exactly one place: spec/roadmap.md's Current state table; every other document cites it rather than restating build status"
  - "Test-file map rows are enumerated from disk (ls packages/*/test/*.test.ts), never hand-guessed"

requirements-completed: [PARSE-01, PARSE-02, PARSE-03]

# Metrics
duration: 12min
completed: 2026-08-28
---

# Phase 2 Plan 11: Spec Reconciliation for `loadFeature` Summary

**BEH-EC-014 makes `loadFeature`'s ten-error/four-warning failure surface normative spec, the traceability matrix gains a real test-file map and stops pointing at the wrong package, and ADR-EC-014's placeholder-check prescription is replaced with the column-aware form that actually shipped.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-08-28T13:00:00Z
- **Completed:** 2026-08-28T13:12:11Z
- **Tasks:** 3
- **Files modified:** 7 (1 created, 6 modified)

## Accomplishments

- Closed AGENTS.md §1 for Phase 2: the entire `LoadFeatureError` / `LoadFeatureWarning` surface that plan 02-09 shipped now has a normative behavior doc with a permanent, contiguous id, and it enumerates every one of the ten error reason tags and four warning reason tags rather than gesturing at them.
- Removed a genuinely misleading prescription from a normative document. ADR-EC-014 told every future implementer to "check every Pickle step's text for a leftover `<...>` token" — a rule verified wrong in both directions (it rejects `the assertion 2 < 3 holds`, `the html is <div>hello</div>` and `an email <a@b.com>`, and it misses DataTable cells and DocString content entirely). It now describes the exact column-aware `UninterpolatedPlaceholder` error and the heuristic `UnknownPlaceholder` warning that `Validate.ts` implements.
- Section 1 of the traceability matrix no longer sends a reader to `packages/vitest/src/loadFeature.ts`, a file that cannot exist: ADR-EC-015 forbids `@effect-cucumber/gherkin` from depending on Effect, and `loadFeature` lives in that package.
- Section 4 stopped being the sentence "Empty — no test files exist yet" — Phase 2 is the first phase to falsify it. It is now a table enumerated from disk, covering all seven `packages/gherkin/test/*.test.ts` files.
- Both status documents (`spec/roadmap.md`'s Current state table, `packages/gherkin/README.md`'s Status section) say only what is true after Phase 2, per AGENTS.md §4.

## Task Commits

Each task was committed atomically:

1. **Task 1: Write BEH-EC-014 and register it** — `20a12a0` (docs)
2. **Task 2: Correct traceability section 1 and turn section 4 into a real test-file map** — `e659add` (docs)
3. **Task 3: Amend ADR-EC-014's correction and update the two status documents** — `2a42b9b` (docs)

## Files Created/Modified

- `spec/behaviors/04-loadfeature-parse-and-validation.md` — **created.** BEH-EC-014. Two `REQUIREMENT:` blocks (the ten-tag fatal set, and the four-tag non-throwing warning set carried on `ParsedFeature.warnings`), prose recording the per-scope duplicate-name rule and the never-truncate message policy, a `ts` signature listing for `loadFeature`/`parseFeature`, and a `typescript`-fenced worked example that imports from `@effect-cucumber/gherkin` and switches on `err.reason`.
- `spec/behaviors/index.yaml` — registry entry `BEH-EC-014` / `04-loadfeature-parse-and-validation.md` / `id_range: "014"`.
- `spec/behaviors/03-rules-outlines-and-testclock.md` — footer no longer claims to be the last behavior file; it now links forward to 04 (see Deviations).
- `spec/traceability.md` — §1 row 01 corrected to `packages/gherkin/src/loadFeature.ts`; new §1 row for BEH-EC-014 naming the eight gherkin modules; §4 replaced with a seven-row test-file map; the chain block and preamble now scope "planned" to `packages/vitest` only; §5's wording distinguishes parser fixtures from acceptance scenarios (see Deviations).
- `spec/decisions/014-loadfeature-consumes-gherkindocument-and-pickles.md` — the original correction blockquote keeps its framing and date, its prescribed detection rule is marked superseded, and the prescribed error-message sentence is preserved verbatim on one unbroken line. A second dated correction note describes the two checks that shipped, names all three verified false positives, names DocString and DataTable cell values as scan targets, and cites cucumber/gherkin#22 for the dropped-column signature.
- `spec/roadmap.md` — Current state opening sentence and four table rows corrected (Packages exist, `tsc -b`, Unit tests, GSD project planning); Acceptance suite and Doc-examples compile check rows left untouched, both still unbuilt.
- `packages/gherkin/README.md` — Status section states that the parse pipeline and the `ParsedFeature` contract ship, that step matching / parameter types / the `DataTable` wrapper do not, and that nothing is published to npm. Install and Requirements untouched; no `effect` install line added (ADR-EC-015).

## Decisions Made

- **The prescribed error sentence needed to be greppable, not just present.** The plan's own verify command was `grep -c 'limitation for Backgrounds nested under a Scenario Outline'`, which returned **0 against the pre-existing file** — the sentence was wrapped across three blockquote lines and never matched. Rather than declare the criterion satisfied by inspection, the sentence was moved into a nested blockquote on one unbroken line, with a note in the ADR explaining why it is kept unwrapped. It now matches, byte for byte, `Validate.ts`'s `BACKGROUND_LIMITATION` constant.
- **The superseded rule is marked, not deleted.** ADR-EC-014's first correction keeps its 2026-08-28 GSD-Pitfalls attribution and its reasoning about `compileScenarioOutline`'s empty `variableCells` — all of which remains correct. Only the detection rule it prescribed is wrong, so that clause is marked superseded in place and the replacement lives in a second dated note. A reader can still see what was believed and when.
- **`typescript` over `ts` for the worked example.** AGENTS.md §2 prefers `typescript` "wherever an example can be made to compile once there's an API to compile it against." Phase 2 is that moment for `loadFeature`, so the example imports `loadFeature`, `LoadFeatureError` and `ParsedFeature` from `@effect-cucumber/gherkin` by name. The signature listing stays a `ts` fence, which is reference-only by convention.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] `03-rules-outlines-and-testclock.md`'s footer became false**

- **Found during:** Task 1 (writing BEH-EC-014)
- **Issue:** The file's closing line read "_This is the last behavior file for now — see `spec/roadmap.md` for what's planned next._". Adding `04-loadfeature-parse-and-validation.md` falsified it. AGENTS.md §4 ("say only what is true") is a hard project constraint, and every other behavior file carries a forward `_Next:_` link, so leaving it would break both the truth rule and the navigation convention.
- **Fix:** Replaced with `_Next: [04 — loadFeature parse and validation](./04-loadfeature-parse-and-validation.md)_`, matching the footer style of files 01 and 02.
- **Files modified:** `spec/behaviors/03-rules-outlines-and-testclock.md`
- **Verification:** `pnpm verify:spec` check 5 resolves the new relative link (158 links, none broken, none gitignored).
- **Committed in:** `20a12a0` (Task 1 commit)

**2. [Rule 2 - Missing Critical] Traceability chain block and preamble still asserted "no code yet"**

- **Found during:** Task 2 (rewriting §4)
- **Issue:** The plan directed §4's placeholder sentence to be replaced, but two other places in the same file made the same now-false claim: the ASCII chain block (`→ Source module ... [planned — no code yet]`, `→ Test file ... [planned — no code yet]`) and the preamble ("since `packages/*` doesn't exist yet"). Adding a real test-file map immediately below text asserting no test files exist is self-contradictory, and §4's new rows would read as planned rather than real.
- **Fix:** Chain block now reads `[gherkin: built; vitest: planned]` for both rows. The preamble scopes its `(planned)` caveat explicitly to `packages/vitest` and states that `packages/gherkin/src` and `packages/gherkin/test` exist. The preamble was not deleted — the plan required keeping it, and the Source module column genuinely is still planned for the vitest package.
- **Files modified:** `spec/traceability.md`
- **Verification:** `pnpm verify:spec` PASS 7 / FAIL 0; `pnpm lint` exits 0.
- **Committed in:** `e659add` (Task 2 commit)

**3. [Rule 2 - Missing Critical] §5's justification for being empty was no longer true**

- **Found during:** Task 2
- **Issue:** §5 read "Empty — no `.feature` files exist in this library's own test suite yet." Roughly 25 `.feature` fixtures now exist under `packages/gherkin/test/fixtures/`. The section's conclusion (empty, no `REQ-EC-` rows) is still correct, but its stated reason had become false — and a future reader could reasonably "fix" §5 by adding rows for the fixtures, which would break the REQ-EC namespace the plan's threat T-02-29 exists to protect.
- **Fix:** Reworded to state that the fixtures are parser fixtures rather than acceptance scenarios, that none carries a `@REQ-EC-NNN` tag, and that the acceptance suite is still to come. No `REQ-EC-` row added.
- **Files modified:** `spec/traceability.md`
- **Verification:** `grep -c 'REQ-EC-[0-9]' spec/traceability.md` is 0; verify-traceability check 4 still reports `SKIP  features -> traceability  no .feature tags yet`.
- **Committed in:** `e659add` (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (3 missing critical, all AGENTS.md §4-driven)
**Impact on plan:** All three are the same class of defect the plan exists to fix — a spec document asserting something untrue — found in adjacent lines the plan's file list did not enumerate. No scope creep: every edit is inside a file already listed in `files_modified`, except `03-rules-outlines-and-testclock.md`, which is a single-line footer correction forced by creating file 04.

## Issues Encountered

- **`node_modules` absent in the fresh worktree.** `pnpm format` failed with `dprint: command not found`. Resolved with `pnpm install --frozen-lockfile` (201 packages, all reused from store, lockfile unchanged). Not a deviation — worktree setup, not plan content.
- **The plan's own verify command for the prescribed ADR sentence failed against the unmodified file.** `grep -c 'limitation for Backgrounds nested under a Scenario Outline'` returned 0 before any edit, because the sentence was wrapped across markdown lines. Handled by unwrapping the sentence rather than weakening the check — see Decisions Made.

## Verification

Full phase gate run at plan completion, all green:

| Command | Result |
| ------- | ------ |
| `pnpm verify:spec` | PASS 7, FAIL 0, SKIP 1 (§5 features→traceability, expected) — 160 relative links resolve, none gitignored |
| `pnpm lint` | exit 0 (`oxlint -f unix && dprint check`) |
| `pnpm test` | 10 files, 211 tests passed |
| `pnpm build` | exit 0 (`tsc -b`) |
| `pnpm circular` | no circular dependency found |
| `pnpm verify:pack` | pack shape OK, publint clean for both packages |
| `pnpm verify:tsgo-gate` | tsgo gate: ENFORCED |
| `pnpm verify:oxlint-plugin` | oxlint effect plugin: ENFORCED |

Plan-specific acceptance greps:

- 10 distinct error reason tags in the behavior doc; 4 distinct warning reason tags.
- 1 `typescript`-tagged fence; the only BEH ids present are `BEH-EC-001` (a cross-reference) and `BEH-EC-014`.
- `packages/vitest/src/loadFeature.ts` in `spec/traceability.md`: 0 occurrences.
- All 7 `packages/gherkin/test/*.test.ts` basenames present in `spec/traceability.md`.
- `2 < 3`, `<div>hello</div>`, `<a@b.com>`, `UninterpolatedPlaceholder`, `UnknownPlaceholder`, `DocString`, `DataTable` all present in ADR-EC-014; prescribed sentence grep returns 1.
- `no library code has shipped` in the README: 0. `no library source code exists yet` / `contain **no source files**` in `spec/roadmap.md`: 0. Acceptance suite and Doc-examples compile check rows still present.

## Known Stubs

None. This plan produces documentation only; no code path was stubbed, and no dependency, script, or manifest field was changed (threat T-02-SC).

## Threat Flags

None. No new network endpoint, auth path, file-access pattern, or schema change at a trust boundary was introduced.

## Deferred Items

- **`spec/roadmap.md` § "Blocking first release" item 2** ("Implement `@effect-cucumber/gherkin`'s parse→compile→correlate pipeline") is now complete, and the section's preamble still says the 11-phase order applies "once `.planning/ROADMAP.md` formalizes it" — which it now has. The plan explicitly directed *not* to rewrite this section ("Do NOT rewrite the 'Blocking first release' or 'Planned' sections; they are still accurate"), so it was left alone. AGENTS.md §4 designates the Current state table as the single authority on build status, and that table is now correct, so the staleness is bounded. Worth a one-paragraph refresh in a later phase.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- `spec/` now describes what Phase 2 actually built. Phase 3 (Parameter Types and Step Matching) can extend `spec/behaviors/` from a registry whose highest allocated id is BEH-EC-014, so the next free id is **BEH-EC-015**.
- The §4 test-file map is now a live table, not a placeholder — every phase that adds a test file must add a row, and `verify-traceability.sh` will not catch an omission there (it checks the registry and links, not §4 completeness). Worth remembering when Phase 3 lands its first tests.
- No blockers.

## Self-Check: PASSED

All claimed files exist on disk (`spec/behaviors/04-loadfeature-parse-and-validation.md`,
`spec/behaviors/index.yaml`, `spec/traceability.md`,
`spec/decisions/014-loadfeature-consumes-gherkindocument-and-pickles.md`, `spec/roadmap.md`,
`packages/gherkin/README.md`, and this summary). All three task commits plus the metadata commit
are present in `git log` (`20a12a0`, `e659add`, `2a42b9b`, `f4ad3a0`), the working tree is clean,
and `git diff --diff-filter=D c630540 HEAD` reports no deleted files.

---

*Phase: 02-loadfeature-parse-compile-correlate*
*Plan: 11*
*Completed: 2026-08-28*

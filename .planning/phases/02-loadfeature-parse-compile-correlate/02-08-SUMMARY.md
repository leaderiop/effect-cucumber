---
phase: 02-loadfeature-parse-compile-correlate
plan: 08
subsystem: gherkin-parsing
tags: [gherkin, cucumber, validation, placeholder-interpolation, warnings, adr-ec-014, parse-03, redos, vitest]

# Dependency graph
requires:
  - phase: 02-02
    provides: "packages/gherkin/src/Errors.ts — the UninterpolatedPlaceholder error reason, the four LoadFeatureWarningReason tags, and the makeWarning factory"
  - phase: 02-03
    provides: "packages/gherkin/src/Model.ts — the Pickle / PickleStep / GherkinDocument re-exports; plus the F7, F8 and Group C fixtures"
  - phase: 02-05
    provides: "packages/gherkin/src/Correlate.ts — AstIndex.exampleColumns, AstScenarioInfo.examplesHeaders, AstRuleInfo.scenarioIds, AstStepInfo, and isOutlineKeyword"
  - phase: 02-07
    provides: "packages/gherkin/src/Validate.ts — validateFeature, the Group A checks, the warnings accumulator and the marked extension point this plan fills"
provides:
  - "The column-aware leftover-placeholder scan (check alpha): reason UninterpolatedPlaceholder on a <token> naming one of that Outline's own Examples columns, found in step text, DocString content, or any DataTable cell"
  - "ADR-EC-014's prescribed Background-limitation sentence, reproduced verbatim in the F7 message and pinned by a test — PARSE-03's actual deliverable"
  - "The four Group C warnings: UnknownPlaceholder (F9, check beta), DuplicateExamplesColumn (F11), EmptyRule (F13), SuspectedSwallowedStep (F14), returned in stable document order and never thrown"
  - "The single fixed-literal PLACEHOLDER regex — the only regular expression in packages/gherkin/src — shared by both checks"
  - "packages/gherkin/test/Validate.test.ts — 27 tests, including the three D4 false-positive negative controls and the Outline heuristic-bounding control"
affects: [02-09, 02-10, 02-11, 06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "One scan, one regex, two verdicts: naming a column is an ERROR (proof of intent), any other token is a WARNING (no innocent reading is excluded)"
    - "The false-positive class is removed by SCOPE, not by a cleverer pattern — a plain Scenario has no Examples columns and is never scanned at all"
    - "A regex declared as a module-scope fixed literal and matched AGAINST untrusted content; the reverse direction (a pattern compiled FROM content) is the ReDoS path and appears nowhere in the package"
    - "Scan all three placeholder-bearing sites independently rather than as an if/else chain — @cucumber/gherkin@42 permits one step to carry both a DocString and a DataTable"
    - "Warnings are stably sorted by line before returning, so document order is a property of the returned array rather than of the emission order"
    - "The site of a finding (`a DataTable cell`, `the DocString`) is carried into the message, which is what makes a test able to prove the scan reached a step ARGUMENT rather than only its text"
    - "Detection reads the duplicate-preserving examplesHeaders array; a Set would erase the exact thing F11 detects"
    - "Tests assert err.reason, with four deliberate exceptions where the message content IS the requirement"

key-files:
  created: []
  modified:
    - packages/gherkin/src/Validate.ts
    - packages/gherkin/test/Validate.test.ts

key-decisions:
  - "scanPlaceholders returns every token with its site and full surrounding content, and the CALLER partitions by column membership — one scan and one regex feed both check alpha and check beta, which the plan requires of Task 2 anyway"
  - "A small document walk (astDetailOf) recovers Background descriptions and Examples-block lines rather than widening Correlate.ts's AstIndex, because this plan's files_modified is Validate.ts and its test, and neither datum is needed for correlation"
  - "The error reports the FIRST leftover in document order and stops, consistent with the module's existing first-error contract; the DocString branch is proven by a dedicated inline source rather than by making the message report every finding"
  - "describeNode was factored into describeBlock(keyword, name) so an unnamed Background or Rule reads as `Background:` rather than `Background: \"\"`"
  - "REQUIREMENTS.md left untouched — see Decisions Made; PARSE-01 and PARSE-02 are likewise still Pending after their implementing plans, because all three are worded around a `loadFeature` that does not exist until 02-09"

patterns-established:
  - "A verified false-positive list becomes executable negative controls named after the offending inputs, so a regression to the naive implementation fails by name rather than by a generic count"
  - "A heuristic check gets a BOUNDING test: not `it never fires` (false), but `its worst case is a warning, never a throw`"

requirements-completed: []

# Metrics
duration: 18min
completed: 2026-08-28
---

# Phase 02 Plan 08: The Leftover-Placeholder Scan and the Group C Warnings Summary

**PARSE-03 is delivered: a Background step whose text, DataTable cell, or DocString still carries one of its Outline's own Examples columns now fails with `UninterpolatedPlaceholder` and ADR-EC-014's prescribed explanation — and the check is column-aware, so all three verified-legitimate angle-bracket step texts that a bare `/<[^>]*>/` regex would reject are pinned as passing negative controls.**

## Performance

- **Duration:** ~18 min
- **Tasks:** 3
- **Files modified:** 2 (`Validate.ts` 301 → 728 lines, `Validate.test.ts` 186 → 365 lines)

## Accomplishments

- **Check alpha — the exact, column-aware scan (rows F7 and F8).** For every pickle correlated to an Outline with a non-empty column set, `scanPlaceholders` walks `step.text`, `step.argument.docString.content`, and every `step.argument.dataTable.rows[].cells[].value`. A token whose name is one of *that Outline's own* `index.exampleColumns` throws `LoadFeatureError` with `reason: "UninterpolatedPlaceholder"`, located at the offending AST step's line (recovered through `index.byStepId`, since a `PickleStep` has neither a line nor an origin).
- **ADR-EC-014's wording is reproduced verbatim and pinned.** When the offending step's origin is `feature-background` or `rule-background`, the message carries the correction blockquote's sentence: *"Background step text still contains an unsubstituted placeholder — this is a known `@cucumber/gherkin` limitation for Backgrounds nested under a Scenario Outline, not a bug in your Background text."* A test asserts that substring, deliberately — the sentence is the deliverable, not decoration.
- **All three scan targets are exercised, not just claimed.** `uninterpolated-placeholder-background.feature` reports the step text at line 4; `uninterpolated-placeholder-in-argument.feature` reports `a DataTable cell` at line 4 with the cell value in full; a dedicated inline source proves the DocString branch by asserting the *whole* body (`the value is <token>, and the rest of this line exists to prove nothing is cut off`) appears — a truncating implementation keeps the placeholder and drops the tail, so asserting the tail is what catches one.
- **The false-positive class is removed by scope.** A plain Scenario has no Examples columns and is never scanned. `[VERIFIED]` in the research and now pinned as three named tests: `the assertion 2 < 3 holds`, `the html is <div>hello</div>` and `an email <a@b.com>` all validate cleanly and produce zero warnings. A bare angle-bracket regex passes every positive test in the file and fails exactly these three.
- **Check beta — `UnknownPlaceholder` (F9).** The same scan, the same regex; a token that is *not* a column becomes a warning naming the columns that do exist (`which declares: a`). `warning-dropped-examples-column.feature` produces exactly one such warning, and the compiled step text is separately pinned as `1 and <b>` — the upstream cucumber/gherkin#22 signature. If that ever changes, upstream fixed the silent drop and the fixture needs revisiting.
- **`DuplicateExamplesColumn` (F11)** reads `AstScenarioInfo.examplesHeaders`, the duplicate-preserving array, and reports the column name and the `Examples:` block's own source line. `warning-duplicate-examples-column.feature` → one warning at line 6 naming `"a"`.
- **`EmptyRule` (F13)** from `AstRuleInfo.scenarioIds.length === 0`. `warning-empty-rule.feature` → one warning at line 6 naming `Rule: "empty rule"`.
- **`SuspectedSwallowedStep` (F14)** on any Scenario *or* Background whose AST `description` is non-empty, quoting it verbatim with indentation preserved and stating plainly that a description is legal Gherkin so this is a heuristic. `warning-swallowed-step.feature` → one warning at line 3 containing `    Ginve x`. This is additive to 02-07's `ZeroStepScenario` mitigation, which covers only the case where the swallowed step was the block's *sole* step.
- **Severity is recorded as a locked decision, with its reasoning.** A block comment above the warning section states that all four are WARNINGS by decision (Research Assumption A2) and why: each has a real verified failure path but also an innocent reading, so an error rejects legitimate files and silence lets a dropped column ship.
- **Warnings are returned in deterministic document order.** They are collected per pass and then stably sorted by line, so ordering is a property of the returned array rather than of emission order, and a future check can be added anywhere without disturbing it.
- 27 tests in `Validate.test.ts` (requirement: at least 20). Whole-repo suite: 8 files, 193 tests, all passing.

## Task Commits

1. **Task 1: the exact, column-aware leftover-placeholder check (F7, F8)** — `d3d5863` (feat)
2. **Task 2: the four Group C warnings (F9, F11, F13, F14)** — `b6049bf` (feat)
3. **Task 3: `test/Validate.test.ts` extended with F7–F14 and the D4 guards** — `55a2086` (test)

## Files Modified

- `packages/gherkin/src/Validate.ts` (301 → 728 lines) — adds `PLACEHOLDER`, `PlaceholderSite`, `Leftover`, `scanPlaceholders`, `astStepOf`, `isBackgroundStep`, `BACKGROUND_LIMITATION`, `uninterpolatedPlaceholder`, `unknownPlaceholder`, `duplicateExamplesColumn`, `emptyRule`, `suspectedSwallowedStep`, `duplicatedColumns`, `BackgroundInfo`, `AstDetail`, `astDetailOf`, and `describeBlock`; the module doc comment's now-false "no `RegExp` is constructed here" paragraph was corrected
- `packages/gherkin/test/Validate.test.ts` (186 → 365 lines) — adds `warningsFromFixture`, the F7/F8 rejection group (5 tests), the Group C warning group (5 tests), and the D4 negative-control group (3 + 1 tests); the two new rejected fixtures were added to `rejectedFixtures` so the located-and-attributed sweep covers them

## Decisions Made

- **`scanPlaceholders` returns every token with context, and the caller classifies.** The plan's Task 1 wording ("given a pickle and a `ReadonlySet<string>` … returns every found column name") would have needed generalising in Task 2 regardless, since Task 2 requires that check beta reuse *the same* scan and *the same* regex. Writing it once in its general form avoided a rewrite one task later, and it keeps the policy question (which verdict) out of the scanning code.
- **A small `astDetailOf` document walk, rather than widening `AstIndex`.** F11's message needs the `Examples:` block's own line and F14 covers Backgrounds, and `AstIndex` carries neither — correctly, since a Background produces no pickle of its own and a block's location is not needed to join a pickle to its AST node. Widening `Correlate.ts` would have modified a file outside this plan's `files_modified` and added two fields only this module reads. The walk reads two source locations and one description; it re-derives nothing `compile()` produced, so ADR-EC-014's prohibition is untouched. It runs over `ParsedFeatureCore.document`, which the correlated result already carries.
- **The error reports the first leftover and stops.** `Validate.ts`'s existing contract is "throw on the FIRST error in document order", and a per-finding error keeps the reported line precise. The consequence is that `uninterpolated-placeholder-in-argument.feature` can only ever reach its DataTable cell (the table step is earlier in the document), so the DocString branch is proven by a dedicated inline source instead. That is the same technique 02-07 used for the swallowed-sole-step case, and for the same reason: the fixture corpus is a 1:1 map of the research fixture table, and this is a test of scan coverage, not a new row.
- **`describeNode` was factored into `describeBlock(keyword, name)`.** Backgrounds and unnamed Rules legitimately have an empty name, and `Background: ""` reads as a defect rather than as the anonymous block it is. No existing test pinned the old rendering.
- **`REQUIREMENTS.md` left untouched, and this is a judgement call worth flagging.** This plan does land the check PARSE-03 is worded around, and 02-07's summary named 02-08 as its owner. But PARSE-01, PARSE-02 and PARSE-03 are all still `Pending`, and PARSE-01/02's implementing plans (02-04, 02-05) left them that way for one reason: every one of the three is worded around `loadFeature`, and `loadFeature` does not exist until 02-09. The mechanism is complete and fully exercised through `parse → compile → correlate → validate`; what is missing is the public entry point that would make the requirement's sentence true of the library's surface. Marking it today would make `REQUIREMENTS.md` assert something the API cannot yet do, which AGENTS.md §4 forbids. **Recommendation for the orchestrator: mark PARSE-01, PARSE-02 and PARSE-03 together when 02-09 lands `loadFeature`.**
- **`Validate.ts` is still not exported from `index.ts`.** The barrel replacement belongs to a later plan and `index.ts` is outside this plan's `files_modified`. `pnpm circular` confirms the module DAG is still acyclic.

## Deviations from Plan

None. The plan executed as written; the two items above that read as choices (`scanPlaceholders`'s signature, `astDetailOf`) are implementation shapes the plan left open, not departures from what it specified.

### Deliberate Non-Deviations

- **Exactly one regex literal in the whole package.** `grep -rnE "= /[^/*]" packages/gherkin/src` returns one line: `const PLACEHOLDER = /<([^<>]+)>/g`. Check beta shares it with check alpha rather than declaring a second (threat T-02-01).
- **No dynamic pattern construction anywhere.** `grep -rn "new RegExp" packages/gherkin packages/vitest` is 0. The safe direction — a fixed literal matched *against* feature content — is used, and the comment above `PLACEHOLDER` records which direction is which and why.
- **No truncation, no ellipsis, no length cap.** `grep -cE 'slice\(0,|substring\(0,|\.\.\.'` on `Validate.ts` is 0, which also means the source uses no spread syntax. Both the `UninterpolatedPlaceholder` and `SuspectedSwallowedStep` messages reproduce author content in full (threat T-02-02, ACCEPTED). The F8 DocString test asserts the *tail* of a long body specifically so a reintroduced cap fails.
- **No similarity matching against dialect keywords for F14.** Marked speculative and out of scope by the research; `grep -ci 'levenshtein\|edit distance'` is 0. The message says outright that a description is legal Gherkin and that this is a heuristic.
- **No warning path throws.** Every `throw` in the file sits inside an error check (lines 638–688); none is at a `makeWarning` call site.
- **No control characters in either source file.** `od -c … | grep -c '\\0'` is 0 for both — checked deliberately, because 02-07 hit exactly that bug and it makes every grep-based acceptance criterion silently unverifiable.

## Issues Encountered

- The worktree was spawned at a stale base (`f640f4a`, before Phase 2 existed) and had no `node_modules`. Resolved by `git reset --hard fe506f5` — which ran only after the HEAD assertion confirmed a `worktree-agent-*` branch — then `pnpm install --frozen-lockfile`.
- `vitest` intercepts `console.log` by default in this configuration. The one-off probes used to confirm the F7/F8 error shapes and the four warning payloads were run with `--disable-console-intercept`. The probe file was deleted before each task was committed; `git status` is clean of it and it never entered history.
- `dprint check` rejected two multi-line template-literal arrow functions in the test file (it wants the body on its own line). Fixed with `pnpm format`; both `pnpm lint` and the suite re-run clean afterwards.

## Verification Results

| Gate | Result |
| --- | --- |
| `pnpm build` (`tsc -b`) | exit 0 |
| `pnpm lint` (oxlint + dprint check) | exit 0 |
| `pnpm circular` (madge) | no circular dependency found |
| `pnpm vitest run packages/gherkin/test/Validate.test.ts` | 27 passed (requirement: at least 20) |
| `pnpm test` (whole repo, wave gate) | 8 files, 193 tests passed |
| `grep -c 'new RegExp' Validate.ts` | 0 (threat T-02-01) |
| Regex literals in `packages/gherkin/src` | 1 — `PLACEHOLDER`, at module scope |
| `grep -o 'docString\|dataTable\|\.text' Validate.ts \| sort -u \| wc -l` | 3 — all three scan targets present |
| `grep -c 'exampleColumns' Validate.ts` | 1 (requirement: at least 1) |
| `grep -c '"UninterpolatedPlaceholder"' Validate.ts` | 1 (requirement: at least 1) |
| `grep -c 'known .*limitation for Backgrounds nested under a Scenario Outline' Validate.ts` | 1 — ADR-EC-014's wording, on one line |
| `grep -cE 'slice\(0,\|substring\(0,\|\.\.\.' Validate.ts` | 0 — no truncation of message content |
| Group C reasons in `Validate.ts` | 4 of 4 |
| `grep -c 'makeWarning' Validate.ts` | 5 (requirement: at least 4) |
| `grep -c 'examplesHeaders' Validate.ts` | 2 (requirement: at least 1) |
| `grep -ci 'levenshtein\|edit distance' Validate.ts` | 0 |
| `grep -n 'throw' Validate.ts` | throws only inside error checks, never at a `makeWarning` call site |
| `Validate.ts` line count | 728 (requirement: at least 220) |
| Group C reasons asserted in `Validate.test.ts` | 4 of 4 |
| `grep -c '2 < 3' Validate.test.ts` | 2 (requirement: at least 1) |
| `grep -c '<div>hello</div>' Validate.test.ts` | 2 (requirement: at least 1) |
| `grep -c '<a@b.com>' Validate.test.ts` | 2 (requirement: at least 1) |
| `grep -c 'limitation for Backgrounds nested under a Scenario Outline' Validate.test.ts` | 1 (requirement: at least 1) |
| `grep -c '1 and <b>' Validate.test.ts` | 2 (requirement: at least 1) |
| `od -c` NUL-byte count, both files | 0 |

## Known Stubs

None. `validateFeature` is complete: eleven distinct silent-failure modes (F1–F9, F11, F13, F14, F22) are now either a named located error or a named warning. The only thing still absent from the package is `loadFeature` itself, which is plan 02-09's deliverable and is not a stub here — nothing in this file references it.

## Threat Flags

None. This plan adds no network endpoint, no auth path, no file access and no schema at a trust boundary. Both trust boundaries it touches were already in the plan's register.

Register dispositions honoured:

- **T-02-01 (DoS, ReDoS via a feature-derived pattern)** — mitigated as specified. Exactly one regex, a module-scope fixed literal, matched *against* feature text. Its inner class excludes both `<` and `>`, so the quantifier cannot nest and there is no backtracking path. `new RegExp` count is 0 across both packages, and the direction distinction is recorded in the doc comment so it survives a future edit.
- **T-02-02 (Information disclosure, full DataTable/DocString content in messages)** — **accepted** as specified, deliberately overriding the researcher's truncate-by-default recommendation. Both message paths reproduce author content in full. The acceptance greps for `slice(0,`, `substring(0,` and an ellipsis all return 0, and the F8 DocString test asserts the tail of a long body so a reintroduced cap fails by name rather than silently.
- **T-02-18 (Repudiation, over-broad detection rejecting valid files)** — mitigated. Check alpha is column-aware and Outline-scoped (zero false positives); check beta is a warning. The three verified-legitimate step texts are explicit negative tests asserting *zero* warnings in a plain Scenario, plus a bounding test asserting that the same texts inside an Outline warn at most and never throw.
- **T-02-19 (Repudiation, a silently dropped Examples column shipping unnoticed)** — mitigated. F9 emits `UnknownPlaceholder` naming the columns that do exist, on the returned array for Phase 6 to surface. The upstream issue is still open, so this will not be fixed for us; the verified `1 and <b>` step text is pinned so a future upstream fix is detected rather than assumed.

## Next Phase Readiness

- **Plan 02-09** composes `readFeatureSource → parseDocument → compilePickles → correlateFeature → validateFeature`, joining `ParsedFeatureCore` with the returned `ReadonlyArray<LoadFeatureWarning>` into `ParsedFeature`. `validateFeature`'s signature is unchanged from 02-07, so nothing there needs adjusting.
- **Phase 6** owns how a warning reaches a human (Decision D6). This phase produces only the data; the array is already reason-tagged, located, and in document order, and MATCH-05 needs the same Feature-level channel.
- The `REQUIREMENTS.md` rows for PARSE-01, PARSE-02 and PARSE-03 remain `Pending` and should be marked together once `loadFeature` exists — see Decisions Made.
- Shared orchestrator artifacts (`STATE.md`, `ROADMAP.md`) were deliberately **not** modified — this plan ran as a parallel worktree executor, and the orchestrator owns those writes after the wave merges.

## Self-Check: PASSED

Both claimed artifacts verified on disk (`packages/gherkin/src/Validate.ts` 728 lines, `packages/gherkin/test/Validate.test.ts` 365 lines) and all three claimed commits verified present in `git log` (`d3d5863`, `b6049bf`, `55a2086`).

---

*Phase: 02-loadfeature-parse-compile-correlate*
*Completed: 2026-08-28*

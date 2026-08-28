---
phase: 02-loadfeature-parse-compile-correlate
plan: 07
subsystem: gherkin-parsing
tags: [gherkin, cucumber, validation, error-reporting, fail-loudly, adr-ec-019, parse-03, vitest]

# Dependency graph
requires:
  - phase: 02-02
    provides: "packages/gherkin/src/Errors.ts — LoadFeatureError, its ten reason tags, and the LoadFeatureWarning carrier this pass returns"
  - phase: 02-03
    provides: "packages/gherkin/src/Model.ts — ParsedFeatureCore and the Pickle re-export; plus the Group A fixture corpus"
  - phase: 02-05
    provides: "packages/gherkin/src/Correlate.ts — CorrelationResult, AstIndex, AstScenarioInfo, and the dialect-backed isOutlineKeyword / isScenarioKeyword helpers"
provides:
  - "packages/gherkin/src/Validate.ts — validateFeature(result: CorrelationResult) => ReadonlyArray<LoadFeatureWarning>, throwing LoadFeatureError on the first problem in document order"
  - "The four Group A structural checks: OutlineWithoutExamples (F3), EmptyExamples (F1/F2), ScenarioKeywordWithExamples (F4), ZeroStepScenario (F5/F6)"
  - "The per-scope DuplicateScenarioName check (F22) — the locked resolution of ARCHITECTURE.md Open Question 4's name-collision hole"
  - "The F14 / Pitfall P7 mitigation: the ZeroStepScenario message quotes the AST Scenario description verbatim, so a swallowed sole step explains itself"
  - "A marked extension point in Validate.ts where plan 02-08 adds the leftover-placeholder scan and the Group C warnings"
  - "packages/gherkin/test/Validate.test.ts — 13 tests asserting err.reason, with a positive control and the per-scope negative control"
affects: [02-08, 02-09, 02-10, 02-11]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Validation is a separate pass over the correlated result, never checks inlined into the AST walk — a failing fixture then names which of the two broke"
    - "Throw on the first problem in document order; accumulate non-fatal findings and return them. BEH-EC-001's signature is a plain value, so a throw is the only in-signature failure"
    - "One error-constructor function per reason tag, each carrying its own [VERIFIED] doc comment, rather than one generic fail() with a tag parameter"
    - "Every message is shaped `uri:line: <reason>: <what happened, then what to do>` because loadFeature runs at module top level and a throw becomes a whole-file vitest collection error"
    - "The F4 check uses isScenarioKeyword positively, not the bare negative of isOutlineKeyword — an error that accuses the author of a wrong keyword must only fire on a positively-classified keyword"
    - "Duplicate detection keys on the pair (ruleId ?? sentinel, un-interpolated AST name), never on a compiled scenario name, so an Outline's repeating row names cannot produce a false collision"
    - "A refuted check is recorded in the doc comment with its verified refutation, so it cannot be re-added by a future contributor reading PITFALLS.md"
    - "Tests assert err.reason, never message prose — the exceptions are the two rows where message content IS the requirement (both line numbers; the verbatim description)"

key-files:
  created:
    - packages/gherkin/src/Validate.ts
    - packages/gherkin/test/Validate.test.ts
  modified: []

key-decisions:
  - "The F4 branch is guarded by isScenarioKeyword in addition to !isOutlineKeyword, per the plan's instruction to use it where the negative is not precise enough — a dialect keyword that is neither form must not trigger a wrong-keyword accusation"
  - "The duplicate-name check runs AFTER the structural checks within each node's iteration, so a Scenario that is both a duplicate and structurally broken reports the structural defect, which is the more actionable one"
  - "The swallowed-step verbatim assertion uses an inline source rather than a fixture, because zero-step-scenario.feature's zero-step Scenario has an empty description and cannot exercise that path"
  - "REQUIREMENTS.md left untouched: PARSE-03 is worded as the leftover-placeholder check, which is plan 02-08's deliverable, not this plan's"

patterns-established:
  - "Doc comments carry the evidence, not just the intent: each check names the [VERIFIED] upstream behavior that makes it necessary, so the check cannot be deleted as redundant by someone who has not reproduced it"
  - "A deliberately-unimplemented check gets a named doc-comment entry with its refutation (threat T-02-17), which an acceptance criterion then greps for"

requirements-completed: []

# Metrics
duration: 12min
completed: 2026-08-28
---

# Phase 02 Plan 07: Validate — the Structural Reconciliation Pass Summary

**Every silently-zero and silently-wrong `compile()` output in fixture rows F1–F6 and F22 now raises a distinct, named, located `LoadFeatureError` from a pass that is separate from correlation by design — and the zero-step message quotes the Scenario description verbatim, so the phase's most confusing failure (a step keyword typo swallowed into the description) explains itself.**

## Performance

- **Duration:** ~12 min
- **Tasks:** 3
- **Files created:** 2 (301 + 186 lines)

## Accomplishments

- `validateFeature(result: CorrelationResult)` iterates `index.astScenarios` in document order, looks each node's pickles up through `index.byScenarioId`, and throws on the first mismatch. Deterministic ordering is what lets a fixture assert *which* error fired.
- All four structural reasons implemented against the verified truth table, each with the upstream behavior that motivates it recorded in its doc comment:
  - **F3 `OutlineWithoutExamples`** — an Outline keyword with `examplesCount === 0`. `compile()` takes the plain-Scenario branch and emits one pickle whose step text keeps its literal `<placeholders>`, so the scenario *runs* rather than failing.
  - **F1/F2 `EmptyExamples`** — an Outline whose pickle array is empty. An `Examples:` with no header, or a header with no body rows, compiles to nothing and the AST node is orphaned.
  - **F4 `ScenarioKeywordWithExamples`** — a plain Scenario keyword with `examplesCount > 0`. `compile()` branches on `examples.length` and never on the keyword.
  - **F5/F6 `ZeroStepScenario`** — any pickle with `steps.length === 0`, at feature level or inside a Rule, where the Background steps are dropped along with it.
- Keyword classification goes entirely through `Correlate.ts`'s dialect-backed helpers. No English keyword string is hardcoded, so the F3/F4 checks are exact in all 80 languages.
- **The F14 / Pitfall P7 mitigation is delivered and pinned.** When the AST node's `description` is non-empty, the `ZeroStepScenario` message appends an explanation that a mistyped step keyword written *before* any valid step is silently absorbed into the description, then reproduces the description verbatim — no ellipsis, no truncation, indentation preserved. The test pins that `Scenario: ok` followed by only `Ginve x` yields `description === "    Ginve x"` and that the exact string appears in the message.
- **The per-scope duplicate-name rule is implemented and proven in both directions.** `duplicate-scenario-name.feature` is rejected with both line numbers named and `err.line` at the second occurrence (line 6); `duplicate-scenario-name-across-rules.feature` stays legal. The negative control is the executable form of the locked scope decision — a whole-Feature implementation passes every other test in the file and fails only there.
- **PITFALLS.md Pitfall 30's check is not implemented, and the module says why.** The refutation is recorded in the doc comment with the grammar production and the fixture that pins the parse error, so a future contributor reading PITFALLS.md cannot re-add dead work (threat T-02-17).
- 13 tests in `Validate.test.ts` (requirement: at least 10). Whole-repo suite: 8 files, 160 tests, all passing.

## Task Commits

1. **Task 1: `src/Validate.ts` with the AST-vs-pickle reconciliation checks** — `ebb7a8d` (feat)
2. **Task 2: per-scope duplicate Scenario name rejection** — `4ed639e` (feat)
3. **Task 3: `test/Validate.test.ts`, one test per Group A structural reason** — `654538c` (test)

## Files Created

- `packages/gherkin/src/Validate.ts` (301 lines) — `validateFeature`, plus the module-private `at`, `describeNode`, `outlineWithoutExamples`, `emptyExamples`, `scenarioKeywordWithExamples`, `zeroStepScenario`, `lineOf`, `uniquenessKey`, `duplicateScenarioName` and `scopeLabel`
- `packages/gherkin/test/Validate.test.ts` (186 lines) — the `correlate` / `validate` / `errorFrom` / `errorFromFixture` helpers (one `IdGenerator.uuid()` shared by parse and compile), 6 Group A reason assertions, the located-and-attributed sweep over all 7 rejected fixtures, 3 duplicate-name assertions, the positive control, and 2 swallowed-step message assertions

## Decisions Made

- **The F4 branch requires `isScenarioKeyword`, not merely `!isOutlineKeyword`.** The plan asked for `isScenarioKeyword` "where the negative of `isOutlineKeyword` is not precise enough for a dialect that has extra keyword forms". This is that place: the error text accuses the author of using the wrong keyword, so it must only fire when the keyword is *positively* classified as a plain scenario keyword in that dialect. An unknown-dialect node (both helpers answer `false`) now falls through silently instead of being accused, which is the correct behavior — an unrecognised `# language:` header is already rejected as `UnknownDialect` in `Parser.ts` long before this point.
- **The duplicate-name check runs after the structural checks for each node.** Both orderings satisfy "first error in document order" for every fixture in the corpus, since no fixture is both. Where they could differ — a Scenario that is both a duplicate *and* zero-step — reporting the structural defect is more actionable: the author has two problems and the missing steps are the one that makes the test pass while asserting nothing.
- **The verbatim-description test uses an inline source, not a fixture.** The plan anticipated this ("or add a targeted inline source if the fixture's zero-step Scenario has an empty description"). Verified: `zero-step-scenario.feature`'s `Scenario: no steps` has `description === ""`, so it exercises the zero-step path but *not* the mitigation. The inline `Scenario: ok` / `Ginve x` source produces `description === "    Ginve x"` with one pickle holding zero steps — the exact intersection of F5 and F14. No fixture file was added, because the fixture corpus is a 1:1 map of the research fixture table and this is a test of message content, not a new row.
- **`REQUIREMENTS.md` untouched.** PARSE-03 is worded specifically as "a Background step with a leftover un-interpolated `<placeholder>` … fails with a specific, named error". That check is plan 02-08's deliverable, not this one's. Checking the box today would make `REQUIREMENTS.md` assert something untrue, which AGENTS.md §4 forbids. This follows the precedent 02-04 and 02-05 set.
- **`Validate.ts` is not exported from `index.ts`.** The barrel replacement belongs to a later plan and `index.ts` is outside this plan's `files_modified`. Nothing here imports the barrel, so the module DAG stays acyclic (`pnpm circular` confirms).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] A raw NUL byte was written into `Validate.ts` instead of a ` ` escape**

- **Found during:** Task 2, immediately after adding `uniquenessKey`
- **Issue:** The key encoding joins `(ruleId, name)` with a NUL separator. The literal control character ended up in the source file rather than the two-character escape sequence. This made the file **binary** as far as `grep` was concerned — every acceptance-criteria grep against `Validate.ts` silently returned nothing, including `grep -c ""`, which is how it was caught. `tsc` and `dprint` both accepted the file without complaint, so nothing else would have surfaced it, and every one of the plan's grep-based acceptance criteria would have been unverifiable (and trivially "passing" for a reader who did not notice the empty output).
- **Fix:** Replaced the raw byte with the escape sequence ` ` via `perl -0777 -i -pe`, leaving the runtime key value identical and the source plain ASCII.
- **Files modified:** `packages/gherkin/src/Validate.ts`
- **Verification:** `od -c … | grep -c '\\0'` = 0; every acceptance grep produces output again; `pnpm build`, `pnpm lint`, `pnpm circular` all exit 0
- **Committed in:** `4ed639e` (fixed before the task was committed; no bad byte ever reached history)

### Deliberate Non-Deviations

- **No check for a feature-level `Background:` after a `Rule:`.** Explicitly instructed, and the refutation is recorded in the module doc comment as required. The two `grep -iE 'background.*after.*rule'` hits are both inside that doc comment (lines 28 and 32), which is exactly what the acceptance criterion asks for.
- **`validateFeature` always returns an empty array in this plan.** That is the specified shape, not a stub: the `warnings` accumulator and the `ReadonlyArray<LoadFeatureWarning>` return type exist so plan 02-08 adds Group C findings to this same function without a signature change. The extension point is marked in a comment naming each check 02-08 owns and the `AstIndex` field it reads.
- **No `RegExp` anywhere in `Validate.ts`.** Every check is a structural comparison or a `Map` lookup, per the T-02-01 disposition. Plan 02-08 introduces the single fixed-literal placeholder regex.
- **The duplicate-name test asserts message content, and that is sanctioned.** The file's rule is "assert `err.reason`, never message text"; the plan explicitly overrides it for this row ("additionally assert the message contains BOTH line numbers"). It is asserted with word-boundary regexes on the numbers rather than by pinning the surrounding prose, so a reworded message still passes.

---

**Total deviations:** 1 auto-fixed (Rule 1 — a self-inflicted encoding bug caught by the acceptance greps themselves)
**Impact on plan:** None on scope or design. Every specified export, check, message property and assertion was delivered.

## Issues Encountered

- The worktree was spawned at a stale base (`f640f4a`, before Phase 2 existed) and had no `node_modules`. Resolved by `git reset --hard 57098a8` per the startup branch check — which ran only after the HEAD assertion confirmed a `worktree-agent-*` branch — then `pnpm install --frozen-lockfile`.
- `vitest` suppresses `console.log` by default in this configuration, so the one-off probe used to confirm the swallowed-step `description` value asserted against a sentinel to surface the parsed shape in the failure diff instead. The probe file was deleted before the task was committed; `git status` is clean of it.

## Verification Results

| Gate | Result |
| --- | --- |
| `pnpm build` (`tsc -b`) | exit 0 |
| `pnpm lint` (oxlint + dprint check) | exit 0 — also proves the F1/F2 titles differ under `vitest/no-identical-title` |
| `pnpm circular` (madge) | no circular dependency found |
| `pnpm vitest run packages/gherkin/test/Validate.test.ts` | 13 passed (requirement: at least 10) |
| `pnpm test` (whole repo) | 8 files, 160 tests passed |
| Distinct structural reasons in `Validate.ts` | 4 of 4 |
| `grep -c 'isOutlineKeyword' Validate.ts` | 4 (requirement: at least 1) |
| `grep -ciE '"Scenario Outline"\|"Scenario Template"' Validate.ts` | 0 — no hardcoded English keywords |
| `grep -c 'description' Validate.ts` | 9 (requirement: at least 1) |
| `grep -ciE 'background.*after.*rule' Validate.ts` | 2, both inside the doc comment recording the refutation |
| `grep -c 'new RegExp' Validate.ts` | 0 (threat T-02-01) |
| `grep -c 'from "./index' Validate.ts` | 0 |
| `grep -c 'ReadonlyArray<LoadFeatureWarning>' Validate.ts` | 1 (requirement: at least 1) |
| `grep -c '"DuplicateScenarioName"' Validate.ts` | 1 (requirement: at least 1) |
| `grep -c 'ruleId' Validate.ts` | 5 — the map key includes the scope |
| `grep -c 'node.name' Validate.ts` | 3 (requirement: at least 1) |
| `grep -c 'pickle.name' Validate.ts` | 0 — the key is the un-interpolated name |
| `od -c Validate.ts \| grep -c '\\0'` | 0 — no control characters in source |
| `Validate.ts` line count | 301 (requirement: at least 120) |
| Distinct reasons asserted in `Validate.test.ts` | 5 of 5 |
| `grep -c 'duplicate-scenario-name-across-rules' Validate.test.ts` | 1, asserted with `.not.toThrow()` |
| `grep -c 'correlation-full.feature' Validate.test.ts` | 2 (the positive control) |
| `grep -c 'from "../src/index' Validate.test.ts` | 0 (no barrel import) |
| `grep -c 'it.only' Validate.test.ts` | 0 |

## Known Stubs

None that block this plan's goal. One deliberate, documented incompleteness: `validateFeature` returns an empty warning array because every Group C warning belongs to plan 02-08, which the plan states explicitly and which the marked extension point names check by check. The error path — this plan's actual deliverable — is complete and fully exercised.

## Threat Flags

None. This plan adds no network endpoint, no auth path, no file access and no schema at a trust boundary. Both trust boundaries it touches were already in the plan's register.

Register dispositions honoured:

- **T-02-16 (Repudiation, silent-wrong `compile()` output producing a false-green test)** — mitigated: rows F1–F6 and F22 each raise a distinct, named, located `LoadFeatureError` from a dedicated pass, with one test per reason asserting `err.reason`, plus a sweep asserting `err.uri` and a numeric `err.line` on every rejected fixture.
- **T-02-02 (Information disclosure, Scenario `description` quoted verbatim)** — accepted as specified: full content, no truncation, no ellipsis, indentation preserved. A test asserts the absence of both `…` and `...` in the message so a length cap cannot be reintroduced quietly.
- **T-02-01 (DoS, ReDoS via a feature-derived `RegExp`)** — mitigated: `grep -c 'new RegExp'` on `Validate.ts` is 0 and no regex literal appears either; every check is a structural comparison or a `Map` lookup.
- **T-02-17 (Tampering, dead-work check reintroduction)** — mitigated: the verified refutation of PITFALLS.md Pitfall 30 is recorded in the module doc comment with the grammar production, the exception class, and the fixture that pins the parse error.

## Next Phase Readiness

- **Plan 02-08** adds to this same file at the marked extension point: the exact leftover-placeholder scan (F7/F8, `UninterpolatedPlaceholder`) reading `index.exampleColumns`, and the Group C warnings (`UnknownPlaceholder` F9 via `exampleColumns`, `DuplicateExamplesColumn` F11 via `AstScenarioInfo.examplesHeaders`, `EmptyRule` F13 via `AstRuleInfo.scenarioIds`, `SuspectedSwallowedStep` F14). All four inputs are already on the `AstIndex` and need no second AST walk.
- The `warnings` accumulator and the `ReadonlyArray<LoadFeatureWarning>` return type are in place, so 02-08 changes no signature.
- `loadFeature.ts` composes `readFeatureSource` → `parseDocument` → `compilePickles` → `correlateFeature` → `validateFeature`, joining `ParsedFeatureCore` with the returned warnings into `ParsedFeature`.
- The `REQUIREMENTS.md` row for PARSE-03 remains `Pending` and belongs to plan 02-08, which lands the leftover-placeholder check the requirement is actually worded around.
- Shared orchestrator artifacts (`STATE.md`, `ROADMAP.md`) were deliberately **not** modified — this plan ran as a parallel worktree executor alongside 02-06, and the orchestrator owns those writes after the wave merges.

## Self-Check: PASSED

Both claimed artifacts verified on disk (`packages/gherkin/src/Validate.ts` 301 lines, `packages/gherkin/test/Validate.test.ts` 186 lines) and all three claimed commits verified present in `git log` (`ebb7a8d`, `4ed639e`, `654538c`).

---

*Phase: 02-loadfeature-parse-compile-correlate*
*Completed: 2026-08-28*

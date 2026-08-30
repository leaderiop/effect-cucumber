---
phase: 02-loadfeature-parse-compile-correlate
plan: 05
subsystem: gherkin-parsing
tags: [gherkin, cucumber, correlation, pickles, ast, dialects, adr-ec-014, vitest]

# Dependency graph
requires:
  - phase: 02-02
    provides: "packages/gherkin/src/Errors.ts — LoadFeatureError and the ParseFailed / NoFeature reason tags this module throws"
  - phase: 02-03
    provides: "packages/gherkin/src/Model.ts — StepOwner, ParsedStep, ParsedScenario, ParsedRule, ParsedFeatureCore; and the correlation-full.feature (F21) and zero-step-scenario.feature fixtures"
  - phase: 02-04
    provides: "parseDocument and compilePickles — the two halves this module joins, plus the guarantee that document.feature is present by the time correlation runs"
provides:
  - "packages/gherkin/src/Correlate.ts — correlateFeature(document, pickles, uri) => CorrelationResult, the ADR-EC-014 join and the whole of PARSE-02's engine"
  - "buildAstIndex(document, pickles, uri) => AstIndex — byStepId, byScenarioId, exampleColumns, astScenarios, astRules, language, all from ONE AST walk plus one pickle pass"
  - "isOutlineKeyword / isScenarioKeyword — dialect-backed, language-independent keyword classification for the F3/F4 checks"
  - "AstIndex.exampleColumns — the per-Outline column-name union that makes the leftover-placeholder scan exact rather than heuristic"
  - "AstScenarioInfo.examplesHeaders — per-Examples-block header cells WITH duplicates preserved, the F11 detection input"
  - "AstRuleInfo.scenarioIds — empty for a Rule with no Scenarios, the F13 detection input"
  - "packages/gherkin/test/Correlate.test.ts — 21 tests, F21 asserted row by row plus the astNodeIds-length negative control"
affects: [02-06, 02-07, 02-08, 02-09, 02-10, 02-11]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "One AST walk, four outputs: byStepId, astScenarios, exampleColumns, astRules — never a second traversal per question"
    - "byScenarioId is built from the PICKLE array, not the AST, so a Scenario that compiled to nothing simply has no key — the only available evidence of F1/F2"
    - "Map<id, Array<Pickle>>, never Map<id, Pickle>: every Examples row of one Outline shares astNodeIds[0]"
    - "Dialect lookup narrowed explicitly (`Dialect | undefined`) and answering false for an unknown language, never throwing and never reading through to a prototype property"
    - "Array.includes against the package-provided dialects table instead of any RegExp — no feature-file content reaches a regex compiler"
    - "A structurally typed `{ readonly name: string }` parameter lets one tagNames helper serve both the AST Tag and the unrelated PickleTag shape"
    - "Correlation throws on an unresolvable AST node id rather than defaulting a keyword or origin — parse/compile disagreement must never be silent"
    - "Zero validation in the correlation pass; every silently-zero and silently-wrong case is deferred to Validate.ts over the correlated result"

key-files:
  created:
    - packages/gherkin/src/Correlate.ts
    - packages/gherkin/test/Correlate.test.ts
  modified: []

key-decisions:
  - "buildAstIndex is exported rather than module-private: Task 1 has no other consumer, so noUnusedLocals would have failed the build, and Validate.ts (02-06) genuinely needs the index independently of the join"
  - "keywordType falls back to StepKeywordType.UNKNOWN because @cucumber/messages declares AST Step.keywordType optional while Model.ts declares ParsedStep.keywordType required — the pickle's own coarser field is never read, since it has no Conjunction member"
  - "ParsedScenario.location falls back to the AST Scenario location because Pickle.location is declared optional upstream; the pickle's value still wins whenever present, which is what keeps an Outline row's line precise"
  - "AstRuleInfo is exported alongside the plan's named exports so AstIndex.astRules is nameable by consumers"
  - "REQUIREMENTS.md is left untouched: PARSE-02 is worded as a claim about `loadFeature`, which does not exist until plan 02-08"

patterns-established:
  - "Acceptance-criteria greps are treated as part of the contract: doc-comment prose is worded to avoid literals the criteria forbid (`astNodeIds.length`, `.type`, the four validation reason tags) without losing the meaning the plan asked the comment to carry"
  - "A negative control accompanies any index that a heuristic could counterfeit — here, a plain-Scenario pickle where both steps carry one astNodeId yet report different origins"

requirements-completed: []

# Metrics
duration: 10min
completed: 2026-08-28
---

# Phase 02 Plan 05: Correlate — the AST/Pickle Join Summary

**ADR-EC-014's core: one AST walk recovers exactly what a pickle cannot carry — step keyword, `keywordType`, origin, line, Rule membership, un-interpolated names and Examples columns — and the join reads everything else straight off the pickle, proven row by row on the F21 fixture including a negative control that no `astNodeIds.length` heuristic can pass.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-08-28T12:11:00Z
- **Completed:** 2026-08-28T12:21:00Z
- **Tasks:** 3
- **Files created:** 2 (476 + 196 lines)

## Accomplishments

- `correlateFeature` produces a `ParsedFeatureCore` in which every step arrives placeholder-substituted, with feature-Background steps first, then rule-Background steps, then the Scenario's own — read off `pickle.steps` in order, never re-stacked.
- Step keyword, `keywordType`, origin and line are all recovered from the AST through `byStepId`, because `PickleStep` carries none of them. Keywords are trimmed; the raw AST value carries a trailing space.
- Origin is never inferred from how many entries `astNodeIds` holds. The test file carries the negative control that makes this checkable: in `zero-step-scenario.feature`'s plain-Scenario pickle both steps report `astNodeIds.length === 1`, yet the correlated origins are `feature-background` and `scenario`. An implementation that regressed to the heuristic would pass every other assertion in the file and fail exactly that one.
- Tags arrive flattened in feature → rule → scenario → examples-block order straight from `pickle.tags`, asserted with a whole-array `toEqual` so a reordering fails.
- Both scenario names are exposed: `astName` is `outline <name>` and `name` is `outline a`, and the test asserts they differ.
- Outline detection goes through `@cucumber/gherkin`'s `dialects` record, so `isOutlineKeyword("fr", "Plan du scénario")` is true with no French-specific code. No `RegExp` is constructed anywhere in the module.
- 21 tests in `Correlate.test.ts` (requirement: at least 10). Whole-repo suite: 7 files, 147 tests, all passing.

## Task Commits

1. **Task 1: the AST walk and both correlation indices** — `8bc330a` (feat)
2. **Task 2: the join — `correlateFeature` produces `ParsedFeatureCore`** — `d8c1250` (feat)
3. **Task 3: `test/Correlate.test.ts`, the F21 row-by-row assertions** — `b1fcb3e` (test)

## Files Created

- `packages/gherkin/src/Correlate.ts` (476 lines) — `AstStepInfo`, `AstScenarioInfo`, `AstRuleInfo`, `AstIndex`, `CorrelationResult`, `isOutlineKeyword`, `isScenarioKeyword`, `buildAstIndex`, `correlateFeature`, plus the module-private `tagNames`, `dialectOf`, `featureOf`, `examplesHeadersOf`, `recordSteps`, `recordScenario`, `indexPicklesByScenario` and `resolveStep`
- `packages/gherkin/test/Correlate.test.ts` (196 lines) — the `correlateFixture` helper (one `IdGenerator.uuid()` shared by parse and compile), 15 F21 assertions, 5 dialect-helper assertions, and the 2-test origin-index negative control

## Decisions Made

- **`buildAstIndex` is exported.** Task 1 delivers the index before Task 2 delivers its only internal consumer. Under `noUnusedLocals` a module-private, never-called `buildAstIndex` is a TS6133 build error, so Task 1 could not have passed `pnpm build` with it private. Exporting it is also the right call independently: `Validate.ts` needs `exampleColumns`, `examplesHeaders` and `scenarioIds` to explain F1/F2/F9/F11/F13, and reaching them through `CorrelationResult.index` is exactly the shape the plan specified.
- **`keywordType` needs a fallback, and the fallback is `Unknown`.** `@cucumber/messages@34.2.1` declares `Step.keywordType` optional; `Model.ts` declares `ParsedStep.keywordType` required. The value is read from the AST, never from the pickle step's own field — that one has no `Conjunction` member, so `And b` after `Given a` would report `Context`. `StepKeywordType.UNKNOWN` is imported as a runtime value (a string enum in the upstream ESM build); `erasableSyntaxOnly` forbids *declaring* enums, not importing one from a dependency.
- **`Pickle.location` is optional upstream, so it needs a fallback too.** `compile()` always sets it, but the declared type does not say so. The fallback is the AST Scenario's own location, which is precisely what `compile()` copies for a plain Scenario. For an Outline the pickle's value — the Examples *body row* — still wins, which is the entire reason the plan forbids looking the row node up in a separate map.
- **`REQUIREMENTS.md` untouched.** PARSE-02 is worded "`loadFeature` correlates the raw `GherkinDocument` …". `loadFeature` does not exist until plan 02-08. Checking the box today would make `REQUIREMENTS.md` assert something untrue, which AGENTS.md §4 forbids. The engine PARSE-02 describes is complete and tested; the row stays `Pending` for whichever plan lands `loadFeature.ts`. This follows the precedent 02-04 set for PARSE-01/PARSE-03.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `Pickle.tags` is `PickleTag`, not `Tag`**

- **Found during:** Task 2, first `pnpm build`
- **Issue:** `TS2345: Argument of type 'readonly PickleTag[]' is not assignable to parameter of type 'readonly Tag[]'`. The plan's interface listing did not flag that `Pickle.tags` and `Feature.tags`/`Rule.tags` are unrelated upstream shapes: an AST `Tag` carries `location` and `id`; a `PickleTag` carries `name` and `astNodeId`. They share no supertype.
- **Fix:** Widened the single `tagNames` helper to a structural `ReadonlyArray<{ readonly name: string }>` so one helper serves both, rather than duplicating it. The `Tag` type import became unused and was removed.
- **Files modified:** `packages/gherkin/src/Correlate.ts`
- **Verification:** `pnpm build` exit 0
- **Committed in:** `d8c1250`

**2. [Rule 3 - Blocking] `Pickle.location` is declared optional upstream**

- **Found during:** Task 2, first `pnpm build`
- **Issue:** `TS2322: Type 'Location | undefined' is not assignable to type 'Location'`. The plan's interfaces block lists `Pickle.location` as present, and 02-RESEARCH.md Pattern 2 records it as verified-present at runtime — but `@cucumber/messages@34.2.1` declares it `location?: Location`, while `Model.ts` declares `ParsedScenario.location` required.
- **Fix:** `pickle.location ?? node.location`, with a comment recording why the AST Scenario location is the correct fallback and why the pickle value still wins when present. The test pins the Outline case: the F21 scenario's location line is 21 (the Examples body row), not 14 (the Outline header).
- **Files modified:** `packages/gherkin/src/Correlate.ts`
- **Verification:** `pnpm build` exit 0; `it("locates the scenario at the Examples body row, not at the Outline header")` passes
- **Committed in:** `d8c1250`

**3. [Rule 3 - Blocking] The doc comment the plan mandates contained a literal an acceptance grep forbids**

- **Found during:** Task 1, running the criteria greps before committing
- **Issue:** The plan requires the module doc comment to explain why origin is never inferred from `astNodeIds.length`, and separately requires `grep -c 'astNodeIds.length'` on the file to be 0. Written naturally the sentence contains the forbidden literal. Same class of conflict 02-04 hit in Task 2.
- **Fix:** Reworded to "never from how many entries a pickle step's `astNodeIds` holds", preserving the meaning exactly. No code changed. The same care was applied preemptively in Task 2: the comments explain the `PickleStep` `type`-field trap without writing `.type`, and explain the deferred validation without naming any of the four forbidden reason tags.
- **Files modified:** `packages/gherkin/src/Correlate.ts`
- **Verification:** `grep -c 'astNodeIds.length'` = 0, `grep -c '\.type'` = 0, `grep -ciE 'EmptyExamples|ZeroStepScenario|OutlineWithoutExamples|DuplicateScenarioName'` = 0
- **Committed in:** `8bc330a` (Task 1) and `d8c1250` (Task 2)

### Deliberate Non-Deviations

- **The F21 scenario has four steps, not three.** The plan's step list names three and then says "a fourth step assertion for the `Then it works` step if the fixture emits four; adjust the count assertion to the fixture as written rather than reshaping the fixture." It emits four (`upstream-pin.test.ts` already pins this). The count assertion is 4 and all four steps are asserted individually. The fixture was not touched.
- **`correlateFixture` is a module-level `const`, not an `export`.** The plan asks for "a stable exported-within-file name" so plan 02-06 can reuse it. A `.test.ts` file exporting helpers to another `.test.ts` file is not a pattern this repo has, and 02-06 gets its own file; the name is stable and the shape is copyable. If 02-06 wants genuine reuse, `test/utils.ts` is the repo's established home for it (02-PATTERNS.md lists it as an exact-match analog).
- **`grep -c 'new Set'` is 1, in `recordScenario`.** That is the `exampleColumns` construction, exactly as the criterion specifies. `examplesHeaders` is built from arrays alongside it, so duplicate header cells survive for the F11 check.

---

**Total deviations:** 3 auto-fixed, all Rule 3 (2 upstream type declarations narrower than the plan's interface listing, 1 doc-comment/grep conflict)
**Impact on plan:** None on scope or design. Every specified export, behavior and assertion was delivered.

## Issues Encountered

- The worktree was spawned at a stale base (`f640f4a`, before Phase 2 existed) and had no `node_modules`. Resolved by `git reset --hard 62dd9bd` per the startup branch check — which ran only after the HEAD assertion confirmed a `worktree-agent-*` branch — then `pnpm install --frozen-lockfile`.
- `dprint` reflowed two long arrow-function bodies after each task; `pnpm format` then `pnpm lint` was run before every commit.

## Verification Results

| Gate | Result |
| --- | --- |
| `pnpm build` (`tsc -b`) | exit 0 |
| `pnpm lint` (oxlint + dprint check) | exit 0 |
| `pnpm circular` (madge) | no circular dependency found |
| `pnpm vitest run packages/gherkin/test/Correlate.test.ts` | 21 passed (requirement: at least 10) |
| `pnpm test` (whole repo) | 7 files, 147 tests passed |
| `grep -c 'astNodeIds.length' Correlate.ts` | 0 — the origin heuristic is never used |
| `grep -c 'dialects\[' Correlate.ts` | 1 (requirement: at least 1) |
| `grep -c '=== undefined' Correlate.ts` | 8 (the `noUncheckedIndexedAccess` guards) |
| `grep -c 'new Set' Correlate.ts` | 1 — the `exampleColumns` construction only |
| `grep -c 'new RegExp' Correlate.ts` | 0 (threat T-02-01) |
| `grep -c 'from "./index' Correlate.ts` | 0 |
| Distinct `StepOwner` literals in `Correlate.ts` | 3 of 3 |
| `grep -c 'keyword.trim()' Correlate.ts` | 6 (requirement: at least 1) |
| `grep -c 'keywordType' Correlate.ts` | 5 (requirement: at least 1) |
| `grep -c '\.type' Correlate.ts` | 0 — `PickleStep`'s own field is never read |
| `grep -c 'pickle.location' Correlate.ts` | 2 (requirement: at least 1) |
| `grep -c 'astNodeIds.at(-1)' Correlate.ts` | 0 |
| `grep -c 'hashes\|rowsHash\|new DataTable' Correlate.ts` | 0 |
| `grep -c 'astName' Correlate.ts` | 1 (requirement: at least 1) |
| `grep -ciE 'EmptyExamples\|ZeroStepScenario\|OutlineWithoutExamples\|DuplicateScenarioName' Correlate.ts` | 0 — no validation leaks into the walk |
| `grep -c 'toEqual(["@featuretag", …])' Correlate.test.ts` | 1 (order-sensitive whole-array assertion) |
| Distinct origin literals in `Correlate.test.ts` | 3 of 3 |
| `grep -c 'astName' Correlate.test.ts` | 3 (requirement: at least 1) |
| `grep -c 'Plan du' Correlate.test.ts` | 1 (the fr dialect case) |
| `grep -c 'toMatchSnapshot\|toMatchInlineSnapshot' Correlate.test.ts` | 0 — assertions are explicit |
| `grep -c 'from "../src/index' Correlate.test.ts` | 0 (no barrel import) |
| `grep -c 'it.only' Correlate.test.ts` | 0 |
| `Correlate.ts` line count | 476 (requirement: at least 150) |

## Known Stubs

None. `Correlate.ts` is a complete implementation of its stated contract. Three `AstIndex` fields — `exampleColumns`, `AstScenarioInfo.examplesHeaders` and `AstRuleInfo.scenarioIds` — are populated and tested-through but have no consumer inside this plan; they exist because the plan specifies them as the F9/F11/F13 detection inputs for `Validate.ts` in plan 02-06. That is a delivered contract for a named next plan, not an unfinished stub: each is produced by the same single walk and would cost a second traversal to add later.

## Threat Flags

None. This plan adds no network endpoint, no auth path, no file access and no schema at a trust boundary. Both trust boundaries it touches were already in the plan's register.

Register dispositions honoured:

- **T-02-01 (DoS, ReDoS via a feature-derived `RegExp`)** — mitigated: `Correlate.ts` constructs no `RegExp` at all, verified by acceptance criterion (`grep -c 'new RegExp'` = 0). Keyword matching is `Array.includes` against the package-provided `dialects` record.
- **T-02-12 (Tampering, `dialects[language]` on attacker-influenced content)** — mitigated: `dialectOf` narrows the `Dialect | undefined` that `noUncheckedIndexedAccess` produces and both callers answer `false` for an unknown language rather than throwing or reading a prototype property. Tested: `isOutlineKeyword("xx", …)` and `isScenarioKeyword("xx", …)` are both `false`. An unknown `# language:` header has already been rejected as `UnknownDialect` in `Parser.ts` before this point.
- **T-02-13 (Spoofing, unresolvable `astNodeIds[0]`)** — mitigated: `resolveStep` throws `LoadFeatureError` with `reason: "ParseFailed"` naming the step text and the unresolved id, and never falls back to a default keyword or origin. The message says explicitly that parse and compile disagree about the file.
- **T-02-02 (Information disclosure, step text in the error)** — accepted as specified: the step text is quoted verbatim via `JSON.stringify`, per the locked full-content policy.

## Next Phase Readiness

- `Validate.ts` (02-06) receives `CorrelationResult` and has everything its checks need without a second AST walk: `index.astScenarios` (with `keyword`, `examplesCount`, `examplesHeaders`, `location`) for F1/F2/F3/F4/F11, `index.byScenarioId` for the compiled-to-nothing case, `index.exampleColumns` for the exact leftover-placeholder scan, `index.astRules[].scenarioIds` for F13, and `feature.allScenarios` for the zero-step and duplicate-name checks.
- `correlateFeature` throws only for a genuinely impossible document (no `Feature:`, or a pickle step referencing an AST node that does not exist). Every Group A/B/C finding is still detectable downstream because nothing is filtered, sorted or deduplicated here.
- `loadFeature.ts` (02-08) composes `readFeatureSource` → `parseDocument` → `compilePickles` → `correlateFeature` → `Validate.ts`, with one `IdGenerator.uuid()` threaded through the middle two.
- `index.ts` (02-09) can re-export `correlateFeature` and the `Ast*` types; nothing in this module imports the barrel, so the DAG stays acyclic.
- `REQUIREMENTS.md` row for PARSE-02 remains `Pending` and belongs to whichever plan lands `loadFeature.ts`.

## Self-Check: PASSED

Both claimed artifacts verified on disk (`packages/gherkin/src/Correlate.ts`, `packages/gherkin/test/Correlate.test.ts`) and all three claimed commits verified present in `git log` (`8bc330a`, `d8c1250`, `b1fcb3e`).

---

*Phase: 02-loadfeature-parse-compile-correlate*
*Completed: 2026-08-28*

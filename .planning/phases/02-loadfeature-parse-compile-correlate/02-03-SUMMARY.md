---
phase: 02-loadfeature-parse-compile-correlate
plan: 03
subsystem: testing
tags: [gherkin, cucumber, vitest, fixtures, parser, pickles, upstream-pin]

# Dependency graph
requires:
  - phase: 02-01
    provides: "vitest and @types/node as devDependencies of packages/gherkin, plus types:[node] in its tsconfig — without them this plan's test file has no runner and no types"
provides:
  - "28 .feature fixtures under packages/gherkin/test/fixtures, one per row of 02-RESEARCH.md's fixture table (F1-F15, F17-F27), each named for the reason it triggers"
  - "packages/gherkin/test/fixtures/README.md — the fixture-to-row map, the byte-exactness constraint, and the record that row F16 deliberately has no file"
  - "packages/gherkin/test/upstream-pin.test.ts — 55 executable assertions pinning @cucumber/gherkin@42.0.1's verified behavior on every fixture, with zero dependency on this library's own source"
  - "the corrected fact that @cucumber/gherkin@42.0.1's Errors namespace exports only 5 classes and UnexpectedTokenException is NOT among them"
affects: [02-04, 02-05, 02-06, 02-07, 02-08, 02-09, 02-10, 02-11, phase-06-step-matching]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "One IdGenerator.uuid() per parse call, shared by AstBuilder and compile (Pattern 1)"
    - "Fixture files named for the failure reason they trigger, so a red test names the defect"
    - "Table-driven vitest cases split by outcome kind, never branched inside an it body"
    - "Error discrimination via instanceof Errors.X, never via .name"

key-files:
  created:
    - packages/gherkin/test/fixtures/README.md
    - packages/gherkin/test/upstream-pin.test.ts
    - packages/gherkin/test/fixtures/*.feature (28 files)
  modified: []

key-decisions:
  - "@cucumber/gherkin@42.0.1 does not export UnexpectedTokenException from its Errors namespace — the background-after-rule fixture is pinned via instanceof Errors.GherkinException plus constructor.name instead of a class that does not exist"
  - "The F9 trap is avoided by construction: warning-dropped-examples-column.feature omits the trailing pipe from BOTH the Examples header and the body row, which is the silent-drop path, not the loud inconsistent-cell-count path"
  - "parse-failed-misplaced-tag.feature collects 3 cascading errors, not the ~9 the research recorded; the assertion is errors.length > 1 rather than an exact count, so the pin survives an upstream change to the hard-stop threshold"
  - "correlation-full.feature produces a 4-step pickle (feature-bg, rule-bg, When, Then), not the 3 the plan's Task 3 text said — the plan's own Task 2 fixture spec asks for two Scenario steps"
  - "The pin test imports nothing from ../src, so any failure there is unambiguously a dependency change"

patterns-established:
  - "Fixture corpus as specification: each .feature file is the executable statement of one upstream behavior, and upstream-pin.test.ts is its automated verification"
  - "Every it title carries the fixture filename, satisfying vitest/no-identical-title by construction and making a failure self-locating"
  - "vitest/no-conditional-expect forces outcome-homogeneous case tables: pickleCases and throwCases are separate arrays with separate loops"

requirements-completed: [PARSE-01, PARSE-02, PARSE-03]

# Metrics
duration: 24min
completed: 2026-08-28
---

# Phase 02 Plan 03: Fixture Corpus and Upstream Behavior Pin Summary

**28 hand-written `.feature` fixtures covering every row of the phase's fixture table, plus a 55-assertion vitest suite that pins `@cucumber/gherkin@42.0.1`'s verified behavior on each one so a dependency bump fails by name instead of silently changing this library's semantics.**

## Performance

- **Duration:** 24 min
- **Started:** 2026-08-28T13:33:00Z
- **Completed:** 2026-08-28T13:57:00Z
- **Tasks:** 3
- **Files created:** 30

## Accomplishments

- Wrote the phase's real specification: one `.feature` file per fixture-table row (F1-F15, F17-F27), each named for the reason it triggers, so a failing test names the defect rather than a line number.
- Avoided the F9 trap by construction. `warning-dropped-examples-column.feature` omits the trailing `|` from both the Examples header and the body row, which is verified to produce header cells `["a"]`, body `["1"]`, consistent counts, no error, and step text `1 and <b>`. Its one-character sibling `parse-failed-inconsistent-cells.feature` omits the pipe from the body row only and is verified to throw. The two pin opposite paths.
- Verified every predicted upstream behavior empirically against the installed `@cucumber/gherkin@42.0.1` before writing a single assertion, rather than transcribing the research table on trust. That surfaced one hard error in the plan (see Deviations).
- `upstream-pin.test.ts` runs 55 tests in ~20ms, names all 28 fixtures, imports nothing from `../src`, and discriminates every error class with `instanceof Errors.X`.
- Pinned Decision D3 in both directions: `IdGenerator.uuid()` across two documents produces 8 ids with 8 unique values; `IdGenerator.incrementing()` gives both documents' first Scenario the id `"1"` and both first pickles the id `"3"`.

## Task Commits

1. **Task 1: Group A and Group B fixtures** — `d63b300` (test)
2. **Task 2: Group C and Group D fixtures plus the fixtures README** — `00c3be5` (test)
3. **Task 3: `test/upstream-pin.test.ts`** — `e06c5c7` (test)

## Files Created

- `packages/gherkin/test/upstream-pin.test.ts` — table-driven pin over all 28 fixtures plus 27 detail assertions; the sole authority on what upstream currently does
- `packages/gherkin/test/fixtures/README.md` — fixture-to-row map, the "these files are byte-exact and NOT dprint-formatted" warning, the trailing-pipe hazard, and the note that row F16 has no file
- Group A (11 files): `empty-examples-no-header`, `empty-examples-header-only`, `outline-without-examples`, `scenario-keyword-with-examples`, `zero-step-scenario`, `zero-step-scenario-in-rule`, `uninterpolated-placeholder-background`, `uninterpolated-placeholder-in-argument`, `no-feature`, `duplicate-scenario-name`, `duplicate-scenario-name-across-rules`
- Group B (5 files): `parse-failed-misplaced-tag`, `unknown-dialect`, `parse-failed-inconsistent-cells`, `parse-failed-typo-keyword-after-step`, `parse-failed-background-after-rule`
- Group C (4 files): `warning-dropped-examples-column`, `warning-duplicate-examples-column`, `warning-empty-rule`, `warning-swallowed-step`
- Group D (8 files): `correlation-full`, `id-collision-a`, `id-collision-b`, `outline-two-examples-blocks`, `dialect-fr`, `outline-distinct-row-names`, `outline-identical-row-names`, `docstring-and-datatable`

## Decisions Made

- **Error discrimination for `parse-failed-background-after-rule`.** The plan asked for `instanceof Errors.UnexpectedTokenException`. That class is not exported. The fixture is instead pinned via `constructor.name === "UnexpectedTokenException"`, `instanceof Errors.GherkinException === true`, `instanceof Errors.AstBuilderException === false`, `"UnexpectedTokenException" in Errors === false`, and `location.line === 8`. The negative membership assertion means the day upstream adds the export, this test tells us.
- **`errors.length > 1` rather than an exact 9 for the misplaced-tag case.** The observed count is 3. The number is a function of how much file follows the bad line and of the parser's ~10-error hard stop; pinning it exactly would make the test brittle without pinning anything meaningful. What matters — cascade, not single error — is preserved.
- **`firstStepText: string | undefined` asserted unconditionally.** `vitest/no-conditional-expect` is an error in this repo, so the case table cannot branch inside an `it`. Rows with no first step declare `undefined` and the assertion still runs.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `Errors.UnexpectedTokenException` does not exist in `@cucumber/gherkin@42.0.1`**

- **Found during:** Task 3 (writing the pin test), surfaced earlier by the Task 1 behavior probe
- **Issue:** The plan's Task 3 instructs asserting `throws an Errors.UnexpectedTokenException` for `parse-failed-background-after-rule.feature`. The `Errors` namespace exports exactly five names: `AstBuilderException`, `CompositeParserException`, `GherkinException`, `NoSuchLanguageException`, `ParserException`. Writing the instructed assertion produces `TypeError: Right-hand side of 'instanceof' is not an object` — the test would fail at runtime, not assert anything.
- **Fix:** Discriminated via `constructor.name`, `instanceof Errors.GherkinException`, negative `instanceof` checks against the two sibling classes, and `"UnexpectedTokenException" in Errors === false`. Added an explicit test asserting the exact five-name export surface of `Errors`, and recorded the finding in the fixtures README.
- **Files modified:** `packages/gherkin/test/upstream-pin.test.ts`, `packages/gherkin/test/fixtures/README.md`
- **Verification:** `pnpm vitest run packages/gherkin/test/upstream-pin.test.ts` — 55 passed
- **Committed in:** `e06c5c7` and `00c3be5`

**2. [Rule 1 - Bug] `parse-failed-misplaced-tag.feature` collects 3 errors, not ~9**

- **Found during:** Task 1 (empirical verification of the fixture)
- **Issue:** The plan and `02-RESEARCH.md` both record "about 9 collected errors for one bad line". The minimal fixture produces 3. The research figure was measured on a larger file; the count scales with the lines remaining after the bad one.
- **Fix:** The assertion is `errors.length > 1` (which the plan itself specifies) plus a check that `errors[0].message` contains `(4:3)`. The composite's own `location` is separately asserted `undefined`. The README records 3 as the observed count for this specific fixture.
- **Files modified:** `packages/gherkin/test/upstream-pin.test.ts`, `packages/gherkin/test/fixtures/README.md`
- **Verification:** test passes; `.location === undefined` and the cascade both pinned
- **Committed in:** `e06c5c7`

**3. [Rule 1 - Bug] Plan's Task 3 expects 3 steps on the `correlation-full` pickle; its own Task 2 fixture spec implies 4**

- **Found during:** Task 3
- **Issue:** Task 2 specifies the Scenario Outline carries `When I use <name>` **and** `Then it works`, on top of a feature Background and a Rule Background. That is four pickle steps. Task 3's checklist says "whose `steps` are three".
- **Fix:** Followed the more specific fixture spec and pinned the verified four: `["a feature background step", "a rule background step", "I use a", "it works"]`, which still asserts the feature-bg / rule-bg / scenario ordering the row exists to prove.
- **Files modified:** `packages/gherkin/test/upstream-pin.test.ts`
- **Verification:** test passes
- **Committed in:** `e06c5c7`

**4. [Rule 3 - Blocking] `vitest/no-conditional-expect` and `unicorn/no-array-sort` rejected the first draft**

- **Found during:** Task 3 (`pnpm lint` after `pnpm format`)
- **Issue:** The plan describes a single case table with a discriminated `throws` / `pickles` outcome, which forces a branch inside the `it` body. Both branches contain `expect`, which `vitest/no-conditional-expect` flags as an error. Separately, `Object.keys(Errors).sort()` trips `unicorn/no-array-sort`.
- **Fix:** Split the table into `pickleCases` and `throwCases` with separate loops, made `firstStepText` a required `string | undefined` field asserted unconditionally, and switched to `Object.keys(Errors).toSorted()`.
- **Files modified:** `packages/gherkin/test/upstream-pin.test.ts`
- **Verification:** `pnpm lint` exits 0; 55 tests still pass
- **Committed in:** `e06c5c7`

---

**Total deviations:** 4 auto-fixed (3 bugs in the plan's stated expectations, 1 blocking lint conflict)
**Impact on plan:** All four are corrections to plan text that did not match the installed library or this repo's lint config. Every fixture and every row of the fixture table was still delivered. No scope creep; no fixture was dropped or weakened.

## Issues Encountered

- The worktree was spawned at a stale base (`f640f4a`, before Phase 2 existed) and had no `node_modules`. Resolved by `git reset --hard 9152ced` per the startup branch check, then `pnpm install --frozen-lockfile`.
- Behavior verification needed a scratch script that could resolve `@cucumber/gherkin`. pnpm's workspace layout puts it under `packages/gherkin/node_modules`, so the probe had to live there rather than at the repo root. All probe scripts were deleted after use; the working tree is clean.

## Verification Results

| Gate | Result |
| --- | --- |
| `pnpm vitest run packages/gherkin/test/upstream-pin.test.ts` | 55 passed (requirement: at least 25) |
| `pnpm test` (whole repo) | 4 files, 95 tests passed |
| `pnpm lint` (oxlint + dprint check) | exit 0 |
| `pnpm verify:spec` | PASS 7, FAIL 0, SKIP 1 |
| `pnpm build` (`tsc -b`) | exit 0 |
| `grep -rlE '@REQ-EC-[0-9]{3}' packages/gherkin/test/fixtures` | no match |
| `grep -c 'instanceof Errors\.'` | 9 (requirement: at least 3) |
| `grep -c 'err\.name ==='` / `grep -c '== null'` / `grep -c 'from "\.\./src/'` | 0 / 0 / 0 |
| `grep -c 'incrementing'` | 3 (requirement: at least 1) |
| Every fixture named in the pin test | 28 of 28 |
| Fixture count | 28 `.feature` files (requirement: at least 28) |

## Known Stubs

None. Every fixture is a complete, parseable artifact and every one has at least one executable assertion against it.

## Threat Flags

None. This plan adds no network endpoint, auth path, file-access pattern, or schema at a trust boundary. T-02-09 (fixture tags colliding with the `@REQ-EC-NNN` traceability namespace) was mitigated as planned: no fixture carries such a tag, `pnpm verify:spec` was run as a task verify in both fixture tasks, and its check 4 still reports `SKIP — no .feature tags yet`. T-02-10 (upstream behavior drift) is the deliverable itself. T-02-01 (ReDoS) is not applicable: no file here constructs a `RegExp` from feature content.

## Next Phase Readiness

- Every later plan in this phase now has a real corpus to verify against, and knows exactly what upstream does on each row without re-deriving it.
- `Validate.ts`'s eventual test file has a 1:1 counterpart on disk: one fixture per `LoadFeatureErrorReason`, plus four Group C warning cases.
- **Carry forward for whoever writes `Errors.ts` / `Parser.ts`:** `UnexpectedTokenException` is not reachable by name from `@cucumber/gherkin`. Route it to `ParseFailed` by falling through after checking `errors[0] instanceof Errors.NoSuchLanguageException` (which routes to `UnknownDialect`) — do not try to match it by class.
- Row F16 (missing file) still needs its `MissingFile` coverage in whichever plan owns `Source.ts`; by design it has no fixture and is exercised by passing a nonexistent path.
- Row F16 aside, all of F1-F27 are represented on disk and asserted.

---

*Phase: 02-loadfeature-parse-compile-correlate*
*Completed: 2026-08-28*

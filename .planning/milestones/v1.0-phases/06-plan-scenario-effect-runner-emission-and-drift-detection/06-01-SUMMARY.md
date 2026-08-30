---
phase: 06-plan-scenario-effect-runner-emission-and-drift-detection
plan: 01
subsystem: testing
tags: [effect, vitest, cucumber, gherkin, stack-trace, source-location, typescript]

# Dependency graph
requires:
  - phase: 05-describefeature-type-surface
    provides: "createRegistry / StepDefinition / the describeFeature registrar that this plan threads a definition site through"
provides:
  - "captureCallSite(): the author's own Given/When/Then file, line and column, read from new Error().stack"
  - "formatCallSite / compareCallSites: a rendered site and a total, numeric, file-first order over sites"
  - "Registry.ts's DefinitionSite type and StepDefinition.definedAt, with null as the explicit absent marker"
  - "describeFeature's registrar recording a real definition site on every registered step"
affects:
  [
    "06-02 and later Plan-stage work",
    "MATCH-03 undefined-step error",
    "MATCH-04 ambiguous-step error ordering (D-03)",
    "MATCH-05 unused-pattern warning"
  ]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Runtime stack-frame parsing for source-location capture, frame-selected by directory rather than by frame index"
    - "A type declared in the dependency-free container and imported by the leaf, so the container's zero-import claim survives"

key-files:
  created:
    - packages/vitest/src/CallSite.ts
    - packages/vitest/test/CallSite.test.ts
  modified:
    - packages/vitest/src/Registry.ts
    - packages/vitest/src/describeFeature.ts
    - packages/vitest/test/Registry.test.ts
    - packages/vitest/test/describeFeature.test.ts
    - spec/traceability.md

key-decisions:
  - "Frame selection is by DIRECTORY derived from frame 0 at capture time, never by a hard-coded frame count — a count is correct today and silently names describeFeature.ts the moment a wrapper is added or the package runs from dist/"
  - "DefinitionSite is declared in Registry.ts and imported (type-only) by CallSite.ts, not the reverse — Registry.ts note (c) claims zero dependencies and an acceptance criterion asserts it, so the dependency has to point at the leaf"
  - "Absence is `null`, never an Option and never an optional property — an Option spelling would pull effect/Option into a type that sits on StepDefinition, and RegistryScope.name already establishes `| null` as this package's spelling for real absence"
  - "captureCallSite() is called INSIDE the arrow returned by registrar, never hoisted — a comment in describeFeature.ts refuses the extract-to-a-variable tidy-up before it happens"
  - "compareCallSites uses native comparisons; Effect's own ordering combinator throws in effect@4.0.0-rc.112, matching the note already carried by packages/gherkin/src/Validate.ts"
  - "MATCH-04 deliberately NOT marked Complete — this plan ships the capture mechanism D-03's ordering needs, not the ambiguous-step error itself"

patterns-established:
  - "Position-sensitive assertion: a hard-coded line-number literal with a comment saying it moves if the file is edited above it. Deliberately brittle in the one direction an off-by-one in frame selection changes."
  - "Grep-based acceptance criteria that forbid a literal also forbid explaining the non-use in a comment. Both CallSite.ts and describeFeature.ts describe the forbidden construct without spelling its name, and say in prose why the name is absent."

requirements-completed: []

# Metrics
duration: 15min
completed: 2026-08-29
---

# Phase 6 Plan 01: Step Definition Call-Site Capture Summary

**Every registered step now carries the file, line and column of the author's own `Given`/`When`/`Then` call, captured from `new Error().stack` by directory-based frame selection, with a total numeric order over sites ready for D-03's ambiguous-match ordering.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-08-29T02:03:00Z
- **Completed:** 2026-08-29T02:18:08Z
- **Tasks:** 3
- **Files modified:** 7 (2 created, 5 modified)

## Accomplishments

- `packages/vitest/src/CallSite.ts` — `captureCallSite` / `formatCallSite` / `compareCallSites`, proven by 10 tests carrying a real two-entry mutation record.
- `StepDefinition.definedAt` on `Registry.ts`, with `DefinitionSite` declared there so `Registry.ts` keeps its zero-import claim intact (`grep -c '^import'` still returns `0`).
- The `describeFeature` registrar records a real site: a `Given(...)` written on line 248 of `packages/vitest/test/describeFeature.test.ts` produces `definedAt.line === 248`, asserted end to end.
- Repo test count rose from **427 across 20 files** to **440 across 21 files**. Every pre-existing test still passes.
- Every gate green: `pnpm build`, `pnpm lint`, `pnpm test`, `pnpm typecheck:test`, `pnpm verify:tsgo-gate`, `pnpm circular`, `pnpm verify:no-runner-dep`, `pnpm verify:pack`, `pnpm verify:spec`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Build and prove the call-site capture module** (TDD)
   - RED — `7ccc210` (test)
   - GREEN — `e0f8a2a` (feat)
2. **Task 2: Record a definition site on every StepDefinition** — `67f7760` (feat)
3. **Task 3: Thread the capture through the describeFeature registrar** — `6ba2e98` (feat)

**Spec reconciliation:** `1610c48` (docs)

## Files Created/Modified

- `packages/vitest/src/CallSite.ts` — **created.** Parses `new Error().stack` with one anchored, backtracking-safe regex; derives `selfDir` from frame 0 and returns the first frame outside it; renders a site or the shared `an unrecorded location` wording; orders sites by file, then line, then column, numerically, with an absent site last.
- `packages/vitest/test/CallSite.test.ts` — **created.** 10 tests. Stubs the global `Error` constructor to reach the absent-site branches and the `file://` / `<anonymous>` frame shapes a real in-vitest stack does not produce.
- `packages/vitest/src/Registry.ts` — **modified.** Adds `DefinitionSite`, adds `definedAt` to `StepDefinition`, and takes the site as `register`'s fourth parameter. Still imports nothing.
- `packages/vitest/src/describeFeature.ts` — **modified.** One import and one changed line inside the registrar arrow, plus the comment that refuses hoisting it. Neither overload, their order, nor the `LayerArgument` normalisation was touched — `pnpm verify:tsgo-gate` confirms 6/6 assertions including the overload-order one.
- `packages/vitest/test/Registry.test.ts` — **modified.** Six existing `register` calls take a fourth argument; two new tests assert the exact site object survives by reference identity and that `null` survives as `null`. New mutation-testing header.
- `packages/vitest/test/describeFeature.test.ts` — **modified.** One end-to-end test with a hard-coded line literal; header mutation record extended from two entries to three.
- `spec/traceability.md` — **modified.** §4 row for the new suite, plus `CallSite.ts` in the preamble's real-source list and in §1's BEH-EC-013 row.

## Decisions Made

See the `key-decisions` frontmatter above. The two worth restating for the next reader:

**Frame selection is by directory, not by a frame count.** Verified planning fact 1 established that the caller is frame 2 today. That is true and useless as an implementation: it holds only while exactly one function sits between the author's `Given(...)` and `captureCallSite`. The failure mode of a count is not an exception and not a type error — every step in the suite still gets a well-formed `{ file, line, column }`, it just names `describeFeature.ts`. `selfDir` is derived from frame 0 at capture time, so an added wrapper is free and a `dist/` build (where every internal module shares one directory) still refuses to answer rather than answering wrong. Mutation A is the standing proof.

**`DefinitionSite` lives in `Registry.ts`, not in `CallSite.ts`.** The plan sequenced this as declare-then-move, and the moved-to end state is what shipped. `Registry.ts` note (c) claims the module "deliberately has no dependencies of any kind" with an acceptance criterion asserting the count is zero, so a `import type { DefinitionSite } from "./CallSite.ts"` would have broken a written invariant to save an import in the leaf. Pointed the other way, `CallSite.ts` takes one type-only import, `Registry.ts` keeps zero, and `pnpm circular` confirms no cycle.

## Mutation Testing

All three mutations were actually performed, observed failing, and reverted. Recorded output:

| # | File | Mutation | Result |
|---|------|----------|--------|
| A | `CallSite.ts` | `captureCallSite` returns frame 0 instead of the first foreign frame | **4 failed / 6 passed.** `expected '/repo/packages/vitest/src/CallSite.ts…' to be '/repo/packages/vitest/test/example.te…'` — the caller-line test reports `CallSite.ts`, exactly as predicted |
| B | `CallSite.ts` | `compareCallSites` compares `line` with `String(...).localeCompare` instead of subtraction | **1 failed / 9 passed.** Only "puts line 9 before line 10 in the same file" fails — no other assertion in the repo can see it |
| C (Task 2) | `Registry.ts` | `register` ignores its `definedAt` argument and always pushes `null` | **1 failed / 9 passed.** `expected null to be { …(3) }` on "hands back the exact object it was given" |
| C (Task 3) | `describeFeature.ts` | `registrar` passes `null` instead of `captureCallSite()` | **1 failed / 10 passed.** The end-to-end `definedAt` test fails; every other describeFeature assertion stays green |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `describeFeature.ts` needed a fourth `register` argument inside Task 2**

- **Found during:** Task 2 (Record a definition site on every StepDefinition)
- **Issue:** Task 2's `<verify>` block requires `pnpm build` to pass, but making `definedAt` a required fourth parameter of `register` breaks `describeFeature.ts`'s three-argument call in the same compilation. Task 2 could not be scoped to `Registry.ts` alone. This is the same shape as 03-05's recorded lesson: a plan that adds a required field to an already-consumed contract must scope the composition-root edit into the same commit.
- **Fix:** Passed `null` as the fourth argument from the registrar, with a comment saying the real capture was the next step. Task 3 replaced it with `captureCallSite()`.
- **Files modified:** `packages/vitest/src/describeFeature.ts`
- **Verification:** `pnpm build` exits 0 at the end of Task 2; `pnpm vitest run packages/vitest/test/Registry.test.ts` 10/10.
- **Committed in:** `67f7760` (Task 2 commit)

**2. [Rule 2 - Missing Critical] Two acceptance greps collided with the doc comments the same task required**

- **Found during:** Task 1 and Task 3
- **Issue:** Task 1 required note (b) to explain why `Error.captureStackTrace` is not used and required `compareCallSites` to say not to reach for `Order.combineAll` — while also requiring `grep -c 'captureStackTrace'` and `grep -c 'Order'` to return `0`. Task 3 required the "keep the call inside the arrow" comment while requiring `grep -c 'captureCallSite()'` to return `1`. Both are the exact collision STATE.md records from 03-04: "writing a grep-based acceptance criterion that forbids a literal also forbids explaining it in a comment."
- **Fix:** Followed the recorded workaround (`expressions-pin.test.ts`'s phrasing). The prose now identifies each construct unambiguously without spelling its name — "V8's dedicated stack-capture helper on the `Error` constructor, the one `@types/node` declares and `lib.es5.d.ts` does not"; "the `combineAll` combinator from Effect's own ordering module" — and each site says IN PROSE that the name is deliberately absent because a criterion greps for it. In `describeFeature.ts` the comment says "the `captureCallSite` call below", which does not match `captureCallSite()`. No explanatory content was lost.
- **Files modified:** `packages/vitest/src/CallSite.ts`, `packages/vitest/src/describeFeature.ts`
- **Verification:** `grep -c 'captureStackTrace'` → 0, `grep -c 'Order'` → 0, `grep -c 'captureCallSite()' describeFeature.ts` → 1. All other criteria unaffected.
- **Committed in:** `e0f8a2a` (Task 1), `6ba2e98` (Task 3)

**3. [Rule 2 - Missing Critical] `spec/traceability.md` §4 was stale after a new test file was added**

- **Found during:** post-Task-3 verification
- **Issue:** §4 is enumerated from disk, one row per `packages/gherkin/test/*.test.ts` and `packages/vitest/test/*.test.ts`. Adding `packages/vitest/test/CallSite.test.ts` made the document's own stated enumeration false. `pnpm verify:spec` did not catch it — 03-06's cross-check reads only the gherkin test directory — so the drift would have been silent. AGENTS.md §1 makes a code change unreflected in `spec/` incomplete, not merely undocumented.
- **Fix:** Added the §4 row (Covers: BEH-EC-013), named `CallSite.ts` in the preamble's real-source list and in §1's BEH-EC-013 row, and restated the `Registry.test.ts` / `describeFeature.test.ts` descriptions to mention the definition site.
- **Files modified:** `spec/traceability.md`
- **Verification:** `pnpm verify:spec` → PASS 7 / FAIL 0 / SKIP 1; `pnpm lint` (which runs `dprint check` over `spec/**/*.md`) exits 0.
- **Committed in:** `1610c48`

---

**Total deviations:** 3 auto-fixed (1 blocking, 2 missing critical)
**Impact on plan:** No scope creep. Deviation 1 is a known repo pattern (03-05's recorded lesson) and was reverted to the planned shape by Task 3. Deviation 2 preserved every explanation the plan asked for while satisfying the criteria as written. Deviation 3 is a documentation contract the repo enforces by convention rather than by script.

## Requirement Marking

**MATCH-04 was deliberately NOT marked Complete**, and `.planning/REQUIREMENTS.md` is unchanged.

MATCH-04 reads: "A Pickle step matching more than one registered pattern fails the same way, naming every matching pattern rather than silently picking the first registered." This plan ships the definition-site capture that D-03's *ordering* of that list needs — not the error, not the Plan stage that raises it, and nothing a consumer can reach. Marking it now would make REQUIREMENTS.md say something the repo cannot back.

This follows the precedent Phase 3 set four consecutive times (03-01 through 03-04 each declined MATCH-01/02 on "say only what is true" grounds; 03-05, the plan that made them true end to end, marked them). **The Phase 6 plan that raises the ambiguous-step error owns marking MATCH-04.**

## Issues Encountered

- **`packages/*/src` inside a block comment terminates it.** The first draft of `CallSite.ts`'s module doc contained the literal `packages/*/src`, whose `*/` closed the comment and produced a parse error from vite's oxc transform rather than a TypeScript error. Rephrased to "either package's `src` tree". Worth knowing: this repo's house doc-comment style is prose-heavy, and a glob in prose is a live hazard.
- **`node_modules` was absent in the worktree.** Resolved with `pnpm install --frozen-lockfile`, which succeeded unchanged and left `pnpm-lock.yaml` untouched — threat T-06-01-SC's stated condition holds.

## Threat Model Disposition

| Threat ID | Disposition | Status |
|-----------|-------------|--------|
| T-06-01-01 (regex DoS) | mitigate | **Done.** `frameLocation` is anchored `^`/`$`, applied one line at a time to a stack capped at 10 frames. The two location groups are `[^()]` classes, not `.` — this makes the split point (the first ` (`) unambiguous, so there is no alternative partition to backtrack through. The reason is written into the regex's own doc comment. |
| T-06-01-02 (frame-selection tampering) | mitigate | **Done.** Selection compares against `selfDir` derived from frame 0 at capture time. Mutation record A is the standing proof and is committed in the test file's header. |
| T-06-01-03 (developer paths in a message) | accept | Unchanged. The captured path is absolute and local, appears only in a test-time message on the developer's own terminal, and is never transmitted or persisted. |
| T-06-01-SC (package-manager installs) | accept | **Verified.** No `pnpm add` was run; `pnpm-lock.yaml` is byte-unchanged (`git status` clean for it throughout); `pnpm install --frozen-lockfile` succeeded. |

## Threat Flags

No new security-relevant surface. This plan adds no network endpoint, no auth path, no file access, and no schema change at a trust boundary — it reads a string the runtime already produced in-process.

## Known Stubs

None. Every value this plan introduces is wired to a real producer and a real consumer: `captureCallSite` is called from the live registrar, `definedAt` is populated on every registered step, and `compareCallSites` has no caller yet **by design** — it is the ordering primitive MATCH-04 will consume, and it is fully asserted by its own tests rather than by a downstream user.

## Next Phase Readiness

**Ready for the Plan stage (06-02 and later).**

- `StepDefinition.definedAt` is populated on every step collected through `describeFeature`/`collectFeature`. A `Plan` stage reading a `FeatureCollection` gets sites for free.
- `compareCallSites` is the comparator MATCH-04's ambiguous-match list should sort with. Use `toSorted(compareCallSites)` — `unicorn(no-array-sort)` rejects the in-place form.
- `formatCallSite` is the renderer for the error message. It handles `null` by saying "an unrecorded location", matching the wording `packages/gherkin`'s `DuplicateParameterTypeName` already uses.

**Constraints the next plans must respect:**

- **`packages/vitest/src/Registry.ts` must keep zero imports.** `grep -c '^import'` returning `0` is an acceptance criterion in two plans now, and note (c) is the written contract. Anything `Registry.ts` needs to *name* gets declared there and imported by the module that produces it — never the reverse.
- **`captureCallSite()` must stay inside the registrar's arrow in `describeFeature.ts`.** Hoisting it anywhere — a `const` in `collect`'s body, a shared helper called at module scope — silently captures this package's own line for every step in every suite. The comment above the call says so; `grep -c 'captureCallSite()'` returning `1` is the mechanical guard.
- **Three hard-coded line-number literals now exist and will fail loudly if the files are edited above them:** `capturedFromLine = 57` / `capturedFromColumn = 58` in `packages/vitest/test/CallSite.test.ts`, and `givenLine = 248` in `packages/vitest/test/describeFeature.test.ts`. Update the literal; do NOT relax the assertion to `expect(line).toBeGreaterThan(0)`, which passes against the defect these tests exist to catch.
- **`compareCallSites` must not grow an `effect/Order` import.** That combinator throws in `effect@4.0.0-rc.112` (also recorded at `packages/gherkin/src/Validate.ts:794-802`). An acceptance grep asserts the module name is absent from the file, which is also why the doc comment names it obliquely.
- **`spec/traceability.md` §4 is enumerated from disk and has no automated guard for `packages/vitest`.** 03-06's `node -e` cross-check reads `packages/gherkin/test/*.test.ts` only, so a new vitest suite drifts silently. A future plan may want to widen that check; until then, adding a row is a manual step every plan that adds a suite owes.
- Repo test count is now **440 across 21 files** (427 across 20 before this plan).

## Self-Check: PASSED

- All 8 claimed files exist on disk (`packages/vitest/src/CallSite.ts`, `packages/vitest/test/CallSite.test.ts`, `packages/vitest/src/Registry.ts`, `packages/vitest/src/describeFeature.ts`, `packages/vitest/test/Registry.test.ts`, `packages/vitest/test/describeFeature.test.ts`, `spec/traceability.md`, this summary).
- All 5 claimed commits exist in `git log`: `7ccc210`, `e0f8a2a`, `67f7760`, `6ba2e98`, `1610c48`.
- `git diff --stat 18f7b10 HEAD` names exactly those 8 files and nothing else — `pnpm-lock.yaml`, `.planning/STATE.md` and `.planning/ROADMAP.md` are untouched, as worktree mode requires.
- Working tree clean; no untracked files left behind.
- No file deletions in any commit.

---

*Phase: 06-plan-scenario-effect-runner-emission-and-drift-detection*
*Plan: 01*
*Completed: 2026-08-29*

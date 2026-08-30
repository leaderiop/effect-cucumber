---
phase: 03-parameter-types-and-step-matching
plan: 06
subsystem: docs
tags: [spec, adr, traceability, cucumber-expressions, parameter-types, step-matching]

# Dependency graph
requires:
  - phase: 03-parameter-types-and-step-matching (plans 01-05)
    provides: "the shipped surface this plan documents — StepPatternError, StepArgs, ParameterTypeStore, StepMatcher, ParsedFeature.parameterTypes and LoadFeatureOptions"
  - phase: 02-loadfeature-parse-compile-correlate
    provides: "BEH-EC-014, spec/traceability.md §4's test file map, and the spec conventions plan 02-11 established"
provides:
  - "BEH-EC-015 — the normative contract for cucumber-expression coercion, custom parameter types as data, and match-every-pattern"
  - "spec/behaviors/index.yaml registration for BEH-EC-015, so verify-traceability check 1 passes in both directions"
  - "BEH-EC-014's Signatures block corrected to the real (path, options?) / (source, uri, options?) API"
  - "ADR-EC-007's third correction, closing the Layer-versus-store question against ADR-EC-015"
  - "spec/traceability.md §1 row for BEH-EC-015 and a §4 map enumerated from disk (11 suites + 1 type-check file)"
  - "two status documents that no longer claim step matching or parameter types are unbuilt"
affects: [phase-04-datatable, phase-05-vitest-dsl, phase-06-plan-and-step-drift]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "A superseded normative sentence is marked superseded IN PLACE by an appended marker, never rewritten — the ADR diff is additions-only (55/0)"
    - "spec/traceability.md §4 is enumerated from `ls packages/gherkin/test/*.test.ts`, and a node -e cross-check in the plan's verify block fails naming any file absent from the document"

key-files:
  created:
    - spec/behaviors/05-step-matching-and-parameter-types.md
  modified:
    - spec/behaviors/index.yaml
    - spec/behaviors/04-loadfeature-parse-and-validation.md
    - spec/traceability.md
    - spec/decisions/007-cucumber-expressions-for-step-matching.md
    - spec/roadmap.md
    - packages/gherkin/README.md

key-decisions:
  - "BEH-EC-015 states the match-every-pattern RULE but defers the zero/many VERDICT to BEH-EC-013 — the verdict needs the Scenario and its source location, which the matcher layer does not have, and duplicating it would create two places to keep in sync."
  - "ADR-EC-007's Layer-provided-service option is recorded as FORCED closed by ADR-EC-015 plus `pnpm verify:no-runner-dep`, not chosen against on preference. The distinction is the whole point of the note: a future reader must not reopen it as a design debate."
  - "The superseded sentence in ADR-EC-007's second correction is marked in place with an appended bracketed marker rather than edited. `git diff` on that file is 55 additions and 0 deletions."
  - "spec/traceability.md §4 lists `StepArgs.types.ts` as an explicitly-labelled non-suite row, with a sentence above the table explaining why, so a future reader does not 'fix' it by renaming the file to `.test.ts` (which breaks `pnpm test` with 'No test suite found')."
  - "No `REQ-EC-` row was added to §5. The `.feature` files under `packages/gherkin/test/fixtures/` are parser fixtures, not acceptance scenarios; adding one would break the namespace that verify-traceability check 4's clean SKIP depends on."

patterns-established:
  - "A behavior doc's `typescript` fence imports only from the package barrel, so the planned doc-examples check can compile it against the real API without reaching into `../src` or a third-party package"
  - "Status truth stays in exactly one place — `spec/roadmap.md`'s Current state table — and every other document cites it rather than restating build status"

requirements-completed: [MATCH-01, MATCH-02]

# Metrics
duration: 8min
completed: 2026-08-28
---

# Phase 03 Plan 06: spec/ADR reconciliation Summary

**BEH-EC-015 written and registered, ADR-EC-007's last open implementation question closed against ADR-EC-015, and every status document in the repo made true after Phase 3.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-08-28T15:38:16Z
- **Completed:** 2026-08-28T15:46:30Z
- **Tasks:** 3
- **Files modified:** 7 (1 created, 6 modified)

## Accomplishments

- `spec/behaviors/05-step-matching-and-parameter-types.md` (242 lines) holds **BEH-EC-015** with three normative `REQUIREMENT:` blocks: cucumber-expression coercion (all eleven built-ins with their verified TypeScript types, including the three that are not the intuitive answer — `{bigdecimal}` is `string`, `{long}` is `number`, `{biginteger}` is `bigint`), custom parameter types as data replayed into a fresh per-call registry with both rejections raised at declaration time, and match-every-pattern with `(registry, pattern)` memoization.
- The file is registered in `spec/behaviors/index.yaml` as the next contiguous id, so `verify-traceability.sh` check 1 passes in both directions. `BEH-EC-016` appears nowhere — no id was skipped.
- **BEH-EC-014's `Signatures` fence now matches the shipped API.** It declared `loadFeature: (path: string) => ParsedFeature` — false since plan 03-05 added the options argument, and nothing in the repo checked it.
- **ADR-EC-007 has a third dated correction.** Its second correction floated exposing custom-type registration as a `Context.Service` + `Layer` and left the choice "open for Phase 2 of the roadmap". That option was never available: ADR-EC-015 forbids `@effect-cucumber/gherkin` from declaring `effect` in any manifest field and `pnpm verify:no-runner-dep` enforces it structurally. The note records the constraint, the shipped `ParameterTypeStore` design, the two declaration-time rejections (both raising `StepPatternError`, kept separate from `LoadFeatureError` so BEH-EC-014's ten-member reason set stays true), and the synchronous-transform constraint the correction did not anticipate.
- **`spec/traceability.md` §4 now names every test file on disk** — 11 suites, enumerated from `ls`, not from memory — plus `StepArgs.types.ts`, marked as a type-check rather than a suite.
- **No document in the repository still claims step matching or parameter types are unbuilt.** `spec/roadmap.md`'s Current state paragraph and table and `packages/gherkin/README.md`'s Status section are both true as of Phase 3.

## Task Commits

Each task was committed atomically:

1. **Task 1: Write BEH-EC-015 and register it** — `ea0acf3` (docs)
2. **Task 2: Correct BEH-EC-014's signature listing and update the traceability matrix** — `4dba3cb` (docs)
3. **Task 3: Close ADR-EC-007's open implementation question and make both status documents true** — `f00dddc` (docs)

## Files Created/Modified

- `spec/behaviors/05-step-matching-and-parameter-types.md` — **created.** BEH-EC-015: preamble, `> **See:**` blockquote linking ADR-EC-007 and ADR-EC-019 by relative path, three `REQUIREMENT:` blocks, a "Two decisions a reader will otherwise ask about" section, two `ts` signature fences, one `typescript` worked example, and a `_Previous:_` footer.
- `spec/behaviors/index.yaml` — the `BEH-EC-015` entry (`file`, `title`, `id_range: "015"`).
- `spec/behaviors/04-loadfeature-parse-and-validation.md` — `_Next:_` footer; `Signatures` fence rewritten to the real API plus the `LoadFeatureOptions` interface; one paragraph stating that the one-argument call form is unchanged, that every call builds a fresh registry returned on `ParsedFeature.parameterTypes`, and why the option exists. Neither `REQUIREMENT:` block, neither reason-tag set, nor the "Two decisions" section was touched.
- `spec/traceability.md` — §1 row tracing BEH-EC-015 to `packages/gherkin/src/{ParameterTypes,StepMatcher,StepArgs,Errors}.ts`; §4 re-enumerated from disk with a preamble sentence about the one non-suite row. §2, §3, §5 and §6 unchanged.
- `spec/decisions/007-cucumber-expressions-for-step-matching.md` — an in-place superseded marker plus a third correction blockquote. 55 additions, 0 deletions.
- `spec/roadmap.md` — Current state paragraph no longer lists step matching among the unbuilt; "Packages exist" row names the shipped surface; "Unit tests" row counts eleven files from disk plus the type-check-only file. "Acceptance suite" and "Doc-examples compile check" rows untouched; Blocking-first-release / Planned / Under consideration / Explicitly not planned sections untouched.
- `packages/gherkin/README.md` — Status section rewritten. Install and Requirements sections untouched; no `effect` install line introduced (this package declares no `effect` dependency, ADR-EC-015).

## Decisions Made

- **The `typescript` worked example imports only from `"@effect-cucumber/gherkin"`.** The planned doc-examples check will compile it against the real API, so a relative or third-party import would either fail to resolve or demonstrate a surface that is not public. An acceptance grep asserts `from "../` and `from "@cucumber/` both appear zero times.
- **`StepArgs` is presented by example in a second `ts` fence** rather than as a declaration in the first. Its real definition depends on two non-exported helpers (`ResolveParameterType`, and `BuiltInParameterTypeMap` as its lookup), and a `ts` fence must still be syntactically valid TypeScript or `dprint` cannot format it. `type A = StepArgs<"I have {int} cukes"> // [number]` is both valid and more useful to a reader than the recursion.
- **The `{money}` custom type in the worked example transforms over digits only.** Nothing credential-shaped appears anywhere in the file (threat T-03-34).

## Deviations from Plan

None — plan executed exactly as written. All three tasks' acceptance criteria were met on the first attempt; no auto-fix rule was invoked.

Two small judgement calls inside the plan's own latitude, recorded because they are visible in the diff:

- The plan says "add a `_Next:_` footer to file 04, and give the new file a `_Previous:_` link back to 04." File 04's footer now carries both `_Previous:_` (pre-existing) and `_Next:_` (added), matching files 01–03.
- The plan's Task 2 said to extend BEH-EC-014's §1 module list "if and only if the row's list is now wrong". `loadFeature.ts` is already named there and the row is still correct, so it was left alone as instructed.

## Issues Encountered

**`ls packages/gherkin/test/*.test.ts` returns 11 files but `pnpm test` reports 14.** The extra three are the vendored oxlint rule tests under `tools/oxlint/effect/test/`, which are not `packages/*` and are outside `spec/traceability.md` §4's stated scope. The §4 map and the roadmap's "Unit tests" row are both scoped to `packages/gherkin` explicitly and are accurate; the repo-wide count in STATE.md ("337 across 14 files") counts the `tools/` suites too. Noted so a future reader does not read the two numbers as a contradiction.

## User Setup Required

None — no external service configuration required.

## Verification

All commands run from the repo root, after `pnpm format`:

| Command | Result |
|---------|--------|
| `pnpm verify:spec` | PASS 7 / FAIL 0 / SKIP 1 — §5's features check still SKIPs cleanly; 176 relative links resolve |
| `pnpm lint` | exit 0 (`oxlint -f unix && dprint check`) |
| `pnpm verify:pack` | exit 0 |
| `pnpm build` | exit 0 |
| `pnpm test` | 337 passed / 14 files — unchanged, this plan is documentation only |
| `pnpm typecheck:test` | exit 0 |
| `pnpm verify:no-runner-dep` | exit 0 |
| `pnpm circular` | exit 0 |
| disk-vs-document test file cross-check | `ok 11 test files mapped` |
| `grep -c 'REQ-EC-[0-9]' spec/traceability.md` | 0 |
| `grep -c '^> \*\*Correction' spec/decisions/007-...md` | 3 |
| `git diff --numstat` on ADR-EC-007 | `55  0` — additions only, no line deleted from either existing correction |
| `git diff --stat spec/invariants.md spec/glossary.md spec/overview.md` | empty |

## Known Stubs

None. This plan is documentation only; no placeholder, no `TODO`, and no unwired data path was introduced.

## Threat Flags

None. No source file, manifest, or dependency changed; `packages/gherkin/package.json` is byte-identical and `pnpm verify:pack` re-verified the tarball shape, the Pitfall 20 peer-range guard, and the README's presence after the README edit.

## Next Phase Readiness

Phase 3 is complete and `spec/` now describes what it built. Ready for Phase 4 (`DataTable` wrapper, PARSE-04, ADR-EC-008).

Constraints Phase 4+ inherits from this plan:

- **`BEH-EC-016` is the next free behavior id.** BEH-EC-015 is the highest allocated. Ids are contiguous, never renumbered, never reused (AGENTS.md §6).
- **A new behavior file MUST be registered in `spec/behaviors/index.yaml` in the same commit**, or `verify-traceability.sh` check 1 fails in the disk→index direction. It also needs `_Previous:_`/`_Next:_` footers; file 05 currently has no `_Next:_`, and file 06 is the one that adds it.
- **`spec/traceability.md` §4 is enumerated from disk.** A plan that adds a test file must add its row in the same commit; the `node -e` cross-check in this plan's verify block is reusable verbatim as an acceptance criterion.
- **Do not add a `REQ-EC-NNN` row to §5** until a real acceptance suite exists. The `.feature` files under `packages/gherkin/test/fixtures/` are parser fixtures; a `REQ-EC-` row there turns check 4's clean SKIP into a claim the repo cannot back.
- **`packages/gherkin/README.md`'s Status section now names `DataTable` as the one specified-but-unbuilt piece.** The plan that ships it owns removing that sentence, or the README goes stale in the other direction.
- **The `LoadFeatureError` reason set is still closed at exactly ten members**, and BEH-EC-014 still says "drawn from exactly this set". `StepPatternError` remains the separate channel for parameter-type and step-pattern failures.
- **A `typescript` fence in `spec/behaviors/` must import only from a package barrel and must import everything it uses** — the doc-examples check is still unwired (`spec/roadmap.md` says so), but the fences are being written as if it were.

---
*Phase: 03-parameter-types-and-step-matching*
*Completed: 2026-08-28*

## Self-Check: PASSED

- `spec/behaviors/05-step-matching-and-parameter-types.md` — FOUND
- `.planning/phases/03-parameter-types-and-step-matching/03-06-SUMMARY.md` — FOUND
- Commits `ea0acf3`, `4dba3cb`, `f00dddc` — all FOUND in `git log`

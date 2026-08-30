---
phase: 04-datatable-docstring
plan: 04
subsystem: gherkin
tags: [effect, option, cucumber-messages, datatable, docstring, tagged-union, barrel, es2023]

# Dependency graph
requires:
  - phase: 04-datatable-docstring
    plan: 01
    provides: "The pinned argumentIndex facts — a NUMBER in both source orders (F25/F33), and the key-present/value-undefined shape for a single-argument step (F29/F30/F31)"
  - phase: 04-datatable-docstring
    plan: 02
    provides: "makeDataTable, the DataTable interface with its literal _tag, and DataTableError/DataTableErrorReason"
  - phase: 04-datatable-docstring
    plan: 03
    provides: "decodeHashes, the third export the barrel had to publish"
provides:
  - "StepArguments.ts: the DocString shape, the StepArgument union, and stepArgumentsOf"
  - "ParsedStep.stepArguments: a required ReadonlyArray<StepArgument> with exactly one producer"
  - "An ordering rule that reads argumentIndex's VALUE, mutation-proven against the F33 byte-mirror fixture"
  - "The Phase 4 public surface on the single barrel: makeDataTable, decodeHashes, stepArgumentsOf, DataTable, DocString, StepArgument, DataTableError, DataTableErrorReason"
  - "lib ES2023 workspace-wide, aligning the type surface with the already-declared Node 20 engines floor"
affects: [04-05-spec-reconciliation, 05-registration-dsl, 06-step-registration-and-matching]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "A tagged union whose arms each carry a literal _tag, discriminated by a plain switch, never by an `in` probe or instanceof"
    - "An ordering claim is asserted twice — end to end through a byte-mirrored fixture pair, and on synthetic literals that drive the index directly"
    - "A synthetic test literal reproduces the real upstream shape, including keys upstream leaves holding undefined, rather than a tidied version of it"

key-files:
  created:
    - packages/gherkin/src/StepArguments.ts
    - packages/gherkin/test/StepArguments.test.ts
    - .planning/phases/04-datatable-docstring/deferred-items.md
  modified:
    - packages/gherkin/src/Model.ts
    - packages/gherkin/src/Correlate.ts
    - packages/gherkin/src/index.ts
    - packages/gherkin/test/Correlate.test.ts
    - packages/gherkin/README.md
    - spec/traceability.md
    - tsconfig.base.json

key-decisions:
  - "stepArguments is REQUIRED, not optional — an optional field lets a Phase 5 consumer forget the wrapper exists and re-derive one from the raw argument, the exact duplication the field removes"
  - "Named stepArguments rather than arguments: one character from `argument` is not a distance a diff reader can see, and the redundant prefix on a ParsedStep is the point"
  - "StepArgument/DocString/DataTable are NOT re-exported from Model.ts — index.ts publishes each from its declaring module, so every first-party type has exactly one export path"
  - "The DocString needs no wrapper (ADR-EC-008's correction) but carries a _tag anyway, purely as the union's discriminant"
  - "mediaType is a REQUIRED field holding an Option, never a TS-optional one — a TS-optional field would reintroduce the exactOptionalPropertyTypes asymmetry ADR-EC-022 removed"
  - "tsconfig lib ES2022 -> ES2023 while target stays ES2022: ES2023 added library methods but no syntax, and Node 20 (the declared engines floor) already ships every one of them"
  - "PARSE-04 marked Complete here, the plan that delivers the both-arguments half 04-01 and 04-03 each declined on the record"

patterns-established:
  - "A test file narrows a tagged union through a `_tag`-destructuring type predicate, mirroring DataTable.ts's isPointerIssue, because no-underscore-dangle forbids member access"
  - "A whole-array toEqual on the tag list is preferred to per-index assertions: it also fails on a missing or extra argument"

requirements-completed: [PARSE-04]

# Metrics
duration: 13min
completed: 2026-08-28
---

# Phase 4 Plan 04: Step Argument Union and Barrel Summary

**The wrapper made reachable: a step's DocString and DataTable now arrive on `ParsedStep.stepArguments`, wrapped and ordered by the `argumentIndex` `@cucumber/gherkin` recorded rather than by a convention this package invented, and the whole Phase 4 surface ships from the single barrel.**

## Performance

- **Duration:** ~13 min
- **Started:** 2026-08-28T23:41:00Z
- **Completed:** 2026-08-28T23:53:35Z
- **Tasks:** 3
- **Files modified:** 10 (3 created, 7 modified)

## Accomplishments

- `stepArgumentsOf` turns a raw `PickleStepArgument` into an ordered `ReadonlyArray<StepArgument>`, total, with all four cases — none, DocString alone, DataTable alone, both — reachable from a real `.feature` file and each asserted.
- The ordering reads `argumentIndex`'s VALUE with an `undefined` fallback, exactly as plan 04-01's pin requires. Mutation proof below shows removing the reorder fails the F33 test and nothing else.
- `ParsedStep.stepArguments` landed as a REQUIRED field WITH its producer in the same commit — the 03-05 lesson applied, so `pnpm build` never saw a required field nothing filled.
- `ParsedStep.argument` is byte-unchanged and its scope-boundary test passes untouched; the wrapper lives on a different field, which is what that test now says out loud.
- The barrel publishes all eight Phase 4 names with no subpath added; both `exports` key sets are proven identical.
- Repo test count: **389 → 404** (15 new tests, 16 → 17 test files). No pre-existing test was modified or deleted.

## Task Commits

1. **Task 1: Create StepArguments.ts with the DocString shape, the union, and the ordering rule** — `26bd3c9` (feat)
2. **Task 2: Add ParsedStep.stepArguments and populate it in Correlate.ts** — `ab72138` (feat)
3. **Task 3: Export the Phase 4 surface from the barrel and test the ordering rule directly** — `0173342` (feat)
4. **Spec/doc consistency (AGENTS.md §1 and §4)** — `b807af2` (docs)

Base commit for all four: `6ecadab`.

## Files Created/Modified

- `packages/gherkin/src/StepArguments.ts` — new, 158 lines. `DocString`, `StepArgument`, `stepArgumentsOf`, plus the module-scope `orderOf` and the `OrderedArgument` carrier.
- `packages/gherkin/src/Model.ts` — `stepArguments` added immediately after `argument`; the `argument` doc comment rewritten; the module doc's "single local import / second leaf of the DAG" sentence corrected, since `./StepArguments.ts` joined it.
- `packages/gherkin/src/Correlate.ts` — one import, one property, one doc sentence. `grep -c 'stepArgumentsOf('` outputs `1`.
- `packages/gherkin/src/index.ts` — three export groups and the "does three things" rewrite of the module doc. The "single barrel and there is no subpath export" paragraph is verbatim untouched.
- `packages/gherkin/test/Correlate.test.ts` — +7 tests, plus five shared helpers (`tagsOf`, two `_tag` predicates, `dataTableAt`, `docStringAt`).
- `packages/gherkin/test/StepArguments.test.ts` — new, 169 lines, 8 tests, parsing no fixture. `grep -c 'from "../src/index.ts"'` outputs `0`.
- `tsconfig.base.json` — `lib` ES2022 → ES2023 (see deviation 2).
- `packages/gherkin/README.md`, `spec/traceability.md`, `.planning/REQUIREMENTS.md` — see deviation 3.

## Verification

| Gate | Result |
|------|--------|
| `pnpm build` | exit 0 — the required field and its producer landed together |
| `pnpm test` | exit 0 — 404 passed / 17 files |
| `pnpm typecheck:test` | exit 0 |
| `pnpm lint` | exit 0 (oxlint + dprint) |
| `pnpm circular` | exit 0 — `Model.ts` → `StepArguments.ts` → `DataTable.ts` → `Errors.ts` is a DAG |
| `pnpm verify:no-runner-dep` | exit 0 — ENFORCED |
| `pnpm verify:spec` | PASS 7 / FAIL 0 / SKIP 1 |
| `pnpm verify:pack` | **exit 1 — pre-existing, see deviation 4** |

Threat T-04-SC: zero dependencies added. `git diff 6ecadab HEAD -- pnpm-lock.yaml` is empty — the lockfile is byte-identical.

## Mutation proof (Task 2 acceptance criterion), recorded verbatim

**Changed:** in `stepArgumentsOf`, the reorder replaced by a plain return of the fixed
DocString-then-DataTable candidate list —
`return candidates.toSorted((left, right) => left.order - right.order).map(...)` became
`return candidates.map((candidate) => candidate.argument)`.

**Result:** exactly one test failed, and it is the F33 test, naming `"DataTable"` against
`"DocString"`:

```
 FAIL  packages/gherkin/test/Correlate.test.ts > stepArguments across the remaining argument shapes (F33, F29) > F33: reverses the order to DataTable first, DocString second
AssertionError: expected [ 'DocString', 'DataTable' ] to deeply equal [ 'DataTable', 'DocString' ]

- Expected
+ Received

  [
-   "DataTable",
    "DocString",
+   "DataTable",
  ]

 ❯ packages/gherkin/test/Correlate.test.ts:518:73

 Test Files  1 failed | 15 passed (16)
      Tests  1 failed | 395 passed (396)
```

Every F25 assertion still passed under the mutation, which is the point: F25's order and the
hardcoded fallback order are the same, so F25 alone proves nothing about where the order comes
from. Only the byte-mirror fixture can fail here, and it did.

Reverted immediately; `git diff --stat -- packages/gherkin/src/StepArguments.ts` was empty
afterwards, and `pnpm test` returned to 396 (404 after Task 3's file was added).

## The barrel key-set check, recorded verbatim

```
exports:            [".","./package.json"]
publishConfig:      [".","./package.json"]
identical:          true
```

And on the built barrel, `node` against `packages/gherkin/dist/index.js`:

```
makeDataTable true
decodeHashes true
stepArgumentsOf true
```

`grep -c '"\./DataTable"' packages/gherkin/package.json` outputs `0` — no subpath was added, so
the two maps have nothing new to drift on (threat T-04-10).

## Test counts

- **Before this plan:** 389 tests across 16 files (matching 04-03's recorded figure exactly).
- **After Task 2:** 396 across 16 (+7 in `Correlate.test.ts`).
- **After Task 3:** 404 across 17 (+8 in the new `StepArguments.test.ts`).

## Decisions Made

- **The tag list is asserted as a whole array, not by index.** The plan specified
  `stepArguments[0]._tag` / `[1]._tag` assertions. `toEqual(["DocString", "DataTable"])` on a
  `tagsOf` helper is strictly stronger — it fails on a wrong order, on a missing argument, AND on an
  extra one, where two index assertions catch only the first. Length is still asserted separately
  where the plan asked for it.
- **`orderOf` is a named module-scope helper rather than an inline expression.** It is the single
  place the `Option.fromUndefinedOr(argumentIndex)` rule is written, so the pinned upstream fact it
  depends on is documented once, next to the code that depends on it, instead of twice at two call
  sites that could drift apart.
- **`toSorted`'s stability is load-bearing and is named as such.** The documented fallback order
  only holds for the both-indices-`undefined` case because both candidates then tie at `0` and a
  stable sort preserves insertion order. Test 8 in `StepArguments.test.ts` is what would catch that
  assumption breaking.
- **`Effect.runSync` directly in `Correlate.test.ts`, not a copy of `DataTable.test.ts`'s `Outcome`
  helper.** The F25 table has no duplicate header column, so its `hashes()` cannot fail; converting
  the failure channel to a value would add a helper that no assertion in that file needs.
- **The `argumentIndex` key is written with an explicit `undefined` in the synthetic literals**, via
  a small `as`-asserted factory, because `exactOptionalPropertyTypes` forbids writing it directly.
  Omitting the key instead would have tested a shape `compile()` never emits and would have made
  test 5 pass for the wrong reason.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed workspace dependencies in the worktree**

- **Found during:** Task 1, before the first gate could run.
- **Issue:** the parallel-execution worktree was created without `node_modules`, so no gate could run at all.
- **Fix:** `pnpm install --frozen-lockfile`. Not a package-manager *add*: no package name was resolved and neither a manifest nor the lockfile changed, so the package-legitimacy exclusion does not apply.
- **Files modified:** none (`pnpm-lock.yaml` byte-identical against `6ecadab`).
- **Verification:** `pnpm test` baseline 389 passed before any source change — the exact figure 04-03 recorded.
- **Committed in:** n/a — produced no tracked change.

**2. [Rule 3 - Blocking] `lib` raised from ES2022 to ES2023 so `toSorted` exists in the type system**

- **Found during:** Task 1 (`pnpm build`).
- **Issue:** the plan mandates `toSorted` and forbids the mutating in-place alternative, but `tsconfig.base.json` pinned `"lib": ["ES2022"]`, and `Array.prototype.toSorted` is ES2023. The build failed with `TS2550: Property 'toSorted' does not exist ... Try changing the 'lib' compiler option to 'es2023' or later`, plus three cascading implicit-`any` errors on the callback parameters.
- **Fix:** `"lib": ["ES2023"]` in `tsconfig.base.json`, with `target` left at ES2022 and a comment explaining the split. ES2023 added no new SYNTAX — only library methods — so nothing extra is emitted, and every ES2023 array method has been present since Node 20, which is already `packages/gherkin/package.json`'s declared `engines.node` floor. This widens what may be TYPED, not what must be RUN: the supported runtime range is unchanged.
- **Why not Rule 4:** it adds no dependency, moves no module, changes no API and relaxes no strictness flag; it aligns one type-surface setting with a runtime floor the package already declares. The alternative — abandoning `toSorted` for a hand-rolled two-element swap — would have deviated from the plan's actual design and from an explicit acceptance criterion.
- **Files modified:** `tsconfig.base.json`
- **Verification:** `pnpm build`, `pnpm test`, `pnpm typecheck:test`, `pnpm lint`, `pnpm circular` and `pnpm verify:no-runner-dep` all exit 0 afterwards.
- **Committed in:** `26bd3c9`

**Worth recording for the next executor:** the first `pnpm build` after this edit still failed with the identical TS2550. The cause was a stale `packages/gherkin/tsconfig.tsbuildinfo`, not the edit; removing the two `tsbuildinfo` files made the same source compile clean. A `tsconfig` change is not always picked up by `tsc -b`'s incremental state.

**3. [Rule 2 - Correctness] Three status documents that this plan made false, or left false**

AGENTS.md §4 ("say only what is true") and §1 (a code change not reflected in `spec/` in the same
change is incomplete) are hard project directives, so these are correctness requirements rather
than optional tidying.

- `packages/gherkin/README.md` said the `DataTable` wrapper "does **not** ship yet; it is a later phase's deliverable". True until this plan exported it from the barrel; false the moment it did. Plan 04-01's summary explicitly assigned removal of this sentence to "the plan that ships `DataTable.ts`", and this is the plan that makes it reachable. Replaced with a description of what actually ships.
- `.planning/REQUIREMENTS.md`: PARSE-04 marked Complete, via `gsd-sdk query requirements.mark-complete PARSE-04` (checkbox + traceability row, both confirmed). Plans 04-01 and 04-03 each declined to mark it on the record, both citing the same reason — PARSE-04's text also requires that a step carrying both a DocString and a DataTable receives both, which is this plan's `StepArgument` union.
- `spec/traceability.md` §4 gained a row for `StepArguments.test.ts`. It also gained rows for `DataTable.test.ts` and `schema-issue-pin.test.ts`, which had been missing since 04-02 and 04-03: the table states outright that its rows are "enumerated from disk — one per `packages/gherkin/test/*.test.ts` file", so adding only my own row would have shipped a completeness claim that was still false. Two extra lines, and the claim becomes true.

- **Files modified:** `packages/gherkin/README.md`, `.planning/REQUIREMENTS.md`, `spec/traceability.md`
- **Verification:** `pnpm verify:spec` PASS 7 / FAIL 0 / SKIP 1; `pnpm lint` exit 0 after `dprint fmt`.
- **Committed in:** `b807af2`

**4. [Out of scope — deferred, not fixed] `pnpm verify:pack` fails on a superseded ADR**

- **Found during:** Task 3. This is the first plan in Phase 4 to run this gate (04-02 and 04-03 each ran six gates, not this one).
- **Issue:** `✗ @effect-cucumber/gherkin declares effect in devDependencies, peerDependencies -- ADR-EC-015: this package parses feature files and must never depend on effect.` The check at `scripts/verify-pack.sh:130-139` enforces ADR-EC-015, whose successor ADR-EC-021 states in its own title that it **supersedes** it and requires exactly the manifest shape the script rejects.
- **Why it is not this plan's to fix:** the check reads `packages/gherkin/package.json` only. That file was last modified by `f5d84eb`, the ADR-EC-021 implementation, and this plan modified no manifest at all — `git diff 6ecadab HEAD --name-only` lists eleven files, none of them a `package.json`. The gate has been red since `f5d84eb`, well before Phase 4 opened. The other four assertions in the same gate pass, including the two this plan bears on (`exports["."] -> ./dist/index.js`, and no `catalog:`/`workspace:` protocol left in any dependency field).
- **Action:** logged to `.planning/phases/04-datatable-docstring/deferred-items.md` with the concrete fix, per the SCOPE BOUNDARY rule. Plan 04-05 is the natural owner, since it already carries ADR-EC-008's corrections into `spec/`.
- **Consequence for this plan:** one Task 3 acceptance criterion (`pnpm verify:pack` exits 0) is unmeetable at the base commit and is therefore not met. Every other criterion in all three tasks is.

**5. [Rule 3 - Blocking] `_tag` is reached through a type predicate, not by member access**

- **Found during:** Task 2 and Task 3 (test design).
- **Issue:** the plan writes its assertions as `stepArguments[0]._tag`. `no-underscore-dangle` is error-level in this repo for member expressions — documented in `Contracts.test.ts`, `DataTable.test.ts` and `schema-issue-pin.test.ts` alike — so the literal form does not lint. Destructuring alone does not narrow the union either, so a bare `const { _tag } = argument` cannot then be used to call `.hashes()` on the DataTable arm.
- **Fix:** `tagsOf` maps the array to its tags by destructuring inside the callback, and two `_tag`-destructuring type predicates (`isDataTable`, `isDocString`) carry the narrowing — the same shape `DataTable.ts`'s own `isPointerIssue`/`isCompositeIssue` already use in `src`.
- **Files modified:** `packages/gherkin/test/Correlate.test.ts`, `packages/gherkin/test/StepArguments.test.ts`
- **Verification:** `pnpm lint` and `pnpm typecheck:test` exit 0; the tag assertions are stronger than the indexed form they replace.
- **Committed in:** `ab72138`, `0173342`

---

**Total deviations:** 5 — 3 auto-fixed (2 Rule 3 blocking, 1 Rule 2 correctness), 1 environment restore, 1 out-of-scope deferral.
**Impact on plan:** none on the delivered behaviour. Every artifact, export, field name, ordering rule and test case is as specified. One compiler setting was widened to let the specified implementation compile, and one gate that was already red stayed red and was logged rather than fixed.

## Issues Encountered

- The worktree's base commit was `f640f4a`, behind the required `6ecadab`. The tree was clean and the branch verified as `worktree-agent-*`, so the mandated setup-time `git reset --hard 6ecadab` applied cleanly. No protected ref was involved.
- `tsc -b` did not notice the `tsconfig.base.json` `lib` change until the stale `tsconfig.tsbuildinfo` files were removed, producing an identical error message before and after a correct fix. Recorded above so the next executor does not conclude the edit was wrong.
- `exactOptionalPropertyTypes` makes the real upstream shape — a present `argumentIndex` key holding `undefined` — inexpressible as a plain typed literal. Two small `as`-asserted factories in the test file are the narrowest way to reproduce it; `typescript/no-unnecessary-type-assertion` is error-level and did not flag them, which confirms the assertions are doing real work.

## Known Stubs

None. Every export added is wired and exercised: `stepArgumentsOf` has 8 direct tests plus 7 through correlation, `DocString` and `StepArgument` are both constructed and asserted, and the three barrel groups are verified as own exports on the built `dist/index.js`. No placeholder value, empty literal, or unwired component was introduced.

## Threat Flags

None beyond the plan's own register.

- **T-04-09 (ordering tampering) — mitigated as specified.** Both source orders are asserted through correlation (F25, F33) and synthetically (indices 1/2 and 2/1), plus the fallback case, and the mutation proof above shows the reorder is genuinely what produces the order.
- **T-04-10 (barrel surface drift) — mitigated as specified.** No subpath added; both key sets proven byte-identical.
- **T-04-11 (uri/line in error messages) — accepted, unchanged.** This plan introduces no new locator; it passes the step's existing `uri` and AST line into a wrapper that already carried both.
- **T-04-SC — not applicable.** Zero dependencies added; lockfile byte-identical.

No new network endpoint, auth path, file-access pattern or trust-boundary schema. The only new data flow is `.feature` content that already reached `ParsedStep.argument` now also reaching `ParsedStep.stepArguments`, through `makeDataTable`, whose `Object.fromEntries` prototype-pollution guard (T-04-03) was mutation-proven in 04-02 and is untouched here.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- **Plan 04-05** inherits three concrete items: `DataTable.ts` module doc note (c) and note (e) as the source text for ADR-EC-008's stale worked example; the `verify:pack`/ADR-EC-015 staleness in `deferred-items.md`; and `packages/gherkin/README.md`'s opening paragraph, which still claims the package "declares no dependency on the Effect ecosystem in any field" — false since ADR-EC-021, and left alone here because this plan did not cause it. `spec/behaviors/` also has no data-table behavior doc yet, so the three new §4 traceability rows point at BEH-EC-014 as the closest existing home; 04-05 should revisit if it adds one.
- **Phase 5** can spread `step.stepArguments` after the cucumber-expression arguments with the order already settled — that is what the array shape exists for, and nothing downstream needs to read `argumentIndex` again.
- `ParsedStep.argument` remains available and raw for anything the wrapper does not expose.
- No blockers.

## Self-Check: PASSED

Files claimed as created, all present on disk:

```
FOUND: packages/gherkin/src/StepArguments.ts
FOUND: packages/gherkin/test/StepArguments.test.ts
FOUND: .planning/phases/04-datatable-docstring/deferred-items.md
```

Commits claimed, all present in `git log`: `26bd3c9`, `ab72138`, `0173342`, `b807af2` — all on branch `worktree-agent-aefec02878e56a4e5` above base `6ecadab`. Working tree clean apart from ignored `node_modules`/build output. No item missing.

---
*Phase: 04-datatable-docstring*
*Completed: 2026-08-28*

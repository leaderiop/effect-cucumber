---
phase: 02-loadfeature-parse-compile-correlate
plan: 02
subsystem: gherkin-contracts
tags: [errors, model, types, contracts, parsedfeature, tdd-pin, cucumber-messages]

# Dependency graph
requires:
  - phase: 02-loadfeature-parse-compile-correlate
    plan: 01
    provides: "packages/gherkin vitest + @types/node devDependencies, tsconfig types: [\"node\"], test script"
provides:
  - "LoadFeatureError class with ten reason tags, _tag, uri, line, and an explicit this.name"
  - "LoadFeatureWarning data interface with four reason tags, plus the makeWarning factory"
  - "The full ParsedFeature contract: StepOwner, ParsedStep, ParsedScenario, ParsedRule, ParsedFeatureCore, ParsedFeature"
  - "Re-exported @cucumber/messages types (GherkinDocument, Location, Pickle, PickleStep, PickleStepArgument, StepKeywordType)"
  - "A runtime pin on the error/warning shape, including the no-truncation message policy"
affects: [02-04, 02-05, 02-06, 02-07, 02-08, 02-09, 02-10, 02-11, phase-05, phase-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Typed failure surface: a plain class extending Error, discriminated on a `reason` string-literal union, never on message text"
    - "Non-fatal findings are data (LoadFeatureWarning) carried on ParsedFeature.warnings, never thrown"
    - "exactOptionalPropertyTypes asymmetry: constructor args use `line?: number`, fields use `line: number | undefined`"
    - "Third-party types surfaced by the public contract are re-exported from the owning module, never via a package.json subpath export"

key-files:
  created:
    - packages/gherkin/src/Errors.ts
    - packages/gherkin/src/Model.ts
    - packages/gherkin/test/Contracts.test.ts
  modified: []

key-decisions:
  - "Error messages carry FULL DataTable and DocString content, never truncated - locked developer decision overriding research Assumption A7, with the credential-exposure tradeoff accepted and recorded in the module doc comment"
  - "this.name is assigned explicitly in the constructor and pinned by a mutation-tested assertion, so the @cucumber/gherkin failure mode where .name reports \"Error\" cannot reappear"
  - "ParsedScenario carries both astName (un-interpolated) and name (interpolated), built now rather than retrofitted after Phase 6 consumes the contract"
  - "Model.ts re-exports the six @cucumber/messages types the contract surfaces, so consumers are never forced to declare @cucumber/messages; no subpath export was added"
  - "err._tag is read by destructuring in tests because oxlint's no-underscore-dangle is error-level on dotted member access in this repo"

requirements-completed: [PARSE-02, PARSE-03]

# Metrics
duration: 14min
completed: 2026-08-28
---

# Phase 02 Plan 02: Errors and Model Contracts Summary

**The two leaf modules the rest of Phase 2 builds against now exist: a `LoadFeatureError` discriminated by a ten-member `reason` union, a non-throwing `LoadFeatureWarning` carrier, and the full `ParsedFeature` shape that crosses into Phase 5/6 - all pinned by a mutation-tested runtime contract test.**

## Performance

- **Duration:** ~14 min
- **Completed:** 2026-08-28
- **Tasks:** 3 (all `type="auto"`, no checkpoints)
- **Files created:** 3

## Accomplishments

- **`src/Errors.ts`** (133 lines) — the package's typed failure surface, and the first `Error` subclass in the repository. Exports `LoadFeatureErrorReason` (ten string literals, one per Group A/B fixture-table row), `LoadFeatureError`, `LoadFeatureWarningReason` (four literals, one per Group C row), `LoadFeatureWarning`, and `makeWarning`. Imports nothing local — a true DAG leaf.
- **`src/Model.ts`** (163 lines) — the `ParsedFeature` contract. Six exported types plus a re-export block. Its single local import is `import type { LoadFeatureWarning } from "./Errors.ts"`, keeping the module graph acyclic.
- **`test/Contracts.test.ts`** (158 lines, 21 tests) — the first test file in `packages/*`. Proves the error and warning shapes at runtime, imported directly from `../src/Errors.ts` rather than through the barrel.
- **Both load-bearing pins were mutation-tested**, not merely asserted (see Verification below).

## Task Commits

1. **Task 1: Create `src/Errors.ts`** — `3407b20` (feat)
2. **Task 2: Create `src/Model.ts`** — `f595ded` (feat)
3. **Task 3: Create `test/Contracts.test.ts`** — `dcd9c09` (test)

## Files Created

### `packages/gherkin/src/Errors.ts`

- `LoadFeatureErrorReason`: `MissingFile | ParseFailed | UnknownDialect | NoFeature | OutlineWithoutExamples | EmptyExamples | ZeroStepScenario | UninterpolatedPlaceholder | ScenarioKeywordWithExamples | DuplicateScenarioName`. A union type, not an enum — `erasableSyntaxOnly` forbids enums.
- `LoadFeatureError extends Error` with `readonly _tag = "LoadFeatureError"`, `reason`, `uri`, `line: number | undefined`. Single object-argument constructor; fields declared and assigned in the body because parameter properties are `TS1294` under `erasableSyntaxOnly`. `super()` forwards `cause` only when supplied, and `this.name` is set explicitly.
- `LoadFeatureWarningReason`: `UnknownPlaceholder | DuplicateExamplesColumn | EmptyRule | SuspectedSwallowedStep`, each documented against its fixture row (F9, F11, F13, F14).
- `LoadFeatureWarning`: an all-`readonly` data interface. Deliberately not an `Error` subclass and never thrown.
- `makeWarning`: factory normalising an omitted `line` to `undefined`, so call sites are not forced to write `line: undefined` by hand under `exactOptionalPropertyTypes`.
- The module doc comment records both non-obvious decisions: why plain `Error` and not Effect's tagged-error constructor (ADR-EC-015), and the no-truncation message policy with its accepted credential-exposure tradeoff.

### `packages/gherkin/src/Model.ts`

- `StepOwner`, `ParsedStep`, `ParsedScenario`, `ParsedRule`, `ParsedFeatureCore`, `ParsedFeature`.
- Every array field is `ReadonlyArray<T>`, never `T[]` — house style.
- Field-level doc comments encode the anti-patterns the later plans must not fall into: do not infer `origin` from `astNodeIds.length`; do not re-stack Background steps; do not recompute tag inheritance; do not look up `astNodeIds.at(-1)` for the location; `uri` must come from the caller because `GherkinDocument.uri` is `undefined` when parsing a string.
- Re-exports `GherkinDocument`, `Location`, `Pickle`, `PickleStep`, `PickleStepArgument`, `StepKeywordType`.
- Types only. No runtime values, so the emitted JS is empty.

### `packages/gherkin/test/Contracts.test.ts`

21 tests in two `describe` blocks. All `it` titles are unique (`vitest/no-identical-title` is error-level); no focused tests.

## Decisions Made

- **No truncation, ever.** Error messages reproduce DataTable cells and DocString bodies verbatim. This overrides research Assumption A7 (truncate by default) and is a locked developer decision. The tradeoff is stated in the module doc comment rather than left implicit: a feature file holding fixture credentials will reproduce them in error output that may reach a public CI log. Usefulness was chosen over redaction.
- **`this.name` is explicit and pinned.** `@cucumber/gherkin`'s own error classes never set it, so their `.name` reports `"Error"`. A test fails if the assignment is ever dropped.
- **Both `astName` and `name` on `ParsedScenario`.** Success criterion 4 matches a Scenario to its registered definition by the un-interpolated name; adding this after Phase 6 consumes the contract would be expensive.
- **Re-export rather than wrap.** `document` and `pickles` stay on the contract as escape hatches, which exposes the `@cucumber/messages` types either way. Re-exporting them from `Model.ts` means a consumer is not forced to declare `@cucumber/messages`. Per research Open Question 3 and STATE.md 01-04, no subpath export was added to `package.json` — a single barrel avoids maintaining `exports` and `publishConfig.exports` in lockstep.
- **`index.ts` left untouched.** The plan's `files_modified` lists three files; the barrel is replaced by a later plan. `packageName` / `PackageName` therefore remain, so `packages/vitest/src/index.ts` still builds.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `oxlint` rejects `err._tag` as dotted member access**

- **Found during:** Task 3
- **Issue:** The plan requires asserting `err._tag === "LoadFeatureError"`. Writing that literally produced two error-level `eslint(no-underscore-dangle)` violations (`Contracts.test.ts:45` and `:123`), failing `pnpm lint`. The rule is not listed in `.oxlintrc.json` but is active through the enabled categories, and it fires on member expressions while leaving property declarations and object-literal keys alone — which is why `Errors.ts` itself lints clean.
- **Fix:** Read `_tag` by object destructuring (`const { _tag } = makeError()`), which the rule permits. The assertion is unchanged in substance. A comment at the destructure records why.
- **Files modified:** `packages/gherkin/test/Contracts.test.ts`
- **Commit:** `dcd9c09`

**2. [Rule 3 - Blocking] Two acceptance-criteria greps matched the doc comments they were meant to police**

- **Found during:** Tasks 1 and 2
- **Issue:** `grep -c 'Data.TaggedError' src/Errors.ts` must be 0, but the doc comment explaining *why* that constructor is unavailable named it twice. Likewise `grep -c 'hashes\|rowsHash\|DataTable('` must be 0 in `Model.ts`, but the comment deferring the table-accessor API to Phase 4 named those methods.
- **Fix:** Rewrote both comments to convey the same reasoning without the literal tokens ("Effect's tagged-error constructor"; "a table-accessor helper ... that accessor API is Phase 4's deliverable"). No code changed; the reasoning is preserved.
- **Files modified:** `packages/gherkin/src/Errors.ts`, `packages/gherkin/src/Model.ts`
- **Commit:** `3407b20`, `f595ded`

**3. [Rule 3 - Blocking] `node_modules` absent in the fresh worktree**

- **Found during:** Setup, before Task 1
- **Issue:** The worktree had no `node_modules`, so `pnpm build`, `pnpm lint`, and `vitest` could not run and no acceptance criterion was checkable.
- **Fix:** `pnpm install --frozen-lockfile`. Resolved 201 packages with zero lockfile drift, so no manifest or lockfile change was produced and nothing was committed. No new package was introduced, so the package-legitimacy checkpoint does not apply.
- **Files modified:** none
- **Commit:** n/a

**4. [Rule 1 - Bug] Commit message overstated the pinned message length**

- **Found during:** Task 3, post-commit check
- **Issue:** The Task 3 commit message claimed a "557-character" pinned message; the actual length is 544. AGENTS.md §4 ("Say only what is true") makes an inaccurate claim in a commit message a defect, not a nit.
- **Fix:** `git commit --amend` with the measured value. Amended on the per-agent worktree branch before any merge, so no shared history was rewritten.
- **Files modified:** none (message only)
- **Commit:** `dcd9c09`

### Deliberate Non-Deviations

- **`packages/gherkin/tsconfig.json` still has `include: ["src"]`**, so `test/Contracts.test.ts` is transpiled by vitest but never type-checked by `tsc -b`. This is the carry-forward that plan 02-01 recorded and that plan 02-10 owns. It was not widened here: `rootDir: ${configDir}/src` means adding `"test"` to `include` breaks the build outright.
- **No `.feature` fixtures were added.** Those are plan 02-03's deliverable, executing in parallel in a separate worktree.

## Verification Performed

All four plan-level verification commands exit 0 on the final tree:

- `pnpm build` — 0. Proves both modules compile under `strict` + `erasableSyntaxOnly` + `exactOptionalPropertyTypes` + `noUncheckedIndexedAccess` + `verbatimModuleSyntax`.
- `pnpm lint` (`oxlint -f unix && dprint check`) — 0.
- `pnpm circular` (madge) — "No circular dependency found!" across 4 files.
- `pnpm vitest run packages/gherkin/test/Contracts.test.ts` — 21 passed in 1 file. Full-suite `pnpm test` is 61 passed in 4 files (the 3 pre-existing vendored oxlint-rule test files plus this one).

Every per-task acceptance-criteria grep was executed:

| Criterion | Required | Actual |
|---|---|---|
| `grep -c 'export ' Errors.ts` | >= 5 | 5 |
| distinct error reason literals | 10 | 10 |
| distinct warning reason literals | 4 | 4 |
| `grep -c 'enum ' Errors.ts` | 0 | 0 |
| `grep -c 'from "effect' Errors.ts` | 0 | 0 |
| `grep -c 'Data.TaggedError' Errors.ts` | 0 | 0 |
| no-truncation grep (comments excluded) | 0 | 0 |
| `grep -c 'export interface\|export type' Model.ts` | >= 6 | 7 |
| `astName` / `origin` / `warnings` in Model.ts | >= 1 each | 1 / 2 / 2 |
| `T[]` array syntax in Model.ts | 0 | 0 |
| `hashes\|rowsHash\|DataTable(` in Model.ts | 0 | 0 |
| `from "./Errors.ts"` in Model.ts | 1 | 1 (and it is `import type`) |
| `from "./index` in Model.ts | 0 | 0 |
| `from "../src/index` in Contracts.test.ts | 0 | 0 |
| `it.only\|describe.only` in Contracts.test.ts | 0 | 0 |
| pinned message length | >= 400 | 544 |

**Mutation testing (per the repo's gate-script discipline: prove the gate is not vacuous).** Two mutations were applied to `Errors.ts`, the suite re-run, and the file restored byte-identical to its commit each time:

1. **Deleted `this.name = "LoadFeatureError"`.** Result: 1 test failed — `AssertionError: expected 'Error' to be 'LoadFeatureError'`. This is exactly the `@cucumber/gherkin` failure mode the plan names, and the test catches it.
2. **Reintroduced truncation** (`args.message.length > 120 ? \`${args.message.slice(0, 120)}...\` : args.message`). Result: 3 tests failed, **and** the Task 1 no-truncation grep gate went from 0 to 1. Both the runtime pin and the static gate independently catch a reintroduced truncation.

`git status` was clean after each restore, confirming the committed `Errors.ts` is the unmutated version.

## Threat Model Compliance

- **T-02-02 (Information Disclosure — full message content):** **accepted**, per the locked developer decision. The acceptance is not silent: the tradeoff is spelled out in the `Errors.ts` module doc comment, and a runtime test plus a static grep gate both fail if truncation is reintroduced. A future reader who wants to add truncation must consciously delete a documented decision, not merely fail to notice one.
- **T-02-01 (Denial of Service — ReDoS):** **mitigated.** Neither module constructs a `RegExp`. Verified: no `RegExp`, `new RegExp`, or regex literal appears in `Errors.ts` or `Model.ts`. The stricter package-wide assertion is plan 02-08's.
- **T-02-07 (Spoofing — error-class identity):** **mitigated.** `this.name` is set explicitly, asserted at runtime, and mutation-tested. Consumers discriminate on `err.reason` or `instanceof`; no code introduced here matches on `.name` as a string.

## Threat Flags

None. Neither module opens a network endpoint, an auth path, a file-access pattern, or a schema at a trust boundary. `Errors.ts` and `Model.ts` are pure declarations plus one object-literal factory.

## Issues Encountered

- `madge` emits one warning during `pnpm circular` (`unmet peer typescript@^5.4.4: found 7.0.2`). Pre-existing, out of scope, already recorded in the 02-01 summary. Not acted on.

## Known Stubs

None. Both modules are complete declarations of their contracts, not placeholders. They have no consumers yet — `Correlate.ts`, `Validate.ts`, and `loadFeature.ts` arrive in later Phase 2 plans — but that is the intended DAG-leaf-first sequencing, not a stub.

## User Setup Required

None.

## Next Phase Readiness

- **Every later Phase 2 plan can now implement against these types** instead of inventing them. `Validate.ts` gets its reason tags, `Correlate.ts` gets `ParsedFeatureCore` and `StepOwner`, `loadFeature.ts` gets the `ParsedFeature` join point.
- **Carry-forward — the barrel.** `src/index.ts` is still the Phase 1 placeholder and does not export `LoadFeatureError` or `ParsedFeature`. The plan that replaces it must add them, and must keep `packageName` / `PackageName` or amend `packages/vitest/src/index.ts` in the same commit, or the `types` CI job breaks.
- **Carry-forward — test type-checking.** `test/Contracts.test.ts` is not type-checked by `tsc -b`. Plan 02-10 owns the separate `tsconfig.test.json`; when it lands, this file is the first thing it will check.
- **Carry-forward — `no-underscore-dangle`.** Any Phase 5/6 code reading `err._tag` through dotted member access will fail `pnpm lint`. Destructure, or the phase that consumes `_tag` must decide to configure the rule explicitly. Worth surfacing before Phase 6 rather than during it.
- **Note for `Correlate.ts`:** `Pickle.location` and `Step.keywordType` are both **optional** in `@cucumber/messages@34.2.1` (`location?: Location`, `keywordType?: StepKeywordType`), while `ParsedScenario.location` and `ParsedStep.keywordType` are required. The narrowing is deliberate — the contract promises a caller more than the upstream type does — so `Correlate.ts` must handle the `undefined` case rather than assert it away.

## Self-Check: PASSED

Files:

- `packages/gherkin/src/Errors.ts` — FOUND
- `packages/gherkin/src/Model.ts` — FOUND
- `packages/gherkin/test/Contracts.test.ts` — FOUND
- `.planning/phases/02-loadfeature-parse-compile-correlate/02-02-SUMMARY.md` — FOUND

Commits:

- `3407b20` — FOUND
- `f595ded` — FOUND
- `dcd9c09` — FOUND

No tracked files were deleted by any of the three commits. No shared orchestrator artifact (`STATE.md`, `ROADMAP.md`) was touched.

---
*Phase: 02-loadfeature-parse-compile-correlate*
*Completed: 2026-08-28*

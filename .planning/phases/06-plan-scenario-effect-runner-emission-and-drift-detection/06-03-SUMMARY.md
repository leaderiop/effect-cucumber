---
phase: 06-plan-scenario-effect-runner-emission-and-drift-detection
plan: 03
subsystem: drift-detection-types-and-test-api-seam
tags: [errors, schema-tagged-error, warnings, test-api, types-only, match-03, match-04, match-05, mutation-tested]
requires: []
provides:
  - "StepMatchError — Schema.TaggedError over UndefinedStep (MATCH-03) / AmbiguousStep (MATCH-04), nine fields"
  - "StepMatchErrorReason — the closed two-member reason union"
  - "UnusedStepDefinitionWarning + makeUnusedStepDefinitionWarning — MATCH-05 / D-02 channel-3 structured data"
  - "UnusedStepDefinitionWarningReason — the one-member reason union"
  - "TestApi — the two-member, zero-runtime describe/it.effect seam (ARCHITECTURE.md Pattern 3)"
affects:
  - "plan 06-04 (Plan.ts) — owns the plain-optionals StepMatchError factory and the D-03 definition-site sort"
  - "plan 06-05/06-06 (Runner.ts + its recording fake) — must be written against TestApi, never against vitest"
  - "plan 06-07 — owns packages/vitest/src/index.ts and must add the four Errors.ts exports; TestApi stays internal"
  - "phase 9 (RUN-05) — the plan that adds skip/only to TestApi"
tech-stack:
  added: []
  patterns:
    - "Schema.TaggedError for a failure, plain interface + factory for a non-failing warning (gherkin Errors.ts precedent)"
    - "types-only module with two `import type`s and a zero-statement JS emit (Dsl.ts precedent)"
    - "hard-coded message.length assertion, never a substring, as the executable form of the no-truncation policy"
    - "local thrownBy helper in place of vitest's throw matcher (expressions-pin.test.ts precedent)"
key-files:
  created:
    - packages/vitest/src/Errors.ts
    - packages/vitest/src/TestApi.ts
    - packages/vitest/test/Errors.test.ts
  modified: []
decisions:
  - "StepMatchErrorReason is closed at two members; the unused-pattern case is a warning, never a third tag"
  - "matchedPatterns is an empty ARRAY for UndefinedStep, not Option.none() — zero matches is a zero-length list"
  - "Errors.ts applies no sort to matchedPatterns; D-03's definition-site order belongs to Plan.ts alone"
  - "TestApi omits skip/only by decision — RUN-05 (Phase 9) adds them, so 06-06's fake needs no unasserted members"
  - "definedAt is a pre-formatted Option<string>, which is what keeps Errors.ts import-free of CallSite.ts"
  - "MATCH-03/04/05 stay Pending — this plan shipped data shapes, not the Plan/Runner behaviour"
metrics:
  duration: ~10m
  completed: 2026-08-29
  tasks: 3
  files: 3
  tests_before: "427 across 20 files"
  tests_after: "450 across 21 files"
---

# Phase 6 Plan 03: Drift-Detection Types and the TestApi Seam Summary

Redeemed plan 03-01's reserved name: `StepMatchError` now exists as a nine-field
`Schema.TaggedError` over `UndefinedStep`/`AmbiguousStep`, alongside the MATCH-05
`UnusedStepDefinitionWarning` (interface + factory) and `TestApi`, a two-member zero-runtime
contract that lets `Runner.ts` be written with no test framework in scope.

## What Was Built

### Task 1 — `packages/vitest/src/Errors.ts` (commit `e0d187a`)

Two shapes, deliberately different kinds of thing.

**`StepMatchError`** — a `Schema.TaggedError` with exactly the nine specified fields:
`reason` (`Schema.Literals(["UndefinedStep", "AmbiguousStep"])`), `uri`, `line`, `stepText`,
`scenarioName`, `matchedPatterns` (`Schema.Array(Schema.String)`), `suggestion`, `message`, `cause`.
`line`, `suggestion` and `cause` are all `Schema.OptionFromUndefinedOr`. No custom constructor.

Three field choices are recorded in the class doc comment because none is guessable:

- `stepText` is the **interpolated Pickle** text, not the AST text — for a Scenario Outline the two
  differ, and the interpolated one is what was actually matched (BEH-EC-013's literal requirement).
- `matchedPatterns` is in the **caller's** order and this class applies no sort. 06-CONTEXT.md D-03
  orders by definition site (`file:line`), and `Plan.ts` owns applying it; sorting here as well
  would put one rule in two places and let them disagree.
- `matchedPatterns` is an empty **array** for `UndefinedStep`, never `Option.none()` — "no patterns
  matched" is genuinely a zero-length list, not an absent one.

**`UnusedStepDefinitionWarning`** — a plain interface (`_tag`, `reason`, `featureName`, `uri`,
`keyword`, `pattern`, `definedAt: Option<string>`, `message`) plus
`makeUnusedStepDefinitionWarning`, which does the `Option.fromUndefinedOr` wrapping once so
`Plan.ts` keeps a plain omittable `definedAt?: string`. The doc comment says explicitly that this
is a genuinely NEW channel in this package and **not** a reuse of gherkin's `LoadFeatureWarning`,
naming D-02's reason: `ParsedFeature.warnings` is a parse-time channel, and an unused step
definition is not a fact about a `.feature` file at all — it is computed at Plan stage from a join
the gherkin package never sees.

`keyword` is a plain `string` (not `Registry.ts`'s `StepKeyword`) and `definedAt` is an
already-**formatted** string. Both choices exist to keep the module import-free: `grep -c '^import'`
returns exactly `2` (`effect/Option`, `effect/Schema`), which is what let it land in wave 1
alongside 06-01 and 06-02.

The module doc comment carries lettered notes (a)–(e) covering the separate-class rationale
(BEH-EC-014 closes gherkin's union at ten tags "drawn from exactly this set"; `packages/gherkin/src/Errors.ts`
note (d) reserves this name), the four rc-build constraints stated **as constraints**, the
interface-not-class rationale for the warning, the locked no-truncation policy, and the
no-local-imports invariant. It closes by naming plan 06-07 as the owner of the barrel edit.

### Task 2 — `packages/vitest/src/TestApi.ts` (commit `0ce1602`)

Types only. Two `import type`s from `effect/*`, no `const`/`function`/`class`, and the emitted
`packages/vitest/dist/TestApi.js` carries zero statements beyond `moduleDetection: "force"`'s bare
`export {}` — verified with the portable strip-and-compare check, since plan 03-02 already recorded
that "byte-empty" is not a valid criterion under that setting.

`TestApi` declares exactly two members:

- `describe: (name: string, define: () => void) => void` — `define` returns `void`, never
  `void | Promise<void>`. An async callback registers nothing before returning, so the block emits
  zero tests and passes; this is `describeFeature.ts` note (c)'s failure mode restated one layer
  down, and the type is the only thing forbidding it.
- `effect: (name: string, self: () => Effect.Effect<void, unknown, Scope.Scope>) => void` — one
  Scenario, one test (ADR-EC-004). The error channel is `unknown`, not `never` and not
  `StepMatchError`: a Scenario can fail from drift detection **or** with whatever the step author's
  own Effect declares, and the seam has no business narrowing the second.

`Scope.Scope` appears only in the Effect's required-context position and is never hoisted onto
`TestApi` — `Dsl.ts` note (b)'s reasoning, applied unchanged.

`skip` and `only` are **absent by decision**, recorded as note (b) per AGENTS.md §4. Nothing in
Phase 6 calls either; tag routing is RUN-05 (Phase 9), and declaring them now would force 06-06's
recording fake to implement two members no assertion covers.

Note (a) states the invariant the seam exists for, citing ARCHITECTURE.md Anti-Pattern 3's verified
failure: calling the module-level `it.effect` inside `layer(...)`'s callback compiles, passes, and
silently rebuilds the "shared" resource per Scenario — a BEH-EC-007 violation with no failing test
anywhere. No `vitest`/`@effect/vitest` import appears in the file, not even a type import (the word
appears only in prose).

### Task 3 — `packages/vitest/test/Errors.test.ts` (commit `b75bf22`)

23 tests across five `describe` blocks, covering every case in the plan's `<behavior>` list:
both reason tags round-tripping, `_tag`/`name` derivation, the D-01 suggestion, `line`/`cause` as
explicit `Option`s (with `cause` reference equality), the empty-array `matchedPatterns` for
`UndefinedStep`, the caller-order contract for `AmbiguousStep`, the omitted-key construction
failure, untruncated 4000-character messages on both types, and `definedAt`'s some/none normalisation.

Three assertions are stricter than they look, each recorded in the file's doc comment:

- **`message.length` against a hard-coded `4000`, never a substring.** A `toContain` check passes
  against a truncated message that keeps its prefix — which is what every truncating formatter
  produces.
- **`ambiguousPatterns` is ordered `I…`, `A…`, `G…`.** Alphabetical would be `A…`, `G…`, `I…`, so
  an accidental sort anywhere on the path fails the test rather than quietly agreeing with it.
- **The omitted-key case goes through a local `thrownBy`,** never vitest's throw matcher: with no
  argument that matcher is rejected by oxlint's error-level `vitest(require-to-throw-message)`, and
  with one it would pin this file to `effect`'s upstream prose. The helper is reproduced locally
  rather than imported across packages.

## Verification

| Check | Result |
|-------|--------|
| `pnpm build` | exit 0, no `overriddenSchemaConstructor` diagnostic |
| `pnpm lint` | exit 0 (oxlint + dprint) |
| `pnpm test` | 450 passed across 21 files (was 427 across 20) |
| `pnpm vitest run packages/vitest/test/Errors.test.ts` | 23 passed (criterion: at least 6) |
| `pnpm typecheck:test` | exit 0, both projects |
| `pnpm circular` | no circular dependency found |
| emitted `dist/TestApi.js` zero-statement check | exit 0 |
| `grep -c 'Schema.Literals(\[' src/Errors.ts` | 2 (criterion: at least 1) |
| `grep -v '^ \*' src/Errors.ts \| grep -c 'Schema.Literal('` | 0 |
| `grep -v '^ \*' src/Errors.ts \| grep -c 'Schema.Defect'` | 0 |
| `grep -v '^ \*' src/Errors.ts \| grep -c 'constructor('` | 0 |
| `grep -c 'export interface UnusedStepDefinitionWarning'` / `'class UnusedStepDefinitionWarning'` | 1 / 0 |
| `grep -c '^import' src/Errors.ts` | 2 |
| `grep -c '^import' src/TestApi.ts` / `'^import type'` | 2 / 2 |
| `grep -cE '^(export )?(const\|function\|class\|let\|var) ' src/TestApi.ts` | 0 |
| `TestApi` members / `skip`+`only` members | 2 / 0 |
| `grep -c 'toThrow' test/Errors.test.ts` | 0 |
| `grep -c 'Mutation-tested' test/Errors.test.ts` with entries A and B | 1, both present |

### Mutation proofs (both performed, observed failing, then reverted)

1. **Mutation A — a `.slice(0, 200)` at a construction site.** Applied to
   `makeUnusedStepDefinitionWarning`'s `message`. Result: *"survives a 4000-character message with
   its length unchanged"* failed with `expected 200 to be 4000`.
2. **Mutation B — `Option.some(args.definedAt)` unconditionally** instead of
   `Option.fromUndefinedOr`. Result: *"normalises an omitted definedAt to Option.none()"* failed
   with `{ _tag: 'Some', value: undefined }` against the expected `None`.

Both reverted; `git diff` against the Task 1 commit is empty and the suite is green.

## Deviations from Plan

**1. [Rule 3 - Blocking] Restored the dependency tree in the worktree**
- **Found during:** setup, before Task 1
- **Issue:** the worktree had no `node_modules`, so `tsc`, `vitest`, `oxlint`, `dprint` and `madge`
  — every verification command in the plan — were unrunnable.
- **Fix:** `pnpm install --frozen-lockfile`. This restores exactly the tree the committed
  `pnpm-lock.yaml` already describes: no package was added, no manifest dependency field changed,
  and the lockfile is unmodified — so threat **T-06-03-SC**'s "this plan installs nothing"
  disposition still holds.
- **Files modified:** none tracked.

**2. [Rule 1 - Criterion self-contradiction] Mutation A was applied at the factory, not to `StepMatchError`'s schema**
- **Found during:** Task 3 mutation testing
- **Issue:** the plan offers mutation A as "`StepMatchError`'s `message` field is changed to a
  schema that truncates (or a `.slice(0, 200)` is introduced at a construction site)". The first
  form is not achievable under this rc build, and the plan's own verified fact 3 is why: a
  `Schema.TaggedError` constructor validates against the **Type** side, so a decode transformation
  on `message` never runs at construction and could not truncate anything. `StepMatchError` also has
  no construction site in `src` yet — its plain-optionals factory is `Plan.ts`'s, plan 06-04.
- **Fix:** used the plan's own second form, at the one construction site `src/Errors.ts` currently
  has: `makeUnusedStepDefinitionWarning`'s `message`. The 4000-character length assertion is pinned
  on **both** types, so the identical assertion on `StepMatchError` is already waiting for 06-04's
  factory before that factory exists. The file's mutation header records exactly this.
- **Files modified:** none beyond the reverted mutation.

**3. [Rule 1 - Criterion self-contradiction] `toThrow` removed from the test file's prose**
- **Found during:** Task 3 acceptance checks
- **Issue:** the criterion `grep -c 'toThrow()' packages/vitest/test/Errors.test.ts` returns `0` is
  a raw grep with no comment filter, but the plan simultaneously asks the file to **explain** why it
  avoids that matcher — and the repo's four precedents (`expressions-pin`, `ParameterTypes`,
  `StepMatcher`, `DataTable`) all name it in prose. Written that way the file cannot satisfy both.
- **Fix:** the prose now refers to "vitest's throw matcher" and cites the lint rule by name
  (`vitest(require-to-throw-message)`) instead of spelling the identifier, and distinguishes its
  no-argument form (lint-rejected) from its with-argument form (would pin this file to upstream
  prose). Meaning preserved; `grep -c 'toThrow'` — deliberately checked without the parens too, so
  the result holds under either BRE or ERE — returns `0`. No assertion changed.
- **Files modified:** `packages/vitest/test/Errors.test.ts` (doc comment only, pre-commit).

## Requirements Status

**MATCH-03, MATCH-04 and MATCH-05 all stay Pending in REQUIREMENTS.md**, deliberately — following
the precedent set repeatedly in Phases 3 and 5, where a plan declined the marking until the
requirement was true end to end.

This plan shipped the **data shapes** those requirements will be reported through. It shipped no
step-to-pattern resolution, no Scenario failure, and no warning computation:

- **MATCH-03/04** ("a Pickle step matching zero / more than one registered pattern fails the
  containing Scenario, naming …") — `StepMatchError` can now *carry* every named fact, but nothing
  yet resolves a step or fails a Scenario. `Plan.ts` (06-04) and `Runner.ts` do that.
- **MATCH-05** ("a registered pattern matching zero steps is a Feature-level warning") —
  `UnusedStepDefinitionWarning` is D-02's channel 3 shape only. Channels 1 (`console.warn`) and 2
  (the synthetic passing test node) do not exist yet, and nothing computes the unused set.

Note also that all three IDs are claimed by seven of this phase's eight plans. `.planning/REQUIREMENTS.md`
was therefore left untouched by this worktree agent — it is a shared artifact and the marking
belongs to whichever later plan makes the requirement true.

## Known Stubs

None. Both source modules are complete contracts, not placeholders. `TestApi` has no
implementation in this plan by design — it is an interface, and `describeFeature.ts`'s composition
root supplies the real object in a later plan (06-05/06-06). `packages/vitest/src/index.ts` is
untouched; the four `Errors.ts` exports are a **deferred** barrel edit explicitly assigned to plan
06-07 in the module's closing note, following the same "name the owning plan" convention plans
03-01 and 03-02 set.

## Notes for Later Plans

- **06-04 owns the `StepMatchError` factory.** Do not add a custom constructor to the class —
  `@effect/tsgo`'s `overriddenSchemaConstructor` rejects it, and a Schema-decoded reconstruction
  would bypass one anyway. Plain-optional wrapping goes in `Plan.ts`, the same split
  `packages/gherkin/src/DataTable.ts` uses.
- **06-04 also owns the D-03 sort.** `Errors.ts` applies none. Sort `matchedPatterns` by definition
  site before constructing the error; the test in this plan asserts the caller's order survives, so
  a sort added in `Errors.ts` later would make the two rules disagree silently.
- **`matchedPatterns` is an array, never an Option.** Pass `[]` for `UndefinedStep`.
- **Every `Option`-typed constructor key is required.** `line`, `suggestion` and `cause` must each
  be an explicit `Option.some(x)` / `Option.none()`; omitting the key throws. A test pins this.
- **`Runner.ts` must import no test framework — not even `import type`.** The whole point of
  `TestApi` is that 06-06's recording fake needs no vitest machinery in scope.
- **`TestApi` has no `skip`/`only`.** Phase 9's RUN-05 adds them, together with the assertions that
  make them non-vacuous. Do not add them speculatively.
- **06-07 must add four exports to `packages/vitest/src/index.ts`:** `StepMatchError`,
  `StepMatchErrorReason`, `UnusedStepDefinitionWarning`, `UnusedStepDefinitionWarningReason`.
  `TestApi` stays internal and out of the barrel.
- **`definedAt` arrives pre-formatted.** Whoever captures the call site (06-01's `DefinitionSite`)
  formats it to a `file:line:col` string before handing it to the factory — that is what keeps
  `Errors.ts` free of local imports.
- Repo test count is now **450 across 21 files** (427 across 20 before this plan).

## Threat Flags

None. This plan shipped one dependency-free error module, one types-only interface file and one
unit test — no network, no I/O, no user-input parsing, no auth, no persistence, no new endpoint or
schema at a trust boundary.

Every `mitigate` disposition in the plan's threat register is discharged:

- **T-06-03-02 (Tampering, field decoding)** — every field is declared with an explicit schema,
  there is no `Schema.Any` field, and there is no custom constructor. Asserted by grep
  (`constructor(` → 0) and by the omitted-key test, which proves `Schema.OptionFromUndefinedOr`
  really does force an explicit `Option` rather than defaulting.
- **T-06-03-03 (Repudiation, error without a location)** — `uri` is required and `line` is an
  explicit `Option`, so an error either names its source location or visibly says it has none.
  There is no silent `0`/`""` default anywhere in the class.

The three `accept` dispositions (T-06-03-01 untruncated content, T-06-03-04 opaque `cause`,
T-06-03-SC no installs) hold unchanged; the no-truncation acceptance is now executable rather than
merely stated, via the 4000-character length assertions.

## Self-Check: PASSED

All three claimed files verified present on disk:
- `/Users/mohammadalmechkor/Projects/Perso/effect-cucumber/packages/vitest/src/Errors.ts`
- `/Users/mohammadalmechkor/Projects/Perso/effect-cucumber/packages/vitest/src/TestApi.ts`
- `/Users/mohammadalmechkor/Projects/Perso/effect-cucumber/packages/vitest/test/Errors.test.ts`

All three commits verified in `git log`: `e0d187a`, `0ce1602`, `b75bf22`. Working tree clean —
both mutation proofs were reverted before their commits, and `git diff` confirms `src/Errors.ts` is
byte-identical to the state committed in `e0d187a`.

---
phase: 09-tags
plan: 07
subsystem: testing
tags: [tags, config, glob, file-io, barrel, public-surface, supply-chain, tinyglobby, vitest, RUN-05]

# Dependency graph
requires:
  - phase: 09-tags
    provides: "09-02's Errors.ts (UndeclaredTagWarning, ExcludedScenariosNotice and their reason unions) and Tags.ts; 09-04's EmitOptions seam and emitFeature's returned outcome; 09-05's DescribeFeatureOptions on describeFeature.ts"
  - phase: 03-parameter-types-and-step-matching
    provides: "packages/gherkin/test/StepArgs.types.ts — the compile-time-only `.types.ts` precedent and the reason its suffix keeps it out of the vitest include glob"
  - phase: 01-repository-and-toolchain
    provides: "packages/vitest/tsconfig.test.json's include: [src, test] and the `pnpm typecheck:test` step that compiles it"
provides:
  - "packages/vitest/src/GherkinTags.ts — gherkinTags(pattern) and GherkinTagDefinition, a synchronous glob-driven scan of .feature files into runner tag declarations"
  - "packages/vitest/package.json — tinyglobby@^0.2.17 as this package's one non-workspace runtime dependency"
  - "packages/vitest/src/index.ts — the phase's public surface: gherkinTags, GherkinTagDefinition, DescribeFeatureOptions, UndeclaredTagWarning(+Reason), ExcludedScenariosNotice(+Reason)"
  - "packages/vitest/test/GherkinTags.types.ts — the compile-time proof that the helper's result spreads into vitest's own TestTagDefinition[]"
  - "packages/vitest/test/fixtures/ — the first fixture tree under packages/vitest, including a nested subdirectory and a DocString decoy"
affects:
  - "09-09 / the phase's closing plan (the spec now has a config helper to document; BEH-EC-008 and ADR-EC-020 still describe the pre-phase behaviour)"
  - "any future consumer-facing README or spec example — gherkinTags is the supported way to declare tags and is now the first thing a tag-filtering walkthrough needs"

# Tech tracking
tech-stack:
  added:
    - "tinyglobby@0.2.17 — direct runtime dependency of packages/vitest (user-confirmed exception to the phase's no-new-packages baseline, 09-CONTEXT.md D-09 addendum 2026-08-29)"
  patterns:
    - "A required parameter with NO default as a security control: the absence of a default is what makes an implicit whole-working-directory scan structurally impossible"
    - "Two adjacent empty-ish inputs given deliberately DIFFERENT dispositions — an empty pattern throws, a zero-match pattern returns [] — with the asymmetry argued in the doc comment rather than left to be discovered"
    - "Passing options that already match a library's defaults, explicitly, so a future default change cannot silently widen a scan"
    - "A test's fixture pattern DERIVED from import.meta.url relative to process.cwd(), because the function under test resolves against cwd and a zero-match glob does not throw — the derivation is what stops the file passing vacuously"
    - "A second `.types.ts` compile-time-only file for a claim no runtime assertion can reach, following StepArgs.types.ts, with the §4 preamble's count amended in the same change"

key-files:
  created:
    - packages/vitest/src/GherkinTags.ts
    - packages/vitest/test/GherkinTags.test.ts
    - packages/vitest/test/GherkinTags.types.ts
    - packages/vitest/test/fixtures/tag-scan-a.feature
    - packages/vitest/test/fixtures/tag-scan-nested/tag-scan-b.feature
    - packages/vitest/test/fixtures/tag-scan-docstring.feature
  modified:
    - packages/vitest/package.json
    - pnpm-lock.yaml
    - packages/vitest/src/index.ts
    - spec/traceability.md

key-decisions:
  - "gherkinTags ships D-09's literal glob-string signature as the user confirmed on 2026-08-29 — this is the plan as scoped, NOT a deviation, and the module says so nowhere because there is nothing to explain"
  - "tinyglobby is a `dependencies` entry with a CARET range, not a devDependency and not an exact pin: the helper runs in a consumer's own config, and pnpm-workspace.yaml reserves exact pins for devDependencies while packages/gherkin's three runtime deps are all carets"
  - "globSync, never glob: a runner config is evaluated synchronously at load time, the same constraint that rules out reusing loadFeature (AsyncFiberError)"
  - "dot:false and onlyFiles:true passed explicitly despite already being the library's defaults; cwd, absolute, expandDirectories, globstar and braceExpansion left untouched, and no working directory hardcoded"
  - "An empty pattern throws; a zero-match pattern returns [] — different situations, only one unambiguously a mistake"
  - "The barrel stays a SINGLE entry point; package.json's exports and publishConfig.exports were not touched by this plan"

patterns-established:
  - "Proving a `.types.ts` file is non-vacuous by mutating the SOURCE type it asserts against and recording the exact diagnostic, rather than trusting a green typecheck"

# Requirements
requirements-completed: []
requirements-advanced: [RUN-05]

# Metrics
duration: 35min
completed: 2026-08-30
---

# Phase 9 Plan 07: The `gherkinTags` Config Helper and the Barrel's Public Surface Summary

**`gherkinTags("<glob>")` turns a consumer's own `.feature` files into the runner tag declarations that `--tagsFilter` validates against — synchronously, at config-load time, with no implicit scan, a loud throw on an empty pattern and a compile-time proof that its result spreads into vitest's own `TestTagDefinition[]` — and the package barrel now exports this phase's public surface instead of claiming a tag is inert.**

## Performance

| Metric | Value |
|---|---|
| Duration | ~35 min (00:25 → 00:38, 2026-08-30, including two mutation proofs and one type mutation) |
| Tasks | 3 of 3 |
| Files created | 6 |
| Files modified | 4 |
| Repo test count | 713 → **722** (+9, all in `GherkinTags.test.ts`) |
| Test files | 31 → **32** (`GherkinTags.types.ts` correctly NOT collected) |

## Task Commits

1. **Task 1: declare `tinyglobby`, create `GherkinTags.ts`** — `bf3ad73` (feat)
2. **Task 2: fixtures, runtime tests, the compile-time proof, two traceability rows** — `0ea1746` (test)
3. **Task 3: barrel exports and the two rewritten paragraphs** — `4d4bea0` (feat)

## D-09's glob signature shipped as scoped — this is not a deviation

The helper's signature is exactly what `<interfaces>` specified and exactly what the user confirmed
in 09-CONTEXT.md's D-09 addendum:

```ts
export interface GherkinTagDefinition {
  readonly name: string
}

export const gherkinTags: (
  pattern: string | ReadonlyArray<string>
) => ReadonlyArray<GherkinTagDefinition>
```

The parameter type mirrors `tinyglobby`'s own `patterns` parameter verbatim
(`string | readonly string[]`), so a caller who already knows the library learns nothing new. The
earlier explicit-path-array design the plan-checker flagged is gone entirely; nothing in the module,
the tests or this summary describes the glob shape as a deviation, because it is the decision.

Intended consumer usage, which is what `GherkinTags.types.ts` compiles:

```ts
test: { tags: [...gherkinTags("features/**/*.feature"), { name: "@skip" }, { name: "@only" }] }
```

## The one new dependency, and the lockfile diff's exact shape

`packages/vitest/package.json` gained one line in `dependencies`:

```json
"tinyglobby": "^0.2.17"
```

- **`dependencies`, not `devDependencies`** — `gherkinTags` is exported from the shipped barrel and
  runs inside a consumer's own config file, so the consumer must get the package.
- **A caret range, not an exact pin** — `pnpm-workspace.yaml`'s catalog comment states exact pins are
  devDependencies only, and `packages/gherkin`'s three runtime dependencies are all carets
  (`^42.0.1`, `^34.2.1`, `^20.1.0`). The lockfile is what pins the resolution.

**The lockfile diff is four lines and touches nothing else** — exactly the shape the plan required:

```diff
@@ -87,6 +87,9 @@ importers:
       '@effect-cucumber/gherkin':
         specifier: workspace:^
         version: link:../gherkin
+      tinyglobby:
+        specifier: ^0.2.17
+        version: 0.2.17
     devDependencies:
```

One importer edge under `packages/vitest`, resolving to the version already in the lockfile. **No
other package's resolution changed**, no `packages:`/`snapshots:` block was added or altered, and
`pnpm install --frozen-lockfile` exits 0 against the amended manifest. The package was already
present on disk at `node_modules/.pnpm/tinyglobby@0.2.17` before this plan started, transitively via
the test runner — declaring it added a manifest entry and an importer edge, not an artifact from the
registry and not a new publisher to trust.

## Why `globSync` rather than `glob`

A runner config is evaluated **synchronously at load time**. There is no point at which a
`Promise<string[]>` could be awaited before the config object has to exist, so the async sibling is
unusable regardless of how much nicer it reads.

This is the same constraint, from the same recorded precedent, that rules out reusing this repo's own
file reader: `packages/gherkin/src/loadFeature.ts` records that `NodeFileSystem.readFileString`
suspends internally and `Effect.runSync` on it throws `AsyncFiberError` — reproduced against the real
`@effect/platform-node` package rather than assumed from documentation. That precedent forces BOTH
halves of this module to be synchronous: `globSync` for discovery and `fs.readFileSync` for reading.

Two alternatives were rejected on facts rather than taste, and both reasons are written into the
module's notes (c) and (d):

- **`fs.globSync`** landed in Node 22; `packages/vitest/package.json` declares `"node": ">=20"`.
- **A hand-written matcher** would mishandle character classes, extglobs and brace expansion —
  precisely the parts of glob syntax a consumer is most likely to use and least likely to test.

## The final barrel export list

`packages/vitest/src/index.ts` now exports, each in its own block with a paragraph stating why it is
public:

| Export | Kind | Rationale in one line |
|---|---|---|
| `describeFeature` | value | unchanged — the entry point |
| `DescribeFeatureOptions` | type | **new** — a consumer computing an options object needs the name to annotate it |
| `gherkinTags` | value | **new** — without it, `--tagsFilter` does not work for a real consumer (RESEARCH Finding 2) |
| `GherkinTagDefinition` | type | **new** — the element type of what `gherkinTags` returns |
| `BackgroundDsl`, `FeatureDsl`, `HookRegistrar`, `ScenarioDsl`, `StepRegistrar` | types | unchanged |
| `StepMatchError` | value | unchanged |
| `StepMatchErrorReason` | type | unchanged |
| `UnusedStepDefinitionWarning(+Reason)` | types | unchanged |
| `UndeclaredTagWarning(+Reason)` | types | **new** — folded into the existing warning block, not a competing one |
| `ExcludedScenariosNotice(+Reason)` | types | **new** — same block, same reason |

Runtime named exports, confirmed by resolving the package through its own `exports` map:
`StepMatchError, describeFeature, gherkinTags`. Everything else is a type and is erased.

The barrel stayed a **single entry point** — neither `exports` nor `publishConfig.exports` in
`package.json` was touched, and their key sets remain byte-identical apart from the
`./src/index.ts` / `./dist/index.js` target.

### The two paragraphs rewritten

1. **"a tag is currently inert" is gone** (`grep -c` is 0). The "Current state" section now carries a
   **Tags** paragraph stating what is true and only what is true: inherited Feature/Rule/Examples
   tags reach the emitted test as native runner tags; `@skip` emits the test as skipped so neither
   its steps nor its hooks run; `@only` is emitted as a plain tag and is NEVER routed to only-mode,
   so a committed `@only` cannot fail a CI run that forbids only-marking; `includeTags`/`excludeTags`
   narrow what is REGISTERED, so an excluded Scenario is absent from the report rather than listed in
   it as skipped, with one summary line when the filter removed anything. The prerequisite is stated
   in the same place per AGENTS.md §4 — a tag must be declared in the runner's config or the runner
   rejects it, and the library catches that, re-emits untagged and warns — and `gherkinTags("<glob>")`
   is named as the supported way to produce those declarations. The corresponding clause was removed
   from the "What is NOT built yet" list, which no longer mentions tags at all.

2. **"Deliberately NOT exported" now covers RUN-05's internals.** `EmitOptions` (mentioned exactly
   once in the file, inside that block and never in an export statement), `emitFeature`'s returned
   outcome value, and the whole of `Tags.ts` — `makeTagFilter`, `shouldEmit`, `isSkipped`,
   `TagFilter`, `skipTag`/`onlyTag`. `GherkinTags.ts` is named explicitly on the OTHER side of the
   ledger with the one sentence that distinguishes it: it is called from a consumer's config file
   rather than from inside the register → plan → emit pipeline, so there is no internal stage being
   frozen into the package's contract.

## Mutation proofs

Both were run against real source, observed, and reverted. Working tree confirmed clean afterwards
(`git status` clean at every commit; both files restored from byte copies taken before mutating).

### Proof 1 — DocString fence tracking is load-bearing

**Mutation:** the three-line `isDocStringFence` branch deleted from the scan loop in
`GherkinTags.ts`.

| Run | Result |
|---|---|
| Control | 9 passed |
| Mutation | **3 failed**, 6 passed |

Verbatim, the sharpest of the three failures:

```
AssertionError: expected [ '@fixture-alpha', …(6) ] to deeply equal [ '@fixture-alpha', …(5) ]
+   "@fixture-not-a-tag",
```

Three tests fail rather than one, and that is worth recording: the DocString decoy leaks into the
globstar test, the single-file test AND the single-star test, because every one of them asserts an
EXACT list rather than containment. A `toContain`-style suite would have caught this in one place at
most.

### Proof 2 — the test's `**` is doing work

**Mutation:** the `recursive` pattern in the "honours the pattern" test changed from
`${fixtures}/**/*.feature` to `${fixtures}/*.feature`.

| Run | Result |
|---|---|
| Control | 9 passed |
| Mutation | **1 failed**, 8 passed |

```
AssertionError: expected [ '@fixture-alpha', …(5) ] to include '@fixture-nested'
 ❯ packages/vitest/test/GherkinTags.test.ts:65:23
```

The nested fixture is reachable ONLY through a globstar, so this is the assertion that proves the
caller's pattern is honoured rather than the whole tree being walked regardless — T-09-07-01's
control.

### Proof 3 (extra) — the `.types.ts` claim is not vacuous

Not required by the plan, but a compile-time assertion that passes for the wrong reason is exactly
the failure mode `StepArgs.types.ts`'s own doc comment warns about, so it was checked.

**Mutation:** `GherkinTagDefinition.name` renamed to `tagName` in the SOURCE.

```
packages/vitest/test/GherkinTags.types.ts(36,3): error TS2741: Property 'name' is missing in type
  'GherkinTagDefinition' but required in type 'TestTagDefinition'.
```

The diagnostic names `TestTagDefinition` — vitest's own exported type, imported from
`vitest/config` — so the file is asserting against the real contract and not against a local copy of
it. Reverted; `pnpm typecheck:test` exits 0.

## Verification

All plan gates run and green at `4d4bea0`:

| Gate | Result |
|---|---|
| `pnpm install --frozen-lockfile` | exit 0 — lockfile in sync with the amended manifest |
| `pnpm build` | exit 0 |
| `pnpm test` | 32 files, **722 tests**, all passing |
| `pnpm typecheck:test` | exit 0, both projects |
| `pnpm lint` (oxlint + dprint check) | exit 0 |
| `pnpm circular` | no circular dependency found (33 files) |
| `pnpm verify:spec` | PASS 7, FAIL 0, SKIP 1 |
| `pnpm verify:pack` | pack shape OK — both packages, publint clean |
| `pnpm verify:no-runner-dep` | ENFORCED — the new `dependencies` entry trips no forbidden-package rule |
| `pnpm verify:testapi-seam` | ENFORCED |
| `pnpm exec vitest run packages/vitest/test/GherkinTags.test.ts` | 9 passed |

### Acceptance greps

| Criterion | Required | Actual |
|---|---|---|
| `dependencies.tinyglobby === "^0.2.17"` and absent from devDependencies | yes | yes ✓ (`node -e` check exits 0) |
| lockfile: `tinyglobby` importer edge under `packages/vitest`, nothing else | yes | yes ✓ (4-line diff, above) |
| `grep -c 'import { globSync } from "tinyglobby"' GherkinTags.ts` | 1 | 1 ✓ |
| every `^import` line matches the two allowed forms | equal counts | 2 = 2 ✓ |
| `grep -c 'globSync(' GherkinTags.ts` | ≥ 1 | 1 ✓ |
| `grep -c 'from "tinyglobby"' GherkinTags.ts` | 1 | 1 ✓ |
| `grep -c 'export const gherkinTags' GherkinTags.ts` | 1 | 1 ✓ (parameter has no default value) |
| `grep -c 'cwd:' GherkinTags.ts` | 0 | 0 ✓ |
| `GherkinTags.test.ts` tests | ≥ 8 | **9** ✓ |
| `grep -c 'process.cwd' GherkinTags.test.ts` | ≥ 1 | 2 ✓ |
| `pnpm test` collects `.test.ts`, not `.types.ts` | yes | yes ✓ (32 files; no "No test suite found") |
| §4 preamble names both `.types.ts` entries | yes | yes ✓ |
| `grep -c 'gherkinTags' index.ts` | ≥ 1 | 3 ✓ |
| `grep -c 'from "./GherkinTags.ts"' index.ts` | ≥ 1 | 2 ✓ |
| `grep -c 'DescribeFeatureOptions' index.ts` | ≥ 1 | 1 ✓ |
| `grep -c 'UndeclaredTagWarning' index.ts` | ≥ 1 | 3 ✓ |
| `grep -c 'ExcludedScenariosNotice' index.ts` | ≥ 1 | 3 ✓ |
| `grep -c 'a tag is currently inert' index.ts` | 0 | 0 ✓ |
| `grep -c 'EmitOptions' index.ts` | 1, inside the NOT-exported block | 1 ✓ (not in any export statement) |
| `exports` / `publishConfig.exports` key parity | equal | equal ✓ (`node -e` check exits 0) |
| barrel resolves `gherkinTags` as a function | yes | yes ✓ (see below) |

The last one, run against the SOURCE entry point through the package's own `exports` map (a throwaway
`.mjs` inside `packages/vitest`, so Node's self-reference resolution applies, deleted immediately
after):

```
resolved via exports map; gherkinTags is a function: true
named exports: StepMatchError, describeFeature, gherkinTags
```

## Decisions Made

- **The pattern is required with NO default, and that absence is the security control.** A default
  would scan whatever directory the config happened to load from — an implicit
  whole-working-directory walk nobody asked for. There is no code path in this module that
  synthesises a pattern; every expansion it performs was named by its caller.
- **An empty pattern throws; a zero-match pattern returns `[]`.** These are two different situations
  and only one is unambiguously a mistake. `""` or `[]` means the caller asked for nothing, and a
  config declaring nothing makes every tag in the suite undeclared — so it throws in `planFor`'s
  explanatory style, naming the function and showing a correct call. A pattern that matches no file
  is indistinguishable from a project that legitimately has no `.feature` files yet, so throwing
  there would break a valid config. The residual risk of a mistyped pattern is written into note (b)
  rather than hidden, together with its compensating signal: plans 09-02/09-05 print one located
  warning per Scenario naming the file, the Scenario and the tag, so an empty declaration list
  degrades loudly at run time even though it is quiet at config time.
- **`dot: false` and `onlyFiles: true` are passed explicitly even though both already match the
  library's defaults.** Both are load-bearing — no dotfile trees, no directory entry handed to
  `readFileSync` — and pinning them means a future default change cannot silently widen the scan.
  Everything else is left at the library's defaults, deliberately, so brace expansion and globstar
  behave the way a consumer's other tools do.
- **`followSymbolicLinks` is left at its `true` default, and the residual is stated rather than
  hidden.** A symlinked directory inside a matched tree IS traversed. Accepted: the caller names the
  tree, and the only data leaving the function is `@`-prefixed tag names.
- **The scan is a TEXT SCAN and is deliberately INCLUSIVE, because the error direction is asymmetric.**
  Over-declaring a tag costs nothing — a declared tag no Scenario carries is inert — while
  under-declaring one costs a whole file its tests. Note (f) says so explicitly, so a later reader
  does not "tighten" the scan into something that under-declares.
- **`toSorted`, not `sort`.** The repo's oxlint config enforces it (`unicorn(no-array-sort)`), and
  `tsconfig.base.json` sets `lib: ["ES2023"]` for exactly this reason.
- **The test derives its fixture pattern instead of hardcoding one, and the comment says why.**
  `gherkinTags` resolves against `process.cwd()` while this repo's fixture precedent yields an
  ABSOLUTE path, so `path.relative(process.cwd(), …)` is what makes them agree. A hardcoded
  `packages/vitest/test/fixtures/**/*.feature` would match NOTHING if the suite were run with
  `packages/vitest` as the cwd — and because a zero-match pattern deliberately does not throw, every
  "excludes X" assertion would still pass. The derivation is what stops the file passing vacuously.
- **The fixtures use names unique to them** (`@fixture-alpha` … `@fixture-nested`) so no assertion
  can accidentally pass against a tag the repo declares elsewhere, and `@fixture-alpha` appears in
  TWO files so cross-file de-duplication is proven rather than assumed.
- **The new warning types were folded into the existing `UnusedStepDefinitionWarning` block rather
  than given one of their own.** They are the same KIND of thing — structured collection-time reports
  that are not failures and never enter an error channel — and a second block would have restated the
  same rationale in different words, which is how two paragraphs start disagreeing.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] `pnpm install` to populate the worktree's missing `node_modules`**

- **Found during:** Task 1 baseline
- **Issue:** This parallel executor spawned into a fresh worktree with no installed dependencies, as
  plans 09-04 and 09-05 both record.
- **Fix:** `pnpm install --frozen-lockfile` before any edit — the committed lockfile restored
  verbatim, nothing added or resolved to a new version. (The SUBSEQUENT `pnpm install` in Task 1 is
  not this deviation: it is the plan's own Step 1, and its lockfile effect is shown above.)
- **Files modified:** none tracked

**2. [Rule 3 — Blocking] Worktree base was behind the plan's stated base commit**

- **Found during:** Startup, before Task 1
- **Issue:** The worktree spawned at `f640f4a`, an ANCESTOR of the required base `67d96b7`
  ("docs(phase-09): update tracking after wave 3"). Executing from there would have built this plan
  on a tree without plan 09-05's `DescribeFeatureOptions` — a type Task 3 is required to export.
- **Fix:** `git reset --hard 67d96b7`, per the spawn instructions' base-correction step, after the
  HEAD assertion confirmed the branch was `worktree-agent-a182683b21e58876e` and not a protected ref.
  The working tree was clean, so nothing was discarded.
- **Files modified:** none

**3. [Rule 1 — Bug] `Array#sort()` rejected by the repo's own lint rule**

- **Found during:** Task 1 verification
- **Issue:** The first implementation returned `[...names].sort()`. `pnpm lint` failed with
  `unicorn(no-array-sort)`: "Use `Array#toSorted()` instead of `Array#sort()`."
- **Fix:** `[...names].toSorted()`. `tsconfig.base.json` sets `lib: ["ES2023"]` while `target` stays
  `ES2022` precisely so `Array.prototype.toSorted` is available, and its own comment says so.
- **Files modified:** `packages/vitest/src/GherkinTags.ts`
- **Committed in:** `bf3ad73`

**4. [Rule 3 — Blocking] `dprint` reformatted `spec/traceability.md` after the §4 rows**

- **Found during:** Task 2 verification
- **Issue:** The two new rows are shorter than the table's widest cell, so `dprint check` failed with
  "Found 1 not formatted file" — the padding did not match the column alignment.
- **Fix:** `pnpm exec dprint fmt spec/traceability.md`, the repo's own formatter with the repo's own
  config. No content changed. `pnpm lint` exits 0 afterwards. This is the identical deviation plan
  09-05 recorded, from the identical cause.
- **Files modified:** `spec/traceability.md`
- **Committed in:** `0ea1746`

**5. [Rule 2 — Missing critical functionality] A glob written inside a block comment needs an escape**

- **Found during:** Task 1
- **Issue:** The module doc comment shows the intended consumer call, which contains
  `features/**` + `/*.feature`. The `*` immediately followed by `/` ENDS a block comment, so the
  example as written would have truncated the doc comment mid-sentence and left the rest of the
  module's notes as live code.
- **Fix:** The example is written `features/**\/*.feature` — the same escape
  `packages/gherkin/test/StepArgs.types.ts` and `packages/vitest/tsconfig.test.json` already use for
  vitest's include glob — with an added parenthetical saying the backslash is an artifact of the
  comment and must not be typed. Without that sentence a reader would reasonably copy the backslash
  into their config, where it means something else.
- **Files modified:** `packages/vitest/src/GherkinTags.ts`
- **Committed in:** `bf3ad73`

**6. [Rule 2 — Missing critical functionality] `.types.ts` non-vacuity proven, not assumed**

- **Found during:** Task 2
- **Issue:** The plan asks only that `pnpm typecheck:test` exits 0. A compile-time assertion that
  passes because it is checking nothing exits 0 too — the exact failure mode `StepArgs.types.ts`'s
  own doc comment warns about, which is why that file's non-vacuity was mutation-proven in 03-02.
- **Fix:** Proof 3 above. The source type was mutated and the resulting diagnostic recorded verbatim;
  it names `TestTagDefinition`, so the file asserts against vitest's real exported type.
- **Files modified:** none (the mutation was reverted)
- **Committed in:** `0ea1746`

### Non-deviations, recorded because they look like ones

- **The glob-string signature is NOT a deviation.** It is 09-CONTEXT.md D-09's literal wording and
  the user's explicit 2026-08-29 confirmation. The plan says so twice; this summary says so once more
  because the earlier path-array design is in the phase's history and a later reader will find it.
- **`tinyglobby` is NOT an unapproved package addition.** It is a user-confirmed exception to the
  phase's no-new-packages baseline, named by the user together with its exact version, and it was
  already resolved in this repo's lockfile at that version before the plan started.
- **Every commit builds.** `bf3ad73`, `0ea1746` and `4d4bea0` each pass `pnpm build`, `pnpm lint` and
  `pnpm test` on their own. A bisect crossing any of them hits a working tree.

## Requirements

**RUN-05 remains `Pending`, advanced but not completed.** Every piece of the requirement is now
implemented AND observed — 09-06 owns the integration tests against the real `it.effect`, and this
plan closed the config-side hole that RESEARCH Finding 2 identified. What is still outstanding is not
code: `spec/behaviors/02-shared-layers-and-tags.md`'s BEH-EC-008 MUST-level text and ADR-EC-020's
Decision section still describe behaviour this phase has replaced, and `.planning/REQUIREMENTS.md`'s
RUN-05 wording and `spec/roadmap.md`'s "Current state" table still say the opposite of what ships.
AGENTS.md §1 makes a code change not reflected in `spec/` incomplete, and 09-CONTEXT.md assigns that
reconciliation to the plan that CLOSES this phase. Marking RUN-05 complete before then would claim
consistency the repo does not have.

## Threat Model Coverage

| Threat ID | Disposition | Status |
|---|---|---|
| T-09-07-01 | mitigate | **Done, control-proven.** The pattern is required with no default and is never synthesised, so there is no implicit working-directory scan. Expansion is the audited library's own implementation at its own defaults rather than a hand-rolled matcher. `dot: false` and `onlyFiles: true` are passed explicitly so a future default change cannot widen the scan; `grep -c 'cwd:'` is 0, so no working directory is hardcoded. The single-`*` versus `**` test (mutation Proof 2) is the executable control that the caller's pattern is honoured rather than the tree walked regardless. The `followSymbolicLinks` residual is stated in note (d), not hidden. |
| T-09-07-02 | accept | **Done, both halves asserted.** `""` and `[]` each throw naming `gherkinTags`; a well-formed zero-match pattern returns `[]` without throwing. The asymmetry and its reason are written into note (b) together with the compensating downstream signal (the per-Scenario located warning shipped by 09-02/09-05). |
| T-09-07-03 | mitigate | **Done, mutation-proven.** DocString fence tracking with a dedicated fixture; deleting the fence branch fails three assertions, including one naming `@fixture-not-a-tag` explicitly. Note (f) records that the residual direction is benign — over-declaring is inert, under-declaring costs a file. |
| T-09-07-04 | accept | **Done.** One direct dependency, user-confirmed with its exact version, already resolved in the lockfile at that version. Declared `^0.2.17` per the repo's runtime-dependency convention; the lockfile diff is four lines and touches no other package's resolution. `pnpm verify:no-runner-dep` and `pnpm verify:pack` both pass with it declared, the latter confirming it packs as a literal caret range with no `catalog:`/`workspace:` protocol left in it. |
| T-09-07-05 | mitigate | **Done.** `grep -c 'a tag is currently inert'` is 0, and the replacement states the config-declaration prerequisite and the degradation behaviour explicitly rather than implying tags "just work". |
| T-09-07-SC | accept | **Done.** Exactly one new direct dependency, `tinyglobby@0.2.17`, at a version this repo already had. No blocking human-verify checkpoint was raised because the user named both the package and its version in CONTEXT.md's D-09 addendum — a higher-fidelity confirmation than the control exists to obtain — and its published `.d.mts` was read directly from `node_modules` during execution to confirm `globSync`'s real signature. |

## Threat Flags

**One, and it is the plan's own headline surface rather than an unplanned one.**

| Flag | File | Description |
|------|------|-------------|
| threat_flag: file-read | `packages/vitest/src/GherkinTags.ts` | This is the first and only module in either package that reads arbitrary files from a caller-supplied pattern at CONFIG-LOAD time, outside any Effect. It is fully covered by the plan's `<threat_model>` (T-09-07-01 through T-09-07-03) and is recorded here only because it is genuinely new file-I/O surface in a package that previously had none, and a future reviewer scanning for I/O should find it named. |

No network endpoint, no auth path, no schema at a trust boundary.

## Known Stubs

None. Every export added to the barrel is backed by a real implementation, and the one type-only
export (`GherkinTagDefinition`) is the actual element type of what `gherkinTags` returns, proven
against vitest's own type at compile time.

## Notes for the phase's closing plan

- **The spec reconciliation is now larger by one item.** Beyond BEH-EC-008's MUST text, ADR-EC-020's
  Decision section, `.planning/REQUIREMENTS.md`'s RUN-05 wording and `spec/roadmap.md`'s "Current
  state" row, the spec now also owes a description of `gherkinTags` itself — a public, exported,
  consumer-facing function that appears nowhere in `spec/behaviors/`. `spec/traceability.md` §4 has
  its two rows, but §1 has no behavior row pointing at `GherkinTags.ts`.
- **The barrel's "Current state" paragraph is now the most accurate prose in the repo about tags**,
  and it was written to be quotable — the closing plan can reconcile the spec against it rather than
  re-deriving the behaviour from source.
- **`packages/vitest/test/fixtures/` exists now.** It is the first fixture directory under this
  package; `packages/gherkin/test/fixtures/` was previously the only one. A future plan adding vitest
  fixtures should put them there rather than opening a third location.
- **The §4 preamble's non-suite count is now TWO.** AGENTS.md §4 makes leaving it stale a defect, so a
  third `.types.ts` file means amending that sentence again.

## Self-Check: PASSED

All six created files exist on disk:

- `packages/vitest/src/GherkinTags.ts` — FOUND
- `packages/vitest/test/GherkinTags.test.ts` — FOUND
- `packages/vitest/test/GherkinTags.types.ts` — FOUND
- `packages/vitest/test/fixtures/tag-scan-a.feature` — FOUND
- `packages/vitest/test/fixtures/tag-scan-nested/tag-scan-b.feature` — FOUND
- `packages/vitest/test/fixtures/tag-scan-docstring.feature` — FOUND

All four modified files exist on disk:

- `packages/vitest/package.json` — FOUND
- `pnpm-lock.yaml` — FOUND
- `packages/vitest/src/index.ts` — FOUND
- `spec/traceability.md` — FOUND

All three task commits are present in `git log`:

- `bf3ad73` — FOUND
- `0ea1746` — FOUND
- `4d4bea0` — FOUND

No commit in this plan deleted a tracked file (`git diff --diff-filter=D HEAD~1 HEAD` empty at each).
The throwaway barrel-resolution probe (`packages/vitest/zz-barrel-check.mjs`) was deleted before the
Task 3 commit and `git status` is clean of it. Both mutation-proof reverts were verified by an empty
`git diff` against the byte copies taken before mutating.

STATE.md and ROADMAP.md deliberately untouched — this executor ran in a worktree and the orchestrator
owns those writes after the wave.

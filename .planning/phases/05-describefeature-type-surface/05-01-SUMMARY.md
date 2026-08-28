---
phase: 05-describefeature-type-surface
plan: 01
subsystem: build-gates-and-step-registry
tags: [tsconfig, ci-gate, typecheck, registry, dsl-04, mutation-tested]
requires: []
provides:
  - "packages/vitest/test/tsgo-gate/tsconfig.json scoped to a single fixture (assertion 4 stays specific)"
  - "packages/vitest/tsconfig.test.json — type-check coverage for packages/vitest/test"
  - "pnpm typecheck:test covers BOTH packages from one script key"
  - "createRegistry — per-instance scope stack + append-only step-definition list (DSL-04's container)"
affects:
  - "every later Phase 5 plan that adds a tsgo-gate fixture (each now needs its own config)"
  - "every later Phase 5 plan that adds a file under packages/vitest/test (now type-checked in CI)"
  - "plan 05-03, which owns packages/vitest/src/index.ts and should leave Registry out of it"
tech-stack:
  added: []
  patterns:
    - "factory-over-closure (createParameterTypeStore precedent) for per-instance mutable state"
    - "shape type derived as ReturnType<typeof factory<T>>, never hand-written"
    - "single-file tsconfig isolation (files: [one] + include: []) for every gate fixture"
key-files:
  created:
    - packages/vitest/tsconfig.test.json
    - packages/vitest/src/Registry.ts
    - packages/vitest/test/Registry.test.ts
  modified:
    - packages/vitest/test/tsgo-gate/tsconfig.json
    - package.json
decisions:
  - "The tsgo-gate parent config is also assertion 4's NEG_CONFIG; it must stay single-file"
  - "packages/vitest/tsconfig.test.json deliberately omits gherkin's types/moduleDetection overrides"
  - "Registry is a factory, never a module singleton (DSL-04, PITFALLS #14), proven by two mutations"
  - "DSL-01 and DSL-04 stay Pending — this plan shipped infrastructure, not the DSL surface"
metrics:
  duration: ~13m
  completed: 2026-08-29
  tasks: 3
  files: 5
  tests_before: "404 across 17 files"
  tests_after: "412 across 18 files"
---

# Phase 5 Plan 01: Wave 0 Blockers — Gate Scoping, Test Typecheck, and the Step Registry Summary

Closed the three Wave 0 blockers so later Phase 5 plans have an honest place to assert themselves:
the tsgo gate's negative config now compiles exactly one file, `pnpm typecheck:test` now covers
`packages/vitest`, and `createRegistry` landed with a mutation-proven isolation test.

## What Was Built

### Task 1 — the tsgo-gate negative config is scoped to one file

`packages/vitest/test/tsgo-gate/tsconfig.json` went from `include: ["src"]` to
`include: []` + `files: ["src/missing-layer-context.ts"]`, matching `tsconfig.ok.json` and
`tsconfig.floating.json` exactly. The `compilerOptions` block is untouched, because the two sibling
configs extend this file and inherit it.

The reason this matters is invisible from the file itself, so it is now a comment in it: this
config plays two roles at once — the shared parent, and the `NEG_CONFIG` that assertion 4 of
`scripts/verify-tsgo-gate.sh` compiles. Under an unscoped `include`, every fixture added to `src/`
from now on would fold into assertion 4's compilation, and the `effect(missingLayerContext)` grep
could end up satisfied by a file the assertion was never about. The gate would keep printing
`ENFORCED` while covering less and less.

### Task 2 — `typecheck:test` covers `packages/vitest`

New `packages/vitest/tsconfig.test.json`, modelled on gherkin's: `rootDir: "${configDir}"` (the base
sets `${configDir}/src`, which would reject every file under `test/`), `include: ["src", "test"]` so
tests check against real source rather than emitted declarations, and `exclude: ["test/tsgo-gate"]`
because those fixtures are deliberately non-compiling.

It deliberately does **not** copy gherkin's `types: ["node"]` or `moduleDetection: "auto"`. Both are
load-bearing where they live (node globals in gherkin's tests; a `test/feature-raw.d.ts` ambient
declaration that `moduleDetection: "force"` would turn into a module augmentation) and inert here.
A comment says so, so a reader diffing the two files does not conclude one is missing overrides.

The root `typecheck:test` script now runs gherkin then vitest joined with `&&`, still under the
single script key `.github/workflows/check.yml` invokes by name — no workflow edit was needed. The
new config is not in the root `tsconfig.json` `references` array, so it stays outside the solution
build.

### Task 3 — `createRegistry` (DSL-04's container) and its isolation proof

`packages/vitest/src/Registry.ts` exports `createRegistry<Fn>(featureName)`, a factory closing over
a private scope stack (seeded with a `{ kind: "feature", name: featureName }` root) and a private
append-only `StepDefinition<Fn>` array. Surface: `pushScope`, `popScope`, `currentScope`,
`register`, `definitions`. Plus the types `RegistryScopeKind`, `RegistryScope`, `StepKeyword`,
`StepDefinition<Fn>` and `RegistryShape<Fn>`.

Notable properties, each with a comment recording why:

- **Never a module singleton.** DSL-04 forbids it and PITFALLS #14 records three
  `cypress-cucumber-preprocessor` bugs (#298, #364, #549) with exactly that root cause.
- **`definitions()` returns a copy**, so a snapshot stays a snapshot while the define callback keeps
  running, and a caller cannot splice state this module owns.
- **`popScope()` at the root throws** naming the condition rather than silently emptying the stack.
- **`Fn` is a free type parameter** and the module has zero dependencies — `grep -c "import"` on it
  returns 0. That is what let it land in wave 1, ahead of the DSL that will instantiate it.
- **`RegistryShape<Fn> = ReturnType<typeof createRegistry<Fn>>`.** The instantiation expression
  type-checked under this repo's config on the first try, so the plan's fallback (a hand-written
  interface plus an explicit return annotation) was not needed.
- **Not exported from `packages/vitest/src/index.ts`** — plan 05-03 owns that barrel, and gherkin's
  precedent (`Parser`/`Pickles`/`Correlate` internal, only `loadFeature` published) applies.

`packages/vitest/test/Registry.test.ts` adds 8 tests covering all six required assertions:
reference inequality (with the comment saying it proves almost nothing on its own), cross-instance
definition isolation, cross-instance scope isolation, the `definitions()` snapshot, the root
`popScope()` throw with a message, and scope attribution across a push/pop pair — plus a
`background`-scope case exercising the `name: null` branch.

## Verification

| Check | Result |
|-------|--------|
| `bash scripts/verify-tsgo-gate.sh` | 4/4 assertions, `tsgo gate: ENFORCED` |
| `pnpm build` | exit 0 (Registry.ts emits declarations under `composite: true`) |
| `pnpm typecheck:test` | exit 0, both projects |
| `pnpm test` | 412 passed across 18 files (was 404 across 17) |
| `pnpm lint` | exit 0 |
| `grep -c "import" packages/vitest/src/Registry.ts` | 0 |
| `grep -c 'from "../src/index.ts"' .../Registry.test.ts` | 0 |
| `grep -c 'tsconfig.test.json' tsconfig.json` | 0 |
| `grep -c` both test configs in `package.json` | 1 each, one `typecheck:test` key |

### Mutation proofs (performed, then reverted)

Four mutations were run; every one was reverted and the suite confirmed green afterwards.

1. **Leak probe (Task 1).** A throwaway `src/_leak-probe.ts` with a deliberate type error appears
   **0 times** in the scoped `NEG_CONFIG` compilation, and **1 time** under a throwaway control
   config restoring `include: ["src"]`. Both directions were run — without the control, "0
   occurrences" would also be satisfied by a probe that simply had no error.
2. **Coverage mutation (Task 2).** `packages/vitest/test/_typecheck-probe.ts` with
   `export const wrong: number = "not a number"` made `pnpm typecheck:test` exit 1 naming the file
   (`TS2322`). Deleted, it exits 0 again. A passing exit code alone was not accepted as proof.
3. **Singleton mutation A (Task 3)** — hoisted `records` to module scope. **4 tests failed**,
   including the load-bearing *"leaves the second registry empty when the first is registered into"*,
   plus the `definitions()` snapshot test and both scope-attribution tests.
4. **Singleton mutation B (Task 3)** — hoisted the scope `stack` to module scope. **3 tests failed**,
   including *"leaves the second registry's scope at its own feature root when the first pushes a
   scope"* and both underflow tests.

Notably, *"hands back two different objects"* passed under **both** singleton mutations — which is
exactly the trap the test file's comments warn about, now demonstrated rather than asserted.

## Deviations from Plan

**1. [Rule 3 - Blocking] Restored the dependency tree in the worktree**
- **Found during:** setup, before Task 1
- **Issue:** the worktree had no `node_modules`, so every verification command in the plan
  (`tsc`, `vitest`, `oxlint`, `dprint`) was unrunnable.
- **Fix:** `pnpm install --frozen-lockfile`. This restores the tree already described by the
  committed `pnpm-lock.yaml` — no package was added, and no manifest dependency field changed,
  so threat T-05-SC's "installs zero packages" disposition still holds.
- **Files modified:** none tracked.

**2. [Rule 1 - Stale expectation] Task 3's test-count criterion said 14 → 15; the real baseline is 17 → 18**
- **Found during:** Task 3
- **Issue:** the acceptance criterion "the repo file count reported by vitest increases by exactly 1
  (from 14 to 15)" was written against the end-of-Phase-3 baseline. Phase 4 (DataTable/DocString)
  landed since, taking the repo to 17 files / 404 tests — matching PROJECT.md's own record of
  "404 tests passing" for Phase 4.
- **Fix:** the substantive half of the criterion — *increases by exactly 1* — was verified against
  the real baseline: **17 → 18 files, 404 → 412 tests**. The absolute numbers in the plan are stale,
  not the requirement.
- **Files modified:** none.

**3. [Rule 2 - Non-vacuous proof] Added a negative control to Task 1's leak probe**
- **Found during:** Task 1
- **Issue:** the plan asked only to confirm the probe does **not** appear in the scoped config's
  output. That assertion also passes if the probe file has no type error at all, or is not compiled
  for some unrelated reason — i.e. it can succeed vacuously.
- **Fix:** additionally compiled the same probe through a throwaway config restoring
  `include: ["src"]`, confirming it appears exactly once there. Both throwaway files were deleted
  before the commit.
- **Files modified:** none tracked (`git status` clean of both before committing).

## Requirements Status

**DSL-01 and DSL-04 both stay Pending in REQUIREMENTS.md**, deliberately — following the precedent
set four consecutive times in Phase 3, where a plan declined the marking until the requirement was
true end to end for something a consumer can reach.

- **DSL-01** ("`describeFeature` takes a Layer; a step needing an unprovided service fails to
  compile") — this plan built no `describeFeature` at all. What it did was *preserve* the
  `@effect/tsgo` gate that backs the requirement's second half. That is a precondition, not the
  requirement.
- **DSL-04** ("`Background` and `Scenario` are step-definition containers — `Background` receives
  `{ Given, And }`, `Scenario` receives `{ Given, When, Then, And, But }`") — this plan built the
  container's *scope stack and step list*, which is the state DSL-04's containers will drive. The
  keyword bags, the `Background`/`Scenario` callbacks, and the literal-text matching are not here.

The later Phase 5 plan that makes each true through the real DSL should mark them.

## Known Stubs

None. `packages/vitest/src/index.ts` remains the Phase 1 placeholder that says so in its own doc
comment, unchanged by this plan and owned by 05-03 — it is pre-existing, not a stub introduced here.

## Notes for Later Plans

- **Every new tsgo-gate fixture needs its own `tsconfig.<name>.json`** with `include: []` +
  `files: [one]`. Do not add it to the parent's `files` array, and do not restore an `include` glob
  — the comment in `tsconfig.json` names that as the wrong fix, and the leak probe above is the
  demonstration.
- **Files under `packages/vitest/test/` are now type-checked in CI.** A type error there fails the
  `types` job. Files under `packages/vitest/test/tsgo-gate/` are still excluded and still invisible
  to both `typecheck:test` and oxlint (`.oxlintrc.json` `ignorePatterns`) — dprint does see them.
- **If a later plan needs node globals under `packages/vitest/test`,** it adds `"types": ["node"]`
  to `packages/vitest/tsconfig.test.json` with its own reason in a comment. The omission is
  deliberate and documented; do not add it "for parity" with gherkin.
- **`Registry` must stay out of `packages/vitest/src/index.ts`** (05-03's file) and must stay
  dependency-free. Two acceptance greps defend the latter: zero `import` occurrences in
  `Registry.ts`, zero barrel imports in `Registry.test.ts`.
- **Do not collapse `Registry.test.ts`'s isolation tests into the reference-inequality one.** That
  test passed under both singleton mutations. The register-isolation and scope-isolation tests are
  the ones carrying the claim.
- **`packages/vitest/test/tsgo-gate/` fixtures are excluded from `typecheck:test` by directory
  path**, so moving them breaks the exclusion silently — `pnpm typecheck:test` would start failing
  on files designed to fail.
- Repo test count is now **412 across 18 files** (404 across 17 before this plan).

## Threat Flags

None. This plan shipped two tsconfig files, one root script edit, one dependency-free source module
and one unit test — no network, no I/O beyond the compiler's own file reads, no user input parsing,
no auth, no persistence. Every `mitigate` disposition in the plan's threat register (T-05-01,
T-05-02, T-05-03) was discharged by a recorded mutation proof above, and T-05-SC's "installs zero
packages" holds (the `--frozen-lockfile` install changed no manifest dependency field).

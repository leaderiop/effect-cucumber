---
phase: 05-describefeature-type-surface
plan: 04
subsystem: build-gate
tags: [tsgo, compile-gate, dsl, mutation-tested, INV-EC-003, ADR-EC-016]
requires:
  - "05-01: tsgo-gate/tsconfig.json scoped to a single file (Pitfall 1)"
  - "05-03: describeFeature + Dsl.ts + the package barrel the fixtures import"
provides:
  - "packages/vitest/test/tsgo-gate/src/step-satisfied.ts — the DSL positive control"
  - "packages/vitest/test/tsgo-gate/src/step-missing-service.ts — the DSL-01 negative fixture"
  - "scripts/verify-tsgo-gate.sh assertions 5 and 6 — the satisfied/starved flip pair"
affects:
  - "05-05: adds world-undeclared-field.ts / layer-missing-rin.ts beside these, same template"
  - "05-06: corrects BEH-EC-002/003 and INV-EC-003's wording against what is now proven"
  - "Phase 6: a reordered Dsl.ts union now fails CI by name instead of silently"
tech-stack:
  added: []
  patterns:
    - "one fixture file, one case, one isolated tsconfig (D-01)"
    - "a committed satisfied/starved PAIR instead of a self-mutating script"
    - "negative assertions check exit code AND the diagnostic name, never either alone"
key-files:
  created:
    - packages/vitest/test/tsgo-gate/src/step-satisfied.ts
    - packages/vitest/test/tsgo-gate/src/step-missing-service.ts
    - packages/vitest/test/tsgo-gate/tsconfig.step-ok.json
    - packages/vitest/test/tsgo-gate/tsconfig.step-missing.json
  modified:
    - packages/vitest/test/tsgo-gate/tsconfig.json
    - scripts/verify-tsgo-gate.sh
    - .planning/REQUIREMENTS.md
decisions:
  - "rootDir widened to the repo root, not ${configDir} — the plan's suggested value does not contain packages/vitest/src and would not have fixed TS6059"
  - "DSL-01 marked Complete; DSL-02/03/04 deliberately left Pending"
metrics:
  duration: ~25m
  tasks: 3
  files: 7
  completed: 2026-08-29
---

# Phase 5 Plan 04: DSL-01's Compile-Time Proof Summary

The project's core value is now asserted mechanically by name: a step whose Effect requires a
service the ambient Layer does not provide fails `tsc` with `effect(missingEffectContext)`, proven
non-vacuous by a union-order mutation that keeps the step rejected while killing the diagnostic.

## What Was Built

Two committed fixtures and two new gate assertions, taking `scripts/verify-tsgo-gate.sh` from four
✓ lines to six.

**`step-satisfied.ts`** — the DSL positive control. Every form `describeFeature` is required to
accept, in one file compiled by `tsconfig.step-ok.json`:

- a `{int}`-coerced parameter (`function*(n: number)`) writing World state through a `Ref`
- a step whose body uses `Effect.acquireRelease` — which puts `Scope` in the step's required
  context — registered against a **plain** `World.layer` that provides no Scope. This is D-02 and
  roadmap success criterion 2, and it compiles only because `Dsl.ts` note (b) spells `Scope.Scope`
  on the step registrar rather than on the dsl or Layer types.
- an already-`Effect.fn`-wrapped step passed directly (ADR-EC-005) — the union's second member
- `Background(({ And, Given }) => ...)` registering two steps
- `Scenario("nested", ({ Given }) => ...)` with the destructure that shadows the outer `Given`
- the object Layer form with both services reachable from one step (Finding 5's regression guard)
- the object Layer form with `perScenario: Layer.empty` (D-03)

**`step-missing-service.ts`** — the DSL-01 negative fixture, compiled by
`tsconfig.step-missing.json`. Same `World`/`Db` declarations, one `describeFeature` call taking a
plain `World.layer`, one step yielding `Db`. Exits 1 with:

```
error TS2345: ... Type 'Db' is not assignable to type 'Scope | World'.
error TS377004: This Effect requires a service that is missing from the expected Effect context: `Db`. effect(missingEffectContext)
```

Reproduced exactly as RESEARCH.md Finding 1 predicted, including the noisy
`exactOptionalPropertyTypes` preamble that pushes the useful line to eighth. The output contains
**no** `effect(missingLayerContext)` — confirming Finding 1's correction that this failure mode is a
step's required context, not the Layer argument's `RIn`.

**Assertions 5 and 6** in the gate script, under a shared banner explaining that the two fixtures
are the satisfied/starved flip pair. Assertion 6 checks the exit code first, then greps the
diagnostic by name, with a NOTE above the grep citing Finding 1 so nobody harmonizes it with
assertion 4's `missingLayerContext`.

## Flip-Pair Evidence (roadmap success criterion 1)

The two fixtures' substantive diff, comments and blank lines stripped, reduces to one line plus the
positive control's extra accepted forms (which the negative file, being a subset, simply omits):

```
< describeFeature(feature, { shared: Db.layer, perScenario: World.layer }, ({ Given }) => {
<   Given("both", function*() {
>   describeFeature(feature, World.layer, ({ Given }) => {
>   Given("needs Db", function*() {
```

Both files register the identical step body `yield* (yield* Db).clear`. The only variable is whether
the ambient Layer provides `Db`. Asserting both in the same script run is what proves that removing
a service from an ambient Layer flips a passing case to failing — with no mutable working tree, no
cleanup path that can leave the repo dirty, and re-proof on every CI run rather than once.

The vacuity mutation below is the flip demonstrated live: adding `Db.layer` back to the starved
fixture's ambient Layer makes it compile clean.

## Mutation Proofs

All three performed and reverted; the gate was confirmed green again afterward.

**1. Union-order mutation (the phase's central proof).** Swapped the two members of
`StepRegistrar`'s step-function union in `packages/vitest/src/Dsl.ts` so the `Effect.Effect` branch
is listed first. Assertion 6's **first** check still passed — the step was still rejected — while
the **second** failed. Exact failure message:

```
✗ tsgo gate: NOT ENFORCED

  the step was rejected, but NOT by effect(missingEffectContext) — the tsgo diagnostic has stopped
  covering the DSL. CI stays green on a rejection that no longer proves anything about context.
  Most likely cause: the StepRegistrar step-function union in packages/vitest/src/Dsl.ts was
  reordered so the Effect-returning branch is listed FIRST. TypeScript then reports the generator
  against that member as a plain shape mismatch ('missing the following properties: toJSON, ...'),
  which the plugin has no reason to read as a context problem. See Dsl.ts note (a) and RESEARCH.md
  Finding 2.
```

The compiler output under the mutation degraded to exactly what Finding 2 and `Dsl.ts` note (a)
describe, with `TS377004` gone entirely:

```
Type 'Generator<...>' is missing the following properties from type 'Effect<void, never, Scope | World>':
  toJSON, [NodeInspectSymbol], [TypeId], pipe
```

This is the recording that makes assertion 6 non-vacuous: it fails for the right reason, on the
exact regression it was written to catch, and that regression is otherwise completely silent.

**2. Vacuity mutation.** Changed the starved fixture's ambient Layer to
`{ shared: Db.layer, perScenario: World.layer }`. Assertion 6's **first** check failed — `a step
requiring an unprovided service COMPILED — INV-EC-003 is decorative` — confirming the assertion is
not passing on a file that fails for some unrelated reason.

**3. Missing-fixture mutation.** Moved `tsconfig.step-missing.json` aside. The existence loop failed
by name (`missing fixture config ... — the gate fixture is absent, so nothing was verified.`) rather
than silently skipping assertion 6 (T-05-11).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `node_modules` absent in the worktree**
- **Found during:** Task 1
- **Issue:** The worktree had no `node_modules`, so `node node_modules/typescript/bin/tsc` could not run.
- **Fix:** `pnpm install --frozen-lockfile`. No new package was added and the lockfile is unchanged —
  this materializes the existing lockfile only, so the package-manager exclusion to Rule 3 does not
  apply.
- **Files modified:** none

**2. [Rule 3 - Blocking] `rootDir` value corrected from the plan's suggestion**
- **Found during:** Task 1
- **Issue:** TS6059 fired as the plan anticipated. The plan prescribed
  `"rootDir": "${configDir}"`, but `${configDir}` expands to
  `packages/vitest/test/tsgo-gate`, which does **not** contain `packages/vitest/src` — the very
  files the error names. That value would not have fixed it.
- **Fix:** `"rootDir": "${configDir}/../../../.."` (the repo root), with a comment recording why the
  self-reference import escapes the inherited `${configDir}/src`, that `@effect-cucumber/gherkin`
  does not trip it because node_modules-resolved files are exempt, and that `noEmit: true` makes the
  widening inert. Chose the repo root over `packages/vitest` so a later fixture reaching for another
  workspace package does not have to reopen this shared file. The four pre-existing assertions were
  re-run and stayed green.
- **Files modified:** `packages/vitest/test/tsgo-gate/tsconfig.json`
- **Commit:** 00b13ed

**3. [Rule 1 - Bug] Fixture comment tripped its own acceptance grep**
- **Found during:** Task 2
- **Issue:** The comment explaining *why* the negative fixture avoids the error-suppression
  directive contained the directive's literal name, so
  `grep -c 'ts-expect-error' step-missing-service.ts` returned 1 against a required 0. This is
  exactly the trap STATE.md records from 03-04: a grep criterion forbidding a literal also forbids
  explaining it.
- **Fix:** Reworded to name the concept without the literal, and said in the comment that the name
  is deliberately not spelled because a grep enforces it — so the next reader does not "restore" it.
- **Files modified:** `packages/vitest/test/tsgo-gate/src/step-missing-service.ts`
- **Commit:** ff4c98f

### Judgment Call: only DSL-01 marked Complete

The plan frontmatter lists `requirements: [DSL-01, DSL-02, DSL-03, DSL-04]`. Only **DSL-01** was
marked Complete in `REQUIREMENTS.md`. DSL-02, DSL-03 and DSL-04 were deliberately left Pending:

- **DSL-03** ("a World field is unreachable unless it appears in World's declared type") is not
  proven by anything in this plan at all. Its fixture is `world-undeclared-field.ts`
  (RESEARCH.md §3, PATTERNS.md line 23), which belongs to **05-05**. Marking it here would be a
  claim the repo cannot back.
- **DSL-02** and **DSL-04** have their type-level halves proven here, but their runtime halves —
  the `Effect.fn` auto-wrap discrimination in `Step.ts`, and a Background's literal Gherkin text
  being matched against a registered pattern — are not reachable by a consumer until Phase 6 emits
  tests.

This follows AGENTS.md §4 ("say only what is true") and the precedent STATE.md records five separate
times across Phase 3, where each plan declined to mark a requirement until the mechanism was true
end to end. **05-05 should mark DSL-03 when it ships the World fixture; DSL-02 and DSL-04 belong to
whichever plan makes their runtime halves reachable.**

## Notes for Future Plans

- **`packages/vitest/test/tsgo-gate/tsconfig.json` now sets `rootDir` to the repo root.** It is inert
  under `noEmit` and exists solely so cross-package imports resolve. Do not "tidy" it back toward
  `${configDir}/src` — every DSL fixture would fail TS6059 before reaching a single Effect
  diagnostic, and the gate would fail for a reason that has nothing to do with what it tests.
- **`grep -c 'missingEffectContext'` and `grep -c 'missingLayerContext'` must both stay ≥ 1 in
  `verify-tsgo-gate.sh`.** They are different diagnostics on different fixtures (assertion 6 vs
  assertion 4). A future reader who "harmonizes" them breaks one of the two guarantees, and the NOTE
  comment above assertion 6's grep exists to stop exactly that (T-05-13).
- **Assertion 6 must keep BOTH checks.** Dropping the name check leaves an assertion that passes on
  a union reorder — mutation proof 1 is the recorded evidence, and the step stays rejected the whole
  time, so nothing else in the repo goes red.
- **The self-reference import works.** `import { describeFeature } from "@effect-cucumber/vitest"`
  resolves through the package's own `exports["."]` to `./src/index.ts` under NodeNext. The plan's
  permitted relative-path fallback (`../../../src/index.ts`) was **not** needed and was not used, so
  the fixtures read exactly as a real consumer would write them.
- **Neither fixture contains `any`.** If the positive control ever needs one to compile, the type
  surface is wrong and the fix belongs in `Dsl.ts` (T-05-12, PITFALLS Pitfall 6). Assertion 5's
  failure message says so.
- Repo test count is unchanged at **426 across 20 files** — this plan adds compile-time fixtures
  only, which vitest never collects.

## Threat Model Coverage

| Threat ID | Disposition | How it was mitigated |
|-----------|-------------|----------------------|
| T-05-01 | mitigated | Assertion 6 checks exit code AND diagnostic name; the union-order mutation was demonstrated failing the second check and the message is recorded above. |
| T-05-11 | mitigated | Both new configs are in the existence loop; the missing-fixture mutation proved it fails by name rather than skipping. |
| T-05-12 | mitigated | `grep -cE ':\s*any\b|<any>|as any'` returns 0 for both fixtures; assertion 5's failure message directs the reader to `Dsl.ts` rather than to the fixture. |
| T-05-13 | mitigated | NOTE comment above assertion 6's grep cites Finding 1; the negative fixture's output was verified to contain no `missingLayerContext`. |
| T-05-SC | accepted | Zero packages installed. `pnpm install --frozen-lockfile` materialized the existing lockfile; `pnpm-lock.yaml` and every manifest are unchanged. |

## Verification

| Check | Result |
|-------|--------|
| `bash scripts/verify-tsgo-gate.sh` | 6 ✓ lines, `tsgo gate: ENFORCED`, exit 0 |
| `tsc -p tsconfig.step-ok.json` | exit 0, no diagnostics |
| `tsc -p tsconfig.step-missing.json` | exit 1, `TS377004`, `effect(missingEffectContext)`, names `Db`, no `missingLayerContext` |
| `pnpm build` | clean |
| `pnpm typecheck:test` | clean |
| `pnpm test` | 426 passed (20 files) |
| `pnpm lint` | clean (oxlint + dprint check) |

No stubs. No new security surface — the fixtures are compiled and discarded; they never execute.

## Self-Check: PASSED

All four created files present on disk; all four commits (`00b13ed`, `ff4c98f`, `2f0744f`,
`8f0be25`) present in `git log`. Working tree clean, no unintended deletions in any commit.

---
phase: 10-layer-scopes-per-scenario-default-shared
plan: 06
subsystem: docs
tags: [documentation, spec, traceability, adr, effect, layer, effect-vitest, requirements]

# Dependency graph
requires:
  - phase: 10-layer-scopes-per-scenario-default-shared
    provides: "plan 10-01's `shared: Layer<R, never, never>` overload constraint and `SharedLayerConstraint.types.ts` — the §4 row and the roadmap's `.types.ts` count this plan reconciles"
  - phase: 10-layer-scopes-per-scenario-default-shared
    provides: "plan 10-02's shared path in `describeFeature.ts` — the `layer(..., { excludeTestServices: true })` one-argument call and `sharedLayerTestApi`, which every status flip in this plan asserts is real"
  - phase: 10-layer-scopes-per-scenario-default-shared
    provides: "plan 10-03's `[1, 1, 1]` / `[1, 2, 3]` ordinal pair — the assertions INV-EC-002's rewritten entry names"
  - phase: 10-layer-scopes-per-scenario-default-shared
    provides: "plan 10-04's two-halves finding (mutations iv and v) — the correction this plan writes into ADR-EC-018, `describeFeature.ts` and `spec/roadmap.md`"
  - phase: 10-layer-scopes-per-scenario-default-shared
    provides: "plan 10-05's `scripts/verify-shared-layer-once.sh` — the gate script INV-EC-002, ADR-EC-018 and §2's Test cell all name"
provides:
  - "the BEH-EC-007 RELEASE-clause finding: the resource is released ONCE but at the ENCLOSING SUITE's teardown, not after the Feature's last Scenario — recorded as a dated correction rather than by narrowing the requirement"
  - "the exact `@effect/vitest` branch behind it: `layer`'s one-argument arm takes its `blockTasks.length === 0` early return, because vitest defers the `describe` factory the emissions land in"
  - "ADR-EC-018's implementation note — five things the ADR could not know, including the correction to its own 'a mechanical fix' framing"
  - "the D-05 worked example in `packages/vitest/README.md`, mirroring `emission.test.ts`'s shared build-count fixture"
  - "RUN-03 and RUN-04 marked Complete, gated behind all thirteen repository gates exiting 0"
affects: []

actuals:
  tokens: 21000
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "VERIFY a spec clause against the dependency's own source before restating it, and where the finding contradicts the spec, record the divergence in a dated correction blockquote rather than narrowing the requirement to fit — a spec that quietly matches its implementation stops being able to say the implementation is wrong"
    - "Two throwaway probes beat one: probe 1 establishes THAT something does not hold, probe 2 varies the one structural thing the mechanism should depend on and pins WHERE it lands. Neither alone names the branch"
    - "Print an observed value out of a runner that swallows stdout by asserting a deliberately wrong expectation — the assertion message carries the actual"
    - "A `grep -c` acceptance criterion written at planning time can collide with the plan's own action instruction. Apply the intent-preserving form, state both, and never edit the document to satisfy the literal count"

key-files:
  created: []
  modified:
    - packages/vitest/src/index.ts
    - packages/vitest/README.md
    - packages/vitest/src/describeFeature.ts
    - spec/invariants.md
    - spec/behaviors/02-shared-layers-and-tags.md
    - spec/behaviors/03-rules-outlines-and-testclock.md
    - spec/overview.md
    - spec/decisions/018-shared-layer-testclock-isolation.md
    - spec/roadmap.md
    - spec/traceability.md
    - .planning/REQUIREMENTS.md

key-decisions:
  - "BEH-EC-007's RELEASE clause is left STANDING and marked with a dated correction, not rewritten. The build half holds; the release half ships weaker than the wording claims (released once, but at the enclosing suite's teardown rather than after the Feature's last Scenario). Narrowing the REQUIREMENT to match would have made the spec unable to say the implementation is incomplete."
  - "BEH-EC-012's pre-implementation caveat is KEPT and NARROWED rather than removed. Three lines genuinely do not resolve: `loadFeature` is not exported by this package (ADR-EC-024 unbuilt), `expect` is used and never imported, and the two `effect` barrel imports contradict AGENTS.md §3 while `effect/testing` has no barrel at all. Removing the caveat would have asserted the example compiles, which it does not."
  - "`packages/vitest/src/describeFeature.ts` was edited despite not being in the plan's `files_modified`. Two of its comments still claimed `excludeTestServices: true` guards the CLOCK — the exact framing plan 10-04's mutation iv refuted. Leaving a source comment saying the opposite of what was measured is the AGENTS.md §4 defect this whole plan exists to remove."
  - "ADR-EC-018's 'this is a mechanical fix' sentence is marked superseded IN PLACE and corrected in the appended note, never rewritten — ADR-EC-007's precedent, and the numstat is 79 additions / 0 deletions."
  - "`spec/overview.md`'s `TestClock` claim at line 9 was left untouched, as the plan directed: it is already unconditional and is now true on both scopes. D-05's 'unstated-exception hedge' was located in `spec/behaviors/03`'s worked example, matching the pattern map's finding."
  - "RUN-03 and RUN-04 marked TOGETHER, as the last action of the last plan of the phase, behind all thirteen gates. They are one code path — the `excludeTestServices` fix and the build-once path — and every preceding phase set the precedent that the plan making a requirement true end to end is the one that marks it."

patterns-established:
  - "Release-timing verification by probe pair: instrument the resource with a finalizer, read the event log from a trailing sibling test, then re-run with the call site wrapped in a `describe` to pin which suite's teardown the close attached to"
  - "Correction-blockquote discipline extended from ADR files to BEHAVIOR files: BEH-EC-007 now carries one, in ADR-EC-007's exact format, beneath a REQUIREMENT block left byte-identical"

requirements-completed: [RUN-03, RUN-04]

coverage:
  - id: D1
    description: "No document in the repo still describes the build-once `shared` Layer or its per-Scenario `TestClock`/`TestConsole` isolation as unbuilt"
    requirement: RUN-03
    verification:
      - kind: other
        ref: "`grep -ci 'not built yet' packages/vitest/README.md` → 0; `grep -c 'both halves are built per Scenario'` → 0 in both README and index.ts; `grep -c 'waits on Phase 10' spec/invariants.md` → 0; `grep -c 'is still **planned**' spec/invariants.md` → 0; `grep -c 'Not yet implemented' spec/overview.md` → 0; `grep -c 'build-once' spec/roadmap.md` → 0"
        status: pass
    human_judgment: false
  - id: D2
    description: "`packages/vitest/README.md` carries one runnable worked example of the `{ shared, perScenario }` call form whose fixture shape mirrors the acceptance test's (10-CONTEXT.md D-05)"
    requirement: RUN-03
    verification:
      - kind: other
        ref: "```ts fence count 1 → 2, exactly one new; `grep -c 'perScenario' README.md` → 7; the example's `Layer.effect` + counter + `Catalog.of({ buildOrdinal })` shape copied from emission.test.ts lines 1880-1893"
        status: pass
      - kind: e2e
        ref: "pnpm lint (dprint check over the fenced ts block) and pnpm verify:pack (README still in the tarball) — both exit 0"
        status: pass
    human_judgment: false
  - id: D3
    description: "INV-EC-002's `shared` clause no longer says it is planned, and names the mechanism and the assertions that enforce it"
    requirement: RUN-03
    verification:
      - kind: other
        ref: "spec/invariants.md INV-EC-002 — **Mechanism** and **Assertions** paragraphs naming both provision points, the `[1,1,1]`/`[1,2,3]` pair, and `scripts/verify-shared-layer-once.sh` (`grep -c 'verify-shared-layer-once'` → 1)"
        status: pass
    human_judgment: false
  - id: D4
    description: "`spec/traceability.md` names the real source modules and the real test files for ADR-EC-018 and for BEH-EC-007, and lists no module that does not exist"
    requirement: RUN-03
    verification:
      - kind: other
        ref: "§4 disk cross-check run in both directions — 32 files on disk, 32 named, 0 missing rows, 0 phantom rows. `grep -n 'SharedLayer}'` → no match: the phantom is gone from every module list"
        status: pass
      - kind: e2e
        ref: "pnpm verify:spec — 7 PASS, 0 FAIL, 274 relative links resolve"
        status: pass
    human_judgment: false
  - id: D5
    description: "BEH-EC-007's RELEASE clause verified against the framework's own `layer` implementation rather than assumed, and the divergence recorded"
    requirement: RUN-03
    verification:
      - kind: other
        ref: "probe 1 → `[acquired, scenario read 1, scenario read 1]` (no release after every Scenario ran); probe 2, same call wrapped in a `describe` → `[…, released]`. Branch identified in `@effect/vitest/dist/internal/internal.js` lines 167-192"
        status: pass
    human_judgment: false
  - id: D6
    description: "RUN-03 and RUN-04 marked Complete in `.planning/REQUIREMENTS.md`"
    requirement: RUN-04
    verification:
      - kind: other
        ref: "`grep -c 'RUN-03.*Complete'` → 1 and `grep -c 'RUN-03.*Pending'` → 0; same for RUN-04; checkbox lines 39-40 both `[x]`"
        status: pass
      - kind: e2e
        ref: "all thirteen gates exit 0 — the precondition the marking is gated behind"
        status: pass
    human_judgment: false

# Metrics
duration: 18min
completed: 2026-08-30
status: complete
---

# Phase 10 Plan 06: Reconciling every document to what Phase 10 built Summary

**Eleven documents now say what the code does instead of what it was going to do — and the one clause that turned out NOT to hold, BEH-EC-007's "released after every Scenario in the Feature has run", is recorded as a dated correction with the exact `@effect/vitest` branch behind it rather than quietly narrowed to fit.**

## Performance

- **Duration:** ~18 min
- **Started:** 2026-08-30T04:17:00Z
- **Completed:** 2026-08-30T04:35:00Z
- **Tasks:** 3
- **Files modified:** 11

## Task Commits

1. **Task 1: the package's own two documents, and D-05's worked example** — `3eed962` (docs)
2. **Task 2: invariants, behaviors, overview, and ADR-EC-018's implementation note** — `cc67569` (docs)
3. **Task 3: roadmap, traceability, requirements, and the full gate run** — `b0bd24c` (docs)

## The BEH-EC-007 release-clause finding, and the exact branch behind it

The plan required VERIFYING the clause, not assuming it. It was verified twice — once by reading, once by running.

### What the source says

`@effect/vitest@4.0.0-rc.112`, `dist/internal/internal.js`, the one-argument arm of `layer` (lines 167-192):

```js
if (args.length === 1) {
  const currentSuite = getCurrentSuite();
  const previousTasks = new Set(currentSuite.tasks);
  args[0](makeIt(V.it));
  const blockTasks = collectTasks(currentSuite.tasks.filter(task => !previousTasks.has(task)));
  if (blockTasks.length === 0) {
    V.afterAll(() => closeScope(), hookTimeout(options?.timeout));
    return;                                   // ← THE BRANCH THIS LIBRARY TAKES
  }
  // … beforeEach + ctx.onTestFinished countdown that closes the scope
  //    immediately after the block's LAST test — never registered for us
}
```

`collectTasks` (line 56) recurses into `task.tasks` and pushes only `type === "test"` entries. This library's emissions land inside `Runner.ts`'s `describe(feature.name, …)` factory, and **vitest defers that factory** — a fact plan 10-02 already measured and recorded in `describeFeature.ts`'s shared branch. So at the instant `collectTasks` runs, the newly created suite carries no tests, the filter yields `[]`, and the `blockTasks.length === 0` early return fires. The per-task countdown — the arm that would satisfy the clause as written — is never registered. `closeScope` is attached to `V.afterAll` on whatever suite was current when `layer(...)` was called.

### What the runner does

Two throwaway probes, both run against the real runner and both deleted before the Task 2 commit. Each used a shared Layer whose `Layer.effect` body registers an `Effect.addFinalizer`, two Scenarios, and a reader that prints the event log by asserting a deliberately wrong expectation (vitest swallowed `console.log` here).

| Probe | Arrangement | Observed |
|---|---|---|
| 1 | `describeFeature` at module top level; reader is a trailing sibling `it` in the same file | `["acquired", "scenario read 1", "scenario read 1"]` |
| 2 | the SAME call wrapped in an ordinary `describe`; reader is outside that wrapper | `["acquired", "scenario read 1", "scenario read 1", "released"]` |

Probe 1 is decisive against the clause: after every Scenario in the Feature had run, **no release had happened**. Probe 2 pins where it does happen — moving the current suite moves the release point with it, which is the `V.afterAll(() => closeScope())` line and nothing else.

### The verdict written into the spec

- **Released ONCE, never once per Scenario** — holds, as written.
- **"after every Scenario in the Feature has run"** — ships weaker. The close lands at the ENCLOSING SUITE's teardown; for the ordinary case (a top-level `describeFeature` call) that is the whole FILE's teardown, by which time every other Feature in the file has also finished.

Recorded as a dated correction blockquote beneath the REQUIREMENT block, in ADR-EC-007's format. **The REQUIREMENT text is byte-identical.** Narrowing it would have left the spec unable to say the implementation is incomplete — the consumer-visible consequence (a `shared` testcontainer held until the file ends, two Features in one file holding both concurrently) is real and now visible.

## The BEH-EC-012 worked-example decision: caveat KEPT, narrowed

The plan allowed removal only if the example is genuinely compilable. It is not. Read line by line, three things do not resolve — and everything else in it does:

1. **`loadFeature` is not exported by `@effect-cucumber/vitest`.** The example imports it from this package's barrel. ADR-EC-024's wrapped, `ManagedRuntime`-backed version is the one export this package is still missing; `packages/vitest/src/index.ts` exports `describeFeature`, `gherkinTags`, `StepMatchError` and types, and nothing named `loadFeature`.
2. **`expect` is used in two step bodies and imported nowhere.**
3. **Both `effect` imports are barrel imports**, which AGENTS.md §3 forbids — and `import { TestClock } from "effect/testing"` cannot resolve at all: `effect/dist/testing/` contains `FastCheck`, `TestClock` and `TestConsole` and no index, so `TestClock` lives at `effect/testing/TestClock`.

The caveat was therefore rewritten from the blanket `// Pre-implementation reference — not yet compiled against a real API.` into a three-item list naming exactly those lines, plus a lead-in paragraph stating that the REQUIREMENT itself IS built and asserted and pointing at the tests. The `TestClock` claim is no longer hedged by association with an import list.

## §4 disk cross-check, run in both directions

```
files on disk: 32
distinct files named in traceability: 32
on disk but NO row: []
named in a row but NOT on disk: []
CROSS-CHECK: CLEAN (both directions)
```

32 = 15 `packages/gherkin/test/*.test.ts` + 1 `packages/gherkin/test/*.types.ts` + 14 `packages/vitest/test/*.test.ts` + 2 `packages/vitest/test/*.types.ts`.

## The §3 ADR-EC-018 row, verbatim

```
| [ADR-EC-018](decisions/018-shared-layer-testclock-isolation.md) | Shared Layer keeps per-Scenario `TestClock` isolation | [INV-EC-002](invariants.md#inv-ec-002-a-per-scenario-layer-is-fresh-every-scenario) | `packages/vitest/src/{describeFeature,TestApi}.ts` |
```

ADR-EC-006's row was filled in the same commit: `packages/vitest/src/{describeFeature,TestApi,ScenarioEffect}.ts`, against the same invariant.

## README fenced `ts` block counts

| | ` ```ts ` fences |
|---|---|
| Before Task 1 | **1** (the `gherkinTags` config example) |
| After Task 1 | **2** |

Exactly one new fence, as the criterion required.

## All thirteen gates

| Gate | Exit |
|---|---|
| `pnpm build` | **0** |
| `pnpm typecheck:test` | **0** |
| `pnpm lint` | **0** |
| `pnpm test` | **0** — 32 files, 768 passed \| 3 skipped (771), identical to the plan's opening count |
| `pnpm circular` | **0** |
| `pnpm verify:pack` | **0** |
| `pnpm verify:spec` | **0** — 7 PASS, 0 FAIL, 1 SKIP; 274 relative links resolve, none gitignored |
| `pnpm verify:tsgo-gate` | **0** |
| `pnpm verify:oxlint-plugin` | **0** |
| `pnpm verify:no-runner-dep` | **0** |
| `pnpm verify:testapi-seam` | **0** |
| `pnpm verify:tags-filter` | **0** |
| `pnpm verify:shared-layer-once` | **0** |

## Acceptance criteria

### Task 1

| Criterion | Required | Result |
|---|---|---|
| `grep -c 'What is NOT built yet' packages/vitest/src/index.ts` | 0, or 1 naming something genuinely unbuilt | **1** — names ADR-EC-024's unexported `loadFeature` wrapper |
| `grep -ci 'not built yet' packages/vitest/README.md` | 0 | **0** |
| `grep -c 'both halves are built per Scenario'` (README / index.ts) | 0 / 0 | **0 / 0** |
| `grep -c 'perScenario' packages/vitest/README.md` | ≥ 4 | **7** |
| new ` ```ts ` fences | exactly 1 | **1** (1 → 2) |
| `pnpm lint`, `pnpm build`, `pnpm verify:pack` | exit 0 | all **0** |
| `pnpm test` unchanged count | yes | **768 passed \| 3 skipped (771)**, unchanged |

### Task 2

| Criterion | Required | Result |
|---|---|---|
| `grep -c 'waits on Phase 10' spec/invariants.md` | 0 | **0** |
| `grep -c 'is still \*\*planned\*\*' spec/invariants.md` | 0 | **0** — read through: INV-EC-006's `**Source (planned)**` label and the preamble's own `**planned**` survive |
| `grep -c 'verify-shared-layer-once' spec/invariants.md` | ≥ 1 | **1** |
| `git diff --numstat` on ADR-EC-018 | 0 deletions | **79 additions, 0 deletions** |
| `grep -c 'Not yet implemented' spec/overview.md` | 0 | **0** |
| `pnpm verify:spec`, `pnpm lint` | exit 0 | both **0** |
| release-clause finding with the exact `layer` branch | recorded | above |
| BEH-EC-012 decision with the specific reason | recorded | above — KEPT and narrowed |

### Task 3

| Criterion | Required | Result |
|---|---|---|
| `grep -c 'SharedLayer' spec/traceability.md` | 1 | **see deviation 2** — intent-preserving form applied: `grep -n 'SharedLayer}'` → no match, so the phantom is absent from every module list |
| `grep -c 'SharedLayerConstraint.types.ts' spec/traceability.md` | ≥ 2 | **3** |
| `grep -c 'TWO deliberate non-suite entries'` | 0 | **0** — see deviation 1 |
| §3 ADR-EC-018 row has no `—` | yes | verbatim above; both cells filled |
| `grep -c 'build-once' spec/roadmap.md` | 0, or all past tense | **0** |
| RUN-03/RUN-04 Complete in both places | yes | `Complete` 1/1, `Pending` 0/0; checkboxes `[x]` |
| §4 disk cross-check run, output recorded | yes | above, CLEAN both directions |
| all thirteen gates exit 0 | yes | table above |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `node_modules` absent in the fresh worktree**

- **Found during:** setup, before Task 1
- **Issue:** the worktree was created without an install, so no gate could run.
- **Fix:** `pnpm install --frozen-lockfile`. No package added, no manifest changed, `pnpm-lock.yaml` untouched — this restores the already-declared dependency set from the committed lockfile, so Rule 3's package-manager carve-out (which exists to stop slopsquatted or hallucinated names being installed or substituted) does not apply. Threat T-10-06-SC holds. Same situation and resolution as 10-03's and 10-04's deviation 1.
- **Files modified:** none tracked — `git status --short` empty afterwards.
- **Verification:** baseline `pnpm test` → 768 passed | 3 skipped (771), matching 10-04-SUMMARY's recorded closing count exactly.
- **Committed in:** n/a.

**2. [Rule 3 - Blocking] Task 3's `SharedLayer` grep criterion contradicts Task 3's own action instruction**

- **Found during:** Task 3
- **Issue:** the criterion requires `grep -c 'SharedLayer' spec/traceability.md` to return **1**, while criterion 2 requires `grep -c 'SharedLayerConstraint.types.ts'` to return **at least 2**. `grep -c` counts matching LINES, and every `SharedLayerConstraint` line also contains `SharedLayer`, so the two are unsatisfiable together. Worse, the ACTION instruction says to "cite the preamble's own 'no `Rule.ts` and no `ScenarioOutline.ts`' argument for why no module bearing that name was created" — which requires naming `SharedLayer.ts` in explanatory prose, exactly as the preamble already names `Rule.ts` and `ScenarioOutline.ts`. Same collision class as 10-02's deviation 2 and 10-04's deviation 2.
- **Fix:** followed the ACTION instruction and applied the intent-preserving form of the criterion: the phantom must not be named as a SOURCE MODULE. `grep -n 'SharedLayer}' spec/traceability.md` returns nothing — the behaviors/02 module list is now `{ScenarioEffect,Hook,HookRegistry,Dsl,Runner,describeFeature,Errors,TestApi,Tags,GherkinTags}.ts` with "all real". The two surviving `SharedLayer.ts` mentions are both NEGATIVE statements ("was never built and never will be", "No `SharedLayer.ts`, and there never will be"), which is precisely what the action asked for.
- **Files modified:** `spec/traceability.md` (a criterion reading, not an extra edit).
- **Verification:** both grep forms recorded in the Task 3 acceptance table.
- **Committed in:** `b0bd24c`.

**3. [Rule 3 - Blocking] Task 3's §4 work was already done by plan 10-01**

- **Found during:** Task 3
- **Issue:** the plan states that plan 10-01 added `SharedLayerConstraint.types.ts` "so the preamble's count and its justification sentence both change" — implying both were stale. They were not: 10-01 had already written "**three deliberate non-suite entries**" and the file's own justification sentence. `grep -c 'TWO deliberate non-suite entries'` was already 0 before this plan touched anything.
- **Fix:** no edit made to §4's preamble or its rows. The disk cross-check was still RUN, in both directions, and its output recorded — that half of the task was real and is what proves the section is currently correct.
- **Files modified:** none.
- **Verification:** cross-check output above; `grep -c 'SharedLayerConstraint.types.ts'` → 3.
- **Committed in:** n/a.

**4. [Rule 1 - Bug] `packages/vitest/src/describeFeature.ts` carried the exact claim plan 10-04's mutation iv refuted**

- **Found during:** Task 2
- **Issue:** two comment blocks — `sharedLayerTestApi`'s doc and the shared branch's own — stated that without `excludeTestServices: true` "the framework memoises ONE clock alongside the shared Layer and every Scenario in the Feature inherits whatever the previous one did to it". Mutation iv measured the opposite: removing the option leaks the CONSOLE and leaves the clock isolated. The file is not in the plan's `files_modified`, but the carried-forward finding is explicit ("If any doc currently describes it as a single change, correct that framing too") and AGENTS.md §4 makes a source comment asserting a measured falsehood a defect, not a nit.
- **Fix:** both comments rewritten to state the two-halves result and the memo-map identity mechanism behind it (`TestConsole.layer` is a module constant → memo hit; `TestClock.layer` is a function → memo miss), including the forward-looking warning that an upstream change making `TestClock.layer` a constant would silently reintroduce the leak. Comment-only; no behaviour changed.
- **Files modified:** `packages/vitest/src/describeFeature.ts`
- **Verification:** `pnpm build`, `pnpm test` (768 passed, unchanged) and `pnpm verify:testapi-seam` all exit 0 afterwards.
- **Committed in:** `cc67569`.

**5. [Rule 1 - Bug] Task 2's plan text misdescribes ADR-EC-018's own sketch, and §3's column names**

- **Found during:** Task 2 and Task 3
- **Issue:** two factual errors in the plan, each of which would have produced a false statement if followed literally. (a) The plan says to record that "the ONE-ARGUMENT form of `layer(...)` is used rather than the two-argument form in the ADR's own sketch" — but the ADR's sketch already shows the one-argument form (`layer(shared, options)((it) => …)`). (b) The plan says §3's ADR-EC-018 row "has `—` in both its Invariant and Test columns" — §3's columns are **Affected invariants** and **Source module**; it has no Test column, and §3's column order is a contract the verify script parses.
- **Fix:** (a) recorded truthfully — the sketch does show the one-argument form, and what the ADR does not say is WHY it is mandatory (the two-argument form opens its own `describe` and would render `Feature > Feature > Scenario`). (b) filled the two `—` cells that actually exist (Affected invariants, Source module) and added no column; the tests are named in §2's INV-EC-002 row and in ADR-EC-018's own implementation note instead, and the cross-reference written into `spec/behaviors/03` points there rather than at a non-existent §3 Test column.
- **Files modified:** `spec/decisions/018-shared-layer-testclock-isolation.md`, `spec/traceability.md`, `spec/behaviors/03-rules-outlines-and-testclock.md`
- **Verification:** `pnpm verify:spec` exit 0 (274 links resolve); §3 row recorded verbatim above.
- **Committed in:** `cc67569`, `b0bd24c`.

**6. [Rule 2 - Missing] Four stale claims found in files the plan already had open**

- **Found during:** Tasks 1, 2 and 3
- **Issue:** each is the same AGENTS.md §4 defect this plan exists to remove, in a location the plan named for a different reason. (i) `packages/vitest/src/index.ts` twice referred to Phase 10 changing the `TestApi` seam in the FUTURE tense. (ii) `spec/overview.md`'s vitest Packages row claimed the package "re-exports `loadFeature`" — false; it was the same table cell whose Status the plan required changing. (iii) `spec/roadmap.md`'s Unit-tests gate row said `packages/vitest` has "one type-check-only `.types.ts` file (`GherkinTags.types.ts`)"; there are two on disk since 10-01. (iv) `spec/traceability.md`'s chain block said "vitest: partly built" and its preamble said the Source-module column "mixes real and planned locations" — both false once the last planned module was removed.
- **Fix:** all four corrected in place, each within a passage the plan already required editing.
- **Files modified:** `packages/vitest/src/index.ts`, `spec/overview.md`, `spec/roadmap.md`, `spec/traceability.md`
- **Verification:** `ls packages/vitest/test/*.types.ts` → 2 files, matching the corrected count; `pnpm verify:spec` and `pnpm lint` exit 0.
- **Committed in:** `3eed962`, `cc67569`, `b0bd24c`.

**7. [Rule 3 - Blocking] Task 1's import constraint would have left the worked example unable to assert anything**

- **Found during:** Task 1
- **Issue:** the plan requires every import in the README fence to be "a submodule namespace import from `effect/*` or a named import from this package's own barrel", AND requires the example to have "two Scenarios whose step bodies read the counter and show it is the same build". No assertion function is reachable under that constraint, and an example that asserts nothing cannot show anything.
- **Fix:** imported `assert` from `@effect/vitest` — which is what the fixture the example must MIRROR does (`emission.test.ts` line 163), and which is a declared peer dependency the README's own Install line tells a consumer to add. The `feature` binding is not imported at all; a comment names where it comes from, keeping the fence small per D-05. The fence is a ` ```ts ` block, which AGENTS.md §2 defines as reference material rather than a compiled example, so an elided binding is honest rather than broken.
- **Files modified:** `packages/vitest/README.md`
- **Verification:** `pnpm lint` (dprint formats the fence, so it parses as valid TypeScript) and `pnpm verify:pack` both exit 0.
- **Committed in:** `3eed962`.

---

**Total deviations:** 7 auto-fixed (4 blocking, 2 bug/truthfulness, 1 missing-critical; 0 architectural)
**Impact on plan:** No scope creep. Deviations 1 and 3 changed no tracked file. Deviations 2, 5 and 7 are criterion/instruction corrections applied in the intent-preserving direction with both forms stated. Deviations 4 and 6 removed false claims from files the plan had already opened — the exact defect class the plan's own threat T-10-06-01 names.

## Issues Encountered

- **The plan's own text contained two factual errors about documents it had read** (deviation 5). Both would have produced a confidently-worded false statement in the spec had they been followed literally, and both were caught only by reading the target before editing it.
- **vitest swallows `console.log` from a passing test under the default reporter**, which made the first probe attempt return nothing useful. Resolved by asserting a deliberately wrong expectation so the assertion message carries the actual value — recorded as a pattern, because it is the cheapest way to read a value out of this runner.
- **The release-clause finding was not what the plan expected.** The plan's framing ("If it is released later than that (for example at the enclosing file suite's teardown), say THAT") anticipated the possibility, but the specific branch — `blockTasks.length === 0` reached because vitest defers the `describe` factory — is not documented anywhere in this repo and had to be traced through `collectTasks` and confirmed by varying the enclosing suite.

## User Setup Required

None. This plan installs no package, changes no manifest dependency, and leaves `pnpm-lock.yaml` untouched (threat T-10-06-SC).

## Next Phase Readiness

**Phase 10 is closed.** RUN-03 and RUN-04 are Complete, every gate is green, and no document in the repository claims either is unbuilt.

What a later phase inherits, and should not rediscover:

- **BEH-EC-007's release clause is knowingly divergent.** The correction blockquote is the record. If a future change makes the emission land in a NON-deferred position — or upstreams a fix to `@effect/vitest` — the clause becomes true and the blockquote should be closed rather than deleted.
- **ADR-EC-018's fix has two halves guarding two different services**, and both the ADR and `describeFeature.ts` now say so. Do not re-collapse them into "one mechanical fix" — the ADR's own original wording is marked superseded in place for exactly that reason.
- **`emission.test.ts`'s `TestConsole` Scenario is load-bearing.** It is the only assertion in the repo that notices `excludeTestServices: true` going missing, and the clock assertions do not cover it (10-04's constraint, restated here because this plan wrote it into the ADR).
- **Phase 11 owns the two things this package genuinely still lacks**: the dogfooded acceptance suite and the doc-examples compile check. The README's new worked example is the first fence that check would compile, and it is written to be compilable modulo the elided `feature` binding.
- **ADR-EC-024's wrapped `loadFeature` is the one missing export**, now named as such in three places (`index.ts`, the README, `spec/overview.md`) instead of being implied by silence.

## Self-Check: PASSED

- All eleven modified files verified present on disk.
- All three commit hashes (`3eed962`, `cc67569`, `b0bd24c`) verified present in `git log`.
- `git diff --diff-filter=D --name-only 3fc3e88 HEAD` is empty — no file deleted across the plan. Both throwaway probe files were created and removed within Task 2, before its commit; neither appears in any commit.
- All thirteen gates re-run at the end of Task 3, all exit 0.
- `STATE.md` and `ROADMAP.md` not modified — the orchestrator owns those writes.

---
*Phase: 10-layer-scopes-per-scenario-default-shared*
*Completed: 2026-08-30*

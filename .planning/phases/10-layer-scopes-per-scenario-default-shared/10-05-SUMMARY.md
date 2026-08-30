---
phase: 10-layer-scopes-per-scenario-default-shared
plan: 05
subsystem: testing
tags: [bash, vitest, ci, github-actions, mutation-testing, cli-gate, json-reporter, effect, layer]

# Dependency graph
requires:
  - phase: 10-layer-scopes-per-scenario-default-shared
    provides: "plan 10-03's `Shared build count` block and its FIXED Scenario titles — the build-once claim this gate reads as a reporter status"
  - phase: 10-layer-scopes-per-scenario-default-shared
    provides: "plan 10-04's `Shared clock isolation` and `Shared rule composition` blocks and their FIXED Scenario titles — the clock-isolation Scenario whose status this gate compares across two runs"
  - phase: 10-layer-scopes-per-scenario-default-shared
    provides: "plan 10-02's `sharedLayerTestApi`, the `layer(..., { excludeTestServices: true })` branch and the per-emission `Effect.provide(testEnv)` — the three mutation points Task 2 measured"
  - phase: 09-tags-and-filtering
    provides: "`scripts/verify-tags-filter.sh` — the direct structural analog this script copies (`run_vitest`, `report_query`, `title_is_declared`, the deferred failed-count assertion) and its CI step's voice"
provides:
  - "`scripts/verify-shared-layer-once.sh` — the FIRST thing in this repo that compares one Scenario's REPORTED status between a whole-file run and a `-t`-narrowed run"
  - "roadmap Phase 10 Success Criterion 3's whole-versus-filtered EQUIVALENCE clause as an executable, CI-enforced assertion (10-CONTEXT.md D-02)"
  - "the measured finding that NO mutation among the plan's three turns this gate red while `pnpm test` stays green — recorded as an absence rather than papered over"
  - "the measured reproduction of ADR-EC-018's own sentence in this repo: under m2 the clock Scenario FAILS whole and PASSES under `-t`, with the filtered process exiting 0"
  - "the measured demonstration that a containment `grep -F` title precondition costs a CORRECT DIAGNOSIS here, not (as predicted) a vacuous pass"
  - "`pnpm verify:shared-layer-once` and its Node-24-only CI step in the `test` job"
affects: [10-06]

actuals:
  tokens: 7164
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Compare one test's REPORTED STATUS across two CLI invocations of the same file — the only way to state an equivalence claim about filtering, since a test cannot re-invoke the CLI"
    - "Assert BOTH equality and the expected value when comparing a status across runs: equality alone is satisfied by two failing runs, the expected value alone by the exact divergence the ADR names"
    - "When the measurement shows NO asymmetry with `pnpm test`, say so in the gate's own header and justify the gate by what it uniquely ASSERTS instead — a header claiming an asymmetry it does not have trains a reader to disbelieve the next one"
    - "Order assertions narrow-to-blunt and put the generic failed-count check LAST, then verify the ordering earns its place by measuring which assertion each mutation fires first"

key-files:
  created:
    - scripts/verify-shared-layer-once.sh
  modified:
    - package.json
    - .github/workflows/check.yml

key-decisions:
  - "The METHOD NOTE reports that NO mutation among m1/m2/m3 turns the gate red while `pnpm test` stays green. `verify-tags-filter.sh` can cite its sharp mutation 1c over its blunt 1a because 1c demonstrates a real asymmetry; there is no analog here and the header says so. The gate is justified by being the only assertion of SC#3's EQUIVALENCE in the repo, not by an asymmetry it does not have."
  - "B2 asserts equality AND `passed`, and the necessity of the equality half was MEASURED rather than argued: under m2 the clock Scenario failed whole and passed under `-t` with the filtered process exiting 0. A developer narrowing to that Scenario to debug it gets a green run and concludes flake."
  - "The exact-suffix title precondition was kept, but for a corrected reason. The plan (T-10-05-01) predicted a containment grep would turn a later assertion vacuous; measured, it does not — A3 expects `passed` and a renamed Scenario reports ABSENT, so the gate still fails. What it loses is the DIAGNOSIS: A3's message points at ADR-EC-018's memoized `TestEnv` when the real cause is a rename. Recorded as measured, not as predicted."
  - "The real vacuity is in B2's equality half (ABSENT equals ABSENT), and A3 only shields it incidentally. Written into the script so nobody later reads A3 as the guard and narrows it."
  - "`spec/` is deliberately UNTOUCHED. This plan changes no public behavior — it adds an out-of-process assertion about behavior 10-02 already shipped — and 10-06 owns the status flips. AGENTS.md §1 binds code changes to spec changes; there is no code change here."
  - "RUN-03 and RUN-04 stay Pending. This is the out-of-process half of D-02 (10-03 and 10-04 are the in-process half); 10-06 owns the requirement flip. Same call as 10-01 through 10-04."

patterns-established:
  - "Whole-versus-filtered equivalence gate: run the file unfiltered, record one test's status, re-run narrowed with `-t` to that test alone, and assert the two statuses are equal AND both are the expected value"
  - "Per-run vacuity controls with different shapes for different run kinds: a non-zero TOTAL for an unfiltered run (a file that fails to collect reports zero), at least one PASSED for a filtered run (a pattern matching nothing narrows everything to skip and still exits 0)"
  - "Measure which assertion each mutation fires FIRST, not merely whether the gate goes red — that is what shows the narrow-to-blunt ordering is load-bearing rather than cosmetic"
  - "Probe a precondition's strictness from BOTH sides: rename the constant in the script (fails by name) and rename the fixture (containment grep still matches), so the exactness is justified by a measurement of this file rather than by a rule inherited from a sibling script"

requirements-completed: []

coverage:
  - id: D1
    description: "A shared-Layer Scenario reports the SAME status when its Feature is run whole and when the run is narrowed with `-t` to that Scenario alone — roadmap Phase 10 SC#3's literal clause, 10-CONTEXT.md D-02 (RUN-04, ADR-EC-018)"
    requirement: RUN-04
    verification:
      - kind: e2e
        ref: "bash scripts/verify-shared-layer-once.sh — assertion B2, the clock-isolation Scenario is passed whole AND passed under -t"
        status: pass
      - kind: other
        ref: "mutation m2 — the per-emission `Effect.provide(testEnv)` hoisted; the Scenario FAILS whole and PASSES filtered (exit 0), measured directly and recorded below"
        status: pass
    human_judgment: false
  - id: D2
    description: "The shared Layer's build-once claim holds in a run where the shared Scenario is the ONLY selected test, not just in a whole-file run (RUN-03, roadmap SC#2)"
    requirement: RUN-03
    verification:
      - kind: e2e
        ref: "bash scripts/verify-shared-layer-once.sh — assertion C2, the shared-build Scenario passed as the ONLY selected test"
        status: pass
      - kind: other
        ref: "mutation m3 — shared branch routed through `vitestTestApi`; the gate fires at A2 naming `sharedLayerTestApi`"
        status: pass
    human_judgment: false
  - id: D3
    description: "The gate fails BY NAME on a renamed Scenario title, before any run happens, rather than turning a later status assertion vacuously true (T-10-05-01)"
    verification:
      - kind: other
        ref: "rename probe — `TITLE_CLOCK_SECOND` given a suffix that exists nowhere; the gate exits 1 at the PRECONDITION step, before the preconditions line, output recorded below"
        status: pass
      - kind: other
        ref: "fixture-side probe — the Scenario renamed by appending; containment `grep -cF` on the old title still returns 1 while `title_is_declared` correctly fails"
        status: pass
    human_judgment: false
  - id: D4
    description: "`pnpm verify:shared-layer-once` runs in CI on every push, as a root `package.json` script and never an inline command (T-10-05-04, STATE.md's 01-06 property)"
    verification:
      - kind: other
        ref: "node -e cross-check — 17 of 17 `run:` steps start with `pnpm`, 0 inline commands, 0 pnpm steps naming a script absent from the root manifest"
        status: pass
      - kind: other
        ref: "grep -c 'pnpm verify:shared-layer-once' .github/workflows/check.yml = 1, at line 118 inside the `test` job, after `verify:tags-filter` (line 97), guarded by `if: matrix.node-version == 24`"
        status: pass
    human_judgment: false
  - id: D5
    description: "What the gate adds over `pnpm test` is MEASURED rather than asserted, and the script's METHOD NOTE matches the measurement including the negative result (T-10-05-06)"
    verification:
      - kind: other
        ref: "three mutations m1/m2/m3, each run against both `pnpm test` and the gate and reverted; table recorded below and copied into the script header"
        status: pass
    human_judgment: false
  - id: D6
    description: "The three mutations left `packages/vitest/src/describeFeature.ts` byte-identical to its pre-mutation state"
    verification:
      - kind: other
        ref: "git diff --stat on describeFeature.ts empty after every revert; `pnpm verify:testapi-seam` exit 0; `pnpm test` back to 768 passed | 3 skipped (771)"
        status: pass
    human_judgment: false

# Metrics
duration: 14min
completed: 2026-08-30
status: complete
---

# Phase 10 Plan 05: The real-CLI whole-vs-filtered gate Summary

**Roadmap Phase 10 Success Criterion 3's literal clause — "the Feature yields identical results run whole vs. filtered to a single Scenario" — is now an executable, CI-enforced assertion that invokes the real `vitest` CLI three times and compares one Scenario's reported status across two of them; and the measurement says plainly that no mutation among the plan's three turns this gate red while `pnpm test` stays green, so the gate's header claims no asymmetry it does not have.**

## Performance

- **Duration:** ~14 min
- **Started:** 2026-08-30T01:57:00Z
- **Completed:** 2026-08-30T02:11:00Z
- **Tasks:** 2
- **Files modified:** 3 (1 created, 2 modified)

## Accomplishments

- **The half of D-02 that plans 10-03 and 10-04 both structurally could not supply is now shipped.** Both of their summaries said so by name: an in-process run cannot compare its own whole-run result against a `-t`-filtered one. This script does, and it is the only place in the repo where the `-t` half of SC#3 is exercised at all.
- **ADR-EC-018's own sentence was reproduced in this repo, by measurement.** Under mutation m2 the clock Scenario **failed** in the whole-file run and **passed** under `-t` narrowed to it alone, with the filtered process exiting **0**. The ADR's "a suite that passes run as a whole can fail under `-t` filtering, or vice versa" is one edit away, not hypothetical — and that is what makes B2's equality half necessary rather than decorative.
- **The gate's own justification was measured and came back negative, and it is written down that way.** None of m1, m2, m3 turns this gate red while `pnpm test` stays green. The METHOD NOTE says so in those words and justifies the gate by what it uniquely asserts instead.
- **The plan's own prediction about the title precondition was wrong, and the corrected reason is better.** A containment grep does not make this gate vacuous; it makes it fail with a *confidently misleading* message. Measured both ways.
- **The assertion ORDER was validated rather than assumed:** each mutation's first-firing assertion was recorded, and m1 fires only A5 — the blunt catch-all placed last — because m1 leaks the console, which every shared-Layer-specific assertion here is blind to.

## Task Commits

1. **Task 1: `scripts/verify-shared-layer-once.sh`** — `fb3739b` (test)
2. **Task 2: Wire the gate into `pnpm` and CI, and measure what it adds** — `45de6d4` (chore)

## Files Created/Modified

- `scripts/verify-shared-layer-once.sh` — **created**, 425 lines. Three real `vitest` CLI invocations against `packages/vitest/test/emission.test.ts`, nine assertions plus a precondition block, `fail()`/`run_vitest()`/`report_query()`/`title_is_declared()` copied near-verbatim from `verify-tags-filter.sh`.
- `package.json` — one script entry, `"verify:shared-layer-once": "bash scripts/verify-shared-layer-once.sh"`, beside the other `verify:*` entries. **No dependency added; `pnpm-lock.yaml` untouched** (threat T-10-05-SC).
- `.github/workflows/check.yml` — one step in the `test` job after `verify:tags-filter`, guarded `if: matrix.node-version == 24`, with a comment in that step's voice.

`packages/vitest/src/describeFeature.ts` was mutated three times and reverted three times; `git diff` on it is empty.

## The exact checkmark lines the gate prints on a clean run

```
✓ preconditions: packages/vitest/test/emission.test.ts, node_modules/.bin/vitest, and all four Scenario titles present verbatim
✓ A1 run A vacuity control: 66 test result(s) reported — the file collected
✓ A2 run A: the shared-build Scenario passed — the shared Layer built exactly once for the whole Feature
✓ A3 run A: the clock-isolation Scenario passed after a preceding Scenario advanced the clock — status recorded for the filtered comparison
✓ A4 run A: the Rule-under-shared Scenario passed — a Rule's own tier rebuilds while the Feature's shared tier does not
✓ B1 run B vacuity control: 1 test(s) passed under -t — the filter selected something
✓ B2 THE GATE: the clock-isolation Scenario is "passed" whole AND "passed" under -t — identical results, both passing
✓ C1 run C vacuity control: 1 test(s) passed under -t — the filter selected something
✓ C2 run C: the shared-build Scenario passed as the ONLY selected test — build-once does not depend on its siblings
✓ A5 run A: 0 failed tests — no unrelated in-process regression in packages/vitest/test/emission.test.ts

shared-Layer whole-vs-filtered gate: ENFORCED
```

Exit 0, both as `bash scripts/verify-shared-layer-once.sh` and as `pnpm verify:shared-layer-once`.

## The three-mutation measurement

Every mutation applied to `packages/vitest/src/describeFeature.ts`, run against **both** `pnpm test` and the gate, then reverted. Baseline for comparison: **768 passed | 3 skipped (771)**, 32 files.

| Mutation | `pnpm test` | gate |
|---|---|---|
| **m1** — `excludeTestServices: true` removed from the `layer(...)` call | **RED** — `2 failed \| 766 passed \| 3 skipped (771)`, `Test Files 1 failed \| 31 passed` | **RED** — first failing assertion **A5**, the generic failed-count catch-all. A2, A3, A4, B1, B2, C1, C2 all **passed**. |
| **m2** — the per-emission `Effect.provide(testEnv)` hoisted into the shared tier (`layer(Layer.merge(sharedTier, testEnv), …)`, `sharedIt.effect(name, () => self(), …)`) | **RED** — `5 failed \| 763 passed \| 3 skipped (771)`, `Test Files 1 failed \| 31 passed` | **RED** — first failing assertion **A3**, `the clock-isolation Scenario is "failed" in the whole-file run, expected "passed"` |
| **m3** — the shared branch's `api:` changed to `vitestTestApi(...)` (ARCHITECTURE.md Anti-Pattern 3) | **RED** — `15 failed \| 753 passed \| 3 skipped (771)`, `Test Files 1 failed \| 31 passed` | **RED** — first failing assertion **A2**, `the shared-build Scenario is "failed" in the whole-file run … check that describeFeature.ts's shared branch still emits through sharedLayerTestApi` |

**No mutation among the three turns the gate red while `pnpm test` stays green.** That is the honest result and it is now the METHOD NOTE's own wording. What the gate contributes instead, stated in the same place: it is the only thing in the repo that asserts SC#3's whole-versus-filtered **equivalence** — a claim `pnpm test` never makes in either direction — and the only place the `-t` half is exercised at all.

Three observations the table does not carry on its own, all recorded in the script beside the assertions they concern:

- **m1 fires ONLY the blunt assertion, and that is the ordering earning its place.** m1 leaks the **console**, not the clock — 10-04's mutation iv established this and it reproduced exactly (`the fourth shared clock scenario gets its own test console`, `expected [ Array(1) ] to deeply equal []`). Every shared-Layer-specific assertion in this gate is blind to a console leak, so only A5 fires, and A5's message correctly says *"this is an ordinary in-process failure … `pnpm test` covers it too"* rather than claiming a filtering defect. Had A5 been placed first, m2 and m3 would both have reported that same uninformative message instead of A3's and A2's precise ones.
- **m3's failure count is 15, where 10-03 recorded 7 for the same mutation.** Not a discrepancy: 10-04 added two more blocks over the same shared path. The 7 are still among the 15.
- **m2 is the one that matters for B2**, and it is measured separately below.

## m2 measured separately: ADR-EC-018's sentence, reproduced

With m2 applied, the clock Scenario was run alone under the same `-t` pattern the gate uses:

```
filtered status of the clock Scenario: [ 'passed' ]
filtered passed count: 1 failed: 0
```

…while the whole-file run reports it **failed** (`AssertionError: expected 3600000 to equal +0`). The filtered process **exits 0**.

This is ADR-EC-018's own sentence — *"a suite that passes run as a whole can fail under `-t` filtering (which changes which Scenario runs 'first' against the shared clock), or vice versa"* — reproduced in this repo in one edit. Two consequences worth keeping:

1. **B2's equality half is not redundant.** Under m2, A ≠ B (`failed` vs `passed`), which is precisely what the equality half exists to name. The `passed` half alone would have been *satisfied by the filtered run*.
2. **A developer debugging m2 by narrowing to the failing Scenario gets a green run** and would reasonably conclude the suite is flaky. That is the failure mode this gate converts into a named defect.

In the gate as written, A3 fires before B2 gets a chance under m2 — A3 asserts the whole-run status directly. That is the correct order (A3 gives the more specific diagnosis), and it does not make B2 redundant: B2 is the only assertion that would catch the *reverse* direction the ADR also names, where a Scenario passes whole and fails filtered, which A3 cannot see.

## The rename-precondition probe

**Script-side probe.** `TITLE_CLOCK_SECOND` changed to a title that exists nowhere, gate run, output recorded, reverted:

```
✗ shared-Layer whole-vs-filtered gate: NOT ENFORCED

  no Scenario in packages/vitest/test/emission.test.ts is titled exactly: "the second shared clock scenario
  still starts at time zero RENAME PROBE". This gate asserts on REPORTED titles and COMPARES one across two
  runs, so a rename would otherwise make an assertion vacuous rather than false — two ABSENT statuses are
  equal to each other. Update the title constant at the top of this script to match, and read which criterion
  its comment says it carries before changing anything else. Plans 10-03 and 10-04 record these titles
  verbatim in their summaries and mark them FIXED at the fixture.

EXIT=1
```

It fails **at the precondition step, by name** — no preconditions checkmark line, no vitest invocation at all. Reverted.

**Fixture-side probe, and the finding that corrected the plan's rationale.** The plan (T-10-05-01) predicted that a containment `grep -F` would let a suffix rename through and "turn a later status assertion vacuous". Both halves were measured. The Scenario in `emission.test.ts` was renamed by APPENDING (`… still starts at time zero on a fresh clock`):

- The containment form still matches: `grep -cF -- "Scenario: the second shared clock scenario still starts at time zero"` returns **1**. So the first half of the prediction holds, and it holds *for this file*, not merely by analogy to `verify-tags-filter.sh`.
- `title_is_declared` correctly rejects it and the gate fails by name at the precondition.
- **The second half of the prediction is wrong.** With the precondition weakened to that containment grep and the fixture still renamed, the gate does **not** pass vacuously — it fails at **A3**:

  ```
  ✓ preconditions: … and all four Scenario titles present verbatim
  ✓ A1 run A vacuity control: 66 test result(s) reported — the file collected
  ✓ A2 run A: the shared-build Scenario passed — …
  ✗ shared-Layer whole-vs-filtered gate: NOT ENFORCED
    the clock-isolation Scenario is "ABSENT" in the whole-file run, expected "passed". … A "failed" status
    here is ADR-EC-018's leak reproduced: the shared Layer is carrying ONE memoized TestEnv for the whole
    Feature. …
  ```

  A3 expects `passed`, and ABSENT is not `passed`, so it fires loudly. **What the exactness actually buys here is a correct DIAGNOSIS**: that message sends the reader hunting for a memoized `TestEnv` when the real cause is a rename in the fixture. A confidently wrong failure message is worse than a merely blunt one.

  The real vacuity is one assertion further on and A3 only shields it incidentally: **B2's equality half compares two statuses, and a renamed title makes both runs report ABSENT — ABSENT equals ABSENT.** It is B2's *second* half that would catch it. This is written into the script so nobody later reads A3 as the guard and narrows or reorders it.

All probes reverted; `git diff` on `emission.test.ts` empty.

## The workflow-script cross-check

STATE.md records, from plan 01-06, that every CI step must stay a root `package.json` script — *"a script nobody runs is back to being a convention, the exact problem 01-06 existed to fix"*. Reproduced as a `node -e` cross-check over `check.yml` after the new step was added:

```
run: steps total          = 17
run: steps starting `pnpm`= 17
inline (non-pnpm) commands= 0
pnpm steps naming no root script = 0 []
XCHECK_EXIT=0
```

Every `run:` value in the workflow begins with `pnpm `, there are zero inline commands, and every one of them other than `pnpm install --frozen-lockfile` (the package manager's own verb, not a script) names a script present in the root manifest. The property holds with the new step in place.

## Acceptance criteria

### Task 1

| Criterion | Required | Result |
|---|---|---|
| `bash scripts/verify-shared-layer-once.sh` exit 0, a checkmark per A1-A5, B1, B2, C1, C2 | yes | exit 0, **10** checkmark lines (9 assertions + preconditions) — printed verbatim above |
| `grep -c 'reporter=json'` | ≥ 1 | **1** |
| no glyph used as a MATCH pattern | yes | `grep -nE 'grep[^\|]*[✓×❯]'` returns **NONE**; all 10 glyph occurrences are in `echo` |
| `grep -c 'title_is_declared'` | ≥ 3 | **3** (comment reference, definition, use in the loop) |
| `grep -c 'set -euo pipefail'` | exactly 1 | **1** |
| rename probe fails at the PRECONDITION step by name, then reverted | yes | above — exit 1, before the preconditions line, no vitest invocation |
| `pnpm lint` | exit 0 | exit 0 |

### Task 2

| Criterion | Required | Result |
|---|---|---|
| `node -e` script-entry check | exit 0 | exit 0 |
| `grep -c 'pnpm verify:shared-layer-once' .github/workflows/check.yml` | exactly 1 | **1** |
| step inside `test` job, AFTER `verify:tags-filter`, guarded `if: matrix.node-version == 24` | yes | line **118**; `test` job at 61, `verify:tags-filter` at 97, `package` job at 120; guard at 117 |
| every `pnpm `-prefixed `run:` names a root script — `node -e` cross-check, output recorded | yes | above, exit 0 |
| `pnpm verify:shared-layer-once` | exit 0 | exit 0 |
| `pnpm test` exit 0, count unchanged from 10-04 | yes | **768 passed \| 3 skipped (771)**, 32 files — identical to 10-04-SUMMARY's closing count |
| `pnpm lint` | exit 0 | exit 0 |
| three-row mutation table with `pnpm test` and gate columns, each cell red/green plus first failing assertion; METHOD NOTE matches | yes | table above; the script header carries the same three rows and the same negative conclusion |

Additional gates run for good measure: `pnpm verify:testapi-seam` exit 0 (confirms `describeFeature.ts` fully reverted after three mutations) and `pnpm verify:tags-filter` exit 0 (the sibling gate over the same file is unaffected).

## Decisions Made

See the `key-decisions` frontmatter. The two a reader of 10-06 needs:

- **The gate has no measured asymmetry with `pnpm test`, and its header says so.** 10-06 should not describe it as catching something the suite misses. Its contribution is that it asserts SC#3's equivalence clause at all, and is the only place `-t` filtering is exercised.
- **ADR-EC-018's "passes whole, fails filtered" sentence is now reproducible in this repo in one edit**, with the whole-run and filtered statuses recorded above. When 10-06 updates the ADR's prose (10-04 already asked it to record that the fix has two halves guarding two different services), this measurement is the concrete evidence for the symptom half.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The METHOD NOTE was first drafted with PREDICTED mutation numbers, before any mutation ran**

- **Found during:** Task 1
- **Issue:** The script's header was written with a three-row m1/m2/m3 table asserting specific failure counts and first-firing assertions, none of which had been measured. Task 1 is not where that measurement happens, and committing it would have been the "says something that isn't true" defect AGENTS.md §4 forbids — read as evidence by the next person. 10-03's deviation 3 and 10-04's deviation 4 are the same finding in the two preceding plans, so this is the third occurrence of one failure mode.
- **Fix:** Replaced the predicted table, before the Task 1 commit, with an explicit statement that the measurement is Task 2's and that the header *deliberately claims no asymmetry* until then. Task 2 then wrote the observed table in.
- **Files modified:** `scripts/verify-shared-layer-once.sh`
- **Verification:** every figure in the committed header is copied from a recorded run; the Task 1 commit contains no measurement claim at all.
- **Committed in:** `fb3739b` (the honest interim note) and `45de6d4` (the measured replacement).

**2. [Rule 1 - Bug] T-10-05-01's stated rationale for the exact title precondition does not hold for this gate**

- **Found during:** Task 1
- **Issue:** The threat register says a containment grep "passes a suffix rename and turns a later status assertion vacuous". Measured against this gate, it does not: A3 asserts `passed`, and a renamed Scenario reports ABSENT, so the gate fails loudly. Writing the inherited rationale into the script would have made the comment say something untrue about the code beneath it — the same class of defect as deviation 1, one level down.
- **Fix:** Ran the fixture-side probe with the precondition weakened, recorded which assertion fired and with what message, and wrote the corrected reason into the script: the exactness buys a **correct diagnosis** rather than a non-vacuous one. The genuine vacuity (B2's equality half, ABSENT == ABSENT) is stated separately, with an explicit warning not to read A3 as its guard.
- **Files modified:** `scripts/verify-shared-layer-once.sh`
- **Verification:** both probes recorded verbatim above; the precondition itself is unchanged and still exact.
- **Committed in:** `fb3739b`.

**3. [Rule 3 - Blocking] The plan's `<execution_context>` paths do not exist on this machine**

- **Found during:** setup
- **Issue:** the plan references `@$HOME/.claude/get-shit-done/workflows/execute-plan.md` and `.../templates/summary.md`; the installed runtime is at `$HOME/.claude/gsd-core/`.
- **Fix:** read the equivalents under `gsd-core/`. No behavioral difference — this summary follows that template's structure and frontmatter.
- **Files modified:** none.
- **Verification:** n/a.
- **Committed in:** n/a — recorded here.

---

**Total deviations:** 3 auto-fixed (2 bug/truthfulness, 1 blocking; 0 architectural)
**Impact on plan:** No scope creep. Deviations 1 and 2 both corrected comment text to match measurements rather than predictions — which is what the plan's own Task 2 instruction ("do not manufacture an asymmetry that the measurement does not show") asks for, applied one level further than the plan anticipated. Deviation 3 changed no file. `spec/` is untouched, deliberately — see `key-decisions`. **No package installed, no dependency added, `pnpm-lock.yaml` unmodified** (threat T-10-05-SC).

## Issues Encountered

- **`node_modules` needed restoring in this fresh worktree** — `pnpm install --frozen-lockfile`, as in 10-03 and 10-04. No manifest changed, `pnpm-lock.yaml` untouched, `git status --short` empty afterwards; the baseline `pnpm test` then reported 768 passed | 3 skipped (771), matching 10-04-SUMMARY's recorded closing count exactly, which independently confirms the install reproduced the intended dependency set. Rule 3's package-manager carve-out does not apply: no package name was chosen, substituted or added.
- **Two of the plan's own predictions were wrong** (the containment-grep vacuity, and the implicit expectation that some mutation would show an asymmetry). Both were measured, both are recorded as measured, and both make the artifact more honest rather than less useful. This is now the third consecutive plan in this phase where a prediction written before a mutation ran turned out wrong — the pattern is worth naming rather than re-discovering.

## User Setup Required

None — no external service configuration required. This plan installs no package and adds no dependency to any manifest; the new `package.json` entry is a script, `pnpm-lock.yaml` is untouched and `pnpm install --frozen-lockfile` in CI is unaffected (threat T-10-05-SC).

## Next Phase Readiness

**Ready for 10-06.** 10-CONTEXT.md's D-02 is closed in both halves: the in-process assertions (10-03, 10-04) and the real-CLI equivalence gate (this plan). Roadmap Phase 10 Success Criteria 1, 2 and 3 all have committed, CI-enforced proofs.

What remains, and who owns it:

- **10-06 owns the status flips.** RUN-03 and RUN-04 are still Pending in `.planning/REQUIREMENTS.md`; `spec/invariants.md`'s INV-EC-002 entry still says its `shared` clause "waits on Phase 10", and `spec/roadmap.md` still governs build status. This plan deliberately edited none of them.
- **10-06 should record ADR-EC-018's symptom half as reproducible**, with the m2 measurement above as the evidence, alongside 10-04's request that the ADR stop reading as one mechanical change when it is two halves guarding two different services.

Constraints later plans must respect:

- **The four Scenario titles in `scripts/verify-shared-layer-once.sh` are load-bearing in two files.** Rename in both places or not at all. The precondition fails by name, so a rename cannot go silent — but it will fail the CI gate.
- **Do not "simplify" B2 to a single check.** Equality alone is satisfied by two failing runs; `passed` alone is satisfied by the exact divergence ADR-EC-018 names, and m2 shows that divergence is one edit away.
- **Do not move A5 earlier.** It is the one assertion any unrelated in-process regression trips, and m1 is the measured demonstration: placed first, it would have preempted A3's and A2's precise diagnoses under m2 and m3.
- **Do not weaken `title_is_declared` to a containment `grep -F`.** Measured: it still matches a suffix-renamed fixture, and the gate then fails with a message naming the wrong defect.
- **Do not claim in the header that this gate catches something `pnpm test` misses.** It was measured and it does not, among the three mutations tried. If a future mutation shows otherwise, cite it and delete the paragraph that says so — the script's own header gives that instruction.

## Self-Check: PASSED

- `scripts/verify-shared-layer-once.sh` verified present on disk (425 lines) and executable via both `bash` and `pnpm`.
- `.planning/phases/10-layer-scopes-per-scenario-default-shared/10-05-SUMMARY.md` verified present on disk.
- Both commit hashes (`fb3739b`, `45de6d4`) verified present in `git log`.
- `packages/vitest/src/describeFeature.ts` verified byte-identical to its pre-mutation state — `git diff --stat` empty after m1, m2 and m3; `pnpm verify:testapi-seam` exit 0.
- `packages/vitest/test/emission.test.ts` verified byte-identical after the fixture-side rename probe — `git diff` empty.
- No file deleted by either commit (`git diff --diff-filter=D` empty across `HEAD~2..HEAD`).
- `STATE.md` and `ROADMAP.md` not modified — the orchestrator owns those writes.

---
*Phase: 10-layer-scopes-per-scenario-default-shared*
*Completed: 2026-08-30*

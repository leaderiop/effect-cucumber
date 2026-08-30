---
phase: 11-composition-root-and-dogfooded-acceptance-suite
plan: "05"
subsystem: acceptance-suite
tags: [acceptance, dogfooding, hooks, structural-gate, mutation-testing, traceability, ci]
status: complete

requires:
  - "11-01's acceptance directory, its README conventions, and the derived tag universe in vitest.config.ts"
  - "11-02/03/04's established pair shape (relative describeFeature import, gherkin-package loadFeature, top-level await, assert-not-expect, Ref-through-a-service state)"
  - "BEH-EC-017's six-hook ordering, and Runner.test.ts's in-process full-sequence proof at the TestApi seam"
  - "scripts/verify-no-runner-dep.sh as the canonical structural-grep gate shape"
provides:
  - "packages/vitest/test/acceptance/hooks.{feature,steps.test.ts} — the fifth acceptance pair, and the only one whose subject is the runner's own bracketing"
  - "scripts/verify-acceptance-ref-state.sh — INV-EC-006's FIRST automated enforcement anywhere in the repository (roadmap SC#2)"
  - "scripts/verify-acceptance-no-any.sh — INV-EC-003's boundary condition enforced over the acceptance suite (D-04b)"
  - "Root package.json scripts verify:acceptance-ref-state and verify:acceptance-no-any, and both as CI steps in check.yml's package job"
  - "spec/traceability.md section 5 row for REQ-EC-016 (17 of 22 now carried) and a section 2 row for INV-EC-006 that no longer reads 'None yet'"
  - "A measured finding that a Feature registering AfterAllScenarios emits a THIRD test node, so the pair reports 3 tests and not 2"
affects:
  - "spec/invariants.md INV-EC-006 — its Source line no longer says 'no automated enforcement yet'"
  - "spec/traceability.md sections 2 and 5 — every section 2 row now names a real mechanism"
  - ".github/workflows/check.yml package job — two new steps between verify:testapi-seam and verify:spec"

tech-stack:
  added: []
  patterns:
    - "A structural gate carries TWO positive controls, not one: a POPULATION control (at least five matched files) and a REGEX control (a named source file known to contain the pattern). Neither substitutes for the other, and mutations B and C measure both directions"
    - "A gate's METHOD NOTE states what it does NOT catch, in its own section, so a green run is not read as a stronger claim than it is"
    - "A hook-ordering claim is asserted as the WHOLE log against the WHOLE expected array, never a suffix or a membership check — an arrangement with every pairwise ordering right and the interleaving wrong passes every narrower projection"
    - "The expected sequence lives in the .feature file, so changing it turns the Scenario red without the step module being touched"
    - "The shared Layer tier is chosen when the claim spans a Scenario boundary, and the reason is written into the module doc comment because it is the one file where that choice is not itself the subject"

key-files:
  created:
    - packages/vitest/test/acceptance/hooks.feature
    - packages/vitest/test/acceptance/hooks.steps.test.ts
    - scripts/verify-acceptance-ref-state.sh
    - scripts/verify-acceptance-no-any.sh
  modified:
    - package.json
    - .github/workflows/check.yml
    - spec/traceability.md
    - spec/invariants.md

decisions:
  - "The REQ-EC-016 section 5 row landed in task 1's commit, with the tag it traces, rather than in task 3. AGENTS.md section 1 requires a change and its spec reflection in the same commit. Unlike 11-04 this was NOT forced by a red gate — verify:spec stayed green throughout, because check 4 is satisfied by REQ-EC-016 being MENTIONED in the section 5 preamble's not-yet-carried sentence. The convention was followed on its own merits, and the gate's weakness is confirmed a third time."
  - "The spec/invariants.md and spec/traceability.md section 2 updates for INV-EC-006 landed in task 2's commit, with the gate that changes the fact. The plan did not schedule them; leaving 'no automated enforcement yet' in place after shipping the enforcement would have made the spec false in the same commit that made it obsolete."
  - "The ref-state gate carries a FOURTH assertion the plan did not ask for — no in-place array mutator in an acceptance step module. It is the only greppable form of PROH-11-03's module-scope const holder, which a declaration-shaped regex structurally cannot see. The METHOD NOTE states plainly that this covers the common write and not the general case, rather than letting a green run imply more."
  - "Both Scenarios assert the exactly-once count, not just the second. In the first Scenario it is a control that makes the second one's `1` a measurement; mutation G is the proof, since it leaves the first Scenario legitimately green."
  - "Mutation G was measured a second time (G2) with the array assertion deleted, to show the count assertion catches the defect ALONE. Falsifying an assertion and showing it is load-bearing are different measurements — 11-04's E1/E2 lesson applied deliberately."

metrics:
  duration: ~35m
  completed: 2026-08-30

actuals:
  tokens: 35100
  tasks: 3
  commits: 3
---

# Phase 11 Plan 05: Hooks Acceptance Pair and the Two Structural Gates Summary

DSL-07 is traced to a running acceptance Feature that registers all six hook kinds and asserts their
full ordering across two Scenarios, and **INV-EC-006 has automated enforcement for the first time
anywhere in this repository**. Section 5 carries **seventeen of twenty-two** rows, and every row in
section 2 now names a real mechanism — no **Test** column reads "None yet". The suite went 793 → 796
passed across 36 → 37 files, with nothing lost.

## What was built

**`hooks.feature`** — two Scenarios of two steps each, `@REQ-EC-016` on the first and nothing on the
second (D-01: the second is evidence for the same claim, not a claim of its own). Each Scenario
carries its OWN full expected hook sequence as a Gherkin `{string}`, so the expectation is data the
parser delivered rather than a constant the step module holds.

**`hooks.steps.test.ts`** — all six hook kinds registered from one `define` callback as bare
generator functions taking no arguments, each appending its kind's name to a `Ref`. The final step of
each Scenario compares the WHOLE log to the WHOLE expected array with `deepStrictEqual`, and
separately asserts that `BeforeAllScenarios` occurs exactly once. `HookLog` lives in the **shared**
tier with `perScenario: Layer.empty` beside it, and the module doc comment says why at length: a
per-Scenario `Ref` starts empty in the second Scenario, which makes the cross-Scenario half of the
claim unstateable. This is the one acceptance module whose Layer choice is made for a reason other
than dogfooding that choice.

**`scripts/verify-acceptance-ref-state.sh`** — four assertions: a population control (≥5 step
modules), a regex control (`packages/vitest/src/Runner.ts`'s real mutable bindings), the gate itself
(no `let`/`var` in any acceptance step module, comment lines stripped first), and a fourth the plan
did not ask for (no in-place array mutator — the only greppable form of PROH-11-03's module-scope
`const` holder).

**`scripts/verify-acceptance-no-any.sh`** — the same shape for D-04b, scanning the step modules AND
the `.feature` files, matching the escape-hatch type as a standalone token with non-identifier
boundaries so ordinary English words are not counted.

**`package.json` + `.github/workflows/check.yml`** — both gates as `verify:*` scripts that run
locally, and both as `package`-job steps between `verify:testapi-seam` and `verify:spec`, each behind
a comment naming what a green `pnpm test` does not prove. STATE.md's Phase 01-06 rule: a gate script
with no CI step is back to being a convention.

## The thing the plan got wrong, and it is a good finding

**The pair emits THREE tests, not two.** The plan's task-1 acceptance criterion says "exactly 2
passing tests from `hooks.steps.test.ts`", and that criterion contradicts the same task's requirement
to register all six hook kinds: registering `AfterAllScenarios` makes the runner emit a third node,
`⚙ AfterAllScenarios`, whose pass status IS its body having succeeded.

That turns a "what this pair cannot state" bullet into a weaker but real claim. The plan told the
module to record `AfterAllScenarios` as unstateable; what is actually unstateable is its POSITION,
because no step body can be running when a node emitted after every Scenario fires. That it RAN is
observable, as a third green test. The doc comment now says exactly that, and names
`Runner.test.ts` for the position and `emission.test.ts` for the executed-for-real proof and the
all-skipped suppression carve-out.

## Mutation Record

Six performed, run, then reverted; `git status --porcelain` was empty before the task-3 commit was
staged. Full detail lives beside the code each one attacks — A and D in the step module's doc
comment, B, C, E and E2 in the METHOD NOTE of the script they attack.

| #  | Mutation                                                              | Went RED                                            | Stayed GREEN                                                       |
| -- | --------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------ |
| A  | `let mutationProbeCount = 0` at an acceptance module's module scope   | **ref-state gate** at `hooks.steps.test.ts:183`     | `pnpm test` (37/796), `pnpm lint`, `pnpm build`, `pnpm typecheck:test` |
| B1 | `ACCEPTANCE_DIR` → a directory that does not exist                    | the `[[ -d ]]` **precondition**, by name            | assertion 1 never ran                                              |
| B2 | `ACCEPTANCE_DIR` → `packages/vitest/test/fixtures` (exists, 0 matches) | **assertion 1**, "found 0 file(s) … expected at least 5" | everything downstream would have passed vacuously             |
| C1 | `DECLARATION_RE` → a never-matching pattern                           | **assertion 2**, the regex control, by name         | assertion 1                                                        |
| C2 | C1 **with assertion 2 deleted**                                       | **nothing — the gate printed ENFORCED**             | everything. This is the entry that matters                         |
| D  | the escape-hatch type in a step body's parameter annotation           | **no-any gate** at `hooks.steps.test.ts:242`        | `pnpm build`, `pnpm typecheck:test`, `pnpm test`, `pnpm lint`      |
| E  | the token as prose in a TypeScript comment line                       | nothing — **the gate stayed green**, as intended    | everything                                                         |
| E2 | a Gherkin `#` comment AND a Scenario title, in ONE run                | **only the Scenario title**, `hooks.feature:9`      | the `#` comment line                                               |
| F  | `AfterStep`/`BeforeStep` transposed in the second expected string     | **1 of 3** — arrays first differ at index 4         | the first Scenario and the `⚙ AfterAllScenarios` node              |
| G  | `BeforeAllScenarios` appended per Scenario instead of once            | **1 of 3 — the SECOND Scenario**, 15 entries vs 14  | the FIRST Scenario, correctly                                      |
| G2 | G re-run with the array assertion DELETED                             | still red — `expected 2 to equal 1`                 | —                                                                  |

Five entries are worth more than their row:

**A is the whole justification for the ref-state gate, and `pnpm lint` is the sharpest line in it.**
Four commands stayed green against a defect INV-EC-006 exists to forbid. It is tempting to assume the
linter would have caught a module-scope `let`; it did not, because no oxlint rule enabled here objects
to one. The linter never was the missing enforcement, and the record says so rather than implying it.

**B had to be measured twice, and the plan's expectation was slightly wrong.** The plan predicted
assertion 1 would fire for a nonexistent directory. It does not — the `[[ -d ]]` precondition fires
first and assertion 1 never runs. The arm that actually exercises the population control is a
directory that EXISTS with its contents renamed, or whose pairs acquired the wrong suffix, which is
also the more likely real-world failure. Both arms are recorded, and only B2 is cited as the
population control's proof.

**C2 is this plan's E2.** With the regex control deleted and the pattern dead, the gate prints its
ENFORCED line while being structurally incapable of finding a violation. Assertion 1 was green in
both arms, because every file was where it should be — so the population control cannot substitute
for the regex control, and the script says not to "simplify" one away as redundant with the other.

**E2 states both halves in one run.** A Gherkin `#` comment naming the token was stripped and a
Scenario title on the very next line was reported. E alone could not have said the second thing: a
scan that reached no `.feature` file at all would also have stayed green.

**G2 is the load-bearing measurement, not G.** G shows the count assertion's defect makes something
red; G2 shows the count assertion catches it ALONE, with the array comparison removed. Under
unmutated G the array assertion reports first only because it is written first. This is 11-04's
E1/E2 lesson applied on purpose rather than rediscovered.

## Verification

| Gate                              | Result                                                                 |
| --------------------------------- | ---------------------------------------------------------------------- |
| `pnpm test`                       | 37 files, 796 passed, 4 skipped (baseline 36 / 793 / 4 — +1 file, +3 passed, none lost) |
| This pair                         | 3 passed: 2 Scenarios + the `⚙ AfterAllScenarios` node                 |
| `pnpm verify:acceptance-ref-state` | ENFORCED — 5 modules, 3 control hits, 0 violations                    |
| `pnpm verify:acceptance-no-any`   | ENFORCED — 5 modules, 3 control hits, 0 violations                     |
| `pnpm verify:spec`                | PASS 8, FAIL 0, SKIP 0 — 279 links resolve                             |
| `pnpm lint`                       | exit 0 (oxlint + dprint check)                                         |
| `pnpm typecheck:test`             | exit 0                                                                 |
| `pnpm build`                      | exit 0                                                                 |
| `pnpm circular`                   | no circular dependency                                                 |
| `pnpm verify:tsgo-gate`           | ENFORCED                                                               |
| `pnpm verify:shared-layer-once`   | ENFORCED                                                               |
| `pnpm verify:tags-filter`         | ENFORCED                                                               |
| `pnpm verify:no-runner-dep`       | ENFORCED                                                               |
| `pnpm verify:testapi-seam`        | ENFORCED                                                               |
| `pnpm verify:oxlint-plugin`       | ENFORCED                                                               |
| `git status --porcelain`          | clean; all six mutations reverted                                      |

Plan-specific criteria, checked mechanically: `hooks.feature` carries exactly one `@REQ-EC-` tag and
it is `@REQ-EC-016`; all six `dsl.<Kind>(` registrations are present at lines 200–224; section 5 has
exactly 17 rows in ascending order; both new `package.json` entries invoke `bash scripts/…`; both new
CI steps exist and neither adds an inline command; `let`/`var` and the standalone escape-hatch token
each match 0 times in the new module after comment stripping.

## Deviations from Plan

### Rule 1 — "exactly 2 passing tests" is unsatisfiable while registering all six hooks

Task 1's acceptance criterion contradicts task 1's own action. Registering `AfterAllScenarios` makes
the runner emit an `⚙ AfterAllScenarios` node, so the file reports 3. Measured with
`--reporter=verbose` rather than reasoned about. The criterion's intent — that the pair's collected
COUNT is asserted rather than its exit code, this directory's standing rule — holds: 3 is the number,
it is stated in the module doc comment and in this summary, and mutations F and G both cite it.

### Rule 2 — a fourth assertion the plan did not specify

The plan's assertion 3 is a declaration-shaped regex, and PROH-11-03's module-scope `const` holder is
structurally invisible to one, because the declaration is a `const`. Left as specified, the gate
would have been read as covering PROH-11-03 while covering only half of it. Added assertion 4 (no
in-place array mutator in an acceptance step module — the only greppable form of the WRITE), and a
"WHAT THIS GATE DOES NOT CATCH" section in the METHOD NOTE saying plainly that the general case
remains a review rule. AGENTS.md §4: say only what is true.

### Rule 2 — the spec's own INV-EC-006 text had to change with the gate

The plan scheduled no edit to `spec/invariants.md` or to `spec/traceability.md` §2, but INV-EC-006's
**Source** line read "no automated enforcement yet" and §2's row read "None yet — candidate lint
rule". Shipping the enforcement in the same commit that leaves those sentences standing makes the
spec false, which AGENTS.md §1 forbids. Both are updated in task 2's commit, and both state the
enforcement's SCOPE — the acceptance suite, not a consumer's own step modules, for which the
candidate lint rule in `spec/roadmap.md` § Planned remains the mechanism.

### Rule 3 — the section 5 row landed with its tag, not three tasks later

Same resolution as 11-04, different reason. There the gate went red; here `pnpm verify:spec` stayed
green throughout, because `verify-traceability.sh` check 4 is satisfied by `REQ-EC-016` being
MENTIONED longhand in the §5 preamble's not-yet-carried sentence — which it was. The row was written
in task 1's commit anyway, on AGENTS.md §1's merits. **That weakness is now recorded three times**
(11-03, 11-04, here), in all three directions: a tag passing on a prose mention, two tags of a
five-tag change failing only because the preamble wrote ranges, and now a tag passing because the
preamble happened to list it as NOT YET CARRIED. Whichever plan owns that script should require an
actual table row.

### Rule 3 — the worktree had no `node_modules`

Fresh worktree; resolved with `pnpm install --frozen-lockfile`. `pnpm-lock.yaml` unmodified, no
package added, so no package-legitimacy checkpoint applied. Fourth consecutive plan to hit this.

### TDD gate sequence

Task 1 is marked `tdd="true"`. RED was observed and recorded rather than committed, matching 11-01
through 11-04: the pair on disk with `describeFeature(feature, { shared: HookLog.layer, perScenario:
Layer.empty }, () => {})` and no registrations → **2 failed**, both `StepMatchError … UndefinedStep`,
both naming `hooks.feature` and the line. GREEN is `956b3e4`. A `test(...)` commit ahead of it would
have committed a state that cannot pass by construction, since a `.feature` file and its step module
are one working state split across two files.

### Not done, deliberately

`.planning/STATE.md`, `.planning/ROADMAP.md` and `.planning/REQUIREMENTS.md` are untouched — this ran
as a parallel worktree agent and the orchestrator owns shared-file writes. RUN-06 stays `Pending` in
`REQUIREMENTS.md` by convention even though its structural proof
(`scripts/verify-acceptance-ref-state.sh`) landed here; the closing plan marks it.

## Assumptions

**ASSUMPTION-11-A (adjacency) resolved again** — fifth `Context.Service` tag id in the directory
(`HookLog`, joining four `World`s), no collision.

**ASSUMPTION-11-B (empty / single-element) resolved, and sharpened.** The plan flagged that a gate
scanning zero files passes vacuously and asked for a positive control. Mutation B measured it and
split it in two: a MOVED directory trips the `[[ -d ]]` precondition, and only a directory that still
exists with its contents renamed reaches the population control. The plan's mitigation is correct;
its predicted failure path was not the one that fires. The residual maintenance coupling the plan
knowingly accepted is real and now named in both scripts: each regex control depends on a specific
file continuing to contain its pattern, and each says by name what to do when that stops being true.

**ASSUMPTION-11-C (ordering) held.** The two Scenarios of `hooks.feature` execute in declaration
order, which the entire second expected array depends on. Mutation G is the incidental evidence: the
15-vs-14 mismatch is only produced by Scenario 1 having run first.

## Notes for Future Plans

- **A Feature that registers `AfterAllScenarios` emits one more test node than it has Scenarios.**
  Any future acceptance pair asserting its collected COUNT has to account for the `⚙
  AfterAllScenarios` node. It is not a warning and not a Scenario; it is a real passing test whose
  body is the teardown hook.
- **Two positive controls, not one.** Mutations B2 and C2 are the measurement: a population control
  cannot see a dead pattern and a regex control cannot see an empty directory. Every future
  structural gate in this repo should carry both, and neither should be dropped as redundant.
- **Measure the DELETION of a control, not only its falsification.** C1 shows the regex control can
  fail; C2 shows the gate is vacuous without it. Only C2 answers "is this control load-bearing" — the
  same distinction 11-04 drew with E1/E2, and G2 draws again for the exactly-once assertion.
- **Section 5 carries seventeen of 22, and what remains is homogeneous.** `REQ-EC-003`, `REQ-EC-007`,
  `REQ-EC-008`, `REQ-EC-009` and `REQ-EC-018` — all five "fails loudly", all needing plan 11-06's
  starved-fixture-plus-wrapper arrangement. There is no green-Scenario requirement left.
- **Section 2 has no gaps left.** Every invariant row names a real mechanism. The next plan that
  weakens one should have to delete a script to do it.
- **`MIN_STEP_MODULES` is 5 in two scripts and must be raised together.** A sixth pair that does not
  raise both leaves both gates covering less than they claim, silently. That is the maintenance cost
  of a population control and it is worth paying, but it is a real one.

## Known Stubs

None. Every assertion in the new pair compares a value the runner produced, and mutations A, D, F, G
and G2 each turn a different subset of the artifacts red. Both gate scripts are proven non-vacuous
against a real violation, a renamed directory and a broken regex.

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or trust-boundary schema changes.
The one new file read is a committed fixture resolved relative to `import.meta.url`.

All five registered threats have a measured mitigation:

| Threat                                                | Mitigation, measured                                                                                   |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| T-11-05-01 (a structural gate scanning nothing)       | Assertion 1 in each script; mutation B2 fires it with a real-but-wrong directory, B1 records that a missing one trips the precondition instead |
| T-11-05-02 (a structural gate with a broken regex)    | Assertion 2 in each script; C1 fires it, C2 shows the gate prints ENFORCED once the control is deleted |
| T-11-05-03 (the escape-hatch type in a step body)     | `verify-acceptance-no-any.sh` assertion 3; mutation D turns it red while build, typecheck, test and lint all stay green |
| T-11-05-04 (a gate that forbids its own documentation) | Comment stripping in both scripts; E stays green with the token in a TS comment, E2 stays green on a Gherkin `#` line while catching the Scenario title beside it |
| T-11-05-05 (a gate that exists but never runs)        | Both are `package`-job steps in `check.yml`, each a root `package.json` script that also runs locally; asserted by grepping the workflow (lines 159 and 170) |

## Self-Check: PASSED

Files verified present on disk:

- FOUND: `packages/vitest/test/acceptance/hooks.feature`
- FOUND: `packages/vitest/test/acceptance/hooks.steps.test.ts`
- FOUND: `scripts/verify-acceptance-ref-state.sh`
- FOUND: `scripts/verify-acceptance-no-any.sh`
- FOUND: `package.json` (both `verify:acceptance-*` entries)
- FOUND: `.github/workflows/check.yml` (both steps)
- FOUND: `spec/traceability.md` (17 section 5 rows, INV-EC-006 section 2 row rewritten)
- FOUND: `spec/invariants.md`

Commits verified in `git log`:

- FOUND: `956b3e4` feat(11-05): assert the full six-hook ordering from a real Feature
- FOUND: `57ee730` feat(11-05): enforce INV-EC-006 and INV-EC-003's boundary structurally
- FOUND: `9c4a780` docs(11-05): record both gates' mutations and close the DSL-07 gap

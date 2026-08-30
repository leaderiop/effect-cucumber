---
phase: 11-composition-root-and-dogfooded-acceptance-suite
plan: "06"
subsystem: acceptance-suite
tags: [acceptance, traceability, negative-testing, starved-fixtures, mutation-testing, ci, requirements]
status: complete

requires:
  - "11-01's acceptance directory, its README conventions, and the derived tag universe in vitest.config.ts"
  - "11-02/03/04/05's established pair shape and the seventeen section 5 rows already carried"
  - "ADR-EC-019's fail-loudly split — StepMatchError as a failure, UnusedStepDefinitionWarning as a warning"
  - "scripts/verify-tsgo-gate.sh's committed satisfied/starved flip pair as the D-02 template"
provides:
  - "packages/vitest/test/acceptance/negative/ — five starved .feature fixtures and a README, the first acceptance fixtures in the repository with no .steps.test.ts partner"
  - "packages/vitest/test/acceptance/negative-requirements.test.ts — six tests carrying the five fails-loudly requirements from real tagged fixtures"
  - "spec/scripts/verify-traceability.sh check 5 — the FIRST check anywhere here that asserts completeness, exactly-once occurrence, and a real section 5 ROW"
  - "spec/traceability.md section 5 complete at 22 rows, with a trailing exclusion note for the starved fixtures"
  - "pnpm verify:spec printing 22/22 as a derived count — roadmap Phase 11 success criterion 3, made mechanical"
affects:
  - "spec/scripts/verify-traceability.sh — a new check between 4 and the link check, which is renumbered 5 -> 6; PASS count 8 -> 9"
  - "spec/traceability.md section 5 — the not-yet-carried list is gone; the preamble now cites the script rather than asserting the count itself"
  - "any future phase adding a 23rd requirement — EXPECTED_REQ_COUNT must change in the same commit or CI goes red, by design"

tech-stack:
  added: []
  patterns:
    - "A starved fixture is the tagged artifact and the wrapper is the evidence: the tag sits on a deliberately-failing .feature that no runner ever sees, and a wrapper drives it and asserts the named error. A committed pair, so there is no mutable working tree and the flip re-runs in CI"
    - "The two-check rule at run time: every assertion narrows on the error CLASS and on its reason tag. Asserting only that something failed is green against a fixture failing for an unrelated reason, and mutation A is that measurement rather than that argument"
    - "A grep-based traceability check must match a TABLE ROW, not a substring. An id mentioned in prose satisfies a whole-file grep, including a sentence listing it as NOT YET CARRIED"
    - "Separate assertions where a defect can hide behind a shared one: the RUN-02 block keeps exit-is-a-failure, error-identity and After-ran apart, because mutation D reddens only the third"
    - "State can leave module scope entirely when the entry point allows it: collectFeature has no module-scope requirement, so the Ref is built inside the test body and handed to Layer.succeed — no mutable holder of any kind"

key-files:
  created:
    - packages/vitest/test/acceptance/negative/background-placeholder.feature
    - packages/vitest/test/acceptance/negative/unmatched-step.feature
    - packages/vitest/test/acceptance/negative/ambiguous-step.feature
    - packages/vitest/test/acceptance/negative/unused-pattern.feature
    - packages/vitest/test/acceptance/negative/after-on-failure.feature
    - packages/vitest/test/acceptance/negative/README.md
    - packages/vitest/test/acceptance/negative-requirements.test.ts
  modified:
    - spec/scripts/verify-traceability.sh
    - spec/traceability.md

decisions:
  - "The plan's task-1 criterion — that verify:spec FAILS on check 4 once the five tags land, and that the red gate IS the proof the repo-wide grep reaches the new subdirectory — is unsatisfiable. Check 4 stayed PASS, because section 5's preamble already listed all five ids longhand in its not-yet-carried sentence and check 4 greps the whole file. The proof was taken directly and sharpened into a measurement instead: with the five ids substituted out of traceability.md, check 4 went FAIL naming exactly them. One run, both halves — the grep reaches the subdirectory, and only a prose mention was holding it green."
  - "Check 5 matches an id as the FIRST CELL OF A ROW in section 5, not as a substring of the file. The prior wave flagged check 4's weakness as the thing this plan must not repeat, and a whole-file grep would have repeated it exactly. Measured before the rows landed: check 4 PASS, check 5 RED naming all five ids as tagged-but-unrowed."
  - "MATCH-03 and MATCH-04 are asserted off collection.plan, not off a failed Effect. The plan described collectFeature as producing a StepMatchError; it never fails at all — ADR-EC-019 makes an unmatched or ambiguous step an Unresolved planned step so ONE Scenario fails and the rest of the Feature runs. The library was not reshaped to match the plan's description of it."
  - "The MATCH-04 order claim was weakened to the honest one. matchedPatterns is ordered by definition site (06-CONTEXT.md D-03), and transposing two registrations transposes their line numbers, so the SEQUENCE is not literally registration-order-independent. The CONTENT is, and the content is what the requirement is about — a first-wins resolver would report one pattern. Asserted by collecting the same fixture twice with the registrations swapped."
  - "Mutations B and C were held OUT of task 2's commit and landed with check 5 in task 3, because they attack a check that did not exist yet. Recording a measurement before taking it is what AGENTS.md section 4 forbids; the doc comment said so explicitly in the interim rather than leaving a gap."
  - "Imports reach concrete modules by relative path — ../../src/Errors.ts, not the barrel. The plan asked for the barrel and its own acceptance criterion forbids it in the same breath; oxlint's checkRelativeIndexImports settles it. The class object is identical, so the match-on-the-class requirement is met exactly."

metrics:
  duration: ~50m
  completed: 2026-08-30

actuals:
  tokens: 34800
  tasks: 3
  commits: 3
---

# Phase 11 Plan 06: Starved Fixtures and the 22/22 Traceability Check Summary

The five "fails loudly" requirements — PARSE-03, MATCH-03, MATCH-04, MATCH-05 and RUN-02 — are traced to real tagged
`.feature` files for the first time, and **`pnpm verify:spec` now prints `22/22` as a count it derives rather than a
claim a reader has to trust**. Section 5 is complete at twenty-two rows. The suite went 796 → 802 passed across 37 → 38
files, with nothing lost, and no starved fixture is emitted as a test.

## What was built

**Five starved fixtures under `packages/vitest/test/acceptance/negative/`**, each named for the reason it fails and each
carrying exactly one `@REQ-EC-NNN` tag on exactly one Scenario. None is handed to `describeFeature`; none produces a
test; none is expected to be green. This is D-02's satisfied/starved arrangement lifted from `verify-tsgo-gate.sh` one
level up, from compile time to run time — a committed **pair**, so there is no mutable working tree, no cleanup path
that can leave the repository dirty, and the flip is re-proven on every CI run.

**Their README**, which states the one convention this subdirectory does NOT inherit from its parent: these files
deliberately have no `.steps.test.ts` partner, and a reader who goes looking for one is not looking at drift.

**`negative-requirements.test.ts`** — six tests in five `describe` blocks. Every assertion makes two checks: the error
CLASS, then its `reason` tag. The RUN-02 block keeps its three claims as three separate assertions on purpose.

**`verify-traceability.sh` check 5** — the first check in this repository that asserts completeness, exactly-once
occurrence, contiguity, and a real section 5 **row**. Its expected count is one named constant, written once.

**Section 5's final five rows and its trailing exclusion note**, which explains that five rows name files that are
starved and never emitted, and states the rule the tsgo-gate note states one level down: those files are not suites, and
renaming them would break the thing they exist to prove.

## The thing the plan got wrong, and it is the same thing four plans running

**Task 1's acceptance criterion says `pnpm verify:spec` FAILS on check 4 once the five tags land, and that the failure
"is the proof that the repo-wide grep reaches the subdirectory". It stayed PASS.** Check 4's second half is
`grep -q "REQ-EC-NNN"` over the whole of `traceability.md`, and section 5's preamble already listed all five ids longhand
in its not-yet-carried sentence. A tag **mentioned** in prose satisfied it — and the mention that did so was a sentence
saying the id was NOT YET CARRIED.

The prior wave's handoff named exactly this risk and told this plan not to repeat it in check 5. Two things followed:

1. **The proof was taken directly and sharpened into a measurement.** With `REQ-EC-003/007/008/009/018` substituted out
   of `traceability.md` and nothing else changed, check 4 went **FAIL** naming exactly those five. Performed, run,
   reverted. One run states both halves: the repo-wide grep genuinely reaches the new subdirectory, **and** the only
   thing that had been holding check 4 green was a prose mention.
2. **Check 5 matches a ROW.** It extracts section 5's table between its heading and the next, and counts an id only when
   it is the first cell of a row. Measured before the rows landed: **check 4 PASS, check 5 RED** —
   `tagged but with no §5 TABLE ROW (a prose mention is not a row)`, naming all five. That is the first time anything in
   this repository catches the weakness it has now recorded four times.

## Mutation Record

Four performed, run, then reverted; `git status --porcelain` was clean before each commit was staged. Full detail lives
in `negative-requirements.test.ts`'s module doc comment, beside the code each one attacks.

| #  | Mutation                                                                        | Went RED                                                       | Stayed GREEN                                                          |
| -- | ------------------------------------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------- |
| A1 | `unmatched-step.feature` made to fail as an AMBIGUITY instead                   | the SHARP assertion, `expected 'AmbiguousStep' to equal 'UndefinedStep'` | the other five tests                                            |
| A2 | A1 **with the class check and the `reason` narrowing deleted**                  | **nothing — 6 passed, 0 failed**                               | everything. This is the entry that matters                            |
| B  | a second `@REQ-EC-009` added to `worked-example-01-apples.feature`              | **check 5**, `duplicated (D-01 allows one Scenario per id)`    | **check 4 PASS**, `pnpm test` 802 passed                              |
| C  | `@REQ-EC-018` deleted from `after-on-failure.feature`                           | **check 5**, `missing, so coverage is 21/22`                   | **check 4 PASS**, `pnpm test` 802 passed                              |
| D  | the `@REQ-EC-018` block's `After` hook replaced with an empty body              | the After-ran assertion, `expected [ 'step1', 'step2' ] to deeply equal [ …, 'After' ]` | the exit-is-a-failure and error-identity assertions |
| —  | the five ids substituted out of `traceability.md` (before the rows landed)      | **check 4**, naming all five                                   | —                                                                     |

Four entries carry more than their row:

**A2 is the whole justification for the two-check rule, and A1 alone could not have made it.** A1 shows the sharp
assertion can fail. A2 shows what the blunt one lets through: with the class check and the `reason` narrowing removed,
the block whose entire job is to carry MATCH-03 went green against an **`AmbiguousStep`** — a failure with nothing
whatever to do with MATCH-03, reporting nothing. Falsifying an assertion and showing it is load-bearing are different
measurements; this is 11-04's E1/E2 and 11-05's G/G2 lesson applied on purpose rather than rediscovered.

**B and C are the argument for check 5 existing at all, and the column that matters is the right-hand one.** Both leave
check 4 PASS and `pnpm test` green. Check 4 asks whether every tag USED is DEFINED: a tag used twice is still defined,
and a deleted tag is simply one fewer thing to check. Completeness and exactly-once occurrence are claims it is
structurally incapable of making, which is why check 5 is a separate check rather than a stronger check 4.

**D is why the RUN-02 block has three assertions and not one.** With the `After` hook a no-op, the Scenario still fails
— because the step still fails — so `Exit.isFailure` stays green and so does the error-identity check. Only the log
comparison sees it. Combining the three would have hidden exactly the regression the requirement is about.

## Verification

| Gate                               | Result                                                                                  |
| ---------------------------------- | ---------------------------------------------------------------------------------------- |
| `pnpm test`                        | 38 files, 802 passed, 4 skipped (baseline 37 / 796 / 4 — +1 file, +6 passed, none lost)  |
| This wrapper                       | 6 passed: one per requirement, plus the MATCH-04 registration-order arm                  |
| `pnpm verify:spec`                 | **PASS 9, FAIL 0, SKIP 0** — check 5: `22/22 requirements covered by a passing test`     |
| `pnpm lint`                        | exit 0 (oxlint + dprint check)                                                           |
| `pnpm typecheck:test`              | exit 0                                                                                   |
| `pnpm build`                       | exit 0                                                                                   |
| `pnpm circular`                    | no circular dependency                                                                   |
| `pnpm verify:acceptance-ref-state` | ENFORCED                                                                                 |
| `pnpm verify:acceptance-no-any`    | ENFORCED — the recursive `find` now scans the `negative/` fixtures too                   |
| `pnpm verify:tsgo-gate`            | ENFORCED                                                                                 |
| `pnpm verify:shared-layer-once`    | ENFORCED                                                                                 |
| `pnpm verify:tags-filter`          | ENFORCED                                                                                 |
| `pnpm verify:no-runner-dep`        | ENFORCED                                                                                 |
| `pnpm verify:testapi-seam`         | ENFORCED                                                                                 |
| `pnpm verify:oxlint-plugin`        | ENFORCED                                                                                 |
| `git status --porcelain`           | clean; all mutations reverted                                                            |

Plan-specific criteria, checked mechanically: `negative/` holds exactly 5 `.feature` files and one README; exactly 5
distinct `@REQ-EC-NNN` tags across those fixtures; `grep -rhoE '@REQ-EC-[0-9]{3}' --include='*.feature' . | sort | uniq -d`
produces no output; section 5 has exactly 22 rows matched as rows; `EXPECTED_REQ_COUNT=` occurs once;
`grep -c 'toThrow()'` and `grep -c 'from "../src/index'` on the wrapper are both 0; the README contains `starved`,
`two-check` and `D-02`; the exclusion note contains `starved` and `never emitted`.

## Deviations from Plan

### Rule 1 — task 1's "check 4 FAILS here" criterion is unsatisfiable

Covered in full above. The criterion's INTENT — that the repo-wide grep must be PROVEN to reach the new subdirectory
rather than assumed — holds and is met by a stronger measurement than the plan asked for, since a mutation that names
the five ids says more than a gate that was going to be red anyway.

### Rule 1 — the plan's own task-1 verify command counts README prose

`ls negative/*.feature | wc -l` is 5, but the criterion's companion,
`grep -rhoE '@REQ-EC-[0-9]{3}' packages/vitest/test/acceptance/negative | sort -u | wc -l`, greps the whole DIRECTORY,
not its `.feature` files. The README's glob-observation paragraph originally wrote two ids in full and the count came
back 7. The README now writes ids without their `@` prefix and says why in place — the same self-invalidation shape
`verify-acceptance-no-any.sh`'s METHOD NOTE names, arriving from the other direction: a criterion that counts a literal
also counts the prose explaining it. That is the fourth time this repository has hit that shape (STATE.md 03-04, 10-01,
10-02, here).

### Rule 1 — `collectFeature` does not produce a `StepMatchError`, it carries one

The plan's task-2 behavior spec describes MATCH-03/04 as `collectFeature` "producing" an error, which reads as a failed
Effect. `collectFeature` returns synchronously and never fails; the error is an `Unresolved` planned step on
`collection.plan`, and only enters an error channel a stage later in `buildScenarioEffect`. That IS ADR-EC-019 — one
broken step fails one Scenario and the rest of the Feature runs — so the assertions read the plan. Recorded in the
module doc comment, per the plan's own instruction to follow the real behavior.

### Rule 1 — MATCH-04's order claim, weakened to the true one

The plan asked for an assertion that `matchedPatterns`' order is independent of registration order. It is not:
06-CONTEXT.md D-03 orders the list by definition site so it points a reader at where to go and fix it, and transposing
two registrations transposes their line numbers. What is order-independent is the CONTENT, and the content is what the
requirement guards — a first-wins resolver reports one pattern. The fixture is collected twice with the registrations
swapped and both patterns are named in full both ways. The honest claim is asserted and the divergence is written down
rather than the stronger sentence being left standing.

### Rule 3 — the barrel import the plan asked for is forbidden by the plan's own criterion

Task 2's action says to match `StepMatchError` "on the class exported from the package barrel"; its acceptance criterion
requires `grep -c 'from "../src/index'` to be 0, which the barrel path contains. oxlint's
`effect/no-import-from-barrel-package` with `checkRelativeIndexImports: true` settles it independently. Imported from
`../../src/Errors.ts` — the identical class object `index.ts:218` re-exports — so the substantive requirement, matching
on the class rather than on message text, is met exactly.

### Rule 3 — the worktree had no `node_modules`

Fresh worktree; resolved with `pnpm install --frozen-lockfile`. `pnpm-lock.yaml` unmodified, no package added, so no
package-legitimacy checkpoint applied. Fifth consecutive plan to hit this.

### Rule 3 — an inline `Layer.succeed` collapses `collectFeature`'s DSL type parameter

`collectFeature(feature, Layer.succeed(Trace, …), (dsl) => …)` fails to typecheck: the contextual type of `define`
resolves to `FeatureDsl<unknown>` and neither overload matches. Hoisting the Layer to a `const` with an explicit
`Layer.Layer<Trace>` annotation fixes it. Not a workaround worth hiding — the comment in place says the annotation is
what keeps the DSL's type parameter equal to the Layer's output, which is ADR-EC-003's whole point.

### Rule 2 — the link check renumbered

Check 5 sits beside check 4, as the plan asks, so the pre-existing "No broken relative markdown links" block became
check 6. Its numbering is a comment header only; nothing depends on it.

### TDD gate sequence

Task 2 is marked `tdd="true"`. A genuine RED was not available and its absence is deliberate rather than skipped: the
behavior under test shipped in Phases 2, 6 and 7, so there is no implementation to be missing. Writing a test that fails
for want of code that already exists would have meant breaking the library to satisfy a ceremony. The honest analogue is
mutation A, which is the RED this requirement can actually have — the assertion proven to fail against a wrong failure,
and then proven to be the only thing standing between the block and that wrong failure. Same resolution as 11-01 through
11-05, different reason.

### Not done, deliberately

`.planning/STATE.md`, `.planning/ROADMAP.md` and `.planning/REQUIREMENTS.md` are untouched — this ran as a parallel
worktree agent and the orchestrator owns shared-file writes. **RUN-06 remains `Pending` in `REQUIREMENTS.md`.** Its
structural proof landed in 11-05 and its acceptance row (`REQ-EC-022`) has been carried since 11-02; the closing plan
marks it.

## Assumptions

**ASSUMPTION-11-A (adjacency) — the tag-occurrence half is now ENFORCED, not assumed.** Check 5 asserts each
`@REQ-EC-NNN` occurs exactly once across every `.feature` in the repository, and mutation B is the measurement. The
service-tag-id half remains **unverified**: this plan adds one `Context.Service` id (`Trace`, joining four `World`s and
a `HookLog`) with no collision, but nothing checks for one. It is still an assumption and it is still the last one.

**ASSUMPTION-11-B (empty / single-element) resolved, and the plan's predicted failure path was again not the one that
fires.** All three globs reach the subdirectory unchanged and none needed fixing — `tinyglobby`'s `**`, a recursive
`find`, and a recursive `grep`. The population controls in both gate scripts are unaffected, because they count
`*.steps.test.ts` and this directory has none by design: `MIN_STEP_MODULES=5` is still satisfied at exactly 5. Verified
explicitly rather than assumed, as the handoff asked.

**ASSUMPTION-11-C (ordering) held, and is now exercised in one place the plan said it would not be.** The MATCH-04
registration-order test depends on nothing about Scenario declaration order, but it does depend on definition-site
ordering being stable within one `define` callback — which is a different claim, and the reason the assertion sorts.

## Notes for Future Plans

- **`EXPECTED_REQ_COUNT=22` in `spec/scripts/verify-traceability.sh` must change in the same commit as a 23rd
  requirement.** That coupling is deliberate (threat T-11-06-05, accepted rather than mitigated): deriving the count
  from `.planning/REQUIREMENTS.md` would tie a `spec/` gate to GSD-internal files. The failure it produces is loud and
  names the ids.
- **Check 4 is now strictly weaker than check 5 and is kept anyway.** It runs first and reports a different thing — an
  UNDEFINED tag, including one outside the acceptance suite entirely. Do not "simplify" it away as redundant; mutations
  B and C are green against it precisely because it asks a narrower question, and a narrower question that runs first
  gives a better error message for the failure it does catch.
- **A `.test.ts` in the acceptance directory is scanned by neither structural gate.** Both scan `*.steps.test.ts` (and
  `.feature`, for the escape-hatch one). `negative-requirements.test.ts` honours both rules by hand and says so in its
  doc comment, but nothing enforces that. A future plan wanting the gates to cover it should widen the suffix rather
  than rename the file — the suffix is what keeps the population control meaningful.
- **State can leave module scope when the entry point allows it.** `ScenarioEffect.test.ts` needs a factory-local array
  to capture each Layer build; this wrapper needs nothing, because `collectFeature` has no module-scope requirement, so
  the `Ref` is made inside the test body and handed to `Layer.succeed`. Prefer that shape wherever `describeFeature` is
  not the entry point.
- **Section 5 is complete and check 5 is what keeps it that way.** A future acceptance pair adding a tag without a row
  is now a red gate rather than a silent omission, and adding a row without a tag is red too.

## Known Stubs

None. Every one of the six tests reads a value the library produced from a real `.feature` file on disk, and mutations
A2, B, C and D each turn a different subset of the artifacts red. Check 5 is proven non-vacuous against a duplicated id,
a missing id, and an id present in prose but absent from the table.

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or trust-boundary schema changes. The five new file
reads are committed fixtures resolved relative to `import.meta.url`.

All five registered threats have a measured mitigation:

| Threat                                                        | Mitigation, measured                                                                                                              |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| T-11-06-01 (an assertion that only checks that something failed) | The two-check rule on all six tests; A1 fires the sharp form, A2 shows the weakened form green against an `AmbiguousStep`         |
| T-11-06-02 (a duplicated or missing `@REQ-EC-NNN`)            | Check 5's exactly-once, contiguity and count assertions; B and C fire it while check 4 stays PASS in both violating states        |
| T-11-06-03 (a failing `After` masking the step's own error)   | The RUN-02 block's error-identity assertion, walked through `cause.reasons` and separate from the exit check; D proves the split  |
| T-11-06-04 (a starved fixture accidentally emitted)           | `pnpm test` measured at 37/796 immediately before and immediately after task 1 — unchanged, so none of the five was emitted       |
| T-11-06-05 (the count constant drifting from REQUIREMENTS.md) | Accepted, as registered. One named constant, written once, with the coupling stated in the check's own header comment             |

## Self-Check: PASSED

Files verified present on disk:

- FOUND: `packages/vitest/test/acceptance/negative/background-placeholder.feature`
- FOUND: `packages/vitest/test/acceptance/negative/unmatched-step.feature`
- FOUND: `packages/vitest/test/acceptance/negative/ambiguous-step.feature`
- FOUND: `packages/vitest/test/acceptance/negative/unused-pattern.feature`
- FOUND: `packages/vitest/test/acceptance/negative/after-on-failure.feature`
- FOUND: `packages/vitest/test/acceptance/negative/README.md`
- FOUND: `packages/vitest/test/acceptance/negative-requirements.test.ts`
- FOUND: `spec/scripts/verify-traceability.sh` (check 5, `EXPECTED_REQ_COUNT` once)
- FOUND: `spec/traceability.md` (22 section 5 rows, exclusion note present)

Commits verified in `git log`:

- FOUND: `2d1d13f` test(11-06): add the five starved fixtures for the fails-loudly requirements
- FOUND: `61ae0bf` test(11-06): drive every starved fixture and assert the named error
- FOUND: `50e2ed5` docs(11-06): derive 22/22 from the tags rather than claim it

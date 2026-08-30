---
phase: 11-composition-root-and-dogfooded-acceptance-suite
plan: "04"
subsystem: acceptance-suite
tags: [acceptance, dogfooding, parsing, correlation, parameter-types, mutation-testing, traceability]
status: complete

requires:
  - "11-01's acceptance directory, its README conventions, and the derived tag universe in vitest.config.ts"
  - "11-02's and 11-03's established pair shape (relative describeFeature import, gherkin-package loadFeature, assert-not-expect, Ref-through-World state)"
  - "ADR-EC-014's correlate-don't-re-derive rule (ParsedStep.origin, ParsedScenario.astName/tags)"
  - "ADR-EC-023's ParameterTypeStore as an ambient Context.Service, and ADR-EC-007's correction making custom types replayed DATA"
provides:
  - "packages/vitest/test/acceptance/parsing-and-matching.{feature,steps.test.ts} — the fourth acceptance pair, and the first whose subject is the pipeline rather than a worked example"
  - "packages/vitest/test/acceptance/parsing-and-matching-second-load.feature — the directory's first partnerless, tagless .feature: parsed at module scope, handed to no runner"
  - "spec/traceability.md section 5 rows for REQ-EC-001, REQ-EC-002, REQ-EC-005, REQ-EC-006 and REQ-EC-017 (16 of 22 now carried)"
  - "A measured control (mutation E2) showing that MATCH-02's whole claim rests on ONE reference-inequality assertion"
  - "ASSUMPTION-11-B resolved: a tagless, partnerless acceptance .feature is benign to gherkinTags, verify:spec and collection"
affects:
  - "spec/traceability.md section 5 — its preamble's not-yet-carried list and its half-a-claim note"
  - "packages/vitest/test/acceptance/ — the directory now contains a .feature file with no .steps.test.ts partner"

tech-stack:
  added: []
  patterns:
    - "Every step body appends one label describing what it OBSERVED to a Ref on World, and two Scenarios assert the recorded sequence — one mechanism serving RUN-01's ordering claim, RUN-06's no-closure-state claim, and per-Scenario Layer freshness at once"
    - "The Background asserts its recorder is EMPTY on entry, turning 'fresh Layer per Scenario' from an assumption into a per-Scenario assertion"
    - "A mutation is measured TWICE when the obvious form and the load-bearing form differ (E1 breaks the assertion, E2 deletes it)"
    - "A custom parameter type is registered into a file-private store via `store.define(...)`, never via the process-wide `defineParameterType` helper"

key-files:
  created:
    - packages/vitest/test/acceptance/parsing-and-matching.feature
    - packages/vitest/test/acceptance/parsing-and-matching-second-load.feature
    - packages/vitest/test/acceptance/parsing-and-matching.steps.test.ts
  modified:
    - spec/traceability.md

decisions:
  - "The section 5 rows were written in the SAME commit as the tags they trace, in tasks 1 and 2, rather than deferred wholesale to task 3. AGENTS.md section 1 requires a change and its traceability entry to land together, and `pnpm verify:spec` — task 1's own verify gate — is red between adding a tag and adding its row. Task 3 kept the preamble update and the mutation record."
  - "The custom parameter type is registered with `acceptanceStore.define(...)`, not with the plan's `defineParameterType`. Those are not two ways of doing the same thing: `defineParameterType` IS the process-wide default store's `define`, so following the plan's wording literally would have violated the plan's own adjacent prohibition against writing to that store."
  - "The Scenario Outline's NAME carries the `<number>` placeholder, not just its step text. `Pickle.name` is only interpolated where a placeholder exists, so an Outline named without one produces `name === astName` — worked-example-03's Outline is exactly that shape — and PARSE-02's `name`-differs-from-`astName` assertion would have been vacuously satisfiable there."
  - "Both `@REQ-EC-005` and `@REQ-EC-017` assert through the SAME feature-level `the recorder holds {string}` registration rather than two Scenario-scoped copies. One registration serving several Scenarios is the Feature-level default, and duplicating it would have made the shared assertion look like a coincidence."
  - "`@REQ-EC-006` resolves the custom type through `createStepMatcher` against the SECOND registry and the second file's own step text, rather than stopping at `lookupByTypeName`. Presence in a lookup table is not resolution, and BEH-EC-015's own worked example says the registry must come off the feature the matcher will be used against."

metrics:
  duration: ~20m
  completed: 2026-08-30

actuals:
  tokens: 14600
  tasks: 3
  commits: 3
---

# Phase 11 Plan 04: Parsing and Matching Acceptance Pair Summary

The five requirements that belong to the parse-and-match pipeline rather than to any one worked
example — PARSE-01, PARSE-02, MATCH-01, MATCH-02 and RUN-01 — are now observable from inside running
acceptance steps whose input is a real `.feature` file on disk, and section 5 carries **sixteen of
twenty-two** rows. The pair emits seven tests; the suite went 786 → 793 passed across 35 → 36 files,
with nothing lost.

## What was built

**`parsing-and-matching.feature`** — a `@featuretag` Feature with a one-step `Background`, five
tagged Scenarios (001, 002, 005, 006, 017 — exactly five `@REQ-EC-` occurrences, one per Scenario,
D-01) and one deliberately UNTAGGED `Scenario Outline` whose two rows are the substitution evidence
`@REQ-EC-002` reads. The Outline carries no tag because it is evidence for another Scenario's claim,
not a requirement of its own.

**`parsing-and-matching-second-load.feature`** — the directory's first `.feature` with no
`.steps.test.ts` partner and no tag. It is loaded at module scope and handed to nothing, which is the
only way PARSE-01's "a load yields data" half can be stated without the load also producing tests.

**`parsing-and-matching.steps.test.ts`** — seven passing tests. Every step body appends one label
describing what it OBSERVED to a `Ref` on `World`; two Scenarios then assert the recorded sequence in
full. That one mechanism carries three separate claims — RUN-01's ordering, RUN-06's
no-closure-state rule, and per-Scenario Layer freshness, which the Background asserts head-on by
requiring its recorder to be EMPTY on entry. No `let`, no `var`, no module-scope mutable holder, no
standalone `any`.

**`spec/traceability.md`** — five new section 5 rows in ascending order, each naming the artifact
carrying the half a green Scenario cannot state, plus a narrowed not-yet-carried list and a
generalised note about half-claims (the old wording said "four of them have a compile-time half",
which stopped being the whole truth once absence-halves and type-level halves landed beside it).

## Two things the plan predicted correctly, and one it did not

**Predicted and confirmed.** `ScenarioOutline` still does not exist, so the Outline needed no
container at all here — every step definition in this file is registered at Feature level or in the
one `Background` container, and a Feature-level registration serves every Scenario including each
Outline row. And an undeclared tag would have degraded rather than collapsed the file, which is why
the collected COUNT is asserted throughout rather than the exit code.

**Not predicted: an Outline whose NAME has no placeholder produces `name === astName`.**
`worked-example-03-discounts.feature`'s Outline is exactly that shape, so `@REQ-EC-002`'s
`name`-differs-from-`astName` assertion would have been vacuously satisfiable if this Outline had
been named the same way. The Outline is therefore named
`Substituted placeholders reach the step for <number>`, and the two rows emit
`…for 7` and `…for 11`. The substitution is additionally asserted on the STEP TEXT, so the claim does
not rest on the name alone.

## ASSUMPTION-11-B is resolved, and the fallback was not needed

All three questions the plan required an OBSERVATION for came back benign, so
`parsing-and-matching-second-load.feature` stayed where it is rather than moving under a `support/`
subdirectory:

| Question | Observed |
|----------|----------|
| Does `gherkinTags` tolerate a tagless acceptance `.feature`? | Yes — it contributes no entry and the array vitest receives is unchanged. The glob is recursive, so the `support/` fallback would not have changed this either way |
| Does `pnpm verify:spec` stay green? | Yes — check 4 greps for `@REQ-EC-NNN` and a file with zero occurrences is invisible to it. PASS 8, FAIL 0 |
| Any collection noise? | None. Vitest's include glob collects test modules; a `.feature` is not one |

The one convention it breaks is the README's "each entry here is a PAIR", which is a statement about
step modules and the features they RUN. A future scanner assuming a partner for every acceptance
`.feature` has to treat this file as the documented exception it is, and the step module's header
says so.

**ASSUMPTION-11-A (adjacency) is resolved again**, fourth `World` tag id in the directory, no
collision. **ASSUMPTION-11-C (ordering)** held: the Outline's rows emit in Examples-table order.

## Mutation Record

All five performed, run, then reverted; `git diff --exit-code` over both `.feature` files is clean
and `git status --porcelain` showed nothing afterwards. Full detail lives in the step module's doc
comment, beside the code it mutates.

| # | Mutation | Went RED | Stayed GREEN |
|---|----------|----------|--------------|
| A | Second `.feature`'s Feature name changed, this module untouched | **1 of 7** — `expected 'Parsing and matching, a renamed second load' to equal 'Parsing and matching, the second load'` | 6, including `@REQ-EC-006`, which reads the same second feature but only its registry and step text |
| B | `Background:` block deleted from the `.feature` | **3 of 7** — `@REQ-EC-002`'s origin, `@REQ-EC-017`'s ordering, `@REQ-EC-005`'s recorded prefix | `@REQ-EC-001`, `@REQ-EC-006`, both Outline rows. **Plus an eighth test appeared** — see below |
| C | `{int}` → `{word}` for the integer argument, in this module only | **1 of 7** — `expected 'string' to equal 'number'` on the first `typeof` assertion | the other 6 |
| D | SECOND load only, swapped to the built-ins-only layer | **1 of 7** — `expected undefined to not equal undefined` on the second registry's `lookupByTypeName("fruit")` | the other 6, AND the reference-inequality assertion directly above the failure |
| E1 | Both sides of the inequality pointed at one feature's registry | **1 of 7** — `expected ParameterTypeRegistry{ …(2) } to not equal ParameterTypeRegistry{ …(2) }` | the other 6 |
| E2 | The inequality assertion DELETED outright | **nothing — 793 passed, 0 failed** | everything. This is the entry that matters |

Three entries are worth more than their row:

**B moved the collected COUNT the other way.** Deleting the Background produced an EIGHTH reported
test, `⚠ unused step definition: Given "the recorder is empty"`, emitted by the library and named
after the now-orphaned registration. This directory's README says to assert the collected count
because a pair that silently stops running looks like a smaller number nobody is watching; here the
same rule catches a number moving UP, and the movement is the runner reporting the defect by name.

**C found that a pattern and a body can disagree with nothing failing at compile time.**
`StepRegistrar` infers `Params` from the body it is handed, so changing `{int}` to `{word}` while the
body still declares `number` typechecks cleanly and only the runtime `typeof` assertion notices. That
is not an aside — it is precisely why MATCH-01's type-level half has to live in
`packages/gherkin/test/StepArgs.types.ts` and cannot be folded into this Scenario.

**E2 is the measurement the whole pair turns on.** Deleting the one reference-inequality line leaves
the entire suite green: both loads still succeed, both registries still resolve `fruit`, and the
second registry still matches the second file's step text through `createStepMatcher`. Every
remaining assertion in that Scenario is equally satisfied by a MEMOISED registry handed to both
calls — the exact Pitfall 14 bug MATCH-02 exists to forbid. D and E also fail on DIFFERENT assertions
in the same step body (D on the lookup, E on the identity), so neither substitutes for the other.

## Verification

| Gate | Result |
|------|--------|
| `pnpm test` | 36 files, 793 passed, 4 skipped (baseline 35 / 786 / 4 — +1 file, +7 passed, none lost) |
| This pair | 7 passed: 5 tagged Scenarios + 2 Outline rows with the parenthesised suffix |
| `pnpm verify:spec` | PASS 8, FAIL 0, SKIP 0 — all REQ tags defined, 279 links resolve |
| `pnpm lint` | exit 0 (oxlint + dprint check) |
| `pnpm typecheck:test` | exit 0 |
| `pnpm build` | exit 0 |
| `pnpm circular` | no circular dependency |
| `pnpm verify:tsgo-gate` | ENFORCED |
| `pnpm verify:shared-layer-once` | ENFORCED |
| `pnpm verify:tags-filter` | ENFORCED |
| `pnpm verify:no-runner-dep` | ENFORCED |
| `pnpm verify:testapi-seam` | ENFORCED |
| `pnpm verify:oxlint-plugin` | ENFORCED |
| `git status --porcelain` | clean; all mutations reverted |

Plan-specific criteria, checked mechanically: the `.feature` carries exactly 5 `@REQ-EC-` tags
(001/002/005/006/017, one per Scenario); the second-load `.feature` carries 0; `defaultParameterTypeStore`
appears 0 times and `ParameterTypeStore.Default` 0 times in the step module; `notStrictEqual` appears
3 times; `let`/`var` 0 and standalone `any` 0 after stripping comment lines; section 5's rows are in
ascending order and number exactly 16.

## Deviations from Plan

### Rule 3 — the section 5 rows had to land with their tags, not three tasks later

Task 1's own `<verify>` runs `pnpm verify:spec`, and that gate went RED the moment the tags landed
(`undefined: @REQ-EC-002 @REQ-EC-017`) because the plan scheduled all five rows into task 3. The
plan's task ordering and its task-1 verify gate contradict each other. Resolved by writing each tag's
row in the same commit as the tag — three rows in task 1, two in task 2 — which is also what
AGENTS.md section 1 requires ("a code change that isn't reflected in `spec/` in the same commit is
incomplete"). Task 3 kept everything else the plan gave it: the preamble's not-yet-carried list and
the mutation record.

Worth noting WHY only two of the five tags failed the gate. `verify-traceability.sh` check 4 is
satisfied by a bare MENTION anywhere in `traceability.md`, and `REQ-EC-001`, `REQ-EC-005` and
`REQ-EC-006` were each written out longhand in the preamble's not-yet-carried sentence while
`REQ-EC-002` and `REQ-EC-017` were only covered by its "through" RANGES. So the gate's weakness — 
already recorded by 11-03 and still not this plan's script to own — is what decided which half of a
five-tag change failed loudly. A tightened check requiring an actual table row would have failed all
five, which is the correct behaviour.

### Rule 1 — the plan named an API that violates its own adjacent prohibition

Task 2's action says to register the custom type "with `defineParameterType`" and, two sentences
later, "Never write to `defaultParameterTypeStore`". Those cannot both be followed:
`defineParameterType` is defined as `defaultParameterTypeStore.define(definition)`. Registered with
`acceptanceStore.define<Fruit>(...)` instead — the store's own method, which is what
`ParameterTypeLifecycle.test.ts` does for the same reason. The plan's grep criterion
(`defaultParameterTypeStore` count 0) is satisfied, and its intent is honoured exactly.

### Rule 1 — one task 2 criterion is unsatisfiable as written

`grep -c 'createParameterTypeStore' … is 1` cannot hold: `grep -c` counts matching LINES, and the
token necessarily appears on both the import line and the call line. Measured value is 2, and the
criterion's intent — exactly one store created in this file — holds. This is the fourth time this
repo has hit a grep-shaped criterion that a second legitimate occurrence defeats; the sibling
criteria in the same block (`defaultParameterTypeStore` 0, `ParameterTypeStore.Default` 0) also mean
those literals cannot be written in this file's PROSE, which is why the header explains the choice
of store obliquely rather than by name.

### Rule 3 — the worktree had no `node_modules`

Fresh worktree; resolved with `pnpm install --frozen-lockfile`. `pnpm-lock.yaml` unmodified, no
package added, so no package-legitimacy checkpoint applied. Same as 11-02 and 11-03.

### TDD gate sequence

Both task 1 and task 2 are marked `tdd="true"`. RED was observed and recorded rather than committed,
matching 11-01 through 11-03:

- Task 1 RED: the pair on disk with `describeFeature(feature, World.layer, () => {})` and no step
  definitions → **5 failed**, every Scenario on `StepMatchError … UndefinedStep`. GREEN is `15df3f0`.
- Task 2 RED: the two new Scenarios added to the `.feature` with no matching registrations →
  **2 failed**, both `UndefinedStep`. GREEN is `faf1402`.

A `test(...)` commit ahead of either would have committed a state that cannot pass by construction,
since a `.feature` file and its step module are one working state split across two files.

### Not done, deliberately

`.planning/STATE.md`, `.planning/ROADMAP.md` and `.planning/REQUIREMENTS.md` are untouched — this ran
as a parallel worktree agent and the orchestrator owns shared-file writes. RUN-06 stays `Pending` in
`REQUIREMENTS.md` by convention; its structural proof (`scripts/verify-acceptance-ref-state.sh`) is
plan 11-05's, and the closing plan marks it.

## Notes for Future Plans

- **An Outline's `name` equals its `astName` unless the OUTLINE'S NAME contains a placeholder.**
  Interpolation happens where a `<token>` is, and `Pickle.name` has none to substitute otherwise.
  Any future assertion distinguishing the two names has to name the Outline accordingly, and
  `worked-example-03-discounts.feature`'s Outline is a live example of the shape where they coincide.
- **`require-yield` is on** (oxlint `correctness`), so every step body must contain a `yield*`. That
  is a real design constraint on assertion-only steps, and the "every step records what it observed"
  shape in this pair is the cheapest honest answer — the yield writes a value a later step asserts,
  instead of being ceremony.
- **`verify-traceability.sh` check 4's mention-is-enough weakness is now measurable in both
  directions.** 11-03 recorded a tag passing on a prose mention; this plan recorded the mirror image,
  where two tags of a five-tag change failed only because the preamble happened to write ranges
  rather than longhand ids. Whichever plan owns that script should require an actual table row.
- **Section 5 carries sixteen of 22.** Remaining: `REQ-EC-003`, `REQ-EC-007`, `REQ-EC-008`,
  `REQ-EC-009`, `REQ-EC-016` and `REQ-EC-018` — the five "fails loudly" ones plus DSL-07 (hooks).
- **Keep measuring the DELETION of an assertion, not only its falsification.** E1 and E2 differ in
  what they prove: E1 shows the assertion can fail, E2 shows nothing else catches what it catches.
  Only E2 answers "is this line load-bearing".

## Known Stubs

None. Every Scenario asserts a value the library computed, and mutations A through E each turn a
different subset of them red.

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or trust-boundary schema changes.
The two new file reads are committed fixtures resolved relative to `import.meta.url`.

All four registered threats have a measured mitigation:

| Threat | Mitigation, measured |
|--------|----------------------|
| T-11-04-01 (assertions on parser output) | Mutations A, B and C each change only the `.feature` file or only the pattern, and each turns the corresponding Scenario red |
| T-11-04-02 (the module-scope store) | Created with a private store, never the process-wide one; `grep -c 'defaultParameterTypeStore'` is 0 |
| T-11-04-03 (registry freshness across two loads) | Mutation E1 turns the inequality assertion red; E2 shows the suite goes fully green without it, which is what makes the assertion the one carrying the claim |
| T-11-04-04 (a tagless `.feature` in this directory) | ASSUMPTION-11-B measured on all three fronts; accepted, fallback not needed |

## Self-Check: PASSED

Files verified present on disk:

- FOUND: `packages/vitest/test/acceptance/parsing-and-matching.feature`
- FOUND: `packages/vitest/test/acceptance/parsing-and-matching-second-load.feature`
- FOUND: `packages/vitest/test/acceptance/parsing-and-matching.steps.test.ts`
- FOUND: `spec/traceability.md`

Commits verified in `git log`:

- FOUND: `15df3f0` feat(11-04): observe parsing, correlation and step order from inside a step
- FOUND: `faf1402` feat(11-04): assert built-in coercion and a custom type across two loads
- FOUND: `c242e74` docs(11-04): record the parsing pair's mutations and close the section 5 gap

---
phase: 11-composition-root-and-dogfooded-acceptance-suite
plan: "03"
subsystem: acceptance-suite
status: complete
tags: [acceptance, dogfooding, datatable, rule-layer, scenario-outline, testclock, spec-change, mutation-testing]

requires:
  - "11-01's acceptance directory, its README conventions, and the derived tag universe in vitest.config.ts"
  - "11-02's established pair shape (relative describeFeature import, gherkin-package loadFeature, assert-not-expect)"
  - "ADR-EC-017's Background/Scenario-as-step-definition-containers (Phase 5)"
  - "ADR-EC-010's Rule-scoped extra Layers and ADR-EC-018's per-Scenario TestClock"
provides:
  - "The DELIVERY of ParsedStep.stepArguments into a step body — packages/vitest/src/Plan.ts note (h). Before this, no consumer existed and a step body's DataTable parameter was undefined"
  - "BEH-EC-016's step-body-signature REQUIREMENT: table/doc-string arguments are APPENDED positionally, and StepArgs<P> deliberately does not infer them"
  - "packages/vitest/test/acceptance/worked-example-03-discounts.{feature,steps.test.ts} — the densest acceptance pair: DataTable Background, Rule-scoped Layer, two-row Outline, TestClock"
  - "spec/traceability.md section 5 rows for REQ-EC-004, REQ-EC-014, REQ-EC-015 (11 of 22 now carried)"
  - "The first observation of ADR-EC-008's located RowDecodeFailed error from a real .feature file rather than a synthetic PickleTable"
affects:
  - "spec/behaviors/06 — the deferred step-body-signature question is now answered normatively"
  - "packages/vitest/src/Plan.ts — planStep's args field, on every step in every Feature"
  - "spec/traceability.md — sections 1, 4 and 5"

tech-stack:
  added: []
  patterns:
    - "A table parameter is hand-annotated (`table: DataTable`) and sits LAST, after the pattern's own arguments — required by BEH-EC-016, not a workaround for a weak type"
    - "A Scenario Outline is registered with `Scenario(...)` under its UN-INTERPOLATED name; one registration serves every Examples row"
    - "A mutation that STAYS GREEN is kept as a control, so the mutation beside it cannot be misread as proving more than it does"

key-files:
  created:
    - packages/vitest/test/acceptance/worked-example-03-discounts.feature
    - packages/vitest/test/acceptance/worked-example-03-discounts.steps.test.ts
  modified:
    - packages/vitest/src/Plan.ts
    - packages/gherkin/src/StepArguments.ts
    - packages/gherkin/test/StepArgs.types.ts
    - spec/behaviors/06-datatable-and-docstring-arguments.md
    - spec/traceability.md

decisions:
  - "Implemented the human's Option A: closed the DataTable delivery gap inside this plan as an approved Rule 4 deviation, rather than descoping PARSE-04 or wiring without spec. The commit shape AGENTS.md section 1 demands — behavior doc, source and traceability matrix together — is what the prior run could not produce alone, because the normative text did not exist and writing it is a design decision."
  - "The step-body signature is specified in `spec/behaviors/06`, NOT beside BEH-EC-002 in `01` where the original deferral pointed. The order of the arguments and their delivery are one contract, and splitting them across two documents is what let the delivery half go unowned for five phases."
  - "APPENDED, never prepended, and stated as a REQUIREMENT rather than an implementation note. Prepending would leave every `StepArgs<P>`-inferred parameter reporting an index one lower than it actually arrives at — a silent shift, which is the failure mode worth spending normative text on."
  - "`StepArgs<P>` deliberately does NOT infer a table, and the doc says so as a positive requirement instead of apologising for a gap. A pattern literal cannot express a table's presence; the author's annotation is the only place that claim can exist, which is why `StepArgs.types.ts` pins it with a `@ts-expect-error`."
  - "`.planning/REQUIREMENTS.md`'s PARSE-04 line was left UNCHANGED. Its text — a data table 'reaches a step' as a DataTable wrapper whose rows decode through Schema, and a step carrying both arguments receives both — is now TRUE of a step body and not merely of a ParsedStep. The prior run correctly flagged it as inaccurate; the fix makes it accurate, so correcting the wording would have been churn."
  - "Mutation B is kept even though it stays green, and its record says so first. It is the control for mutation C: without it a reader concludes the Schema decode is carrying the Scenario, when what C actually proves is narrower — that the decode fails loudly on the schema/data mismatch a Gherkin table guarantees."

metrics:
  duration: ~25m
  completed: 2026-08-30

actuals:
  tokens: 19800
  tasks: 2
  commits: 3
---

# Phase 11 Plan 03: Discounts Worked Example Summary

`spec/behaviors/03`'s densest worked example now runs green as a real file pair — a DataTable
Background, a `Rule` carrying its own `DiscountRegistry` Layer, a two-row `Scenario Outline` and a
`TestClock` advance — but only after closing the gap the prior run stopped on: **this library never
handed a step body its Gherkin data table**, and the reason nothing was red is that the one document
that could have specified the delivery had explicitly declined to.

## The blocker, closed

The prior run's diagnosis was correct and is not restated here in full. `packages/gherkin` had
parsed, wrapped, ordered and exported a step's table since Phase 4 — `ParsedStep.stepArguments`,
exactly as ADR-EC-008 promises — while `packages/vitest`'s `planStep` set `args: only.args`, the
cucumber-expression matches alone. A step body declaring a `DataTable` parameter received
`undefined`.

Per the human's decision (Option A), it was closed here as four coordinated changes in one commit,
which is the shape AGENTS.md section 1 requires and the shape the prior run could not produce on its
own:

1. **`packages/vitest/src/Plan.ts`** — `args: [...only.args, ...step.stepArguments]`, plus a new note
   (h) arguing the order. Re-measured from scratch rather than trusted: 34 files / 782 passed before,
   **35 / 786 after**, zero regressions, and the pair went 4 failed → 4 passed.
2. **`spec/behaviors/06`** — the deferral is **withdrawn** in the opening paragraph and replaced by a
   normative REQUIREMENT. It states three things: arguments are appended positionally; `StepArgs<P>`
   MUST NOT infer them, because a pattern literal cannot express a table's presence, so the author
   annotates; and appending rather than prepending is load-bearing because prepending shifts every
   inferred parameter silently.
3. **`packages/gherkin/test/StepArgs.types.ts`** — three pins in the file's own convention: a
   table-carrying pattern yields the empty tuple, a pattern argument keeps index 0 beside a table, and
   a `@ts-expect-error` negative that fails the build if a table ever DOES become inferrable.
4. **`spec/traceability.md`** §1 and §4 — §1's behaviors/06 row now names
   `packages/vitest/src/{Plan,ScenarioEffect}.ts` as the delivery half; §4's `StepArgs.types.ts` row
   now covers BEH-EC-016 as well as BEH-EC-015.

`packages/gherkin/src/StepArguments.ts` note (b) was also corrected. It had asserted the spread as
settled contract — "Phase 5's step-body signature spreads this array" — while no such consumer
existed. It now names `planStep` and records why the claim went unimplemented.

**`.planning/REQUIREMENTS.md` was deliberately NOT touched.** PARSE-04's text is now true as written:
a table reaches a *step*, its rows decode through `Schema`, and a step carrying both arguments
receives both (the spread carries both arms of `stepArguments`). The prior run flagged the checkbox as
wrong; the fix is what makes it right.

## What was built

**`worked-example-03-discounts.feature`** — a Feature-level Background whose one step carries the
`| item | price |` table, a Feature-level `@REQ-EC-004` Scenario reading the decoded subtotal back
(declared OUTSIDE the Rule so the DataTable claim is not entangled with the Rule-Layer claim), and
`Rule: Percentage discounts expire at midnight` containing the `@REQ-EC-015` two-row Scenario Outline
and the `@REQ-EC-014` expired-code Scenario. Exactly three `@REQ-EC-` tags, one per Scenario (D-01).

**`worked-example-03-discounts.steps.test.ts`** — four passing tests. `DiscountRegistry.register`
reads `Clock.currentTimeMillis` and `apply` compares against it, with zero test-awareness: that
transparency is BEH-EC-012 stated as a service rather than as prose, and simplifying it to a boolean
would delete the claim while leaving every test green. Every cross-step value goes through a `Ref` on
`World`; no `let`, no `var`, no module-scope holder, no `any`.

**`spec/traceability.md` §5** now carries **eleven** rows, hitting the plan's success criterion.

## The plan's own two errors, applied rather than rediscovered

Both were pre-diagnosed in the checkpoint and both held up:

- **`ScenarioOutline` does not exist.** `spec/behaviors/03`'s worked example destructures it out of
  the Rule dsl, and `11-CONTEXT.md` lists it among the package's public exports. `RuleDsl` declares
  Given/When/Then/And/But, Background, Scenario and four hook registrars, and nothing else. The
  correct call is `Scenario(...)` with the Outline's UN-INTERPOLATED name — `Plan.ts` note (c) and
  `ScenarioKey.ts` note (c) both say so. One registration, two rows, each asserting its own value.
- **`Duration.decode` is gone in `effect@4.0.0-rc.112`.** `Schema.DurationFromString` is the honest
  conversion, and the Background decodes via `decodeHashes(CartRow)(table)` — the gherkin package's
  own purpose-built decoder, single error channel — rather than the plan's
  `Schema.decodeUnknownEffect(Schema.Array(CartRow))(yield* table.hashes())`, which does not
  typecheck under `exactOptionalPropertyTypes`.

**ASSUMPTION-11-C (ordering) is resolved.** The two Outline rows emit in Examples-table order, each
with BEH-EC-018's unconditional suffix naming every column:

```
Applying a valid discount code (code=SAVE10, percent=10, expected=31.50)
Applying a valid discount code (code=SAVE50, percent=50, expected=17.50)
```

**ASSUMPTION-11-A (adjacency) is resolved again**, third `World` tag id in the directory, no
collision.

## Mutation Record

All five performed, run, then reverted; `git status --porcelain` was empty afterwards and
`git diff --exit-code` over the `.feature` file is clean. Full detail lives in the step module's doc
comment, beside the code it mutates.

| # | Mutation | Went RED | Stayed GREEN |
|---|----------|----------|--------------|
| A | `Gadget` price `25.00` → `26.00` in the `.feature` only | **3 of 4** — `expected 36 to equal 35`, then `32.4 to equal 31.5` and `18 to equal 17.5` | `Expired discount codes are rejected`, which asserts a message and never reads the subtotal |
| B | `decodeHashes(CartRow)(table)` → `table.hashes()` plus a hand-parse | nothing | all 4. **Supposed to stay green** — the control for C |
| C | `CartRow.price`: `Schema.NumberFromString` → `Schema.Number` | **all 4**, on ADR-EC-008's located `DataTableError` | nothing |
| D | Rule-scoped Scenario moved to Feature level, body byte-identical | **fails to COMPILE** — `effect(missingEffectContext)` naming `DiscountRegistry`, at both step bodies | n/a — never ran |
| E | Second Examples row's `expected` `17.50` → `31.50` | **exactly 1 of 4** — `expected 17.5 to equal 31.5` on the `SAVE50` row | the other 3 |

Two entries are worth more than their row:

**C recorded ADR-EC-008's located error from a real Feature for the first time.** Every prior
observation came from a synthetic `PickleTable` in `DataTable.test.ts`:

```
Row 1 of the DataTable at …/worked-example-03-discounts.feature:4 failed to decode,
column "price": Expected number
```

with `reason: 'RowDecodeFailed'` and `column: Some('price')`. That is BEH-EC-016's locator
REQUIREMENT satisfied end to end — the 1-based BODY-ROW ordinal, the column, the feature uri, and the
STEP's line (`:4`, the `Given`) rather than the row's, which has no location upstream.

**D found no defect.** The move produced `error TS377004: … effect(missingEffectContext)` naming
`DiscountRegistry`, beneath a `TS2345` whose structural tail reads `is missing the following
properties from type '{ subtotal; total; rejection }'` — the Feature-level dsl's `ROut` is `World`
alone. INV-EC-005's compile-time boundary holds, so the plan's "report as a blocker" branch did not
fire.

**A is stronger than the plan predicted.** The plan expected one red test; the Background reaches
every Scenario, so one Gherkin cell moves three assertions across two Scenarios.

## Verification

| Gate | Result |
|------|--------|
| `pnpm test` | 35 files, 786 passed, 4 skipped (baseline 34 / 782 / 4 — +1 file, +4 passed, none lost) |
| This pair, verbose | 4 passed: 1 Feature-level, 2 Outline rows with the parenthesised suffix, 1 Rule Scenario |
| `pnpm verify:spec` | PASS 8, FAIL 0, SKIP 0 — all REQ tags defined, 279 links resolve |
| `pnpm lint` | exit 0 (oxlint + dprint check) |
| `pnpm typecheck:test` | exit 0 |
| `pnpm build` | exit 0 |
| `pnpm verify:tsgo-gate` | ENFORCED |
| `pnpm verify:shared-layer-once` | ENFORCED |
| `pnpm verify:tags-filter` | ENFORCED |
| `pnpm verify:no-runner-dep` | ENFORCED |
| `pnpm verify:testapi-seam` | ENFORCED |
| `pnpm circular` | no circular dependency |
| `git status --porcelain` | clean; all five mutations reverted |

Plan-specific criteria, checked mechanically: the `.feature` carries exactly 3 `@REQ-EC-` tags
(004/014/015, one per Scenario); `decodeHashes(CartRow)(table)` appears once; `effect` barrel imports
0; `effect/testing/TestClock` present; `let`/`var` 0 and standalone `any` 0 after stripping comments;
the `Rule` is registered with three arguments, the middle being `DiscountRegistry.layer`; §5's rows
are in ascending order and number exactly eleven.

## Deviations from Plan

### Rule 4 (pre-approved) — the plan's declared scope was expanded

Documented above. The human granted Rule 4 approval to touch `packages/vitest/src/Plan.ts`,
`spec/behaviors/06`, `packages/gherkin/test/StepArgs.types.ts` and `spec/traceability.md` §1/§4,
none of which were in this plan's `files_modified`. `packages/gherkin/src/StepArguments.ts` was also
touched — one doc-comment correction, not authorised by name but squarely inside the same change:
that note asserted the contract this commit finally implements, and leaving it claiming a Phase 5
consumer would have violated AGENTS.md section 4.

### Rule 1 — Task 2's own criteria were factually wrong and were amended

The plan's mutation B and its `grep -c 'hashes()' >= 1` criterion assume a
`Schema.decodeUnknownEffect(Schema.Array(CartRow))(yield* table.hashes())` Background. That form does
not typecheck. The criterion was amended to target `decodeHashes(CartRow)(table)`, per the
checkpoint's instruction. Worth noting the criterion as written would have passed anyway, for the
wrong reason: the literal `hashes()` appears in the module's prose. A grep-based criterion that a
COMMENT can satisfy is the mirror image of the grep-forbids-explaining edge this repo has now hit
four times.

### Rule 3 — the worktree had no `node_modules`

Fresh worktree; resolved with `pnpm install --frozen-lockfile`. `pnpm-lock.yaml` unmodified, no
package added, so no package-legitimacy checkpoint applied. Same as 11-02 and the prior 11-03 run.

### TDD gate sequence

Task 1 is marked `tdd="true"`. RED was observed and recorded rather than committed, matching 11-01,
11-02 and the prior run: with the pair on disk and no library change, `pnpm test` failed 4/4 on
`TypeError: Cannot read properties of undefined (reading 'hashes')`. GREEN is commit `5883ba7`
(the wiring) and `7216ac8` (the pair). A `test(...)` commit ahead of them would have committed a
state that could not pass by construction, since the pair and the library fix are one working state
split across two files.

### Not done, deliberately

`.planning/STATE.md` and `.planning/ROADMAP.md` are untouched — this ran as a parallel worktree agent
and the orchestrator owns shared-file writes. `.planning/REQUIREMENTS.md` is untouched for the reason
given above (PARSE-04's text is now true) and because RUN-06's structural proof
(`scripts/verify-acceptance-ref-state.sh`) is plan 11-05's.

## Notes for Future Plans

- **`verify-traceability.sh` check 4 is weaker than the acceptance README claims.** It greps for the
  bare id anywhere in `traceability.md`, so a tag merely MENTIONED in §5's prose satisfies the gate
  without a row. The prior run measured this: `@REQ-EC-014` passed while 004 and 015 failed, purely
  because the string `REQ-EC-014` sat in the not-yet-carried sentence. Not fixed here — it did not
  block this plan's criteria and the script is not this plan's to own — but whichever plan owns that
  script should tighten it to require a table row.
- **Section 5 carries eleven of 22.** The not-yet-carried list now reads `REQ-EC-001`–`REQ-EC-003`,
  `REQ-EC-005`–`REQ-EC-009`, and `REQ-EC-016`–`REQ-EC-018`.
- **A green suite does not mean a contract is honoured.** This gap survived five phases behind 782
  passing tests because the behavior doc had DECLINED to state the contract, and a gate cannot check
  what no document says. When a spec file says it "deliberately does not specify" something, that is
  a hole to schedule, not a boundary to respect.
- **Keep a mutation that stays green.** B is worth as much as C here, and a mutation record that
  drops its green entries quietly overstates every red one beside it.
- **`pnpm format` after touching `spec/traceability.md`** — dprint pads markdown table cells and
  `pnpm lint` runs `dprint check`.

## Known Stubs

None. Every Scenario asserts a value the library computed, and mutations A, C, D and E each turn a
different subset of them red. No hardcoded empty values, no placeholder text, no unwired components.

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or trust-boundary schema changes.
The one new file read is a committed fixture resolved relative to `import.meta.url`.

All four registered threats now have a measured mitigation, where the prior run could measure none:

| Threat | Mitigation, measured |
|--------|----------------------|
| T-11-03-01 (table→typed-row decode) | Mutation C: all 4 red on a located `RowDecodeFailed` |
| T-11-03-02 (Rule service reachable at Feature level) | Mutation D: fails to compile, `effect(missingEffectContext)`; `verify-tsgo-gate.sh` 12/13 stand guard |
| T-11-03-03 (Outline rows sharing state) | Mutation E: exactly one of two rows red |
| T-11-03-04 (a Scenario passing without the table reaching it) | Mutation A: 3 red from one `.feature` cell. This is what the prior run discovered in its extreme form — the table reached NO step |

## Self-Check: PASSED

Files verified present on disk:

- FOUND: `packages/vitest/test/acceptance/worked-example-03-discounts.feature`
- FOUND: `packages/vitest/test/acceptance/worked-example-03-discounts.steps.test.ts`
- FOUND: `packages/vitest/src/Plan.ts`
- FOUND: `packages/gherkin/test/StepArgs.types.ts`
- FOUND: `spec/behaviors/06-datatable-and-docstring-arguments.md`
- FOUND: `spec/traceability.md`

Both preserved drafts were `git mv`'d into the acceptance directory, so
`11-03-DRAFT-worked-example-03-discounts.feature.txt` and its sibling are correctly ABSENT.

Commits verified in `git log`:

- FOUND: `5883ba7` feat(11-03): deliver a step's DataTable and DocString to its step body
- FOUND: `7216ac8` feat(11-03): run the discounts worked example as a real acceptance pair
- FOUND: `74291df` docs(11-03): trace three more requirements and record the discounts mutations

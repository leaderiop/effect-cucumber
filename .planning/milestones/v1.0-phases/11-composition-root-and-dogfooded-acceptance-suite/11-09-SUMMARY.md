---
phase: 11-composition-root-and-dogfooded-acceptance-suite
plan: "09"
subsystem: docs-and-status-reconciliation
tags: [reconciliation, invariants, traceability, lint-recommendation, requirements, phase-close]
status: complete

requires:
  - "11-05's scripts/verify-acceptance-ref-state.sh — INV-EC-006's first real enforcement mechanism"
  - "11-05's scripts/verify-acceptance-no-any.sh — INV-EC-003's boundary over the acceptance suite"
  - "11-07 and 11-08's spec/process/looks-done-but-isnt-checklist.md and its three executors"
  - "11-08's measured P-14 and P-24 findings, which this plan's status prose must not overclaim past"
  - "the five acceptance pairs and their mutation records, which are the evidence RUN-06 is marked on"
provides:
  - "packages/vitest/README.md § Recommended lint and compiler configuration — D-04a, with three measured config blocks"
  - "a measured finding: oxlint's typescript/no-unsafe-* family is TYPE-AWARE and needs the separate oxlint-tsgolint package; enabled without it the rules are silently inert"
  - "spec/invariants.md with no planned mechanism left on the page — all six enforced, INV-EC-006's scope stated in both directions"
  - "spec/traceability.md §3's ADR-EC-009 row filled, the one Source module cell that names no packages/*/src module"
  - ".planning/REQUIREMENTS.md with RUN-06 Complete and v1 at 22 of 22"
  - "the three flagged edge assumptions carried out of the phase in writing rather than dropped"
affects:
  - "AGENTS.md — no longer says the project has no code; §4 gains the direction it was missing"
  - "README.md, spec/README.md, spec/roadmap.md, spec/process/definitions-of-done.md — status reconciled"
  - "spec/overview.md — one pointer to the new README section, no restatement"

tech-stack:
  added: []
  patterns:
    - "A configuration recommendation is MEASURED before it is written: every rule id in the new README section was run against a probe file, and the one family that did not fire is documented with the reason it did not rather than being listed as though it would"
    - "A criterion phrased as `grep -c 'None yet' == 0` is satisfiable two ways — by fixing the stale row, and by rewording the prose that DESCRIBES the stale row. Both were needed here; the second is the count-your-own-prose hazard this repo has now hit seven times"
    - "AGENTS.md §4 was one-directional ('do not claim what is not built') and the whole of this plan is the other direction. The rule now says so, because a shipped capability still described as planned is the failure mode nobody notices"
    - "A reconciliation plan that finds a status claim FALSE in the understating direction fixes it even when the claim predates the phase — leaving 'this project has no code yet' at the close of an eleven-phase build is not conservatism"

key-files:
  created:
    - .planning/phases/11-composition-root-and-dogfooded-acceptance-suite/deferred-items.md
  modified:
    - packages/vitest/README.md
    - spec/overview.md
    - spec/invariants.md
    - spec/traceability.md
    - spec/roadmap.md
    - spec/README.md
    - spec/process/definitions-of-done.md
    - README.md
    - AGENTS.md
    - .planning/REQUIREMENTS.md

decisions:
  - "The unsafe-value rule family is named in the README WITH its cost rather than recommended flatly. Measured: `typescript/no-unsafe-assignment` and its four siblings produce zero output on a probe file that obviously violates them, indistinguishably from a bogus rule name, because they are type-aware and oxlint 1.80.0 needs `oxlint-tsgolint` for them. `--type-aware` reports 'Failed to find tsgolint executable'. A consumer who copied a flat recommendation would get a config that silently does nothing, which is the same failure mode Pitfall 6 is about."
  - "`typescript/no-explicit-any` is the load-bearing recommendation, and it was verified to flag BOTH shapes Pitfall 6 names: a bare `any` annotation, and each of the three parameters in `Effect<any, any, any>` separately. It needs nothing beyond the `typescript` plugin already in this repo's own `.oxlintrc.json`."
  - "AGENTS.md was edited despite being outside the plan's declared file list. It opened with 'This project has no code yet' and carried three '(once code exists)' headings, at the close of the eleventh phase. PROH-11-01 forbids claiming a capability the repository does not have; the mirror is as damaging, and AGENTS.md is the file every agent reads first."
  - "`spec/README.md`'s ADR count read 'Thirteen' against 26 on disk. Fixed as a Rule 1 bug — it is a countable claim with no gate behind it, and `verify:spec` confirms 26."
  - "The `spec/README.md` Behaviors table lists 3 of 7 behavior documents. NOT fixed — logged to deferred-items.md. It is orthogonal to the acceptance suite and fixing it would have meant rewriting the reading-order advice in the same pass."
  - "`definitions-of-done.md`'s merge-gate table gained a Status column rather than being flipped wholesale to 'wired'. Two rows genuinely are not (doc-examples, coverage thresholds), and the table is still a MAP of `check.yml` rather than the literal command list it says it should be — so it says that about itself."

metrics:
  duration: ~1h
  completed: 2026-08-30

actuals:
  tokens: 28400
  tasks: 3
  commits: 3
---

# Phase 11 Plan 09: The Reconciliation, and the Last Invariant's First Real Source Summary

The closing plan of the phase and of the milestone's v1 requirement set. INV-EC-006 had been the one
row in `spec/traceability.md` §2 whose Test column named nothing since the matrix was written; plan
11-05 built the gate and this plan is where every document stops saying otherwise. **RUN-06 is
Complete, v1 reads 22 of 22, and all seventeen gates pass together.**

The plan's one genuinely new surface — D-04a's consumer lint recommendation — turned out to need
measuring rather than transcribing, and the measurement changed what it says.

## The recommendation is three settings, and one of them is not free

`.planning/research/PITFALLS.md` Pitfall 6 prescribes "`@typescript-eslint/no-unsafe-*` +
`noImplicitAny`". Written verbatim into this repository's own linter vocabulary that advice is
partly a trap, and the difference was measured against a probe file rather than assumed:

| Setting                                                  | Catches                                                                        | Measured                                                                                                                                    |
| -------------------------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `noImplicitAny` (implied by `strict`)                    | the IMPLICIT half — a binding nothing annotated                                | already what this repo's `tsconfig.base.json` runs; a consumer does not inherit it                                                          |
| `typescript/no-explicit-any`                             | the EXPLICIT half — a bare `any`, and each of the three in `Effect<any,any,any>` | **fires, three separate diagnostics on the Effect form**, oxlint 1.80.0, `typescript` plugin only                                           |
| `typescript/no-unsafe-assignment` and its four siblings  | the FLOW half — an `any` arriving from an untyped dependency, no token in your source | **silent.** Type-aware; needs `options.typeAware` AND the `oxlint-tsgolint` package. With `--type-aware` and no package: "Failed to find tsgolint executable" |

The last row is the one that mattered to get right. A bogus rule name produces **exactly the same
silence** as a real-but-inert type-aware rule — both exit 0 with no output — so a recommendation
listing those five rules flatly would hand a consumer a config that looks enabled and checks nothing.
That is the same shape as Pitfall 6 itself: a guarantee that is absent rather than wrong, with no
diagnostic to notice. The README names all five, states the extra package by name, and says they are
inert without it.

The FLOW half is not optional decoration either — it is the only one of the three that catches
Pitfall 6's second example, a dependency shipping `Effect<any, any, any>`, where the consumer's own
source contains no `any` token for the other two settings to see.

## INV-EC-006's scope, stated in both directions

The plan asked for the gate's coverage to be stated precisely. Reading
`scripts/verify-acceptance-ref-state.sh` rather than its summary produced a two-directional answer,
and both directions are now in the invariant:

- **Wider** than the invariant on the files it reaches. `DECLARATION_RE` is
  `(^|[^A-Za-z0-9_$])(let|var)[[:space:]]+[A-Za-z_$]` — a `let` or `var` at **any** scope, not only
  inside a DSL callback. A structural scan cannot resolve which declarations a step body closes
  over, so the superset is asserted deliberately rather than approximated.
- **Narrower** on two counts. It scans DECLARATIONS, so PROH-11-03's module-scope `const` holder is
  caught only in its in-place-mutator form (`MUTATOR_RE` covers `push`/`pop`/`shift`/`unshift`/
  `splice`/`sort`/`reverse`/`fill`). And it covers this repository only — **LINT-01** is named, in
  four places now, as the deferred half.

## What was reconciled

| Document                              | What stopped being true                                                                                       |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `spec/invariants.md`                  | header said four of six enforced and two planned; both counts were stale (INV-EC-005 since Phase 8)           |
| `spec/traceability.md` §2             | preamble carried the literal placeholder string it was describing the absence of                              |
| `spec/traceability.md` §2 row         | **Enforced by** did not name the gate script                                                                  |
| `spec/traceability.md` §3             | ADR-EC-009's Source module was a dash                                                                         |
| `spec/roadmap.md`                     | Current state stopped at Phase 10; the gate table's acceptance row was a placeholder; Planned's lint bullet did not know half of it had shipped |
| `spec/README.md`                      | doc-examples check "planned for once `packages/*` exists"; ADR count read thirteen against 26; Process row called the merge gate planned |
| `spec/process/definitions-of-done.md` | heading read "planned — no code exists yet"; the acceptance row named no directory and no gate                |
| `packages/vitest/README.md`           | "still ahead of this package: the dogfooded acceptance suite"                                                 |
| `README.md`                           | said tag routing (Phase 9) and the shared Layer (Phase 10) were **specified rather than built**               |
| `AGENTS.md`                           | "This project has no code yet", plus three "(once code exists)" headings                                      |

Two sentences were kept on purpose rather than swept: ADR-EC-024's wrapped `loadFeature` is still not
exported, and `packages/gherkin/test/fixtures/README.md`'s rule that no parser fixture may carry a
`@REQ-EC-NNN` tag is still true — asserted byte-identical, `git diff --exit-code` exit 0.

## What this plan deliberately did NOT overclaim

The prior-wave note warned against dressing up plan 11-08's two false checklist items. Both appear in
this plan's prose and both are stated at their measured strength:

- **Watch mode.** Written as "editing a `.feature` under a watching runner does not trigger a rerun
  when the file was loaded **by path**; the `?raw` form does" — a product gap, in the root README,
  `packages/vitest/README.md` and `spec/roadmap.md`. Not "watch mode works", and not "watch mode is
  broken".
- **Failure output.** A first draft of the roadmap paragraph said the failure "names neither the step
  text nor the `.feature` file and line". That is what the **failure panel** shows, but 11-08 also
  measured the step PATTERN reaching a separate stdout block through ADR-EC-005's `Effect.fn(pattern)`
  span. The sentence was corrected before commit to name both surfaces and the difference between
  them. Recorded here because the overclaim was in the negative direction, which is the easier one to
  let past.

## Verification — the full seventeen-gate sweep

Every command run individually against the final tree.

| Gate                               | Result                                                                    |
| ---------------------------------- | --------------------------------------------------------------------------- |
| `pnpm build`                       | exit 0 (`tsc -b`)                                                         |
| `pnpm typecheck:test`              | exit 0, both projects                                                     |
| `pnpm lint`                        | exit 0 (oxlint + dprint check)                                            |
| `pnpm test`                        | **39 files, 816 passed, 4 skipped (820)**                                 |
| `pnpm circular`                    | no circular dependency, 33 files processed                                |
| `pnpm verify:pack`                 | OK — publint clean on both packages                                       |
| `pnpm verify:spec`                 | **PASS 9, FAIL 0, SKIP 0** — 304 links, 26 ADRs, **22/22 requirements**   |
| `pnpm verify:tsgo-gate`            | ENFORCED, 13 checks                                                       |
| `pnpm verify:oxlint-plugin`        | ENFORCED                                                                  |
| `pnpm verify:no-runner-dep`        | ENFORCED                                                                  |
| `pnpm verify:testapi-seam`         | ENFORCED                                                                  |
| `pnpm verify:tags-filter`          | ENFORCED                                                                  |
| `pnpm verify:shared-layer-once`    | ENFORCED, three real CLI runs                                             |
| `pnpm verify:acceptance-ref-state` | ENFORCED — population 5/5, regex control 3 hits in `Runner.ts`            |
| `pnpm verify:acceptance-no-any`    | ENFORCED — population 5/5, regex control 3 hits in `Dsl.ts`               |
| `pnpm verify:watch-rerun`          | ENFORCED — rerun in ~1 s, run 2 total 2 > run 1 total 1                   |
| `pnpm verify:pitfalls`             | ENFORCED — **all 24 ids, 13 / 10 / 1**                                    |
| `git status --porcelain`           | clean after the sweep                                                     |

### Test count, and the delta from Phase 10

| Point                                    | Files  | Passed  | Skipped |
| ---------------------------------------- | ------ | ------- | ------- |
| End of Phase 10 (recorded in `10-07-SUMMARY.md`) | 32     | 773     | 3       |
| End of Phase 11 (this run)               | **39** | **816** | **4**   |
| **Delta**                                | **+7** | **+43** | **+1**  |

The +7 files are exactly the acceptance directory's seven collected test files (five `.steps.test.ts`
pairs, `pitfalls-checklist.test.ts`, `negative-requirements.test.ts`), which is the arithmetic
cross-check that Phase 11 added a directory rather than scattering tests. This plan itself added
zero tests — it is a documentation plan, and its own claim to correctness is that the seventeen gates
already in place stayed green against every sentence it changed.

### Plan-specific criteria, checked mechanically

- `grep -c 'None yet' spec/traceability.md` → **0**; `grep -c 'Source (planned)' spec/invariants.md` → **0**;
  `grep -c 'None yet' spec/roadmap.md` → **0**.
- `git diff --exit-code packages/gherkin/test/fixtures/README.md` → **exit 0**.
- `grep -c 'Pending' .planning/REQUIREMENTS.md` → 1, and that one occurrence is the coverage line
  reading `Pending: 0`. The v1 traceability table itself has none.
- All **15** paths named in the RUN-06 evidence paragraph verified present on disk.
- Repo-wide grep for the acceptance-suite-denial phrasings outside `.planning/` → **no matches**.

## Deviations from Plan

### Rule 1 — the plan's lint recommendation names a rule family this repository's linter cannot run as configured

The plan says to "enable the linter's unsafe-value rule family" and to "name the actual rule
identifiers as they appear in `.oxlintrc.json`'s vocabulary". Those identifiers exist
(`typescript/no-unsafe-assignment` and four siblings, per oxlint's own docs) but are type-aware and
require the separate `oxlint-tsgolint` package, which this repository does not install. Writing them
as a flat recommendation would have violated PROH-11-01 in the most damaging available way — advice
that a consumer can follow exactly and get nothing. The section names them, states the requirement,
and puts `typescript/no-explicit-any` first as the one that works unaided.

### Rule 1 — the "None yet" criterion was satisfiable by fixing the wrong thing

`grep -c 'None yet' spec/traceability.md` was **1**, and the hit was not a stale table cell. It was
plan 11-05's own preamble prose, correctly reporting that no Test column reads that string — while
containing the string. The seventh instance of count-your-own-prose in this project. The prose was
reworded to describe the state without quoting the placeholder; the actual stale cell was in
`spec/roadmap.md`, which the criterion did not name.

### Rule 1 — `spec/invariants.md`'s header was stale by two invariants, not one

The plan anticipated updating the count for INV-EC-006. The header also still counted INV-EC-005 as
unenforced, which Phase 8 had falsified three phases earlier. Both corrected.

### Rule 1 — `spec/README.md` claimed thirteen ADRs against 26 on disk

A countable claim with nothing checking it, in the same table this plan was editing. `pnpm verify:spec`
confirms 26.

### Rule 2 — AGENTS.md, outside the plan's file list, opened with "This project has no code yet"

Plus `## 3. Imports (once code exists)`, `## 5. Tests (once code exists)`, and a paragraph describing
`verify-traceability.sh` as one of "two gates … **planned**, not yet wired" when it has been wired
throughout. Corrected surgically, and §4 ("say only what is true") gained the direction it lacked:

> This cuts both ways, and the second direction is the one that rots quietly: a capability that HAS
> shipped must not still be described as planned.

That sentence is the generalisation of this entire plan, and its absence is why nine phases of
reconciliation left the file untouched.

### Rule 3 — the worktree had no `node_modules`

Fresh worktree; `pnpm install --frozen-lockfile`. `pnpm-lock.yaml` unmodified, no package added, so
no package-legitimacy checkpoint applied. Eighth consecutive plan to hit this.

### Out of scope, logged not fixed

`spec/README.md`'s Behaviors table lists 3 of 7 behavior documents (missing 04–07, and BEH-EC-013
from the 01 row), and the reading-order advice below it repeats the same defect. Recorded in
`deferred-items.md` in this phase directory. Nothing automated catches it — `verify-traceability.sh`
reads `behaviors/index.yaml`, which is complete and correct.

### Not done, deliberately

`.planning/STATE.md` and `.planning/ROADMAP.md` are untouched — this ran as a parallel worktree agent
and the orchestrator owns shared-file writes. `.planning/REQUIREMENTS.md` IS modified, because it is
in this plan's own `files_modified` and marking RUN-06 is Task 3's entire subject; plan 11-08's
summary explicitly deferred the marking to this plan.

## Assumptions carried out of the phase — all three OPEN

Recorded in `.planning/REQUIREMENTS.md`'s evidence paragraph as well, so they survive this directory.

**ASSUMPTION-11-A (adjacency) — unresolved, now permanent for this milestone.** The acceptance step
modules each declare a same-named `Context.Service` id and are assumed not to collide because vitest
isolates modules per file. It held. Plan 11-08's mutation G is the evidence the separation it forces
earns its runtime cost.

**ASSUMPTION-11-B (empty / single-element) — partly mitigated, still an assumption.** The population
and parse controls in 11-05 and 11-08 depend on external files continuing to contain what they
contain. 11-08 measured the mitigation narrower than predicted: the row-count control's
irreplaceable job is the GROWTH direction, not the shrink direction, which the contiguity loop
catches unaided.

**ASSUMPTION-11-C (ordering) — unresolved, and the sharpest of the three.** Several acceptance
assertions depend on vitest running a file's tests in DECLARATION ORDER, which is observed behavior
rather than a documented contract. Checklist item P-21 runs the Outline case under shuffled
sequencing; **no acceptance file is run shuffled as a whole.** Carried forward as an open follow-up.

## Known Stubs

None. This plan wrote no code and left no placeholder. Every configuration key, rule identifier and
count in the new README section was run or read before being written, and every path named in the
RUN-06 evidence paragraph was checked to exist on disk. The two reduced-form checklist items it
describes (P-14, P-24) are inherited from plan 11-08 and are stated at the strength that plan
measured, with the thing that would complete each one named.

## Threat Flags

None — no source change, no new endpoint, no auth path, no trust-boundary schema change.

All five registered threats have a mitigation that was exercised:

| Threat                                                             | Mitigation, as executed                                                                                                                                                                     |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-11-09-01 (a status document claiming more than the repo has)     | Every flipped claim names a failing artifact; the unsafe-rule family is the case where the plan's own instruction would have produced the violation, and it was caught by measuring first.   |
| T-11-09-02 (RUN-06 marked on documentation)                        | One artifact per roadmap success criterion, all 15 named paths verified on disk, and the full seventeen-gate sweep green.                                                                   |
| T-11-09-03 (the consumer-side gap disappearing from the record)    | LINT-01 named in `spec/invariants.md`, `spec/traceability.md` §2, `spec/roadmap.md` § Planned and `.planning/REQUIREMENTS.md` — four places, each stating the repository-vs-consumer boundary. |
| T-11-09-04 (the three assumptions lost when the phase closes)      | Recorded in `.planning/REQUIREMENTS.md` and in this summary, 11-C with its specific shape named.                                                                                            |
| T-11-09-05 (editing a rule that is still true to close the phase)  | `packages/gherkin/test/fixtures/README.md` asserted byte-identical; INV-EC-003's boundary paragraph gained a sentence and lost none, confirmed by `git diff -U0`.                            |

## Notes for Future Plans

- **`typescript/no-explicit-any` is not enabled in this repository.** The README now recommends it to
  consumers while `.oxlintrc.json` does not run it, and `verify-acceptance-no-any.sh` exists precisely
  because no oxlint rule enabled here objects. Turning the rule on repo-wide is a real, separable
  change — it would make the grep-based gate partly redundant over `.ts` files while leaving the
  `.feature` half, which no linter can do.
- **`oxlint-tsgolint` is the missing piece for type-aware linting.** If this project ever wants the
  unsafe-value family on its own source, that package plus `options.typeAware` is the whole
  requirement, and the recommendation section already documents the shape.
- **AGENTS.md §4 now cuts both ways, and that is a standing instruction to future reconciliation
  plans.** Nine of them read past "This project has no code yet". The rule that would have caught it
  is now written down.
- **`definitions-of-done.md` still says of itself that it is not the literal command list it should
  be.** There is no `pnpm check`. Adding one — a single script running the seventeen commands in
  order, with the table generated from or checked against it — is the change that would make that
  table un-driftable, and it is the natural successor to `verify-pitfalls-checklist.sh`'s coverage
  cross-check.
- **The `spec/README.md` Behaviors table has no gate.** `verify-traceability.sh` checks
  `behaviors/index.yaml` against disk but never reads the hand-maintained Contents table beside it,
  which is how it lost four rows. Same shape as the §1 Source module column the traceability preamble
  already tracks by hand.

## Self-Check: PASSED

Files verified present on disk:

- FOUND: `packages/vitest/README.md` (new § "Recommended lint and compiler configuration for your step modules", three config blocks, both gates linked)
- FOUND: `spec/overview.md` (exactly one pointer to that section, in the "A missing dependency is a compile error" paragraph)
- FOUND: `spec/invariants.md` (header rewritten; INV-EC-003 gained one sentence; INV-EC-006's scope stated both ways with LINT-01 named)
- FOUND: `spec/traceability.md` (§2 preamble and INV-EC-006 row; §3 preamble and ADR-EC-009 Source module)
- FOUND: `spec/roadmap.md` (Phase 11 paragraph in Current state; acceptance gate row; Planned lint bullet split)
- FOUND: `spec/README.md` (REQ-EC-NNN glossary row with the count; ADR count; Process row)
- FOUND: `spec/process/definitions-of-done.md` (merge-gate table with a Status column; test pyramid all three levels)
- FOUND: `README.md` (Status reconciled through Phase 11)
- FOUND: `AGENTS.md` (§1, §2, §3, §4, §5)
- FOUND: `.planning/REQUIREMENTS.md` (RUN-06 checked, row Complete, coverage 22 ✓ / Pending 0, evidence paragraph)
- FOUND: `.planning/phases/11-composition-root-and-dogfooded-acceptance-suite/deferred-items.md`

Commits verified in `git log`:

- FOUND: `a78f2fd` docs(11-09): recommend a consumer lint and compiler configuration for INV-EC-003's boundary
- FOUND: `c8b01a6` docs(11-09): give INV-EC-006 its enforced record and retire every status sentence the acceptance suite falsifies
- FOUND: `e3bdec5` docs(11-09): mark RUN-06 Complete with per-criterion evidence — v1 reads 22 of 22

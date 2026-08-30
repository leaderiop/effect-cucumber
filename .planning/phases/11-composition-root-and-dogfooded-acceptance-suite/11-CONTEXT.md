# Phase 11: Composition Root and Dogfooded Acceptance Suite - Context

**Gathered:** 2026-08-30
**Status:** Ready for planning

<domain>
## Phase Boundary

The library runs its own spec end to end. Concretely, four things become
true:

1. Every worked example in `spec/behaviors/01-steps-and-world.md`,
   `02-shared-layers-and-tags.md`, and `03-rules-outlines-and-testclock.md`
   runs green as a real `.feature` + `.steps.ts` pair under
   `packages/vitest/test/acceptance/` (the ARCHITECTURE.md-proposed
   location — `packages/vitest/test/acceptance/*.feature` — already
   anticipated as this phase's home, not a new workspace package).
2. Cross-step Scenario state in every acceptance step flows through a `Ref`
   from `World`, never a closed-over `let`/`var` (RUN-06, INV-EC-006).
3. All 22 v1 requirements get a `@REQ-EC-NNN` acceptance tag and
   `spec/traceability.md` §5 reports 22/22 covered — closing the one
   traceability section every phase since Phase 2 has deliberately kept
   empty (`spec/scripts/verify-traceability.sh` check 4 already exists and
   currently SKIPs cleanly; this phase is what makes it PASS).
4. PITFALLS.md's 24-item "Looks Done But Isn't" checklist runs in full and
   passes, and INV-EC-003's `any`-boundary wording (already present in
   `spec/invariants.md`, landed by an earlier phase) gets its companion
   lint recommendation.

This is validation and closure work, not new design — no new public API,
no new ADRs expected (only traceability/wording updates to existing ones
if a gap surfaces during implementation).

</domain>

<decisions>
## Implementation Decisions

### REQ-EC-NNN traceability scheme
- **D-01:** Strict 1:1 mapping — exactly 22 `@REQ-EC-NNN` tags
  (`REQ-EC-001`..`REQ-EC-022`), one per v1 requirement in
  `.planning/REQUIREMENTS.md`, each tag placed on exactly one acceptance
  Scenario. `spec/traceability.md` §5 gets an explicit mapping table:
  `REQ-EC-NNN` ↔ v1 requirement ID (`PARSE-01`, `MATCH-03`, `DSL-05`, etc.)
  ↔ the `.feature` file carrying it. This matches
  `spec/process/requirement-id-scheme.md`'s "allocated contiguously, in the
  order written" rule and makes "22/22 covered" a literal, greppable count
  rather than a judgment call.

### Error/negative requirements (MATCH-03, MATCH-04, MATCH-05, PARSE-03)
- **D-02:** These four requirements are "fails loudly" behaviors — a
  Scenario demonstrating them directly would be a red test, not a green
  one. Prove them via a **satisfied/starved fixture pair**, mirroring
  `scripts/verify-tsgo-gate.sh`'s established pattern (Phase 1): a
  deliberately-failing `.feature` fixture (e.g. an unmatched step, an
  ambiguous match, an un-interpolated Background placeholder) carries the
  `@REQ-EC-NNN` tag, and a wrapper test under
  `packages/vitest/test/acceptance/` runs `describeFeature`/`Plan` against
  that fixture and asserts the specific named error is thrown. The wrapper
  test is what passes; the fixture is the tagged artifact.
  — **Reversibility:** reversible — this is a test-authoring pattern, not a
  public contract; changing it later touches only the four new fixture/test
  pairs.

### PITFALLS.md checklist depth
- **D-03:** Most feature-rich option, chosen deliberately over reusing
  existing coverage: write a **fresh, dedicated test for every one of the
  24 checklist items**, even where an equivalent assertion already exists
  elsewhere in the repo (e.g. Phase 2's zero-step-Scenario test, Phase 6's
  unmatched-step test). The checklist becomes a literally re-runnable,
  self-contained suite rather than a citation list pointing at scattered
  existing tests. Where an item is inherently a dev-loop/manual thing
  (watch mode — Pitfall 3; failure-panel legibility — Pitfall 31), automate
  what's practical (e.g. a scripted `vitest --watch` smoke check that
  edits a `.feature` file and asserts a rerun picks up the new Scenario)
  rather than leaving it manual-only by default.
  — **Reversibility:** reversible — additive test files; removing
  duplication later is a cleanup pass, not a behavior change.

### INV-EC-003 lint recommendation
- **D-04:** Most feature-rich option: go beyond the original
  docs-only scope (`.planning/research/PITFALLS.md` Pitfall 6 names this
  phase's job as "lint recommendation in docs"). Do BOTH:
  (a) add the recommendation text (recommend `no-unsafe-*`-equivalent
  oxlint rules + `noImplicitAny` for consumers' step modules) to
  `spec/overview.md` or the `packages/vitest` README, next to or near
  INV-EC-003's existing wording; AND
  (b) add a concrete enforced guard in this repo dogfooding that advice —
  a grep-based or oxlint-based check that the acceptance suite's own
  `.steps.ts` files contain zero `any`, following the same "prove it, don't
  just assert it" convention used throughout this project (e.g.
  `scripts/verify-no-runner-dep.sh`, `pnpm verify:oxlint-plugin`).
  — **Reversibility:** reversible — a new doc paragraph plus a new gate
  script; removing either is a small, local change.

### Claude's Discretion
- Exact number and grouping of acceptance `.feature` files beyond the 3
  worked-example pairs named in Success Criterion 1 — additional pairs are
  needed to reach 22/22 requirement coverage (e.g. hooks, datatable/
  docstring, tags, matching happy-path). Which requirements group into
  which additional `.feature` file(s) is a planner-level packaging
  decision, not re-opened here — follow the natural domain grouping
  `spec/behaviors/04`-`07` already establish (parse/validation, step
  matching, datatable/docstring, hook ordering).
- Exact mechanism for the "no acceptance step closes over a `let`/`var`"
  proof (RUN-06, INV-EC-006, roadmap SC#2) — likely a grep-based check
  over `packages/vitest/test/acceptance/*.steps.ts` following
  `Registry.ts`'s established "assert structurally, don't trust a code
  review" convention. Not re-litigated here; this is implementation
  detail.
- Naming of new scripts (the satisfied/starved wrapper test file(s), any
  new watch-mode smoke script, the zero-`any` acceptance-suite guard) —
  follow the existing convention (`scripts/verify-*.sh` for CLI-run gates,
  `*.test.ts` for in-process tests).
- Whether the `spec/traceability.md` §5 mapping table is generated by hand
  or by a small script reading the `.feature` files' tags — either is fine
  as long as it stays accurate; this project has precedent for both
  (`spec/traceability.md` §4 is hand-enumerated-from-disk per its own
  documented convention).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements and success criteria this phase closes
- `.planning/REQUIREMENTS.md` — RUN-06 (the only Pending v1 requirement)
  and all 21 already-Complete requirements this phase must retroactively
  tag with `@REQ-EC-NNN` for traceability
- `.planning/ROADMAP.md` §"Phase 11: Composition Root and Dogfooded
  Acceptance Suite" — goal, 4 success criteria, depends on Phases 1-10

### Worked examples to dogfood (Success Criterion 1)
- `spec/behaviors/01-steps-and-world.md` §"Worked example" — the
  Given/When/Then/World base case
- `spec/behaviors/02-shared-layers-and-tags.md` §"Worked example" —
  shared-Layer + tags composition
- `spec/behaviors/03-rules-outlines-and-testclock.md` §"Worked example" —
  the discount-codes Rule + Scenario Outline + TestClock example, already
  the north-star reference for Phase 8's acceptance-style tests too
- `spec/decisions/014-loadfeature-consumes-gherkindocument-and-pickles.md`,
  `007-cucumber-expressions-for-step-matching.md`,
  `017-background-and-scenario-are-step-definition-containers.md`,
  `018-shared-layer-testclock-isolation.md` — the ADRs whose corrections
  already fixed these worked examples; this phase proves the corrected
  form actually runs, not just reads consistently

### Traceability mechanics (Success Criterion 3)
- `spec/process/requirement-id-scheme.md` — the `REQ-EC-NNN` ID family
  definition, "allocated contiguously" rule, and the general amend-vs-
  supersede discipline
- `spec/traceability.md` §5 ("Acceptance scenario traceability", currently
  empty by design) and its preamble ("Traceability chain" diagram) — the
  exact section this phase fills in
- `spec/scripts/verify-traceability.sh` check 4 (lines ~120-135) — already
  greps every `.feature` file repo-wide for `@REQ-EC-[0-9]{3}` tags and
  fails if one isn't defined in `traceability.md`; currently SKIPs cleanly
  with zero tags in the repo
- `spec/README.md` (REQ-EC-NNN glossary row) and
  `spec/process/definitions-of-done.md` (row 4: "Cucumber acceptance
  suite" definition of done) — both already describe this phase's
  deliverable in general terms
- `.planning/research/ARCHITECTURE.md` (~line 140, ~line 431) — proposes
  `packages/vitest/test/acceptance/*.feature` as the acceptance suite's
  location, tagged `@REQ-EC-NNN`; treat as the established location, not
  an open question
- Every prior phase's explicit "no REQ-EC- row added yet, that's Phase 11's
  job" note — `.planning/phases/02-.../02-11-SUMMARY.md`,
  `.planning/phases/03-.../03-06-SUMMARY.md`,
  `.planning/phases/04-.../04-01-PLAN.md` and `04-05-PLAN.md`,
  `.planning/phases/05-.../05-06-PLAN.md` — all confirm no `.feature`
  fixture anywhere in the repo may carry a `@REQ-EC-NNN` tag except the new
  acceptance suite this phase creates

### PITFALLS.md checklist (Success Criterion 4)
- `.planning/research/PITFALLS.md` §"Looks Done But Isn't Checklist"
  (~line 1009) — the full 24-item list this phase must run in full and
  pass
- `.planning/research/PITFALLS.md` §"Pitfall 6" (~line 200) — the
  `any`-erases-the-guarantee finding; "Phase to address: P4 (amend
  wording), P10 (lint recommendation in docs)" — P4/P10 are this
  research doc's own pre-roadmap-renumbering phase names, mapping to
  Phase 5 (done) and Phase 11 (this phase) after the documented +1 shift
- `spec/invariants.md` §INV-EC-003 — the wording already amended with the
  "holds for step bodies free of `any`" boundary condition (verify it's
  still accurate; do not re-word unless a real gap is found)

### Established "prove it, don't just assert it" precedents to follow
- `scripts/verify-tsgo-gate.sh` (Phase 1) — the satisfied/starved fixture
  pair pattern D-02 above extends to MATCH-03/04/05 and PARSE-03
- `scripts/verify-no-runner-dep.sh`, `scripts/verify-testapi-seam.sh`,
  `scripts/verify-tags-filter.sh` (Phases 1, 9) — the "real CLI run /
  structural grep, never a citation" convention D-03 and D-04's new guard
  should follow

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/vitest/src/index.ts`'s public surface (`describeFeature`,
  `Given`/`When`/`Then`/`And`/`But`, `Background`, `Scenario`,
  `ScenarioOutline`, `Rule`, all six hooks, `gherkinTags`) — everything the
  acceptance suite's `.steps.ts` files will import already exists and is
  stable; this phase is a pure consumer of it, adding no new exports.
- `packages/gherkin/test/fixtures/README.md`'s Group A/B/C/D fixture
  convention and byte-exactness rules — the established pattern for how
  `.feature` fixtures document their own purpose; the new acceptance
  fixtures should follow an equivalent convention, scoped to
  `packages/vitest/test/acceptance/`.
- `scripts/verify-tsgo-gate.sh`'s satisfied/starved fixture pair
  (`packages/vitest/test/tsgo-gate/`) — direct template for D-02's
  error-requirement proof mechanism, one level up (runtime error instead
  of a compile diagnostic).

### Established Patterns
- Every `.feature` fixture in the repo to date has been a **parser**
  fixture (`packages/gherkin/test/fixtures/`) or a **tag-scanning**
  fixture (`packages/vitest/test/fixtures/tag-scan-*.feature`) — none has
  ever run through a real `describeFeature` + real step definitions to
  produce real passing `it.effect` tests. `packages/vitest/test/
  emission.test.ts` comes closest (real `describeFeature` calls, inline
  fixture strings) but is still a unit test with throwaway step bodies,
  not a dogfooded, `@REQ-EC-NNN`-tagged acceptance suite.
- This repo's own convention (confirmed repeatedly in STATE.md decisions
  across Phases 1-10): a grep-based acceptance criterion that forbids a
  literal also forbids explaining it in a comment — word the zero-`any`
  guard (D-04) and the RUN-06 zero-`let`/`var`-closure guard the same
  intent-preserving way prior gates learned to (strip comment lines before
  counting).
- Mutation-testing every new gate before considering it done — established
  since Phase 1, repeated every phase since. The satisfied/starved wrapper
  tests (D-02) and the new checklist tests (D-03) should get the same
  treatment: prove the assertion actually fails against a broken
  implementation, not just that it passes against the correct one.

### Integration Points
- `packages/vitest/test/` is where the new `acceptance/` subdirectory goes
  (`*.feature` + `*.steps.ts` pairs, plus the satisfied/starved wrapper
  tests for D-02 and the checklist tests for D-03).
- `spec/traceability.md` §5 is the single file the new REQ-EC-NNN mapping
  table (D-01) writes into; §6 ("Coverage targets") is adjacent and
  currently states untracked 90% targets — worth a glance but not this
  phase's job to wire (no `vitest.config.ts` coverage thresholds are
  scoped here unless the planner finds it trivially in reach).
- `pnpm-workspace.yaml` needs no change — the acceptance suite lives inside
  the existing `packages/vitest` package, not a new workspace member.

</code_context>

<specifics>
## Specific Ideas

No new UI/behavior preferences — this phase's entire discussion was about
proof rigor and traceability mechanics for already-fully-specified
behavior, matching this project's established "verify by running it,
prove it structurally" culture from every prior phase. The user's
consistent instinct, restated explicitly this phase ("most feature-rich
solution" for every open question), is to prefer the more complete/
thorough option over the narrowest reading of the roadmap wording — same
pattern noted in Phase 8's and Phase 10's CONTEXT.md.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. No todos matched Phase 11
(`todo.match-phase` returned zero matches). `spec/traceability.md` §6's
untracked coverage-threshold targets came up as an adjacent observation,
not a request — left for a future phase unless the planner finds wiring
it in trivially cheap alongside this phase's other work.

</deferred>

---

*Phase: 11-composition-root-and-dogfooded-acceptance-suite*
*Context gathered: 2026-08-30*

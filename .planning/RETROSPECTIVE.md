# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.0 — MVP

**Shipped:** 2026-08-30
**Phases:** 11 | **Plans:** 85

### What Was Built
- A synchronous, correlated `loadFeature` that turns `.feature` files into typed `ParsedFeature` data, surfacing every known silent-failure mode of `@cucumber/gherkin`'s `compile()` as a named, located error.
- `describeFeature`'s core value proposition: a step needing a service the Layer doesn't provide is a real compiler diagnostic (`missingLayerContext`/`missingEffectContext`), not a runtime surprise.
- A full registration → plan → emit pipeline (hooks, Rules, Scenario Outlines, tags, both Layer scopes) where unmatched, ambiguous, and unused steps fail or warn loudly instead of passing silently.
- Three worked examples and a dogfooded acceptance suite closing traceability for all 22 v1 requirements, each backed by a named, mutation-proven automated assertion.

### What Worked
- Writing the full spec (20 ADRs, 13 behaviors) before any code, then running a 4-dimension research pass (Stack/Features/Architecture/Pitfalls) against the actually-installed libraries — this caught three real bugs in the locked spec itself (a broken worked example, a contradictory registry lifecycle, a `TestClock` leak that contradicted a stated core value) before implementation cost was sunk into them.
- Building bottom-up along the verified module dependency graph (`gherkin` before `vitest`, pure data before the type surface, registration before hooks before Rules/Outlines/tags, `shared` Layer deliberately last as the one path proven to behave differently) — two independent research streams converged on nearly the same phase order.
- Mutation-testing discipline applied as standard practice, not just at milestone close: nearly every plan's SUMMARY records a mutation performed and reverted to prove its own assertion isn't vacuous, catching things like a positive control too weak to fail on a suffix rename (09-08) and a warning that had literally never printed once despite passing tests (09-06).
- The `TestApi` injection seam, which kept `Runner.ts`/`Plan.ts` assertable against a recording fake with zero real vitest machinery in scope, and was itself protected by a structural gate (`verify:testapi-seam`) rejecting any test-framework import creeping into those modules.

### What Was Inefficient
- A documentation gap (spec/README.md's Behaviors table listing 3 of 7 files) was found during Phase 11 plan 11-09 and explicitly logged as "not fixed here," then sat unresolved until the milestone-close audit caught it — a phase-local deferred item with no forcing function to close it before close time.
- Phase 8's Rule registration plan split into 08-05a/08-05b mid-phase, suggesting the original plan granularity underestimated how much two nesting levels (Feature-level vs. Rule-level Scenario) actually differed in implementation.
- Three assumptions from Phase 11's "spec-less edge probe" were recorded as open rather than closed (module-id collision across acceptance files, population/parse-control robustness to external file changes, and vitest's declaration-order execution being observed rather than documented behavior) — real, load-bearing gaps carried into v1.1 rather than resolved.

### Patterns Established
- A phase's traceability isn't "done" until a named, running assertion fails when the requirement stops being true — REQUIREMENTS.md's footer names the specific test/gate behind each requirement rather than just checking a box.
- Deferred items get their own `deferred-items.md` per phase, logged with enough context (found-during, why-not-fixed-here) to be actionable later rather than lost.
- A structural/regex-based enforcement gate documents its own blind spots explicitly (e.g., `verify-acceptance-ref-state.sh`'s README noting it scans declarations, not the general module-scope-holder case) rather than letting a green run imply more coverage than it has.

### Key Lessons
1. Researching a locked spec against real, installed third-party APIs before writing code against it is worth doing even when the spec is already "done" — the highest-value bugs found this milestone were in the spec, not the implementation.
2. A deferred item logged mid-phase needs a check at milestone close, not just at phase close, or it silently survives until someone happens to audit for it.
3. Mutation-proving an assertion (not just writing it) is what catches a positive control that's too weak or an assertion that's accidentally vacuous — several of this milestone's gates were revised only because a recorded mutation didn't turn them red.

### Cost Observations
- Model mix and session count: not tracked at the project-artifact level for this milestone.
- Notable: 85 plans across 11 phases in a ~3-day timeline (2026-08-28 → 2026-08-30), with the spec/research groundwork done ahead of Phase 1.

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Sessions | Phases | Key Change |
|-----------|----------|--------|------------|
| v1.0 | — | 11 | First milestone — spec-first + GSD research pass adopted from the start |

### Cumulative Quality

| Milestone | Tests | Coverage | Zero-Dep Additions |
|-----------|-------|----------|---------------------|
| v1.0 | 796+ (per Phase 11 acceptance run) | 22/22 v1 requirements traced | — |

### Top Lessons (Verified Across Milestones)

1. Spec-first + real-API research before implementation catches spec bugs cheaply — v1.0 only, not yet cross-validated by a second milestone.

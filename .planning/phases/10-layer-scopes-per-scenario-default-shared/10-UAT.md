---
status: complete
phase: 10-layer-scopes-per-scenario-default-shared
source: [10-VERIFICATION.md]
started: 2026-08-30T14:05:59Z
updated: 2026-08-30T22:25:00Z
---

## Current Test

[testing complete]

## Tests

### 1. WR-01 — `Runner.ts` note (a) makes a demonstrably false claim about the seam gate
expected: |
  `Runner.ts` note (a) claims "Neither name is written out anywhere in this file, comments
  included" and that the acceptance grep "cannot tell a citation from an import." Both clauses
  are checkable and both are false: `vitest` appears in 9 comment lines, and
  `scripts/verify-testapi-seam.sh` strips comment lines (`COMMENT_RE`) before matching, so it
  demonstrably CAN tell a citation from an import. Plan 10-07 propagated the false claim into
  new text at `Runner.ts:212`. Decide: narrow the note to the true claim, or accept as-is.
result: pass
reported: "Narrowed note (a) to the true claim (no IMPORT of a test framework; a citation in
  prose is not a violation) and deleted the propagated false clause at :212's 'exactly as note
  (a) refuses to'. Fixed at commit 3152546. Verified: `pnpm test`, `pnpm lint`,
  `pnpm typecheck:test` all green."

### 2. WR-02 — `EmitOptions.contextFree`'s doc comment describes a predicate the code doesn't compute
expected: |
  The doc comment specifies `contextFree` as a predicate over a node's BODY, but `Runner.ts`
  sets it per node KIND, hard-coded. All four current call sites are correct (independently
  verified), but the doc's literal wording invites a future maintainer to mark a Scenario
  `contextFree: true`, which would silently drop that Scenario's isolated `TestEnv` on the
  shared path with nothing failing. Decide: correct the doc comment, or accept as-is.
result: pass
reported: "Rewrote the doc comment in TestApi.ts to state contextFree as a routing decision
  (which emission ROUTE, set per node kind) rather than a body predicate, and named the silent
  failure direction (a Scenario marked contextFree: true silently loses shared-tier isolation
  for clock/console-only steps, with nothing going red). Fixed at commit 88233fe."

### 3. WR-03 — the new structural routing test only pins the Feature-level Scenario loop
expected: |
  `Runner.ts` emits Scenarios from two loops (Feature-level and Rule-nested); both are
  correctly hard-coded `contextFree: false` (independently verified by direct source read).
  `Runner.test.ts`'s new `routingOf` assertion only exercises the Feature-level loop via the
  `checkout` fixture. Flipping the Rule-nested site's flag would leave `Runner.test.ts` green;
  only an incidental `emission.test.ts` fixture would catch it. Decide: add a second `routingOf`
  assertion against a Rule-bearing fixture, or accept the narrower coverage.
result: pass
reported: "Added the second routingOf test against the `shop` fixture (one Rule, two
  Scenarios), pinning Runner.ts's Rule-nested Scenario loop. Mutation-verified: flipped
  Runner.ts:651's contextFree to true, confirmed the new test (and only that test) went RED,
  reverted. Fixed at commit f64b8cc. `pnpm test`: 39 files / 822 passed."

### 4. WR-04 — the non-vacuity control's own comment overstates its soundness
expected: |
  `emission.test.ts`'s new non-vacuity control comment claims the printed unused-step-definition
  console line is a "sound proxy" for the `⚠` node's emission because both come from the same
  `plan.warnings` array — but they travel two independent code paths. The control does not
  currently pass vacuously (independently confirmed), but the comment's stated justification
  would stay green even if a future change decoupled the two paths. Decide: correct the comment
  to cite the actual pinning assertion in `Runner.test.ts`, or accept as-is.
result: pass
reported: "Replaced the false 'sound proxy' claim with an honest description of the two
  independent code paths (describeFeature.ts's console-line loop vs Runner.ts's node-emission
  loop), and cited Runner.test.ts's 'emits identical ⚠ nodes...' test as what actually pins the
  node. Fixed at commit bdeb889."

### 5. WR-05 — BEH-EC-007's new correction is internally self-contradictory
expected: |
  The correction calls the zero-runnable-Scenario boundary "a STRENGTHENING... not a
  divergence" one sentence after conceding "Read literally, 'exactly once' would say once. The
  answer that matches the rest of the system is zero." Both sentences are present as quoted and
  are in tension — the fenced REQUIREMENT block still reads an unqualified "MUST be built
  exactly once," which 0 builds does not literally satisfy. RUN-03/RUN-04 were marked Complete
  in the same plan against this text. This is the finding most directly touching whether that
  marking is honestly grounded in the spec as written. Decide between: (a) reword to match the
  sibling RELEASE correction's own convention (call it a divergence, leave the requirement
  standing so the gap stays visible), (b) amend the fenced REQUIREMENT block itself to state the
  boundary in the MUST clause, or (c) accept the current wording.
result: pass
reported: "Took option (b), the review's primary recommendation: amended the fenced
  REQUIREMENT block to 'MUST be built AT MOST ONCE ... exactly once when the Feature emits at
  least one node whose body needs it, and ZERO times when it emits none', citing ADR-EC-026.
  Rewrote the second correction's framing to describe the amendment rather than claim a
  self-contradictory 'strengthening, not a divergence'. RUN-03/RUN-04's Complete marking is now
  honestly grounded — the requirement states what shipped. Fixed at commit c902bb3."

### 6. WR-06 — a cross-reference misattributes a carve-out to the wrong behavior document
expected: |
  `spec/behaviors/02-shared-layers-and-tags.md` line 166 attributes the `AfterAllScenarios`
  teardown suppression to "this behavior's own carve-out" while linking to BEH-EC-017, a
  different behavior. Decide: correct the attribution to name BEH-EC-017 explicitly, or accept
  as-is.
result: pass
reported: "Corrected the attribution: 'suppressed in this situation by [BEH-EC-017]'s own
  carve-out' rather than 'this behavior's own carve-out'. Fixed at commit c902bb3 (same commit
  as WR-05, same file)."

### 7. WR-07 — the behavior-changing commit and its spec-documenting commits landed separately
expected: |
  Commit `743e9a0` (the code fix, five files under `packages/vitest/`) landed separately from
  the `spec/` commits documenting it (`e63ba4f`, `6b95833`), with several intermediate commits
  on `main` in between during which `spec/` still asserted the old, unqualified build-once MUST
  while the shipped code had already diverged from it. Decide: accept this split as tolerable
  for a fast, single-session gap-closure sequence, or revisit the code-plan/spec-plan
  decomposition convention for future behavior-changing gap closures.
result: pass
reported: "Accepted as tolerable — this is a retrospective process finding about a commit
  sequence that already landed correctly (spec was updated within the same gap-closure
  session, just not the same commit), not a present defect. No code or spec change applies.
  Noted for future gap-closure plans: prefer landing a behaviour change and its spec/
  update in the same commit where practical."

## Summary

total: 7
passed: 7
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none — all 7 findings resolved directly during this UAT session; see commits 3152546, 88233fe,
f64b8cc, bdeb889, c902bb3]

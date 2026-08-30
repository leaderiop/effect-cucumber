---
status: testing
phase: 10-layer-scopes-per-scenario-default-shared
source: [10-VERIFICATION.md]
started: 2026-08-30T14:05:59Z
updated: 2026-08-30T14:05:59Z
---

## Current Test

number: 1
name: WR-01 — `Runner.ts` note (a) makes a demonstrably false claim about the seam gate
expected: |
  Either the note is narrowed to the true claim (no IMPORT of a test framework, not "the
  name is never written"), or a maintainer accepts the current wording as-is.
awaiting: user response

## Tests

### 1. WR-01 — `Runner.ts` note (a) makes a demonstrably false claim about the seam gate
expected: |
  `Runner.ts` note (a) claims "Neither name is written out anywhere in this file, comments
  included" and that the acceptance grep "cannot tell a citation from an import." Both clauses
  are checkable and both are false: `vitest` appears in 9 comment lines, and
  `scripts/verify-testapi-seam.sh` strips comment lines (`COMMENT_RE`) before matching, so it
  demonstrably CAN tell a citation from an import. Plan 10-07 propagated the false claim into
  new text at `Runner.ts:212`. Decide: narrow the note to the true claim, or accept as-is.
result: [pending]

### 2. WR-02 — `EmitOptions.contextFree`'s doc comment describes a predicate the code doesn't compute
expected: |
  The doc comment specifies `contextFree` as a predicate over a node's BODY, but `Runner.ts`
  sets it per node KIND, hard-coded. All four current call sites are correct (independently
  verified), but the doc's literal wording invites a future maintainer to mark a Scenario
  `contextFree: true`, which would silently drop that Scenario's isolated `TestEnv` on the
  shared path with nothing failing. Decide: correct the doc comment, or accept as-is.
result: [pending]

### 3. WR-03 — the new structural routing test only pins the Feature-level Scenario loop
expected: |
  `Runner.ts` emits Scenarios from two loops (Feature-level and Rule-nested); both are
  correctly hard-coded `contextFree: false` (independently verified by direct source read).
  `Runner.test.ts`'s new `routingOf` assertion only exercises the Feature-level loop via the
  `checkout` fixture. Flipping the Rule-nested site's flag would leave `Runner.test.ts` green;
  only an incidental `emission.test.ts` fixture would catch it. Decide: add a second `routingOf`
  assertion against a Rule-bearing fixture, or accept the narrower coverage.
result: [pending]

### 4. WR-04 — the non-vacuity control's own comment overstates its soundness
expected: |
  `emission.test.ts`'s new non-vacuity control comment claims the printed unused-step-definition
  console line is a "sound proxy" for the `⚠` node's emission because both come from the same
  `plan.warnings` array — but they travel two independent code paths. The control does not
  currently pass vacuously (independently confirmed), but the comment's stated justification
  would stay green even if a future change decoupled the two paths. Decide: correct the comment
  to cite the actual pinning assertion in `Runner.test.ts`, or accept as-is.
result: [pending]

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
result: [pending]

### 6. WR-06 — a cross-reference misattributes a carve-out to the wrong behavior document
expected: |
  `spec/behaviors/02-shared-layers-and-tags.md` line 166 attributes the `AfterAllScenarios`
  teardown suppression to "this behavior's own carve-out" while linking to BEH-EC-017, a
  different behavior. Decide: correct the attribution to name BEH-EC-017 explicitly, or accept
  as-is.
result: [pending]

### 7. WR-07 — the behavior-changing commit and its spec-documenting commits landed separately
expected: |
  Commit `743e9a0` (the code fix, five files under `packages/vitest/`) landed separately from
  the `spec/` commits documenting it (`e63ba4f`, `6b95833`), with several intermediate commits
  on `main` in between during which `spec/` still asserted the old, unqualified build-once MUST
  while the shipped code had already diverged from it. Decide: accept this split as tolerable
  for a fast, single-session gap-closure sequence, or revisit the code-plan/spec-plan
  decomposition convention for future behavior-changing gap closures.
result: [pending]

## Summary

total: 7
passed: 0
issues: 0
pending: 7
skipped: 0
blocked: 0

## Gaps

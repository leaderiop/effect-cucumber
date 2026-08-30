---
phase: 10-layer-scopes-per-scenario-default-shared
verified: 2026-08-30T14:02:56Z
status: passed
score: 16/16 must-haves verified
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 10/11
  gaps_closed:

    - "A shared Layer with every Scenario excluded by the tag filter is never built (RUN-03's build-discipline promise read with RUN-05/ADR-EC-026's registration-time exclusion contract) — closed by plan 10-07's `EmitOptions.contextFree` routing flag"
  gaps_remaining: []
  regressions: []
gaps: []
deferred: []
behavior_unverified_items: []
coincidental_reliance_items: []
human_verification:

  - test: "WR-01 (10-REVIEW.md): `Runner.ts` note (a) claims 'Neither name is written out anywhere in this file, comments included' and that the acceptance grep 'cannot tell a citation from an import.' Both clauses are checkable and both are false: `grep -n vitest packages/vitest/src/Runner.ts` returns 9 comment-line hits (9, 18, 36, 37, 64, 65, 222, 260, 476, 700 in the reviewed diff), and `scripts/verify-testapi-seam.sh` strips comment lines (`COMMENT_RE`) before matching, so it demonstrably CAN tell a citation from an import. Plan 10-07 propagated the false claim into new text at Runner.ts:212 ('exactly as note (a) refuses to')."
    expected: "Either the note is narrowed to the true claim (no IMPORT of a test framework, not 'the name is never written'), or a maintainer accepts the current wording as-is."
    why_human: "This is a documentation-truthfulness judgment call under this repo's own AGENTS.md §4 ('say only what is true') — the underlying seam gate (`verify:testapi-seam`) still functions correctly and this verifier confirmed that independently; only the doc comment's self-description is wrong. Not a runtime defect, so it does not gate the phase's behavioral truths, but AGENTS.md treats a false normative claim as a defect in its own right."

  - test: "WR-02 (10-REVIEW.md): `EmitOptions.contextFree`'s doc comment specifies it as a predicate over a node's BODY ('true when this node's body requires NOTHING from either Layer tier'), but `Runner.ts` sets it per node KIND, hard-coding `contextFree: false` on every Scenario regardless of what its steps need. The doc warns about one misuse (marking `AfterAllScenarios` context-free) but not the symmetric one — a future maintainer marking a Scenario `contextFree: true` because the doc's literal predicate invites it, which on the shared path silently drops that Scenario's isolated `TestEnv` with no test failing if the Scenario only touches clock/console."
    expected: "Either the field's doc comment is corrected to state it is a routing directive set per node kind (never computed from a body), or a maintainer accepts the current wording knowing the gap it invites."
    why_human: "No current call site exhibits the misuse — this verifier confirmed all four `api.effect` call sites are hard-coded correctly. This is a documentation-accuracy / future-maintenance-risk finding, not a present runtime defect."

  - test: "WR-03 (10-REVIEW.md): `Runner.ts` emits Scenarios from two separate loops (Feature-level ~line 592, Rule-nested ~line 649), both correctly hard-coded `contextFree: false` (confirmed by this verifier reading both sites directly). `Runner.test.ts`'s new `routingOf` structural assertion drives only the `checkout` fixture, which declares no Rule, so it exercises only the Feature-level loop. Flipping `contextFree` at line 649 (the Rule-nested site) leaves every assertion in `Runner.test.ts` green; the only net that would catch it is `emission.test.ts`'s 'Shared rule composition' test, and only because that particular fixture's Rule Layer happens to derive from the shared tier."
    expected: "Either a second `routingOf` assertion is added against a Rule-bearing fixture (the review proposes reusing the existing `shop` fixture), or a maintainer accepts the current, narrower structural coverage."
    why_human: "The current CODE is correct at both sites (independently verified by direct source read) — this is a test-coverage-completeness gap for future regression protection, not a present behavioral defect. 10-07-PLAN.md's own must_have claimed 'a routing projection pinning each node kind's flag' with no per-loop qualifier, so the claim as stated is broader than what the test proves."

  - test: "WR-04 (10-REVIEW.md): `emission.test.ts`'s new non-vacuity control comment (~line 2735) claims the printed unused-step-definition console line is a 'sound proxy' for the `⚠` node's emission because both come from the same `plan.warnings` array. They come from the same array but two independent code paths (the console line synchronously in `describeFeature.ts`'s own body; the node inside `Runner.ts`'s deferred `emitFeature` callback) — nothing links them. If a future change suppressed the `⚠` node under total exclusion (which `Runner.ts` note (g) records as a reversible DECISION, not an invariant), this control would stay green while the thing it claims to prove had reverted."
    expected: "Either the comment is corrected to state the true, weaker claim and cite `Runner.test.ts`'s separate 'emits identical ⚠ nodes with no filter and with a filter that excludes every Scenario' assertion as the one that actually pins the node, or a maintainer accepts the current wording."
    why_human: "The control does not currently pass vacuously — this verifier reproduced the code review's finding by reading the two code paths directly and confirms the claim's premise is unsupported, but the practical risk only materializes on a FUTURE change to the (currently unguarded, by design) warning-emission loop."

  - test: "WR-05 (10-REVIEW.md): `spec/behaviors/02-shared-layers-and-tags.md`'s BEH-EC-007 second correction (appended by plan 10-08) states the zero-runnable-Scenario build boundary is 'a STRENGTHENING of the requirement, not a divergence from it' one sentence before conceding 'Read literally, \"exactly once\" would say once. The answer that matches the rest of the system is zero.' This verifier read the raw file text directly and confirms both sentences are present as quoted and are in tension: the fenced REQUIREMENT block (left byte-identical, correctly, per this plan's own must-have) still reads an unqualified 'MUST be built exactly once for the whole Feature,' and 0 builds is not 1 build under any literal reading. RUN-03/RUN-04 were marked Complete in `.planning/REQUIREMENTS.md` in the same plan, against a REQUIREMENT block whose literal text the shipped code does not satisfy for this case."
    expected: "A maintainer decides between: (a) reword the correction to match the sibling RELEASE correction's own convention immediately above it (call it a divergence and leave the requirement standing 'so the gap stays visible,' as that correction explicitly does), (b) amend the fenced REQUIREMENT block itself to state the boundary in the MUST clause (the review's proposed 'AT MOST ONCE ... ZERO times when...' wording), or (c) accept the current wording as an acceptable, if imprecisely framed, correction."
    why_human: "This is the one finding in this review round that most directly touches whether RUN-03/RUN-04's Complete marking is honestly grounded in the spec text as written — this repo's own AGENTS.md §1 makes spec/ normative over code, and the correction's self-contradiction is a legitimate reason to pause before treating the marking as unambiguous. It does not change the underlying runtime behavior, which this verifier independently confirmed is correct and gate-enforced."

  - test: "WR-06 (10-REVIEW.md): the same BEH-EC-007 correction (`spec/behaviors/02-shared-layers-and-tags.md` line 166) attributes the `AfterAllScenarios` teardown suppression to \"this behavior's own carve-out\" while linking to BEH-EC-017, a DIFFERENT behavior in a different document. This verifier confirmed the exact phrase is still present unfixed as of this verification."
    expected: "Correct the attribution to name BEH-EC-017 explicitly rather than 'this behavior's own', matching the review's proposed wording."
    why_human: "A cross-reference attribution error in a spec document whose entire navigational contract is BEH-EC-NNN identity — low functional impact, but the kind of drift `spec/traceability.md` exists to prevent, per this repo's own stated documentation discipline."

  - test: "WR-07 (10-REVIEW.md): the behavior-changing code commit (`743e9a0`, five files under `packages/vitest/`) landed separately from the `spec/` commits that document it (`e63ba4f`, `6b95833`), spanning several intermediate commits on `main` during which `spec/behaviors/02-shared-layers-and-tags.md` still asserted the old, unqualified build-once MUST while the shipped code already diverged from it."
    expected: "A maintainer decision on whether this specific split (across a fast, single-session gap-closure sequence) is an acceptable exception to AGENTS.md §1's same-commit rule, or whether the plan-decomposition convention (code plan, then a downstream spec plan) should be revisited for behavior-changing gap closures specifically."
    why_human: "Process/git-hygiene judgment call already made and already landed on `main`; not reversible by this verification without a destructive history rewrite, and orthogonal to whether the shipped behavior is correct (which it is, independently confirmed)."
---

# Phase 10: Layer Scopes (per-Scenario default + `shared`) Verification Report

**Phase Goal:** Both Layer scopes work as specified, and a `shared` Layer never costs a Scenario its own `TestClock`.
**Verified:** 2026-08-30T14:02:56Z
**Status:** human_needed
**Re-verification:** Yes — after gap closure (plans 10-07, 10-08)

## Goal Achievement

### What changed since the prior verification

The prior verification (`gaps_found`, 10/11) found one real gap: a `shared` Layer was still
built even when a tag filter excluded every Scenario in the Feature, as long as the Feature
carried at least one unused step-definition warning (`Runner.ts:629-632` emitted the `⚠` node
unconditionally through the shared-build-forcing route). Plans 10-07 (the fix) and 10-08 (the
spec record) were executed to close it. This session re-verified the fix directly against the
current source and re-ran every independently-runnable check — not the SUMMARYs, not the
just-completed code review's own baseline claims — before accepting either plan's account.

### Observable Truths

Merged from the prior verification's 10 unregressed truths, the previously-failed truth (now
fixed), and the additional `must_haves.truths` plans 10-07 and 10-08 introduced. All re-run
independently in this session.

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Default (per-Scenario) path: N Scenarios → N builds; state set in one Scenario is unobservable in the next (RUN-03) | ✓ VERIFIED (regression) | `perScenarioBuildOrdinals` `[1, 2, 3]` present at `emission.test.ts:1697-1775`. Independently re-run: `npx vitest run packages/vitest/test/emission.test.ts` → 67 passed / 3 skipped. |
| 2 | `shared` path: N Scenarios → 1 build for the whole Feature, via `layer(...)` (RUN-03) | ✓ VERIFIED (regression) | `sharedBuildOrdinals` `[1, 1, 1]` at `emission.test.ts:1919-1922` region. Independently re-run: `pnpm verify:shared-layer-once` → A2/C2 both ENFORCED. |
| 2b | **(previously FAILED, now fixed)** A `shared` Layer with every Scenario excluded by the tag filter, plus at least one unused step definition, is never built | ✓ VERIFIED | Read `Runner.ts:376-389` directly: two named constants, `warningEmitOptions` (`contextFree: true`) and `afterAllScenariosEmitOptions` (`contextFree: false`), each set explicitly at their `api.effect` call sites. Read `describeFeature.ts`'s `sharedLayerTestApi`: routes on `emitOptions.contextFree` — `true` goes through the reused `vitestTestApi(featureUri).effect` (Layer-free), `false` through `sharedIt.effect` (shared-build-forcing). Independently re-run: `npx vitest run packages/vitest/test/emission.test.ts` includes "never built the shared tier — RUN-03's build discipline for the zero-runnable-Scenario case," part of the 67-passed full-file run. Mutation-proved twice in the SUMMARY (deleting the route selection; inverting the flag) — this verifier did not re-run the mutations (would require reverting real source) but independently confirmed the fix's mechanism by direct source reading, matching the mutation table's description exactly. |
| 2c | The same Feature still reports its unused step definition — the fix did not buy build discipline by hiding drift | ✓ VERIFIED | `emission.test.ts`'s reader block asserts `warningsFor(<uri>)` contains exactly one unused-definition line; part of the same 67-passed run. **Caveat:** the test comment's stated soundness argument for why this control is non-vacuous does not hold as written (WR-04, human verification below) — the control itself still passes and is not vacuous today (verified by direct read of the two independent code paths it exercises), only its own justification comment overstates the link. |
| 2d | The `⚙ AfterAllScenarios` node still routes through the shared tier, not swept up by the same flag that reroutes warning nodes | ✓ VERIFIED | `Runner.ts:389` sets `afterAllScenariosEmitOptions: { contextFree: false }` explicitly, with a doc comment stating why. `Runner.test.ts`'s new `routingOf` test asserts this for the Feature-level emission path. **Caveat:** the Rule-nested Scenario emission loop (`Runner.ts:649`, also correctly `contextFree: false`, confirmed by direct read) is not covered by the same structural assertion — only by an incidental behavioral test (WR-03, human verification below). |
| 3 | `shared` path: `TestClock`/`TestConsole` isolated per Scenario; whole-vs-filtered results identical (RUN-04, BEH-EC-012) | ✓ VERIFIED (regression) | `emission.test.ts`'s `clockReadings` block. Independently re-run: `pnpm verify:shared-layer-once` → B2 ("THE GATE") ENFORCED. |
| 4 | `shared` error channel must be `never`; `perScenario` unconstrained (D-04, Pitfall 27) | ✓ VERIFIED (regression) | `describeFeature.ts:998,1074` unchanged signature. Independently re-run: `pnpm typecheck:test` exit 0; `pnpm verify:tsgo-gate` → 13/13 ENFORCED. |
| 5 | A Rule's own `extraLayer` under `shared` builds once per Scenario in that Rule while the Feature's `shared` stays at 1 build | ✓ VERIFIED (regression) | `ruleSharedOrdinals`/`ruleExtraOrdinals` present, part of the 67-passed run. |
| 6 | A plain-Layer Feature is byte-for-byte unchanged in behaviour | ✓ VERIFIED (regression) | `describeFeature.ts`'s `collection.sharedLayer === null` branch unchanged; pre-existing tag/hook/outline/Rule blocks still pass in the same run. |
| 7 | `Runner.ts` and `TestApi.ts` import no test framework, in any import form | ✓ VERIFIED | Independently re-run: `pnpm verify:testapi-seam` → 3/3 ENFORCED. **Caveat:** `Runner.ts` note (a)'s own prose about this gate makes a demonstrably false claim about what the gate can detect and about whether the framework name appears in the file (WR-01, human verification below) — the gate itself is unaffected. |
| 8 | The emitted describe/test tree is identical on both paths | ✓ VERIFIED (regression) | `pnpm verify:shared-layer-once`'s A1/B1/C1 vacuity controls confirm expected node counts unchanged. |
| 9 | The shared Scenario's reported status is identical whole vs. `-t`-filtered; the gate fails by name; it runs in CI | ✓ VERIFIED (regression) | Independently re-run: `pnpm verify:shared-layer-once` → all 10 named assertions ENFORCED, exit 0. `.github/workflows/check.yml:118` still runs it. |
| 10 | No document describes the `shared` Layer or its `TestClock` isolation as unbuilt or with the zero-runnable case missing; `verify-shared-layer-once.sh` is described accurately | ✓ VERIFIED | `spec/invariants.md`'s INV-EC-002 entry read directly: correctly states three CLI runs (not two), two independent "passed" assertions carrying the build-once claim (not a compared count), and a status-equality claim (not a build-count comparison) — matches the actual script's A2/C2/B2 assertions this verifier independently re-ran. **Caveat:** `spec/behaviors/02-shared-layers-and-tags.md`'s BEH-EC-007 correction frames the zero-runnable boundary as a "strengthening, not a divergence" one sentence after conceding the literal requirement text would say otherwise — a self-contradiction this verifier confirmed by direct read (WR-05, human verification below). |
| 11 | BEH-EC-007's fenced REQUIREMENT block is byte-identical; the fix is recorded as an appended correction, never a rewrite narrowing the requirement | ✓ VERIFIED | `spec/behaviors/02-shared-layers-and-tags.md:92-97` (REQUIREMENT block) reads identically to the prior verification's citation; the new content is appended below the existing correction. 10-08-SUMMARY records `git diff --numstat` showing 0 deletions on this file — plausible and consistent with what this verifier read (only additions observed). |
| 12 | RUN-03 and RUN-04 read Complete in `.planning/REQUIREMENTS.md`, marked only after a green gate sweep | ✓ VERIFIED | `.planning/REQUIREMENTS.md:39-40` both `[x]`; traceability table rows 102-103 both `Complete` against Phase 10. Independently re-ran a representative subset of the thirteen-gate sweep in this session (`pnpm test`, `pnpm verify:spec`, `pnpm verify:tsgo-gate`, `pnpm verify:testapi-seam`, `pnpm verify:shared-layer-once`) — all green, matching 10-08-SUMMARY's recorded exit codes. |
| 13 | `pnpm verify:spec` passes with every relative link resolving | ✓ VERIFIED | Independently re-run: PASS 7 / FAIL 0 / SKIP 1, 279 relative links resolve. |

**Score:** 16/16 truths verified (0 present-but-behavior-unverified). 7 caveats flagged as human/maintainer-decision items — see Human Verification Required below; none of them contradict the truths they're attached to.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/vitest/src/TestApi.ts` | `EmitOptions.contextFree`, required boolean field | ✓ VERIFIED | Present, required (not optional); note (b) extended per plan |
| `packages/vitest/src/Runner.ts` | Two named `EmitOptions` constants replacing `emptyEmitOptions`; field set explicitly at all four call sites | ✓ VERIFIED | `warningEmitOptions` (`contextFree: true`), `afterAllScenariosEmitOptions` (`contextFree: false`); grep count of 6 (comment-stripped) confirmed matching the plan's own `<done>` criterion |
| `packages/vitest/src/describeFeature.ts` | `sharedLayerTestApi` selects between two emission routes on the flag | ✓ VERIFIED | `contextFreeEffect = vitestTestApi(featureUri).effect` (reused value) vs. `sharedRouteEffect` (`sharedIt.effect`); one route selected per `emitOptions.contextFree` |
| `packages/vitest/test/emission.test.ts` | Excluded-everything regression block | ✓ VERIFIED | New `describe` block present, three `it`s (counter 0, no Scenario ran, warning still reported); part of the green 67-passed full-file run |
| `packages/vitest/test/Runner.test.ts` | Routing projection pinning each node kind's flag | ⚠️ PARTIAL COVERAGE | `routingOf` projection and test present and passing, but exercises only the Feature-level Scenario loop, not the Rule-nested one (WR-03) — flagged, not a stub |
| `spec/invariants.md` | INV-EC-002 covers zero-runnable case, describes the CLI gate truthfully | ✓ VERIFIED | Confirmed by direct read against the actual script's assertions |
| `spec/behaviors/02-shared-layers-and-tags.md` | BEH-EC-007 second dated correction, requirement block untouched | ✓ VERIFIED, with a self-consistency caveat (WR-05) | Correction present, appended, REQUIREMENT block unchanged |
| `spec/traceability.md` | §2 INV-EC-002 Test cell corrected | ✓ VERIFIED | Reconciled per 10-08-SUMMARY's account; not independently re-diffed line-by-line by this verifier beyond spot-checking `spec/invariants.md` (the source of truth it mirrors) |
| `.planning/REQUIREMENTS.md` | RUN-03/RUN-04 Complete again | ✓ VERIFIED | Confirmed directly, lines 39-40 and 102-103 |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `Runner.ts` warning-node emission | context-free route | `warningEmitOptions.contextFree: true` → `describeFeature.ts`'s route branch | ✓ WIRED | Confirmed by direct source read; behaviorally proven by the passing regression test |
| `Runner.ts` `⚙ AfterAllScenarios` emission | shared route | `afterAllScenariosEmitOptions.contextFree: false` → `sharedIt.effect` | ✓ WIRED | Confirmed by direct source read and `Runner.test.ts`'s `routingOf` assertion (Feature-level only, per WR-03) |
| `describeFeature.ts`'s context-free route | `vitestTestApi(featureUri).effect` | reused as a value, not a second closure | ✓ WIRED | Confirmed by direct source read; keeps `makeDegradingEffect` at one implementation as the plan required |
| `emission.test.ts`'s new regression block | `Runner.ts`'s fix | real `describeFeature` + `excludeTags` filter + unused step def | ✓ WIRED | Part of the green full-file run this session independently re-ran |
| `10-07`'s fix | `spec/invariants.md`'s INV-EC-002 | named test block, described mechanism | ✓ WIRED | Confirmed by direct read |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full `emission.test.ts` suite, including the new gap-closure block | `npx vitest run packages/vitest/test/emission.test.ts` | 67 passed, 3 skipped | ✓ PASS |
| Whole-suite regression | `pnpm test` | 773 passed \| 3 skipped (32 files) | ✓ PASS |
| Framework-independence seam | `pnpm verify:testapi-seam` | 3/3 assertions ENFORCED | ✓ PASS |
| Whole-vs-filtered real-CLI equivalence + build-once gate | `pnpm verify:shared-layer-once` | 10/10 assertions ENFORCED | ✓ PASS |
| tsgo compile-time gate | `pnpm verify:tsgo-gate` | 13/13 assertions ENFORCED | ✓ PASS |
| Spec integrity | `pnpm verify:spec` | PASS 7 / FAIL 0 / SKIP 1, 279 links resolve | ✓ PASS |

### Probe Execution

No `scripts/*/tests/probe-*.sh` convention is used by this project; the equivalent role is filled by
the `pnpm verify:*` gate scripts, executed above under Behavioral Spot-Checks.

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|-----------------|--------------|--------|----------|
| RUN-03 | 10-01 through 10-08 | Per-Scenario Layer fresh by default; opt-in `shared` built once via `layer(...)`, including the zero-runnable-Scenario case | ✓ SATISFIED | The previously-failing edge case is now independently confirmed fixed, mutation-mechanism verified by direct source reading, and gate-enforced. Marked Complete in `.planning/REQUIREMENTS.md` behind a re-run gate sweep, per 10-08-SUMMARY and this verifier's own subset re-run. |
| RUN-04 | 10-02, 10-04, 10-05, 10-06, 10-07 | `shared` Layer still gives every Scenario its own fresh `TestClock`/`TestConsole` | ✓ SATISFIED | Unregressed by the gap-closure plans; independently re-run and gate-enforced. |

No orphaned Phase-10 requirements: `.planning/REQUIREMENTS.md`'s traceability table maps only RUN-03
and RUN-04 to Phase 10 (RUN-05 to Phase 9), and both are declared in every plan's `requirements`
frontmatter including 10-07 and 10-08.

### Anti-Patterns Found

None. Scanned all eight files the fresh code review reviewed
(`TestApi.ts`, `Runner.ts`, `describeFeature.ts`, `Runner.test.ts`, `emission.test.ts`,
`spec/behaviors/02-shared-layers-and-tags.md`, `spec/invariants.md`, `spec/traceability.md`) for
`TBD`/`FIXME`/`XXX` — zero matches, independently re-confirmed in this session.

### Human Verification Required

This session's own code review (`10-REVIEW.md`, re-run against the closed gap) found 0
blockers/critical and 7 WARNINGs. This verifier independently re-read the cited source and spec
text for each of the seven rather than deferring to the review's own severity labels, and confirms
all seven are real and none of them undermines the phase's core behavioral truths (the gap is
genuinely closed, mutation-proved, and gate-enforced). They are documentation-truthfulness and
test-coverage-completeness judgment calls this repo's own `AGENTS.md` treats seriously (§1 "spec/
is normative," §4 "say only what is true") — surfaced below for a maintainer decision before
Phase 11 builds on this foundation. Full detail, evidence, and proposed fixes for each are in the
frontmatter `human_verification` list above; summarized:

1. **WR-01** — `Runner.ts` note (a) makes a demonstrably false claim about the seam gate (that the
   framework name is "written out nowhere," and that the gate "cannot tell a citation from an
   import"). Confirmed false by direct grep and by reading the gate script.

2. **WR-02** — `EmitOptions.contextFree`'s doc comment describes a body-predicate the code does not
   compute; it's set per node kind. No current misuse, but the doc invites one.

3. **WR-03** — The new structural routing test (`Runner.test.ts`) pins only the Feature-level
   Scenario emission loop, not the Rule-nested one, though the source code is correct at both
   sites (independently confirmed).

4. **WR-04** — The non-vacuity control's own comment overstates why it's non-vacuous (claims a
   "sound proxy" link between two independent code paths that doesn't hold as stated); the control
   itself is not currently vacuous.

5. **WR-05** — BEH-EC-007's newest correction calls the zero-runnable-Scenario boundary "a
   STRENGTHENING… not a divergence" one sentence after conceding the literal requirement text
   would say otherwise — a self-contradiction confirmed by direct read, landed in the same plan
   that marked RUN-03/RUN-04 Complete.

6. **WR-06** — A cross-reference in the same correction misattributes a carve-out to "this
   behavior's own" when it belongs to a different behavior (BEH-EC-017).

7. **WR-07** — The behavior-changing code commit and its `spec/` documentation commits landed
   separately, against this repo's own same-commit convention for behavior changes.

### Gaps Summary

No gaps remain against the phase's must-haves. The one gap the prior verification found — a
`shared` Layer still building for a Feature whose Scenarios were all tag-filtered out, as long as
an unused step definition was present — is closed. This verifier independently confirmed the fix
by reading `Runner.ts`'s two named `EmitOptions` constants and `describeFeature.ts`'s route
selection directly (not merely trusting the plan SUMMARYs or the just-re-run code review's own
baseline), and by re-running the regression test and every relevant gate script fresh in this
session. RUN-03 and RUN-04 are genuinely satisfied at the behavioral level.

What keeps this report at `human_needed` rather than `passed` is not a functional defect: it is
seven documentation-truthfulness and test-coverage-completeness findings from a fresh code review
of the exact gap-closure diff, all independently re-confirmed by this verifier against source and
spec text rather than accepted on the review's own severity labels. None of them contradicts the
runtime correctness already established. The most consequential is WR-05: the newest spec
correction's own internal contradiction ("strengthening, not a divergence" vs. "read literally...
the answer... is zero") sits directly underneath the same-plan marking of RUN-03/RUN-04 as
Complete, and this repo's own documented convention (`AGENTS.md` §1, and the sibling RELEASE
correction's own more careful wording immediately above it) suggests it deserves a maintainer's
explicit resolution rather than being carried forward silently into Phase 11.

---

_Verified: 2026-08-30T14:02:56Z_
_Verifier: Claude (gsd-verifier)_

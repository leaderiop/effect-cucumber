---
phase: 06-plan-scenario-effect-runner-emission-and-drift-detection
verified: 2026-08-29T06:10:00Z
status: passed
score: 9/9 must-haves verified
overrides_applied: 0
---

# Phase 6: Plan, Scenario-Effect, Runner Emission, and Drift Detection — Verification Report

**Phase Goal:** A loaded feature and a registered step tree join into real vitest tests — one fail-fast `it.effect` per Scenario — and any mismatch between the two is an error naming exactly what drifted.
**Verified:** 2026-08-29T06:10:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP.md Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A Feature with a one-step Background and two Scenarios emits exactly two `it.effect` calls through the `TestApi` seam, each running the Background step first, then its own steps, in order, inside one `Effect.gen` (RUN-01, INV-EC-001) | ✓ VERIFIED | Ran `pnpm vitest run packages/vitest/test/emission.test.ts` directly — real `describeFeature` call at module scope emits a `describe("Emission", …)` block containing exactly two passing `it.effect` tests ("the first scenario records its own entry", "the second scenario records a different entry"), each asserting the accumulated log opens with `opened` (Background) before the Scenario's own steps. `packages/vitest/test/Runner.test.ts` additionally proves the shape positionally (depth-tagged records) against a recording fake. |
| 2 | A Scenario whose second of four steps fails is reported failed, and steps three and four provably never ran (via a `Ref` counter) (RUN-01) | ✓ VERIFIED | `packages/vitest/test/ScenarioEffect.test.ts` — a four-step Scenario whose step two fails; the recorded execution log contains exactly `[one:start, one:end, two:start]` and stops; mutation B (changing the `Unresolved` branch to a no-op) was performed, observed failing, and reverted. `pnpm vitest run packages/vitest/test/ScenarioEffect.test.ts` passes (8/8). |
| 3 | A step text matching zero registered patterns fails its Scenario with an error naming the step text and its `file:line` source location (MATCH-03) | ✓ VERIFIED | `packages/vitest/src/Plan.ts`'s `undefinedStep` builds a `StepMatchError` with `reason: "UndefinedStep"`, `uri`, `line: Option.some(step.line)`, `stepText`, and a `suggestion` (a copy-pasteable snippet via `generateStepSnippet`). Proven in `Plan.test.ts` and end-to-end in `emission.test.ts`'s Drift block. |
| 4 | A step text matching two registered patterns fails naming every matching pattern and its definition site, deterministically regardless of registration order (MATCH-04) | ✓ VERIFIED (with a documented edge-case gap — see Known Issues WR-01) | `Plan.ts`'s `ambiguousStep` sorts colliding definitions with `compareCallSites`; `Plan.test.ts` registers the same two colliding definitions in both array orders and asserts both `matchedPatterns` and `message` are byte-identical, and separately proves numeric (not lexicographic) 9-before-10 ordering. Confirmed by direct source read (`packages/vitest/src/Plan.ts:349-350`). **Gap:** the sort has no tiebreak when `compareCallSites` returns `0` (identical or both-`null` definition sites), so that narrow edge case would fall back to matcher/registration order — flagged by the phase's own code review (WR-01) as a Warning, not exercised by any test, not a blocker to the phase's core deliverable. |
| 5 | A registered pattern that matches no step anywhere in the Feature produces a Feature-level warning while the suite still passes (MATCH-05) | ✓ VERIFIED | Three independent channels, all live and tested: (1) `console.warn` from `describeFeature`'s body (`emission.test.ts`'s stub-and-restore test asserts exactly one call naming pattern/keyword/Feature); (2) an always-passing `it.effect` node titled `⚠ unused step definition: …` (`Runner.test.ts`, and observed directly in `emission.test.ts`'s reporter output: `✓ Drift > ⚠ unused step definition: …`); (3) `FeaturePlan.warnings`, exposed on `FeatureCollection.plan.warnings` (`describeFeature.test.ts`, `Plan.test.ts`). |

**Score:** 5/5 roadmap success criteria verified (criterion 4 verified for the tested/realistic case, with one documented non-blocking edge-case gap).

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/vitest/src/CallSite.ts` | `captureCallSite`/`formatCallSite`/`compareCallSites`, zero local imports save one type-only | ✓ VERIFIED | Present, exports confirmed, `pnpm circular` clean. |
| `packages/vitest/src/Registry.ts` | `DefinitionSite` + `StepDefinition.definedAt` | ✓ VERIFIED | Present and consumed by `Plan.ts`. |
| `packages/gherkin/src/Snippet.ts` | `generateStepSnippet` | ✓ VERIFIED | Present, exported from gherkin barrel, reachable cross-package (confirmed in 06-02-SUMMARY and re-confirmed by grep on `index.ts`). |
| `packages/vitest/src/Errors.ts` | `StepMatchError`, `UnusedStepDefinitionWarning`/`makeUnusedStepDefinitionWarning` | ✓ VERIFIED | Present; both types constructed and consumed by `Plan.ts`; exported from `packages/vitest/src/index.ts`. |
| `packages/vitest/src/TestApi.ts` | Two-member, zero-runtime `describe`/`effect` seam | ✓ VERIFIED | Present, types-only, no vitest import; consumed by `Runner.ts` and constructed concretely only in `describeFeature.ts`. |
| `packages/vitest/src/Plan.ts` | `planFeature`, the Register→Plan→Emit middle stage | ✓ VERIFIED | 503 lines, exports confirmed by grep, wired into `describeFeature.ts` (`planFeature(` occurs exactly once there). |
| `packages/vitest/src/ScenarioEffect.ts` | `buildScenarioEffect` | ✓ VERIFIED | Present; `Effect.provide` occurs exactly once; no `vitest` import; consumed by `Runner.ts`. |
| `packages/vitest/src/Runner.ts` | `emitFeature` | ✓ VERIFIED | Present; no `vitest`/`@effect/vitest` import (only `describeFeature.ts` imports the test framework, confirmed by repo-wide grep); consumed by `describeFeature.ts`. |
| `packages/vitest/src/describeFeature.ts` | Composition root: register → plan → warn → emit | ✓ VERIFIED | `planFeature(` ×1, `emitFeature(` ×1, `console.warn` ×1 in `describeFeature`'s body (not `collect`), confirmed by direct read. |
| `packages/vitest/src/index.ts` | Public export of `StepMatchError` + companion types | ✓ VERIFIED | `export { StepMatchError } from "./Errors.ts"` present; internal stages (`planFeature`, `emitFeature`, `buildScenarioEffect`, `TestApi`, `collectFeature`) correctly withheld. |

### Data-Flow / End-to-End Trace

Ran the actual test suite rather than trusting SUMMARY claims:

```
$ pnpm build     → tsc -b, exit 0
$ pnpm test      → 526 passed (526), 27 test files, exit 0
$ pnpm lint      → oxlint + dprint, exit 0
$ pnpm circular  → no circular dependency found
$ pnpm verify:tsgo-gate → ENFORCED, all 9 checks pass
$ pnpm vitest run packages/vitest/test/emission.test.ts --reporter=verbose
  ✓ Emission > the first scenario records its own entry
  ✓ Emission > the second scenario records a different entry
  ✓ Drift > one matched step
  ✓ Drift > ⚠ unused step definition: Given "a step no Scenario in this Feature ever writes" (…)
  ✓ an unused step definition reaches the terminal exactly once > prints one warning naming the pattern, the keyword and the Feature
  ✓ an unused step definition reaches the terminal exactly once > stays silent for collectFeature, which shares the same collect implementation
  ✓ an unused step definition reaches the terminal exactly once > restored the original console.warn, by reference
  ✓ describeFeature emitted tests that actually ran > completed one test per Scenario, in document order, each nested under the Feature
  8 passed (8)
```

This is a genuine, non-mocked, end-to-end run: a `.feature` source parsed with the real `parseFeature`, registered through a real `describeFeature` call, planned, and emitted as real vitest tests that actually execute — not a recording fake, not a value-level assertion. Data flows: `.feature` text → `parseFeature` → `describeFeature` (register) → `planFeature` (plan) → `console.warn` + `emitFeature` (emit) → real running `it.effect` tests. No hollow wiring found anywhere in this chain.

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `describeFeature.ts` | `Plan.ts` | `planFeature(` | ✓ WIRED | Exactly 1 call, inside shared `collect()` (not duplicated per entry point). |
| `describeFeature.ts` | `Runner.ts` | `emitFeature(` | ✓ WIRED | Exactly 1 call, with a real `TestApi` built from `@effect/vitest`'s `describe`/`it.effect`. |
| `Runner.ts` | `ScenarioEffect.ts` | `buildScenarioEffect(` | ✓ WIRED | Called inside a thunk (verified by source read and by the emission test's Layer-freshness assertion). |
| `Plan.ts` | `packages/gherkin/src/StepMatcher.ts` | `createStepMatcher(` | ✓ WIRED | Exactly 1 call per `planFeature`, over `feature.parameterTypes` (never rebuilt). |
| `Plan.ts` | `packages/gherkin/src/Snippet.ts` | `generateStepSnippet(` | ✓ WIRED | Exactly 1 call, feeds `UndefinedStep.suggestion`. |
| `Plan.ts` | `CallSite.ts` | `compareCallSites` | ✓ WIRED | Used to order `AmbiguousStep.matchedPatterns` and `UnusedStepDefinitionWarning` list. |
| Repo-wide | test framework isolation | no `vitest`/`@effect/vitest` import outside composition root | ✓ WIRED | `grep -rlE 'from "(vitest|@effect/vitest)"' packages/vitest/src packages/gherkin/src` names only `describeFeature.ts`. |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|--------------|--------|----------|
| RUN-01 | 06-07 (built across 06-01→06-07) | Each Scenario compiles to exactly one `it.effect` call; sequential fail-fast `yield*`s | ✓ SATISFIED | Marked `[x]`/Complete in `.planning/REQUIREMENTS.md`; backed by `emission.test.ts` (real emission), `ScenarioEffect.test.ts` (fail-fast), `Runner.test.ts` (positional shape). |
| MATCH-03 | 06-07 | Zero-match step fails Scenario, naming step text + location | ✓ SATISFIED | Marked Complete; backed by `Plan.test.ts`, `Errors.test.ts`, `ScenarioEffect.test.ts`. |
| MATCH-04 | 06-07 | Multi-match step fails naming every pattern, order-independent | ✓ SATISFIED | Marked Complete; backed by `Plan.test.ts`'s registration-order-independence test. Minor edge-case gap noted (WR-01, see Known Issues) — does not undermine the requirement's tested claim. |
| MATCH-05 | 06-07 | Unused pattern is a Feature-level warning, not a failure | ✓ SATISFIED | Marked Complete; backed by three-channel tests across `emission.test.ts`, `Runner.test.ts`, `describeFeature.test.ts`. |

All four requirement IDs declared in this phase's plans cross-reference cleanly against `.planning/REQUIREMENTS.md`'s traceability table (all show `Phase 6 | Complete`). No orphaned requirements found — REQUIREMENTS.md's Phase 6 mapping (RUN-01, MATCH-03, MATCH-04, MATCH-05) matches exactly what the 8 plans in this phase declare.

### Anti-Patterns Found

Scanned all `src` files created/modified by this phase (`CallSite.ts`, `Registry.ts`, `describeFeature.ts`, `Errors.ts`, `TestApi.ts`, `Plan.ts`, `ScenarioEffect.ts`, `Runner.ts`, `index.ts`, gherkin's `Snippet.ts`/`index.ts`):

- `TBD`/`FIXME`/`XXX`: **0 matches** — no unresolved debt markers.
- `TODO`/`HACK`/`PLACEHOLDER`: 1 match, `packages/gherkin/src/Snippet.ts:216` — `// TODO: implement this step` — confirmed this is **product output** (part of the generated snippet string handed to a developer to fill in), not an unfinished code branch. Not a stub.
- No `return null`/`return {}`/empty-handler patterns found in the reviewed modules.
- No hollow/hardcoded-empty data feeding rendered output.

No blockers found in this scan.

### Code Review Findings (06-REVIEW.md, carried forward)

The phase's own code review (dated the same day as completion, `status: issues_found`, 0 critical/blocker, 5 warning, 2 info) is available at `.planning/phases/06-plan-scenario-effect-runner-emission-and-drift-detection/06-REVIEW.md`. I independently confirmed the two most significant findings against the current source:

- **WR-01** (`packages/vitest/src/Plan.ts:349-350`, confirmed by direct read): `ambiguousStep`'s sort has no secondary tiebreak when `compareCallSites` returns `0` (identical sites or both `null`), unlike the sibling `UnusedStepDefinitionWarning` sort a few lines below which explicitly adds `left.pattern.localeCompare(right.pattern)` as a tiebreak. In this narrow edge case, ordering would silently fall back to matcher/registration order — the exact defect MATCH-04/D-03 exists to prevent. No test exercises two colliding definitions that both carry `definedAt: null` or an identical site (confirmed: only one `definedAt: null` occurrence in `Plan.test.ts`, and it is not paired with a second null in an ambiguous case). This is real and unfixed as of this verification.
- **WR-02** (confirmed by direct read): every `AmbiguousStep` message unconditionally appends a hardcoded, unrelated `{int}`/`{word}`/apples illustrative example regardless of the actual colliding patterns, which can read as a second, confusing example to an unfamiliar developer.
- WR-03 (unused `ruleId` field), WR-04 (tripled "unrecorded location" string, one branch dead in production), WR-05 (Feature/Rule/Scenario names reach test titles/`console.warn` unescaped, no explicit threat-model disposition) — all confirmed present, all correctly classified as non-blocking.
- IN-01, IN-02 — informational, no action required.

None of these five warnings or two info items affect the phase's core deliverable: real, running, fail-fast per-Scenario tests with located drift errors. They are legitimate follow-up items, most cheaply addressed as a small follow-up plan or issue, not as a reason to fail this phase's verification.

### Human Verification Required

None required to close this phase. Two plan-level `<human-check>` judgement blocks existed in this phase's plans (06-04, 06-07), both outside individual `<verify>` task blocks (they sit in the plan-level `<verification>` section, so they are advisory rather than gating):

- **06-04's** was explicitly performed and documented in `06-04-SUMMARY.md` ("Judgement: both stand alone" — with both messages printed and read in full).
- **06-07's** ("does the emitted test tree read like a Feature file... noisy, redundant, missing the one fact you'd reach for") was not explicitly narrated in `06-07-SUMMARY.md`, but I ran the exact command (`pnpm vitest run packages/vitest/test/emission.test.ts --reporter=verbose`) myself as part of this verification and the reporter output reads clearly (see the trace above) — the emitted tree names the Feature, Scenarios, and the unused-pattern warning distinctly and legibly, matching the code review's independent judgement that found no clarity defect in the emission output itself (only in `Plan.ts`'s `AmbiguousStep` message, captured as WR-02 above).

No outstanding item requires a human before this phase can be considered achieved.

### Gaps Summary

No blocking gaps. The phase goal — a loaded feature and a registered step tree joining into real vitest tests, one fail-fast `it.effect` per Scenario, with any mismatch reported as a located, actionable error — is demonstrably true in the codebase, verified by running the actual test suite (526/526 passing), running the end-to-end emission test directly and reading its reporter output, and reading the wiring source (`describeFeature.ts`) rather than trusting narrative claims.

Two non-blocking follow-up items are recommended for a future small plan or issue, both already surfaced by this phase's own code review and independently reconfirmed here:
1. Add a secondary sort key (pattern string) to `ambiguousStep`'s `toSorted` call in `packages/vitest/src/Plan.ts`, matching the pattern already used a few lines below for `UnusedStepDefinitionWarning`, plus a test with two colliding definitions that share a `definedAt` (or are both `null`).
2. Remove or clearly mark-as-illustrative the hardcoded `{int}`/`{word}`/apples example baked into every `AmbiguousStep` message in `packages/vitest/src/Plan.ts`.

---

_Verified: 2026-08-29T06:10:00Z_
_Verifier: Claude (gsd-verifier)_

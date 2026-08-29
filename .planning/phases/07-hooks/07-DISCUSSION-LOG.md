# Phase 7: Hooks - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-29
**Phase:** 7-hooks
**Areas discussed:** Multiple hooks per type, AfterStep failure guarantee, All-scenarios hook failure semantics

---

## Multiple hooks per type

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, run in registration order | Matches Cucumber's own convention. Most flexible. | ✓ |
| No, only one per type | Registering a second hook is a definition-time error. | |
| You decide | Claude picks based on codebase conventions. | |

**User's choice:** Yes, run in registration order

---

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, all After hooks run regardless | Each After hook is independent teardown; a failure in one shouldn't block another. | ✓ |
| No, fail-fast like Before/steps | Same structural short-circuit as everything else (INV-EC-001). | |
| You decide | Claude picks based on codebase consistency. | |

**User's choice:** Yes, all After hooks run regardless

---

| Option | Description | Selected |
|--------|-------------|----------|
| Combine all into one reported failure | Both errors combined into a single Cause; nothing silently dropped. | ✓ |
| Report only the first After failure | Simpler; later failures logged via console.warn only. | |
| You decide | Claude picks the most Effect-idiomatic approach. | |

**User's choice:** Combine all into one reported failure

---

| Option | Description | Selected |
|--------|-------------|----------|
| No — fail-fast, same as steps | A failed Before hook means setup didn't complete; later hooks/steps skip. | |
| Yes — same independent-and-collect behavior as After | Symmetric with After: every Before hook runs, errors combine, steps run only if all succeeded. | ✓ (interpreted) |
| You decide | Claude picks based on INV-EC-001 consistency. | |

**User's choice:** Free-text ("Other"): *"we don't need the simplest but we need the most feature rich solution"*
**Notes:** Interpreted and confirmed with the user as: all Before hooks run regardless of an earlier failure, their errors combine into one reported failure (symmetric with the After decision above), but Scenario steps only run if every Before hook succeeded — richness applies to error reporting, not to whether broken setup lets steps proceed.

---

## AfterStep failure guarantee

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, guaranteed via Effect.ensuring | Symmetric with After's guarantee; enables screenshot/log-on-failure. | ✓ |
| No, only runs after a successful step | Simplest reading of fail-fast; loses the diagnostics use case. | |
| You decide | Claude picks based on INV-EC-004 consistency. | |

**User's choice:** Yes, guaranteed via Effect.ensuring

---

| Option | Description | Selected |
|--------|-------------|----------|
| Combine both errors; Scenario still stops | Reported failure shows both errors; Scenario still short-circuits. | ✓ |
| Step error wins, AfterStep error just logged | Matches SC #4's literal wording; AfterStep failure is a console.warn. | |
| You decide | Claude picks whichever is consistent with the multi-hook combine pattern. | |

**User's choice:** Combine both errors; Scenario still stops

---

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — AfterStep is guaranteed regardless | Symmetric with the Scenario-level After guarantee. | ✓ (Claude's discretion) |
| No — AfterStep only wraps the step itself | AfterStep scoped tightly to the step body only. | |
| You decide | — | ✓ |

**User's choice:** You decide
**Notes:** Resolved as "Yes — AfterStep is guaranteed regardless of why the step didn't complete", for consistency with the "guarantee wraps the whole unit" pattern established by the two prior answers in this area.

---

## All-scenarios hook failure semantics

| Option | Description | Selected |
|--------|-------------|----------|
| Every Scenario reports the same failure individually | Maximally visible; duplicated N times. | ✓ (Claude's discretion) |
| One Feature-level failure, no Scenario nodes run | No duplication, but less visible per-scenario. | |
| You decide | — | ✓ |

**User's choice:** You decide
**Notes:** Resolved as "Every Scenario reports the same failure individually" — richest/most-visible option, and the mechanically natural fit given `TestApi`'s `describe`/`effect`-only surface (no native `beforeAll`).

---

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, always — guaranteed like After | AfterAllScenarios runs no matter what went wrong earlier. | ✓ (Claude's discretion) |
| Only if BeforeAllScenarios succeeded | Skipped if setup never completed; still runs regardless of Scenario outcomes. | |
| You decide | — | ✓ |

**User's choice:** You decide
**Notes:** Resolved as "Yes, always — guaranteed like After", for consistency with the guarantee pattern locked at every other level of this phase.

---

## Claude's Discretion

- Whether `AfterStep`'s guarantee covers a `BeforeStep` failure too (resolved: yes, it does).
- How `BeforeAllScenarios`/`AfterAllScenarios` surface failure across Scenarios (resolved: every Scenario reports individually).
- Whether `AfterAllScenarios` runs despite `BeforeAllScenarios` or Scenario failures (resolved: yes, always).
- The exact mechanism for computing `BeforeAllScenarios`/`AfterAllScenarios` once and sharing the result across Scenarios (e.g. `Deferred` vs. extending `TestApi`) — left to research/planning.
- How multiple hook errors are combined at the `Cause` level — left to research/planning, Effect-idiomatic approach preferred.

## Deferred Ideas

None — discussion stayed within phase scope. No todos matched this phase.

# Phase 11: Composition Root and Dogfooded Acceptance Suite - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-30
**Phase:** 11-composition-root-and-dogfooded-acceptance-suite
**Areas discussed:** REQ-EC-NNN tag scheme, Negative/error requirements, PITFALLS.md checklist depth, INV-EC-003 lint recommendation

---

## REQ-EC-NNN tag scheme

| Option | Description | Selected |
|--------|-------------|----------|
| Strict 1:1 | Exactly 22 REQ-EC-NNN tags, one per v1 requirement, explicit mapping table in traceability.md §5 | ✓ |
| Many-to-one allowed | A single Scenario can carry multiple REQ-EC-NNN tags when it naturally proves more than one requirement | |
| One-to-many allowed | A single requirement can be proven by more than one REQ-EC-NNN-tagged scenario | |

**User's choice:** Strict 1:1 (Recommended).
**Notes:** Matches `spec/process/requirement-id-scheme.md`'s "allocated contiguously" rule and makes "22/22 covered" a literal, greppable count.

---

## Negative/error requirements

| Option | Description | Selected |
|--------|-------------|----------|
| Satisfied/starved fixture pair | New fixtures trigger the failure; a wrapper test asserts the named error is thrown, mirroring verify-tsgo-gate.sh | ✓ |
| Cite existing unit tests | Tag fixtures already consumed by Plan.test.ts/Errors.test.ts instead of building new acceptance scaffolding | |
| Skip tagging error requirements | Only 18 happy-path requirements get REQ-EC-NNN tags; the 4 error requirements are covered by unit tests via a separate mechanism | |

**User's choice:** "For all the questions we need the most feature-rich solution" — interpreted as the satisfied/starved fixture pair (the most rigorous of the three options).
**Notes:** User gave a blanket instruction to bias toward the most thorough/complete option for every remaining open question in this discussion, rather than answering each individually.

---

## PITFALLS.md checklist depth

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — new test per item | Every one of the 24 checklist items gets its own dedicated test, even where existing coverage already exists; automate watch-mode/failure-panel items where practical | ✓ |
| New tests for gaps only | Reuse/cite ~18 already-proven items; write new tests only for genuine gaps (watch mode, failure-panel legibility) | |

**User's choice:** Yes — new test per item (Recommended), confirming the "most feature-rich" blanket instruction applied concretely to this question.
**Notes:** None.

---

## INV-EC-003 lint recommendation

| Option | Description | Selected |
|--------|-------------|----------|
| Doc + enforced in-repo guard | Add the doc recommendation AND a concrete oxlint/grep guard proving the acceptance suite's own step files contain zero `any` | ✓ |
| Docs only | Stay within original research scope — recommendation text only, no new enforcement | |

**User's choice:** Doc + enforced in-repo guard (Recommended), confirming the "most feature-rich" blanket instruction applied concretely to this question.
**Notes:** None.

---

## Claude's Discretion

- Exact number/grouping of acceptance `.feature` files beyond the 3 worked-example pairs, to reach 22/22 requirement coverage.
- Exact mechanism for the RUN-06/INV-EC-006 "no closed-over let/var" proof (likely a grep-based structural check).
- Naming of new scripts and wrapper test files (following existing `scripts/verify-*.sh` / `*.test.ts` conventions).
- Whether the traceability.md §5 mapping table is hand-written or script-generated from the `.feature` files' tags.

## Deferred Ideas

None — discussion stayed within phase scope. `spec/traceability.md` §6's untracked coverage-threshold targets came up as an adjacent observation, not a request; left for a future phase.

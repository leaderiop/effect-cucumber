# Phase 9: Tags - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-29
**Phase:** 9-Tags
**Areas discussed:** Phase 9 scope reconciliation, Library-level tag filtering

---

## Phase 9 scope reconciliation

Presented finding: ADR-EC-020 + BEH-EC-008 already lock most of RUN-05's design. One loose end —
ROADMAP.md's success criterion 4 describes `excludeTags` as a `describeFeature` options-object
field, which ADR-EC-020 (dated the day before this discussion) supersedes with pure
`--tagsFilter` CLI filtering only.

| Option | Description | Selected |
|--------|-------------|----------|
| Nothing to discuss — proceed | Confirm ADR-EC-020 reconciliation, no library-level excludeTags, write CONTEXT.md with no open gray areas | |
| I want excludeTags as a real describeFeature option | Override ADR-EC-020 — add library-level excludeTags filter | (initial free-text reply, clarified below) |
| I have something else to discuss | Raise an unlisted concern | |

**User's choice:** Free text — "I want to most feature rich option" (ambiguous, prompted a clarifying follow-up).

**Notes:** Clarifying question asked whether this meant a describeFeature-time `includeTags`/
`excludeTags` addition on top of `--tagsFilter`, a broader tag feature set, or reverting to the
CLI-only design. User selected: **library-level `includeTags`/`excludeTags` on `describeFeature`,
in addition to (not instead of) `--tagsFilter`.**

---

## Library-level tag filtering

| Question | Options | Selected |
|----------|---------|----------|
| Filter syntax | Array of tag strings / vitest boolean expression syntax | **Array of tag strings** |
| Include + exclude | Both includeTags and excludeTags / excludeTags only | **Both** |
| Filter mechanics | Skip emission entirely / emit as it.effect.skip | **Skip emission entirely** |

**User's choice:** Array-of-strings syntax, both `includeTags` and `excludeTags`, registration-time
filtering that skips emission entirely (excluded Scenarios never become `it.effect` calls).

**Notes:** All three answers took the recommended option. No further questions raised — user
confirmed ready to move to context capture.

---

## Claude's Discretion

- Exact `TestApi.ts` interface shape for threading tags/skip through to the real `it.effect` call.
- Whether `@skip` routes via `TestOptions.skip` or a separate `.skip` method call — implementation
  detail, not a user-facing choice.
- Tag matching is exact-string, case-sensitive — not raised as a question, applied as the obvious
  default per Cucumber tag convention.

## Deferred Ideas

None — the `includeTags`/`excludeTags` addition stays within RUN-05's already-scoped territory
(tag filtering was already named, if unmechanized, in BEH-EC-008).

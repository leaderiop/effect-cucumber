# effect-cucumber — Specification

This specification is **normative**. Code follows it; where they disagree, one
of them is a defect. See `AGENTS.md` at the repo root for the full engineering
rules this implies.

Every document here is meant to be mechanically checked. Run
`bash spec/scripts/verify-traceability.sh` before committing a spec change —
it verifies that the registries (`index.yaml`) match the files on disk, that
every invariant and decision is traced in `traceability.md`, and that no
relative link is broken. A doc-examples compile check (extracting every
` ```typescript ` fence and type-checking it against the real API) is planned
for once `packages/*` exists — see `spec/roadmap.md`.

## Contents

### Foundations

| Document | Purpose |
| -------- | ------- |
| [Overview](./overview.md) | Mission, design philosophy, packages, public API surface |
| [Glossary](./glossary.md) | Terms of art, deep-linked from behaviors and invariants |
| [Invariants](./invariants.md) | Properties that hold for every execution, and what enforces each |
| [Traceability](./traceability.md) | Behavior → source → test → invariant → decision → acceptance scenario |
| [Roadmap](./roadmap.md) | What's built, what's planned, and what's explicitly not planned — and why |

### Behaviors

| Document | IDs | Domain |
| -------- | --- | ------ |
| [01 — Steps and World](./behaviors/01-steps-and-world.md) | BEH-EC-001–004 | Step shape, World, `describeFeature` |
| [02 — Background, hooks, shared Layers, and tags](./behaviors/02-shared-layers-and-tags.md) | BEH-EC-005–008 | Background semantics, hooks, the `shared` Layer scope, `@skip`/`@only` |
| [03 — Rules, Scenario Outlines, and TestClock](./behaviors/03-rules-outlines-and-testclock.md) | BEH-EC-009–012 | Rule-scoped Layers, Outline typing, `TestClock` |

### Decisions

Thirteen ADRs — see [`decisions/index.yaml`](./decisions/index.yaml) for the
full list, or [Traceability §3](./traceability.md#3-decision-traceability) for
each one's affected invariants.

### Process

| Document | Purpose |
| -------- | ------- |
| [Requirement ID scheme](./process/requirement-id-scheme.md) | The `EC` infix, ID families, amend-vs-supersede rules |
| [Definitions of Done](./process/definitions-of-done.md) | Per-change checklist and the (currently planned) merge gate |

## Reading order

**New to this project?** Overview → Glossary → the three behavior files in
order → Roadmap.

**Reviewing a change?** The change's own PR/commit message should name which
`BEH-EC-NNN`/`INV-EC-NNN`/`ADR-EC-NNN` it touches — read those specific
entries, then check `traceability.md` still has them, then check
`spec/scripts/verify-traceability.sh` passes.

## Identifier scheme

| Prefix | Meaning |
| ------ | ------- |
| `BEH-EC-NNN` | Behavior |
| `INV-EC-NNN` | Invariant |
| `ADR-EC-NNN` | Decision |
| `REQ-EC-NNN` | Acceptance requirement (tag on a `.feature` file — none exist yet) |

Full rules in [`process/requirement-id-scheme.md`](./process/requirement-id-scheme.md).

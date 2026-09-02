# effect-cucumber — Specification

This specification is **normative**. Code follows it; where they disagree, one
of them is a defect. See `AGENTS.md` at the repo root for the full engineering
rules this implies.

Every document here is meant to be mechanically checked. Run
`bash spec/scripts/verify-traceability.sh` before committing a spec change —
it verifies that the registries (`index.yaml`) match the files on disk, that
every invariant and decision is traced in `traceability.md`, that every
`@REQ-EC-NNN` tag in the repository has a §5 row, and that no relative link is
broken. A doc-examples compile check (extracting every `` ```typescript `` fence
and type-checking it against the real API) runs as `pnpm verify:doc-examples`.
See `spec/roadmap.md`, which stays the single authority on build status.

## Contents

### Foundations

| Document                          | Purpose                                                                   |
| --------------------------------- | ------------------------------------------------------------------------- |
| [Overview](./overview.md)         | Mission, design philosophy, packages, public API surface                  |
| [Glossary](./glossary.md)         | Terms of art, deep-linked from behaviors and invariants                   |
| [Invariants](./invariants.md)     | Properties that hold for every execution, and what enforces each          |
| [Traceability](./traceability.md) | Behavior → source → test → invariant → decision → acceptance scenario     |
| [Roadmap](./roadmap.md)           | What's built, what's planned, and what's explicitly not planned — and why |

### Behaviors

| Document                                                                                       | IDs                 | Domain                                                                 |
| ---------------------------------------------------------------------------------------------- | ------------------- | ---------------------------------------------------------------------- |
| [01 — Steps and World](./behaviors/01-steps-and-world.md)                                      | BEH-EC-001–004, 013 | Step shape, World, `describeFeature`                                   |
| [02 — Background, hooks, shared Layers, and tags](./behaviors/02-shared-layers-and-tags.md)    | BEH-EC-005–008      | Background semantics, hooks, the `shared` Layer scope, `@skip`/`@only` |
| [03 — Rules, Scenario Outlines, and TestClock](./behaviors/03-rules-outlines-and-testclock.md) | BEH-EC-009–012, 018 | Rule-scoped Layers, Outline typing, `TestClock`                        |
| [04 — loadFeature parse and validation](./behaviors/04-loadfeature-parse-and-validation.md)    | BEH-EC-014          | `loadFeature` parsing and validation semantics                         |
| [05 — Step matching and parameter types](./behaviors/05-step-matching-and-parameter-types.md)  | BEH-EC-015          | cucumber-expression matching, parameter types                          |
| [06 — DataTable and DocString arguments](./behaviors/06-datatable-and-docstring-arguments.md)  | BEH-EC-016          | `DataTable`/`DocString` step arguments                                 |
| [07 — Hook ordering and guarantees](./behaviors/07-hook-ordering-and-guarantees.md)            | BEH-EC-017          | Hook execution order and guarantees                                    |
| [08 — Step modules](./behaviors/08-step-modules.md)                                            | BEH-EC-019          | Typed step modules reused across Features                              |

### Decisions

Twenty-six ADRs — see [`decisions/index.yaml`](./decisions/index.yaml) for the
full list, or [Traceability §3](./traceability.md#3-decision-traceability) for
each one's affected invariants.

### Process

| Document                                                                       | Purpose                                                                                                                 |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| [Requirement ID scheme](./process/requirement-id-scheme.md)                    | The `EC` infix, ID families, amend-vs-supersede rules                                                                   |
| [Definitions of Done](./process/definitions-of-done.md)                        | Per-change checklist, and a map of the merge gate — five of its seven rows wired, two still not                         |
| ["Looks Done But Isn't" checklist](./process/looks-done-but-isnt-checklist.md) | The `P-01`–`P-24` id family: twenty-four items, each EXECUTED by a named artifact rather than cited                     |
| [release checklist](./process/release-checklist.md)                            | Moving the pinned `effect` / `@effect/vitest` rc forward, and cutting a release. Checklist item `P-18` is its existence |

## Reading order

**New to this project?** Overview → Glossary → the seven behavior files in
order → Roadmap.

**Reviewing a change?** The change's own PR/commit message should name which
`BEH-EC-NNN`/`INV-EC-NNN`/`ADR-EC-NNN` it touches — read those specific
entries, then check `traceability.md` still has them, then check
`spec/scripts/verify-traceability.sh` passes.

## Identifier scheme

| Prefix       | Meaning                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BEH-EC-NNN` | Behavior                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `INV-EC-NNN` | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `ADR-EC-NNN` | Decision                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `REQ-EC-NNN` | Acceptance requirement — a tag on a `.feature` file under `packages/vitest/test/acceptance/`. Twenty-two exist, one per v1 requirement, each carried exactly once and each with a row in [Traceability §5](./traceability.md#5-acceptance-scenario-traceability); `bash spec/scripts/verify-traceability.sh` check 5 reports the count and fails if it drifts. That directory is the ONLY place a `.feature` file may carry one |
| `P-NN`       | A "Looks Done But Isn't" checklist item. **No `EC` infix**, deliberately — see the note below                                                                                                                                                                                                                                                                                                                                   |

Full rules for the four `EC`-infixed families in
[`process/requirement-id-scheme.md`](./process/requirement-id-scheme.md); full rules for `P-NN` in
[`process/looks-done-but-isnt-checklist.md`](./process/looks-done-but-isnt-checklist.md), which
restates the same permanence, contiguity and no-reuse discipline in its own words.

`P-NN` is the one family without the `EC` infix. The infix exists to disambiguate identifiers when
several specs are open side by side, and it earns that cost for an id a consumer or a sibling project
might ever quote. A checklist item is quoted only from inside this repository — from two gate scripts
and from thirteen test titles — and a `P-EC-NN` would have been three characters of ceremony per
citation for a disambiguation nobody needs. Recorded here rather than left to look like an oversight.

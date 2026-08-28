# Definitions of Done

## Per-change checklist

- New/changed public behavior → the relevant `spec/behaviors/*.md` entry is
  updated in the same change.
- New constraint on the system → `spec/invariants.md` gets a new entry naming
  its enforcement mechanism, or an existing one is revised.
- Non-obvious design choice → a new ADR, or an existing one amended (see
  `spec/process/requirement-id-scheme.md`).
- Any of the above → the new IDs appear in both `spec/traceability.md` and the
  relevant directory's `index.yaml`.
- `bash spec/scripts/verify-traceability.sh` passes.

## Merge gate (planned — no code exists yet)

This table is aspirational until `packages/*` exists — see
`spec/roadmap.md` § Current state for what's actually wired today. Once code
exists, this table must be the literal, in-order list of commands a single
`pnpm check` (or equivalent) runs — not a paraphrase of it — so the table and
CI cannot drift apart. Per `AGENTS.md` §4, don't mark a row "passing" here
until it's true.

| Step | Command (planned)                                   | Enforces                                                                                 |
| ---- | --------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 1    | `tsc -b`                                            | Type-checks sources and tests                                                            |
| 2    | lint                                                | House style                                                                              |
| 3    | `vitest run`                                        | Unit + `@effect/vitest` tests                                                            |
| 4    | Cucumber acceptance suite                           | `@REQ-EC-NNN`-tagged `.feature` scenarios pass — this library dogfooding itself          |
| 5    | doc-examples check                                  | Every `` ```typescript ``/`` ```tsx `` fence under `spec/` compiles against the real API |
| 6    | `bash spec/scripts/verify-traceability.sh --strict` | Spec self-consistency                                                                    |
| 7    | coverage thresholds                                 | See `spec/traceability.md` §6                                                            |

## Test pyramid (planned)

| Level      | Tool                                                         | Convention                            |
| ---------- | ------------------------------------------------------------ | ------------------------------------- |
| Unit       | `@effect/vitest` (`it.effect`, `it.layer`)                   | `packages/*/test/*.test.ts`           |
| Type-level | a type-testing tool (tstyche or equivalent — not yet chosen) | `packages/*/test/*.test-d.ts`         |
| Acceptance | `@effect-cucumber/vitest` itself, dogfooded                  | `.feature` files tagged `@REQ-EC-NNN` |

## What "done" means for a spec doc

A requirement is not done because a doc describes it. It is done when a test
would fail if the behavior it describes regressed — see `spec/roadmap.md` for
the honest current split between "specified" and "verified."

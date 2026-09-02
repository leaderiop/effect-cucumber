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

## Merge gate

`packages/*` exists and most of this table is wired. `.github/workflows/check.yml`
is the live gate; `spec/roadmap.md` § Current state remains the single authority
on build status. This table is still not the literal, in-order list of commands a
single `pnpm check` runs — there is no `pnpm check` — so it is a MAP of the gate
rather than the gate itself, and the two can still drift. Per `AGENTS.md` §4, a
row says what is true of it today and nothing more.

| Step | Command                                          | Status | Enforces                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---- | ------------------------------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | `pnpm build` (`tsc -b`) + `pnpm typecheck:test`  | Wired  | Type-checks sources and tests, with `@effect/tsgo`'s Layer diagnostics failing the build (ADR-EC-016)                                                                                                                                                                                                                                                                                                                                                  |
| 2    | `pnpm lint` (`oxlint` + `dprint check`)          | Wired  | House style, plus the vendored Effect rules                                                                                                                                                                                                                                                                                                                                                                                                            |
| 3    | `pnpm test` (`vitest run`)                       | Wired  | Unit + `@effect/vitest` tests                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 4    | `pnpm test`, plus the two acceptance-suite gates | Wired  | The `@REQ-EC-NNN`-tagged `.feature` scenarios under `packages/vitest/test/acceptance/` run through the real `describeFeature` as part of the ordinary `vitest run` — there is no separate acceptance command, deliberately, because a suite behind its own command is a suite that stops being run. Its two discipline gates are separate: `pnpm verify:acceptance-ref-state` (INV-EC-006) and `pnpm verify:acceptance-no-any` (INV-EC-003's boundary) |
| 5    | `pnpm verify:doc-examples`                       | Wired  | Every `` ```typescript ``/`` ```tsx `` fence under `spec/` compiles against the real API (a fence may opt out with a `doc-examples:skip` marker naming why, never silently)                                                                                                                                                                                                                                                                            |
| 6    | `pnpm verify:spec`                               | Wired  | Spec self-consistency — 22 of 22 requirements carried exactly once, each with a §5 row. Runs WITH `--strict`, so a SKIP is a FAIL: a check that did not run must not read as a check that passed. This row previously recorded the opposite as a known contradiction; it is resolved, not documented. Row 5 above is a separate gate, not folded into this one                                                                                         |
| 7    | `pnpm coverage`                                  | Wired  | `spec/traceability.md` §6's 90%/90% statement/branch target, per package. Node 24 CI leg only                                                                                                                                                                                                                                                                                                                                                          |

Beyond the rows above, `check.yml` runs twelve further `verify:*` gates —
`pack`, `tsgo-gate`, `oxlint-plugin`, `no-runner-dep`, `testapi-seam`,
`tags-filter`, `shared-layer-once`, `watch-rerun`, `pitfalls`,
`api-surface` (the `check-api-surface` script `spec/overview.md` used to call
planned), `doc-examples` and `no-planning-refs` (no source or test comment may
cite an artefact that lives only on the `planning-archive` branch) — plus
`pnpm circular` and `pnpm test:shuffle`, for twenty-two commands in total. Each exists because something
it now catches was once green while being wrong.

## Test pyramid

All three levels exist. The Type-level row settled differently from how it was
planned, and says so rather than being quietly reworded.

| Level      | Tool                                                                                                                                           | Convention                                                                                                                                                                                                                                                                                                                                           |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit       | `@effect/vitest` — plain `it` for pure functions, `it.effect` where an Effect runs, `TestClock` where time matters; no `it.layer`              | `packages/*/test/*.test.ts`                                                                                                                                                                                                                                                                                                                          |
| Type-level | plain `tsc --noEmit` via `pnpm typecheck:test`, plus `scripts/verify-tsgo-gate.sh` for the cases whose whole claim is that they do NOT compile | `packages/*/test/*.types.ts` — **not** `.test-d.ts`, and no tstyche. The suffix is outside vitest's include glob on purpose, so these files are compiled and never collected; renaming one to `.test.ts` breaks `pnpm test` with "No test suite found". A claim about what does not compile needs a separate process, which is what the tsgo gate is |
| Acceptance | `@effect-cucumber/vitest` itself, dogfooded                                                                                                    | `.feature` + `.steps.test.ts` pairs under `packages/vitest/test/acceptance/`, the `.feature` files tagged `@REQ-EC-NNN`, run by the ordinary `pnpm test`. Guarded by `pnpm verify:acceptance-ref-state` and `pnpm verify:acceptance-no-any`; every pair carries a numbered mutation record in its module doc comment, per that directory's README    |

## What "done" means for a spec doc

A requirement is not done because a doc describes it. It is done when a test
would fail if the behavior it describes regressed — see `spec/roadmap.md` for
the honest current split between "specified" and "verified."

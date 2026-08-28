# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-08-28)

**Core value:** A Scenario's dependencies are checked at compile time via a `Layer` — a step needing a service the ambient Layer doesn't provide is a type error at authoring time, never a runtime failure.
**Current focus:** Phase 1 — Workspace, Toolchain, and Dependency Policy

## Current Position

Phase: 1 of 11 (Workspace, Toolchain, and Dependency Policy)
Plan: 1 of 6 in current phase
Status: In progress
Last activity: 2026-08-28 — Completed 01-01-PLAN.md (TypeScript build foundation)

Phase 1 progress: [█░░░░░░░░░] 17% (1/6 plans)
Overall progress:  [░░░░░░░░░░] ~2% (1 of ~66 plans; only phase 1 is planned in detail)

## Performance Metrics

**Velocity:**
- Total plans completed: 1
- Average duration: ~5m
- Total execution time: ~5m

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1 | 1/6 | ~5m | ~5m |

**Recent Trend:**
- Last 5 plans: 01-01 (~5m)
- Trend: — (insufficient data)

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: Phase structure follows research's dependency-graph build order (research P0-P10 renumbered to Phases 1-11). Three independent derivations converged.
- [Roadmap]: PARSE-04 (DataTable wrapper) added to REQUIREMENTS.md — it was an active requirement in PROJECT.md with no REQ-ID. Assigned to Phase 4, per research's detailed breakdown (not its executive-summary mention of Phase 1).
- [Roadmap]: MATCH-03/04/05 (drift detection) assigned to Phase 6, where the resolved plan exists — Phase 3 builds the match-all-patterns mechanism they rely on.
- [Pre-roadmap]: `effect` is a peerDependency; `@effect/tsgo` gates the build (ADR-EC-015/016 — already applied to the repo).
- [01-01]: The `@effect/language-service` plugin block keeps both `ignoreEffectWarningsInTscExitCode` and `ignoreEffectErrorsInTscExitCode` at `false`, deliberately diverging from STACK.md §5.3 (which suggests warnings-ignored). Effect warnings failing `tsc` is the gate plan 01-02 exists to prove — do not relax.
- [01-01]: `${configDir}`-relative `rootDir`/`outDir` live in `tsconfig.base.json`; package tsconfigs carry no path duplication. Verified expanding per-package, not per-base-file.
- [01-01]: `types: []` inherited workspace-wide. Packages opt into ambient types (e.g. `["node"]` for vitest in Phase 5) only when actually needed.

### Pending Todos

[From .planning/todos/pending/ — ideas captured during sessions]

None yet.

### Blockers/Concerns

**All four spec amendments below are already done** — resolved and committed
*before* this roadmap was created; the roadmapper's context
(`.planning/research/SUMMARY.md`) predates them, so it listed these as
pending. Recorded here to correct the record for any future session reading
this file, not as open work:

- ~~**Phase 2**: ADR-EC-014 must state the Background-in-Outline placeholder-substitution exception.~~ Done — see the correction blockquote in `spec/decisions/014-loadfeature-consumes-gherkindocument-and-pickles.md`.
- ~~**Phase 3**: ADR-EC-007's correction must be restated as "custom types are data, replayed into a fresh registry per call".~~ Done — see the second correction blockquote in `spec/decisions/007-cucumber-expressions-for-step-matching.md`.
- ~~**Phase 5**: `Scenario`'s callback shape must be settled, fixing `spec/behaviors/03`'s broken worked example.~~ Done — `spec/decisions/017-background-and-scenario-are-step-definition-containers.md`; all three worked examples in `spec/behaviors/` corrected.
- ~~**Phase 10**: Decide `excludeTestServices` fix vs. an explicit INV-EC-002 carve-out.~~ Done — the fix was adopted, see `spec/decisions/018-shared-layer-testclock-isolation.md`.

No open spec blockers remain on any phase as of this writing.

Deferred, do not silently drop: **REUSE-01** (reusable step definitions) — users hit it on their second feature file; needs its own milestone.

Open toolchain decisions to close in Phase 1: dprint `semiColons: "asi"`, pnpm 11.x bump, `publint`/`madge`/`pkg-pr-new` adoption, weekly `effect@rc` canary CI job.

New since 01-01 (not blockers, constraints to respect):

- `erasableSyntaxOnly` + `verbatimModuleSyntax` are on workspace-wide. No enums, no parameter properties, no `namespace` blocks; type-only imports must be marked `import type` or inline `type`. Constrains all Phase 2+ source.
- Both packages' `src/index.ts` are placeholders that say so in their doc comments. Phase 2 replaces gherkin's, Phase 5 replaces vitest's. The `packageName` exports are not public API.
- `tools/` (vendored Effect oxlint rules) is still untracked — belongs to the lint plan, not yet committed.

## Session Continuity

Last session: 2026-08-28
Stopped at: Completed 01-01-PLAN.md — `tsc -b` compiles both packages clean from cold
Resume file: None

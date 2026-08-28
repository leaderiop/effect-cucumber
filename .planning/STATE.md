---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: "Completed 01-03-PLAN.md — pnpm lint + verify:oxlint-plugin make AGENTS.md §3 mechanical"
last_updated: "2026-08-28T04:23:45.462Z"
last_activity: 2026-08-28
progress:
  total_phases: 11
  completed_phases: 0
  total_plans: 6
  completed_plans: 3
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-08-28)

**Core value:** A Scenario's dependencies are checked at compile time via a `Layer` — a step needing a service the ambient Layer doesn't provide is a type error at authoring time, never a runtime failure.
**Current focus:** Phase 1 — Workspace, Toolchain, and Dependency Policy

## Current Position

Phase: 1 of 11 (Workspace, Toolchain, and Dependency Policy)
Plan: 4 of 6 in current phase (01-01, 01-02, 01-03 complete; 01-04 is next)
Status: Ready to execute
Last activity: 2026-08-28 — Completed 01-03-PLAN.md (lint + format toolchain)

Phase 1 progress: [█████░░░░░] 50% (3/6 plans)
Overall progress:  [░░░░░░░░░░] ~5% (3 of ~66 plans; only phase 1 is planned in detail)

## Performance Metrics

**Velocity:**

- Total plans completed: 3
- Average duration: ~12m
- Total execution time: ~35m

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1 | 3/6 | ~35m | ~12m |

**Per-plan detail:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| 01-01 | ~5m | 3 | 5 |
| 01-02 | ~12m | 2 | 8 |
| 01-03 | ~18m | 2 | 16 |

**Recent Trend:**

- Last 5 plans: 01-01 (~5m), 01-02 (~12m), 01-03 (~18m)
- Trend: rising — 01-02 and 01-03 both spent most of their time mutation-testing a gate script rather than writing the config it guards. That is the intended cost profile for this phase.

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
- [01-02]: **A diagnostics gate is verified by EXIT CODE, never by grepping compiler output.** With `ignoreEffectErrorsInTscExitCode: true`, `tsc` still prints every `effect(...)` diagnostic verbatim and exits 0 — output is byte-identical to an enforced gate. A grep-based version of `verify-tsgo-gate.sh` was built, passed, and was proven vacuous by mutation testing. Do not "simplify" it back.
- [01-02]: The gate proof rides on `floating-effect.ts` compiled in isolation (`tsconfig.floating.json`), because it is valid TypeScript — its non-zero exit can only come from the Effect layer. `missing-layer-context.ts` cannot serve this role: it unavoidably also emits a plain `TS2375`.
- [01-02]: tsgo gate fixtures must live under a directory literally named `src`. `@effect/tsgo`'s default per-file override scopes `floatingEffect: "error"` to `src/**/*.ts`; move the files and the probe silently stops firing.
- [Phase 01]: The vendored oxlint plugin is proven loaded by `pnpm verify:oxlint-plugin` (exit code on a deliberate barrel import), never by `pnpm lint` exiting 0 — an unwired jsPlugins specifier or a rule set to "off" is silent and still exits 0. Mutation-tested; do not delete this gate.
- [Phase 01]: Vendored code in tools/oxlint/effect/** is exempt from *style* rules only (unicorn/consistent-function-scoping), never from correctness/suspicious/perf. Editing upstream files to satisfy our style would break the curl resync path documented in ATTRIBUTION.md.
- [Phase 01]: Effect's dprint config is adopted wholesale including `semiColons: "asi"` — no semicolons. Confirmed non-destructive: the four vendored rule sources are MD5-identical before and after `dprint fmt`.
- [Phase 01]: spec/**/*.md is dprint-formatted, including fenced ts code blocks. Spec examples now match house style (double quotes, no semicolons). Future spec edits must survive `dprint check`.

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

Open toolchain decisions to close in Phase 1: ~~dprint `semiColons: "asi"`~~ (closed in 01-03 — adopted), pnpm 11.x bump, `publint`/`madge`/`pkg-pr-new` adoption, weekly `effect@rc` canary CI job.

New since 01-01 (not blockers, constraints to respect):

- `erasableSyntaxOnly` + `verbatimModuleSyntax` are on workspace-wide. No enums, no parameter properties, no `namespace` blocks; type-only imports must be marked `import type` or inline `type`. Constrains all Phase 2+ source.
- Both packages' `src/index.ts` are placeholders that say so in their doc comments. Phase 2 replaces gherkin's, Phase 5 replaces vitest's. The `packageName` exports are not public API.
- ~~`tools/` (vendored Effect oxlint rules) is still untracked~~ — resolved in 01-03; 10 files now tracked.

New since 01-02 (not blockers, constraints to respect):

- `pnpm verify:tsgo-gate` guards `tsconfig.base.json`'s plugin block **behaviorally**. Any future plan that relaxes `ignoreEffectErrorsInTscExitCode` will fail it with a message naming the flag. That is the intended outcome, not a bug to route around.
- **01-05 (CI) should add `pnpm verify:tsgo-gate` to the merge gate.** It is fast (three small `tsc` invocations) and is the only thing standing between the project and a silently-advisory type system.
- Gap, not covered: `ignoreEffectWarningsInTscExitCode` has no behavioral test. Both gate probes are error-severity, so that flag does not govern them. Closing it needs a warning-severity probe. Only worth doing if that flag is ever contested.
- `packages/vitest/test/` is outside the solution build (`include: ["src"]`) and its configs are `noEmit`. Phase 5's real test infrastructure will need to decide whether to keep that separation.

New since 01-03 (not blockers, constraints to respect):

- **No semicolons, double quotes, 120 cols, trailing commas never.** All Phase 2+ source must be written this way or `pnpm lint` fails. Run `pnpm lint-fix` rather than hand-formatting.
- **All `effect` / `@effect/*` imports must be submodule namespace imports** (`import * as Effect from "effect/Effect"`). `import { Effect } from "effect"` is now a lint *error*, not a convention. Relative `index` imports are also rejected (`checkRelativeIndexImports: true`).
- **01-06 (CI) should add `pnpm lint` and `pnpm verify:oxlint-plugin` to the merge gate**, alongside `pnpm verify:tsgo-gate`. `pnpm lint` alone does not prove the vendored plugin is loaded — see the 01-03 decision above.
- `spec/**/*.md` is now dprint-formatted including its fenced `ts` blocks. Editing spec files by hand risks failing `dprint check`; run `pnpm format` after.
- `no-bigint-literals` is the one vendored rule with no test (upstream shipped none). Enabled and loading, but locally unverified.
- `pnpm install` prints "Ignored build scripts: dprint@0.56.1". Harmless — dprint resolves its binary via a platform optional dependency. 01-06 may want to silence it in CI.

## Session Continuity

Last session: 2026-08-28T04:23:36.324Z
Stopped at: Completed 01-03-PLAN.md — pnpm lint + verify:oxlint-plugin make AGENTS.md §3 mechanical
Resume file: None

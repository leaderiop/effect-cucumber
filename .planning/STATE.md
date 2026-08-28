---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: ready_to_plan
stopped_at: Phase 02 complete (11/11) — ready to discuss Phase 3
last_updated: 2026-08-28T13:24:55.314Z
last_activity: 2026-08-28 -- Phase 2 execution started
progress:
  total_phases: 11
  completed_phases: 1
  total_plans: 17
  completed_plans: 17
  percent: 9
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-08-28)

**Core value:** A Scenario's dependencies are checked at compile time via a `Layer` — a step needing a service the ambient Layer doesn't provide is a type error at authoring time, never a runtime failure.
**Current focus:** Phase 3 — parameter types and step matching

## Current Position

Phase: 3
Plan: Not started
Status: Ready to plan
Last activity: 2026-08-28

**Current focus:** Phase 2 — `loadFeature` — Parse, Compile, Correlate

Phase 1 progress: [██████████] 100% (6/6 plans)
Overall progress:  [█░░░░░░░░░] ~9% (6 of ~66 plans; only phase 1 is planned in detail)

## Performance Metrics

**Velocity:**

- Total plans completed: 17
- Average duration: ~10m
- Total execution time: ~60m

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1 | 6/6 | ~60m | ~10m |
| 02 | 11 | - | - |

**Per-plan detail:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| 01-01 | ~5m | 3 | 5 |
| 01-02 | ~12m | 2 | 8 |
| 01-03 | ~18m | 2 | 16 |
| 01-04 | ~8m | 2 | 5 |
| 01-05 | ~14m | 2 | 9 |
| 01-06 | ~3m | 2 | 4 |

**Recent Trend:**

- Last 6 plans: 01-01 (~5m), 01-02 (~12m), 01-03 (~18m), 01-04 (~8m), 01-05 (~14m), 01-06 (~3m)
- Trend: 01-02, 01-03 and 01-05 each spent most of their time mutation-testing a gate script rather than writing the thing it guards; 01-04 was the outlier because its equivalent proof (unpacking a `pnpm pack` tarball) was a single command rather than a script that has to be written and then attacked. 01-05 turned that one-off command into the standing gate, which is why it costs script-writing time again. 01-06 is the payoff and the cheapest plan in the phase: because every gate was already a root script proven by mutation, wiring them into CI was assembly, not design.

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
- [Phase 01]: Peer ranges and dev pins live in **separate pnpm catalogs** — the default `catalog:` holds exact rc pins for `devDependencies`, the named `catalogs.peer` holds ranges for `peerDependencies`. `catalog:` expands verbatim at pack time, so a pinned catalog behind a peerDependency would publish an exact peer range and strand consumers on a different rc (Pitfall 20). An Effect rc bump is now a two-line edit in `pnpm-workspace.yaml`.
- [Phase 01]: Dev-time `exports` point at `./src/index.ts`; `publishConfig.exports` swaps them to `./dist/index.js` at pack time. No build step is needed for in-repo development, and no prepack script exists. Verified with `tsc -b --force` and `--traceResolution` — the feared TS6307 under composite project references did not occur.
- [Phase 01]: **`pnpm install` does not validate named-catalog references.** A `catalog:typo` in a `peerDependency` exits 0 on install, lint and build, and only fails at `pnpm pack` (`ERR_PNPM_CATALOG_ENTRY_NOT_FOUND_FOR_SPEC`). Peer deps leave no trace in `pnpm-lock.yaml` at all. Packaging claims must be proven by unpacking the tarball, never by reading the source manifest.
- [Phase 01]: Pitfall 20 now has an **executable** guard: `pnpm verify:pack` unpacks both tarballs and fails by name if `peerDependencies.effect` or `peerDependencies["@effect/vitest"]` is a bare exact version. Mutation-tested by pinning the `peer` catalog to `4.0.0-rc.112` — `pnpm install`, `pnpm lint` and `pnpm build` all still exited 0 while `verify:pack` exited 1. Do not delete this gate, and do not rewrite any of its assertions to read `packages/*/package.json` — the source manifest reads `catalog:peer` in both the passing and the failing case, so such an assertion is vacuous.
- [Phase 01]: npm ships `README.md` in the tarball regardless of the `files` array (verified by unpacking, not assumed) — so no manifest change was needed to publish the three READMEs. `verify:pack` asserts the README's presence anyway, so a divergence in pnpm's packing fails loudly instead of publishing a blank npm page.
- [Phase 01]: Every published install instruction that pulls in Effect carries `effect@rc` and `@effect/vitest@rc` explicitly (root `README.md`, `packages/vitest/README.md`), because npm's `latest` tag for both still points at the v3 line (Pitfall 19). `packages/gherkin/README.md` names neither — that package declares no `effect` dependency (ADR-EC-015). Nothing checks the tag advice automatically; revisit all three READMEs when `effect@4.0.0` ships stable.
- [Phase 01]: `pnpm circular` (madge) covers **intra-package** cycles only — madge's resolver cannot follow the cross-package bare import through an `exports` map, and `madge --ts-config` crashes on TypeScript 7. Cross-package cycles are covered instead by `tsc -b`, which rejects circular project references.
- [Phase 01]: `repository.url` uses the full `git+https://` form in both packages, so publint's output is completely silent. A check carrying one permanently-ignored suggestion trains people to ignore the next one.
- [Phase 01]: Every CI workflow step is a root package.json script that also runs locally — no command exists only in CI — makes 'passes on my machine' and 'passes in CI' unable to diverge
- [Phase 01]: check.yml uses four independent parallel jobs (lint/types/test/package) rather than one serial check job — a lint failure and a type failure are reported in the same run instead of one push at a time
- [Phase 01]: A gate that can silently stop firing gets its own CI liveness step: pnpm verify:oxlint-plugin runs alongside pnpm lint — pnpm lint exiting 0 does not prove the vendored effect rules loaded; an unresolvable jsPlugins specifier looks identical to a clean run
- [Phase 01]: snapshot.yml (pkg-pr-new) is deliberately excluded from branch-protection required checks — a preview publish failing for reasons outside the PR must never block a merge

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

Open toolchain decisions to close in Phase 1: ~~dprint `semiColons: "asi"`~~ (closed in 01-03 — adopted), ~~`publint`/`madge` adoption~~ (closed in 01-05 — both adopted and wired), ~~`pkg-pr-new` adoption~~ (closed in 01-06 — adopted; `snapshot.yml` publishes per-PR previews). Still open and deliberately deferred past Phase 1: the pnpm 11.x bump (no forcing function) and the weekly `effect@rc` canary CI job (revisit once the core test suite is worth protecting against a moving prerelease).

New since 01-01 (not blockers, constraints to respect):

- `erasableSyntaxOnly` + `verbatimModuleSyntax` are on workspace-wide. No enums, no parameter properties, no `namespace` blocks; type-only imports must be marked `import type` or inline `type`. Constrains all Phase 2+ source.
- Both packages' `src/index.ts` are placeholders that say so in their doc comments. Phase 2 replaces gherkin's, Phase 5 replaces vitest's. The `packageName` exports are not public API.
- ~~`tools/` (vendored Effect oxlint rules) is still untracked~~ — resolved in 01-03; 10 files now tracked.

New since 01-02 (not blockers, constraints to respect):

- `pnpm verify:tsgo-gate` guards `tsconfig.base.json`'s plugin block **behaviorally**. Any future plan that relaxes `ignoreEffectErrorsInTscExitCode` will fail it with a message naming the flag. That is the intended outcome, not a bug to route around.
- ~~**01-05 (CI) should add `pnpm verify:tsgo-gate` to the merge gate.**~~ Done in 01-06 — it runs in the `types` job of `.github/workflows/check.yml` as a required step.
- Gap, not covered: `ignoreEffectWarningsInTscExitCode` has no behavioral test. Both gate probes are error-severity, so that flag does not govern them. Closing it needs a warning-severity probe. Only worth doing if that flag is ever contested.
- `packages/vitest/test/` is outside the solution build (`include: ["src"]`) and its configs are `noEmit`. Phase 5's real test infrastructure will need to decide whether to keep that separation.

New since 01-03 (not blockers, constraints to respect):

- **No semicolons, double quotes, 120 cols, trailing commas never.** All Phase 2+ source must be written this way or `pnpm lint` fails. Run `pnpm lint-fix` rather than hand-formatting.
- **All `effect` / `@effect/*` imports must be submodule namespace imports** (`import * as Effect from "effect/Effect"`). `import { Effect } from "effect"` is now a lint *error*, not a convention. Relative `index` imports are also rejected (`checkRelativeIndexImports: true`).
- ~~**01-06 (CI) should add `pnpm lint` and `pnpm verify:oxlint-plugin` to the merge gate**~~ Done — both run in the `lint` job of `check.yml`. `verify:oxlint-plugin` was not in the 01-06 plan and was added as a Rule 2 deviation for exactly the reason recorded here.
- `spec/**/*.md` is now dprint-formatted including its fenced `ts` blocks. Editing spec files by hand risks failing `dprint check`; run `pnpm format` after.
- `no-bigint-literals` is the one vendored rule with no test (upstream shipped none). Enabled and loading, but locally unverified.
- `pnpm install` prints "Ignored build scripts: dprint@0.56.1". Harmless — dprint resolves its binary via a platform optional dependency. 01-06 may want to silence it in CI.

New since 01-04 (not blockers, constraints to respect):

- **Version bumps happen in `pnpm-workspace.yaml`, nowhere else.** No package manifest may reintroduce a literal `effect` / `@effect/vitest` / `vitest` / `typescript` version — use `catalog:` in `devDependencies` and `catalog:peer` in `peerDependencies`. The two catalogs are not interchangeable.
- **`@effect-cucumber/gherkin` must never gain an `effect` dependency** in any field (ADR-EC-015). If Phase 2 finds it needs Effect, that is an ADR revision, not a manifest edit.
- **Neither package declares `main` or `types`.** The `exports` map is the only resolution surface, and it points at `src` in-repo. A future plan adding a subpath export must add it to *both* `exports` and `publishConfig.exports`, or the subpath will 404 for consumers while working locally.
- **`files: ["src/**/*.ts", "dist"]`** — anything a package needs shipped (a README, a LICENSE, an `ai-docs/` tree) must be added here explicitly.
- ~~**01-06 (CI) should add `pnpm pack` to the merge gate**, not just to a release job.~~ Done — `pnpm verify:pack` (which packs and unpacks both tarballs) runs in the `package` job of `check.yml`.
- The peer ranges mirror `@effect/vitest@4.0.0-rc.112`'s own published peers. Nothing enforces that they stay in sync across a future rc bump — check by hand, or add a drift check.
- `"license": "MIT"` is declared with no LICENSE file anywhere in the repo. See `.planning/phases/01-workspace-toolchain-and-dependency-policy/deferred-items.md`.

New since 01-06 (not blockers, constraints to respect):

- **Every gate in this phase is now enforced on every PR.** `.github/workflows/check.yml` runs `lint` (+ `verify:oxlint-plugin`), `types` (`build` + `verify:tsgo-gate`), `test` (Node 22 and 24), and `package` (`verify:pack`, `circular`, `verify:spec`). Phase 2+ source that breaks any of them cannot merge.
- **Every CI step must stay a root `package.json` script.** Do not add an inline command to a workflow — if CI needs to run something, declare it as a script so it runs identically locally. A script cross-check in the 01-06 summary asserts this property; keep it true.
- **`--frozen-lockfile` is on every install in every job.** Any dependency change must land with the updated `pnpm-lock.yaml` in the same commit, or CI fails.
- **Adding a new gate script means adding a CI step for it.** A script nobody runs is back to being a convention — the exact problem 01-06 existed to fix.
- **`snapshot.yml` must never become a required check.** It can fail for reasons outside the PR (the pkg-pr-new GitHub App not being installed).
- **Manual step outstanding:** install the pkg-pr-new GitHub App on `leaderiop/effect-cucumber` (<https://github.com/apps/pkg-pr-new>). No token or secret required. Until then `snapshot.yml` fails on PRs — expected and non-blocking.
- **Optional, not done:** the four `check.yml` jobs are not yet registered as branch-protection required checks on `main`. The workflows exist; enforcing them at the GitHub level is a repo-settings step.
- Action versions are plain tags (`actions/checkout@v6`, `pnpm/action-setup@v6`, `actions/setup-node@v7`), not pinned SHAs. `checkout` and `setup-node` both have a newer major available; bumping is a judgement call, not a gate.
- `pnpm/action-setup` reads the root `packageManager: pnpm@10.26.1` field — no `version:` input is duplicated in any workflow step. A pnpm bump is still a one-line edit.
- The "Ignored build scripts: dprint@0.56.1" install notice was **not** silenced in CI (harmless, and silencing it would mean an install flag that differs from local).

## Session Continuity

Last session: 2026-08-28T05:00:00.000Z
Stopped at: Phase 1 verified passed (see .planning/phases/01-workspace-toolchain-and-dependency-policy/01-VERIFICATION.md). One outstanding manual step: install the pkg-pr-new GitHub App on leaderiop/effect-cucumber (https://github.com/apps/pkg-pr-new) — not blocking.
Resume file: None

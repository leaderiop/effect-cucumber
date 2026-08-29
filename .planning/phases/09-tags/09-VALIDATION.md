---
phase: 09
slug: tags
status: planned
nyquist_compliant: true
wave_0_complete: true
created: 2026-08-29
updated: 2026-08-29
---

# Phase 09 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.11 with @effect/vitest 4.0.0-rc.112 |
| **Config file** | `vitest.config.ts` at the repo root — created by plan 09-01 (Wave 1) |
| **Quick run command** | `pnpm exec vitest run packages/vitest/test/Runner.test.ts` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm exec vitest run packages/vitest`
- **After every plan wave:** Run `pnpm test && pnpm typecheck:test && pnpm verify:tsgo-gate`
- **Before `/gsd:verify-work`:** `pnpm test && pnpm lint && pnpm circular && pnpm typecheck:test && pnpm build && pnpm verify:tsgo-gate && pnpm verify:oxlint-plugin && pnpm verify:no-runner-dep && pnpm verify:testapi-seam && pnpm verify:tags-filter && pnpm verify:pack && pnpm verify:spec` must all be green
- **Max feedback latency:** ~10 seconds (per-task quick run)

---

## Per-Task Verification Map

| # | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 1 | 09-01 T1 | 1 | RUN-05 | T-09-01-01, T-09-01-04 | `vitest.config.ts` declares the eight-tag universe with `allowOnly: false`, no `include`/`exclude`, and provably unchanged suite counts | config | `pnpm test && pnpm lint` | ✅ created here | ⬜ pending |
| 2 | 09-01 T2 | 1 | — (D-11) | T-09-01-02, T-09-01-03 | Seam gate: no framework import in `Runner.ts` / `TestApi.ts`, with a positive control | script | `bash scripts/verify-testapi-seam.sh` | ✅ created here | ⬜ pending |
| 3 | 09-02 T1 | 1 | RUN-05 (D-05/06/07) | T-09-02-03 | `Tags.ts` leaf: reserved constants, `TagFilter`, `shouldEmit`, `isSkipped` | build | `pnpm build && pnpm lint && pnpm circular` | ✅ created here | ⬜ pending |
| 4 | 09-02 T2 | 1 | RUN-05 | T-09-02-03 | Filter semantics including BOTH empty-array cases | unit | `pnpm exec vitest run packages/vitest/test/Tags.test.ts && pnpm verify:spec` | ✅ created here | ⬜ pending |
| 5 | 09-02 T3 | 1 | RUN-05 (D-08/D-10) | T-09-02-01, T-09-02-02, T-09-02-04 | Both new warning types quote author input and are asserted at exact length | unit | `pnpm exec vitest run packages/vitest/test/Errors.test.ts && pnpm build` | ✅ extend | ⬜ pending |
| 6 | 09-03 T1 | 1 | RUN-05 / SC1 | T-09-03-01, T-09-03-03 | `ScenarioPlan.tags` required and populated from the parsed Scenario | build | `pnpm build` | ✅ extend | ⬜ pending |
| 7 | 09-03 T2 | 1 | RUN-05 / SC1 | T-09-03-03 | Four-level inheritance reaches the plan; untagged plans as `[]` | unit | `pnpm exec vitest run packages/vitest && pnpm typecheck:test` | ✅ extend | ⬜ pending |
| 8 | 09-04 T1 | 2 | RUN-05 | T-09-04-05, T-09-04-06 | `EmitOptions` is library-owned; no framework type on the seam | script | `pnpm verify:testapi-seam` | ✅ extend | ⬜ pending |
| 9 | 09-04 T2 | 2 | RUN-05 / SC1,2,4 | T-09-04-01, T-09-04-03, T-09-04-04 | Filter inside the walk; skip routed; teardown suppressed; warnings untouched | build+suite | `pnpm build && pnpm verify:testapi-seam && pnpm test` | ✅ extend | ⬜ pending |
| 10 | 09-04 T3 | 2 | RUN-05 / SC1,3,4 | T-09-04-02, T-09-04-03 | Emission shape under the recording fake, incl. Pitfall 4 warning-invariance | unit | `pnpm exec vitest run packages/vitest/test/Runner.test.ts` | ✅ extend | ⬜ pending |
| 11 | 09-05 T1 | 3 | RUN-05 / SC4 (D-01/02/03/10) | T-09-05-02, T-09-05-05 | Public 4th argument; overload order intact; one exclusion notice | type gate + suite | `pnpm verify:tsgo-gate && pnpm build && pnpm typecheck:test && pnpm test` | ✅ extend | ⬜ pending |
| 12 | 09-05 T2 | 3 | RUN-05 (D-08) | T-09-05-01, T-09-05-03, T-09-05-04, T-09-05-06 | Per-Feature adapter, catch-and-degrade, non-tag failures re-thrown | build+suite | `pnpm build && pnpm verify:testapi-seam && pnpm test` | ✅ extend | ⬜ pending |
| 13 | 09-06 T1 | 4 | RUN-05 / SC1, SC3 | T-09-06-03, T-09-06-04 | A four-level-tagged Feature collects and runs under `--allowOnly=false` | integration | `pnpm exec vitest run packages/vitest/test/emission.test.ts` | ✅ extend | ⬜ pending |
| 14 | 09-06 T2 | 4 | RUN-05 / SC2 (Pitfall 15) | T-09-06-03 | `@skip` runs no step and no hook; unmatched step harmless; no teardown | integration | `pnpm exec vitest run packages/vitest/test/emission.test.ts` | ✅ extend | ⬜ pending |
| 15 | 09-06 T3 | 4 | RUN-05 (D-08, D-10) | T-09-06-01, T-09-06-02, T-09-06-05 | Undeclared tag degrades with a quoted located warning; one exclusion notice; `[]` prints none | integration | `pnpm exec vitest run packages/vitest/test/emission.test.ts && pnpm test` | ✅ extend | ⬜ pending |
| 16 | 09-07 T1 | 4 | RUN-05 (D-09) | T-09-07-01, T-09-07-02, T-09-07-04 | `gherkinTags` accepts a glob pattern (or array of patterns) via `tinyglobby`'s `globSync`, throws on empty pattern, adds `tinyglobby` as one audited direct dependency | build | `pnpm build && pnpm lint && pnpm circular` | ✅ created here | ⬜ pending |
| 17 | 09-07 T2 | 4 | RUN-05 (D-09) | T-09-07-03 | Scanner behaviour on real fixtures; config compatibility proven at compile time | unit + type | `pnpm exec vitest run packages/vitest/test/GherkinTags.test.ts && pnpm typecheck:test && pnpm verify:spec` | ✅ created here | ⬜ pending |
| 18 | 09-07 T3 | 4 | RUN-05 | T-09-07-05 | Barrel exports this phase's surface; no stale "tag is inert" claim | build+pack | `pnpm build && pnpm verify:pack && pnpm test` | ✅ extend | ⬜ pending |
| 19 | 09-08 T1 | 5 | RUN-05 / SC2, SC4 | T-09-08-01..05 | CLI filter selects the tagged Scenario; `@skip` reports skipped; excluded is ABSENT | script | `bash scripts/verify-tags-filter.sh` | ✅ created here | ⬜ pending |
| 20 | 09-08 T2 | 5 | RUN-05 / SC4 | T-09-08-01 | The gate runs on every PR from a root script | script | `pnpm verify:tags-filter && pnpm lint` | ✅ extend | ⬜ pending |
| 21 | 09-09 T1 | 6 | RUN-05 | T-09-09-03 | ADR-EC-026 supersedes ADR-EC-020 without rewriting it | spec gate | `pnpm verify:spec` | ✅ existing gate | ⬜ pending |
| 22 | 09-09 T2 | 6 | RUN-05 | T-09-09-01, T-09-09-04, T-09-09-05 | BEH-EC-008 and BEH-EC-017 amended; worked example updated | spec gate | `pnpm verify:spec && pnpm lint` | ✅ existing gate | ⬜ pending |
| 23 | 09-09 T3 | 6 | RUN-05 | T-09-09-02 | Status docs corrected; RUN-05 marked Complete; full gate set green | full gate set | see Sampling Rate's phase-gate line | ✅ existing gates | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements — all resolved at planning time

- [x] **Root `vitest.config.ts`.** Owned by plan 09-01 Task 1, in Wave 1, before any plan emits a tag.
      Declares exactly eight tags (`@skip`, `@only`, `@slow`, `@wip`, `@featuretag`, `@ruletag`,
      `@scenariotag`, `@exampletag`) with `allowOnly: false`. It sets neither `include` nor `exclude`
      (Finding 15's anti-pattern) and leaves `strictTags` at its default `true`.
- [x] **Mechanism for exercising a CLI tag filter in CI.** Resolved: `scripts/verify-tags-filter.sh`
      (plan 09-08), a structural gate that runs the runner twice over `emission.test.ts`, parses the
      machine-readable report with `node -e` rather than matching reporter glyphs, and carries
      preconditions on the Scenario titles it depends on plus a non-zero-result vacuity control on each
      run. Wired as `pnpm verify:tags-filter` and added to the CI job that runs `pnpm test`.
- [x] **Mechanism for automating the D-08 degradation path.** Resolved WITHOUT introducing a
      child-process or nested-runner test. The tag `@undeclared-on-purpose` is deliberately left out of
      `vitest.config.ts`'s declared list (plan 09-01 comment (d)), so `emission.test.ts` can emit it
      inside the main run: the adapter catches the rejection, re-emits untagged, and the module-scope
      `console.warn` capture asserts the located warning (plan 09-06 Task 3). No second config file and
      no new test infrastructure. The same probe doubles as the positive control proving the tag path
      is live rather than silently dropped.
- [x] **Framework install:** `vitest`, `@vitest/runner` and `@effect/vitest` are already installed at
      the versions the research verified against — no install needed for the core tag/skip/only path.
      Plan 09-07 DOES add one new, user-approved direct dependency of `packages/vitest`:
      `tinyglobby@^0.2.17` (already present transitively in `pnpm-lock.yaml`; 09-07 promotes it to a
      declared dependency and runs `pnpm install`, asserted by the lockfile gaining a `packages/vitest`
      importer edge for it — see 09-RESEARCH.md's amended Package Legitimacy Audit).

*Verify RESEARCH assumption A5: plan 09-01 Task 1's acceptance criteria require quoting `pnpm test`'s
"Test Files" and "Tests" counts from before and after the config lands, and they must be identical.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|--------------------|
| *(none)* | — | — | The D-08 degradation path row from the draft is superseded: it is automated in-process by plan 09-06 Task 3 via the deliberately-undeclared `@undeclared-on-purpose` probe. |

---

## Validation Sign-Off

- [x] All tasks have an `<automated>` verify command
- [x] Sampling continuity: no 3 consecutive tasks without an automated verify
- [x] Wave 0 covers all MISSING references (root config, CLI-filter gate, D-08 degradation mechanism)
- [x] No watch-mode flags
- [x] Feedback latency < 10s for the per-task quick run
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** planned 2026-08-29

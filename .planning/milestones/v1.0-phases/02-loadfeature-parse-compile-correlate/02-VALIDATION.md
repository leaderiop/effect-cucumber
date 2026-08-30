---
phase: 02
slug: loadfeature-parse-compile-correlate
status: planned
nyquist_compliant: true
wave_0_complete: false  # closes when plan 02-01 executes
created: 2026-08-28
---

# Phase 02 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `vitest@4.1.11` (root devDependency, `catalog:` → `^4.1.0`) |
| **Config file** | none — vitest runs on defaults from the repo root and discovers `**/*.test.ts`, excluding `node_modules` and `dist`. Verified: `packages/gherkin/test/*.test.ts` is picked up with zero configuration, and `?raw` imports transform correctly |
| **Quick run command** | `pnpm vitest run packages/gherkin` |
| **Full suite command** | `pnpm test` (= `vitest run`) |
| **Estimated runtime** | ~1 second (pure functions over strings, no I/O beyond fixture reads) |

Existing suite: 3 files / 40 tests, all in `tools/oxlint/effect/test/` (vendored upstream rule tests). `packages/*` has no tests today.

---

## Sampling Rate

- **After every task commit:** Run `pnpm vitest run packages/gherkin`
- **After every plan wave:** Run `pnpm test && pnpm build && pnpm lint`
- **Before `/gsd:verify-work`:** Full phase gate — `pnpm test`, `pnpm build`, `pnpm verify:tsgo-gate`, `pnpm lint`, `pnpm verify:oxlint-plugin`, `pnpm verify:pack`, `pnpm circular`, `pnpm verify:spec` (every job in `check.yml`), all green
- **Max feedback latency:** ~5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 02-01-02 | 02-01 | 1 | PARSE-01/02/03 | T-02-SC, T-02-05 | `packages/gherkin` devDependencies (`vitest`, `@types/node`) + tsconfig `types: ["node"]`; lockfile committed in the same commit | build | `pnpm install --frozen-lockfile && pnpm build` + disposable `node:fs` probe | ❌ W0 | ⬜ pending |
| 02-02-03 | 02-02 | 2 | PARSE-03 | T-02-02, T-02-07 | `LoadFeatureError` shape: `instanceof Error`, `name`, `_tag`, `reason`, `line`, and a >=400-char message surviving verbatim (no-truncation policy) | unit | `pnpm vitest run packages/gherkin/test/Contracts.test.ts` | ❌ W0 | ⬜ pending |
| 02-03-03 | 02-03 | 2 | PARSE-01/02/03 | T-02-09, T-02-10 | Every fixture-table row F1–F27 exists on disk and its verified upstream behavior is pinned | unit | `pnpm vitest run packages/gherkin/test/upstream-pin.test.ts` | ❌ W0 | ⬜ pending |
| 02-04-03 | 02-04 | 3 | PARSE-03 | T-02-04, T-02-11 | Group B parse-error wrapping incl. the `stopAtFirstError` second shape (Pitfall P5); `instanceof Errors.X` discrimination | unit | `pnpm vitest run packages/gherkin/test/Parser.test.ts` | ❌ W0 | ⬜ pending |
| 02-04-01 | 02-04 | 3 | PARSE-01 | T-02-03 | `Source.ts` is the only `node:fs` consumer; no path sanitisation (accepted by design) | source assertion | `test "$(grep -rl 'node:fs' packages/gherkin/src \| wc -l)" = 1` | ❌ W0 | ⬜ pending |
| 02-05-03 | 02-05 | 4 | PARSE-02 | T-02-13 | F21 row-by-row: substitution, Background order, `origin`, trimmed keyword, line recovery, exact tag flattening order | unit | `pnpm vitest run packages/gherkin/test/Correlate.test.ts` | ❌ W0 | ⬜ pending |
| 02-06-01/02 | 02-06 | 5 | PARSE-02 | T-02-14, T-02-15 | F24 multi-Examples-block tags; F26 both names exposed; F27 distinct locations; F23 no cross-file id collision; F25 raw dual arguments | unit | `pnpm vitest run packages/gherkin/test/Correlate.test.ts` | ❌ W0 | ⬜ pending |
| 02-07-03 | 02-07 | 5 | PARSE-03 | T-02-16, T-02-17 | One test per Group A structural reason (F1–F6, F22) asserting `err.reason`, plus the per-scope duplicate-name negative control | unit | `pnpm vitest run packages/gherkin/test/Validate.test.ts` | ❌ W0 | ⬜ pending |
| 02-08-03 | 02-08 | 6 | PARSE-03 | T-02-01, T-02-18, T-02-19 | F7/F8 column-aware placeholder errors incl. DocString + DataTable carriers; F9/F11/F13/F14 warnings; the three verified false-positive texts never fire | unit | `pnpm vitest run packages/gherkin/test/Validate.test.ts` | ❌ W0 | ⬜ pending |
| 02-09-02 | 02-09 | 7 | PARSE-01 | T-02-21 | `loadFeature` synchronous; module-top-level call contributes zero tests; `?raw` and path forms agree | unit | `pnpm vitest run packages/gherkin/test/loadFeature.test.ts` | ❌ W0 | ⬜ pending |
| 02-09-03 | 02-09 | 7 | Gap 5 | — | `# language: fr` parses with no special handling (F19); Outline detection is language-independent | unit | `pnpm vitest run packages/gherkin/test/dialect.test.ts` | ❌ W0 | ⬜ pending |
| 02-10-01 | 02-10 | 8 | PARSE-01 | T-02-20, T-02-22, T-02-23 | The gherkin package cannot reach a test runner (structural proof, Pitfall P1); mutation-tested | gate script | `pnpm verify:no-runner-dep` (root script + `check.yml` `package` job step) | ❌ W0 | ⬜ pending |
| 02-10-02 | 02-10 | 8 | PARSE-01/02/03 | T-02-24 | `packages/gherkin/test/**` is type-checked (Decision D7 closed: yes) | typecheck | `pnpm typecheck:test` (root script + `check.yml` `types` job step) | ❌ W0 | ⬜ pending |
| 02-11-01/02/03 | 02-11 | 8 | PARSE-01/02/03 | T-02-26, T-02-27, T-02-28 | BEH-EC-014 registered; traceability §1 corrected and §4 populated; ADR-EC-014 correction matches the shipped check | spec gate | `pnpm verify:spec` | ✅ wired (CI `package` job) | ⬜ pending |
| all | all | all | all | — | Package builds under the strict config | build | `pnpm build` | ✅ wired (CI `types` job) | ⬜ pending |
| all | all | all | all | — | Style gates | lint | `pnpm lint` | ✅ wired (CI `lint` job) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky. Task IDs and waves are TBD — the planner fills these in against the actual plan/wave breakdown.*

---

## Wave 0 Requirements

All assigned to plans. No test-writing task runs before the toolchain gaps close in plan 02-01 (wave 1).

- [ ] **02-01** — `packages/gherkin/package.json` gains a `devDependencies` block (`vitest: "catalog:"`, `@types/node: "catalog:"`); regenerated `pnpm-lock.yaml` committed in the same commit
- [ ] **02-01** — `packages/gherkin/tsconfig.json` gains `"types": ["node"]` (blocking for `node:fs`)
- [ ] **02-03** — `packages/gherkin/test/fixtures/*.feature`, one file per fixture-table row, named for its reason tag, plus `upstream-pin.test.ts`
- [ ] **02-05 / 02-07 / 02-09** — `Correlate.test.ts`, `Validate.test.ts`, `loadFeature.test.ts`, `dialect.test.ts` are written as real tests in the same plan as the module they cover; no vacuous stub files are created
- [ ] **02-10** — Decision D7 CLOSED: **yes**, wire test-file type-checking. `packages/gherkin/tsconfig.test.json` + root `typecheck:test` script + `check.yml` `types` job step
- [ ] **02-10** — Pitfall P1 structural gate CLOSED: **yes**, a root script. `scripts/verify-no-runner-dep.sh` + `verify:no-runner-dep` + `check.yml` `package` job step
- [ ] **02-11** — `BEH-EC-014` allocated for `loadFeature`'s failure path (Gap 3); `spec/behaviors/index.yaml` and `spec/traceability.md` updated — `pnpm verify:spec` is a required check

---

## Manual-Only Verifications

*None — all phase behaviors have automated verification via the fixture table (F1–F27).*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (devDependencies, tsconfig types, fixture/test file scaffolding)
- [x] No watch-mode flags
- [x] Feedback latency < 5s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** planned — 11 plans across 8 waves, see `02-01-PLAN.md` through `02-11-PLAN.md`

---
phase: 02
slug: loadfeature-parse-compile-correlate
status: draft
nyquist_compliant: false
wave_0_complete: false
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
| 02-01-01 | TBD | 0 | — | — | `packages/gherkin` devDependencies (`vitest`, `@types/node`) + `tsconfig.json` `types: ["node"]` installed | build | `pnpm install --frozen-lockfile && pnpm build` | ❌ W0 | ⬜ pending |
| 02-0X-0X | TBD | TBD | PARSE-01 | — | `loadFeature` synchronous; `?raw` and path forms agree; module-top-level call with no steps produces zero collected tests | unit | `pnpm vitest run packages/gherkin/test/loadFeature.test.ts` | ❌ W0 | ⬜ pending |
| 02-0X-0X | TBD | TBD | PARSE-01 | — | The gherkin package cannot reach a test runner (structural proof, Pitfall P1) | gate script | new root script + `check.yml` step | ❌ W0 | ⬜ pending |
| 02-0X-0X | TBD | TBD | PARSE-02 | — | F21 row-by-row: substitution, Background order, `origin`, keyword, tag inheritance | unit | `pnpm vitest run packages/gherkin/test/Correlate.test.ts` | ❌ W0 | ⬜ pending |
| 02-0X-0X | TBD | TBD | PARSE-02 | — | F24 multi-Examples-block tags; F23 no cross-file id collision; F26 both names exposed; F27 distinct locations | unit | same file | ❌ W0 | ⬜ pending |
| 02-0X-0X | TBD | TBD | PARSE-03 | — | One test per `LoadFeatureErrorReason` (F1–F9, F12, F16–F18, F20, F22), asserting `err.reason` not message text | unit | `pnpm vitest run packages/gherkin/test/Validate.test.ts` | ❌ W0 | ⬜ pending |
| 02-0X-0X | TBD | TBD | PARSE-03 | T-02-01 | Group B parse-error wrapping incl. the `stopAtFirstError` second shape (Pitfall P5) | unit | same file | ❌ W0 | ⬜ pending |
| 02-0X-0X | TBD | TBD | Gap 5 | — | `# language: fr` parses with no special handling (F19) | unit | `pnpm vitest run packages/gherkin/test/dialect.test.ts` | ❌ W0 | ⬜ pending |
| 02-0X-0X | TBD | TBD | all | — | Package builds under the strict config | build | `pnpm build` | ✅ wired (CI `types` job) | ⬜ pending |
| 02-0X-0X | TBD | TBD | all | — | Style gates | lint | `pnpm lint` | ✅ wired (CI `lint` job) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky. Task IDs and waves are TBD — the planner fills these in against the actual plan/wave breakdown.*

---

## Wave 0 Requirements

- [ ] `packages/gherkin/package.json` — add a `devDependencies` block: `vitest: "catalog:"`, `@types/node: "catalog:"`; commit the regenerated `pnpm-lock.yaml` in the same commit
- [ ] `packages/gherkin/tsconfig.json` — add `"types": ["node"]` (blocking for `node:fs`)
- [ ] `packages/gherkin/test/fixtures/*.feature` — one file per fixture-table row, named for its reason tag
- [ ] `packages/gherkin/test/Correlate.test.ts`, `Validate.test.ts`, `loadFeature.test.ts`, `dialect.test.ts` — stub files
- [ ] Decide + wire test-file type-checking (Decision D7) — if yes: a root script **and** a `check.yml` step
- [ ] Decide whether the PARSE-01 structural gate (Pitfall P1) is a root script; if yes, add the CI step
- [ ] Allocate a new `BEH-EC-NNN` for `loadFeature`'s failure path (Gap 3) and update `spec/traceability.md` — `pnpm verify:spec` is a required check

---

## Manual-Only Verifications

*None — all phase behaviors have automated verification via the fixture table (F1–F27).*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (devDependencies, tsconfig types, fixture/test file scaffolding)
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

---
phase: 05
slug: describefeature-type-surface
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-29
---

# Phase 05 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `vitest ^4.1.0` + `@effect/vitest 4.0.0-rc.112` |
| **Config file** | none — no `vitest.config.*` anywhere in the repo (verified); `packages/vitest/package.json` declares `"test": "vitest run"` |
| **Type-gate runner** | `bash scripts/verify-tsgo-gate.sh` (this phase's primary verification surface) |
| **Test typecheck** | `pnpm typecheck:test` — currently covers `packages/gherkin` **only** (Wave 0 gap) |
| **Quick run command** | `bash scripts/verify-tsgo-gate.sh` |
| **Full suite command** | `pnpm build && pnpm typecheck:test && pnpm verify:tsgo-gate && pnpm test` |
| **Estimated runtime** | ~10-30s quick / ~1-2min full |

---

## Sampling Rate

- **After every task commit:** Run `bash scripts/verify-tsgo-gate.sh`
- **After every plan wave:** Run `pnpm build && pnpm typecheck:test && pnpm verify:tsgo-gate && pnpm test`
- **Before `/gsd:verify-work`:** Full suite green, plus `pnpm verify:spec` (traceability, after BEH-EC-002/003 corrections) and `pnpm lint`
- **Max feedback latency:** ~30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 05-W0-tsconfig | TBD | 0 | DSL-01 | — | N/A | config | `bash scripts/verify-tsgo-gate.sh` | ❌ W0 | ⬜ pending |
| 05-W0-typecheck-test | TBD | 0 | DSL-01/02/03/04 | — | N/A | config | `pnpm typecheck:test` | ❌ W0 | ⬜ pending |
| 05-DSL01-negative | TBD | 1+ | DSL-01 | — | N/A | compile-gate | `bash scripts/verify-tsgo-gate.sh` (assertion: `effect(missingEffectContext)` named diagnostic fires) | ❌ W0 | ⬜ pending |
| 05-DSL01-flip | TBD | 1+ | DSL-01 | — | N/A | compile-gate pair | same script, paired assertions | ❌ W0 | ⬜ pending |
| 05-DSL01-acquireRelease | TBD | 1+ | DSL-01 | — | N/A | compile-gate | same script (positive control, `Scope` in `ROut`) | ❌ W0 | ⬜ pending |
| 05-DSL02-bare-generator | TBD | 1+ | DSL-02 | — | N/A | unit | `pnpm --filter @effect-cucumber/vitest test` | ❌ W0 | ⬜ pending |
| 05-DSL02-identity | TBD | 1+ | DSL-02 | — | N/A | unit | same | ❌ W0 | ⬜ pending |
| 05-DSL02-span-text | TBD | 1+ | DSL-02 | — | N/A | unit | same (`Effect.fn` name assertion) | ❌ W0 | ⬜ pending |
| 05-DSL03-world-positive | TBD | 1+ | DSL-03 | — | N/A | compile-gate | positive fixture reuse | ❌ W0 | ⬜ pending |
| 05-DSL03-world-negative | TBD | 1+ | DSL-03 | — | N/A | compile-gate | new assertion, greps `TS2339` | ❌ W0 | ⬜ pending |
| 05-DSL04-scoped-dsl | TBD | 1+ | DSL-04 | — | N/A | compile-gate | positive fixture reuse | ❌ W0 | ⬜ pending |
| 05-DSL04-registry-isolation | TBD | 1+ | DSL-04 | — | N/A | unit (runtime) | `pnpm --filter @effect-cucumber/vitest test` (`Registry.test.ts`) | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Refactor `packages/vitest/test/tsgo-gate/tsconfig.json` to `include: []` + `files: ["src/missing-layer-context.ts"]` — do this **first**, before adding new fixtures (RESEARCH.md Pitfall 1: unscoped `include: ["src"]` lets new fixtures leak into assertion 4, decaying it silently)
- [ ] `packages/vitest/tsconfig.test.json` + extend the `typecheck:test` script to cover `packages/vitest`, excluding `test/tsgo-gate/` (RESEARCH.md Pitfall 2: `typecheck:test` currently only covers `packages/gherkin` — a `Registry.test.ts` would have invisible type errors)
- [ ] `packages/vitest/test/Registry.test.ts` scaffold — DSL-04's per-instance proof; no framework install needed, `vitest` + `@effect/vitest` already present

*Existing infrastructure (vitest, @effect/vitest, verify-tsgo-gate.sh pattern) covers the rest — only the two config gaps above and the missing test file are net-new Wave 0 work.*

---

## Manual-Only Verifications

*None — all phase behaviors have automated verification (compile-gate via `verify-tsgo-gate.sh` assertions, or vitest unit tests).*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (tsconfig scoping, typecheck:test coverage, Registry.test.ts scaffold)
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

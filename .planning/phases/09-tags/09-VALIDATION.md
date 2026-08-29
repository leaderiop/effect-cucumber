---
phase: 09
slug: tags
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-29
---

# Phase 09 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.11 with @effect/vitest 4.0.0-rc.112 |
| **Config file** | none — Wave 0 installs `vitest.config.ts` at repo root |
| **Quick run command** | `pnpm exec vitest run packages/vitest/test/Runner.test.ts` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm exec vitest run packages/vitest`
- **After every plan wave:** Run `pnpm test && pnpm typecheck:test && pnpm verify:tsgo-gate`
- **Before `/gsd:verify-work`:** `pnpm test && pnpm lint && pnpm circular && pnpm typecheck:test && pnpm verify:tsgo-gate && pnpm verify:oxlint-plugin && pnpm verify:no-runner-dep && pnpm verify:spec` must all be green
- **Max feedback latency:** ~10 seconds (per-task quick run)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 09-01 | TBD | 0 | RUN-05 | — | `vitest.config.ts` declares `@skip`/`@only` + fixture tags, `allowOnly: false` | config | `pnpm test` (must still pass with existing files) | ❌ W0 | ⬜ pending |
| 09-02 | TBD | 1 | RUN-05 / SC1 | — | Every inherited tag reaches the emitted node (unit, fake TestApi) | unit | `pnpm exec vitest run packages/vitest/test/Runner.test.ts -t tags` | ✅ extend | ⬜ pending |
| 09-03 | TBD | 1 | RUN-05 / SC1 | — | Every inherited tag reaches the real vitest task | integration | `pnpm exec vitest run packages/vitest/test/emission.test.ts` | ✅ extend (needs W0 config) | ⬜ pending |
| 09-04 | TBD | 1 | RUN-05 / SC2 | — | `@skip` reports skipped | integration | `pnpm exec vitest run packages/vitest/test/emission.test.ts` | ✅ extend | ⬜ pending |
| 09-05 | TBD | 1 | RUN-05 / SC2 | T-06-06-01 (pattern) | Before/After hooks do not run for a skipped Scenario | integration | same file — module-scope counter asserted 0 | ✅ extend | ⬜ pending |
| 09-06 | TBD | 1 | RUN-05 / SC2 | — | Pitfall 15: `@skip` + unmatched step reports skipped, not undefined | integration | same file | ✅ extend | ⬜ pending |
| 09-07 | TBD | 1 | RUN-05 / SC3 | — | `@only` never becomes vitest `only` mode (unit, fake) | unit | `Runner.test.ts` | ✅ extend | ⬜ pending |
| 09-08 | TBD | 1 | RUN-05 / SC3 | — | A Feature with `@only` passes a CI-mode run | integration | `pnpm test` with `allowOnly: false` (repo's own suite is the assertion) | ❌ W0 (config) | ⬜ pending |
| 09-09 | TBD | 1 | RUN-05 / SC4 | — | `--tagsFilter` selects exactly the tagged Scenarios | integration | `pnpm exec vitest run packages/vitest/test/emission.test.ts --tagsFilter '@…'` | ❌ W0 (config + runnable command/script) | ⬜ pending |
| 09-10 | TBD | 1 | RUN-05 / SC4 | — | `excludeTags` removes the Scenario from emission entirely (distinct reporter footprint from skip) | unit | `Runner.test.ts` | ✅ extend | ⬜ pending |
| 09-11 | TBD | 1 | RUN-05 / SC4 | — | `includeTags` restricts emission | unit | `Runner.test.ts` | ✅ extend | ⬜ pending |
| 09-12 | TBD | 1 | RUN-05 (D-10) | Tampering (silent-green) | Collection-time notice printed when scenarios excluded | unit/integration | `Runner.test.ts` or `emission.test.ts` — assert notice text | ✅ extend | ⬜ pending |
| 09-13 | TBD | 1 | RUN-05 (Pitfall 4) | — | `excludeTags`/`includeTags` do not change `plan.warnings` (unused-step-definition warnings unaffected) | unit | `Runner.test.ts` or `Plan.test.ts` | ✅ extend | ⬜ pending |
| 09-14 | TBD | 1 | RUN-05 (D-08) | Denial-of-signal / Spoofing | Undeclared tag degrades (warn + untagged re-emission) instead of failing the file; warning message quotes tag/Scenario safely | integration | needs a run without the tag declared — second config or documented manual step (planner's call, no child-process precedent exists) | ❌ W0 | ⬜ pending |
| 09-15 | TBD | 1 | RUN-05 (D-09) | V12 (scoped glob only) | `gherkinTags(glob)` helper returns `TestTagDefinition[]` for tags found in matched `.feature` files | unit | new test file for the helper | ❌ new (helper is new public surface) | ⬜ pending |
| 09-16 | TBD | 1 | — (D-11) | — | Seam grep: no `vitest` import in `Runner.ts`/`TestApi.ts` | script | `bash scripts/verify-testapi-seam.sh` (new, mirrors `verify-no-runner-dep.sh`) | ❌ new | ⬜ pending |
| 09-17 | TBD | 2 | spec reconciliation | — | BEH-EC-008, ADR-EC-020 (or superseding ADR), REQUIREMENTS.md RUN-05, spec/roadmap.md amended; traceability passes | spec gate | `bash spec/scripts/verify-traceability.sh` | ✅ existing gate | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*Task IDs above are placeholders for the planner's actual plan/task numbering — this table's job is
requirement→test coverage, not a preview of plan structure.*

---

## Wave 0 Requirements

- [ ] `vitest.config.ts` at repo root — `test.tags` declaring `@skip`, `@only`, and every tag this
      repo's own fixtures/inline sources use, plus `allowOnly: false`. Do NOT set `include`/`exclude`
      (Finding 15 anti-pattern — would silently change which files run). Blocks SC1 (integration
      half), SC3, and SC4.
- [ ] Decision + mechanism for exercising `--tagsFilter` in CI (a second config, or a `package.json`
      script such as `"test:tags": "vitest run --tagsFilter '@…'"` run in CI) — blocks SC4's CLI half.
- [ ] Decision on how to automate the D-08 degradation-path test given no child-process/nested-vitest
      precedent exists in this repo (`grep -rn "child_process\|execFile\|spawn\|startVitest"` over
      `packages/*/test` returns nothing today). Acceptable per research: (a) a second config + CI
      script, or (b) a documented manual verification step if automation cost is too high.
- [ ] Framework install: none needed — `vitest`, `@vitest/runner`, `@effect/vitest` are all already
      installed at the versions this research verified against.

*Verify A5 (Assumptions Log): compare `pnpm test`'s file/test counts before and after the new
`vitest.config.ts` lands, to confirm no existing package's tests silently stopped running.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|--------------------|
| D-08 degradation path, if Wave 0 opts for a documented manual step instead of a second-config/CI-script automation | RUN-05 (D-08) | No child-process/nested-vitest test precedent exists in this repo; introducing one is new infrastructure the planner may choose to defer | Temporarily remove a tag's declaration from `vitest.config.ts`, run `pnpm test`, confirm the affected Scenario still passes (untagged) and a located warning naming the `.feature` file/Scenario/tag prints to the terminal, then restore the declaration. |

*If the planner instead automates this via a second config file, this row is superseded — mark N/A
in the plan's verification section.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (vitest.config.ts, tagsFilter CI mechanism, D-08 degradation test mechanism)
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

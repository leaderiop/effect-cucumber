---
phase: 10
slug: layer-scopes-per-scenario-default-shared
status: verified
threats_open: 0
asvs_level: 1
created: 2026-08-30
---

# Phase 10 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| `describeFeature`'s object-argument overload → shared vs per-Scenario Layer tier | Which tier a Scenario's Effect is provided from decides service isolation between Scenarios and across a Feature's lifetime | Compile-time Layer type (`Layer<R, never, never>` constraint), not runtime data |
| `EmitOptions.contextFree` → `Runner.ts`'s emission route | A routing flag decides whether a node reaches the shared tier at all; misrouting a Scenario silently drops its isolation | Internal boolean, not consumer-reachable (`TestApi`/`EmitOptions` not exported from `index.ts`) |
| `scripts/verify-shared-layer-once.sh` → the real `vitest` runner (3 subprocess invocations) | The one gate in this phase that drives an external process and parses its JSON report | Test titles/results from this repo's own fixtures only; `mktemp -d` + `trap` scoped, no network |
| `spec/` normative text → `.planning/REQUIREMENTS.md` Complete markings | A requirement marked Complete on documentation that contradicts shipped behavior misleads every later phase that builds on it | Prose only; `spec/scripts/verify-traceability.sh` cross-checks link integrity |
| `pnpm-lock.yaml` / `package.json` → the installed dependency tree | Any new package or version range entering the workspace | Manifest diff only — verified empty for this phase except one root script entry |

---

## Threat Register

| Threat ID | Category | Severity | Disposition | Status |
|-----------|----------|----------|-------------|--------|
| T-10-01-01 | Repudiation | high | mitigate | closed |
| T-10-01-02 | Tampering | medium | mitigate | closed |
| T-10-01-03 | Tampering | medium | mitigate | closed |
| T-10-01-04 | Elevation of Privilege | low | accept | closed |
| T-10-01-05 | Info Disclosure | low | accept | closed |
| T-10-01-SC | Tampering (supply chain) | high | mitigate | closed |
| T-10-02-01 | Tampering | high | mitigate | closed |
| T-10-02-02 | Tampering | high | mitigate | closed |
| T-10-02-03 | Tampering | medium | mitigate | closed |
| T-10-02-04 | Repudiation | high | mitigate | closed |
| T-10-02-05 | Denial of Service | low | accept | closed |
| T-10-02-06 | Info Disclosure | medium | mitigate | closed |
| T-10-02-07 | Spoofing | low | accept | closed |
| T-10-02-SC | Tampering (supply chain) | high | mitigate | closed |
| T-10-03-01 | Tampering | medium | mitigate | closed |
| T-10-03-02 | Tampering | high | mitigate | closed |
| T-10-03-03 | Repudiation | high | mitigate | closed |
| T-10-03-04 | Tampering | medium | mitigate | closed |
| T-10-03-05 | Denial of Service | low | mitigate | closed |
| T-10-03-06 | Info Disclosure | low | accept | closed |
| T-10-03-SC | Tampering (supply chain) | high | mitigate | closed |
| T-10-04-01 | Tampering | high | mitigate | closed |
| T-10-04-02 | Repudiation | medium | mitigate | closed |
| T-10-04-03 | Tampering | high | mitigate | closed |
| T-10-04-04 | Tampering | medium | mitigate | closed |
| T-10-04-05 | Spoofing | medium | mitigate | closed |
| T-10-04-06 | Elevation of Privilege | low | accept | closed |
| T-10-04-SC | Tampering (supply chain) | high | mitigate | closed |
| T-10-05-01 | Tampering | high | mitigate | closed |
| T-10-05-02 | Tampering | high | mitigate | closed |
| T-10-05-03 | Repudiation | medium | mitigate | closed |
| T-10-05-04 | Tampering | high | mitigate | closed |
| T-10-05-05 | Info Disclosure | low | accept | closed |
| T-10-05-06 | Repudiation | medium | mitigate | closed |
| T-10-05-07 | Denial of Service | low | accept | closed |
| T-10-05-SC | Tampering (supply chain) | high | mitigate | closed |
| T-10-06-01 | Repudiation | high | mitigate | closed |
| T-10-06-02 | Tampering | medium | mitigate | closed |
| T-10-06-03 | Tampering | low | mitigate | closed |
| T-10-06-04 | Info Disclosure | low | accept | closed |
| T-10-06-05 | Repudiation | high | mitigate | closed |
| T-10-06-06 | Denial of Service | medium | mitigate | closed |
| T-10-06-SC | Tampering (supply chain) | high | mitigate | closed |
| T-10-07-SC | Tampering (supply chain) | high | mitigate | closed |
| T-10-08-01 | Repudiation | high | mitigate | closed |
| T-10-08-02 | Tampering | high | mitigate | closed |
| T-10-08-03 | Info Disclosure | medium | mitigate | closed |
| T-10-08-04 | Spoofing | low | mitigate | closed |
| T-10-08-SC | Tampering (supply chain) | high | mitigate | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above `workflow.security_block_on` (high) count toward `threats_open`*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

**Method.** Every `mitigate` row was located in committed code (file:line) during this audit, never accepted from plan or summary prose alone. Every `accept` row was checked against the implemented behavior. Three gates (`pnpm verify:shared-layer-once`, `pnpm verify:spec`, the CI script cross-check) were executed read-only during the audit. No file was created, modified, or deleted by the auditor. `git status --porcelain` unchanged across the audit.

Full per-threat evidence (file:line citations for all 53 rows) is preserved in the session transcript that produced this file; summarized here to keep the register scannable. Supply-chain threats (`-SC`, one per plan) share one piece of evidence: `git diff` across the phase's full commit range shows `pnpm-lock.yaml` unchanged except for the phase's own script addition, and every CI install runs `--frozen-lockfile`.

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-10-01 | T-10-01-04, T-10-04-06 | No privilege boundary exists in a compile-time Layer constraint or a test-isolation fixture — Elevation of Privilege does not apply to this surface. | security-auditor (2026-08-30) | 2026-08-30 |
| AR-10-02 | T-10-01-05, T-10-05-05, T-10-06-04 | Diagnostic/report text is internal (this repo's own fixture names and Layer-type error messages); no credential, endpoint, or filesystem path is exposed. Verified by grep for `password\|secret\|token\|key\|https://\|localhost\|process.env` returning zero matches in the relevant files. | security-auditor (2026-08-30) | 2026-08-30 |
| AR-10-03 | T-10-02-05 | No `Scope.close`/`addFinalizer`/`MemoMap`/`acquireRelease` call exists in the phase's runtime code (verified by grep, 0 matches outside one doc comment) — scope lifetime is delegated entirely to the host test framework, which is the intended design. | security-auditor (2026-08-30) | 2026-08-30 |
| AR-10-04 | T-10-02-07 | No identity, session, or credential concept exists on this path — Spoofing does not apply. | security-auditor (2026-08-30) | 2026-08-30 |
| AR-10-05 | T-10-03-06 | The `emission.test.ts` blocks operate entirely in-memory; no filesystem or network I/O in scope. | security-auditor (2026-08-30) | 2026-08-30 |
| AR-10-06 | T-10-05-07 | The Node-24-only CI guard on the runner-driving gate trades cross-version coverage for cost, matching the identical trade-off already accepted for `verify:tags-filter` — the claim being asserted (structural routing) does not vary by Node version. | security-auditor (2026-08-30) | 2026-08-30 |

*Accepted risks do not resurface in future audit runs.*

---

## Residual Observations (non-blocking, below the `high` block threshold)

Recorded so future audits do not re-discover these from scratch, and so this report does not appear to silently contradict the code-review record.

- **R-01 — T-10-05-04's CI-script cross-check is a point-in-time assertion, not a committed gate.** No `scripts/verify-ci-scripts.sh` exists on disk; the claim that every `pnpm`-prefixed `run:` step in `.github/workflows/check.yml` names a real script was re-verified manually during this audit (21 steps, 17 distinct scripts, 0 missing) rather than by a standing script. Identical, still-unhardened finding as phase 2's R-01.
- **R-02 — T-10-08-02's append-only spec-correction mechanism was deliberately overridden after plan 10-08, by design.** Review-fix commit `c902bb3` (WR-05, from this phase's own UAT session) rewrote BEH-EC-007's fenced normative REQUIREMENT block rather than appending a correction, because code review found the append-only convention had left a `MUST` clause the implementation knowingly violated while RUN-03/RUN-04 were marked Complete against it. The prior wording is preserved verbatim in the surrounding correction blockquote with date and rationale — the threat's actual substance (spec losing the ability to say the implementation is wrong) was not realized; the override direction was toward more honesty, not less.
- **R-03 — `EmitOptions.contextFree` has no structural (type-system) guard against a Scenario emission carrying `true`.** Self-documented in `TestApi.ts`'s own doc comment (fixed in this phase's UAT session, see WR-02). Mitigated in practice: `Runner.ts` hard-codes `false` at every Scenario call site, `Runner.test.ts` pins every node kind's flag including the Rule-nested loop (WR-03, mutation-proved), and the field is not exported from the package's public surface — worst case is a library-internal regression the existing routing tests would catch.
- **R-04 — 7 of 8 phase-10 SUMMARY.md files omit the `## Threat Flags` section entirely.** Only `10-07-SUMMARY.md` carries one. The auditor performed an independent surface-mapping pass in its place (see audit trail) and found no unmapped new surface; future phases should populate this section during execution rather than leaving it to a retroactive audit.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-08-30 | 53 | 53 | 0 | gsd-security-auditor (opus), dispatched via `/gsd-secure-phase 10` during UAT completion |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-08-30

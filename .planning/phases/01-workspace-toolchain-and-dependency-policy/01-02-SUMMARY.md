---
phase: 01-workspace-toolchain-and-dependency-policy
plan: 02
subsystem: build-toolchain
tags: [tsgo, effect-diagnostics, build-gate, adr-ec-016, verification]

requires:
  - "01-01 (compiling workspace + untouched @effect/language-service plugin block)"
provides:
  - "`pnpm verify:tsgo-gate` — one-command proof that a wrong-Layer program cannot compile"
  - "tsgo gate fixture (2 negative probes + 1 positive control) outside the solution build graph"
  - "mutation-tested assertion that ADR-EC-016's diagnostics affect the tsc exit code"
affects:
  - "01-05 (CI — verify:tsgo-gate belongs in the merge gate)"
  - "any future change to tsconfig.base.json's plugin block (now guarded behaviorally)"
  - "03/05 (Layer-typed Scenario surface — this is the mechanism it relies on)"

tech-stack:
  added: []
  patterns:
    - "gate fixtures live under a directory literally named `src` — @effect/tsgo enables floatingEffect at error severity only for paths matching `src/**/*.ts`"
    - "fixture tsconfigs set `composite: false` + `noEmit: true` and are excluded from `tsc -b` by the package's `include: [\"src\"]`"
    - "verifying a diagnostics gate means asserting an EXIT CODE, never grepping compiler output"

key-files:
  created:
    - packages/vitest/test/tsgo-gate/tsconfig.json
    - packages/vitest/test/tsgo-gate/tsconfig.ok.json
    - packages/vitest/test/tsgo-gate/tsconfig.floating.json
    - packages/vitest/test/tsgo-gate/src/missing-layer-context.ts
    - packages/vitest/test/tsgo-gate/src/floating-effect.ts
    - packages/vitest/test/tsgo-gate/src/satisfied.ts
    - scripts/verify-tsgo-gate.sh
  modified:
    - package.json

decisions:
  - "The gate is proven by the exit code of an isolated compile of `floating-effect.ts`, not by grepping for `effect(...)` in output. Empirically, `ignoreEffectErrorsInTscExitCode: true` still prints every Effect diagnostic verbatim and exits 0 — output is byte-identical to an enforced gate. Grep-based verification passes in both cases and is therefore worthless as a gate check."
  - "Added `tsconfig.floating.json` (not in the plan's file list) to compile the valid-TypeScript probe in isolation. This is the first of the two alternatives the plan offered for assertion 4; the second (grep + absence of TS1/TS2/TS6 codes) was implemented first and proven insufficient by mutation testing."
  - "Non-Effect diagnostics on `floating-effect.ts` are rejected via an allowlist (every code must match `TS377[0-9]+`) rather than the plan's denylist of TS1/TS2/TS6, which would miss TS5xxx/TS7xxx."
  - "Did not add a `diagnosticSeverity` map, per the plan: both probes fire at error severity by default. A gate that needs hand-configuring to fire is a weaker proof."

duration: ~12m
completed: 2026-08-28
---

# Phase 01 Plan 02: tsgo Layer Diagnostics Gate Summary

`pnpm verify:tsgo-gate` now proves, on every run, that a `Layer` with an unprovided requirement cannot compile — and that the rejection comes from Effect's diagnostics layer rather than from TypeScript strictness happening to catch it.

## What Was Built

A fixture at `packages/vitest/test/tsgo-gate/` with three probes and three tsconfigs, plus `scripts/verify-tsgo-gate.sh` making four named assertions.

The fixture lives under `packages/vitest/` because that is the only package with `effect` installed, and outside `packages/vitest/src/` so the package's `include: ["src"]` keeps it out of the solution build. Its configs set `composite: false`, `noEmit: true`.

| Probe | Emits | Role |
|-------|-------|------|
| `missing-layer-context.ts` | `TS377034 effect(missingLayerContext)` (+ a plain `TS2375`) | the project's core guarantee, by name |
| `floating-effect.ts` | `TS377001 effect(floatingEffect)` **only** | valid TypeScript — isolates the Effect layer |
| `satisfied.ts` | nothing | positive control; proves the gate discriminates |

Both plan-flagged empirical facts held and were preserved: the probes must sit under a directory literally named `src` (the default `@effect/tsgo` per-file override scopes `floatingEffect: "error"` to `src/**/*.ts`), and 01-01's plugin block fires both diagnostics with no `diagnosticSeverity` map added. `Layer.provide(svcLayer, depLayer)` type-checked as written in `4.0.0-rc.112`; no signature adjustment was needed.

## Key Implementation Details

**The plan's assertion 4 had two suggested implementations. The first one I built was vacuous, and mutation testing caught it.**

The plan offered a choice: compile `floating-effect.ts` in isolation, *or* "simply assert the full-fixture output contains `effect(floatingEffect)`" plus an absence of plain TS error codes. I implemented the second — grep-based — version, and it passed.

Then I mutation-tested it by flipping `ignoreEffectErrorsInTscExitCode` to `true`, which disables ADR-EC-016's gate outright. **The script still reported `tsgo gate: ENFORCED`.**

Two causes compounded:

1. `missing-layer-context.ts` also emits a plain `TS2375` (the `exactOptionalPropertyTypes` assignability error from its deliberate annotation). So the negative fixture kept exiting non-zero from *TypeScript*, satisfying "the build fails" with the Effect gate fully disabled.
2. More fundamentally — with the flag flipped, `tsc` **still prints every Effect diagnostic verbatim** and exits 0. Output is byte-identical:

```
# gate ON               # gate OFF
error TS377001: ...     error TS377001: ...
effect(floatingEffect)  effect(floatingEffect)
EXIT=1                  EXIT=0
```

Every grep-based assertion passes in both columns. The exit code is the *only* discriminating signal.

The script was rebuilt around that. `tsconfig.floating.json` compiles `floating-effect.ts` alone; assertion 2 first establishes that the file carries no non-`TS377xxx` diagnostic, and assertion 3 then asserts its non-zero exit — which, given that premise, can only originate from `@effect/tsgo` counting its own diagnostic toward the exit code. The reasoning is recorded in a `METHOD NOTE` header in the script so it is not "simplified" back to a grep later.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Gate verification was vacuous; rebuilt around exit-code isolation**
- **Found during:** Task 2 (mutation testing the finished script, as the plan's verify step required)
- **Issue:** With `ignoreEffectErrorsInTscExitCode: true` — the exact regression ADR-EC-016 and 01-01 warn against — the script reported `ENFORCED`. It was proving "the build fails," not "Effect diagnostics fail the build."
- **Fix:** Added `packages/vitest/test/tsgo-gate/tsconfig.floating.json` and restructured the four assertions so the load-bearing one is the exit code of an isolated, TypeScript-valid probe. Switched the non-Effect-code check from the plan's TS1/TS2/TS6 denylist to a `TS377[0-9]+` allowlist.
- **Files modified:** `scripts/verify-tsgo-gate.sh`, `packages/vitest/test/tsgo-gate/tsconfig.floating.json`
- **Commit:** eeb570b

`tsconfig.floating.json` is an addition to the plan's declared file list. It is the plan's own first-listed alternative for assertion 4, so this stays within scope.

## Verification

Baseline: `pnpm verify:tsgo-gate` exits 0, printing one `✓` per assertion then `tsgo gate: ENFORCED`.

Every mutation below was applied, run, and reverted; `git diff` confirmed the tree was restored each time.

| Mutation | Expected | Result |
|---|---|---|
| *(none — baseline)* | pass | `EXIT=0`, `ENFORCED` |
| `ignoreEffectErrorsInTscExitCode: true` (gate disabled) | fail | `EXIT=1` — "Effect diagnostics are reported but do NOT fail the build" |
| entire `plugins` block removed | fail | `EXIT=1` — "no diagnostics at all on floating-effect.ts" |
| `missingLayerContext` probe corrected | fail | `EXIT=1` — "not for the Layer-context reason" |
| `floatingEffect` probe assigned to a variable | fail | `EXIT=1` — floating probe did not fire |
| positive control broken | fail | `EXIT=1` — "the gate fixture is broken, not the gate" |

Plan verification items:

| Check | Result |
|-------|--------|
| `pnpm verify:tsgo-gate` exits 0 | yes |
| negative output contains `effect(missingLayerContext)` and `effect(floatingEffect)` | both present |
| `floating-effect.ts` valid TypeScript yet fails the build | yes — only `TS377001`, exit 1 |
| `tsc -b` on the workspace still exits 0 | yes (cold and warm) |
| script works from a foreign cwd | yes (resolves its own root) |
| stray build artifacts from fixture | none (`noEmit`) |

Phase 1 success criterion 2 is met.

## Known Limitations

**`ignoreEffectWarningsInTscExitCode` is not guarded.** Flipping it to `true` leaves the script passing. This is correct rather than a false negative — both probes are *error*-severity, so that flag does not govern them — but it means the warnings half of 01-01's decision has no behavioral test. Closing it would need a third probe emitting a warning-severity Effect diagnostic. Not required by this plan; worth doing if the warnings flag is ever contested.

**The `missingLayerContext` guarantee is verified by name, not by exit-code isolation.** `missing-layer-context.ts` unavoidably also emits `TS2375`, so it cannot prove Effect-only exit behavior. Assertion 3 establishes the Effect-error → exit-code wiring generally (via the floating probe, which shares that mechanism); assertion 4 then confirms the Layer diagnostic is reported by name. Together these cover the claim, but the shared-mechanism inference is the one soft link in the chain.

## Next Phase Readiness

**Ready.**

- **01-05 (CI) should run `pnpm verify:tsgo-gate` in the merge gate.** It is fast (three small `tsc` invocations) and is the only thing standing between the project and a silently-advisory type system.
- **`tsconfig.base.json`'s plugin block is now behaviorally guarded** for error-severity diagnostics. A future plan that relaxes `ignoreEffectErrorsInTscExitCode` will fail this script with a message naming the flag — which is the intended outcome, not a bug to route around.
- **Do not "simplify" the script to grep the full fixture's output.** That exact form was implemented, passed, and was proven vacuous. The `METHOD NOTE` in the script header explains why.
- **`tools/` remains untracked**, unchanged from 01-01. Still belongs to the lint plan.

## Self-Check: PASSED

All seven created files verified present on disk; both commits (`ebe81d5`, `eeb570b`) verified in `git log`.

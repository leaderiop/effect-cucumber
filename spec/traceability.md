# Traceability Matrix

## Traceability chain

```
Behavior (BEH-EC-NNN)
    → Source module (packages/*/src/*.ts)      [planned — no code yet]
    → Test file (packages/*/test/*.test.ts)     [planned — no code yet]
    → Invariant (INV-EC-NNN)
    → Decision (ADR-EC-NNN)
    → Acceptance scenario (REQ-EC-NNN)          [planned — no .feature files yet]
```

Sections §1–§6 are parsed by `spec/scripts/verify-traceability.sh`; column
order is a contract. The **Source module** and **Test file** columns below
name *planned* locations — the verify script checks that every ID is traced
here, not that the named file exists, since `packages/*` doesn't exist yet.
See `spec/roadmap.md` for what's actually built.

## §1 Behavior to source

| Behavior file | Range | Source module (planned) |
| ------------- | ----- | ------------------------ |
| [01 — Steps and World](behaviors/01-steps-and-world.md) | BEH-EC-001–004 | `packages/vitest/src/{loadFeature,describeFeature,Step,World}.ts` |
| [02 — Background, hooks, shared Layers, and tags](behaviors/02-shared-layers-and-tags.md) | BEH-EC-005–008 | `packages/vitest/src/{Background,Hooks,SharedLayer,Tags}.ts` |
| [03 — Rules, Scenario Outlines, and TestClock](behaviors/03-rules-outlines-and-testclock.md) | BEH-EC-009–012 | `packages/vitest/src/{Rule,ScenarioOutline}.ts` |

## §2 Invariant traceability

| Invariant | Description | Enforced by (planned) | Test (planned) |
| --------- | ----------- | ----------------------- | ---------------- |
| [INV-EC-001](invariants.md#inv-ec-001-fail-fast-is-structural-not-bookkept) | Fail-fast is structural | Sequential `yield*` in the scenario-Effect builder | Not yet written |
| [INV-EC-002](invariants.md#inv-ec-002-a-per-scenario-layer-is-fresh-every-scenario) | Per-Scenario Layer is fresh | `Effect.provide` applied fresh per `it.effect` call | Not yet written |
| [INV-EC-003](invariants.md#inv-ec-003-a-steps-effect-can-only-use-services-the-ambient-layer-provides) | Step deps are compile-checked | TypeScript structural typing of `R` | Not yet written (type-level test) |
| [INV-EC-004](invariants.md#inv-ec-004-after-hooks-run-even-when-a-step-fails) | `After` always runs | `Effect.ensuring` around the scenario Effect | Not yet written |
| [INV-EC-005](invariants.md#inv-ec-005-a-rule-scoped-layer-is-invisible-outside-that-rule) | Rule-scoped Layer isolation | `Layer.provideMerge` scoped to the Rule's dsl closure | Not yet written (type-level test) |
| [INV-EC-006](invariants.md#inv-ec-006-cross-step-scenario-data-survives-only-via-a-layer-provided-ref) | Cross-step state via Ref only | Convention (ADR-EC-009) — no automated enforcement yet | None yet — candidate lint rule |

## §3 Decision traceability

| Decision | Title | Affected invariants |
| -------- | ----- | -------------------- |
| [ADR-EC-001](decisions/001-steps-are-effects.md) | A step is `(...params) => Effect<A, E, R>` | — |
| [ADR-EC-002](decisions/002-world-is-a-context-service.md) | World is a typed `Context.Service` | [INV-EC-002](invariants.md#inv-ec-002-a-per-scenario-layer-is-fresh-every-scenario) |
| [ADR-EC-003](decisions/003-describefeature-takes-a-layer.md) | `describeFeature` takes a Layer | [INV-EC-003](invariants.md#inv-ec-003-a-steps-effect-can-only-use-services-the-ambient-layer-provides) |
| [ADR-EC-004](decisions/004-one-it-effect-per-scenario.md) | One `it.effect` per Scenario | [INV-EC-001](invariants.md#inv-ec-001-fail-fast-is-structural-not-bookkept) |
| [ADR-EC-005](decisions/005-effect-fn-for-step-and-hook-bodies.md) | `Effect.fn` for step and hook bodies | — |
| [ADR-EC-006](decisions/006-two-layer-scopes-only.md) | Two Layer scopes only | [INV-EC-002](invariants.md#inv-ec-002-a-per-scenario-layer-is-fresh-every-scenario) |
| [ADR-EC-007](decisions/007-cucumber-expressions-for-step-matching.md) | Step matching stays cucumber-expressions | — |
| [ADR-EC-008](decisions/008-data-tables-and-doc-strings-decode-through-schema.md) | Data tables/doc strings decode through Schema | — |
| [ADR-EC-009](decisions/009-cross-step-state-lives-in-a-ref.md) | Cross-step state lives in a Ref | [INV-EC-006](invariants.md#inv-ec-006-cross-step-scenario-data-survives-only-via-a-layer-provided-ref) |
| [ADR-EC-010](decisions/010-rule-and-scenario-scoped-extra-layers.md) | Rule/Scenario-scoped extra Layers | [INV-EC-005](invariants.md#inv-ec-005-a-rule-scoped-layer-is-invisible-outside-that-rule) |
| [ADR-EC-011](decisions/011-official-cucumber-parser-packages.md) | Official cucumber parser packages | — |
| [ADR-EC-012](decisions/012-effect-v4-beta.md) | Target Effect v4 (beta) | — |
| [ADR-EC-013](decisions/013-effect-cucumber-npm-scope.md) | One package per module, `@effect-cucumber` scope | — |

## §4 Test file map

Empty — no test files exist yet. Each row will map a test file to the
`BEH-EC-NNN`/`INV-EC-NNN` IDs it covers, following qadi's and hex-di's
convention, once `packages/*/test/` exists.

## §5 Acceptance scenario traceability

Empty — no `.feature` files exist in this library's own test suite yet. Each
row will map a `@REQ-EC-NNN` tag to the `.feature` file carrying it and the
behavior(s) it verifies, once the acceptance suite exists.

## §6 Coverage targets

| Scope | Statements | Branches | Enforced by |
| ----- | ---------- | -------- | ----------- |
| `packages/vitest/src` | 90% (target) | 90% (target) | Not yet wired — planned `vitest.config.ts` thresholds |
| `packages/gherkin/src` | 90% (target) | 90% (target) | Not yet wired — planned `vitest.config.ts` thresholds |

Targets are stated now so the eventual `vitest.config.ts` has a number to
enforce; until it exists, nothing here is actually gated.

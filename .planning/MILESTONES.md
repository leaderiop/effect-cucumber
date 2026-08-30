# Milestones

## v1.0 MVP (Shipped: 2026-08-30)

**Phases completed:** 11 phases, 85 plans, 161 tasks

**Key accomplishments:**

- Toolchain gate (Phase 1): `@effect/tsgo`'s `missingLayerContext`/`missingEffectContext` diagnostics genuinely fail `tsc -b`, not just advise — CI enforces lint/types/tests on Node 22 and 24 on every merge.
- Parsing (Phase 2): `loadFeature` turns a `.feature` file into a correlated `ParsedFeature`; every verified silent-failure mode of `@cucumber/gherkin`'s `compile()` (27 fixture rows) now raises a named, located error instead of a false-green test.
- Type-safe matching and data (Phases 3-4): cucumber-expressions resolve to real TypeScript types (`{int}` → `number`, proven by `@ts-expect-error` negatives), and Gherkin data tables decode through `Schema` with row/column-located failures.
- Compile-time dependency checking (Phases 5-6): `describeFeature`'s core value proposition — a step needing a service the Layer doesn't provide is a real compiler diagnostic — plus a Plan → Emit pipeline where unmatched, ambiguous, and unused steps all fail or warn loudly instead of silently passing.
- Hooks, Rules, and Outlines (Phases 7-8): all six hooks run in the correct order with `After`/`AfterStep` guaranteed via `Effect.onExit`; a `Rule` can extend the ambient Layer for just its own Scenarios; Outline Examples are typed for free via the step pattern's own coercion.
- Tags and Layer scopes (Phases 9-10): Gherkin tags become native vitest tags (`@skip` skips, `@only` can never break CI by accident); both the per-Scenario and opt-in `shared` Layer scopes work, with `TestClock` proven to stay per-Scenario even on the shared path.
- Closing traceability (Phase 11): three worked examples run green end to end with mutation-proven evidence, cross-step state is structurally enforced to flow through a `Ref` from `World` (never a closed-over `let`), and all 22 of 22 v1 requirements now carry a passing, uniquely-tagged acceptance test.

**Stats:** ~29,600 lines of TypeScript across `packages/gherkin` and `packages/vitest`; 481 files changed, +118,210/-553 over the milestone. Timeline: 2026-08-28 → 2026-08-30 (3 days).

---

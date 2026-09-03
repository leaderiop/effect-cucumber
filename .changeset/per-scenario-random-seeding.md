---
"@effect-cucumber/vitest": minor
---

Every emitted Scenario's ambient `effect/Random` is now seeded deterministically, with zero consumer
wiring — the same "ambient by default" treatment `TestClock`/`TestConsole` already get. A step
reaching for `Random.next`, `Random.nextIntBetween`, `Random.shuffle`, etc. gets the same value on
every run, and two Scenario Outline rows always draw independent sequences (derived from the
Feature's own uri plus the Scenario's fully emitted title, which `OutlineTitle.ts` already
disambiguates per Outline row).

Implemented as a `Random.withSeed` wrap around every emitted Scenario's composed Effect in
`Runner.ts` — a combinator over an `Effect`, not a `Layer`, since `effect@4.0.0-rc.112`'s
`Random.withSeed` has no `Layer` form. Composes outside the per-Scenario Layer `buildScenarioEffect`
already provides, so a consumer's own Layer providing its own `Random` implementation still wins for
any step inside it.

See [ADR-EC-031](../spec/decisions/031-random-withseed-wraps-the-scenario-effect-not-a-layer.md) and
[BEH-EC-023](../spec/behaviors/11-scenario-seeding.md).

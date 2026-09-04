/**
 * Type-level assertions for `attach`'s reach across the DSL (ADR-EC-036, BEH-EC-028, `Dsl.ts` notes).
 *
 * Carries: BEH-EC-028.
 */
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import { attach } from "../src/Attachments.ts"
import type { FeatureDsl, RuleDsl } from "../src/Dsl.ts"

class World extends Context.Service<World, { readonly ok: boolean }>()("Attachments.types/World") {}

const attaching = function*() {
  yield* attach("text/plain", "evidence")
}

export const use = (dsl: FeatureDsl<World, never>): void => {
  // POSITIVE CONTROL: `attach` is reachable from a step and from every per-Scenario hook kind.
  dsl.Given("a step", attaching)
  dsl.When("a step", attaching)
  dsl.Then("a step", attaching)
  dsl.And("a step", attaching)
  dsl.But("a step", attaching)
  dsl.Before(attaching)
  dsl.After(attaching)
  dsl.BeforeStep(attaching)
  dsl.AfterStep(attaching)
  // The tag-expression overload (ADR-EC-035) reaches `attach` identically.
  dsl.Before("@db", attaching)

  // `BeforeAllScenarios`/`AfterAllScenarios` run outside any Scenario's `it.effect` callback, so
  // there is no live `TestContext` to attach against — `HookRegistrar<RShared>` deliberately omits
  // `Attachments` from its union, rejecting `attach` there BY NAME. NOT asserted here with
  // `@ts-expect-error`: the diagnostic this produces is `@effect/tsgo`'s own plugin-injected
  // `effect(missingEffectContext)` (confirmed by hand — the same diagnostic
  // `hook-once-per-scenario-service.ts` triggers for the sibling per-Scenario-`World` case), which
  // does not interact with `@ts-expect-error`'s suppression the way a PLAIN structural TS error does
  // (`hook-once-per-scenario-service.ts` is not asserted with `@ts-expect-error` either, for the
  // identical reason). See `packages/vitest/test/tsgo-gate/src/hook-once-attachments.ts` and
  // `scripts/verify-tsgo-gate.sh` assertion 14 for the real compile-time proof, by diagnostic name.

  // POSITIVE CONTROL: the unconditional body (no `attach` call) still compiles on both once-per-Feature
  // hooks — the rejection above is about `Attachments` specifically, not about `HookRegistrar` itself.
  dsl.BeforeAllScenarios(function*() {
    yield* Effect.void
  })
  dsl.AfterAllScenarios(function*() {
    yield* Effect.void
  })
}

export const useInRule = (dsl: RuleDsl<World>): void => {
  // The identical reach holds for a Rule's own Before/After/BeforeStep/AfterStep and steps.
  dsl.Given("a step", attaching)
  dsl.Before(attaching)
  dsl.After(attaching)
  dsl.BeforeStep(attaching)
  dsl.AfterStep(attaching)

  // @ts-expect-error a Rule's dsl has no BeforeAllScenarios member at all (ADR-EC-010's existing
  // restriction, untouched by ADR-EC-036) — so this is rejected by absence, not by Attachments
  dsl.BeforeAllScenarios(attaching)
  // @ts-expect-error the same restriction for AfterAllScenarios
  dsl.AfterAllScenarios(attaching)
}

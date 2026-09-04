/**
 * The audit-tool motivating case ADR-EC-039/BEH-EC-031's own write-up frames throughout: two Rules
 * whose Scenarios produce disjoint result shapes (a remediation report vs. a BOM export), each
 * narrowed via `narrowRuleDsl` to see ONLY its own reshaped World. Proves narrowing is REAL at run
 * time, not merely at the type level (`scripts/verify-tsgo-gate.sh` assertions 15-16 already prove
 * the compile-time half, against the same mechanism): a narrowed step's `project` reaches into the
 * REAL ambient context — combining the Feature-level `FeatureService`'s own live value with the
 * Rule's own extra service — and the resulting reshaped value survives a Ref-backed hand-off
 * between two SEPARATELY narrowed step registrations (`When` then `Then`), proving `project`'s
 * per-call re-derivation preserves the underlying service's object identity across a Scenario.
 *
 * Carries: ADR-EC-006, ADR-EC-010, ADR-EC-039, BEH-EC-031, REQ-EC-031.
 */
import { assert } from "@effect/vitest"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Ref from "effect/Ref"
import * as Scope from "effect/Scope"
import { fileURLToPath } from "node:url"
import { Attachments } from "../../src/Attachments.ts"
import { describeFeature } from "../../src/describeFeature.ts"
import { loadFeature } from "../../src/loadFeature.ts"
import { narrowRuleDsl, type WorldProjection } from "../../src/RuleNarrowing.ts"

const featurePath = fileURLToPath(new URL("./rule-world-narrowing.feature", import.meta.url))
const feature = await loadFeature(featurePath)

// The Feature-level ambient service — visible at Feature level (the first Scenario proves it), and
// hidden from every narrowed Rule's own steps (proven at compile time by the tsgo-gate fixtures;
// this suite's own narrowed steps never reach for it, which is what makes the narrowed World the
// ONLY thing they can read).
class FeatureService extends Context.Service<FeatureService, { readonly featureId: string }>()(
  "rule-world-narrowing/FeatureService"
) {
  static readonly layer: Layer.Layer<FeatureService> = Layer.succeed(
    FeatureService,
    FeatureService.of({ featureId: "AUDIT-42" })
  )
}

// Rule "Remediation"'s own extra service — carries a Ref so a value captured by one narrowed step
// (`When`) survives to be read by a LATER, separately-narrowed step (`Then`) in the same Scenario,
// the cross-step-state-in-a-Ref convention ADR-EC-009/INV-EC-006 already require of ordinary steps.
class RemediationService extends Context.Service<RemediationService, {
  readonly remediate: (featureId: string) => Effect.Effect<string>
  readonly captured: Ref.Ref<Option.Option<string>>
}>()("rule-world-narrowing/RemediationService") {
  static readonly layer: Layer.Layer<RemediationService> = Layer.effect(
    this,
    Effect.gen(function*() {
      return RemediationService.of({
        remediate: (featureId) => Effect.succeed(`remediation-report for ${featureId}`),
        captured: yield* Ref.make<Option.Option<string>>(Option.none())
      })
    })
  )
}

// Rule "Bom"'s own extra service — DISJOINT from RemediationService, same shape otherwise.
class BomService extends Context.Service<BomService, {
  readonly exportBom: (featureId: string) => Effect.Effect<string>
  readonly captured: Ref.Ref<Option.Option<string>>
}>()("rule-world-narrowing/BomService") {
  static readonly layer: Layer.Layer<BomService> = Layer.effect(
    this,
    Effect.gen(function*() {
      return BomService.of({
        exportBom: (featureId) => Effect.succeed(`bom-export for ${featureId}`),
        captured: yield* Ref.make<Option.Option<string>>(Option.none())
      })
    })
  )
}

// The NARROWED worlds each Rule's steps actually see — reshaped (renamed member), not merely
// aliased, and disjoint from FeatureService/RemediationService/BomService alike.
class RemediationWorld extends Context.Service<RemediationWorld, {
  readonly produce: Effect.Effect<string>
  readonly captured: Ref.Ref<Option.Option<string>>
}>()("rule-world-narrowing/RemediationWorld") {}
class BomWorld extends Context.Service<BomWorld, {
  readonly produce: Effect.Effect<string>
  readonly captured: Ref.Ref<Option.Option<string>>
}>()("rule-world-narrowing/BomWorld") {}

// `project` for Rule "Remediation": reaches into the REAL wide context for BOTH FeatureService's
// own live `featureId` and RemediationService's own `remediate` function — genuine reshaping of
// real, live data, combining two ambient services into one narrowed shape, never a fabricated
// stand-in. `Scope.Scope`/`Attachments` are threaded through unchanged, per RuleNarrowing.ts's own
// contract.
const projectRemediation: WorldProjection<FeatureService | RemediationService, RemediationWorld> = (wide) => {
  const featureId = Context.get(wide, FeatureService).featureId
  const remediation = Context.get(wide, RemediationService)
  return Context.make(
    RemediationWorld,
    RemediationWorld.of({
      produce: remediation.remediate(featureId),
      captured: remediation.captured
    })
  ).pipe(
    Context.add(Scope.Scope, Context.get(wide, Scope.Scope)),
    Context.add(Attachments, Context.get(wide, Attachments))
  )
}
const projectBom: WorldProjection<FeatureService | BomService, BomWorld> = (wide) => {
  const featureId = Context.get(wide, FeatureService).featureId
  const bom = Context.get(wide, BomService)
  return Context.make(
    BomWorld,
    BomWorld.of({
      produce: bom.exportBom(featureId),
      captured: bom.captured
    })
  ).pipe(
    Context.add(Scope.Scope, Context.get(wide, Scope.Scope)),
    Context.add(Attachments, Context.get(wide, Attachments))
  )
}

// THE CALL UNDER TEST.
describeFeature(feature, FeatureService.layer, ({ Rule, Then }) => {
  Then("the feature id is {string}", function*(expected: string) {
    assert.strictEqual((yield* FeatureService).featureId, expected)
  })

  Rule("Remediation", RemediationService.layer, (wideDsl) => narrowRuleDsl(wideDsl, projectRemediation), (dsl) => {
    dsl.When("the audit rule runs", function*() {
      const world = yield* RemediationWorld
      yield* Ref.set(world.captured, Option.some(yield* world.produce))
    })
    dsl.Then("the remediation report reads {string}", function*(expected: string) {
      const world = yield* RemediationWorld
      const captured = yield* Ref.get(world.captured)
      assert.isTrue(Option.isSome(captured), "the remediation report was never captured")
      assert.strictEqual(Option.getOrThrow(captured), expected)
    })
  })

  Rule("Bom", BomService.layer, (wideDsl) => narrowRuleDsl(wideDsl, projectBom), (dsl) => {
    dsl.When("the audit rule runs", function*() {
      const world = yield* BomWorld
      yield* Ref.set(world.captured, Option.some(yield* world.produce))
    })
    dsl.Then("the bom export reads {string}", function*(expected: string) {
      const world = yield* BomWorld
      const captured = yield* Ref.get(world.captured)
      assert.isTrue(Option.isSome(captured), "the bom export was never captured")
      assert.strictEqual(Option.getOrThrow(captured), expected)
    })
  })
})

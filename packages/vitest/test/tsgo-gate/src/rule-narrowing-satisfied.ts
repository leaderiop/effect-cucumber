// MUST COMPILE CLEAN.
//
// ADR-EC-039/BEH-EC-031: `RuleRegistrar`'s third overload — `Rule(name, extraLayer, narrow,
// define)` — narrows or replaces the World a Rule's own Scenarios see, backed by real
// `Effect.updateContext` calls via `narrowRuleDsl`. Mirrors the audit-tool motivating case: two
// Rules whose Scenarios produce disjoint result shapes (a remediation report vs. a BOM export),
// each narrowed to see ONLY its own reshaped World, never the sibling Rule's nor the Feature's
// own ambient service — the negative fixture (rule-narrowing-starved.ts) proves both.
//
// Duplicated verbatim in the twin fixture on purpose, matching this directory's own
// satisfied/starved convention: `files: [one]` means a shared helper module would have to be
// added to every sibling tsconfig.*.json.
import type { ParsedFeature } from "@effect-cucumber/gherkin"
import { Attachments, describeFeature, narrowRuleDsl } from "@effect-cucumber/vitest"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Scope from "effect/Scope"

// The Feature-level ambient service — narrowing is meant to hide this from a narrowed Rule's own
// steps, the same way ADR-EC-010's Rule-scoped extra Layer is already invisible outside its Rule.
export class FeatureService extends Context.Service<FeatureService, { readonly featureId: string }>()(
  "rule-narrowing-satisfied/FeatureService"
) {
  static readonly layer: Layer.Layer<FeatureService> = Layer.succeed(
    FeatureService,
    FeatureService.of({ featureId: "AUDIT-42" })
  )
}

// Rule A's own extra service.
export class RemediationService extends Context.Service<
  RemediationService,
  { readonly remediate: Effect.Effect<string> }
>()("rule-narrowing-satisfied/RemediationService") {
  static readonly layer: Layer.Layer<RemediationService> = Layer.succeed(
    RemediationService,
    RemediationService.of({ remediate: Effect.succeed("remediation-report") })
  )
}

// Rule B's own extra service — DISJOINT from RemediationService (no shared members).
export class BomService extends Context.Service<BomService, { readonly exportBom: Effect.Effect<string> }>()(
  "rule-narrowing-satisfied/BomService"
) {
  static readonly layer: Layer.Layer<BomService> = Layer.succeed(
    BomService,
    BomService.of({ exportBom: Effect.succeed("bom-export") })
  )
}

// The NARROWED worlds each Rule's steps actually see — reshaped (renamed member, new Tag), not
// merely aliased, and disjoint from FeatureService/RemediationService/BomService alike.
export class RemediationWorld extends Context.Service<RemediationWorld, { readonly report: Effect.Effect<string> }>()(
  "rule-narrowing-satisfied/RemediationWorld"
) {}
export class BomWorld extends Context.Service<BomWorld, { readonly bom: Effect.Effect<string> }>()(
  "rule-narrowing-satisfied/BomWorld"
) {}

// `project` for Rule A: given the REAL ambient context (FeatureService | RemediationService |
// Scope.Scope | Attachments), build the narrower RemediationWorld the Rule's own steps are typed
// to require. Genuine reshaping of a real service, not a fabricated stand-in — `Scope.Scope` and
// `Attachments` are threaded through unchanged, per `RuleNarrowing.ts`'s own contract.
const projectRemediation = (
  wide: Context.Context<FeatureService | RemediationService | Scope.Scope | Attachments>
): Context.Context<RemediationWorld | Scope.Scope | Attachments> => {
  const remediation = Context.get(wide, RemediationService)
  return Context.make(RemediationWorld, RemediationWorld.of({ report: remediation.remediate })).pipe(
    Context.add(Scope.Scope, Context.get(wide, Scope.Scope)),
    Context.add(Attachments, Context.get(wide, Attachments))
  )
}
const projectBom = (
  wide: Context.Context<FeatureService | BomService | Scope.Scope | Attachments>
): Context.Context<BomWorld | Scope.Scope | Attachments> => {
  const bom = Context.get(wide, BomService)
  return Context.make(BomWorld, BomWorld.of({ bom: bom.exportBom })).pipe(
    Context.add(Scope.Scope, Context.get(wide, Scope.Scope)),
    Context.add(Attachments, Context.get(wide, Attachments))
  )
}

declare const feature: ParsedFeature

describeFeature(feature, FeatureService.layer, ({ Rule, Scenario }) => {
  // POSITIVE: a step inside Rule A can use Rule A's own narrowed service — and, per the negative
  // fixture, ONLY that.
  Rule(
    "Remediation",
    RemediationService.layer,
    (wideDsl) => narrowRuleDsl(wideDsl, projectRemediation),
    (dsl) => {
      dsl.Given("produces the remediation report", function*() {
        const world = yield* RemediationWorld
        return yield* world.report
      })
    }
  )

  // POSITIVE (twin case): a step inside Rule B can use Rule B's own narrowed service.
  Rule(
    "Bom",
    BomService.layer,
    (wideDsl) => narrowRuleDsl(wideDsl, projectBom),
    (dsl) => {
      dsl.Given("produces the bom export", function*() {
        const world = yield* BomWorld
        return yield* world.bom
      })
      // A step registered on a narrowed Background/Scenario still sees the narrowed world.
      dsl.Background(({ Given }) => {
        Given("a bom background step", function*() {
          yield* BomWorld
        })
      })
      dsl.Scenario("a plain nested scenario", ({ Given }) => {
        Given("also sees only the bom world", function*() {
          yield* BomWorld
        })
      })
    }
  )

  // CONTROL: the EXISTING three-argument (no narrowing) and two-argument forms must still compile
  // unchanged — this overload is additive, not a breaking change to the other two.
  Rule("plain extra layer, no narrowing", RemediationService.layer, (dsl) => {
    dsl.Given("sees both the ambient and its own extra service, union-style", function*() {
      yield* FeatureService
      return yield* (yield* RemediationService).remediate
    })
  })
  Rule("no extra layer at all", (dsl) => {
    dsl.Given("sees only the ambient", function*() {
      return (yield* FeatureService).featureId
    })
  })

  Scenario("outside every rule", ({ Given }) => {
    Given("sees only the Feature's ambient service", function*() {
      yield* FeatureService
    })
  })
})

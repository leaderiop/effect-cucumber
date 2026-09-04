// MUST NOT COMPILE. Two independent defects, both inside Rule A's narrowed dsl.
//
// Duplicated verbatim from the twin fixture rather than shared through a helper module: `files:
// [one]` would force every sibling config to list the helper too.
import type { ParsedFeature } from "@effect-cucumber/gherkin"
import { Attachments, describeFeature, narrowRuleDsl } from "@effect-cucumber/vitest"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Scope from "effect/Scope"

export class FeatureService extends Context.Service<FeatureService, { readonly featureId: string }>()(
  "rule-narrowing-starved/FeatureService"
) {
  static readonly layer: Layer.Layer<FeatureService> = Layer.succeed(
    FeatureService,
    FeatureService.of({ featureId: "AUDIT-42" })
  )
}

export class RemediationService extends Context.Service<
  RemediationService,
  { readonly remediate: Effect.Effect<string> }
>()("rule-narrowing-starved/RemediationService") {
  static readonly layer: Layer.Layer<RemediationService> = Layer.succeed(
    RemediationService,
    RemediationService.of({ remediate: Effect.succeed("remediation-report") })
  )
}

// `BomService`/`BomWorld` exist and are never declared as a Rule in this file — Rule A's narrowed
// dsl must not be able to reach `BomWorld` regardless.
export class BomService extends Context.Service<BomService, { readonly exportBom: Effect.Effect<string> }>()(
  "rule-narrowing-starved/BomService"
) {
  static readonly layer: Layer.Layer<BomService> = Layer.succeed(
    BomService,
    BomService.of({ exportBom: Effect.succeed("bom-export") })
  )
}

export class RemediationWorld extends Context.Service<RemediationWorld, { readonly report: Effect.Effect<string> }>()(
  "rule-narrowing-starved/RemediationWorld"
) {}
export class BomWorld extends Context.Service<BomWorld, { readonly bom: Effect.Effect<string> }>()(
  "rule-narrowing-starved/BomWorld"
) {}

const projectRemediation = (
  wide: Context.Context<FeatureService | RemediationService | Scope.Scope | Attachments>
): Context.Context<RemediationWorld | Scope.Scope | Attachments> => {
  const remediation = Context.get(wide, RemediationService)
  return Context.make(RemediationWorld, RemediationWorld.of({ report: remediation.remediate })).pipe(
    Context.add(Scope.Scope, Context.get(wide, Scope.Scope)),
    Context.add(Attachments, Context.get(wide, Attachments))
  )
}

declare const feature: ParsedFeature

describeFeature(feature, FeatureService.layer, ({ Rule }) => {
  Rule(
    "Remediation",
    RemediationService.layer,
    (wideDsl) => narrowRuleDsl(wideDsl, projectRemediation),
    (dsl) => {
      // Legitimate step, unaffected by either defect below.
      dsl.Given("produces the remediation report", function*() {
        const world = yield* RemediationWorld
        return yield* world.report
      })

      // DEFECT 1: a sibling Rule's narrowed world — `BomWorld` is never provided to Rule A's
      // narrowed dsl, and no Rule named "Bom" is even declared in this file.
      dsl.Given("reaches for the sibling rule's world", function*() {
        yield* BomWorld
      })

      // DEFECT 2 — the case that matters most: the Feature-level AMBIENT service narrowing is
      // supposed to hide. This is exactly what the existing `RuleDsl<ROut | R2>` union (the plain
      // three-argument overload) CANNOT reject, since `|` only ever grows what a step may reach
      // for; the narrowed dsl must reject it.
      dsl.Given("reaches for the feature-level ambient service", function*() {
        yield* FeatureService
      })
    }
  )
})

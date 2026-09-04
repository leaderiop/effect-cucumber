---
"@effect-cucumber/vitest": minor
---

Add a fourth `Rule` arity — `Rule(name, extraLayer, narrow, define)` — that narrows or REPLACES
(not only extends) the World a Rule's own Scenarios see, and export `narrowRuleDsl` as the
sanctioned way to build the `narrow` callback's return value:

```ts
import { describeFeature, narrowRuleDsl } from "@effect-cucumber/vitest"

describeFeature(feature, AuditContext.layer, ({ Rule }) => {
  Rule(
    "Remediation",
    RemediationService.layer,
    (wideDsl) => narrowRuleDsl(wideDsl, project), // project: WorldProjection<Wide, Narrow>
    (dsl) => {
      dsl.Given("the audit produces a remediation report", function*() {
        // Only RemediationWorld is reachable here — not AuditContext, not a sibling Rule's world.
        yield* (yield* RemediationWorld).report
      })
    }
  )
})
```

`project` is a real function, backed by `Effect.updateContext`, that reshapes the Rule's actual
ambient context — hand-written per Rule, the one real ongoing cost of this feature, not
auto-derived. In exchange, a step inside a narrowed Rule cannot reach a sibling Rule's narrowed
World or the Feature's own ambient service, rejected by name (`effect(missingEffectContext)`) —
the one case the existing three-argument form's `RuleDsl<ROut | R2>` union cannot express, since
`|` only ever grows what a step may reach for.

The existing two- and three-argument `Rule` forms are unchanged. A Scenario's own extra Layer
cannot be nested inside a narrowed Rule — unsupported, and fails loudly with an `Error` at
registration time rather than silently mis-narrowing.

See [ADR-EC-039](../spec/decisions/039-rule-world-narrowing-via-effect-updatecontext-in-narrowruledsl.md)
and [BEH-EC-031](../spec/behaviors/18-rule-world-narrowing.md), and `packages/vitest/README.md`'s
"A `Rule` can narrow or replace the ambient World" section.

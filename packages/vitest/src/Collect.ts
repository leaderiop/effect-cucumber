/**
 * The Register and Plan stage behind both entry points: `collect` builds a `FeatureCollection`
 * from a Feature, its Layer argument and the `define` callback, and emits nothing.
 *
 * Invariants a reader must not tidy away:
 * - One fresh step registry and one fresh hook registry per call; nothing is module-level
 *   (`test/Registry.test.ts`, `test/describeFeature.test.ts` "two calls").
 * - A container callback runs synchronously; a Promise-returning one is rejected at collection
 *   time (`invokeDefine`, BEH-EC-002).
 * - `use` registers a module's steps into the CURRENT scope frame, so a module used inside a Rule
 *   is Rule-scoped (`test/StepModule.test.ts`).
 * - An unknown Rule name maps to a sentinel id, never `null`, and is reported once as an
 *   `UnknownContainerWarning`; Scenarios inside it are covered by that warning (BEH-EC-009).
 * - The two Layer tiers are split, never merged (`splitLayerArgument`).
 */
import type { ParsedFeature } from "@effect-cucumber/gherkin"
import * as Layer from "effect/Layer"
import { captureCallSite, formatCallSite } from "./CallSite.ts"
import type {
  BackgroundDsl,
  FeatureDsl,
  RuleDsl,
  ScenarioDsl,
  ScenarioRegistrar,
  StepRegistrar,
  TaggedHookRegistrar
} from "./Dsl.ts"
import { makeUnknownContainerWarning, type UnknownContainerWarning } from "./Errors.ts"
import { groupHooks, type HookBody, type HookSet, registerHook } from "./Hook.ts"
import { createHookRegistry, type HookKind } from "./HookRegistry.ts"
import { featureTagUniverse } from "./HookTagExpression.ts"
// `StepBody` is declared in `Plan.ts` and imported here, never the reverse (`pnpm circular`).
import { type ErasedExtraLayer, type ErasedLayer, type FeaturePlan, planFeature, type StepBody } from "./Plan.ts"
import { createRegistry, type StepDefinition, type StepKeyword } from "./Registry.ts"
// The composite `scenarioLayers` key, in a LEAF module both this file and `Runner.ts` import rather
// than private to either — `ScenarioKey.ts`'s own header has the argument.
import { scenarioKey } from "./ScenarioKey.ts"
import { register } from "./Step.ts"

/**
 * The union of what the two overloads accept, as the implementation signature sees it.
 */
export type LayerArgument =
  | ErasedLayer
  | { readonly shared: ErasedLayer; readonly perScenario: ErasedExtraLayer }
/**
 * What `describeFeature` collected, before anything is run.
 */
export type FeatureCollection = {
  readonly feature: ParsedFeature
  readonly layer: ErasedExtraLayer
  readonly sharedLayer: ErasedLayer | null
  readonly definitions: ReadonlyArray<StepDefinition<StepBody>>
  readonly plan: FeaturePlan
  readonly containerWarnings: ReadonlyArray<UnknownContainerWarning>
  readonly hooks: HookSet
  readonly ruleLayers: ReadonlyMap<string, ErasedExtraLayer>
  readonly ruleHooks: ReadonlyMap<string, HookSet>
  readonly scenarioLayers: ReadonlyMap<string, ErasedExtraLayer>
}
const splitLayerArgument = (
  argument: LayerArgument
): {
  readonly shared: ErasedLayer | null
  readonly perScenario: ErasedExtraLayer
} =>
  "perScenario" in argument
    ? { shared: argument.shared, perScenario: argument.perScenario }
    : { shared: null, perScenario: argument }
const invokeDefine = <Dsl>(
  container: string,
  name: string | null,
  define: (dsl: Dsl) => void,
  dsl: Dsl
): void => {
  const returned: unknown = define(dsl)
  if (returned instanceof Promise) {
    returned.catch(() => undefined)
    const label = name === null ? container : `${container} "${name}"`
    throw new Error(
      `${label}'s define callback returned a Promise (at ${formatCallSite(captureCallSite())}). `
        + "A define callback must be synchronous: every step, hook and container it registers after "
        + "an `await` is never seen, so the Feature would emit fewer tests than were written and pass."
    )
  }
}
const unregisteredRulePrefix = "unregistered-rule:"
const resolveRuleId = (feature: ParsedFeature, name: string): string => {
  const match = feature.rules.find((rule) => rule.name === name)
  return match === undefined ? `${unregisteredRulePrefix}${name}` : match.id
}
/**
 * The one implementation both public entry points delegate to.
 */
export const collect = (
  feature: ParsedFeature,
  layerArgument: LayerArgument,
  define: (dsl: FeatureDsl<any, any>) => void
): FeatureCollection => {
  // ONE fresh registry per invocation, built here and never hoisted to module scope or memoised.
  const registry = createRegistry<StepBody>(feature.name)

  // Never hoisted to module scope, never memoised: two `describeFeature` calls in one file sharing
  // a hook store would make the second Feature run the first Feature's `Before` hooks.
  const hookRegistry = createHookRegistry<HookBody>()

  const { perScenario: featureLayer, shared: sharedLayer } = splitLayerArgument(layerArgument)

  // Every Rule this Feature's define callback actually called `Rule(...)` for, keyed by the id
  // `resolveRuleId` produced — real or sentinel.
  const ruleLayers = new Map<string, ErasedExtraLayer>()

  // Every THREE-argument `Scenario(...)` call, from either level, keyed by `scenarioKey`.
  const scenarioLayers = new Map<string, ErasedExtraLayer>()

  // One registrar per keyword: normalise the body through `Step.ts`, then record it with its call site.
  const registrar = (keyword: StepKeyword): StepRegistrar<any> => (pattern, fn) => {
    // The `captureCallSite` call below MUST stay INSIDE this arrow — the one a test author calls as
    // `Given`/`When`/`Then`/`And`/`But`.
    registry.register(keyword, pattern, register(pattern, fn), captureCallSite())
  }

  // Mirrors `registrar` above, minus `pattern` and minus a call-site capture. Shared by all SIX hook
  // kinds at the `dsl` object literal below: `BeforeAllScenarios`/`AfterAllScenarios` are typed
  // `HookRegistrar<RShared>` there (one-arg only), so a tag expression reaching this closure for
  // either is rejected AT THE CALL SITE by TypeScript, never at runtime — this implementation stays
  // one function for all six because the arity-driven branch below is the identical "was a string
  // passed" check regardless of which kind is calling it.
  const hookRegistrar =
    (kind: HookKind): TaggedHookRegistrar<any> => (tagExprOrFn: string | (() => any), maybeFn?: () => any): void => {
      const tagExpr = typeof tagExprOrFn === "string" ? tagExprOrFn : null
      const fn = (maybeFn ?? tagExprOrFn) as () => any
      hookRegistry.register(kind, null, tagExpr, registerHook(kind, fn))
    }

  const scenarioDsl: ScenarioDsl<any> = {
    Given: registrar("Given"),
    When: registrar("When"),
    Then: registrar("Then"),
    And: registrar("And"),
    But: registrar("But"),
    // A step module's records go into the CURRENT scope frame, exactly like a `Given` written here
    // (ADR-EC-027): used inside a Rule they are Rule-scoped, at Feature level Feature-scoped.
    use: (module) => {
      for (const step of module.steps) {
        registry.register(step.keyword, step.pattern, step.body, step.definedAt)
      }
    }
  }

  // ADR-EC-017: a Background gets `Given` and `And` only. The omission is the contract, not a gap.
  const backgroundDsl: BackgroundDsl<any> = { Given: scenarioDsl.Given, And: scenarioDsl.And }

  const containerWarnings: Array<UnknownContainerWarning> = []

  const noteUnknownScenario = (ruleId: string | null, name: string): void => {
    if (ruleId !== null && ruleId.startsWith(unregisteredRulePrefix)) return
    const rule = ruleId === null ? null : feature.rules.find((candidate) => candidate.id === ruleId)
    const scenarios = ruleId === null ? feature.scenarios : rule === undefined || rule === null ? [] : rule.scenarios
    const known = [...new Set(scenarios.map((scenario) => scenario.astName))]
    if (known.includes(name)) return
    containerWarnings.push(
      makeUnknownContainerWarning({ uri: feature.uri, kind: "Scenario", name, ruleName: rule?.name ?? null, known })
    )
  }

  const makeScenarioRegistrar = (
    ruleId: string | null,
    ambientLayer: ErasedExtraLayer
  ): ScenarioRegistrar<any> =>
  (
    name: string,
    extraLayerOrDefine: ErasedExtraLayer | ((dsl: ScenarioDsl<any>) => void),
    maybeDefine?: (dsl: ScenarioDsl<any>) => void
  ): void => {
    noteUnknownScenario(ruleId, name)
    // The two-argument form records nothing: no entry means the Scenario runs against its scope's Layer.
    if (maybeDefine !== undefined) {
      const extraLayer = extraLayerOrDefine as ErasedExtraLayer
      scenarioLayers.set(scenarioKey(ruleId, name), Layer.provideMerge(ambientLayer)(extraLayer))
    }

    const defineScenario = maybeDefine ?? (extraLayerOrDefine as (dsl: ScenarioDsl<any>) => void)
    registry.pushScope({ kind: "scenario", name, ruleId })
    try {
      invokeDefine("Scenario", name, defineScenario, scenarioDsl)
    } finally {
      // `finally`, so a define callback that throws cannot leave the stack unbalanced and re-parent
      // every step registered after it onto a scope the document does not have.
      registry.popScope()
    }
  }

  const dsl: FeatureDsl<any, any> = {
    ...scenarioDsl,
    Background: (defineBackground) => {
      // `name: null` and not the feature's name: a Background genuinely has none (Registry.ts's
      // note on RegistryScope). `ruleId: null` is not a placeholder — it is the truthful value.
      registry.pushScope({ kind: "background", name: null, ruleId: null })
      try {
        invokeDefine("Background", null, defineBackground, backgroundDsl)
      } finally {
        // `finally`, so a define callback that throws cannot leave the stack unbalanced and
        // re-parent every step registered after it onto a scope the document does not have.
        registry.popScope()
      }
    },
    // A Feature-level Scenario belongs to no Rule (`null`) and runs against the Feature's own Layer.
    Scenario: makeScenarioRegistrar(null, featureLayer),
    Rule: (
      ruleName: string,
      extraLayerOrDefine: ErasedExtraLayer | ((dsl: RuleDsl<any>) => void),
      maybeDefine?: (dsl: RuleDsl<any>) => void
    ): void => {
      // Arity narrowing, the same shape `makeScenarioRegistrar` uses.
      const extraLayer: ErasedExtraLayer | null = maybeDefine === undefined
        ? null
        : (extraLayerOrDefine as ErasedExtraLayer)
      const defineRule = maybeDefine ?? (extraLayerOrDefine as (dsl: RuleDsl<any>) => void)

      const ruleId = resolveRuleId(feature, ruleName)
      if (ruleId.startsWith(unregisteredRulePrefix)) {
        containerWarnings.push(
          makeUnknownContainerWarning({
            uri: feature.uri,
            kind: "Rule",
            name: ruleName,
            ruleName: null,
            known: feature.rules.map((rule) => rule.name)
          })
        )
      }

      // Merged here, exactly once per `Rule(...)`, at the point the extra Layer is captured.
      const ruleAmbientLayer = extraLayer === null ? featureLayer : Layer.provideMerge(featureLayer)(extraLayer)
      ruleLayers.set(ruleId, ruleAmbientLayer)

      // The Rule-scoped counterpart of the Feature-level `hookRegistrar` closure above, differing
      // in exactly one thing: it passes THIS Rule's id where that one passes `null`.
      const ruleHookRegistrar = (kind: HookKind): TaggedHookRegistrar<any> =>
      (
        tagExprOrFn: string | (() => any),
        maybeFn?: () => any
      ): void => {
        const tagExpr = typeof tagExprOrFn === "string" ? tagExprOrFn : null
        const fn = (maybeFn ?? tagExprOrFn) as () => any
        hookRegistry.register(kind, ruleId, tagExpr, registerHook(kind, fn))
      }

      const ruleDsl: RuleDsl<any> = {
        // The SAME `scenarioDsl` object the Feature level hands out.
        ...scenarioDsl,
        Background: (defineBackground) => {
          // The same `backgroundDsl` (`Given`/`And` only, ADR-EC-017), one nesting level down.
          registry.pushScope({ kind: "background", name: null, ruleId })
          try {
            invokeDefine("Background", ruleName, defineBackground, backgroundDsl)
          } finally {
            registry.popScope()
          }
        },
        // This Rule's id and its already-merged Layer are the only differences from the Feature-level factory.
        Scenario: makeScenarioRegistrar(ruleId, ruleAmbientLayer),
        // Exactly the four hooks ADR-EC-010 scopes to a Rule.
        Before: ruleHookRegistrar("Before"),
        After: ruleHookRegistrar("After"),
        BeforeStep: ruleHookRegistrar("BeforeStep"),
        AfterStep: ruleHookRegistrar("AfterStep")
      }

      registry.pushScope({ kind: "rule", name: ruleName, ruleId })
      try {
        invokeDefine("Rule", ruleName, defineRule, ruleDsl)
      } finally {
        registry.popScope()
      }
    },
    Before: hookRegistrar("Before"),
    After: hookRegistrar("After"),
    BeforeStep: hookRegistrar("BeforeStep"),
    AfterStep: hookRegistrar("AfterStep"),
    BeforeAllScenarios: hookRegistrar("BeforeAllScenarios"),
    AfterAllScenarios: hookRegistrar("AfterAllScenarios")
  }

  invokeDefine("describeFeature", feature.name, define, dsl)

  const definitions = registry.definitions()

  // Read ONCE, after `define(dsl)` has returned, and shared by both groupings below.
  const hookDefinitions = hookRegistry.hooks()

  // Every literal tag anywhere in this Feature (Feature/Rule/Scenario/Examples tags, already
  // flattened onto `ParsedScenario.tags` by the parser) — computed ONCE here, from data `Plan.ts`
  // would flatten identically, never a second `gherkinTags`-style file rescan. This is the "declared
  // tag universe" a tag-expression-scoped hook's `tagExpr` is validated against (ADR-EC-026's rule,
  // extended to a second call site by ADR-EC-035/BEH-EC-027).
  const availableTags = featureTagUniverse(feature.allScenarios)

  // PLAN, and it happens in the SHARED implementation rather than in `describeFeature` alone.
  return {
    feature,
    // The SAME binding every Rule's merged Layer was derived from — separated once, near the top.
    layer: featureLayer,
    // The other half, or `null`, and never folded into the field above. The composition root
    // branches on exactly this: `null` is the plain path, non-null is the shared path.
    sharedLayer,
    definitions,
    plan: planFeature({ feature, definitions }),
    containerWarnings,
    // Grouping happens HERE, in the shared implementation, for the same reason planning does — see
    // the `hooks` field's own doc comment on `FeatureCollection`. FILTERED to Feature scope.
    hooks: groupHooks(
      hookDefinitions.filter((definition) => definition.ruleId === null),
      availableTags,
      feature.uri
    ),
    ruleLayers,
    ruleHooks: new Map(
      [...ruleLayers.keys()].map((ruleId): readonly [string, HookSet] => [
        ruleId,
        groupHooks(hookDefinitions.filter((definition) => definition.ruleId === ruleId), availableTags, feature.uri)
      ])
    ),
    // Handed back as-is — sparse by design, one entry per three-argument `Scenario(...)` call and
    // nothing for the common two-argument form.
    scenarioLayers
  }
}

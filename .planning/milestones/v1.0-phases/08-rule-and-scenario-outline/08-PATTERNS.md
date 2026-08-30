# Phase 8: Rule and Scenario Outline - Pattern Map

**Mapped:** 2026-08-29
**Files analyzed:** 8 (6 named in CONTEXT.md canonical_refs + 2 implied by D-02's mechanics)
**Analogs found:** 8 / 8 — every file's closest analog is **itself**: this phase extends an
existing three-case dispatch (`feature | background | scenario`) to a four-case one
(`+ rule`) in each of Registry.ts, Plan.ts, Dsl.ts, ScenarioEffect.ts, Hook.ts and
HookRegistry.ts. There is no sibling module elsewhere in the codebase that models a scope
chain more closely than these files already model it for two of the three levels.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `packages/vitest/src/Registry.ts` | model/store | CRUD (scope-stack push/pop/register) | itself — `background`/`scenario` `RegistryScopeKind` cases | exact (self-extension) |
| `packages/vitest/src/Plan.ts` | service (resolver) | transform (step→definition matching) | itself — `isVisibleTo`/`scopeRank` background/scenario cases | exact (self-extension) |
| `packages/vitest/src/Dsl.ts` | config (type-only surface) | request-response (compile-time contract) | itself — `BackgroundDsl<ROut>`, `FeatureDsl<ROut>` | exact (self-extension) |
| `packages/vitest/src/ScenarioEffect.ts` | service (Effect composer) | event-driven (hook gating/guarantee) | itself — `Before` gate / `After` `onExit` (notes d/e) | exact (self-extension) |
| `packages/vitest/src/Runner.ts` | controller (emission/describe walk) | event-driven (test-node emission) | itself — the existing `for (const rule of plan.feature.rules)` nesting loop | exact (self-extension) |
| `packages/vitest/src/describeFeature.ts` | controller (composition root) | request-response (DSL wiring) | itself — `Background`/`Scenario` container closures (`registry.pushScope`/`popScope`) | exact (self-extension) |
| `packages/vitest/src/HookRegistry.ts` | model/store | CRUD (hook list) | `packages/vitest/src/Registry.ts`'s scope-stack (cross-file, since this file explicitly has none today) | role-match, cross-file |
| `packages/vitest/src/Hook.ts` | service (hook runner) | event-driven (batch execution) | itself — `runHookBatch`'s bare `for`-loop-of-`yield*` shape | exact (self-extension) |
| `packages/gherkin/src/Model.ts` | model (types only) | n/a (data shape) | itself — `ParsedRule`, `StepOwner`'s `"rule-background"` (already complete, no change expected) | exact (reference only, no modification) |

## Pattern Assignments

### `packages/vitest/src/Registry.ts` (model/store, CRUD)

**Analog:** itself — the file's own `background`/`scenario` `RegistryScopeKind` handling is the
literal template for adding `"rule"`.

**Current type surface to extend** (lines 55-72):
```typescript
export type RegistryScopeKind = "feature" | "background" | "scenario"

export type RegistryScope = {
  readonly kind: RegistryScopeKind
  readonly name: string | null
}
```
Add `"rule"` to the union. `name` stays `string | null` (never optional —
`exactOptionalPropertyTypes` reasoning already documented in the file's own comment on this
field applies identically to a Rule's name).

**Push/pop pattern to copy** (lines 126-164, `createRegistry`):
```typescript
export const createRegistry = <Fn>(featureName: string) => {
  const stack: Array<RegistryScope> = [{ kind: "feature", name: featureName }]
  const records: Array<StepDefinition<Fn>> = []

  const currentScope = (): RegistryScope => { /* ... */ }
  const pushScope = (scope: RegistryScope): void => { stack.push(scope) }
  const popScope = (): void => {
    if (stack.length <= 1) {
      throw new Error(
        "Registry scope stack underflow: popScope() was called at the feature root "
          + `("${featureName}"), which has no enclosing scope to return to. `
          + "A container callback returned twice, or a pushScope() was lost."
      )
    }
    stack.pop()
  }
  ...
}
```
A `rule` frame is pushed/popped with `pushScope({ kind: "rule", name: rule.name })` /
`popScope()` exactly like `background`/`scenario` frames — no new stack mechanism, just one
more literal in the union and one more `pushScope` call site (in `describeFeature.ts`'s new
`Rule` container). Module stays dependency-free (note (c)) — do not import `Dsl.ts` or
`ParsedRule` here.

**Testing pattern** (`test/Registry.test.ts` lines 130-136):
```typescript
it("records a background scope with a null name", () => {
  const registry = createRegistry<string>("a feature")
  registry.pushScope({ kind: "background", name: null })
  registry.register("Given", "a background step", () => "background", elsewhere)
  expect(registry.definitions()[0]?.scope).toEqual({ kind: "background", name: null })
})
```
A `rule` scope test follows the identical shape, asserting `{ kind: "rule", name: "<rule name>" }`.

---

### `packages/vitest/src/Plan.ts` (service/resolver, transform)

**Analog:** itself — note (e) (lines 68-74) already states plainly what is and isn't in scope:
reading already works for a Rule-nested Scenario; only registration-side dispatch is missing.

**Visibility dispatch to extend** (lines 442-455, `isVisibleTo`):
```typescript
const isVisibleTo = (
  definition: StepDefinition<StepBody>,
  scenario: ParsedScenario,
  step: ParsedStep
): boolean => {
  switch (definition.scope.kind) {
    case "feature":
      return true
    case "background":
      return step.origin === "feature-background" || step.origin === "rule-background"
    case "scenario":
      return step.origin === "scenario" && definition.scope.name === scenario.astName
  }
}
```
A `"rule"` case needs `scenario.ruleId` (already on `ParsedScenario`, `Option.Option<string>`)
compared against the Rule's own id/name the definition was registered under — the scope frame
needs to carry enough to make that comparison (an id, not just `name`, if two Rules can share a
name — check `ParsedRule.id` in Model.ts). A `"rule-background"`-origin step should be visible to
a `background`-scope definition registered *inside* that Rule's own `Background` (D-04) the same
way `feature-background` is visible to a Feature-level `background`-scope definition — this is
the one place `isVisibleTo`'s `background` case also needs to grow a Rule-id check, not just a
new switch arm.

**Rank to extend** (lines 456-464, `scopeRank`):
```typescript
const scopeRank = (kind: RegistryScopeKind): number => kind === "feature" ? 1 : 0
```
Becomes a three-level rank (`scenario`/`rule-background` innermost, `rule` middle, `feature`
outermost) per ARCHITECTURE.md Pattern 5's "walk up the chain, first match wins" — note (b)'s
same reasoning (an inner registration shadows an outer one; two matches at the *same* rank is
the ambiguity) extends unchanged, just with one more rank value.

**Note to update in place:** note (e) itself (lines 68-74) must be rewritten once `rule` exists —
its current text (`RegistryScopeKind` is `feature | background | scenario`) becomes false the
moment this phase lands, and leaving it as a stale claim would be exactly the "say only what is
true" violation this codebase's own doc comments police elsewhere (see `HookRegistry.ts` note
(e)'s phrasing of the same principle).

---

### `packages/vitest/src/Dsl.ts` (config, type-only)

**Analog:** itself — `BackgroundDsl<ROut>` (lines 184-189) is the direct template for
`RuleDsl<ROut>`'s own `Background`; `FeatureDsl<ROut>`'s `Scenario` member (line 214) is the
template for `RuleDsl`'s `Scenario` member and for `FeatureDsl`'s `Rule` member.

**Template to copy for Rule-level Background** (lines 178-189):
```typescript
export interface BackgroundDsl<ROut> {
  /** Register a `Given` step definition scoped to this `Background`. */
  readonly Given: StepRegistrar<ROut>
  /** Register an `And` step definition scoped to this `Background`. */
  readonly And: StepRegistrar<ROut>
}
```
D-04's `RuleDsl<ROut>`'s `Background` registrar reuses this exact interface — no new type needed,
just `readonly Background: (define: (dsl: BackgroundDsl<ROut>) => void) => void` on `RuleDsl`,
identical in shape to `FeatureDsl.Background` (line 207).

**Template to copy/extend for `Scenario`/`Rule` members** (lines 199-227, `FeatureDsl<ROut>`):
```typescript
export interface FeatureDsl<ROut> extends ScenarioDsl<ROut> {
  readonly Background: (define: (dsl: BackgroundDsl<ROut>) => void) => void
  readonly Scenario: (name: string, define: (dsl: ScenarioDsl<ROut>) => void) => void
  readonly Before: HookRegistrar<ROut>
  readonly After: HookRegistrar<ROut>
  readonly BeforeStep: HookRegistrar<ROut>
  readonly AfterStep: HookRegistrar<ROut>
  readonly BeforeAllScenarios: HookRegistrar<ROut>
  readonly AfterAllScenarios: HookRegistrar<ROut>
}
```
D-01 changes `Scenario`'s signature on both `FeatureDsl` and the new `RuleDsl` to accept an
extra Layer (either an overload pair or an always-present-but-possibly-`Layer.empty` parameter —
Claude's Discretion, see CONTEXT.md). `Rule` is a new sibling member on `FeatureDsl`, following
the identical `(name, extraLayer, define)` shape ADR-EC-010 documents for both forms. Per
Claude's Discretion, whether `RuleDsl<ROut>` `extends ScenarioDsl<ROut>` (mirroring
`FeatureDsl extends ScenarioDsl`, line 199) is the first thing to decide when drafting the new
interface — the precedent argues for it unless a concrete reason says otherwise.

**Notes that must be preserved when extending this file:**
- Note (a)/(b) (generator-branch-first, `Scope.Scope` placement) apply verbatim to any new
  registrar signature `RuleDsl` introduces — do not reorder the union or hoist `Scope.Scope`.
- Note (f) (hooks live on `FeatureDsl` ONLY) is the one note this phase's D-02 directly
  contradicts for `RuleDsl` — Rule-scoped `Before`/`After`/`BeforeStep`/`AfterStep` per
  ADR-EC-010 means `RuleDsl` DOES get its own copies of (a subset of) `HookRegistrar<ROut>`
  members, which is new, not a leak to guard against. The note's own reasoning (a hook member on
  `ScenarioDsl` would leak into `Scenario(...)`) still forbids putting hooks on `ScenarioDsl`
  itself — they belong on `RuleDsl` directly, the same "sibling of the five step registrars, not
  spread into them" placement `FeatureDsl` already uses (see `describeFeature.ts`'s comment at
  line 251-253).
- `BeforeAllScenarios`/`AfterAllScenarios` default to NOT appearing on `RuleDsl` (Claude's
  Discretion default) — do not carry all six `FeatureDsl` hook members over by copy-paste.

---

### `packages/vitest/src/ScenarioEffect.ts` (service, event-driven)

**Analog:** itself — the `Before` gate / `After` guarantee shape (notes d/e, lines 76-98) is the
direct model for D-02's Feature-then-Rule / Rule-then-Feature ordering, one nesting level up.

**Core pattern to extend** (lines 177-224, `buildScenarioEffect`):
```typescript
export const buildScenarioEffect = (
  args: { readonly plan: ScenarioPlan; readonly layer: Layer.Layer<any, any, never>; readonly hooks: HookSet }
): Effect.Effect<void, unknown, Scope.Scope> =>
  Effect.gen(function*() {
    yield* runHookBatch(args.hooks.Before)
    for (const planned of args.plan.steps) {
      if (isUnresolved(planned)) {
        return yield* Effect.fail(planned.error)
      }
      yield* Effect.gen(function*() {
        yield* runHookBatch(args.hooks.BeforeStep)
        yield* planned.step.body(...planned.step.args)
      }).pipe(
        Effect.onExit(() => runHookBatch(args.hooks.AfterStep))
      )
    }
  }).pipe(
    Effect.onExit(() => runHookBatch(args.hooks.After)),
    Effect.provide(args.layer)
  )
```
D-02's ordering ("Feature `Before` then Rule `Before`; Rule `After` then Feature `After`") is
most naturally expressed by handing this function TWO `HookSet`s (feature-level, rule-level —
`null`/empty for a Scenario with no enclosing Rule) and sequencing
`runHookBatch(feature.Before)` then `runHookBatch(rule.Before)` before the step loop, and
nesting the `Effect.onExit` wraps so the Rule's `After` batch is the INNER `onExit` and the
Feature's is the OUTER one (mirroring `describe(feature) → describe(rule)` nesting — outer
wraps inner, note (e)'s "guarantee wraps the whole unit" applied one level up). The Layer
composition for D-01's per-Rule/per-Scenario extra Layer slots into the existing
`Effect.provide(args.layer)` tail — `Layer.provideMerge(ambient)(extraLayer)` (per ADR-EC-010,
cited in CONTEXT.md) produces the single merged Layer this function already expects, so no new
`Effect.provide` call site is needed, just a richer value computed upstream (in
`describeFeature.ts` or `Runner.ts`) before it reaches this parameter.

**Constraint to preserve:** note (a)'s "bare `for` loop, no combinator" and note (b)'s "Layer
provided once, around everything" both apply unchanged to whatever two-`HookSet` extension is
made — do not introduce `Effect.forEach`/`Effect.all` for the Before/Rule-Before sequencing, and
do not move the Layer provision inside the loop.

**Testing pattern** (`test/ScenarioEffect.test.ts`) already exercises "three-failing-Before" and
"step-fails-and-After-fails" cases per notes (d)/(e) — a Rule-then-Feature equivalent test
(asserting the ORDER two `Before` batches from two sources ran in, and that both `After` batches
ran and both are recoverable by identity) is the direct extension of that file's existing style.

---

### `packages/vitest/src/Runner.ts` (controller, event-driven emission)

**Analog:** itself — the Rule-nesting loop (lines 263-282) is already implemented; this phase
only feeds it richer per-Rule inputs.

**Existing nesting to feed, not re-derive** (lines 266-282):
```typescript
for (const rule of plan.feature.rules) {
  api.describe(rule.name, () => {
    for (const scenario of rule.scenarios) {
      const scenarioPlan = planFor(scenario)
      api.effect(
        scenarioPlan.name,
        beforeAllScenariosCell === null
          ? () => buildScenarioEffect({ plan: scenarioPlan, layer, hooks })
          : () => Effect.flatMap(beforeAllScenariosCell, () => buildScenarioEffect({ plan: scenarioPlan, layer, hooks }))
      )
    }
  })
}
```
Per CONTEXT.md's explicit instruction, do **not** re-derive this `describe(rule.name, ...)`
structure. What changes is the `layer`/`hooks` arguments passed to `buildScenarioEffect` inside
this loop: instead of the Feature's flat `layer`/`hooks`, a Rule's own merged Layer and
Rule-scoped `HookSet` (however `describeFeature.ts` ends up keying them — by `rule.id` looked up
from a `Map`, following the exact `planById`/`planFor` precedent two lines above, lines 220-238)
must be threaded through for Scenarios inside this block, while the Feature-level loop above it
(lines 247-261) keeps using the Feature's own `layer`/`hooks` unchanged.

**D-03 (Outline row titling)** needs no code change here if the CONTEXT.md hypothesis holds:
`api.effect(scenarioPlan.name, ...)` (line 251, 271) already titles every emitted test with
`ScenarioPlan.name`, which note (d) (lines 69-74) already documents as "the INTERPOLATED Pickle
name" — verify against `Pickles.ts`/`Correlate.ts` whether `<placeholder>` tokens are already
substituted with EVERY column's value (not just the ones referenced in step text) before treating
this as a zero-code-change item; if a placeholder appears only in an Examples column no step
references, confirm `Pickle.name`'s interpolation still includes it.

---

### `packages/vitest/src/describeFeature.ts` (controller, composition root)

**Analog:** itself — the `Background`/`Scenario` container closures (lines 229-250) are the
direct template for a new `Rule` container, and `normalizeLayer` (lines 154-165) is the direct
template for merging a Rule's/Scenario's `extraLayer` with the ambient one.

**Container-closure pattern to copy** (lines 229-250):
```typescript
const dsl: FeatureDsl<any> = {
  ...scenarioDsl,
  Background: (defineBackground) => {
    registry.pushScope({ kind: "background", name: null })
    try {
      defineBackground(backgroundDsl)
    } finally {
      registry.popScope()
    }
  },
  Scenario: (name, defineScenario) => {
    registry.pushScope({ kind: "scenario", name })
    try {
      defineScenario(scenarioDsl)
    } finally {
      registry.popScope()
    }
  },
  Before: hookRegistrar("Before"),
  ...
}
```
A `Rule(name, extraLayer, defineRule)` member follows the identical
`pushScope`/`try`/`finally`/`popScope` shape, pushing `{ kind: "rule", name }` (Registry.ts's new
case) and handing `defineRule` a `RuleDsl<any>` built the same way `scenarioDsl`/`backgroundDsl`
are built just above (lines 218-227) — a fresh object of registrars closing over the SAME
`registry`/`hookRegistry` instances, per DSL-04's "one closure per `describeFeature` call, no
module state" discipline this file's own header (lines 178-187) already states for the Feature
level.

**Layer-merge pattern to copy** (lines 154-165, `normalizeLayer`):
```typescript
const normalizeLayer = (layer: LayerArgument): Layer.Layer<any, any, never> =>
  "perScenario" in layer ? Layer.merge(layer.shared, layer.perScenario) : layer
```
D-01's `Rule`/`Scenario` extra-Layer composition is a DIFFERENT combinator
(`Layer.provideMerge(ambient)(extraLayer)`, per ADR-EC-010, not `Layer.merge`) but the same
"compute the single Layer to hand downstream once, at the point the extra argument is captured"
placement — the merge happens where `Rule`/`Scenario` is called (closing over `extraLayer` and
the ambient `ROut`), not later in `Plan.ts` or `ScenarioEffect.ts`, mirroring how
`normalizeLayer` runs once in `collect` rather than being recomputed per Scenario.

**Hook-registrar pattern to copy for Rule-scoped hooks** (lines 214-216, `hookRegistrar`):
```typescript
const hookRegistrar = (kind: HookKind): HookRegistrar<any> => (fn) => {
  hookRegistry.register(kind, registerHook(kind, fn))
}
```
D-02's Rule-scoped `Before`/`After`/`BeforeStep`/`AfterStep` need this same normalisation
(`registerHook` delegating to `Step.ts`'s generator/Effect discriminator) but recorded into a
registry keyed or scoped by the enclosing Rule rather than the single flat `hookRegistry` this
file uses today — see the `HookRegistry.ts` entry below for the storage-side half of this.

---

### `packages/vitest/src/HookRegistry.ts` (model/store, CRUD) — implied by D-02

**Analog:** `packages/vitest/src/Registry.ts`'s scope stack (cross-file), since this file's own
header (lines 4-8) explicitly says it has NO scope concept today: *"Hooks are Feature-scoped
only... so `Registry.ts`'s whole scope stack... is dead weight on the hook path and is
deliberately not reproduced here."* D-02 (Rule-scoped hooks) makes that statement false, so this
file's own precedent is `Registry.ts`, not itself.

**Current shape to extend** (lines 79-103):
```typescript
export type HookDefinition<Fn> = {
  readonly kind: HookKind
  readonly body: Fn
}

export const createHookRegistry = <Fn>() => {
  const records: Array<HookDefinition<Fn>> = []
  const register = (kind: HookKind, body: Fn): void => { records.push({ kind, body }) }
  const hooks = (): ReadonlyArray<HookDefinition<Fn>> => [...records]
  return { register, hooks }
}
```
A Rule-scoped hook needs its own attribution, the same way `StepDefinition<Fn>` carries a
`scope: RegistryScope` (Registry.ts line 103). The minimal extension is adding a
`scope: RegistryScope | null` (or a narrower `ruleId: string | null`) field to `HookDefinition`
and threading the CURRENT scope through `register` the way `Registry.ts`'s `register` does
(line 174 — `records.push({ keyword, pattern, body, scope: currentScope(), definedAt })`), rather
than reintroducing a full parallel push/pop stack — the header's own words ("dead weight... is
deliberately not reproduced") argue for reading the CURRENT scope from `Registry.ts`'s existing
stack (already threaded through `describeFeature.ts`'s `collect`) rather than growing a second
independent stack here.

**Note this changes:** note (e) (lines 50-55, "why there is no `definedAt`") is about a
different field and stays true; the file's OWN opening claim (lines 4-8, hooks are
Feature-scoped only) is the one sentence that must be rewritten once this phase lands — same
"stale claim" hazard flagged for `Plan.ts` note (e) above.

---

### `packages/vitest/src/Hook.ts` (service, event-driven) — implied by D-02

**Analog:** itself — `runHookBatch`'s bare-`for`-loop-of-`yield*` shape (lines 174-194) is
unchanged in mechanism; what changes is which `HookSet` (Feature's vs. a Rule's) is passed to it
and in what order, at the `ScenarioEffect.ts` call site (see that entry above). No internal
change to this file is expected beyond `groupHooks` possibly being called twice (once per scope
level) instead of once — `groupHooks` itself (lines 114-159) is a pure partition and needs no
scope-awareness of its own, since scoping is handled by which flat list of definitions it is
handed.

**Pattern to preserve, unchanged** (lines 174-194):
```typescript
export const runHookBatch = (hooks: ReadonlyArray<HookBody>): Effect.Effect<void, unknown, any> =>
  Effect.gen(function*() {
    const failures: Array<Cause.Cause<unknown>> = []
    for (const hook of hooks) {
      const exit = yield* Effect.exit(hook())
      if (Exit.isFailure(exit)) failures.push(exit.cause)
    }
    if (failures.length === 0) return
    const combined = failures.reduce<Cause.Cause<unknown>>(
      (folded, cause) => Cause.combine(folded, cause), Cause.empty
    )
    return yield* Effect.failCause(combined)
  })
```
D-02/D-03's independence-and-combine semantics (note (g)) apply identically WITHIN one batch
(e.g. within a Rule's own `Before` hooks) — nothing here changes for that. What is new is calling
this function twice per gate (Feature `Before` batch, then Rule `Before` batch) at the
`ScenarioEffect.ts` call site rather than changing anything about how one batch runs.

---

### `packages/gherkin/src/Model.ts` (model, reference only — no modification expected)

**Analog:** itself — `ParsedRule` and `StepOwner`'s `"rule-background"` member are already
complete since Phase 2; this phase's job is to give the vitest package's DSL a way to REGISTER
against data this file already models, not to change this file.

**Data already available, to be read (not re-derived) by Registry.ts/Plan.ts/Dsl.ts:**
```typescript
// lines 54: the origin discriminant a rule-scoped Background's steps already carry
export type StepOwner = "feature-background" | "rule-background" | "scenario"

// lines 117-151: ParsedScenario.ruleId — Option.Option<string>, already present per-Scenario
readonly ruleId: Option.Option<string>

// lines 156-165: ParsedRule — a Rule's own tags/scenarios, already modeled
export interface ParsedRule {
  readonly id: string
  readonly name: string
  readonly keyword: string
  readonly tags: ReadonlyArray<string>
  readonly location: Location
  readonly description: string
  readonly scenarios: ReadonlyArray<ParsedScenario>
}
```
`Plan.ts`'s new `"rule"` case in `isVisibleTo` compares against `scenario.ruleId` (via
`Option.getOrNull`/`Option.match`, following this package's existing `Option` idiom — see
`Plan.ts`'s own `import * as Option from "effect/Option"` at line 125) and against `ParsedRule.id`
(never `.name`, mirroring `Plan.ts` note (c)'s `astName`-not-`name` argument in spirit: an id is
stable, a name is merely what the author wrote and two Rules COULD in principle share one,
though `Validate.ts` may already forbid that — check before assuming uniqueness).

## Shared Patterns

### Scope-stack discipline (DSL-04)
**Source:** `packages/vitest/src/Registry.ts`'s `createRegistry` (lines 126-182), doc-comment
note (a) (lines 4-21)
**Apply to:** `Registry.ts`'s new `rule` case, `HookRegistry.ts`'s Rule-aware extension,
`describeFeature.ts`'s new `Rule` container closure.
```typescript
// One closure per describeFeature call. No module-level `let`, no exported mutable registry.
export const createRegistry = <Fn>(featureName: string) => {
  const stack: Array<RegistryScope> = [{ kind: "feature", name: featureName }]
  ...
  const pushScope = (scope: RegistryScope): void => { stack.push(scope) }
  const popScope = (): void => { /* throws on underflow, never silently tolerates it */ }
  ...
}
```

### try/finally push-pop around a container callback
**Source:** `packages/vitest/src/describeFeature.ts` lines 231-250
**Apply to:** the new `Rule` container in `describeFeature.ts`.
```typescript
registry.pushScope({ kind: "background", name: null })
try {
  defineBackground(backgroundDsl)
} finally {
  registry.popScope()
}
```
The `finally` is load-bearing: a `defineRule` callback that throws must not leave the scope
stack unbalanced and re-parent every step registered after it.

### Level-precedence resolution (ARCHITECTURE.md Pattern 5)
**Source:** `packages/vitest/src/Plan.ts`'s `isVisibleTo` + `scopeRank` (lines 442-464)
**Apply to:** the new `rule` case in both functions.
```typescript
const scopeRank = (kind: RegistryScopeKind): number => kind === "feature" ? 1 : 0
// becomes a three-value rank: scenario/rule-background innermost (0), rule (1), feature (2) —
// "an INNER registration shadows an outer one; two matches at the SAME level is the ambiguity"
```

### Guarantee wraps the whole unit, outer-to-inner (Phase 7 D-05/D-06, this phase's D-02)
**Source:** `packages/vitest/src/ScenarioEffect.ts` lines 76-110 (notes d/e/f), `buildScenarioEffect`
**Apply to:** Feature-then-Rule `Before` ordering and Rule-then-Feature `After` ordering.
```typescript
yield* runHookBatch(args.hooks.Before)   // gate: one yield*, structural short-circuit
...
.pipe(
  Effect.onExit(() => runHookBatch(args.hooks.After)),  // outer guarantee wraps the whole unit
  Effect.provide(args.layer)
)
```
Applied one level up: Feature `Before` then Rule `Before` (outer-to-inner setup), Rule `After`
then Feature `After` (inner-to-outer teardown, same as `describe(feature) → describe(rule)`
nesting unwinding symmetrically).

### Internal-stage, not-re-exported convention
**Source:** every one of Registry.ts, Plan.ts, HookRegistry.ts, Hook.ts, ScenarioEffect.ts,
Runner.ts's own closing doc-comment paragraphs (each states it is not in
`packages/vitest/src/index.ts`'s barrel)
**Apply to:** `RuleDsl` — reached only through `FeatureDsl.Rule`, never added to `index.ts`
directly, per CONTEXT.md's own Integration Points note.

## No Analog Found

`packages/vitest/src/OutlineTitle.ts` (08-04) — a genuinely new module with no existing analog in
either package: no prior code walks the raw `GherkinDocument` AST to read Examples column names and
per-row values (`ParsedScenario`/`ScenarioPlan` do not carry them). Its house-style precedent is
`packages/vitest/src/CallSite.ts` — a small, dependency-light, well-documented internal module not
re-exported from `index.ts` — which 08-04 cites directly rather than relying on this document.

Otherwise: none. Every other file this phase touches is extending its own existing three-level (or
two-level, for `HookRegistry.ts`) dispatch to a fourth (or a first) level, using a pattern already
present elsewhere in the same file or in `Registry.ts`. There is no other genuinely novel mechanism
this phase introduces — ADR-EC-010's Layer composition (`Layer.provideMerge`) is new API usage but
composes into existing call sites (`describeFeature.ts`'s `normalizeLayer`, `ScenarioEffect.ts`'s
`Effect.provide` tail) rather than requiring a new architectural shape.

## Metadata

**Analog search scope:** `packages/vitest/src/*.ts`, `packages/vitest/test/*.ts`,
`packages/gherkin/src/Model.ts`
**Files scanned:** 12 source files, 2 test files (Registry.test.ts, Plan.test.ts) opened for
concrete excerpts; describeFeature.test.ts, Hook.test.ts, HookRegistry.test.ts,
ScenarioEffect.test.ts, Runner.test.ts identified by name as the test-file analogs for their
respective source files but not opened (their existing per-file testing conventions are already
evident from the source files' own doc comments, which name the specific test files and
assertions that would go red under each documented pitfall).
**Pattern extraction date:** 2026-08-29

# Phase 7: Hooks - Pattern Map

**Mapped:** 2026-08-29
**Files analyzed:** 16 (9 source, 7 test/fixture)
**Analogs found:** 15 / 16

No `07-RESEARCH.md` exists (research skipped per roadmap, consistent with Phases 1/3/4/6), so this
document is the planner's **only** source of concrete code to copy from. Every excerpt below was read
out of the live tree at map time — line numbers are current as of this commit.

One finding in [Verified API Constraints](#verified-api-constraints) is load-bearing enough that the
planner must read it before assigning D-03/D-05/D-06 to a plan: **`Effect.ensuring` cannot express
this phase's combine-don't-mask requirement.** BEH-EC-006 names `ensuring` literally; the installed
build's type says its finalizer's error channel is `never`.

---

## File Classification

| New/Modified File | New? | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|------|-----------|----------------|---------------|
| `packages/vitest/src/Hook.ts` | NEW | utility (normalization seam) | transform | `packages/vitest/src/Step.ts` | **exact** |
| `packages/vitest/src/HookRegistry.ts` | NEW | store (per-call factory) | CRUD (append + snapshot) | `packages/vitest/src/Registry.ts` | **exact** |
| `packages/vitest/src/Dsl.ts` | modified | config (compile-time type surface) | request-response (registration) | `StepRegistrar<ROut>` in same file, L94-110 | **exact** |
| `packages/vitest/src/Errors.ts` | modified | model (typed failure) | transform | `StepMatchError` in same file, L145-158 | **exact** |
| `packages/vitest/src/ScenarioEffect.ts` | modified | service (Effect composition) | sequential pipeline | itself, L132-155 | **exact** (self) |
| `packages/vitest/src/describeFeature.ts` | modified | controller (composition root) | request-response | `registrar()` + `dsl` literal, L172-216 | **exact** |
| `packages/vitest/src/Runner.ts` | modified | controller (emission walk) | event-driven | itself, L132-189 | **exact** (self) |
| `packages/vitest/src/TestApi.ts` | modified *(conditional — see D-08 note)* | config (injected seam) | request-response | itself, L66-94 | **exact** (self) |
| `packages/vitest/src/index.ts` | modified | config (barrel) | — | itself, L69-102 | **exact** (self) |
| `packages/vitest/test/Hook.test.ts` | NEW | test | transform | `packages/vitest/test/Step.test.ts` | **exact** |
| `packages/vitest/test/HookRegistry.test.ts` | NEW | test | CRUD | `packages/vitest/test/Registry.test.ts` | **exact** |
| `packages/vitest/test/ScenarioEffect.test.ts` | modified | test | sequential pipeline | itself, L70-148 fixtures | **exact** (self) |
| `packages/vitest/test/Runner.test.ts` | modified | test | event-driven | `makeRecordingApi`, L105-172 | **exact** (self) |
| `packages/vitest/test/describeFeature.test.ts` | modified | test | request-response | itself | **exact** (self) |
| `packages/vitest/test/Errors.test.ts` | modified | test | transform | itself | **exact** (self) |
| `packages/vitest/test/tsgo-gate/src/hook-*.ts` + tsconfigs | NEW | test fixture | — | `test/tsgo-gate/src/step-satisfied.ts` + `step-missing-service.ts` | **role-match** |

---

## Pattern Assignments

### `packages/vitest/src/Hook.ts` (NEW — utility, transform)

**Analog:** `packages/vitest/src/Step.ts` (86 lines — read it whole; it is the closest thing in the
repo to what this file must be).

CONTEXT.md's code_context says hook bodies "should reuse rather than duplicate" `isGeneratorFn`.
`isGeneratorFn` is currently **module-private** (`Step.ts:58`, no `export`), so reuse means either
exporting it from `Step.ts` or having `Hook.ts` call `Step.ts`'s `register` with the hook name in
the `pattern` position. The second is strictly less code and needs no edit to `Step.ts` at all —
`register`'s `pattern` parameter is used for exactly one thing, `Effect.fn(pattern)`, and ADR-EC-005
says a hook's span name is its own name. Prefer it unless the planner finds a mechanical reason not to.

**The discriminator** (`Step.ts:58-63`) — the whole reason this seam exists:

```typescript
const isGeneratorFn = <Params extends ReadonlyArray<any>, A, E, R>(
  f:
    | ((...p: Params) => Effect.gen.Return<A, E, R>)
    | ((...p: Params) => Effect.Effect<A, E, R>)
): f is (...p: Params) => Effect.gen.Return<A, E, R> =>
  Object.prototype.toString.call(f) === "[object GeneratorFunction]"
```

**The normalization** (`Step.ts:78-86`) — the shape a `registerHook(name, fn)` must copy:

```typescript
export const register = <Params extends ReadonlyArray<any>, A, E, R>(
  pattern: string,
  fn:
    | ((...p: Params) => Effect.gen.Return<A, E, R>)
    | ((...p: Params) => Effect.Effect<A, E, R>)
): (...p: Params) => Effect.Effect<A, E, R> =>
  // Do NOT simplify this to an unconditional wrap. It type-checks — that is precisely the trap
  // (note (a)) — and it double-spans every step an author already wrapped themselves.
  isGeneratorFn(fn) ? Effect.fn(pattern)(fn) : fn
```

**Constraints carried over verbatim:**
- The **generator branch is listed FIRST** in both union positions. `Step.ts` note (b) (L23-32) and
  `Dsl.ts` note (a) (L20-30) both say the order is load-bearing and both say "if you change one,
  change the other" — a third copy in `Hook.ts` inherits the same obligation and needs the same note.
- Explicit return annotation is **required**, not stylistic: `composite: true` demands it for
  declaration emit on anything exported (`Step.ts:72-73`).
- The wrap carries **only** the hook name — no span attributes. ADR-EC-005's Consequences section
  explicitly accepts that `BeforeStep`/`AfterStep` get one span per *definition*, not per invocation,
  and that a hook author wanting the step text must call `Effect.annotateCurrentSpan` themselves.
- Hooks take **no parameters** (`Params` is `[]`), unlike steps. `BeforeStep`/`AfterStep` do NOT
  receive the step — see ADR-EC-005's Negative consequence, which is the decision that made that
  true. Do not invent a `(step) => …` signature.

---

### `packages/vitest/src/HookRegistry.ts` (NEW — store, CRUD)

**Analog:** `packages/vitest/src/Registry.ts` (188 lines), structure for structure.

CONTEXT.md leaves "extend `Registry.ts` or add a sibling" open. Both preserve the discipline; the
sibling is cheaper because hooks have **no scope stack** (Feature-scoped only, per the phase boundary
— "There is no Rule-scoped hook narrowing in this roadmap"), so half of `createRegistry` would be
dead weight on the hook path.

**The factory shape** (`Registry.ts:126-182`) — closure state, no module state:

```typescript
export const createRegistry = <Fn>(featureName: string) => {
  const stack: Array<RegistryScope> = [{ kind: "feature", name: featureName }]
  const records: Array<StepDefinition<Fn>> = []
  // …
  const register = (keyword: StepKeyword, pattern: string, body: Fn, definedAt: DefinitionSite | null): void => {
    records.push({ keyword, pattern, body, scope: currentScope(), definedAt })
  }

  /** A snapshot — see note (b). Never the live array. */
  const definitions = (): ReadonlyArray<StepDefinition<Fn>> => [...records]

  return { pushScope, popScope, currentScope, register, definitions }
}
```

**The derived shape type** (`Registry.ts:184-188`) — hand-writing the shape is the anti-pattern:

```typescript
/**
 * Derived from the factory rather than hand-written, following `ParameterTypeStoreShape`'s
 * precedent, so the shape and the thing it describes cannot drift apart.
 */
export type RegistryShape<Fn> = ReturnType<typeof createRegistry<Fn>>
```

**Constraints carried over verbatim:**
- **`Fn` stays a free type parameter and this module imports nothing** (`Registry.ts` note (c),
  L33-44 — "an acceptance criterion asserts the count is zero"). A `HookRegistry.ts` that imports
  `Dsl.ts` or `Plan.ts` breaks the precedent it is copying.
- **The snapshot copy is mandatory** (note (b), L23-31). `definitions()` returning the live array is
  invisible to every content assertion.
- **Registration order is the run order** (D-01). `records.push` + `[...records]` already gives
  that for free; there must be no sort anywhere on the hook path.
- **Not re-exported from the barrel** (note (d), L45-52) — "a registry is an internal stage of
  `describeFeature`".
- `DefinitionSite | null` is a **parameter**, never captured inside the registry (`Registry.ts`
  L166-176). The capture belongs to the registrar in `describeFeature.ts`. Hooks want a
  `definedAt` too — a combined hook failure (D-03) that cannot say *which* two `Before` hooks failed
  is exactly the "richest option" the user asked for and would be missing.

**A string-literal union, not an enum** (`Registry.ts:54-58`), for `HookKind`:

```typescript
/**
 * The three Gherkin constructs that can own step definitions. A string-literal union rather than
 * an enum: `erasableSyntaxOnly` is on workspace-wide, and an enum emits runtime code.
 */
export type RegistryScopeKind = "feature" | "background" | "scenario"
```

→ `export type HookKind = "Before" | "After" | "BeforeStep" | "AfterStep" | "BeforeAllScenarios" | "AfterAllScenarios"`

---

### `packages/vitest/src/Dsl.ts` (modified — config, request-response)

**Analog:** `StepRegistrar<ROut>` and `FeatureDsl<ROut>` in the same file.

**The registrar interface** (`Dsl.ts:87-110`) — a callable *interface*, not a type alias, and the
reason is note (e):

```typescript
/**
 * One step keyword — `Given`, `When`, `Then`, `And` or `But` — as the test author calls it.
 *
 * A callable interface rather than a type alias for a function, so the call signature can be
 * generic per CALL SITE in `Params`/`A`/`E` while `ROut` stays fixed by the enclosing
 * `describeFeature` — note (e).
 */
export interface StepRegistrar<ROut> {
  <Params extends ReadonlyArray<any>, A, E>(
    pattern: string,
    fn:
      | ((...p: Params) => Effect.gen.Return<A, E, ROut | Scope.Scope>)
      | ((...p: Params) => Effect.Effect<A, E, ROut | Scope.Scope>)
  ): void
}
```

**The `HookRegistrar<ROut>` this maps to** — same skeleton, minus `pattern` and minus `Params`:

```typescript
export interface HookRegistrar<ROut> {
  <A, E>(
    fn:
      | (() => Effect.gen.Return<A, E, ROut | Scope.Scope>)
      | (() => Effect.Effect<A, E, ROut | Scope.Scope>)
  ): void
}
```

**The container interface members** (`Dsl.ts:119-130`) — the shape the six new `FeatureDsl` members copy:

```typescript
export interface ScenarioDsl<ROut> {
  /** Register a `Given` step definition. */
  readonly Given: StepRegistrar<ROut>
  /** Register a `When` step definition. */
  readonly When: StepRegistrar<ROut>
  // …
}
```

**Constraints carried over verbatim — every one of these has a silent failure mode:**
- **Generator branch FIRST**, both members spelled out (note (a), L20-30). Reordering still rejects
  the bad case, so no test goes red — it just stops `@effect/tsgo`'s `effect(missingEffectContext)`
  from firing. `test/tsgo-gate/` is the behavioral proof, and this phase must add a hook fixture there
  (see below) or the gate silently does not cover the new surface.
- **`Scope.Scope` on the required-context position only**, spelled out on BOTH union members rather
  than factored into an alias (note (b), L31-50). The alias measurably degrades the `TS2345` chain.
- **`R` is bound to `ROut` through `HookRegistrar<ROut>`, never a free type parameter of the call
  signature** (note (e), L67-72). CONTEXT.md's canonical_refs says note (e)'s reasoning "applies to
  hooks too" — a per-call-site `R` would infer to whatever the hook body needs and constrain nothing.
- **The one `any` in `ReadonlyArray<any>` is the only `any` permitted in this module** (note (d),
  L58-65). A hook registrar with no `Params` may not need even that one.
- **This module is types only — no `const`, no function, no runtime value** (L74-76). Both imports
  are `import type`. `dist/Dsl.js` must stay empty.
- **`FeatureDsl` only.** The phase boundary is explicit: hooks are Feature-scoped. Do **not** add
  hook members to `ScenarioDsl` or `BackgroundDsl`. Note that `FeatureDsl extends ScenarioDsl`
  (`Dsl.ts:153`), so a hook member placed on `ScenarioDsl` would silently leak into every
  `Scenario(...)` container callback.

---

### `packages/vitest/src/Errors.ts` (modified — model, transform)

**Analog:** `StepMatchError` (`Errors.ts:145-158`) and `makeUnusedStepDefinitionWarning`
(`Errors.ts:209-226`) in the same file. CONTEXT.md's code_context names this house style directly:
"Named/discriminated error types with full untruncated content … is this codebase's house style for
anything a reporter needs to render — the 'combined failure' decisions (D-03, D-06) should follow it
rather than inventing a bespoke shape."

**The error class shape** (`Errors.ts:145-158`):

```typescript
export class StepMatchError extends Schema.TaggedError<StepMatchError>()("StepMatchError", {
  reason: Schema.Literals([
    "UndefinedStep",
    "AmbiguousStep"
  ]),
  uri: Schema.String,
  line: Schema.OptionFromUndefinedOr(Schema.Number),
  stepText: Schema.String,
  scenarioName: Schema.String,
  matchedPatterns: Schema.Array(Schema.String),
  suggestion: Schema.OptionFromUndefinedOr(Schema.String),
  message: Schema.String,
  cause: Schema.OptionFromUndefinedOr(Schema.Unknown)
}) {}
```

**The factory-beside-the-class split** (`Errors.ts:209-226`) — required, because constraint 4 below
forbids a custom constructor:

```typescript
export const makeUnusedStepDefinitionWarning = (args: {
  reason: UnusedStepDefinitionWarningReason
  featureName: string
  // …
  definedAt?: string
  message: string
}): UnusedStepDefinitionWarning => ({
  _tag: "UnusedStepDefinitionWarning",
  reason: args.reason,
  // …
  definedAt: Option.fromUndefinedOr(args.definedAt),
  message: args.message
})
```

**The four `effect@4.0.0-rc.112` constraints** (`Errors.ts` note (b), L36-54) — already discovered
and verified against the installed build. Restated here because a `HookError` will hit all four:

1. `Schema.Literals([...])` — the **plural, array** form. The variadic `Schema.Literal(a, b)` throws
   a schema validation error inside a `Schema.TaggedError` field in this build.
2. `Schema.Defect`, bare or wrapped in `Schema.optional`, throws at construction time inside
   `SchemaAST.js`. Use `Schema.OptionFromUndefinedOr(Schema.Unknown)` for `cause`.
3. Every optional field is `Schema.OptionFromUndefinedOr`, a **transformation**; the constructor
   validates the Type side, so **every construction site must pass an explicit `Option.some(x)` /
   `Option.none()`**. Omitting the key fails construction outright.
4. **No custom constructor.** `@effect/tsgo`'s `overriddenSchemaConstructor` rejects any override on
   a `Schema.TaggedError` subclass. Plain-optional-argument wrapping goes in a factory.

**Also carried over:**
- **Message content is NEVER truncated** (note (d), L72-80) — no ellipsis, no slice, no max length.
  `test/Errors.test.ts` asserts an exact `message.length` so a truncation step reintroduced anywhere
  on the construction path fails rather than passing a substring check.
- **This module has no local imports** (note (e), L82-85) — only `effect/Option` and `effect/Schema`.
  A `definedAt` arrives **already formatted** as a string. Keep it that way for hooks.
- **The `*Reason` one-member-union precedent** (`Errors.ts:160-168`): a one-member union rather than
  a bare literal, so the discriminant reads the same at every call site and widening it is a local edit.

---

### `packages/vitest/src/ScenarioEffect.ts` (modified — service, sequential pipeline)

**Analog:** itself. This is the file where `Before`/`After`/`BeforeStep`/`AfterStep` get woven in,
and CONTEXT.md is explicit that its notes (a) and (b) "are the patterns D-04/D-05 must preserve, not
work around."

**The whole current body** (`ScenarioEffect.ts:132-155`) — this is what gets extended:

```typescript
export const buildScenarioEffect = (
  args: {
    readonly plan: ScenarioPlan
    readonly layer: Layer.Layer<any, any, never>
  }
): Effect.Effect<void, unknown, Scope.Scope> =>
  Effect.gen(function*() {
    // A loop of `yield*` inside ONE generator, and not a combinator over the list: the short-circuit
    // below is the absence of a next iteration, not a check anyone maintains. Note (a).
    for (const planned of args.plan.steps) {
      if (isUnresolved(planned)) {
        // In position, after the steps before it have already run. Note (c).
        return yield* Effect.fail(planned.error)
      }
      // Called, never re-wrapped: `Step.ts`'s `register` normalised this body at registration time
      // (ADR-EC-005), and wrapping it again is not a compile error and not a test failure — it is a
      // duplicated span, which only `Step.ts`'s reference-identity assertion can see.
      yield* planned.step.body(...planned.step.args)
    }
    // The success value is discarded on purpose. A Scenario's result is that it finished.
  }).pipe(Effect.provide(args.layer))
```

**The type-predicate-for-`_tag` idiom** (`ScenarioEffect.ts:105-108`) — forced by oxlint, and any
new hook-record narrowing will need the same shape:

```typescript
const isUnresolved = (planned: PlannedStep): planned is UnresolvedPlannedStep => {
  const { _tag } = planned
  return _tag === "Unresolved"
}
```

> oxlint's `no-underscore-dangle` rejects reading a leading-underscore property through member access
> while permitting object destructuring, and destructuring alone does not NARROW — so the check has
> to be lifted into a predicate with a named type to narrow to (`ScenarioEffect.ts:95-104`).

**Constraints carried over verbatim:**
- **The bare `for` loop of `yield*` IS the invariant** (note (a), L29-47). `Effect.forEach` is the
  named forbidden tidy-up; `Effect.all` over a pre-built array is worse. D-04's Before-batch gating
  and the per-step `BeforeStep`/step/`AfterStep` unit must be written as more `yield*`s in the same
  generator, **not** as a combinator over the step list.
- **Nothing re-tags or re-wraps a step's error** (note (a), L44-47): "a step's error must reach the
  Scenario's error channel as the value the step failed with, because that value is what the reporter
  prints." D-06 combines *causes*, and combining is not the same as re-tagging — the step's own error
  value must still be findable in the combined cause.
- **The Layer is provided ONCE, around the whole composed Effect** (note (b), L49-63). Every hook,
  `Before` included, runs inside that single `Effect.provide` — moving provision anywhere else
  type-checks and silently gives each hook its own `World`.
- **`Effect.provide` stays the last `.pipe`** so the returned Effect requires only `Scope.Scope`,
  which is exactly what `TestApi.effect` declares.
- **The result is UNEXECUTED** and `Runner.ts` passes it as a thunk. Any `BeforeAllScenarios` sharing
  mechanism must not force eager execution at compose time.
- **The three `any`s in `Layer.Layer<any, any, never>`** are erased detail; the identical declaration
  appears in `describeFeature.ts:112` and `Runner.ts:136`. "If one of the two declarations is ever
  narrowed, narrow both."

---

### `packages/vitest/src/describeFeature.ts` (modified — controller, composition root)

**Analog:** the `registrar` closure and the `dsl` object literal in the same file.

**The registrar closure** (`describeFeature.ts:172-181`) — the exact shape a `hookRegistrar` copies:

```typescript
const registrar = (keyword: StepKeyword): StepRegistrar<any> => (pattern, fn) => {
  // The `captureCallSite` call below MUST stay INSIDE this arrow — the one a test author calls as
  // `Given`/`When`/`Then`/`And`/`But`. An extra helper frame between the arrow and the capture is
  // fine, because frame selection is by directory and not by a frame count (CallSite.ts note (a)),
  // but hoisting the call to a `const` in `collect`'s body or to module scope is not: it would
  // then run from THIS file's frame and record this module's own line for every step in every
  // suite.
  registry.register(keyword, pattern, register(pattern, fn), captureCallSite())
}
```

→ `const hookRegistrar = (kind: HookKind): HookRegistrar<any> => (fn) => { hooks.register(kind, registerHook(kind, fn), captureCallSite()) }`

**The dsl assembly** (`describeFeature.ts:183-216`) — where the six members land:

```typescript
const scenarioDsl: ScenarioDsl<any> = {
  Given: registrar("Given"),
  When: registrar("When"),
  // …
}

// ADR-EC-017: a Background gets `Given` and `And` only. The omission is the contract, not a gap.
const backgroundDsl: BackgroundDsl<any> = { Given: scenarioDsl.Given, And: scenarioDsl.And }

const dsl: FeatureDsl<any> = {
  ...scenarioDsl,
  Background: (defineBackground) => {
    registry.pushScope({ kind: "background", name: null })
    try {
      defineBackground(backgroundDsl)
    } finally {
      // `finally`, so a define callback that throws cannot leave the stack unbalanced and
      // re-parent every step registered after it onto a scope the document does not have.
      registry.popScope()
    }
  },
  Scenario: (name, defineScenario) => { /* … */ }
}
```

The six hook registrars are siblings of `Background`/`Scenario` in this literal — **not** spread into
`scenarioDsl`, because `scenarioDsl` is also handed to every `Scenario(...)` callback.

**The one-registry-per-invocation line** (`describeFeature.ts:162-165`) — the hook registry is
created right beside it:

```typescript
// ONE fresh registry per invocation, built here and never hoisted to module scope or memoised.
// Registry.ts note (a) has the full argument; the short version is that a shared registry makes
// two Features in one file resolve each other's steps, and no content assertion can see it.
const registry = createRegistry<StepBody>(feature.name)
```

**The collection return** (`describeFeature.ts:227-232`) — hooks must reach `FeatureCollection` so
`collectFeature` can assert on them without a runner:

```typescript
return {
  feature,
  layer: normalizeLayer(layer),
  definitions,
  plan: planFeature({ feature, definitions })
}
```

**Constraints carried over verbatim:**
- `collect` is the **one shared implementation** both `describeFeature` and `collectFeature` delegate
  to, and it exists "precisely so the two public entry points cannot drift into two behaviours"
  (L151-156, and L222-226 on why planning happens here). Hook collection goes in `collect`.
- **This file is the ONLY module under `packages/vitest/src` permitted to import a test framework**
  (note (e), L57-73) — `import { describe, it } from "@effect/vitest"` (L79). If
  `BeforeAllScenarios`/`AfterAllScenarios` need a native `beforeAll`/`afterAll`, the concrete value is
  constructed **here**, at L135, and reaches `Runner.ts` only through the `TestApi` object:
  ```typescript
  const vitestTestApi: TestApi = { describe, effect: it.effect }
  ```
- **The `try`/`finally` discipline** on any container that pushes state (L200-206).
- **`describeFeature` and `collectFeature` are `function` declarations, not arrow consts**, solely
  because an arrow const cannot carry overload signatures (note (b), L39-42).
- **`define` returns `void`, never `void | Promise<void>`** (note (c), L44-48).

---

### `packages/vitest/src/Runner.ts` (modified — controller, event-driven)

**Analog:** itself. `emitFeature` is the only place that knows a Feature has N Scenarios, which makes
it the natural home for whatever shares one `BeforeAllScenarios` result across all of them (D-08).

**The emission walk** (`Runner.ts:164-188`):

```typescript
api.describe(plan.feature.name, () => {
  // Feature-level Scenarios first, in the order the document has them.
  for (const scenario of plan.feature.scenarios) {
    const scenarioPlan = planFor(scenario)
    api.effect(scenarioPlan.name, () => buildScenarioEffect({ plan: scenarioPlan, layer }))
  }

  // Then the Rules, each opening its own nested block. Written out rather than shared with the
  // loop above, because the two are the same three lines at two different nesting depths and the
  // shared helper hides the one property that matters here: which block the node lands in.
  for (const rule of plan.feature.rules) {
    api.describe(rule.name, () => {
      for (const scenario of rule.scenarios) {
        const scenarioPlan = planFor(scenario)
        api.effect(scenarioPlan.name, () => buildScenarioEffect({ plan: scenarioPlan, layer }))
      }
    })
  }

  // Last, and always passing — note (c). Reversing this to put the warnings first pushes the
  // Feature's own Scenarios off the top of the block.
  for (const warning of plan.warnings) {
    api.effect(warningTitle(warning), () => Effect.void)
  }
})
```

**The impossible-state throw** (`Runner.ts:149-162`) — the house form for a state that cannot happen:

```typescript
const planFor = (scenario: ParsedScenario): ScenarioPlan => {
  const found = planById.get(scenario.id)
  if (found === undefined) {
    // Unreachable by construction — `planFeature` maps `feature.allScenarios`, which is the union
    // of the two arrays this walk reads. Thrown with an explanation rather than silenced with a
    // non-null assertion, so the day it does happen the message names where to look.
    throw new Error(
      `emitFeature: no ScenarioPlan for scenario id ${JSON.stringify(scenario.id)} (…). This is a bug in Plan.ts or in Runner.ts, not in the .feature file.`
    )
  }
  return found
}
```

The same form appears at `Registry.ts:136-141` — "`Registry.ts`'s preferred shape for an impossible
state, and the reason there is no `!` anywhere in this file under `noUncheckedIndexedAccess`."

**Constraints carried over verbatim:**
- **No import from `vitest`, or from the `@effect` package wrapping it — not even an `import type`,
  and not even a mention in a comment** (note (a), L18-36). "Neither name is written out anywhere in
  this file, comments included, because the acceptance grep that enforces the rule cannot tell a
  citation from an import." Whatever mechanism `BeforeAllScenarios` uses must obey this.
- **`buildScenarioEffect` is called inside a THUNK, never eagerly** (note (b), L38-44). A
  `BeforeAllScenarios` composed eagerly at emit time would move Layer construction into collection.
- **Emission order is document order and is never sorted.** `AfterAllScenarios` running "always"
  (D-09) is a *runtime* guarantee inside the Effects, not a reordering of emitted nodes.
- **Titles: `ScenarioPlan.name`, never `astName`** (note (d), L69-75), and pattern text is rendered
  with `JSON.stringify` while Feature/Rule/Scenario names are deliberately NOT escaped (note (c)).

---

### `packages/vitest/src/TestApi.ts` (modified, conditional — config, request-response)

**Analog:** itself. CONTEXT.md leaves it open whether this file gains a member. There are two
precedents here pointing in **opposite** directions, and the planner must pick deliberately.

**The current surface** (`TestApi.ts:66-94`):

```typescript
export interface TestApi {
  readonly describe: (name: string, define: () => void) => void
  readonly effect: (name: string, self: () => Effect.Effect<void, unknown, Scope.Scope>) => void
}
```

**Precedent AGAINST adding a member** — note (b) (L27-34), the "omission by decision" argument:

> **`skip` and `only` are deliberately absent.** `@effect/vitest`'s `Tester` has both, and
> ARCHITECTURE.md's Pattern 3 sketch shows both, but nothing in Phase 6 calls either… Declaring them
> now would put unreachable surface into the contract and force 06-06's recording fake to implement
> two members no assertion covers, **which is how a fake starts drifting from the thing it fakes.**

**Precedent FOR adding one** — the same note's converse: the seam exists so `Runner.ts` can reach a
framework capability without importing one. If `BeforeAllScenarios` genuinely needs `beforeAll`, the
member belongs here and the fake in `test/Runner.test.ts:127-148` grows with it.

**CONTEXT.md D-08 already leans toward NOT extending it:** "it's the mechanically natural fit given
`TestApi`'s `describe`/`effect`-only surface — `BeforeAllScenarios` is computed once and shared (e.g.
via a `Deferred`) across every Scenario's Effect, so a failure there necessarily surfaces wherever a
Scenario awaits it." That path needs **zero** change to this file. See
[Verified API Constraints](#verified-api-constraints) for the primitives that make it work.

**Constraints if it IS extended:**
- Types only — no `const`, no function, no runtime value; both imports are `import type` (L50-53).
- **`Scope.Scope` appears ONLY in the Effect's required-context position, never hoisted onto
  `TestApi` itself** (note (d), L40-48).
- **`define` returns `void`, never `void | Promise<void>`** (note (c)).
- Not re-exported from the barrel (L55-58).

---

### `packages/vitest/src/index.ts` (modified — config, barrel)

**Analog:** itself, L69-102.

**What gets added** — the hook DSL types travel with the existing `Dsl.ts` type export (`index.ts:80`):

```typescript
export type { BackgroundDsl, FeatureDsl, ScenarioDsl, StepRegistrar } from "./Dsl.ts"
```

CONTEXT.md's Integration Points is explicit: "hooks are exported alongside `Given`/`When`/`Then` from
the `FeatureDsl`/`ScenarioDsl` surface the DSL already publishes; **no new top-level exports
expected** (no module-level `Before`/`After` functions)." So: add `HookRegistrar` to the `Dsl.ts`
type line, add any new hook error class to the `Errors.ts` value line (L101), and nothing else.

**What must NOT be added** — the "Deliberately NOT exported" block (L50-66) already names the class
of thing a hook registry and a hook normalizer are:

> `createRegistry` (and its `Registry`/`StepDefinition` types), `register` from `Step.ts`… Every one
> of them is an internal stage of `describeFeature` with no standalone consumer contract… The
> omission is a decision, not an oversight, and the cost of getting it wrong is asymmetric.

**Also update:** the "Current state" / "What is NOT built yet" prose at L24-42 names hooks as Phase 7
by ID (`DSL-07`, `RUN-02`). That paragraph is a live status document and goes stale the moment this
phase lands.

---

### `packages/vitest/test/Hook.test.ts` (NEW — test, transform)

**Analog:** `packages/vitest/test/Step.test.ts` (122 lines — read whole).

**The two load-bearing assertion styles** (`Step.test.ts:59-105`):

```typescript
describe("an already-wrapped step function is accepted unchanged", () => {
  it("comes back as the identical reference, not a re-wrap", () => {
    const stepText = "I wrapped this step myself"
    const alreadyWrapped = Effect.fn(stepText)(function*(n: number) { /* … */ })

    // THE load-bearing assertion of this file. Reference identity, and nothing weaker: a structural
    // comparison, a `typeof === "function"` check, or asserting the result behaves the same all pass
    // against an implementation that re-wraps — which is the actual defect.
    expect(register(stepText, alreadyWrapped)).toBe(alreadyWrapped)
  })
})

it.effect("makes the step text observable as the span name", () =>
  Effect.gen(function*() {
    const stepText = "I am observable in a failure's trace"
    const wrapped = register(stepText, function*() {
      return (yield* Effect.currentSpan).name
    })
    // Read from the ACTIVE span inside the running body. Asserting on the returned function's own
    // `.name` would pass against an implementation that never calls `Effect.fn`, making this test
    // vacuous; mutation B is the demonstration that it is not.
    assert.strictEqual(yield* wrapped(), stepText)
  }))
```

For hooks the span name assertion becomes `assert.strictEqual(yield* wrapped(), "Before")` — ADR-EC-005
says the hook's own name.

**The Exit-not-try/catch failure assertion** (`Step.test.ts:108-122`):

```typescript
const exit = yield* Effect.exit(wrapped())
// The wrap must neither swallow the failure nor convert it into a defect or a success. Asserted
// through Exit rather than a try/catch on a Promise, so a step that SUCCEEDS is reported as the
// wrong value rather than silently passing an absent-throw check.
assert.strictEqual(Exit.isFailure(exit) ? Cause.squash(exit.cause) : "the step unexpectedly succeeded", "boom")
```

**Constraints carried over verbatim:**
- **`expect` in sync `it`, `assert` inside every `it.effect`** (`Step.test.ts:26-33`). oxlint's
  `vitest/no-standalone-expect` does not recognise `it.effect` as a test block. "Do not 'make them
  consistent'."
- **Import `../src/Hook.ts` directly, never `../src/index.ts`** — `effect/no-import-from-barrel-package`
  runs with `checkRelativeIndexImports: true` and fails `pnpm lint` on a relative value-import whose
  basename is `index.*` (L35-43). `@effect/vitest` is the one exempt `@effect/*` package.
- **A module-scope header listing the mutations that were performed, reverted, and confirmed failing**
  (`Step.test.ts:22-25`). Every test file in this package has one. It is the house convention and it
  is what makes an assertion's strictness auditable.

---

### `packages/vitest/test/HookRegistry.test.ts` (NEW — test, CRUD)

**Analog:** `packages/vitest/test/Registry.test.ts` (163 lines).

**The isolation assertion that actually discriminates** (`Registry.test.ts:43-74`):

```typescript
it("hands back two different objects", () => {
  const a = createRegistry<Body>("feature A")
  const b = createRegistry<Body>("feature B")

  // Reference inequality, and nothing weaker — but note this assertion alone proves almost
  // nothing. A factory closing over a module-level array passes it every time, which is why the
  // two tests below exist rather than this one standing in for them.
  expect(a).not.toBe(b)
})

it("leaves the second registry empty when the first is registered into", () => {
  const a = createRegistry<Body>("feature A")
  const b = createRegistry<Body>("feature B")
  a.register("Given", "a step in A", () => "a", elsewhere)

  // THE load-bearing assertion. A hoisted `records` array makes b.definitions() length 1.
  expect(a.definitions()).toHaveLength(1)
  expect(b.definitions()).toHaveLength(0)
})
```

**The snapshot assertion** (`Registry.test.ts:77-92`):

```typescript
registry.register("Given", "the first step", () => "first", elsewhere)
const captured = registry.definitions()
expect(captured).toHaveLength(1)
registry.register("When", "the second step", () => "second", elsewhere)
// Returning the internal array directly would make `captured` length 2 here.
expect(captured).toHaveLength(1)
```

**The non-null default fixture** (`Registry.test.ts:34-41`) — a subtle one worth copying:

```typescript
/**
 * A stand-in site for the tests that are not about the site.
 *
 * Every `register` call needs a fourth argument, and passing `null` everywhere would let the two
 * tests at the bottom pass against a `register` that hardcodes `null` — the exact mutation those
 * tests exist to catch. A non-null default keeps them discriminating.
 */
const elsewhere: DefinitionSite = { file: "/repo/test/elsewhere.test.ts", line: 1, column: 1 }
```

**Also copy:** the reference-identity site assertion (L140-151, `toBe(site)` not `toEqual`), and the
`toThrow("…message…")` form — a bare `toThrow()` is rejected by oxlint's
`vitest/require-to-throw-message` (L98-100).

---

### `packages/vitest/test/ScenarioEffect.test.ts` (modified — test, sequential pipeline)

**Analog:** itself. This is where the phase's headline assertion lands — CONTEXT.md's phase boundary:
"An append-only `Ref` log must assert the full ordering across a two-Scenario Feature:
`BeforeAllScenarios → (Before → BeforeStep/AfterStep per step → After) per Scenario → AfterAllScenarios`."

**The `Ref`-log fixture already exists and is exactly that** (`ScenarioEffect.test.ts:70-106`):

```typescript
class Recorder extends Context.Service<Recorder, { readonly log: Ref.Ref<ReadonlyArray<string>> }>()("Recorder") {}

const makeRecording = (): {
  readonly layer: Layer.Layer<Recorder>
  readonly builds: ReadonlyArray<Ref.Ref<ReadonlyArray<string>>>
} => {
  const builds: Array<Ref.Ref<ReadonlyArray<string>>> = []
  const layer = Layer.effect(
    Recorder,
    Effect.gen(function*() {
      const log = yield* Ref.make<ReadonlyArray<string>>([])
      builds.push(log)
      return Recorder.of({ log })
    })
  )
  return { layer, builds }
}
```

> The log lives INSIDE the service rather than in a module-scope array the step bodies close over,
> and that is the whole point of the fixture. A closed-over array records the steps no matter how
> many times the Layer was built, so it cannot tell one build from four (L70-78).

**The `:start`/`:end` bracketing around a real suspension** (`ScenarioEffect.test.ts:108-134`) — this
one was **measured**, not assumed:

```typescript
const recordingStep = (name: string): StepBody => () =>
  Effect.gen(function*() {
    const recorder = yield* Recorder
    yield* Ref.update(recorder.log, (seen) => [...seen, `${name}:start`])
    yield* Effect.yieldNow
    yield* Ref.update(recorder.log, (seen) => [...seen, `${name}:end`])
  })
```

> the first draft of this file recorded one entry per step, with no suspension, and mutation A
> SURVIVED it, passing all eight tests… `Effect.yieldNow` puts a real suspension in the middle…
> Do not "simplify" this back to a single entry per step (L108-127).

**Hook fixtures must copy this exactly**: `recordingHook("Before")` brackets a `yieldNow`, or the
ordering assertion the whole phase rests on is unfalsifiable against a concurrent implementation.

**The ordering assertion form** (`ScenarioEffect.test.ts:215-224`):

```typescript
assert.deepStrictEqual(yield* Ref.get(builds[0]!), [
  "background:start", "background:end",
  "one:start", "one:end",
  // …
])
```

**The fail-fast-by-omission assertion** (`ScenarioEffect.test.ts:265-272`) — the model for D-04's
"steps only run if every Before hook succeeded" and D-06's "no later BeforeStep/step runs":

```typescript
const exit = yield* Effect.exit(buildScenarioEffect({ plan, layer }))
assert.isTrue(Exit.isFailure(exit))
// THE load-bearing assertion of this file… Asserting only that the exit is a failure passes against
// an implementation that ran all four steps and reported the second one's error at the end. The two
// absent names are the proof.
assert.deepStrictEqual(yield* Ref.get(builds[0]!), ["one:start", "one:end", "two:start"])
```

**The reference-identity error assertion** (`ScenarioEffect.test.ts:306-313`) — D-03/D-06's combined
failure must still let the *original* error objects be recovered by identity, so this assertion form
generalises to `Cause`-walking rather than `Cause.squash`:

```typescript
assert.strictEqual(
  Exit.isFailure(exit) ? Cause.squash(exit.cause) : "the Scenario unexpectedly succeeded",
  undefinedStepError
)
```

**Also carried over:**
- **Plan values are built by hand here, never through `planFeature`** (L37-42): "Routing the fixtures
  through `planFeature` would make a `Plan.ts` regression fail in this file too, so a red run would no
  longer say which of the two modules broke."
- **The unexecuted-value test** (L344-360) uses a bound `const`, not a discarded expression, because
  `@effect/tsgo`'s `effect(floatingEffect)` rejects an Effect-valued expression statement.
- **Layer-freshness is asserted by observing a BUILT value across two executions**, never by comparing
  Layer references (L18-22, L322-341).

---

### `packages/vitest/test/Runner.test.ts` (modified — test, event-driven)

**Analog:** itself. This is where "`BeforeAllScenarios` runs exactly once across N Scenarios" (D-08)
and "`AfterAllScenarios` runs even when `BeforeAllScenarios` failed" (D-09) become assertable — the
recording fake hands back every Scenario thunk, so a test can run them and count builds.

**The recording fake** (`Runner.test.ts:105-148`):

```typescript
type EmissionRecord = {
  readonly kind: "describe" | "effect"
  readonly name: string
  readonly depth: number
  readonly self: (() => Effect.Effect<void, unknown, Scope.Scope>) | null
}

const makeRecordingApi = (): { readonly api: TestApi; readonly records: ReadonlyArray<EmissionRecord> } => {
  const records: Array<EmissionRecord> = []
  let depth = 0
  const api: TestApi = {
    describe: (name, define) => {
      records.push({ kind: "describe", name, depth, self: null })
      depth += 1
      try {
        define()
      } finally {
        depth -= 1
      }
    },
    effect: (name, self) => {
      records.push({ kind: "effect", name, depth, self })
    }
  }
  return { api, records }
}
```

> Returned from a factory rather than declared at module scope, so each test gets its own array…
> `depth` is incremented before `define` runs and decremented in a `finally`, copying
> `src/describeFeature.ts`'s scope-stack discipline verbatim (L112-126).

**The safe thunk accessor** (`Runner.test.ts:156-172`) — needed because `noUncheckedIndexedAccess` is on:

```typescript
const thunkAt = (
  records: ReadonlyArray<EmissionRecord>,
  index: number
): () => Effect.Effect<void, unknown, Scope.Scope> => {
  const record = records[index]
  if (record === undefined || record.self === null) {
    throw new Error(`no recorded effect thunk at index ${index} of ${records.length} records`)
  }
  return record.self
}
```

**Running recorded thunks** (`Runner.test.ts:388-403`, `463-470`) — the shape a
"`BeforeAllScenarios` ran once across two Scenarios" assertion takes:

```typescript
yield* thunkAt(records, 1)()
yield* thunkAt(records, 2)()
// …
assert.isTrue(Exit.isSuccess(yield* Effect.exit(thunkAt(records, 3)())))
```

**Also carried over:** `shapeOf(records)` (L150-154) is the comparable projection used for
`assert.deepStrictEqual` on the emitted tree, since a thunk has no equality.

---

### `packages/vitest/test/tsgo-gate/src/hook-satisfied.ts` + `hook-missing-service.ts` (NEW — test fixture)

**Analog:** `packages/vitest/test/tsgo-gate/src/step-satisfied.ts` and its twin
`step-missing-service.ts`, driven by `tsconfig.step-ok.json` / `tsconfig.step-missing.json` and
asserted by `scripts/verify-tsgo-gate.sh`.

This is the file class the planner is most likely to miss, and `Dsl.ts` note (a) is why missing it is
expensive: a hook registrar with its union members in the wrong order still rejects the bad case, so
**no existing test goes red** — `effect(missingEffectContext)` just quietly stops covering the new
surface. Note (a) closes with "The behavioral proof lives in `test/tsgo-gate/` — a reorder must make
that fixture's assertion fail." A hook registrar with no fixture has no such proof.

**The positive-control shape** (`step-satisfied.ts:1-6, 15-33`):

```typescript
// MUST COMPILE CLEAN. Asserted by scripts/verify-tsgo-gate.sh (assertion 5) as exit 0.
//
// This is the DSL positive control: every form `describeFeature` is required to accept, in one
// file. Its twin is src/step-missing-service.ts, which differs only in whether the ambient Layer
// provides the service a step needs. The pair, asserted in the same script run, is what proves
// removing a service from an ambient Layer flips a passing case to failing.

// Declared inline and duplicated in the twin fixture on purpose: `files: [one]` means a shared
// helper module would have to be added to every config. Specimens, not production code. The
// explicit `Layer.Layer<...>` annotations are not optional — declaration emit demands them for
// anything exported.
export class World extends Context.Service<World, { readonly apples: Ref.Ref<number> }>()("World") {
  static readonly layer: Layer.Layer<World> = Layer.effect(
    World,
    Effect.gen(function*() {
      return World.of({ apples: yield* Ref.make(0) })
    })
  )
}

declare const feature: ParsedFeature
```

**The two accepted-body-forms check** (`step-satisfied.ts:35-56`) — the hook fixture needs the same
pair per hook kind (bare generator, and already-wrapped via `Effect.fn`), plus the
`Effect.acquireRelease`-in-a-plain-`Layer` case that proves `Scope.Scope` is reachable from a hook body.

**Note:** `scripts/verify-tsgo-gate.sh` numbers its assertions, and each fixture needs a matching
`tsconfig.<name>.json` with `files: [one]`. Adding a fixture is a three-file edit (fixture, tsconfig,
script assertion) — the planner should treat it as one unit of work, not one file.

---

## Shared Patterns

### Registration-time call-site capture
**Source:** `packages/vitest/src/describeFeature.ts:172-181`, `packages/vitest/src/CallSite.ts`
**Apply to:** the hook registrar in `describeFeature.ts`, and the `definedAt` field on the hook registry record

```typescript
const registrar = (keyword: StepKeyword): StepRegistrar<any> => (pattern, fn) => {
  registry.register(keyword, pattern, register(pattern, fn), captureCallSite())
}
```

`captureCallSite()` MUST be called from inside the arrow the test author invokes. Hoisting it to a
`const` in `collect`'s body records `describeFeature.ts`'s own line for every hook in every suite —
and it produces a perfectly well-formed site, so nothing catches it. Without a per-hook site, D-03's
combined `Before`-failure report cannot name *which two* `Before` hooks failed, which is the whole
point of preferring the richest option.

### Absence is `null`, never an optional property
**Source:** `packages/vitest/src/Registry.ts:60-72`, `Registry.ts:77-92`
**Apply to:** every new record type in the hook registry

> `name` is `string | null` and not an optional property, deliberately. `exactOptionalPropertyTypes`
> is on, so an optional `name?: string` would make "absent" and "present but undefined" two distinct
> states for one idea.

For the `Schema.TaggedError` side the equivalent is `Schema.OptionFromUndefinedOr` with an explicit
`Option.some`/`Option.none` at every construction site (`Errors.ts` note (b), constraint 3).

### The internal-stage export policy
**Source:** `packages/vitest/src/index.ts:50-66`; `Registry.ts` note (d) L45-52; `Step.ts` L38-41;
`ScenarioEffect.ts` L84-88; `TestApi.ts` L55-58; `Plan.ts` L111-114
**Apply to:** `Hook.ts`, `HookRegistry.ts`, and any new internal type

Six modules carry the identical closing paragraph. `Hook.ts` and `HookRegistry.ts` are the same class
of thing and must carry it too. Only the `Dsl.ts` hook *types* and any hook *error class* go in the
barrel.

### The "not visible from the code" doc-note convention
**Source:** every module in `packages/vitest/src` — `Dsl.ts:14-83` (five notes), `Registry.ts:1-52`
(four), `ScenarioEffect.ts:27-88` (three), `TestApi.ts:11-58` (four), `Runner.ts:16-93` (four),
`Step.ts:11-41` (three), `describeFeature.ts:16-76` (five)
**Apply to:** every file this phase creates or substantially modifies

The convention is precise and consistent: a numbered `(a)`/`(b)`/`(c)` list in the module header,
each note stating (1) the constraint in **bold**, (2) the plausible tidy-up that would break it, and
(3) the specific test that goes red when it does. `Dsl.ts:14-18` states the rule for the convention
itself:

> Five things about this module are not visible from the code, and every one of them shares a failure
> mode: the broken form still compiles, still rejects the negative case, and still leaves every test
> in this repo green. There is no loud signal for any of them. Each note therefore names the plausible
> tidy-up that would cause it.

Phase 7 has at least four such constraints of its own (hook run order is registration order; the
independent-batch semantics of D-02 vs. the fail-fast gating of D-04; `AfterStep`'s guarantee spanning
`BeforeStep`; `onExit`-not-`ensuring`). Each needs a note.

### Test-file mutation headers
**Source:** `test/Step.test.ts:22-25`, `test/ScenarioEffect.test.ts:28-35`, `test/Registry.test.ts:16-18`
**Apply to:** every test file this phase creates or modifies

```typescript
* Mutation-tested (all three performed, then reverted, all three confirmed failing) — see the plan
* summary for the recorded output:
* - A. the `for` loop replaced with `Effect.forEach(args.plan.steps, …, { concurrency: "unbounded" })`
*      → the ordering and fail-fast tests fail.
* - B. the `Unresolved` branch changed from a failure to a no-op `continue` → the unresolved-step
*      test fails, because the Scenario succeeds.
* - C. the Layer provided inside the loop, once per step → the freshness test sees four builds.
```

This is not decoration — `ScenarioEffect.test.ts` L108-120 records that the fixture's first draft let
mutation A survive all eight tests. The header is the audit trail proving the assertions discriminate.

### Lint constraints that shape code (all verified in existing files)
**Apply to:** all files

| Rule | Consequence |
|------|-------------|
| `no-underscore-dangle` | `_tag` must be read by destructuring, behind a named type predicate (`ScenarioEffect.ts:95-108`) |
| `vitest/no-standalone-expect` | `expect` in sync `it`, `assert` inside every `it.effect` (`Step.test.ts:26-33`) |
| `vitest/require-to-throw-message` | `toThrow("…")` never bare `toThrow()` (`Registry.test.ts:98-100`) |
| `effect/no-import-from-barrel-package` (`checkRelativeIndexImports: true`) | tests import `../src/X.ts`, never `../src/index.ts`; `@effect/vitest` is the one exempt `@effect/*` package |
| `erasableSyntaxOnly` | string-literal unions, never enums (`Registry.ts:54-58`) |
| `noUncheckedIndexedAccess` | no `!`; throw an explaining `Error` for impossible states (`Registry.ts:132-141`, `Runner.ts:151-160`) |
| `unicorn/consistent-function-scoping` | capture-free test helpers go at module scope (`Step.test.ts:51-57`) |
| `composite: true` | explicit return annotation on every exported binding (`Step.ts:72-73`, `ScenarioEffect.ts:122-123`) |
| `@effect/tsgo` `effect(floatingEffect)` | an Effect-valued expression statement is rejected; bind it (`ScenarioEffect.test.ts:345-351`) |
| `@effect/tsgo` `overriddenSchemaConstructor` | no custom constructor on a `Schema.TaggedError` (`Errors.ts` note (b) constraint 4) |
| acceptance grep | `vitest` / `@effect/vitest` must not appear in `Runner.ts` or `TestApi.ts` **even in a comment** (`Runner.ts:18-22`) |

---

## Verified API Constraints

Checked against the installed `effect@4.0.0-rc.112`
(`node_modules/.pnpm/effect@4.0.0-rc.112/node_modules/effect/dist/`), not assumed. These bear
directly on D-03, D-05, D-06, D-08 and D-09.

### `Effect.ensuring` CANNOT express this phase's combine-don't-mask requirement

`Effect.d.ts:12205` — the finalizer's error channel is **`never`**:

```typescript
export declare const ensuring: {
  <X, R1>(finalizer: Effect<X, never, R1>): <A, E, R>(self: Effect<A, E, R>) => Effect<A, E, R1 | R>
  <A, E, R, X, R1>(self: Effect<A, E, R>, finalizer: Effect<X, never, R1>): Effect<A, E, R1 | R>
}
```

A hook body that can fail is not assignable to `Effect<X, never, R1>`, and `ensuring`'s doc block
contains no mention of merging causes. **BEH-EC-006 names `Effect.ensuring` literally**, and
CONTEXT.md's canonical_refs already flags that BEH-EC-006's worked signatures predate the real
architecture — this is a second, independent way that spec text does not survive contact with the
installed build. The planner should treat "via `Effect.ensuring`" as naming the *guarantee*, not the
combinator.

### `Effect.onExit` provides the guarantee AND the merge

`Effect.d.ts:12560` — the finalizer's error channel widens the result, and the doc block states:

> **"Ensures that a cleanup function runs whether this effect succeeds, fails, or is interrupted.
> If both the effect and the cleanup function fail, the two causes are merged."**

```typescript
export declare const onExit: {
  <A, E, XE = never, XR = never>(f: (exit: Exit.Exit<A, E>) => Effect<void, XE, XR>): <R>(self: Effect<A, E, R>) => Effect<A, E | XE, R | XR>
  <A, E, R, XE = never, XR = never>(self: Effect<A, E, R>, f: (exit: Exit.Exit<A, E>) => Effect<void, XE, XR>): Effect<A, E | XE, R | XR>
}
```

This satisfies D-05 (`AfterStep` runs when the step failed), D-06 (both errors combined, Scenario
still stops), D-07 (`AfterStep` runs even when `BeforeStep` failed — wrap the whole unit), and D-09
(`AfterAllScenarios` always runs). Related: `Effect.onExitPrimitive` (L12531), `Effect.onError`
(L12312), `Effect.onExitIf` (L12646), `Effect.onExitFilter` (L12723).

### `Cause.combine` is the D-03 primitive

`Cause.d.ts:726` — its doc block: *"Merges two causes into a single cause whose `reasons` array is the
union of both inputs (de-duplicated by value equality)… Combining with `empty` returns the other cause
unchanged."*

Companions: `Cause.empty` (L437, the fold identity), `Cause.fromReasons` (L410),
`Cause.makeFailReason` (L525), `Cause.hasFails` (L851), `Cause.findError` (L903), `Cause.squash`
(L827), `Cause.pretty` (L1192). Paired with `Effect.exit` (L3339) and `Effect.failCause` (L1967),
this gives the D-02/D-03 independent-batch shape: run each hook to an `Exit`, fold the failures with
`Cause.combine` starting from `Cause.empty`, and `Effect.failCause` the result if it has any reasons.

**Note for the ScenarioEffect assertion style:** `Cause.squash` on a combined cause does not return
the original error by identity, so the existing `assert.strictEqual(Cause.squash(…), theError)` form
(`ScenarioEffect.test.ts:288-291`, `306-313`) does **not** generalise to the multi-failure tests. Use
`Cause.fromReasons`/reason-walking, and keep reference identity on each individual error — the
existing assertion's whole point (L23-26) is that "a structural comparison passes against an
implementation that re-wraps, re-tags or reconstructs the failure."

### `BeforeAllScenarios` sharing (D-08's Claude's-Discretion item) — what exists

- **`Deferred`** module exists. Notably `Deferred.makeUnsafe<A, E>()` (`Deferred.d.ts:121`) is
  **synchronous** — constructible at emit/collection time in `Runner.ts`, which is exactly where the
  N Scenario thunks are created. Also `Deferred.into` (L1593), `Deferred.done` (L446),
  `Deferred.failCause` (L751), `Deferred.isDoneUnsafe` (L1300), `Deferred.doneUnsafe` (L1556).
- **`Effect.cached`** (`Effect.d.ts:12819`) is `<A, E, R>(self: Effect<A, E, R>) => Effect<Effect<A, E, R>>`
  — the memo is only reachable by **running an Effect first**. It does not compose with a synchronous
  emission walk that must hand N independent thunks to `TestApi.effect`. It is not the drop-in it
  looks like.
- **There is no `Effect.once`.** Grepped; the name does not exist in this build.
- **`Latch`** exists with a synchronous `Latch.makeUnsafe(open?)` (`Latch.d.ts:151`), plus `whenOpen`
  (L340), `open`/`openUnsafe`, `close`/`closeUnsafe`.

The `Deferred.makeUnsafe` + a closure `hasStarted` flag path needs **no change to `TestApi.ts`**,
which is what CONTEXT.md D-08 already anticipated. It also keeps the `Runner.ts` "no framework import,
not even in a comment" rule trivially satisfied.

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| the `BeforeAllScenarios`/`AfterAllScenarios` sharing mechanism (wherever it lands — `Runner.ts` or a new module) | service | pub-sub / once-semantics | Nothing in this codebase currently shares one Effect's result across N independently-executed test Effects. `ScenarioEffect.ts` note (b) L57-63 says the closest thing — a memoised Layer branch — is deliberately **absent** and belongs to Phase 10. No existing code to copy; see [Verified API Constraints](#verified-api-constraints) for the primitives that do exist. |

Everything else in this phase has a direct in-repo analog.

---

## Metadata

**Analog search scope:** `packages/vitest/src`, `packages/vitest/test`, `packages/vitest/test/tsgo-gate`,
`packages/gherkin/src`, `node_modules/.pnpm/effect@4.0.0-rc.112/.../dist`
**Files scanned:** 20 (11 read in full or in targeted ranges; 9 surveyed by grep)
**Files read in full:** `Dsl.ts`, `Registry.ts`, `ScenarioEffect.ts`, `TestApi.ts`, `Runner.ts`,
`Step.ts`, `describeFeature.ts`, `Errors.ts`, `index.ts`, `test/Registry.test.ts`, `test/Step.test.ts`,
`test/ScenarioEffect.test.ts`, `test/tsgo-gate/src/step-satisfied.ts`
**Project instructions:** no `CLAUDE.md` at repo root; no `.claude/skills/` or `.agents/skills/`
directory. `AGENTS.md` exists and is referenced by several source notes (§4, "omission by decision")
but was not loaded per the context-cost rule.
**Pattern extraction date:** 2026-08-29

# Architecture Research

**Domain:** Effect-native Gherkin/Cucumber test runner for vitest (library, two-package monorepo)
**Researched:** 2026-08-28
**Confidence:** HIGH for third-party API shapes (verified against the packages installed in this repo's `node_modules`), MEDIUM-HIGH for the recommended internal module structure (derived from `spec/`, not from a shipped reference implementation)

**Scope note:** the two-package split (`@effect-cucumber/gherkin` + `@effect-cucumber/vitest`) is locked by ADR-EC-013 and is treated here as a given. Everything below is about *internal* structure inside those two packages, the data flow between them, and the build order that structure implies.

---

## Standard Architecture

### System Overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│  CONSUMER                          apples.steps.ts (what vitest discovers)│
│  loadFeature('./apples.feature')  →  describeFeature(feature, Layer, dsl) │
└───────────────┬──────────────────────────────────────┬───────────────────┘
                │                                      │
┌───────────────▼──────────────────────────────────────┼───────────────────┐
│  @effect-cucumber/gherkin      (sync, no Effect runtime, no vitest)      │
│                                                       │                   │
│  ┌──────────┐   ┌──────────┐   ┌───────────┐         │                   │
│  │ Source   │──▶│ Parser   │──▶│ Pickles   │         │                   │
│  │ (fs+uri) │   │ .parse() │   │ compile() │         │                   │
│  └──────────┘   └────┬─────┘   └─────┬─────┘         │                   │
│                      │ GherkinDoc    │ Pickle[]      │                   │
│                      ▼               ▼               │                   │
│                 ┌─────────────────────────┐          │                   │
│                 │  Correlate (ADR-EC-014) │          │  StepMatcher      │
│                 │  astNodeIds ↔ AST ids   │          │  used at plan time│
│                 └────────────┬────────────┘          │        ▲          │
│                              │ ParsedFeature         │        │          │
│  ┌───────────┐               │            ┌──────────┴──┐  ┌──┴────────┐ │
│  │ DataTable │◀──────────────┘            │ StepMatcher │◀─│ Parameter │ │
│  │  wrapper  │  (attached to step args)   │ CucumberExpr│  │TypeRegistry│ │
│  └───────────┘                            └─────────────┘  └───────────┘ │
└──────────────────────────────┬───────────────────────────────────────────┘
                               │ ParsedFeature (this library's own shape)
┌──────────────────────────────▼───────────────────────────────────────────┐
│  @effect-cucumber/vitest       (Effect + @effect/vitest live here only)  │
│                                                                          │
│  ┌────────────┐  registration  ┌──────────────┐                          │
│  │ Dsl        │───────────────▶│ Registry     │  (scope tree + stack)    │
│  │ Given/When/│                │ Feature▸Rule▸│                          │
│  │ Rule/Hooks │                │ Scenario     │                          │
│  └─────┬──────┘                └──────┬───────┘                          │
│        │ normalizes via                │                                  │
│  ┌─────▼──────────┐                    ▼                                  │
│  │ StepDefinition │            ┌───────────────┐   ┌─────────┐            │
│  │  Effect.fn()   │            │ Plan          │──▶│ Layers  │            │
│  └────────────────┘            │ parsed ⋈ regd │   │provideM │            │
│                                └───────┬───────┘   └────┬────┘            │
│                                        │ ScenarioPlan[] │                 │
│                                ┌───────▼────────────────▼──┐              │
│                                │ ScenarioEffect (builder)  │              │
│                                │ Effect.gen + ensuring     │              │
│                                └───────────┬───────────────┘              │
│                                            │ Effect<void,E,Scope>         │
│                                ┌───────────▼───────────────┐              │
│                                │ Runner (TestApi seam)     │              │
│                                │ describe / it.effect      │              │
│                                └───────────┬───────────────┘              │
└────────────────────────────────────────────┼─────────────────────────────┘
                                             ▼
                            @effect/vitest: it.effect / .skip / .only / layer()
                                             ▼
                                          vitest
```

The dashed rule of the whole design: **everything above the `Runner` line is pure data or pure Effect values.** Only `Runner` (and the `describeFeature` composition root that calls it) ever touches `describe`/`it`. That single containment decision is what makes 90% of this library unit-testable without spawning a test-within-a-test.

### Component Responsibilities

| Component | Package | Responsibility | Talks to |
|-----------|---------|----------------|----------|
| `Source` | gherkin | `readFileSync` a `.feature` path, produce `{ uri, data }` | fs only |
| `Parser` | gherkin | Wrap `new Parser(new AstBuilder(newId), new GherkinClassicTokenMatcher())`; translate `Errors.CompositeParserException` into a library error | `Source`, `Errors` |
| `Pickles` | gherkin | Wrap `compile(doc, uri, newId)` → `readonly Pickle[]` | `Parser`'s output + the same `newId` |
| `Correlate` | gherkin | **ADR-EC-014's core.** Walk the `GherkinDocument` tree, index pickles by `astNodeIds`, emit `ParsedFeature` | `Parser`, `Pickles`, `DataTable` |
| `DataTable` | gherkin | Thin wrapper over `PickleTable` supplying `.hashes()`/`.raw()`/`.rowsHash()` (ADR-EC-008 correction) | nothing (pure) |
| `ParameterTypes` | gherkin | Own one `ParameterTypeRegistry` instance's lifecycle; `new ParameterType(...)` + `registry.defineParameterType(pt)` (ADR-EC-007 correction) | nothing (pure) |
| `StepMatcher` | gherkin | Compile + cache `CucumberExpression` per pattern against a registry; `match(text)` → args or undefined/ambiguous | `ParameterTypes` |
| `StepDefinition` | vitest | Normalize `generator | Effect-returning fn` → `(...args) => Effect`, applying `Effect.fn(stepText)` (ADR-EC-005) | `effect` only |
| `Registry` | vitest | Mutable scope tree (Feature ▸ Rule ▸ Scenario) + the push/pop scope stack that ambient `Given(...)` calls land in | `StepDefinition` |
| `Dsl` | vitest | The `FeatureDsl<R>`/`RuleDsl<R>` object surface + all the `R`-threading generics | `Registry`, `Layers` |
| `Layers` | vitest | Normalize `Layer | {shared, perScenario}`; compose extra layers via `Layer.provideMerge` (ADR-EC-010) | `effect/Layer` |
| `Plan` | vitest | Join `ParsedFeature`'s scenarios against `Registry`'s scopes; resolve every pickle step text → definition + typed args | `Registry`, gherkin's `StepMatcher` + `ParsedFeature` |
| `ScenarioEffect` | vitest | Compose one `Effect.gen` per scenario: hooks + ordered steps + `Effect.ensuring` (ADR-EC-004, INV-EC-001/004) | `Plan`, `Layers` |
| `Runner` | vitest | The *only* module importing `describe`/`it`. Emits nested `describe` + `it.effect`/`.skip`/`.only` against an injected `TestApi` | `ScenarioEffect`, `@effect/vitest` |
| `describeFeature` | vitest | Composition root: normalize layers → register → plan → pick `layer(shared)(…)` vs plain `describe` → run `Runner` | everything |

---

## Recommended Project Structure

```
packages/gherkin/src/
├── index.ts              # public surface: loadFeature, parseFeature, types, DataTable,
│                         #   createStepMatcher, defineParameterType, errors
├── Errors.ts             # GherkinParseError, StepMatchError (Undefined/Ambiguous), ...
├── Source.ts             # readFeatureSource(path) -> { uri, data }   [fs seam]
├── Parser.ts             # parseDocument(source, newId) -> GherkinDocument
├── Pickles.ts            # compilePickles(doc, uri, newId) -> readonly Pickle[]
├── Model.ts              # ParsedFeature / ParsedRule / ParsedScenario / ParsedStep types
├── Correlate.ts          # ADR-EC-014: GherkinDocument ⋈ Pickle[] -> ParsedFeature
├── DataTable.ts          # PickleTable -> { raw, hashes, rows, rowsHash }
├── ParameterTypes.ts     # ParameterTypeRegistry lifecycle + defineParameterType helper
├── StepMatcher.ts        # CucumberExpression cache + match(text) -> Match | Undefined | Ambiguous
└── loadFeature.ts        # Source ∘ Parser ∘ Pickles ∘ Correlate  (the one composition fn)

packages/gherkin/test/
├── fixtures/*.feature    # hand-written .feature files: minimal, background, rule,
│                         #   outline, table, docstring, tags, rule+background
├── Correlate.test.ts     # the highest-value test file in the package
├── DataTable.test.ts
└── StepMatcher.test.ts

packages/vitest/src/
├── index.ts              # public surface + re-export of loadFeature (per spec/overview.md)
├── Errors.ts
├── StepDefinition.ts     # generator-vs-Effect detection + Effect.fn wrapping
├── Registry.ts           # scope tree data + scope stack (push/pop)
├── Dsl.ts                # Given/When/Then/And/But, Background, Scenario, ScenarioOutline,
│                         #   Rule, Before/After/BeforeStep/AfterStep/Before|AfterAllScenarios
├── Layers.ts             # normalizeLayerArg + provideMerge composition
├── Plan.ts               # ParsedFeature ⋈ Registry -> ScenarioPlan[]
├── ScenarioEffect.ts     # ScenarioPlan -> Effect<void, E, Scope>
├── TestApi.ts            # the `it`-shaped interface the Runner writes against
├── Runner.ts             # describe/it.effect emission, @skip/@only routing
└── describeFeature.ts    # composition root

packages/vitest/test/
├── StepDefinition.test.ts
├── Registry.test.ts          # registration produces the right scope tree (no vitest-in-vitest)
├── Plan.test.ts              # resolution + undefined/ambiguous step handling
├── ScenarioEffect.test.ts    # it.effect over the built Effect directly — fail-fast, ensuring
├── Runner.test.ts            # against a fake TestApi — asserts which it.* was called
└── acceptance/*.feature      # dogfooding, tagged @REQ-EC-NNN
```

### Structure Rationale

- **`Source.ts` separate from `Parser.ts`:** every parser and correlation test wants a `.feature` *string*, not a temp file. Keeping `readFileSync` in a one-function module means `parseFeature(source, uri)` is the testable entry point and `loadFeature(path)` is a two-line composition. BEH-EC-001's signature is synchronous (`(path: string) => ParsedFeature`), so this must be `readFileSync` — do not let an async fs API leak in.
- **`Model.ts` separate from `Correlate.ts`:** `ParsedFeature` is this library's owned shape (ADR-EC-014 explicitly accepts that it is neither a bare `GherkinDocument` nor a bare `Pickle[]`). It is also the entire cross-package contract. Giving it its own file means the vitest package imports types from a stable module that doesn't move when correlation logic changes.
- **`ParameterTypes.ts` + `StepMatcher.ts` are an independent subtree:** they have *zero* dependency on `Parser`/`Pickles`/`Correlate`. They can be built and tested in a wave parallel to the parsing subtree, and they are the half of the gherkin package that the ADR-EC-007 correction touches.
- **`TestApi.ts` as its own module:** `@effect/vitest`'s `layer(...)` hands its callback a `Vitest.MethodsNonLive<R>` object that is *not* the module-level `it` (verified in `@effect/vitest@4.0.0-rc.112`'s `index.d.ts`). The shared-layer path and the plain path therefore have two different `it` objects. Naming that as a one-interface seam collapses them into one `Runner` code path and lets `Runner` be tested against a fake.
- **`Registry.ts` is plain mutable data, deliberately:** the DSL is an ambient-registration API (`Scenario('x', () => { Given(...) })` — `Given` lands in whatever scope is currently open). That is the same pattern vitest's own `describe`/`it` uses. Model it explicitly as a stack rather than hiding it in closures, so it can be asserted in a unit test.

---

## Architectural Patterns

### Pattern 1: Parse–Compile–Correlate (the ADR-EC-014 spine)

**What:** `Parser.parse()` gives structure; `compile()` gives execution-ready pickles; a correlation index joins them by id. Neither alone is sufficient.

**When to use:** everywhere in `@effect-cucumber/gherkin`. Never walk the AST for step text; never walk pickles for structure.

**Verified id contract** (read from `@cucumber/gherkin@42.0.1`'s `dist/pickles/compile.js` and `@cucumber/messages@34.2.1`'s `messages.d.ts`):

| Field | Value | Meaning |
|-------|-------|---------|
| `Pickle.astNodeIds` | `[scenario.id]` | a plain Scenario |
| `Pickle.astNodeIds` | `[scenario.id, valuesRow.id]` | one Examples row of a Scenario Outline (`valuesRow` is the `Examples.tableBody` `TableRow`) |
| `PickleStep.astNodeIds` | `[step.id]` (+ `valuesRow.id` for outlines) | back-reference to the AST `Step` node |
| `Pickle.tags` | `PickleTag[]` = feature tags ⧺ rule tags ⧺ scenario tags ⧺ examples tags | already inherited/flattened |
| `Pickle.steps` | feature-Background steps ⧺ rule-Background steps ⧺ scenario steps | already stacked, in run order |
| `Pickle.name` / `PickleStep.text` | already `interpolate()`d | placeholders substituted |

```typescript
// Correlate.ts — the two indices that make everything else fall out
const byScenarioId = new Map<string, Pickle[]>()
for (const p of pickles) {
  const key = p.astNodeIds[0]!                 // always the Scenario node id
  ;(byScenarioId.get(key) ?? byScenarioId.set(key, []).get(key)!).push(p)
}

// step.id -> which AST node authored it, so we can recover keyword + background-ness
type StepOrigin = { readonly step: Step; readonly owner: 'background' | 'scenario'; readonly ruleId?: string }
const byStepId = new Map<string, StepOrigin>()  // populated while walking Feature.children / Rule.children
```

**Trade-offs:** you pay one tree walk and two `Map` builds per `loadFeature`. In return, placeholder substitution, tag inheritance, and Background stacking are all free and cannot drift from Cucumber's own semantics. The cost is real but one-time and bounded by feature-file size.

**What the indices buy that pickles alone do not:** `PickleStep` carries `text` and an optional `PickleStepType` (`Context`/`Action`/`Outcome`) but **not** the literal keyword. To know a step was written `Given` vs `And`, and to know a step came from a Background (BEH-EC-005 reporting), you must resolve `pickleStep.astNodeIds[0]` through `byStepId`. Build that index; do not try to infer keywords from `PickleStepType`.

### Pattern 2: Registration pass, then planning pass, then emission pass

**What:** `describeFeature` runs three sequential, separable passes over in-memory data before a single vitest call happens.

1. **Register** — run `define(dsl)` exactly once. Nothing executes; a scope tree is built.
2. **Plan** — join `ParsedFeature`'s scenarios (from the correlation) with the registered scopes by name, and resolve every pickle step's text to a `StepDefinition` + typed args via `StepMatcher`.
3. **Emit** — walk the plan and call `describe`/`it.effect`.

**When to use:** this is the shape of `describeFeature`. Do not interleave.

**Why it matters:** an undefined or ambiguous step is discovered in pass 2 — deterministically, for every scenario, before any test runs — rather than mid-`Effect.gen` on whichever scenario happened to run first. It also means pass 1 and 2 are testable with no vitest machinery at all.

**Open call this forces (flag for an early phase):** when pass 2 finds an undefined step, does the whole `describeFeature` throw (the file fails to collect), or does that one scenario get an `it.effect` whose Effect fails immediately? **Recommendation: the latter** — defer the resolution error into that scenario's Effect. It preserves per-scenario reporting granularity, keeps every other scenario in the file runnable, and matches how Cucumber.js reports undefined steps.

### Pattern 3: The `TestApi` seam over `@effect/vitest`

**What:** `Runner` never imports `it` directly. It receives an object satisfying the subset of `Vitest.MethodsNonLive` it uses.

```typescript
// TestApi.ts
export interface TestApi {
  readonly effect: {
    (name: string, self: () => Effect.Effect<void, unknown, Scope.Scope>): void
    readonly skip: (name: string, self: () => Effect.Effect<void, unknown, Scope.Scope>) => void
    readonly only: (name: string, self: () => Effect.Effect<void, unknown, Scope.Scope>) => void
  }
}
```

**When to use:** always, in `Runner`. `describeFeature` supplies either the module-level `it` from `@effect/vitest` (no shared layer) or the `it` argument that `layer(sharedLayer)(name, (it) => …)` hands its callback (shared layer, ADR-EC-006/BEH-EC-007).

**Trade-offs:** one extra indirection, in exchange for (a) one `Runner` code path instead of two near-duplicates, and (b) `Runner.test.ts` asserting "scenario tagged `@skip` called `effect.skip`, not `effect`" against a recording fake — which is otherwise close to untestable.

**Verified constraint driving this:** `layer<R,E>(layer_)` returns `(f: (it: Vitest.MethodsNonLive<R>) => void) => void` and also accepts a `(name, f)` overload that opens its own `describe`. Calling the *module-level* `it.effect` inside that callback compiles but silently loses the shared layer's services. See the anti-pattern below.

### Pattern 4: Layer provision differs between the shared and non-shared paths

**What:** with no shared layer, the scenario Effect must provide everything itself:
```typescript
scenarioEffect.pipe(Effect.provide(perScenarioStack))   // R reduced to Scope
```
With a shared layer, `layer(shared)`'s `it.effect` already carries `R = Shared | Scope`, so the scenario Effect must provide **only** the per-scenario stack and leave `Shared` unprovided for the ambient to satisfy.

**When to use:** in `ScenarioEffect`/`Runner`. Make the provision strategy an explicit parameter of the builder, not an implicit consequence of which branch called it.

**Trade-offs:** two provision modes is more surface than one, but the alternative — providing `shared` per scenario — silently violates BEH-EC-007's "built exactly once" requirement while still type-checking.

### Pattern 5: Step-definition scope chain

**What:** a `Given` registered at the Feature's top level must be visible to steps inside a `Rule` and inside every `Scenario`; a `Given` registered inside a `Rule` must not be visible outside it.

**When to use:** in `Plan`'s resolution step. Resolve a pickle step's text by walking *up* the scope chain: Scenario scope → enclosing Rule scope → Feature scope; first match wins, two matches at the same level is ambiguous.

**Why this specific rule:** Background steps are stacked into every pickle's step list (Pattern 1), including pickles for scenarios nested in a Rule. A feature-level Background's step definitions are registered at feature scope but must resolve for a rule-nested scenario. A flat, single-level registry cannot express this and will fail on the ADR-EC-014 worked example in `spec/behaviors/03`.

### Pattern 6: `Effect.fn` normalization at the registration boundary

**What:** `Given`/`When`/`Then` accept a bare generator function *or* an already-`Effect.fn`-wrapped function (BEH-EC-003, ADR-EC-005). `StepDefinition` normalizes both to `(...args) => Effect`.

```typescript
const isGeneratorFunction = (f: Function): boolean =>
  f.constructor?.name === 'GeneratorFunction' ||
  Object.prototype.toString.call(f) === '[object GeneratorFunction]'

export const normalize = (stepText: string, body: Function) =>
  isGeneratorFunction(body) ? Effect.fn(stepText)(body as any) : body
```

**Trade-offs:** runtime type-sniffing is inelegant, but the public signature in BEH-EC-003 explicitly accepts a union, so the discrimination has to happen somewhere. Isolating it in a ~20-line module with its own test file keeps it from spreading.

---

## Data Flow

### The full trace: `.feature` text → running `it.effect`

```
apples.feature (text on disk)
  │
  │  Source.readFeatureSource(path)                        [gherkin]
  ▼
{ uri: './apples.feature', data: '<gherkin text>' }
  │
  ├─── Parser.parseDocument(data, newId) ─────────────────▶ GherkinDocument
  │      Feature { name, tags, children:[                     (structure)
  │        {background:{id, steps}},
  │        {scenario:{id, name, tags, steps, examples}},
  │        {rule:{id, name, tags, children:[{background},{scenario}]}}
  │      ]}                    every node carries .id from AstBuilder's IdGenerator
  │
  └─── Pickles.compilePickles(doc, uri, newId) ───────────▶ readonly Pickle[]
         Pickle {                                             (execution-ready)
           name          ← interpolate()d
           tags          ← feature ⧺ rule ⧺ scenario ⧺ examples, flattened
           steps         ← featureBackground ⧺ ruleBackground ⧺ scenario, in order
           astNodeIds    ← [scenario.id] | [scenario.id, examplesRow.id]
         }
         PickleStep { text (interpolated), argument?, astNodeIds:[step.id, …] }
  │
  │  Correlate.correlate(doc, pickles)     ◀── THE ADR-EC-014 JOIN     [gherkin]
  │    index A: astNodeIds[0]  → Pickle[]      (group pickles per AST Scenario)
  │    index B: step.id        → { astStep, owner:'background'|'scenario', ruleId? }
  │    walk Feature.children (+ Rule.children) in declaration order:
  │      for each AST Scenario node S:
  │        pickles = A.get(S.id)
  │        S.examples.length === 0  → exactly 1 ParsedScenario
  │        S.examples.length  >  0  → 1 ParsedScenario per pickle,
  │                                    exampleRowId = pickle.astNodeIds[1]
  │        steps = pickle.steps.map(ps => ({
  │           text:       ps.text,                            // already substituted
  │           keyword:    B.get(ps.astNodeIds[0]).astStep.keyword,   // Given/When/Then/And/But
  │           background: B.get(ps.astNodeIds[0]).owner === 'background',
  │           argument:   ps.argument?.dataTable ? DataTable.make(...)
  │                     : ps.argument?.docString ?? undefined
  │        }))
  ▼
ParsedFeature {                                     ◀── the cross-package contract
  name, tags, uri,
  scenarios: ParsedScenario[],                      // feature-level scenarios
  rules: ParsedRule[ { name, tags, scenarios } ],   // rule-nested scenarios
  document, pickles                                 // kept for escape hatches/reporting
}
  │
  │  ═══════════ package boundary ═══════════
  ▼
describeFeature(feature, layerArg, define)                        [vitest]
  │
  │ PASS 1 — REGISTER  (runs `define` once, at module load)
  │   Registry scope stack: push FeatureScope
  │     Rule(name, extraLayer?, f)        → push RuleScope,     run f,  pop
  │     Scenario(name, extraLayer?, f)    → push ScenarioScope, run f,  pop
  │     ScenarioOutline(name, f)          → push ScenarioScope, run f,  pop
  │     Given/When/Then/And/But(pat, body)→ StepDefinition.normalize → current scope
  │     Background(...)                   → feature/rule-scope background registration
  │     Before/After/BeforeStep/AfterStep → current scope's hook lists
  ▼
FeatureScope { hooks, steps, rules:Map<name,RuleScope>, scenarios:Map<name,ScenarioScope> }
  │
  │ PASS 2 — PLAN  (join parsed ⋈ registered)
  │   for each ParsedScenario PS:
  │     scope   = resolveScope(PS.ruleName, PS.name)          // by name
  │     steps   = PS.steps.map(s => StepMatcher.match(s.text) against
  │                  scope-chain: Scenario → Rule → Feature)  // ← gherkin, at plan time
  │                  args = Argument[].map(a => a.getValue(undefined))
  │     mode    = PS.tags includes '@skip' ? 'skip'
  │             : PS.tags includes '@only' ? 'only'
  │             : excludeTags matches      ? 'exclude'   // never reaches vitest at all
  │             : 'run'
  │     layers  = Layer.provideMerge(ambient)(rule.extra ⊕ scenario.extra)
  ▼
ScenarioPlan[] { describePath:['Feature','Rule'], name, mode, resolvedSteps, hooks, layers }
  │
  │ PASS 3 — EMIT
  │   ScenarioEffect.build(plan) →
  │     Effect.gen(function*(){
  │       yield* beforeHooks                       // scope-chain order
  │       for (const step of plan.resolvedSteps) { // Background steps ALREADY first
  │         yield* beforeStepHooks(step.text)
  │         yield* step.definition(...step.args)   // fail here short-circuits: INV-EC-001
  │         yield* afterStepHooks(step.text)
  │       }
  │     }).pipe(
  │       Effect.ensuring(afterHooks),             // INV-EC-004
  │       Effect.provide(plan.layers)              // (shared layer omitted on that path)
  │     )
  │   Runner.emit(plans, testApi) →
  │     describe(feature.name, () => {
  │       describe(rule.name, () => {              // nested, per ParsedRule
  │         testApi.effect[.skip|.only](scenario.name, () => scenarioEffect)
  │       })
  │     })
  ▼
vitest run    →    one test per Scenario (per Examples row for an Outline)
```

### Key data flows, named

1. **Structure flow (AST → describe tree).** Only `Feature.name`, `Rule.name`, declaration order, and the Rule↔Scenario membership come from the `GherkinDocument`. Nothing else does.
2. **Execution flow (Pickle → step list).** All step text, tags, and step ordering come from `Pickle`. The runner never concatenates a Background step list at runtime — ADR-EC-014's whole point.
3. **Identity flow (`astNodeIds` → the join).** The only thing linking flows 1 and 2. It is a two-`Map` index built once per `loadFeature`, and it is where a bug will be most expensive — it earns its own phase and its own fixture-driven test file.
4. **Typed-args flow (pattern → step params).** `CucumberExpression.match(text)` → `readonly Argument[] | null` → `Argument.getValue(thisObj)`. Because substitution already happened in flow 2, `{int}`/`{float}` coerce Outline example values with zero extra work (BEH-EC-010).
5. **Requirement flow (`R`).** Purely type-level, but it constrains module shape: `Dsl.ts` has to thread `R` from `describeFeature`'s layer argument through `FeatureDsl<R>` → `RuleDsl<R|R2>` → step signatures so INV-EC-003 is a compile error. This is why `Dsl.ts` is its own module rather than inlined into `Registry.ts` — the runtime registration is `R`-agnostic, the surface is not.

---

## Build Order

### Internal dependency graph

```
gherkin                                     vitest
──────────────────────────────────          ─────────────────────────────────────
G1 Errors ──┐                               V1 StepDefinition (effect only)
G2 Source ──┤                                    │
            ├─▶ G3 Parser ──┬─▶ G5 Pickles  V2 Registry (scope tree + stack)
            │               │       │            │
G4 DataTable┤               └───────┴─▶ G6 Correlate ⇢⇢⇢ V4 Plan ◀── V3 Dsl (types)
   (pure)   │                            │  ▲                  ▲
            │                            │  │                  │
G7 ParameterTypes ─▶ G8 StepMatcher ⇢⇢⇢⇢⇢⇢⇢⇢⇢┘                  │
                                         │                     │
                                    G9 loadFeature+index   V5 Layers (independent)
                                                               │
                                                          V6 ScenarioEffect
                                                               │
                                                          V7 TestApi + Runner
                                                               │
                                                          V8 shared-layer path
                                                               │
                                                          V9 describeFeature + index
                                                               │
                                                          V10 dogfooded acceptance
```
`⇢⇢⇢` = cross-package dependency. Note there is exactly **one** cross-package edge into `V4 Plan` — the vitest package's first six modules need only `ParsedFeature`'s *types*, not its implementation.

### Critical path

`G1/G2 → G3 → G5 → G6 → V4 → V6 → V7 → V9 → V10`

Everything else (`G4`, `G7`, `G8`, `V1`, `V2`, `V3`, `V5`) is off the critical path and parallelizable into waves.

### Module-level build order, with what unblocks what

| # | Module(s) | Blocked by | Unblocks | Verifiable by |
|---|-----------|-----------|----------|---------------|
| 1 | `Errors`, `Source` | — | everything in gherkin | reads a fixture file; a missing file yields a typed error |
| 2 | `Parser` | 1 | 3, 4 | parses each `.feature` fixture; a malformed file yields a typed error, not a raw `CompositeParserException` |
| 3 | `DataTable` | — (parallel with 2) | 4 | `.hashes()` on a hand-built `PickleTable` literal — no parser needed |
| 4 | `Pickles` | 2 | 5 | pickle count per fixture (1 per scenario, N per Examples row) |
| 5 | **`Model` + `Correlate`** | 2, 3, 4 | the entire vitest package | fixture-driven: rule membership, background-step flags, inherited tags, per-row outline scenarios, recovered keywords |
| 6 | `ParameterTypes` | — (parallel with 2–5) | 7 | a custom `ParameterType` registered and matched |
| 7 | `StepMatcher` | 6 | V4 | `{int}`/`{string}`/`{float}`/custom; 0-match and 2-match cases |
| 8 | `loadFeature` + gherkin `index` | 1–7 | package is independently usable (ADR-EC-013's stated payoff) | end-to-end: path in, `ParsedFeature` out |
| 9 | `StepDefinition` | — (needs only `effect`; parallel with 1–8) | 10 | generator wrapped, pre-wrapped fn passed through, span name is the step text |
| 10 | `Registry` | 9 | 11 | registration order and scope nesting asserted on the tree, no vitest involved |
| 11 | `Dsl` | 10 | 12 | type-level tests: a step needing an unprovided `R` fails to compile (INV-EC-003) |
| 12 | `Layers` | — (parallel with 9–11) | 14 | `provideMerge` composition, `{shared, perScenario}` normalization |
| 13 | **`Plan`** | 11, 5, 7 | 14 | scope-chain resolution; undefined/ambiguous handling; tag→mode routing |
| 14 | `ScenarioEffect` | 13, 12 | 15 | `it.effect` over the built Effect *directly*: fail-fast, `After` ran on failure, Background ran first |
| 15 | `TestApi` + `Runner` | 14 | 16 | recording fake `TestApi`: which `it.*` was called, in which describe |
| 16 | shared-layer path | 15 | 17 | `layer()`'s `it` used; shared layer built once |
| 17 | `describeFeature` + vitest `index` | all | 18 | the BEH-EC-001–004 worked example runs |
| 18 | dogfooded acceptance suite | 17 | ship | `@REQ-EC-NNN`-tagged `.feature` files pass |

### Suggested phase grouping (for an 8–12 phase roadmap)

| Phase | Modules | Why this is one coherent unit |
|-------|---------|-------------------------------|
| 1 | 1, 2 (Errors, Source, Parser) | Establishes fixtures + the error vocabulary the whole package uses |
| 2 | 3 (DataTable) | Pure, self-contained, no upstream dependency — good parallel/filler phase; closes ADR-EC-008's correction |
| 3 | 4, 5 (Pickles, Model, Correlate) | **The riskiest phase.** ADR-EC-014 in full. Deserves the most fixtures |
| 4 | 6, 7 (ParameterTypes, StepMatcher) | Closes ADR-EC-007's correction; independent of phases 1–3, so it can run in parallel with them |
| 5 | 8 (loadFeature + index) | Makes `@effect-cucumber/gherkin` independently shippable — the payoff ADR-EC-013 promised |
| 6 | 9, 10, 11 (StepDefinition, Registry, Dsl) | The registration half of the vitest package; the `R`-threading type work lands here |
| 7 | 12, 13 (Layers, Plan) | The first cross-package integration; where undefined/ambiguous steps get their behavior |
| 8 | 14 (ScenarioEffect) | INV-EC-001 + INV-EC-004 + BEH-EC-005 all verified here, with no vitest-in-vitest |
| 9 | 15 (TestApi, Runner, tags) | BEH-EC-008's `@skip`/`@only`/exclude routing |
| 10 | 16 (shared-layer path) | BEH-EC-007; isolated because `layer()`'s different `it` object is the one real surprise |
| 11 | 17 (describeFeature, index) | Composition root; the BEH-EC-001–004 example compiles and runs |
| 12 | 18 (acceptance suite, Rule/Outline/TestClock coverage) | BEH-EC-009/010/012; dogfooding closes the traceability chain |

Phases 2 and 4 have no dependency on phases 1/3 and can be scheduled in a parallel wave. Phase 6 depends only on `effect` and on `ParsedFeature`'s *types*, so it can also start before phase 5 completes.

---

## Anti-Patterns

### Anti-Pattern 1: Re-deriving what `compile()` already did

**What people do:** walk the `GherkinDocument`, concatenate `Background.steps` onto `Scenario.steps` at runtime, hand-substitute `<placeholder>` tokens, and union feature/rule/scenario tag arrays.
**Why it's wrong:** all three already happened inside `compile()`, with Cucumber's exact semantics (including the rule-Background-after-feature-Background ordering and Examples-tag inheritance). A hand-rolled version drifts silently on the first edge case.
**Do this instead:** iterate `pickle.steps` in order; read `pickle.tags`; read `pickle.name`. ADR-EC-014 is explicit that this is the whole point of the correlation.

### Anti-Pattern 2: Matching step text inside the running Effect

**What people do:** put `StepMatcher.match(text)` inside the `Effect.gen` so the match happens when the step runs.
**Why it's wrong:** an undefined step in scenario #7 is only discovered after scenarios #1–6 have run; a typo'd pattern surfaces as a runtime failure rather than at collection; and matching cost is paid per run rather than per registration.
**Do this instead:** resolve every step at **plan time** (Pattern 2, pass 2). If resolution fails, embed a pre-failed Effect in that one scenario so the failure is still reported per-scenario.

### Anti-Pattern 3: Using the module-level `it` inside `layer(...)`'s callback

**What people do:**
```typescript
import { it, layer } from '@effect/vitest'
layer(Database.layer)('Feature', () => {
  it.effect('scenario', () => scenarioEffect)   // ← wrong `it`
})
```
**Why it's wrong:** `layer()` hands its callback a `Vitest.MethodsNonLive<R>` carrying the shared layer's services. Ignoring it and using the module-level `it` still type-checks (the scenario provides its own layers) but silently rebuilds the "shared" resource per scenario — a direct BEH-EC-007 violation, invisible until someone counts testcontainer starts.
**Do this instead:** the `TestApi` seam (Pattern 3). `Runner` receives whichever `it` is correct and never imports one.

### Anti-Pattern 4: A module-level singleton step registry

**What people do:** `const steps = new Map()` at module scope in `Registry.ts`, mutated by the ambient `Given`.
**Why it's wrong:** two `describeFeature` calls in one file, or two feature files sharing a module graph in a watch-mode rerun, cross-contaminate. It also makes `Registry.test.ts` order-dependent.
**Do this instead:** one `Registry` instance created per `describeFeature` call, with the DSL object closing over it. The scope *stack* is per-registry state, not global.

### Anti-Pattern 5: One `ParameterTypeRegistry` per expression, or a fresh one per match

**What people do:** construct `new ParameterTypeRegistry()` next to each `new CucumberExpression(pattern, registry)`.
**Why it's wrong:** a `CucumberExpression` permanently binds to the registry instance it was built with (ADR-EC-007's correction). Custom parameter types registered after an expression is compiled are invisible to it, and per-expression registries make custom types unusable in practice.
**Do this instead:** one registry owned by `ParameterTypes.ts`, custom types defined into it before the first expression compiles, and a pattern→`CucumberExpression` cache keyed on `(registry, pattern)`.

### Anti-Pattern 6: Letting Effect *runtime* logic into `@effect-cucumber/gherkin`

**What people do:** make `loadFeature` return `Effect<ParsedFeature, GherkinParseError>` because Effect is already a declared dependency of the package.
**Why it's wrong:** BEH-EC-001's signature is `(path: string) => ParsedFeature` — synchronous — and `spec/overview.md` says the package has "no Effect-specific logic." A consumer that isn't `@effect-cucumber/vitest` (ADR-EC-013's stated justification for the split) would be forced into an Effect runtime.
**Do this instead:** synchronous functions that throw typed error classes. Using `Data.TaggedError` for those classes is fine — that's an Effect *data type*, not Effect runtime — but the return type stays a plain value. **Confirm this reading early;** the package's `package.json` already declares `effect` as a dependency, so the intent isn't 100% unambiguous from the spec alone.

### Anti-Pattern 7: Inferring the step keyword from `PickleStepType`

**What people do:** map `PickleStepType.Context/Action/Outcome` → `Given/When/Then`.
**Why it's wrong:** `And`/`But` collapse into the preceding step's type, so the mapping is lossy and reports the wrong keyword. `PickleStep` has no `keyword` field at all (verified in `@cucumber/messages@34.2.1`).
**Do this instead:** resolve `pickleStep.astNodeIds[0]` through the `byStepId` index to the AST `Step` node, and read its `keyword`.

### Anti-Pattern 8: Async parameter-type transforms

**What people do:** register a custom `ParameterType` whose `transform` returns a Promise (the type signature permits `T | PromiseLike<T>`).
**Why it's wrong:** args are extracted synchronously at plan time via `Argument.getValue()`. A Promise would be passed to the step function as-is, silently.
**Do this instead:** detect a thenable in `StepMatcher` and throw a clear error. Async work belongs in the step's Effect body, not in a parameter transform.

---

## Open Questions the Structure Has to Accommodate

These are genuine ambiguities in `spec/` that directly affect the `Dsl`/`Registry` module shape. Flagging rather than silently resolving them.

| # | Question | Evidence | Suggested resolution |
|---|----------|----------|---------------------|
| 1 | **Is `Background(fn)` a step-definition container or a single step body?** | BEH-EC-005 says "Background *steps* … in declaration order" (plural, container). But both worked examples pass a bare generator: `Background(function* (table) {…})` in `03`, `Background(function* () {…})` in `02` — a single body receiving the step's DataTable. | Make `Background(define: () => void)` a container consistent with `Scenario`, so its steps resolve through the same registry and match by text (which ADR-EC-014's stacked pickle steps require). Treat the single-generator form as sugar for a one-step Background, or amend the examples. **Resolve in phase 6, before `Registry` is finalized.** |
| 2 | **Does `Scenario`'s callback receive a dsl object?** | `01` destructures `Given/When/Then` from `describeFeature`'s dsl and uses them inside `Scenario(name, () => {…})`. `03` destructures only `{ Background, Rule }` at feature level, then calls `Given` inside `Scenario('Expired…', () => {…})` — where `Given` is unbound. `ScenarioOutline` *does* receive `({ Given, When, Then })`. | Give `Scenario` the same `(dsl) => void` callback shape as `ScenarioOutline` and `Rule`, and keep the destructure-from-outer-scope form working too (the ambient scope stack makes both land in the right place). `03`'s unbound `Given` is a pre-implementation example bug. |
| 3 | **Undefined/ambiguous step: collect-time throw or per-scenario failure?** | Not specified. | Per-scenario failure (Pattern 2). Cheap to change later; expensive to discover late. |
| 4 | **How is a Scenario matched to its registered scope — by name or by order?** | Not specified. Names are the only stable handle, but a Scenario Outline produces N `ParsedScenario`s whose `pickle.name` is *interpolated* and therefore differs from the `ScenarioOutline('…')` registration name. | Match by the **AST node's** name (`scenario.name`, un-interpolated) rather than `pickle.name`; keep `pickle.name` for the `it.effect` test title. The correlation model must expose both. **This affects `Model.ts` — decide in phase 3, not phase 7.** |
| 5 | **Where does `excludeTags` live?** | BEH-EC-008 references "describeFeature's excludeTags option" but no signature in the spec includes it. | Treat as a third optional parameter/options object on `describeFeature`; the `Plan` module reads it. `spec/roadmap.md` § Planned already parks general tag filtering, so keep the phase-9 implementation to `@skip`/`@only` + a literal exclude list. |

---

## Suite-Scale Considerations

The template's user-scale axis doesn't apply to a test library; the meaningful axis is suite size.

| Scale | What to watch |
|-------|---------------|
| 1–10 feature files, <100 scenarios | Nothing. Parse + compile + correlate is microseconds per file; correctness is the only concern. |
| 10–100 files, 100–2 000 scenarios | Registration runs at module load for every `.steps.ts` vitest collects. Keep `Plan`'s step resolution O(steps × definitions-in-scope) with a per-pattern `CucumberExpression` cache — recompiling an expression per step per scenario is the first thing that would show up. |
| 100+ files | The `ParameterTypeRegistry` is per-`loadFeature`/per-process (ADR-EC-007's correction). If custom parameter types are registered per file, that is N registries and N expression caches; consider a process-level default registry with per-feature overrides *only if* profiling shows it. Do not build it speculatively. |

The dominant cost at every scale is the tests themselves, not the parsing. Do not optimize `Correlate` before it is correct.

---

## Integration Points

### External packages

| Package | Version verified | Integration surface | Gotchas |
|---------|-----------------|---------------------|---------|
| `@cucumber/gherkin` | 42.0.1 (installed) | `Parser`, `AstBuilder`, `GherkinClassicTokenMatcher`, `compile`, `Errors` | `compile` is a *default* export of `./pickles/compile.js`, re-exported as `compile` from the index. `Parser.parse` throws `Errors.CompositeParserException`. |
| `@cucumber/messages` | 34.2.1 (transitive) | Types only (`GherkinDocument`, `Pickle`, `PickleStep`, `PickleTable`, `Feature`, `Rule`, `Scenario`, `Step`), plus `IdGenerator.uuid()`/`.incrementing()` | Not a direct dependency of `packages/gherkin` today — **add it explicitly** if types are imported by name. All message types are plain `type` aliases, not classes: no methods, hence the `DataTable` wrapper. |
| `@cucumber/cucumber-expressions` | 20.1.0 (installed) | `CucumberExpression`, `ParameterTypeRegistry`, `ParameterType`, `Argument`, `ExpressionFactory` | `match()` returns `readonly Argument[] | null`. `Argument.getValue<T>(thisObj)` returns `T | null` and may be a `PromiseLike`. All default exports. |
| `effect` | 4.0.0-rc.112 (exact pin) | `Effect.fn`, `Effect.gen`, `Effect.ensuring`, `Effect.provide`, `Layer.provideMerge`, `Context.Service` — all confirmed present | `Effect.fn` is `fn.Traced & ((name, options?) => fn.Traced)`. `TestClock` lives at `effect/testing`, not the root. |
| `@effect/vitest` | 4.0.0-rc.112 (exact pin, lockstep with `effect`) | `it`, `effect`, `layer` | `layer(l)` → `{(f: (it: MethodsNonLive<R>) => void): void; (name, f): void}`. `it.effect`'s tester is `Tester<R | Scope.Scope>` — the scenario Effect must reduce `R` to `Scope` (or to `Shared | Scope` on the shared path). |
| `vitest` | ^4.1.0 (peer) | `describe` only | The vitest package needs `describe`; `@effect/vitest` does not re-export it. |

### Internal boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| gherkin → vitest | Plain synchronous values: `ParsedFeature` + `StepMatcher` + `DataTable` + error classes | The *only* cross-package edge. Keep it type-first: `Model.ts` is the contract file |
| `Correlate` → `Plan` | `ParsedFeature` (owned shape, ADR-EC-014) | Must expose **both** the un-interpolated AST scenario name (for scope matching) and the interpolated pickle name (for the test title) — see open question 4 |
| `Dsl` → `Registry` | Direct mutation of the current scope via a stack | Per-`describeFeature` instance, never a module singleton |
| `Plan` → `ScenarioEffect` | `ScenarioPlan` value objects, fully resolved | No matching, no scope lookup, no layer decisions left to do at this point |
| `ScenarioEffect` → `Runner` | `Effect<void, E, Scope>` (or `Effect<void, E, Shared | Scope>`) | The provision strategy is a parameter, not an implicit branch |
| `Runner` → `@effect/vitest` | Through the `TestApi` interface | The only place `describe`/`it` are named |

---

## Sources

All third-party API claims below were verified by reading the packages installed in this repository, not from training data or search.

- `@cucumber/gherkin@42.0.1` — `dist/index.d.ts`, `dist/Parser.d.ts`, `dist/AstBuilder.d.ts`, `dist/pickles/compile.d.ts`, `dist/pickles/compile.js` (the `astNodeIds: [scenario.id]` / `[scenario.id, valuesRow.id]` and background-stacking behavior read directly from the compiled source). HIGH.
- `@cucumber/messages@34.2.1` — `dist/messages.d.ts` (`Pickle`, `PickleStep`, `PickleTable`, `PickleTag`, `GherkinDocument`, `Feature`, `FeatureChild`, `Rule`, `RuleChild`, `Scenario`, `Background`, `Examples`, `Step`, `TableRow`), `dist/IdGenerator.d.ts`. HIGH.
- `@cucumber/cucumber-expressions@20.1.0` — `dist/index.d.ts`, `dist/CucumberExpression.d.ts`, `dist/ParameterTypeRegistry.d.ts`, `dist/ParameterType.d.ts`, `dist/Argument.d.ts`, `dist/types.d.ts`. HIGH.
- `@effect/vitest@4.0.0-rc.112` — `dist/index.d.ts` (`Vitest.Tester`, `Vitest.Methods`, `Vitest.MethodsNonLive`, `layer`, `effect`, `it`). HIGH.
- `effect@4.0.0-rc.112` — `dist/Effect.d.ts` (`fn`, `ensuring`), `dist/Layer.d.ts` (`provideMerge`), `dist/Context.d.ts` (`Service`), `package.json` exports map (`effect/testing`). HIGH.
- `spec/` — ADR-EC-001 through 014, BEH-EC-001 through 012, `invariants.md`, `glossary.md`, `overview.md`, `roadmap.md`, `process/definitions-of-done.md`. Normative per `AGENTS.md` §1. HIGH.
- Internal module decomposition, build order, and the `TestApi` seam — derived by this research from the above. MEDIUM-HIGH: grounded in verified APIs and the locked spec, but not validated against a shipped implementation.

---
*Architecture research for: Effect-native Gherkin/Cucumber runner for vitest*
*Researched: 2026-08-28*

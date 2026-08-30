# Phase 9: Tags - Pattern Map

**Mapped:** 2026-08-29
**Files analyzed:** 19 (5 modified src, 2 new src, 1 new root config, 1 new script, 4 modified test, 6 spec/planning docs)
**Analogs found:** 17 / 19

Every analog below is an in-repo file that was read in this session. Line numbers are from the
current working tree (clean at `2815e93`). Where no analog exists, the file is listed under
[No Analog Found](#no-analog-found) and the planner should fall back to `09-RESEARCH.md`.

---

## File Classification

| New/Modified File | New? | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|------|-----------|----------------|---------------|
| `packages/vitest/src/TestApi.ts` | mod | interface / seam (types only) | request-response | itself, lines 63-94 + `Errors.ts:190-199` (`UnusedStepDefinitionWarning` plain-data interface) | exact |
| `packages/vitest/src/Plan.ts` | mod | model / transform | transform | itself, lines 224-230 + 599-611 (`ScenarioPlan` field precedent) | exact |
| `packages/vitest/src/Runner.ts` | mod | emitter / walk | event-driven (emission) | itself, lines 342-355 and 380-397 (the two Scenario loops), 217-218 + 329-331 (derived-once helpers) | exact |
| `packages/vitest/src/Tags.ts` | **new** | utility (pure leaf) | transform | `packages/vitest/src/ScenarioKey.ts` (whole file), `packages/vitest/src/Hook.ts:184-241` | exact |
| `packages/vitest/src/describeFeature.ts` | mod | composition root / adapter | request-response | itself, lines 215-223 (`vitestTestApi`), 236-269 (module-scope helpers), 602-712 (overloads + emit call) | exact |
| `packages/vitest/src/Errors.ts` | mod | model (warning type + factory) | transform | itself, lines 160-226 (`UnusedStepDefinitionWarning` + `makeUnusedStepDefinitionWarning`) | exact |
| `packages/vitest/src/GherkinTags.ts` | **new** | utility / config helper | file-I/O + transform | `packages/gherkin/src/Source.ts:45-62` (partial — Effect/FileSystem, not sync) | partial |
| `packages/vitest/src/index.ts` | mod | barrel / config | — | itself, lines 80-115 (export blocks each carrying a rationale comment) | exact |
| `vitest.config.ts` | **new** | config | — | none in repo (`dprint.json` / `.oxlintrc.json` are JSON) | **none** |
| `scripts/verify-testapi-seam.sh` | **new** | CI enforcement script | batch / structural scan | `scripts/verify-no-runner-dep.sh` (whole file) | exact |
| `package.json` (root) | mod | config | — | itself, `scripts` block | exact |
| `.github/workflows/check.yml` | mod | config / CI | — | itself, lines 95-102 (`verify:no-runner-dep` step + its rationale comment) | exact |
| `packages/vitest/test/Runner.test.ts` | mod | test (recording fake) | event-driven | itself, lines 143-222 (`EmissionRecord`, `makeRecordingApi`, `shapeOf`, `thunkAt`) | exact |
| `packages/vitest/test/emission.test.ts` | mod | test (integration, real `describeFeature`) | request-response | itself, lines 1-60 header + its per-block structure | exact |
| `packages/vitest/test/Plan.test.ts` | mod | test (value assertions) | transform | itself | exact |
| `packages/vitest/test/Errors.test.ts` | mod | test (message/contract) | transform | itself | exact |
| `spec/behaviors/02-shared-layers-and-tags.md` | mod | spec (behavior doc) | — | itself, lines 97-113 (`BEH-EC-008` fenced REQUIREMENT block) | exact |
| `spec/decisions/020-…md` **or** new `spec/decisions/026-…md` | mod/new | spec (ADR) | — | `spec/decisions/021-…md:1` + `spec/decisions/015-…md:3` (supersession pair) | exact |
| `spec/traceability.md`, `spec/roadmap.md`, `.planning/REQUIREMENTS.md` | mod | spec / planning | — | `spec/traceability.md:53` (§1 row for behavior 02) | exact |

---

## Pattern Assignments

### `packages/vitest/src/TestApi.ts` (interface / seam, request-response)

**Analog:** itself (lines 63-94) for the interface shape; `packages/vitest/src/Errors.ts:190-199` for
"library-owned plain-data interface, no framework type".

**Existing shape to extend** (`TestApi.ts:63-94`, abbreviated):

```typescript
import type * as Effect from "effect/Effect"
import type * as Scope from "effect/Scope"

export interface TestApi {
  readonly describe: (name: string, define: () => void) => void
  readonly effect: (name: string, self: () => Effect.Effect<void, unknown, Scope.Scope>) => void
}
```

**Hard constraints carried by this file's own doc comment — do not violate, and update the notes in
the same change:**

- Note (a), `TestApi.ts:13-25`: *"No import from `vitest` or `@effect/vitest` may ever appear in this
  file or in `Runner.ts` — not even an `import type`."* The new options type is therefore the
  library's own (RESEARCH Pattern 1), never `TestOptions`.
- Note (b), `TestApi.ts:27-33`: *"`skip` and `only` are deliberately absent… tag routing and `@skip`
  are RUN-05, which is Phase 9's job and the plan that adds them here."* **This note is the reserved
  marker this phase redeems and must be rewritten, not left standing.**
- Closing paragraph, `TestApi.ts:50-58`: *"This module contains types only: no `const`, no function,
  no runtime value at all… Both imports are `import type`."* A predicate helper therefore cannot live
  here — put it in the new `Tags.ts` leaf.

**Plain-data-interface pattern to copy** (`Errors.ts:190-199`) — required fields, `readonly`,
`ReadonlyArray`, doc comment per field:

```typescript
export interface UnusedStepDefinitionWarning {
  readonly _tag: "UnusedStepDefinitionWarning"
  readonly reason: UnusedStepDefinitionWarningReason
  readonly featureName: string
  readonly uri: string
  readonly keyword: string
  readonly pattern: string
  readonly definedAt: Option.Option<string>
  readonly message: string
}
```

**Target shape** (from RESEARCH Pattern 1, adapted to the constraints above):

```typescript
export interface EmitOptions {
  readonly tags: ReadonlyArray<string>
  readonly skip: boolean
}

export interface TestApi {
  readonly describe: (name: string, define: () => void) => void
  readonly effect: (
    name: string,
    self: () => Effect.Effect<void, unknown, Scope.Scope>,
    options: EmitOptions
  ) => void
}
```

**Required, not optional** — the precedent is `describeFeature.ts:696-702`'s "All SEVEN fields" and
`emitFeature`'s own required-map arguments (`Runner.ts:275-285`). RESEARCH Finding 12 makes the same
call for the filter argument.

---

### `packages/vitest/src/Plan.ts` (model / transform, transform)

**Analog:** itself. `ScenarioPlan` already copies three `ParsedScenario` fields; `tags` is the fourth
(RESEARCH Finding 11, Option A).

**Type to extend** (`Plan.ts:215-230`):

```typescript
/**
 * One Scenario, fully planned.
 *
 * `name` is the INTERPOLATED Pickle name and is the `it.effect` title … `astName` is the
 * UN-INTERPOLATED AST name and is the scope-match key … Note (c) has the failure mode of confusing
 * the two.
 */
export type ScenarioPlan = {
  readonly scenarioId: string
  readonly name: string
  readonly astName: string
  readonly ruleId: Option.Option<string>
  readonly steps: ReadonlyArray<PlannedStep>
}
```

**Mapping site to extend** (`Plan.ts:599-611`) — one added line, `tags: scenario.tags`:

```typescript
const scenarios = feature.allScenarios.map((scenario): ScenarioPlan => ({
  scenarioId: scenario.id,
  name: scenario.name,
  astName: scenario.astName,
  ruleId: scenario.ruleId,
  steps: scenario.steps.map((step) => {
    const visible = matcher.match(step.text).filter((match) => isVisibleTo(match.definition, scenario, step))
    for (const match of visible) {
      used.add(match.definition)
    }
    return planStep({ feature, scenario, step, matches: visible })
  })
}))
```

**Documented tension the planner must address in the added field's own comment** (`Plan.ts:232-244`,
`FeaturePlan`'s doc): *"a plan that copied a subset would have to grow a field every time the runner
learned to read one more."* RESEARCH Finding 11 answers it (that sentence is about *Feature*-level
fields; `ScenarioPlan` already copies three Scenario-level ones) — write that answer down, per this
repo's "state the non-obvious in the module comment" norm.

**Source type is `ReadonlyArray<string>` and already flattened** (`packages/gherkin/src/Model.ts:133-136`):

```typescript
  /**
   * `Pickle.tags` names, already flattened by `compile()` in
   * feature then rule then scenario then examples-block order. Do not recompute inheritance.
   */
  readonly tags: ReadonlyArray<string>
```

Keep `ReadonlyArray<string>` all the way down; widen with `[...tags]` only at the adapter
(RESEARCH Finding 10 / Pitfall 8).

---

### `packages/vitest/src/Tags.ts` (utility, transform) — NEW

**Analog:** `packages/vitest/src/ScenarioKey.ts` (a whole leaf module existing for one shared
encoding, imported by both `Runner.ts` and `describeFeature.ts`), and `Hook.ts:184-241` for
"exported const + `emptyX` sentinel + pure combinator".

**Why a module and not a private helper in `Runner.ts`:** `spec/traceability.md:53` already names a
planned `packages/vitest/src/Tags.ts` for behavior doc 02. Creating it satisfies that row as-written;
not creating it means amending the row. Prefer creating it.

**Leaf-module shape to copy** (`ScenarioKey.ts:60` — the entire runtime surface of that file):

```typescript
export const scenarioKey = (ruleId: string | null, name: string): string => `${ruleId ?? "<feature>"} ${name}`
```

**Sentinel-constant + pure-combinator pattern** (`Hook.ts:184-241`):

```typescript
export const emptyHookSet: HookSet = { … }

export const mergeHookSets = (feature: HookSet, rule: HookSet): HookSet => ({ … })
```

**What belongs here** (from RESEARCH Pattern 3 and D-05/D-06/D-07):

```typescript
// Exact-string, case-sensitive matching — CONTEXT.md's discretion note.
// `undefined` and `[]` BOTH mean "no filter" (D-Context "Empty-array filter semantics"): a caller
// computing `excludeTags` from a variable that happens to be empty gets their whole suite, not silence.
const shouldEmit = (tags: ReadonlyArray<string>): boolean =>
  (include.length === 0 || tags.some((t) => include.includes(t))) &&
  !tags.some((t) => exclude.includes(t))
```

Plus the two reserved-tag constants (`"@skip"`, `"@only"`) and the `@skip` predicate. `@only` gets a
named constant with a comment even though nothing branches on it — D-06 says it is deliberately inert,
and `Errors.ts` note structure is the precedent for recording an omission as a decision.

---

### `packages/vitest/src/Runner.ts` (emitter / walk, event-driven)

**Analog:** itself. Three distinct existing patterns to copy.

**1. Derived-once-per-`emitFeature`-call helper** (`Runner.ts:326-331`) — the shape the filter
predicate should take (computed once from the two arrays, before anything is emitted):

```typescript
  // Built once per Feature, before anything is emitted — note (e). `null` when the Feature registers
  // no `BeforeAllScenarios` hook, so a hookless Feature's Scenario thunks stay byte-for-byte what
  // plan 07-04 left them as.
  const beforeAllScenariosCell: Effect.Effect<void, unknown, Scope.Scope> | null = hooks.BeforeAllScenarios.length > 0
    ? makeOnce(runHookBatch(hooks.BeforeAllScenarios).pipe(Effect.provide(layer)))
    : null
```

**2. The two Scenario loops that gain the `continue` and the third `api.effect` argument** —
Feature level (`Runner.ts:342-355`):

```typescript
    for (const scenario of plan.feature.scenarios) {
      const scenarioPlan = planFor(scenario)
      const effectiveLayer = scenarioLayers.get(scenarioKeyFor(scenarioPlan)) ?? layer
      api.effect(
        titleFor(scenarioPlan),
        beforeAllScenariosCell === null
          ? () => buildScenarioEffect({ plan: scenarioPlan, layer: effectiveLayer, hooks })
          : () =>
            Effect.flatMap(
              beforeAllScenariosCell,
              () => buildScenarioEffect({ plan: scenarioPlan, layer: effectiveLayer, hooks })
            )
      )
    }
```

Rule level (`Runner.ts:380-397`) is the same three lines at one more nesting depth, and
`Runner.ts:357-359` explicitly says the duplication is deliberate (*"the shared helper hides the one
property that matters here: which block the node lands in"*). **Apply the filter and the options
argument to BOTH loops; do not factor them together.**

**3. Signature the filter argument joins** (`Runner.ts:275-285`):

```typescript
export const emitFeature = (
  args: {
    readonly api: TestApi
    readonly plan: FeaturePlan
    readonly layer: Layer.Layer<any, any, never>
    readonly hooks: HookSet
    readonly ruleHooks: ReadonlyMap<string, HookSet>
    readonly ruleLayers: ReadonlyMap<string, Layer.Layer<any, any, never>>
    readonly scenarioLayers: ReadonlyMap<string, Layer.Layer<any, any, never>>
  }
): void => {
  const { api, hooks, layer, plan, ruleHooks, ruleLayers, scenarioLayers } = args
```

Every field is required with an explicit "no filter" representation — RESEARCH Finding 12's
recommendation, and `describeFeature.ts:696-702`'s recorded reason for the same choice.

**4. Terminal-safe rendering of an author-controlled string** (`Runner.ts:184-187`) — the pattern the
D-10 exclusion notice and the D-08 undeclared-tag warning must both copy (threat T-06-06-01 /
V5 Input Validation):

```typescript
const warningTitle = (warning: UnusedStepDefinitionWarning): string =>
  `⚠ unused step definition: ${warning.keyword} ${JSON.stringify(warning.pattern)} (${
    Option.getOrElse(warning.definedAt, () => "an unrecorded location")
  })`
```

`JSON.stringify` the tag, never raw interpolation. `afterAllScenariosTitle` (`Runner.ts:197`) is a
bare constant *precisely* to have nothing to forge with — if the exclusion notice ever becomes a test
node title, follow that instead.

**5. Note (e) must be amended** (`Runner.ts:100-112`) — it currently argues `AfterAllScenarios`
"runs always" as a virtue. CONTEXT's resolved decision suppresses it when every Scenario is skipped or
filtered out. The `AfterAllScenarios` emission site is `Runner.ts:404-411`:

```typescript
    if (hooks.AfterAllScenarios.length > 0) {
      api.effect(afterAllScenariosTitle, () => { … })
    }
```

The condition grows a second conjunct; the note grows a paragraph saying so (AGENTS.md §4).

**6. Note (a) (`Runner.ts:18-30`) deliberately never spells the forbidden package names** so the
acceptance grep cannot false-positive on a citation. Any comment this phase adds to `Runner.ts` or
`TestApi.ts` must keep that discipline — and `scripts/verify-testapi-seam.sh` must strip comments the
same way `verify-no-runner-dep.sh` does.

---

### `packages/vitest/src/describeFeature.ts` (composition root / adapter, request-response)

**Analog:** itself. Four sites.

**1. The adapter that becomes a factory** (`describeFeature.ts:215-223`):

```typescript
/**
 * The concrete `TestApi`, built once at module scope — note (e).
 *
 * `describe` is vitest's own and is re-exported by the package this module imports it from; the
 * Effect-aware test constructor is that package's, and its `self` parameter is
 * `() => Effect<A, E, Scope>`, which is exactly what `TestApi.effect` declares …
 */
const vitestTestApi: TestApi = { describe, effect: it.effect }
```

RESEARCH Pattern 2 turns this into `const vitestTestApi = (featureUri: string): TestApi => ({ … })`
so the catch-and-degrade warning can name the `.feature` file. **Note (e) says "built once at module
scope" and must be updated in the same change** (RESEARCH, line 824-826).

**2. Module-scope pure helper with a long rationale** (`describeFeature.ts:239-269`) — the shape the
new tag-option normaliser should take:

```typescript
const resolveRuleId = (feature: ParsedFeature, name: string): string => {
  const match = feature.rules.find((rule) => rule.name === name)
  return match === undefined ? `unregistered-rule:${name}` : match.id
}
```

and `normalizeLayer` (`describeFeature.ts:236-237`) for the "collapse an over-permissive public
argument into the single internal value" idiom:

```typescript
const normalizeLayer = (layer: LayerArgument): Layer.Layer<any, any, never> =>
  "perScenario" in layer ? Layer.merge(layer.shared, layer.perScenario) : layer
```

**3. Terminal warning channel — where the D-08 warning and the D-10 exclusion notice go**
(`describeFeature.ts:680-691`):

```typescript
  // D-02 channel 1, and it lives HERE rather than inside `collect` deliberately: `collectFeature`
  // runs that same implementation and must stay SILENT, or every test asserting on
  // `plan.warnings` would also print the warnings it is asserting on.
  //
  // `warning.message` is passed straight through, never rebuilt and never reformatted. …
  for (const warning of collection.plan.warnings) {
    console.warn(warning.message)
  }
```

Two rules fall out and both apply to the new output: (a) it lives in `describeFeature`'s own body,
never in `collect`, so `collectFeature` stays silent; (b) `message` is built once by its factory and
passed through, never reformatted at the call site.

**4. The overloads that gain a 4th optional parameter** (`describeFeature.ts:657-676`):

```typescript
export function describeFeature<RShared, RScenario, E1, E2>(
  feature: ParsedFeature,
  layer: {
    readonly shared: Layer.Layer<RShared, E1, never>
    readonly perScenario: Layer.Layer<RScenario, E2, never>
  },
  define: (dsl: FeatureDsl<RShared | RScenario>) => void
): void
// The plain-Layer overload is LAST, and must stay last — note (a). This is the one TypeScript
// reports against, and the one `effect(missingLayerContext)` fires from.
export function describeFeature<ROut, E>(
  feature: ParsedFeature,
  layer: Layer.Layer<ROut, E, never>,
  define: (dsl: FeatureDsl<ROut>) => void
): void
export function describeFeature(
  feature: ParsedFeature,
  layer: LayerArgument,
  define: (dsl: FeatureDsl<any>) => void
): void {
```

`collectFeature` mirrors these *including the order* (`describeFeature.ts:600` and 602-621) — **four
overload declarations to edit, not two.** The enforcing gate is `scripts/verify-tsgo-gate.sh:250-253`,
whose failure text names this exact cause. RESEARCH A1 says settle it by running
`pnpm verify:tsgo-gate` **early**, not at the end.

**5. The `emitFeature` call that gains the filter argument** (`describeFeature.ts:696-711`):

```typescript
  // All SEVEN fields, and the last three are not optional extras: `hooks` is the FEATURE-level set
  // alone … which is why `emitFeature` declares them required rather than defaulting a missing map
  // to an empty one.
  emitFeature({
    api: vitestTestApi,
    plan: collection.plan,
    layer: collection.layer,
    hooks: collection.hooks,
    ruleHooks: collection.ruleHooks,
    ruleLayers: collection.ruleLayers,
    scenarioLayers: collection.scenarioLayers
  })
```

The "All SEVEN fields" comment becomes "All EIGHT/NINE" — update the count, do not leave it stale.

---

### `packages/vitest/src/Errors.ts` (model, transform)

**Analog:** itself, lines 160-226. The D-08 undeclared-tag warning is the *same kind of thing* as
`UnusedStepDefinitionWarning`: non-fatal, never in an error channel, presented on a terminal channel.

**Interface + reason-union + factory triple to copy** (`Errors.ts:160-226`, condensed):

```typescript
export type UnusedStepDefinitionWarningReason = "UnusedStepDefinition"

export interface UnusedStepDefinitionWarning {
  readonly _tag: "UnusedStepDefinitionWarning"
  readonly reason: UnusedStepDefinitionWarningReason
  readonly featureName: string
  readonly uri: string
  readonly keyword: string
  readonly pattern: string
  readonly definedAt: Option.Option<string>
  readonly message: string
}

export const makeUnusedStepDefinitionWarning = (args: {
  reason: UnusedStepDefinitionWarningReason
  featureName: string
  uri: string
  keyword: string
  pattern: string
  definedAt?: string
  message: string
}): UnusedStepDefinitionWarning => ({
  _tag: "UnusedStepDefinitionWarning",
  reason: args.reason,
  … 
  definedAt: Option.fromUndefinedOr(args.definedAt),
  message: args.message
})
```

**Constraints from this module's own notes:**

- Note (c), `Errors.ts:56-69`: a *warning* is an interface plus a factory, **not** a
  `Schema.TaggedError`. `Schema.TaggedError` is only for things that enter an error channel.
- Note (d), `Errors.ts:71-80`: **message content is NEVER truncated** — no ellipsis, no max length.
  `packages/vitest/test/Errors.test.ts` asserts an exact `message.length`, so a new warning type needs
  a matching exact-length assertion there.
- Note (e), `Errors.ts:82-85`: this module has **no local imports**; only `effect/Option` and
  `effect/Schema`. The new warning must not import `Tags.ts` or anything else local.
- Closing paragraph, `Errors.ts:87-92`: any type meant for a consumer names the plan that owns the
  `index.ts` barrel edit. Follow that convention for the new type.

**Message-prefix convention** (`Plan.ts:246-264`) — `uri:line: <reason>: …`, and quote author input:

```typescript
const at = (uri: string, line: number): string => `${uri}:${line}: `
const quoted = (value: string): string => JSON.stringify(value)
```

The D-08 warning has a uri and a Scenario name but no line, so the `at` helper is a partial fit —
name the `.feature` uri, the Scenario title and the `JSON.stringify`'d tag, and link
`https://vitest.dev/guide/test-tags` (RESEARCH Finding 3).

---

### `packages/vitest/src/GherkinTags.ts` (utility / config helper, file-I/O + transform) — NEW, D-09

**Analog:** `packages/gherkin/src/Source.ts:45-62` — **partial match only.** It is the repo's only
file-reading module, but it reads through `effect`'s `FileSystem` service and is therefore
Effect-returning and async:

```typescript
import * as FileSystem from "effect/FileSystem"

… Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem
  return yield* fs.readFileString(path, "utf8").pipe( … )
})
```

**Why it does not transfer directly** — three verified constraints the planner must design around:

1. `vitest.config.ts` evaluates `gherkinTags(glob)` at config-load time. `loadFeature.ts:39-42`
   records that `Effect.runSync` on `NodeFileSystem.readFileString` **throws `AsyncFiberError`** —
   it suspends internally. So the `Source.ts` route requires `Effect.runPromise` and an `async`
   config export, or a different (node-native, sync) read.
2. `packages/vitest/package.json` declares `"engines": { "node": ">=20" }`. `fs.globSync` landed in
   Node 22. A glob dependency is therefore real new surface — `tinyglobby@0.2.17` is already in the
   lockfile (transitively, via vitest) but is **not** a declared dependency of any workspace package.
   The planner must either declare it, or hand-roll a `readdir` walk, or accept an explicit file list.
3. `@effect-cucumber/gherkin`'s barrel exports `parseFeature` (`packages/gherkin/src/index.ts:59`),
   which requires a `ParameterTypeStore` and returns an Effect. A regex scan for tag lines is the
   cheaper route and needs no runtime; the trade-off (a regex cannot see `Examples:`-block tags the
   way `compile()` does — though it *can* see every literal `@tag` token in the file, which is exactly
   the set `test.tags` must declare) should be written into the module's doc comment.

**Security control (Security Domain V12, CONTEXT D-09):** explicit glob argument, **never** a
recursive default. State it in the module comment the way `ScenarioKey.ts` and `Errors.ts` state
their own constraints.

**Barrel-export shape** — this is new *public* surface, so it needs an `index.ts` entry with a
rationale comment (see below).

---

### `packages/vitest/src/index.ts` (barrel)

**Analog:** itself. Every export block carries a paragraph explaining *why it is public*.

**Export-with-rationale pattern** (`index.ts:95-115`):

```typescript
/**
 * The two channels step drift reaches a consumer through (BEH-EC-013, ADR-EC-019).
 *
 * `StepMatchError` is the FAILURE … It arrives in a failing Scenario's error channel, which is a
 * value a consumer catches and narrows on `reason` …
 *
 * `UnusedStepDefinitionWarning` is NOT a failure … It is exported specifically so 06-CONTEXT.md
 * D-02's channel 3 — the structured list — is inspectable and assertable by a consumer …
 */
export { StepMatchError } from "./Errors.ts"
export type { StepMatchErrorReason, UnusedStepDefinitionWarning, UnusedStepDefinitionWarningReason } from "./Errors.ts"
```

**Two stale paragraphs in this file that this phase must rewrite:**

- `index.ts:43-44`: *"tag routing, `@skip` and the `@only` policy are Phase 9 (RUN-05), so a tag is
  currently inert"* — false once this phase lands.
- `index.ts:55-77` ("Deliberately NOT exported") — `TestApi` and `emitFeature` stay internal, but the
  paragraph names `TestApi` explicitly and now also needs `EmitOptions` and `Tags.ts` covered, plus
  the new `gherkinTags` and the options type moved to the *exported* side.

**Export policy** (`index.ts:49-53`): single barrel, no subpath. `gherkinTags` goes in the same barrel
— a `@effect-cucumber/vitest/config` subpath would need entries in **both** `exports` and
`publishConfig.exports` in `package.json` or it 404s for consumers.

---

### `scripts/verify-testapi-seam.sh` (CI enforcement script, batch) — NEW, D-11

**Analog:** `scripts/verify-no-runner-dep.sh` — **exact structural match.** Copy its method wholesale
and change only the scanned paths, the forbidden specifiers, and the positive control.

**Header + METHOD NOTE** (`verify-no-runner-dep.sh:16-47`) — the load-bearing part:

```bash
# METHOD NOTE (do not weaken this):
#   `pnpm test` exiting 0 does NOT prove any of this. Observation cannot
#   distinguish "has no capability" from "has the capability and did not use
#   it today". Only a structural scan can, and that is what this script is.
#
#   Comment lines are stripped before any occurrence is counted. Several
#   modules under src/ name `effect` and `ADR-EC-021` in their doc comments.
#   Counting raw text would make the gate self-invalidating: documenting the
#   rule would violate it.
#
#   Assertion 1 is a positive control. Without it, a moved or renamed source
#   tree makes assertions 2 and 3 pass by scanning nothing. STATE.md 01-02
#   records a grep-based gate in this repo that passed, and was then proven
#   vacuous by mutation testing. That is why every assertion here has a
#   control and why this script is mutation-tested.
```

**Regex trio to copy verbatim** (`verify-no-runner-dep.sh:64-83`) — note the backtick in the quote
class and the reason for it:

```bash
FORBIDDEN_RE='(vitest|@effect/vitest|@effect/platform-node|@effect/platform-bun|@effect/platform-deno)'

# The quote class includes a backtick, not only `"`/`'`: a dynamic `import()`
# accepts any expression, including a plain template literal with no
# interpolation (`import(\`vitest\`)`), which is valid TypeScript and would
# otherwise silently bypass this scan.
IMPORT_RE="(^|[^A-Za-z0-9_\$])(from|import|require)[[:space:]]*\(?[[:space:]]*[\"'\`]${FORBIDDEN_RE}(/[^\"'\`]*)?[\"'\`]"

CONTROL_RE="(^|[^A-Za-z0-9_\$])(from|import|require)[[:space:]]*\(?[[:space:]]*[\"'\`]@cucumber/gherkin[\"'\`]"

COMMENT_RE='^[0-9]+:[[:space:]]*(//|\*|/\*)'
```

**Comment-stripping scan function** (`verify-no-runner-dep.sh:104-107`):

```bash
scan() {
  local file="$1" pattern="$2"
  grep -n '' "$file" | grep -vE "$COMMENT_RE" | grep -E "$pattern" || true
}
```

**Preconditions + positive control + gate** (`verify-no-runner-dep.sh:94-152`):

```bash
[[ -d "$SRC_DIR" ]] || fail "missing directory $SRC_DIR — the tree this gate scans is absent, so nothing was verified."
SRC_FILES="$(find "$SRC_DIR" -type f -name '*.ts' | sort)"
[[ -n "$SRC_FILES" ]] || fail "no .ts files found under $SRC_DIR — the scan would be vacuous."
…
if [[ "$CONTROL_HITS" -eq 0 ]]; then
  fail "positive control found ZERO imports of \"@cucumber/gherkin\" under $SRC_DIR — the scan is not reaching real import lines, so its silence proves nothing. …"
fi
```

**Adaptation notes specific to this script:**

- Targets are exactly two FILES, not a directory: `packages/vitest/src/Runner.ts` and
  `packages/vitest/src/TestApi.ts`. Precondition on each file with `[[ -f … ]]`.
- A positive control is still mandatory. `TestApi.ts` imports only `effect/Effect` and `effect/Scope`
  (`TestApi.ts:60-61`); `Runner.ts` imports `@effect-cucumber/gherkin` and six `effect/*` submodules
  (`Runner.ts:164-176`). A control matching `effect/Effect` (present in `Runner.ts:166`) or
  `effect/Scope` (present in both, `Runner.ts:169`, `TestApi.ts:61`) proves the scan reaches real
  import lines in each file.
- The forbidden set is `vitest` and `@effect/vitest` only (the platform packages are not the concern
  here). `import type` must be caught — the `IMPORT_RE` above already matches `from "…"` in a
  `import type … from "…"` line.
- **Do not spell the forbidden package names in the new script's prose beyond the variable
  assignment** — same reason `Runner.ts:18-21` refuses to: a citation must not be able to
  false-positive its own gate.
- Register it in `package.json` `scripts` as `"verify:testapi-seam": "bash scripts/verify-testapi-seam.sh"`
  next to `"verify:no-runner-dep"`.

---

### `.github/workflows/check.yml` (CI config)

**Analog:** its own `verify:no-runner-dep` step (`check.yml:95-102`), which carries the
"pnpm test exiting 0 does NOT prove …" rationale comment above the `run:` line:

```yaml
      # `pnpm test` exiting 0 does NOT prove @effect-cucumber/gherkin cannot
      # … consumer-facing dependency field. See scripts/verify-no-runner-dep.sh.
      - run: pnpm verify:no-runner-dep
      - run: pnpm verify:spec
```

Add `- run: pnpm verify:testapi-seam` in the same job, with the same shape of comment. If the phase
also adds a `--tagsFilter` CI assertion (RESEARCH Wave 0 gap 2), it belongs in the job that runs
`pnpm test` (`check.yml:78-79`).

---

### `packages/vitest/test/Runner.test.ts` (test, recording fake)

**Analog:** itself, lines 143-222. `TestApi.ts` note (b) predicts exactly this edit ("force 06-06's
recording fake to implement two members no assertion covers") and RESEARCH's Alternatives table
resolves it: the options **field** on `effect` means the fake grows a field, not a method.

**Record type to extend** (`Runner.test.ts:143-160`):

```typescript
type EmissionRecord = {
  readonly kind: "describe" | "effect"
  readonly name: string
  readonly depth: number
  readonly self: (() => Effect.Effect<void, unknown, Scope.Scope>) | null
}
```

**Fake to extend** (`Runner.test.ts:177-198`):

```typescript
const makeRecordingApi = (): {
  readonly api: TestApi
  readonly records: ReadonlyArray<EmissionRecord>
} => {
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

`effect` gains a third parameter recorded onto the record (`tags`, `skip`). A `describe` record has no
options — `null`, exactly as `self` is `null` there today, and for the reason lines 150-153 give.

**Comparable projection to extend** (`Runner.test.ts:200-204`) — this is what most assertions compare,
so tags/skip must be added here or the new assertions cannot see them:

```typescript
const shapeOf = (
  records: ReadonlyArray<EmissionRecord>
): ReadonlyArray<{ readonly kind: string; readonly name: string; readonly depth: number }> =>
  records.map(({ depth, kind, name }) => ({ kind, name, depth }))
```

**Hand-built fixtures that gain a `tags` field:** every literal `ScenarioPlan` in this file (Finding 11
Option A's stated cost). Grep for `scenarioId:` to find them.

---

### `packages/vitest/test/emission.test.ts` (test, integration)

**Analog:** itself. Its header (lines 1-60) states the rules any new block must follow:

- *"This is the ONLY file in this repo that calls `describeFeature` for real."* — the runtime halves
  of SC1/SC2/SC3 go here and nowhere else.
- *"The Feature is deliberately, entirely happy-path"* — a new `@skip` block is safe (a skipped test
  reports `↓`, not red); a block designed to *fail* is not. RESEARCH's Test Map wants a `@skip`
  Scenario "whose body would throw" — that is safe **only because** the body is never invoked
  (Finding 5); say so in the block's comment, because the safety is non-obvious.
- The module-scope-counter idiom for proving a hook did **not** run is already used in this file for
  the terminal-channel block ("Why the terminal-channel block stubs at MODULE scope and asserts inside
  an `it`", line ~60) — copy it for SC2's "`Before`/`After` do not run for a skipped Scenario".
- The `AfterAllScenarios` block already argues why a fake cannot cover execution — the same argument
  applies to the fully-skipped-Feature suppression case.

**Blocked on Wave 0:** every assertion here that emits a tag needs `vitest.config.ts` to declare it
(Finding 1), or it fails the whole file to `0 tests`.

---

### `spec/behaviors/02-shared-layers-and-tags.md` (spec)

**Analog:** itself, lines 97-113. The fenced plain-text `REQUIREMENT:` block plus a `> **See:**` link
is the format; the worked example is a `typescript` fence (AGENTS.md §2 = compiled example).

**Block to amend** (lines 97-113) — the last sentence is the MUST-level text D-01–D-03 contradict:

```
## BEH-EC-008: Tags map to vitest's native tag system; `@skip` also routes to `it.effect.skip`

> **See:** [ADR-EC-020](../decisions/020-vitest-native-tags-for-skip-only.md)

REQUIREMENT: Every tag on a Scenario (including inherited Feature/Rule/
             Examples tags) MUST be emitted as a native vitest tag on the
             generated it.effect call. …
             excludeTags-style filtering MUST be
             implemented as native vitest tag filtering (--tagsFilter), not
             a describeFeature-time registration filter.
```

Also amend: the worked example (lines 115-134+, a `typescript` fence that must still compile if
`describeFeature` grows a 4th parameter it shows), and add the config-declaration prerequisite
(Finding 2) so the doc stays true per AGENTS.md §4.

---

### `spec/decisions/020-…md` (amend) or a new `spec/decisions/026-…md` (supersede)

**Analog for the supersession pair:** `spec/decisions/021-…md:1` (title carries the supersession) and
`spec/decisions/015-…md:3` (the superseded ADR gets a one-line status banner):

```markdown
# ADR-EC-021: `effect` and `@effect/platform` become peer dependencies of `@effect-cucumber/gherkin`, pinned to v4 only — supersedes ADR-EC-015
```

```markdown
> **Status:** Superseded by [ADR-EC-021](021-effect-and-platform-are-peer-dependencies-of-gherkin.md) — `@effect-cucumber/gherkin`'s "no `effect` dependency at all" clause no longer holds; the peer-dependency mechanism for `@effect-cucumber/vitest` described below is unaffected and still applies.
```

**Analog for an in-place amendment block:** `spec/decisions/021-…md:68`:

```markdown
> **This ADR's Decision is amended, not superseded:** … What changes is that …
```

**ADR-EC-020's own header format** (lines 1-6) and sections (`## Context`, `## Decision`,
`## Consequences` with `**Positive**` / `**Negative**` / `**Trade-off accepted**`):

```markdown
# ADR-EC-020: `@skip`/`@only` and future custom tags map to vitest v4's native tag system

> **Status:** Accepted
> **Date:** 2026-08-28
> **Context:** GSD Stack/Pitfalls research found vitest v4 shipped a native tag mechanism after the original tag-routing decision was made
```

**What must change** (RESEARCH "Spec Reconciliation Required"): the Decision's fourth bullet
(lines 38-42, the `--tagsFilter`-not-a-registration-filter clause), and the Negative Consequences'
"config-time tag-declaration mechanics need confirming" (lines 61-64) — they are now confirmed, and
the answer changes the ADR's own `@only` story to "`--tagsFilter '@only'` **plus** a `test.tags`
declaration".

**If superseding rather than amending:** next free id is **ADR-EC-026** (`spec/decisions/` currently
ends at `025-datatable-wrapper-accessor-contract.md`), allocated contiguously per AGENTS.md §6, with a
matching entry appended to `spec/decisions/index.yaml` (`id` / `file` / `title` triple, lines 5+).

---

### `spec/traceability.md` / `spec/roadmap.md` / `.planning/REQUIREMENTS.md`

**Analog:** `spec/traceability.md:53` — the §1 row for behavior doc 02, which **already names a
planned `Tags.ts`**:

```
| [02 — Background, hooks, shared Layers, and tags](behaviors/02-shared-layers-and-tags.md)    | BEH-EC-005–008             | `packages/vitest/src/{ScenarioEffect,Hook,HookRegistry,Dsl,Runner,describeFeature,SharedLayer,Tags}.ts` — the first six are real (hooks); `SharedLayer`/`Tags` remain planned (Phases 9/10). No Background module — see the preamble. |
```

Creating `packages/vitest/src/Tags.ts` (see above) lets this row become "…the first seven are real;
`SharedLayer` remains planned (Phase 10)". Not creating it means restructuring the row instead.

Gate: `bash spec/scripts/verify-traceability.sh` (= `pnpm verify:spec`, run in CI at
`check.yml:102`) must pass after any of these edits.

---

## Shared Patterns

### Module doc comment as the primary artifact
**Source:** `packages/vitest/src/Runner.ts:1-163`, `TestApi.ts:1-59`, `describeFeature.ts:1-77`
**Apply to:** every `packages/vitest/src` file this phase touches or creates.

Every module in this package opens with a long doc comment structured as *"N things about this module
are not visible from the code"*, lettered `(a)`…`(f)`, each stating a decision, the plausible
"improvement" that would undo it, and why nothing would go red if it did. New modules follow the
format; touched modules get their notes **amended, not left stale** — AGENTS.md §4. Specifically stale
after this phase: `TestApi.ts` note (b), `Runner.ts` note (e), `describeFeature.ts` note (e),
`index.ts:43-44` and `index.ts:55-77`.

### Author-controlled strings are `JSON.stringify`'d before rendering
**Source:** `packages/vitest/src/Plan.ts:257-264`, `packages/vitest/src/Runner.ts:184-187`
**Apply to:** the D-08 undeclared-tag warning, the D-10 exclusion notice, any new node title.

```typescript
const quoted = (value: string): string => JSON.stringify(value)
```

Threats T-06-06-01 / T-06-07-01: a tag containing a quote, newline or ANSI escape must not be able to
forge a second reporter line. `Runner.ts:197`'s `afterAllScenariosTitle` shows the stronger form —
a constant with nothing to interpolate.

### Submodule namespace imports
**Source:** `packages/vitest/src/Runner.ts:164-176`
**Apply to:** every new import in this phase.

```typescript
import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import type * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import type * as Scope from "effect/Scope"
```

Never `import { Effect } from "effect"`. Enforced by the vendored oxlint rule
`effect(no-import-from-barrel-package)` (`pnpm verify:oxlint-plugin`). Local imports carry the `.ts`
extension (`import type { FeaturePlan, ScenarioPlan } from "./Plan.ts"`).

### `ReadonlyArray` upstream, mutable copy only at the framework boundary
**Source:** `Model.ts:133-136` → `Plan.ts:229` → `Runner.ts` → `describeFeature.ts` adapter
**Apply to:** the whole tag path.

`ReadonlyArray<string>` everywhere; `[...options.tags]` exactly once, in `describeFeature.ts`'s
`vitestTestApi`, because vitest's `TestOptions.tags` is `string[]` (RESEARCH Finding 10, Pitfall 8).

### Required fields over optional ones, with an explicit "absent" representation
**Source:** `describeFeature.ts:696-702` ("All SEVEN fields…"), `Runner.ts:275-285`,
`FeatureCollection.hooks`'s field comment (`describeFeature.ts:150-155`, *"REQUIRED, not optional —
… an optional field would let a later consumer forget hooks exist"*)
**Apply to:** `EmitOptions`, the `emitFeature` filter argument.

RESEARCH Finding 12 reaches the same conclusion independently. The public `describeFeature` 4th
parameter is the one exception (optional, for backwards compatibility) — normalise it to a required
internal value at the composition root, exactly as `normalizeLayer` does for the layer argument.

### Sentinel / "no filter" semantics stated in the field's own comment
**Source:** `describeFeature.ts:246-269` (`resolveRuleId`'s sentinel argument),
`describeFeature.ts:191-212` (`scenarioLayers`' *"The two-argument form adds NO entry, and that
absence is the contract rather than an optimisation"*)
**Apply to:** `includeTags: []` / `excludeTags: []` meaning "no filter", never "match nothing".

### Structural CI gates carry a positive control and a METHOD NOTE
**Source:** `scripts/verify-no-runner-dep.sh:16-47` and `:109-126`
**Apply to:** `scripts/verify-testapi-seam.sh`.

*"Observation cannot distinguish 'has no capability' from 'has the capability and did not use it
today'."* Every assertion gets a control; comment lines are stripped before counting so documenting
the rule cannot violate it.

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `vitest.config.ts` (repo root) | config | — | The repo has **no** vitest/vite config at all (RESEARCH Finding 15, verified by `find`). `dprint.json` / `.oxlintrc.json` / `tsconfig.base.json` are JSON with different semantics. Use RESEARCH's Finding 15 / Code Examples block verbatim, including its two "things NOT to do" (never set `include`/`exclude`; never set `strictTags: false`) and the `allowOnly: false` rationale comment. Verify RESEARCH A5 by comparing test counts before and after the file lands. |
| Child-process / nested-`vitest` test for the D-08 degradation path | test | batch | `grep -rn "child_process\|execFile\|spawn\|startVitest"` over `packages/*/test` returns nothing (RESEARCH, Sampling Rate note). Introducing one is genuinely new capability. RESEARCH's cheaper alternatives: a second config file plus a `package.json` script CI runs, or a documented manual verification step. Planner must pick one explicitly. |

**Partial-analog files (listed above, repeated here so the planner does not over-trust the analog):**

- `packages/vitest/src/GherkinTags.ts` — `packages/gherkin/src/Source.ts` is the only file-reading
  analog and its Effect/`FileSystem` shape does **not** transfer to a synchronous config-load-time
  helper (`loadFeature.ts:39-42` records that `Effect.runSync` throws `AsyncFiberError` on that path).
  Node `>=20` engines constraint rules out `fs.globSync`. No glob package is a declared dependency of
  any workspace package today.

---

## Metadata

**Analog search scope:** `packages/vitest/src`, `packages/vitest/test`, `packages/gherkin/src`,
`scripts/`, `spec/`, `.github/workflows/`, repo root.
**Files read this session:** `packages/vitest/src/{TestApi,Runner,index,Errors,describeFeature}.ts`
(full), `packages/vitest/src/Plan.ts` (lines 200-270, 560-628), `packages/vitest/test/Runner.test.ts`
(lines 130-240), `packages/vitest/test/emission.test.ts` (header),
`packages/gherkin/src/{Model.ts (133-185), loadFeature.ts (180-197), index.ts (exports)}`,
`scripts/verify-no-runner-dep.sh` (full), `scripts/verify-tsgo-gate.sh` (238-263),
`spec/decisions/020-…md` (full), `spec/behaviors/02-shared-layers-and-tags.md` (85-134),
`spec/traceability.md` (45-60), `spec/{behaviors,decisions}/index.yaml` (heads),
`.github/workflows/check.yml` (grep), root and `packages/vitest` `package.json`.
**Project instructions:** No `CLAUDE.md`. `AGENTS.md` is the normative equivalent (per RESEARCH). No
`.claude/skills/` or `.agents/skills/` directory exists.
**Pattern extraction date:** 2026-08-29

# Phase 6: Plan, Scenario-Effect, Runner Emission, and Drift Detection - Pattern Map

**Mapped:** 2026-08-29
**Files analyzed:** 15 (9 new, 6 modified)
**Analogs found:** 12 / 15 (3 have no analog in this repo)

> **Note on stale research.** `ARCHITECTURE.md` predates ADR-EC-021/023 and describes
> `@effect-cucumber/gherkin` as "synchronous, no Effect". That is no longer true —
> `loadFeature`/`parseFeature` return `Effect`, `ParameterTypeStore` is a `Context.Service`, and
> `Errors.ts` uses `Schema.TaggedError`. Prefer the **real codebase excerpts below** over
> ARCHITECTURE.md's code sketches wherever the two disagree.

---

## File Classification

| New/Modified File | New? | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|------|-----------|----------------|---------------|
| `packages/vitest/src/Errors.ts` | new | error model / config | pure data | `packages/gherkin/src/Errors.ts` | **exact** |
| `packages/vitest/src/Plan.ts` | new | service (join + resolve) | batch transform | `packages/gherkin/src/Validate.ts` | **exact** |
| `packages/vitest/src/Snippet.ts` (optional) | new | utility (message builder) | pure transform | `packages/gherkin/src/StepPatternMessages.ts` | **exact** |
| `packages/vitest/src/ScenarioEffect.ts` | new | service (Effect builder) | transform → Effect | `packages/vitest/src/Step.ts` | role-match |
| `packages/vitest/src/TestApi.ts` | new | contract (types only) | request-response seam | `packages/vitest/src/Dsl.ts` | **exact** |
| `packages/vitest/src/Runner.ts` | new | controller / emitter | event-driven emission | `packages/vitest/src/describeFeature.ts` (`collect`) | partial — **no describe/it analog exists** |
| `packages/vitest/src/Registry.ts` | mod | model / store | CRUD | itself + `ParameterTypes.ts#ParameterTypeDefinition` | **exact** |
| `packages/vitest/src/describeFeature.ts` | mod | composition root | request-response | `packages/gherkin/src/loadFeature.ts` | **exact** |
| `packages/vitest/src/index.ts` | mod | config (barrel) | n/a | `packages/gherkin/src/index.ts` | **exact** |
| `packages/vitest/package.json` | mod (maybe) | config | n/a | `packages/gherkin/package.json` | **exact** |
| `packages/vitest/test/Plan.test.ts` | new | test | n/a | `packages/gherkin/test/Validate.test.ts` + `test/describeFeature.test.ts` | **exact** |
| `packages/vitest/test/ScenarioEffect.test.ts` | new | test | n/a | `packages/vitest/test/Step.test.ts` | **exact** |
| `packages/vitest/test/Runner.test.ts` | new | test (recording fake) | n/a | — | **none** |
| `packages/vitest/test/Errors.test.ts` (or Contracts) | new | test | n/a | `packages/gherkin/test/Contracts.test.ts` | role-match |
| `packages/vitest/test/describeFeature.test.ts` | mod | test | n/a | itself | **exact** |

**Data-flow note:** `Plan.ts` is the only fan-in point. Everything downstream of it
(`ScenarioEffect`, `Runner`) consumes fully-resolved value objects — per ARCHITECTURE.md's
"Internal boundaries" table, no matching, scope lookup, or Layer decision may survive past `Plan`.

---

## Pattern Assignments

### `packages/vitest/src/Errors.ts` — NEW (error model, pure data)

**Analog:** `packages/gherkin/src/Errors.ts` (exact — same role, same package family, same author)

This is the reserved-name file. `Errors.ts` line 72-75 explicitly reserves `StepMatchError` for
this phase and forbids merging it into `StepPatternError`.

**Imports pattern** (`packages/gherkin/src/Errors.ts:97-98`):
```typescript
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
```

**Reason union — string-literal union, never an enum** (`Errors.ts:104-114`):
```typescript
/**
 * Why a `LoadFeatureError` was raised. One member per Group A / Group B row of the phase
 * fixture table. A union type rather than an enum: `erasableSyntaxOnly` forbids enums.
 */
export type LoadFeatureErrorReason =
  | "MissingFile"
  | "ParseFailed"
  ...
```

**Error class shape — copy this literally** (`Errors.ts:128-145`):
```typescript
export class LoadFeatureError extends Schema.TaggedError<LoadFeatureError>()("LoadFeatureError", {
  reason: Schema.Literals([
    "MissingFile",
    "ParseFailed",
    ...
  ]),
  uri: Schema.String,
  line: Schema.OptionFromUndefinedOr(Schema.Number),
  message: Schema.String,
  cause: Schema.OptionFromUndefinedOr(Schema.Unknown)
}) {}
```

Four hard constraints recorded in that file's doc comment (`Errors.ts:15-48`), all verified against
the installed `effect@4.0.0-rc.112` — **do not rediscover them**:
1. `Schema.Literals([...])` (plural, array form). `Schema.Literal(a, b, c)` (variadic) **throws** as
   a `Schema.TaggedError` field in this rc build.
2. `Schema.Defect` (bare or `Schema.optional`-wrapped) **throws** at construction. Use
   `Schema.OptionFromUndefinedOr(Schema.Unknown)` for `cause`.
3. Every optional field is `Schema.OptionFromUndefinedOr`, so the constructor requires an explicit
   `Option.some(x)` / `Option.none()`. **Omitting the key fails construction outright.**
4. **No custom constructor.** `@effect/tsgo`'s `overriddenSchemaConstructor` diagnostic rejects any
   constructor override on a `Schema.TaggedError` subclass.

**Warning type shape — the `LoadFeatureWarning` precedent D-02 says to follow**
(`Errors.ts:325-351`). Note it is a **plain interface, not a class**, with a `_tag` literal and a
factory that does the `Option` wrapping so call sites keep a plain `line?: number`:
```typescript
export interface LoadFeatureWarning {
  readonly _tag: "LoadFeatureWarning"
  readonly reason: LoadFeatureWarningReason
  readonly uri: string
  readonly line: Option.Option<number>
  readonly message: string
}

export const makeWarning = (args: {
  reason: LoadFeatureWarningReason
  uri: string
  line?: number
  message: string
}): LoadFeatureWarning => ({
  _tag: "LoadFeatureWarning",
  reason: args.reason,
  uri: args.uri,
  line: Option.fromUndefinedOr(args.line),
  message: args.message
})
```

**D-02's new warning type must be a NEW type in `@effect-cucumber/vitest`, not a reuse of
`LoadFeatureWarning`** (CONTEXT.md D-02 is explicit). Copy the shape, not the identity.

---

### `packages/vitest/src/Plan.ts` — NEW (service, batch transform)

**Analog:** `packages/gherkin/src/Validate.ts` (exact — same shape of work: walk a correlated model,
throw the first fatal finding in document order, accumulate non-fatal findings).
Secondary analog: `packages/gherkin/src/StepMatcher.ts` for the matcher-consumption side.

**Imports pattern** (`Validate.ts:45-56`) — `effect/Array` and `effect/Option` by namespace, local
modules by explicit `.ts` path, never `./index.ts`:
```typescript
import * as Arr from "effect/Array"
import * as Option from "effect/Option"
import {
  type AstRuleInfo,
  type AstScenarioInfo,
  ...
} from "./Correlate.ts"
import { LoadFeatureError, type LoadFeatureWarning, makeWarning } from "./Errors.ts"
import type { GherkinDocument, Pickle, PickleStep } from "./Model.ts"
```

**Message location prefix** (`Validate.ts:59-65`) — every message is
`uri:line: <Reason>: <what happened, then what to do>`:
```typescript
/**
 * Every message is shaped `uri:line: <reason>: <what happened, then what to do>`.
 *
 * Message quality is not cosmetic here. ... It has to be self-contained.
 */
const at = (uri: string, line: number): string => `${uri}:${line}: `
```

**Per-finding error-builder function — one named `const` per reason tag, each with its own doc
comment naming the fixture row it closes** (`Validate.ts:85-102`):
```typescript
/**
 * F3 — an Outline keyword with no `Examples:` block at all.
 *
 * `[VERIFIED]`: `compile()` sees `examples.length === 0`, ...
 */
const outlineWithoutExamples = (uri: string, node: AstScenarioInfo): LoadFeatureError =>
  new LoadFeatureError({
    reason: "OutlineWithoutExamples",
    uri,
    line: Option.some(node.location.line),
    message: `${at(uri, node.location.line)}OutlineWithoutExamples: ${describeNode(node)} is declared with an `
      + `Outline keyword but has no Examples: block. It still compiles — to a single scenario whose step text `
      + `keeps its literal <placeholders> un-substituted — so it runs and passes instead of failing. Add an `
      + `Examples: table with a header row and at least one body row, or change the keyword to a plain scenario.`,
    cause: Option.none()
  })
```
Note the message anatomy: **what happened → why it is bad → what to do**. Never truncated
(`Errors.ts:50-58` — locked developer decision, pinned byte-for-byte in `test/Contracts.test.ts`).
`describeNode`/`describeBlock` (`Validate.ts:76-82`) use `JSON.stringify` for quoting so a name
containing a quote stays unambiguous.

**Main walk — one loop, accumulate-and-sort** (`Validate.ts:656-682`, `760-805`):
```typescript
export const validateFeature = (result: CorrelationResult): ReadonlyArray<LoadFeatureWarning> => {
  const { feature, index } = result
  const uri = feature.uri
  ...
  const unknownPlaceholderWarnings: Array<LoadFeatureWarning> = []

  for (const node of index.astScenarios) {
    ...
  }
```
```typescript
  // Deterministic document order, so a test can assert the array by position rather than by
  // searching it. `Array.prototype.sort` is stable, so two findings on one line keep the order
  // they were found in — `Array.sortBy`/`Order.combineAll` would be the `effect/Array` way to
  // express this, but `Order.combineAll` is confirmed to throw in this exact build (reproduced
  // in isolation), so the native, already-correct `.sort()` is kept rather than swapped for a
  // broken replacement.
  const warnings = [...unknownPlaceholderWarnings, ...scenarioWarnings, ...emptyRuleWarnings, ...backgroundWarnings]
  warnings.sort((left, right) => Option.getOrElse(left.line, () => 0) - Option.getOrElse(right.line, () => 0))
  return warnings
}
```
**Directly relevant to D-03** (ambiguous matches ordered by definition-site `file:line`): the
sort-for-determinism idiom above is the pattern, and the two `effect/Array` landmines it records
apply verbatim — **`Array.filterMap` is broken in this rc build** (`Validate.ts:751-758`, silently
returns `[]`), use `Arr.map` → `Arr.getSomes`; **`Order.combineAll` throws**, use native `.sort()`.

**Matcher consumption** — build once per Feature, `match()` per Pickle step
(`packages/gherkin/src/StepMatcher.ts:279-302`, `239-272`):
```typescript
export interface StepPatternEntry<D> {
  readonly pattern: string
  /** Whatever the caller wants back when this pattern matches. Never inspected here. */
  readonly definition: D
}

export interface StepMatch<D> {
  readonly pattern: string
  readonly definition: D
  readonly args: ReadonlyArray<unknown>
}

export const createStepMatcher = <D>(
  args: { registry: ParameterTypeRegistry; entries: ReadonlyArray<StepPatternEntry<D>> }
): StepMatcher<D> => { ... }
```
`D` is the opaque payload slot `StepMatcher.ts:59-61` was designed for: **put the
`StepDefinition<StepBody>` AND its source location in `D`.** `match(text)` returns every match in
registration order, never throws for 0 or many — interpreting that is this phase's job
(`StepMatcher.ts:9-26`, and the 03-04 decision note). Do **not** add sorting or dedup to
`StepMatcher.ts`.

The registry to hand it is `ParsedFeature.parameterTypes` — per-call and fresh
(`Model.ts:206-222`); never share a compiled expression across two `ParsedFeature` values.

**Model fields Plan reads** (`packages/gherkin/src/Model.ts`):
- `ParsedFeature.allScenarios` (`Model.ts:185-186`) — "Every Scenario, flat, in document order. This
  is what `Validate.ts` iterates."
- `ParsedScenario.astName` (`Model.ts:124-129`) — un-interpolated, **this is the scope-match key**;
  `ParsedScenario.name` is the interpolated Pickle name and is the `it.effect` title only.
- `ParsedScenario.ruleId: Option.Option<string>` (`Model.ts:147-148`) — scope-chain walk input.
- `ParsedStep.origin: "feature-background" | "rule-background" | "scenario"` (`Model.ts:54, 78`).
- `ParsedStep.line` (`Model.ts:79-80`) — "`PickleStep` carries no location at all"; this is the
  source location BEH-EC-013 requires in the unmatched/ambiguous error.
- `ParsedStep.stepArguments` (`Model.ts:96-110`) — the wrapped DocString/DataTable, already ordered.

---

### `packages/vitest/src/Snippet.ts` (optional) — NEW (utility, pure transform)

**Analog:** `packages/gherkin/src/StepPatternMessages.ts` (exact — a small shared message helper
extracted precisely so two modules can share one convention without importing each other)

**Whole-module pattern** (`StepPatternMessages.ts:1-45`):
```typescript
/**
 * Shared `StepPatternError` message-building helpers, used by both `ParameterTypes.ts` and
 * `StepMatcher.ts`.
 *
 * Kept here, not in either module, so `StepMatcher.ts` can go on not importing
 * `./ParameterTypes.ts` ... Local imports: `./Errors.ts` only.
 */
import * as Option from "effect/Option"
import { StepPatternError, type StepPatternErrorReason } from "./Errors.ts"

/** Name a parameter type the way a step pattern would spell it. */
export const describeParameterTypeName = (name: string): string =>
  name === "" ? "the anonymous {} parameter type" : `{${name}}`

export const raiseStepPatternError = (args: {
  reason: StepPatternErrorReason
  parameterTypeName?: string
  pattern?: string
  sentences: ReadonlyArray<string>
  cause?: unknown
}): never => {
  throw new StepPatternError({
    reason: args.reason,
    parameterTypeName: Option.fromUndefinedOr(args.parameterTypeName),
    pattern: Option.fromUndefinedOr(args.pattern),
    message: `${args.reason}: ${args.sentences.join(" ")}`,
    cause: Option.fromUndefinedOr(args.cause)
  })
}
```
Two patterns to copy: (1) the `sentences: ReadonlyArray<string>` + `.join(" ")` message-assembly
convention used at every construction site in this repo; (2) **internal helpers take plain,
omittable `T | undefined` and do the `Option` wrapping once, at construction** — because the helper
is not exported from `index.ts`.

The non-throwing variant of the same factory (returns the error rather than throwing, for
`Effect.fail`) is `packages/gherkin/src/DataTable.ts:115-131`:
```typescript
const dataTableError = (args: {
  reason: DataTableErrorReason
  uri: string
  line: number
  row: Option.Option<number>
  column: Option.Option<string>
  sentences: ReadonlyArray<string>
}): DataTableError =>
  new DataTableError({
    reason: args.reason,
    uri: args.uri,
    line: Option.some(args.line),
    row: args.row,
    column: args.column,
    message: `${args.uri}:${args.line}: ${args.reason}: ${args.sentences.join(" ")}`,
    cause: Option.none()
  })
```
**Use this second (returning) form for `StepMatchError`** — ADR-EC-019 requires the failure to land
in the Scenario's Effect error channel, not as a thrown collection error.

**D-01's generator** — `CucumberExpressionGenerator` is exported from the
`@cucumber/cucumber-expressions` barrel (verified in `dist/index.d.ts:12`). Signature:
```typescript
class CucumberExpressionGenerator {
    constructor(parameterTypes: () => Iterable<ParameterType<unknown>>);
    generateExpressions(text: string): readonly GeneratedExpression[];
}
class GeneratedExpression {
    get source(): string
    get parameterNames(): readonly string[]
}
```
Feed it `() => parsedFeature.parameterTypes.parameterTypes` (`ParameterTypeRegistry.parameterTypes`
is an `IterableIterator<ParameterType<unknown>>` getter). **Import from the package BARREL, never a
deep `dist/` path** — the rule stated in `StepMatcher.ts:62-65` and `Model.ts:32-33`.

---

### `packages/vitest/src/ScenarioEffect.ts` — NEW (service, transform → Effect)

**Analog:** `packages/vitest/src/Step.ts` (role-match — the other small, pure, Effect-composing
module in this package; same "the type system cannot catch a wrong implementation" character)

**Imports + the whole module** (`Step.ts:43, 78-86`):
```typescript
import * as Effect from "effect/Effect"

/**
 * ...
 * The explicit return annotation is required, not stylistic: `composite: true` demands it for
 * declaration emit on anything exported.
 */
export const register = <Params extends ReadonlyArray<any>, A, E, R>(
  pattern: string,
  fn:
    | ((...p: Params) => Effect.gen.Return<A, E, R>)
    | ((...p: Params) => Effect.Effect<A, E, R>)
): (...p: Params) => Effect.Effect<A, E, R> =>
  isGeneratorFn(fn) ? Effect.fn(pattern)(fn) : fn
```
`ScenarioEffect.ts` consumes this — the plan's `resolvedSteps[].definition` is already
`(...args) => Effect`, so `ScenarioEffect` never re-wraps.

**Sequential `yield*` fail-fast composition** — the exact shape RUN-01/INV-EC-001 ask for; the
closest live instance is `loadFeature.ts:195-198`:
```typescript
export const loadFeature = Effect.fn("loadFeature")(function*(path: string) {
  const source = yield* readFeatureSource(path)
  return yield* parseFeature(source, path)
})
```
For a runtime-length step list, use `Effect.gen(function*() { for (const step of plan.steps) { yield* ... } })`
— a `for` loop of `yield*` inside one `Effect.gen`, which short-circuits on the first failure for
free. Per ARCHITECTURE.md's data-flow trace (lines 343-352) and ADR-EC-004: Background steps are
**already first** in `ParsedScenario.steps` (`Model.ts:137-141` — "Read off `pickle.steps`; do not
re-stack Background steps"), so no re-ordering is needed.

**Pre-failed Effect for a drift failure** (`DataTable.ts:219`): a resolution failure discovered at
Plan time becomes `Effect.fail(stepMatchError({...}))` embedded in that one Scenario's Effect —
ARCHITECTURE.md Anti-Pattern 2 and ADR-EC-019.

**Layer provision** — `FeatureCollection.layer` is already the single merged Layer
(`describeFeature.ts:89-108`); this phase provides it fresh per Scenario via `Effect.provide`,
uniformly. The shared/per-Scenario split is Phase 10's.

---

### `packages/vitest/src/TestApi.ts` — NEW (contract, types only)

**Analog:** `packages/vitest/src/Dsl.ts` (exact — the repo's only types-only module, and the
governing convention is stated in its doc comment)

**Types-only module rule** (`Dsl.ts:74-76`):
```
 * This module contains types only: no `const`, no function, no runtime value at all. Both imports
 * are `import type`, so the emitted `dist/Dsl.js` carries zero statements. If a runtime statement
 * ever appears in that emit, something was added here that does not belong.
```

**Import + callable-interface pattern** (`Dsl.ts:84-110`):
```typescript
import type * as Effect from "effect/Effect"
import type * as Scope from "effect/Scope"

/**
 * ...
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
`TestApi`'s `effect` member is exactly this shape — a callable interface carrying `.skip`/`.only`
properties. `Scope.Scope` must appear **only** in the Effect's required-context position
(`Dsl.ts:32-40`), never hoisted onto the `TestApi` type itself.

**Note the `Dsl.ts` variance rule** (`Dsl.ts:78-82`): no `in`/`out` annotations. Inferred variance
is already correct; annotating risks pinning it wrong.

---

### `packages/vitest/src/Runner.ts` — NEW (controller / emitter)

**Analog:** `packages/vitest/src/describeFeature.ts`'s `collect()` — partial match only (a walker
over a scope tree). **No module under any `src/` imports `describe` or `it`** (verified: zero
matches for `from "vitest"` / `from "@effect/vitest"` across `packages/*/src/*.ts`). Runner is the
first, and per ARCHITECTURE.md Pattern 3 it must remain the *only* one — and it reaches them through
the injected `TestApi`, never by import.

**Nearest structural pattern — the closured walker with `try`/`finally` balance**
(`describeFeature.ts:146-168`):
```typescript
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
```
The nesting discipline transfers directly: `describe(feature.name, () => { describe(rule.name, () => { ... }) })`
per `spec/glossary.md`, with the nested callback invoked synchronously and never `async`
(`describeFeature.ts:38-43` note (c): an async callback registers nothing and the Feature passes
with zero tests).

**`@effect/vitest` import form the repo already uses** (`test/Step.test.ts:45`, and the lint
exemption explained at `Step.test.ts:41-43`):
```typescript
import { assert, describe, expect, it } from "@effect/vitest"
```
> `@effect/vitest` is the one `@effect/*` package `effect/no-import-from-barrel-package` exempts —
> it publishes a single entry point. `describe` itself comes from `vitest`, which
> `@effect/vitest` re-exports.

---

### `packages/vitest/src/Registry.ts` — MODIFIED (add a definition-site location for D-03)

**Analog:** itself, plus `packages/gherkin/src/ParameterTypes.ts`'s `definedAt` field.

**The type to extend** (`Registry.ts:76-81`):
```typescript
export type StepDefinition<Fn> = {
  readonly keyword: StepKeyword
  readonly pattern: string
  readonly body: Fn
  readonly scope: RegistryScope
}
```
Recorded at `Registry.ts:129-131`:
```typescript
  const register = (keyword: StepKeyword, pattern: string, body: Fn): void => {
    records.push({ keyword, pattern, body, scope: currentScope() })
  }
```

**The one source-location precedent in this repo** — caller-supplied, `Option<string>`, free-form
(`ParameterTypes.ts:103-108`):
```typescript
  /**
   * A human-readable definition site — a `file:line`, a module name, anything recognisable. Used
   * verbatim in the `DuplicateParameterTypeName` message, which names BOTH sites so the caller
   * does not have to search for the other one.
   */
  readonly definedAt: Option.Option<string>
```
With its `none`-fallback renderer (`ParameterTypes.ts:159-167`):
```typescript
/** The fallback used when a definition recorded no `definedAt` — including an explicit `""`. */
const unrecordedLocation = "an unrecorded location"

const locationOf = (value: Option.Option<string>): string =>
  Option.match(value, {
    onNone: () => unrecordedLocation,
    onSome: (site) => site === "" ? unrecordedLocation : site
  })
```
Used in a two-site message (`ParameterTypes.ts:248-256`) — the exact DX shape D-03's ambiguous-match
error wants:
```typescript
      fail({
        reason: "DuplicateParameterTypeName",
        parameterTypeName: name,
        sentences: [
          `${describeName(name)} was already defined in this store at ${locationOf(existing.definedAt)},`,
          `and is being defined again at ${locationOf(definition.definedAt)}.`,
          "Remove one of the two definitions, or give one of them a different name.",
          ...
        ]
      })
```

**Also honour these two Registry invariants when extending it:**
- `Registry.ts:22-38` note (c): "this module deliberately has no dependencies of any kind — an
  acceptance criterion asserts the count is zero." A stack-capture helper must therefore live in a
  *different* module (or be pure inline code with no import), or that criterion is broken.
- `Registry.ts:23-30` note (b): `definitions()` returns a **copy**, never the live array.

---

### `packages/vitest/src/describeFeature.ts` — MODIFIED (composition root)

**Analog:** `packages/gherkin/src/loadFeature.ts` (exact — "the only file that knows the order they
run in")

**The line this phase replaces** (`describeFeature.ts:248-255`):
```typescript
export function describeFeature(
  feature: ParsedFeature,
  layer: LayerArgument,
  define: (dsl: FeatureDsl<any>) => void
): void {
  // Discarded on purpose — see the doc comment above. Phase 6 replaces this line with emission.
  collect(feature, layer, define)
}
```

**The value already produced for this phase** (`describeFeature.ts:89-94`, `172`):
```typescript
export type FeatureCollection = {
  readonly feature: ParsedFeature
  /** The single Layer both forms normalise to — see note (d) for the collision rule. */
  readonly layer: Layer.Layer<any, any, never>
  readonly definitions: ReadonlyArray<StepDefinition<StepBody>>
}
```
```typescript
  return { feature, layer: normalizeLayer(layer), definitions: registry.definitions() }
```
D-02's third channel adds a `warnings` field here (or on the `Plan` result). Note the field-addition
precedent on `ParsedFeature` (`Model.ts:193-205`): a split interface where the producing stage adds
its own field at the join seam.

**Composition-root shape** (`loadFeature.ts:114-124, 153-179`):
```typescript
import { correlateFeature } from "./Correlate.ts"
import { LoadFeatureError, StepPatternError } from "./Errors.ts"
import type { ParsedFeature } from "./Model.ts"
import { ParameterTypeStore } from "./ParameterTypes.ts"
import { parseDocument } from "./Parser.ts"
import { compilePickles } from "./Pickles.ts"
import { readFeatureSource } from "./Source.ts"
import { validateFeature } from "./Validate.ts"
```
```typescript
export const parseFeature = Effect.fn("parseFeature")(function*(source: string, uri: string) {
  const store = yield* ParameterTypeStore
  return yield* Effect.try({
    try: (): ParsedFeature => {
      const newId = IdGenerator.uuid()
      const document = parseDocument(source, uri, newId)
      const pickles = compilePickles(document, uri, newId)
      const correlated = correlateFeature(document, pickles, uri)
      return {
        ...correlated.feature,
        warnings: validateFeature(correlated),
        parameterTypes: store.buildRegistry()
      }
    },
    catch: (thrown): LoadFeatureError | StepPatternError => ...
  })
})
```
Register → Plan → Emit maps onto exactly this: one flat, ordered sequence in the root, with each
stage a named import from its own module.

**Two overload rules that must survive the edit** (`describeFeature.ts:12-43`):
- (a) The **plain-Layer overload stays LAST**. TypeScript reports the last overload's error, and
  `effect(missingLayerContext)` only fires from it. Proven by `test/tsgo-gate/`'s
  `layer-missing-rin` fixture.
- (b) `describeFeature`/`collectFeature` are `function` declarations, not arrow consts, because an
  arrow const cannot carry overloads.

---

### `packages/vitest/src/index.ts` — MODIFIED (barrel)

**Analog:** `packages/gherkin/src/index.ts` (exact)

**Grouped export with a doc comment per group** (`packages/gherkin/src/index.ts:61-62, 111-121`):
```typescript
export { LoadFeatureError } from "./Errors.ts"
export type { LoadFeatureErrorReason, LoadFeatureWarning, LoadFeatureWarningReason } from "./Errors.ts"
```
```typescript
/**
 * The failure channel for a rejected parameter type definition or an unusable step pattern, and the
 * third one: ...
 */
export { StepPatternError } from "./Errors.ts"
export type { StepPatternErrorReason } from "./Errors.ts"
```

**The policy this phase must not break** (`packages/vitest/src/index.ts:34-45`):
```
 * ## Deliberately NOT exported
 *
 * `createRegistry` (and its `Registry`/`StepDefinition` types), `register` from `Step.ts`, and
 * `collectFeature` from `describeFeature.ts`. All three are internal stages of `describeFeature`
 * with no standalone consumer contract ...
```
`Plan.ts` / `ScenarioEffect.ts` / `TestApi.ts` / `Runner.ts` follow the same rule (CONTEXT.md
"Integration Points"). **`StepMatchError` and the unused-pattern warning type are the exception** —
D-02's channel 3 requires them to be programmatically inspectable, so they go in the barrel, exactly
as `LoadFeatureError`/`LoadFeatureWarning` do in gherkin's.

Also update the "**Current state**" paragraph at `packages/vitest/src/index.ts:24-27`, which
currently says "it emits ZERO vitest tests. Test emission is Phase 6's."

---

### `packages/vitest/test/Plan.test.ts`, `ScenarioEffect.test.ts` — NEW (tests)

**Analogs:** `packages/vitest/test/Step.test.ts` (exact for ScenarioEffect) and
`packages/vitest/test/describeFeature.test.ts` (exact for Plan)

**Imports + the two lint-driven conventions** (`Step.test.ts:26-49`):
```
 * ## `expect` in the sync tests, `assert` inside every `it.effect`
 *
 * Not a style preference. oxlint's `vitest/no-standalone-expect` does not recognise `it.effect` as
 * a test block, so an `expect` nested in the `Effect.gen` body it takes is reported as standalone
 * and fails `pnpm lint`. `assert` — vitest's, re-exported by `@effect/vitest` — is outside that
 * rule's scope ... Do not "make them consistent".
 *
 * ## Imports
 *
 * `../src/Step.ts` directly, never `../src/index.ts`: `effect/no-import-from-barrel-package` runs
 * with `checkRelativeIndexImports: true` and fails `pnpm lint` on a relative value-import whose
 * basename is `index.*`.
 */
import { assert, describe, expect, it } from "@effect/vitest"
import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import { register } from "../src/Step.ts"
```

**Mutation-testing header — mandatory in this repo** (`Step.test.ts:22-24`):
```
 * Mutation-tested (both performed, then reverted, both confirmed failing):
 * - A. `register` wraps unconditionally (guard dropped) → the identity test fails.
 * - B. `register` returns `fn` unconditionally (never wraps) → the span-name test fails.
```
CONTEXT.md's "Established Patterns" makes this load-bearing for this phase: the D-03 acceptance
criterion ("ambiguous list order doesn't depend on registration order") must be **mutation-proven** —
register the two colliding patterns in the reverse order and assert the same output order.

**Assert-through-`Exit`, never try/catch** (`Step.test.ts:109-121`):
```typescript
  it.effect("still surfaces in the error channel", () =>
    Effect.gen(function*() {
      const wrapped = register("a step that fails", function*() {
        return yield* Effect.fail("boom" as const)
      })

      const exit = yield* Effect.exit(wrapped())

      // The wrap must neither swallow the failure nor convert it into a defect or a success. Asserted
      // through Exit rather than a try/catch on a Promise, so a step that SUCCEEDS is reported as the
      // wrong value rather than silently passing an absent-throw check.
      assert.strictEqual(Exit.isFailure(exit) ? Cause.squash(exit.cause) : "the step unexpectedly succeeded", "boom")
    }))
```
This is the exact shape a `ScenarioEffect` fail-fast test (INV-EC-001) needs.

**Real `ParsedFeature` fixtures, never a cast** (`describeFeature.test.ts:36-42, 82-94`):
```
 * ## The `ParsedFeature` argument
 *
 * Parsed from an inline source with `@effect-cucumber/gherkin`'s own `parseFeature`, never
 * fabricated with a type assertion. ... a cast would compile and would keep compiling after the
 * argument type changes underneath it — the assertion would go on passing while proving nothing
 * about the contract that actually crosses the package boundary.
```
```typescript
const feature = Effect.runSync(
  parseFeature(
    `Feature: Checkout
  Background:
    Given the cart is empty

  Scenario: checkout
    When I pay
    Then I am charged
`,
    "test/describeFeature.feature"
  ).pipe(Effect.provide(ParameterTypeStore.Default))
)
```
> `parseFeature` requires only `ParameterTypeStore`, and `Layer.succeed`-backed services are
> `runSync`-safe, so this resolves at module scope with no `await`. (`loadFeature` does **not** —
> `NodeFileSystem.readFileString` suspends and `Effect.runSync` throws `AsyncFiberError`;
> `loadFeature.ts:37-47`.)

**Service fixture for Layer assertions** (`describeFeature.test.ts:71-74`):
```typescript
class Marker extends Context.Service<Marker, { readonly who: string }>()("Marker") {}

const sharedMarker = Layer.succeed(Marker, Marker.of({ who: "shared" }))
const perScenarioMarker = Layer.succeed(Marker, Marker.of({ who: "perScenario" }))
```

---

## Shared Patterns

### 1. Module doc comment with lettered notes
**Source:** every `src/*.ts` in both packages — e.g. `Registry.ts:1-46`, `Step.ts:1-42`,
`Dsl.ts:1-83`, `StepMatcher.ts:1-66`
**Apply to:** every new module in this phase.

Format: a prose opener stating what the module is, then `(a)`/`(b)`/`(c)` numbered notes, each
recording a decision **that is not visible from the code** and naming the plausible "tidy-up" that
would break it. Explicit example (`Step.ts:13-21`):
```
 * (a) **The runtime discriminator is the ONLY thing separating correct from silently-wrong.** The
 *     two accepted forms are indistinguishable at the type level ... The
 *     damage from wrapping an already-wrapped function is not a compile error and not a test
 *     failure — it is a second span nested inside the author's own ... `test/Step.test.ts`'s
 *     reference-identity assertion is the only guard, and it is load-bearing rather than decorative.
```
Modules also close with a paragraph naming their exact allowed local imports and their barrel status.

### 2. Error-message anatomy
**Source:** `Validate.ts:59-65` + every error builder in `Validate.ts`, `DataTable.ts`,
`ParameterTypes.ts`
**Apply to:** `Errors.ts`, `Plan.ts`, `Snippet.ts`

`` `${uri}:${line}: ${reason}: ${sentences.join(" ")}` `` — sentences say **what happened → why it is
bad → what to do**. Content is **never truncated**, never elided, no ellipsis, no max length
(`Errors.ts:50-58`, a locked developer decision pinned byte-for-byte in
`packages/gherkin/test/Contracts.test.ts`).

### 3. Closure factory, never a module singleton
**Source:** `Registry.ts:89-137` and `ParameterTypes.ts:218+` (`createParameterTypeStore`)
**Apply to:** anything in this phase holding mutable state
```typescript
export const createRegistry = <Fn>(featureName: string) => {
  const stack: Array<RegistryScope> = [{ kind: "feature", name: featureName }]
  const records: Array<StepDefinition<Fn>> = []
  ...
  const definitions = (): ReadonlyArray<StepDefinition<Fn>> => [...records]

  return { pushScope, popScope, currentScope, register, definitions }
}

export type RegistryShape<Fn> = ReturnType<typeof createRegistry<Fn>>
```
Note the derived shape type (`Registry.ts:139-143`) "so the shape and the thing it describes cannot
drift apart", and that accessors return **copies**. `Registry.ts:17-21` also warns that reference
inequality alone does not prove per-call freshness — the discriminating test registers into one
instance and observes the other is still empty.

### 4. Workspace TypeScript flags that shape every declaration
**Source:** `tsconfig.base.json:15-29`
**Apply to:** all new files
- `erasableSyntaxOnly: true` → **no enums**; every closed set is a string-literal union
  (`Registry.ts:48-52`, `Errors.ts:101-104`)
- `composite: true` → **explicit return annotations on every export** (`Step.ts:72-74`)
- `noUncheckedIndexedAccess: true` → index lookups are possibly-`undefined`; handle rather than
  assert (`Registry.ts:96-105` shows the preferred throw-with-explanation over a `!`)
- `exactOptionalPropertyTypes: true` → `string | null` rather than `name?: string` when absence is
  real data (`Registry.ts:56-62`)
- `verbatimModuleSyntax: true` → `import type` for type-only imports

### 5. Import policy
**Source:** `Step.test.ts:35-43`, `StepMatcher.ts:62-66`, `Validate.ts:41-43`, `Model.ts:32-33`
**Apply to:** every new file
- Relative local imports always carry the `.ts` extension.
- **Never** import `./index.ts` relatively — `effect/no-import-from-barrel-package` runs with
  `checkRelativeIndexImports: true` and fails `pnpm lint`.
- Third-party imports reach the package **barrel**, never a deep path into a published `dist/`.
- `@effect/vitest` is the one `@effect/*` barrel the rule exempts (single entry point).

### 6. `effect@4.0.0-rc.112` landmines already found and worked around
**Source:** `Validate.ts:751-758`, `Validate.ts:797-802`, `Errors.ts:22-36`
**Apply to:** `Plan.ts` and `Errors.ts` especially
| API | Status in this build | Use instead |
|---|---|---|
| `Array.filterMap` | **silently returns `[]`** | `Arr.map` → `Arr.getSomes` |
| `Order.combineAll` | **throws** | native `.sort()` (stable) |
| `Schema.Defect` | **throws at construction** | `Schema.OptionFromUndefinedOr(Schema.Unknown)` |
| `Schema.Literal(a, b, c)` variadic as a TaggedError field | **throws** | `Schema.Literals([a, b, c])` |
| `Effect.runSync` on a `FileSystem`-backed Effect | throws `AsyncFiberError` | `Effect.runPromise` / top-level `await` |

---

## No Analog Found

| File / concern | Role | Data flow | Why there is no analog |
|---|---|---|---|
| `packages/vitest/src/Runner.ts` — `describe`/`it.effect` **emission** | controller | event-driven | Zero modules under any `src/` import `vitest` or `@effect/vitest` (verified by grep). Only test files do. The `TestApi` seam (ARCHITECTURE.md Pattern 3) is the design, but no in-repo instance of it exists. Use ARCHITECTURE.md Pattern 3 + Anti-Pattern 3 as the source. |
| `packages/vitest/test/Runner.test.ts` — **recording fake** `TestApi` | test | n/a | No test double, spy, mock, or recording fake exists anywhere in this repo. Every test asserts against real values. Design it fresh: a plain object literal that pushes `{ method, name }` records into an array. |
| **Source-location capture** for `StepDefinition` (D-03) | utility | n/a | No `Error().stack`, `captureStackTrace`, or `new Error()` for location purposes exists anywhere in `packages/*/src`. `ParameterTypeDefinition.definedAt` (`ParameterTypes.ts:103-108`) is the only location field and it is **caller-supplied**, not auto-captured. D-03's "confirm feasibility during research/planning" is unresolved by the codebase — plan a spike. |
| **`console.warn`** channel (D-02 channel 1) | utility | n/a | No `console.*` call exists in any `src/` file. This is a genuinely new output channel; it will also need an oxlint check (`no-console` is commonly on). Verify against `.oxlintrc.json` before planning. |

**Dependency flag:** `packages/vitest/package.json` declares only `@effect-cucumber/gherkin` as a
dependency. `CucumberExpressionGenerator` (D-01) lives in `@cucumber/cucumber-expressions`, which
the vitest package does **not** declare — under pnpm's isolated `node_modules` the import will not
resolve (this is exactly PITFALLS Pitfall 16, which already bit this repo once). Either re-export it
from `packages/gherkin/src/index.ts` (following the `ParameterTypeRegistry` re-export precedent at
`Model.ts:224-232` / `index.ts:123-137`) or declare the dependency explicitly, matching gherkin's
own range so the two cannot diverge into separate instances.

---

## Metadata

**Analog search scope:** `packages/gherkin/src`, `packages/gherkin/test`, `packages/vitest/src`,
`packages/vitest/test`, `packages/*/package.json`, `tsconfig.base.json`,
`node_modules/.pnpm/@cucumber+cucumber-expressions@20.1.0/.../dist/*.d.ts`
**Files read in full or in targeted ranges:** 16
**Pattern extraction date:** 2026-08-29

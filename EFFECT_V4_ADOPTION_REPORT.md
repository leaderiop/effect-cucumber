# Effect V4 Adoption Report

**Scope:** `packages/gherkin` and `packages/vitest`
**Effect version in use:** `4.0.0-rc.112` (pinned in `pnpm-workspace.yaml`, ADR-EC-012)
**Effect V4 source consulted:** `../effect` (local checkout, `packages/effect/src`, `MIGRATION.md`, `migration/*.md`)
**Method:** 10-agent workflow — 4 mapping agents (2 codebase audits, 1 V4 migration-idiom extraction, 1 V4 built-in-module catalog), 5 topic deep-dive agents producing before/after code, 2 adversarial verification agents that re-checked every claimed API against the real V4 source and every "before" snippet against the real repo files.
**Result:** 17 confirmed issues, 0 hallucinated APIs, 0 incorrect claims.

## Executive summary

effect-cucumber already sits on Effect V4 (not V3→V4 migration work — that's done). The question this report answers is narrower and more useful: **where does the codebase hand-roll logic that a V4 built-in already provides for free?**

The answer is: not much, and nothing structural. Both packages are already idiomatic Effect V4 code — services use `Context.Service`, errors mostly use `Schema.TaggedError`/`Data.TaggedError`, layers are composed correctly. The 17 findings below are real but narrow: a cluster of duplicated `instanceof Error` / `typeof` guards that `effect/Predicate` already ships, four hand-written `Error` subclasses that could be `Data.TaggedError`, three manual Map-bucket-push loops that `effect/Array`'s `groupBy`/`dedupe` replace in one line, and one stale v3 naming convention (`.Default` instead of `.layerDefault`) on a single layer.

| Priority | Count |
| -------- | ----- |
| High     | 1     |
| Medium   | 9     |
| Low      | 7     |

| Package | Count |
| ------- | ----- |
| gherkin | 10    |
| vitest  | 7     |

No High-priority correctness bugs were found. The one High item (`StepMatcher.ts`'s hand-rolled thenable check) is High because it duplicates a built-in **exactly**, byte-for-byte, making it the clearest "just delete this and import the built-in" case in the audit — not because it's broken today.

---

## 1. Error modeling & Cause handling

**Category priority:** Medium. Four hand-rolled `Error` subclasses in `packages/vitest` duplicate what `Data.TaggedError` gives for free: a real `globalThis.Error` subclass with `.name` auto-stamped to the tag, `.cause` wired through the standard constructor, and structural `Equal`/`Hash` — at the cost of 4-6 lines of manual constructor/`.name`/field-assignment boilerplate per class today.

### 1.1 `StepFailureLocation` — hand-rolled `Error` subclass (Medium)

**File:** `packages/vitest/src/Errors.ts`

```ts
// Before
export class StepFailureLocation extends Error {
  readonly step: string
  readonly file: string
  readonly line: number

  constructor(
    args: { readonly step: string; readonly file: string; readonly line: number; readonly cause?: unknown }
  ) {
    super(`${args.file}:${args.line}: step ${JSON.stringify(args.step)}`, { cause: args.cause })
    this.name = "StepFailureLocation"
    this.step = args.step
    this.file = args.file
    this.line = args.line
  }
}
```

```ts
// After
import * as Data from "effect/Data"

export class StepFailureLocation extends Data.TaggedError("StepFailureLocation")<{
  readonly step: string
  readonly file: string
  readonly line: number
  readonly message: string
  readonly cause?: unknown
}> {}

const makeStepFailureLocation = (
  args: { readonly step: string; readonly file: string; readonly line: number; readonly cause?: unknown }
): StepFailureLocation =>
  new StepFailureLocation({
    step: args.step,
    file: args.file,
    line: args.line,
    cause: args.cause,
    message: `${args.file}:${args.line}: step ${JSON.stringify(args.step)}`
  })

// attachStepFailureLocation's body becomes:
// attachFailureLocation(value, (cause) => makeStepFailureLocation({ ...location, cause }))
```

- **V4 API:** `effect/Data` — `Data.TaggedError(tag)<Fields>`. Verified against `effect/packages/effect/src/Data.ts:761` and `internal/core.ts:592-645` — `TaggedError` extends `globalThis.Error` via `YieldableError` and stamps `Base.prototype.name = tag`.
- **Rationale:** Matches the message-computed-by-a-factory convention this package already uses for `StepMatchError` (`Plan.ts`) and `makeUnknownContainerWarning` (`Errors.ts`) — this class is currently the odd one out that computes its message inline in a hand-written constructor.
- **Risk:** vitest's reporter only recurses into `.cause` for a value with `.name` — still satisfied, since `Data.TaggedError` instances are real `Error`s. The one real change: the message moves out of the constructor into `makeStepFailureLocation`. **Grep `test/` for any direct `new StepFailureLocation(...)` that omits `message`** and update it to use the factory before merging.

### 1.2 `HookFailureLocation` — identical pattern (Medium)

**File:** `packages/vitest/src/Errors.ts`

Byte-for-byte the same shape as 1.1, four lines away in the same file. Same fix, same `Data.TaggedError` API, same risk note: `test/Hook.test.ts` does `assert.instanceOf(cause, HookFailureLocation)` and reads `.hookKind`/`.file`/`.line`/`.message` — all keep working since `Data.TaggedError` is a real, `instanceof`-checkable `Error`. Move message construction into a `makeHookFailureLocation` factory and update any direct constructor calls in tests.

### 1.3 `TagExpressionError` — hand-rolled `Error` subclass (Medium)

**File:** `packages/vitest/src/TagExpression.ts`

The class's own doc comment argues it should stay a raw `Error` because it's "never decoded or compared by tag, printed as-is" — but `Data.TaggedError` is _also_ a real, printable `Error` with identical `instanceof`/`.name`/`.message`/`.cause` behavior; it just removes the hand-written `cause instanceof Error ? .message : String(cause)` stringify step and manual `.name =` assignment. Since this value is thrown synchronously (not through Effect's error channel), `Data.TaggedError` is a drop-in replacement.

- **Risk:** `test/describeFeature.test.ts` uses `toThrowError(TagExpressionError)` (by class) — unaffected. Same "move message computation into a factory" caveat as above — check for direct constructor calls that rely on the old inline message computation.

### 1.4 `HookTagExpressionError` — duplicates 1.3 (Medium)

**File:** `packages/vitest/src/HookTagExpression.ts`

Same pattern as 1.3, copy-pasted for the hook call site (~15 duplicated lines total between the two classes).

- **Risk — confirmed by direct test inspection:** `test/HookTagExpression.test.ts:29-43` constructs `new HookTagExpressionError({ kind, tagExpr, featureUri, cause })` **without** a `message` field and asserts on `.message` — this call site **must** be updated to go through the new factory (or pass `message` explicitly) or the test will break. This is the one issue in the report with a known, concrete test that needs a companion edit, not just a "check tests" caveat.

---

## 2. Services, Context & Layer patterns

**Category priority:** Medium. Only one finding — the package's service/layer architecture (`Context.Service`, `Layer.sync`/`Layer.effect`/`Layer.succeed`) is already correct V4 usage. The single issue is a stale naming convention, not a structural problem.

### 2.1 `ParameterTypeStore.Default` uses the v3 naming convention (Medium)

**File:** `packages/gherkin/src/ParameterTypes.ts`

```ts
// Before
static readonly Default: Layer.Layer<ParameterTypeStore> = Layer.sync(
  ParameterTypeStore,
  () => ParameterTypeStore.of(createDefaultParameterTypeStore())
)
```

```ts
// After
/**
 * Named `layerDefault` (not `Default`), per v4's layer-naming convention (effect/migration/services.md:
 * "v4 adopts the convention of naming layers with `layer` ... instead of v3's `Default` or `Live`. Use
 * `layer` for the primary layer and descriptive suffixes for variants, e.g. `layerTest`, `layerConfig`.")
 */
static readonly layerDefault: Layer.Layer<ParameterTypeStore> = Layer.sync(
  ParameterTypeStore,
  () => ParameterTypeStore.of(createDefaultParameterTypeStore())
)

/** @deprecated Use `ParameterTypeStore.layerDefault`. Kept as an alias so existing consumers don't break. */
static readonly Default: Layer.Layer<ParameterTypeStore> = ParameterTypeStore.layerDefault
```

- **V4 API:** No API change — `Context.Service`/`Layer.sync` usage is already correct. This is purely the naming convention documented in `effect/migration/services.md`: v3's `Effect.Service` auto-generated a `.Default` layer; v4 wants `layer` as the primary name (this class already has a lowercase `layer(definitions)` for the customized case, making capitalized `Default` doubly inconsistent — it's the old name _and_ it breaks the local `layer`/`layerX` pattern already in use two lines away).
- **Risk:** `ParameterTypeStore.Default` is public API (re-exported from `packages/gherkin/src/index.ts`) and consumed directly in `packages/vitest/src/loadFeature.ts` as a default parameter value. **This is a breaking rename for external consumers** — ship with the `@deprecated` alias for at least one release, update the internal `vitest` call site to `layerDefault`, and update doc-comment references to `.Default` in `StepMatcher.ts`/`loadFeature.ts` so prose doesn't drift from code.

---

## 3. Pattern matching, predicates & branding

**Category priority:** the largest cluster (9 issues) but almost entirely Low/Medium — this is where `typeof`/`instanceof` checks were written by hand instead of importing `effect/Predicate`, which already ships every guard needed.

### 3.1 Hand-rolled thenable check duplicates `Predicate.isPromiseLike` (**High**)

**File:** `packages/gherkin/src/StepMatcher.ts`

```ts
// Before
const isThenable = (value: unknown): boolean => {
  if ((typeof value !== "object" || value === null) && typeof value !== "function") {
    return false
  }
  return typeof (value as { readonly then?: unknown }).then === "function"
}
```

```ts
// After
import * as Predicate from "effect/Predicate"
// isThenable helper removed entirely — Predicate.isPromiseLike is the exact same
// structural check (hasProperty(input, "then") && isFunction(input.then)).

if (Predicate.isPromiseLike(value)) { /* ... */ }
```

- **V4 API:** `Predicate.isPromiseLike(input): input is PromiseLike<unknown>` — verified in `effect/packages/effect/src/Predicate.ts` to be implemented as `hasProperty(input, "then") && isFunction(input.then)`, i.e. **byte-for-byte** the same structural check this file hand-writes, including the unsafe `as { readonly then?: unknown }` cast this removes. This is the single clearest "delete and import" finding in the whole audit — hence High priority.
- **Risk:** None — pure drop-in replacement, verified identical for every input class (functions-with-then, null/undefined).

### 3.2 Manual structural guard duplicates `Predicate.hasProperty` + `isString` (Medium)

**File:** `packages/gherkin/src/StepMatcher.ts`

```ts
// Before
export const undefinedParameterTypeNameOf = (thrown: unknown): string | undefined => {
  if (typeof thrown !== "object" || thrown === null) {
    return undefined
  }
  const candidate = (thrown as { readonly undefinedParameterTypeName?: unknown }).undefinedParameterTypeName
  return typeof candidate === "string" ? candidate : undefined
}
```

```ts
// After
import * as Predicate from "effect/Predicate"

export const undefinedParameterTypeNameOf = (thrown: unknown): string | undefined => {
  if (!Predicate.hasProperty(thrown, "undefinedParameterTypeName")) {
    return undefined
  }
  const { undefinedParameterTypeName } = thrown
  return Predicate.isString(undefinedParameterTypeName) ? undefinedParameterTypeName : undefined
}
```

- **Risk — real, not cosmetic:** `Predicate.hasProperty` narrows via a check that accepts **both** non-null objects and **functions**, while the original `typeof thrown !== "object"` guard rejects functions outright. A thrown _function_ carrying an `undefinedParameterTypeName` string property would newly be accepted where it previously returned `undefined`. The module's own comment states every real throw site in `@cucumber/cucumber-expressions` raises an `Error` subclass, never a function — so this is not reachable today, but flag it for explicit reviewer sign-off rather than merging silently.

### 3.3 Repeated `instanceof Error` idiom duplicates `Predicate.isError` (Low) — **4 occurrences**

Found identically in:

- `packages/gherkin/src/StepMatcher.ts` (`describeCause`)
- `packages/gherkin/src/ParameterTypes.ts` (`toRegexpList`'s validation loop, and `buildRegistry`'s registration failure path)
- `packages/vitest/src/TagExpression.ts` (constructor)
- `packages/vitest/src/HookTagExpression.ts` (constructor)

```ts
// Before (repeated 5 times across both packages, minor variable-name differences)
const underlying = cause instanceof Error ? cause.message : String(cause)
```

```ts
// After
import * as Predicate from "effect/Predicate"
const underlying = Predicate.isError(cause) ? cause.message : String(cause)
```

- **V4 API:** `Predicate.isError(input): input is Error` — a plain `instanceof Error` refinement re-exported from the predicate module. Zero behavior change; purely makes "stringify an unknown failure cause" consistent across both packages instead of five independent copies of a raw `instanceof` check.
- **Recommendation:** fix all five occurrences in one PR — they share the same one-line diff and the same `effect/Predicate` import.

### 3.4 String/RegExp union normalization re-derives `typeof`/`instanceof` (Medium)

**File:** `packages/gherkin/src/ParameterTypes.ts`

```ts
// Before
const toRegexpList = (regexp: ParameterTypeDefinition<unknown>["regexp"]): ReadonlyArray<string | RegExp> =>
  typeof regexp === "string" || regexp instanceof RegExp ? [regexp] : regexp
// ...loop below re-checks `typeof entry === "string"` / `entry instanceof RegExp"` per element
```

```ts
// After
import * as Predicate from "effect/Predicate"

const toRegexpList = (regexp: ParameterTypeDefinition<unknown>["regexp"]): ReadonlyArray<string | RegExp> =>
  Predicate.isString(regexp) || Predicate.isRegExp(regexp) ? [regexp] : regexp
// ...loop uses Predicate.isString(entry) / Predicate.isRegExp(entry)
```

- **V4 API:** `Predicate.isString`, `Predicate.isRegExp` — direct `typeof`/`instanceof` refinements, verified identical in `effect/Predicate.ts`.
- **Risk:** This is the file's core rejection-message validation logic, covered by `test/ParameterTypes.test.ts` and `test/expressions-pin.test.ts` — zero behavior change expected, but re-run those suites since this touches the parameter-type definition path directly.

### 3.5 `Array.isArray` bypasses the package's own `effect/Array` import (Low)

**File:** `packages/gherkin/src/ParameterTypes.ts`

`Validate.ts` in the same package already imports `effect/Array as Arr`; this one call site still reaches for the native global. `Arr.isArray` is a verbatim re-export of `Array.isArray` — zero behavior change, pure consistency. Bundle with 3.4's edit rather than shipping alone.

### 3.6 `RuleNarrowing.ts` overload discriminator (Low, optional)

**File:** `packages/vitest/src/RuleNarrowing.ts`

`typeof tagExprOrFn === "string"` used to dispatch a `string | (() => any)` overload. This is already correct, idiomatic TypeScript — swapping in `Predicate.isString` only buys blanket consistency with the rest of the Predicate-based cleanup, not correctness. **Weakest finding in the report; take it only if the team wants that consistency, otherwise leave as-is.**

---

## 4. Collections, caching & concurrency primitives

**Category priority:** Medium. Three manual `Map`-bucket-push / `Set`-dedup loops in `Correlate.ts` (the AST↔pickle correlation logic) that `effect/Array`'s `groupBy`/`dedupe` collapse into one expression each.

### 4.1 Manual bucket-push to index pickles by scenario id (Medium)

**File:** `packages/gherkin/src/Correlate.ts`

```ts
// Before
const indexPicklesByScenario = (pickles: ReadonlyArray<Pickle>): ReadonlyMap<string, ReadonlyArray<Pickle>> => {
  const byScenarioId = new Map<string, Array<Pickle>>()
  for (const pickle of pickles) {
    const key = pickle.astNodeIds[0]
    if (key === undefined) continue
    const bucket = byScenarioId.get(key)
    if (bucket === undefined) byScenarioId.set(key, [pickle])
    else bucket.push(pickle)
  }
  return byScenarioId
}
```

```ts
// After
import * as Arr from "effect/Array"

const indexPicklesByScenario = (pickles: ReadonlyArray<Pickle>): ReadonlyMap<string, ReadonlyArray<Pickle>> =>
  new Map(
    Object.entries(
      Arr.groupBy(
        pickles.filter((pickle) => pickle.astNodeIds[0] !== undefined),
        (pickle) => pickle.astNodeIds[0]!
      )
    )
  )
```

- **V4 API:** `Arr.groupBy(self, f): Record<K, NonEmptyArray<A>>` — verified in `effect/packages/effect/src/Array.ts:3089-3111`.
- **Risk (real, worth a reviewer's explicit sign-off once):** `groupBy`'s accumulator builds a plain `{}` object internally (`out[k] = ...`). If a grouping key could ever be an untrusted string like `"__proto__"`, assigning that key on a plain-object accumulator reassigns the prototype instead of creating an own property — a risk `Map` never has. In practice these ids come from `@cucumber/gherkin`'s internal sequential `IdGenerator`, not external input, so this is low real risk **today** — but confirm that assumption holds if the id source ever changes. The function's return type stays `ReadonlyMap` (re-wrapped via `new Map(Object.entries(...))`), so no call-site changes are needed.

### 4.2 Manual bucket-push + inline branch to partition scenarios by Rule (Medium)

**File:** `packages/gherkin/src/Correlate.ts`

```ts
// Before
const featureScenarios: Array<ParsedScenario> = []
const scenariosByRule = new Map<string, Array<ParsedScenario>>()
for (const node of index.astScenarios) {
  for (const pickle of index.byScenarioId.get(node.id) ?? []) {
    allScenarios.push(scenario)
    if (node.ruleId === undefined) {
      featureScenarios.push(scenario)
    } else {
      const bucket = scenariosByRule.get(node.ruleId)
      if (bucket === undefined) scenariosByRule.set(node.ruleId, [scenario])
      else bucket.push(scenario)
    }
  }
}
```

```ts
// After
import * as Arr from "effect/Array"

const featureScenarios = allScenarios.filter((scenario) => Option.isNone(scenario.ruleId))
const scenariosByRule = new Map(
  Object.entries(
    Arr.groupBy(
      allScenarios.filter((scenario) => Option.isSome(scenario.ruleId)),
      (scenario) => Option.getOrThrow(scenario.ruleId)
    )
  )
)
```

- **V4 API:** `Arr.groupBy`, `Option.isSome`/`isNone`/`getOrThrow` — all verified against `effect/Array.ts` and `effect/Option.ts`; the refactor leans on the `ParsedScenario.ruleId: Option<string>` field the type **already carries** (`Model.ts:73`), no new field needed.
- **Risk:** Same plain-object-accumulator caveat as 4.1 (rule ids are AST-derived, not external input — low real risk). More important: the refactor now derives grouping from `scenario.ruleId` (set once, on the built scenario object) instead of branching on `node.ruleId === undefined` inline during the same loop iteration — **double-check these two never drift** if the scenario-building logic changes later.

### 4.3 Manual Set-based dedup for step keywords (Low)

**File:** `packages/gherkin/src/Correlate.ts`

```ts
// Before
return [...new Set(all.map((keyword) => keyword.trim()).filter((keyword) => keyword !== "*"))]
```

```ts
// After
import * as Arr from "effect/Array"
return Arr.dedupe(all.map((keyword) => keyword.trim()).filter((keyword) => keyword !== "*"))
```

- **V4 API:** `Arr.dedupe(self): Array<A>` — first-occurrence order preserved, documented in `effect/Array.ts` with the identical example shape. One fewer intermediate allocation (no `Set` object), and aligns with `Validate.ts`'s existing `Arr`-based style already used elsewhere in this package.
- **Risk:** None — static, small, per-language keyword lists; `Arr.dedupe`'s default equivalence is `SameValueZero` for primitive strings, identical to `Set`.

---

## 5. Testing package idioms (`@effect/vitest` v4)

**Result: no findings.** `Testing.ts`, `VitestTestApi.ts`, `TestApi.ts`, `Runner.ts`, `Plan.ts`, `Collect.ts`, `describeFeature.ts`, and `Dsl.ts` were audited specifically for reimplementations of `@effect/vitest`'s own `it.effect`/`it.scoped`/`TestClock`/layer-sharing machinery, and for `Scope`-handling code that should follow the v4 `scope.md` migration guide. None were found — this package correctly delegates to `@effect/vitest`'s v4 built-ins rather than reimplementing them. Called out explicitly so it's clear this is a verified "clean" result, not an unexamined gap.

---

## Adoption plan (priority order)

| #  | Change                                                              | Priority             | Files                                                                               | Breaking?                                                                                           |
| -- | ------------------------------------------------------------------- | -------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 1  | `isThenable` → `Predicate.isPromiseLike`                            | High                 | `StepMatcher.ts`                                                                    | No                                                                                                  |
| 2  | 5× `instanceof Error` → `Predicate.isError`                         | Low (bundle)         | `StepMatcher.ts`, `ParameterTypes.ts`×2, `TagExpression.ts`, `HookTagExpression.ts` | No                                                                                                  |
| 3  | `toRegexpList`/loop → `Predicate.isString`/`isRegExp`               | Medium               | `ParameterTypes.ts`                                                                 | No                                                                                                  |
| 4  | `Array.isArray` → `Arr.isArray`                                     | Low (bundle with #3) | `ParameterTypes.ts`                                                                 | No                                                                                                  |
| 5  | `undefinedParameterTypeNameOf` → `Predicate.hasProperty`/`isString` | Medium               | `StepMatcher.ts`                                                                    | No (verify function-value edge case first)                                                          |
| 6  | `Correlate.ts` bucket-push ×2 → `Arr.groupBy`                       | Medium               | `Correlate.ts`                                                                      | No (confirm grouping-key source stays AST-internal)                                                 |
| 7  | `stepKeywords` Set-dedup → `Arr.dedupe`                             | Low                  | `Correlate.ts`                                                                      | No                                                                                                  |
| 8  | `ParameterTypeStore.Default` → `.layerDefault` (+ deprecated alias) | Medium               | `ParameterTypes.ts`, `loadFeature.ts`, index/docs                                   | **Yes** — public API rename, ship with alias                                                        |
| 9  | 4× hand-rolled `Error` subclass → `Data.TaggedError`                | Medium               | `Errors.ts`×2, `TagExpression.ts`, `HookTagExpression.ts`                           | Internal only, **but update `test/HookTagExpression.test.ts:29-43`** (constructs without `message`) |
| 10 | `RuleNarrowing.ts` `typeof` → `Predicate.isString`                  | Low, optional        | `RuleNarrowing.ts`                                                                  | No                                                                                                  |

Suggested batching: **PR A** = items 1–7 (all `Predicate`/`Array` swaps, zero behavior risk, one shared import per file); **PR B** = item 8 alone (public API, needs a deprecation-cycle decision from the maintainers); **PR C** = item 9 alone (touches error construction + one known test that must change in lockstep).

---

## Appendix A — V4 idioms already correctly in use

Confirmed present and correct in this codebase (not findings, listed so the "why isn't X flagged" question is answered): `Context.Service` (not `Context.Tag`) for all services; `Schema.TaggedError` for the majority of error types; flattened `Cause` handling via `Cause.combine` in `Hook.ts`; layer composition via `Layer.sync`/`Layer.effect`/`Layer.succeed`; `effect/Array` already imported and used idiomatically in `Validate.ts`; `@effect/vitest`'s native test/layer-sharing helpers used directly rather than reimplemented.

## Appendix B — V4 built-in modules worth knowing about (not yet actionable findings)

These modules were cataloged from the real V4 source as relevant to a Gherkin/Cucumber framework's future needs, but no current code duplicates them closely enough to be a "finding" — worth keeping in mind for new code rather than refactoring existing code:

| Module                                   | Fit for this codebase                                                                                                                                         |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Match`                                  | Ordered pattern matching over step/hook values or AST node kinds — cleaner than a `switch` on `_tag` if a new discriminated-union matcher is added.           |
| `Data.taggedEnum`                        | Modeling Gherkin AST node kinds as a closed tagged enum.                                                                                                      |
| `Chunk`                                  | Efficient append/prepend accumulator if incremental token/step parsing is ever added.                                                                         |
| `MutableHashMap` / `HashMap` / `HashSet` | Structural-equality-keyed registries or immutable scenario/world-state snapshots (relevant if parallel scenario execution needs shared, snapshot-safe state). |
| `Cache` / `RcMap`                        | Memoizing parsed feature files by path, or scoped shared fixtures (browser/DB connection) keyed by tag or worker id.                                          |
| `Brand`                                  | Validated `TagName`/`StepPattern`/`FeaturePath` primitives, if the packages start hand-validating more string shapes.                                         |
| `FiberMap` / `FiberSet` / `FiberHandle`  | Structured fiber tracking if scenario/hook execution grows more concurrent (e.g. one fiber per scenario, awaited via `FiberSet.awaitEmpty`).                  |
| `Schedule`                               | Declarative scenario/step retry policies, if retry support is ever added as a first-class feature.                                                            |
| `Order`                                  | Composable `Order<Scenario>` (e.g. by source line) if scenario sorting logic grows more complex than it is today.                                             |

None of these are recommendations to act on now — they're flagged so a future PR reaches for the built-in first instead of hand-rolling the same shape this audit just found five times.

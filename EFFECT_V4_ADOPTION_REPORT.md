# Effect V4 Adoption Report

**Scope:** `packages/gherkin` and `packages/vitest`
**Effect version in use:** `4.0.0-rc.112` (pinned in `pnpm-workspace.yaml`, ADR-EC-012)
**Effect V4 source consulted:** `../effect` (local checkout, `packages/effect/src`, `packages/vitest/src`)
**Method:** 10-agent workflow — 9 file-group deep-dive agents covering all 46 source files across both packages (every finding's proposed API verified against the real `effect` source before being reported; every "before" snippet verified against the real repo files), plus 1 cross-cutting agent that (a) re-diffed PRs #78–#81 and the round-2 commit to check every previously-fixed anti-pattern for recurrence elsewhere in the same package, and (b) ran a repo-wide grep sweep for the six highest-signal anti-patterns (`_tag ===`/`switch` on tag, hand-rolled predicates, `new Date`/`Date.now`, `Math.random()`, `Promise.all`/`new Promise`, `class extends Error`).
**Result:** 12 confirmed issues (0 High, 2 Medium, 10 Low), plus 5 considered-and-rejected notes recorded for awareness. 0 hallucinated APIs, 0 structural/architectural gaps, 0 regressions in anything the prior two rounds already fixed.

## Executive summary

This is **round 3**, run after the round-2 findings (documented in the previous revision of this file) were resolved and merged (`bdbd010`, "Resolve round-2 Effect V4 builtin-adoption audit findings"). The cross-cutting agent re-verified every category the first two rounds fixed — `Predicate` guards, `Data.TaggedError`/`Schema.TaggedError`, `Array`/`Record` combinators in place of manual loops, `Match.tag`/`Match.orElse`/`Match.exhaustive` in place of `_tag` if-chains, `Schema.fromJsonString` in place of manual `JSON.parse` — and found **all of it still holds, with no regressions**.

What round 3 found is narrower and lower-stakes than round 2: this codebase is now deep enough into its Effect V4 adoption that most remaining gaps are single, isolated spots in otherwise-idiomatic files — a lookup helper in `Correlate.ts` that doesn't use the `Record.get` the rest of the same file already imports, a `T | null` return in `RerunManifest.ts` sitting next to files that model the identical "no filter configured" concept as `Option`, and a family of five hand-rolled tagged "notice" types in `Errors.ts` that never got the same `Data.TaggedClass` treatment their sibling `StepFailureLocation`/`HookFailureLocation` types already received. Nothing found is a correctness bug; every finding is a maintainability/consistency cleanup with a verified drop-in (or near drop-in) replacement.

Five additional patterns were seriously considered and explicitly **not** recommended, because they're either governed by a documented file-level design constraint (`Snippet.ts`'s "no `effect` import" rule, `Registry.ts`/`CallSite.ts`'s synchronous-registration boundary) or because forcing the "builtin" version would add ceremony without fixing anything real (`Runner.ts`'s closure-mutated counters, a dual-`instanceof` check with one shared outcome). These are recorded below so a future round doesn't re-flag them without new evidence.

| Priority | Count |
| -------- | ----- |
| High     | 0     |
| Medium   | 2     |
| Low      | 10    |

| Package | Count |
| ------- | ----- |
| gherkin | 4     |
| vitest  | 8     |

---

## 1. Manual lookups/absence-checks duplicating `Record`/`Option` combinators

**Category priority:** Medium/Low. Each file below already imports the combinator it's missing — this is one holdout spot, not a missing import.

### 1.1 `RerunManifest.ts` — `ReadonlySet<string> | null` instead of `Option<ReadonlySet<string>>` (Medium)

**File:** `packages/vitest/src/RerunManifest.ts:39, 46, 58`

```ts
// Before
export const readRerunManifest = (path: string): ReadonlySet<string> | null => {
  ...
  } catch {
    return null
  }
  ...
  if (Result.isFailure(decoded)) {
    console.warn(...)
    return null
  }
  return new Set(decoded.success.failed)
}
```

```ts
// After
export const readRerunManifest = (path: string): Option.Option<ReadonlySet<string>> => {
  ...
  } catch {
    return Option.none()
  }
  ...
  if (Result.isFailure(decoded)) {
    console.warn(...)
    return Option.none()
  }
  return Option.some(new Set(decoded.success.failed))
}
```

- **V4 API:** `Option.none`/`Option.some` (`effect/Option.ts`). `null` here means genuine, documented absence ("no filter configured" per the function's own doc comment) — exactly the case `ParsedScenario.ruleId`/`exampleRow` already model as `Option` elsewhere in this same codebase, rather than a trivial default.
- **Blast radius:** this is a public export with one consumer outside this file — `packages/vitest/src/describeFeature.ts:199` — plus `packages/vitest/test/RerunManifest.test.ts`. Both need a matching `Option.isNone`/`Option.getOrNull` update at the call site alongside this change; not a same-file drop-in.
- **Risk:** none behaviorally — pure representation change, same three code paths.

### 1.2 `Correlate.ts` — hand-rolled `Object.hasOwn` lookup instead of `Record.get` (Low)

**File:** `packages/gherkin/src/Correlate.ts:131-157`

```ts
// Before
const dialectOf = (language: string): Dialect | undefined =>
  Object.hasOwn(dialects, language) ? dialects[language] : undefined

export const isOutlineKeyword = (language: string, keyword: string): boolean => {
  const dialect = dialectOf(language)
  return dialect === undefined ? false : dialect.scenarioOutline.includes(keyword.trim())
}
// ...stepKeywords / isScenarioKeyword follow the same dialectOf(...) === undefined ? ... shape
```

```ts
// After
const dialectOf = (language: string): Option.Option<Dialect> => Rec.get(dialects, language)

export const isOutlineKeyword = (language: string, keyword: string): boolean =>
  Option.match(dialectOf(language), {
    onNone: () => false,
    onSome: (dialect) => dialect.scenarioOutline.includes(keyword.trim())
  })
```

- **V4 API:** `Record.get` (`effect/Record.ts:449-457`), implemented as exactly `Object.hasOwn(self, key) ? Option.some(self[key]) : Option.none()` — a byte-for-byte match for the hand-rolled version. This file already imports `Rec` and already uses `Rec.get` for the identical "safe lookup → `Option`" pattern twice elsewhere in the same file (lines 380, 399) — `dialectOf` is the one local holdout.
- **Risk:** none — same lookup semantics (`Object.hasOwn` guards against prototype pollution either way).

### 1.3 `RerunKey.ts` — `Option.getOrNull` + manual null-recheck instead of `Option.match` (Low)

**File:** `packages/vitest/src/RerunKey.ts:49-50`

```ts
// Before
const ruleId = Option.getOrNull(scenarioPlan.ruleId)
const ruleName = ruleId === null ? null : ruleNameById.get(ruleId) ?? null
```

```ts
// After
const ruleName = Option.match(scenarioPlan.ruleId, {
  onNone: () => null,
  onSome: (ruleId) => ruleNameById.get(ruleId) ?? null
})
```

- **V4 API:** `Option.match` (`effect/Option.ts:403`) — already used correctly for the identical shape in `OutlineTitle.ts`. The final `null` stays (it's `rerunKey`'s own public `string | null` parameter, not a smell); the smell is only the intermediate `getOrNull` + re-check this collapses.
- **Risk:** none — pure consistency cleanup.

### 1.4 `Validate.ts` — `Arr.getSomes([singleOption])` instead of `Option.toArray` (Low)

**File:** `packages/gherkin/src/Validate.ts:547-549`

```ts
// Before
const swallowedStepWarning = Arr.getSomes([
  suspectedSwallowedStep(uri, describeNode(node), node.description, node.location.line, keywords)
])
```

```ts
// After
const swallowedStepWarning = Option.toArray(
  suspectedSwallowedStep(uri, describeNode(node), node.description, node.location.line, keywords)
)
```

- **V4 API:** `Option.toArray` (`effect/Option.ts:1764`), implemented as `isNone(self) ? [] : [self.value]` — semantically identical to wrapping a single `Option` in a one-element array purely to run `Arr.getSomes` over it. (The other two `Arr.getSomes(...)`-over-many-`Options` call sites in this same file, lines ~391–397 and ~557–569, are the correct multi-element usage and are not affected.)
- **Risk:** none — pure simplification.

---

## 2. Hand-rolled tagged data instead of `Data.TaggedClass`

### 2.1 `Errors.ts` (vitest) — five "notice" types built as plain `interface` + factory instead of `Data.TaggedClass` (Medium)

**File:** `packages/vitest/src/Errors.ts:160-191, 202-273, 290-350, 362-388`

Affects `UnusedStepDefinitionWarning`, `UndeclaredTagWarning`, `UnknownContainerWarning`, `ExcludedScenariosNotice`, `StaleRerunManifestKeyWarning`.

```ts
// Before (representative — UnknownContainerWarning)
export interface UnknownContainerWarning {
  readonly _tag: "UnknownContainerWarning"
  readonly reason: UnknownContainerWarningReason
  readonly uri: string
  readonly kind: "Rule" | "Scenario"
  readonly name: string
  readonly ruleName: Option.Option<string>
  readonly known: ReadonlyArray<string>
  readonly message: string
}

export const makeUnknownContainerWarning = (args: {...}): UnknownContainerWarning => ({
  _tag: "UnknownContainerWarning",
  reason: "UnknownContainer",
  ...args
})
```

```ts
// After
export class UnknownContainerWarning extends Data.TaggedClass("UnknownContainerWarning")<{
  readonly reason: UnknownContainerWarningReason
  readonly uri: string
  readonly kind: "Rule" | "Scenario"
  readonly name: string
  readonly ruleName: Option.Option<string>
  readonly known: ReadonlyArray<string>
  readonly message: string
}> {}
// makeUnknownContainerWarning becomes `new UnknownContainerWarning({ ... })`,
// or a thin constructor wrapper kept for call-site compatibility.
```

- **V4 API:** `Data.TaggedClass` (`effect/Data.ts:91-99`) — an immutable, `Pipeable` class carrying `readonly _tag` plus structural `Equal`/`Hash` for free. This is literally the "hand-rolled tagged object" pattern the audit brief calls out, and it's the same package's own `Errors.ts` already applies `Data.TaggedError` correctly to `StepFailureLocation`/`HookFailureLocation` for a documented reason — it just never extended the identical idiom to these five plain-data "notices" (they're never raised through the Effect error channel, so `Data.TaggedClass`, not `Data.TaggedError`/`Schema.TaggedError`, is the right target; they're also never combined into one matched union anywhere in the codebase, so `Data.taggedEnum` doesn't fit either).
- **Why Medium, not High:** no test or runtime code relies on Effect's `Equal.equals`/`Hash.hash` for these values today — `test/Errors.test.ts` already does plain structural `toEqual` regardless of class. So this is a style-guide-consistency gap, not a live correctness bug.
- **Blast radius:** touches several out-of-scope consumers/re-exports (`Collect.ts`, `Plan.ts`, `Runner.ts`, `describeFeature.ts`, `VitestTestApi.ts`, `index.ts`) — a coordinated change, not a same-file drop-in.

---

## 3. Registration-time validation throws not yet on `Data.TaggedError`

**Category priority:** Low/Medium. Rounds 1–2 already converted this exact class of error — a synchronous throw at registration time describing a caller/config mistake, with structured fields on hand — to `Data.TaggedError` in `GherkinTags.ts`, `GherkinWatchTriggers.ts`, `StrictMode.ts`, and `Tags.ts`. Three more call sites of the identical shape were not touched:

- `packages/vitest/src/describeFeature.ts:148` — the mutually-exclusive `tagExpression` / `includeTags`+`excludeTags` option check, with `feature.name`, `feature.uri`, and both option values available as structured data.
- `packages/vitest/src/RuleNarrowing.ts:128` (`unsupportedScenarioExtraLayer`) — unsupported Scenario-level extra-`Layer`-under-narrowed-`Rule` combination, with the Scenario `name` available as structured data.
- `packages/vitest/src/Collect.ts:83` (inside `invokeDefine`) — a `define` callback returned a `Promise`, with `container`/`name`/call-site already computed locally.

```ts
// Before (shape common to all three)
throw new Error(`<message built from local structured fields>`)
```

```ts
// After (same shape already used for GherkinTags.ts / Tags.ts)
export class SomeRegistrationError extends Data.TaggedError("SomeRegistrationError")<{
  readonly /* the locally-available structured fields */
}> {}
// ...
throw new SomeRegistrationError({/* fields */})
```

- **V4 API:** `Data.TaggedError` (`effect/Data.ts:761`) — confirmed already the established idiom for this exact category in this package.
- **Not the same as:** the bare `Error`s intentionally kept in `Runner.ts:238`, `Registry.ts:69,~85`, and `Correlate.ts:164` — those guard genuinely unreachable internal-bug invariants ("this is a bug in this file, not in the feature being defined"), already reviewed and confirmed correct as plain `Error` in the round-2 report's appendix. The three above are the opposite: user-facing configuration mistakes, the exact category the existing convention targets.
- **Risk:** low — same `instanceof`/`.message` shape via `Data.TaggedError`, but each is a caller-visible API; check whether any test asserts `toThrowError(Error)` by base class before merging (the same caveat rounds 1–2 called out for `HookTagExpressionError`).

---

## 4. Duplicated helper logic / native methods instead of `effect/Array`

### 4.1 `Pickles.ts` — inline `Predicate.isError` ternary instead of reusing `describeCause` (Low)

**File:** `packages/gherkin/src/Pickles.ts:31`

```ts
// Before
message: ;
;`Failed to compile pickles for ${uri}: ${Predicate.isError(thrown) ? thrown.message : String(thrown)}`
```

```ts
// After
import { describeCause } from "./StepMatcher.ts"
// ...
message: ;
;`Failed to compile pickles for ${uri}: ${describeCause(thrown)}`
```

- **Why this is in scope:** round 1 (PR #80) fixed the identical duplication in `ParameterTypes.ts` specifically by having it reuse `StepMatcher.ts`'s `describeCause` helper instead of re-inlining the same `Predicate.isError(...) ? ... : String(...)` ternary a second time. `Pickles.ts` is in the same package with the identical inline ternary, left untouched.
- **Risk:** none — behavior-identical, pure de-duplication.

### 4.2 `Plan.ts` — native `.toSorted(customComparator)` instead of `Arr.sort` + `Order` (Low)

**File:** `packages/vitest/src/Plan.ts:165, 346`

```ts
// Before (line 165)
const ordered = matches.toSorted((left, right) => compareCallSites(left.definedAt, right.definedAt))
  // Before (line 346)
  .toSorted((left, right) => {
    const bySite = compareCallSites(left.definedAt, right.definedAt)
    return bySite === 0 ? left.pattern.localeCompare(right.pattern) : bySite
  })
```

```ts
// After
import * as Order from "effect/Order"

const ordered = Arr.sort(matches, Order.make(compareCallSites))
// ...
Arr.sort(
  matches,
  Order.combine(Order.make(compareCallSites), Order.mapInput(Order.String, (d) => d.pattern))
)
```

- **V4 API:** `Arr.sort` + `Order.make`/`Order.combine`/`Order.mapInput` (`effect/Order.ts:111` and neighboring exports). Round 1 (PR #80) fixed this exact shape in `StepArguments.ts` ("swap native `Array.isArray`/`toSorted`/`Object.fromEntries` for their `effect/Array` equivalents"); `TagExpression.ts:43` and `GherkinTags.ts:95` already call `Arr.sort(..., Order.String)` correctly. `Plan.ts` is the one remaining native holdout, now with a custom comparator instead of a lifted `Order`.
- **Risk:** none — behavior-identical.

---

## 5. Style-consistency note — `Data.TaggedError` vs `Schema.TaggedError` (Low, informational)

LLMS.md's blanket guidance is "define errors with `Schema.TaggedError`." Rounds 1–2 already established that `Data.TaggedError` is an _accepted alternative_ for errors thrown synchronously outside the Effect error channel (`Runner.ts`'s `UnusedStepDefinitionFailure`, `StrictMode.ts`, `TagExpression.ts`, `HookTagExpression.ts`) — this round re-confirmed that reasoning still holds and is not a violation.

One nuance surfaced this round: `Schema.TaggedError` (`effect/Schema.ts:13489-13523`) also compiles down to a real `Error` subclass returning `Cause.YieldableError`, so "needs to be a real thrown `Error`" doesn't by itself distinguish the two choices the way `GherkinTags.ts`'s and `GherkinWatchTriggers.ts`'s inline comments imply. This doesn't change the recommendation (the existing `Data.TaggedError` choices are fine and not being asked to change), but if this project wants a crisper rule for the _next_ time this class of error is added, it's worth deciding explicitly: "`Data.TaggedError` for internal/never-decoded synchronous throws, `Schema.TaggedError` for anything that flows through the Effect error channel or could ever need schema decode/encode" — and writing that down in LLMS.md or an ADR rather than leaving it as an inline comment repeated per-file.

---

## 6. Confirmed clean — no findings

The following were reviewed in full against `effect/packages/effect/src` (and, for the `packages/vitest` files, cross-checked against `@effect/vitest`'s own source), with no actionable findings:

- **`packages/gherkin`:** `DataTable.ts`, `DocString.ts`, `ExamplesRow.ts`, `Model.ts`, `ParameterTypes.ts`, `Parser.ts`, `Snippet.ts` (see note below), `Source.ts`, `StepArgs.ts`, `StepArguments.ts`, `StepMatcher.ts`, `StepPatternMessages.ts`, `Errors.ts`, `index.ts`, `loadFeature.ts` (see note below).
- **`packages/vitest`:** `Attachments.ts`, `CallSite.ts` (see note below), `Collect.ts`, `Dsl.ts`, `GherkinTags.ts` (see note below), `GherkinWatchTriggers.ts`, `Hook.ts`, `HookRegistry.ts`, `HookTagExpression.ts`, `OutlineTitle.ts`, `Registry.ts`, `RuleNarrowing.ts` (aside from §3), `Runner.ts` (aside from §3/note below), `ScenarioEffect.ts`, `ScenarioKey.ts`, `ScenarioMetrics.ts`, `ScenarioSeed.ts`, `Step.ts`, `StepModule.ts`, `StrictMode.ts`, `Tags.ts`, `TagExpression.ts`, `TestApi.ts`, `Testing.ts`, `VitestTestApi.ts`, `describeFeature.ts` (aside from §3), `index.ts`.

### Considered and explicitly rejected (not findings — recorded so a future round doesn't re-flag without new evidence)

- **`Snippet.ts:123-125`** — `Object.hasOwn(tsTypeByName, info.name) ? tsTypeByName[info.name] : "unknown"` is the same shape `Record.get` would replace, but this file's own header states "no `effect` import" as a deliberate, documented design invariant (kept dependency-free on purpose, unlike the rest of the package). Applying the fix would violate that stated constraint — informational only.
- **`CallSite.ts:27-51, 57-79`** — `DefinitionSite | null` (rather than `Option`) is a real absence-value opportunity, but `DefinitionSite` is defined once in `Registry.ts` and consumed across `Dsl.ts`, `Plan.ts`, and elsewhere — `CallSite.ts` is conforming to an established shared boundary type, not inventing its own null-handling in isolation. Fixing it properly means changing the shared type in `Registry.ts` first, which ripples beyond a single file.
- **`Runner.ts:194-196, 255, 269, 327, 382, 409`** — closure-mutated counters (`let excludedScenarioCount`, `let attempted`, etc.) look like manual state that `Ref` should replace, but `emitFeature` is a synchronous, framework-agnostic registration walk with no Effect fiber involved (vitest calls the registering callbacks synchronously, outside any `Effect.runSync`). Lifting this into `Ref` would require running the Effect runtime at a seam explicitly designed to stay synchronous — more risk than benefit.
- **`loadFeature.ts:54`** — `if (thrown instanceof LoadFeatureError || thrown instanceof StepPatternError) return thrown` narrows by `instanceof` rather than `Match.tag`, but both branches produce the _identical_ outcome (return `thrown` unchanged) over an `unknown` input, not per-tag differentiated dispatch — the shape the `Match.tag` house rule targets. Low-confidence; not asserted as a violation.
- **`GherkinTags.ts:76-84`** — an `if`/`else if` chain branches on a plain `string | null` union (`DocStringFence`), not a `_tag`-discriminated object, so the `Match.tag` house rule (specifically about `_tag` fields) doesn't strictly apply. Could optionally be written as `Match.value(fence).pipe(Match.when(null, ...), Match.orElse(...))` for stylistic consistency, but this is preference, not a violation.

---

## 7. Cross-cutting architecture check (re-run)

**Result: no structural findings; everything from rounds 1–2 re-confirmed still correct.** Repo-wide grep sweep across all of `packages/gherkin/src` and `packages/vitest/src`:

- `_tag ===` / `switch (x._tag)`: **zero hits.** `Match.tag`/`Match.orElse`/`Match.exhaustive` used consistently everywhere a `_tag`-discriminated value is branched on.
- Hand-rolled predicates (`isRecord`/`isString`/`typeof x === "string"|"object"`): **zero hits.** `effect/Predicate` used throughout.
- `new Date(`/`Date.now()`: **zero hits**, either package.
- `Math.random()`: **zero hits** — scenario seeding goes through `Random.withSeed`, not raw `Math.random`.
- `Promise.all(`/`new Promise(`: **zero hits** — the only `Promise<...>` usages are type-level signatures at genuine framework-boundary seams (`VitestTestApi.ts`, `loadFeature.ts`), wrapping `Effect.runPromise`.
- `class ... extends Error`: **zero hits** — every custom error is `Schema.TaggedError` or `Data.TaggedError`; the only `instanceof Error`-adjacent checks discriminate **upstream** `@cucumber/gherkin` exception classes (`Parser.ts`), pinned by `test/upstream-pin.test.ts`.
- Bare arrow-wrappers around `Effect.gen` (candidates for `Effect.fn`/`Effect.fnUntraced`): **zero hits** — every exported reusable Effect-returning function already uses `Effect.fn`/`Effect.fnUntraced`. The one remaining raw `Effect.gen(function*() {...})` (`ScenarioEffect.ts:75`) sits inside a `Match.orElse` arm that is itself piped through `.pipe(Effect.onExit(...))` — attached to a combinator, not a bare pass-through wrapper.

`packages/vitest`'s dependency on `@effect/vitest` (peer dependency, delegated `it.effect`/`describe`/`beforeAll`/`afterAll`/`layer(...)`/`flakyTest`) and the one documented exception (`VitestTestApi.ts`'s second `Scope` held open across a Feature block, working around `@effect/vitest`'s `layer()` tearing its scope down from `onTestFinished` before any `afterAll`) were not re-audited in depth this round — no code near that boundary changed since round 2's confirmation.

---

## Adoption plan (priority order)

| # | Change                                                                          | Priority | Files                                                                                                              | Breaking?                                                 |
| - | ------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| 1 | `ReadonlySet<string> \| null` → `Option<ReadonlySet<string>>`                   | Medium   | `RerunManifest.ts` (+ caller update in `describeFeature.ts`)                                                       | Internal-only, one coordinated call-site update           |
| 2 | 5 hand-rolled tagged "notice" interfaces → `Data.TaggedClass`                   | Medium   | `Errors.ts` (vitest) (+ consumers: `Collect.ts`, `Plan.ts`, `Runner.ts`, `describeFeature.ts`, `VitestTestApi.ts`) | No                                                        |
| 3 | 3 registration-time `throw new Error` → `Data.TaggedError`                      | Low/Med  | `describeFeature.ts`, `RuleNarrowing.ts`, `Collect.ts`                                                             | Check tests asserting `toThrowError(Error)` by base class |
| 4 | `Object.hasOwn` lookup → `Record.get` + `Option.match`                          | Low      | `Correlate.ts`                                                                                                     | No                                                        |
| 5 | `Option.getOrNull` + null-recheck → `Option.match`                              | Low      | `RerunKey.ts`                                                                                                      | No                                                        |
| 6 | `Arr.getSomes([single])` → `Option.toArray`                                     | Low      | `Validate.ts`                                                                                                      | No                                                        |
| 7 | Inline `Predicate.isError` ternary → reuse `describeCause`                      | Low      | `Pickles.ts`                                                                                                       | No                                                        |
| 8 | Native `.toSorted(customComparator)` (×2) → `Arr.sort` + `Order.make`/`combine` | Low      | `Plan.ts`                                                                                                          | No                                                        |

All 8 changes are internal-only, zero-behavior-change refactors. Items 1–2 are worth their own PR each given the cross-file blast radius; items 3 and 4–8 can each batch into a single PR, mirroring how PRs #80/#81 batched the prior round.

---

## Appendix — Already resolved by prior audit rounds (verified still correct this round)

- `Predicate.isPromiseLike`/`isError`/`isString`/`isRegExp`/`hasProperty` in place of hand-rolled `typeof`/`instanceof` guards (PRs #78–80).
- `Data.TaggedClass`/`Data.TaggedError` in place of hand-rolled `Error` subclasses (PRs #78, #81).
- `Array.groupBy`/`dedupe`/`findFirstIndex`, `Option.liftPredicate`, `Array.filterMap` in place of manual `Map`-bucket-push loops (PRs #78, #81).
- `Match.tag`/`Match.orElse`/`Match.exhaustive` in place of `_tag` if-chains in `ScenarioEffect.ts`, `Testing.ts`, `VitestTestApi.ts`, `DataTable.ts`, `Source.ts` (PRs #80, #81).
- `Schema.fromJsonString` + `Schema.decodeUnknownResult` in place of manual `JSON.parse` (PR #81, `RerunManifest.ts`).
- `Effect.fnUntraced` in place of functions that only wrapped-and-returned `Effect.gen` (PRs #80, #81).
- **Round 2** (`bdbd010`): `Option.fromUndefinedOr` + `Option.map` in place of manual `undefined`-ternaries (`Correlate.ts:371-373`); `Option.match` in place of `Option.isSome` ternaries (`DataTable.ts`, `ExamplesRow.ts`); `Option` return type in place of a hand-rolled `undefined` sentinel (`Parser.ts`); `Array.findFirst` in place of a manual find-loop (`ParameterTypes.ts`); `Array.last` + `Option.getOrThrowWith` in place of manual last-element-or-throw (`Registry.ts`); `Match.value`/`Match.when`/`Match.exhaustive` in place of ternary chains on `RegistryScopeKind` and `ExcludedScenariosNoticeReason`/`kind` (`Plan.ts`, `Errors.ts`).

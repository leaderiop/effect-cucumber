# Effect V4 Adoption Report

**Scope:** `packages/gherkin` and `packages/vitest`
**Effect version in use:** `4.0.0-rc.112` (pinned in `pnpm-workspace.yaml`, ADR-EC-012)
**Effect V4 source consulted:** `../effect` (local checkout, `packages/effect/src`, `packages/platform/src`, `packages/vitest/src`)
**Method:** 10-agent workflow — 9 file-group deep-dive agents covering all 50 source files across both packages (every finding's proposed API verified against the real `effect` source, every "before" snippet verified against the real repo files), plus 1 cross-cutting architecture agent checking package-boundary patterns (error modeling, `_tag` branching, service wiring, mutable-singleton usage) and effect-cucumber's `packages/vitest` against the official `@effect/vitest` package it wraps.
**Result:** 9 confirmed issues (0 High, 2 Medium, 7 Low), 0 hallucinated APIs, 0 structural/architectural gaps.

## Executive summary

This is a **follow-up round**, run after four prior audit passes (PRs #78, #79, #80, #81 — see `git log`) already resolved 17+12 findings from earlier versions of this report (hand-rolled `instanceof`/`typeof` guards, hand-rolled `Error` subclasses, manual `Map`-bucket-push loops, a stale `.Default` layer-naming convention, `Match.tag` in place of `_tag` if-chains, `Schema.fromJsonString` in place of manual `JSON.parse`). Re-auditing every one of those categories this round found them **all still resolved and idiomatic** — no regressions.

What's left is narrow: a small cluster of files that already import `Option`/`Match` correctly elsewhere but have one remaining spot that reverts to a manual `undefined`-ternary or a plain `if`/ternary chain instead of using the combinator consistently. Nothing here is a correctness bug — every finding is a maintainability/consistency cleanup with an exact, verified drop-in replacement.

The cross-cutting pass additionally confirmed `packages/vitest` correctly depends on and delegates to `@effect/vitest` (declared as a peer dependency) rather than reimplementing its `it.effect`/`layer(...)`/`TestClock` machinery — the one place effect-cucumber adds its own scope-holding logic in `VitestTestApi.ts` is a documented, necessary workaround for a real `@effect/vitest` v4 behavior (`layer()`'s single-arg form tears its scope down from `onTestFinished`, before any `afterAll`), not a duplicate of something already provided.

| Priority | Count |
| -------- | ----- |
| High     | 0     |
| Medium   | 2     |
| Low      | 7     |

| Package | Count |
| ------- | ----- |
| gherkin | 5     |
| vitest  | 4     |

---

## 1. `Option` combinators used inconsistently

**Category priority:** Low. Each of these files already imports and uses `Option` idiomatically elsewhere — these are the one remaining spot per file that fell back to a manual `undefined`-check or `Option.isSome(...) ? ... : ...` ternary instead of `Option.match`/`Option.map`/`Option.fromUndefinedOr`.

### 1.1 `Correlate.ts` — manual `undefined`-ternary instead of `Option.fromUndefinedOr` + `Option.map`

**File:** `packages/gherkin/src/Correlate.ts:371-373`

```ts
// Before
exampleRow: rowInfo === undefined
  ? Option.none()
  : Option.some(makeExamplesRow(rowInfo.header, rowInfo.values, uri, location.line))
```

```ts
// After
exampleRow: Option.map(
  Option.fromUndefinedOr(rowInfo),
  (info) => makeExamplesRow(info.header, info.values, uri, location.line)
)
```

- **V4 API:** `Option.fromUndefinedOr` (`effect/Option.ts:807`) + `Option.map`. The file already uses `Option.fromUndefinedOr` twice elsewhere (lines 332, 369) — this is the one holdout.
- **Risk:** None — pure refactor, identical output for every input.

### 1.2 `DataTable.ts` — `Option.isSome` ternaries instead of `Option.match`

**File:** `packages/gherkin/src/DataTable.ts:227-234`

```ts
// Before
const opening = Option.isSome(row)
  ? `Row ${row.value} of the DataTable at ${table.uri}:${table.line} failed to decode`
  : `The DataTable at ${table.uri}:${table.line} failed to decode`
const located = Option.isSome(column) ? `${opening}, column ${JSON.stringify(column.value)}` : opening
```

```ts
// After
const opening = Option.match(row, {
  onNone: () => `The DataTable at ${table.uri}:${table.line} failed to decode`,
  onSome: (r) => `Row ${r} of the DataTable at ${table.uri}:${table.line} failed to decode`
})
const located = Option.match(column, {
  onNone: () => opening,
  onSome: (c) => `${opening}, column ${JSON.stringify(c)}`
})
```

- **V4 API:** `Option.match` (`effect/Option.ts:403`) — the canonical combinator for branching on `Some`/`None`, replacing the manual `isSome` + ternary this file uses as a substitute.
- **Risk:** None.

### 1.3 `ExamplesRow.ts` — same `Option.isSome` ternary pattern

**File:** `packages/gherkin/src/ExamplesRow.ts:63-65`

```ts
// Before
const opening = Option.isSome(column)
  ? `The Examples row at ${row.uri}:${row.line} failed to decode, column ${JSON.stringify(column.value)}`
  : `The Examples row at ${row.uri}:${row.line} failed to decode`
```

```ts
// After
const opening = Option.match(column, {
  onNone: () => `The Examples row at ${row.uri}:${row.line} failed to decode`,
  onSome: (c) => `The Examples row at ${row.uri}:${row.line} failed to decode, column ${JSON.stringify(c)}`
})
```

- Same rationale as 1.2. **Recommendation:** fix 1.2 and 1.3 together — identical diff shape, same file neighborhood (`DataTable.ts`/`ExamplesRow.ts` are both decode-failure-message builders).

### 1.4 `Parser.ts` — hand-rolled `undefined` sentinel instead of `Option`

**File:** `packages/gherkin/src/Parser.ts:78-109`

```ts
// Before
const findPrototypeKeyLanguageHeader = (
  source: string
): { readonly language: string; readonly line: number } | undefined => {
  const lines = source.split(/\r?\n/)
  for (const [index, text] of lines.entries()) {
    if (text.trim() === "") continue
    const match = languageHeader.exec(text)
    if (match === null) return undefined
    const language = match[1] ?? ""
    return !Object.hasOwn(dialects, language) && language in dialects ? { language, line: index + 1 } : undefined
  }
  return undefined
}
// ...
const prototypeKeyHeader = findPrototypeKeyLanguageHeader(source)
if (prototypeKeyHeader !== undefined) {
  throw new LoadFeatureError({
    reason: "UnknownDialect",
    uri,
    line: Option.some(prototypeKeyHeader.line),
    message: `Unknown dialect in ${uri}:\n(${prototypeKeyHeader.line}:1): Language not supported: ` +
      `${prototypeKeyHeader.language}`
  })
}
```

```ts
// After
const findPrototypeKeyLanguageHeader = (
  source: string
): Option.Option<{ readonly language: string; readonly line: number }> => {
  const lines = source.split(/\r?\n/)
  for (const [index, text] of lines.entries()) {
    if (text.trim() === "") continue
    const match = languageHeader.exec(text)
    if (match === null) return Option.none()
    const language = match[1] ?? ""
    return !Object.hasOwn(dialects, language) && language in dialects
      ? Option.some({ language, line: index + 1 })
      : Option.none()
  }
  return Option.none()
}
// ...
const prototypeKeyHeader = findPrototypeKeyLanguageHeader(source)
if (Option.isSome(prototypeKeyHeader)) {
  const { language, line } = prototypeKeyHeader.value
  throw new LoadFeatureError({
    reason: "UnknownDialect",
    uri,
    line: Option.some(line),
    message: `Unknown dialect in ${uri}:\n(${line}:1): Language not supported: ${language}`
  })
}
```

- **Rationale:** The rest of the module already models optionality with `Option` (`Option.none()`, `Option.some()`, `Option.fromUndefinedOr`) — this helper is the sole holdout using a raw `undefined` sentinel.
- **Risk:** None — pure refactor.

---

## 2. `Array` combinators over manual loops

### 2.1 `ParameterTypes.ts` — manual "find first match" loop instead of `Array.findFirst`

**File:** `packages/gherkin/src/ParameterTypes.ts:190-204`

```ts
// Before
if (Predicate.isRegExp(entry)) {
  for (const flag of rejectedRegexpFlags) {
    if (entry.flags.includes(flag)) {
      fail({
        reason: "InvalidParameterTypeRegexp",
        parameterTypeName: name,
        sentences: [
          `the regexp /${entry.source}/${entry.flags} supplied for ${describeName(name)}`,
          `carries the ${flag} flag, which upstream's ParameterType constructor rejects.`,
          `Drop the ${flag} flag.`
        ]
      })
    }
  }
}
```

```ts
// After
if (Predicate.isRegExp(entry)) {
  const rejectedFlag = Arr.findFirst(rejectedRegexpFlags, (flag) => entry.flags.includes(flag))
  if (Option.isSome(rejectedFlag)) {
    const flag = rejectedFlag.value
    fail({
      reason: "InvalidParameterTypeRegexp",
      parameterTypeName: name,
      sentences: [
        `the regexp /${entry.source}/${entry.flags} supplied for ${describeName(name)}`,
        `carries the ${flag} flag, which upstream's ParameterType constructor rejects.`,
        `Drop the ${flag} flag.`
      ]
    })
  }
}
```

- **V4 API:** `Arr.findFirst` — already used for the same "find one matching record" shape a few lines earlier in this file (line 145). This is the one spot that didn't follow that precedent.
- **Risk:** None — the original loop's `fail(...)` throws on the first match, so behavior is identical.

### 2.2 `Registry.ts` — manual "last element or throw" instead of `Array.last` + `Option.getOrThrowWith`

**File:** `packages/vitest/src/Registry.ts:50-60`

```ts
// Before
const currentScope = (): RegistryScope => {
  const top = stack[stack.length - 1]
  // Unreachable: `popScope` refuses to remove the root frame, so the stack is never empty.
  if (top === undefined) {
    throw new Error(
      "Registry scope stack is empty, which popScope() is supposed to make impossible. " +
        "This is a bug in Registry.ts, not in the feature being defined."
    )
  }
  return top
}
```

```ts
// After
import * as Arr from "effect/Array"
import * as Option from "effect/Option"

const currentScope = (): RegistryScope =>
  Option.getOrThrowWith(
    Arr.last(stack),
    () =>
      new Error(
        "Registry scope stack is empty, which popScope() is supposed to make impossible. " +
          "This is a bug in Registry.ts, not in the feature being defined."
      )
  )
```

- **V4 API:** `Array.last` (`effect/Array.ts:1139`) returns `Option<A>`; `Option.getOrThrowWith` replaces the manual `undefined`-check-and-throw with the standard pipeline already used throughout the rest of this package.
- **Risk:** None.

---

## 3. `_tag`/discriminant branching via if-ternary instead of `Match`

**Category priority:** Medium — this repo has a standing rule to always use `Match.tag`/`Match.value`/`Match.orElse`/`Match.exhaustive` for discriminant branching, never if-chains, even at a coverage cost. Both files below already use `Match` correctly elsewhere in the same file, making these the one inconsistent holdout each.

### 3.1 `Plan.ts` — ternary chain on `RegistryScopeKind` instead of `Match`

**File:** `packages/vitest/src/Plan.ts:242`

```ts
// Before
const scopeRank = (kind: RegistryScopeKind): number => kind === "feature" ? 2 : kind === "rule" ? 1 : 0
```

```ts
// After
import * as Match from "effect/Match"

const scopeRank = (kind: RegistryScopeKind): number =>
  Match.value(kind).pipe(
    Match.when("feature", () => 2),
    Match.when("rule", () => 1),
    Match.orElse(() => 0) // "background" | "scenario"
  )
```

- **Rationale:** `isVisibleTo` (lines 224-240, two functions above) already uses `Match.value`/`Match.when`/`Match.exhaustive` on this exact `RegistryScopeKind` union — `Match` is already imported, this is a local inconsistency, not a missing dependency.
- **Severity:** Medium (violates the project's standing `Match`-over-if-chain rule directly).

### 3.2 `Errors.ts` (vitest) — 4-way ternary chain on `ExcludedScenariosNoticeReason` instead of `Match.exhaustive`

**File:** `packages/vitest/src/Errors.ts:321-327`

```ts
// Before
const filters = reason === "ExcludedByTagExpression"
  ? `tagExpression ${quoted(args.tagExpression ?? "")}`
  : reason === "ExcludedByIncludeTags"
  ? `includeTags [${quotedList(args.includeTags)}]`
  : reason === "ExcludedByExcludeTags"
  ? `excludeTags [${quotedList(args.excludeTags)}]`
  : `includeTags [${quotedList(args.includeTags)}] and excludeTags [${quotedList(args.excludeTags)}]`
```

```ts
// After
import * as Match from "effect/Match"

const filters = Match.value(reason).pipe(
  Match.when("ExcludedByTagExpression", () => `tagExpression ${quoted(args.tagExpression ?? "")}`),
  Match.when("ExcludedByIncludeTags", () => `includeTags [${quotedList(args.includeTags)}]`),
  Match.when("ExcludedByExcludeTags", () => `excludeTags [${quotedList(args.excludeTags)}]`),
  Match.when(
    "ExcludedByBothTagFilters",
    () => `includeTags [${quotedList(args.includeTags)}] and excludeTags [${quotedList(args.excludeTags)}]`
  ),
  Match.exhaustive
)
```

- **Rationale:** Matches the project's standing `Match`-over-if-chain rule. `Match.exhaustive` also gives a compile-time guarantee all four `ExcludedScenariosNoticeReason` literals are handled — today the final ternary branch silently absorbs any reason it doesn't explicitly recognize, so a future fifth reason would compile but render the wrong message. `Match.exhaustive` turns that into a type error at the call site instead.
- **Severity:** Medium — the exhaustiveness gap is a real (if currently dormant) correctness risk, not just a style nit.

### 3.3 `Errors.ts` (vitest) — 2-way ternary on `kind: "Rule" | "Scenario"` instead of `Match`

**File:** `packages/vitest/src/Errors.ts:248`

```ts
// Before
args.kind === "Rule" ? "steps, Background and hooks" : "steps"
```

```ts
// After
import * as Match from "effect/Match"

Match.value(args.kind).pipe(
  Match.when("Rule", () => "steps, Background and hooks"),
  Match.when("Scenario", () => "steps"),
  Match.exhaustive
)
```

- **Severity:** Low — same standing rule, but only a 2-way ternary with no dormant exhaustiveness gap (the union has exactly two members already fully covered).

---

## 4. Confirmed clean — no findings

The following were reviewed in full against `effect/packages/effect/src`, `effect/packages/platform/src`, and `effect/packages/vitest/src`, with no actionable findings:

- **`packages/gherkin`:** `DocString.ts`, `Model.ts`, `Pickles.ts`, `Snippet.ts`, `Source.ts`, `StepArgs.ts`, `StepArguments.ts`, `StepMatcher.ts`, `StepPatternMessages.ts`, `Validate.ts`, `Errors.ts`, `index.ts`, `loadFeature.ts`.
- **`packages/vitest`:** `Attachments.ts`, `CallSite.ts`, `Collect.ts`, `Dsl.ts`, `GherkinTags.ts`, `GherkinWatchTriggers.ts`, `Hook.ts`, `HookRegistry.ts`, `HookTagExpression.ts`, `OutlineTitle.ts`, `RerunKey.ts`, `RerunManifest.ts`, `RuleNarrowing.ts`, `Runner.ts`, `ScenarioEffect.ts`, `ScenarioKey.ts`, `ScenarioMetrics.ts`, `ScenarioSeed.ts`, `Step.ts`, `StepModule.ts`, `StrictMode.ts`, `TagExpression.ts`, `Tags.ts`, `TestApi.ts`, `Testing.ts`, `VitestTestApi.ts`, `describeFeature.ts`, `index.ts`, `loadFeature.ts`.

Notable deliberate, documented exceptions verified as correct (not gaps):

- **Synchronous `node:fs`/`fs.readFileSync`** in `GherkinTags.ts` and `RerunManifest.ts` — required because `describeFeature` registration runs synchronously at vitest config-load/collection time, before any Effect runtime exists to run `FileSystem` against.
- **`Data.TaggedError` (not `Schema.TaggedError`)** for `UnusedStepDefinitionFailure` (`Runner.ts`) and the tag-expression errors (`StrictMode.ts`, `TagExpression.ts`, `HookTagExpression.ts`) — these are thrown synchronously outside Effect's error channel by design, so `Schema.TaggedError` (which targets the typed failure channel) doesn't fit; `Data.TaggedError` is the correct V4 choice here.
- **`fiber.pollUnsafe()`** in `Testing.ts` — no non-blocking, Effect-returning poll exists in this Effect version; documented and justified.
- **`Cause.combine`-based manual reduce** in `Hook.ts` — verified `effect/Cause.ts` has no N-ary/`combineAll` helper, and `Effect.partition`/`Effect.forEach` only separate typed `E` failures, not full `Cause` (which must also capture defects here) — legitimately hand-rolled.
- **`Match.value(...).pipe(Match.tag(...), Match.exhaustive)`** already used correctly for `Exit` (`Testing.ts`), the shared-`it` `Option` (`VitestTestApi.ts`), `ResolvedStep`/`Unresolved` (`ScenarioEffect.ts`), and the `PlatformError` reason union (`Source.ts`).

---

## 5. Cross-cutting architecture check

**Result: no structural findings.** Full repo-wide sweep (not file-by-file) for these patterns came back empty or already-justified:

- `extends Error` / plain-object errors: none, other than deliberate `instanceof` checks against **upstream** `@cucumber/gherkin` exception classes (documented, pinned by `test/upstream-pin.test.ts`).
- `_tag ===` / `switch (x._tag)`: none — `Match.tag`/`Match.orElse`/`Match.exhaustive` used consistently everywhere except the two spots in §3.
- Hand-rolled `async function`/raw `await` logic: none — only two `Promise<...>` signatures exist, both at genuine framework-boundary seams (`VitestTestApi.ts:200`, `loadFeature.ts:20`), wrapping `Effect.runPromise`.
- `Context.GenericTag`/`Context.Tag` instead of `Context.Service`: none.
- `Date.now()`/`new Date()`: none anywhere in either package.
- Module-level mutable singletons instead of `Ref`/`Context.Service`: the mutable stacks/arrays in `Registry.ts`/`HookRegistry.ts` are per-call factory closures explicitly rebuilt fresh per `describeFeature` (enforced by their own test suites) — correct for synchronous, vitest-collection-time registration where no concurrent Effect fiber touches the state, not a `Ref` opportunity.
- `Promise.all`/`race`, `setTimeout`/`setInterval`, hand-rolled retry loops: none found beyond the documented `pollUnsafe` case above.

**`@effect/vitest` dependency check:** `packages/vitest/package.json` declares `@effect/vitest` as a peer dependency, and `VitestTestApi.ts` delegates feature/scenario registration to its real `it.effect`, `describe`, `beforeAll`, `afterAll`, `layer(...)`, and `flakyTest` — none of these are reimplemented. The one place effect-cucumber adds its own machinery (holding a second `Scope` open across a Feature block) is a verified, necessary workaround: `@effect/vitest`'s single-argument `layer(...)` tears its scope down from the **last test's `onTestFinished`**, before any `afterAll` — confirmed by reading `effect/packages/vitest/src/internal/internal.ts:291-303` directly. Since effect-cucumber's `BeforeAllScenarios`/`AfterAllScenarios` hooks need the shared tier to survive past that point, a second scope is required, not redundant.

---

## Adoption plan (priority order)

| # | Change                                                                | Priority | Files                            | Breaking? |
| - | --------------------------------------------------------------------- | -------- | -------------------------------- | --------- |
| 1 | 4-way ternary → `Match.value`/`Match.when`/`Match.exhaustive`         | Medium   | `Errors.ts` (vitest)             | No        |
| 2 | `scopeRank` ternary → `Match.value`/`Match.when`/`Match.orElse`       | Medium   | `Plan.ts`                        | No        |
| 3 | `Option.isSome` ternaries → `Option.match` (×2)                       | Low      | `DataTable.ts`, `ExamplesRow.ts` | No        |
| 4 | `undefined` sentinel → `Option` return type                           | Low      | `Parser.ts`                      | No        |
| 5 | Manual `undefined`-ternary → `Option.fromUndefinedOr` + `Option.map`  | Low      | `Correlate.ts`                   | No        |
| 6 | Manual find-loop → `Array.findFirst`                                  | Low      | `ParameterTypes.ts`              | No        |
| 7 | Manual last-element-or-throw → `Array.last` + `Option.getOrThrowWith` | Low      | `Registry.ts`                    | No        |
| 8 | 2-way ternary → `Match.value`/`Match.when`/`Match.exhaustive`         | Low      | `Errors.ts` (vitest)             | No        |

All 8 changes are internal-only, zero-behavior-change refactors with no breaking surface — suitable for a single PR (or the two `Errors.ts`/`Plan.ts` `Match` items as one PR and the five `Option`/`Array` consistency items as a second, mirroring how PRs #80/#81 batched the prior round).

---

## Appendix — Already resolved by prior audit rounds (verified still correct this round)

- `Predicate.isPromiseLike`/`isError`/`isString`/`isRegExp`/`hasProperty` in place of hand-rolled `typeof`/`instanceof` guards (PRs #78–80).
- `Data.TaggedClass`/`Data.TaggedError` in place of hand-rolled `Error` subclasses (PRs #78, #81).
- `Array.groupBy`/`dedupe`/`findFirstIndex`, `Option.liftPredicate`, `Array.filterMap` in place of manual `Map`-bucket-push loops (PRs #78, #81).
- `Match.tag`/`Match.orElse`/`Match.exhaustive` in place of `_tag` if-chains in `ScenarioEffect.ts`, `Testing.ts`, `VitestTestApi.ts`, `DataTable.ts`, `Source.ts` (PRs #80, #81).
- `Schema.fromJsonString` + `Schema.decodeUnknownResult` in place of manual `JSON.parse` (PR #81, `RerunManifest.ts`).
- `Effect.fnUntraced` in place of functions that only wrapped-and-returned `Effect.gen` (PRs #80, #81).
- `ParameterTypeStore.Default` → `.layerDefault` v4 layer-naming convention, with a `@deprecated` alias kept for compatibility (`ParameterTypes.ts`).

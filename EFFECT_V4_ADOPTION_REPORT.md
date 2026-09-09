# Effect V4 Adoption Report

**Scope:** `packages/gherkin` and `packages/vitest`
**Effect version in use:** `4.0.0-rc.112` (pinned in `pnpm-workspace.yaml`, ADR-EC-012)
**Effect V4 source consulted:** `../effect` (local checkout, `packages/effect/src`, `packages/vitest/src`)
**Commit audited:** `15891b1` ("Fix CI: coverage threshold, unused export, and API-surface doc gaps"), on top of round 3's resolution commit `3b57a8e`
**Method:** 10-agent workflow, same design as rounds 1–3 — 9 file-group deep-dive agents plus 1 cross-cutting agent — but the run was interrupted partway through by the account's weekly rate limit, so coverage of all 50 source files (up from 46 in round 3) was completed by two combined methods rather than 9 uniform deep dives:

- **23 files** got a fresh, full deep-dive this round (every proposed API re-verified against the real `effect` source, every "before" snippet re-verified against the current file): `Correlate.ts`, `ParameterTypes.ts`, `Snippet.ts`, `StepMatcher.ts`, `StepPatternMessages.ts`, `DataTable.ts`, `DocString.ts`, `ExamplesRow.ts`, `StepArgs.ts`, `StepArguments.ts` (gherkin); `Tags.ts`, `TagExpression.ts`, `HookTagExpression.ts`, `GherkinTags.ts`, `GherkinWatchTriggers.ts`, `Errors.ts`, `ScenarioEffect.ts`, `ScenarioKey.ts`, `ScenarioMetrics.ts`, `ScenarioSeed.ts`, `Step.ts`, `StepModule.ts`, `OutlineTitle.ts` (vitest). `Parser.ts` got a full fresh review of its one changed region plus a live re-verification of the one new line the cross-cutting sweep flagged.
- **The remaining 26 files** — `Model.ts`, `Pickles.ts`, `Source.ts`, `loadFeature.ts`, `Errors.ts`, `Validate.ts`, `index.ts` (gherkin); `Attachments.ts`, `CallSite.ts`, `Collect.ts`, `Dsl.ts`, `Hook.ts`, `HookRegistry.ts`, `Plan.ts`, `Registry.ts`, `RerunKey.ts`, `RerunManifest.ts`, `RuleNarrowing.ts`, `Runner.ts`, `StrictMode.ts`, `TestApi.ts`, `Testing.ts`, `VitestTestApi.ts`, `describeFeature.ts`, `index.ts`, `loadFeature.ts` (vitest) — carry forward round 3's verdict (clean, or fixed-and-verified) on the strength of a `git diff 3b57a8e..HEAD` run by the cross-cutting agent, which proved these files are byte-identical to the state round 3 already audited in full. Only `Correlate.ts`, `Parser.ts`, and `Collect.ts` changed at all since round 3's resolution, and all three changes were reviewed fresh (see below).

The cross-cutting agent also completed both of its jobs before the rate limit hit: a full re-diff of `3b57a8e..HEAD` for regressions, and a repo-wide grep sweep (11 anti-pattern categories, both packages, source only).

**Result:** 4 confirmed issues (0 High, 1 Medium, 3 Low), plus a growing list of considered-and-rejected notes. 0 hallucinated APIs, 0 structural/architectural gaps, 0 regressions in anything rounds 1–3 fixed.

## Executive summary

This is **round 4**, run after round 3's findings were resolved and merged (`f521202` / `3b57a8e`, "Resolve round-3 Effect V4 builtin-adoption audit findings"), followed by an unrelated CI-hardening commit (`15891b1`) that made three small non-idiom-related edits. Mid-run, the dispatching session hit its account's weekly rate limit; several of the 9 file-group agents failed outright, one file-group agent misread its own scope and produced a report for the wrong file group (its actual output — accurate, verified findings about `Tags.ts`/`TagExpression.ts`/`HookTagExpression.ts`/`GherkinWatchTriggers.ts`/`GherkinTags.ts`/vitest's `Errors.ts` — is used below regardless of the mismatch, since the content is real and correctly verified), and one agent (assigned `packages/vitest`'s support/state file group) misinterpreted a "fork not available" error as a signal to re-orchestrate the entire audit itself, spawning roughly a dozen duplicate general-purpose agents before the rate limit stopped those too. None of the duplicate spawns produced findings beyond what the legitimate agents already covered; this is noted here for transparency, not because it changed the result.

What actually survived to produce verified findings this round is narrower than round 3, and all of it is the same shape as round 3's remaining gaps: single, isolated spots in otherwise fully-idiomatic files, plus one recurring same-package duplication (a `Predicate.isError` ternary copy-pasted across two files instead of factored into a shared helper, the same category round 1 already fixed once in `packages/gherkin`). Nothing found is a correctness bug. The repo-wide grep sweep (Job B, cross-cutting agent) re-confirmed all six round-3 anti-pattern categories still sit at zero hits repo-wide, plus five newly-added categories (`JSON.parse`/`stringify`, bare wrap-only `Effect.gen`, native `.toSorted`/`.sort` with inline comparators, `Object.hasOwn` lookup-then-index, `?? null`/ternary null-as-absence) — all either zero hits or already-reviewed, known-accepted exceptions.

One item from round 3 remains explicitly open: round 3 §5 flagged that the `Data.TaggedError`-vs-`Schema.TaggedError` split, while consistently applied in code, is still not written down anywhere authoritative — only as inline comments repeated per-file (now 7 ADRs: 021, 022, 025, 033, 046, 053, 054) and never mentioned in `LLMS.md` at all. This round re-confirmed the split is still being applied correctly and is still undocumented as a general rule. Worth closing out in an ADR or an `LLMS.md` addendum rather than carrying it forward a third time.

| Priority | Count |
| -------- | ----- |
| High     | 0     |
| Medium   | 1     |
| Low      | 3     |

| Package | Count |
| ------- | ----- |
| gherkin | 2     |
| vitest  | 2     |

---

## 1. Manual `Predicate` ternaries duplicating `Option.liftPredicate`

### 1.1 `DataTable.ts` — hand-rolled `Predicate.is*` ternaries instead of `Option.liftPredicate` (Low)

**File:** `packages/gherkin/src/DataTable.ts:220-238` (function `rowDecodeFailed`)

```ts
// Before
const path = firstIssuePath(schemaError.issue, [])
const index = path[0]
const key = path[1]
const row: Option.Option<number> = Predicate.isNumber(index) ? Option.some(index + 1) : Option.none()
const column: Option.Option<string> = Predicate.isString(key) ? Option.some(key) : Option.none()
const offending = Predicate.isNumber(index) ? rows[index] : undefined
// ...
const subject = offending === undefined
  ? `The rows were ${JSON.stringify(rows)}.`
  : `The row was ${JSON.stringify(offending)}.`
```

```ts
// After
const row = Option.liftPredicate(index, Predicate.isNumber).pipe(Option.map((i) => i + 1))
const column = Option.liftPredicate(key, Predicate.isString)
const offending = Option.liftPredicate(index, Predicate.isNumber).pipe(
  Option.flatMap((i) => Option.fromUndefinedOr(rows[i]))
)
// ...
const subject = Option.match(offending, {
  onNone: () => `The rows were ${JSON.stringify(rows)}.`,
  onSome: (o) => `The row was ${JSON.stringify(o)}.`
})
```

- **V4 API:** `Option.liftPredicate` (`effect/Option.ts:2031`) — the `(value, refinement) => Option<B>` shape, confirmed present and typed exactly for this "keep value only if predicate holds" pattern. `Option.map`/`Option.match` are already used two lines later in this same function.
- **Why this is in scope:** the sibling file in the same audit group, `ExamplesRow.ts:62`, already solves the identical "keep `path[i]` only if it's the right primitive type" problem with a one-line `Option.liftPredicate(path[0], Predicate.isString)`. `DataTable.ts`'s `rowDecodeFailed` is the one-level-deeper counterpart of the same function and is the one holdout still writing it by hand.
- **Blast radius:** none — `row`, `column`, `offending` are all local to `rowDecodeFailed`, never exported.
- **Risk:** none behaviorally — same `JSON.stringify` output either way.

### 1.2 `ParameterTypes.ts` — manual `for`-loop + `Set` mutation instead of `Array.getSomes` (Low)

**File:** `packages/gherkin/src/ParameterTypes.ts:65-73`

```ts
// Before
const deriveBuiltInParameterTypeNames = (): ReadonlySet<string> => {
  const names = new Set<string>()
  for (const parameterType of new ParameterTypeRegistry().parameterTypes) {
    if (parameterType.name !== undefined) {
      names.add(parameterType.name)
    }
  }
  return names
}
```

```ts
// After
const deriveBuiltInParameterTypeNames = (): ReadonlySet<string> =>
  new Set(
    Arr.getSomes(
      Arr.fromIterable(new ParameterTypeRegistry().parameterTypes).map((parameterType) =>
        Option.fromUndefinedOr(parameterType.name)
      )
    )
  )
```

- **V4 API:** `Option.fromUndefinedOr` + `Array.getSomes` (`effect/Option.ts`, `effect/Array.ts`) — the same "map each item to `Option`, then `getSomes`" idiom this file's sibling `StepMatcher.ts` already uses for the identical zero-or-value shape. `Arr` and `Option` are both already imported in this file.
- **Blast radius:** none — private, single-call-site helper; signature and behavior unchanged.
- **Risk:** none — order-preserving, behavior-identical.

---

## 2. `T | null` instead of `Option<T>` for a documented "not configured" default

### 2.1 `Tags.ts` — `TagFilter.expression: (fn) | null` instead of `Option<fn>` (Low/Medium)

**File:** `packages/vitest/src/Tags.ts:105-157`

```ts
// Before
export interface TagFilter {
  readonly include: ReadonlyArray<string>
  readonly exclude: ReadonlyArray<string>
  readonly expression: ((tags: ReadonlyArray<string>) => boolean) | null
}

export const noTagFilter: TagFilter = { include: [], exclude: [], expression: null }

export const makeTagFilter = (options: {...}): TagFilter => ({
  include: options.includeTags ?? [],
  exclude: options.excludeTags ?? [],
  expression: options.expression ?? null
})

export const shouldEmit = (filter: TagFilter, tags: ReadonlyArray<string>): boolean =>
  filter.expression !== null
    ? filter.expression(tags)
    : (filter.include.length === 0 || filter.include.some((tag) => tags.includes(tag))) &&
      !filter.exclude.some((tag) => tags.includes(tag))
```

```ts
// After
import * as Option from "effect/Option"

export interface TagFilter {
  readonly include: ReadonlyArray<string>
  readonly exclude: ReadonlyArray<string>
  readonly expression: Option.Option<(tags: ReadonlyArray<string>) => boolean>
}

export const noTagFilter: TagFilter = { include: [], exclude: [], expression: Option.none() }

export const makeTagFilter = (options: {...}): TagFilter => ({
  include: options.includeTags ?? [],
  exclude: options.excludeTags ?? [],
  expression: Option.fromNullishOr(options.expression)
})

export const shouldEmit = (filter: TagFilter, tags: ReadonlyArray<string>): boolean =>
  Option.match(filter.expression, {
    onSome: (expression) => expression(tags),
    onNone: () =>
      (filter.include.length === 0 || filter.include.some((tag) => tags.includes(tag))) &&
      !filter.exclude.some((tag) => tags.includes(tag))
  })
```

- **V4 API:** `Option.none`/`Option.fromNullishOr`/`Option.match` (`effect/Option.ts`) — v4 renamed v3's `Option.fromNullable` to `fromNullishOr` (both `null` and `undefined` absent), alongside the narrower `fromNullOr`/`fromUndefinedOr`; `fromNullishOr` is the one matching `options.expression`'s `| null | undefined` type. The identical "no filter configured, use the default" absence case round 3 §1.1 already established as an `Option` candidate in `RerunManifest.ts`.
- **Blast radius:** `TagFilter` is exported but never re-exported from `index.ts` — package-internal only, not published API. `Runner.ts` only holds and forwards the value, never touches `.expression` directly. Three test sites need a coordinated update: `Tags.test.ts:59` (`toStrictEqual({..., expression: null})`), `Tags.test.ts:157,164` (`.toBeNull()`), and `Runner.test.ts:1691` (a hand-built literal used to prove `shouldEmit` doesn't care how the filter was constructed).
- **Risk:** none behaviorally — pure representation change, same two branches.

---

## 3. Duplicated `Predicate.isError` ternary, no shared helper (same-package recurrence of a round-1-fixed pattern)

### 3.1 `TagExpression.ts` / `HookTagExpression.ts` (Low)

**Files:** `packages/vitest/src/TagExpression.ts:85`, `packages/vitest/src/HookTagExpression.ts:64`

```ts
// Before — identical in both files
const underlying = Predicate.isError(args.cause) ? args.cause.message : String(args.cause)
```

- **Why this is in scope:** `packages/gherkin` already solved this exact duplication by extracting a `describeCause` helper in `StepMatcher.ts`, reused by `ParameterTypes.ts` and `Pickles.ts` (round 1, re-confirmed still correct this round). `packages/vitest` has the identical duplicated ternary across two files with no equivalent shared helper. `HookTagExpression.ts` already imports from `TagExpression.ts` (ADR-EC-054's "shared compile-and-evaluate glue"), so `TagExpression.ts` is the natural home for a `describeCause`-equivalent export.
- **V4 API:** same `Predicate.isError` (`effect/Predicate.ts`) already in use at both sites — not a missing builtin, a same-package duplication gap with a precedent fix already in the codebase.
- **Blast radius:** 2 files, same package, no public API change.
- **Risk:** none — behavior-identical, pure de-duplication.

---

## 4. Style-consistency note — `Data.TaggedError` vs `Schema.TaggedError` (Low, informational, carried forward a third round)

Still unresolved from round 3 §5: `Data.TaggedError` is applied consistently as the accepted alternative to `Schema.TaggedError` for synchronous, never-decoded throws, but the rule for _when_ is still only inline comments repeated per-file, now across 7 ADRs (021, 022, 025, 033, 046, 053, 054) rather than written down once. `LLMS.md` shows only `Schema.TaggedError` examples and never mentions `Data.TaggedError` at all — a newcomer reading `LLMS.md` alone would not learn this project's accepted alternative exists. Recommendation unchanged from round 3: write the distinction down once, in an ADR or an `LLMS.md` addendum.

---

## 5. Confirmed clean or already-fixed-and-holding — no findings

### Freshly deep-dived this round (verified against the current file content and the real `effect` source)

- **gherkin:** `Correlate.ts`, `StepMatcher.ts`, `StepPatternMessages.ts`, `Snippet.ts`, `DocString.ts`, `ExamplesRow.ts`, `StepArgs.ts`, `StepArguments.ts` (aside from §1 above); `ParameterTypes.ts` (aside from §1.2); `Parser.ts` — its one change since round 3 (`match[1] ?? ""` → `match[1]!`, a non-null assertion backed by a documented regex-guarantee comment) is behavior-identical and not a finding; its one new line (`!Object.hasOwn(dialects, language) && language in dialects`, line 90) was checked and rejected below, not a finding.
- **vitest:** `Tags.ts` (aside from §2.1), `TagExpression.ts` / `HookTagExpression.ts` (aside from §3.1), `GherkinTags.ts`, `GherkinWatchTriggers.ts`, `Errors.ts` — all five round-3 `Data.TaggedClass` conversions (`UnusedStepDefinitionWarning`, `UndeclaredTagWarning`, `UnknownContainerWarning`, `ExcludedScenariosNotice`, `StaleRerunManifestKeyWarning`) confirmed still landed and holding, `StepFailureLocation`/`HookFailureLocation` still correctly `Data.TaggedError`, `StepMatchError` still correctly `Schema.TaggedError`; `ScenarioEffect.ts`, `ScenarioKey.ts`, `ScenarioMetrics.ts`, `ScenarioSeed.ts`, `Step.ts`, `StepModule.ts`, `OutlineTitle.ts`.

### Carried forward from round 3 (file unchanged since `3b57a8e`, confirmed via `git diff 3b57a8e..HEAD`)

- **gherkin:** `Model.ts`, `Pickles.ts` (round 3 §4.1's `describeCause` reuse fix holds), `Source.ts`, `loadFeature.ts`, `Errors.ts`, `Validate.ts` (round 3 §1.4's `Option.toArray` fix holds), `index.ts`.
- **vitest:** `Attachments.ts`, `CallSite.ts`, `Collect.ts` (round 3 §3's `Data.TaggedError` fix for `AsyncDefineCallbackError` holds; its one post-round-3 change, `export class` → `class`, is a visibility-only unused-export cleanup with no idiom implication), `Dsl.ts`, `Hook.ts`, `HookRegistry.ts`, `Plan.ts` (round 3 §4.2's `Arr.sort`/`Order` fix holds), `Registry.ts`, `RerunKey.ts` (round 3 §1.3's `Option.match` fix holds), `RerunManifest.ts` (round 3 §1.1's `Option<ReadonlySet<string>>` fix holds — its one external consumer, `describeFeature.ts:199`, and `Runner.ts`'s own handling were both spot-checked this round and remain coordinated), `RuleNarrowing.ts` (round 3 §3's `Data.TaggedError` fix for `unsupportedScenarioExtraLayer` holds), `Runner.ts`, `StrictMode.ts`, `TestApi.ts`, `Testing.ts`, `VitestTestApi.ts`, `describeFeature.ts` (round 3 §3's `Data.TaggedError` fix for the mutually-exclusive tag-filter option check holds), `index.ts`, `loadFeature.ts`.

### Considered and explicitly rejected (not findings — recorded so a future round doesn't re-flag without new evidence)

- **`Parser.ts:90`** — `!Object.hasOwn(dialects, language) && language in dialects` looks like round 3 §1.2's `Object.hasOwn`-lookup shape (`Correlate.ts`'s `dialectOf`), but it isn't: `Object.hasOwn` and `in` test different things (own-property vs. full prototype chain), and the combination is a deliberate detector for a `# language:` header naming a prototype-pollution key (e.g. `constructor`, `toString`) — documented by the function's own comment two lines above. `Record.get` (`effect/Record.ts:450-457`) is built entirely on `hasOwn` and has no way to express "present via prototype but not own"; swapping this line for `Record.get` would silently turn a security-relevant guard into dead code. Not a finding.
- **`Hook.ts:90`** — `definition.definedAt ?? null` uses the same shared `DefinitionSite | null` boundary type round 3 already reviewed and rejected converting for `CallSite.ts` (defined once in `Registry.ts`, consumed across multiple files as `| null`) — not a same-file fix. Not a finding.
- **`Runner.ts:340,393`** — `rerunKeys.get(...) ?? null` populates `EmitOptions.rerunKey: string | null`, a deliberate ADR-EC-038 field consumed at an external framework boundary (`VitestTestApi.ts` stamps vitest's own `ctx.task.meta.rerunKey` from it) — not an internal `Option` opportunity. Not a finding.
- **`DataTable.ts:33-42`** (`firstDuplicate`) — a manual `Set`-tracking loop to find the first _repeated_ value. `effect/Array.ts` has `dedupe`/`dedupeWith`/`dedupeAdjacent(With)` (remove duplicates) but no "return the first value that repeats" combinator. No drop-in builtin exists. Not a finding.
- **`ParameterTypes.ts:296-304`** (`sharedDefaultRegistry`) — a module-level mutable lazy singleton, required by ADR-EC-045 to be genuinely process-wide across every separate `Layer.sync` build, not memoized per-`Layer`-instance. No builtin models "shared mutable state across independent `Layer` builds" better than this. Not a finding.
- **`GherkinTags.ts:76-87`** — an `if`/`else if` chain on a plain `string | null` union (`DocStringFence`), not a `_tag`-discriminated object — `Match.tag`'s house rule doesn't strictly target this shape. Unchanged since round 3, not re-flagged.
- **`Tags.ts:76-102`** (`readScenarioTimeoutTag`) — must validate every `@timeout*`-prefixed tag (throwing on the first invalid one) while keeping only the _last_ valid match's value — a fold with an early-throw side effect on a synchronous, non-Effect path. No `effect/Array` combinator cleanly expresses this without added ceremony. Not a finding.
- **`GherkinWatchTriggers.ts:82`** — a closure-mutated variable set once inside a Vite plugin's synchronous `config()` hook, outside any Effect fiber. Same rationale as `Runner.ts`'s previously-rejected closure counters. Not a finding.
- **`ScenarioMetrics.ts:83`** — `Exit.isSuccess(exit) ? "pass" : "fail"`. `Exit.match` exists, but `Exit.isSuccess`'s own doc comment directs it to be used "for simple boolean checks" — exactly this case, a single ternary, not a chain. Not a finding.
- **`ScenarioKey.ts:10`** — `ruleId: string | null` conforms to the same shared `RegistryScope`/`Collect.ts`/`Plan.ts`/`Runner.ts` boundary type as `Hook.ts`'s `definedAt` above; fixing it means changing the shared boundary type first. Not a finding.
- **`Step.ts:8-13`** — a `GeneratorFunction` check via `Object.prototype.toString.call`. No `isGeneratorFunction` predicate exists anywhere in `effect/Predicate.ts` or the rest of the Effect source — this is a genuine necessity, not a duplicated builtin.
- **`StepModule.ts:21-32`** — closures pushing into a mutable array during synchronous DSL registration, outside any Effect fiber. Same rationale as `Runner.ts`'s rejected counters.

---

## 6. Cross-cutting architecture check (re-run)

**Result: no structural findings; everything from rounds 1–3 re-confirmed still correct, and the repo-wide sweep now covers five additional anti-pattern categories with clean or known-accepted results.**

`git diff 3b57a8e..HEAD` (round-3 resolution → current HEAD) touches only 3 files, none an idiom regression: `Correlate.ts:361` and `Parser.ts:83-90` (both a documented `?? ""` → `!` non-null-assertion tightening), and `Collect.ts:81` (export visibility only, from the CI-hardening commit). No regressions of anything rounds 1–3 fixed.

Repo-wide grep sweep, `packages/gherkin/src` + `packages/vitest/src` (source only):

- `_tag ===` / `switch` on `._tag`: **zero hits** (unchanged from round 3).
- Hand-rolled predicates (`typeof`/`Array.isArray`/home-grown `isRecord`-style helpers): **zero hits** (unchanged).
- `new Date(`/`Date.now()`: **zero hits** (unchanged).
- `Math.random()`: **zero hits** (unchanged) — scenario seeding still goes through `Random.withSeed`.
- `Promise.all(`/`new Promise(`: **zero hits** (unchanged) outside genuine framework-boundary type signatures.
- `class ... extends Error`: **zero hits** (unchanged).
- `JSON.parse(`/`JSON.stringify(` (new this round): **29 hits**, all `JSON.stringify` for human-readable error/log message interpolation — correct usage, not the "decode untrusted structured data" case `Schema.fromJsonString` targets. Zero `JSON.parse` hits — the one real parse site (`RerunManifest.ts`) already routes through `Schema.decodeUnknownResult` per round 1.
- Bare wrap-only `Effect.gen(function*() {...})` (new this round): **1 hit** — `ScenarioEffect.ts:75`, re-confirmed round 3's finding that it's attached to a `Match.orElse` arm piped through `.pipe(Effect.onExit(...))`, not a bare pass-through.
- `.toSorted(`/`.sort(` with an inline comparator (new this round): **zero hits** — all 4 `.sort`-family call sites now go through `Arr.sort(..., Order.String)` or `Arr.sort(..., Order.make/combine)`. Round 3 §4.2's fix confirmed holding, no new native holdouts.
- `Object.hasOwn(` lookup-then-index (new this round): **2 hits** — `Snippet.ts:123` (round 3's documented "no `effect` import" exception) and `Parser.ts:90` (new since round 3, reviewed and rejected in §5 above as a deliberate security guard, not a `Record.get` candidate).
- `?? null` / null-as-absence (new this round): **6 hits** — 2 are `JSON.stringify` message formatting (not data modeling), 1 is round 3's own retained public-contract `null` (`RerunKey.ts`, explicitly not a smell), 3 are the `Hook.ts`/`Runner.ts` (×2) spots reviewed and rejected in §5 above.

**LLMS.md compliance:** `Effect.fn`/`Effect.fnUntraced` usage remains consistent repo-wide (9 files use one or the other; zero bare wrap-only `Effect.gen`s per the sweep above). The `Data.TaggedError`-vs-`Schema.TaggedError` split (§4 above) remains correctly applied but still undocumented as a general policy.

---

## Adoption plan (priority order)

| # | Change                                                                       | Priority | Files                                      | Breaking?                                     |
| - | ---------------------------------------------------------------------------- | -------- | ------------------------------------------ | --------------------------------------------- |
| 1 | `TagFilter.expression: (fn) \| null` → `Option<fn>`                          | Medium   | `Tags.ts` (+ 3 test call sites)            | Test-only, package-internal, no published API |
| 2 | Hand-rolled `Predicate.is*` ternaries → `Option.liftPredicate`               | Low      | `DataTable.ts`                             | No                                            |
| 3 | Manual `for`-loop + `Set` → `Option.fromUndefinedOr` + `Arr.getSomes`        | Low      | `ParameterTypes.ts`                        | No                                            |
| 4 | Duplicated `Predicate.isError` ternary → shared `describeCause`-style helper | Low      | `TagExpression.ts`, `HookTagExpression.ts` | No                                            |

All 4 changes are internal-only, zero-behavior-change refactors and can batch into a single PR, mirroring how prior rounds batched their Low-priority items. Item 1 is worth a quick look at the 3 affected test files before merging, same caveat as every round-3 `Option`-conversion item.

Separately, unresolved from round 3: write the `Data.TaggedError`-vs-`Schema.TaggedError` split down once (ADR or `LLMS.md` addendum) rather than carrying the open item into a fourth round.

---

## Appendix — Already resolved by prior audit rounds (verified still correct this round)

- `Predicate.isPromiseLike`/`isError`/`isString`/`isRegExp`/`hasProperty` in place of hand-rolled `typeof`/`instanceof` guards (PRs #78–80).
- `Data.TaggedClass`/`Data.TaggedError` in place of hand-rolled `Error` subclasses (PRs #78, #81).
- `Array.groupBy`/`dedupe`/`findFirstIndex`, `Option.liftPredicate`, `Array.filterMap` in place of manual `Map`-bucket-push loops (PRs #78, #81).
- `Match.tag`/`Match.orElse`/`Match.exhaustive` in place of `_tag` if-chains in `ScenarioEffect.ts`, `Testing.ts`, `VitestTestApi.ts`, `DataTable.ts`, `Source.ts` (PRs #80, #81).
- `Schema.fromJsonString` + `Schema.decodeUnknownResult` in place of manual `JSON.parse` (PR #81, `RerunManifest.ts`).
- `Effect.fnUntraced` in place of functions that only wrapped-and-returned `Effect.gen` (PRs #80, #81).
- **Round 2** (`bdbd010`): `Option.fromUndefinedOr` + `Option.map` in place of manual `undefined`-ternaries (`Correlate.ts`); `Option.match` in place of `Option.isSome` ternaries (`DataTable.ts`, `ExamplesRow.ts`); `Option` return type in place of a hand-rolled `undefined` sentinel (`Parser.ts`); `Array.findFirst` in place of a manual find-loop (`ParameterTypes.ts`); `Array.last` + `Option.getOrThrowWith` in place of manual last-element-or-throw (`Registry.ts`); `Match.value`/`Match.when`/`Match.exhaustive` in place of ternary chains on `RegistryScopeKind` and `ExcludedScenariosNoticeReason`/`kind` (`Plan.ts`, `Errors.ts`).
- **Round 3** (`3b57a8e`): `Option<ReadonlySet<string>>` in place of `null` (`RerunManifest.ts`, coordinated with `describeFeature.ts`); 5 hand-rolled tagged "notice" interfaces → `Data.TaggedClass` (`Errors.ts`, vitest); 3 registration-time `throw new Error` → `Data.TaggedError` (`describeFeature.ts`, `RuleNarrowing.ts`, `Collect.ts`); `Record.get` + `Option.match` in place of an `Object.hasOwn` lookup (`Correlate.ts`); `Option.match` in place of `Option.getOrNull` + null-recheck (`RerunKey.ts`); `Option.toArray` in place of `Arr.getSomes([single])` (`Validate.ts`); reused `describeCause` in place of an inline `Predicate.isError` ternary (`Pickles.ts`); `Arr.sort` + `Order.make`/`combine` in place of native `.toSorted(customComparator)` (`Plan.ts`).

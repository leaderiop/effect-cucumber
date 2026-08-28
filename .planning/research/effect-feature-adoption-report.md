# Deep analysis: adopting Effect's `FileSystem`, `Path`, `Option`, `Match`, `Cache`, `Fiber` (and more) throughout `@effect-cucumber/gherkin`

**Status:** Research only. Nothing in `packages/gherkin/src/` was touched to produce this report — this is the "full report" requested before any implementation.

**Scope:** the user asked to never use `node:fs` directly (always Effect `FileSystem`), always use `Path` for paths, `Option` for optional values, `Match` instead of switch/if-else dispatch, `Cache` for caches, `Fiber` for interruptibility, and generally lean on Effect's feature surface as fully as possible. Each candidate below was checked two ways: (1) does the actual `gherkin` codebase have a real, present-tense use for it, and (2) does the proposed API actually work against the installed `effect@4.0.0-rc.112` — verified by direct reproduction, not assumed, because this exact rc build has already produced three confirmed API surprises earlier this session (`Schema.Defect` broken, variadic `Schema.Literal` broken as a `TaggedError` field, `Schema.optional` silently omitting keys).

---

## 0. A correction that changes the premise of earlier work this session

Every prior artifact from this session — the original comparative research, ADR-EC-021, and the doc comments written into `Source.ts`/`loadFeature.ts`/`ParameterTypes.ts` — states that `@effect/platform`'s `FileSystem`/`Path` are **blocked**: no release compatible with `effect@4.0.0-rc.112` exists. That claim was based on checking only the **aggregate** `@effect/platform` package (`npm view @effect/platform dist-tags`), which genuinely has no `rc` tag — only a stale `latest` (`0.97.1`, targeting `effect@^3.22.1`) and a throwaway `snapshot`. **That part was true and still is.**

What was missed, and what the user's message this turn correctly pointed at: **`effect` v4 moved the `FileSystem`/`Path`/`PlatformError`/`Terminal` service interfaces directly into the core `effect` package**, and the **per-runtime implementation packages have their own, independent version lines that kept pace with the v4 rc train**, even though the aggregate `@effect/platform` package didn't:

| Package | `latest` (stable) | `rc` dist-tag | Matches installed `effect@4.0.0-rc.112`? |
|---|---|---|---|
| `@effect/platform` (aggregate) | `0.97.1` (peers `effect@^3.22.1`) | **none** | ❌ still blocked |
| `@effect/platform-node` | `0.108.1` | `4.0.0-rc.112` | ✅ **available** |
| `@effect/platform-bun` | `0.91.2` | `4.0.0-rc.112` | ✅ **available** |
| `@effect/platform-deno` | `4.0.0-beta.107` | `4.0.0-rc.112` | ✅ **available** |

All three confirmed by `npm view <pkg> dist-tags --json`, and `@effect/platform-node@4.0.0-rc.112` confirmed to **actually install** cleanly alongside the workspace's `effect@4.0.0-rc.112` (verified in an isolated scratch install, not just checked on the registry) with a matching peer range (`effect: "^4.0.0-rc.112"`).

**This means the FileSystem/Path portability story is not blocked the way ADR-EC-021 and the earlier research describe.** It needs a follow-up correction — not done here, since this message asked for analysis only, but flagged clearly so it isn't lost. The rest of this report proceeds from the corrected picture.

---

## 1. `FileSystem` — verified in depth

### 1a. The service interface lives in core `effect`, not `@effect/platform`

`effect/FileSystem` is real and importable today with zero extra dependency:
```ts
import * as FileSystem from "effect/FileSystem"
```
It exports the `FileSystem.FileSystem` `Context.Tag`, plus `make`, `makeNoop`, `layerNoop` — constructors for building an implementation — but **no ready-made Node/Bun/Deno-backed Layer of its own** (that's what the per-runtime packages are for).

### 1b. Two ways to satisfy the requirement, both verified working, both share one Tag identity

**Official, via `@effect/platform-node@4.0.0-rc.112`:**
```ts
import { NodeFileSystem } from "@effect/platform-node"
import * as FileSystem from "effect/FileSystem"
import * as Effect from "effect/Effect"

const program = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem
  return yield* fs.readFileString(path, "utf8")
})

await Effect.runPromise(program.pipe(Effect.provide(NodeFileSystem.layer)))
```
Confirmed working end-to-end against a real file.

**Hand-rolled, using only core `effect` (no `@effect/platform-node` needed at all):**
```ts
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as Effect from "effect/Effect"
import * as fs from "node:fs"

const SyncNodeFileSystem = Layer.succeed(
  FileSystem.FileSystem,
  FileSystem.make({
    readFile: (path) =>
      Effect.try({
        try: () => new Uint8Array(fs.readFileSync(path)),
        catch: (cause) => ({ _tag: "SystemError", reason: "NotFound", module: "FileSystem", method: "readFile", pathOrDescriptor: path, cause })
      })
  })
)
```
`FileSystem.make` derives `readFileString` from `readFile` automatically (confirmed). This also worked end-to-end.

**Critically, these two are interchangeable, not competing designs**: `FileSystem.FileSystem.key` is `"effect/platform/FileSystem"` regardless of which import path (`effect/FileSystem` or `@effect/platform-node`'s re-export) you reach it through — the Tag was moved into core `effect` but kept its original identity. A consumer that depends on `FileSystem.FileSystem` can be satisfied by either Layer with no code change on the consuming side.

### 1c. The one real trade-off: `Effect.runSync` behavior differs between the two

This is the load-bearing finding for `loadFeature`'s current module-top-level, `Effect.runSync`-based call pattern (the one this session's earlier work already committed to, in the code that exists today):

- The **hand-rolled** sync Layer: `Effect.runSync` **succeeds**, because the underlying `readFileSync` call genuinely never suspends.
- The **official** `NodeFileSystem.layer`: `Effect.runSync` **fails outright** with `AsyncFiberError` — confirmed by direct reproduction, not assumed from docs. The real implementation suspends internally (consistent with the original research's suspicion that it's built on `fs.promises`).

So there is a real, now-confirmed (not speculative) architectural choice to make, not a "wait for upstream" situation:

| | Keep `Effect.runSync`-safe, module-top-level `loadFeature` | Adopt the official `NodeFileSystem`/`BunFileSystem`/`DenoFileSystem` |
|---|---|---|
| What it takes | Ship a small hand-rolled `FileSystem` Layer per runtime (Node/Bun/Deno each need ~10 lines wrapping their own sync FS primitive — Bun and Deno both have synchronous file-read APIs, same shape as Node's) | Depend on `@effect/platform-node`/`-bun`/`-deno` directly, get maintained implementations with the full interface (glob, watch, streaming, etc.) for free |
| What it costs | Someone maintains three tiny sync Layers instead of depending on upstream's | `loadFeature` can no longer be `Effect.runSync`'d at vitest module top level — the entire premise `test/loadFeature.test.ts` currently proves needs to change (top-level `await`, per the design conversation earlier this session) |
| Portability payoff | Full — Node/Bun/Deno all have synchronous file APIs to wrap | Full, plus every other `FileSystem` capability (watch, glob, streaming) this package doesn't currently need |

This is a genuine decision, not a foregone conclusion — flagged for the decision framework in §6, not resolved here.

---

## 2. `Path` — verified, and there is very little for it to actually do here

`effect/Path` is real, zero-config, and works standalone:
```ts
import * as Path from "effect/Path"
// Path.Path is the Tag, Path.layer is a ready-to-use, runtime-agnostic implementation
```
Verified: `join`, `basename`, `dirname`, `extname`, `isAbsolute`, `resolve`, `normalize` all work correctly with `Path.layer` provided, no runtime-specific package needed (pure string manipulation, no real syscalls, so unlike `FileSystem` there's nothing Node/Bun/Deno-specific about it).

**But: `gherkin` has almost no path manipulation to replace.** `Source.ts`'s own doc comment states the existing policy explicitly: the path argument "is taken verbatim. No resolution, no canonicalisation, no containment check... a traversal guard would be security theatre (threat T-02-03, dispositioned `accept`)." Grepping the actual source finds no `node:path` import anywhere in `packages/gherkin/src/` at all today — `uri` strings are passed through as opaque identifiers, never joined, resolved, or inspected. Adopting `Path` here would mean introducing path manipulation that doesn't currently exist, not replacing `node:path` calls that do.

The one place path logic genuinely appears is in **tests** (`fileURLToPath(new URL(...))` in `loadFeature.test.ts`, `dialect.test.ts`, `Parser.test.ts`, `ParameterTypeLifecycle.test.ts`) — that's `node:url`, not `node:path`, and it's test fixture plumbing, not part of the package's own behavior.

---

## 3. `Option` — genuinely applicable, but the honest cost is a locked-decision reopening, not a small swap

### 3a. The exact right combinator exists and works

`Option.fromUndefinedOr` (verified working) converts precisely this codebase's existing convention — `T | undefined`, chosen deliberately for the `exactOptionalPropertyTypes` asymmetry documented in `Errors.ts`, `ParameterTypes.ts`, `Model.ts` — into `Option<T>`:
```ts
Option.fromUndefinedOr(5)         // Some(5)
Option.fromUndefinedOr(undefined) // None
```
(Note: `Option.fromNullable` — the name I'd have guessed — doesn't exist in this build; it's `fromUndefinedOr`/`fromNullOr`/`fromNullishOr` depending on exactly what "absent" means for a given field. Confirmed by inspection, not guessed.)

### 3b. Where `T | undefined` actually appears — 32 occurrences across 9 of 12 source files

Two very different categories:

**Internal-only locals (low blast radius, safe to convert freely):** `Correlate.ts` and `Validate.ts`'s `Map.get(...)` results and `sourceId === undefined ? undefined : ...` patterns — these never leave the module, aren't tested directly, aren't part of any public contract. Converting these to `Option` is a pure internal-implementation-style choice with no external consequence. Genuinely low-risk, and arguably a real readability win in `Correlate.ts` and `Validate.ts` specifically, where several `?? []` / `=== undefined ? undefined :` chains exist.

**Public API surface (high blast radius, a real redesign):** `LoadFeatureError.line`/`.cause`, `StepPatternError.parameterTypeName`/`.pattern`/`.cause`, `ParameterTypeDefinition.definedAt`/`.useForSnippets`/`.preferForRegexpMatch`, `LoadFeatureOptions.parameterTypes`, and the various optional fields on `Model.ts`'s `ParsedFeature`/`ParsedScenario`/`ParsedStep`. Every one of these has **documented, locked reasoning** for staying `T | undefined` specifically — e.g. `Errors.ts`'s own doc comment: *"the constructor argument declares `line?: number`... the field is `number | undefined`... `exactOptionalPropertyTypes`'s asymmetry."* Converting these to `Option<T>` would:
- Change the public return type of every consumer-facing field (`feature.line` becomes `Option<number>` instead of `number | undefined`)
- Break every pinned test using `.toBeUndefined()` (would become `Option.isNone(...)` or similar)
- Require the `Schema.TaggedError` fields to use an `Option`-aware combinator (`Schema.OptionFromUndefinedOr` or similar — **not yet verified against this rc build**, given the three real `Schema` surprises already found this session; would need the same empirical-verification treatment before trusting it)
- Directly reopen the "exactOptionalPropertyTypes asymmetry" reasoning that's currently treated as settled and documented as such in three separate files

This is architecturally the same shape of decision as the ADR-EC-015 reversal itself: not wrong to want, but a real, locked-decision-reopening redesign, not a drop-in.

---

## 4. `Match` — verified working, but there is currently nothing in this codebase for it to replace

Direct grep for `switch` in `packages/gherkin/src/`: **one hit, and it's inside a doc comment** (`Parser.ts`'s note about `@cucumber/gherkin`'s own errors making "a switch over `name` silently match nothing"). Direct grep for `} else if`/`else if (`: **zero hits** anywhere in the package.

This codebase's actual dispatch style is different from what `Match` replaces: reason-tag discrimination happens through `Effect.catchTag`/`catchTags` (already Effect-idiomatic, already adopted in `Errors.ts`'s migration), tag *construction* happens through small dedicated functions per reason (`outlineWithoutExamples`, `emptyExamples`, `zeroStepScenario`, etc. in `Validate.ts` — one function per case, called directly, not switched on), and lookup happens through derived `Set`/`Map` structures (`builtInParameterTypeNames`, `expressionCache`), not conditionals.

`Match` itself works fine when tested standalone (`Match.type().pipe(Match.when(...), Match.orElse(...))` confirmed functional), but there's no honest recommendation to make here beyond "if a switch/else-if chain appears in future work, reach for `Match` instead" — there is nothing to migrate today.

---

## 5. `Cache` and `Fiber` — real API found, but a poor fit for what this package actually does

### 5a. `Effect.Cache`'s API in this rc build doesn't match documented usage, and isn't needed here regardless

`Cache.make({ capacity, timeToLive, lookup })` inside an `Effect.gen` returned an object whose own keys are `['lookup', 'map', 'capacity', 'timeToLive']` — no `.get` method reachable the documented way; `yield* cache.get(key)` failed ("not iterable"). This is either a real API change in this specific rc build or a construction pattern this session didn't find — **not resolved**, because it doesn't matter for this package: the one real cache that exists, `StepMatcher.ts`'s `expressionCache`, is architecturally the wrong shape for `Effect.Cache` regardless of whether the API issue gets sorted out.

`expressionCache` is `WeakMap<ParameterTypeRegistry, Map<string, CucumberExpression>>` — a synchronous, pure, in-memory memoization keyed by object identity, with lifetime automatically tied to the registry's own garbage collection (a fresh registry per `loadFeature` call means old cache entries are freed for free, no manual eviction). `Effect.Cache` targets a different problem: asynchronous/effectful lookups with a TTL and a fixed capacity policy. Forcing this cache through `Effect.Cache` would mean wrapping a synchronous compile step in unnecessary `Effect` ceremony and **losing** the automatic GC-tied cleanup — `Effect.Cache` has no weak-reference-keyed mode. This is a case where the existing design is better suited to its actual problem than the proposed replacement, not a case of "hasn't been modernized yet."

### 5b. `Fiber` works, but this package has nothing to interrupt

`Effect.runFork` + `Fiber.await` confirmed functional. But `gherkin`'s entire pipeline (`Source → Parser → Pickles → Correlate → Validate`) is synchronous, single-threaded, CPU-bound computation with no I/O latency to overlap and nothing long-running to cancel. There is no genuine interruptibility story to build inside this package as it exists today. `Fiber` becomes relevant once the *DSL* (`@effect-cucumber/vitest`'s `describeFeature`, not yet built) needs scenario timeouts or cancellation — that's a real, forward-looking use case, but it belongs to a package that doesn't exist yet, not to a retrofit of `gherkin`.

---

## 6. Decision framework

| | Recommend now | Recommend, but reopens a locked decision | Not applicable to this package today |
|---|---|---|---|
| **`FileSystem`** | Adopt the *service interface* (`FileSystem.FileSystem`) — real, unblocked, verified. **Open question:** hand-rolled sync Layer (keeps `Effect.runSync`/module-top-level) vs. official `NodeFileSystem`/`BunFileSystem`/`DenoFileSystem` (loses `runSync`, gains maintained implementations) — a real architectural choice, not a blocker | — | — |
| **`Path`** | — | — | Nothing to replace; `gherkin` deliberately does zero path manipulation today (documented policy) |
| **`Option`** | Low-risk internal locals in `Correlate.ts`/`Validate.ts` | Public API fields (`LoadFeatureError`, `StepPatternError`, `Model.ts`, `ParameterTypeDefinition`) — real value, but reopens the documented `exactOptionalPropertyTypes` asymmetry decision and needs `Schema`+`Option` combinator verification first | — |
| **`Match`** | — | — | Zero switch/else-if chains exist; nothing to migrate |
| **`Cache`** | — | — | The one real cache (`StepMatcher.ts`) is architecturally a better fit for `WeakMap` than for `Effect.Cache` |
| **`Fiber`** | — | — | No concurrency/interruption need exists in a synchronous parse pipeline; relevant only to the not-yet-built DSL package |

**What this report is NOT**: a recommendation to implement anything. Per the request, this is analysis only. The two items in the left two columns (`FileSystem`'s interface-vs-implementation choice, and `Option`'s internal-vs-public scoping) are the only two with a real, actionable decision behind them — everything else in "not applicable" is a documented "no," not a deferred "yes."

**Also flagged, not resolved here:** §0's correction means ADR-EC-021's Consequences section and `Source.ts`/`loadFeature.ts`'s doc comments currently overstate the FileSystem/Path blocker — worth a follow-up correction pass, separate from whatever is decided from this report.

---

## 7. Post-implementation addendum: `FileSystem` and `Option` both shipped; two more real `effect/Array` bugs found

Both open decisions in §6 were made and implemented in the same session this report was written in — not deferred:

- **`FileSystem`**: the official `@effect/platform-node` implementation was chosen over the hand-rolled workaround (see ADR-EC-021's second Correction). `Effect.runSync` no longer recovers `loadFeature`'s old synchronous call shape, confirmed and accepted as the cost of using the maintained implementation.
- **`Option`**: full public API scope was chosen over the internal-only or partial options (see new [ADR-EC-022](../../spec/decisions/022-option-replaces-undefined-in-gherkins-public-api.md)). The real cost this report didn't anticipate — `Schema.OptionFromUndefinedOr` requires an explicit `Option` value at every `Schema.TaggedError` construction site, no "omit the key" path survives — is documented there, confirmed by reproduction before implementing, not discovered after the fact.

A later request to simplify `Validate.ts`'s warning-accumulation using `effect/Array` surfaced two more real, isolated bugs in this exact `effect@4.0.0-rc.112` build, on top of the three already listed in this report's scope line:

- **`Array.filterMap` silently returns `[]` regardless of input.** Confirmed by reproduction with tracing: the predicate is called correctly and returns correct `Some`/`None` values, but the function's own accumulation of those results is broken. `Array.map` followed by `Array.getSomes` — both independently confirmed correct — is the reliable substitute and is what `Validate.ts` uses.
- **`Array.sortBy`/`Order.combineAll` throws `TypeError: self is not a function`** from inside `Order.js`, confirmed by reproduction with a stack trace pointing at the library's own internals, not caller error. `Validate.ts` keeps its original native `.sort()` comparator rather than adopt this combinator.

`Array.map`, `Array.filter`, `Array.flatMap`, and `Array.getSomes` were all individually verified correct and are used in `Validate.ts`'s rewritten `validateFeature` (the `unknownPlaceholder` loop was deliberately left imperative — `throw`-as-one-of-two-outcomes has no clean `Array` combinator shape — but the three purely-additive warning-collection loops now use `map`/`flatMap`/`getSomes`). All 301 tests pass unchanged after the rewrite, confirming behavioral equivalence, not just type-correctness.

**Running tally of confirmed-broken combinators in this exact `effect@4.0.0-rc.112` build**, for whoever picks up further `effect`-native work in this codebase: `Schema.Defect`, variadic `Schema.Literal` as a `Schema.TaggedError` field, `Schema.optional` silently omitting keys (workable around, not exactly "broken"), `Cache.make`'s returned shape not matching documented usage, `Array.filterMap`, `Array.sortBy`/`Order.combineAll`. Every one of these was found by direct reproduction against the installed package, not assumed from documentation or training data — treat any *other* less-common `effect` v4-rc combinator this codebase reaches for next as equally unverified until proven otherwise.

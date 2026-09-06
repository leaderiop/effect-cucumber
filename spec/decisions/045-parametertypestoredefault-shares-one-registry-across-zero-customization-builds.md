# ADR-EC-045: `ParameterTypeStore.Default` shares one process-wide `ParameterTypeRegistry` across every zero-customization build, instead of building fresh every time

> **Status:** Accepted
> **Date:** 2026-09-05
> **Context:** narrows BEH-EC-015's "every `loadFeature`/`parseFeature` call builds a FRESH `ParameterTypeRegistry`"
> requirement for the specific case ADR-EC-023's amendment did not need to consider — a store that declares no
> custom parameter type at all

## Context

`StepMatcher.ts` memoizes compiled `CucumberExpression`s in a `WeakMap<ParameterTypeRegistry, Map<string,
CucumberExpression>>`, keyed on registry object identity — necessarily, since an expression snapshots the
resolved parameter types at construction and a pattern-only key would serve one registry's expression to another
(`packages/gherkin/test/expressions-pin.test.ts`). `ParameterTypes.ts`'s `buildRegistry()` constructs a brand new
`ParameterTypeRegistry` on every call, and `packages/gherkin/src/loadFeature.ts`'s `parseFeature` calls it once,
eagerly, per `loadFeature`/`parseFeature` invocation.

A consumer with no custom parameter types — the common case — provides `ParameterTypeStore.Default` and never
touches `define`. Every one of its Feature files still gets its own, structurally identical, built-ins-only
registry, and the `WeakMap` above can never key-hit across them: registry identity differs even though the
registries hold the exact same eleven built-ins every time. Measured directly on `@effect-cucumber/vitest`'s own
suite — 24 Feature files sharing one ~125-pattern step vocabulary, all using `ParameterTypeStore.Default`, no
custom parameter types anywhere — building one registry per Feature versus sharing one across all 24 measured
**50.4ms → 17.6ms, a 2.86x difference**, on `StepMatcher`'s compile path specifically (a real but partial share of
a larger end-to-end run: roughly 8% of total overhead on that suite). A registry built once and reused turns every
Feature file after the first into cache hits instead of cold compiles, for every step pattern the vocabulary
repeats — and a project with 24 Feature files and one shared vocabulary is exactly this project's own shape, not
a constructed extreme.

## Decision

`ParameterTypeStore.Default`'s store (`createDefaultParameterTypeStore()` in `ParameterTypes.ts`) wraps a fresh
`createParameterTypeStore()` exactly as before for `define`/`definitions`, but overrides `buildRegistry()`:

- If the store still has **zero recorded definitions** at call time, it returns a single, lazily built,
  process-wide `ParameterTypeRegistry` — built once, from a throwaway store carrying no records, shared by every
  call thereafter.
- If the store has **any** recorded definitions — reachable only if something calls `.define()` directly on a
  store obtained from `ParameterTypeStore.Default`, which nothing in this codebase does but the shape permits —
  it falls through to that store's own, genuinely fresh `buildRegistry()`, unshared, exactly as today.

`ParameterTypeStore.layer(definitions)` and `createParameterTypeStore()` are **not touched**. Both still build a
fresh `ParameterTypeRegistry` on every `buildRegistry()` call, with no sharing of any kind. This is deliberate,
not an oversight: ADR-EC-023's amendment introduced "fresh store per Layer build" specifically to fix a real bug
— a module-level, append-only, mutable store meant a `.steps.ts` module evaluated twice (a watch-mode rerun,
`isolate: false`, two consumers defining one name) threw `DuplicateParameterTypeName` from a store nobody
intentionally created twice. That failure mode is about shared, mutable, _definable_ state — a `define` call
persisting where a second, unrelated build could see it. This decision shares nothing mutable: the singleton
registry is built once from zero records and nothing in this library's own code ever calls
`.defineParameterType()` on a registry after `buildRegistry()` returns it (verified by inspection — the only call
site is inside `buildRegistry()` itself). Two `ParameterTypeStore.Default` builds still see none of each other's
_definitions_, which is the property `test/ParameterTypes.test.ts`'s "builds a FRESH store per Layer build, so
two builds share nothing" test asserts and continues to assert unmodified. What they now share, when neither has
any definitions to keep separate, is a read-only object with nothing in it to leak.

## Verified, not assumed

- **The load-bearing isolation test constructs CUSTOM parameter types, not two plain default registries.**
  `packages/gherkin/test/ParameterTypes.test.ts`'s "`ParameterTypeStore.Default` builds a FRESH store per Layer
  build" test calls `.define()` on the first build's store before calling `buildRegistry()` on it, then asserts
  the _second_ build's store has zero definitions and its registry lacks the first build's custom type. That is a
  property about definitions leaking, which this decision preserves exactly (a store with a definition never
  reads the shared registry — see the `inner.definitions().length === 0` check). Nothing in that file, or in
  `packages/gherkin/test/StepMatcher.test.ts` or `test/expressions-pin.test.ts`, asserts that two _plain, zero-
  customization_ registries must be distinct objects as a property in its own right — checked directly, not
  inferred from the absence of a failure.
- **`StepMatcher.test.ts`'s "two different registries → two different expression instances" test is unaffected.**
  It builds its registries with `builtInRegistry() = createParameterTypeStore().buildRegistry()` directly — the
  generic factory this decision leaves untouched — never through `ParameterTypeStore.Default`. It still produces
  two independently-constructed registries, exactly as before, and the test needed no change.
- **Nothing downstream mutates a registry after `buildRegistry()` hands it back.** `Snippet.ts` and
  `packages/vitest/src/Plan.ts` only read `ParsedFeature.parameterTypes` (iterate `.parameterTypes` or pass it to
  `createStepMatcher`); `registry.defineParameterType(...)` is called from exactly one place in this codebase,
  inside `buildRegistry()` itself. A consumer could in principle grab the returned registry via `ParsedFeature`
  and call `.defineParameterType()` on it directly — an unsupported, undocumented use of a low-level upstream
  object this library never advertises as writable — which would leak into the shared singleton for every later
  `ParameterTypeStore.Default` build in the process. Nothing in this codebase's public API surface, spec, or test
  suite does or endorses this; `ParameterTypeStore.layer(...)` remains the sanctioned path for any consumer that
  needs a parameter type, and it never shares anything.

## Consequences

**Positive**:

- Measured 2.86x reduction in `StepMatcher` compile-path time for the true default case (50.4ms → 17.6ms on the
  24-Feature, no-customization benchmark above), and every custom-parameter-type consumer sees no behavior change
  at all.
- No public API change. `ParameterTypeStore.Default`'s type is unchanged (`Layer.Layer<ParameterTypeStore>`), and
  `ParameterTypeStoreShape`'s three-method shape is unchanged.

**Negative**:

- `ParameterTypeStore.Default`'s `buildRegistry()` is no longer a pure "always allocate" function — it now
  branches on the store's own definition count, which the doc comments above call out explicitly so a future
  reader does not have to rediscover it from behavior.
- The one caveat under "Verified, not assumed" above — a consumer manually mutating a returned registry — is a
  slightly larger blast radius than before (previously confined to that one throwaway registry; now shared).
  Accepted because nothing in this library does this or suggests doing it, and the fix for a consumer who wants a
  registry they can safely treat as their own is unchanged: `ParameterTypeStore.layer(...)`.

## Follow-up

None identified. `ParameterTypeStore.layer([])` — an explicit empty array, as opposed to `Default` — still builds
fresh every call by design; extending the singleton to that case was considered and rejected for this change,
since `Default` is the shape the measured real-world scenario (and every consumer who never touches custom
parameter types) actually uses, and widening the exception's surface without a second measured case to justify it
repeats the mistake ADR-EC-041 declined to make.

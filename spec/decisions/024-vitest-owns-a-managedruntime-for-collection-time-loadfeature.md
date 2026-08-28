# ADR-EC-024: `@effect-cucumber/vitest` owns one module-scoped `ManagedRuntime` for collection-time `loadFeature` calls

> **Status:** Accepted — design decision only, not yet implemented (`@effect-cucumber/vitest` remains a placeholder, see `spec/roadmap.md`)
> **Date:** 2026-08-28
> **Context:** settles the "which package owns the `ManagedRuntime` construction" question [ADR-EC-021](021-effect-and-platform-are-peer-dependencies-of-gherkin.md) raised during design and explicitly left open in its Follow-up section

## Context

`loadFeature` (`@effect-cucumber/gherkin`) is `Effect<ParsedFeature, LoadFeatureError | StepPatternError, FileSystem.FileSystem | ParameterTypeStore>` (ADR-EC-021, ADR-EC-023). `describeFeature` (`@effect-cucumber/vitest`, per [BEH-EC-002](../behaviors/01-steps-and-world.md#beh-ec-002-describefeature-takes-a-layer)) takes an already-resolved `feature: ParsedFeature` — not a path, not an Effect — because it must synchronously build vitest's `describe`/`it` tree during test **collection**, which happens once per Feature file, before any `it.effect`/`Layer` machinery ADR-EC-003/006/018 govern ever runs. Resolving a Feature file therefore has to happen once, at each Feature file's module top level, exactly like `packages/gherkin/test/loadFeature.test.ts`'s `topLevelFeature` pattern: a genuine top-level `await`.

That leaves a real question this ADR settles: what actually runs `loadFeature`'s Effect and supplies its two requirements, for every Feature file in a consumer's suite? Three shapes were considered:

1. **No wrapper at all.** `@effect-cucumber/vitest` re-exports gherkin's `loadFeature` unchanged; every consumer's Feature file writes `await Effect.runPromise(loadFeature(path).pipe(Effect.provide(Layer.mergeAll(NodeFileSystem.layer, ParameterTypeStore.Default))))` itself.
2. **A wrapper that rebuilds its Layer on every call**, via a bare `Effect.runPromise(...pipe(Effect.provide(layer)))` inside the re-exported function, with no memoization across Feature files.
3. **A wrapper backed by one `ManagedRuntime`, built once at module scope inside `@effect-cucumber/vitest`**, reused across every Feature file's `loadFeature` call in the same worker process.

Shape 1 pushes the exact boilerplate ADR-EC-021 already accepted as a `gherkin`-level trade-off onto every single Feature file a consumer writes — real suites have many Feature files, and `@effect-cucumber/vitest`'s entire reason to exist is to not make every Feature file re-derive plumbing the runner already knows. Rejected as contrary to the package's own purpose.

Shapes 2 and 3 differ only in whether the `FileSystem.FileSystem | ParameterTypeStore` `Layer` is rebuilt per Feature file or built once and reused. `ManagedRuntime` exists in Effect precisely for "a long-lived application that runs the same Effect program repeatedly against the same services" — a description that matches a test worker collecting many Feature files against one `NodeFileSystem.layer` exactly. Shape 3 was chosen.

## Decision

- `@effect-cucumber/vitest` constructs exactly one `ManagedRuntime` at its own module scope, over `NodeFileSystem.layer` only:
  ```ts
  const runtime = ManagedRuntime.make(NodeFileSystem.layer)
  ```
- `ParameterTypeStore` is **not** baked into that `ManagedRuntime`'s base `Layer`. It stays a per-call argument with a plain JS default value, mirroring the exact pattern already proven in `packages/gherkin/test/ParameterTypeLifecycle.test.ts`'s `load` helper:
  ```ts
  export const loadFeature = (
    path: string,
    parameterTypes: Layer.Layer<ParameterTypeStore> = ParameterTypeStore.Default
  ): Promise<ParsedFeature> => runtime.runPromise(gherkinLoadFeature(path).pipe(Effect.provide(parameterTypes)))
  ```
  This is what BEH-EC-001's worked example is corrected to show (see the amendment applied to that behavior alongside this ADR).
- `@effect-cucumber/vitest`'s `loadFeature` re-export therefore returns `Promise<ParsedFeature>`, not an `Effect` — a deliberate ergonomic simplification at this one boundary specifically because `describeFeature` needs the resolved value, not a deferred program, and top-level `await` is the only way a Feature file gets one. This does not reopen ADR-EC-021's "avoid Promises, prefer Effect" preference for the rest of the library: every other surface (steps, hooks, `describeFeature`'s own DSL) stays `Effect`-returning, unaffected by this decision.
- `@effect-cucumber/gherkin`'s own `loadFeature` is unchanged by this ADR — it still returns the full `Effect`, still requires both services explicitly, still takes no default. This ADR is entirely about how `@effect-cucumber/vitest` consumes it, not about gherkin's own signature.
- No separate "thin adapter" package is introduced. `@effect-cucumber/vitest` owns the `ManagedRuntime` directly, closing ADR-EC-021's open question with the simplest shape that serves the one real consumer that exists today. A future non-vitest runner package (speculative, not committed to by any current spec) would own its own `ManagedRuntime` the same way — nothing here couples the `ManagedRuntime` to vitest specifics, so extracting it later, if a second runner package is ever actually built, is a relocation, not a redesign.

## Consequences

**Positive**:

- One `Layer` build (`NodeFileSystem.layer`) per test worker process, not one per Feature file — matches `ManagedRuntime`'s documented purpose exactly, verified to actually behave that way (see Verified, not assumed).
- A consumer's Feature file keeps the zero-ceremony call shape BEH-EC-001's worked example always intended (`const feature = await loadFeature("./apples.feature")`), with no Layer-plumbing knowledge required for the common case.
- Custom `ParameterTypeStore`s stay fully reachable for a consumer who needs them (`loadFeature(path, ParameterTypeStore.layerOf(myStore))`), rather than being silently defeated by a store baked into the runtime's base `Layer` — verified as a real risk in ADR-EC-023's "no internal default" finding, and confirmed still true when the base dependency is delivered via `ManagedRuntime` rather than a bare `Effect.provide` (see Verified, not assumed).

**Negative**:

- `@effect-cucumber/vitest`'s `loadFeature` is permanently tied to `NodeFileSystem.layer` at the runtime's base — Bun/Deno support (already flagged as an open gap by ADR-EC-021's Consequences) requires either a build-time swap of which concrete `FileSystem` Layer this module scope constructs, or a second `ManagedRuntime`-owning entry point; this ADR does not solve that, only avoids making it harder than it already was.
- A module-scoped singleton `ManagedRuntime` is process-lifetime state inside a library package — unusual next to the rest of this codebase's discipline (ADR-EC-009: no closure state), but judged acceptable here because it holds no consumer-visible mutable data (only a `FileSystem.FileSystem` service handle) and existing precedent (`defaultParameterTypeStore` in `ParameterTypes.ts`) already accepts module-scoped state for the same class of reason: a process-lifetime resource shared across many collection-time calls.
- `runtime.dispose()` is never called — there is no natural point in a vitest run to call it (the worker process exits when the run ends), so the `ManagedRuntime`'s resources are cleaned up by process exit, not explicit disposal. Acceptable for `NodeFileSystem.layer`, which holds no resources requiring graceful shutdown (verified: it opens file handles per-read, not a persistent connection).

## Verified, not assumed

- **`ManagedRuntime.make(layer)` builds its `Layer` once and reuses it across repeated `.runPromise` calls**, not once per call — confirmed by direct reproduction against the installed `effect@4.0.0-rc.112` (two sequential `runtime.runPromise(program)` calls both observed the same service instance).
- **A per-call `Effect.provide(overrideLayer)` on a program run through `ManagedRuntime.runPromise` still overrides the runtime's own base `Layer` for that one call**, confirmed by reproduction (a service provided at 42 in the runtime's base `Layer`, overridden to 100 via `Effect.provide` on one specific `runPromise` call, actually observed 100) — this is what makes the `ParameterTypeStore` per-call-argument design in the Decision section actually work, and is consistent with (not a new instance of) the "closer to the requirement wins" semantics ADR-EC-023 already verified for plain `Effect.provide` composition.
- **`ManagedRuntime#dispose()` works and a `ManagedRuntime` correctly rejects further `.runPromise` calls after disposal** — confirmed by reproduction (`runtime.dispose()` followed by another `runPromise` call rejected, with `"ManagedRuntime disposed"` as the rejection value, not an `Error` instance — noted here since a naive `instanceof Error` check on that rejection would be wrong). Not used by the Decision above (this package never disposes its runtime), but verified so the fact is on record rather than assumed if a future ADR revisits this.

# ADR-EC-023: `ParameterTypeStore` becomes an ambient `Context.Service`, replacing `LoadFeatureOptions`

> **Status:** Accepted and implemented — amended: there is no process-wide store (see the amendment at the end)
> **Date:** 2026-08-28
> **Context:** direct continuation of ADR-EC-021 (effect/platform as peer dependencies, `loadFeature`
> becomes `Effect`-returning with a `FileSystem.FileSystem` requirement) and ADR-EC-022 (`Option<T>`
> throughout the public API) — with `loadFeature` already `Effect`-returning and already carrying one
> ambient requirement, the remaining plain-argument dependency (`LoadFeatureOptions.parameterTypes`)
> was the one piece of the signature still inconsistent with the rest of the migration

## Context

Before this decision, `loadFeature`/`parseFeature` took an optional second argument,
`options?: LoadFeatureOptions`, whose one field was `parameterTypes: Option<ParameterTypeStore>` —
a plain value, threaded through by hand, defaulting to the module-level `defaultParameterTypeStore`
when omitted.

That shape was already odd next to the rest of the post-ADR-EC-021 signature: `FileSystem.FileSystem`
is not a plain argument, it is an ambient `Effect` requirement supplied via `Layer`/`Effect.provide`.
Two different mechanisms — one requirement satisfied by the `R` channel, the other by a hand-passed
object — for what is structurally the same kind of thing: a dependency `loadFeature` needs to do its
job, not data it operates on.

The question of whether to unify them was put to the user explicitly (`AskUserQuestion`) rather than
assumed. The answer: **the most advanced, most Effect-native solution** — make `ParameterTypeStore`
a real `Context.Service`, provided via `Layer` exactly like `FileSystem.FileSystem`, and delete
`LoadFeatureOptions` entirely.

## Decision

- `ParameterTypeStore` is now `export class ParameterTypeStore extends Context.Service<ParameterTypeStore, ParameterTypeStoreShape>()("@effect-cucumber/gherkin/ParameterTypeStore") {}`, matching the `Context.Service<Self, Shape>()(tagString)` pattern already established by `World` under ADR-EC-002 — not `Context.Tag`.
- The store's shape (`define`, `definitions`, `buildRegistry`) is produced by `createParameterTypeStore()`, unchanged in behavior from before this ADR. `ParameterTypeStoreShape` is now `ReturnType<typeof createParameterTypeStore>` — a derived type, not a hand-maintained parallel interface — so the shape has exactly one definition to keep in sync. (`createParameterTypeStore`'s own return type annotation is omitted deliberately: annotating it as `ParameterTypeStoreShape` while `ParameterTypeStoreShape` is defined as that function's `ReturnType` is a circular type reference.) The per-property doc comments that used to live on the old hand-written interface now live on the corresponding `const` declarations inside `createParameterTypeStore`, and on the `ParameterTypeStoreShape` alias itself.
- `ParameterTypeStore.Default` is a `Layer.Layer<ParameterTypeStore>` backed by the module-level `defaultParameterTypeStore` (the same append-only, built-ins-preloaded store that used to be the implicit default).
- `ParameterTypeStore.layerOf(store: ParameterTypeStoreShape)` is a `Layer.succeed`-backed constructor for providing any other store — the replacement for what used to be `{ parameterTypes: Option.some(store) }`.
- `LoadFeatureOptions` is deleted. `parseFeature` and `loadFeature` no longer take a second argument at all; both now require `ParameterTypeStore` in their `R` channel (`loadFeature` requires `FileSystem.FileSystem | ParameterTypeStore`, `parseFeature` requires only `ParameterTypeStore`).
- No internal default `Layer` is baked into `parseFeature`/`loadFeature` themselves — the caller always provides `ParameterTypeStore.Default` (or a custom store's `Layer`) explicitly, exactly as `FileSystem.FileSystem` is never internally defaulted. This is deliberate, not an oversight — see **Verified, not assumed** below for why baking in a default would have been actively worse than requiring explicit provision.
- Multiple `Layer` requirements are combined with `Layer.mergeAll(...)`, never chained `.pipe(Effect.provide(a), Effect.provide(b))` calls — `@effect/tsgo`'s `multipleEffectProvide` diagnostic fails the build on the chained form.

## Consequences

**Positive**:

- One dependency-provision mechanism for the whole of `loadFeature`'s requirements, not two. A consumer providing `FileSystem.FileSystem` and `ParameterTypeStore` writes the same kind of code for both.
- `ParameterTypeStoreShape` can no longer drift from what `createParameterTypeStore` actually returns — the old hand-written interface required a human to notice and update it every time the factory's return shape changed; the derived type makes that class of staleness impossible.
- `defineParameterType`'s existing zero-ceremony, module-scope calling convention (register a custom type by calling a plain function directly, no `Effect` involved) is untouched by this change — the `Context.Service` wraps the _store_, not the _definition_ step.

**Negative**:

- Every call site of `loadFeature`/`parseFeature` in the test suite had to be rewritten to provide `ParameterTypeStore` explicitly via `Layer` — there is no "omit it and get the default for free" argument-level ergonomic left, matching the trade-off ADR-EC-021 already accepted for `FileSystem.FileSystem`.
- `loadFeature`'s type signature grew a second ambient requirement; a consumer reading only the return type now has to understand two independent `Layer`s to run it, not one.

**Explicitly out of scope**: a `Ref`-based rewrite of `ParameterTypeStore`'s internal state — making `define`/`buildRegistry` themselves `Effect`-returning instead of the plain synchronous functions they are today — was raised and deliberately **not** bundled into this decision. That change would additionally break `defineParameterType`'s current zero-ceremony, module-scope calling convention (calling it directly with no `Effect` ceremony), which is a distinct property worth deciding on its own rather than as a side effect of making the store's _provision_ ambient. If it is ever adopted, it belongs in its own ADR.

## Verified, not assumed

- **An internally-baked-in default `Layer` permanently wins over any later caller `Effect.provide` override.** Confirmed by direct reproduction: a service with a default supplied inside the function that needs it (rather than left for the caller to provide) cannot be overridden by a caller's own `Effect.provide` for that same service — the inner provision runs closer to the requirement and wins. This is the concrete reason neither `parseFeature`/`loadFeature` nor the earlier `FileSystem.FileSystem` migration bakes in a default: doing so would make `ParameterTypeStore.layerOf(customStore)` silently a no-op for any caller of `loadFeature`/`parseFeature` specifically (as opposed to callers who compose their own program around them), which defeats the entire point of the custom-store test scenarios this store exists to support.
- **`Layer.succeed`-backed plain services are `Effect.runSync`-safe.** Confirmed by reproduction, and relied upon directly: `parseFeature`, which requires only `ParameterTypeStore`, keeps working under `Effect.runSync` after this change, unlike `loadFeature`, which additionally requires the genuinely-asynchronous `NodeFileSystem.layer` (ADR-EC-021) and therefore does not.
- **`Context.Service<Self, Shape>()(tagString)` is the correct v4 construction pattern**, not `Context.Tag(...)` — already established in this codebase by `World` (ADR-EC-002); re-confirmed applicable here by the same reasoning, and by the fact that the resulting class typechecks and the full test suite (301 tests) passes under it.
- **`Layer.mergeAll(a, b)` composes two `Layer`s correctly for a single `Effect.provide` call**, confirmed by a standalone reproduction before being adopted at the four call sites that need both `NodeFileSystem.layer` and a `ParameterTypeStore` `Layer` simultaneously.

## Amendment — the service is the only entry point; no process-wide store

> **Amends the Decision above; the body is left as written, per ADR-EC-014's precedent.**
> `defaultParameterTypeStore`, `defineParameterType` and `buildParameterTypeRegistry` are gone.
> The module-level store was append-only for the life of the process and exported, so a
> `.steps.ts` module evaluated twice — a watch-mode rerun, `isolate: false`, two consumers
> defining one name — threw `DuplicateParameterTypeName` from a store nobody created, and two
> copies of the package would have meant two stores and silently missing types. In its place:
> `ParameterTypeStore.Default` is `Layer.sync` over a FRESH built-ins-only store per Layer
> build; `ParameterTypeStore.layer(definitions)` is the consumer-facing declaration, a Layer
> carrying a fresh store with the definitions replayed in order, whose rejections surface as
> `StepPatternError` in the Layer's error channel; and `ParameterTypeStore.layerOf(store)`
> remains for a store filled by hand through `createParameterTypeStore()`. The "zero-ceremony
> module-scope `defineParameterType`" convention this ADR's Positive consequences preserved is
> withdrawn with it: declaring a custom type is now writing a value, not performing a side
> effect at import time. Asserted by `packages/gherkin/test/ParameterTypes.test.ts` (two
> builds of `Default` share nothing; `layer` carries a definition; `layer` fails on a
> duplicate).

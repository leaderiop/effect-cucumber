/**
 * The Promise-returning `loadFeature` a Feature file calls at module top level
 * ([ADR-EC-024](../../../spec/decisions/024-vitest-owns-a-managedruntime-for-collection-time-loadfeature.md)).
 *
 * `describeFeature` needs an already-resolved `ParsedFeature` during vitest's synchronous
 * collection, so every Feature file awaits this once at its top level. The wrapper runs
 * `@effect-cucumber/gherkin`'s Effect-returning `loadFeature` on ONE module-scoped
 * `ManagedRuntime` over `NodeFileSystem.layer`, built once for the whole worker and never
 * disposed — a test worker's lifetime is the runtime's lifetime. `ParameterTypeStore` is a
 * per-call argument rather than part of the runtime's Layer so a file that declares custom
 * parameter types can pass its own store without touching a process-wide one.
 *
 * This is the one deliberately Promise-returning surface in the library; everything after the
 * `await` is an Effect again. Verified by `packages/vitest/test/loadFeature.test.ts`.
 */
import { loadFeature as gherkinLoadFeature, ParameterTypeStore, type ParsedFeature } from "@effect-cucumber/gherkin"
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem"
import * as Effect from "effect/Effect"
import type * as Layer from "effect/Layer"
import * as ManagedRuntime from "effect/ManagedRuntime"

const runtime = ManagedRuntime.make(NodeFileSystem.layer)

/**
 * Read and parse one `.feature` file.
 *
 * `parameterTypes` defaults to the built-ins-only store; pass `ParameterTypeStore.layerOf(store)`
 * for a store carrying custom parameter types. Rejects with `LoadFeatureError` or
 * `StepPatternError`, the same typed failures the gherkin package's `loadFeature` fails with.
 */
export const loadFeature = (
  path: string,
  parameterTypes: Layer.Layer<ParameterTypeStore> = ParameterTypeStore.Default
): Promise<ParsedFeature> => runtime.runPromise(gherkinLoadFeature(path).pipe(Effect.provide(parameterTypes)))

/**
 * The Promise-returning `loadFeature` (ADR-EC-024): the gherkin package's Effect run on one
 * module-scoped `ManagedRuntime` over `NodeFileSystem.layer`, with `ParameterTypeStore` as a
 * per-call argument (`test/loadFeature.test.ts`).
 */
import { loadFeature as gherkinLoadFeature, ParameterTypeStore, type ParsedFeature } from "@effect-cucumber/gherkin"
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem"
import * as Effect from "effect/Effect"
import type * as Layer from "effect/Layer"
import * as ManagedRuntime from "effect/ManagedRuntime"

const runtime = ManagedRuntime.make(NodeFileSystem.layer)

/**
 * Read and parse one `.feature` file.
 */
export const loadFeature = (
  path: string,
  parameterTypes: Layer.Layer<ParameterTypeStore> = ParameterTypeStore.Default
): Promise<ParsedFeature> => runtime.runPromise(gherkinLoadFeature(path).pipe(Effect.provide(parameterTypes)))

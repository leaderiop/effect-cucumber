/**
 * Shared by every test file that needs a real, on-disk `.feature` file loaded through the real
 * `loadFeature`/`parseFeature`, fully provided and Effect-native — no `Effect.runPromise`/
 * `Effect.runSync` anywhere: `it.effect`'s own runtime executes the returned Effect. Both take an
 * OPTIONAL `ParameterTypeStore` Layer, defaulting to `ParameterTypeStore.Default`, matching the
 * one-argument call form a real consumer uses (BEH-EC-001).
 *
 * `load`/`parse` used to be duplicated per test file, each hand-rolling `Effect.runPromise`/
 * `Effect.runSync` around `Effect.provide(...)` — an asymmetry that existed only because
 * `NodeFileSystem.readFileString` suspends internally while a `Layer.succeed`-backed
 * `ParameterTypeStore` doesn't (ADR-EC-023's correction), forcing a caller to pick the right
 * escape hatch. `it.effect` erases that distinction, which is what makes a single shared shape
 * honest here.
 */
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { loadFeature, parseFeature } from "../../src/loadFeature.ts"
import { ParameterTypeStore } from "../../src/ParameterTypes.ts"

export const load = (path: string, parameterTypes: Layer.Layer<ParameterTypeStore> = ParameterTypeStore.Default) =>
  loadFeature(path).pipe(Effect.provide(Layer.mergeAll(NodeFileSystem.layer, parameterTypes)))

export const parse = (
  source: string,
  uri: string,
  parameterTypes: Layer.Layer<ParameterTypeStore> = ParameterTypeStore.Default
) => parseFeature(source, uri).pipe(Effect.provide(parameterTypes))

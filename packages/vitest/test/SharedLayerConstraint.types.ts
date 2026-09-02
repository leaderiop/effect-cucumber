/**
 * Tests for `SharedLayerConstraint`.
 *
 * Carries: BEH-EC-007.
 */
import type { ParsedFeature } from "@effect-cucumber/gherkin"
import * as Context from "effect/Context"
import * as Layer from "effect/Layer"
import { collectFeature, describeFeature } from "../src/describeFeature.ts"

// The service both fixture Layers below provide, so the two differ in their error channel alone.
class Shared extends Context.Service<Shared, { readonly ok: boolean }>()("SharedLayerConstraint/Shared") {}

// The realistic shared-Layer failure, named after what it stands for: a testcontainer that does not start.
class SharedLayerBuildError extends Error {}

// Every fixture is a `declare const`, so this module builds no value and runs nothing when compiled.
declare const feature: ParsedFeature
declare const okShared: Layer.Layer<Shared, never, never>
declare const failing: Layer.Layer<Shared, SharedLayerBuildError, never>

class World extends Context.Service<World, { readonly ok: boolean }>()("SharedLayerConstraint/World") {}
class Db extends Context.Service<Db, { readonly ok: boolean }>()("SharedLayerConstraint/Db") {}
// A per-Scenario tier built FROM the shared tier's service (BEH-EC-007).
declare const worldOverShared: Layer.Layer<World, never, Shared>
// A per-Scenario tier needing a service NEITHER tier provides.
declare const worldOverDb: Layer.Layer<World, never, Db>

// describeFeature — the published entry point.

// NEGATIVE: a `shared` Layer whose error channel is not `never` is rejected.
// @ts-expect-error `shared` must be Layer<R, never, never>, so a failable shared Layer is rejected
describeFeature(feature, { shared: failing, perScenario: Layer.empty }, () => {})

// POSITIVE CONTROL: the legitimate case still compiles, so the negative above is not total.
describeFeature(feature, { shared: okShared, perScenario: Layer.empty }, () => {})

// ASYMMETRY CONTROL: `perScenario` is unconstrained — a failable per-Scenario Layer is legitimate.
describeFeature(feature, { shared: okShared, perScenario: failing }, () => {})

// F-18: `perScenario` may require what `shared` provides ...
describeFeature(feature, { shared: okShared, perScenario: worldOverShared }, () => {})

// ...
// @ts-expect-error a per-Scenario tier needing a service neither tier provides is rejected
describeFeature(feature, { shared: okShared, perScenario: worldOverDb }, () => {})

// collectFeature — the internal entry point, identical constraint, deliberately no `options` arity.

// NEGATIVE: the same rejection, so the two entry points cannot drift apart unnoticed.
// @ts-expect-error `shared` must be Layer<R, never, never>, so a failable shared Layer is rejected
collectFeature(feature, { shared: failing, perScenario: Layer.empty }, () => {})

// POSITIVE CONTROL: the legitimate case still compiles here too.
collectFeature(feature, { shared: okShared, perScenario: Layer.empty }, () => {})

// ASYMMETRY CONTROL: `perScenario` is unconstrained on this entry point as well.
collectFeature(feature, { shared: okShared, perScenario: failing }, () => {})

collectFeature(feature, { shared: okShared, perScenario: worldOverShared }, () => {})

// @ts-expect-error a per-Scenario tier needing a service neither tier provides is rejected
collectFeature(feature, { shared: okShared, perScenario: worldOverDb }, () => {})

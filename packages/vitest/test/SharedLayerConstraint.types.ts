/**
 * D-04's claim, in all three directions and for both public entry points: a `shared` Layer that can
 * FAIL does not compile, a `shared` Layer that cannot fail still does, and `perScenario` is left
 * completely alone.
 *
 * The constraint exists because `@effect/vitest`'s `layer()` builds with
 * `Layer.buildWithMemoMap(...).pipe(Effect.orDie, ...)` — verified at the installed
 * `@effect/vitest@4.0.0-rc.112`'s `dist/internal/internal.js` line 147. `Effect.orDie` turns a typed
 * shared-Layer failure into an unrecoverable defect raised out of a `beforeAll`/`beforeEach` hook,
 * detached from every Scenario, so the report names no Scenario, no step and no `.feature` file.
 * `describeFeature.ts` note (f) is the full argument; this file is the only place the claim is
 * checked.
 *
 * The `.types.ts` suffix is load-bearing, following `GherkinTags.types.ts` and
 * `packages/gherkin/test/StepArgs.types.ts`. vitest's default include glob is
 * `**\/*.{test,spec}.?(c|m)[jt]s?(x)`, so this file is never collected and `pnpm test`'s count is
 * unchanged by its existence; renaming it to `SharedLayerConstraint.test.ts` would make `pnpm test`
 * fail with "No test suite found". Meanwhile `packages/vitest/tsconfig.test.json` has
 * `include: ["src", "test"]`, so `pnpm typecheck:test` — a required step in
 * `.github/workflows/check.yml`'s `types` job — compiles it on every push. The calls below are
 * therefore never EXECUTED, only checked; nothing imports this module.
 *
 * Three properties keep the file from being vacuous, and no two of them substitute for the third:
 *
 * (a) The negative directives fail the build when the error they expect STOPS occurring. They are
 *     what catches "the constraint was quietly reverted". Their spelling is deliberately not
 *     repeated in this prose: an acceptance grep pins their count at exactly two, one per entry
 *     point, so quoting the token in a comment would fail the check that keeps the count honest.
 *     (`STATE.md`'s 03-04 entry records the same collision and the same workaround.)
 *
 * (b) The positive controls carry no directive at all. They are what catches the opposite
 *     degeneration — a `shared` field narrowed so far that it rejects the legitimate case too,
 *     which leaves a negatives-only file green while the entry point has become unusable.
 *
 * (c) The asymmetry controls pass a FAILABLE Layer in the `perScenario` position, with no directive.
 *     D-04 constrains `shared` alone on purpose — a per-Scenario Layer is provided inside its own
 *     Scenario's Effect, so a typed failure there surfaces named and located instead of as an
 *     orphaned defect — and without these two cases nothing distinguishes that decision from an
 *     edit somebody forgot to finish.
 *
 * Nothing here may be widened with a type assertion. One escape hatch anywhere makes every
 * surrounding case prove nothing, because the assertion, not the signature, would be what the
 * compiler agreed with.
 */
import type { ParsedFeature } from "@effect-cucumber/gherkin"
import * as Context from "effect/Context"
import * as Layer from "effect/Layer"
import { collectFeature, describeFeature } from "../src/describeFeature.ts"

/** The service both fixture Layers below provide, so the two differ in their error channel alone. */
class Shared extends Context.Service<Shared, { readonly ok: boolean }>()("SharedLayerConstraint/Shared") {}

/**
 * The realistic shared-Layer failure, named after what it stands for: a testcontainer that does not
 * start. Never constructed — it exists only to give the fixture below a non-`never` error channel.
 */
class SharedLayerBuildError extends Error {}

/**
 * Every fixture is a `declare const`, so this module builds no value and runs nothing when compiled.
 */
declare const feature: ParsedFeature
declare const okShared: Layer.Layer<Shared, never, never>
declare const failing: Layer.Layer<Shared, SharedLayerBuildError, never>

class World extends Context.Service<World, { readonly ok: boolean }>()("SharedLayerConstraint/World") {}
class Db extends Context.Service<Db, { readonly ok: boolean }>()("SharedLayerConstraint/Db") {}
/** A per-Scenario tier built FROM the shared tier's service (BEH-EC-007). */
declare const worldOverShared: Layer.Layer<World, never, Shared>
/** A per-Scenario tier needing a service NEITHER tier provides. */
declare const worldOverDb: Layer.Layer<World, never, Db>

//
// describeFeature — the published entry point.
//

/** NEGATIVE: a `shared` Layer whose error channel is not `never` is rejected. */
// @ts-expect-error D-04: `shared` must be Layer<R, never, never>, so a failable shared Layer is rejected
describeFeature(feature, { shared: failing, perScenario: Layer.empty }, () => {})

/** POSITIVE CONTROL: the legitimate case still compiles, so the negative above is not total. */
describeFeature(feature, { shared: okShared, perScenario: Layer.empty }, () => {})

/** ASYMMETRY CONTROL: `perScenario` is unconstrained — a failable per-Scenario Layer is legitimate. */
describeFeature(feature, { shared: okShared, perScenario: failing }, () => {})

// F-18: `perScenario` may require what `shared` provides ...
describeFeature(feature, { shared: okShared, perScenario: worldOverShared }, () => {})

// ... and nothing else. (The by-name diagnostic is asserted by verify-tsgo-gate.sh's
// per-scenario-missing-rin fixture; this line only pins that the call is rejected at all.)
// @ts-expect-error a per-Scenario tier needing a service neither tier provides is rejected
describeFeature(feature, { shared: okShared, perScenario: worldOverDb }, () => {})

//
// collectFeature — the internal entry point, identical constraint, deliberately no `options` arity.
//

/** NEGATIVE: the same rejection, so the two entry points cannot drift apart unnoticed. */
// @ts-expect-error D-04: `shared` must be Layer<R, never, never>, so a failable shared Layer is rejected
collectFeature(feature, { shared: failing, perScenario: Layer.empty }, () => {})

/** POSITIVE CONTROL: the legitimate case still compiles here too. */
collectFeature(feature, { shared: okShared, perScenario: Layer.empty }, () => {})

/** ASYMMETRY CONTROL: `perScenario` is unconstrained on this entry point as well. */
collectFeature(feature, { shared: okShared, perScenario: failing }, () => {})

collectFeature(feature, { shared: okShared, perScenario: worldOverShared }, () => {})

// @ts-expect-error a per-Scenario tier needing a service neither tier provides is rejected
collectFeature(feature, { shared: okShared, perScenario: worldOverDb }, () => {})

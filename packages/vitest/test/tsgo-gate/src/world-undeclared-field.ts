// MUST NOT COMPILE. Asserted by scripts/verify-tsgo-gate.sh (assertion 7) as
//   exit != 0  AND  output containing "TS2339".
//
// The assertion for this file must NOT grep for `effect(`. Every other negative fixture in this
// directory fails on an @effect/tsgo diagnostic; this one does not, and cannot. Reading a property
// absent from a service's declared type is a plain TypeScript error — RESEARCH.md Finding 10
// reproduced it as `TS2339` with no `TS377xxx` anywhere in the output. Copying assertion 4's or
// assertion 6's `effect(...)` grep down here produces an assertion that can only ever fail, which
// then invites whoever inherits it to weaken or delete the check rather than read this comment.
//
// If an Effect diagnostic ever DOES appear in this fixture's output, the fixture has acquired a
// second defect and has stopped being a specific proof of DSL-03. Narrow it until `TS2339` is the
// only error, rather than relaxing the assertion.
//
// This is DSL-03 / BEH-EC-004's negative half. Its positive half is src/step-satisfied.ts, whose
// steps read `apples` — a field that IS declared — and compile clean.
import type { ParsedFeature } from "@effect-cucumber/gherkin"
import { describeFeature } from "@effect-cucumber/vitest"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Ref from "effect/Ref"

// Duplicated from the sibling fixtures rather than shared through a helper module: `files: [one]`
// would force every sibling config to list the helper too (RESEARCH.md Open Question 2). The
// explicit `Layer.Layer<...>` annotation is not optional — declaration emit demands it for anything
// exported (Finding 10).
//
// `apples` is the ENTIRE declared shape of this World. That is the point of the fixture: the
// declared type is the whole reachable surface, and nothing else exists.
export class World extends Context.Service<World, { readonly apples: Ref.Ref<number> }>()("World") {
  static readonly layer: Layer.Layer<World> = Layer.effect(
    World,
    Effect.gen(function*() {
      return World.of({ apples: yield* Ref.make(0) })
    })
  )
}

declare const feature: ParsedFeature

// The Layer here is entirely correct and the step's context is fully satisfied — `World` is
// provided, so there is nothing for an Effect diagnostic to fire on. The single defect is one
// property read, and isolating it that tightly is what makes `TS2339` the only code in the output.
describeFeature(feature, World.layer, ({ Given }) => {
  Given("reads a field World does not declare", function*() {
    const world = yield* World

    // THE DEFECT. `oranges` is not in World's declared type, so it is not reachable — TS2339,
    // "Property 'oranges' does not exist on type ...".
    //
    // This is the untyped-context-bag failure that ADR-EC-002 exists to eliminate. In a runner
    // that threads an untyped `context` object through steps, this line reads `undefined` and the
    // Scenario proceeds on bad state, failing later somewhere unrelated — or worse, passing. The
    // fixture is deliberately free of escape hatches for the same reason: one widening assertion
    // anywhere in a step body is assignable to everything and makes the whole file prove nothing
    // (PITFALLS Pitfall 6). BEH-EC-004 states the requirement
    // directly: there MUST be no way to read a World field that "doesn't exist yet". If this file
    // ever compiles, that requirement is prose and World is a bag with extra ceremony.
    void world.oranges
  })
})

// MUST COMPILE CLEAN. Asserted by scripts/verify-tsgo-gate.sh (assertion 9) as exit 0.
//
// A `@ts-expect-error`-based negative type-test, which is the form the roadmap's success criterion
// names literally. It compiles clean ONLY because both errors on the marked line are suppressed —
// the plain `TS2345` by TypeScript's own directive, and `TS377004 effect(missingEffectContext)` by
// @effect/tsgo's, which the TypeScript one does not touch (RESEARCH.md Finding 3). If the DSL type
// is ever loosened so that no error occurs there, this file starts failing. That is the whole
// mechanism: an expected error that stopped happening becomes a build failure.
//
// Which code it fails with under that loosening was measured in plan 05-05, and is worth knowing
// before someone debugs it. With BOTH directives in place, the first thing to go is the PLUGIN
// directive — `warning TS377000: @effect-diagnostics directive has no effect`, exit 1, because a
// suppression with nothing left to suppress is itself reportable. `TS2578` ("Unused
// '@ts-expect-error' directive") is what appears once the plugin directive is out of the way. Two
// different codes for one underlying cause; assertion 9 checks the exit code alone precisely
// because either one means the same thing, and pinning the assertion to a single code would make it
// fail to fire for the other.
//
// THIS FIXTURE IS STRICTLY WEAKER THAN src/step-missing-service.ts, AND IS NOT A REPLACEMENT FOR IT.
// It proves that AN error occurred on that line. It cannot prove WHICH. A regression that downgraded
// the Effect diagnostic to a mere `TS2345` — exactly the decay Finding 2 describes, where reordering
// the StepRegistrar union turns a context error into a shape error — would pass this file silently,
// with no output change at all. Assertion 6 and its exit-code fixture remain the DSL-01 proof;
// assertion 9 and this file are the supplement. Ship both, per RESEARCH.md Open Question 1. Do not
// delete assertion 6 on the belief that this one covers it.
import type { ParsedFeature } from "@effect-cucumber/gherkin"
import { describeFeature } from "@effect-cucumber/vitest"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Ref from "effect/Ref"

// Duplicated from src/step-missing-service.ts rather than shared through a helper module: `files:
// [one]` would force every sibling config to list the helper too (RESEARCH.md Open Question 2). The
// defective step below is the same defect as that fixture's, on purpose — the only difference
// between the two files is whether the errors are suppressed.
export class World extends Context.Service<World, { readonly apples: Ref.Ref<number> }>()("World") {
  static readonly layer: Layer.Layer<World> = Layer.effect(
    World,
    Effect.gen(function*() {
      return World.of({ apples: yield* Ref.make(0) })
    })
  )
}

// `Db.layer` exists but is never wired into the ambient Layer below. Adding it there is the
// "loosening mutation" this fixture's failure mode is defined against: with `Db` provided, no error
// occurs on the marked line and `TS2578` fires on the now-unused directive.
export class Db extends Context.Service<Db, { readonly clear: Effect.Effect<void> }>()("Db") {
  static readonly layer: Layer.Layer<Db> = Layer.succeed(Db, Db.of({ clear: Effect.void }))
}

declare const feature: ParsedFeature

describeFeature(feature, World.layer, ({ Given }) => {
  // DIRECTIVE ORDER IS LOAD-BEARING, AND NOT INTERCHANGEABLE. The `@effect-diagnostics-next-line`
  // comment MUST be the line immediately above the code; TypeScript's own directive goes above it.
  // TypeScript skips intervening comment lines when resolving "next line"; the @effect/tsgo plugin
  // does not. Reversed — the arrangement a reader might reach for because it groups the TypeScript
  // concern nearest the code — the compiler emits `warning TS377000: @effect-diagnostics directive
  // has no effect` PLUS the unsuppressed `TS377004`, and this fixture fails. Verified both ways in
  // RESEARCH.md Finding 3(A); the reversal was re-run against this exact file in plan 05-05.
  //
  // The FILE-LEVEL variant of the directive below — the same rule name, spelled without the
  // `-next-line` suffix — would also silence the diagnostic, and is forbidden here by an acceptance
  // grep that this file must not itself satisfy, which is why it is described rather than quoted.
  // It disables the rule for the WHOLE file, so a second, unrelated defect could appear and this
  // fixture would go on compiling clean for the wrong reason. The next-line form is surgical: one
  // line, one rule, one occurrence.
  // @ts-expect-error the step requires `Db`, which the ambient World.layer does not provide
  // @effect-diagnostics-next-line missingEffectContext:off
  Given("needs Db", function*() {
    yield* (yield* Db).clear
  })
})

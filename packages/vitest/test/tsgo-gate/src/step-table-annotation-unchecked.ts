// MUST COMPILE CLEAN. Asserted by scripts/verify-tsgo-gate.sh as exit 0.
//
// A CHARACTERIZATION FIXTURE, and the only one in this directory that pins a GAP rather than a
// guarantee. Every other fixture here asserts that the compiler catches something; this one asserts
// that it does NOT, so that BEH-EC-016's statement to that effect is measured rather than assumed —
// and so that the day it stops being true, this gate says so instead of the spec quietly going stale
// in the opposite direction (AGENTS.md §4, second direction).
//
// WHAT IS BEING PINNED. BEH-EC-016 requires a step body to receive its `stepArguments` positionally,
// APPENDED after the cucumber-expression arguments, and requires the author to ANNOTATE the trailing
// parameter — `(table: DataTable)` — because `StepArgs<P>` structurally cannot infer it: a table is
// everything BELOW the text a pattern matches, so no pattern literal can express its presence.
//
// The REQUIREMENT then reads as though the annotation is load-bearing. It is not checked in either
// direction, and `Dsl.ts` note (d) is why. `StepRegistrar` types a body's parameters as
//
//     StepParams<P> = [...StepArgs<P, Record<string, any>>, ...ReadonlyArray<any>]
//
// The pattern's HOLES are checked against `StepArgs<P>` (that half closed in F-03). The trailing
// parameter sits in the `...ReadonlyArray<any>` tail, because a table is everything BELOW the text a
// pattern matches and no pattern literal can express its presence. So a body may declare the WRONG
// type for its trailing parameter and get a runtime shape error rather than a compile error — and it
// may also declare NO trailing parameter at all and silently ignore a table the author wrote in the
// `.feature` file.
//
// `packages/vitest/test/acceptance/parsing-and-matching.steps.test.ts`'s append-order Scenario is the
// other half of this: because the annotation proves nothing, that step's body ASSERTS the runtime
// type of both parameters rather than trusting what it declared.
//
// This is the same class of hole `parsing-and-matching.steps.test.ts`'s mutation C already records
// for PATTERN arguments — "a pattern and a body can disagree with each other and only a runtime
// assertion notices". The table arm inherits it.
//
// IF THIS FILE EVER FAILS TO COMPILE, the gap has closed. That is good news, not a broken fixture:
// delete the wrong-annotation cases below, and remove the "unverified" paragraph from BEH-EC-016's
// step-body-signature REQUIREMENT in the same commit.
import type { DataTable, DocString, ParsedFeature } from "@effect-cucumber/gherkin"
import { describeFeature } from "@effect-cucumber/vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

declare const feature: ParsedFeature

describeFeature(feature, Layer.empty, ({ Given, Then, When }) => {
  // THE CORRECT FORM, first, so the two sit side by side in one file. `DataTable` is annotated
  // explicitly because nothing can infer it, and `raw()` is a real accessor on the real type.
  Given("the cart contains:", function*(table: DataTable) {
    yield* Effect.sync(() => table.raw().length)
  })

  // WRONG ANNOTATION, ACCEPTED. At runtime this parameter is a `DataTable` object; the body declares
  // `string` and calls a `string` method on it. `tsc` is silent, `oxlint` is silent, and the failure
  // surfaces only when the step runs — as `table.toUpperCase is not a function`, at a frame that
  // names the step pattern (ADR-EC-005) but says nothing about the annotation being the cause.
  When("the cart contains a wrongly annotated table:", function*(table: string) {
    yield* Effect.sync(() => table.toUpperCase())
  })

  // The same hole for the DocString arm, which is worth pinning separately: `DocString` is plain
  // data with a `content` field, so a body annotating it as `DataTable` type-checks and then fails
  // on an accessor that does not exist.
  Then("the note reads:", function*(note: DataTable) {
    yield* Effect.sync(() => note.raw().length)
  })

  // MISSING ANNOTATION, ALSO ACCEPTED, and this is the quieter of the two failures: the `.feature`
  // step carries a table, the body declares no parameter for it, and the argument is simply dropped.
  // Nothing is thrown, nothing is logged, and the Scenario passes while ignoring its own data.
  Given("the cart contains a table this body ignores:", function*() {
    yield* Effect.void
  })

  // The inverse — a body declaring a trailing parameter for a step that carries NO argument. The
  // parameter arrives `undefined`, which is the shape that went unnoticed for five phases while
  // `planStep` forwarded only the matcher's arguments (StepArguments.ts note (b)).
  Then("a step with no argument at all", function*(absent: DocString) {
    yield* Effect.sync(() => absent.content.length)
  })
})

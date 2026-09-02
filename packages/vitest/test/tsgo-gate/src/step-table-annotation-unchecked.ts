// MUST COMPILE CLEAN.
import type { DataTable, DocString, ParsedFeature } from "@effect-cucumber/gherkin"
import { describeFeature } from "@effect-cucumber/vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

declare const feature: ParsedFeature

describeFeature(feature, Layer.empty, ({ Given, Then, When }) => {
  // THE CORRECT FORM, first, so the two sit side by side in one file.
  Given("the cart contains:", function*(table: DataTable) {
    yield* Effect.sync(() => table.raw().length)
  })

  // WRONG ANNOTATION, ACCEPTED.
  When("the cart contains a wrongly annotated table:", function*(table: string) {
    yield* Effect.sync(() => table.toUpperCase())
  })

  Then("the note reads:", function*(note: DataTable) {
    yield* Effect.sync(() => note.raw().length)
  })

  // MISSING ANNOTATION, ALSO ACCEPTED, and this is the quieter of the two failures: the `.feature` step carries a
  // table, the body declares no parameter for it, and the argument is simply dropped.
  Given("the cart contains a table this body ignores:", function*() {
    yield* Effect.void
  })

  // The inverse — a body declaring a trailing parameter for a step that carries NO argument.
  Then("a step with no argument at all", function*(absent: DocString) {
    yield* Effect.sync(() => absent.content.length)
  })
})

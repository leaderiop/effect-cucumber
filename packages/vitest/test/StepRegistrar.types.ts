/**
 * Type-level assertions for `StepRegistrar` / `StepParams` (BEH-EC-003, Dsl.ts note (d)). Compiled
 * by `pnpm typecheck:test`, never run. Every `@ts-expect-error` is load-bearing: removing the
 * `StepArgs` constraint from `StepParams` turns each one into an unused-directive error.
 */
import type { DataTable, DocString } from "@effect-cucumber/gherkin"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import type { FeatureDsl, StepParams } from "../src/Dsl.ts"

class World extends Context.Service<World, { readonly ok: boolean }>()("StepRegistrar.types/World") {}

type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false
const assertType = <_T extends true>(): void => {}

// The tuple itself.
assertType<Equals<StepParams<"I have {int} apples">, [number, ...ReadonlyArray<any>]>>()
assertType<Equals<StepParams<"{int} kg of {word}">, [number, string, ...ReadonlyArray<any>]>>()
assertType<Equals<StepParams<"{} and {biginteger}">, [string, bigint, ...ReadonlyArray<any>]>>()
assertType<Equals<StepParams<"literal \\{int} b">, [...ReadonlyArray<any>]>>()
assertType<Equals<StepParams<"I pay {money}">, [any, ...ReadonlyArray<any>]>>()

export const use = (dsl: FeatureDsl<World>): void => {
  // An unannotated hole is `number`, not `any`: assigning it to `string` is rejected.
  dsl.Given("I have {int} apples", function*(count) {
    // @ts-expect-error `count` is number, not string
    const wrong: string = count
    const right: number = count
    yield* Effect.void
    return [wrong, right]
  })

  // A wrong annotation on a hole is a compile error.
  // @ts-expect-error `{int}` is number; annotating it string is rejected
  dsl.Given("I have {int} apples", function*(count: string) {
    yield* Effect.void
    return count
  })

  // `{word}` is string; `{float}` is number; both branches (generator and Effect) see the same tuple.
  dsl.When("I weigh {float} kg of {word}", function*(weight, item) {
    const w: number = weight
    const i: string = item
    yield* Effect.void
    return [w, i]
  })
  dsl.When(
    "I weigh {float} kg of {word}",
    Effect.fn("weigh")(function*(weight: number, item: string) {
      yield* Effect.void
      return [weight, item]
    })
  )

  // A custom parameter type's hole is `any`, so the author's own annotation types it.
  dsl.Then("I pay {money}", function*(amount: bigint) {
    yield* Effect.void
    return amount
  })

  // The trailing DataTable/DocString parameter is annotatable on a zero-hole pattern, and after
  // the holes on a pattern that has them.
  dsl.Given("the cart contains:", function*(table: DataTable) {
    yield* Effect.void
    return table.raw()
  })
  dsl.Given("the note for {int} reads:", function*(id, note: DocString) {
    const n: number = id
    yield* Effect.void
    return [n, note.content]
  })

  // The ambient-Layer check is unchanged: a service the Layer provides is reachable.
  dsl.Then("the world is ok", function*() {
    const { ok } = yield* World
    return ok
  })
}

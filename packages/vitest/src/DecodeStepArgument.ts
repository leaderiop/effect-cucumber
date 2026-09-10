/**
 * ADR-EC-057: `wrapWithDecode`, shared by `Collect.ts`'s own `Given`/`When`/`Then` registrar AND
 * `StepModule.ts`'s (ADR-EC-027 typed step modules get the same overload symmetrically — a module
 * step's own `Dsl.ts` type is `ScenarioDsl<R>`, identical to a Feature/Rule/Scenario-level step's).
 */
import { decodeDocString, decodeHashes } from "@effect-cucumber/gherkin"
import * as Effect from "effect/Effect"
import * as Predicate from "effect/Predicate"
import type { DecodeStepArgument } from "./Dsl.ts"
import type { StepBody } from "./Plan.ts"

/**
 * Wrap an already-`Step.ts`-normalised body so it decodes the step's own DataTable/DocString
 * argument through `decode`'s `Schema` BEFORE calling `fn`, replacing the raw wrapper in place with
 * the decoded value rather than appending it — `fn` receives exactly the parameter count and shape
 * it declared. Runs OUTSIDE `fn`'s own `Effect.fn(pattern)` span (the caller normalises `fn` through
 * `Step.ts`'s `register` before handing it here): decode is a distinct pre-processing phase, not part
 * of the step's own named unit of work, mirroring `ScenarioEffect.ts`'s `withStepFailureLocation`
 * sitting outside that span too.
 *
 * Finds the raw argument by `_tag` (`"DataTable"`/`"DocString"`) rather than by position: `StepParams`'s
 * DataTable/DocString slot is an unchecked tail whose exact index depends on the pattern's own
 * capture count, which this function has no reason to re-derive. A step that declares `decode` but
 * whose matched Pickle step carries no matching argument finds none, decodes `undefined`, and dies
 * with the SAME defect a hand-written `yield* decodeHashes(...)(undefined as any)` already would —
 * this function invents no new failure mode for that author mistake.
 */
export const wrapWithDecode = (decode: DecodeStepArgument<any>, fn: StepBody): StepBody => {
  const isTable = "table" in decode
  const tag = isTable ? "DataTable" : "DocString"

  return (...params: ReadonlyArray<any>) => {
    const index = params.findIndex((p) => {
      if (!Predicate.hasProperty(p, "_tag")) return false
      const { _tag } = p
      return _tag === tag
    })
    const raw = index === -1 ? undefined : params[index]
    const decoded: Effect.Effect<any, unknown, any> = isTable
      ? decodeHashes(decode.table)(raw as never)
      : decodeDocString(decode.docstring)(raw as never)
    return Effect.flatMap(decoded, (value) => {
      const next = params.slice()
      next[index] = value
      return fn(...next)
    })
  }
}

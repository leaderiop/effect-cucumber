/**
 * A step's DocString and DataTable arguments, wrapped and returned in the order their author wrote them.
 *
 * Separate from `DataTable.ts` (one table and its accessors) because this is about a STEP's arguments as an
 * ordered set, with no failure surface — every function here is total. The result is an ordered ARRAY, not a
 * `{ docString, dataTable }` record, because the step-body signature spreads it after the cucumber-expression
 * arguments (`packages/vitest/src/Plan.ts`) and a record has no order. `ParsedStep.argument` stays the RAW
 * `PickleStepArgument`; `stepArguments` is an additional field, both produced once in `Correlate.ts`
 * (`test/Correlate.test.ts` asserts the raw field carries no accessor).
 */
import type { PickleStepArgument } from "@cucumber/messages"
import * as Option from "effect/Option"
import { type DataTable, makeDataTable } from "./DataTable.ts"

/** A step's DocString argument: plain data (ADR-EC-008 — `content` IS the value). The `_tag` is the discriminant
 * that makes `StepArgument` a real tagged union. */
export interface DocString {
  readonly _tag: "DocString"
  /** The DocString body, exactly as `compile()` produced it — placeholder-substituted, undedented. */
  readonly content: string
  /** The content-type written after the opening delimiter; a REQUIRED `Option` field (ADR-EC-022). */
  readonly mediaType: Option.Option<string>
}

/** The two things a step can carry; discriminate on `_tag`, never `in` or `instanceof`. */
export type StepArgument = DocString | DataTable

/** One candidate argument paired with the upstream index that decides where it sorts. */
interface OrderedArgument {
  readonly order: number
  readonly argument: StepArgument
}

/**
 * The sort key, read from `argumentIndex`'s VALUE: upstream writes `1`/`2` only when a step carries both
 * arguments and `undefined` otherwise (`test/upstream-pin.test.ts`), so a key-presence test discriminates nothing.
 */
const orderOf = (argumentIndex: number | undefined): number => argumentIndex ?? 0

/**
 * Wrap a step's raw argument as an ordered list located at `uri`:`line`. Total: `[]` for no argument, one
 * `DocString` or one `DataTable` (via `makeDataTable`, so it carries this step's location), or BOTH ascending by
 * `argumentIndex` — DocString first for F25, DataTable first for its mirror F33 (`test/upstream-pin.test.ts`).
 * `toSorted` is stable, so a tie lands on the fixed DocString-then-DataTable fallback.
 */
export const stepArgumentsOf = (
  argument: PickleStepArgument | undefined,
  uri: string,
  line: number
): ReadonlyArray<StepArgument> => {
  if (argument === undefined) {
    return []
  }

  const { dataTable, docString } = argument
  const candidates: Array<OrderedArgument> = []

  if (docString !== undefined) {
    candidates.push({
      order: orderOf(docString.argumentIndex),
      argument: {
        _tag: "DocString",
        content: docString.content,
        mediaType: Option.fromUndefinedOr(docString.mediaType)
      }
    })
  }

  if (dataTable !== undefined) {
    candidates.push({
      order: orderOf(dataTable.argumentIndex),
      argument: makeDataTable(dataTable, uri, line)
    })
  }

  return candidates.toSorted((left, right) => left.order - right.order).map((candidate) => candidate.argument)
}

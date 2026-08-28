/**
 * A step's DocString and DataTable arguments, wrapped and handed back in the order their author
 * wrote them.
 *
 * Three decisions are recorded here, because none of them is visible from the code that implements
 * them.
 *
 * (a) **This module is separate from `DataTable.ts` deliberately.** `DataTable.ts` is about ONE
 *     table and the three accessors a step body wants from it. This module is about a STEP's
 *     arguments as an ordered set — a different subject, with a different input (`PickleStepArgument`
 *     rather than `PickleTable`) and a different failure surface (none: every function here is
 *     total). Keeping them apart is also what lets `test/DataTable.test.ts` build inline
 *     `PickleTable` literals and parse no `.feature` file at all, so an accessor failure is
 *     attributable to the accessor rather than to the parser.
 *
 * (b) **The result is an ordered ARRAY, not a `{ docString, dataTable }` record.** The roadmap's
 *     success criterion for PARSE-04 is a documented, tested argument ORDER, and a record has no
 *     order — it would push the ordering question onto every consumer and answer it nowhere. Phase
 *     5's step-body signature spreads this array after the cucumber-expression arguments, which
 *     only works if the order is already settled. A record would force each of those call sites to
 *     re-derive the order from `argumentIndex` itself, which is exactly the duplication
 *     `Correlate.ts`'s "do not re-derive what `compile()` already did" rule exists to prevent.
 *
 * (c) **`ParsedStep.argument` stays the RAW `PickleStepArgument`, and `stepArguments` is an
 *     ADDITIONAL field rather than a replacement.** `test/Correlate.test.ts` carries a test
 *     asserting that the raw argument has no `hashes`/`raw`/`rowsHash` property on it; that test
 *     must keep passing, and it does, because the wrapper produced here lives on a different field.
 *     Two fields, one producer each, and neither derived from the other at read time.
 *
 * Local imports: `./DataTable.ts` only. The third-party import reaches the `@cucumber/messages`
 * BARREL, never a deep path into its published build directory — the rule `Model.ts`,
 * `StepMatcher.ts` and `DataTable.ts` already follow.
 */
import type { PickleStepArgument } from "@cucumber/messages"
import * as Option from "effect/Option"
import { type DataTable, makeDataTable } from "./DataTable.ts"

/**
 * A step's DocString argument: plain data, with no accessors and no wrapper around it.
 *
 * [ADR-EC-008](../../../spec/decisions/008-data-tables-and-doc-strings-decode-through-schema.md)'s
 * correction draws the line explicitly — a DataTable needs a wrapper because the accessors a step
 * body wants live in `@cucumber/cucumber` and this package cannot depend on it, while "a doc string
 * is simpler: a step just receives `{ content: string }` (plus optional `mediaType`), a plain
 * field, not an object needing a wrapper". So there is nothing here to call: `content` IS the
 * value.
 *
 * The `_tag` exists anyway, and it is not a hint that methods are coming. It is the discriminant
 * that makes `StepArgument` a real tagged union, so a consumer narrows with a plain
 * `switch (argument._tag)` rather than probing for a property that happens to be present on one arm.
 */
export interface DocString {
  readonly _tag: "DocString"
  /** The DocString body, exactly as `compile()` produced it — placeholder-substituted, undedented. */
  readonly content: string
  /**
   * The content-type annotation written after the opening delimiter (`"""text/plain`), absent when
   * the author wrote none.
   *
   * A REQUIRED field holding an `Option`, never a TS-optional one declared with a question mark.
   * [ADR-EC-022](../../../spec/decisions/022-option-replaces-undefined-in-gherkins-public-api.md)
   * put this package's whole public surface on `Option<T>`; a TS-optional field here would
   * reintroduce precisely the `exactOptionalPropertyTypes` asymmetry that ADR removed, in the one
   * place a reader is least likely to look for it.
   */
  readonly mediaType: Option.Option<string>
}

/**
 * The two things a `.feature` step can carry as an argument.
 *
 * Both arms carry a literal `_tag`, so a consumer discriminates with a plain `switch` on it and
 * never with an `in` probe or an `instanceof` — the latter would be wrong twice over, since neither
 * arm is a class instance.
 */
export type StepArgument = DocString | DataTable

/** One candidate argument paired with the upstream index that decides where it sorts. */
interface OrderedArgument {
  readonly order: number
  readonly argument: StepArgument
}

/**
 * The sort key for one argument, read from `argumentIndex`'s VALUE.
 *
 * Upstream writes a NUMBER (`1` and `2`, in source order) only when a step carries BOTH a DocString
 * and a DataTable — fixtures F25 and F33, pinned in `test/upstream-pin.test.ts`. When a step carries
 * only one argument the key is still written, with the value `undefined`: `compile()`'s
 * `pickleDocString()` and `pickleTable()` are unconditional object literals and
 * `createPickleArguments()` calls them with no index in the single-argument branches (fixtures F29,
 * F30 and F31).
 *
 * So this reads the VALUE and falls back. A key-presence test — own-property or `in` — is `true` for
 * every step ever pickled and would therefore discriminate nothing at all, which is the trap
 * `test/fixtures/README.md`'s Group E paragraph was written to close.
 */
const orderOf = (argumentIndex: number | undefined): number =>
  Option.getOrElse(Option.fromUndefinedOr(argumentIndex), () => 0)

/**
 * Wrap a step's raw argument as an ordered list of `StepArgument`s located at `uri`:`line`.
 *
 * Total — it has no failure mode, which is why it returns a plain array rather than an `Effect`.
 * Four cases, all of them reachable from a real `.feature` file:
 *
 * - **No argument** returns `[]`. Not `Option.none()`, and not a one-element array holding a
 *   placeholder: an empty array is the honest representation of "this step carries nothing", and it
 *   is the one a consumer can spread unconditionally without asking first.
 * - **A DocString alone** returns one `DocString`, its `mediaType` absent unless the author wrote
 *   one.
 * - **A DataTable alone** returns one `DataTable`, built by `makeDataTable` so it carries this
 *   step's own `uri` and `line` into every error it will ever raise.
 * - **Both** returns BOTH, ascending by `argumentIndex` — so F25 (DocString first in the source)
 *   yields DocString then DataTable, and F33, its byte-mirror, yields the inverse.
 *
 * The candidate list below is built in the fixed order DocString-then-DataTable and then reordered.
 * That fixed order is a safety net, not a competing convention: it survives the reorder only when
 * the list has ONE element, or when both indices tie at the fallback `0` — and upstream always
 * assigns both indices when both arguments exist, which is the fact `test/upstream-pin.test.ts`
 * asserts against the real `@cucumber/gherkin@42.0.1`. `toSorted` is used rather than the mutating
 * in-place alternative for two reasons: oxlint's `unicorn(no-array-sort)` is error-level, and the
 * candidates are derived from readonly upstream data that nothing here should be reordering in
 * place. `toSorted` is a stable sort, which is what makes the tie case land on the documented
 * fallback order rather than on an arbitrary one.
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

/**
 * Shared `StepPatternError` message-building helpers, used by both `ParameterTypes.ts` and
 * `StepMatcher.ts`.
 *
 * Kept here, not in either module, so `StepMatcher.ts` can go on not importing
 * `./ParameterTypes.ts` (see that module's doc comment (d), which keeps the module DAG a DAG and
 * `StepMatcher.ts` independently testable against a hand-built registry) while both still share
 * one name-formatting convention and one `StepPatternError`-raising shape instead of two
 * independently-maintained copies.
 *
 * Local imports: `./Errors.ts` only.
 */
import * as Option from "effect/Option"
import { StepPatternError, type StepPatternErrorReason } from "./Errors.ts"

/** Name a parameter type the way a step pattern would spell it. */
export const describeParameterTypeName = (name: string): string =>
  name === "" ? "the anonymous {} parameter type" : `{${name}}`

/**
 * Raise a `StepPatternError` shaped `<reason>: <what happened, then what to do>`, matching the
 * message convention `Validate.ts` established for `LoadFeatureError`.
 *
 * This function's own arguments stay plain, omittable `T | undefined` — `raiseStepPatternError`
 * is not exported from `index.ts`, so it is an internal convenience for `ParameterTypes.ts` and
 * `StepMatcher.ts`, not part of the public surface `Errors.ts`'s `Option<T>` scope covers. The
 * conversion to `Option` happens right here, once, at construction — `Errors.ts`'s
 * `StepPatternError` requires it: `parameterTypeName`/`pattern`/`cause` are `Option<T>` fields
 * whose constructor key cannot be omitted (see `Errors.ts`'s doc comment).
 */
export const raiseStepPatternError = (args: {
  reason: StepPatternErrorReason
  parameterTypeName?: string
  pattern?: string
  sentences: ReadonlyArray<string>
  cause?: unknown
}): never => {
  throw new StepPatternError({
    reason: args.reason,
    parameterTypeName: Option.fromUndefinedOr(args.parameterTypeName),
    pattern: Option.fromUndefinedOr(args.pattern),
    message: `${args.reason}: ${args.sentences.join(" ")}`,
    cause: args.cause
  })
}

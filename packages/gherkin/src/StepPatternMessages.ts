/**
 * Shared `StepPatternError` message helpers for `ParameterTypes.ts` and `StepMatcher.ts`, kept here so
 * `StepMatcher.ts` never imports `./ParameterTypes.ts` (the module DAG stays a DAG).
 */
import * as Option from "effect/Option"
import { StepPatternError, type StepPatternErrorReason } from "./Errors.ts"

/** Name a parameter type the way a step pattern would spell it. */
export const describeParameterTypeName = (name: string): string =>
  name === "" ? "the anonymous {} parameter type" : `{${name}}`

/** Raise a `StepPatternError` shaped `<reason>: <what happened, then what to do>`. Arguments stay plain
 * `T | undefined` (internal helper); the lift to `Option` happens once, here. */
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

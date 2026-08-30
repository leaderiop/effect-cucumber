/**
 * The MATCH-01 type test: `{int}` is `number`, `{float}` is `number`, `{string}` is `string` and
 * `{word}` is `string` — asserted at COMPILE TIME, which is the only place the claim exists.
 *
 * The `.types.ts` suffix is load-bearing. vitest's default include glob is
 * `**\/*.{test,spec}.?(c|m)[jt]s?(x)`, so this file is never collected as a suite — renaming it
 * to `StepArgs.test.ts` would make `pnpm test` fail with "No test suite found". Meanwhile
 * `packages/gherkin/tsconfig.test.json` has `include: ["src", "test"]`, so `pnpm typecheck:test`
 * — a required step in `.github/workflows/check.yml`'s `types` job since plan 01-06 — compiles
 * it on every push. The file therefore runs in CI without pretending to be a runtime suite.
 * `packages/vitest/test/tsgo-gate/src/missing-layer-context.ts` is the repo's precedent for a
 * compiled-but-never-executed probe.
 *
 * Two properties keep this file from being vacuous, and both were proven by mutation (recorded
 * in `.planning/phases/03-parameter-types-and-step-matching/03-02-SUMMARY.md`):
 *
 * (a) The positives assert exact type EQUALITY, not assignability. An assignability check would
 *     pass for a `StepArgs` that resolved every parameter to `unknown` — that is, for a
 *     `StepArgs` that had stopped doing its job entirely.
 *
 * (b) The negatives are `@ts-expect-error` lines, which fail the build when the error they
 *     expect STOPS occurring. They are what catches the other degenerate direction, a `StepArgs`
 *     that resolved everything to the top-of-both-worlds type and made every positive pass.
 *
 * Nothing in this file may be widened with a type assertion: one such escape hatch anywhere
 * makes the surrounding equality assertion prove nothing.
 */
import type { BuiltInParameterTypeMap, StepArgs } from "../src/StepArgs.ts"

/**
 * Exact type equality. The two conditional types are only mutually assignable when `A` and `B`
 * are identical to the checker, which is stricter than `A extends B && B extends A` — the latter
 * cannot tell `unknown` from `unknown | string`, and treats `any` as equal to everything.
 */
type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false

/** Produces a value of the equality verdict so it can be handed to `expectTrue`. */
declare function equality<A, B>(): Equals<A, B>

/** Accepts only the literal `true`. A `false` verdict fails here, naming the const below it. */
const expectTrue = (verdict: true): true => verdict

//
// Positive assertions — one named const each, so a failure names itself.
//

/** MATCH-01: `{int}` coerces to `number`. */
export const intIsNumber = expectTrue(equality<StepArgs<"I have {int} cukes">, [number]>())

/** MATCH-01: `{float}` coerces to `number`. */
export const floatIsNumber = expectTrue(equality<StepArgs<"I paid {float} euros">, [number]>())

/** MATCH-01: `{string}` coerces to `string`, quotes already stripped by the transform. */
export const stringIsString = expectTrue(equality<StepArgs<"my name is {string}">, [string]>())

/** MATCH-01: `{word}` coerces to `string`. */
export const wordIsString = expectTrue(equality<StepArgs<"the {word} is red">, [string]>())

/** Arguments arrive left to right, in pattern order, with no reordering or deduplication. */
export const multipleParametersKeepPatternOrder = expectTrue(
  equality<
    StepArgs<"I have {int} cukes and {float} kg of {word} named {string}">,
    [number, number, string, string]
  >()
)

/** A pattern with no brace pair takes no arguments — the empty tuple, not `never[]`. */
export const noParametersIsEmptyTuple = expectTrue(equality<StepArgs<"no parameters here">, []>())

/** A verified optional group contributes no argument: `apple(s)` is grouping, not a parameter. */
export const optionalGroupAddsNoArgument = expectTrue(equality<StepArgs<"I have {int} cuke(s)">, [number]>())

/** A verified alternation contributes no argument: `happy/sad` is grouping, not a parameter. */
export const alternationAddsNoArgument = expectTrue(equality<StepArgs<"I am happy/sad">, []>())

/**
 * A backslash before the opening brace makes the parameter literal text upstream — the pattern
 * compiles to `/^literal a \{int\} b$/`, pinned in `test/expressions-pin.test.ts` — so it
 * contributes no argument. The doubled backslash below is the TypeScript escape for the single
 * backslash that is actually in the pattern.
 */
export const escapedParameterAddsNoArgument = expectTrue(equality<StepArgs<"literal a \\{int} b">, []>())

/** The anonymous built-in, written `{}`, whose registry name is the empty string. */
export const anonymousParameterIsString = expectTrue(equality<StepArgs<"count {}">, [string]>())

/** Counterintuitive but verified: `{biginteger}` is a `bigint`, not a `number`. */
export const bigintegerIsBigint = expectTrue(equality<StepArgs<"balance {biginteger}">, [bigint]>())

/** Counterintuitive but verified: `{bigdecimal}` is a `string`, not a `number`. */
export const bigdecimalIsString = expectTrue(equality<StepArgs<"balance {bigdecimal}">, [string]>())

/**
 * An unregistered custom name resolves to `unknown` rather than failing to compile. A custom
 * parameter type is runtime data; its transform's return type is unrecoverable from a literal.
 */
export const unregisteredNameIsUnknown = expectTrue(equality<StepArgs<"I pay {money}">, [unknown]>())

/** The escape hatch: a caller who knows the custom type can declare it and get it back typed. */
export const customMapNarrowsUnknown = expectTrue(
  equality<
    StepArgs<"I pay {money}", { money: { amount: number; currency: string } }>,
    [{ amount: number; currency: string }]
  >()
)

/**
 * A custom map may NOT shadow a built-in name — the built-in wins, mirroring the runtime rule
 * that `defineParameterType` rejects a name already registered.
 */
export const customMapCannotShadowBuiltIn = expectTrue(
  equality<StepArgs<"I have {int} apples", { int: string }>, [number]>()
)

/** The map itself, read directly, so a broken entry fails here as well as through `StepArgs`. */
export const builtInIntEntryIsNumber = expectTrue(equality<BuiltInParameterTypeMap["int"], number>())

/** The anonymous built-in's key really is the empty string. */
export const builtInAnonymousEntryIsString = expectTrue(equality<BuiltInParameterTypeMap[""], string>())

/**
 * The result must be a genuine TUPLE, usable as a rest-parameter list. This assignment fails to
 * compile if `StepArgs` ever widens to an array type — the exact regression Phase 5's `Given`
 * signature cannot survive, because a widened `unknown[]` would erase every step body's
 * parameter types while leaving the equality assertions above intact.
 */
type TwoArgumentStepBody = (...args: StepArgs<"I have {int} cukes and {word} left">) => void

/** Explicit parameter annotations, so the tuple's element types and order are both asserted. */
export const restParametersFormATuple: TwoArgumentStepBody = (_count: number, _fruit: string): void => {}

//
// BEH-EC-016's step-body-signature REQUIREMENT: a DataTable is APPENDED positionally and is NOT
// inferred from the pattern. Pinned here rather than in `packages/vitest` because the claim is
// about what `StepArgs` does — and specifically about what it must keep NOT doing.
//

/**
 * A pattern carrying a table contributes NO extra element, and that is the requirement rather than
 * a shortfall. `StepArgs<P>` reads the pattern LITERAL, and a pattern literal cannot express a
 * table's presence: a DataTable is everything BELOW the step text a pattern is matched against, so
 * there is no brace token for it and deliberately none. The Gherkin text
 *
 *     Given the cart contains:
 *       | item   | price |
 *
 * has the pattern `"the cart contains:"`, whose literal is indistinguishable from that of a step
 * carrying nothing at all. So the tuple is empty, the runtime argument is real, and the gap between
 * them is closed by the author's own annotation and by nothing else.
 */
export const aTableIsNotInferredFromThePattern = expectTrue(equality<StepArgs<"the cart contains:">, []>())

/**
 * The appended-not-prepended half, which is the one with a silent failure mode. `{int}` stays at
 * index 0 and a table lands after it, so `StepArgs` continues to report each pattern argument at
 * the index it actually arrives at. Were the delivery changed to PREPEND, every inferred parameter
 * would shift by one while this equality kept passing unchanged — the tuple below is what a reader
 * must compare the step body's real parameter list against, and `packages/vitest/src/Plan.ts` note
 * (h) is where the ordering is argued.
 */
export const patternArgumentsKeepTheirIndicesBesideATable = expectTrue(
  equality<StepArgs<"{int} rows of the cart contain:">, [number]>()
)

declare const tableStepArguments: StepArgs<"the cart contains:">

// @ts-expect-error a table contributes no tuple element, so there is nothing at index 0 to annotate
export const aTableIsNotTupleElementZero: [unknown] = tableStepArguments

//
// Negative assertions. `@ts-expect-error` fails the build when the expected error stops
// occurring, which is what makes the positives above non-vacuous.
//

declare const intArguments: StepArgs<"I have {int} cukes">
declare const stringArguments: StepArgs<"my name is {string}">
declare const twoIntArguments: StepArgs<"a {int} b {int}">
declare const zeroArguments: StepArgs<"no parameters here">
declare const bigintegerEntry: BuiltInParameterTypeMap["biginteger"]
declare const escapedArguments: StepArgs<"literal a \\{int} b">

// @ts-expect-error {int} resolves to number, never to string
export const intIsNotString: [string] = intArguments

// @ts-expect-error {string} resolves to string, never to number
export const stringIsNotNumber: [number] = stringArguments

// @ts-expect-error two brace pairs produce arity 2, not arity 1
export const twoParametersAreNotOne: [number] = twoIntArguments

// @ts-expect-error a pattern with no brace pair produces arity 0, not arity 1
export const zeroParametersAreNotOne: [number] = zeroArguments

// @ts-expect-error the verified type of {biginteger} is bigint, not number
export const bigintegerIsNotNumber: number = bigintegerEntry

// @ts-expect-error the backslash escape suppressed the element, so there is nothing to assign
export const escapedParameterIsNotNumber: [number] = escapedArguments

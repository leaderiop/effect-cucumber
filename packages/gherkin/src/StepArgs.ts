/**
 * The type-level counterpart of cucumber-expression argument coercion: `StepArgs<P>` maps a pattern literal's
 * `{holes}` to the tuple a step body receives, and `@effect-cucumber/vitest`'s `StepRegistrar` (`StepParams<P>`)
 * threads it into the body, so `"I have {int} cukes"` receives `(count: number)` and a `string` annotation is
 * rejected. That is also why a Scenario Outline needs no separate typed-row mechanism.
 *
 * Every `BuiltInParameterTypeMap` entry is pinned against the installed package by
 * `test/expressions-pin.test.ts`; move both together. An unrecognised `{name}` resolves to `unknown`, never a type
 * error — a custom type's transform type cannot be recovered from a literal — and the `Custom` parameter narrows
 * it (the vitest DSL passes `Record<string, any>`, so a custom hole is `any` there and the author's annotation
 * types it). The recursion walks BRACE PAIRS, not characters: a per-character walk hits `TS2589` on a realistic
 * pattern. Types only; no runtime value and no import.
 */

/** The eleven built-ins every fresh registry pre-registers, mapped to what their transform produces
 * (`test/expressions-pin.test.ts`). */
export interface BuiltInParameterTypeMap {
  /** `{int}` — BEH-EC-015 names this one. Verified `number`. Does not match `5.5`. */
  readonly int: number
  /** `{float}` — BEH-EC-015 names this one. Verified `number`, and it also matches integer text (`"v 5"` yields `5`). */
  readonly float: number
  /** `{word}` — BEH-EC-015 names this one. Verified `string`. Matches a single unquoted word. */
  readonly word: string
  /** `{string}` — BEH-EC-015 names this one. Verified `string`, with the surrounding quotes already stripped. */
  readonly string: string
  /** `{double}` — verified `number`. */
  readonly double: number
  /** `{bigdecimal}` — a `string`, so arbitrary-precision decimals survive. */
  readonly bigdecimal: string
  /** `{byte}` — verified `number`. Upstream applies no range check; the type is plain `number`. */
  readonly byte: number
  /** `{short}` — verified `number`. Upstream applies no range check; the type is plain `number`. */
  readonly short: number
  /** `{long}` — verified `number`, NOT `bigint`. Only `{biginteger}` produces a `bigint`. */
  readonly long: number
  /** `{biginteger}` — a `bigint`, the one built-in not comparable with `===` to a numeric literal. */
  readonly biginteger: bigint
  /** The anonymous built-in, written `{}`; its registry name is the empty string. */
  readonly "": string
}

/** A built-in wins, then a caller-supplied custom type, then `unknown`. */
type ResolveParameterType<Name extends string, Custom> = Name extends keyof BuiltInParameterTypeMap
  ? BuiltInParameterTypeMap[Name]
  : Name extends keyof Custom ? Custom[Name]
  : unknown

/**
 * The tuple of argument types for the pattern `P`, left to right — a genuine tuple, usable as a rest parameter.
 * `StepArgs<"I have {int} kg of {word}">` is `[number, string]`; `{money}` is `unknown`, or `bigint` with
 * `Custom = { money: bigint }`; a backslash before the brace escapes the parameter and contributes nothing.
 * Optional groups and alternations contain no brace pair and need no handling.
 *
 * @typeParam P - the cucumber-expression pattern, as a string literal type
 * @typeParam Custom - custom parameter type name to its transform's return type; never shadows a built-in
 */
export type StepArgs<P extends string, Custom extends Record<string, unknown> = Record<never, never>> = P extends
  `${infer Head}{${infer Name}}${infer Tail}` ? Head extends `${string}\\` ? StepArgs<Tail, Custom>
  : [ResolveParameterType<Name, Custom>, ...StepArgs<Tail, Custom>]
  : []

/**
 * The type-level counterpart of cucumber-expression argument coercion.
 *
 * `StepMatcher` extracts a step's arguments at runtime; nothing in the type system says that
 * `{int}` means `number`. `StepArgs<P>` is that mapping, derived from the pattern string
 * literal alone. `@effect-cucumber/vitest`'s `StepRegistrar` (`Dsl.ts`, `StepParams<P>`) threads
 * it into the step body, so a body registered against `"I have {int} cukes"` receives
 * `(count: number)` at compile time, and a body annotating that parameter `string` is rejected.
 * That is the type-level half of MATCH-01, and it is also the reason DSL-06 needs no separate
 * typed "example row" mechanism: `compile()` substitutes an `Examples` value into the step
 * text, the same cucumber-expression then coerces it, and this map is what tells the compiler
 * what came out. See `spec/decisions/007-cucumber-expressions-for-step-matching.md`.
 *
 * Three things about this module that are not visible from the code.
 *
 * (a) Every entry of `BuiltInParameterTypeMap` was VERIFIED by executing the installed
 *     `@cucumber/cucumber-expressions@20.1.0` and reading `typeof Argument.getValue(undefined)`
 *     back — none of them is a guess, and three of them are not the intuitive answer. The same
 *     eleven facts are pinned against the real package in `test/expressions-pin.test.ts`
 *     (plan 03-01). This map and that pin are a matched pair: an upstream change that moves one
 *     must move the other in the same commit, or the type system starts telling a lie the
 *     runtime does not back up.
 *
 * (b) An unrecognised `{name}` resolves to `unknown`, NOT to a type error. A custom parameter
 *     type is registered as runtime data on a `ParameterTypeStore`; nothing about its
 *     transform's return type can be recovered from a pattern string literal. Failing to
 *     compile would make every custom type unusable, so the honest answer is `unknown`, and the
 *     `Custom` type parameter is the escape hatch for a caller who wants it narrowed. The vitest
 *     DSL passes `Record<string, any>` as `Custom`, so a custom hole is `any` there and the step
 *     author's own annotation types it — `unknown` would reject that annotation under
 *     strictFunctionTypes. Built-ins deliberately win over `Custom`, mirroring the runtime rule
 *     that a custom parameter type may never shadow a built-in name.
 *
 * (c) The recursion below walks BRACE PAIRS, not characters. A per-character formulation
 *     (`P extends `${infer C}${infer Rest}``) exhausts TypeScript's instantiation depth
 *     (`TS2589`) on a realistic step pattern of a few dozen characters. Do not "simplify" it
 *     into a character walk.
 *
 * This module contains types only: no `const`, no function, no runtime value at all. It also
 * imports nothing — not `./Errors.ts`, not `@cucumber/cucumber-expressions`, nothing — so this
 * file is a leaf of the package's module DAG alongside `Errors.ts`, and the emitted
 * `dist/StepArgs.js` carries ZERO statements: it is this comment, the bare `export {}` that
 * `moduleDetection: "force"` requires of every file, and the sourcemap pragma. If a runtime
 * statement ever appears in that emit, something was added here that does not belong.
 */

/**
 * The eleven parameter types every `new ParameterTypeRegistry()` pre-registers, mapped to the
 * TypeScript type their transform actually produces.
 *
 * The key set is closed by upstream, not by us: it is exactly the set pinned in
 * `test/expressions-pin.test.ts`.
 */
export interface BuiltInParameterTypeMap {
  /** `{int}` — MATCH-01 names this one by ID. Verified `number`. Does not match `5.5`. */
  readonly int: number
  /** `{float}` — MATCH-01 names this one by ID. Verified `number`, and it also matches integer text (`"v 5"` yields `5`). */
  readonly float: number
  /** `{word}` — MATCH-01 names this one by ID. Verified `string`. Matches a single unquoted word. */
  readonly word: string
  /** `{string}` — MATCH-01 names this one by ID. Verified `string`, with the surrounding quotes already stripped. */
  readonly string: string
  /** `{double}` — verified `number`. */
  readonly double: number
  /**
   * `{bigdecimal}` — verified `string`, NOT `number`. Upstream returns the raw text so that
   * arbitrary-precision decimals survive; a `number` here would be a silent lie about precision.
   */
  readonly bigdecimal: string
  /** `{byte}` — verified `number`. Upstream applies no range check; the type is plain `number`. */
  readonly byte: number
  /** `{short}` — verified `number`. Upstream applies no range check; the type is plain `number`. */
  readonly short: number
  /** `{long}` — verified `number`, NOT `bigint`. Only `{biginteger}` produces a `bigint`. */
  readonly long: number
  /**
   * `{biginteger}` — verified `bigint`, NOT `number` and NOT `string`. This is the one built-in
   * whose value cannot be compared with `===` against a numeric literal.
   */
  readonly biginteger: bigint
  /**
   * The anonymous built-in, written `{}` in a pattern. Its registry name is the EMPTY STRING,
   * which is why this key looks odd. Verified `string`: the anonymous type applies no transform.
   */
  readonly "": string
}

/**
 * Resolve one `{name}` to its argument type.
 *
 * Precedence is deliberate and mirrors the runtime: a built-in wins, then a caller-supplied
 * custom type, then `unknown` for a name nothing knows about.
 */
type ResolveParameterType<Name extends string, Custom> = Name extends keyof BuiltInParameterTypeMap
  ? BuiltInParameterTypeMap[Name]
  : Name extends keyof Custom ? Custom[Name]
  : unknown

/**
 * The tuple of argument types a step body receives for the cucumber-expression pattern `P`,
 * left to right.
 *
 * ```ts
 * type A = StepArgs<"I have {int} cukes">                    // [number]
 * type B = StepArgs<"I have {int} kg of {word}">             // [number, string]
 * type C = StepArgs<"literal a \\{int} b">                   // []      — escaped
 * type D = StepArgs<"I pay {money}">                         // [unknown]
 * type E = StepArgs<"I pay {money}", { money: bigint }>      // [bigint]
 * ```
 *
 * The result is a genuine tuple, not an array, so it is usable directly as a rest-parameter
 * list — `(...args: StepArgs<P>) => void` is the shape Phase 5's `Given` signature needs, and a
 * widening to `unknown[]` would silently destroy every step body's parameter types.
 *
 * Escaping: a backslash immediately before the opening brace makes the parameter literal text
 * upstream (`"a \{int} b"` compiles to `/^a \{int\} b$/`), so it contributes NO element here.
 * The escape of an escape (a literal backslash followed by a real parameter) is not modelled;
 * no pattern in this library's own suite needs it, and treating it as escaped is the safe
 * direction — an argument that is missing from the tuple is a compile error at the call site,
 * not a silent mistype.
 *
 * Optional groups and alternations need NO handling and have none: `"apple(s)"` and
 * `"I am happy/sad"` were both verified to produce ZERO arguments, because neither contains a
 * brace pair, while `"I {word} happy/sad"` produces exactly one. Do not add dead handling for
 * parentheses or slashes.
 *
 * @typeParam P - the cucumber-expression pattern, as a string literal type
 * @typeParam Custom - an optional map from custom parameter type name to its transform's return
 * type; it can never shadow a built-in name
 */
export type StepArgs<P extends string, Custom extends Record<string, unknown> = Record<never, never>> = P extends
  `${infer Head}{${infer Name}}${infer Tail}` ? Head extends `${string}\\` ? StepArgs<Tail, Custom>
  : [ResolveParameterType<Name, Custom>, ...StepArgs<Tail, Custom>]
  : []

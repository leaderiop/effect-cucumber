/**
 * Turn an unmatched step's text into a copy-pasteable step-definition fragment (BEH-EC-015, ADR-EC-019), through
 * upstream's `CucumberExpressionGenerator` so `I have 5 apples` suggests `I have {int} apples`.
 *
 * It lives in this package because `@effect-cucumber/vitest` declares no dependency on
 * `@cucumber/cucumber-expressions` and an import of it there fails under pnpm's isolated layout.
 * `TS_TYPE_BY_PARAMETER_TYPE_NAME` is annotated `Record<keyof BuiltInParameterTypeMap, string>` on purpose: a
 * twelfth upstream built-in then fails to compile until `StepArgs.ts` moves with it. `parameterInfos[i].type` is
 * NOT the type source — it says `"Number"` for `{bigdecimal}`, which produces a string.
 *
 * The generator is constructed per call (a registry is per call; this runs once per undefined step). This module
 * builds a STRING only; `JSON.stringify` on the pattern is the one injection control (`test/Snippet.test.ts`
 * mutation A). The one regular expression here tests an identifier's shape, never step text. No `effect` import.
 */
import { CucumberExpressionGenerator, type ParameterTypeRegistry } from "@cucumber/cucumber-expressions"
import type { BuiltInParameterTypeMap } from "./StepArgs.ts"

/** Each built-in's name mapped to the TypeScript type its transform produces, as source text — mirroring
 * `StepArgs.ts`, which the annotation enforces. `bigdecimal` is a string, `biginteger` a bigint. */
const TS_TYPE_BY_PARAMETER_TYPE_NAME: Record<keyof BuiltInParameterTypeMap, string> = {
  int: "number",
  float: "number",
  word: "string",
  string: "string",
  double: "number",
  bigdecimal: "string",
  byte: "number",
  short: "number",
  long: "number",
  biginteger: "bigint",
  /** The anonymous built-in, written `{}` in a pattern; its registry name is the empty string. */
  "": "string"
}

/** The same record widened for lookup by an arbitrary name, so the `?? "unknown"` below is a real branch. */
const tsTypeByName: Readonly<Record<string, string>> = TS_TYPE_BY_PARAMETER_TYPE_NAME

/** An identifier that can stand as a generator parameter. ASCII-only: a false negative costs a positional
 * `arg1`, a false positive an unparseable snippet. */
const identifierShape = /^[A-Za-z_$][A-Za-z0-9_$]*$/

/** Words that pass `identifierShape` but cannot be bound as a parameter name: reserved words (`yield` above
 * all — the body is a generator) plus `eval` and `arguments`, forbidden in strict mode. */
const reservedWords: ReadonlySet<string> = new Set([
  "arguments",
  "await",
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "debugger",
  "default",
  "delete",
  "do",
  "else",
  "enum",
  "eval",
  "export",
  "extends",
  "false",
  "finally",
  "for",
  "function",
  "if",
  "implements",
  "import",
  "in",
  "instanceof",
  "interface",
  "let",
  "new",
  "null",
  "package",
  "private",
  "protected",
  "public",
  "return",
  "static",
  "super",
  "switch",
  "this",
  "throw",
  "true",
  "try",
  "typeof",
  "var",
  "void",
  "while",
  "with",
  "yield"
])

/** Whether `name` can be written straight into the emitted parameter list. */
const isUsableParameterName = (name: string): boolean => identifierShape.test(name) && !reservedWords.has(name)

/**
 * A suggested step definition for `text`: three lines, no trailing newline. `registry` is the Feature's own
 * (`ParsedFeature.parameterTypes`) so custom types generalise too. Only upstream's FIRST candidate is used
 * (most specific first: `{int}` over `{float}`); an empty result falls back to the literal text.
 */
export const generateStepSnippet = (args: {
  readonly keyword: string
  readonly text: string
  readonly registry: ParameterTypeRegistry
}): string => {
  const generator = new CucumberExpressionGenerator(() => args.registry.parameterTypes)
  const generated = generator.generateExpressions(args.text)[0]

  const pattern = generated === undefined ? args.text : generated.source
  const parameterNames = generated === undefined ? [] : generated.parameterNames
  const parameterInfos = generated === undefined ? [] : generated.parameterInfos

  // `parameterNames` is upstream-disambiguated (`int`, `int2`); `parameterInfos[i].name` is the TYPE name.
  const parameters = parameterNames.map((name, index) => {
    const info = parameterInfos[index]
    const tsType = info === undefined ? "unknown" : tsTypeByName[info.name] ?? "unknown"
    const parameterName = isUsableParameterName(name) ? name : `arg${index + 1}`
    return `${parameterName}: ${tsType}`
  })

  return `${args.keyword}(${JSON.stringify(pattern)}, function*(${parameters.join(", ")}) {\n`
    + `  // TODO: implement this step\n`
    + `})`
}

/**
 * Turn an unmatched step's text into a copy-pasteable step-definition fragment.
 *
 * This is the authoring-help half of MATCH-03. `@effect-cucumber/vitest`'s Plan stage is the first
 * and, for now, the only caller: when a Pickle step matches no registered pattern, ADR-EC-019 says
 * the containing Scenario fails naming the step text and its location, and CONTEXT.md D-01 adds
 * that the same error carries a suggested definition the author can paste — cucumber-js's own DX
 * pattern (`.planning/research/PITFALLS.md` Pitfall 15). The generalisation is upstream's:
 * `CucumberExpressionGenerator` turns `I have 5 apples` into `I have {int} apples`, so the
 * suggestion is a real pattern rather than the literal text, which would match one step and no
 * other.
 *
 * Three things about this module that are not visible from the code.
 *
 * (a) **It lives in this package, not in `@effect-cucumber/vitest`, and that is a hard constraint
 *     rather than a preference.** `packages/vitest/package.json` declares only
 *     `@effect-cucumber/gherkin`; under pnpm's isolated node_modules layout an
 *     `import ... from "@cucumber/cucumber-expressions"` inside `packages/vitest` fails at runtime
 *     with `ERR_MODULE_NOT_FOUND` — reproduced during planning, and the same defect as
 *     `.planning/research/PITFALLS.md` Pitfall 16, which has already bitten this repo once. Every
 *     other cucumber-expressions concern (`ParameterTypes.ts`, `StepMatcher.ts`,
 *     `StepPatternMessages.ts`, `StepArgs.ts`) is already here, so putting the generator here keeps
 *     the dependency edge where it is declared and needs no manifest or lockfile change. The two
 *     alternatives — re-exporting upstream's `CucumberExpressionGenerator` class from this
 *     package's barrel, or declaring `@cucumber/cucumber-expressions` a second time in
 *     `packages/vitest` — respectively publish third-party surface and create a version pair
 *     nothing keeps in sync.
 *
 * (b) **`TS_TYPE_BY_PARAMETER_TYPE_NAME` is annotated
 *     `Record<keyof BuiltInParameterTypeMap, string>` on purpose, and dropping that annotation
 *     silently breaks the guarantee this module exists to make.** Without it the record's key set
 *     is whatever happens to be written below, and an upstream release that adds a twelfth built-in
 *     — `@cucumber/cucumber-expressions` is declared `^20.1.0` and free to move within the major —
 *     would produce a snippet annotating the new type `unknown` while `StepArgs.ts` said something
 *     else, or nothing at all. With it, the record, `StepArgs.ts`'s `BuiltInParameterTypeMap` and
 *     `test/expressions-pin.test.ts` are a matched set of three: the pin fails first and names the
 *     dependency, and the type checker then refuses to compile either of the other two until both
 *     move together. That is a compile error instead of a convention.
 *
 *     `parameterInfos[i].type` is deliberately NOT used as the type source even though it looks
 *     like one. It is a JavaScript constructor name (`"Number"`, `"String"`, or `null` for a custom
 *     type), and it is wrong for two built-ins: `{bigdecimal}` reports `"Number"` but produces a
 *     `string`, and `{biginteger}` produces a `bigint`. `StepArgs.ts`'s doc comment (a) records
 *     that every entry of the map below was read back off the running library rather than guessed.
 *
 * (c) **The generator is constructed per call, never memoized — not at module scope and not per
 *     registry.** `Model.ts` records that a `ParameterTypeRegistry` is built fresh for every
 *     `parseFeature` call, and the whole reason `StepMatcher.ts` keys its compilation cache on the
 *     registry INSTANCE is that a cached object bound to a dead registry silently does the wrong
 *     thing. This function runs once per undefined step, on an error path that is about to fail a
 *     Scenario; there is no performance budget here worth defending against that risk.
 *
 * This module builds a STRING and nothing else. It never evaluates the snippet, never writes it to
 * disk, and never hands it to a subprocess — the caller embeds it in an error message, and a
 * developer who pastes it into their own source is making an ordinary, reviewed edit (threat
 * T-06-02-02). The single injection control is `JSON.stringify` on the pattern (threat
 * T-06-02-01): a step text carrying a `"`, a `\` or a newline cannot terminate the emitted string
 * literal or append anything after it. `test/Snippet.test.ts`'s mutation A is the standing proof
 * that removing it fails a test. The one regular expression here is a constant identifier-shape
 * test applied to a parameter type NAME; nothing in this file builds a regexp out of step text.
 *
 * No `effect` import, and there must never be one: this is a pure string builder, which is what
 * keeps `pnpm verify:no-runner-dep` and ADR-EC-021's boundary untouched.
 *
 * Local imports: `./StepArgs.ts` only, and for its types alone. Third-party: the
 * `@cucumber/cucumber-expressions` barrel, never a deep path into that package's published build
 * directory. Exported from `index.ts`.
 */
import { CucumberExpressionGenerator, type ParameterTypeRegistry } from "@cucumber/cucumber-expressions"
import type { BuiltInParameterTypeMap } from "./StepArgs.ts"

/**
 * Each built-in parameter type's name, mapped to the TypeScript type its transform actually
 * produces, spelled as source text.
 *
 * The values mirror `StepArgs.ts`'s `BuiltInParameterTypeMap` exactly, and the annotation is what
 * makes "mirror" enforceable rather than aspirational — see doc comment (b). Three entries are not
 * the intuitive answer and are the reason this cannot be derived from
 * `parameterInfos[i].type`: `bigdecimal` is a `string` so arbitrary-precision decimals survive,
 * `long` is a plain `number`, and `biginteger` alone is a `bigint`.
 */
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

/**
 * The same record, widened so it can be indexed by an arbitrary parameter type name.
 *
 * A separate binding rather than a cast at the call site: the strict annotation above is the whole
 * point of the constant, and a `name as keyof BuiltInParameterTypeMap` assertion at lookup time
 * would assert exactly the thing that is unknown there. With `noUncheckedIndexedAccess` this reads
 * `string | undefined`, so the `?? "unknown"` below is a real branch the compiler checks, not a
 * decoration.
 */
const tsTypeByName: Readonly<Record<string, string>> = TS_TYPE_BY_PARAMETER_TYPE_NAME

/**
 * The shape of an identifier that can stand as a generator function's parameter.
 *
 * ASCII-only on purpose. A JavaScript identifier may contain a great deal more than this, but a
 * parameter type named in anything wider is vanishingly rare and the cost of being wrong in the
 * permissive direction is an emitted snippet that does not parse. Being wrong in the strict
 * direction costs a positional `arg1` instead of a nicer name.
 */
const identifierShape = /^[A-Za-z_$][A-Za-z0-9_$]*$/

/**
 * The words that pass `identifierShape` but cannot be bound as a parameter name.
 *
 * Not defensive padding: `ParameterType.isValidParameterTypeName` rejects only
 * `[ ] ( ) $ . | ? * +` (pinned in `test/expressions-pin.test.ts`), so `{class}`, `{new}` and
 * `{yield}` are all legal parameter types today. `yield` is the sharpest of them — the emitted body
 * is a GENERATOR, where `yield` is unusable as a parameter name even in sloppy mode. `eval` and
 * `arguments` are not reserved words but are forbidden as parameter names in strict mode, which
 * every ES module is (audit finding F-32).
 */
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
 * A suggested step definition for `text`, as three lines of source with no trailing newline.
 *
 * `keyword` is used verbatim as the registrar name, so a caller passes the step's own
 * `Given`/`When`/`Then`. `registry` is the `ParameterTypeRegistry` the Feature was parsed with —
 * `ParsedFeature.parameterTypes` — so a custom parameter type the author registered is generalised
 * alongside the built-ins.
 *
 * Only the FIRST generated expression is used. Upstream returns its candidates most-specific-first,
 * so `I have 5 apples` suggests `{int}` rather than the `{float}` alternative that also matches; a
 * text upstream can generalise no further comes back with the literal text and an empty parameter
 * list. An empty result is handled rather than asserted away (`noUncheckedIndexedAccess` makes the
 * branch explicit): the literal text becomes the pattern, which is a worse suggestion than a
 * generalised one but is never a wrong one.
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

  // `parameterNames` is already disambiguated by upstream (`int`, `int2`); `parameterInfos[i].name`
  // is the undisambiguated TYPE name, and is the key the TypeScript type is looked up by. Neither
  // is re-derived here.
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

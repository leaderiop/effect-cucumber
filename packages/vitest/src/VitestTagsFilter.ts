/**
 * Vendored from `vitest-dev/vitest`'s `@vitest/runner` package (`src/utils/tags.ts`, the source
 * backing the `createTagsFilter`/`validateTags` exports of its published `dist/chunk-artifact.js`,
 * inspected directly from the installed `@vitest/runner@4.1.11` tarball — MIT License, Copyright
 * (c) 2021-Present Vitest Team) — TagExpression.ts's own `createTagsFilter` call, ADR-EC-035's
 * "reuse vitest's own boolean tag-expression grammar" (`and`/`or`/`not`/`&&`/`||`/`!`/parens).
 *
 * WHY THIS EXISTS: `vitest` 5 folded its tag-expression engine INTO the main `vitest` package and
 * no longer publicly exports it from anywhere (verified: absent from `vitest@5.0.0`'s own
 * `dist/index.d.ts` export list). The standalone `@vitest/runner` package this repo used to depend
 * on for it has PUBLISHED NO STABLE VITEST-5 RELEASE AT ALL — its `latest` npm dist-tag is still
 * `4.1.11`, with only betas (`5.0.0-beta.1` .. `5.0.0-beta.4`) past it. Continuing to depend on
 * `@vitest/runner` at a 4.x version, alongside a 5.x `vitest`, would run two independent copies of
 * this exact parser against a mismatched task/tag shape. Vendoring the (small, pure, dependency-free)
 * parser instead removes the coupling entirely: it is plain string/tree logic with no dependency on
 * `@vitest/runner`'s own task types, `vitest`'s runtime, or any Effect module. See
 * `spec/decisions/059-vendor-effect-vitest-and-vitest-runner-tag-filter-for-vitest-5.md`.
 *
 * UNCHANGED from the vendored source except for TypeScript types (the original is untyped JS
 * compiled from Vitest's own internal, unpublished TS sources) and stripping `validateTags`/
 * `createNoTagsError`'s OTHER caller (`vitest`'s own `strictTags` config check, irrelevant here) —
 * `createNoTagsError` itself is kept because `resolveTagPattern` below still throws it.
 *
 * RE-SYNCING: if Vitest ever changes this grammar (`and`/`or`/`not`/`&&`/`||`/`!`/wildcard `*`
 * patterns/parens) in a later major, re-extract this from that version's own `@vitest/runner` (or
 * wherever it lives by then) rather than hand-editing this copy out of sync with Vitest's own
 * behavior — `TagExpression.ts`'s own tests exercise this grammar end-to-end and will catch drift.
 *
 * `scripts/vendor-provenance.json`'s `vitestTagsFilter` entry is this same provenance in
 * machine-readable form, read by the weekly `scripts/verify-vendor-drift.mjs` gate.
 */

/**
 * The subset of a Feature's declared tag universe this parser needs: just the tag's own name.
 * `TagExpression.ts` builds this from `ParsedScenario.tags` (plain strings) via
 * `featureTagUniverse`.
 */
export interface AvailableTag {
  readonly name: string
}

type Token =
  | { readonly type: "TAG"; readonly value: string }
  | { readonly type: "AND" | "OR" | "NOT" | "LPAREN" | "RPAREN" | "EOF" }

type TagNode =
  | { readonly type: "tag"; readonly value: string; readonly pattern: RegExp | null }
  | { readonly type: "not"; readonly operand: TagNode }
  | { readonly type: "and"; readonly left: TagNode; readonly right: TagNode }
  | { readonly type: "or"; readonly left: TagNode; readonly right: TagNode }

function createNoTagsError(availableTags: ReadonlyArray<AvailableTag>, tag: string, prefix = "tag"): never {
  if (!availableTags.length) {
    throw new Error(
      `The Vitest config does't define any "tags", cannot apply "${tag}" ${prefix} for this test. See: https://vitest.dev/guide/test-tags`
    )
  }
  throw new Error(
    `The ${prefix} "${tag}" is not defined in the configuration. Available tags are:\n${
      availableTags.map((t) => `- ${t.name}`).join("\n")
    }`
  )
}

class TokenStream {
  pos = 0
  readonly tokens: ReadonlyArray<Token>
  readonly expr: string
  constructor(tokens: ReadonlyArray<Token>, expr: string) {
    this.tokens = tokens
    this.expr = expr
  }
  peek(): Token {
    return this.tokens[this.pos]!
  }
  next(): Token {
    return this.tokens[this.pos++]!
  }
  expect(type: Token["type"]): Token {
    const token = this.next()
    if (token.type !== type) {
      if (type === "RPAREN" && token.type === "EOF") {
        throw new Error(`Invalid tags expression: missing closing ")" in "${this.expr}"`)
      }
      throw new Error(
        `Invalid tags expression: expected "${formatTokenType(type)}" but got "${formatToken(token)}" in "${this.expr}"`
      )
    }
    return token
  }
  unexpectedToken(): never {
    const token = this.peek()
    if (token.type === "EOF") {
      throw new Error(`Invalid tags expression: unexpected end of expression in "${this.expr}"`)
    }
    throw new Error(`Invalid tags expression: unexpected "${formatToken(token)}" in "${this.expr}"`)
  }
}

function formatToken(token: Token): string {
  switch (token.type) {
    case "TAG":
      return token.value
    default:
      return formatTokenType(token.type)
  }
}

function formatTokenType(type: Token["type"]): string {
  switch (type) {
    case "TAG":
      return "tag"
    case "AND":
      return "and"
    case "OR":
      return "or"
    case "NOT":
      return "not"
    case "LPAREN":
      return "("
    case "RPAREN":
      return ")"
    case "EOF":
      return "end of expression"
  }
}

function tokenize(expr: string): Array<Token> {
  const tokens: Array<Token> = []
  let i = 0
  while (i < expr.length) {
    if (expr[i] === " " || expr[i] === "\t") {
      i++
      continue
    }
    if (expr[i] === "(") {
      tokens.push({ type: "LPAREN" })
      i++
      continue
    }
    if (expr[i] === ")") {
      tokens.push({ type: "RPAREN" })
      i++
      continue
    }
    if (expr[i] === "!") {
      tokens.push({ type: "NOT" })
      i++
      continue
    }
    if (expr.slice(i, i + 2) === "&&") {
      tokens.push({ type: "AND" })
      i += 2
      continue
    }
    if (expr.slice(i, i + 2) === "||") {
      tokens.push({ type: "OR" })
      i += 2
      continue
    }
    if (/^and(?:\s|\)|$)/i.test(expr.slice(i))) {
      tokens.push({ type: "AND" })
      i += 3
      continue
    }
    if (/^or(?:\s|\)|$)/i.test(expr.slice(i))) {
      tokens.push({ type: "OR" })
      i += 2
      continue
    }
    if (/^not\s/i.test(expr.slice(i))) {
      tokens.push({ type: "NOT" })
      i += 3
      continue
    }
    let tag = ""
    while (
      i < expr.length && expr[i] !== " " && expr[i] !== "\t" && expr[i] !== "(" && expr[i] !== ")" &&
      expr[i] !== "!" && expr[i] !== "&" && expr[i] !== "|"
    ) {
      const remaining = expr.slice(i)
      // Only treat and/or/not as operators if we're at the start of a tag (after whitespace)
      // This allows tags like "demand", "editor", "cannot" to work correctly
      if (
        tag === "" &&
        (/^and(?:\s|\)|$)/i.test(remaining) || /^or(?:\s|\)|$)/i.test(remaining) || /^not\s/i.test(remaining))
      ) {
        break
      }
      tag += expr[i]
      i++
    }
    if (tag) {
      tokens.push({ type: "TAG", value: tag })
    }
  }
  tokens.push({ type: "EOF" })
  return tokens
}

function createWildcardRegex(pattern: string): RegExp {
  return new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`)
}

function resolveTagPattern(tagPattern: string, availableTags: ReadonlyArray<AvailableTag>): RegExp | null {
  if (tagPattern.includes("*")) {
    const regex = createWildcardRegex(tagPattern)
    const hasMatch = availableTags.some((tag) => regex.test(tag.name))
    if (!hasMatch) {
      throw createNoTagsError(availableTags, tagPattern, "tag pattern")
    }
    return regex
  }
  if (!availableTags.length || !availableTags.some((tag) => tag.name === tagPattern)) {
    throw createNoTagsError(availableTags, tagPattern, "tag pattern")
  }
  return null
}

function parsePrimaryExpression(stream: TokenStream, availableTags: ReadonlyArray<AvailableTag>): TagNode {
  const token = stream.peek()
  if (token.type === "LPAREN") {
    stream.next()
    const expr = parseOrExpression(stream, availableTags)
    stream.expect("RPAREN")
    return expr
  }
  if (token.type === "TAG") {
    stream.next()
    const tagValue = token.value
    const pattern = resolveTagPattern(tagValue, availableTags)
    return { type: "tag", value: tagValue, pattern }
  }
  stream.unexpectedToken()
}

function parseUnaryExpression(stream: TokenStream, availableTags: ReadonlyArray<AvailableTag>): TagNode {
  if (stream.peek().type === "NOT") {
    stream.next()
    const operand = parseUnaryExpression(stream, availableTags)
    return { type: "not", operand }
  }
  return parsePrimaryExpression(stream, availableTags)
}

function parseAndExpression(stream: TokenStream, availableTags: ReadonlyArray<AvailableTag>): TagNode {
  let left = parseUnaryExpression(stream, availableTags)
  while (stream.peek().type === "AND") {
    stream.next()
    const right = parseUnaryExpression(stream, availableTags)
    left = { type: "and", left, right }
  }
  return left
}

function parseOrExpression(stream: TokenStream, availableTags: ReadonlyArray<AvailableTag>): TagNode {
  let left = parseAndExpression(stream, availableTags)
  while (stream.peek().type === "OR") {
    stream.next()
    const right = parseAndExpression(stream, availableTags)
    left = { type: "or", left, right }
  }
  return left
}

function evaluateNode(node: TagNode, tags: ReadonlyArray<string>): boolean {
  switch (node.type) {
    case "tag":
      if (node.pattern) {
        return tags.some((tag) => node.pattern!.test(tag))
      }
      return tags.includes(node.value)
    case "not":
      return !evaluateNode(node.operand, tags)
    case "and":
      return evaluateNode(node.left, tags) && evaluateNode(node.right, tags)
    case "or":
      return evaluateNode(node.left, tags) || evaluateNode(node.right, tags)
  }
}

function parseTagsExpression(
  expr: string,
  availableTags: ReadonlyArray<AvailableTag>
): (tags: ReadonlyArray<string>) => boolean {
  const tokens = tokenize(expr)
  const stream = new TokenStream(tokens, expr)
  const ast = parseOrExpression(stream, availableTags)
  if (stream.peek().type !== "EOF") {
    throw new Error(`Invalid tags expression: unexpected "${formatToken(stream.peek())}" in "${expr}"`)
  }
  return (tags) => evaluateNode(ast, tags)
}

/**
 * Compile a list of boolean tag-expression strings (`and`/`or`/`not`/`&&`/`||`/`!`/parens/wildcard
 * `*` patterns) into one predicate over a test's own tags — every expression must match (an
 * implicit AND across the array), mirroring `--tagsFilter` accepting a repeatable flag. Throws
 * SYNCHRONOUSLY on a malformed expression, or one naming a tag literal (or pattern with no match)
 * absent from `availableTags`.
 */
export function createTagsFilter(
  tagsExpr: ReadonlyArray<string>,
  availableTags: ReadonlyArray<AvailableTag>
): (testTags: ReadonlyArray<string>) => boolean {
  const matchers = tagsExpr.map((expr) => parseTagsExpression(expr, availableTags))
  return (testTags) => matchers.every((matcher) => matcher(testTags))
}

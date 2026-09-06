// COPYABLE alongside the rule it tests — see ../README.md. Deliberately duplicated rather than
// imported from tools/oxlint/effect/test/utils.ts: a template a consumer copies out of this repo
// must be self-contained, not depend on this repo's own internal test tooling.
import type { CreateRule, Visitor } from "@oxlint/plugins"

export interface ReportedError {
  node: unknown
  message: string
}

export interface TestContextOptions {
  sourceCode?: string
  filename?: string
  cwd?: string
  ruleOptions?: Array<unknown>
}

// Not exported (ADR-EC-051/knip): only `runRule` below, in this same file, calls it. Still copied
// verbatim by a consumer who copies this whole file (see the module doc comment above) — dropping
// the `export` keyword changes nothing about what gets copied or how it behaves.
const createTestContext = (options: TestContextOptions = {}) => {
  const {
    sourceCode = "",
    filename = "/test/file.ts",
    cwd = "/test",
    ruleOptions = []
  } = options

  const errors: Array<ReportedError> = []
  const context = {
    id: "test/rule",
    filename,
    physicalFilename: filename,
    cwd,
    options: ruleOptions,
    getFilename: () => filename,
    getCwd: () => cwd,
    report(reportOptions: ReportedError) {
      errors.push(reportOptions)
    },
    sourceCode: {
      text: sourceCode,
      getText(node?: { range?: [number, number] } | null) {
        if (node?.range) {
          return sourceCode.slice(node.range[0], node.range[1])
        }
        return sourceCode
      }
    }
  }
  return { errors, context }
}

export const runRule = (
  rule: CreateRule,
  visitor: keyof Visitor,
  node: unknown,
  options: TestContextOptions = {}
): Array<ReportedError> => {
  const { context, errors } = createTestContext(options)
  const visitors = rule.create(context as never)
  const handler = visitors[visitor]
  if (handler) {
    ;(handler as (node: unknown) => void)(node)
  }
  return errors
}

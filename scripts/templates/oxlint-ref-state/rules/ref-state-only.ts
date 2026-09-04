// A COPYABLE oxlint rule, not one this repository loads against its own source — see
// scripts/templates/oxlint-ref-state/README.md. Enforces INV-EC-006 / ADR-EC-009 the same way
// scripts/verify-acceptance-ref-state.sh already enforces it over THIS repository's own acceptance
// suite (read that script first if you have not): cross-step Scenario data must survive only
// through a Ref obtained from a Layer-provided service, never a closure variable or an in-place
// mutation. `pnpm test` cannot catch either — a Scenario threading state through a closure or a
// module-scope array passes on a clean run and leaks only across retries and a narrowed `-t`
// selection.
//
// Two checks, each a direct AST translation of the shell-script template's two regexes
// (scripts/templates/verify-consumer-ref-state.sh's DECLARATION_RE and MUTATOR_RE) — same rule,
// now caught at lint time with a real position instead of a `grep -n` line number, and suppressed
// with a standard `// oxlint-disable-next-line` comment instead of a bespoke GATE-ALLOW-MUTATION
// marker.
import type { CallExpression, CreateRule, VariableDeclaration, Visitor } from "@oxlint/plugins"

// Mirrors the shell template's MUTATOR_RE exactly: '\.(push|pop|shift|unshift|splice|sort|reverse|fill)\('
const MUTATOR_METHODS = new Set(["push", "pop", "shift", "unshift", "splice", "sort", "reverse", "fill"])

const rule: CreateRule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow let/var declarations and in-place array/object mutation in step modules — cross-step Scenario state must live in a Ref from a Layer-provided service (INV-EC-006)"
    }
  },
  create(context) {
    return {
      VariableDeclaration(node: VariableDeclaration) {
        if (node.kind !== "let" && node.kind !== "var") return
        context.report({
          node,
          message:
            `Cross-step Scenario state must live in a Ref obtained from a Layer-provided service, never a closure variable (INV-EC-006). A "${node.kind}" declared here passes on a clean run and leaks state across retries and narrowed -t selections. Use "const", and put mutable state behind Ref.make in a Context.Service Layer instead.`
        })
      },
      CallExpression(node: CallExpression) {
        const callee = node.callee
        if (callee.type !== "MemberExpression" || callee.computed) return
        const property = callee.property
        if (property.type !== "Identifier" || !MUTATOR_METHODS.has(property.name)) return
        context.report({
          node,
          message:
            `In-place mutation (.${property.name}(...)) defeats Ref-based cross-step state (INV-EC-006): a mutated array or object is the same reference across every Layer rebuild, so it can never observe per-Scenario freshness the way a fresh Ref.make can. Build a new value with spread and store it via Ref.set instead. If this call is genuinely function-local — created fresh inside a factory, never shared across steps — suppress this one line with a directed "oxlint-disable-next-line" comment explaining why.`
        })
      }
    } as Visitor
  }
}

export default rule

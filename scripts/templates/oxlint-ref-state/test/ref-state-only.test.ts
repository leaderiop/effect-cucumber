import { describe, expect, it } from "vitest"
import rule from "../rules/ref-state-only.ts"
import { runRule } from "./utils.ts"

const declaration = (kind: "let" | "var" | "const") => ({
  type: "VariableDeclaration",
  kind,
  declarations: [{
    type: "VariableDeclarator",
    id: { type: "BindingIdentifier", name: "count" },
    init: { type: "NumericLiteral", value: 0 }
  }]
})

const staticCall = (methodName: string, computed = false) => ({
  type: "CallExpression",
  callee: {
    type: "MemberExpression",
    computed,
    object: { type: "Identifier", name: "items" },
    property: computed
      ? { type: "StringLiteral", value: methodName }
      : { type: "Identifier", name: methodName }
  },
  arguments: []
})

describe("ref-state-only", () => {
  it("reports a let declaration", () => {
    const errors = runRule(rule, "VariableDeclaration", declaration("let"))
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toContain("INV-EC-006")
  })

  it("reports a var declaration", () => {
    const errors = runRule(rule, "VariableDeclaration", declaration("var"))
    expect(errors).toHaveLength(1)
  })

  it("does not report a const declaration", () => {
    const errors = runRule(rule, "VariableDeclaration", declaration("const"))
    expect(errors).toHaveLength(0)
  })

  it("reports .push(...)", () => {
    const errors = runRule(rule, "CallExpression", staticCall("push"))
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toContain("INV-EC-006")
  })

  it("reports .splice(...)", () => {
    const errors = runRule(rule, "CallExpression", staticCall("splice"))
    expect(errors).toHaveLength(1)
  })

  it("reports every mutator method", () => {
    for (const method of ["push", "pop", "shift", "unshift", "splice", "sort", "reverse", "fill"]) {
      const errors = runRule(rule, "CallExpression", staticCall(method))
      expect(errors, `expected .${method}(...) to be reported`).toHaveLength(1)
    }
  })

  it("does not report an unrelated method call", () => {
    const errors = runRule(rule, "CallExpression", staticCall("map"))
    expect(errors).toHaveLength(0)
  })

  it("does not report a computed member call, even with a mutator-shaped property", () => {
    const errors = runRule(rule, "CallExpression", staticCall("push", true))
    expect(errors).toHaveLength(0)
  })

  it("does not report a call with no callee MemberExpression", () => {
    const errors = runRule(rule, "CallExpression", {
      type: "CallExpression",
      callee: { type: "Identifier", name: "push" },
      arguments: []
    })
    expect(errors).toHaveLength(0)
  })
})

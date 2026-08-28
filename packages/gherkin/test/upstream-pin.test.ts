/**
 * Pins the verified behavior of `@cucumber/gherkin@42.0.1` on every fixture in `./fixtures`.
 *
 * This file imports NOTHING from `../src`. It talks to the upstream parser and compiler
 * directly, on purpose: when it fails, a dependency changed its semantics. That separation is
 * what lets a later failure in `Validate.test.ts` be attributed to this library's own code
 * rather than to a bump of `@cucumber/gherkin`.
 *
 * Error classes are discriminated with `instanceof Errors.X` and never with `.name` — every one
 * of them reports `.name === "Error"`, so a `.name` switch silently matches nothing. That fact
 * is itself asserted below, so the day upstream sets `.name` properly we find out here.
 */
import { AstBuilder, compile, Errors, GherkinClassicTokenMatcher, Parser } from "@cucumber/gherkin"
import {
  type Feature,
  type FeatureChild,
  type GherkinDocument,
  IdGenerator,
  type Pickle,
  type Scenario
} from "@cucumber/messages"
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

interface Parsed {
  readonly document: GherkinDocument
  readonly pickles: ReadonlyArray<Pickle>
}

const readFixture = (name: string): string => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8")

/** Pattern 1: ONE id generator per call, shared by `AstBuilder` and by `compile`. */
const parseWith = (name: string, newId: IdGenerator.NewId): Parsed => {
  const parser = new Parser(new AstBuilder(newId), new GherkinClassicTokenMatcher())
  const document = parser.parse(readFixture(name))
  return { document, pickles: compile(document, name, newId) }
}

const parseFixture = (name: string): Parsed => parseWith(name, IdGenerator.uuid())

const failureOf = (name: string): unknown => {
  try {
    parseFixture(name)
  } catch (thrown) {
    return thrown
  }
  throw new Error(`expected ${name} to throw at parse time, but it parsed cleanly`)
}

/** cucumber-js's own idiom: `stopAtFirstError` changes the shape, so normalise before reading. */
const collectedErrors = (thrown: unknown): ReadonlyArray<Error> => {
  const composite = thrown as { readonly errors?: ReadonlyArray<Error> }
  return composite.errors ?? [thrown as Error]
}

const featureOf = (document: GherkinDocument): Feature => {
  const feature = document.feature
  if (feature === undefined) {
    throw new Error("expected the parsed document to carry a feature")
  }
  return feature
}

const scenariosOf = (children: ReadonlyArray<FeatureChild>): Array<Scenario> => {
  const found: Array<Scenario> = []
  for (const child of children) {
    if (child.scenario !== undefined) {
      found.push(child.scenario)
    }
    if (child.rule !== undefined) {
      for (const ruleChild of child.rule.children) {
        if (ruleChild.scenario !== undefined) {
          found.push(ruleChild.scenario)
        }
      }
    }
  }
  return found
}

const nodeIdsOf = (parsed: Parsed): Array<string> => {
  const ids: Array<string> = []
  for (const scenario of scenariosOf(featureOf(parsed.document).children)) {
    ids.push(scenario.id)
    for (const step of scenario.steps) {
      ids.push(step.id)
    }
  }
  for (const pickle of parsed.pickles) {
    ids.push(pickle.id)
    for (const step of pickle.steps) {
      ids.push(step.id)
    }
  }
  return ids
}

/**
 * `firstStepText` is `undefined` where the first pickle has no first step — either because the
 * fixture compiles to zero pickles at all, or because the pickle is one of the zero-step rows.
 * It is asserted unconditionally so no branch ever hides an `expect` from the runner.
 */
interface PickleCase {
  readonly file: string
  readonly row: string
  readonly count: number
  readonly firstStepText: string | undefined
}

interface ThrowCase {
  readonly file: string
  readonly row: string
}

const pickleCases: ReadonlyArray<PickleCase> = [
  { file: "empty-examples-no-header.feature", row: "F1", count: 0, firstStepText: undefined },
  { file: "empty-examples-header-only.feature", row: "F2", count: 0, firstStepText: undefined },
  { file: "outline-without-examples.feature", row: "F3", count: 1, firstStepText: "a <x>" },
  { file: "scenario-keyword-with-examples.feature", row: "F4", count: 2, firstStepText: "a 1" },
  { file: "zero-step-scenario.feature", row: "F5", count: 2, firstStepText: undefined },
  { file: "zero-step-scenario-in-rule.feature", row: "F6", count: 1, firstStepText: undefined },
  { file: "uninterpolated-placeholder-background.feature", row: "F7", count: 1, firstStepText: "a <name>" },
  { file: "uninterpolated-placeholder-in-argument.feature", row: "F8", count: 1, firstStepText: "a background table" },
  { file: "warning-dropped-examples-column.feature", row: "F9", count: 1, firstStepText: "1 and <b>" },
  { file: "warning-duplicate-examples-column.feature", row: "F11", count: 1, firstStepText: "1 twice 1" },
  { file: "no-feature.feature", row: "F12", count: 0, firstStepText: undefined },
  { file: "warning-empty-rule.feature", row: "F13", count: 1, firstStepText: "a step" },
  { file: "warning-swallowed-step.feature", row: "F14", count: 1, firstStepText: "y" },
  { file: "dialect-fr.feature", row: "F19", count: 1, firstStepText: "le contexte est prêt" },
  { file: "correlation-full.feature", row: "F21", count: 1, firstStepText: "a feature background step" },
  { file: "duplicate-scenario-name.feature", row: "F22", count: 2, firstStepText: "the first step" },
  { file: "duplicate-scenario-name-across-rules.feature", row: "F22", count: 2, firstStepText: "the first step" },
  { file: "id-collision-a.feature", row: "F23", count: 1, firstStepText: "a step in the first feature" },
  { file: "id-collision-b.feature", row: "F23", count: 1, firstStepText: "a step in the second feature" },
  { file: "outline-two-examples-blocks.feature", row: "F24", count: 3, firstStepText: "1" },
  { file: "docstring-and-datatable.feature", row: "F25", count: 1, firstStepText: "a step with two arguments" },
  { file: "outline-distinct-row-names.feature", row: "F26", count: 2, firstStepText: "a step for a" },
  { file: "outline-identical-row-names.feature", row: "F27", count: 3, firstStepText: "a step for 1" }
]

const throwCases: ReadonlyArray<ThrowCase> = [
  { file: "parse-failed-inconsistent-cells.feature", row: "F10" },
  { file: "parse-failed-typo-keyword-after-step.feature", row: "F15" },
  { file: "parse-failed-misplaced-tag.feature", row: "F17" },
  { file: "unknown-dialect.feature", row: "F18" },
  { file: "parse-failed-background-after-rule.feature", row: "F20" }
]

describe("upstream @cucumber/gherkin behavior", () => {
  describe("fixture table", () => {
    for (const pickleCase of pickleCases) {
      it(`${pickleCase.row} ${pickleCase.file} compiles to ${pickleCase.count} pickle(s)`, () => {
        const { pickles } = parseFixture(pickleCase.file)
        expect(pickles).toHaveLength(pickleCase.count)
        expect(pickles[0]?.steps[0]?.text).toBe(pickleCase.firstStepText)
      })
    }

    for (const throwCase of throwCases) {
      it(`${throwCase.row} ${throwCase.file} throws a composite at parse time`, () => {
        const thrown = failureOf(throwCase.file)
        expect(thrown instanceof Errors.CompositeParserException).toBe(true)
        expect(collectedErrors(thrown).length).toBeGreaterThan(0)
      })
    }
  })

  describe("silently zero or silently wrong compile() output", () => {
    it("outline-without-examples.feature leaves the placeholder literal in the only pickle it produces", () => {
      const { document, pickles } = parseFixture("outline-without-examples.feature")
      const [scenario] = scenariosOf(featureOf(document).children)
      expect(scenario?.keyword).toBe("Scenario Outline")
      expect(scenario?.examples).toHaveLength(0)
      expect(pickles[0]?.steps[0]?.text).toBe("a <x>")
    })

    it("scenario-keyword-with-examples.feature compiles a plain Scenario as an outline anyway", () => {
      const { document, pickles } = parseFixture("scenario-keyword-with-examples.feature")
      const [scenario] = scenariosOf(featureOf(document).children)
      expect(scenario?.keyword).toBe("Scenario")
      expect(scenario?.examples).toHaveLength(1)
      expect(pickles.map((pickle) => pickle.steps[0]?.text)).toEqual(["a 1", "a 2"])
    })

    it("zero-step-scenario.feature drops the feature Background from the zero-step pickle", () => {
      const { pickles } = parseFixture("zero-step-scenario.feature")
      expect(pickles[0]?.name).toBe("no steps")
      expect(pickles[0]?.steps).toHaveLength(0)
      expect(pickles[1]?.steps.map((step) => step.text)).toEqual(["a feature background step", "a real step"])
    })

    it("zero-step-scenario-in-rule.feature drops the Rule Background as well", () => {
      const { pickles } = parseFixture("zero-step-scenario-in-rule.feature")
      expect(pickles[0]?.name).toBe("no steps")
      expect(pickles[0]?.steps).toHaveLength(0)
    })

    it("uninterpolated-placeholder-background.feature interpolates the Scenario step but not the Background step", () => {
      const { pickles } = parseFixture("uninterpolated-placeholder-background.feature")
      expect(pickles[0]?.steps.map((step) => step.text)).toEqual(["a <name>", "I use alice"])
    })

    it("uninterpolated-placeholder-in-argument.feature leaves Background DataTable cells and DocStrings literal", () => {
      const { pickles } = parseFixture("uninterpolated-placeholder-in-argument.feature")
      const steps = pickles[0]?.steps ?? []
      expect(steps).toHaveLength(3)
      expect(steps[0]?.argument?.dataTable?.rows[0]?.cells[0]?.value).toBe("<x>")
      expect(steps[1]?.argument?.docString?.content).toBe("the value is <x>")
      expect(steps[2]?.argument?.dataTable?.rows[0]?.cells[0]?.value).toBe("1")
    })

    it("no-feature.feature parses to a document whose feature is undefined, not null", () => {
      const { document, pickles } = parseFixture("no-feature.feature")
      expect(document.feature === undefined).toBe(true)
      expect(pickles).toHaveLength(0)
    })

    it("duplicate-scenario-name.feature yields two identically named pickles with distinct astNodeIds", () => {
      const { pickles } = parseFixture("duplicate-scenario-name.feature")
      expect(pickles.map((pickle) => pickle.name)).toEqual(["dup", "dup"])
      expect(pickles[0]?.astNodeIds[0]).not.toBe(pickles[1]?.astNodeIds[0])
    })

    it("duplicate-scenario-name-across-rules.feature keeps one name legal in two separate Rule scopes", () => {
      const { pickles } = parseFixture("duplicate-scenario-name-across-rules.feature")
      expect(pickles.map((pickle) => pickle.name)).toEqual(["happy path", "happy path"])
      expect(pickles[0]?.astNodeIds[0]).not.toBe(pickles[1]?.astNodeIds[0])
    })
  })

  describe("parse-time throws", () => {
    it("parse-failed-misplaced-tag.feature collects several errors and carries no location on the composite", () => {
      const thrown = failureOf("parse-failed-misplaced-tag.feature")
      expect(thrown instanceof Errors.CompositeParserException).toBe(true)
      expect((thrown as { readonly location?: unknown }).location).toBe(undefined)

      const errors = collectedErrors(thrown)
      expect(errors.length).toBeGreaterThan(1)
      expect(errors[0]?.message).toContain("(4:3)")
    })

    it("unknown-dialect.feature wraps exactly one NoSuchLanguageException at line 1 column 1", () => {
      const errors = collectedErrors(failureOf("unknown-dialect.feature"))
      expect(errors).toHaveLength(1)
      expect(errors[0] instanceof Errors.NoSuchLanguageException).toBe(true)
      expect(errors[0]?.message).toContain("(1:1)")
      expect(errors[0]?.message).toContain("Language not supported: xx")
    })

    it("parse-failed-inconsistent-cells.feature reports an inconsistent cell count via AstBuilderException", () => {
      const thrown = failureOf("parse-failed-inconsistent-cells.feature")
      expect((thrown as Error).message).toContain("inconsistent cell count")
      expect(collectedErrors(thrown)[0] instanceof Errors.AstBuilderException).toBe(true)
    })

    it("parse-failed-typo-keyword-after-step.feature throws at the typo's own line", () => {
      const thrown = failureOf("parse-failed-typo-keyword-after-step.feature")
      expect(thrown instanceof Errors.CompositeParserException).toBe(true)
      expect((thrown as Error).message).toContain("(5:5)")
      expect((thrown as Error).message).toContain("Ginve x")
    })

    it("parse-failed-background-after-rule.feature throws a class the Errors namespace does not export", () => {
      const [first] = collectedErrors(failureOf("parse-failed-background-after-rule.feature"))
      expect(first?.constructor.name).toBe("UnexpectedTokenException")
      expect(first instanceof Errors.GherkinException).toBe(true)
      expect(first instanceof Errors.AstBuilderException).toBe(false)
      expect(first instanceof Errors.NoSuchLanguageException).toBe(false)
      expect("UnexpectedTokenException" in Errors).toBe(false)
      expect((first as { readonly location?: { readonly line: number } }).location?.line).toBe(8)
    })

    it("every gherkin error class reports the name Error, so instanceof is the only safe discriminator", () => {
      const thrown = failureOf("unknown-dialect.feature")
      expect((thrown as Error).name).toBe("Error")
      expect(collectedErrors(thrown)[0]?.name).toBe("Error")
      expect(Object.keys(Errors).toSorted()).toEqual([
        "AstBuilderException",
        "CompositeParserException",
        "GherkinException",
        "NoSuchLanguageException",
        "ParserException"
      ])
    })
  })

  describe("silently wrong but only heuristically detectable", () => {
    it("warning-dropped-examples-column.feature drops the last column in silence", () => {
      const { pickles } = parseFixture("warning-dropped-examples-column.feature")
      expect(pickles).toHaveLength(1)
      expect(pickles[0]?.steps[0]?.text).toBe("1 and <b>")
    })

    it("warning-duplicate-examples-column.feature lets the first of two identical columns win", () => {
      const { pickles } = parseFixture("warning-duplicate-examples-column.feature")
      expect(pickles[0]?.steps[0]?.text).toBe("1 twice 1")
    })

    it("warning-empty-rule.feature contributes nothing at all for the empty Rule", () => {
      const { pickles } = parseFixture("warning-empty-rule.feature")
      expect(pickles).toHaveLength(1)
      expect(pickles[0]?.name).toBe("a feature level scenario")
    })

    it("warning-swallowed-step.feature swallows the typo'd step into the scenario description", () => {
      const { document, pickles } = parseFixture("warning-swallowed-step.feature")
      expect(pickles[0]?.steps).toHaveLength(1)
      expect(pickles[0]?.steps[0]?.text).toBe("y")

      const [scenario] = scenariosOf(featureOf(document).children)
      expect(scenario?.steps).toHaveLength(1)
      expect(scenario?.description).toContain("Ginve x")
    })
  })

  describe("correctness", () => {
    it("correlation-full.feature flattens tags feature-rule-scenario-examples and stacks both Backgrounds", () => {
      const { pickles } = parseFixture("correlation-full.feature")
      const pickle = pickles[0]
      expect(pickle?.name).toBe("outline a")
      expect(pickle?.tags.map((tag) => tag.name)).toEqual(["@featuretag", "@ruletag", "@scenariotag", "@exampletag"])
      expect(pickle?.steps.map((step) => step.text)).toEqual([
        "a feature background step",
        "a rule background step",
        "I use a",
        "it works"
      ])
    })

    it("id-collision-a.feature and id-collision-b.feature share no node id under IdGenerator.uuid()", () => {
      const ids = [
        ...nodeIdsOf(parseFixture("id-collision-a.feature")),
        ...nodeIdsOf(parseFixture("id-collision-b.feature"))
      ]
      expect(new Set(ids).size).toBe(ids.length)
    })

    it("the same two files collide under IdGenerator.incrementing(), which is why uuid() is mandatory", () => {
      const first = parseWith("id-collision-a.feature", IdGenerator.incrementing())
      const second = parseWith("id-collision-b.feature", IdGenerator.incrementing())
      const [scenarioA] = scenariosOf(featureOf(first.document).children)
      const [scenarioB] = scenariosOf(featureOf(second.document).children)

      expect(scenarioA?.id).toBe(scenarioB?.id)
      expect(first.pickles[0]?.id).toBe(second.pickles[0]?.id)
    })

    it("outline-two-examples-blocks.feature keeps per-block tags separate and shares one astNodeIds[0]", () => {
      const { pickles } = parseFixture("outline-two-examples-blocks.feature")
      expect(pickles.map((pickle) => pickle.tags.map((tag) => tag.name))).toEqual([
        ["@blockone"],
        ["@blockone"],
        ["@blocktwo"]
      ])
      expect(new Set(pickles.map((pickle) => pickle.astNodeIds[0])).size).toBe(1)
    })

    it("dialect-fr.feature parses French with zero special handling", () => {
      const { document, pickles } = parseFixture("dialect-fr.feature")
      const feature = featureOf(document)
      expect(feature.language).toBe("fr")
      expect(feature.keyword).toBe("Fonctionnalité")

      const [scenario] = scenariosOf(feature.children)
      expect(scenario?.keyword).toBe("Scénario")
      expect(scenario?.steps[0]?.keyword).toBe("Etant donné que ")
      expect(pickles).toHaveLength(1)
    })

    it("outline-distinct-row-names.feature exposes interpolated names beside the un-interpolated AST name", () => {
      const { document, pickles } = parseFixture("outline-distinct-row-names.feature")
      expect(pickles.map((pickle) => pickle.name)).toEqual(["outline a", "outline b"])

      const [scenario] = scenariosOf(featureOf(document).children)
      expect(scenario?.name).toBe("outline <name>")
    })

    it("outline-identical-row-names.feature yields identical names on three distinct lines", () => {
      const { pickles } = parseFixture("outline-identical-row-names.feature")
      expect(pickles.map((pickle) => pickle.name)).toEqual(["same title", "same title", "same title"])
      expect(pickles.map((pickle) => pickle.location.line)).toEqual([8, 9, 10])
    })

    it("docstring-and-datatable.feature carries both arguments on one step, in source order", () => {
      const { pickles } = parseFixture("docstring-and-datatable.feature")
      const step = pickles[0]?.steps[0]
      expect(step?.argument?.docString?.content).toBe("the docstring content")
      expect(step?.argument?.dataTable?.rows).toHaveLength(2)
      expect(step?.argument?.dataTable?.rows[1]?.cells.map((cell) => cell.value)).toEqual(["1", "2"])
    })
  })
})

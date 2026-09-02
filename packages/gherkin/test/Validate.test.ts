/**
 * BEH-EC-014, one test per Group A structural row and per Group C heuristic row of the phase
 * fixture table.
 */
import { IdGenerator } from "@cucumber/messages"
import * as Option from "effect/Option"
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { correlateFeature, type CorrelationResult } from "../src/Correlate.ts"
import { LoadFeatureError, type LoadFeatureWarning } from "../src/Errors.ts"
import { parseDocument } from "../src/Parser.ts"
import { compilePickles } from "../src/Pickles.ts"
import { validateFeature } from "../src/Validate.ts"

const readFixture = (name: string): string => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8")

/**
 * Parse, compile and correlate, with ONE `IdGenerator.uuid()` shared by the parser and the
 * compiler (decision D3). Independent generators are verified to hand a Scenario and a pickle the
 * same id inside one document, which would silently scramble every correlation below.
 *
 * The fixture name doubles as the `uri`, so the "the uri comes from the caller" assertion has
 * something recognisable to check.
 */
const correlate = (source: string, uri: string): CorrelationResult => {
  const newId = IdGenerator.uuid()
  const document = parseDocument(source, uri, newId)
  return correlateFeature(document, compilePickles(document, uri, newId), uri)
}

const validate = (source: string, uri: string): ReadonlyArray<LoadFeatureWarning> =>
  validateFeature(correlate(source, uri))

/**
 * Run the whole pipeline and return the `LoadFeatureError` it threw.
 *
 * A non-`LoadFeatureError` throw is re-thrown rather than absorbed: swallowing it would let a
 * `TypeError` inside `validateFeature` masquerade as a correctly reported validation failure.
 * Returning normally is itself a failure, and says so.
 */
const errorFrom = (source: string, uri: string): LoadFeatureError => {
  try {
    validate(source, uri)
  } catch (thrown) {
    if (thrown instanceof LoadFeatureError) {
      return thrown
    }
    throw thrown
  }
  throw new Error(`expected ${uri} to fail validation, but validateFeature returned normally`)
}

const errorFromFixture = (name: string): LoadFeatureError => errorFrom(readFixture(name), name)

/** Every warning a fixture produced, in the order `validateFeature` returned them. */
const warningsFromFixture = (name: string): ReadonlyArray<LoadFeatureWarning> => validate(readFixture(name), name)

/** Every fixture that must be rejected. Reused by the located-and-attributed assertion. */
const rejectedFixtures = [
  "empty-examples-no-header.feature",
  "empty-examples-header-only.feature",
  "outline-without-examples.feature",
  "scenario-keyword-with-examples.feature",
  "zero-step-scenario.feature",
  "zero-step-scenario-in-rule.feature",
  "duplicate-scenario-name.feature",
  "uninterpolated-placeholder-background.feature",
  "uninterpolated-placeholder-in-argument.feature"
]

describe("validateFeature rejects every Group A structural row with its own reason", () => {
  it("Examples with no header row", () => {
    expect(errorFromFixture("empty-examples-no-header.feature").reason).toBe("EmptyExamples")
  })

  it("Examples with a header but no body rows", () => {
    expect(errorFromFixture("empty-examples-header-only.feature").reason).toBe("EmptyExamples")
  })

  it("an Outline keyword with no Examples block at all", () => {
    expect(errorFromFixture("outline-without-examples.feature").reason).toBe("OutlineWithoutExamples")
  })

  it("a plain Scenario keyword carrying an Examples table", () => {
    expect(errorFromFixture("scenario-keyword-with-examples.feature").reason).toBe("ScenarioKeywordWithExamples")
  })

  it("a zero-step Scenario at feature level", () => {
    expect(errorFromFixture("zero-step-scenario.feature").reason).toBe("ZeroStepScenario")
  })

  it("a zero-step Scenario inside a Rule", () => {
    expect(errorFromFixture("zero-step-scenario-in-rule.feature").reason).toBe("ZeroStepScenario")
  })
})

describe("EmptyExamples fires per BLOCK, not only when every block on an Outline is empty", () => {
  it("rejects an Outline whose second Examples: block is empty even though its first block has rows", () => {
    // Before this check went per-block, `produced.length === 0` (the total pickle count across
    // ALL of an Outline's Examples blocks) was the only signal — so a populated first block kept
    // that total above zero and the second, genuinely empty block was silently dropped: no error,
    // no warning, nothing. This fixture is the executable form of that fix.
    const error = errorFromFixture("empty-examples-among-multiple-blocks.feature")
    expect(error.reason).toBe("EmptyExamples")
  })

  it("locates the error at the EMPTY block's own line, not the Outline's declaration line", () => {
    // fixtures/empty-examples-among-multiple-blocks.feature: the Outline is declared on line 3,
    // its populated first Examples: block starts on line 6, and its empty second block — the one
    // this error must name — starts on line 10.
    const error = errorFromFixture("empty-examples-among-multiple-blocks.feature")
    expect(error.line).toEqual(Option.some(10))
  })

  it("names which block, out of how many, in the message", () => {
    const error = errorFromFixture("empty-examples-among-multiple-blocks.feature")
    expect(error.message).toContain("Examples: block 2 of 2")
  })
})

describe("validateFeature throws the first error in true document order, across error families", () => {
  it("an earlier UninterpolatedPlaceholder outranks a later ZeroStepScenario in the same file", () => {
    // Before the structural checks (Group A) and the placeholder scan (check alpha) were merged
    // into one loop, they ran as two full, separate passes over every Scenario node — so EVERY
    // Group A finding outranked EVERY alpha finding regardless of line number. This fixture pins
    // the fix: fixtures/first-error-document-order.feature has a genuine UninterpolatedPlaceholder
    // at line 4 (the feature Background's `<n>` step, never substituted per
    // @cucumber/gherkin's own Outline-Background limitation) and a ZeroStepScenario at line 13 —
    // strictly later. The correct first-in-document-order answer is the line-4 finding.
    const error = errorFromFixture("first-error-document-order.feature")
    expect(error.reason).toBe("UninterpolatedPlaceholder")
    expect(error.line).toEqual(Option.some(4))
  })
})

describe("every rejection is located and attributed", () => {
  it("carries the caller's uri and a numeric line, on every rejected fixture", () => {
    for (const name of rejectedFixtures) {
      const error = errorFromFixture(name)
      expect(error.uri).toBe(name)
      expect(Option.isSome(error.line) && typeof error.line.value === "number").toBe(true)
    }
  })
})

describe("validateFeature enforces per-scope Scenario name uniqueness (F22)", () => {
  it("rejects two Scenarios sharing an un-interpolated name in one scope", () => {
    expect(errorFromFixture("duplicate-scenario-name.feature").reason).toBe("DuplicateScenarioName")
  })

  it("names both occurrences and locates the error at the second one", () => {
    const error = errorFromFixture("duplicate-scenario-name.feature")
    // The fixture's two `Scenario: dup` lines are 3 and 6. The error is reported AT the second.
    expect(error.line).toEqual(Option.some(6))
    expect(error.message).toMatch(/\b3\b/)
    expect(error.message).toMatch(/\b6\b/)
  })

  it("leaves the same Scenario name in two different Rules legal", () => {
    // The negative control for LOCKED DECISION 2. A whole-Feature-scoped implementation of the
    // duplicate check passes every other test in this file and fails only here.
    const name = "duplicate-scenario-name-across-rules.feature"
    expect(() => validate(readFixture(name), name)).not.toThrow()
  })
})

describe("validateFeature accepts a correct feature", () => {
  it("returns warnings for correlation-full.feature instead of throwing", () => {
    // The positive control. Without it, a validateFeature that rejected everything would pass
    // every other assertion in this file.
    const name = "correlation-full.feature"
    const warnings = validate(readFixture(name), name)
    expect(Array.isArray(warnings)).toBe(true)
  })
})

/**
 * A Scenario whose ONLY step has a typo'd keyword. `[VERIFIED]`: `Ginve x` is silently absorbed
 * into `scenario.description`, the AST keeps zero steps, and the pickle compiles with an empty
 * step list — no error at any layer. Written as an inline source rather than a fixture because
 * `zero-step-scenario.feature`'s zero-step Scenario has an EMPTY description and so cannot
 * exercise this path at all.
 */
const swallowedSoleStep = `Feature: a swallowed sole step

  Scenario: ok
    Ginve x
`

describe("the ZeroStepScenario message mitigates the swallowed-step trap (F14 / Pitfall P7)", () => {
  const uri = "swallowed-sole-step.feature"

  it("reproduces the Scenario description verbatim, leading indentation included", () => {
    const node = correlate(swallowedSoleStep, uri).index.astScenarios[0]
    // Pinned upstream behavior: the swallowed step keeps its source indentation in `description`.
    expect(node?.description).toBe("    Ginve x")
    const error = errorFrom(swallowedSoleStep, uri)
    expect(error.reason).toBe("ZeroStepScenario")
    expect(error.message).toContain("    Ginve x")
  })

  it("neither truncates nor elides that description", () => {
    const error = errorFrom(swallowedSoleStep, uri)
    expect(error.message).not.toContain("…")
    expect(error.message).not.toContain("...")
  })
})

/**
 * A Background DocString under an Outline. Written inline rather than as a fixture because
 * `uninterpolated-placeholder-in-argument.feature` reports its DataTable cell FIRST — the table
 * step comes earlier in the document — so that fixture cannot reach the DocString branch of the
 * scan, however many assertions are pointed at it.
 */
const backgroundDocString = `Feature: a Background DocString placeholder under an outline

  Background:
    Given a background docstring
      """
      the value is <token>, and the rest of this line exists to prove nothing is cut off
      """

  Scenario Outline: outline
    When I use <token>

    Examples:
      | token |
      | abc   |
`

describe("validateFeature rejects a leftover Examples-column placeholder (F7, F8)", () => {
  it("F7 rejects a Background placeholder left un-interpolated under an Outline", () => {
    expect(errorFromFixture("uninterpolated-placeholder-background.feature").reason)
      .toBe("UninterpolatedPlaceholder")
  })

  it("F7 reproduces ADR-EC-014's prescribed Background-limitation wording", () => {
    // The one message assertion that is not incidental: this sentence IS the deliverable of
    // BEH-EC-014. Without it the author meets a downstream "no step matched" failure with nothing
    // pointing at their Background, which is the confusion the whole check exists to remove.
    const error = errorFromFixture("uninterpolated-placeholder-background.feature")
    expect(error.message).toContain(
      "known `@cucumber/gherkin` limitation for Backgrounds nested under a Scenario Outline"
    )
    expect(error.message).toContain("not a bug in your Background text")
  })

  it("F8 rejects a placeholder surviving inside a step argument", () => {
    expect(errorFromFixture("uninterpolated-placeholder-in-argument.feature").reason)
      .toBe("UninterpolatedPlaceholder")
  })

  it("F8 names the DataTable cell it scanned and quotes that cell value in full", () => {
    // `<x>` alone would not prove anything — the message names the placeholder too. Naming the
    // site is what proves the scan reached `argument.dataTable` rather than only `step.text`.
    const error = errorFromFixture("uninterpolated-placeholder-in-argument.feature")
    expect(error.message).toContain("a DataTable cell")
    expect(error.message).toContain("<x>")
    expect(error.message).not.toContain("…")
    expect(error.message).not.toContain("...")
  })

  it("F8 reaches DocString content too, quoting the whole body", () => {
    const uri = "background-docstring.feature"
    const error = errorFrom(backgroundDocString, uri)
    expect(error.reason).toBe("UninterpolatedPlaceholder")
    expect(error.message).toContain("the DocString")
    // The full body, not a prefix of it: a truncating implementation keeps the placeholder and
    // drops the tail, so asserting the tail is what catches one.
    expect(error.message).toContain(
      "the value is <token>, and the rest of this line exists to prove nothing is cut off"
    )
  })
})

describe("validateFeature returns the Group C findings as warnings instead of throwing", () => {
  it("F9 warns when an Examples column is dropped in silence, naming the columns that survived", () => {
    const warnings = warningsFromFixture("warning-dropped-examples-column.feature")
    expect(warnings.map((warning) => warning.reason)).toEqual(["UnknownPlaceholder"])
    // Naming the surviving columns IS the requirement here: "unknown placeholder" on its own
    // sends the author looking at the step rather than at the Examples table.
    expect(warnings[0]?.message).toContain("declares: a")
  })

  it("F9 pins the verified silent-drop signature: the compiled step text stays literal", () => {
    // If this ever stops being `1 and <b>`, upstream cucumber/gherkin#22 was fixed and this
    // fixture no longer tests the silent path — revisit the fixture before the check.
    const name = "warning-dropped-examples-column.feature"
    const scenario = correlate(readFixture(name), name).feature.allScenarios[0]
    expect(scenario?.steps[0]?.text).toBe("1 and <b>")
  })

  it("F11 warns when one Examples header row declares the same column twice", () => {
    const warnings = warningsFromFixture("warning-duplicate-examples-column.feature")
    expect(warnings.map((warning) => warning.reason)).toEqual(["DuplicateExamplesColumn"])
    expect(warnings[0]?.message).toContain("\"a\"")
  })

  it("F13 warns when a Rule contains no scenarios at all", () => {
    const warnings = warningsFromFixture("warning-empty-rule.feature")
    expect(warnings.map((warning) => warning.reason)).toEqual(["EmptyRule"])
    expect(warnings[0]?.message).toContain("empty rule")
  })

  it("F14 warns on a description line that is a near miss of a step keyword, naming the keyword", () => {
    const name = "warning-swallowed-step.feature"
    const warnings = warningsFromFixture(name)
    expect(warnings.map((warning) => warning.reason)).toEqual(["SuspectedSwallowedStep"])
    const node = correlate(readFixture(name), name).index.astScenarios[0]
    expect(node?.description).toContain("Ginve x")
    expect(warnings[0]?.message).toContain("Ginve x")
    expect(warnings[0]?.message).toContain("reads like Given")
  })

  it("F14 stays silent on ordinary prose descriptions, on a Background and a Scenario alike", () => {
    expect(warningsFromFixture("description-plain.feature")).toEqual([])
  })

  it("F14 catches a wrong-case keyword and a transposition, in the document's own dialect", () => {
    const wrongCase = "Feature: f\n  Scenario: s\n    given x\n    Given y\n"
    expect(validate(wrongCase, "case.feature").map((warning) => warning.reason)).toEqual(["SuspectedSwallowedStep"])
    const french = "# language: fr\nFonctionnalité: f\n  Scénario: s\n    Qaund x\n    Soit y\n"
    expect(validate(french, "fr.feature").map((warning) => warning.reason)).toEqual(["SuspectedSwallowedStep"])
    const prose = "Feature: f\n  Scenario: s\n    Thinking about it, this is prose.\n    Given y\n"
    expect(validate(prose, "prose.feature")).toEqual([])
  })
})

/**
 * Decision D4's verified false-positive list, in executable form.
 *
 * `[VERIFIED]`: all three survive `compile()` unchanged and are perfectly valid Gherkin. A bare
 * `<...>` implementation of the leftover-placeholder check rejects all three, so these three
 * names are what a regression to it reports.
 */
const legitimateStepTexts = [
  "the assertion 2 < 3 holds",
  "the html is <div>hello</div>",
  "an email <a@b.com>"
]

const plainScenarioWith = (text: string): string =>
  `Feature: legitimate angle brackets

  Scenario: a plain scenario
    Given ${text}
`

const outlineWith = (text: string): string =>
  `Feature: legitimate angle brackets inside an outline

  Scenario Outline: outline
    Given ${text}
    And a step using <colname>

    Examples:
      | colname |
      | value   |
`

describe("the placeholder scan never fires on legitimate angle brackets (D4 negative controls)", () => {
  for (const text of legitimateStepTexts) {
    it(`D4 leaves a plain Scenario step reading "${text}" completely alone`, () => {
      const uri = "legitimate-plain.feature"
      const source = plainScenarioWith(text)
      expect(() => validate(source, uri)).not.toThrow()
      // A plain Scenario has no Examples columns and is never scanned, so neither check can
      // reach it. This is the exclusion that removes the entire false-positive class.
      expect(validate(source, uri)).toHaveLength(0)
    })
  }

  it("D4 bounds the heuristic cost inside an Outline to a warning, never a throw", () => {
    // Check beta DOES reach `<div>`-shaped text written inside an Outline. That is the accepted
    // cost of catching the dropped-column case, and it is bounded: a warning, never an error.
    const uri = "legitimate-outline.feature"
    for (const text of legitimateStepTexts) {
      const source = outlineWith(text)
      expect(() => validate(source, uri)).not.toThrow()
      for (const warning of validate(source, uri)) {
        expect(warning.reason).toBe("UnknownPlaceholder")
      }
    }
  })
})

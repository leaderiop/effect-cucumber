/**
 * PARSE-03, one test per Group A structural row of the phase fixture table.
 *
 * **These tests assert `err.reason`, never the message text.** That is the one place this file
 * deliberately deviates from the repo's existing test analog
 * (`tools/oxlint/effect/test/no-js-extension-imports.test.ts`, which asserts on `.message`). The
 * roadmap's success criterion is "a distinct, named `LoadFeatureError`", and a reason tag is what
 * makes "distinct" and "named" mechanically checkable. Asserting message prose instead would pin
 * the wording and let a check that fires for the wrong reason pass.
 *
 * The single exception is the duplicate-name row, where "the message names BOTH line numbers" is
 * itself the requirement, and the F14 mitigation row, where "the description is reproduced
 * verbatim" is likewise the requirement. Both are asserted structurally (a line number, a
 * substring the parser produced) rather than by pinning surrounding prose.
 *
 * Two controls guard the suite against the obvious way it could pass for nothing:
 *
 * - a POSITIVE control — a correct feature validates and returns — because a `validateFeature`
 *   that rejected every input would otherwise satisfy every other test here;
 * - a per-scope NEGATIVE control — two Rules each holding a `Scenario: happy path` stays legal —
 *   which is the executable form of the locked per-scope decision. A whole-Feature-scoped
 *   implementation fails exactly there and nowhere else.
 *
 * Imports reach into `../src/*.ts` directly, never through `../src/index.ts`:
 * `effect/no-import-from-barrel-package` runs with `checkRelativeIndexImports: true` and fails
 * `pnpm lint` on a relative value-import whose basename is `index.*`.
 */
import { IdGenerator } from "@cucumber/messages"
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

/** Every fixture that must be rejected. Reused by the located-and-attributed assertion. */
const rejectedFixtures = [
  "empty-examples-no-header.feature",
  "empty-examples-header-only.feature",
  "outline-without-examples.feature",
  "scenario-keyword-with-examples.feature",
  "zero-step-scenario.feature",
  "zero-step-scenario-in-rule.feature",
  "duplicate-scenario-name.feature"
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

describe("every rejection is located and attributed", () => {
  it("carries the caller's uri and a numeric line, on every rejected fixture", () => {
    for (const name of rejectedFixtures) {
      const error = errorFromFixture(name)
      expect(error.uri).toBe(name)
      expect(typeof error.line).toBe("number")
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
    expect(error.line).toBe(6)
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
    // The package's full-content policy (threat T-02-02, ACCEPTED) forbids a length cap here.
    const error = errorFrom(swallowedSoleStep, uri)
    expect(error.message).not.toContain("…")
    expect(error.message).not.toContain("...")
  })
})

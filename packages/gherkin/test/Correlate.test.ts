/**
 * PARSE-02, asserted row by row on the F21 fixture.
 *
 * Deliberately NOT a snapshot. The roadmap's success criterion says "asserted row by row", and
 * a single deep-equal would pass just as happily on a correlation that stacked Background steps
 * itself, sorted the tags, or read the keyword off the pickle — the three things this module is
 * forbidden to do. Every value below is named, so a regression names itself.
 *
 * Imports reach into `../src/Parser.ts`, `../src/Pickles.ts` and `../src/Correlate.ts`
 * directly, never through `../src/index.ts`: `effect/no-import-from-barrel-package` runs with
 * `checkRelativeIndexImports: true` and fails `pnpm lint` on a relative value-import whose
 * basename is `index.*`.
 */
import { IdGenerator } from "@cucumber/messages"
import * as Option from "effect/Option"
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { correlateFeature, type CorrelationResult, isOutlineKeyword, isScenarioKeyword } from "../src/Correlate.ts"
import type { ParsedScenario, ParsedStep, PickleStepArgument } from "../src/Model.ts"
import { parseDocument } from "../src/Parser.ts"
import { compilePickles } from "../src/Pickles.ts"

const readFixture = (name: string): string => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8")

/**
 * Parse, compile and correlate one fixture, with ONE `IdGenerator.uuid()` shared by the parser
 * and the compiler (decision D3). Independent generators are verified to give a Scenario and a
 * pickle the same id inside one document, which would make every assertion below meaningless.
 *
 * The fixture name doubles as the `uri`, so the `uri`-comes-from-the-caller assertion has
 * something recognisable to check.
 */
const correlateFixture = (name: string): CorrelationResult => {
  const newId = IdGenerator.uuid()
  const document = parseDocument(readFixture(name), name, newId)
  return correlateFeature(document, compilePickles(document, name, newId), name)
}

const scenarioAt = (scenarios: ReadonlyArray<ParsedScenario>, at: number): ParsedScenario => {
  const scenario = scenarios[at]
  if (scenario === undefined) {
    throw new Error(`expected a correlated scenario at index ${at}, found ${scenarios.length} in total`)
  }
  return scenario
}

const stepAt = (scenario: ParsedScenario, at: number): ParsedStep => {
  const step = scenario.steps[at]
  if (step === undefined) {
    throw new Error(`expected a step at index ${at} of ${scenario.name}, found ${scenario.steps.length} in total`)
  }
  return step
}

describe("correlateFeature on correlation-full.feature (F21)", () => {
  const onlyScenario = (): ParsedScenario =>
    scenarioAt(correlateFixture("correlation-full.feature").feature.allScenarios, 0)

  it("produces exactly one scenario, the Outline's single Examples row", () => {
    expect(correlateFixture("correlation-full.feature").feature.allScenarios).toHaveLength(1)
  })

  it("stacks four steps: both Backgrounds ahead of the Scenario's own two", () => {
    expect(onlyScenario().steps).toHaveLength(4)
  })

  it("recovers step 0 as the feature Background step, keyword and line included", () => {
    const step = stepAt(onlyScenario(), 0)
    expect(step.origin).toBe("feature-background")
    expect(step.text).toBe("a feature background step")
    expect(step.keyword).toBe("Given")
    expect(step.line).toBe(5)
  })

  it("recovers step 1 as the rule Background step, distinct from the feature one", () => {
    const step = stepAt(onlyScenario(), 1)
    expect(step.origin).toBe("rule-background")
    expect(step.text).toBe("a rule background step")
    expect(step.keyword).toBe("Given")
    expect(step.line).toBe(11)
  })

  it("recovers step 2 as the Scenario's own step, with the placeholder substituted", () => {
    const step = stepAt(onlyScenario(), 2)
    expect(step.origin).toBe("scenario")
    expect(step.text).toBe("I use a")
    expect(step.keyword).toBe("When")
    expect(step.line).toBe(15)
  })

  it("recovers step 3 as the Scenario's closing step", () => {
    const step = stepAt(onlyScenario(), 3)
    expect(step.origin).toBe("scenario")
    expect(step.text).toBe("it works")
    expect(step.keyword).toBe("Then")
    expect(step.line).toBe(16)
  })

  it("trims the trailing space the raw AST keyword carries", () => {
    // The AST value is "Given ", "When " and "Then " — with the space. An untrimmed keyword
    // would still pass a `toContain`, which is why every keyword above uses `toBe`.
    for (const step of onlyScenario().steps) {
      expect(step.keyword.endsWith(" ")).toBe(false)
      expect(step.keyword.trim()).toBe(step.keyword)
    }
  })

  it("flattens tags in feature, rule, scenario, examples-block order", () => {
    // Whole-array `toEqual`, never `toContain`: a reordering must fail, because the order is
    // what proves the list came from `compile()` rather than from a local re-derivation.
    expect(onlyScenario().tags).toEqual(["@featuretag", "@ruletag", "@scenariotag", "@exampletag"])
  })

  it("exposes the un-interpolated astName beside the interpolated name", () => {
    const scenario = onlyScenario()
    expect(scenario.astName).toBe("outline <name>")
    expect(scenario.name).toBe("outline a")
    expect(scenario.astName).not.toBe(scenario.name)
  })

  it("reports the scenario keyword from the AST, trimmed", () => {
    expect(onlyScenario().keyword).toBe("Scenario Outline")
  })

  it("points the scenario's ruleId at the ParsedRule that contains it", () => {
    const { feature } = correlateFixture("correlation-full.feature")
    const rule = feature.rules[0]
    expect(rule).toBeDefined()
    expect(scenarioAt(feature.allScenarios, 0).ruleId).toEqual(Option.fromUndefinedOr(rule?.id))
    expect(rule?.name).toBe("a rule")
  })

  it("takes uri from the caller, because GherkinDocument.uri is undefined for a string parse", () => {
    const { feature } = correlateFixture("correlation-full.feature")
    expect(feature.uri).toBe("correlation-full.feature")
    expect(feature.document.uri).toBeUndefined()
  })

  it("locates the scenario at the Examples body row, not at the Outline header", () => {
    expect(onlyScenario().location.line).toBe(21)
  })

  it("shares one scenario object between allScenarios and the Rule that owns it", () => {
    const { feature } = correlateFixture("correlation-full.feature")
    expect(feature.scenarios).toHaveLength(0)
    expect(feature.rules).toHaveLength(1)
    expect(scenarioAt(feature.allScenarios, 0)).toBe(scenarioAt(feature.rules[0]?.scenarios ?? [], 0))
  })
})

describe("dialect-aware keyword helpers", () => {
  it("recognises the English Scenario Outline keyword", () => {
    expect(isOutlineKeyword("en", "Scenario Outline")).toBe(true)
  })

  it("does not mistake a plain English Scenario for an Outline", () => {
    expect(isOutlineKeyword("en", "Scenario")).toBe(false)
  })

  it("recognises the English Scenario keyword", () => {
    expect(isScenarioKeyword("en", "Scenario")).toBe(true)
  })

  it("recognises the French Outline keyword, proving the check is not an English word list", () => {
    expect(isOutlineKeyword("fr", "Plan du scénario")).toBe(true)
  })

  it("answers false for a language the dialects record does not carry", () => {
    expect(isOutlineKeyword("xx", "Scenario Outline")).toBe(false)
    expect(isScenarioKeyword("xx", "Scenario")).toBe(false)
  })
})

describe("step origin comes from the AST index, not from a node-id count", () => {
  it("separates Background from Scenario in a plain-Scenario pickle where the id counts match", () => {
    // The negative control. In a PLAIN Scenario pickle both the Background step and the
    // Scenario step carry exactly one entry in `astNodeIds` — the length heuristic gives no
    // signal at all here, so an implementation that regressed to it would still pass every
    // other assertion in this file. Only the `byStepId` index can tell these two apart.
    const { feature } = correlateFixture("zero-step-scenario.feature")
    const withSteps = scenarioAt(feature.allScenarios, 1)

    expect(withSteps.name).toBe("has steps")
    expect(withSteps.pickle.steps.map((step) => step.astNodeIds.length)).toEqual([1, 1])
    expect(withSteps.steps.map((step) => step.origin)).toEqual(["feature-background", "scenario"])
    expect(withSteps.steps.map((step) => step.line)).toEqual([4, 9])
  })

  it("keeps a zero-step scenario correlated with no steps at all", () => {
    const { feature } = correlateFixture("zero-step-scenario.feature")
    const noSteps = scenarioAt(feature.allScenarios, 0)

    expect(noSteps.name).toBe("no steps")
    expect(noSteps.steps).toHaveLength(0)
    expect(noSteps.ruleId).toEqual(Option.none())
  })
})

describe("one Outline with two Examples blocks (F24)", () => {
  const scenarios = (): ReadonlyArray<ParsedScenario> =>
    correlateFixture("outline-two-examples-blocks.feature").feature.allScenarios

  it("F24: yields one scenario per row across both blocks, not one per block", () => {
    // Two rows in the first block, one in the second. A correlation that emitted one scenario
    // per `Examples:` node rather than per body row would give 2 here.
    expect(scenarios()).toHaveLength(3)
  })

  it("F24: gives all three rows the same astId, which is why byScenarioId is one-to-many", () => {
    // Every Examples row of one Outline shares `astNodeIds[0]` — the AST Scenario node. This is
    // the structural reason `AstIndex.byScenarioId` maps an id to an ARRAY of pickles; a
    // one-to-one map would silently drop every row but one.
    const astIds = scenarios().map((scenario) => scenario.astId)
    expect(new Set(astIds).size).toBe(1)
    expect(scenarios().every((scenario) => scenario.keyword === "Scenario Outline")).toBe(true)
  })

  it("F24: lands each Examples block's tag only on that block's own rows", () => {
    // Whole-array `toEqual`, so the examples-block tag is pinned as the LAST entry in
    // `compile()`'s flattening order rather than merely present somewhere in the list.
    const [first, second, third] = scenarios()
    expect(first?.tags).toEqual(["@blockone"])
    expect(second?.tags).toEqual(["@blockone"])
    expect(third?.tags).toEqual(["@blocktwo"])
  })

  it("F24: never leaks one block's tag onto the other block's rows", () => {
    // The negative half of the assertion above. A correlation that unioned every Examples tag
    // onto every row would still pass a `toContain("@blockone")` check on all three.
    const [first, second, third] = scenarios()
    expect(first?.tags).not.toContain("@blocktwo")
    expect(second?.tags).not.toContain("@blocktwo")
    expect(third?.tags).not.toContain("@blockone")
  })

  it("F24: locates each row at its own Examples body line, both blocks included", () => {
    expect(scenarios().map((scenario) => scenario.location.line)).toEqual([9, 10, 15])
  })
})

describe("an Outline whose row names all differ (F26)", () => {
  const scenarios = (): ReadonlyArray<ParsedScenario> =>
    correlateFixture("outline-distinct-row-names.feature").feature.allScenarios

  it("F26: yields one scenario per Examples row", () => {
    expect(scenarios()).toHaveLength(2)
  })

  it("F26: interpolates each row's name from its own Examples cell", () => {
    expect(scenarios().map((scenario) => scenario.name)).toEqual(["outline a", "outline b"])
    expect(scenarios()[0]?.name).not.toBe(scenarios()[1]?.name)
  })

  it("F26: exposes the single un-interpolated astName on BOTH rows", () => {
    // Roadmap success criterion 4, and ARCHITECTURE.md Open Question 4: a Scenario is matched to
    // its registered definition by the UN-INTERPOLATED name, because that is the only string the
    // author actually typed in the `.steps.ts` file. Phase 6 consumes this. If correlation ever
    // stopped carrying `astName` — or "helpfully" set it to the interpolated value — every
    // Outline row would fail to find its definition, and nothing else in this suite would say so.
    //
    // Asserted with `toBe` on the exact literal, angle brackets included: a `toContain("outline")`
    // would pass just as happily on the interpolated `"outline a"`.
    for (const scenario of scenarios()) {
      expect(scenario.astName).toBe("outline <name>")
    }
    expect(new Set(scenarios().map((scenario) => scenario.astName)).size).toBe(1)
  })

  it("F26: keeps astName and name distinct on every row", () => {
    for (const scenario of scenarios()) {
      expect(scenario.astName).not.toBe(scenario.name)
    }
  })
})

describe("an Outline whose row names are all identical (F27)", () => {
  const scenarios = (): ReadonlyArray<ParsedScenario> =>
    correlateFixture("outline-identical-row-names.feature").feature.allScenarios

  it("F27: yields one scenario per row even though the title references no column", () => {
    expect(scenarios()).toHaveLength(3)
  })

  it("F27: leaves all three names identical, because interpolation has nothing to substitute", () => {
    const names = scenarios().map((scenario) => scenario.name)
    expect(names).toEqual(["same title", "same title", "same title"])
    expect(new Set(names).size).toBe(1)
  })

  it("F27: gives each row a distinct location.line, the raw material for a unique title", () => {
    // This phase deliberately does NOT invent a test title. Exposing a per-row `location` is
    // this phase's job; deciding how to turn "same title" x3 into three unique, `-t`-filterable
    // vitest titles is Phase 6's (Pitfalls 21/23, Gap 4). Appending a row index or a line number
    // here would put the title format in two places at once, and Phase 6 would inherit a format
    // it never chose.
    const lines = scenarios().map((scenario) => scenario.location.line)
    expect(new Set(lines).size).toBe(3)
  })
})

/**
 * Every node id reachable from one correlated feature: each scenario's pickle id and the AST
 * Scenario id it was compiled from, plus every step id. Deliberately NOT deduplicated — the
 * whole point of F23 is to compare this array's length against the size of a `Set` built from
 * it, and pre-deduplicating here would make the assertion vacuously true.
 */
const allNodeIds = (result: CorrelationResult): ReadonlyArray<string> =>
  result.feature.allScenarios.flatMap((scenario) => [
    scenario.id,
    scenario.astId,
    ...scenario.steps.map((step) => step.id)
  ])

describe("two Features correlated in one process share no node ids (F23)", () => {
  it("F23: collects a duplicate-free union of node ids across two separate features", () => {
    // The regression pin for decision D3, `IdGenerator.uuid()`.
    //
    // The pinned failure is verified, not hypothetical: with `IdGenerator.incrementing()`, two
    // DIFFERENT Features each parsed with its own fresh generator both give their first Scenario
    // the id "1" and their first Pickle the id "3". Nothing throws — the collision only surfaces
    // downstream, as a cross-file map keyed on a node id whose entries silently overwrite each
    // other. A regression to `incrementing()` fails HERE, by name, instead.
    //
    // D3's other consequence, recorded so a future memoization pass does not trip on it: because
    // the ids are UUIDs, two `loadFeature` calls on IDENTICAL source produce DIFFERENT node ids.
    // Node ids must therefore never be persisted, cached as keys, or compared across calls.
    const a = correlateFixture("id-collision-a.feature")
    const b = correlateFixture("id-collision-b.feature")

    const ids = [...allNodeIds(a), ...allNodeIds(b)]
    expect(ids.length).toBeGreaterThan(0)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("F23: keeps the two features' scenario ids disjoint, not merely internally unique", () => {
    // The narrower half. A per-file uniqueness check would pass even if BOTH files numbered
    // their scenarios from "1"; this compares the two sets against each other.
    const idsOfA = new Set(allNodeIds(correlateFixture("id-collision-a.feature")))
    const overlap = allNodeIds(correlateFixture("id-collision-b.feature")).filter((id) => idsOfA.has(id))
    expect(overlap).toEqual([])
  })

  it("F23: gives different ids to two correlations of the SAME source, per D3", () => {
    // Records the cost of `uuid()` as an executable fact rather than a comment. This is the
    // property that makes "never persist or compare node ids across calls" a rule.
    const first = allNodeIds(correlateFixture("id-collision-a.feature"))
    const second = allNodeIds(correlateFixture("id-collision-a.feature"))
    expect(second).toHaveLength(first.length)
    expect(second).not.toEqual(first)
  })
})

describe("a step carrying both a DocString and a DataTable (F25)", () => {
  const onlyStep = (): ParsedStep =>
    stepAt(scenarioAt(correlateFixture("docstring-and-datatable.feature").feature.allScenarios, 0), 0)

  /**
   * `argument` is `Option<PickleStepArgument>` now, not `PickleStepArgument | undefined`
   * (see `Model.ts`). Every test in this block expects the argument to be PRESENT — that is
   * the whole point of the F25 fixture — so `Option.getOrThrow` is correct here: an absent
   * argument means the fixture or the correlation broke, and this should fail loudly rather
   * than silently produce `undefined` property accesses that pass for the wrong reason.
   */
  const argumentOf = (): PickleStepArgument => Option.getOrThrow(onlyStep().argument)

  it("F25: survives correlation with BOTH arguments intact on one step", () => {
    // Real `@cucumber/gherkin@42` capability: a single step may carry a DocString AND a
    // DataTable, with `argumentIndex` recording their source order. Every pre-v42 example uses
    // an `if (docString) ... else if (dataTable)` shape, which silently drops the second one.
    expect(Option.isSome(onlyStep().argument)).toBe(true)
    const argument = argumentOf()
    expect(argument.docString).toBeDefined()
    expect(argument.dataTable).toBeDefined()
  })

  it("F25: preserves the source order of the two arguments via argumentIndex", () => {
    const argument = argumentOf()
    expect(argument.docString?.argumentIndex).toBe(1)
    expect(argument.dataTable?.argumentIndex).toBe(2)
  })

  it("F25: passes the DocString content and DataTable rows through unmodified", () => {
    const argument = argumentOf()
    expect(argument.docString?.content).toBe("the docstring content")
    expect(argument.dataTable?.rows.map((row) => row.cells.map((cell) => cell.value))).toEqual([
      ["a", "b"],
      ["1", "2"]
    ])
  })

  it("F25: leaves the argument a RAW PickleStepArgument, with no wrapper methods on it", () => {
    // The executable guard for the Phase 4 scope boundary. `@effect-cucumber/gherkin`'s
    // `DataTable` wrapper — `.hashes()`, `.raw()`, `.rowsHash()` — and the calling convention
    // for a step carrying both arguments are PARSE-04's deliverable (ADR-EC-008). THIS phase
    // must pass the argument through unwrapped (inside the `Option`, but otherwise raw).
    //
    // Phase 4 owns that decision. A wrapper added here would not conflict at merge time; it
    // would quietly ship a second, competing DataTable API. Asserting the ABSENCE of the
    // methods turns that into a named test failure the moment someone "helpfully" adds one.
    const argument = argumentOf()
    for (const method of ["hashes", "raw", "rowsHash"]) {
      expect(argument).not.toHaveProperty(method)
      expect(argument.dataTable).not.toHaveProperty(method)
    }
  })
})

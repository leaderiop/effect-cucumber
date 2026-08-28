/**
 * The `ParsedFeature` contract: the one shape that crosses the package boundary out of
 * `@effect-cucumber/gherkin` and into `@effect-cucumber/vitest`.
 *
 * Types only. There are no runtime values in this module, and its single local import is
 * `./Errors.ts`, which makes this the second leaf of the package's module DAG.
 *
 * The design rule behind every field: ADR-EC-014 says `loadFeature` CORRELATES the raw
 * `GherkinDocument` with `compile()`'s pickles, it does not re-derive them. Placeholder
 * substitution, tag inheritance and Background stacking are read off the pickle. The AST
 * walk exists only to recover what a pickle structurally cannot carry: step keyword, step
 * origin, step line, Rule membership, and the un-interpolated Scenario name.
 *
 * The `@cucumber/messages` types this contract surfaces are re-exported at the bottom of
 * the file. `document` and `pickles` are deliberately kept as escape hatches, which exposes
 * those types either way; re-exporting them means a consumer is never forced to declare
 * `@cucumber/messages` itself. No subpath export is added to `package.json` for them: a
 * single barrel avoids having to maintain `exports` and `publishConfig.exports` in lockstep.
 */
import type {
  GherkinDocument,
  Location,
  Pickle,
  PickleStep,
  PickleStepArgument,
  StepKeywordType
} from "@cucumber/messages"
import type { LoadFeatureWarning } from "./Errors.ts"

/**
 * Which container a step was written in, recovered by the AST walk.
 *
 * Never infer this from `PickleStep.astNodeIds.length`. That heuristic is verified wrong for
 * plain-Scenario pickles, where a Background step and a Scenario step both have length 1.
 */
export type StepOwner = "feature-background" | "rule-background" | "scenario"

/**
 * One step of one Scenario, after correlation.
 */
export interface ParsedStep {
  /** The `PickleStep.id`. */
  readonly id: string
  /**
   * Step text, already placeholder-substituted by `compile()`. The one documented exception
   * is a Background nested under a Scenario Outline, whose placeholders survive
   * un-interpolated; `Validate.ts` catches that case and fails loudly.
   */
  readonly text: string
  /**
   * The AST keyword, recovered through the `byStepId` index and trimmed. The raw AST value
   * carries a trailing space (`"Given "`, `"And "`, `"* "`).
   */
  readonly keyword: string
  /**
   * The AST `keywordType`, which includes `Conjunction`. `PickleStep.type` has no
   * `Conjunction` member, so this value must come from the AST rather than the pickle.
   */
  readonly keywordType: StepKeywordType
  readonly origin: StepOwner
  /** From the AST step location. `PickleStep` carries no location at all. */
  readonly line: number
  /**
   * A step's DocString or table argument, passed through raw and unwrapped. It is
   * deliberately NOT wrapped in a table-accessor helper: that accessor API is Phase 4's
   * deliverable (PARSE-04), and building it here would only create a merge conflict.
   */
  readonly argument: PickleStepArgument | undefined
}

/**
 * One executable Scenario. For a Scenario Outline this is one Examples body row, not the
 * Outline itself.
 */
export interface ParsedScenario {
  /** The `Pickle.id`. */
  readonly id: string
  /** The AST `Scenario.id`, i.e. `pickle.astNodeIds[0]`. */
  readonly astId: string
  /** The interpolated `Pickle.name`. */
  readonly name: string
  /**
   * The un-interpolated AST `Scenario.name`. Both names are required: a Scenario is matched
   * to its registered definition by the un-interpolated name, and retrofitting this once
   * Phase 6 consumes the contract is expensive.
   */
  readonly astName: string
  /** The AST `Scenario.keyword`, trimmed. Localised, e.g. `Plan du scenario`. */
  readonly keyword: string
  /**
   * `Pickle.tags` names, already flattened by `compile()` in
   * feature then rule then scenario then examples-block order. Do not recompute inheritance.
   */
  readonly tags: ReadonlyArray<string>
  /**
   * Run order: feature-background steps, then rule-background steps, then the Scenario's
   * own. Read off `pickle.steps`; do not re-stack Background steps.
   */
  readonly steps: ReadonlyArray<ParsedStep>
  /**
   * `Pickle.location`, which is per-Examples-row precise for an Outline and the Scenario's
   * own location otherwise. Do not look up `astNodeIds.at(-1)` in a row-id map.
   */
  readonly location: Location
  /** The enclosing AST `Rule.id`, or `undefined` at feature level. */
  readonly ruleId: string | undefined
  /** The raw pickle, kept as an escape hatch. */
  readonly pickle: Pickle
}

/**
 * A `Rule:` block and the Scenarios inside it.
 */
export interface ParsedRule {
  readonly id: string
  readonly name: string
  readonly keyword: string
  /** The Rule's own AST tag names, not the inherited set. */
  readonly tags: ReadonlyArray<string>
  readonly location: Location
  readonly description: string
  readonly scenarios: ReadonlyArray<ParsedScenario>
}

/**
 * Everything `Correlate.ts` can produce on its own, with no validation pass.
 */
export interface ParsedFeatureCore {
  /**
   * Always supplied by the caller. `GherkinDocument.uri` is `undefined` when parsing from a
   * string, so it can never be the source of this value.
   */
  readonly uri: string
  readonly name: string
  readonly keyword: string
  readonly language: string
  readonly description: string
  readonly tags: ReadonlyArray<string>
  readonly location: Location
  /** Feature-level Scenarios only, excluding any Scenario nested inside a Rule. */
  readonly scenarios: ReadonlyArray<ParsedScenario>
  readonly rules: ReadonlyArray<ParsedRule>
  /** Every Scenario, flat, in document order. This is what `Validate.ts` iterates. */
  readonly allScenarios: ReadonlyArray<ParsedScenario>
  /** The raw AST, kept as an escape hatch. */
  readonly document: GherkinDocument
  /** The raw pickles, kept as an escape hatch. */
  readonly pickles: ReadonlyArray<Pickle>
}

/**
 * The public result of `loadFeature`.
 *
 * The split from `ParsedFeatureCore` exists because `Correlate.ts` produces the core and
 * `Validate.ts` produces the warnings; `loadFeature.ts` joins them. Phase 6 already needs a
 * Feature-level warning channel for MATCH-05, so this is one carrier built now rather than
 * two carriers built later.
 */
export interface ParsedFeature extends ParsedFeatureCore {
  readonly warnings: ReadonlyArray<LoadFeatureWarning>
}

export type { GherkinDocument, Location, Pickle, PickleStep, PickleStepArgument, StepKeywordType }

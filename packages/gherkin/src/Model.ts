/**
 * The `ParsedFeature` contract: the one shape that crosses the package boundary out of
 * `@effect-cucumber/gherkin` and into `@effect-cucumber/vitest`.
 *
 * Types only. There are no runtime values in this module. Its local imports are `./Errors.ts` and
 * `./StepArguments.ts`, both type-only — the second joined in Phase 4, when `ParsedStep` gained
 * `stepArguments` and the contract started surfacing a first-party wrapper type rather than only
 * third-party ones. Neither import can cycle back: `StepArguments.ts` reaches `./DataTable.ts` and
 * `./Errors.ts` and nothing else, and nothing under `src/` imports this module for a runtime value,
 * because it has none to give.
 *
 * The design rule behind every field: ADR-EC-014 says `loadFeature` CORRELATES the raw
 * `GherkinDocument` with `compile()`'s pickles, it does not re-derive them. Placeholder
 * substitution, tag inheritance and Background stacking are read off the pickle. The AST
 * walk exists only to recover what a pickle structurally cannot carry: step keyword, step
 * origin, step line, Rule membership, and the un-interpolated Scenario name.
 *
 * The third-party types this contract surfaces are re-exported at the bottom of the file.
 * `document` and `pickles` are deliberately kept as escape hatches, which exposes the
 * `@cucumber/messages` types either way, and `parameterTypes` exposes
 * `@cucumber/cucumber-expressions`' `ParameterTypeRegistry`; re-exporting them means a consumer
 * is never forced to declare either package itself. No subpath export is added to
 * `package.json` for them: a single barrel avoids having to maintain `exports` and
 * `publishConfig.exports` in lockstep.
 *
 * Only THIRD-PARTY types are re-exported there. `StepArgument` — surfaced by `ParsedStep`'s
 * `stepArguments` — is first-party and is deliberately absent from that block: `index.ts` publishes
 * it from `./StepArguments.ts`, the module that declares it, so every type this package owns has
 * exactly ONE export path and a consumer's import can never disagree with another's about where a
 * type lives.
 *
 * Both third-party imports reach the package BARREL, never a deep path into a published build
 * directory — the same rule `ParameterTypes.ts` and `StepMatcher.ts` follow.
 */
import type { ParameterTypeRegistry } from "@cucumber/cucumber-expressions"
import type {
  GherkinDocument,
  Location,
  Pickle,
  PickleStep,
  PickleStepArgument,
  StepKeywordType
} from "@cucumber/messages"
import type * as Option from "effect/Option"
import type { LoadFeatureWarning } from "./Errors.ts"
import type { StepArgument } from "./StepArguments.ts"

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
   * A step's DocString or table argument, passed through RAW and unwrapped, exactly as
   * `compile()` produced it.
   *
   * Kept for the same reason `ParsedFeatureCore.document` and `.pickles` are kept: a consumer
   * who needs something the wrapper does not expose should never have to re-parse anything to
   * get at it. `stepArguments` below is the wrapped, ordered form most consumers actually want.
   *
   * Neither field is derived from the other at READ time. Both are produced once, in the same
   * place — `Correlate.ts`'s `resolveStep` — from the same `PickleStep`, so reading one can
   * never disagree with reading the other, and no consumer is ever tempted to rebuild a
   * `DataTable` from the raw side. `test/Correlate.test.ts` asserts that this field carries no
   * `hashes`/`raw`/`rowsHash` property, which is what keeps the raw field raw.
   */
  readonly argument: Option.Option<PickleStepArgument>
  /**
   * The step's arguments WRAPPED and ordered: a `DocString` for a doc string, a `DataTable` — with
   * `raw()`, `hashes()` and `rowsHash()` on it — for a table, in the source order
   * `@cucumber/gherkin` recorded on `argumentIndex`. Empty for a step that carries no argument.
   *
   * REQUIRED, not optional, for the reason `ParsedFeature.parameterTypes` is required: an optional
   * field lets a later consumer forget the wrapper exists and fall back to re-deriving one from
   * `argument`, which is the exact duplication this field was added to remove.
   *
   * Named `stepArguments` rather than `arguments` on purpose. `arguments` differs from `argument`
   * directly above it by a single character, and a reader skimming a diff — or an autocomplete
   * list — cannot reliably tell the two apart. The `step` prefix is redundant on a `ParsedStep`,
   * and that redundancy is the whole point of it.
   */
  readonly stepArguments: ReadonlyArray<StepArgument>
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
  /** The enclosing AST `Rule.id`, or `Option.none()` at feature level. */
  readonly ruleId: Option.Option<string>
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
 *
 * `parameterTypes` joins at the same seam and for the same reason: `Correlate.ts` knows nothing
 * about parameter types, so the field belongs here and not on the core.
 */
export interface ParsedFeature extends ParsedFeatureCore {
  readonly warnings: ReadonlyArray<LoadFeatureWarning>
  /**
   * A FRESH `ParameterTypeRegistry`, built for THIS call and never shared with another
   * `ParsedFeature`.
   *
   * It already carries the eleven built-in parameter types plus every custom parameter type
   * recorded in the store at the moment the call ran — ADR-EC-007's second correction, which
   * makes custom types permanent data replayed into a per-call registry rather than a live
   * registry anyone holds on to. This is the value a consumer hands to `createStepMatcher`.
   *
   * The consequence a reader will otherwise trip on: because it is per-call, two `ParsedFeature`
   * values from two `loadFeature` calls hold two DIFFERENT registry objects, and a
   * `CucumberExpression` compiled against one must never be reused against the other. That is
   * exactly why the compilation cache in `StepMatcher.ts` is keyed on the registry INSTANCE and
   * not on the pattern string alone.
   */
  readonly parameterTypes: ParameterTypeRegistry
}

export type {
  GherkinDocument,
  Location,
  ParameterTypeRegistry,
  Pickle,
  PickleStep,
  PickleStepArgument,
  StepKeywordType
}

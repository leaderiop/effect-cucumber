/**
 * The `ParsedFeature` contract — the one shape that crosses from `@effect-cucumber/gherkin` into
 * `@effect-cucumber/vitest`. Types only; no runtime value.
 *
 * ADR-EC-014's rule behind every field: `loadFeature` CORRELATES the raw `GherkinDocument` with `compile()`'s
 * pickles and never re-derives them. Substitution, tag inheritance and Background stacking are read off the
 * pickle; the AST walk recovers only what a pickle cannot carry. `document` and `pickles` stay as escape hatches,
 * so the third-party types they expose are re-exported at the bottom; every first-party type (`StepArgument`)
 * has exactly one export path, from the module that declares it.
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

/** Which container a step was written in, from the AST walk — never inferred from `astNodeIds.length`, which
 * carries no signal in a plain-Scenario pickle. */
export type StepOwner = "feature-background" | "rule-background" | "scenario"

/** One step of one Scenario, after correlation. */
export interface ParsedStep {
  /** The `PickleStep.id`. */
  readonly id: string
  /** Step text, placeholder-substituted by `compile()` — except a Background under an Outline, which
   * `Validate.ts` rejects. */
  readonly text: string
  /** The AST keyword, trimmed (the raw value carries a trailing space). */
  readonly keyword: string
  /** The AST `keywordType`, which has `Conjunction`; the pickle's own does not. */
  readonly keywordType: StepKeywordType
  readonly origin: StepOwner
  /** From the AST step location. `PickleStep` carries no location at all. */
  readonly line: number
  /** The raw DocString or table argument, as `compile()` produced it — the escape hatch. Produced together with
   * `stepArguments` in `Correlate.ts`'s `resolveStep`, so the two never disagree (`test/Correlate.test.ts`). */
  readonly argument: Option.Option<PickleStepArgument>
  /**
   * The step's arguments WRAPPED and in source order: a `DocString`, or a `DataTable` with `raw()`/`hashes()`/
   * `rowsHash()`. Required, not optional, so no consumer rebuilds a wrapper from `argument`. Named with the
   * `step` prefix because `arguments` and `argument` differ by one character.
   */
  readonly stepArguments: ReadonlyArray<StepArgument>
}

/** One executable Scenario; for an Outline, one Examples body row. */
export interface ParsedScenario {
  /** The `Pickle.id`. */
  readonly id: string
  /** The AST `Scenario.id`, i.e. `pickle.astNodeIds[0]`. */
  readonly astId: string
  /** The interpolated `Pickle.name`. */
  readonly name: string
  /** The un-interpolated AST `Scenario.name`; a Scenario is matched to its registration by this. */
  readonly astName: string
  /** The AST `Scenario.keyword`, trimmed. Localised, e.g. `Plan du scenario`. */
  readonly keyword: string
  /** `Pickle.tags` names as `compile()` flattened them (feature, rule, scenario, examples). Never recomputed. */
  readonly tags: ReadonlyArray<string>
  /** Run order: feature Background, rule Background, then the Scenario's own — as `pickle.steps` has them. */
  readonly steps: ReadonlyArray<ParsedStep>
  /** `Pickle.location`: per-Examples-row for an Outline, the Scenario's own otherwise. */
  readonly location: Location
  /** The enclosing AST `Rule.id`, or `Option.none()` at feature level. */
  readonly ruleId: Option.Option<string>
  /** The raw pickle, kept as an escape hatch. */
  readonly pickle: Pickle
}

/** A `Rule:` block and the Scenarios inside it. */
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

/** Everything `Correlate.ts` produces on its own, before validation. */
export interface ParsedFeatureCore {
  /** Always the caller's: `GherkinDocument.uri` is `undefined` when parsing from a string. */
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

/** The public result of `loadFeature`: the core plus `Validate.ts`'s warnings and the per-call registry. */
export interface ParsedFeature extends ParsedFeatureCore {
  readonly warnings: ReadonlyArray<LoadFeatureWarning>
  /**
   * A FRESH `ParameterTypeRegistry` for THIS call — built-ins plus every custom type the provided store holds —
   * and the value handed to `createStepMatcher`. Two `ParsedFeature`s hold two different registries, which is why
   * `StepMatcher.ts` keys its cache on the registry instance.
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

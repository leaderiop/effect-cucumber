/**
 * The suite-wide half of ADR-EC-053's strict-mode design: a consumer calls this ONCE, across every
 * `collectFeature()` result in their suite (e.g. a dedicated verification test, or a
 * `vitest.config.ts` `globalSetup`), after every Feature has been collected. Reuses
 * `FeaturePlan.warnings` data `Plan.ts` already computed — no new collection pass — and is
 * independent of `DescribeFeatureOptions.strict` (`describeFeature.ts`): the two are not layered, a
 * consumer may use either, both, or neither.
 */
import * as Data from "effect/Data"
import type { FeatureCollection } from "./Collect.ts"

/**
 * Thrown by `assertNoUnusedStepDefinitions` — a real `Error` subclass (via `Data.TaggedError`),
 * carrying the offending messages and Feature count structurally rather than only in `.message`,
 * consistent with this package's other registration-time argument-validation throws.
 */
export class UnusedStepDefinitionsError extends Data.TaggedError("UnusedStepDefinitionsError")<{
  readonly messages: ReadonlyArray<string>
  readonly featureCount: number
  readonly message: string
}> {}

/**
 * Throw, naming every offending warning's own message verbatim, when any `collections` entry
 * carries an unused-step-definition warning. Does nothing (returns normally) otherwise, including
 * for an empty array (BEH-EC-013, ADR-EC-053).
 */
export const assertNoUnusedStepDefinitions = (
  collections: ReadonlyArray<FeatureCollection>
): void => {
  const messages = collections.flatMap((collection) => collection.plan.warnings.map((warning) => warning.message))
  if (messages.length === 0) {
    return
  }
  throw new UnusedStepDefinitionsError({
    messages,
    featureCount: collections.length,
    message: `${messages.length} unused step definition(s) found across ${collections.length} collected Feature(s):\n\n`
      + messages.join("\n\n")
  })
}

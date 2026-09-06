/**
 * `@cucumber/cucumber`'s `World` for this benchmark suite (ADR-EC-051): counter state plus the
 * kitchen-sink fixture's recorder array and weighed-fruit slot. Cucumber-js has no `Ref`/`Layer`
 * equivalent — a plain mutable instance field, fresh per Scenario the same way cucumber-js
 * constructs a new `World` per Scenario, is the idiomatic cucumber-js shape (INV-EC-006's
 * Ref-only rule is this library's own convention, not one cucumber-js shares or could adopt).
 */
import { setWorldConstructor, World as CucumberWorld } from "@cucumber/cucumber"

export interface CounterState {
  readonly value: number
  readonly min: number
  readonly max: number
}

export interface WeighedFruit {
  readonly name: string
  readonly grams: number
}

export class BenchmarkWorld extends CucumberWorld {
  counter: CounterState | undefined = undefined
  lastError: string | undefined = undefined
  recorder: Array<string> = []
  weighed: WeighedFruit | undefined = undefined
  secondFeatureName: string | undefined = undefined
  secondFeatureScenarioCount: number | undefined = undefined
}

setWorldConstructor(BenchmarkWorld)

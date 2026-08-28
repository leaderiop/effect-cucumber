# @effect-cucumber/gherkin

`.feature` file parsing and step-text matching for
[effect-cucumber](https://github.com/leaderiop/effect-cucumber), wrapping the official
[`@cucumber/gherkin`](https://www.npmjs.com/package/@cucumber/gherkin) and
[`@cucumber/cucumber-expressions`](https://www.npmjs.com/package/@cucumber/cucumber-expressions) packages rather than
reimplementing them. No Effect-specific logic lives here — this is a plain parsing library, and it declares no
dependency on the Effect ecosystem in any field.

Most consumers should install [`@effect-cucumber/vitest`](../vitest) instead, which re-exports `loadFeature` from this
package.

## Status

**Nothing is published to npm yet.** The parse pipeline has shipped: `loadFeature(path, options?)` and
`parseFeature(source, uri, options?)` return a `ParsedFeature`, and the `ParsedFeature` contract — correlated
scenarios, steps, rules, and the `LoadFeatureError` / `LoadFeatureWarning` surface — is real. Custom parameter
types and step matching have shipped too: `defineParameterType` records a type as plain data at module scope,
every parse replays the recorded definitions into a fresh registry handed back on
`ParsedFeature.parameterTypes`, and `createStepMatcher` matches a step text against every registered pattern
with its arguments already coerced. The `DataTable` wrapper — this package's own `.hashes()`-style accessor
over a step's data table — does **not** ship yet; it is a later phase's deliverable. See
[`spec/roadmap.md`](../../spec/roadmap.md) for what is built versus what is only specified.

## Install

```sh
pnpm add @effect-cucumber/gherkin
```

## Requirements

Node `>=20`.

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

**Nothing is published to npm yet, and no library code has shipped.** This package is scaffolding; the pipeline
described in [`spec/`](../../spec) is an intended contract, not a shipped one. See
[`spec/roadmap.md`](../../spec/roadmap.md) for what is built versus what is only specified.

## Install

```sh
pnpm add @effect-cucumber/gherkin
```

## Requirements

Node `>=20`.

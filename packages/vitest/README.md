# @effect-cucumber/vitest

The package most consumers install directly. It provides `describeFeature`, the
Given/When/Then/Background/Scenario/ScenarioOutline/Rule DSL, the hooks, and the `it.effect`-based runner that turns a
Gherkin `.feature` file into ordinary vitest `describe`/`it` calls — no plugin and no custom reporter. It depends on
[`@effect-cucumber/gherkin`](../gherkin) and re-exports `loadFeature` from it.

## Status

**Nothing is published to npm yet.** The registration surface has shipped, the runner has not.

`describeFeature(feature, layer, define)` is real. It takes either a plain `Layer` or
`{ shared, perScenario }` (`perScenario` is a required key — write `perScenario: Layer.empty` for a Feature with no
per-Scenario-fresh state), and hands `define` a dsl whose `Given`/`When`/`Then`/`And`/`But` accept a bare generator
function — auto-wrapped with `Effect.fn(stepText)` so the step text becomes the span name — or an already-wrapped
function, which is passed through by identity rather than wrapped twice. `Background` receives `Given`/`And` only, per
real Gherkin grammar; `Scenario` receives all five.

**The core value is enforced, not aspirational.** A step whose Effect requires a service the ambient Layer does not
provide is a compile error where the step is written, by name — `effect(missingEffectContext)` — as is a Layer argument
whose own requirements are unsatisfied (`effect(missingLayerContext)`), and a read of a `World` field absent from its
declared type (`TS2339`). `pnpm verify:tsgo-gate` asserts all of that on every push against committed
satisfied/starved fixture pairs, checking the exit code _and_ the diagnostic name, so the guarantee cannot decay into a
rejection that no longer proves anything.

**There is no runner yet.** `describeFeature` collects step definitions and emits **zero** vitest tests — no
`it.effect`, no hooks, no tags, no `Rule`, no `ScenarioOutline`. A Feature file written against this package today
type-checks and runs nothing. See [`spec/roadmap.md`](../../spec/roadmap.md) for what is built versus what is only
specified.

## Install

```sh
pnpm add -D @effect-cucumber/vitest effect@rc @effect/vitest@rc vitest
```

> **The `@rc` tags are required.** npm's `latest` tag for `effect` still points at the v3 line (`3.22.x`); `4.0.0` has
> no stable release yet. Installing without `@rc` gets you Effect v3 and a wall of type errors against a v4-only
> library. The same applies to `@effect/vitest`, whose `latest` is also on the v3 line.

## Requirements

Requires Effect v4 (`4.0.0-rc.112` or newer) and vitest `>=4.1.0 <5.0.0`. Node `>=20`.

`effect`, `@effect/vitest` and `vitest` are peer dependencies — you install them, this package does not bundle its own
copies.

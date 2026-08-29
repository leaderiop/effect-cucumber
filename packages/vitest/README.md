# @effect-cucumber/vitest

The package most consumers install directly. It provides `describeFeature`, the Given/When/Then/Background/Scenario
DSL, the six-hook `Before`/`After`/`BeforeStep`/`AfterStep`/`BeforeAllScenarios`/`AfterAllScenarios` surface, and the
`it.effect`-based runner that turns a Gherkin `.feature` file into ordinary vitest `describe`/`it` calls — no plugin
and no custom reporter. The `ScenarioOutline` and `Rule` containers are specified but not yet built; "## Status" below
says which phase each is waiting on. It depends on
[`@effect-cucumber/gherkin`](../gherkin). A wrapped, `ManagedRuntime`-backed `loadFeature`
(ADR-EC-024) is planned but not yet exported — see "## Status" below.

## Status

**Nothing is published to npm yet.** The registration surface and the runner have both shipped.

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

**A Feature file runs.** `describeFeature` emits one `describe` named after the Feature, containing one `it.effect` per
Scenario titled with its interpolated name — nested inside a further `describe` per `Rule` where the Feature has them.
Each Scenario's Background steps run first, as leading `yield*`s inside the same `Effect.gen`, so the first failure
short-circuits every step after it. A step matching no registered pattern, or more than one, fails its own Scenario
with a located `StepMatchError` — the ambiguous case naming every matching pattern with the file and line it was
defined at, in a deterministic order — and a registered pattern that matches no step in the Feature is a non-fatal
warning on three channels: the terminal, the reporter, and the collected plan.

**Hooks run, and the guarantees are real.** All six hooks — `Before`, `After`, `BeforeStep`, `AfterStep`,
`BeforeAllScenarios`, `AfterAllScenarios` — are registered through the same dsl object as `Given`/`When`/`Then`, and
accept a bare generator function auto-wrapped with `Effect.fn` using the hook's own name as its span. A Feature may
register more than one hook of a kind, and they run in registration order; a batch of same-kind hooks is independent
— a failing hook does not stop the rest of its batch, and every failure in the batch reaches the one reported failure,
combined rather than first-wins. A Scenario's own steps run only if every `Before` hook succeeded. `After`, `AfterStep`
and `AfterAllScenarios` each run whether the thing they guard succeeded or failed, and never mask its error.
`BeforeAllScenarios` runs once per Feature, shared across every Scenario, and its failure is reported by every
Scenario individually.

**What is not built yet**, each waiting on its own phase: `Rule`-scoped extra Layers and typed `Scenario Outline`
Examples (Phase 8); tag routing and `@skip`/`@only` (Phase 9); and the build-once `shared` Layer with its per-Scenario
`TestClock` isolation (Phase 10) — the `{ shared, perScenario }` argument form is accepted and type-checked today, but
both halves are currently built per Scenario at runtime. See
[`spec/roadmap.md`](../../spec/roadmap.md) for what is built versus what is only specified.

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

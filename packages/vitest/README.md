# @effect-cucumber/vitest

The package most consumers install directly. It provides `describeFeature`, the Given/When/Then/Background/Scenario
DSL, the six-hook `Before`/`After`/`BeforeStep`/`AfterStep`/`BeforeAllScenarios`/`AfterAllScenarios` surface, and the
`it.effect`-based runner that turns a Gherkin `.feature` file into ordinary vitest `describe`/`it` calls — no plugin
and no custom reporter. `Rule` containers, their own `Background` and hooks, and per-row-titled Scenario Outlines all
ship; "## Status" below says what is still waiting on a later phase. It depends on
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

**A `Rule` can extend the ambient Layer, and so can a single `Scenario`.** `Rule(name, extraLayer, define)` merges
`extraLayer` onto the Feature's Layer with `Layer.provideMerge`, so the Rule's Layer may itself depend on the Feature's
services rather than merely sit beside them — and a step inside that Rule can use the extra service while the identical
step written outside it does not compile, by name (`effect(missingEffectContext)`, asserted by
`pnpm verify:tsgo-gate`). `Scenario(name, extraLayer, define)` does the same thing for one Scenario, onto whatever was
ambient where it was written, so a Scenario inside a Rule reaches all three tiers. Both are always per-Scenario scope,
built fresh for every Scenario — there is no "shared within a Rule" tier, and the two-argument
`Scenario(name, define)` form is unchanged.

A Rule scopes more than its Layer. `Before`, `After`, `BeforeStep` and `AfterStep` declared inside a Rule apply to that
Rule's Scenarios only, and compose with the Feature's own: the Feature's Before-shaped hooks run first and then the
Rule's, while the Rule's After-shaped hooks run first and then the Feature's — outer setup before inner, inner
guarantee before outer, matching the emitted `describe`/`describe` nesting. `BeforeAllScenarios` and `AfterAllScenarios`
stay Feature-only and are a compile error on a Rule's dsl. A Rule also gets its own `Background` (`Given`/`And` only,
like the Feature's), so a `.feature` file with a `Rule:`-level `Background:` has somewhere to register its steps; Rule-
and Feature-level registrations never resolve each other's steps, and the innermost matching scope wins.

**Scenario Outline rows are typed for free and individually filterable.** An Examples value consumed by an `{int}` or
`{float}` pattern reaches the step body already coerced to `number` — the pattern's own cucumber-expression coercion
does it, with no separate typed-example-row mechanism. Each row emits its own test, titled with the row's interpolated
name plus every Examples column and that row's value for it —
`Applying a valid discount code (code=SAVE10, percent=10, expected=31.50)` — appended whether or not the title text
already referenced a placeholder, so `-t` can filter on any column value. Two rows of one Outline share no mutable
state: each is its own test against its own Layer build, and observes only its own row's values.

**Tags reach the runner, and `@skip`/`@only` behave as specified.** Every tag on a Scenario becomes a native runner tag
on the emitted test, inherited `Feature`, `Rule` and `Examples` tags included, each keeping the literal `@` prefix it
carries in the `.feature` file. `@skip` additionally emits the test as skipped, so neither its steps nor any of its
hooks run — which is also why a `@skip` Scenario containing an unmatched step reports skipped rather than undefined.
`@only` is emitted as a plain tag and is NEVER routed to the runner's only-mode, so an `@only` left in a committed
`.feature` file cannot fail a CI run that forbids only-marking. `includeTags`/`excludeTags`, on `describeFeature`'s
optional fourth argument, narrow what is REGISTERED rather than what runs: an excluded Scenario never becomes a test
and is absent from the report entirely rather than listed in it as skipped, and one summary line naming the count, the
Feature and the option that removed them prints whenever the filter removed anything. Both take a plain array of tag
strings — never the runner's boolean tag-expression grammar — and `undefined` and `[]` both mean no filter. The
runner's own `--tagsFilter` still works independently on whatever was registered; the two compose.

**One prerequisite comes with tags, and it is not optional.** A tag must be DECLARED in your `vitest.config.ts`'s
`test.tags`, or the runner rejects the emission — and a `--tagsFilter` pattern is validated against that same list
regardless of the `strictTags` setting. This package catches the rejection, re-emits the test untagged and prints a
warning naming the `.feature` file, the Scenario and the tag, so the Scenario still runs; but its tags do not exist for
the runner, so no `--tagsFilter` can select it. `gherkinTags` is the supported way to keep that list correct:

```ts
import { gherkinTags } from "@effect-cucumber/vitest"
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: { tags: [...gherkinTags("features/**/*.feature"), { name: "@skip" }, { name: "@only" }] }
})
```

It takes a glob pattern (or an array of them), resolved against `process.cwd()`, and has no default — it never scans a
tree you did not name. It is why this package carries one non-workspace runtime dependency, `tinyglobby`: expanding a
glob synchronously at config-load time needs a library, since `fs.globSync` requires Node 22 and this package supports
Node 20.

**What is not built yet:** the build-once `shared` Layer with its per-Scenario
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

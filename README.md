# effect-cucumber

An Effect-native Gherkin/Cucumber runner for [vitest](https://vitest.dev). Gherkin `.feature` files run as ordinary
vitest tests, and every step is an `Effect` rather than a promise.

The point of the project is what the type checker can tell you before anything runs. `describeFeature` takes a `Layer`,
and each step's `Effect` declares the services it requires. If a step needs a service the ambient `Layer` does not
provide, that is a compile error at the step definition — not a "service not found" discovered when the scenario runs.
The mutable `context` bag that other Gherkin-on-vitest libraries thread through steps is replaced by a typed Effect
service, and a scenario's steps are sequential `yield*`s inside one `Effect.gen`, so fail-fast comes from Effect's own
error channel rather than from bookkeeping.

## Status

`@effect-cucumber/gherkin` and `@effect-cucumber/vitest` are published on npm as `0.1.0`; both are pre-1.0, so the
API can still move. `@effect-cucumber/gherkin` parses and validates `.feature` files, matches step text through
cucumber-expressions, and wraps data tables and doc strings. `@effect-cucumber/vitest` emits one `describe` per Feature
and one `it.effect` per Scenario, runs each Scenario's Background steps first inside the same `Effect.gen`, and fails
loudly on a step that matches no registered pattern or more than one. A `Rule` can extend the ambient Layer for the
Scenarios inside it — and scope its own `Background` and hooks the same way — while a `Scenario Outline` emits one
test per Examples row, typed by the step pattern's own coercion and titled with every column's value for that row.
All six hooks run in a fixed order with `After` guaranteed on failure; every Gherkin tag reaches the emitted test as a
native vitest tag, with `@skip` skipping and `@only` never breaking a CI run that forbids only-marking; and a `shared`
Layer is built exactly once per Feature while every Scenario still keeps its own `TestClock`.

**The library runs its own spec.** The worked examples from `spec/behaviors/` execute as real `.feature` +
`.steps.test.ts` pairs under [`packages/vitest/test/acceptance/`](./packages/vitest/test/acceptance), and all 22 v1
requirements (plus one for step modules) carry an acceptance tag that a traceability check counts on every push.

Still ahead, and stated so nobody discovers it the hard way: the doc-examples compile check is not wired, and
editing a `.feature` file under a watching runner does not trigger a rerun when the file was loaded by path.

[`spec/roadmap.md`](./spec/roadmap.md) is the single source of truth for what is built versus what is only specified.

## Install

```sh
pnpm add -D @effect-cucumber/vitest effect@rc @effect/vitest@rc @effect/platform-node@rc vitest
```

> **The `@rc` tags are required.** npm's `latest` tag for `effect` still points at the v3 line (`3.22.x`); `4.0.0` has
> no stable release yet. Installing without `@rc` gets you Effect v3 and a wall of type errors against a v4-only
> library. The same applies to `@effect/vitest` and `@effect/platform-node`, whose `latest` tags are also on the v3 line.

A Feature file is then three lines before the first step definition:

```ts
import { describeFeature, loadFeature } from "@effect-cucumber/vitest"
import { fileURLToPath } from "node:url"

const feature = await loadFeature(fileURLToPath(new URL("./checkout.feature", import.meta.url)))
```

`loadFeature` returns a `Promise<ParsedFeature>` and is awaited once at module top level; `describeFeature(feature, layer, define)`
does the rest. See [`packages/vitest/README.md`](./packages/vitest/README.md) for the full walkthrough.

## Requirements

Requires Effect v4 (`4.0.0-rc.112` or newer, with `@effect/vitest` and `@effect/platform-node` on the same rc line) and
vitest `>=4.1.0 <5.0.0`. Node `>=20`.

## Packages

| Package                                          | Role                                                                                                                                                                                                                             |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`@effect-cucumber/vitest`](./packages/vitest)   | `describeFeature`, the Given/When/Then DSL, `Rule`/`Background`/`Scenario` containers with per-Rule and per-Scenario extra Layers, all six hooks, and the `it.effect`-based runner. The package most consumers install directly. |
| [`@effect-cucumber/gherkin`](./packages/gherkin) | `.feature` parsing and step-text matching, wrapping the official `@cucumber/*` packages. Parsing only.                                                                                                                           |

## Documentation

- [`spec/`](./spec) — the normative specification: [overview](./spec/overview.md), [behaviors](./spec/behaviors),
  [invariants](./spec/invariants.md), [decisions](./spec/decisions), and [roadmap](./spec/roadmap.md).
- [`AGENTS.md`](./AGENTS.md) — engineering conventions for this repository.
- [`CONTRIBUTING.md`](./CONTRIBUTING.md) — where to start for a given kind of change.

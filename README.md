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

Pre-release, and earlier than that phrase usually implies: **nothing is published to npm yet, and no library code has
shipped.** `@effect-cucumber/gherkin` and `@effect-cucumber/vitest` are scaffolding with no implementation behind them.
What exists today is [`spec/`](./spec) — a normative specification of the intended contract — plus the workspace
toolchain that will enforce it.

[`spec/roadmap.md`](./spec/roadmap.md) is the single source of truth for what is built versus what is only specified.
The install instructions below describe the intended shape; they will not work until the first release.

## Install

```sh
pnpm add -D @effect-cucumber/vitest effect@rc @effect/vitest@rc vitest
```

> **The `@rc` tags are required.** npm's `latest` tag for `effect` still points at the v3 line (`3.22.x`); `4.0.0` has
> no stable release yet. Installing without `@rc` gets you Effect v3 and a wall of type errors against a v4-only
> library. The same applies to `@effect/vitest`, whose `latest` is also on the v3 line.

## Requirements

Requires Effect v4 (`4.0.0-rc.112` or newer) and vitest `>=4.1.0 <5.0.0`. Node `>=20`.

## Packages

| Package                                          | Role                                                                                                                              |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| [`@effect-cucumber/vitest`](./packages/vitest)   | `describeFeature`, the Given/When/Then DSL, hooks, and the `it.effect`-based runner. The package most consumers install directly. |
| [`@effect-cucumber/gherkin`](./packages/gherkin) | `.feature` parsing and step-text matching, wrapping the official `@cucumber/*` packages. Parsing only.                            |

## Documentation

- [`spec/`](./spec) — the normative specification: [overview](./spec/overview.md), [behaviors](./spec/behaviors),
  [invariants](./spec/invariants.md), [decisions](./spec/decisions), and [roadmap](./spec/roadmap.md).
- [`AGENTS.md`](./AGENTS.md) — engineering conventions for this repository.
- [`CONTRIBUTING.md`](./CONTRIBUTING.md) — where to start for a given kind of change.

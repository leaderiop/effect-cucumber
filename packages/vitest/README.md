# @effect-cucumber/vitest

The package most consumers install directly. It provides `describeFeature`, the
Given/When/Then/Background/Scenario/ScenarioOutline/Rule DSL, the hooks, and the `it.effect`-based runner that turns a
Gherkin `.feature` file into ordinary vitest `describe`/`it` calls — no plugin and no custom reporter. It depends on
[`@effect-cucumber/gherkin`](../gherkin) and re-exports `loadFeature` from it.

## Status

**Nothing is published to npm yet, and no library code has shipped.** This package is scaffolding; the API described in
[`spec/`](../../spec) is an intended contract, not a shipped one. See
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

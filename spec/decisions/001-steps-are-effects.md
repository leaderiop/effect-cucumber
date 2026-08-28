# ADR-EC-001: A step is `(...params) => Effect<A, E, R>`

> **Status:** Accepted
> **Date:** 2026-08-28

## Context

`@amiceli/vitest-cucumber` — the only existing Gherkin-on-vitest library —
defines a step as `(ctx: TestContext, ...params) => MaybePromise`. That shape
gives a step no structured error channel, no dependency injection, and no way
to require `TestClock`/`TestConsole` or any other Effect service without
manually calling `Effect.runPromise` inside every step body, which throws away
composability with the rest of the Effect ecosystem.

## Decision

A step is `(...params: Params) => Effect<A, E, R>`. No `ctx` parameter.

```ts
Given("I have {int} apples", function*(count: number) {
  const world = yield* World
  yield* Ref.update(world.apples, () => count)
})
```

`ctx` served two purposes in vitest-cucumber: assertions and a mutable
`context` bag. Assertions come from an ordinary `expect` import; the mutable
bag is replaced by a typed Effect service (see
[ADR-EC-002](002-world-is-a-context-service.md)).

## Consequences

**Positive**:

- Steps compose with the rest of the Effect ecosystem — `Effect.retry`,
  `Effect.catchTag`, `Schema.decode`, `Layer`-provided services — with no
  `Effect.runPromise` boundary inside a step body.
- A step's error channel (`E`) is structured, not a thrown exception.
- `TestClock`/`TestConsole` and any other Effect test service are available to
  a step for free once the runner provides them (see
  [ADR-EC-004](004-one-it-effect-per-scenario.md)).

**Negative**:

- Every step author needs enough Effect familiarity to write a generator
  function or use `Effect.fn` — this is not a drop-in replacement for a
  vitest-cucumber suite's step bodies.
- No `ctx.skip()`/`ctx.onTestFinished()`-style escape hatch to vitest's raw
  `TestContext` is designed yet.

**Trade-off accepted**: this library only makes sense for teams already
writing Effect — the DX cost of losing an escape hatch to plain vitest
`TestContext` is acceptable because a non-Effect team has no reason to reach
for this library over `@amiceli/vitest-cucumber` in the first place.

---
"@effect-cucumber/vitest": minor
---

Add `attach(contentType, data)` — a `World.attach()` equivalent, exported alongside the DSL.
Attach evidence from a step or a per-Scenario hook, and see it rendered directly under that
Scenario's real failure panel in vitest's own DEFAULT reporter — no custom `Reporter` needed:

```ts
import { attach, describeFeature } from "@effect-cucumber/vitest"

describeFeature(feature, World.layer, ({ Then }) => {
  Then("the order total is {int}", function*(expected: number) {
    const { total } = yield* World
    yield* attach("text/plain", `computed total: ${total}`)
    yield* Effect.sync(() => assert.strictEqual(total, expected))
  })
})
```

`attach` is reachable from `Given`/`When`/`Then`/`And`/`But`, and from
`Before`/`After`/`BeforeStep`/`AfterStep` (Feature-level or Rule-level, tagged or unconditional) —
every body kind that runs inside the Scenario's own `it.effect`. It is a COMPILE error inside
`BeforeAllScenarios`/`AfterAllScenarios`, never a silent no-op: neither hook runs inside a
Scenario's own `it.effect`, so there is no live `vitest.TestContext` to attach against.

A `@retry`'d Scenario's attachments accumulate across every attempt rather than resetting — the
evidence a failed first attempt left behind is still visible after a passing later one, consistent
with the ambient `TestClock`/`TestConsole` already not resetting between `@retry` attempts.

See [ADR-EC-036](../spec/decisions/036-attachments-a-world-shaped-service-crossing-the-testapi-seam-in-vitesttestapi.md)
and [BEH-EC-028](../spec/behaviors/15-attachments.md).

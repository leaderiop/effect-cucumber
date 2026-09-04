# 15 — Attachments: a `World.attach()` equivalent

What `attach(contentType, data)` does, where it can be called from, and what happens to it when the
Scenario it was called from is tagged `@retry`.

> **See:** [ADR-EC-036](../decisions/036-attachments-a-world-shaped-service-crossing-the-testapi-seam-in-vitesttestapi.md)

See [`spec/roadmap.md`](../roadmap.md) for what is built versus what is only specified — this
document describes the contract, not the build status.

---

## BEH-EC-028: `attach` reaches every per-Scenario body kind, is rendered in the real failure panel, is rejected at compile time from `BeforeAllScenarios`/`AfterAllScenarios`, and accumulates across `@retry` attempts

```
REQUIREMENT: A Given/When/Then/And/But step body, and a Before/After/BeforeStep/AfterStep hook body
             (Feature-level or Rule-level, tagged or unconditional), MUST be able to
             `yield* attach(contentType, data)` — a bare Effect<void> requiring only Attachments,
             exported from "@effect-cucumber/vitest" alongside the DSL. `contentType` and `data` are
             both plain strings; this library performs no serialization of `data` — a caller
             attaching structured data encodes it first (e.g. JSON.stringify).
```

```
REQUIREMENT: Data attached from inside a step or a per-Scenario hook, in a Scenario that later fails,
             MUST be rendered under that Scenario's own failure panel by vitest's DEFAULT reporter —
             the same "no custom Reporter involved" mechanism ADR-EC-033/BEH-EC-025 already
             establishes for a failing step's own pattern and .feature location, applied here to
             `context.annotate(data, contentType)` instead. `contentType` renders as the annotation's
             own heading; `data` renders beneath it. Proven against a REAL `vitest run`'s actual
             printed stdout, not an in-process Exit inspection: scripts/verify-attachments-panel.sh.
```

```
REQUIREMENT: `attach` MUST be a COMPILE-TIME error inside BeforeAllScenarios or AfterAllScenarios —
             never a runtime no-op, and never silently accepted. Both hooks run outside any one
             Scenario's it.effect callback (BeforeAllScenarios before the first attempted Scenario;
             AfterAllScenarios after the last), so there is no live vitest.TestContext for an
             attachment to bind against. The rejection MUST use the SAME mechanism this DSL already
             uses to keep a per-Scenario-only World service out of a once-per-Feature hook
             (ADR-EC-018 F-10: BeforeAllScenarios/AfterAllScenarios are typed HookRegistrar<RShared>,
             never TaggedHookRegistrar<ROut>) — Attachments is simply absent from HookRegistrar's own
             union, not guarded by a separate check. Verified by NAME
             (effect(missingEffectContext), @effect/tsgo's plugin diagnostic — ADR-EC-016), the
             identical verification shape assertion 11b already uses for the per-Scenario-service
             case: scripts/verify-tsgo-gate.sh assertion 14.
```

```
REQUIREMENT: A Scenario tagged @retry (ADR-EC-034) MUST NOT clear or reset attachments made on an
             earlier, failed attempt before a later attempt runs — every attempt's attachments MUST
             remain visible in the final report. This is a deliberate choice (ADR-EC-036 §4), and it
             keeps Attachments consistent with the ambient TestClock/TestConsole, which already do
             not reset between @retry attempts (ADR-EC-034's "fourth finding").
```

**Where `attach` is available, and where it is not — by DSL container:**

| Container                                                          | `attach` reachable?    | Why                                                                                    |
| ------------------------------------------------------------------ | ---------------------- | -------------------------------------------------------------------------------------- |
| `Given`/`When`/`Then`/`And`/`But` (step body)                      | Yes                    | Runs inside the Scenario's own `it.effect`, live `Attachments` provided per test       |
| `Before`/`After`/`BeforeStep`/`AfterStep` (Feature- or Rule-level) | Yes                    | Runs inside the SAME composed Scenario Effect as the steps above (`ScenarioEffect.ts`) |
| A `use`d step module's own step bodies (`defineSteps`)             | Yes                    | Registered through the identical `StepRegistrar<R>` type                               |
| `BeforeAllScenarios`/`AfterAllScenarios`                           | **No — compile error** | No live `TestContext` exists at the point either runs (see above)                      |

**Attaching from `BeforeAllScenarios`/`AfterAllScenarios` — what a step author sees:**

```ts
describeFeature(feature, layer, ({ AfterAllScenarios }) => {
  AfterAllScenarios(function*() {
    // @ts-expect-error Attachments is absent from HookRegistrar<RShared>'s union
    yield* attach("text/plain", "unreachable")
  })
})
```

**A step attaching evidence:**

```typescript
import { attach, describeFeature, loadFeature } from "@effect-cucumber/vitest"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

// checkout.feature:
//   Feature: Checkout total
//     Scenario: The order total is computed
//       Then the order total is 42

const feature = await loadFeature("./checkout.feature")

class World extends Context.Service<World, { readonly total: number }>()("World") {
  static readonly layer = Layer.succeed(this, World.of({ total: 42 }))
}

describeFeature(feature, World.layer, ({ Then }) => {
  Then("the order total is {int}", function*(expected: number) {
    const { total } = yield* World
    yield* attach("text/plain", `computed total: ${total}`)
    yield* Effect.sync(() => {
      if (total !== expected) throw new Error(`expected ${expected}, got ${total}`)
    })
  })
})
```

If the `Then` step above fails, `computed total: <value>` is rendered directly under that Scenario's
failure panel in a real `vitest run` — visible in the terminal output, no custom `Reporter` and no
extra configuration required.

## Not covered by this entry

- What a consumer's OWN reporter or CI integration does with an attachment beyond vitest's own
  default terminal rendering — this library only guarantees the `context.annotate` call happens; how
  a consumer's chosen reporter (if not the default) renders an annotation is outside this library's
  control.
- Any serialization/encoding of `data` beyond a plain string — a caller wanting structured attachments
  encodes them before calling `attach` (see the first REQUIREMENT block above).

---

_Previous: [14 — Scenario-level retries via @retry](./14-scenario-retries.md)_

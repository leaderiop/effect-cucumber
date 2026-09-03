---
"@effect-cucumber/vitest": patch
---

A failing step's own cucumber-expression pattern and its `.feature` file:line now reach the failure
panel a reader sees first, always on, no configuration needed.

Previously, a failing step's entry named only the Scenario and the assertion — the step's own text
reached a _separate_ stdout block, through the tracing span `Effect.fn(pattern)` already gives every
step (ADR-EC-005), which is not the same place a reader looks first.

`ScenarioEffect.ts` now wraps a step's own body call (covering both a typed `Effect.fail` and the
more common thrown-exception defect, e.g. `assert.strictEqual`) so the failure gains a `.cause`
before it can propagate — a real `StepFailureLocation` `Error`, which vitest's own DEFAULT reporter
recurses into and prints as a nested "Caused by:" block, directly under the assertion:

```
FAIL apples.steps.test.ts > Adding apples > Adding apples the wrong way
AssertionError: expected 5 to equal 6
    ...
Caused by: StepFailureLocation: features/apples.feature:6: step "I should have {int} apples"
```

No custom `Reporter`, no `TestContext` crossing, nothing to opt into. `StepFailureLocation` is
internal (not exported) — this is a pure output-quality change, closing
[spec/process/looks-done-but-isnt-checklist.md](../spec/process/looks-done-but-isnt-checklist.md)'s
P-24 item, which had measured the gap this closes.

See [ADR-EC-033](../spec/decisions/033-stepfailurelocation-attached-as-cause-not-a-rewritten-message.md).

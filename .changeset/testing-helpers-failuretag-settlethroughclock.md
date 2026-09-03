---
"@effect-cucumber/vitest": minor
---

Add `Testing.failureTag` and `Testing.settleThroughClock`, exported as a new `Testing` namespace.

`Testing.failureTag(exit)` narrows a failed `Exit`'s typed error to its `_tag`, or fails the current
assertion itself — naming the actual value — on anything that isn't a tagged failure (a success, a
defect, an interruption, or an untagged error). It replaces a hand-rolled `fault instanceof Error &&
"_tag" in fault ? String(fault._tag) : "Unknown"` pattern that silently degrades all of those cases
to the same opaque string.

`Testing.settleThroughClock(effect, { step?, maxSteps? })` forks an Effect, repeatedly advances the
ambient `TestClock` until it settles or `maxSteps` advances have run (defaults: `step: "1 second"`,
`maxSteps: 12`), then joins it — dying with a message naming the bound tried, rather than hanging
indefinitely, if the fork never settles in time. It replaces a duplicated fork/adjust/poll/join
helper.

See [ADR-EC-028](../spec/decisions/028-testing-failuretag-fails-the-assertion.md) and
[ADR-EC-029](../spec/decisions/029-settlethroughclock-parameterized-fork-adjust-join.md).

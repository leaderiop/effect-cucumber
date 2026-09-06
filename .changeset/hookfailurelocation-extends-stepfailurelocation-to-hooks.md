---
"@effect-cucumber/vitest": patch
---

A failing hook (`Before`, `After`, `BeforeStep`, `AfterStep`, `BeforeAllScenarios`, or
`AfterAllScenarios`) now gains a `HookFailureLocation` `.cause` — naming the hook's own kind and the
`.feature`-adjacent file/line its own registration call (`Before(...)`, `After(...)`, etc.) sits on —
before its failure or defect can propagate. This closes the hook carve-out
[ADR-EC-033](../spec/decisions/033-stepfailurelocation-attached-as-cause-not-a-rewritten-message.md)
deliberately left open: a step's own failure already reached vitest's failure panel with its pattern
and `.feature:line` attached; a hook's did not. `HookFailureLocation` is a real `Error` subclass, the
same shape as `StepFailureLocation`, printed for free by vitest's own unmodified default reporter as a
nested "Caused by:" block.

This is a genuine, deliberate behavior change, not merely additive: a hook failure's own value is
mutated in place to carry a new `.cause` (any pre-existing `.cause` is preserved one level deeper), so
a consumer's own test asserting a hook failure's exact byte-identical shape (rather than recovering the
original error by reference identity, e.g. via `Cause.squash`) may need updating. No public API
signature changed. See
[ADR-EC-052](../spec/decisions/052-hookfailurelocation-extends-stepfailurelocation-to-hooks.md).

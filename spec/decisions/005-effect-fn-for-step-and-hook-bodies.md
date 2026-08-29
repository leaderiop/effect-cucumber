# ADR-EC-005: `Effect.fn` wraps step and hook bodies, not manual `Effect.gen` + `withSpan`

> **Status:** Accepted
> **Date:** 2026-08-28

## Context

When a step fails, the failure's stack trace/message should say _which_
Given/When/Then (or hook) failed. The initial design wrapped each step body
with a manual `Effect.withSpan(stepText)` around an `Effect.gen(function* () {...})`.
`Effect.fn(name)(function* (...args) {...})` already provides a named tracing
span _and_ improved stack traces, and its output shape —
`(...params) => Effect<A, E, R>` — is exactly a step definition's shape, making
the manual `withSpan` wrap redundant.

## Decision

`Given`/`When`/`Then` (and every hook — `Before`, `After`, `BeforeStep`,
`AfterStep`, `BeforeAllScenarios`, `AfterAllScenarios`) accept a bare generator
function. The DSL applies `Effect.fn(name)` internally — the step's Gherkin
text for steps, the hook's own name (`"Before"`, `"After"`, ...) for hooks,
since a hook has no per-call step text to use:

```ts
Given("I have {int} apples", function*(n: number) {
  const { apples } = yield* World
  yield* Ref.set(apples, n)
})
```

No `Effect.gen` wrapper is written by the step author. A step needing extra
pipeable behavior (`Effect.retry`, `Effect.catchTag`) that doesn't compose with
the internal auto-wrap can call `Effect.fn(stepText)(fn, Effect.retry(...))`
explicitly and pass the result straight to `Given`/`When`/`Then` — the DSL
accepts either form.

## Consequences

**Positive**:

- Named tracing spans and improved stack traces come for free, with less
  boilerplate than the manual `Effect.gen` + `Effect.withSpan` it replaces.
- Step authors never write `Effect.gen(function* () {})` for a step body —
  `Effect.gen` is reserved for an inline, unnamed, parameterless Effect value,
  which a step is never.
- An escape hatch (explicit `Effect.fn` call) exists for the rare step that
  needs extra combinators.

**Negative**:

- `BeforeStep`/`AfterStep` get one span per hook _definition_
  (`"BeforeStep"`/`"AfterStep"`), not one per step invocation — the current
  step's text isn't automatically on the span; a hook author wanting that must
  call `Effect.annotateCurrentSpan({ step: stepText })` themselves inside the
  hook body.

**Trade-off accepted**: not auto-varying `BeforeStep`/`AfterStep`'s span name
per invocation keeps `Effect.fn`'s contract simple (one name per definition) —
the workaround (manual annotation) is a one-line cost paid only by the small
minority of suites that need per-step-instance tracing detail on a hook.

---

> **Implementation note (2026-08-29, Phase 7):** the hook auto-wrap this decision describes is
> delivered by `packages/vitest/src/Hook.ts`'s `registerHook`, which does not reimplement the
> generator-vs-Effect discriminator — it delegates entirely to `packages/vitest/src/Step.ts`'s
> `register`, passing the hook's own kind (`"Before"`, `"After"`, ...) in the pattern-string
> position `register` normally takes a step's cucumber-expression pattern in. There is therefore
> exactly ONE `isGeneratorFn`-style discriminator in this package, shared by both steps and hooks,
> rather than a second copy maintained in parallel.
>
> The Negative consequence above — hooks receive no arguments, `BeforeStep`/`AfterStep` included —
> is now enforced at the type level too: `packages/vitest/src/Dsl.ts`'s `HookRegistrar<ROut>` call
> signature has no `Params` and no `pattern` parameter at all, unlike `StepRegistrar<ROut>`, so a
> hook body written to accept a step-text argument fails to compile rather than merely receiving
> `undefined` at runtime. See [BEH-EC-017](../behaviors/07-hook-ordering-and-guarantees.md) for the
> full six-hook ordering and guarantee set this auto-wrap participates in.

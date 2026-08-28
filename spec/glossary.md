# Glossary

Terms are one `##` heading each, deliberately flat rather than tabulated, so
that behaviors and invariants can deep-link to a definition.

Where a word is used here with a narrower meaning than its ordinary Cucumber/
Gherkin sense, that narrowing is stated.

## Feature

A `.feature` file, parsed by `loadFeature` into data — never executed by
vitest directly. Compiles to one vitest `describe(feature.name, ...)` block.
See [BEH-EC-001](behaviors/01-steps-and-world.md).

## Scenario

One example of a Feature's behavior: a sequence of Given/When/Then steps.
Compiles to one `it.effect(scenario.name, ...)` call — one vitest test, not
one test per step. See [BEH-EC-002](behaviors/01-steps-and-world.md).

## Background

Steps that run before every Scenario in a Feature (or Rule). Not a separate
vitest hook — inlined as the first `yield*`s of every Scenario's `Effect.gen`.
See [BEH-EC-005](behaviors/02-shared-layers-and-tags.md).

## Rule

A Gherkin grouping of Scenarios under a Feature. Compiles to a nested
`describe(rule.name, ...)`. Can extend the ambient Layer with an extra
per-Scenario Layer visible only to Scenarios inside it.
See [BEH-EC-009](behaviors/03-rules-outlines-and-testclock.md).

## Scenario Outline

A Scenario templated over an `Examples` table. `<placeholder>` tokens are
substituted into the step text by the Gherkin parser *before* step matching,
so `{int}`/`{float}` in a step pattern already coerce the substituted example
value — no separate typed "example row" mechanism is needed for the common
case. See [BEH-EC-010](behaviors/03-rules-outlines-and-testclock.md).

## Step

A `Given`/`When`/`Then`/`And`/`But` line. In this library, a step is
`(...params) => Effect<A, E, R>` — never `(ctx, ...params) => MaybePromise`.
The DSL wraps a bare generator function passed to `Given`/`When`/`Then` with
`Effect.fn(stepText)` internally, for a named tracing span and improved stack
traces. See [BEH-EC-003](behaviors/01-steps-and-world.md).

## World

The typed Effect service that replaces the untyped `context: any` bag other
Gherkin-on-vitest libraries thread through steps. Built by a `Layer` like any
other dependency; steps `yield* World` for compiler-checked access. Any value
one step computes and a later step consumes **must** live in a `Ref` on the
World (or another Layer-provided service) — never a bare closure variable, per
[ADR-EC-009](decisions/009-cross-step-state-lives-in-a-ref.md).
See [BEH-EC-004](behaviors/01-steps-and-world.md).

## Per-Scenario Layer

The default Layer scope: built fresh for every Scenario, mirroring
`@effect/vitest`'s `it.effect`. Right for fakes and in-memory adapters — no
state leaks between Scenarios unless explicitly shared.
See [INV-EC-002](invariants.md#inv-ec-002-a-per-scenario-layer-is-fresh-every-scenario).

## Shared Layer

The opt-in Layer scope: one instance built once and shared across every
Scenario in a Feature, for expensive resources (a testcontainer, a real DB
connection). Implemented by delegating to `@effect/vitest`'s own `layer(...)`
helper rather than hand-rolled `beforeAll`/`afterAll` bookkeeping.
See [ADR-EC-006](decisions/006-two-layer-scopes-only.md).

## Fail-fast

Once a step's Effect fails, no later step in that Scenario runs. This falls
out of Effect's own error channel short-circuiting a sequential `Effect.gen`
— it is not a separately implemented "skip remaining steps" mechanism.
See [INV-EC-001](invariants.md#inv-ec-001-fail-fast-is-structural-not-bookkept).

## cucumber-expression

The `{int}`, `{string}`, `{word}`, custom-type step-matching syntax from
`@cucumber/cucumber-expressions`. Reused verbatim rather than reimplemented —
see [ADR-EC-007](decisions/007-cucumber-expressions-for-step-matching.md).

## `Effect.fn`

The Effect combinator that turns a named generator function into a traced,
stack-trace-improved `(...args) => Effect<A, E, R>`. Used internally by the
DSL to wrap every step and hook body — see
[ADR-EC-005](decisions/005-effect-fn-for-step-and-hook-bodies.md).

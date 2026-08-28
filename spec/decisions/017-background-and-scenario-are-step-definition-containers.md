# ADR-EC-017: `Background` and `Scenario` are step-definition containers, consistently with `Rule`/`ScenarioOutline`

> **Status:** Accepted
> **Date:** 2026-08-28
> **Context:** resolves a real bug found by GSD Architecture research, corroborated by GSD Pitfalls research

## Context

Every worked example prior to this decision showed `Background` as a bare
generator function — `Background(function* () { yield* ... })` — with no
relationship at all to the actual Gherkin step text ("Given the database is
empty", "Given the cart contains: ...") that the `.feature` file's Background
section literally contains. This is inconsistent with this library's entire
step-matching philosophy: every other kind of step (in a `Scenario`, a
`ScenarioOutline`, inside a `Rule`) is matched against its literal Gherkin
text via a registered `Given`/`When`/`Then` pattern. A Background that just
always runs an arbitrary Effect, regardless of what its Gherkin text actually
says, breaks that consistency and means Background step text is effectively
decorative — a real correctness gap, not just a style inconsistency.

Separately, GSD Architecture research found `spec/behaviors/03`'s own worked
example calling `Given` inside a `Scenario` callback that is declared as
`Scenario(name, () => { ... })` — a zero-argument callback — with `Given`
neither destructured from that callback nor available from any enclosing
scope (`Rule`'s callback in that example only destructures
`{ ScenarioOutline, Scenario }`). Cross-referencing every prior worked
example surfaced that `Scenario`'s callback shape was never actually decided
consistently: some examples rely on `Given`/`When`/`Then` being closed over
from the *outer* `describeFeature` scope; `ScenarioOutline` receives them as
an explicit callback parameter; `spec/behaviors/03`'s broken example does
neither.

## Decision

`Background` and `Scenario` both become step-definition containers, with the
same `(dsl) => void` callback shape `Rule` and `ScenarioOutline` already
have — a step registered inside is matched against that step's literal
Gherkin text, exactly like every other step in this library:

```ts
Background(({ Given }) => {
  Given('the database is empty', function* () {
    yield* (yield* Database).clear
  })
})

Scenario('Creating a user', ({ When, Then }) => {
  When('I create a user named {string}', function* (name: string) {
    yield* (yield* Database).create(name)
  })
  Then('the database has {int} user', function* (expected: number) {
    expect(yield* (yield* Database).count).toBe(expected)
  })
})
```

`Background`'s dsl object is restricted to `{ Given, And }` — matching real
Gherkin grammar, which permits only `Given`/`And` inside a `Background`
block. `Scenario`'s dsl object is the full `{ Given, When, Then, And, But }`,
matching `ScenarioOutline`'s.

The closure-capture form (destructuring `Given`/`When`/`Then` from
`describeFeature`'s or `Rule`'s outer dsl and using them directly inside a
`Scenario`/`Background` body, as several earlier worked examples did) remains
valid — nothing about the scope-stack architecture requires the dsl-parameter
form — but it is no longer the *only* form shown, and every worked example in
`spec/behaviors/` is corrected to consistently register Background's actual
step text rather than skip matching entirely.

## Consequences

**Positive**:

- Background step text is no longer decorative — a Background step that
  doesn't match any registered `Given`/`And` pattern fails exactly the way an
  unmatched Scenario step does (see [ADR-EC-019](019-fail-loudly-on-unmatched-or-ambiguous-steps.md)),
  closing a real correctness gap rather than silently running an unrelated
  Effect.
- One consistent callback shape (`(dsl) => void`) across `Background`,
  `Scenario`, `ScenarioOutline`, and `Rule` — no more ambiguity about which
  container form is "the" way to register a step.
- The bug in `spec/behaviors/03`'s worked example (`Given` used out of scope)
  cannot recur, since `Scenario`'s dsl-parameter form is now the documented
  default in every corrected worked example.

**Negative**:

- Every prior worked example using `Background(function* () {...})` needed
  correcting — a larger diff than a typical ADR amendment, since the pattern
  was repeated across multiple behavior files.
- Two valid ways to write a `Scenario`/`Background` body (dsl-parameter vs.
  outer-scope closure) means step authors need to understand both forms exist
  even though only one is shown going forward, if they read an older example
  or another codebase's usage.

**Trade-off accepted**: the larger diff and the two-valid-forms situation are
worth it to close a real correctness gap (Background step text was
unenforced) rather than ship a DSL that's internally inconsistent about how
steps get matched depending on which Gherkin keyword introduced them.

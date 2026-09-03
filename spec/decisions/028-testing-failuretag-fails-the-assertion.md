# ADR-EC-028: `Testing.failureTag` fails the assertion itself, never returns `Option<string>` or `"Unknown"`

> **Status:** Accepted
> **Date:** 2026-09-03
> **Context:** BDD Quality Ceiling Gap #2 (real-usage signal from a downstream consumer); resolves
> [wayfinder ticket #21](https://github.com/leaderiop/effect-cucumber/issues/21), design locked
> in `spec/roadmap.md` § Planned

## Context

A consumer asserting a Scenario's expected TYPED failure by tag has nothing in this package to
reach for, so it gets hand-rolled against an `Exit`. The real, verbatim pattern this decision
replaces — found three times in `sanofi-security-autofixer-cli`'s own acceptance suite
(`features/plugins/ghsa/advisories.feature.test.ts:163`, and the same shape three more times in
`features/plugins/npm/inventory.feature.test.ts`) — is:

```ts
const fault = Cause.squash(exit.cause)
world.faultTag = fault instanceof Error && "_tag" in fault ? String(fault._tag) : "Unknown"
```

This silently degrades three distinct failure shapes — a defect, a non-tagged error, and (in a
variant not shown above) a success the caller expected to be a failure — to the same opaque string,
`"Unknown"`. A Scenario asserting `the operation should fail with tag "SomeError"` against that
string PASSES when the tag genuinely is `"Unknown"` and FAILS with a useless diff when the
underlying value was, say, a defect carrying the real bug. The bug this decision closes is not
"no helper exists" — it is "the hand-rolled substitute actively hides the failure that would explain
why a test is red."

## Decision

`Testing.failureTag` is a **plain, synchronous function**, not an `Effect`:

```ts
export const failureTag: <A, E>(exit: Exit.Exit<A, E>) => string
```

It narrows a failed `Exit`'s typed error to a tag, or fails the assertion itself — via
`@effect/vitest`'s own `assert.fail(message)`, which chai types as returning `never` — serializing
the actual value into the failure message. Three inputs each get their own message, never a shared
`"Unknown"`:

1. **`exit` is a success.** `assert.fail` names the success value.
2. **`exit` is a failure whose `Cause.squash`'d value has no string `_tag` property** — a defect, an
   interruption, or a typed error that simply isn't tagged. `assert.fail` names the squashed value
   (via `node:util`'s `inspect`, which handles an `Error`, a circular object, or anything else
   without throwing a second failure while trying to report the first).
3. **`exit` is a failure whose squashed value IS a `{ readonly _tag: string }`** — the intended case.
   Its `_tag` is returned.

**Not an `Effect`.** The task that produced this ADR asked, explicitly, whether a consumer should
write `const tag = yield* Testing.failureTag(exit)`. Checked against how this package's own
convention already treats `assert.*` — called directly inside an `Effect.gen` step body, never
`yield*`'d (`AGENTS.md` §5, and every existing acceptance step: `assert.isDefined(row, ...)`,
`assert.strictEqual(...)`) — the answer is no. `assert.fail` itself throws synchronously; wrapping a
synchronous throw in an `Effect` would only add a second layer (`Effect.sync`/`Effect.die`) around a
value nothing here needs suspended. `Exit`/`Cause` inspection is pure data, not an effectful read, so
there is no `R` a Layer would need to provide either. The real call site becomes:

```ts
function*() {
  const exit = yield* Effect.exit(someEffect)
  const tag = Testing.failureTag(exit) // plain call, like assert.strictEqual beside it
  assert.strictEqual(tag, "SomeExpectedError")
}
```

**Rejected alternative: `Option<string>`.** Returning `Option.none()` on anything but a tagged
failure would make the caller re-derive the same "fail loudly or silently accept `None`" choice at
every call site — exactly the branching the hand-rolled `sanofi` pattern got wrong by choosing
silence. `Testing.failureTag` exists so a consumer writes ONE line instead of that branch; an
`Option`-returning version would hand the branch back.

**Rejected alternative: keep serializing to a fixed string like `"Unknown"`/`"NonTagged"`.** Same
objection as above, restated: a fixed sentinel is indistinguishable from a real tag that happens to
equal it, and is exactly the silent-degradation bug this ADR exists to close.

## Consequences

**Positive**:

- A consumer's Scenario now fails at the point the tag extraction itself finds something
  unexpected, with the actual value in the message — not three steps later at an assertion
  comparing `"Unknown"` to an expected tag, with no indication why.
- One line replaces a four-line inline ternary duplicated across every consumer file that asserts a
  typed failure by tag.
- Composes with `Testing.settleThroughClock` (ADR-EC-029) unchanged: a `die` from a settle timeout
  is exactly the "no string `_tag`" case, and correctly fails loudly rather than being
  misread as a real tag.

**Negative**:

- A step body that expects `Testing.failureTag` to hand back `Option.none()` for a deliberately
  untagged failure has no way to opt out of the loud failure — the function's whole point removes
  that option. A consumer that genuinely wants non-throwing narrowing already has `Exit.findError`
  (upstream, plain `effect`) to reach for directly.
- The message's value serialization goes through `node:util`'s `inspect`, a Node-only API; this
  package already assumes Node elsewhere (`GherkinTags.ts` reads `node:fs`/`node:path` directly), so
  this is not a new platform assumption, but it is stated here since `failureTag` is the first
  export whose OWN runtime behavior — not just its build tooling — depends on it.

**Trade-off accepted**: a consumer that wants failure-tag extraction without terminating the test on
a miss keeps using `Cause`/`Exit` directly; `Testing.failureTag` is deliberately the assertion-shaped
tool, not a general-purpose narrowing combinator.

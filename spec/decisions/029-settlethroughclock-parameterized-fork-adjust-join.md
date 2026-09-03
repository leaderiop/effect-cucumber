# ADR-EC-029: `Testing.settleThroughClock` parameterizes step/maxSteps and dies rather than hangs past the bound

> **Status:** Accepted
> **Date:** 2026-09-03
> **Context:** real-usage signal from a downstream consumer; resolves
> [wayfinder ticket #39](https://github.com/leaderiop/effect-cucumber/issues/39), part of
> [effect-cucumber gap decisions #11](https://github.com/leaderiop/effect-cucumber/issues/11)

## Context

`packages/vitest/README.md` already documents the fork/adjust/join shape a step needs whenever it
must observe a forked Effect settle against the ambient `TestClock` — most concretely a
retry-with-backoff racing an `Effect.timeout`. Nothing in this package packages that shape, so a
downstream consumer writes it itself. `sanofi-security-autofixer-cli`'s own acceptance suite carries
the identical helper, byte-for-byte, in three files —
`features/plugins/ghsa/advisories.feature.test.ts:75-82`,
`features/audit/audit-fix.feature.test.ts:20-27`,
`features/audit/audit-remediation-monorepo.feature.test.ts:22-29`:

```ts
const settleThroughBackoff = <A, E>(self: Effect.Effect<A, E>) =>
  Effect.gen(function*() {
    const fiber = yield* Effect.forkChild(self, { startImmediately: true })
    yield* Effect.repeat(TestClock.adjust("1 second"), {
      until: () => Option.isSome(Option.fromUndefinedOr(fiber.pollUnsafe())),
      times: 12
    })
    return yield* Fiber.join(fiber)
  })
```

Two things about this call site matter for the shape below. First, `maxSteps` (`times: 12`) is
IDENTICAL across all three files — real evidence for a shared default. Second, the adjust interval
is NOT identical: two files pass `"1 minute"` (GHSA/audit-remediation's HTTP backoff), one passes
`"1 second"` (audit-fix's faster retry) — real evidence that the step duration must stay a caller
parameter, never a hardcoded constant, exactly as the wayfinder ticket anticipated.

## Decision

```ts
export const settleThroughClock: <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  options?: {
    readonly step?: Duration.Input
    readonly maxSteps?: number
  }
) => Effect.Effect<A, E, R>
```

Forks `effect` (`Effect.forkChild(effect, { startImmediately: true })`, matching the real call
sites), then loops: while the fork has not completed and fewer than `maxSteps` advances have run,
`yield* TestClock.adjust(step)`. Once the fork is done, `Fiber.join`s it — returning `A` on success,
propagating `E` on a typed failure, exactly as the wrapped `effect` would have. `A`, `E` and `R` are
carried through unchanged; nothing is added to any of the three type parameters.

**`step` defaults to `"1 second"`, not `"1 minute"`.** Two of the three real call sites use `"1
minute"`, but both are the same domain (GHSA/HTTP backoff timing) rather than three independent
confirmations; the third, faster call site (`"1 second"`, `audit-fix`) is exactly the evidence the
wayfinder ticket asked for — proof the interval genuinely varies by caller. A general-purpose default
should be the SMALLER of the two observed values: a consumer whose forked effect settles inside a
few real steps loses nothing running with a 1-second default, while a `"1 minute"` default would
silently skip past any intermediate scheduled work a finer-grained Effect depends on. A caller whose
backoff is minute-scale, like the two GHSA call sites, passes `step: "1 minute"` explicitly — which
is the whole reason `step` is a parameter and not a constant.

**`maxSteps` defaults to `12`.** Unanimous across all three real call sites; no reason to pick
anything else.

**`fiber.pollUnsafe()`, not a safe alternative — because no safe alternative exists for this.**
`effect@4.0.0-rc.112`'s own `Fiber` module doc says "Prefer the exported functions in this module
over calling `interruptUnsafe` or `pollUnsafe` directly" — but the only Effect-returning fiber
inspection this rc line ships is `Fiber.await`, which BLOCKS until the fiber completes. There is no
module-level, Effect-returning, NON-BLOCKING poll (the v3 `Fiber.poll` this ADR's origin research
expected does not exist in this rc — a correction recorded here rather than assumed). Checking
"is the fork done yet, without waiting for it" — the one operation this loop needs on every
iteration — has exactly one implementation in this rc: the interface's own `pollUnsafe()`. All three
real call sites reach for it for the same reason. Stated as a real, unavoidable cost rather than
hidden, consistent with this repository's own ADR-EC-023 precedent for documenting a spike's cost
plainly.

**Past `maxSteps` without settling: interrupt the fork and `Effect.die`, never hang.** None of the
three real call sites guard this case — `Fiber.join` on a fork that is still waiting on simulated
time beyond the clock's current point simply never resolves, and the test hangs until vitest's own
test timeout kills it with no indication why. `settleThroughClock` instead interrupts the
still-running fork and dies with a message naming `maxSteps`, `step`, and the total simulated time
tried. **This is a defect (`Effect.die`), not a new member of `E`** — the signature above commits to
carrying `A`/`E`/`R` through UNCHANGED, so widening `E` to add a "did not settle" case was never on
the table; a forked effect that needs more simulated time than it was given to settle is a test-setup
bug, the same category `Fiber.join`'s own silent hang already was, just surfaced loudly instead of
hung. Interrupting before dying is explicit rather than relying solely on `forkChild`'s auto-
supervision (the fork IS attached to the parent's scope and would be cleaned up when the parent fiber
terminates regardless), so the fork's own interruption is deterministic and not merely incidental to
how the die happens to propagate.

## Consequences

**Positive**:

- Three duplicated, unguarded helpers collapse to one call, parameterized on the one axis real usage
  proved needs it (`step`) and defaulted on the one axis real usage proved doesn't (`maxSteps`).
- A forked effect that never settles now fails FAST and LOUD, naming exactly how much simulated time
  was tried — instead of hanging until the test framework's own timeout, with a stack trace that
  never mentions `TestClock` at all.
- Composes with `Testing.failureTag` (ADR-EC-028): the "never settled" `die` is correctly rejected by
  `failureTag` as "not a tagged failure", rather than silently misread as a tag.

**Negative**:

- `pollUnsafe()` is, by the framework's own doc comment, a "raw runtime hook" outside the guarantees
  its Effect-returning siblings provide. This package inherits that caveat rather than removing it;
  it is a property of the rc line, not something a wrapper here can paper over.
- The `die`-on-timeout behavior is new relative to the three real call sites, which is a deliberate
  correction, not a faithful port — a consumer copying this ADR's own "what the real code does" table
  literally would still get the old silent-hang behavior; only the shipped function gets the fix.

**Trade-off accepted**: this function makes one behavioral choice the real call sites left
unspecified (what happens past `maxSteps`) rather than mirroring them exactly, because mirroring them
would have meant knowingly shipping the same indefinite-hang footgun `packages/vitest/README.md`
already tells a step author never to build for themselves.
